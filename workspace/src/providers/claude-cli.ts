/**
 * The claude CLI provider: the unmodified `claude` CLI run as `claude -p` on the owner's
 * subscription token (brief 102, Contract, "Argv, frozen"; brief 109, "Argv, against claude-cli.ts").
 *
 * This file holds the argv per turn kind and the process itself. Every turn is a new CLI session
 * under a new random id and nothing is resumed: the context is rebuilt from the database each time
 * (brief 109, Sessions). The argv is an array, spawned without a shell; the prompt is always its
 * last element, after `--`, so a question that begins with a flag is never read as one.
 */

import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import { StringDecoder } from 'node:string_decoder';

import { CLAUDE_BIN, PATHS, RESULT_EXIT_GRACE_MS } from '../config.js';
import { mapTurnEnd, messageOf, type ErrorCode } from '../errors.js';
import { ALLOWED_TOOLS } from '../hooks/gate-rules.js';
import { checkInit, createTurnStream, parseLine, type InitFacts, type TurnSummary } from '../stream-json.js';
import type { Provider, ResultEvent, TurnEvent, TurnInput, TurnKind } from './types.js';

/** Tools removed from the model's view: the six built-in ones. */
export const DISALLOWED_TOOLS = ['Bash', 'Read', 'Write', 'Edit', 'WebFetch', 'WebSearch'] as const;

/** The shape migration 140 checks on `workspace_conversations.claude_session_id`. */
const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const MODEL_ALIAS_SHAPE = /^[a-z][a-z0-9.-]*$/;
const NEW_ID_ATTEMPTS = 5;
const BUDGET_DECIMALS = 2;
/** Freeze amendment F-1: a planning, a summary and a rolling turn run with thinking off. */
export const THINKING_OFF_ENV = Object.freeze({ MAX_THINKING_TOKENS: '0' });

export function isUuidShaped(value: unknown): value is string {
  return typeof value === 'string' && UUID_SHAPE.test(value);
}

/** A new random session id for one turn. */
export function newSessionId(newUuid: () => string = randomUUID): string {
  for (let attempt = 0; attempt < NEW_ID_ATTEMPTS; attempt += 1) {
    const sessionId = newUuid();
    if (isUuidShaped(sessionId)) return sessionId;
  }
  throw new Error('claude-cli: could not draw a new session id');
}

export interface CliArgsInput {
  /** The model alias (`haiku`, `sonnet`, `opus`). */
  readonly model: string;
  readonly sessionId: string;
  readonly kind: TurnKind;
  /** The turn's system prompt, already assembled. */
  readonly systemPrompt: string;
  readonly budgetUsd: number;
  /** The whole prompt argument: the assembled context, the question last. */
  readonly prompt: string;
  /** The MCP config of this turn: a per-request file for an answering turn; the no-server file otherwise. */
  readonly mcpConfig?: string;
  /** The settings path a host recording substitutes; the image's path otherwise. */
  readonly settings?: string;
}

function budgetArg(budgetUsd: number): string {
  if (!Number.isFinite(budgetUsd) || budgetUsd <= 0) throw new Error('claude-cli: the budget must be a positive amount');
  return budgetUsd.toFixed(BUDGET_DECIMALS);
}

function mcpConfigFor(input: CliArgsInput): string {
  if (input.kind !== 'answer') return input.mcpConfig ?? PATHS.mcpNone;
  if (input.mcpConfig === undefined) throw new Error('claude-cli: an answering turn needs its own MCP config file');
  return input.mcpConfig;
}

/**
 * The CLI's arguments. Only an answering turn is allowed tools (the two materials ones) and streams
 * partial messages; a planning, summary or rolling turn has no `--allowedTools` and a config with
 * no server. `--no-session-persistence` is in every argv (F-4); no argv resumes a session.
 */
export function buildArgs(input: CliArgsInput): string[] {
  if (!MODEL_ALIAS_SHAPE.test(input.model)) throw new Error('claude-cli: the model alias is not a plain alias');
  if (!isUuidShaped(input.sessionId)) throw new Error('claude-cli: the session id is not uuid-shaped');
  const answering = input.kind === 'answer';
  return [
    '-p',
    '--model',
    input.model,
    '--session-id',
    input.sessionId,
    '--no-session-persistence',
    '--tools',
    '',
    ...(answering ? ['--allowedTools', ...ALLOWED_TOOLS] : []),
    '--disallowedTools',
    ...DISALLOWED_TOOLS,
    '--permission-mode',
    'dontAsk',
    '--permission-prompts',
    'none',
    '--strict-mcp-config',
    '--mcp-config',
    mcpConfigFor(input),
    '--setting-sources',
    'project',
    '--settings',
    input.settings ?? PATHS.settings,
    '--append-system-prompt',
    input.systemPrompt,
    '--system-prompt-snapshot',
    'off',
    '--output-format',
    'stream-json',
    '--verbose',
    ...(answering ? ['--include-partial-messages'] : []),
    '--include-hook-events',
    '--max-budget-usd',
    budgetArg(input.budgetUsd),
    '--',
    input.prompt,
  ];
}

/** The whole argv, the binary first. */
export function buildArgv(input: CliArgsInput): string[] {
  return [CLAUDE_BIN, ...buildArgs(input)];
}

/** A prompt file's text, read on every turn so an edit reaches the next answer. */
export function readSystemPrompt(file: string = PATHS.systemPrompt): string {
  return fs.readFileSync(file, 'utf8').trimEnd();
}

/** One turn of the CLI, as a stream of events: the real process in the container, a replay in tests. */
export type CliTurn = (input: TurnInput, signal: AbortSignal) => AsyncIterable<TurnEvent>;

export function createClaudeCliProvider(turn: CliTurn): Provider {
  return {
    id: 'claude-cli',
    runTurn: (input, signal) => turn(input, signal),
  };
}

// ---------------------------------------------------------------------------------------------
// The process: one CLI start per turn, read line by line.
// ---------------------------------------------------------------------------------------------

/** SIGTERM first; SIGKILL when the process is still there after this long. Under the 2 s a Stop is given. */
export const KILL_GRACE_MS = 1500;
/** After SIGKILL the output is closed this much later, in case a child of the CLI still holds the pipe open. */
export const OUTPUT_CLOSE_MS = 400;
const MS_PER_SECOND = 1000;
const STDERR_KEEP_CHARS = 2000;
const LOG_VALUE_MAX_CHARS = 80;

export interface CliExit {
  /** The exit code; null when a signal ended the process or it never started. */
  readonly code: number | null;
  readonly signal: string | null;
  /** Why the process could not be started, when it could not. */
  readonly error?: string;
}

export interface SpawnOptions {
  readonly cwd: string;
  readonly env: Record<string, string>;
}

/** The parts of a child process the turn uses, so a test can stand in a recorded stream. */
export interface CliProcess {
  readonly stdout: AsyncIterable<Buffer | string>;
  readonly exited: Promise<CliExit>;
  kill(signal: 'SIGTERM' | 'SIGKILL'): void;
  /** Stop reading stdout, whoever still holds it open. */
  closeOutput(): void;
  /** The end of what the process wrote to stderr, for a log line. */
  stderrText(): string;
}

export interface CliTurnDeps {
  readonly spawn: (argv: readonly string[], options: SpawnOptions) => CliProcess;
  /** The subscription token, read from its file immediately before each start. */
  readonly readOauthToken: () => string;
  /** The runner's own environment, handed to the child with the token and two switches added. */
  readonly baseEnv: Readonly<Record<string, string | undefined>>;
  readonly log: (line: string) => void;
  readonly newUuid?: () => string;
  readonly killGraceMs?: number;
  /** How long the CLI gets to exit after its result line; RESULT_EXIT_GRACE_MS when not given. */
  readonly resultExitGraceMs?: number;
}

/** The child's environment: the runner's, plus the token and the two switches the service sets. */
export function childEnv(baseEnv: Readonly<Record<string, string | undefined>>, token: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [name, value] of Object.entries(baseEnv)) {
    if (value !== undefined) env[name] = value;
  }
  return {
    ...env,
    CLAUDE_CODE_OAUTH_TOKEN: token,
    // With no built-in tools there is no tool to load deferred MCP tools, so they load upfront.
    ENABLE_TOOL_SEARCH: 'false',
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
  };
}

/** The real process: the argv as an array, no shell, stdin closed. */
export function spawnClaude(argv: readonly string[], options: SpawnOptions): CliProcess {
  const [command, ...args] = argv;
  if (command === undefined) throw new Error('claude-cli: an empty argv');
  const child = spawn(command, args, { cwd: options.cwd, env: options.env, stdio: ['ignore', 'pipe', 'pipe'], shell: false, windowsHide: true });
  let stderr = '';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk: string) => {
    stderr = `${stderr}${chunk}`.slice(-STDERR_KEEP_CHARS);
  });
  const exited = new Promise<CliExit>((resolve) => {
    child.once('error', (error) => resolve({ code: null, signal: null, error: error.message }));
    // `exit`, not `close`: the turn reads stdout to its end before it asks, and `close` would wait
    // on a pipe that a child of the CLI may still hold.
    child.once('exit', (code, signal) => resolve({ code, signal }));
  });
  return {
    stdout: child.stdout,
    exited,
    kill: (signal) => {
      child.kill(signal);
    },
    closeOutput: () => {
      child.stdout.destroy();
    },
    stderrText: () => stderr,
  };
}

/** Whole lines out of a byte stream, whatever pieces it arrives in. */
async function* linesOf(stdout: AsyncIterable<Buffer | string>): AsyncGenerator<string> {
  const decoder = new StringDecoder('utf8');
  let pending = '';
  try {
    for await (const chunk of stdout) {
      pending += typeof chunk === 'string' ? chunk : decoder.write(chunk);
      let end = pending.indexOf('\n');
      while (end !== -1) {
        yield pending.slice(0, end);
        pending = pending.slice(end + 1);
        end = pending.indexOf('\n');
      }
    }
  } catch {
    // The output was closed under the reader (a killed process): what was read stands.
  }
  pending += decoder.end();
  if (pending !== '') yield pending;
}

interface Killer {
  kill(): void;
  clear(): void;
}

function createKiller(child: CliProcess, graceMs: number): Killer {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let asked = false;
  return {
    kill() {
      if (asked) return;
      asked = true;
      child.kill('SIGTERM');
      timer = setTimeout(() => {
        child.kill('SIGKILL');
        timer = setTimeout(() => child.closeOutput(), OUTPUT_CLOSE_MS);
      }, graceMs);
    },
    clear() {
      if (timer !== null) clearTimeout(timer);
      timer = null;
    },
  };
}

interface LingerGuard {
  /** The result line was read: start the CLI's time to exit, once. */
  arm(): void;
  clear(): void;
  /** True when the time ran out and the CLI was killed. */
  fired(): boolean;
}

/**
 * The CLI's time to exit after its `result` line (ruling V1, CR-5). A CLI that is still there when
 * it runs out is killed; what the result line said stands, so a finished answer is never left to
 * the turn's time limit.
 */
function createLingerGuard(killer: Killer, graceMs: number, log: (message: string) => void): LingerGuard {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let fired = false;
  return {
    arm() {
      if (timer !== null || fired) return;
      timer = setTimeout(() => {
        timer = null;
        fired = true;
        log(`the CLI did not exit within ${graceMs / MS_PER_SECOND} s of its result line: killing it, the result is kept`);
        killer.kill();
      }, graceMs);
    },
    clear() {
      if (timer !== null) clearTimeout(timer);
      timer = null;
    },
    fired: () => fired,
  };
}

const logValue = (value: string | null): string => (value ?? 'missing').replace(/\s+/g, '_').slice(0, LOG_VALUE_MAX_CHARS);

/** The one log line per init line read: the version, the credential source, the mode and the model. Never a token. */
function initLogLine(init: InitFacts, kind: TurnKind): string {
  return [
    'init',
    `claude_code_version=${logValue(init.claudeCodeVersion)}`,
    `credential_source=${logValue(init.credentialSource)}`,
    `permissionMode=${logValue(init.permissionMode)}`,
    `model=${logValue(init.model)}`,
    `check=${checkInit(init, undefined, kind).length === 0 ? 'pass' : 'refused'}`,
  ].join(' ');
}

/**
 * The classes a CLI exit is logged under (brief 109, Privacy rules). The prompt argument now holds
 * course passages, attachment text and posted scores, and the system prompt holds the About me
 * note, so no stderr text is logged: the exit code, the stderr's length and one class from this
 * short fixed list, matched by pattern. The matched text is never printed.
 */
export const STDERR_CLASSES = ['budget', 'sign_in', 'usage_limit', 'other'] as const;
export type StderrClass = (typeof STDERR_CLASSES)[number];

const STDERR_PATTERNS: ReadonlyArray<readonly [Exclude<StderrClass, 'other'>, RegExp]> = [
  ['budget', /max[\s_-]*budget|budget (?:was )?exceeded|exceeded[^\n]{0,40}budget/i],
  ['sign_in', /not logged in|please (?:run )?\/?login|invalid (?:oauth )?(?:token|credentials)|authentication[_ ]failed|oauth token (?:has )?expired|\b401\b/i],
  ['usage_limit', /usage limit|rate[\s_-]*limit|limit reached|\b429\b/i],
];

export function stderrClass(stderr: string): StderrClass {
  for (const [name, pattern] of STDERR_PATTERNS) {
    if (pattern.test(stderr)) return name;
  }
  return 'other';
}

/** The child's environment for a turn of `kind`: thinking is off on every kind but an answer (F-1). */
export function turnEnv(kind: TurnKind, baseEnv: Readonly<Record<string, string | undefined>>, token: string): Record<string, string> {
  const env = childEnv(baseEnv, token);
  return kind === 'answer' ? env : { ...env, ...THINKING_OFF_ENV };
}

interface Attempt {
  readonly summary: TurnSummary;
  readonly exit: CliExit;
  /** True when the runner's abort ended the attempt. */
  readonly aborted: boolean;
  /**
   * True when the CLI's result line was read before any abort by the runner. A result line read
   * after the abort is not a reported result (ruling Z1, R2-1): the CLI wrote it while it was being
   * killed, and the text that came with it was not taken.
   */
  readonly reported: boolean;
}

function failure(errorCode: ErrorCode): ResultEvent {
  return { type: 'result', ok: false, errorCode, costUsd: null, claudeSessionId: null, model: null };
}

function resultOf(attempt: Attempt): ResultEvent {
  const { summary, reported } = attempt;
  // The runner's abort decides the code when it cut the turn short: only a result line read before it stands.
  const errorCode = attempt.aborted && !reported ? 'cli_error' : mapTurnEnd(summary);
  const sessionId = summary.init?.sessionId ?? null;
  return {
    type: 'result',
    ok: errorCode === null,
    errorCode,
    costUsd: summary.result?.totalCostUsd ?? null,
    // Only a session the CLI actually started.
    claudeSessionId: isUuidShaped(sessionId) ? sessionId : null,
    model: summary.model,
    reported,
  };
}

/**
 * One turn of the real CLI. It always ends with exactly one result event. When the runner aborts
 * before the CLI's result line is read, that result is a failure whose code the runner replaces
 * with its own reason, whatever the CLI goes on to write while it is being killed (ruling Z1,
 * R2-1); a result line read before the abort is reported as it was (`reported`), and the CLI that
 * stays after it is killed once its time to exit is over.
 *
 * A turn of any kind but an answer is not streamed (`--include-partial-messages` is for answers):
 * its text is the assistant message's text, handed on as one delta once the process has ended.
 */
export function createCliTurn(deps: CliTurnDeps): CliTurn {
  const graceMs = deps.killGraceMs ?? KILL_GRACE_MS;
  const resultExitGraceMs = deps.resultExitGraceMs ?? RESULT_EXIT_GRACE_MS;
  const newUuid = deps.newUuid ?? randomUUID;

  return async function* cliTurn(input, signal) {
    const log = (message: string): void => deps.log(`turn request=${input.requestId} ${input.kind} ${message}`);

    async function* attempt(token: string): AsyncGenerator<TurnEvent, Attempt> {
      const argv = buildArgv({
        model: input.model,
        sessionId: newSessionId(newUuid),
        kind: input.kind,
        systemPrompt: input.systemPrompt,
        budgetUsd: input.budgetUsd,
        prompt: input.prompt,
        mcpConfig: input.mcpConfig,
      });
      const child = deps.spawn(argv, { cwd: PATHS.turnCwd, env: turnEnv(input.kind, deps.baseEnv, token) });
      const stream = createTurnStream(undefined, input.kind);
      const killer = createKiller(child, graceMs);
      const linger = createLingerGuard(killer, resultExitGraceMs, log);
      const onAbort = (): void => killer.kill();
      signal.addEventListener('abort', onAbort, { once: true });
      if (signal.aborted) killer.kill();
      /** True once a result line was read after the runner's abort. */
      let lateResult = false;
      try {
        for await (const lineText of linesOf(child.stdout)) {
          const line = parseLine(lineText);
          if (line === null) continue;
          for (const out of stream.push(line)) {
            if (out.kind === 'init') log(initLogLine(out.init, input.kind));
            if (out.kind === 'stop') {
              log(`stopped: ${out.reason}`);
              killer.kill();
            }
            if (out.kind === 'result') {
              linger.arm();
              if (signal.aborted) lateResult = true;
            }
            if (signal.aborted) continue;
            if (out.kind === 'delta') yield { type: 'delta', text: out.text };
            if (out.kind === 'tool') yield { type: 'tool', id: out.id, call: out.call };
          }
        }
        const exit = await child.exited;
        if (exit.error !== undefined) log(`the CLI did not start: ${exit.error}`);
        else if (exit.code !== 0 && !signal.aborted && !linger.fired()) {
          const how = exit.code ?? `on ${exit.signal ?? 'a signal'}`;
          const stderr = child.stderrText();
          log(`the CLI exited ${how}: stderr_chars=${stderr.length} class=${stderrClass(stderr)}`);
        }
        const summary = stream.summary();
        if (input.kind !== 'answer' && !signal.aborted && summary.assistantText !== '') yield { type: 'delta', text: summary.assistantText };
        return { summary, exit, aborted: signal.aborted, reported: summary.result !== null && !lateResult };
      } finally {
        signal.removeEventListener('abort', onAbort);
        linger.clear();
        killer.clear();
      }
    }

    if (signal.aborted) {
      yield failure('cli_error');
      return;
    }
    let token: string;
    try {
      token = deps.readOauthToken();
    } catch (error) {
      log(`no subscription token: ${messageOf(error)}`);
      yield failure('sign_in_expired');
      return;
    }
    let ended: Attempt;
    try {
      ended = yield* attempt(token);
    } catch (error) {
      log(`could not run the CLI: ${messageOf(error)}`);
      yield failure('cli_error');
      return;
    }
    yield resultOf(ended);
  };
}

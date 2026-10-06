/**
 * The claude CLI provider: the unmodified `claude` CLI run as `claude -p` on the owner's
 * subscription token (brief 102, Contract, "Argv, frozen" and "Continuity").
 *
 * This file holds the argv, the choice between a fresh start and a resumed one, and the process
 * itself. The argv is an array, spawned without a shell; the prompt is always its last element,
 * after `--`, so a question that begins with a flag is never read as one.
 */

import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import { StringDecoder } from 'node:string_decoder';

import { CLAUDE_BIN, PATHS, RESULT_EXIT_GRACE_MS } from '../config.js';
import { mapTurnEnd, messageOf, type ErrorCode } from '../errors.js';
import { ALLOWED_TOOLS } from '../hooks/gate-rules.js';
import { asQuestion, buildPrompt } from '../replay.js';
import { checkInit, createTurnStream, parseLine, type InitFacts, type TurnSummary } from '../stream-json.js';
import type { Provider, ResultEvent, TurnEvent, TurnInput } from './types.js';

/** Tools removed from the model's view; the first six are built in, the seventh is the notes store's whole-note reader. */
export const DISALLOWED_TOOLS = ['Bash', 'Read', 'Write', 'Edit', 'WebFetch', 'WebSearch', 'mcp__rag__get_document'] as const;

/** The shape migration 140 checks on `workspace_conversations.claude_session_id`. */
const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const MODEL_ALIAS_SHAPE = /^[a-z][a-z0-9.-]*$/;
const NEW_ID_ATTEMPTS = 5;
const BUDGET_DECIMALS = 2;

export function isUuidShaped(value: unknown): value is string {
  return typeof value === 'string' && UUID_SHAPE.test(value);
}

/** How the CLI is started: a new session under a new random id, or the stored session resumed. */
export interface SessionStart {
  readonly mode: 'fresh' | 'resume';
  readonly sessionId: string;
}

export interface SessionPlanInput {
  readonly storedSessionId: string | null;
  readonly conversationId: string;
}

/**
 * Resume the stored session when its id is uuid-shaped; otherwise start fresh under a new random
 * uuid, which is never the conversation's own id. A stored id of any other shape never reaches argv.
 */
export function planSession(input: SessionPlanInput, newUuid: () => string = randomUUID): SessionStart {
  if (isUuidShaped(input.storedSessionId)) return { mode: 'resume', sessionId: input.storedSessionId };
  for (let attempt = 0; attempt < NEW_ID_ATTEMPTS; attempt += 1) {
    const sessionId = newUuid();
    if (isUuidShaped(sessionId) && sessionId !== input.conversationId) return { mode: 'fresh', sessionId };
  }
  throw new Error('claude-cli: could not draw a new session id');
}

export interface CliArgsInput {
  /** The model alias (`haiku`, `sonnet`, `opus`). */
  readonly model: string;
  readonly session: SessionStart;
  /** The text of `prompts/system.md`. */
  readonly systemPrompt: string;
  readonly budgetUsd: number;
  /** The question, with the replayed history in front of it on a fresh start that has any. */
  readonly prompt: string;
  /** The two paths a host recording substitutes; the image's paths otherwise. */
  readonly paths?: { readonly mcpConfig: string; readonly settings: string };
}

function sessionArgs(session: SessionStart): string[] {
  if (!isUuidShaped(session.sessionId)) throw new Error('claude-cli: the session id is not uuid-shaped');
  return session.mode === 'resume' ? ['--resume', session.sessionId] : ['--session-id', session.sessionId];
}

function budgetArg(budgetUsd: number): string {
  if (!Number.isFinite(budgetUsd) || budgetUsd <= 0) throw new Error('claude-cli: the budget must be a positive amount');
  return budgetUsd.toFixed(BUDGET_DECIMALS);
}

/** The CLI's arguments, in the Contract's order. */
export function buildArgs(input: CliArgsInput): string[] {
  if (!MODEL_ALIAS_SHAPE.test(input.model)) throw new Error('claude-cli: the model alias is not a plain alias');
  const paths = input.paths ?? PATHS;
  return [
    '-p',
    '--model',
    input.model,
    ...sessionArgs(input.session),
    '--tools',
    '',
    '--allowedTools',
    ...ALLOWED_TOOLS,
    '--disallowedTools',
    ...DISALLOWED_TOOLS,
    '--permission-mode',
    'dontAsk',
    '--permission-prompts',
    'none',
    '--strict-mcp-config',
    '--mcp-config',
    paths.mcpConfig,
    '--setting-sources',
    'project',
    '--settings',
    paths.settings,
    '--append-system-prompt',
    input.systemPrompt,
    '--system-prompt-snapshot',
    'off',
    '--output-format',
    'stream-json',
    '--verbose',
    '--include-partial-messages',
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

/** The system prompt file's text, read on every turn so an edit reaches the next answer. */
export function readSystemPrompt(file: string = PATHS.systemPrompt): string {
  return fs.readFileSync(file, 'utf8').trimEnd();
}

export interface StartOutcome {
  readonly mode: SessionStart['mode'];
  /** The process's exit code; null when a signal ended it. */
  readonly exitCode: number | null;
  /** Whether any `assistant` message arrived before the process ended. */
  readonly sawAssistant: boolean;
  readonly alreadyRetried: boolean;
  /**
   * Whether the runner killed this start on what its stream showed: a refused init line, a tool
   * call with no answer from the gate, a turn reported as paid from usage credits.
   */
  readonly stoppedByStream: boolean;
}

/**
 * The one recovery (Contract, Continuity): a `--resume` start that exits non-zero before any
 * `assistant` message is retried, once per turn, as a fresh start with the stored history replayed.
 * It is for a start that ended by itself. A start the runner killed also ends without exit code 0,
 * and is never started again: its turn is stored under the code its stop named.
 */
export function shouldRetryAsFresh(outcome: StartOutcome): boolean {
  return outcome.mode === 'resume' && !outcome.alreadyRetried && !outcome.sawAssistant && !outcome.stoppedByStream && outcome.exitCode !== 0;
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
// The process: one CLI start per turn (two when a resume finds no session), read line by line.
// ---------------------------------------------------------------------------------------------

/** SIGTERM first; SIGKILL when the process is still there after this long. Under the 2 s a Stop is given. */
export const KILL_GRACE_MS = 1500;
/** After SIGKILL the output is closed this much later, in case a child of the CLI still holds the pipe open. */
export const OUTPUT_CLOSE_MS = 400;
const MS_PER_SECOND = 1000;
const STDERR_KEEP_CHARS = 2000;
const LOG_VALUE_MAX_CHARS = 80;
const LOG_STDERR_MAX_CHARS = 200;

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
  readonly readSystemPrompt: () => string;
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
function initLogLine(init: InitFacts): string {
  return [
    'init',
    `claude_code_version=${logValue(init.claudeCodeVersion)}`,
    `credential_source=${logValue(init.credentialSource)}`,
    `permissionMode=${logValue(init.permissionMode)}`,
    `model=${logValue(init.model)}`,
    `check=${checkInit(init).length === 0 ? 'pass' : 'refused'}`,
  ].join(' ');
}

/** The first line of stderr, short, with the token and the prompt taken out. */
function stderrForLog(stderr: string, hidden: readonly string[]): string {
  let line = (stderr.split(/\r?\n/).find((text) => text.trim() !== '') ?? '').trim();
  for (const secret of hidden) {
    if (secret !== '') line = line.split(secret).join('<hidden>');
  }
  return line.slice(0, LOG_STDERR_MAX_CHARS);
}

interface Attempt {
  readonly summary: TurnSummary;
  readonly exit: CliExit;
  /** True when the runner's abort ended the attempt. */
  readonly aborted: boolean;
}

function failure(errorCode: ErrorCode): ResultEvent {
  return { type: 'result', ok: false, errorCode, costUsd: null, claudeSessionId: null, model: null };
}

function resultOf(attempt: Attempt): ResultEvent {
  const { summary } = attempt;
  const reported = summary.result !== null;
  // The runner's abort decides the code only when it cut the turn short: a result line already read stands.
  const errorCode = attempt.aborted && !reported ? 'cli_error' : mapTurnEnd(summary);
  const sessionId = summary.init?.sessionId ?? null;
  return {
    type: 'result',
    ok: errorCode === null,
    errorCode,
    costUsd: summary.result?.totalCostUsd ?? null,
    // Only a session the CLI actually started: a resume that found none reports the id it was asked for.
    claudeSessionId: isUuidShaped(sessionId) ? sessionId : null,
    model: summary.model,
    reported,
  };
}

/**
 * One turn of the real CLI. It always ends with exactly one result event; when the runner aborts,
 * that result is a failure whose code the runner replaces with its own reason.
 */
export function createCliTurn(deps: CliTurnDeps): CliTurn {
  const graceMs = deps.killGraceMs ?? KILL_GRACE_MS;
  const resultExitGraceMs = deps.resultExitGraceMs ?? RESULT_EXIT_GRACE_MS;
  const newUuid = deps.newUuid ?? randomUUID;

  return async function* cliTurn(input, signal) {
    const log = (message: string): void => deps.log(`turn request=${input.requestId} ${message}`);

    async function* attemptOnce(start: SessionStart, token: string): AsyncGenerator<TurnEvent, Attempt> {
      const prompt = start.mode === 'fresh' ? buildPrompt(input.history, input.prompt) : asQuestion(input.prompt);
      const argv = buildArgv({ model: input.model, session: start, systemPrompt: deps.readSystemPrompt(), budgetUsd: input.budgetUsd, prompt });
      const child = deps.spawn(argv, { cwd: PATHS.turnCwd, env: childEnv(deps.baseEnv, token) });
      const stream = createTurnStream();
      const killer = createKiller(child, graceMs);
      const linger = createLingerGuard(killer, resultExitGraceMs, log);
      const onAbort = (): void => killer.kill();
      signal.addEventListener('abort', onAbort, { once: true });
      if (signal.aborted) killer.kill();
      try {
        for await (const lineText of linesOf(child.stdout)) {
          const line = parseLine(lineText);
          if (line === null) continue;
          for (const out of stream.push(line)) {
            if (out.kind === 'init') log(initLogLine(out.init));
            if (out.kind === 'stop') {
              log(`stopped: ${out.reason}`);
              killer.kill();
            }
            if (out.kind === 'result') linger.arm();
            if (signal.aborted) continue;
            if (out.kind === 'delta') yield { type: 'delta', text: out.text };
            if (out.kind === 'tool') yield { type: 'tool', id: out.id, call: out.call };
          }
        }
        const exit = await child.exited;
        if (exit.error !== undefined) log(`the CLI did not start: ${exit.error}`);
        else if (exit.code !== 0 && !signal.aborted && !linger.fired()) {
          const how = exit.code ?? `on ${exit.signal ?? 'a signal'}`;
          log(`the CLI exited ${how}: ${stderrForLog(child.stderrText(), [token, input.prompt])}`);
        }
        return { summary: stream.summary(), exit, aborted: signal.aborted };
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

    let start = planSession({ storedSessionId: input.claudeSessionId, conversationId: input.conversationId }, newUuid);
    let retried = false;
    for (;;) {
      let attempt: Attempt;
      try {
        attempt = yield* attemptOnce(start, token);
      } catch (error) {
        log(`could not run the CLI: ${messageOf(error)}`);
        yield failure('cli_error');
        return;
      }
      const outcome: StartOutcome = {
        mode: start.mode,
        exitCode: attempt.exit.code,
        sawAssistant: attempt.summary.sawAssistant,
        alreadyRetried: retried,
        stoppedByStream: attempt.summary.violation !== null || attempt.summary.overage,
      };
      if (!attempt.aborted && shouldRetryAsFresh(outcome)) {
        retried = true;
        log('the resumed session did not start; retrying once as a fresh start with replay');
        start = planSession({ storedSessionId: null, conversationId: input.conversationId }, newUuid);
        continue;
      }
      yield resultOf(attempt);
      return;
    }
  };
}

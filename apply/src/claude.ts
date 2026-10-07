/**
 * One /inbox-apply run of the unmodified `claude` CLI (Phase 23).
 *
 * The argv is the set recorded on the pinned version (2.1.289) in this phase's spike: a project
 * skill started from a slash command under `-p`, two agents defined on the command line with their
 * own models and tools, MCP tools reached from inside them, and the PreToolUse hook firing for
 * every call with the agent's name. The process, its environment and the token are Phase 21's
 * (`workspace/src/providers/claude-cli.ts`): spawned as an array with no shell and stdin closed,
 * on the subscription token read from its file immediately before the start.
 *
 * The run ends one of three ways: the CLI exits by itself, the init line does not pass (it is
 * killed before it does anything), or the time limit kills it. What it did is read from the
 * database afterwards; this file reports only how the process ended.
 */

import { StringDecoder } from 'node:string_decoder';

import { CLAUDE_BIN, CLAUDE_CODE_VERSION } from '../../workspace/src/config.js';
import { mapTurnEnd } from '../../workspace/src/errors.js';
import type { CliExit, CliProcess, SpawnOptions } from '../../workspace/src/providers/claude-cli.js';
import { parseLine, readInit } from '../../workspace/src/stream-json.js';
import {
  AGENT_TOOL_NAMES,
  CONTEXT_AGENT,
  CONTEXT_MODEL,
  DISALLOWED_TOOLS,
  APPLY_TOOL,
  KILL_GRACE_MS,
  MATERIALS_TOOLS,
  MCP_SERVERS,
  ORCHESTRATOR_MODEL,
  PATHS,
  QUERY_TOOL,
  RUN_TIMEOUT_MS,
  SKILL_NAME,
  WRITER_AGENT,
  WRITER_MODEL,
} from './config.js';
import type { ClaudeOutcome, RunError } from './report.js';

const BUDGET_DECIMALS = 2;
const OAUTH_CREDENTIAL_SOURCE = 'none';
const REQUIRED_PERMISSION_MODE = 'dontAsk';
const MCP_CONNECTED = 'connected';
const MS_PER_MINUTE = 60_000;
/** The ends `mapTurnEnd` can give a run. */
const RUN_END_CODES: readonly RunError[] = ['cli_error', 'usage_limit', 'budget_exceeded', 'sign_in_expired'];

type Json = Record<string, unknown>;

function isRecord(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const strings = (value: unknown): string[] => (Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []);

/** The two agents, built from the skill's own files so the two modes of the skill cannot drift. */
export function buildAgents(contextSpec: string, writerRules: string): Json {
  if (contextSpec.trim() === '' || writerRules.trim() === '') throw new Error('claude: the skill\'s context.md or writer.md is empty');
  return {
    [CONTEXT_AGENT]: {
      description: 'Read-only: gathers the facts one answered Inbox item needs, as one bundle per item.',
      prompt: contextSpec,
      tools: [QUERY_TOOL, ...MATERIALS_TOOLS],
      model: CONTEXT_MODEL,
    },
    [WRITER_AGENT]: {
      description: 'The one writer: applies each item in its own transaction and archives it with its record.',
      prompt: writerRules,
      tools: [QUERY_TOOL, APPLY_TOOL],
      model: WRITER_MODEL,
    },
  };
}

export interface CliArgsInput {
  readonly requestId: number;
  readonly itemIds: readonly number[];
  readonly agents: Json;
  readonly budgetUsd: number;
  readonly paths?: { readonly mcpConfig: string; readonly settings: string };
}

function positiveInt(value: number, what: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`claude: ${what} is not a positive whole number`);
  return value;
}

/** The CLI's arguments. The prompt is last, after `--`, and is built from numbers only. */
export function buildArgs(input: CliArgsInput): string[] {
  const paths = input.paths ?? PATHS;
  if (input.itemIds.length === 0) throw new Error('claude: a run needs at least one item');
  if (!Number.isFinite(input.budgetUsd) || input.budgetUsd <= 0) throw new Error('claude: the budget must be a positive amount');
  const items = input.itemIds.map((id) => positiveInt(id, 'an item id')).join(',');
  return [
    '-p',
    '--model', ORCHESTRATOR_MODEL,
    '--tools', AGENT_TOOL_NAMES[0],
    '--agents', JSON.stringify(input.agents),
    '--allowedTools', ...AGENT_TOOL_NAMES, QUERY_TOOL, APPLY_TOOL, ...MATERIALS_TOOLS,
    '--disallowedTools', ...DISALLOWED_TOOLS,
    '--permission-mode', REQUIRED_PERMISSION_MODE,
    '--strict-mcp-config',
    '--mcp-config', paths.mcpConfig,
    '--setting-sources', 'project',
    '--settings', paths.settings,
    '--output-format', 'stream-json',
    '--verbose',
    '--include-hook-events',
    '--max-budget-usd', input.budgetUsd.toFixed(BUDGET_DECIMALS),
    '--',
    `/${SKILL_NAME} ${positiveInt(input.requestId, 'the request id')} --unattended --items ${items}`,
  ];
}

/** Why the init line does not pass, one sentence per reason; empty when it passes. */
export function checkInit(line: unknown, pinnedVersion: string = CLAUDE_CODE_VERSION): string[] {
  const init = readInit(line);
  if (init === null || !isRecord(line)) return ['the first line is not an init line'];
  const problems: string[] = [];
  if (init.claudeCodeVersion !== pinnedVersion) problems.push(`claude_code_version is ${init.claudeCodeVersion ?? 'missing'}, not the pinned ${pinnedVersion}`);
  if (init.credentialSource !== OAUTH_CREDENTIAL_SOURCE) problems.push(`the credential source is ${init.credentialSource ?? 'missing'}, not the OAuth token`);
  if (init.permissionMode !== REQUIRED_PERMISSION_MODE) problems.push(`permissionMode is ${init.permissionMode ?? 'missing'}, not ${REQUIRED_PERMISSION_MODE}`);
  const servers = init.mcpServers.map((server) => server.name).sort();
  if (servers.join(',') !== [...MCP_SERVERS].sort().join(',')) problems.push(`mcp_servers are [${servers.join(', ')}], not exactly ${MCP_SERVERS.join(' and ')}`);
  for (const server of init.mcpServers) {
    if (server.status !== MCP_CONNECTED) problems.push(`the MCP server ${server.name} is ${server.status}, not connected`);
  }
  for (const tool of [QUERY_TOOL, APPLY_TOOL, ...MATERIALS_TOOLS]) {
    if (!init.tools.includes(tool)) problems.push(`tools does not hold ${tool}`);
  }
  for (const tool of DISALLOWED_TOOLS) {
    if (init.tools.includes(tool)) problems.push(`tools holds ${tool}`);
  }
  if (!strings(line.skills).includes(SKILL_NAME)) problems.push(`skills does not hold ${SKILL_NAME}`);
  for (const agent of [CONTEXT_AGENT, WRITER_AGENT]) {
    if (!strings(line.agents).includes(agent)) problems.push(`agents does not hold ${agent}`);
  }
  return problems;
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

export interface RunDeps {
  readonly spawn: (argv: readonly string[], options: SpawnOptions) => CliProcess;
  /** The subscription token, read from its file immediately before the start. Throws when it is missing. */
  readonly readOauthToken: () => string;
  /** The child's environment for a token (Phase 21's `childEnv`). */
  readonly childEnv: (token: string) => Record<string, string>;
  readonly log: (line: string) => void;
  readonly timeoutMs?: number;
  readonly killGraceMs?: number;
  readonly cwd?: string;
}

interface StreamFacts {
  readonly initProblems: readonly string[] | null;
  readonly sawInit: boolean;
  readonly assistantError: string | null;
  readonly rateLimitStatus: string | null;
  readonly overage: boolean;
  readonly result: { readonly subtype: string | null; readonly isError: boolean; readonly apiErrorStatus: number | null; readonly costUsd: number | null } | null;
}

const NO_FACTS: StreamFacts = { initProblems: null, sawInit: false, assistantError: null, rateLimitStatus: null, overage: false, result: null };

/** The facts with one stdout line folded in: a new object, the old one untouched. */
function read(line: Json, facts: StreamFacts): StreamFacts {
  if (line.type === 'system' && line.subtype === 'init' && !facts.sawInit) {
    return { ...facts, sawInit: true, initProblems: checkInit(line) };
  }
  if (line.type === 'assistant' && typeof line.error === 'string') return { ...facts, assistantError: line.error };
  if (line.type === 'rate_limit_event' && isRecord(line.rate_limit_info)) {
    const info = line.rate_limit_info;
    return { ...facts, rateLimitStatus: typeof info.status === 'string' ? info.status : null, overage: facts.overage || info.isUsingOverage === true };
  }
  if (line.type === 'result') {
    return {
      ...facts,
      result: {
        subtype: typeof line.subtype === 'string' ? line.subtype : null,
        isError: line.is_error === true,
        apiErrorStatus: typeof line.api_error_status === 'number' ? line.api_error_status : null,
        costUsd: typeof line.total_cost_usd === 'number' && Number.isFinite(line.total_cost_usd) ? line.total_cost_usd : null,
      },
    };
  }
  return facts;
}

const failed = (error: RunError, detail: string): ClaudeOutcome => ({ exitCode: null, timedOut: false, costUsd: null, error, detail });

interface RunEnd {
  readonly exit: CliExit;
  readonly facts: StreamFacts;
  readonly timedOut: boolean;
  readonly aborted: boolean;
  readonly timeoutMs: number;
}

/** How a run that was started ended, from its exit and what its stream showed. */
function outcomeOf(end: RunEnd, log: (line: string) => void): ClaudeOutcome {
  const { exit, facts } = end;
  const base = { exitCode: exit.code, timedOut: end.timedOut, costUsd: facts.result?.costUsd ?? null };
  if (exit.error !== undefined) {
    log(`claude: did not start: ${exit.error}`);
    return { ...base, error: 'cli_error', detail: 'The Claude CLI could not be started.' };
  }
  if (end.timedOut) return { ...base, error: 'timed_out', detail: `The run was stopped at ${Math.round(end.timeoutMs / MS_PER_MINUTE)} minutes.` };
  if (end.aborted) return { ...base, error: 'interrupted', detail: 'The worker was stopped during the run.' };
  if (facts.initProblems === null || facts.initProblems.length > 0) {
    return { ...base, error: 'cli_error', detail: 'The Claude CLI did not start in the expected configuration.' };
  }
  const code = mapTurnEnd({
    violation: null,
    overage: facts.overage,
    assistantError: facts.assistantError,
    rateLimit: facts.rateLimitStatus === null ? null : { status: facts.rateLimitStatus },
    result: facts.result,
  });
  if (code === null) return { ...base, error: exit.code === 0 ? null : 'cli_error', detail: null };
  log(`claude: ended as ${code} (exit ${exit.code ?? 'by signal'})`);
  // Phase 21's mapping has codes of its own (a cancelled turn, a stale claim); none is a run's end here.
  const known = (RUN_END_CODES as readonly string[]).includes(code) ? (code as RunError) : 'cli_error';
  return { ...base, error: known, detail: null };
}

/**
 * Run the CLI once for a batch and report how it ended. `signal` is the worker's stop: an abort
 * kills the run and it reads as interrupted.
 */
export async function runClaude(input: CliArgsInput, deps: RunDeps, signal: AbortSignal): Promise<ClaudeOutcome> {
  const timeoutMs = deps.timeoutMs ?? RUN_TIMEOUT_MS;
  const graceMs = deps.killGraceMs ?? KILL_GRACE_MS;
  if (signal.aborted) return failed('interrupted', 'The worker was stopping before the run started.');

  let token: string;
  try {
    token = deps.readOauthToken();
  } catch {
    deps.log('claude: no subscription token');
    return failed('sign_in_expired', "The apply worker's Claude token is missing or empty.");
  }

  let child: CliProcess;
  try {
    child = deps.spawn([CLAUDE_BIN, ...buildArgs(input)], { cwd: deps.cwd ?? PATHS.runCwd, env: deps.childEnv(token) });
  } catch (error) {
    deps.log(`claude: could not start: ${error instanceof Error ? error.message : 'unknown error'}`);
    return failed('cli_error', 'The Claude CLI could not be started.');
  }

  let facts = NO_FACTS;
  let timedOut = false;
  let killTimer: ReturnType<typeof setTimeout> | null = null;
  let asked = false;
  const kill = (): void => {
    if (asked) return;
    asked = true;
    child.kill('SIGTERM');
    killTimer = setTimeout(() => {
      child.kill('SIGKILL');
      child.closeOutput();
    }, graceMs);
  };
  const timer = setTimeout(() => {
    timedOut = true;
    deps.log(`claude: stopped at the ${Math.round(timeoutMs / MS_PER_MINUTE)}-minute limit`);
    kill();
  }, timeoutMs);
  const onAbort = (): void => kill();
  signal.addEventListener('abort', onAbort, { once: true });

  try {
    for await (const lineText of linesOf(child.stdout)) {
      const line = parseLine(lineText);
      if (line === null) continue;
      facts = read(line, facts);
      if (facts.initProblems !== null && facts.initProblems.length > 0 && !asked) {
        deps.log(`claude: the init line was refused: ${facts.initProblems.join('; ')}`);
        kill();
      }
      if (facts.overage && !asked) {
        deps.log('claude: the run was reported as paid from usage credits; stopping it');
        kill();
      }
    }
    const exit = await child.exited;
    return outcomeOf({ exit, facts, timedOut, aborted: signal.aborted, timeoutMs }, deps.log);
  } finally {
    clearTimeout(timer);
    if (killTimer !== null) clearTimeout(killTimer);
    signal.removeEventListener('abort', onAbort);
  }
}

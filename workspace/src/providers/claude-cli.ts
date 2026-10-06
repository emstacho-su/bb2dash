/**
 * The claude CLI provider: the unmodified `claude` CLI run as `claude -p` on the owner's
 * subscription token (brief 102, Contract, "Argv, frozen" and "Continuity").
 *
 * This file holds the argv and the choice between a fresh start and a resumed one. The argv is an
 * array, spawned without a shell; the prompt is always its last element, after `--`, so a question
 * that begins with a flag is never read as one.
 */

import { randomUUID } from 'node:crypto';
import fs from 'node:fs';

import { CLAUDE_BIN, PATHS } from '../config.js';
import { ALLOWED_TOOLS } from '../hooks/gate-rules.js';
import type { Provider, TurnEvent, TurnInput } from './types.js';

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

/** One turn of the CLI, as a stream of events: the real process in the container, a replay in tests. */
export type CliTurn = (input: TurnInput, signal: AbortSignal) => AsyncIterable<TurnEvent>;

export function createClaudeCliProvider(turn: CliTurn): Provider {
  return {
    id: 'claude-cli',
    runTurn: (input, signal) => turn(input, signal),
  };
}

/**
 * One turn (brief 102, Contract, "The runner"): route, `workspace_begin()`, run the provider, send
 * the answer text through `workspace_stream()` in flushes 250 ms apart, close with
 * `workspace_finish()`.
 *
 * The runner's own stops: a false from `workspace_stream()` is the owner's Stop (`cancelled`), the
 * 8-minute limit is `timeout`, and a shutdown or the database watchdog is `stale_claim`. The first
 * stop wins. No code is retried on another model.
 */

import {
  CANCEL_POLL_MS,
  CONTENT_MAX_CHARS,
  NO_CAP_SENTENCE,
  STREAM_DELTA_MAX_CHARS,
  STREAM_FLUSH_MS,
  TOOL_CALLS_MAX,
  TURN_TIMEOUT_MS,
} from './config.js';
import type { Claim, WorkspaceRpc } from './db.js';
import { errorCodeFor, type ErrorCode } from './errors.js';
import type { Providers } from './providers/index.js';
import type { ResultEvent, StoredToolCall, TurnInput } from './providers/types.js';
import { routeTier } from './router.js';
import { TIER_ROUTES } from './tiers.js';

/** `workspace_finish()` is tried this many times, this far apart, before the turn is left to the stale-claim sweep. */
const FINISH_ATTEMPTS = 3;
const FINISH_RETRY_MS = 1000;
/** The database cannot store this character in text. */
const NUL = '\u0000';

export interface TurnDeps {
  readonly rpc: WorkspaceRpc;
  readonly providers: Providers;
  readonly log: (line: string) => void;
  /** The per-answer cost cap the provider receives. */
  readonly budgetUsd: number;
  /** False only under O-2's conditional branch: the stored answer then ends with NO_CAP_SENTENCE. */
  readonly budgetCapHolds: boolean;
}

/** The runner's own reasons to stop a turn. */
export type StopCode = Extract<ErrorCode, 'cancelled' | 'timeout' | 'stale_claim'>;

export interface TurnOutcome {
  /** `skipped`: the request was no longer claimed at begin, so nothing ran. */
  readonly state: 'done' | 'failed' | 'skipped';
  readonly errorCode: ErrorCode | null;
}

export interface TurnHandle {
  readonly done: Promise<TurnOutcome>;
  /** Stop the turn from outside (a shutdown, the watchdog). */
  stop(code: StopCode): void;
}

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** `text` in pieces of at most `size` characters (code points, the way the database counts). */
function piecesOf(text: string, size: number): string[] {
  const chars = [...text];
  const pieces: string[] = [];
  for (let at = 0; at < chars.length; at += size) pieces.push(chars.slice(at, at + size).join(''));
  return pieces;
}

interface Stored {
  readonly content: string;
  readonly cutFrom: number | null;
}

/** The content as it is stored: at most CONTENT_MAX_CHARS characters, the suffix kept whole at the end. */
function storedContent(body: string, suffix: string): Stored {
  const room = CONTENT_MAX_CHARS - [...suffix].length;
  const chars = [...body];
  if (chars.length <= room) return { content: `${body}${suffix}`, cutFrom: null };
  return { content: `${chars.slice(0, room).join('')}${suffix}`, cutFrom: chars.length };
}

function outcomeOf(stopCode: StopCode | null, thrown: unknown, result: ResultEvent | null): TurnOutcome & { state: 'done' | 'failed' } {
  if (stopCode !== null) return { state: 'failed', errorCode: stopCode };
  if (thrown !== undefined) return { state: 'failed', errorCode: errorCodeFor(thrown) };
  if (result?.ok === true) return { state: 'done', errorCode: null };
  return { state: 'failed', errorCode: result?.errorCode ?? 'cli_error' };
}

export function startTurn(deps: TurnDeps, claim: Claim): TurnHandle {
  const controller = new AbortController();
  const log = (message: string): void => deps.log(`turn request=${claim.requestId} ${message}`);
  let stopCode: StopCode | null = null;

  const stop = (code: StopCode): void => {
    if (stopCode !== null) return;
    stopCode = code;
    controller.abort();
  };

  async function run(): Promise<TurnOutcome> {
    const startedAt = Date.now();
    const tier = routeTier(claim.prompt, claim.priorTier);
    const route = TIER_ROUTES[tier];
    try {
      await deps.rpc.begin(claim.requestId, tier, route.provider, route.model);
    } catch (error) {
      log(`begin refused, nothing ran: ${messageOf(error)}`);
      return { state: 'skipped', errorCode: null };
    }
    log(`started tier=${tier} provider=${route.provider} model=${route.model}`);

    let content = '';
    let buffer = '';
    let seq = 0;
    let lastStreamAt = Date.now();
    let busy: Promise<void> | null = null;

    /** One `workspace_stream()` call. An empty delta sends nothing and uses no seq: it only asks. */
    const call = async (delta: string, atSeq: number): Promise<void> => {
      lastStreamAt = Date.now();
      try {
        const stillClaimed = await deps.rpc.stream(claim.requestId, atSeq, delta);
        if (!stillClaimed) stop('cancelled');
      } catch (error) {
        log(`stream call failed (the stored answer is the record): ${messageOf(error)}`);
      }
    };

    const flush = async (): Promise<void> => {
      const text = buffer;
      buffer = '';
      for (const piece of piecesOf(text, STREAM_DELTA_MAX_CHARS)) {
        if (stopCode !== null) return;
        seq += 1;
        await call(piece, seq);
      }
    };

    const tick = (): void => {
      if (busy !== null || stopCode !== null) return;
      const work = buffer !== '' ? flush() : Date.now() - lastStreamAt >= CANCEL_POLL_MS ? call('', Math.max(1, seq)) : null;
      if (work === null) return;
      busy = work.finally(() => {
        busy = null;
      });
    };

    const flushTimer = setInterval(tick, STREAM_FLUSH_MS);
    const timeLimit = setTimeout(() => stop('timeout'), TURN_TIMEOUT_MS);

    const tools = new Map<string, StoredToolCall>();
    let result: ResultEvent | null = null;
    let thrown: unknown;
    const input: TurnInput = {
      requestId: claim.requestId,
      conversationId: claim.conversationId,
      model: route.model,
      prompt: claim.prompt,
      history: claim.history,
      claudeSessionId: claim.claudeSessionId,
      budgetUsd: deps.budgetUsd,
    };
    try {
      for await (const event of deps.providers[route.provider].runTurn(input, controller.signal)) {
        if (event.type === 'delta') {
          const text = event.text.split(NUL).join('');
          content += text;
          buffer += text;
        } else if (event.type === 'tool') {
          // A Map keeps a key's first place, so a call stays in call order when its result arrives.
          tools.set(event.id, event.call);
        } else {
          result = event;
        }
      }
    } catch (error) {
      thrown = error;
      log(`the provider failed: ${messageOf(error)}`);
    } finally {
      clearInterval(flushTimer);
      clearTimeout(timeLimit);
    }

    if (busy !== null) await busy;
    if (stopCode === null && buffer !== '') await flush();

    const outcome = outcomeOf(stopCode, thrown, result);
    const suffix = !deps.budgetCapHolds && outcome.state === 'done' ? `${content === '' ? '' : '\n\n'}${NO_CAP_SENTENCE}` : '';
    const stored = storedContent(content, suffix);
    if (stored.cutFrom !== null) log(`content cut from ${stored.cutFrom} to ${CONTENT_MAX_CHARS - [...suffix].length} characters`);
    const calls = [...tools.values()];
    const kept = calls.slice(0, TOOL_CALLS_MAX);
    if (calls.length > kept.length) log(`tool calls: kept ${kept.length}, dropped ${calls.length - kept.length}`);

    const durationMs = Date.now() - startedAt;
    for (let attempt = 1; attempt <= FINISH_ATTEMPTS; attempt += 1) {
      try {
        await deps.rpc.finish({
          requestId: claim.requestId,
          state: outcome.state,
          content: stored.content,
          toolCalls: kept,
          errorCode: outcome.errorCode,
          costUsd: result?.costUsd ?? null,
          durationMs,
          claudeSessionId: result?.claudeSessionId ?? null,
          model: result?.model ?? null,
        });
        log(`finished state=${outcome.state} error=${outcome.errorCode ?? '-'} ms=${durationMs} tools=${kept.length}`);
        return outcome;
      } catch (error) {
        log(`finish failed (try ${attempt} of ${FINISH_ATTEMPTS}): ${messageOf(error)}`);
        if (attempt < FINISH_ATTEMPTS) await sleep(FINISH_RETRY_MS);
      }
    }
    return outcome;
  }

  return { done: run(), stop };
}

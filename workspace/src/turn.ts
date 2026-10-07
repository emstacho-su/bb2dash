/**
 * One turn (brief 102, Contract, "The runner"): route, `workspace_begin()`, run the provider, send
 * the answer text through `workspace_stream()` in flushes 250 ms apart, close with
 * `workspace_finish()`.
 *
 * The runner's own stops: a false from `workspace_stream()` is the owner's Stop (`cancelled`), the
 * 8-minute limit is `timeout`, and a shutdown or the database watchdog is `stale_claim`. The first
 * stop wins. No code is retried on another model.
 *
 * Begin and finish against a database that fails (rulings V1, CR-2 and CR-3, and X1; `db-retry.ts`
 * holds the schedule). A begin the function refuses (22023) on the first try means the request is
 * no longer claimed: nothing ran and there is nothing to close. Any other begin failure is tried
 * again; if begin still cannot be made the request is closed as `failed` / `cli_error`, so it is not
 * left claimed. A 22023 that follows such a failure is closed the same way: a begin that went
 * through with its reply lost is refused on the next try, and its request is still claimed. A
 * finish is tried again for 110 s before the answer is given up; a finish the function refuses
 * means the request is already closed.
 *
 * A statement the database refuses for what it is or holds (ruling Z1, R2-5; `isBadStatement`) is
 * not tried again. A finish refused that way is followed by one minimal close of the request,
 * `failed` / `cli_error` with nothing of the turn in it, so the request is not left claimed until
 * the 10-minute sweep; if that call fails too it is logged and left. A begin refused that way goes
 * straight to the close of a request that could not be begun.
 */

import {
  CANCEL_POLL_MS,
  CONTENT_MAX_CHARS,
  FINISH_RETRY_MS,
  NO_CAP_SENTENCE,
  STREAM_DELTA_MAX_CHARS,
  STREAM_FLUSH_MS,
  TOOL_CALLS_MAX,
  TURN_TIMEOUT_MS,
} from './config.js';
import { retryDbCall, type RetryEnd } from './db-retry.js';
import type { Claim, FinishArgs, WorkspaceRpc } from './db.js';
import { errorCodeFor, messageOf, type ErrorCode } from './errors.js';
import type { Providers } from './providers/index.js';
import type { Provider, ResultEvent, StoredToolCall, TurnInput } from './providers/types.js';
import { routeTier } from './router.js';
import { TIER_ROUTES } from './tiers.js';

const MS_PER_SECOND = 1000;
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
  /**
   * Milliseconds on a monotonic clock (ruling Z1, R2-2). Every duration a turn and the loop measure
   * is read on it (the limit, the retry window, the 2 s between two asks about a Stop, the stored
   * duration, the watchdog and its hold), so a step of the wall clock changes none of them.
   */
  readonly now: () => number;
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
  /** When the turn began making its `workspace_finish()` call, tries included, on `TurnDeps.now`; null before that and once it is over. */
  finishingSince(): number | null;
}

type Log = (message: string) => void;

/**
 * `value` with NUL taken out of every string in it: a string itself, and the keys and values of an
 * array or an object at any depth. Anything else is handed back as it is.
 */
function withoutNul<T>(value: T): T {
  if (typeof value === 'string') return value.split(NUL).join('') as T;
  if (Array.isArray(value)) return value.map((item: unknown) => withoutNul(item)) as T;
  if (typeof value !== 'object' || value === null) return value;
  return Object.fromEntries(Object.entries(value).map(([key, inner]) => [withoutNul(key), withoutNul(inner)])) as T;
}

/** `text` in pieces of at most `size` characters (code points, the way the database counts). */
function piecesOf(text: string, size: number): string[] {
  const chars = [...text];
  const pieces: string[] = [];
  for (let at = 0; at < chars.length; at += size) pieces.push(chars.slice(at, at + size).join(''));
  return pieces;
}

/** What a turn can ask of its stop switch. */
interface StopSwitch {
  readonly code: () => StopCode | null;
  readonly stop: (code: StopCode) => void;
}

interface Streamer {
  /** Queue answer text for the next flush. */
  add(text: string): void;
  /** The 250 ms tick: flush what is queued, or ask whether the request is still claimed. */
  tick(): void;
  /** Wait for a call in flight, then send what is left unless the turn was stopped. */
  drain(): Promise<void>;
}

/**
 * The stream side of a turn. `seq` starts at 1 and rises by 1 per flush; a flush over 16000
 * characters is split first. With no text flushed for 2 s it calls `workspace_stream()` with an
 * empty delta, which sends nothing and uses no seq, so a Stop pressed during a tool call is seen.
 */
function createStreamer(rpc: WorkspaceRpc, requestId: string, stopSwitch: StopSwitch, now: () => number, log: Log): Streamer {
  const state = { buffer: '', seq: 0, lastCallAt: now(), busy: null as Promise<void> | null };

  const call = async (delta: string, seq: number): Promise<void> => {
    state.lastCallAt = now();
    try {
      if (!(await rpc.stream(requestId, seq, delta))) stopSwitch.stop('cancelled');
    } catch (error) {
      log(`stream call failed (the stored answer is the record): ${messageOf(error)}`);
    }
  };

  const flush = async (): Promise<void> => {
    const text = state.buffer;
    state.buffer = '';
    for (const piece of piecesOf(text, STREAM_DELTA_MAX_CHARS)) {
      if (stopSwitch.code() !== null) return;
      state.seq += 1;
      await call(piece, state.seq);
    }
  };

  const nextWork = (): Promise<void> | null => {
    if (state.buffer !== '') return flush();
    return now() - state.lastCallAt >= CANCEL_POLL_MS ? call('', Math.max(1, state.seq)) : null;
  };

  return {
    add(text) {
      state.buffer += text;
    },
    tick() {
      if (state.busy !== null || stopSwitch.code() !== null) return;
      const work = nextWork();
      if (work === null) return;
      state.busy = work.finally(() => {
        state.busy = null;
      });
    },
    async drain() {
      if (state.busy !== null) await state.busy;
      if (stopSwitch.code() === null && state.buffer !== '') await flush();
    },
  };
}

interface Collected {
  readonly content: string;
  /** Every tool call in call order. */
  readonly calls: readonly StoredToolCall[];
  readonly result: ResultEvent | null;
  /** What the provider threw, when it threw. */
  readonly thrown: { readonly error: unknown } | null;
}

/** Run the provider to its end, handing answer text to the streamer as it arrives. */
async function collect(provider: Provider, input: TurnInput, signal: AbortSignal, streamer: Streamer): Promise<Collected> {
  // A Map keeps a key's first place, so a call stays in call order when its result arrives.
  const tools = new Map<string, StoredToolCall>();
  let content = '';
  let result: ResultEvent | null = null;
  let thrown: Collected['thrown'] = null;
  try {
    for await (const event of provider.runTurn(input, signal)) {
      if (event.type === 'delta') {
        const text = withoutNul(event.text);
        content += text;
        streamer.add(text);
      } else if (event.type === 'tool') {
        tools.set(event.id, event.call);
      } else {
        result = event;
      }
    }
  } catch (error) {
    thrown = { error };
  }
  return { content, calls: [...tools.values()], result, thrown };
}

type Ending = { readonly state: 'done' | 'failed'; readonly errorCode: ErrorCode | null };

/** How the tries of a begin ended when it was not made. */
type UnbegunEnd = Exclude<RetryEnd<string>, { readonly outcome: 'made' }>;

/** Why a request is closed without having been begun, for the log. */
const UNBEGUN_REASON: Record<UnbegunEnd['outcome'], string> = {
  refused: 'begin refused after a failed try, its reply may have been lost',
  bad_statement: 'begin refused by the database as a statement it cannot take, not tried again',
  gave_up: 'begin could not be made',
  stopped: 'begin could not be made',
};

function endingOf(stopCode: StopCode | null, collected: Collected): Ending {
  // A turn that produced a result is never stored as `timeout` (ruling V1, CR-5): the limit fell
  // while the CLI was being given its time to exit, and what its result line said stands. The
  // owner's Stop and the runner's own shutdown still decide the code. A result the provider read
  // only after the abort is not `reported` (ruling Z1, R2-1), so the limit's own code stands then.
  const stop = stopCode === 'timeout' && collected.result?.reported === true ? null : stopCode;
  if (stop !== null) return { state: 'failed', errorCode: stop };
  if (collected.thrown !== null) return { state: 'failed', errorCode: errorCodeFor(collected.thrown.error) };
  if (collected.result?.ok === true) return { state: 'done', errorCode: null };
  return { state: 'failed', errorCode: collected.result?.errorCode ?? 'cli_error' };
}

/** The content as stored: at most CONTENT_MAX_CHARS characters, the no-cap sentence kept whole as its last line. */
function storedContent(body: string, ending: Ending, budgetCapHolds: boolean, log: Log): string {
  const suffix = !budgetCapHolds && ending.state === 'done' ? `${body === '' ? '' : '\n\n'}${NO_CAP_SENTENCE}` : '';
  const room = CONTENT_MAX_CHARS - [...suffix].length;
  const chars = [...body];
  if (chars.length <= room) return `${body}${suffix}`;
  log(`content cut from ${chars.length} to ${room} characters`);
  return `${chars.slice(0, room).join('')}${suffix}`;
}

/**
 * The first 20 calls of the turn, in call order; the rest are dropped and counted in the log. NUL is
 * taken out of every string in them (ruling Z1, R2-5): the array is sent as JSON, where a NUL is an
 * escape the database refuses to store.
 */
function storedCalls(calls: readonly StoredToolCall[], log: Log): readonly StoredToolCall[] {
  const kept = withoutNul(calls.slice(0, TOOL_CALLS_MAX));
  if (calls.length > kept.length) log(`tool calls: kept ${kept.length}, dropped ${calls.length - kept.length}`);
  return kept;
}

/**
 * The one call that follows a finish the database refused for what it held (ruling Z1, R2-5): the
 * request is closed with nothing of the turn in it. It is made once; whatever fails it, it is
 * logged and left to the stale-claim sweep.
 */
async function closeMinimal(rpc: WorkspaceRpc, minimal: FinishArgs, log: Log): Promise<void> {
  try {
    await rpc.finish(minimal);
    log(`closed as ${minimal.state} / ${minimal.errorCode ?? '-'} with no content and no tool calls: the answer is not stored`);
  } catch (error) {
    log(`the minimal close failed too, the stale-claim sweep closes the request: ${messageOf(error)}`);
  }
}

/**
 * Close the request, trying again while the database fails; one log line says how it ended. A
 * finish the database refuses as a statement is followed by `minimal`, once. `minimal` is null
 * when `args` is that close already: it is then logged and left, never sent a second time.
 */
async function finishWithRetry(rpc: WorkspaceRpc, args: FinishArgs, minimal: FinishArgs | null, now: () => number, log: Log): Promise<void> {
  const end = await retryDbCall(() => rpc.finish(args), { what: 'finish', log, now });
  if (end.outcome === 'made') {
    log(`finished state=${args.state} error=${args.errorCode ?? '-'} ms=${args.durationMs} tools=${args.toolCalls.length}`);
  } else if (end.outcome === 'refused') {
    log(`finish refused, the request is already closed: ${messageOf(end.error)}`);
  } else if (end.outcome === 'bad_statement' && minimal !== null) {
    log(`finish refused by the database as a statement it cannot take, not tried again: ${messageOf(end.error)}`);
    await closeMinimal(rpc, minimal, log);
  } else if (end.outcome === 'bad_statement') {
    log(`the minimal close was refused by the database as a statement it cannot take, the stale-claim sweep closes the request: ${messageOf(end.error)}`);
  } else {
    const window = FINISH_RETRY_MS / MS_PER_SECOND;
    log(`finish given up after ${window} s, the answer is not stored and the stale-claim sweep closes the request: ${messageOf(end.error)}`);
  }
}

export function startTurn(deps: TurnDeps, claim: Claim): TurnHandle {
  const controller = new AbortController();
  const log: Log = (message) => deps.log(`turn request=${claim.requestId} ${message}`);
  const stopped: { code: StopCode | null } = { code: null };
  const finishing: { since: number | null } = { since: null };
  const stopSwitch: StopSwitch = {
    code: () => stopped.code,
    stop: (code) => {
      if (stopped.code !== null) return;
      stopped.code = code;
      controller.abort();
    },
  };

  /** Whole milliseconds since `startedAt`, a reading of `deps.now`, which counts fractions of one. */
  const elapsedMs = (startedAt: number): number => Math.round(deps.now() - startedAt);

  /**
   * A close with nothing of a turn in it: no content, no tool calls, no cost, no model, and the
   * session id the claim came with, so the conversation keeps the session it had.
   */
  const emptyClose = (errorCode: ErrorCode, durationMs: number): FinishArgs => ({
    requestId: claim.requestId,
    state: 'failed',
    content: '',
    toolCalls: [],
    errorCode,
    costUsd: null,
    durationMs,
    claudeSessionId: claim.claudeSessionId,
    model: null,
  });

  /**
   * The one `workspace_finish()` of the turn, and `minimal` after it when the database refuses it
   * as a statement; `finishingSince()` is set while they are being made.
   */
  async function finish(args: FinishArgs, minimal: FinishArgs | null): Promise<void> {
    finishing.since = deps.now();
    try {
      await finishWithRetry(deps.rpc, args, minimal, deps.now, log);
    } finally {
      finishing.since = null;
    }
  }

  /**
   * Begin did not go through as far as the runner can tell, nothing ran, and the request may still
   * be claimed: every try failed, the runner's own stop ended the tries, the function refused a try
   * that followed a failed one, or the database refused the statement itself. It is closed under
   * the runner's own stop when there is one, as `cli_error` otherwise.
   */
  async function closeUnbegun(startedAt: number, end: UnbegunEnd): Promise<TurnOutcome> {
    const errorCode: ErrorCode = stopped.code ?? 'cli_error';
    log(`${UNBEGUN_REASON[end.outcome]}, nothing ran; closing the request as ${errorCode}: ${messageOf(end.error)}`);
    // This close is the minimal one already, so nothing follows it when the database refuses it.
    await finish(emptyClose(errorCode, elapsedMs(startedAt)), null);
    return { state: 'failed', errorCode };
  }

  async function run(): Promise<TurnOutcome> {
    const startedAt = deps.now();
    const tier = routeTier(claim.prompt, claim.priorTier);
    const route = TIER_ROUTES[tier];
    const begun = await retryDbCall(() => deps.rpc.begin(claim.requestId, tier, route.provider, route.model), {
      what: 'begin',
      log,
      now: deps.now,
      signal: controller.signal,
    });
    // A refusal on the first try is the function's answer to this turn's only begin: the request is
    // not claimed. A refusal that follows a failed try may answer a begin that already went through.
    if (begun.outcome === 'refused' && !begun.afterFailure) {
      log(`begin refused, nothing ran: ${messageOf(begun.error)}`);
      return { state: 'skipped', errorCode: null };
    }
    if (begun.outcome !== 'made') return closeUnbegun(startedAt, begun);
    log(`started tier=${tier} provider=${route.provider} model=${route.model}`);

    const streamer = createStreamer(deps.rpc, claim.requestId, stopSwitch, deps.now, log);
    const flushTimer = setInterval(() => streamer.tick(), STREAM_FLUSH_MS);
    // The limit counts from the start of the turn: the time begin's tries took is part of it, so a
    // turn still ends under the database's 10-minute sweep. That time is read on the monotonic
    // clock, so a wall clock that stepped during the tries does not leave the turn a limit of 0.
    const timeLimit = setTimeout(() => stopSwitch.stop('timeout'), Math.max(0, TURN_TIMEOUT_MS - (deps.now() - startedAt)));
    const input: TurnInput = {
      requestId: claim.requestId,
      conversationId: claim.conversationId,
      model: route.model,
      prompt: claim.prompt,
      history: claim.history,
      claudeSessionId: claim.claudeSessionId,
      budgetUsd: deps.budgetUsd,
    };
    const collected = await collect(deps.providers[route.provider], input, controller.signal, streamer);
    clearInterval(flushTimer);
    clearTimeout(timeLimit);
    if (collected.thrown !== null) log(`the provider failed: ${messageOf(collected.thrown.error)}`);
    await streamer.drain();

    const ending = endingOf(stopped.code, collected);
    const durationMs = elapsedMs(startedAt);
    const answer: FinishArgs = {
      requestId: claim.requestId,
      state: ending.state,
      content: storedContent(collected.content, ending, deps.budgetCapHolds, log),
      toolCalls: storedCalls(collected.calls, log),
      errorCode: ending.errorCode,
      costUsd: collected.result?.costUsd ?? null,
      durationMs,
      // `workspace_finish()` stamps what it is given, so a turn that reported no session (nothing
      // started) hands back the stored id: the conversation keeps its session for the next turn.
      claudeSessionId: collected.result?.claudeSessionId ?? claim.claudeSessionId,
      model: collected.result?.model ?? null,
    };
    await finish(answer, emptyClose('cli_error', durationMs));
    return ending;
  }

  return { done: run(), stop: stopSwitch.stop, finishingSince: () => finishing.since };
}

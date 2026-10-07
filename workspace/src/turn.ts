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
  /** When the turn began making its `workspace_finish()` call, tries included; null before that and once it is over. */
  finishingSince(): number | null;
}

type Log = (message: string) => void;

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
function createStreamer(rpc: WorkspaceRpc, requestId: string, stopSwitch: StopSwitch, log: Log): Streamer {
  const state = { buffer: '', seq: 0, lastCallAt: Date.now(), busy: null as Promise<void> | null };

  const call = async (delta: string, seq: number): Promise<void> => {
    state.lastCallAt = Date.now();
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
    return Date.now() - state.lastCallAt >= CANCEL_POLL_MS ? call('', Math.max(1, state.seq)) : null;
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
        const text = event.text.split(NUL).join('');
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

function endingOf(stopCode: StopCode | null, collected: Collected): Ending {
  // A turn that produced a result is never stored as `timeout` (ruling V1, CR-5): the limit fell
  // while the CLI was being given its time to exit, and what its result line said stands. The
  // owner's Stop and the runner's own shutdown still decide the code.
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

/** The first 20 calls of the turn, in call order; the rest are dropped and counted in the log. */
function storedCalls(calls: readonly StoredToolCall[], log: Log): readonly StoredToolCall[] {
  const kept = calls.slice(0, TOOL_CALLS_MAX);
  if (calls.length > kept.length) log(`tool calls: kept ${kept.length}, dropped ${calls.length - kept.length}`);
  return kept;
}

/** Close the request, trying again while the database fails; one log line says how it ended. */
async function finishWithRetry(rpc: WorkspaceRpc, args: FinishArgs, log: Log): Promise<void> {
  const end = await retryDbCall(() => rpc.finish(args), { what: 'finish', log });
  if (end.outcome === 'made') {
    log(`finished state=${args.state} error=${args.errorCode ?? '-'} ms=${args.durationMs} tools=${args.toolCalls.length}`);
  } else if (end.outcome === 'refused') {
    log(`finish refused, the request is already closed: ${messageOf(end.error)}`);
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

  /** The one `workspace_finish()` of the turn; `finishingSince()` is set while it is being made. */
  async function finish(args: FinishArgs): Promise<void> {
    finishing.since = Date.now();
    try {
      await finishWithRetry(deps.rpc, args, log);
    } finally {
      finishing.since = null;
    }
  }

  /**
   * Begin did not go through as far as the runner can tell, nothing ran, and the request may still
   * be claimed: every try failed, the runner's own stop ended the tries, or the function refused a
   * try that followed a failed one. It is closed under the runner's own stop when there is one, as
   * `cli_error` otherwise.
   */
  async function closeUnbegun(startedAt: number, end: UnbegunEnd): Promise<TurnOutcome> {
    const ending: Ending = { state: 'failed', errorCode: stopped.code ?? 'cli_error' };
    const why = end.outcome === 'refused' ? 'begin refused after a failed try, its reply may have been lost' : 'begin could not be made';
    log(`${why}, nothing ran; closing the request as ${ending.errorCode}: ${messageOf(end.error)}`);
    await finish({
      requestId: claim.requestId,
      state: ending.state,
      content: '',
      toolCalls: [],
      errorCode: ending.errorCode,
      costUsd: null,
      durationMs: Date.now() - startedAt,
      claudeSessionId: claim.claudeSessionId,
      model: null,
    });
    return ending;
  }

  async function run(): Promise<TurnOutcome> {
    const startedAt = Date.now();
    const tier = routeTier(claim.prompt, claim.priorTier);
    const route = TIER_ROUTES[tier];
    const begun = await retryDbCall(() => deps.rpc.begin(claim.requestId, tier, route.provider, route.model), {
      what: 'begin',
      log,
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

    const streamer = createStreamer(deps.rpc, claim.requestId, stopSwitch, log);
    const flushTimer = setInterval(() => streamer.tick(), STREAM_FLUSH_MS);
    // The limit counts from the start of the turn: the time begin's tries took is part of it, so a
    // turn still ends under the database's 10-minute sweep.
    const timeLimit = setTimeout(() => stopSwitch.stop('timeout'), Math.max(0, TURN_TIMEOUT_MS - (Date.now() - startedAt)));
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
    await finish({
      requestId: claim.requestId,
      state: ending.state,
      content: storedContent(collected.content, ending, deps.budgetCapHolds, log),
      toolCalls: storedCalls(collected.calls, log),
      errorCode: ending.errorCode,
      costUsd: collected.result?.costUsd ?? null,
      durationMs: Date.now() - startedAt,
      // `workspace_finish()` stamps what it is given, so a turn that reported no session (nothing
      // started) hands back the stored id: the conversation keeps its session for the next turn.
      claudeSessionId: collected.result?.claudeSessionId ?? claim.claudeSessionId,
      model: collected.result?.model ?? null,
    });
    return ending;
  }

  return { done: run(), stop: stopSwitch.stop, finishingSince: () => finishing.since };
}

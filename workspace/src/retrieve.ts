/**
 * Retrieval (brief 109, The stores, "How the runner searches"). The runner holds no key that can
 * read the store. It starts one child of the materials package (`batch.js`) with the same two
 * environment values the materials server gets; one JSON object goes in on stdin and one comes out
 * on stdout (`test/fixtures/contract24/batch-request.json` and `batch-answer.json`): per query its
 * state and its hits as data, per attachment its state and its cut text.
 *
 * The child has 10 s in all. A child that exits non-zero, writes something that is not the answer or
 * runs out of time gives retrieval `failed` and the turn goes on. After three failures in a row the
 * search is skipped for 5 minutes (the failure is stored for each question meanwhile), so a search
 * function that is down does not cost every question 10 s.
 *
 * Merge: round-robin by rank across the queries, one row per id, floor 0.78, keyword-only hits after
 * the ones with a similarity; at most 14 passages from materials and uploads together and at most 3
 * remembered items.
 *
 * Privacy: a log line holds counts, states, timings and the length of the child's stderr, never a
 * character of it, of a query or of a passage.
 */

import { spawn } from 'node:child_process';

import { MATERIALS_ENV, PATHS } from './config.js';
import { PASSAGES_MAX, MEMORY_ITEMS_MAX } from './context/budget.js';
import { QUERY_MAX_CHARS, type Plan } from './plan.js';
import { parseBatchAnswer, type AttachmentRead, type Hit, type QueryAnswer } from './store-types.js';

export const RETRIEVE_TIMEOUT_MS = 10_000;
export const FAILURES_BEFORE_PAUSE = 3;
export const PAUSE_MS = 5 * 60 * 1000;
export const SIMILARITY_FLOOR = 0.78;
/** Each kind's limit on one query (`workspace_search`'s `p_limit`). */
export const PER_QUERY_LIMIT = 10;
export const ATTACHMENT_MAX_CHARS = 96_000;
const BATCH_VERSION = 1;
const STDOUT_MAX_BYTES = 16 * 1024 * 1024;
const KILL_SIGNAL = 'SIGKILL';
const MS_PER_SECOND = 1000;

export interface AttachmentTarget {
  readonly kind: 'file' | 'upload';
  readonly id: number;
}

export interface RetrieveRequest {
  readonly plan: Plan;
  /** The request's scope; null for none. */
  readonly scope: readonly string[] | null;
  readonly attachments: readonly AttachmentTarget[];
  /** The owner's Stop or the turn's limit: the child is killed. */
  readonly signal: AbortSignal;
}

export type RetrieveState = 'ok' | 'failed' | 'refused' | 'paused';

export interface RetrieveResult {
  readonly state: RetrieveState;
  /** Material and upload passages, then remembered items: the merged hits, best first. */
  readonly hits: readonly Hit[];
  /** How many merged hits there are (passages and remembered items). */
  readonly found: number;
  readonly attachments: readonly AttachmentRead[];
  readonly ms: number;
}

export type Retriever = (request: RetrieveRequest) => Promise<RetrieveResult>;

/** What a finished child run shows: its code, its stdout, how many characters it wrote to stderr. */
export interface BatchRun {
  readonly exitCode: number | null;
  readonly stdout: string;
  readonly stderrChars: number;
  readonly timedOut: boolean;
  /** Set when the process could not be started at all. */
  readonly startError?: string;
}

export interface BatchSpec {
  readonly command: string;
  readonly args: readonly string[];
  readonly env: Readonly<Record<string, string>>;
}

export type RunBatch = (spec: BatchSpec, input: string, options: { timeoutMs: number; signal: AbortSignal }) => Promise<BatchRun>;

/** The real child: stdin written and closed, stdout kept, stderr only counted. */
export const runBatchChild: RunBatch = (spec, input, options) =>
  new Promise((resolve) => {
    let stdout = '';
    let stderrChars = 0;
    let timedOut = false;
    let settled = false;
    const finish = (run: BatchRun): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      options.signal.removeEventListener('abort', kill);
      resolve(run);
    };
    const child = spawn(spec.command, [...spec.args], { env: { ...spec.env }, stdio: ['pipe', 'pipe', 'pipe'], shell: false, windowsHide: true });
    const kill = (): void => {
      child.kill(KILL_SIGNAL);
    };
    const timer = setTimeout(() => {
      timedOut = true;
      kill();
    }, options.timeoutMs);
    if (options.signal.aborted) kill();
    else options.signal.addEventListener('abort', kill, { once: true });
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      if (stdout.length < STDOUT_MAX_BYTES) stdout += chunk;
    });
    child.stderr.on('data', (chunk: Buffer | string) => {
      stderrChars += typeof chunk === 'string' ? chunk.length : chunk.toString('utf8').length;
    });
    child.stdin.on('error', () => undefined);
    child.once('error', (error) => finish({ exitCode: null, stdout, stderrChars, timedOut, startError: error.name }));
    child.once('close', (exitCode) => finish({ exitCode, stdout, stderrChars, timedOut }));
    child.stdin.end(input);
  });

export interface RetrieverDeps {
  readonly run?: RunBatch;
  /** Milliseconds on a monotonic clock. */
  readonly now: () => number;
  readonly log: (line: string) => void;
  readonly spec?: BatchSpec;
}

const DEFAULT_SPEC: BatchSpec = Object.freeze({
  command: 'node',
  args: Object.freeze([PATHS.batchEntry]),
  env: Object.freeze({ ...MATERIALS_ENV, PATH: process.env.PATH ?? '/usr/local/bin:/usr/bin:/bin' }),
});

function requestBody(request: RetrieveRequest): string {
  return JSON.stringify({
    version: BATCH_VERSION,
    queries: request.plan.queries.map((query) => ({
      q: [...query.q].slice(0, QUERY_MAX_CHARS).join(''),
      kinds: query.kinds,
      courses: query.course === null ? request.scope : [query.course],
    })),
    limit: PER_QUERY_LIMIT,
    min_similarity: SIMILARITY_FLOOR,
    attachments: request.attachments.map((target) => ({ kind: target.kind, id: target.id, max_chars: ATTACHMENT_MAX_CHARS })),
  });
}

/**
 * The queries' hits as one list: round-robin by rank across the queries, one row per kind and id,
 *  then cut to 14
 * passages and 3 remembered items.
 *
 * The runner filters nothing by similarity: `workspace_search` applies the floor to its vector arm
 * itself and returns keyword-arm hits with their unit's best similarity, which may be under it. The
 * floor only orders: hits at or above it first, the others after, hits with no similarity last.
 */
export function mergeHits(queries: readonly QueryAnswer[]): Hit[] {
  const lists = queries.map((query) => query.hits);
  const depth = Math.max(0, ...lists.map((list) => list.length));
  const ranked: Hit[] = [];
  const seen = new Set<string>();
  for (let rank = 0; rank < depth; rank += 1) {
    for (const list of lists) {
      const hit = list[rank];
      if (hit === undefined) continue;
      const key = `${hit.kind}:${hit.unitId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      ranked.push(hit);
    }
  }
  const aboveFloor = (hit: Hit): boolean => hit.similarity !== null && hit.similarity >= SIMILARITY_FLOOR;
  const ordered = [
    ...ranked.filter(aboveFloor),
    ...ranked.filter((hit) => hit.similarity !== null && !aboveFloor(hit)),
    ...ranked.filter((hit) => hit.similarity === null),
  ];
  const passages = ordered.filter((hit) => hit.kind !== 'memory').slice(0, PASSAGES_MAX);
  const memory = ordered.filter((hit) => hit.kind === 'memory').slice(0, MEMORY_ITEMS_MAX);
  return [...passages, ...memory];
}

const failedResult = (state: RetrieveState, started: number, now: () => number): RetrieveResult => ({
  state,
  hits: [],
  found: 0,
  attachments: [],
  ms: Math.round(now() - started),
});

export function createRetriever(deps: RetrieverDeps): Retriever {
  const run = deps.run ?? runBatchChild;
  const spec = deps.spec ?? DEFAULT_SPEC;
  const breaker = { failures: 0, pausedUntil: 0 };

  const fail = (): void => {
    breaker.failures += 1;
    if (breaker.failures >= FAILURES_BEFORE_PAUSE) {
      breaker.pausedUntil = deps.now() + PAUSE_MS;
      breaker.failures = 0;
      deps.log(`retrieve: ${FAILURES_BEFORE_PAUSE} failures in a row, the search is paused for ${PAUSE_MS / MS_PER_SECOND} s`);
    }
  };

  return async function retrieve(request) {
    const started = deps.now();
    if (started < breaker.pausedUntil) {
      deps.log(`retrieve: skipped, the search is paused for ${Math.ceil((breaker.pausedUntil - started) / MS_PER_SECOND)} more s`);
      return failedResult('paused', started, deps.now);
    }
    let outcome: BatchRun;
    try {
      outcome = await run(spec, requestBody(request), { timeoutMs: RETRIEVE_TIMEOUT_MS, signal: request.signal });
    } catch {
      fail();
      deps.log('retrieve: failed class=start');
      return failedResult('failed', started, deps.now);
    }
    const ms = Math.round(deps.now() - started);
    if (request.signal.aborted) {
      deps.log(`retrieve: stopped after ${ms} ms`);
      return failedResult('failed', started, deps.now);
    }
    if (outcome.exitCode !== 0 || outcome.timedOut || outcome.startError !== undefined) {
      fail();
      const why = outcome.timedOut ? 'timeout' : outcome.startError !== undefined ? 'start' : 'exit';
      deps.log(`retrieve: failed class=${why} exit=${outcome.exitCode ?? 'none'} stderr_chars=${outcome.stderrChars} ms=${ms}`);
      return failedResult('failed', started, deps.now);
    }
    const answer = parseBatchAnswer(outcome.stdout);
    if (answer === null) {
      fail();
      deps.log(`retrieve: failed class=answer stdout_chars=${outcome.stdout.length} stderr_chars=${outcome.stderrChars} ms=${ms}`);
      return failedResult('failed', started, deps.now);
    }
    const total = answer.queries.length;
    const refusedAll = total > 0 && answer.queries.every((query) => query.state === 'refused');
    const failedQueries = answer.queries.filter((query) => query.state === 'failed').length;
    const downAll = total > 0 && failedQueries === total;
    // A refusal is the function turning the call down, not a store that is down: it counts no failure.
    if (downAll) fail();
    else breaker.failures = 0;
    const hits = mergeHits(answer.queries);
    const state: RetrieveState = refusedAll ? 'refused' : downAll ? 'failed' : 'ok';
    deps.log(`retrieve: ${state} queries=${total} failed_queries=${failedQueries} found=${hits.length} attachments=${answer.attachments.length} ms=${ms}`);
    return { state, hits, found: hits.length, attachments: answer.attachments, ms };
  };
}

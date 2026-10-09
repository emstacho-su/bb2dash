/**
 * The embed call: `ingest/embed_corpus.mjs`'s `runEmbedLoop`, unedited, against `workspace-embed`
 * with the document's id added to every body (step 7). The loop's contract holds: `post` never
 * throws and returns `{status, body}`; a transport failure is a retryable 503.
 *
 * One try runs until every part of the document is stored (round 3): the loop's own 60-call budget
 * stops at 180 parts, and a document may hold well over a thousand. So the call budget here is a
 * backstop only, and two rules stop a try that cannot finish:
 *
 *   no progress  an answer that stored nothing, or whose `remaining_parts` did not go down, while
 *                parts are left: the failed try it is
 *   timed out    the document's time bound (a deadline inside the claim's lease) has passed; the
 *                parts already stored stay (the units are not put again), so the next claim, which
 *                finds the document in `text_ready`, continues from them
 */

import { runEmbedLoop } from '../../ingest/embed_corpus.mjs';
import { EMBED_CALL_BUDGET, DOCUMENT_TIME_BUDGET_MS, EMBED_FUNCTION_URL, EMBED_LIMIT, EMBED_MAX_PARTS } from './constants.js';

export interface EmbedPostResult {
  status: number;
  body: unknown;
}

const HTTP_UNAVAILABLE = 503;
const HTTP_OK = 200;
/** Answered to the loop when this module stops a try itself; the loop treats it as final. */
const HTTP_REQUEST_TIMEOUT = 408;
const HTTP_UNPROCESSABLE = 422;

/** runEmbedLoop as this file calls it (its JS defaults type it too narrowly to call with post). */
type EmbedLoopFn = (o: {
  post: (body: object) => Promise<EmbedPostResult>;
  limit?: number;
  maxParts?: number;
  budget?: number;
  sleep?: (ms: number) => Promise<void>;
  log?: (line: string) => void;
}) => Promise<{ exitCode: number; calls: number; error?: string }>;

export interface EmbedOptions {
  readonly documentId: number;
  /** The legacy anon JWT: `workspace-embed` has `verify_jwt` on. */
  readonly jwt: string;
  readonly fetch: typeof fetch;
  readonly sleep?: (ms: number) => Promise<void>;
  /** The most calls one try may make; the default is a backstop far above any document. */
  readonly budget?: number;
  /** When this try must stop, on `now`'s clock. Default: DOCUMENT_TIME_BUDGET_MS from now. */
  readonly deadlineMs?: number;
  readonly now?: () => number;
}

/** One POST to the edge function, with the document's id in the body. Never throws. */
export function makeEmbedPost(o: Pick<EmbedOptions, 'documentId' | 'jwt' | 'fetch'>) {
  return async (body: object): Promise<EmbedPostResult> => {
    let response: Response;
    try {
      response = await o.fetch(EMBED_FUNCTION_URL, {
        method: 'POST',
        headers: { apikey: o.jwt, Authorization: `Bearer ${o.jwt}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, document_id: o.documentId }),
      });
    } catch {
      return { status: HTTP_UNAVAILABLE, body: { error: 'request failed' } };
    }
    try {
      return { status: response.status, body: JSON.parse(await response.text()) };
    } catch {
      return { status: response.status, body: { error: 'unreadable answer' } };
    }
  };
}

export type EmbedStop = 'no_progress' | 'timed_out' | 'error' | null;

export interface EmbedResult {
  /** 0 when nothing is left to embed. */
  readonly exitCode: number;
  readonly calls: number;
  /** Why a try that did not finish stopped; null when it finished. */
  readonly stop: EmbedStop;
  /** True when at least one answer stored a part in this try. */
  readonly progressed: boolean;
  /** Parts left at the last answer, or null when none was read. */
  readonly remainingParts: number | null;
}

const countOf = (value: unknown): number => {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
};

/** Embed every part of one document, or stop for one of the reasons above. No text is returned. */
export async function embedDocument(o: EmbedOptions): Promise<EmbedResult> {
  const loop = runEmbedLoop as unknown as EmbedLoopFn;
  const now = o.now ?? Date.now;
  const deadline = o.deadlineMs ?? now() + DOCUMENT_TIME_BUDGET_MS;
  const send = makeEmbedPost(o);
  let stop: EmbedStop = null;
  let progressed = false;
  let remaining: number | null = null;

  const post = async (body: object): Promise<EmbedPostResult> => {
    if (now() >= deadline) {
      stop = 'timed_out';
      return { status: HTTP_REQUEST_TIMEOUT, body: { error: 'time bound' } };
    }
    const answer = await send(body);
    if (answer.status !== HTTP_OK) return answer;
    const stored = countOf((answer.body as { inserted_rows?: unknown } | null)?.inserted_rows);
    const left = countOf((answer.body as { remaining_parts?: unknown } | null)?.remaining_parts);
    const failed = (answer.body as { failed?: unknown } | null)?.failed;
    if (stored > 0) progressed = true;
    const stuck = left > 0 && (stored === 0 || (remaining !== null && left >= remaining));
    remaining = left;
    if (stuck && !(Array.isArray(failed) && failed.length > 0)) {
      stop = 'no_progress';
      return { status: HTTP_UNPROCESSABLE, body: { error: 'no progress' } };
    }
    return answer;
  };

  const result = await loop({
    post,
    limit: EMBED_LIMIT,
    maxParts: EMBED_MAX_PARTS,
    budget: o.budget ?? EMBED_CALL_BUDGET,
    ...(o.sleep ? { sleep: o.sleep } : {}),
  });
  const ended: EmbedStop = result.exitCode === 0 ? null : (stop ?? 'error');
  return { exitCode: result.exitCode, calls: result.calls, stop: ended, progressed, remainingParts: remaining };
}

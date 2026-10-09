/**
 * The embed call: `ingest/embed_corpus.mjs`'s `runEmbedLoop`, unedited, against `workspace-embed`
 * with the document's id added to every body (step 7). The loop's contract holds: `post` never
 * throws and returns `{status, body}`; a transport failure is a retryable 503.
 */

import { runEmbedLoop } from '../../ingest/embed_corpus.mjs';
import { EMBED_FUNCTION_URL, EMBED_LIMIT, EMBED_MAX_PARTS } from './constants.js';

export interface EmbedPostResult {
  status: number;
  body: unknown;
}

const HTTP_UNAVAILABLE = 503;

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
  readonly budget?: number;
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

/** Embed every unit of one document; `exitCode` 0 when nothing is left, 1 otherwise. No text is returned. */
export async function embedDocument(o: EmbedOptions): Promise<{ exitCode: number; calls: number }> {
  const loop = runEmbedLoop as unknown as EmbedLoopFn;
  const result = await loop({
    post: makeEmbedPost(o),
    limit: EMBED_LIMIT,
    maxParts: EMBED_MAX_PARTS,
    ...(o.sleep ? { sleep: o.sleep } : {}),
    ...(o.budget !== undefined ? { budget: o.budget } : {}),
  });
  return { exitCode: result.exitCode, calls: result.calls };
}

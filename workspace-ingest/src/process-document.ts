/**
 * One claimed document, start to end (brief 109, "Uploads and extraction", steps 2 to 8).
 *
 *   read   check the link, download, check the hash and the first bytes, read the text (a text type
 *          here, a parsed type through the exchange folder), drop empty units, put the units
 *   embed  run the embed loop for the document, then finish
 *
 * A remembered item, and an upload whose units are already put, start at `embed`. Every failure is
 * one of the ten error codes and one outcome: `failed` for what trying again cannot change,
 * `retry` for what it might (the database counts the three tries). Logs hold ids, states, codes and
 * timings only: never a file's name or text, an error's message, or the extractor's stderr.
 */

import { bytesLookValid, sha256Hex } from '../../ingest/pull_files.mjs';
import { MAX_UPLOAD_BYTES, PARSED_MIME_EXTENSIONS, TEXT_MIMES, type ErrorCode } from './constants.js';
import type { FinishOutcome, IngestClaim, IngestRpc } from './db.js';
import { handOver } from './exchange.js';
import { downloadBytes, isTrustedLink } from './link.js';
import { prepareUnits, textFileUnits, type Checked, type Unit } from './units.js';

export interface ProcessDeps {
  readonly rpc: IngestRpc;
  readonly fetch: typeof fetch;
  /** The embed loop for one document: exit code 0 when nothing is left to embed. */
  readonly embed: (documentId: number) => Promise<{ exitCode: number }>;
  readonly exchangeDir: string;
  readonly now: () => number;
  readonly sleep: (ms: number) => Promise<void>;
  readonly log: (line: string) => void;
}

/** How a document ended before it was indexed. */
interface End {
  readonly outcome: 'failed' | 'retry';
  readonly code: ErrorCode;
}

const failed = (code: ErrorCode): End => ({ outcome: 'failed', code });
const retry = (code: ErrorCode): End => ({ outcome: 'retry', code });

/** A name for an error that is safe to log: a SQLSTATE or the error's class, never its message. */
export function describeError(error: unknown): string {
  const code = (error as { code?: unknown } | null | undefined)?.code;
  if (typeof code === 'string' && /^[0-9A-Za-z_]{1,16}$/.test(code)) return code;
  return error instanceof Error ? error.name : 'unknown';
}

/** The type's reader: a parsed type with its extension, a text type, or neither. */
function readerFor(mime: string | null): { parsed: string } | { text: true } | null {
  if (mime === null) return null;
  const extension = PARSED_MIME_EXTENSIONS[mime];
  if (extension !== undefined) return { parsed: extension };
  return TEXT_MIMES.has(mime) ? { text: true } : null;
}

/** Steps 2 and 3: a link that is missing or past its time is `link_expired`; one that is not ours is refused. */
function checkLink(claim: IngestClaim, now: number): End | null {
  if (claim.signed_url === null) return failed('link_expired');
  const expires = claim.signed_url_expires_at === null ? Number.NaN : Date.parse(claim.signed_url_expires_at);
  if (Number.isNaN(expires) || expires <= now) return failed('link_expired');
  return claim.sha256 !== null && isTrustedLink(claim.signed_url, claim.sha256) ? null : failed('download_failed');
}

async function textOf(
  bytes: Buffer,
  claim: IngestClaim,
  reader: { parsed: string } | { text: true },
  deps: ProcessDeps,
): Promise<Checked<Unit[]> | End> {
  if ('text' in reader) return textFileUnits(bytes);
  if (!bytesLookValid(bytes, claim.mime ?? '')) return failed('bad_bytes');
  const answer = await handOver(
    deps.exchangeDir,
    { documentId: claim.document_id, extension: reader.parsed, bytes },
    { now: deps.now, sleep: deps.sleep },
  );
  if (!answer.ok) return answer.code === 'extract_timeout' ? retry('extract_timeout') : retry('extract_failed');
  return { ok: true, value: answer.units };
}

const isEnd = (r: Checked<Unit[]> | End): r is End => 'outcome' in r;

/** Steps 2 to 6, then the put. Null means the units are in the store. */
async function readStage(claim: IngestClaim, deps: ProcessDeps): Promise<End | null> {
  const reader = readerFor(claim.mime);
  if (reader === null) return failed('bad_type');
  if (claim.byte_size !== null && claim.byte_size > MAX_UPLOAD_BYTES) return failed('too_large');
  if (claim.sha256 === null) return failed('bad_bytes');
  const linkEnd = checkLink(claim, deps.now());
  if (linkEnd !== null) return linkEnd;

  const download = await downloadBytes(deps.fetch, claim.signed_url ?? '');
  if (!download.ok) return download.reason === 'too_large' ? failed('too_large') : retry('download_failed');
  if (sha256Hex(download.bytes) !== claim.sha256) return failed('bad_bytes');

  const read = await textOf(download.bytes, claim, reader, deps);
  if (isEnd(read)) return read;
  if (!read.ok) return read.code === 'extract_timeout' ? retry(read.code) : failed(read.code);
  const prepared = prepareUnits(read.value);
  if (!prepared.ok) return failed(prepared.code);

  try {
    await deps.rpc.putText(claim.document_id, prepared.value);
  } catch (error) {
    deps.log(`ingest: document ${claim.document_id} put refused (${describeError(error)})`);
    return retry('extract_failed');
  }
  return null;
}

/** Step 7. Null means every unit is embedded. */
async function embedStage(claim: IngestClaim, deps: ProcessDeps): Promise<End | null> {
  try {
    const result = await deps.embed(claim.document_id);
    return result.exitCode === 0 ? null : retry('embed_failed');
  } catch (error) {
    deps.log(`ingest: document ${claim.document_id} embed threw (${describeError(error)})`);
    return retry('embed_failed');
  }
}

async function finishWith(claim: IngestClaim, end: End | null, deps: ProcessDeps): Promise<{ state: string; end: End | null }> {
  if (end === null) {
    try {
      return { state: await deps.rpc.finish(claim.document_id, 'indexed', null), end: null };
    } catch (error) {
      // The function accepts `indexed` only when every unit has its vector; a refusal is a failed embed.
      deps.log(`ingest: document ${claim.document_id} indexed refused (${describeError(error)})`);
      const again = retry('embed_failed');
      return { state: await deps.rpc.finish(claim.document_id, again.outcome, again.code), end: again };
    }
  }
  const outcome: FinishOutcome = end.outcome;
  return { state: await deps.rpc.finish(claim.document_id, outcome, end.code), end };
}

/** Process one claim; resolves with the row's state after `workspace_ingest_finish`. */
export async function processDocument(claim: IngestClaim, deps: ProcessDeps): Promise<string> {
  const started = deps.now();
  let end: End | null = null;
  if (claim.step === 'read' && claim.kind === 'upload') end = await readStage(claim, deps);
  if (end === null) end = await embedStage(claim, deps);
  const done = await finishWith(claim, end, deps);
  const label = done.end === null ? done.state : `${done.state} ${done.end.code}`;
  deps.log(`ingest: document ${claim.document_id} ${label} in ${deps.now() - started} ms (try ${claim.attempts + 1})`);
  return done.state;
}

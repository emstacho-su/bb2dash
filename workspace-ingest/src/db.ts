/**
 * The worker's database side: the four `workspace_ingest_runner` functions of migration 193 as typed
 * calls over one query function. The connection is Phase 21's (`workspace/src/db.ts`): built from
 * the DSN's parts and verified against the pinned CA. No statement here touches a table.
 */

import type { QueryFn } from '../../workspace/src/db.js';
import type { ErrorCode } from './constants.js';
import type { Unit } from './units.js';

export type DocumentKind = 'upload' | 'memory';
export type ClaimStep = 'read' | 'embed';
export type FinishOutcome = 'indexed' | 'failed' | 'retry';

/** One document handed out by `workspace_ingest_claim` (ingest-claim.json). */
export interface IngestClaim {
  document_id: number;
  kind: DocumentKind;
  step: ClaimStep;
  mime: string | null;
  byte_size: number | null;
  sha256: string | null;
  signed_url: string | null;
  signed_url_expires_at: string | null;
  attempts: number;
}

export interface IngestRpc {
  /** The next document, or null when nothing is handed out (or this runner still holds one). */
  claim(): Promise<IngestClaim | null>;
  /** Replaces the document's units; the count stored. */
  putText(documentId: number, units: readonly Unit[]): Promise<number>;
  /** The row's state after the call. */
  finish(documentId: number, outcome: FinishOutcome, code: ErrorCode | null): Promise<string>;
  heartbeat(): Promise<void>;
}

const nullableString = (v: unknown): v is string | null => v === null || typeof v === 'string';
const nullableNumber = (v: unknown): v is number | null => v === null || typeof v === 'number';

/** The claim's jsonb as a typed row; anything else is refused with a message naming the function. */
export function parseClaim(value: unknown): IngestClaim {
  const row = (typeof value === 'object' && value !== null ? value : {}) as Record<string, unknown>;
  const id = row.document_id;
  const refuse = (): never => {
    throw new Error('workspace_ingest_claim: the row is not the agreed shape');
  };
  if (typeof id !== 'number' || !Number.isSafeInteger(id) || id <= 0) return refuse();
  if (row.kind !== 'upload' && row.kind !== 'memory') return refuse();
  if (row.step !== 'read' && row.step !== 'embed') return refuse();
  if (typeof row.attempts !== 'number') return refuse();
  if (!nullableString(row.mime) || !nullableString(row.sha256) || !nullableString(row.signed_url)) return refuse();
  if (!nullableString(row.signed_url_expires_at) || !nullableNumber(row.byte_size)) return refuse();
  return {
    document_id: id,
    kind: row.kind,
    step: row.step,
    mime: row.mime,
    byte_size: row.byte_size,
    sha256: row.sha256,
    signed_url: row.signed_url,
    signed_url_expires_at: row.signed_url_expires_at,
    attempts: row.attempts,
  };
}

export function createIngestRpc(query: QueryFn, runner: string): IngestRpc {
  return {
    async claim() {
      const { rows } = await query('select public.workspace_ingest_claim($1::text) as doc', [runner]);
      const doc = rows[0]?.doc;
      return doc === null || doc === undefined ? null : parseClaim(doc);
    },
    async putText(documentId, units) {
      const { rows } = await query('select public.workspace_ingest_put_text($1::text, $2::bigint, $3::jsonb) as n', [
        runner,
        documentId,
        JSON.stringify(units),
      ]);
      return Number(rows[0]?.n ?? 0);
    },
    async finish(documentId, outcome, code) {
      const { rows } = await query('select public.workspace_ingest_finish($1::text, $2::bigint, $3::text, $4::text) as state', [
        runner,
        documentId,
        outcome,
        code,
      ]);
      return String(rows[0]?.state ?? '');
    },
    async heartbeat() {
      await query('select public.workspace_ingest_heartbeat($1::text)', [runner]);
    },
  };
}

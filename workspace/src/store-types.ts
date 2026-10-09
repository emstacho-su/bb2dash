/**
 * The shapes the batch child hands back (brief 109, How the runner searches; frozen in
 * `test/fixtures/contract24/batch-request.json` and `batch-answer.json`), and the checks that turn
 * its stdout into them. The child's output is data from another process: every field is read by
 * type and anything else is dropped, so a malformed answer cannot reach a prompt as a surprise.
 */

export const HIT_KINDS = ['material', 'upload', 'memory'] as const;
export type HitKind = (typeof HIT_KINDS)[number];

export const isHitKind = (value: unknown): value is HitKind => typeof value === 'string' && (HIT_KINDS as readonly string[]).includes(value);

/** One row of `workspace_search`, as the batch child hands it on. */
export interface Hit {
  readonly kind: HitKind;
  readonly unitId: number;
  readonly fileId: number | null;
  readonly documentId: number | null;
  readonly courseId: string | null;
  readonly title: string;
  readonly unitKind: string | null;
  readonly unitNo: number | null;
  readonly partNo: number | null;
  readonly similarity: number | null;
  readonly score: number | null;
  readonly passage: string;
  readonly hasNotes: boolean;
  /**
   * When the remembered item was written, if the row says so. The frozen row does not carry it (a
   * point the verification report raises); a prompt then says the date is not recorded.
   */
  readonly writtenAt: string | null;
}

export const QUERY_STATES = ['ok', 'refused', 'failed'] as const;
export type QueryState = (typeof QUERY_STATES)[number];

export interface QueryAnswer {
  readonly state: QueryState;
  readonly hits: readonly Hit[];
}

export const ATTACHMENT_STATES = ['read', 'cut', 'no_text', 'not_ready', 'failed', 'missing'] as const;
export type AttachmentState = (typeof ATTACHMENT_STATES)[number];

export interface AttachmentUnit {
  readonly unitId: number;
  readonly unitKind: string;
  readonly unitNo: number;
  readonly text: string;
}

export interface AttachmentRead {
  readonly kind: 'file' | 'upload';
  readonly id: number;
  readonly state: AttachmentState;
  readonly title: string | null;
  readonly courseId: string | null;
  readonly unitsTotal: number;
  readonly unitsRead: number;
  readonly units: readonly AttachmentUnit[];
  readonly leftOutUnitIds: readonly number[];
}

export interface BatchAnswer {
  readonly queries: readonly QueryAnswer[];
  readonly attachments: readonly AttachmentRead[];
}

type Json = Record<string, unknown>;

const isRecord = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value);
const int = (value: unknown): number | null => (typeof value === 'number' && Number.isInteger(value) ? value : null);
const num = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);
const str = (value: unknown): string | null => (typeof value === 'string' ? value : null);
const list = (value: unknown): Json[] => (Array.isArray(value) ? value.filter(isRecord) : []);

function hitOf(row: Json): Hit | null {
  const unitId = int(row.unit_id);
  if (!isHitKind(row.kind) || unitId === null) return null;
  return {
    kind: row.kind,
    unitId,
    fileId: int(row.file_id),
    documentId: int(row.document_id),
    courseId: str(row.course_id),
    title: str(row.title) ?? '',
    unitKind: str(row.unit_kind),
    unitNo: int(row.unit_no),
    partNo: int(row.part_no),
    similarity: num(row.similarity),
    score: num(row.score),
    passage: str(row.passage) ?? '',
    hasNotes: row.has_notes === true,
    writtenAt: str(row.written_at),
  };
}

/** Rows of `workspace_search` in the shape of `search-row.json`; a row that is not one is dropped. */
export function parseHits(rows: unknown): Hit[] {
  return list(rows).flatMap((row) => {
    const hit = hitOf(row);
    return hit === null ? [] : [hit];
  });
}

function unitOf(row: Json): AttachmentUnit | null {
  const unitId = int(row.unit_id);
  const unitNo = int(row.unit_no);
  const text = str(row.text);
  if (unitId === null || unitNo === null || text === null) return null;
  return { unitId, unitKind: str(row.unit_kind) ?? 'unit', unitNo, text };
}

function attachmentOf(row: Json): AttachmentRead | null {
  const id = int(row.id);
  const kind = row.kind === 'file' || row.kind === 'upload' ? row.kind : null;
  const state = (ATTACHMENT_STATES as readonly unknown[]).includes(row.state) ? (row.state as AttachmentState) : null;
  if (id === null || kind === null || state === null) return null;
  return {
    kind,
    id,
    state,
    title: str(row.title),
    courseId: str(row.course_id),
    unitsTotal: int(row.units_total) ?? 0,
    unitsRead: int(row.units_read) ?? 0,
    units: list(row.units).flatMap((unit) => {
      const parsed = unitOf(unit);
      return parsed === null ? [] : [parsed];
    }),
    leftOutUnitIds: Array.isArray(row.left_out_unit_ids) ? row.left_out_unit_ids.flatMap((value) => (int(value) === null ? [] : [value as number])) : [],
  };
}

function queryOf(row: Json): QueryAnswer {
  const state = (QUERY_STATES as readonly unknown[]).includes(row.state) ? (row.state as QueryState) : 'failed';
  return { state, hits: state === 'ok' ? parseHits(row.hits) : [] };
}

/**
 * The child's stdout as a `BatchAnswer`; null when it is not one JSON object with `queries` and
 * `attachments` arrays (the answer is then a failed search, never a guess).
 */
export function parseBatchAnswer(stdout: string): BatchAnswer | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return null;
  }
  if (!isRecord(parsed) || !Array.isArray(parsed.queries) || !Array.isArray(parsed.attachments)) return null;
  return {
    queries: list(parsed.queries).map(queryOf),
    attachments: list(parsed.attachments).flatMap((row) => {
      const parsedRow = attachmentOf(row);
      return parsedRow === null ? [] : [parsedRow];
    }),
  };
}

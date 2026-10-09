// bb2dash :: _shared — the pure steps of `workspace-embed`.
//
// Everything here is a pure function, so it runs under Node in `chunk_test.ts`
// (Deno is not on the dev machine). `workspace-embed/index.ts` does the I/O and
// calls these:
//
//   parseEmbedBody  -> the body, with `document_id` required
//   pickUnits       -> the units of THAT document, none when it is failed/deleting
//   planEmbedWork   -> which parts to embed in this call (embed-corpus's budgets)
//   buildEmbeddingRow, settleUnit -> the write step: the row that is inserted, and
//                      what each insert's outcome means for the unit
//   buildAnswer     -> the answer, the keys of contract24/embed.json

import { chunk, codePoints, type Part } from "./chunk.ts";

/** The name `embed-corpus` writes (`embed-corpus/index.ts`, MODEL). */
export const EMBED_MODEL = "gte-small";

/** A document in one of these states is never touched. */
export const EXCLUDED_STATES: readonly string[] = ["failed", "deleting"];

/** Postgres unique violation: a concurrent run stored the part already. */
export const UNIQUE_VIOLATION = "23505";

export const EMPTY_TEXT_ERROR = "unit has empty text";

const DEFAULT_LIMIT = 40;
const LIMIT_RANGE = [1, 1000] as const;
const DEFAULT_MAX_PARTS = 6;
const MAX_PARTS_RANGE = [1, 500] as const;

export type DocumentRow = { id: number; kind: string; title: string | null; course_id: string | null; state: string };
export type UnitRow = { id: number; document_id: number; text: string; embedded_at: string | null };
export type FailedUnit = { text_id: number; error: string };

export type EmbedBody = { documentId: number; limit: number; maxParts: number; dryRun: boolean };
export type ParsedBody = { ok: true; body: EmbedBody } | { ok: false; error: string };

function clampNumber(value: unknown, fallback: number, [lo, hi]: readonly [number, number]): number {
  const n = Number(value);
  return value == null || !Number.isFinite(n) ? fallback : Math.max(lo, Math.min(hi, n));
}

/** `document_id` is required: a positive whole number. `limit`, `max_parts` and `dry_run` are embed-corpus's. */
export function parseEmbedBody(raw: unknown): ParsedBody {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: "request body must be a JSON object" };
  }
  const body = raw as Record<string, unknown>;
  const id = body.document_id;
  if (typeof id !== "number" || !Number.isSafeInteger(id) || id < 1) {
    return { ok: false, error: "missing required field: document_id (positive whole number)" };
  }
  return {
    ok: true,
    body: {
      documentId: id,
      limit: clampNumber(body.limit, DEFAULT_LIMIT, LIMIT_RANGE),
      maxParts: clampNumber(body.max_parts, DEFAULT_MAX_PARTS, MAX_PARTS_RANGE),
      dryRun: body.dry_run === true,
    },
  };
}

/**
 * The units this call may touch: those of `documentId` and no other, and none at
 * all when the document is missing, is another row, or is in `failed`/`deleting`.
 */
export function pickUnits(documentId: number, document: DocumentRow | null, units: readonly UnitRow[]): UnitRow[] {
  if (!document || document.id !== documentId || EXCLUDED_STATES.includes(document.state)) return [];
  return units.filter((u) => u.document_id === documentId);
}

/** The context header put before every part, the workspace's counterpart of embed-corpus's. */
export function embeddingHeader(document: Pick<DocumentRow, "kind" | "title" | "course_id">): string {
  return `${document.course_id ?? ""} ${document.kind} — ${document.title ?? ""}: `;
}

export type Job = { unit: UnitRow; allParts: Part[]; have: Set<number>; parts: Part[]; missingTotal: number };
export type Plan = {
  jobs: Job[];
  /** Units whose every part is stored but which carry no `embedded_at`. */
  markOnly: number[];
  scanFailed: FailedUnit[];
  missingPartsBefore: number;
};

/** Which parts to embed now. `done` maps a unit id to the part numbers already stored under `gte-small`. */
export function planEmbedWork(input: {
  units: readonly UnitRow[];
  done: ReadonlyMap<number, ReadonlySet<number>>;
  limit: number;
  maxParts: number;
}): Plan {
  const jobs: Job[] = [];
  const markOnly: number[] = [];
  const scanFailed: FailedUnit[] = [];
  let missingPartsBefore = 0;
  let jobParts = 0;

  for (const unit of input.units) {
    const allParts = chunk(codePoints(unit.text ?? ""));
    if (allParts.length === 0) {
      scanFailed.push({ text_id: unit.id, error: EMPTY_TEXT_ERROR });
      continue;
    }
    const have = new Set(input.done.get(unit.id) ?? []);
    const missing = allParts.filter((p) => !have.has(p.part_no));
    if (missing.length === 0) {
      if (unit.embedded_at == null) markOnly.push(unit.id);
      continue;
    }
    missingPartsBefore += missing.length;
    const take = missing.slice(0, Math.max(0, input.maxParts - jobParts));
    if (take.length > 0 && jobs.length < input.limit) {
      jobs.push({ unit, allParts, have, parts: take, missingTotal: missing.length });
      jobParts += take.length;
    }
  }
  return { jobs, markOnly, scanFailed, missingPartsBefore };
}

export type EmbeddingRow = {
  text_id: number;
  part_no: number;
  part_range: string;
  model: string;
  embedding: string;
};

/** The row inserted for one part. Every row names the model `gte-small`. */
export function buildEmbeddingRow(textId: number, part: Part, vector: readonly number[]): EmbeddingRow {
  return {
    text_id: textId,
    part_no: part.part_no,
    part_range: `[${part.start},${part.end})`,
    model: EMBED_MODEL,
    embedding: JSON.stringify(vector),
  };
}

export type PartOutcome = { part_no: number; error: { code?: string | null; message: string } | null };
export type Settled = {
  inserted: number;
  duplicates: number;
  /** Set `embedded_at` on the unit. */
  markEmbedded: boolean;
  error: string | null;
};

/**
 * What a unit's insert outcomes mean. A 23505 is stored (a concurrent run got there
 * first), any other error fails the unit. The unit is marked embedded when it has
 * at least one part and none is missing, whether or not this call stored one; a unit
 * whose text gives no part is failed and never marked.
 */
export function settleUnit(input: {
  allParts: readonly Part[];
  have: ReadonlySet<number>;
  attempted: readonly PartOutcome[];
}): Settled {
  if (input.allParts.length === 0) {
    return { inserted: 0, duplicates: 0, markEmbedded: false, error: EMPTY_TEXT_ERROR };
  }
  const stored = new Set(input.have);
  let inserted = 0;
  let duplicates = 0;
  let error: string | null = null;
  for (const outcome of input.attempted) {
    if (outcome.error === null) {
      inserted++;
      stored.add(outcome.part_no);
    } else if (outcome.error.code === UNIQUE_VIOLATION) {
      duplicates++;
      stored.add(outcome.part_no);
    } else if (error === null) {
      error = `part ${outcome.part_no}: ${outcome.error.message}`;
    }
  }
  const missing = input.allParts.some((p) => !stored.has(p.part_no));
  return { inserted, duplicates, markEmbedded: error === null && !missing, error };
}

/** The answer: `runEmbedLoop`'s protocol plus `document_id` (contract24/embed.json). */
export function buildAnswer(input: {
  documentId: number;
  dryRun: boolean;
  limit: number;
  maxParts: number;
  processedUnits: number;
  unitsCompleted: number;
  insertedRows: number;
  /** Inserted plus duplicates: parts that stand after this call. */
  storedRows: number;
  failed: readonly FailedUnit[];
  missingPartsBefore: number;
}) {
  return {
    document_id: input.documentId,
    model: EMBED_MODEL,
    dry_run: input.dryRun,
    limit: input.limit,
    max_parts: input.maxParts,
    processed_units: input.processedUnits,
    units_completed: input.unitsCompleted,
    inserted_rows: input.insertedRows,
    failed: [...input.failed],
    remaining_parts: Math.max(0, input.missingPartsBefore - input.storedRows),
    missing_parts_before: input.missingPartsBefore,
  };
}

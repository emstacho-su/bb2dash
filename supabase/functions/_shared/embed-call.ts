// bb2dash :: _shared — one `workspace-embed` call, free of Deno and of supabase-js.
//
// The I/O is behind `EmbedStore`, so Node can run the whole call against a fake.
//
// A CALL IS PROPORTIONAL TO THE WORK LEFT. It reads the text of the document's UNMARKED units
// only (`embedded_at` is null: a part is missing, or the unit has none), in id order, and no more
// of them than the call can use: min(limit, max_parts), since each embedded unit needs at least
// one part of the budget. Stored part numbers are read for those units only. The old call read
// every unit of the document and re-chunked it on every call.
//
// THE TWO COUNTS stay about the WHOLE document, exactly where it matters:
//   missing_parts_before = the exact missing parts of the units read
//                          + 1 for each unmarked unit not read (a unit that is unmarked is
//                          missing at least one part, so this is a lower bound, one cheap
//                          head count away, and exact once every unmarked unit fits the window)
//   remaining_parts      = max(0, missing_parts_before - parts stored by this call)
// Zero is exact: remaining_parts is 0 iff no unmarked unit is out of the window and every part of
// the window's units is stored -- and a unit whose parts are all stored is marked in the same
// call. So `runEmbedLoop` (which stops at remaining_parts 0) stops exactly when the last part is
// stored, never earlier. Between calls the figure is a lower bound that only falls.
// `--check`/dry_run reports the same lower bound: it is above 0 exactly when work is left.

import { codePoints } from "./chunk.ts";
import {
  buildAnswer,
  buildEmbeddingRow,
  EMBED_MODEL,
  type DocumentRow,
  type EmbedBody,
  type EmbeddingRow,
  embeddingHeader,
  type FailedUnit,
  type PartOutcome,
  pickUnits,
  planEmbedWork,
  settleUnit,
  type UnitRow,
} from "./embed-plan.ts";

export const EMBEDDING_DIMENSIONS = 384;

export interface EmbedStore {
  readDocument(id: number): Promise<DocumentRow | null>;
  /** Units of the document with `embedded_at` null. A count, no text. */
  countUnmarked(documentId: number): Promise<number>;
  /** At most `max` units of the document with `embedded_at` null, id ascending, with text. */
  readUnmarked(documentId: number, max: number): Promise<UnitRow[]>;
  /** Part numbers stored under gte-small, for these units only. */
  readDoneParts(unitIds: number[]): Promise<Map<number, Set<number>>>;
  /** Null on success, else the database's error (a 23505 is handled by the caller). */
  insertPart(row: EmbeddingRow): Promise<{ code?: string | null; message: string } | null>;
  markEmbedded(unitId: number): Promise<void>;
}

export type Embedder = (input: string) => Promise<number[]>;
export type EmbedCallResult = { status: number; answer: Record<string, unknown> };

const UNIQUE_VIOLATION = "23505";

async function embedJob(
  store: EmbedStore,
  embed: Embedder,
  head: string,
  job: ReturnType<typeof planEmbedWork>["jobs"][number],
): Promise<PartOutcome[]> {
  const attempted: PartOutcome[] = [];
  // Slice from the same code-point array the offsets were computed against.
  const cps = codePoints(job.unit.text);
  for (const part of job.parts) {
    let outcome: PartOutcome;
    try {
      const vec = await embed(head + cps.slice(part.start, part.end).join(""));
      if (!Array.isArray(vec) || vec.length !== EMBEDDING_DIMENSIONS) {
        throw new Error(`unexpected embedding shape: ${Array.isArray(vec) ? vec.length : typeof vec}`);
      }
      const error = await store.insertPart(buildEmbeddingRow(job.unit.id, part, vec));
      outcome = { part_no: part.part_no, error };
    } catch (e) {
      outcome = { part_no: part.part_no, error: { message: e instanceof Error ? e.message : String(e) } };
    }
    attempted.push(outcome);
    if (outcome.error && outcome.error.code !== UNIQUE_VIOLATION) break;
  }
  return attempted;
}

export async function runEmbedCall(store: EmbedStore, embed: Embedder, body: EmbedBody): Promise<EmbedCallResult> {
  const { documentId, limit, maxParts, dryRun } = body;
  const document = await store.readDocument(documentId);
  if (!document) return { status: 404, answer: { error: `no such document: ${documentId}` } };

  const empty = { documentId, dryRun, limit, maxParts, processedUnits: 0, unitsCompleted: 0, insertedRows: 0, storedRows: 0, failed: [], missingPartsBefore: 0 };
  // A failed or deleting document: nothing is read but its row.
  if (pickUnits(documentId, document, [{ id: 0, document_id: documentId, text: "", embedded_at: null }]).length === 0) {
    return { status: 200, answer: buildAnswer(empty) };
  }

  const unmarked = await store.countUnmarked(documentId);
  const window = Math.min(limit, maxParts);
  const units = pickUnits(documentId, document, await store.readUnmarked(documentId, window));
  const unread = Math.max(0, unmarked - units.length);
  const done = await store.readDoneParts(units.map((u) => u.id));
  const plan = planEmbedWork({ units, done, limit, maxParts });
  const failed: FailedUnit[] = [...plan.scanFailed];

  let processedUnits = 0;
  let unitsCompleted = 0;
  let insertedRows = 0;
  let storedRows = 0;

  if (dryRun) {
    processedUnits = plan.jobs.length;
  } else {
    for (const unitId of plan.markOnly) await store.markEmbedded(unitId);
    const head = embeddingHeader(document);
    for (const job of plan.jobs) {
      const settled = settleUnit({ allParts: job.allParts, have: job.have, attempted: await embedJob(store, embed, head, job) });
      insertedRows += settled.inserted;
      storedRows += settled.inserted + settled.duplicates;
      if (settled.error) {
        failed.push({ text_id: job.unit.id, error: settled.error });
        continue;
      }
      processedUnits++;
      if (job.parts.length === job.missingTotal) unitsCompleted++;
      if (settled.markEmbedded) await store.markEmbedded(job.unit.id);
    }
  }

  return {
    status: 200,
    answer: buildAnswer({
      documentId, dryRun, limit, maxParts, processedUnits, unitsCompleted, insertedRows, storedRows,
      failed, missingPartsBefore: plan.missingPartsBefore + unread,
    }),
  };
}

export { EMBED_MODEL };

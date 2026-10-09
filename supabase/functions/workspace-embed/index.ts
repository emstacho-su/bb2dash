// bb2dash :: workspace-embed
// Embeds the text units of ONE workspace document (an upload or a remembered item) with the
// edge runtime's built-in `gte-small` model and writes them to workspace_text_embeddings.
// The workspace's counterpart of `embed-corpus`, driven the same way: the ingest worker calls it
// through `runEmbedLoop` (ingest/embed_corpus.mjs) until `remaining_parts` is 0.
//
// POST { document_id: number (required), limit?: number = 40, max_parts?: number = 6,
//        dry_run?: boolean = false }
// ->   { document_id, model, dry_run, limit, max_parts, processed_units, units_completed,
//        inserted_rows, failed: [{text_id, error}], remaining_parts, missing_parts_before }
// (contract24/embed.json)
//
// What differs from embed-corpus, and why:
//   * ONE DOCUMENT A CALL. `document_id` is required and only that document's units are read.
//     runEmbedLoop stops at the first failed unit; if units were picked across documents, one
//     bad upload would block every later upload and every remembered item. A document in state
//     `failed` or `deleting` is never touched (the answer is the empty one).
//   * A part that is already stored is not an error. An insert that meets the unique key
//     (text_id, model, part_no) -- SQLSTATE 23505 -- counts as stored. A unit's `embedded_at` is
//     set when it has at least one part and none is missing, whether this call stored the last
//     part or found it there.
//   * A unit with no text is never marked. Empty text gives no part; the unit is reported in
//     `failed` with its id and its `embedded_at` stays null, so a document cannot end `indexed`
//     with a unit that has no vector.
//   * Every vector row names the model `gte-small`.
//
// The chunking, the unit picker and the write step are pure functions in `_shared/` (tested
// under Node: node --test supabase/functions/_shared/chunk_test.ts). This file is the I/O.
//
// Logs carry ids, counts and timings only -- never a unit's text.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { codePoints } from "../_shared/chunk.ts";
import {
  buildAnswer,
  buildEmbeddingRow,
  EMBED_MODEL,
  embeddingHeader,
  type DocumentRow,
  type FailedUnit,
  type PartOutcome,
  parseEmbedBody,
  pickUnits,
  planEmbedWork,
  settleUnit,
  type UnitRow,
} from "../_shared/embed-plan.ts";

const EMBEDDING_DIMENSIONS = 384;
const PAGE = 500;
const ID_BATCH = 200; // ids per `in (...)` read, to keep the request line short

const JSON_HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });

// deno-lint-ignore no-explicit-any
type Sb = any;

async function readDocument(sb: Sb, id: number): Promise<DocumentRow | null> {
  const { data, error } = await sb
    .from("workspace_documents")
    .select("id, kind, title, course_id, state")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`read workspace_documents: ${error.message}`);
  return (data as DocumentRow | null) ?? null;
}

async function readUnits(sb: Sb, documentId: number): Promise<UnitRow[]> {
  const units: UnitRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb
      .from("workspace_document_text")
      .select("id, document_id, text, embedded_at")
      .eq("document_id", documentId)
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`read workspace_document_text: ${error.message}`);
    const rows = (data ?? []) as UnitRow[];
    units.push(...rows);
    if (rows.length < PAGE) break;
  }
  return units;
}

/** The part numbers already stored under gte-small, per unit. */
async function readDoneParts(sb: Sb, unitIds: number[]): Promise<Map<number, Set<number>>> {
  const done = new Map<number, Set<number>>();
  for (let i = 0; i < unitIds.length; i += ID_BATCH) {
    const ids = unitIds.slice(i, i + ID_BATCH);
    const { data, error } = await sb
      .from("workspace_text_embeddings")
      .select("text_id, part_no")
      .eq("model", EMBED_MODEL)
      .in("text_id", ids);
    if (error) throw new Error(`read workspace_text_embeddings: ${error.message}`);
    for (const r of data ?? []) {
      const set = done.get(r.text_id as number) ?? new Set<number>();
      set.add(r.part_no as number);
      done.set(r.text_id as number, set);
    }
  }
  return done;
}

async function markEmbedded(sb: Sb, unitId: number): Promise<void> {
  const { error } = await sb
    .from("workspace_document_text")
    .update({ embedded_at: new Date().toISOString() })
    .eq("id", unitId);
  if (error) throw new Error(`mark unit ${unitId} embedded: ${error.message}`);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: JSON_HEADERS });
  if (req.method !== "POST") return json({ error: "method not allowed; POST a JSON body" }, 405);

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return json({ error: "request body must be JSON" }, 400);
  }
  const parsed = parseEmbedBody(raw);
  if (!parsed.ok) return json({ error: parsed.error }, 400);
  const { documentId, limit, maxParts, dryRun } = parsed.body;
  const startedAt = Date.now();

  try {
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );

    const document = await readDocument(sb, documentId);
    if (!document) return json({ error: `no such document: ${documentId}` }, 404);

    const units = pickUnits(documentId, document, await readUnits(sb, documentId));
    const done = await readDoneParts(sb, units.map((u) => u.id));
    const plan = planEmbedWork({ units, done, limit, maxParts });
    const failed: FailedUnit[] = [...plan.scanFailed];

    let processedUnits = 0;
    let unitsCompleted = 0;
    let insertedRows = 0;
    let storedRows = 0;

    if (!dryRun) {
      for (const unitId of plan.markOnly) await markEmbedded(sb, unitId);

      // deno-lint-ignore no-explicit-any
      const session: any = plan.jobs.length > 0
        // deno-lint-ignore no-explicit-any
        ? new (globalThis as any).Supabase.ai.Session(EMBED_MODEL)
        : null;
      const head = embeddingHeader(document);

      // One part at a time, so a CPU kill keeps its progress.
      for (const job of plan.jobs) {
        const attempted: PartOutcome[] = [];
        // Slice from the same code-point array the offsets were computed against.
        const cps = codePoints(job.unit.text);
        for (const part of job.parts) {
          try {
            const vec: number[] = await session.run(head + cps.slice(part.start, part.end).join(""), {
              mean_pool: true,
              normalize: true,
            });
            if (!Array.isArray(vec) || vec.length !== EMBEDDING_DIMENSIONS) {
              throw new Error(`unexpected embedding shape: ${Array.isArray(vec) ? vec.length : typeof vec}`);
            }
            const { error } = await sb
              .from("workspace_text_embeddings")
              .insert(buildEmbeddingRow(job.unit.id, part, vec));
            attempted.push({ part_no: part.part_no, error: error ? { code: error.code, message: error.message } : null });
          } catch (e) {
            attempted.push({ part_no: part.part_no, error: { message: e instanceof Error ? e.message : String(e) } });
          }
          if (attempted[attempted.length - 1]!.error && attempted[attempted.length - 1]!.error!.code !== "23505") break;
        }

        const settled = settleUnit({ allParts: job.allParts, have: job.have, attempted });
        insertedRows += settled.inserted;
        storedRows += settled.inserted + settled.duplicates;
        if (settled.error) {
          failed.push({ text_id: job.unit.id, error: settled.error });
          continue;
        }
        processedUnits++;
        if (job.parts.length === job.missingTotal) unitsCompleted++;
        if (settled.markEmbedded) await markEmbedded(sb, job.unit.id);
      }
    } else {
      processedUnits = plan.jobs.length;
    }

    console.log("workspace-embed", {
      document_id: documentId,
      units: units.length,
      jobs: plan.jobs.length,
      inserted_rows: insertedRows,
      failed: failed.length,
      ms: Date.now() - startedAt,
    });
    return json(buildAnswer({
      documentId, dryRun, limit, maxParts, processedUnits, unitsCompleted,
      insertedRows, storedRows, failed, missingPartsBefore: plan.missingPartsBefore,
    }));
  } catch (e) {
    // The caller gets a short message; the log gets the document id and timing, never text.
    console.error("workspace-embed failed", { document_id: documentId, ms: Date.now() - startedAt });
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

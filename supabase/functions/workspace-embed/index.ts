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
// A call is proportional to the work left: it reads only the document's UNMARKED units, no more
// than the call can use, and the part numbers of those units (`_shared/embed-call.ts` says how the
// two counts stay exact where it matters). The chunking, the unit picker, the write step and the
// whole call are in `_shared/` and tested under Node (chunk_test.ts, embed_call_test.ts); this
// file is the I/O: a store over supabase-js and the gte-small session.
//
// Logs carry ids, counts and timings only -- never a unit's text.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { type EmbedStore, runEmbedCall } from "../_shared/embed-call.ts";
import { type DocumentRow, EMBED_MODEL, parseEmbedBody, type UnitRow } from "../_shared/embed-plan.ts";

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

function supabaseStore(sb: Sb): EmbedStore {
  return {
    async readDocument(id) {
      const { data, error } = await sb
        .from("workspace_documents")
        .select("id, kind, title, course_id, state")
        .eq("id", id)
        .maybeSingle();
      if (error) throw new Error(`read workspace_documents: ${error.message}`);
      return (data as DocumentRow | null) ?? null;
    },
    async countUnmarked(documentId) {
      const { count, error } = await sb
        .from("workspace_document_text")
        .select("id", { count: "exact", head: true })
        .eq("document_id", documentId)
        .is("embedded_at", null);
      if (error) throw new Error(`count workspace_document_text: ${error.message}`);
      return count ?? 0;
    },
    async readUnmarked(documentId, max) {
      const { data, error } = await sb
        .from("workspace_document_text")
        .select("id, document_id, text, embedded_at")
        .eq("document_id", documentId)
        .is("embedded_at", null)
        .order("id", { ascending: true })
        .limit(max);
      if (error) throw new Error(`read workspace_document_text: ${error.message}`);
      return (data ?? []) as UnitRow[];
    },
    async readDoneParts(unitIds) {
      const done = new Map<number, Set<number>>();
      for (let i = 0; i < unitIds.length; i += ID_BATCH) {
        const { data, error } = await sb
          .from("workspace_text_embeddings")
          .select("text_id, part_no")
          .eq("model", EMBED_MODEL)
          .in("text_id", unitIds.slice(i, i + ID_BATCH));
        if (error) throw new Error(`read workspace_text_embeddings: ${error.message}`);
        for (const r of data ?? []) {
          const set = done.get(r.text_id as number) ?? new Set<number>();
          set.add(r.part_no as number);
          done.set(r.text_id as number, set);
        }
      }
      return done;
    },
    async insertPart(row) {
      const { error } = await sb.from("workspace_text_embeddings").insert(row);
      return error ? { code: error.code, message: error.message } : null;
    },
    async markEmbedded(unitId) {
      const { error } = await sb
        .from("workspace_document_text")
        .update({ embedded_at: new Date().toISOString() })
        .eq("id", unitId);
      if (error) throw new Error(`mark unit ${unitId} embedded: ${error.message}`);
    },
  };
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
  const startedAt = Date.now();

  try {
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    // The model loads only when there is something to embed; the session is made on first use.
    // deno-lint-ignore no-explicit-any
    let session: any = null;
    const embed = async (input: string): Promise<number[]> => {
      // deno-lint-ignore no-explicit-any
      session ??= new (globalThis as any).Supabase.ai.Session(EMBED_MODEL);
      return await session.run(input, { mean_pool: true, normalize: true });
    };

    const result = await runEmbedCall(supabaseStore(sb), embed, parsed.body);
    const a = result.answer as { inserted_rows?: number; failed?: unknown[]; missing_parts_before?: number };
    console.log("workspace-embed", {
      document_id: parsed.body.documentId,
      status: result.status,
      inserted_rows: a.inserted_rows ?? null,
      failed: a.failed?.length ?? null,
      missing_parts_before: a.missing_parts_before ?? null,
      ms: Date.now() - startedAt,
    });
    return json(result.answer, result.status);
  } catch (e) {
    // The caller gets a short message; the log gets the document id and timing, never text.
    console.error("workspace-embed failed", { document_id: parsed.body.documentId, ms: Date.now() - startedAt });
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

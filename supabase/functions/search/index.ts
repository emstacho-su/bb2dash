// bb2dash :: edge function `search`  (v4)
// The hub's retrieval API over the harvested Blackboard corpus.
//
// POST { q: string, course?: string, mode?: 'fts'|'vector'|'hybrid', limit?: number,
//        min_similarity?: number, include_superseded?: boolean }
//   fts     -> rpc search_file_text(q, p_course, p_limit)            [migrations 010, 021]
//   vector  -> embed q with gte-small, rpc match_file_text(...)      [migrations 011, 021]
//   hybrid  -> embed q, rpc hybrid_search_file_text(...)             [migrations 012/013, 021]
//
// v4 (migration 021) changes what the rows CONTAIN, not what this file computes. In hybrid mode
// `snippet` is now the matched passage rather than the head of the unit, and each row carries
// `part_no` (which embedding part matched, null when the unit is unembedded) and
// `snippet_source` ('fts_headline' | 'vector_part' | 'unit_head'). The SQL function builds all
// of that; the rows are passed through untouched.
//
// include_superseded (boolean, default false) is the other v4 addition. bb_files.superseded_by
// marks a document that a newer version replaced — four IST.466 schedule versions, two rosters.
// By default all three modes hide those rows, so a query gets the one current document instead
// of a rank list of near-identical drafts. Pass true only to search history deliberately.
//
// min_similarity (0..1, optional) is a cosine floor on the VECTOR evidence. Measured on this
// corpus 2026-09-09: relevant hits 0.83-0.92, nonsense English 0.75-0.77, so 0.78 is the
// recommended default for agent callers. It is not applied server-side by default — omit it and
// v3 behaves exactly like v2 — because the Materials cmd-K overlay may prefer "always show
// something". In hybrid mode it is forwarded to the SQL function, which gates only the vector
// arm and still returns literal keyword hits (with their real similarity) below the floor. In
// vector mode there is no keyword arm, so it simply filters the ranked list. fts ignores it.
//
// The query string is embedded RAW — no "{course} {bucket} — {file_name}: " context header.
// That header is a corpus-side construct (see PLAN_EMBEDDING_POC.md, chunking policy); prefixing
// the query with it would push the query vector away from the passage vectors, not toward them.
//
// Runs with the service role, inside the function only: RLS on bb_text_embeddings is
// insert-only for anon, so a publishable-key caller cannot read embeddings directly.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const MODEL = "gte-small";
const MODES = ["fts", "vector", "hybrid"] as const;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;
// vector mode returns one row per embedded PART; over-fetch so that collapsing
// to one row per unit and applying the floor still leaves `limit` units.
const VECTOR_OVERFETCH = 4;
type Mode = (typeof MODES)[number];

const JSON_HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });

// One session per isolate — model load is the expensive part, reuse it across requests.
const embedder = new Supabase.ai.Session(MODEL);

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

async function embed(q: string): Promise<number[]> {
  const v = await embedder.run(q, { mean_pool: true, normalize: true });
  return Array.from(v as number[]);
}

/** Parse the optional floor. Returns null when absent, or an error string when malformed. */
function parseMinSimilarity(raw: unknown): { value: number | null; error?: string } {
  if (raw === undefined || raw === null) return { value: null };
  // typeof, not Number(): `true`, "" and [] would otherwise coerce to a valid floor.
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw < 0 || raw > 1) {
    return { value: null, error: "min_similarity must be a number between 0 and 1" };
  }
  return { value: raw };
}

/** Parse the optional superseded switch. Absent means false; a non-boolean is rejected. */
function parseIncludeSuperseded(raw: unknown): { value: boolean; error?: string } {
  if (raw === undefined || raw === null) return { value: false };
  // typeof, not truthiness: "false" and 0 would otherwise silently mean something.
  if (typeof raw !== "boolean") {
    return { value: false, error: "include_superseded must be a boolean" };
  }
  return { value: raw };
}

/** Parse the optional limit: a finite number, truncated and clamped to 1..MAX_LIMIT. */
function parseLimit(raw: unknown): { value: number; error?: string } {
  if (raw === undefined || raw === null) return { value: DEFAULT_LIMIT };
  if (typeof raw !== "number" || !Number.isFinite(raw)) {
    return { value: DEFAULT_LIMIT, error: "limit must be a number" };
  }
  return { value: Math.min(MAX_LIMIT, Math.max(1, Math.trunc(raw))) };
}

/** Keep the best-ranked row per text unit. Rows arrive sorted by distance. */
function bestPartPerUnit<T extends { text_id: number }>(rows: T[]): T[] {
  const seen = new Set<number>();
  return rows.filter((row) => (seen.has(row.text_id) ? false : (seen.add(row.text_id), true)));
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: JSON_HEADERS });
  if (req.method !== "POST") {
    return json({ error: "method not allowed; POST a JSON body" }, 405);
  }

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await req.json();
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return json({ error: "request body must be a JSON object" }, 400);
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return json({ error: "request body must be JSON" }, 400);
  }

  const q = typeof body.q === "string" ? body.q.trim() : "";
  if (!q) return json({ error: "missing required field: q (non-empty string)" }, 400);

  const course = typeof body.course === "string" && body.course.trim()
    ? body.course.trim()
    : null;

  const mode = (typeof body.mode === "string" ? body.mode : "hybrid") as Mode;
  if (!MODES.includes(mode)) {
    return json({ error: `invalid mode '${mode}'; expected one of ${MODES.join(", ")}` }, 400);
  }

  const limitParsed = parseLimit(body.limit);
  if (limitParsed.error) return json({ error: limitParsed.error }, 400);
  const limit = limitParsed.value;

  const floor = parseMinSimilarity(body.min_similarity);
  if (floor.error) return json({ error: floor.error }, 400);
  const minSimilarity = floor.value;

  const superseded = parseIncludeSuperseded(body.include_superseded);
  if (superseded.error) return json({ error: superseded.error }, 400);
  const includeSuperseded = superseded.value;

  // Optional RPC arguments are attached only when they carry a non-default value:
  // postgrest-js serialises an explicit null, and an argument the deployed function
  // does not declare makes PostgREST fail overload resolution (PGRST202) against a
  // database that has not applied the matching migration yet — 012 for
  // p_min_similarity, 021 for p_include_superseded.
  const optional = (args: Record<string, unknown>): Record<string, unknown> =>
    includeSuperseded ? { ...args, p_include_superseded: true } : args;

  try {
    let results: unknown[] = [];

    if (mode === "fts") {
      const { data, error } = await supabase.rpc(
        "search_file_text",
        optional({ q, p_course: course, p_limit: limit }),
      );
      if (error) throw error;
      results = data ?? [];
    } else if (mode === "vector") {
      const { data, error } = await supabase.rpc(
        "match_file_text",
        optional({
          query_embedding: await embed(q),
          p_model: MODEL,
          p_course: course,
          p_limit: Math.min(MAX_LIMIT * VECTOR_OVERFETCH, limit * VECTOR_OVERFETCH),
        }),
      );
      if (error) throw error;
      let rows = (data ?? []) as Array<{ text_id: number; similarity: number }>;
      if (minSimilarity !== null) {
        rows = rows.filter((r) => typeof r.similarity === "number" && r.similarity >= minSimilarity);
      }
      results = bestPartPerUnit(rows).slice(0, limit);
    } else {
      const args: Record<string, unknown> = optional({
        q,
        query_embedding: await embed(q),
        p_model: MODEL,
        p_course: course,
        p_limit: limit,
      });
      if (minSimilarity !== null) args.p_min_similarity = minSimilarity;
      const { data, error } = await supabase.rpc("hybrid_search_file_text", args);
      if (error) throw error;
      results = data ?? [];
    }

    return json({
      mode,
      q,
      course,
      min_similarity: minSimilarity,
      count: results.length,
      results,
    });
  } catch (err) {
    // Full detail goes to the function log; the caller gets the code and a short
    // message, not SQL signatures, column names or PostgREST's overload hints.
    const e = err as { message?: string; code?: string; details?: string; hint?: string };
    console.error("search failed", {
      mode,
      course,
      message: e?.message ?? String(err),
      code: e?.code ?? null,
      details: e?.details ?? null,
      hint: e?.hint ?? null,
    });
    return json(
      {
        mode,
        q,
        course,
        error: "search failed" + (e?.code ? ` (code ${e.code})` : ""),
        code: e?.code ?? null,
      },
      500,
    );
  }
});

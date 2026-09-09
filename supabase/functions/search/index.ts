// bb2dash :: edge function `search`  (v3)
// The hub's retrieval API over the harvested Blackboard corpus.
//
// POST { q: string, course?: string, mode?: 'fts'|'vector'|'hybrid', limit?: number,
//        min_similarity?: number }
//   fts     -> rpc search_file_text(q, p_course, p_limit)            [migration 010]
//   vector  -> embed q with gte-small, rpc match_file_text(...)      [migration 011, vector(384)]
//   hybrid  -> embed q, rpc hybrid_search_file_text(...)             [migration 012, RRF + floor]
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
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > 1) {
    return { value: null, error: "min_similarity must be a number between 0 and 1" };
  }
  return { value: n };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: JSON_HEADERS });
  if (req.method !== "POST") {
    return json({ error: "method not allowed; POST a JSON body" }, 405);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
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

  const rawLimit = Number(body.limit ?? 10);
  const limit = Number.isFinite(rawLimit)
    ? Math.min(100, Math.max(1, Math.trunc(rawLimit)))
    : 10;

  const floor = parseMinSimilarity(body.min_similarity);
  if (floor.error) return json({ error: floor.error }, 400);
  const minSimilarity = floor.value;

  try {
    let results: unknown[] = [];

    if (mode === "fts") {
      const { data, error } = await supabase.rpc("search_file_text", {
        q,
        p_course: course,
        p_limit: limit,
      });
      if (error) throw error;
      results = data ?? [];
    } else if (mode === "vector") {
      const { data, error } = await supabase.rpc("match_file_text", {
        query_embedding: await embed(q),
        p_model: MODEL,
        p_course: course,
        p_limit: limit,
      });
      if (error) throw error;
      results = (data ?? []) as Array<{ similarity: number }>;
      if (minSimilarity !== null) {
        results = (results as Array<{ similarity: number }>).filter(
          (r) => typeof r.similarity === "number" && r.similarity >= minSimilarity,
        );
      }
    } else {
      const { data, error } = await supabase.rpc("hybrid_search_file_text", {
        q,
        query_embedding: await embed(q),
        p_model: MODEL,
        p_course: course,
        p_limit: limit,
        p_min_similarity: minSimilarity,
      });
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
    const e = err as { message?: string; code?: string; details?: string; hint?: string };
    return json(
      {
        mode,
        q,
        course,
        error: e?.message ?? String(err),
        code: e?.code ?? null,
        details: e?.details ?? null,
        hint: e?.hint ?? null,
      },
      500,
    );
  }
});

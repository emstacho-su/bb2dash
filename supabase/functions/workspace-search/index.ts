// bb2dash :: edge function `workspace-search`
// One search over the three kinds of the workspace store: course materials, uploads and the
// assistant's memory. All three are embedded with gte-small (384), so cosine similarity orders
// hits across kinds.
//
// POST { q: string (required, cut to 2,000 chars), kinds?: ('material'|'upload'|'memory')[],
//        courses?: string[] | null, limit?: 1..50 = 10, min_similarity?: 0..1 }
// -> { q, model, min_similarity, count, results }      (contract24/search-function.json)
//    400 { error } for a bad body; 403 { error, code } when the database refuses the caller.
//
// HOLDS NO SERVICE KEY. The function forwards the caller's own bearer to the SQL function
// `workspace_search`, whose grant is `service_role` only (migration 192). The batch child of
// the materials package calls it with the service key; an anon caller is refused by the
// grant. `search` (course files only) is unchanged and stays what the web app uses.
//
// The query text is never logged: ids, counts and timings only.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { EMBED_MODEL, handleSearch } from "./search.ts";

const JSON_HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });

// One session per isolate: the model load is the expensive part.
const embedder = new Supabase.ai.Session(EMBED_MODEL);

async function embed(q: string): Promise<number[]> {
  const v = await embedder.run(q, { mean_pool: true, normalize: true });
  return Array.from(v as number[]);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: JSON_HEADERS });
  if (req.method !== "POST") return json({ error: "method not allowed; POST a JSON body" }, 405);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "request body must be JSON" }, 400);
  }

  const startedAt = Date.now();
  const result = await handleSearch({
    body,
    headers: {
      authorization: req.headers.get("authorization") ?? undefined,
      apikey: req.headers.get("apikey") ?? undefined,
    },
    env: { supabaseUrl: Deno.env.get("SUPABASE_URL")! },
    embed,
    fetchImpl: fetch,
  });

  const count = (result.body as { count?: number }).count ?? null;
  console.log("workspace-search", { status: result.status, count, ms: Date.now() - startedAt });
  return json(result.body, result.status);
});

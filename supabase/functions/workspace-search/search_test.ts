// bb2dash :: workspace-search — tests
//
//   node --test supabase/functions/workspace-search/search_test.ts      (Node 22+; no Deno here)
//
// No network, no database: the embedder and `fetch` are stand-ins. All text is synthetic.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { handleSearch, MAX_QUERY_CHARS, parseSearchBody } from "./search.ts";

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const fixture = JSON.parse(
  readFileSync(here("../../../workspace/test/fixtures/contract24/search-function.json"), "utf8"),
);
const BEARER = "Bearer caller-token";
const ENV = { supabaseUrl: "https://example.supabase.co" };
const VECTOR = [0.1, 0.2, 0.3];

type Call = { url: string; init: RequestInit; body: Record<string, unknown> };

function fakeFetch(response: { status: number; body: unknown }): { fetchImpl: typeof fetch; calls: Call[] } {
  const calls: Call[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init: init ?? {}, body: JSON.parse(String(init?.body)) });
    return new Response(JSON.stringify(response.body), { status: response.status });
  }) as typeof fetch;
  return { fetchImpl, calls };
}

const run = (body: unknown, f: ReturnType<typeof fakeFetch>, headers: Record<string, string> = { authorization: BEARER }) =>
  handleSearch({
    body, headers, env: ENV, embed: async () => VECTOR, fetchImpl: f.fetchImpl,
  });

test("the answer is search-function.json's, rows exactly as the SQL function gave them", async () => {
  const f = fakeFetch({ status: 200, body: fixture.answer.results });
  const out = await run(fixture.body, f);
  assert.equal(out.status, 200);
  assert.deepEqual(out.body, fixture.answer);
});

test("every row of the answer carries the kind the SQL function gave it", async () => {
  const f = fakeFetch({ status: 200, body: fixture.answer.results });
  const out = await run(fixture.body, f);
  const kinds = (out.body as { results: Array<{ kind: string }> }).results.map((r) => r.kind);
  assert.deepEqual(kinds, ["material", "upload", "memory"]);
});

test("the query is cut to 2,000 characters before it is embedded and sent", async () => {
  const f = fakeFetch({ status: 200, body: [] });
  let embedded = "";
  const out = await handleSearch({
    body: { q: "x".repeat(MAX_QUERY_CHARS + 500) }, headers: { authorization: BEARER }, env: ENV,
    embed: async (q) => { embedded = q; return VECTOR; }, fetchImpl: f.fetchImpl,
  });
  assert.equal(out.status, 200);
  assert.equal(embedded.length, MAX_QUERY_CHARS);
  assert.equal((f.calls[0]!.body.p_q as string).length, MAX_QUERY_CHARS);
  assert.equal((out.body as { q: string }).q.length, MAX_QUERY_CHARS);
});

test("the caller's bearer is forwarded to the rpc, and the call is workspace_search", async () => {
  const f = fakeFetch({ status: 200, body: [] });
  await run(fixture.body, f, { authorization: BEARER, apikey: "caller-apikey" });
  const call = f.calls[0]!;
  assert.equal(call.url, "https://example.supabase.co/rest/v1/rpc/workspace_search");
  const headers = call.init.headers as Record<string, string>;
  assert.equal(headers.Authorization, BEARER);
  assert.equal(headers.apikey, "caller-apikey");
  assert.deepEqual(call.body, {
    p_q: "membrane transport",
    p_query_embedding: JSON.stringify(VECTOR),
    p_kinds: ["material", "upload", "memory"],
    p_courses: ["BIO.110", "BIO.110.lab"],
    p_limit: 10,
    p_min_similarity: 0.78,
    p_model: "gte-small",
  });
});

test("no service key is read from the environment, by the code or by the handler", async () => {
  for (const file of ["./search.ts", "./index.ts"]) {
    const source = readFileSync(here(file), "utf8");
    assert.doesNotMatch(source, /SERVICE_ROLE_KEY|SERVICE_KEY|SB_SECRET/i, file);
    for (const name of source.matchAll(/env\.get\(\s*["'`]([^"'`]+)/g)) {
      assert.equal(name[1], "SUPABASE_URL", `${file} reads ${name[1]}`);
    }
  }
  const f = fakeFetch({ status: 200, body: [] });
  const out = await handleSearch({
    body: { q: "x" }, headers: {}, env: ENV, embed: async () => VECTOR, fetchImpl: f.fetchImpl,
  });
  assert.equal(out.status, 401); // no bearer, no call
  assert.equal(f.calls.length, 0);
});

test("without a courses key the rpc gets null, and the kinds default to all three", async () => {
  const f = fakeFetch({ status: 200, body: [] });
  await run({ q: "lab report" }, f);
  const body = f.calls[0]!.body;
  assert.equal(body.p_courses, null);
  assert.deepEqual(body.p_kinds, ["material", "upload", "memory"]);
  assert.equal(body.p_limit, 10);
  assert.equal("p_min_similarity" in body, false);
});

test("a bad body is 400 with an error and nothing is sent", async () => {
  const bad = [
    null, [], { q: "" }, { q: 5 }, { q: "ok", kinds: ["video"] }, { q: "ok", kinds: [] },
    { q: "ok", courses: "BIO.110" }, { q: "ok", courses: [3] }, { q: "ok", limit: "ten" },
    { q: "ok", min_similarity: 2 }, { q: "ok", min_similarity: "0.5" },
  ];
  for (const body of bad) {
    const f = fakeFetch({ status: 200, body: [] });
    const out = await run(body, f);
    assert.equal(out.status, 400, JSON.stringify(body));
    assert.equal(typeof (out.body as { error: string }).error, "string");
    assert.equal(f.calls.length, 0);
  }
});

test("the limit is clamped to 1 to 50", () => {
  const high = parseSearchBody({ q: "x", limit: 500 });
  const low = parseSearchBody({ q: "x", limit: 0 });
  assert.ok(high.ok && high.request.limit === 50);
  assert.ok(low.ok && low.request.limit === 1);
});

test("a refusal by the database (42501) is 403 with the code", async () => {
  const f = fakeFetch({ status: 403, body: { code: "42501", message: "permission denied for function workspace_search" } });
  const out = await run({ q: "x" }, f);
  assert.equal(out.status, 403);
  assert.deepEqual(out.body, { error: "search refused", code: "42501" });
});

test("another database error is 500 and leaks no message", async () => {
  const f = fakeFetch({ status: 500, body: { code: "XX000", message: "secret detail about a column" } });
  const out = await run({ q: "x" }, f);
  assert.equal(out.status, 500);
  assert.doesNotMatch(JSON.stringify(out.body), /secret detail/);
});

test("an embedder that throws is 500 and sends nothing", async () => {
  const f = fakeFetch({ status: 200, body: [] });
  const out = await handleSearch({
    body: { q: "x" }, headers: { authorization: BEARER }, env: ENV,
    embed: async () => { throw new Error("model not loaded"); }, fetchImpl: f.fetchImpl,
  });
  assert.equal(out.status, 500);
  assert.equal(f.calls.length, 0);
});

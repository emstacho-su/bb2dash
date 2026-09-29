#!/usr/bin/env node
// bb2dash :: ingest/embed_corpus.mjs
//
//   node ingest/embed_corpus.mjs [--check] [--max-parts 3] [--budget 60] [--limit 40]
//
// Finish the corpus: call the `embed-corpus` edge function until nothing is left to embed.
//
// WHY A LOOP. The edge runtime kills an invocation around 8-9 embedding calls
// (WORKER_RESOURCE_LIMIT, HTTP 546), so `embed-corpus` embeds a bounded number of parts and hands
// back `remaining_parts`. Finishing a pull has meant running it again and again by hand and reading
// that number each time — the last step of CADENCE_RUNBOOK step 4 that no script replaced. This is
// that loop, so a file pull can end with the text actually searchable.
//
// THE KEY. `embed-corpus` runs with `verify_jwt` on, so it needs the LEGACY ANON JWT, not the
// `sb_publishable_` key. The two are easy to confuse and a publishable key produces a wall of
// identical 401s, so it is refused up front by name. `SB_ANON_JWT` is this script's variable;
// `SB_ANON_KEY` keeps its meaning for Storage and REST inserts elsewhere in the pull.
//
// --check sends `dry_run: true`, prints `missing_parts_before=<n>` and exits 1 when n > 0. That is
// the line bb-sync step 4b reads to prove the sync left nothing unembedded.
//
// Importing this module runs nothing: `runEmbedLoop` takes its I/O by argument.

import { pathToFileURL } from 'node:url';

export const DEFAULT_SUPABASE_URL = 'https://goultdzqcavefcgnifdy.supabase.co';
/** Parts per invocation. The runtime dies around 8-9; 3 leaves room for a long unit. */
export const DEFAULT_MAX_PARTS = 3;
/** The most invocations one run may make before it gives up and says so. */
export const DEFAULT_BUDGET = 60;
export const DEFAULT_LIMIT = 40;
/** Statuses worth trying again: the runtime's own resource kill, and a transient unavailable. */
export const RETRY_STATUSES = new Set([546, 503]);

/** Minimal argv parser: `--name value` pairs and `--flag` booleans. */
export function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const name = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) out[name] = true;
    else { out[name] = next; i++; }
  }
  return out;
}

/**
 * The key this script may use. A publishable key is refused by name: `embed-corpus` has
 * `verify_jwt` on and would answer every call 401.
 */
export function assertUsableJwt(value) {
  const v = String(value ?? '');
  if (!v) throw new Error('SB_ANON_JWT (the legacy anon JWT) is not set');
  if (v.startsWith('sb_publishable_')) {
    throw new Error('SB_ANON_JWT holds a publishable key; embed-corpus has verify_jwt on and needs the legacy anon JWT');
  }
  return v;
}

const sleepReal = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Call `post(body)` until `remaining_parts` is 0.
 *
 * `post` returns `{status, body}` and never throws for an HTTP status. Retries only the statuses in
 * RETRY_STATUSES, and every attempt counts against `budget`, so a server that always answers 546
 * ends the run rather than spinning. A non-empty `failed` stops the loop immediately: those units
 * will not fix themselves on another pass and a silent exit 0 would hide them.
 *
 * `knownRemaining: 0` skips the loop entirely — a pull that posted no text has nothing to embed.
 */
export async function runEmbedLoop({
  post,
  check = false,
  maxParts = DEFAULT_MAX_PARTS,
  limit = DEFAULT_LIMIT,
  budget = DEFAULT_BUDGET,
  knownRemaining = null,
  sleep = sleepReal,
  log = () => {},
} = {}) {
  if (check) {
    const res = await post({ limit, max_parts: maxParts, dry_run: true });
    if (res.status !== 200) {
      return { exitCode: 1, calls: 1, retries: 0, error: `embed-corpus answered ${res.status}` };
    }
    const missing = Number(res.body?.missing_parts_before ?? 0);
    const line = `missing_parts_before=${missing}`;
    log(line);
    return { exitCode: missing > 0 ? 1 : 0, calls: 1, retries: 0, missingPartsBefore: missing, line };
  }

  if (knownRemaining === 0) {
    return { exitCode: 0, calls: 0, retries: 0, remainingParts: 0 };
  }

  let calls = 0;
  let retries = 0;
  let remainingParts = null;

  while (calls < budget) {
    const res = await post({ limit, max_parts: maxParts });
    calls++;

    if (RETRY_STATUSES.has(res.status)) {
      retries++;
      await sleep(1000);
      continue;
    }
    if (res.status !== 200) {
      return { exitCode: 1, calls, retries, remainingParts, error: `embed-corpus answered ${res.status}` };
    }

    const failed = Array.isArray(res.body?.failed) ? res.body.failed : [];
    if (failed.length) {
      const named = failed.map((f) => `${f.text_id}: ${f.error}`).join('; ').slice(0, 400);
      return { exitCode: 1, calls, retries, remainingParts, error: `embed-corpus failed on ${failed.length} unit(s) — ${named}` };
    }

    remainingParts = Number(res.body?.remaining_parts ?? 0);
    log(`embed-corpus: ${res.body?.inserted_rows ?? 0} row(s) in, ${remainingParts} part(s) left`);
    if (remainingParts === 0) {
      return { exitCode: 0, calls, retries, remainingParts: 0 };
    }
  }

  return {
    exitCode: 1,
    calls,
    retries,
    remainingParts,
    error: `call budget of ${budget} exhausted with ${remainingParts ?? 'an unknown number of'} part(s) left`,
  };
}

/** The real `post`: one HTTPS call to the edge function with the legacy anon JWT. */
export function makePost(supabaseUrl, jwt) {
  return async (body) => {
    const res = await fetch(`${supabaseUrl}/functions/v1/embed-corpus`, {
      method: 'POST',
      headers: { apikey: jwt, Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    let parsed = null;
    try { parsed = JSON.parse(text); } catch { parsed = { raw: text.slice(0, 400) }; }
    return { status: res.status, body: parsed };
  };
}

export async function main(argv = process.argv.slice(2), env = process.env) {
  const args = parseArgs(argv);
  let jwt;
  try {
    jwt = assertUsableJwt(env.SB_ANON_JWT);
  } catch (e) {
    console.error(String((e && e.message) || e));
    return 2;
  }
  const supabaseUrl = env.SUPABASE_URL || DEFAULT_SUPABASE_URL;
  const result = await runEmbedLoop({
    post: makePost(supabaseUrl, jwt),
    check: args.check === true,
    maxParts: Number(args['max-parts'] ?? DEFAULT_MAX_PARTS),
    limit: Number(args.limit ?? DEFAULT_LIMIT),
    budget: Number(args.budget ?? DEFAULT_BUDGET),
    log: (line) => console.log(line),
  });
  if (result.error) console.error(result.error);
  return result.exitCode;
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) main().then((code) => process.exit(code));

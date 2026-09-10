// bb2dash :: embed-corpus
// Embeds un-embedded bb_file_text units with the edge runtime's built-in `gte-small`
// model (384-dim, MIT, no API key) and writes them to bb_text_embeddings.
//
// POST { limit?: number = 40, max_parts?: number = 6, skip_parts?: number = 0,
//        dry_run?: boolean = false }
// ->   { processed_units, inserted_rows, failed: [{text_id, error}], remaining_units, ... }
//
// Chunking policy (PLAN_EMBEDDING_POC.md):
//   * every part is prefixed with a context header: "{course} {bucket} — {file_name}: "
//   * raw text <= 1600 chars  -> a single part (part_no = 1, part_range = [0,len))
//   * longer                  -> ~1400-char parts split on paragraph boundaries where
//                                possible (then sentence, then newline, then whitespace,
//                                then hard cut) with ~200 chars of overlap; part_range
//                                records the raw-text char offsets.
// The header is NOT counted in part_range — ranges are offsets into bb_file_text.text.
//
// Those offsets are CODE POINTS, because that is what reads them back: Postgres char_length()
// and substring() count code points, while a JS string's .length and .slice() count UTF-16 code
// UNITS. The two differ by one per astral-plane character — an emoji in a syllabus — which JS
// stores as a surrogate pair. Chunking therefore runs over Array.from(text), never over the
// string itself. Getting this wrong stored part_range [0,112) on a 111-char unit and would have
// shifted every part after an emoji in a long one (see db/migrations/023_part_range_repair.sql).
//
// CPU budget: gte-small inference is the dominant cost and the edge worker is killed
// (WORKER_RESOURCE_LIMIT / HTTP 546) well before a long unit's parts are all embedded.
// So work is tracked and resumed at PART granularity: each part is inserted as soon as
// it is embedded, `max_parts` caps the inference calls per invocation, and the next
// invocation picks up exactly the (text_id, part_no) pairs that are still missing.
// Chunking is deterministic, so part boundaries are stable across invocations.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const MODEL = "gte-small";

// chunking constants
const SINGLE_PART_MAX = 1600; // <= this many chars stays one part
const PART_TARGET = 1400; // aim for parts of about this size
const PART_OVERLAP = 200; // chars of overlap between consecutive parts
const MIN_CUT = Math.floor(PART_TARGET * 0.5); // never cut earlier than this into a part

const JSON_HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Unit = {
  id: number;
  text: string;
  course_id: string | null;
  bucket: string | null;
  file_name: string | null;
};

type Part = { part_no: number; start: number; end: number };

/** The text as an array of code points — the unit part_range is measured in. */
function codePoints(text: string): string[] {
  return Array.from(text);
}

/**
 * Find the end offset for a part starting at `start`, preferring natural boundaries.
 * `cps` is the unit's text as code points; every offset here is a code-point offset.
 */
function findCut(cps: string[], start: number): number {
  const hardEnd = Math.min(start + PART_TARGET, cps.length);
  if (hardEnd >= cps.length) return cps.length;
  const win = hardEnd - start; // window length, in code points

  // 1. paragraph boundary
  for (let i = win - 2; i >= MIN_CUT; i--) {
    if (cps[start + i] === "\n" && cps[start + i + 1] === "\n") return start + i + 2;
  }

  // 2. sentence boundary: . ! ? followed by whitespace/end
  for (let i = win - 1; i >= MIN_CUT; i--) {
    const c = cps[start + i];
    if (c === "." || c === "!" || c === "?") {
      const next = i + 1 < win ? cps[start + i + 1] : undefined;
      if (next === undefined || /\s/.test(next)) return start + i + 1;
    }
  }

  // 3. any newline
  for (let i = win - 1; i >= MIN_CUT; i--) {
    if (cps[start + i] === "\n") return start + i + 1;
  }

  // 4. any whitespace
  for (let i = win - 1; i >= MIN_CUT; i--) {
    if (cps[start + i] === " ") return start + i + 1;
  }

  // 5. hard cut
  return hardEnd;
}

function chunk(cps: string[]): Part[] {
  const len = cps.length;
  if (len === 0) return [];
  if (len <= SINGLE_PART_MAX) return [{ part_no: 1, start: 0, end: len }];

  const parts: Part[] = [];
  let start = 0;
  let partNo = 1;
  while (start < len) {
    const end = findCut(cps, start);
    parts.push({ part_no: partNo++, start, end });
    if (end >= len) break;
    const next = end - PART_OVERLAP;
    start = next > start ? next : start + 1; // guarantee forward progress
  }
  return parts;
}

function header(u: Unit): string {
  return `${u.course_id ?? ""} ${u.bucket ?? ""} — ${u.file_name ?? ""}: `;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: JSON_HEADERS });
  }

  try {
    let body: {
      limit?: number;
      max_parts?: number;
      skip_parts?: number;
      dry_run?: boolean;
    } = {};
    try {
      const raw = await req.text();
      if (raw.trim()) body = JSON.parse(raw);
    } catch {
      body = {};
    }
    const num = (v: unknown, dflt: number, lo: number, hi: number) => {
      const n = Number(v);
      return v == null || !Number.isFinite(n) ? dflt : Math.max(lo, Math.min(hi, n));
    };
    const limit = num(body.limit, 40, 1, 1000);
    const maxParts = num(body.max_parts, 6, 1, 500);
    // Skip the first N still-missing parts (global order: unit id, then part_no).
    // Lets a driver fan out several concurrent invocations over disjoint slices;
    // any overlap that does occur is absorbed by the duplicate-insert check below.
    const skipParts = num(body.skip_parts, 0, 0, 100000);
    const dryRun = body.dry_run === true;

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );

    // ---- parts that already exist, per unit -----------------------------------
    const done = new Map<number, Set<number>>();
    for (let from = 0; ; from += 1000) {
      const { data, error } = await sb
        .from("bb_text_embeddings")
        .select("text_id, part_no")
        .eq("model", MODEL)
        .range(from, from + 999);
      if (error) throw new Error(`read bb_text_embeddings: ${error.message}`);
      for (const r of data ?? []) {
        const k = r.text_id as number;
        let s = done.get(k);
        if (!s) done.set(k, (s = new Set<number>()));
        s.add(r.part_no as number);
      }
      if (!data || data.length < 1000) break;
    }

    // ---- full scan: classify every unit, and collect this run's work ----------
    // Chunking is cheap next to inference, so one full pass gives both the work
    // queue and an honest remaining-count.
    // parts = the missing parts queued for THIS run; missingTotal = all parts the
    // unit is still missing (larger than parts.length when max_parts truncated it).
    type Job = { unit: Unit; parts: Part[]; missingTotal: number; ok: boolean };
    const jobs: Job[] = [];
    let jobParts = 0;
    let seenMissing = 0; // counts missing parts scanned, for the skip window
    let totalUnits = 0;
    let totalParts = 0;
    let missingUnitsBefore = 0;
    let missingPartsBefore = 0;
    const scanFailed: { text_id: number; error: string }[] = [];

    const PAGE = 500;
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await sb
        .from("bb_file_text")
        .select("id, text, bb_files!inner(course_id, bucket, file_name)")
        .order("id", { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) throw new Error(`read bb_file_text: ${error.message}`);
      const rows = data ?? [];
      for (const r of rows) {
        totalUnits++;
        const id = r.id as number;
        const text = (r.text as string) ?? "";
        const parts = chunk(codePoints(text));
        totalParts += parts.length;
        if (parts.length === 0) {
          scanFailed.push({ text_id: id, error: "unit has empty text" });
          continue;
        }
        const have = done.get(id);
        const missing = have
          ? parts.filter((p) => !have.has(p.part_no))
          : parts;
        if (missing.length === 0) continue;

        missingUnitsBefore++;
        missingPartsBefore += missing.length;

        // Walk this unit's missing parts against the global skip window and the
        // per-invocation part budget.
        const take: Part[] = [];
        for (const p of missing) {
          if (seenMissing++ < skipParts) continue;
          if (jobParts + take.length >= maxParts) break;
          take.push(p);
        }
        if (take.length > 0 && jobs.length < limit) {
          // deno-lint-ignore no-explicit-any
          const f: any = Array.isArray((r as any).bb_files)
            // deno-lint-ignore no-explicit-any
            ? (r as any).bb_files[0]
            // deno-lint-ignore no-explicit-any
            : (r as any).bb_files;
          jobs.push({
            unit: {
              id,
              text,
              course_id: f?.course_id ?? null,
              bucket: f?.bucket ?? null,
              file_name: f?.file_name ?? null,
            },
            parts: take,
            missingTotal: missing.length,
            ok: false,
          });
          jobParts += take.length;
        }
      }
      if (rows.length < PAGE) break;
    }

    // ---- embed + insert, one part at a time so a CPU kill keeps its progress ---
    // deno-lint-ignore no-explicit-any
    let session: any = null;
    if (!dryRun && jobs.length > 0) {
      // deno-lint-ignore no-explicit-any
      session = new (globalThis as any).Supabase.ai.Session(MODEL);
    }

    let processedUnits = 0;
    let insertedRows = 0;
    const failed: { text_id: number; error: string }[] = [...scanFailed];

    for (const job of jobs) {
      const u = job.unit;
      try {
        if (dryRun) {
          processedUnits++;
          continue;
        }
        const head = header(u);
        // Slice from the same code-point array the offsets were computed against,
        // so the text embedded is exactly the text part_range points at.
        const cps = codePoints(u.text);
        for (const p of job.parts) {
          const input = head + cps.slice(p.start, p.end).join("");
          const vec: number[] = await session.run(input, {
            mean_pool: true,
            normalize: true,
          });
          if (!Array.isArray(vec) || vec.length !== 384) {
            throw new Error(
              `unexpected embedding shape for part ${p.part_no}: ${
                Array.isArray(vec) ? vec.length : typeof vec
              }`,
            );
          }
          const { error: insErr } = await sb.from("bb_text_embeddings").insert({
            text_id: u.id,
            part_no: p.part_no,
            part_range: `[${p.start},${p.end})`,
            model: MODEL,
            embedding: JSON.stringify(vec),
          });
          // A duplicate means a concurrent run already stored this part — not a failure.
          if (insErr && insErr.code !== "23505") {
            throw new Error(`insert part ${p.part_no}: ${insErr.message}`);
          }
          if (!insErr) insertedRows++;
        }
        job.ok = true;
        processedUnits++;
      } catch (e) {
        failed.push({
          text_id: u.id,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    const remainingParts = Math.max(0, missingPartsBefore - insertedRows);
    // A unit stops being "remaining" only once every part it was missing is stored:
    // it must have succeeded AND not have been truncated by max_parts.
    const unitsCompleted = jobs.filter(
      (j) => j.ok && j.parts.length === j.missingTotal,
    ).length;
    const remainingUnits = Math.max(0, missingUnitsBefore - unitsCompleted);

    return new Response(
      JSON.stringify({
        processed_units: processedUnits,
        inserted_rows: insertedRows,
        failed,
        remaining_units: remainingUnits,
        // extras, for the batch runner / monitoring
        remaining_parts: remainingParts,
        units_completed: unitsCompleted,
        dry_run: dryRun,
        model: MODEL,
        limit,
        max_parts: maxParts,
        skip_parts: skipParts,
        parts_attempted: jobParts,
        units_selected: jobs.length,
        missing_units_before: missingUnitsBefore,
        missing_parts_before: missingPartsBefore,
        total_units: totalUnits,
        total_parts: totalParts,
      }),
      { headers: JSON_HEADERS },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : String(e) }),
      { status: 500, headers: JSON_HEADERS },
    );
  }
});

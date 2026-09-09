// bb2dash :: embed-corpus
// Embeds un-embedded bb_file_text units with the edge runtime's built-in `gte-small`
// model (384-dim, MIT, no API key) and writes them to bb_text_embeddings.
//
// POST { limit?: number = 40, dry_run?: boolean = false }
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

/** Find the end offset for a part starting at `start`, preferring natural boundaries. */
function findCut(raw: string, start: number): number {
  const hardEnd = Math.min(start + PART_TARGET, raw.length);
  if (hardEnd >= raw.length) return raw.length;
  const win = raw.slice(start, hardEnd);

  // 1. paragraph boundary
  const para = win.lastIndexOf("\n\n");
  if (para >= MIN_CUT) return start + para + 2;

  // 2. sentence boundary: . ! ? followed by whitespace/end
  for (let i = win.length - 1; i >= MIN_CUT; i--) {
    const c = win[i];
    if (c === "." || c === "!" || c === "?") {
      const next = win[i + 1];
      if (next === undefined || /\s/.test(next)) return start + i + 1;
    }
  }

  // 3. any newline
  const nl = win.lastIndexOf("\n");
  if (nl >= MIN_CUT) return start + nl + 1;

  // 4. any whitespace
  const sp = win.lastIndexOf(" ");
  if (sp >= MIN_CUT) return start + sp + 1;

  // 5. hard cut
  return hardEnd;
}

function chunk(raw: string): Part[] {
  const len = raw.length;
  if (len === 0) return [];
  if (len <= SINGLE_PART_MAX) return [{ part_no: 1, start: 0, end: len }];

  const parts: Part[] = [];
  let start = 0;
  let partNo = 1;
  while (start < len) {
    const end = findCut(raw, start);
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
    let body: { limit?: number; dry_run?: boolean } = {};
    try {
      const raw = await req.text();
      if (raw.trim()) body = JSON.parse(raw);
    } catch {
      body = {};
    }
    const limit = Math.max(
      1,
      Math.min(500, Number.isFinite(Number(body.limit)) && body.limit != null ? Number(body.limit) : 40),
    );
    const dryRun = body.dry_run === true;

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );

    // ---- which units already have gte-small embeddings ------------------------
    const embedded = new Set<number>();
    for (let from = 0; ; from += 1000) {
      const { data, error } = await sb
        .from("bb_text_embeddings")
        .select("text_id")
        .eq("model", MODEL)
        .range(from, from + 999);
      if (error) throw new Error(`read bb_text_embeddings: ${error.message}`);
      for (const r of data ?? []) embedded.add(r.text_id as number);
      if (!data || data.length < 1000) break;
    }

    const { count: totalUnits, error: countErr } = await sb
      .from("bb_file_text")
      .select("id", { count: "exact", head: true });
    if (countErr) throw new Error(`count bb_file_text: ${countErr.message}`);
    const unembeddedBefore = (totalUnits ?? 0) - embedded.size;

    // ---- pull the next `limit` un-embedded units, ordered by id ---------------
    const units: Unit[] = [];
    const PAGE = 500;
    for (let from = 0; units.length < limit; from += PAGE) {
      const { data, error } = await sb
        .from("bb_file_text")
        .select("id, text, bb_files!inner(course_id, bucket, file_name)")
        .order("id", { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) throw new Error(`read bb_file_text: ${error.message}`);
      const rows = data ?? [];
      for (const r of rows) {
        if (embedded.has(r.id as number)) continue;
        // deno-lint-ignore no-explicit-any
        const f: any = Array.isArray((r as any).bb_files)
          // deno-lint-ignore no-explicit-any
          ? (r as any).bb_files[0]
          // deno-lint-ignore no-explicit-any
          : (r as any).bb_files;
        units.push({
          id: r.id as number,
          text: (r.text as string) ?? "",
          course_id: f?.course_id ?? null,
          bucket: f?.bucket ?? null,
          file_name: f?.file_name ?? null,
        });
        if (units.length >= limit) break;
      }
      if (rows.length < PAGE) break;
    }

    // ---- chunk / embed / insert ----------------------------------------------
    // deno-lint-ignore no-explicit-any
    let session: any = null;
    if (!dryRun && units.length > 0) {
      // deno-lint-ignore no-explicit-any
      session = new (globalThis as any).Supabase.ai.Session(MODEL);
    }

    let processedUnits = 0;
    let insertedRows = 0;
    let plannedParts = 0;
    const failed: { text_id: number; error: string }[] = [];

    for (const u of units) {
      try {
        const parts = chunk(u.text);
        if (parts.length === 0) {
          throw new Error("unit has empty text");
        }
        plannedParts += parts.length;

        if (dryRun) {
          processedUnits++;
          continue;
        }

        const head = header(u);
        const rows: Record<string, unknown>[] = [];
        for (const p of parts) {
          const input = head + u.text.slice(p.start, p.end);
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
          rows.push({
            text_id: u.id,
            part_no: p.part_no,
            part_range: `[${p.start},${p.end})`,
            model: MODEL,
            embedding: JSON.stringify(vec),
          });
        }

        const { error: insErr } = await sb
          .from("bb_text_embeddings")
          .insert(rows);
        if (insErr) throw new Error(`insert: ${insErr.message}`);

        insertedRows += rows.length;
        processedUnits++;
      } catch (e) {
        failed.push({
          text_id: u.id,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    const remainingUnits = Math.max(0, unembeddedBefore - processedUnits);

    return new Response(
      JSON.stringify({
        processed_units: processedUnits,
        inserted_rows: insertedRows,
        failed,
        remaining_units: remainingUnits,
        // extras, handy for the batch runner / monitoring
        dry_run: dryRun,
        model: MODEL,
        limit,
        parts_planned: plannedParts,
        units_selected: units.length,
        unembedded_before: unembeddedBefore,
        total_units: totalUnits ?? 0,
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

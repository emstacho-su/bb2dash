// bb2dash :: _shared — tests of the chunker and of workspace-embed's pure steps
//
//   node --test supabase/functions/_shared/chunk_test.ts      (Node 22+; Deno is not on this machine)
//
// No network, no database. All text is synthetic.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  chunk,
  codePoints,
  MIN_CUT,
  PART_OVERLAP,
  PART_TARGET,
  SINGLE_PART_MAX,
} from "./chunk.ts";
import {
  buildAnswer,
  buildEmbeddingRow,
  EMBED_MODEL,
  embeddingHeader,
  parseEmbedBody,
  pickUnits,
  planEmbedWork,
  settleUnit,
  type DocumentRow,
  type UnitRow,
} from "./embed-plan.ts";

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const embedCorpusSource = readFileSync(here("../embed-corpus/index.ts"), "utf8");
const chunkSource = readFileSync(here("./chunk.ts"), "utf8");
const embedFixture = JSON.parse(
  readFileSync(here("../../../workspace/test/fixtures/contract24/embed.json"), "utf8"),
);

/** The text of one top-level function, from its keyword to its closing brace at column 0. */
function functionText(source: string, name: string): string {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `function ${name} not found`);
  const end = source.indexOf("\n}\n", start);
  assert.ok(end > start, `end of function ${name} not found`);
  return source.slice(start, end + 2);
}

// ---------------------------------------------------------------- chunker

test("findCut is textually equal to embed-corpus/index.ts's", () => {
  assert.equal(functionText(chunkSource, "findCut"), functionText(embedCorpusSource, "findCut"));
});

test("chunk is textually equal to embed-corpus/index.ts's", () => {
  assert.equal(functionText(chunkSource, "chunk"), functionText(embedCorpusSource, "chunk"));
});

test("the chunking constants have embed-corpus's values", () => {
  const read = (name: string) => Number(new RegExp(`const ${name} = (\\d+);`).exec(embedCorpusSource)?.[1]);
  assert.equal(SINGLE_PART_MAX, read("SINGLE_PART_MAX"));
  assert.equal(PART_TARGET, read("PART_TARGET"));
  assert.equal(PART_OVERLAP, read("PART_OVERLAP"));
  assert.equal(MIN_CUT, Math.floor(PART_TARGET * 0.5));
});

test("empty text gives no part and short text gives one", () => {
  assert.deepEqual(chunk(codePoints("")), []);
  assert.deepEqual(chunk(codePoints("abc")), [{ part_no: 1, start: 0, end: 3 }]);
});

test("an astral character does not shift a part range", () => {
  const sentence = "Synthetic sentence about osmosis. ";
  const plain = sentence.repeat(120);
  const withEmoji = "\u{1F9EA}" + plain.slice(1); // one code point in place of one
  assert.equal(codePoints(withEmoji).length, codePoints(plain).length);
  assert.notEqual(withEmoji.length, plain.length); // UTF-16 length differs by one
  const a = chunk(codePoints(plain));
  const b = chunk(codePoints(withEmoji));
  assert.ok(a.length > 1);
  assert.deepEqual(b, a);
  const last = b[b.length - 1]!;
  assert.equal(last.end, codePoints(withEmoji).length);
});

test("embeddingHeader names course, kind and title", () => {
  assert.equal(
    embeddingHeader({ kind: "upload", title: "lab-notes.pdf", course_id: "BIO.110" }),
    "BIO.110 upload — lab-notes.pdf: ",
  );
  assert.equal(embeddingHeader({ kind: "memory", title: null, course_id: null }), " memory — : ");
});

// ---------------------------------------------------------------- body

test("a body with no document_id is refused", () => {
  const bad = [{}, null, [], "x", { document_id: null }, { document_id: "17" }, { document_id: 0 },
    { document_id: 1.5 }, { document_id: -3 }];
  for (const raw of bad) {
    const parsed = parseEmbedBody(raw);
    assert.equal(parsed.ok, false, JSON.stringify(raw));
  }
});

test("a body parses with embed-corpus's defaults and clamps", () => {
  const parsed = parseEmbedBody({ document_id: 17 });
  assert.deepEqual(parsed, { ok: true, body: { documentId: 17, limit: 40, maxParts: 6, dryRun: false } });
  const clamped = parseEmbedBody({ document_id: 17, limit: 99999, max_parts: 0, dry_run: true });
  assert.deepEqual(clamped, { ok: true, body: { documentId: 17, limit: 1000, maxParts: 1, dryRun: true } });
});

// ---------------------------------------------------------------- unit picker

const doc = (state: string, id = 17): DocumentRow => ({
  id, kind: "upload", title: "lab-notes.pdf", course_id: "BIO.110", state,
});
const unit = (id: number, document_id: number, text = "Synthetic text.", embedded_at: string | null = null): UnitRow => ({
  id, document_id, text, embedded_at,
});

test("the picker returns no unit of another document", () => {
  const units = [unit(1, 17), unit(2, 18), unit(3, 17)];
  assert.deepEqual(pickUnits(17, doc("text_ready"), units).map((u) => u.id), [1, 3]);
});

test("the picker returns nothing for a document in failed or deleting, or for none", () => {
  const units = [unit(1, 17)];
  assert.deepEqual(pickUnits(17, doc("failed"), units), []);
  assert.deepEqual(pickUnits(17, doc("deleting"), units), []);
  assert.deepEqual(pickUnits(17, null, units), []);
  assert.deepEqual(pickUnits(17, doc("text_ready", 99), units), []);
  assert.equal(pickUnits(17, doc("indexed"), units).length, 1);
});

// ---------------------------------------------------------------- planner

test("the plan queues missing parts, skips stored ones and respects limit and max_parts", () => {
  const long = "Synthetic sentence about diffusion. ".repeat(100); // several parts
  const parts = chunk(codePoints(long));
  assert.ok(parts.length >= 3);
  const units = [unit(1, 17, long), unit(2, 17, "short"), unit(3, 17, "another short")];
  const done = new Map([[1, new Set([1])]]);
  const plan = planEmbedWork({ units, done, limit: 2, maxParts: 4 });
  assert.equal(plan.missingPartsBefore, parts.length - 1 + 2);
  assert.equal(plan.jobs.length, 2);
  assert.equal(plan.jobs[0]!.parts[0]!.part_no, 2);
  assert.ok(plan.jobs.reduce((n, j) => n + j.parts.length, 0) <= 4);
});

test("a unit whose parts are all stored but which is not marked is queued for a mark alone", () => {
  const plan = planEmbedWork({
    units: [unit(5, 17, "short", null), unit(6, 17, "short", "2026-10-08T00:00:00Z")],
    done: new Map([[5, new Set([1])], [6, new Set([1])]]),
    limit: 40, maxParts: 6,
  });
  assert.deepEqual(plan.markOnly, [5]);
  assert.equal(plan.jobs.length, 0);
  assert.equal(plan.missingPartsBefore, 0);
});

test("a unit with no text is reported in failed and never marked", () => {
  const plan = planEmbedWork({
    units: [unit(7, 17, ""), unit(8, 17, "ok")], done: new Map(), limit: 40, maxParts: 6,
  });
  assert.deepEqual(plan.scanFailed, [{ text_id: 7, error: "unit has empty text" }]);
  assert.deepEqual(plan.markOnly, []);
  assert.equal(plan.jobs.length, 1);
});

// ---------------------------------------------------------------- write step

const P = (n: number) => ({ part_no: n, start: 0, end: 1 });

test("the write step builds a row that names gte-small", () => {
  const row = buildEmbeddingRow(9, { part_no: 2, start: 10, end: 20 }, [0.5, 0.25]);
  assert.deepEqual(row, {
    text_id: 9, part_no: 2, part_range: "[10,20)", model: "gte-small", embedding: "[0.5,0.25]",
  });
  assert.equal(EMBED_MODEL, "gte-small");
});

test("an insert refused with 23505 counts as stored, not failed", () => {
  const out = settleUnit({
    allParts: [P(1), P(2)], have: new Set(),
    attempted: [
      { part_no: 1, error: null },
      { part_no: 2, error: { code: "23505", message: "duplicate key" } },
    ],
  });
  assert.equal(out.inserted, 1);
  assert.equal(out.duplicates, 1);
  assert.equal(out.error, null);
  assert.equal(out.markEmbedded, true);
});

test("any other insert error fails the unit and leaves it unmarked", () => {
  const out = settleUnit({
    allParts: [P(1), P(2)], have: new Set(),
    attempted: [{ part_no: 1, error: null }, { part_no: 2, error: { code: "23503", message: "fk" } }],
  });
  assert.equal(out.markEmbedded, false);
  assert.equal(out.inserted, 1);
  assert.match(out.error ?? "", /part 2.*fk/);
});

test("a unit is marked when none of its parts is missing, even if this call stored none", () => {
  const out = settleUnit({ allParts: [P(1), P(2)], have: new Set([1, 2]), attempted: [] });
  assert.equal(out.markEmbedded, true);
  assert.equal(out.inserted, 0);
  assert.equal(out.error, null);
});

test("a unit with a part still missing is not marked", () => {
  const out = settleUnit({ allParts: [P(1), P(2), P(3)], have: new Set([1]), attempted: [{ part_no: 2, error: null }] });
  assert.equal(out.markEmbedded, false);
  assert.equal(out.error, null);
});

test("a unit whose text gives no part is reported failed, not marked", () => {
  const out = settleUnit({ allParts: [], have: new Set(), attempted: [] });
  assert.equal(out.markEmbedded, false);
  assert.equal(out.error, "unit has empty text");
});

// ---------------------------------------------------------------- answer

test("the answer's keys equal embed.json's", () => {
  const answer = buildAnswer({
    documentId: 17, dryRun: false, limit: 40, maxParts: 3,
    processedUnits: 2, unitsCompleted: 2, insertedRows: 3, storedRows: 3,
    failed: [], missingPartsBefore: 3,
  });
  assert.deepEqual(Object.keys(answer).sort(), Object.keys(embedFixture.answer).sort());
  assert.deepEqual(answer, embedFixture.answer);
});

test("remaining parts count a duplicate as stored", () => {
  const answer = buildAnswer({
    documentId: 17, dryRun: false, limit: 40, maxParts: 3,
    processedUnits: 1, unitsCompleted: 1, insertedRows: 1, storedRows: 3,
    failed: [], missingPartsBefore: 3,
  });
  assert.equal(answer.inserted_rows, 1);
  assert.equal(answer.remaining_parts, 0);
});

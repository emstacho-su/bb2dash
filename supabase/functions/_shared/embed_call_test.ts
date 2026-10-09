// bb2dash :: _shared — round 3: a workspace-embed call is proportional to the work left.
//   node --test supabase/functions/_shared/embed_call_test.ts
// A fake store plays the tables; a fake embedder plays gte-small. Synthetic text only.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { chunk, codePoints } from "./chunk.ts";
import { type EmbedStore, runEmbedCall } from "./embed-call.ts";
import type { DocumentRow, EmbeddingRow, UnitRow } from "./embed-plan.ts";

const embedFixture = JSON.parse(
  readFileSync(fileURLToPath(new URL("../../../workspace/test/fixtures/contract24/embed.json", import.meta.url)), "utf8"),
);

class FakeStore implements EmbedStore {
  units: UnitRow[];
  parts = new Map<number, Set<number>>();
  rows: EmbeddingRow[] = [];
  textUnitsRead = 0;
  doneIdsRead = 0;
  document: DocumentRow;
  constructor(document: DocumentRow, units: UnitRow[]) { this.document = document; this.units = units; }
  async readDocument(id: number) { return id === this.document.id ? this.document : null; }
  async countUnmarked(documentId: number) {
    return this.units.filter((u) => u.document_id === documentId && u.embedded_at === null).length;
  }
  async readUnmarked(documentId: number, max: number) {
    const out = this.units.filter((u) => u.document_id === documentId && u.embedded_at === null).slice(0, max);
    this.textUnitsRead += out.length;
    return out.map((u) => ({ ...u }));
  }
  async readDoneParts(ids: number[]) {
    this.doneIdsRead += ids.length;
    return new Map(ids.filter((i) => this.parts.has(i)).map((i) => [i, new Set(this.parts.get(i)!)]));
  }
  async insertPart(row: EmbeddingRow) {
    const set = this.parts.get(row.text_id) ?? new Set<number>();
    if (set.has(row.part_no)) return { code: "23505", message: "duplicate key" };
    set.add(row.part_no); this.parts.set(row.text_id, set); this.rows.push(row);
    return null;
  }
  async markEmbedded(unitId: number) {
    this.units = this.units.map((u) => (u.id === unitId ? { ...u, embedded_at: "2026-10-09T00:00:00Z" } : u));
  }
}

const doc = (state = "text_ready"): DocumentRow => ({ id: 17, kind: "upload", title: "t.pdf", course_id: null, state });
const unit = (id: number, text: string, marked = false): UnitRow => ({
  id, document_id: 17, text, embedded_at: marked ? "2026-10-01T00:00:00Z" : null,
});
const embed = async () => Array(384).fill(0.1);
const body = (o: Partial<{ limit: number; maxParts: number; dryRun: boolean }> = {}) =>
  ({ documentId: 17, limit: 40, maxParts: 3, dryRun: false, ...o });

test("a document of 300 units, 290 marked, reads the text of 10 units, not 300", async () => {
  const units = Array.from({ length: 300 }, (_, i) => unit(i + 1, `Synthetic unit ${i + 1}.`, i >= 10));
  const store = new FakeStore(doc(), units);
  const out = await runEmbedCall(store, embed, body({ maxParts: 10 }));
  assert.equal(store.textUnitsRead, 10);
  assert.equal(store.doneIdsRead, 10);
  assert.equal(out.status, 200);
  assert.equal((out.answer as { remaining_parts: number }).remaining_parts, 0);
});

test("the loop ends with remaining_parts 0 exactly when the last part is stored", async () => {
  const long = "Synthetic sentence about diffusion. ".repeat(100);
  const per = chunk(codePoints(long)).length;
  const units = Array.from({ length: 12 }, (_, i) => unit(i + 1, i % 2 ? long : `short ${i}`));
  const total = units.reduce((n, u) => n + chunk(codePoints(u.text)).length, 0);
  assert.ok(per > 2);
  const store = new FakeStore(doc(), units);
  let calls = 0;
  let stored = 0;
  for (; calls < 100; calls++) {
    const out = await runEmbedCall(store, embed, body());
    const a = out.answer as { remaining_parts: number; inserted_rows: number; failed: unknown[] };
    stored += a.inserted_rows;
    assert.equal(a.failed.length, 0);
    if (a.remaining_parts === 0) break;
    assert.ok(stored < total, "remaining_parts must not reach 0 before the last part is stored");
  }
  assert.equal(stored, total);
  assert.equal(store.rows.length, total);
  assert.ok(store.units.every((u) => u.embedded_at !== null));
  assert.ok(store.rows.every((r) => r.model === "gte-small"));
});

test("remaining_parts is never 0 while an unmarked unit is out of the window", async () => {
  const units = Array.from({ length: 9 }, (_, i) => unit(i + 1, `short ${i}`));
  const store = new FakeStore(doc(), units);
  const first = (await runEmbedCall(store, embed, body())).answer as { remaining_parts: number; missing_parts_before: number };
  assert.equal(first.missing_parts_before, 9); // 3 read exactly + 6 unread, one part each at least
  assert.equal(first.remaining_parts, 6);
});

test("a 23505 counts as stored and a unit with all parts present is marked", async () => {
  const store = new FakeStore(doc(), [unit(1, "short one"), unit(2, "short two")]);
  store.parts.set(1, new Set([1]));
  const out = await runEmbedCall(store, embed, body());
  const a = out.answer as { inserted_rows: number; remaining_parts: number };
  assert.equal(a.inserted_rows, 1);
  assert.equal(a.remaining_parts, 0);
  assert.ok(store.units.every((u) => u.embedded_at !== null));
});

test("a unit with no text is reported failed and never marked", async () => {
  const store = new FakeStore(doc(), [unit(1, ""), unit(2, "ok")]);
  const a = (await runEmbedCall(store, embed, body())).answer as { failed: Array<{ text_id: number }> };
  assert.deepEqual(a.failed.map((f) => f.text_id), [1]);
  assert.equal(store.units[0]!.embedded_at, null);
  assert.notEqual(store.units[1]!.embedded_at, null);
});

test("failed and deleting documents read no text; a missing one is 404", async () => {
  for (const state of ["failed", "deleting"]) {
    const store = new FakeStore(doc(state), [unit(1, "x")]);
    const out = await runEmbedCall(store, embed, body());
    assert.equal(out.status, 200);
    assert.equal(store.textUnitsRead, 0);
    assert.equal((out.answer as { remaining_parts: number }).remaining_parts, 0);
  }
  const none = await runEmbedCall(new FakeStore(doc(), []), embed, { ...body(), documentId: 99 });
  assert.equal(none.status, 404);
});

test("dry_run writes nothing and the answer's keys equal embed.json's", async () => {
  const store = new FakeStore(doc(), [unit(1, "short")]);
  const out = await runEmbedCall(store, embed, body({ dryRun: true }));
  assert.equal(store.rows.length, 0);
  assert.equal(store.units[0]!.embedded_at, null);
  assert.deepEqual(Object.keys(out.answer).sort(), Object.keys(embedFixture.answer).sort());
});

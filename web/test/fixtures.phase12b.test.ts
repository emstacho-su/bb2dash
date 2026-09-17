/**
 * The Phase 12b database fixtures (`db/fixtures/phase12b/`), for G-7a.
 *
 * Three jobs:
 *   1. Both fixtures parse and carry the shape `stage_attempts` reads — the v4 chain and the v3
 *      payload with the empty `results[]` every column really returned.
 *   2. The v4 fixture cannot drift from the crawler: `payload.attempts` is re-derived here from
 *      the invented raw responses the fixture carries, through the real mappers, and compared.
 *   3. `db/tests/phase12b_load_fixture.sql` is generated, and a generated file nobody regenerates
 *      is a lie — the generator is re-run in memory and compared against the committed copy.
 *
 * Loaded through `createRequire`: these are plain files outside the Vite root, not app modules.
 */

import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const FIXTURES = path.join(REPO, 'db', 'fixtures', 'phase12b');

const builder = require(path.join(FIXTURES, 'build_load_sql.js')) as {
  build: () => string;
  FIXTURE_FILES: string[];
  FIXTURE_RUN_ID: string;
  OUT_PATH: string;
};

const crawler = require(path.join(REPO, 'ingest', 'bb_crawler.js')) as {
  installCrawler: (o: Record<string, unknown>) => {
    attempts: (c: string, g?: unknown[], o?: { limit?: number }) => Promise<ColumnEntry[]>;
  };
};

interface AttemptFile {
  id: string;
  name: string | null;
  size: number | null;
  mime: string | null;
  uuid: string | null;
  downloadUrl: string | null;
}

interface AttemptResult {
  id: string;
  status: string | null;
  submitted: string | null;
  score: number | null;
  files: AttemptFile[];
  text: Record<string, string | null>;
  [key: string]: unknown;
}

interface ColumnEntry {
  columnId: string;
  contentId: string | null;
  endpoint: string;
  status: number;
  keys: Record<string, string[] | undefined>;
  grade: { id: string } | null;
  attempts: { id: string }[];
  detail: Record<string, unknown>[];
  results: AttemptResult[];
}

interface RawStep { status: number; body: unknown }

interface Fixture {
  _note: string;
  run_id: string;
  kind: string;
  bb_course_id: string;
  course_id: string;
  captured_at: string;
  payload: { crawler: { version: number }; attempts: ColumnEntry[] };
  _rawResponses?: Record<string, { grade: RawStep; attempts?: RawStep; detail?: Record<string, RawStep> }>;
  _gradebookProbed?: Record<string, unknown>[];
}

const load = (name: string): Fixture =>
  JSON.parse(readFileSync(path.join(FIXTURES, name), 'utf8')) as Fixture;

const V4 = load('attempts_v4.json');
const V3 = load('attempts_v3_empty.json');

describe('both fixtures are bb_raw course rows under the fixture run', () => {
  it.each([['attempts_v4.json', V4], ['attempts_v3_empty.json', V3]] as const)(
    '%s', (_name, fx) => {
      expect(fx.kind).toBe('course');
      expect(fx.run_id).toBe(builder.FIXTURE_RUN_ID);
      expect(fx.bb_course_id).toMatch(/^_\d+_\d+$/);
      expect(Date.parse(fx.captured_at)).not.toBeNaN();
      expect(fx._note).toMatch(/SYNTHETIC/);
      expect(Array.isArray(fx.payload.attempts)).toBe(true);
    },
  );

  it('loads two different shells, so one run carries both crawler versions', () => {
    expect(V4.payload.crawler.version).toBe(4);
    expect(V3.payload.crawler.version).toBe(3);
    expect(V4.bb_course_id).not.toBe(V3.bb_course_id);
  });
});

describe('the v3 fixture is the empty answer v3 really got', () => {
  it('probes two columns and catalogues nothing', () => {
    expect(V3.payload.attempts).toHaveLength(2);
    for (const e of V3.payload.attempts) {
      expect(e.status).toBe(200);
      expect(e.results).toEqual([]);
      expect(e.endpoint).toContain('/gradebook/columns/');
    }
  });
});

describe('the v4 fixture covers the four cases the stage has to survive', () => {
  const byColumn = (c: string) => V4.payload.attempts.find((e) => e.columnId === c)!;

  it('chains exactly the four probed columns — not the calculated or unopened ones', () => {
    expect(V4.payload.attempts.map((e) => e.columnId))
      .toEqual(['_3560530_1', '_3569973_1', '_3598132_1', '_3560541_1']);
  });

  it('the happy path carries two attempts, three files, real mime types and durable URLs', () => {
    const e = byColumn('_3560530_1');
    expect(e.status).toBe(200);
    expect(e.grade!.id).toBe('_7700001_1');
    expect(e.results).toHaveLength(2);
    const files = e.results.flatMap((r) => r.files);
    expect(files).toHaveLength(3);
    for (const f of files) {
      expect(f.downloadUrl).toMatch(/^https:\/\/blackboard\.syracuse\.edu\/bbcswebdav\/xid-\d+_\d+$/);
      expect(f.mime).toMatch(/^application\//);
      expect(f.uuid).toMatch(/^[0-9a-f-]{36}$/);
      expect(typeof f.name).toBe('string');
    }
  });

  it('the shared column has one attempt and one file, for the null-assignment case', () => {
    const e = byColumn('_3569973_1');
    expect(e.results).toHaveLength(1);
    expect(e.results[0].files).toHaveLength(1);
  });

  it('a failed detail still records the submission, without files', () => {
    const e = byColumn('_3598132_1');
    expect(e.status).toBe(500);
    expect(e.detail).toEqual([]);
    expect(e.results).toHaveLength(1);
    expect(e.results[0].files).toEqual([]);
  });

  it('a refused column stops at step 1 and catalogues nothing', () => {
    const e = byColumn('_3560541_1');
    expect(e.status).toBe(403);
    expect(e.grade).toBeNull();
    expect(e.results).toEqual([]);
  });

  it('keeps every prose field nested under `text`, never at the top level', () => {
    for (const r of V4.payload.attempts.flatMap((e) => e.results)) {
      expect(r).not.toHaveProperty('feedback');
      expect(r).not.toHaveProperty('studentSubmission');
      expect(r).not.toHaveProperty('studentComments');
      expect(Object.keys(r.text).sort())
        .toEqual(['instructorFeedback', 'studentComments', 'studentSubmission']);
    }
  });

  it('invents every value that could identify real work', () => {
    const text = JSON.stringify(V4.payload);
    expect(text).not.toMatch(/estack|estacho|Stachowiak/i);
    for (const r of V4.payload.attempts.flatMap((e) => e.results)) {
      expect(r.id).toMatch(/^_81000\d\d_1$/);
      for (const f of r.files) expect(f.name).toMatch(/^(unit-one|term-plan)/);
    }
  });
});

describe('the v4 fixture is exactly what crawler v4 emits', () => {
  const original = globalThis.fetch;
  afterEach(() => { globalThis.fetch = original; });

  it('re-derives payload.attempts from the invented raw responses', async () => {
    const raw = V4._rawResponses!;
    globalThis.fetch = vi.fn(async (url: string) => {
      const u = String(url);
      const col = (u.match(/columns\/(_\d+_\d+)/) ?? u.match(/columnId=(_\d+_\d+)/) ?? [])[1]!;
      const entry = raw[col]!;
      const r = /\/grades\?/.test(u)
        ? entry.grade
        : /\/grades\/[^/]+\/attempts$/.test(u)
          ? entry.attempts!
          : entry.detail![(u.match(/attempts\/(_\d+_\d+)\?/) ?? [])[1]!]!;
      return { ok: r.status >= 200 && r.status <= 299, status: r.status, json: async () => r.body };
    }) as unknown as typeof fetch;

    const out = await crawler
      .installCrawler({ userId: '_21025199_1', supabaseUrl: 'https://example.invalid', anonKey: 'k' })
      .attempts(V4.bb_course_id, V4._gradebookProbed!);

    expect(
      out,
      'db/fixtures/phase12b/attempts_v4.json no longer matches ingest/bb_crawler.js',
    ).toEqual(V4.payload.attempts);
  });
});

describe('db/tests/phase12b_load_fixture.sql is in sync with the fixtures', () => {
  it('is exactly what the generator produces today', () => {
    const committed = readFileSync(builder.OUT_PATH, 'utf8').replace(/\r\n/g, '\n');
    expect(
      builder.build(),
      'db/tests/phase12b_load_fixture.sql is stale — run: node db/fixtures/phase12b/build_load_sql.js',
    ).toBe(committed);
  });

  it('loads both fixture files', () => {
    expect(builder.FIXTURE_FILES).toEqual(['attempts_v3_empty.json', 'attempts_v4.json']);
  });
});

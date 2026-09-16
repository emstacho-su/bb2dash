/**
 * The Phase 10a database fixtures (`db/fixtures/phase10a/`).
 *
 * Two jobs:
 *   1. The loader test the Contract asks for — every fixture parses, and carries the shape the
 *      stages read (migrations 046 and 050). A fixture that stopped being valid JSON, or lost a
 *      key a stage depends on, would otherwise only be caught by running SQL against prod.
 *   2. A drift guard — `db/tests/phase10a_load_fixtures.sql` is generated from these files, and
 *      a generated file that nobody regenerates is a lie. The generator is re-run in memory here
 *      and compared against the committed copy.
 *
 * Loaded through `createRequire`, the same way crawler.announcements.test.ts loads the crawler:
 * these are plain files outside the Vite root, not app modules.
 */

import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const FIXTURES = path.join(REPO, 'db', 'fixtures', 'phase10a');

const builder = require(path.join(FIXTURES, 'build_load_sql.js')) as {
  build: () => string;
  FIXTURE_FILES: string[];
  FIXTURE_RUN_ID: string;
  OUT_PATH: string;
};

interface GradebookColumn {
  columnId: string;
  name: string;
  isCalc: boolean;
  possible: number | null;
  effectiveScore: number | null;
  score: number | null;
  submissionStatus: string | null;
  displayGrade: { score?: number; grade?: string; isOverride?: boolean } | null;
  formula: { isTotalCalculation?: boolean } | null;
  [key: string]: unknown;
}

interface AttemptResult {
  id: string;
  status: string | null;
  created: string | null;
  submitted: string | null;
  score: number | null;
  feedback: string | null;
  files: { id: string; name: string; size: number; downloadUrl: string }[];
  keys?: string[];
  [key: string]: unknown;
}

interface AttemptProbe {
  columnId: string;
  contentId: string | null;
  endpoint: string;
  status: number;
  results: AttemptResult[];
}

interface Fixture {
  run_id: string;
  kind: string;
  bb_course_id: string;
  course_id: string;
  captured_at: string;
  payload: {
    crawler?: { version?: number };
    course?: { id?: string };
    gradebook?: GradebookColumn[];
    attempts?: AttemptProbe[];
  };
}

const load = (name: string): Fixture =>
  JSON.parse(readFileSync(path.join(FIXTURES, name), 'utf8')) as Fixture;

const GRADEBOOK_FILES = ['gradebook_ECN304.json', 'gradebook_IST323.json', 'gradebook_IST471.json'];

describe('the gradebook fixtures parse and carry what stage_gradebook reads', () => {
  it.each(GRADEBOOK_FILES)('%s is a bb_raw course row', (name) => {
    const fx = load(name);
    expect(fx.kind).toBe('course');
    expect(fx.bb_course_id).toMatch(/^_\d+_\d+$/);
    expect(fx.course_id).toMatch(/^[A-Z]{3}\.\d{3}/);
    expect(Date.parse(fx.captured_at)).not.toBeNaN();
    expect(fx.payload.crawler?.version).toBe(3);
    expect(Array.isArray(fx.payload.gradebook)).toBe(true);
    expect(fx.payload.gradebook!.length).toBeGreaterThan(0);
  });

  it.each(GRADEBOOK_FILES)('%s: every column has the keys the stage maps', (name) => {
    for (const g of load(name).payload.gradebook!) {
      expect(g.columnId).toMatch(/^_\d+_\d+$/);
      expect(typeof g.name).toBe('string');
      expect(g.name.trim().length).toBeGreaterThan(0);
      expect(typeof g.isCalc).toBe('boolean');
      for (const key of ['possible', 'effectiveScore', 'submissionStatus', 'displayGrade', 'lastAttempt']) {
        expect(g, `${g.name} is missing ${key}`).toHaveProperty(key);
      }
    }
  });

  it('never carries g.score, which migration 046 refuses to read', () => {
    for (const name of GRADEBOOK_FILES) {
      for (const g of load(name).payload.gradebook!) {
        expect(g.score, `${name}: ${g.name}`).toBeNull();
      }
    }
  });

  it('covers 20 columns across three courses, with no duplicate column id in a course', () => {
    let total = 0;
    for (const name of GRADEBOOK_FILES) {
      const cols = load(name).payload.gradebook!;
      total += cols.length;
      expect(new Set(cols.map((c) => c.columnId)).size).toBe(cols.length);
    }
    expect(total).toBe(20);
  });

  it('covers every column_kind the Contract defines except calc_other', () => {
    const cols = GRADEBOOK_FILES.flatMap((n) => load(n).payload.gradebook!);
    const total = cols.filter((c) => c.isCalc && c.formula?.isTotalCalculation === true);
    const letter = cols.filter((c) => !c.isCalc && /letter grade/i.test(c.name));
    const attendance = cols.filter((c) => !c.isCalc && /attendance|absence/i.test(c.name));

    expect(total.map((c) => c.name)).toEqual(['Total Score']);
    expect(letter.map((c) => c.name)).toEqual(['Final Letter Grade']);
    expect(attendance.map((c) => c.name)).toEqual(['Attendance']);
    // calc_other has no real example: every calculated column on this project is the total.
    expect(cols.filter((c) => c.isCalc && c.formula?.isTotalCalculation !== true)).toHaveLength(0);
  });

  it('keeps the awkward real values the mirror has to survive', () => {
    const ecn = load('gradebook_ECN304.json').payload.gradebook!;
    // 83.33333 does not fit numeric(9,3); the stage stores 83.333 and the reconciliation
    // compares at that scale rather than pretending the two are the same number.
    expect(ecn.find((c) => c.name === 'Attendance')!.effectiveScore).toBe(83.33333);
    expect(ecn.find((c) => c.name === 'Quiz 1')!.displayGrade!.isOverride).toBe(true);

    const ist323 = load('gradebook_IST323.json').payload.gradebook!;
    expect(ist323.find((c) => c.name === 'Individual Presentation Selection')!.displayGrade!.grade)
      .toBe('Complete');
    // The column linked to two assignments, which must resolve to assignment_id null.
    expect(ist323.some((c) => c.columnId === '_3569973_1')).toBe(true);

    const ist471 = load('gradebook_IST471.json').payload.gradebook!;
    expect(ist471.find((c) => c.columnId === '_3599884_1')!.feedback)
      .toBe('Please post on the discussion board for others to see.');
  });
});

describe('the synthetic attempts fixture matches the frozen payload shape', () => {
  const fx = load('attempts_synthetic.json');

  it('says out loud that it is synthetic', () => {
    expect(String((fx as unknown as { _note: string })._note)).toMatch(/SYNTHETIC/);
  });

  it('loads under the fixture run id, never a real crawl', () => {
    expect(fx.run_id).toBe(builder.FIXTURE_RUN_ID);
  });

  it('probes four columns, one of which failed', () => {
    const probes = fx.payload.attempts!;
    expect(probes).toHaveLength(4);
    expect(probes.filter((p) => p.status < 200 || p.status > 299)).toHaveLength(1);
    for (const p of probes) {
      expect(p.columnId).toMatch(/^_\d+_\d+$/);
      expect(p.endpoint).toContain('/gradebook/columns/');
      expect(Array.isArray(p.results)).toBe(true);
    }
  });

  it('carries every attempt field the stage maps, and no invented ones', () => {
    const expected = [
      'id', 'status', 'created', 'modified', 'submitted', 'score', 'feedback',
      'studentComments', 'studentSubmission', 'exempt', 'receipt', 'files',
    ];
    const results = fx.payload.attempts!.flatMap((p) => p.results);
    expect(results).toHaveLength(4);
    for (const r of results) {
      for (const key of expected) expect(r, `attempt ${r.id} is missing ${key}`).toHaveProperty(key);
      for (const f of r.files) {
        expect(f.downloadUrl).toMatch(
          /^https:\/\/blackboard\.syracuse\.edu\/learn\/api\/v1\/courses\/_\d+_\d+\/gradebook\/attempts\/_\d+_\d+\/files\/_\d+_\d+\/download$/,
        );
        expect(typeof f.name).toBe('string');
        expect(typeof f.size).toBe('number');
      }
    }
    expect(results.flatMap((r) => r.files)).toHaveLength(3);
  });

  it('carries a keys probe on the first attempt of a column, and not on later ones', () => {
    const [quiz] = fx.payload.attempts!;
    expect(quiz.results[0].keys!.length).toBeGreaterThan(0);
    expect(quiz.results[1].keys).toBeUndefined();
  });

  it('keeps one attempt with feedback that looks like markup, unescaped', () => {
    const withMarkup = fx.payload.attempts!
      .flatMap((p) => p.results)
      .filter((r) => typeof r.feedback === 'string' && r.feedback.includes('<'));
    expect(withMarkup).toHaveLength(1);
    expect(withMarkup[0].feedback).toContain('<b>');
  });
});

describe('db/tests/phase10a_load_fixtures.sql is in sync with the fixtures', () => {
  it('is exactly what the generator produces today', () => {
    const committed = readFileSync(builder.OUT_PATH, 'utf8').replace(/\r\n/g, '\n');
    expect(
      builder.build(),
      'db/tests/phase10a_load_fixtures.sql is stale — run: node db/fixtures/phase10a/build_load_sql.js',
    ).toBe(committed);
  });

  it('loads every fixture file the generator knows about', () => {
    expect(builder.FIXTURE_FILES).toEqual([...GRADEBOOK_FILES, 'attempts_synthetic.json']);
  });
});

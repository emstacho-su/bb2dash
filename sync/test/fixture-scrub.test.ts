// Task 8 (P-35): the recorded crawl the runner's tests replay is a real crawler v4 run with Stack's
// own text, the text written to him and his grades removed before it reached this public repo.

import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  EXPECTED_KINDS,
  FIXTURE_PATH,
  LOADER_PATH,
  SCRUB_FIELDS,
  buildFixture,
  buildLoadSql,
  kindCounts,
  readFixture,
  readLoader,
  scrubValue,
  unscrubbedPaths,
} from '../../db/fixtures/phase14/scrub_crawl.mjs';

interface FixtureRow {
  kind: string;
  bb_course_id: string | null;
  captured_at: string;
  payload: unknown;
}

const fixture = readFixture() as { _source: { run_id: string; scrub_fields: string[] }; rows: FixtureRow[] };

describe('the scrubbed recorded crawl', () => {
  it('holds the nine rows of one crawler v4 run: calendar 1, course 7, memberships 1', () => {
    expect(fixture.rows).toHaveLength(9);
    expect(kindCounts(fixture.rows)).toEqual({ calendar: 1, course: 7, memberships: 1 });
    expect(EXPECTED_KINDS).toEqual({ calendar: 1, course: 7, memberships: 1 });
  });

  it('names studentSubmission among SCRUB_FIELDS, and records the list it was scrubbed with', () => {
    expect(SCRUB_FIELDS).toContain('studentSubmission');
    expect(fixture._source.scrub_fields).toEqual([...SCRUB_FIELDS]);
  });

  it('leaves no SCRUB_FIELDS key holding a value, at any depth', () => {
    expect(unscrubbedPaths(fixture.rows)).toEqual([]);
  });

  it('carries no scrub field inside a JSON string either', () => {
    const text = fs.readFileSync(FIXTURE_PATH, 'utf8');
    for (const field of SCRUB_FIELDS) {
      // An escaped key (\"field\") means a payload held serialised JSON the walk could not see.
      expect(text.includes(`\\"${field}\\"`), field).toBe(false);
    }
  });

  it('is what the committed loader loads, byte for byte', () => {
    expect(fs.existsSync(LOADER_PATH)).toBe(true);
    expect(readLoader()).toBe(buildLoadSql(fixture));
  });
});

describe('scrubValue', () => {
  it('nulls every scrub key at any depth and counts what it removed, without touching its input', () => {
    const input = {
      a: { studentSubmission: 'my essay', keep: 'course text' },
      list: [{ feedback: 'Late.', score: 0 }, { displayGrade: { grade: 'A', score: 10 } }],
      empty: { studentComments: null, receipt: '' },
    };
    const before = JSON.stringify(input);
    const { value, removed } = scrubValue(input);
    expect(JSON.stringify(input)).toBe(before);
    expect(removed).toBe(4);
    expect(value).toEqual({
      a: { studentSubmission: null, keep: 'course text' },
      list: [{ feedback: null, score: null }, { displayGrade: null }],
      empty: { studentComments: null, receipt: null },
    });
  });

  it('builds a fixture in crawl order and reports the values removed', () => {
    const built = buildFixture(
      [
        { kind: 'calendar', bb_course_id: null, captured_at: '2026-09-23T19:54:57Z', payload: { items: [] } },
        { kind: 'memberships', bb_course_id: null, captured_at: '2026-09-23T19:54:31Z', payload: { email: 'x@y' } },
      ],
      { run_id: 'r' },
    );
    expect(built.rows.map((r: FixtureRow) => r.kind)).toEqual(['memberships', 'calendar']);
    expect(built._source.values_removed).toBe(1);
    expect(unscrubbedPaths(built.rows)).toEqual([]);
  });

  it('finds a scrub key that still holds a value', () => {
    expect(unscrubbedPaths({ x: [{ studentSubmission: 'text' }] })).toEqual(['$.x[0].studentSubmission']);
  });
});

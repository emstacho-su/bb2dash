/**
 * M-1 / P-materials-1 and P-materials-3 — blocking the readings, and folding
 * a section away.
 *
 * The Readings bucket was one flat list per course: 38 rows for ECN 304 in
 * `week_no` then `id` order, with no sign of which ones belong together. They
 * are now blocked by `readings.for_date`.
 *
 * The undated tail is two groups, not one, and the distinction is the point.
 * IST.466's HBR cases have no date because they are a POOL the course picks
 * from — nine of the ten are assigned to other ethics groups (Stack's answer
 * 7). A required reading with no date is something else entirely: a gap.
 * Calling both "no date" would hide the gap; calling both "case pool" would
 * invent a pool.
 */

import { afterEach, describe, expect, it } from 'vitest';
import {
  CASE_POOL_HEADING,
  UNDATED_HEADING,
  groupReadings,
  readingDateHeading,
  type ReadingRow,
} from '@/lib/queries.materials';
import {
  MATERIALS_COLLAPSE_KEY,
  readCollapsed,
  sectionKey,
  toggleCollapsed,
  writeCollapsed,
} from '@/lib/materials-collapse';

let nextId = 1;
function reading(overrides: Partial<ReadingRow> = {}): ReadingRow {
  return {
    id: nextId++,
    course_id: 'ECN.304',
    citation: 'Chapter 1',
    topic: null,
    for_date: '2026-09-10',
    week_no: 1,
    required: true,
    on_blackboard: false,
    url: null,
    notes: null,
    confidence: 'confirmed',
    source: 'syllabus',
    ...overrides,
  } as ReadingRow;
}

describe('readingDateHeading', () => {
  it('names the day without shifting it', () => {
    // `new Date('2026-09-24')` is UTC midnight, which is the 23rd anywhere west
    // of Greenwich. Parsing field by field is why this is the 24th.
    expect(readingDateHeading('2026-09-24')).toBe('Thu, Sep 24');
    expect(readingDateHeading('2026-01-01')).toBe('Thu, Jan 1');
  });

  it('prints an unparseable value as itself rather than "Invalid Date"', () => {
    expect(readingDateHeading('not-a-date')).toBe('not-a-date');
  });
});

describe('groupReadings — dated blocks', () => {
  it('blocks readings under the date they are assigned for', () => {
    const groups = groupReadings([
      reading({ for_date: '2026-09-10', citation: 'A' }),
      reading({ for_date: '2026-09-17', citation: 'B' }),
      reading({ for_date: '2026-09-10', citation: 'C' }),
    ]);

    expect(groups.map((g) => g.heading)).toEqual(['Thu, Sep 10', 'Thu, Sep 17']);
    expect(groups[0].readings.map((r) => r.citation)).toEqual(['A', 'C']);
    expect(groups[1].readings.map((r) => r.citation)).toEqual(['B']);
  });

  it('puts the dates in date order, whatever order they arrive in', () => {
    const groups = groupReadings([
      reading({ for_date: '2026-10-01' }),
      reading({ for_date: '2026-09-03' }),
      reading({ for_date: '2026-09-24' }),
    ]);
    expect(groups.map((g) => g.forDate)).toEqual(['2026-09-03', '2026-09-24', '2026-10-01']);
  });

  it('keeps the caller’s order inside a block', () => {
    const groups = groupReadings([
      reading({ for_date: '2026-09-10', citation: 'first' }),
      reading({ for_date: '2026-09-10', citation: 'second' }),
    ]);
    expect(groups[0].readings.map((r) => r.citation)).toEqual(['first', 'second']);
  });

  it('describes nothing as nothing', () => {
    expect(groupReadings([])).toEqual([]);
  });
});

describe('groupReadings — the undated tail', () => {
  it('gathers the ethics cases under one Case pool header', () => {
    const cases = Array.from({ length: 9 }, (_, index) =>
      reading({
        course_id: 'IST.466',
        for_date: null,
        required: false,
        on_blackboard: true,
        citation: `HBR: case ${index + 1}`,
      }),
    );
    const groups = groupReadings([
      // Stack's own case got its date in the 073 data fix.
      reading({
        course_id: 'IST.466',
        for_date: '2026-09-24',
        required: true,
        citation: 'HBR: Apple vs. The FBI',
      }),
      ...cases,
    ]);

    expect(groups.map((g) => g.heading)).toEqual(['Thu, Sep 24', CASE_POOL_HEADING]);
    expect(groups[1].readings).toHaveLength(9);
    // All ten are still on the screen, which is what Stack asked for.
    expect(groups.flatMap((g) => g.readings)).toHaveLength(10);
  });

  it('keeps a required undated reading out of the pool — that is a gap', () => {
    const groups = groupReadings([
      reading({ for_date: null, required: false, citation: 'optional' }),
      reading({ for_date: null, required: true, citation: 'required' }),
    ]);

    expect(groups.map((g) => g.heading)).toEqual([CASE_POOL_HEADING, UNDATED_HEADING]);
    expect(groups[0].readings.map((r) => r.citation)).toEqual(['optional']);
    expect(groups[1].readings.map((r) => r.citation)).toEqual(['required']);
  });

  it('puts both undated groups last, after every date', () => {
    const groups = groupReadings([
      reading({ for_date: null, required: false }),
      reading({ for_date: '2026-12-01' }),
      reading({ for_date: null, required: true }),
      reading({ for_date: '2026-09-03' }),
    ]);
    expect(groups.map((g) => g.forDate)).toEqual(['2026-09-03', '2026-12-01', null, null]);
    expect(groups.at(-2)?.heading).toBe(CASE_POOL_HEADING);
    expect(groups.at(-1)?.heading).toBe(UNDATED_HEADING);
  });

  it('shows no empty group for a tail that is not there', () => {
    const groups = groupReadings([reading({ for_date: '2026-09-10' })]);
    expect(groups.map((g) => g.heading)).toEqual(['Thu, Sep 10']);
  });

  it('never loses a reading, whatever the mix', () => {
    const rows = [
      reading({ for_date: '2026-09-10' }),
      reading({ for_date: null, required: false }),
      reading({ for_date: null, required: true }),
      reading({ for_date: '2026-09-10' }),
    ];
    expect(groupReadings(rows).flatMap((g) => g.readings)).toHaveLength(rows.length);
  });
});

describe('materials-collapse — the folded set', () => {
  const KEY = sectionKey('IST.323', 'readings');

  afterEach(() => window.localStorage.clear());

  it('names a section by its course and bucket', () => {
    expect(KEY).toBe('IST.323::readings');
    expect(sectionKey('IST.323', 'schedule')).not.toBe(KEY);
  });

  it('starts with everything open — collapsible is not collapsed', () => {
    expect([...readCollapsed()]).toEqual([]);
  });

  it('remembers a fold and reads it back', () => {
    writeCollapsed(toggleCollapsed(new Set(), KEY));
    expect([...readCollapsed()]).toEqual([KEY]);
  });

  it('returns a new set rather than mutating the one it was given', () => {
    const before = new Set([KEY]);
    const after = toggleCollapsed(before, 'IST.323::schedule');
    expect(after).not.toBe(before);
    expect([...before]).toEqual([KEY]);
    expect([...after].sort()).toEqual(['IST.323::readings', 'IST.323::schedule']);
  });

  it('unfolds what was folded', () => {
    expect([...toggleCollapsed(new Set([KEY]), KEY)]).toEqual([]);
  });

  it('opens everything rather than throwing on junk in storage', () => {
    window.localStorage.setItem(MATERIALS_COLLAPSE_KEY, 'not json');
    expect([...readCollapsed()]).toEqual([]);

    window.localStorage.setItem(MATERIALS_COLLAPSE_KEY, '{"a":1}');
    expect([...readCollapsed()]).toEqual([]);

    window.localStorage.setItem(MATERIALS_COLLAPSE_KEY, '[1, null, "IST.323::readings"]');
    expect([...readCollapsed()]).toEqual([KEY]);
  });

  it('opens everything rather than throwing when storage is unavailable', () => {
    const getItem = Storage.prototype.getItem;
    Storage.prototype.getItem = () => {
      throw new Error('The operation is insecure.');
    };
    expect(() => readCollapsed()).not.toThrow();
    expect([...readCollapsed()]).toEqual([]);
    Storage.prototype.getItem = getItem;
  });

  it('carries on rather than throwing when storage refuses to remember', () => {
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw new Error('QuotaExceededError');
    };
    expect(() => writeCollapsed(new Set([KEY]))).not.toThrow();
    Storage.prototype.setItem = setItem;
  });
});

/**
 * C-7's four rules, branch by branch, plus the property tests the brief asks for over
 * dedupe and the 500-key cap.
 *
 * Every case pins the exact title, body and route: the strings are the product, and a
 * silent copy change is a regression Stack would only find on his laptop.
 */

import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

import {
  FIRED_KEYS_LIMIT,
  GRADE_COALESCE_THRESHOLD,
  gradeKey,
  initialWatermark,
  mergeFiredKeys,
  reduce,
} from '../../src/core/poller/reducer';
import { isAllowedRoute } from '../../src/core/route';
import type { ReduceInput } from '../../src/core/types';
import { COURSES, dueRow, gradeRow, syncRow, watermark } from '../fixtures/rows';

const DOT = ' · ';

/** 18:30 New York on 2026-09-16 (EDT, UTC-4). */
const NOW = new Date('2026-09-16T22:30:00.000Z');

function input(overrides: Partial<ReduceInput> = {}): ReduceInput {
  return {
    sync: null,
    grades: [],
    due: null,
    now: NOW,
    watermark: watermark(),
    courses: COURSES,
    ...overrides,
  };
}

describe('rule 1 — sync landed', () => {
  it('fires with the change count and Home when nothing needs attention', () => {
    const { toasts } = reduce(input({ sync: syncRow() }));
    expect(toasts).toHaveLength(1);
    expect(toasts[0]).toEqual({
      key: 'sync:41',
      title: `Sync landed${DOT}4 change(s)`,
      body: [
        '3 new item(s) in the course content tree',
        '2 new announcement(s)',
        '1 new file(s) catalogued',
      ].join('\n'),
      route: '/',
    });
  });

  it('routes to /inbox when attention_raised > 0', () => {
    const sync = syncRow({
      summary: { changes: ['1 gap(s) added to the Inbox'], attention_raised: 1, errors: [] },
    });
    expect(reduce(input({ sync })).toasts[0]?.route).toBe('/inbox');
  });

  it('says "no changes" for an empty changes array', () => {
    const sync = syncRow({ summary: { changes: [], attention_raised: 0, errors: [] } });
    const toast = reduce(input({ sync })).toasts[0];
    expect(toast?.title).toBe(`Sync landed${DOT}no changes`);
    expect(toast?.body).toBe('');
  });

  it('treats a null summary as no changes', () => {
    const toast = reduce(input({ sync: syncRow({ summary: null }) })).toasts[0];
    expect(toast?.title).toBe(`Sync landed${DOT}no changes`);
    expect(toast?.route).toBe('/');
  });

  it('titles a failed run "Sync failed" with the first error as the body', () => {
    const sync = syncRow({
      status: 'failed',
      summary: { changes: ['Nothing changed'], attention_raised: 0, errors: ['files: timeout', 'x'] },
    });
    const toast = reduce(input({ sync })).toasts[0];
    expect(toast?.title).toBe('Sync failed');
    expect(toast?.body).toBe('files: timeout');
  });

  it('falls back to a plain sentence when a failed run recorded no error', () => {
    const sync = syncRow({ status: 'failed', summary: { changes: [], attention_raised: 0, errors: [] } });
    expect(reduce(input({ sync })).toasts[0]?.body).toBe('No error detail was recorded.');
  });

  it('toasts a partial run like a landed one and appends its error line', () => {
    const sync = syncRow({
      status: 'partial',
      summary: { changes: ['2 new announcement(s)'], attention_raised: 0, errors: ['files: 1 failed'] },
    });
    const toast = reduce(input({ sync })).toasts[0];
    expect(toast?.title).toBe(`Sync landed${DOT}1 change(s)`);
    expect(toast?.body).toBe('2 new announcement(s)\nfiles: 1 failed');
  });

  it('does not fire while the run is still running', () => {
    expect(reduce(input({ sync: syncRow({ status: 'running', finished_at: null }) })).toasts).toEqual([]);
  });

  it('does not fire for a status outside the landed set', () => {
    expect(reduce(input({ sync: syncRow({ status: 'queued' }) })).toasts).toEqual([]);
  });

  it('does not fire when finished_at is at or before lastSeenAt', () => {
    const wm = watermark({ lastSeenAt: '2026-09-16T18:00:00.000Z' });
    expect(reduce(input({ sync: syncRow(), watermark: wm })).toasts).toEqual([]);
  });

  it('does not fire when finished_at is null or unparseable', () => {
    expect(reduce(input({ sync: syncRow({ finished_at: null }) })).toasts).toEqual([]);
    expect(reduce(input({ sync: syncRow({ finished_at: 'not a date' }) })).toasts).toEqual([]);
  });

  it('does not fire when the stored lastSeenAt is unparseable', () => {
    const wm = watermark({ lastSeenAt: 'garbage' });
    expect(reduce(input({ sync: syncRow(), watermark: wm })).toasts).toEqual([]);
  });

  it('never fires twice for the same sync id', () => {
    const first = reduce(input({ sync: syncRow() }));
    const second = reduce(input({ sync: syncRow(), watermark: first.watermark }));
    expect(second.toasts).toEqual([]);
  });
});

describe('rule 2 — grade posted', () => {
  const rows = [
    gradeRow({ column_id: 'c1', name: 'Lab 3', score: 18, possible: 20 }),
    gradeRow({ column_id: 'c2', name: 'Quiz 4', score: 9, possible: 10, previous_score: 7 }),
    gradeRow({ shell_course_id: 'GEO.103.lecture', column_id: 'c3', name: 'Map quiz', score: 88, possible: null }),
  ];

  it('gives each of up to three rows its own toast', () => {
    const { toasts } = reduce(input({ grades: rows }));
    expect(toasts).toHaveLength(3);
    expect(toasts[0]).toEqual({
      key: 'grade:IST.323:c1:run-a',
      title: `IST 323${DOT}Lab 3`,
      body: '18 / 20',
      route: '/course/IST.323/grades',
    });
    expect(toasts[1]?.body).toBe(`9 / 10${DOT}was 7`);
    expect(toasts[2]).toEqual({
      key: 'grade:GEO.103.lecture:c3:run-a',
      title: `GEO 103${DOT}Map quiz`,
      body: '88',
      route: '/course/GEO.103.lecture/grades',
    });
  });

  it('falls back to the raw course id when there is no label', () => {
    const row = gradeRow({ shell_course_id: 'PHY.211' });
    expect(reduce(input({ grades: [row] })).toasts[0]?.title).toBe(`PHY.211${DOT}Lab 3`);
  });

  it('falls back to the raw course id when the label is empty', () => {
    const row = gradeRow({ shell_course_id: 'IST.323' });
    const courses = [{ id: 'IST.323', title_short: '' }];
    expect(reduce(input({ grades: [row], courses })).toasts[0]?.title).toBe(`IST.323${DOT}Lab 3`);
  });

  it('degrades a route to Home when the course id is not a well-formed id', () => {
    const row = gradeRow({ shell_course_id: 'not a course' });
    expect(reduce(input({ grades: [row] })).toasts[0]?.route).toBe('/');
  });

  it(`coalesces per shell course at ${GRADE_COALESCE_THRESHOLD} rows`, () => {
    const four = [
      gradeRow({ column_id: 'c1', name: 'Lab 1' }),
      gradeRow({ column_id: 'c2', name: 'Lab 2' }),
      gradeRow({ column_id: 'c3', name: 'Lab 3' }),
      gradeRow({ shell_course_id: 'GEO.103.lecture', column_id: 'c4', name: 'Map quiz', run_id: 'run-b' }),
    ];
    const { toasts, watermark: next } = reduce(input({ grades: four }));
    expect(toasts).toHaveLength(2);
    expect(toasts[0]).toEqual({
      key: 'grade:IST.323:coalesced:run-a',
      title: `IST 323${DOT}3 grades posted`,
      body: 'Lab 1\nLab 2\nLab 3',
      route: '/course/IST.323/grades',
    });
    expect(toasts[1]?.title).toBe(`GEO 103${DOT}1 grades posted`);
    // Every member row key is recorded, so a coalesced tick still dedupes row by row.
    for (const row of four) expect(next.firedKeys).toContain(gradeKey(row));
  });

  it('caps a coalesced body at three names', () => {
    const many = ['a', 'b', 'c', 'd', 'e'].map((n) => gradeRow({ column_id: n, name: `Item ${n}` }));
    const toast = reduce(input({ grades: many })).toasts[0];
    expect(toast?.title).toBe(`IST 323${DOT}5 grades posted`);
    expect(toast?.body).toBe('Item a\nItem b\nItem c');
  });

  it('counts only unfired rows towards the coalescing threshold', () => {
    const four = ['c1', 'c2', 'c3', 'c4'].map((c) => gradeRow({ column_id: c, name: `Lab ${c}` }));
    const wm = watermark({ firedKeys: [gradeKey(four[0]!), gradeKey(four[1]!)] });
    const { toasts } = reduce(input({ grades: four, watermark: wm }));
    // Two rows remain, which is under the threshold, so they stay itemised.
    expect(toasts.map((t) => t.title)).toEqual([`IST 323${DOT}Lab c3`, `IST 323${DOT}Lab c4`]);
  });

  it('fires nothing for a second tick carrying the same rows', () => {
    const first = reduce(input({ grades: rows }));
    const second = reduce(input({ grades: rows, watermark: first.watermark }));
    expect(second.toasts).toEqual([]);
  });

  it('fires nothing when there are no grade rows', () => {
    expect(reduce(input({ grades: [] })).toasts).toEqual([]);
  });
});

describe('rule 3 — due tomorrow', () => {
  it('fires once with the item count and up to three lines', () => {
    const due = [
      dueRow({ item_id: 'a1', title: 'Milestone 2 draft' }),
      dueRow({ item_id: 'r1', item_kind: 'reading', course_id: 'GEO.103.lecture', title: 'Ch. 7' }),
      dueRow({ item_id: 'a2', course_id: 'MAT.295', title: 'Problem set 5' }),
      dueRow({ item_id: 'a3', course_id: 'MAT.295', title: 'Quiz prep' }),
    ];
    const { toasts, watermark: next } = reduce(input({ due }));
    expect(toasts).toHaveLength(1);
    expect(toasts[0]).toEqual({
      key: 'due:2026-09-16',
      title: `Due tomorrow${DOT}4 item(s)`,
      body: [`IST 323${DOT}Milestone 2 draft`, `GEO 103${DOT}Ch. 7`, `MAT 295${DOT}Problem set 5`].join('\n'),
      route: '/',
    });
    expect(next.dueCheckedOn).toBe('2026-09-16');
  });

  it('records the date but fires nothing when there are no items', () => {
    const { toasts, watermark: next } = reduce(input({ due: [] }));
    expect(toasts).toEqual([]);
    expect(next.dueCheckedOn).toBe('2026-09-16');
  });

  it('leaves dueCheckedOn alone on a tick where the check did not run', () => {
    const wm = watermark({ dueCheckedOn: '2026-09-15' });
    expect(reduce(input({ due: null, watermark: wm })).watermark.dueCheckedOn).toBe('2026-09-15');
  });

  it('uses the New York date, not UTC, for the key', () => {
    // 01:30 UTC on the 17th is 21:30 on the 16th in New York.
    const now = new Date('2026-09-17T01:30:00.000Z');
    const { toasts } = reduce(input({ due: [dueRow()], now }));
    expect(toasts[0]?.key).toBe('due:2026-09-16');
  });

  it('never fires twice for the same New York day', () => {
    const first = reduce(input({ due: [dueRow()] }));
    const second = reduce(input({ due: [dueRow()], watermark: first.watermark }));
    expect(second.toasts).toEqual([]);
  });
});

describe('rule 4 — dedupe, cap, advance', () => {
  it('advances lastSeenAt to the tick start', () => {
    expect(reduce(input()).watermark.lastSeenAt).toBe(NOW.toISOString());
  });

  it('never mutates the watermark it was given', () => {
    const before = watermark({ firedKeys: ['sync:1'] });
    const snapshot = JSON.parse(JSON.stringify(before));
    const after = reduce(input({ sync: syncRow(), watermark: before }));
    expect(before).toEqual(snapshot);
    expect(after.watermark).not.toBe(before);
    expect(after.watermark.firedKeys).not.toBe(before.firedKeys);
  });

  it('emits all three kinds in one tick', () => {
    const { toasts } = reduce(
      input({ sync: syncRow(), grades: [gradeRow()], due: [dueRow()] }),
    );
    expect(toasts.map((t) => t.key)).toEqual([
      'sync:41',
      'grade:IST.323:col-9001:run-a',
      'due:2026-09-16',
    ]);
  });

  it('is pure: the same input twice gives the same output', () => {
    const args = input({ sync: syncRow(), grades: [gradeRow()], due: [dueRow()] });
    expect(reduce(args)).toEqual(reduce(args));
  });

  it('keeps the newest 500 keys', () => {
    const old = Array.from({ length: FIRED_KEYS_LIMIT }, (_, i) => `old:${i}`);
    const next = reduce(input({ sync: syncRow(), watermark: watermark({ firedKeys: old }) })).watermark;
    expect(next.firedKeys).toHaveLength(FIRED_KEYS_LIMIT);
    expect(next.firedKeys).not.toContain('old:0');
    expect(next.firedKeys[FIRED_KEYS_LIMIT - 1]).toBe('sync:41');
  });

  it('initialWatermark records now and nothing else', () => {
    expect(initialWatermark(NOW)).toEqual({
      version: 1,
      lastSeenAt: NOW.toISOString(),
      dueCheckedOn: null,
      firedKeys: [],
    });
  });
});

describe('properties', () => {
  const key = fc.string({ minLength: 1, maxLength: 12 });

  it('mergeFiredKeys never exceeds the cap and never loses a newly added key', () => {
    fc.assert(
      fc.property(fc.array(key, { maxLength: 700 }), fc.array(key, { maxLength: 40 }), (existing, added) => {
        const merged = mergeFiredKeys(existing, added);
        expect(merged.length).toBeLessThanOrEqual(FIRED_KEYS_LIMIT);
        expect(new Set(merged).size).toBe(merged.length);
        // Anything added in this tick survives the trim, because the trim drops the oldest.
        const uniqueAdded = [...new Set(added)];
        if (uniqueAdded.length <= FIRED_KEYS_LIMIT) {
          for (const k of uniqueAdded) expect(merged).toContain(k);
        }
      }),
      { numRuns: 300 },
    );
  });

  it('mergeFiredKeys preserves the order of what it keeps', () => {
    fc.assert(
      fc.property(fc.uniqueArray(key, { maxLength: 200 }), (keys) => {
        expect(mergeFiredKeys(keys, [])).toEqual(keys);
      }),
    );
  });

  it('replaying any tick against its own output watermark fires nothing', () => {
    const arbitrary = fc.record({
      sync: fc.option(
        fc.record({ id: fc.integer({ min: 1, max: 9999 }), attention: fc.integer({ min: 0, max: 3 }) }),
        { nil: null },
      ),
      grades: fc.array(
        fc.record({
          course: fc.constantFrom('IST.323', 'GEO.103.lecture', 'MAT.295', 'PHY.211'),
          column: fc.string({ minLength: 1, maxLength: 6 }),
          run: fc.constantFrom('run-a', 'run-b', 'run-c'),
          score: fc.integer({ min: 0, max: 100 }),
        }),
        { maxLength: 8 },
      ),
      due: fc.option(fc.array(fc.string({ minLength: 1, maxLength: 8 }), { maxLength: 5 }), { nil: null }),
    });

    fc.assert(
      fc.property(arbitrary, (sample) => {
        const args = input({
          sync: sample.sync
            ? syncRow({
                id: sample.sync.id,
                summary: { changes: ['x'], attention_raised: sample.sync.attention, errors: [] },
              })
            : null,
          grades: sample.grades.map((g) =>
            gradeRow({ shell_course_id: g.course, column_id: g.column, run_id: g.run, score: g.score }),
          ),
          due: sample.due === null ? null : sample.due.map((title, i) => dueRow({ item_id: `i${i}`, title })),
        });
        const first = reduce(args);
        const second = reduce({ ...args, watermark: first.watermark });
        expect(second.toasts).toEqual([]);
      }),
      { numRuns: 300 },
    );
  });

  it('every emitted toast carries a route the deep-link validator accepts', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            course: fc.oneof(
              fc.constantFrom('IST.323', 'GEO.103.lecture', 'MAT.295'),
              fc.string({ maxLength: 10 }),
            ),
            column: fc.string({ minLength: 1, maxLength: 6 }),
          }),
          { maxLength: 8 },
        ),
        (rows) => {
          const { toasts } = reduce(
            input({
              sync: syncRow(),
              due: [dueRow()],
              grades: rows.map((r, i) =>
                gradeRow({ shell_course_id: r.course, column_id: `${r.column}-${i}` }),
              ),
            }),
          );
          for (const toast of toasts) expect(isAllowedRoute(toast.route)).toBe(true);
        },
      ),
      { numRuns: 200 },
    );
  });
});

/**
 * C-6's reads. The query strings are asserted byte for byte against the Contract's table,
 * transcribed here as literals rather than rebuilt from the implementation, so a change to
 * either side fails the test.
 *
 * The transport is a stub `RestGet`: nothing in this file can reach `*.supabase.co`.
 */

import { describe, expect, it } from 'vitest';

import {
  QueryValueError,
  RowShapeError,
  coursesQuery,
  GRADE_MAX_PAGES,
  GRADE_OVERLAP_MS,
  GRADE_PAGE_SIZE,
  dueQuery,
  gradesQuery,
  gradesSince,
  readCourseLabels,
  readDueItems,
  readNewGrades,
  readSyncStatus,
  syncQuery,
  validateCourseLabels,
  validateDueRows,
  validateGradeRows,
  validateSyncRows,
} from '../../src/core/poller/sources';
import type { RestGet } from '../../src/core/types';

/** The query strings exactly as `docs/planning/sprint-1-hub/briefs/80_PHASE12_electron.md` C-6 freezes them. */
const CONTRACT = {
  R1: 'select=id,run_id,status,started_at,finished_at,trigger,summary',
  R2: 'seen_at=gt.<lastSeenAt>&score=not.is.null&select=shell_course_id,column_id,name,run_id,seen_at,score,possible,previous_score&order=seen_at.asc&limit=200',
  R3: 'due_on=eq.<tomorrow>&in_workload=is.true&status=not.in.(submitted,graded,missed,excused,not_applicable,waived)&select=item_kind,item_id,course_id,title,due_at,due_on,status',
  courses: 'select=id,title_short',
} as const;

const LAST_SEEN_AT = '2026-09-16T12:00:00.000Z';
const TOMORROW = '2026-09-17';

/** Records what was asked for and replays canned rows. */
function stubRest(rows: Record<string, unknown>): {
  get: RestGet;
  calls: { relation: string; query: string }[];
} {
  const calls: { relation: string; query: string }[] = [];
  const get: RestGet = async <T>(
    relation: string,
    query: string,
    validate: (rows: unknown) => T,
  ): Promise<T> => {
    calls.push({ relation, query });
    return validate(rows[relation] ?? []);
  };
  return { get, calls };
}

describe('query strings (C-6, byte for byte)', () => {
  it('R1 v_sync_status', () => {
    expect(syncQuery()).toBe(CONTRACT.R1);
  });

  it('R2 v_gradebook_history', () => {
    expect(gradesQuery(LAST_SEEN_AT)).toBe(CONTRACT.R2.replace('<lastSeenAt>', LAST_SEEN_AT));
  });

  it('R3 v_work_items', () => {
    expect(dueQuery(TOMORROW)).toBe(CONTRACT.R3.replace('<tomorrow>', TOMORROW));
  });

  it('the course-label read', () => {
    expect(coursesQuery()).toBe(CONTRACT.courses);
  });

  it('refuses a lastSeenAt that is not a plain ISO instant, so nothing can be injected', () => {
    for (const bad of ['2026-09-16', '2026-09-16T12:00:00+00:00', 'x&limit=1', '', 'now()']) {
      expect(() => gradesQuery(bad)).toThrow(QueryValueError);
    }
  });

  it('refuses a due date that is not YYYY-MM-DD', () => {
    for (const bad of ['2026-9-17', '17/09/2026', '2026-09-17T00:00:00Z', 'a)&x=(b']) {
      expect(() => dueQuery(bad)).toThrow(QueryValueError);
    }
  });

  it('accepts the exact output of Date.prototype.toISOString', () => {
    expect(() => gradesQuery(new Date().toISOString())).not.toThrow();
  });
});

describe('the reads call the right relations', () => {
  it('R1 hits v_sync_status', async () => {
    const { get, calls } = stubRest({ v_sync_status: [] });
    await readSyncStatus(get);
    expect(calls).toEqual([{ relation: 'v_sync_status', query: CONTRACT.R1 }]);
  });

  it('R2 hits v_gradebook_history', async () => {
    const { get, calls } = stubRest({ v_gradebook_history: [] });
    await readNewGrades(get, LAST_SEEN_AT);
    expect(calls[0]?.relation).toBe('v_gradebook_history');
    expect(calls[0]?.query).toBe(CONTRACT.R2.replace('<lastSeenAt>', LAST_SEEN_AT));
  });

  it('R3 hits v_work_items', async () => {
    const { get, calls } = stubRest({ v_work_items: [] });
    await readDueItems(get, TOMORROW);
    expect(calls[0]?.relation).toBe('v_work_items');
  });

  it('the labels read hits courses', async () => {
    const { get, calls } = stubRest({ courses: [] });
    await readCourseLabels(get);
    expect(calls[0]).toEqual({ relation: 'courses', query: CONTRACT.courses });
  });
});

describe('validateSyncRows', () => {
  const row = {
    id: 41,
    run_id: '6b122650-49f3-4a70-a801-c177fbf27f1a',
    status: 'ok',
    started_at: '2026-09-16T17:58:00+00:00',
    finished_at: '2026-09-16T18:00:00+00:00',
    trigger: 'app_request',
    summary: {
      stages: { content: { inserted: 3 } },
      changes: ['3 new item(s) in the course content tree'],
      attention_raised: 1,
      errors: [],
    },
  };

  it('accepts a real v_sync_status row and keeps the summary fields C-7 uses', () => {
    expect(validateSyncRows([row])).toEqual({
      id: 41,
      run_id: row.run_id,
      status: 'ok',
      started_at: row.started_at,
      finished_at: row.finished_at,
      trigger: 'app_request',
      summary: { changes: row.summary.changes, attention_raised: 1, errors: [] },
    });
  });

  it('returns null for an empty result (no sync has ever run)', () => {
    expect(validateSyncRows([])).toBeNull();
  });

  it('accepts a null summary and a still-running row', () => {
    const running = { ...row, status: 'running', finished_at: null, summary: null };
    expect(validateSyncRows([running])?.summary).toBeNull();
  });

  it('defaults missing summary arrays rather than throwing', () => {
    const sparse = { ...row, summary: { stages: {} } };
    expect(validateSyncRows([sparse])?.summary).toEqual({
      changes: [],
      attention_raised: 0,
      errors: [],
    });
  });

  it.each([
    ['a non-array payload', {}],
    ['a non-object row', ['nope']],
    ['a non-integer id', [{ ...row, id: 'x' }]],
    ['a non-string status', [{ ...row, status: 7 }]],
    ['a summary that is an array', [{ ...row, summary: [] }]],
    ['changes that are not strings', [{ ...row, summary: { changes: [1] } }]],
    ['errors that are not strings', [{ ...row, summary: { errors: [{}] } }]],
  ])('throws RowShapeError for %s', (_name, payload) => {
    expect(() => validateSyncRows(payload)).toThrow(RowShapeError);
  });
});

describe('validateGradeRows', () => {
  const row = {
    shell_course_id: 'IST.323',
    column_id: 'col-9001',
    name: 'Lab 3',
    run_id: 'run-a',
    seen_at: '2026-09-16T17:59:00+00:00',
    score: 18,
    possible: 20,
    previous_score: null,
  };

  it('accepts a real v_gradebook_history row', () => {
    expect(validateGradeRows([row])).toEqual([row]);
  });

  it('accepts a null possible and a set previous_score', () => {
    expect(validateGradeRows([{ ...row, possible: null, previous_score: 7 }])[0]).toMatchObject({
      possible: null,
      previous_score: 7,
    });
  });

  it.each([
    ['a missing column_id', [{ ...row, column_id: undefined }]],
    ['a numeric returned as a string', [{ ...row, score: '18' }]],
    ['a non-finite score', [{ ...row, score: Number.POSITIVE_INFINITY }]],
    ['a non-numeric possible', [{ ...row, possible: 'twenty' }]],
  ])('throws RowShapeError for %s', (_name, payload) => {
    expect(() => validateGradeRows(payload)).toThrow(RowShapeError);
  });
});

describe('validateDueRows', () => {
  const row = {
    item_kind: 'assignment',
    item_id: 'a-1',
    course_id: 'IST.323',
    title: 'Milestone 2 draft',
    due_at: '2026-09-17T23:59:00+00:00',
    due_on: '2026-09-17',
    status: 'not_started',
  };

  it('accepts an assignment and a reading, the two halves of v_work_items', () => {
    const reading = { ...row, item_kind: 'reading', due_at: null, title: 'Ch. 7' };
    expect(validateDueRows([row, reading])).toHaveLength(2);
    expect(validateDueRows([reading])[0]?.due_at).toBeNull();
  });

  it('throws for an item_kind outside the union', () => {
    expect(() => validateDueRows([{ ...row, item_kind: 'event' }])).toThrow(RowShapeError);
  });

  it('throws for a missing title', () => {
    expect(() => validateDueRows([{ ...row, title: null }])).toThrow(RowShapeError);
  });
});

describe('validateCourseLabels', () => {
  it('accepts labels and falls back to the id when title_short is null', () => {
    expect(
      validateCourseLabels([
        { id: 'IST.323', title_short: 'IST 323' },
        { id: 'PHY.211', title_short: null },
      ]),
    ).toEqual([
      { id: 'IST.323', title_short: 'IST 323' },
      { id: 'PHY.211', title_short: 'PHY.211' },
    ]);
  });

  it('throws for a missing id', () => {
    expect(() => validateCourseLabels([{ title_short: 'x' }])).toThrow(RowShapeError);
  });
});

// ---------------------------------------------------------------------------------------
// R2-1 — the overlap window behind the watermark
// ---------------------------------------------------------------------------------------

describe('gradesSince (R2-1)', () => {
  const FLOOR = '2026-01-01T00:00:00.000Z';

  it('looks GRADE_OVERLAP_MS behind lastSeenAt', () => {
    const since = gradesSince({ lastSeenAt: LAST_SEEN_AT, notifyFloor: FLOOR });
    expect(Date.parse(LAST_SEEN_AT) - Date.parse(since)).toBe(GRADE_OVERLAP_MS);
    // Six hours, not six minutes: it has to cover a crawl -> transform gap and a nap.
    expect(GRADE_OVERLAP_MS).toBe(6 * 60 * 60 * 1000);
  });

  it('never reaches behind notifyFloor, so a first launch stays silent', () => {
    // What `initialWatermark` writes: the floor is level with lastSeenAt.
    const fresh = { lastSeenAt: LAST_SEEN_AT, notifyFloor: LAST_SEEN_AT };
    expect(gradesSince(fresh)).toBe(LAST_SEEN_AT);
  });

  it('clamps to the floor when the install is younger than the window', () => {
    const floor = new Date(Date.parse(LAST_SEEN_AT) - 60_000).toISOString();
    expect(gradesSince({ lastSeenAt: LAST_SEEN_AT, notifyFloor: floor })).toBe(floor);
  });

  it('always produces a strict ISO instant the query builder accepts', () => {
    const since = gradesSince({ lastSeenAt: LAST_SEEN_AT, notifyFloor: FLOOR });
    expect(() => gradesQuery(since)).not.toThrow();
  });

  it('rejects a watermark whose timestamps are not timestamps', () => {
    expect(() => gradesSince({ lastSeenAt: 'nope', notifyFloor: FLOOR })).toThrow(QueryValueError);
    expect(() => gradesSince({ lastSeenAt: LAST_SEEN_AT, notifyFloor: 'nope' })).toThrow(
      QueryValueError,
    );
  });
});

// ---------------------------------------------------------------------------------------
// R2-2 — paging
// ---------------------------------------------------------------------------------------

describe('readNewGrades pages until a short page (R2-2)', () => {
  function gradePage(count: number, from = 0): unknown[] {
    return Array.from({ length: count }, (_row, index) => ({
      shell_course_id: 'IST.323',
      column_id: `col-${from + index}`,
      name: 'Lab',
      run_id: 'run-a',
      seen_at: new Date(Date.parse(LAST_SEEN_AT) + (from + index) * 1000).toISOString(),
      score: 10,
      possible: 10,
      previous_score: null,
    }));
  }

  /** Serves `total` rows across as many pages as the caller asks for. */
  function pagedRest(total: number): { get: RestGet; queries: string[] } {
    const queries: string[] = [];
    const get: RestGet = async <T>(_relation: string, query: string, validate: (r: unknown) => T) => {
      queries.push(query);
      const offsetMatch = /&offset=(\d+)/.exec(query);
      const offset = offsetMatch ? Number(offsetMatch[1]) : 0;
      return validate(gradePage(Math.max(0, Math.min(GRADE_PAGE_SIZE, total - offset)), offset));
    };
    return { get, queries };
  }

  it('one short page is one request', async () => {
    const { get, queries } = pagedRest(3);
    const page = await readNewGrades(get, LAST_SEEN_AT);
    expect(page.rows).toHaveLength(3);
    expect(page.complete).toBe(true);
    expect(queries).toHaveLength(1);
    expect(queries[0]).not.toContain('offset=');
  });

  it('reads past the first 200 rows instead of dropping them', async () => {
    const { get, queries } = pagedRest(450);
    const page = await readNewGrades(get, LAST_SEEN_AT);
    // Before R2-2 this returned 200 rows and the rest were lost for good.
    expect(page.rows).toHaveLength(450);
    expect(page.complete).toBe(true);
    expect(queries).toHaveLength(3);
    expect(queries[1]).toContain(`&offset=${GRADE_PAGE_SIZE}`);
    expect(queries[2]).toContain(`&offset=${GRADE_PAGE_SIZE * 2}`);
  });

  it('an exactly-full set costs one more empty read and is still complete', async () => {
    const { get, queries } = pagedRest(GRADE_PAGE_SIZE);
    const page = await readNewGrades(get, LAST_SEEN_AT);
    expect(page.rows).toHaveLength(GRADE_PAGE_SIZE);
    expect(page.complete).toBe(true);
    expect(queries).toHaveLength(2);
  });

  it('stops at GRADE_MAX_PAGES and reports the read as incomplete', async () => {
    const { get, queries } = pagedRest(GRADE_PAGE_SIZE * GRADE_MAX_PAGES + 50);
    const page = await readNewGrades(get, LAST_SEEN_AT);
    expect(queries).toHaveLength(GRADE_MAX_PAGES);
    expect(page.rows).toHaveLength(GRADE_PAGE_SIZE * GRADE_MAX_PAGES);
    expect(page.complete).toBe(false);
  });

  it('rejects a negative or fractional offset rather than building a query with it', () => {
    expect(() => gradesQuery(LAST_SEEN_AT, -1)).toThrow(QueryValueError);
    expect(() => gradesQuery(LAST_SEEN_AT, 1.5)).toThrow(QueryValueError);
  });
});

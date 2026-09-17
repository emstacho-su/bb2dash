/**
 * The gradebook read layer: what it asks Supabase for, and what its pure
 * helpers say. (The one write lives in `queries.submissions.test.ts`.)
 *
 * The row types are hand-narrowed to the Contract rather than taken from the
 * generated ones, so nothing but this file watches the relation names, the
 * filter columns and the ordering — and `v_assignment_grade` exposes its key as
 * `assignment_id` with no `id` column at all, which is exactly the kind of
 * drift these assertions exist to catch. The client is a recording fake;
 * nothing here touches the network or a Supabase project.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ECN304_ATTENDANCE,
  IST323_LETTER,
  IST323_QUIZ,
  IST323_TOTAL,
  IST352_SUBMITTED,
  NEVER_SYNCED_COURSE,
  NO_TOTAL_COURSE,
  makeCourseGrade,
} from './factories.grades';

type Call = {
  relation: string;
  columns: string;
  filters: string[];
  orders: string[];
};

const calls: Call[] = [];
let nextResult: { data: unknown; error: unknown } = { data: [], error: null };
/** Per-relation results, so one queryFn can read two relations in a row. */
const resultsByRelation = new Map<string, { data: unknown; error: unknown }>();

function fakeBuilder(relation: string) {
  const call: Call = { relation, columns: '', filters: [], orders: [] };
  const settle = () => resultsByRelation.get(relation) ?? nextResult;

  const builder = {
    select(columns: string) {
      call.columns = columns;
      calls.push(call);
      return builder;
    },
    eq(column: string, value: unknown) {
      call.filters.push(`eq:${column}=${String(value)}`);
      return builder;
    },
    in(column: string, values: unknown[]) {
      call.filters.push(`in:${column}=${values.join(',')}`);
      return builder;
    },
    is(column: string, value: unknown) {
      call.filters.push(`is:${column}=${String(value)}`);
      return builder;
    },
    order(column: string, options?: { ascending?: boolean }) {
      call.orders.push(`${column}:${options?.ascending === false ? 'desc' : 'asc'}`);
      return builder;
    },
    maybeSingle: () => Promise.resolve(settle()),
    then: (resolve: (value: { data: unknown; error: unknown }) => unknown) => resolve(settle()),
  };
  return builder;
}

vi.mock('@/lib/supabase/client', () => ({
  getSupabaseBrowserClient: () => ({
    from: (relation: string) => fakeBuilder(relation),
    auth: { getSession: vi.fn() },
  }),
}));

const {
  assignmentAttemptsOptions,
  assignmentGradeOptions,
  attemptsAllowed,
  attemptsText,
  compareSha,
  courseGradeState,
  courseGradesOptions,
  formatSeenAt,
  gradebookLatestOptions,
  isBookkeepingRow,
  isItemRow,
  pickCourseGrade,
  scoreText,
  submissionFilesOptions,
  submissionLabel,
  submissionOrigin,
} = await import('@/lib/queries.grades');

/** Run an options object's queryFn; the fns here ignore their context. */
function run(options: { queryFn?: unknown }): Promise<unknown> {
  return (options.queryFn as () => Promise<unknown>)();
}

beforeEach(() => {
  calls.length = 0;
  resultsByRelation.clear();
  nextResult = { data: [], error: null };
});

/* ===========================================================================
 * Request shapes
 * ======================================================================== */

describe('the four view reads', () => {
  it('reads v_course_grade, ordered by course', async () => {
    await run(courseGradesOptions());
    expect(calls).toHaveLength(1);
    expect(calls[0].relation).toBe('v_course_grade');
    expect(calls[0].orders).toEqual(['course_id:asc']);
  });

  it('reads v_gradebook_latest for the given shells, ordered by course then position', async () => {
    await run(gradebookLatestOptions(['GEO.103.lecture', 'GEO.103.recitation']));
    expect(calls[0].relation).toBe('v_gradebook_latest');
    expect(calls[0].filters).toEqual(['in:course_id=GEO.103.lecture,GEO.103.recitation']);
    expect(calls[0].orders).toEqual(['course_id:asc', 'position:asc']);
  });

  it('does not fire the gradebook read when there are no shells to read for', () => {
    expect(gradebookLatestOptions([]).enabled).toBe(false);
    expect(gradebookLatestOptions(['IST.323']).enabled).toBe(true);
  });

  it('reads v_assignment_grade by assignment_id — the view has no id column', async () => {
    await run(assignmentGradeOptions('IST.323/lab-1'));
    expect(calls[0].relation).toBe('v_assignment_grade');
    expect(calls[0].filters).toEqual(['eq:assignment_id=IST.323/lab-1']);
    expect(calls[0].filters.some((f) => f.startsWith('eq:id='))).toBe(false);
  });

  it('reads v_assignment_attempts in attempt order', async () => {
    await run(assignmentAttemptsOptions('IST.323/lab-1'));
    expect(calls[0].relation).toBe('v_assignment_attempts');
    expect(calls[0].filters).toEqual(['eq:assignment_id=IST.323/lab-1']);
    expect(calls[0].orders).toEqual(['attempt_no:asc']);
  });

  it('reads only current my_submissions rows for an assignment', async () => {
    await run(submissionFilesOptions('IST.323/lab-1'));
    expect(calls[0].relation).toBe('bb_files');
    expect(calls[0].filters).toEqual([
      'eq:assignment_id=IST.323/lab-1',
      'eq:bucket=my_submissions',
      'is:superseded_by=null',
    ]);
    for (const column of ['sha256', 'classified_by', 'storage_path', 'source_url', 'file_name']) {
      expect(calls[0].columns).toContain(column);
    }
  });

  it('throws what Supabase reported rather than reporting an empty gradebook', async () => {
    nextResult = { data: null, error: new Error('permission denied') };
    await expect(run(courseGradesOptions())).rejects.toThrow('permission denied');
    await expect(run(gradebookLatestOptions(['IST.323']))).rejects.toThrow('permission denied');
  });
});

/* ===========================================================================
 * Pure helpers
 * ======================================================================== */

describe('scoreText', () => {
  it('renders a score over its possible points', () => {
    expect(scoreText(5, 104)).toBe('5 / 104');
    expect(scoreText(10, 10)).toBe('10 / 10');
    expect(scoreText(83.333, 100)).toBe('83.333 / 100');
  });

  it('renders an em dash for an ungraded item — never a zero', () => {
    expect(scoreText(null, 50)).toBe('—');
    expect(scoreText(undefined, 50)).toBe('—');
    expect(scoreText(null, null)).toBe('—');
  });

  it('keeps a real zero, which is a grade', () => {
    expect(scoreText(0, 25)).toBe('0 / 25');
  });

  it('shows the score alone when no denominator is recorded', () => {
    expect(scoreText(7, null)).toBe('7');
  });

  it('reads a numeric that arrived as a string', () => {
    expect(scoreText('5.000', '104.000')).toBe('5 / 104');
  });
});

describe('formatSeenAt', () => {
  it('says when we saw the figure, in the course time zone', () => {
    expect(formatSeenAt('2026-09-14T18:31:00.000Z')).toBe('Sep 14, 2:31 PM');
  });

  it('says nothing it cannot support', () => {
    expect(formatSeenAt(null)).toBe('—');
    expect(formatSeenAt(undefined)).toBe('—');
    expect(formatSeenAt('not a date')).toBe('—');
  });
});

describe('submissionLabel', () => {
  it.each([
    ['UNOPENED', 'not opened'],
    ['DRAFT_SAVED_STUDENT', 'draft saved'],
    ['SUBMITTED', 'submitted'],
    ['GRADED', 'graded'],
    ['NO_STATUS', 'instructor-entered'],
  ])('glosses %s as "%s" and keeps the raw value', (status, gloss) => {
    const label = submissionLabel(status);
    expect(label.text).toBe(gloss);
    expect(label.status).toBe(status);
  });

  it('shows an unknown code as itself rather than guessing', () => {
    expect(submissionLabel('NEEDS_ATTENTION').text).toBe('NEEDS_ATTENTION');
  });

  it('has nothing to say when Blackboard recorded no status', () => {
    expect(submissionLabel(null)).toEqual({ status: null, text: '—', attemptStatus: null });
    expect(submissionLabel('   ').text).toBe('—');
  });

  it('keeps "submitted" for a row whose last attempt needs grading (answer 3)', () => {
    const label = submissionLabel(
      IST352_SUBMITTED.submission_status,
      IST352_SUBMITTED.last_attempt_status,
    );
    expect(label.text).toBe('submitted');
    expect(label.attemptStatus).toBe('NEEDS_GRADING');
  });

  it('does not repeat the attempt status when it says the same thing', () => {
    expect(submissionLabel('GRADED', 'GRADED').attemptStatus).toBeNull();
  });

  /* G-4 / P-grades-6: "graded" and "last attempt: COMPLETED" say one thing. */
  it.each(['GRADED', 'SUBMITTED'])(
    'drops a COMPLETED attempt beside a %s column — it adds nothing',
    (status) => {
      expect(submissionLabel(status, 'COMPLETED').attemptStatus).toBeNull();
    },
  );

  it.each([
    ['GRADED', 'NEEDS_GRADING'],
    ['SUBMITTED', 'NEEDS_GRADING'],
    ['SUBMITTED', 'IN_PROGRESS'],
    ['UNOPENED', 'COMPLETED'],
    ['NO_STATUS', 'COMPLETED'],
  ])('keeps the attempt status beside a %s column when it reads %s', (status, attempt) => {
    expect(submissionLabel(status, attempt).attemptStatus).toBe(attempt);
  });

  it('still reports the column status itself when the attempt is dropped', () => {
    const label = submissionLabel('GRADED', 'COMPLETED');
    expect(label.status).toBe('GRADED');
    expect(label.text).toBe('graded');
  });
});

describe('courseGradeState', () => {
  it('names the three states apart', () => {
    expect(courseGradeState(makeCourseGrade())).toBe('total');
    expect(courseGradeState(NO_TOTAL_COURSE)).toBe('no_total');
    expect(courseGradeState(NEVER_SYNCED_COURSE)).toBe('never_synced');
    expect(courseGradeState(null)).toBe('never_synced');
    expect(courseGradeState(undefined)).toBe('never_synced');
  });

  it('is still "total" when the total column exists but is ungraded', () => {
    expect(
      courseGradeState(makeCourseGrade({ total_effective_score: null })),
    ).toBe('total');
  });
});

describe('pickCourseGrade — two shells, never added together', () => {
  const lecture = makeCourseGrade({ course_id: 'GEO.103.lecture', has_total: false });
  const recitation = makeCourseGrade({ course_id: 'GEO.103.recitation', has_total: false });

  it('prefers the shell that publishes a total', () => {
    const withTotal = makeCourseGrade({ course_id: 'GEO.103.recitation' });
    const picked = pickCourseGrade([lecture, withTotal], [
      'GEO.103.lecture',
      'GEO.103.recitation',
    ]);
    expect(picked?.course_id).toBe('GEO.103.recitation');
  });

  it('falls back to a shell that at least has a gradebook', () => {
    const picked = pickCourseGrade([lecture, recitation], [
      'GEO.103.lecture',
      'GEO.103.recitation',
    ]);
    expect(picked?.course_id).toBe('GEO.103.lecture');
  });

  it('ignores other courses entirely', () => {
    expect(pickCourseGrade([makeCourseGrade()], ['GEO.103.lecture'])).toBeNull();
    expect(pickCourseGrade([NEVER_SYNCED_COURSE], ['IST.471'])).toBeNull();
  });
});

describe('compareSha', () => {
  const staged = 'b'.repeat(64);

  it('matches an identical copy, whatever the casing', () => {
    expect(compareSha(staged, staged)).toBe('matches');
    expect(compareSha(staged.toUpperCase(), [staged])).toBe('matches');
  });

  it('says so when the bytes are not the same', () => {
    expect(compareSha(staged, 'c'.repeat(64))).toBe('differs');
  });

  it('claims nothing when there is no submitted copy to compare against', () => {
    expect(compareSha(staged, null)).toBe('no_submitted_copy');
    expect(compareSha(staged, [])).toBe('no_submitted_copy');
    expect(compareSha(staged, [null, undefined, ''])).toBe('no_submitted_copy');
    expect(compareSha(null, staged)).toBe('no_submitted_copy');
  });

  it('matches against any one of several submitted copies', () => {
    expect(compareSha(staged, ['a'.repeat(64), staged])).toBe('matches');
  });
});

describe('attemptsAllowed — two Blackboard columns, one ceiling', () => {
  it('reads unlimited off attempts_left, not off multiple_attempts', () => {
    expect(attemptsAllowed(0, -1)).toBe(-1);
  });

  it('takes a real ceiling from multiple_attempts', () => {
    expect(attemptsAllowed(3, 2)).toBe(3);
  });

  it('treats multiple_attempts 0 as a single attempt, never as "no limit"', () => {
    expect(attemptsAllowed(0, null)).toBe(1);
    expect(attemptsAllowed(1, 4)).toBe(1);
  });

  it('says nothing when Blackboard recorded neither column', () => {
    expect(attemptsAllowed(null, null)).toBeNull();
    expect(attemptsAllowed(undefined, undefined)).toBeNull();
  });

  it('never renders "Attempt 2 of 1" for a real unlimited row', () => {
    expect(attemptsText(2, attemptsAllowed(0, -1))).toBe('Attempt 2 (unlimited)');
  });
});

describe('attemptsText', () => {
  it('counts an attempt against its ceiling', () => {
    expect(attemptsText(2, 3)).toBe('Attempt 2 of 3');
  });

  it('says unlimited rather than inventing a ceiling', () => {
    expect(attemptsText(1, -1)).toBe('Attempt 1 (unlimited)');
  });

  it('treats 0 or 1 allowed as a single attempt', () => {
    expect(attemptsText(1, 0)).toBe('Attempt 1 of 1');
    expect(attemptsText(1, 1)).toBe('Attempt 1 of 1');
  });

  it('stands alone when Blackboard did not say how many are allowed', () => {
    expect(attemptsText(1, null)).toBe('Attempt 1');
    expect(attemptsText(2, undefined)).toBe('Attempt 2');
  });
});

describe('isItemRow / isBookkeepingRow', () => {
  it('puts gradebook items among the items', () => {
    expect(isItemRow(IST323_QUIZ)).toBe(true);
    expect(isBookkeepingRow(IST323_QUIZ)).toBe(false);
  });

  it('puts uncounted attendance in the bookkeeping group', () => {
    expect(isItemRow(ECN304_ATTENDANCE)).toBe(false);
    expect(isBookkeepingRow(ECN304_ATTENDANCE)).toBe(true);
  });

  it('moves attendance up once its assignment has a grade component', () => {
    const counted = { ...ECN304_ATTENDANCE, counts_toward_grade: true };
    expect(isItemRow(counted)).toBe(true);
    expect(isBookkeepingRow(counted)).toBe(false);
  });

  it('keeps letter and non-total calc columns out of the item rows', () => {
    expect(isItemRow(IST323_LETTER)).toBe(false);
    expect(isBookkeepingRow(IST323_LETTER)).toBe(true);
    const calcOther = { ...IST323_TOTAL, column_kind: 'calc_other' as const, is_total: false };
    expect(isBookkeepingRow(calcOther)).toBe(true);
  });

  it('leaves the total column out of both lists — the header owns it', () => {
    expect(isItemRow(IST323_TOTAL)).toBe(false);
    expect(isBookkeepingRow(IST323_TOTAL)).toBe(false);
  });
});

describe('submissionOrigin', () => {
  it('tells a staged file from a pulled-back one', () => {
    expect(submissionOrigin({ bucket: 'my_submissions', classified_by: 'stack' })).toBe('staged');
    expect(submissionOrigin({ bucket: 'my_submissions', classified_by: 'blackboard' })).toBe(
      'pulled_back',
    );
    expect(submissionOrigin({ bucket: 'my_submissions', classified_by: 'rule' })).toBe('other');
    expect(submissionOrigin({ bucket: 'lecture_slides', classified_by: 'stack' })).toBe('other');
  });
});

/**
 * `/course/[id]/assignment/[…]` — the full-details page (T-2, P-planner-5).
 *
 * Two things are under test: that the page renders the SAME body the `?item=`
 * popout renders (the whole point of the split — there is no second copy of the
 * markup to drift), and that a link to an assignment which does not exist, or
 * which belongs to another course, raises not-found instead of drawing an empty
 * panel.
 *
 * Every query hook is a stub; nothing here reaches Supabase.
 */

import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

interface Stub<T> {
  data: T;
  isPending: boolean;
  isFetching: boolean;
  isError: boolean;
  error: Error | null;
}

function stub<T>(data: T, over: Partial<Stub<T>> = {}): Stub<T> {
  return { data, isPending: false, isFetching: false, isError: false, error: null, ...over };
}

function loading(): Stub<undefined> {
  return stub(undefined, { isPending: true, isFetching: true });
}

const ASSIGNMENT = {
  id: 'IST.323/lab-1',
  course_id: 'IST.323',
  title: 'Lab #1',
  type: 'lab',
  description: 'Build the threat model.',
  due_date: '2026-09-14',
  due_at: null,
  due_rule: null,
  points_possible: 25,
  source: 'blackboard',
  source_ref: 'bb:_1234_1',
  series_key: null,
  sequence_no: null,
  confidence: 'confirmed',
  component_id: null,
  is_group: false,
  is_extra_credit: false,
};

const hooks = vi.hoisted(() => ({
  assignment: null as unknown,
  progress: null as unknown,
  component: null as unknown,
  scheme: null as unknown,
  series: null as unknown,
  course: null as unknown,
  save: null as unknown,
}));

const notFound = vi.hoisted(() => vi.fn(() => {
  throw new Error('NEXT_NOT_FOUND');
}));

vi.mock('next/navigation', () => ({ notFound }));

vi.mock('@/lib/supabase/client', () => ({
  getSupabaseBrowserClient: () => ({ auth: { getSession: vi.fn() } }),
}));

vi.mock('@/lib/queries.popout', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/queries.popout')>();
  return {
    ...actual,
    useAssignment: () => hooks.assignment,
    useAssignmentProgress: () => hooks.progress,
    useGradeComponent: () => hooks.component,
    useGradingScheme: () => hooks.scheme,
    useAssignmentSeries: () => hooks.series,
    useSavePlanner: () => hooks.save,
  };
});

vi.mock('@/lib/queries', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/queries')>();
  return { ...actual, useCourse: () => hooks.course };
});

/** The submission block's reads, as in `AssignmentPopout.test.tsx`. */
vi.mock('@/lib/queries.grades', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/queries.grades')>();
  return {
    ...actual,
    useAssignmentGrade: () => stub(null),
    useAssignmentAttempts: () => stub([]),
    useSubmissionFiles: () => stub([]),
    useAssignmentHistory: () => stub([]),
  };
});
vi.mock('@/lib/queries.submissions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/queries.submissions')>();
  return {
    ...actual,
    useStageUpload: () => ({ mutate: vi.fn(), isPending: false, isError: false, error: null }),
  };
});

const { CourseAssignment } = await import(
  '@/app/(app)/course/[id]/assignment/[...assignmentId]/CourseAssignment'
);
const CourseAssignmentPage = (
  await import('@/app/(app)/course/[id]/assignment/[...assignmentId]/page')
).default;

beforeEach(() => {
  notFound.mockClear();
  hooks.assignment = stub(ASSIGNMENT);
  hooks.progress = stub(null);
  hooks.component = stub(null);
  hooks.scheme = stub({ late_policy: '10% a day.', ai_policy: 'Cite any AI use.' });
  hooks.series = stub([]);
  hooks.course = stub({ id: 'IST.323', bb_url: 'https://bb.example/IST323', parent_course_id: null });
  hooks.save = { mutate: vi.fn(), isPending: false, isError: false, error: null };
});

describe('CourseAssignment — the page renders the shared body', () => {
  it('shows the same detail the popout shows, in a panel of its own', () => {
    render(<CourseAssignment courseId="IST.323" assignmentId="IST.323/lab-1" />);

    const panel = screen.getByLabelText('Assignment detail');
    expect(panel).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Lab #1' })).toBeInTheDocument();
    expect(screen.getByText('Build the threat model.')).toBeInTheDocument();
    // The planner block and the submission block come along with the body.
    expect(screen.getByLabelText('Notes')).toBeInTheDocument();
    expect(screen.getByLabelText('Submission')).toBeInTheDocument();
    expect(screen.getByText('10% a day.')).toBeInTheDocument();
    expect(notFound).not.toHaveBeenCalled();
  });

  /**
   * The walk finding: 38 of the 44 timed assignments carry `due_at` and no
   * `due_date`, and the DUE cell read "not recorded" with "11:59 PM" under it.
   */
  it('dates a row that records only the instant, in New York', () => {
    hooks.assignment = stub({
      ...ASSIGNMENT,
      id: 'IST.323/lab-1-performing-a-ransomware-attack',
      title: 'Lab 1 — performing a ransomware attack',
      due_date: null,
      due_at: '2026-09-24T03:59:00Z',
    });

    render(
      <CourseAssignment
        courseId="IST.323"
        assignmentId="IST.323/lab-1-performing-a-ransomware-attack"
      />,
    );

    const due = screen.getByText('Due').parentElement as HTMLElement;
    expect(within(due).getByText('Wed · Sep 23')).toBeInTheDocument();
    expect(within(due).getByText('11:59 PM')).toBeInTheDocument();
    expect(within(due).queryByText('not recorded')).toBeNull();
  });

  it('still says "not recorded" when the row records neither', () => {
    hooks.assignment = stub({ ...ASSIGNMENT, due_date: null, due_at: null, due_rule: null });
    render(<CourseAssignment courseId="IST.323" assignmentId="IST.323/lab-1" />);

    const due = screen.getByText('Due').parentElement as HTMLElement;
    expect(within(due).getByText('not recorded')).toBeInTheDocument();
    expect(within(due).getByText('time not recorded')).toBeInTheDocument();
  });

  it('accepts an assignment on a child shell of the course in the URL', () => {
    hooks.assignment = stub({ ...ASSIGNMENT, id: 'GEO.103.R/quiz-1', course_id: 'GEO.103.R' });
    hooks.course = stub({ id: 'GEO.103.R', bb_url: null, parent_course_id: 'GEO.103' });

    render(<CourseAssignment courseId="GEO.103" assignmentId="GEO.103.R/quiz-1" />);
    expect(screen.getByLabelText('Assignment detail')).toBeInTheDocument();
    expect(notFound).not.toHaveBeenCalled();
  });
});

describe('CourseAssignment — states it must not guess at', () => {
  it('says it is loading rather than calling the assignment missing', () => {
    hooks.assignment = loading();
    render(<CourseAssignment courseId="IST.323" assignmentId="IST.323/lab-1" />);

    expect(screen.getByText('Loading assignment…')).toBeInTheDocument();
    expect(notFound).not.toHaveBeenCalled();
  });

  it('treats a pending query that is not fetching yet as loading — the server render', () => {
    // On the server, and on the first client render before the fetch starts,
    // TanStack reports isPending without isFetching. That is not evidence of
    // absence: deciding not-found there made every direct load of the page a
    // 404 in production (2026-09-22).
    hooks.assignment = stub(undefined, { isPending: true, isFetching: false });
    render(<CourseAssignment courseId="IST.323" assignmentId="IST.323/lab-1" />);

    expect(screen.getByText('Loading assignment…')).toBeInTheDocument();
    expect(notFound).not.toHaveBeenCalled();
  });

  it('waits for a pending course row that is not fetching yet, too', () => {
    hooks.assignment = stub({ ...ASSIGNMENT, course_id: 'GEO.103.R' });
    hooks.course = stub(undefined, { isPending: true, isFetching: false });

    render(<CourseAssignment courseId="GEO.103" assignmentId="GEO.103.R/quiz-1" />);
    expect(screen.getByText('Loading assignment…')).toBeInTheDocument();
    expect(notFound).not.toHaveBeenCalled();
  });

  it('reports a failed read rather than raising not-found', () => {
    hooks.assignment = stub(undefined, { isError: true, error: new Error('permission denied') });
    render(<CourseAssignment courseId="IST.323" assignmentId="IST.323/lab-1" />);

    expect(screen.getByRole('alert')).toHaveTextContent('permission denied');
    expect(notFound).not.toHaveBeenCalled();
  });

  it('waits for the course row before rejecting a possible child shell', () => {
    hooks.assignment = stub({ ...ASSIGNMENT, course_id: 'GEO.103.R' });
    hooks.course = loading();

    render(<CourseAssignment courseId="GEO.103" assignmentId="GEO.103.R/quiz-1" />);
    expect(screen.getByText('Loading assignment…')).toBeInTheDocument();
    expect(notFound).not.toHaveBeenCalled();
  });
});

/* ---------------------------------------------------------------------------
 * The route segment itself (TR-5)
 * ------------------------------------------------------------------------ */

describe('the route decodes what it is handed', () => {
  /** What Next passes the page: the path's segments, still encoded. */
  function paramsOf(id: string, assignmentId: string[]) {
    return Promise.resolve({ id, assignmentId });
  }

  it('hands the screen a decoded course id and assignment id', async () => {
    const element = await CourseAssignmentPage({
      params: paramsOf('GEO.103', ['GEO.103', 'caf%C3%A9%20study']),
    });

    expect(element.props).toMatchObject({
      courseId: 'GEO.103',
      assignmentId: 'GEO.103/café study',
    });
    expect(notFound).not.toHaveBeenCalled();
  });

  it('accepts the single-segment %2F form', async () => {
    const element = await CourseAssignmentPage({
      params: paramsOf('IST.323', ['IST.323%2Flab-1']),
    });
    expect(element.props).toMatchObject({ assignmentId: 'IST.323/lab-1' });
  });

  it('is not found — never a crash — for a malformed escape', async () => {
    await expect(
      CourseAssignmentPage({ params: paramsOf('IST.323', ['IST.323', '%zz']) }),
    ).rejects.toThrow('NEXT_NOT_FOUND');

    await expect(
      CourseAssignmentPage({ params: paramsOf('%E0%A4%A', ['IST.323', 'lab-1']) }),
    ).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('is not found when the segments name no assignment', async () => {
    await expect(
      CourseAssignmentPage({ params: paramsOf('IST.323', []) }),
    ).rejects.toThrow('NEXT_NOT_FOUND');
  });
});

describe('CourseAssignment — not found', () => {
  it('raises not-found when no assignment has that id', () => {
    hooks.assignment = stub(null);
    expect(() =>
      render(<CourseAssignment courseId="IST.323" assignmentId="IST.323/nope" />),
    ).toThrow('NEXT_NOT_FOUND');
    expect(notFound).toHaveBeenCalled();
  });

  it('raises not-found when the assignment belongs to another course', () => {
    hooks.assignment = stub({ ...ASSIGNMENT, course_id: 'ECN.304' });
    hooks.course = stub({ id: 'ECN.304', bb_url: null, parent_course_id: null });

    expect(() =>
      render(<CourseAssignment courseId="IST.323" assignmentId="ECN.304/pset-1" />),
    ).toThrow('NEXT_NOT_FOUND');
    expect(notFound).toHaveBeenCalled();
  });
});

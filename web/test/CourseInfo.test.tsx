/**
 * The Info tab's second honesty rule: "not recorded" is a claim about the
 * course, and a query that has not answered supports no claim at all.
 *
 * Every section on this pane used to read its own `data ?? []` straight into a
 * sentence — the policies block never looked at `schemeQ` at all — so a
 * dropped connection was reported to Stack as "the professor set no AI policy",
 * "no syllabus file has been pulled" and "no group assignment is recorded".
 *
 * The five queries are stubbed through `vi.hoisted` state so each test can put
 * one of them in flight or in failure without touching the network.
 */

import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Stub = {
  data: unknown;
  isPending: boolean;
  isFetching: boolean;
  isError: boolean;
  error: Error | null;
};

const answered = (data: unknown): Stub => ({
  data,
  isPending: false,
  isFetching: false,
  isError: false,
  error: null,
});
const loading = (): Stub => ({
  data: undefined,
  isPending: true,
  isFetching: true,
  isError: false,
  error: null,
});
const failed = (message: string): Stub => ({
  data: undefined,
  isPending: false,
  isFetching: false,
  isError: true,
  error: new Error(message),
});

const COURSE = {
  display_id: 'IST.323',
  code: 'IST 323',
  title_short: 'Intro to Cybersecurity',
  shell_ids: ['IST.323'],
  meetings: [],
  room_disputed: false,
  bb_url: 'https://blackboard.syracuse.edu/course/IST323',
};

const SCHEME = {
  course_id: 'IST.323',
  ai_policy: 'Generative AI is permitted for brainstorming only.',
  late_policy: '10% per day, three days maximum.',
  letter_scale: null,
};

const state = vi.hoisted(() => ({
  display: null as unknown,
  shells: null as unknown,
  staff: null as unknown,
  scheme: null as unknown,
  files: null as unknown,
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/lib/supabase/client', () => ({
  getSupabaseBrowserClient: () => ({ auth: { getSession: vi.fn() } }),
}));
vi.mock('@/lib/queries.course', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/queries.course')>();
  return {
    ...actual,
    useCourseDisplay: () => state.display,
    useCourseShells: () => state.shells,
    useCourseStaff: () => state.staff,
    useCourseGradingScheme: () => state.scheme,
    useUpdateCardNote: () => ({
      mutate: vi.fn(),
      isPending: false,
      isError: false,
      error: null,
    }),
  };
});
vi.mock('@/lib/queries.materials', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/queries.materials')>();
  return { ...actual, useCurrentFiles: () => state.files };
});

const { CourseInfo } = await import('@/app/(app)/course/[id]/info/CourseInfo');

beforeEach(() => {
  state.display = answered(COURSE);
  state.shells = answered([
    { id: 'IST.323', location: 'Hinds Hall 010', term_id: 'FALL26', kind: 'lecture', group_notes: null, card_note: null },
  ]);
  state.staff = answered([]);
  state.scheme = answered(SCHEME);
  state.files = answered([]);
});

describe('CourseInfo — Policies', () => {
  it('prints the recorded policies verbatim once the scheme has loaded', () => {
    render(<CourseInfo courseId="IST.323" />);
    expect(screen.getByText(SCHEME.ai_policy)).toBeInTheDocument();
    expect(screen.getByText(SCHEME.late_policy)).toBeInTheDocument();
  });

  it('never says "not recorded" for a scheme query still in flight', () => {
    state.scheme = loading();
    render(<CourseInfo courseId="IST.323" />);

    const policies = screen.getByLabelText('Policies');
    expect(policies).toHaveTextContent('loading…');
    expect(policies).not.toHaveTextContent('not recorded');
  });

  it('names the failure instead of reporting a course with no policies', () => {
    state.scheme = failed('scheme fetch failed');
    render(<CourseInfo courseId="IST.323" />);

    const policies = screen.getByLabelText('Policies');
    expect(policies).toHaveTextContent('Could not load the policies: scheme fetch failed');
    expect(policies).not.toHaveTextContent('not recorded');
  });
});

describe('CourseInfo — Syllabus', () => {
  it('says no syllabus is on file only once the library has answered', () => {
    render(<CourseInfo courseId="IST.323" />);
    expect(screen.getByLabelText('Syllabus')).toHaveTextContent(
      'No syllabus file has been pulled for this course.',
    );
  });

  it('does not claim the syllabus is missing when the file query failed', () => {
    state.files = failed('files fetch failed');
    render(<CourseInfo courseId="IST.323" />);

    const syllabus = screen.getByLabelText('Syllabus');
    expect(syllabus).toHaveTextContent('Could not load the file library: files fetch failed');
    expect(syllabus).not.toHaveTextContent('No syllabus file has been pulled');
  });
});

describe('CourseInfo — Groups and Staff', () => {
  it('does not claim there is no group assignment when the shells query failed', () => {
    state.shells = failed('shells fetch failed');
    render(<CourseInfo courseId="IST.323" />);

    const groups = screen.getByLabelText('Groups');
    expect(groups).toHaveTextContent('Could not load the group notes: shells fetch failed');
    expect(groups).not.toHaveTextContent('No group assignment is recorded');
  });

  it('does not claim there is no staff when the staff query failed', () => {
    state.staff = failed('staff fetch failed');
    render(<CourseInfo courseId="IST.323" />);

    const staff = screen.getByLabelText('Staff');
    expect(staff).toHaveTextContent('Could not load the staff: staff fetch failed');
    expect(staff).not.toHaveTextContent('No staff are recorded');
  });
});

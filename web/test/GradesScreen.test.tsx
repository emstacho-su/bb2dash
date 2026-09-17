/**
 * `/grades` — the three things a course header is allowed to say.
 *
 * "Blackboard's number, as of <seen_at>", "Blackboard publishes no total" and
 * "not synced yet" are three different facts. The screen used to be a stub
 * precisely because collapsing them into one blank pane, or filling the gap
 * with a computed figure, is the failure this project cares most about
 * avoiding — so each state gets its own test, and one test checks that no
 * number on the screen came from adding anything up.
 *
 * Every query hook is a stub; nothing here reaches Supabase.
 */

import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ECN304_ATTENDANCE,
  IST323_QUIZ,
  NEVER_SYNCED_COURSE,
  NO_TOTAL_COURSE,
  makeCourseGrade,
} from './factories.grades';

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

const hooks = vi.hoisted(() => ({
  courses: null as unknown,
  grades: null as unknown,
  gradebook: null as unknown,
}));

vi.mock('@/lib/supabase/client', () => ({
  getSupabaseBrowserClient: () => ({ from: vi.fn(), auth: { getSession: vi.fn() } }),
}));
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock('@/lib/queries.today', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/queries.today')>();
  return { ...actual, useCourseDisplay: () => hooks.courses };
});
vi.mock('@/lib/queries.grades', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/queries.grades')>();
  return {
    ...actual,
    useCourseGrades: () => hooks.grades,
    useGradebookLatest: () => hooks.gradebook,
  };
});

const { GradesScreen } = await import('@/app/(app)/grades/GradesScreen');

function course(over: Record<string, unknown> = {}) {
  return {
    display_id: 'IST.323',
    code: 'IST 323',
    title: 'Introduction to Information Security',
    shell_ids: ['IST.323'],
    meetings: null,
    room_disputed: false,
    bb_url: null,
    card_note: null,
    ...over,
  };
}

beforeEach(() => {
  hooks.courses = stub([course()]);
  hooks.grades = stub([makeCourseGrade()]);
  hooks.gradebook = stub([IST323_QUIZ]);
});

describe('GradesScreen — the three course states', () => {
  it("shows Blackboard's total with the time we saw it", () => {
    render(<GradesScreen />);
    const card = screen.getByRole('region', { name: 'IST 323' });
    expect(within(card).getByText(/Blackboard’s number, as of Sep 14, 2:31 PM/)).toBeInTheDocument();
    expect(within(card).getByText('5 / 104')).toBeInTheDocument();
  });

  it('says exactly "Blackboard publishes no total" when it publishes none', () => {
    hooks.courses = stub([
      course({ display_id: 'GEO.103.lecture', code: 'GEO 103', shell_ids: ['GEO.103.lecture'] }),
    ]);
    hooks.grades = stub([NO_TOTAL_COURSE]);
    hooks.gradebook = stub([]);
    render(<GradesScreen />);

    expect(screen.getByText('Blackboard publishes no total')).toBeInTheDocument();
    expect(screen.queryByText(/Blackboard’s number/)).toBeNull();
  });

  it('says "not synced yet" when no gradebook has been read at all', () => {
    hooks.courses = stub([
      course({ display_id: 'IST.471', code: 'IST 471', shell_ids: ['IST.471'] }),
    ]);
    hooks.grades = stub([NEVER_SYNCED_COURSE]);
    hooks.gradebook = stub([]);
    render(<GradesScreen />);

    expect(screen.getByText('not synced yet')).toBeInTheDocument();
    expect(screen.queryByText('Blackboard publishes no total')).toBeNull();
  });

  it('says "not synced yet" when the course has no v_course_grade row at all', () => {
    hooks.grades = stub([]);
    render(<GradesScreen />);
    expect(screen.getByText('not synced yet')).toBeInTheDocument();
  });
});

describe('GradesScreen — grouping and honesty', () => {
  it('draws one card per display course, in the order Home uses', () => {
    hooks.courses = stub([
      course(),
      course({ display_id: 'IST.352', code: 'IST 352', title: 'Information Analysis' }),
    ]);
    hooks.grades = stub([makeCourseGrade(), makeCourseGrade({ course_id: 'IST.352' })]);
    render(<GradesScreen />);

    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(headings).toEqual(['IST 323', 'IST 352']);
  });

  it("gives each course only its own shells' gradebook rows", () => {
    hooks.courses = stub([
      course(),
      course({ display_id: 'ECN.304', code: 'ECN 304', shell_ids: ['ECN.304'] }),
    ]);
    hooks.grades = stub([makeCourseGrade(), makeCourseGrade({ course_id: 'ECN.304' })]);
    hooks.gradebook = stub([IST323_QUIZ, { ...ECN304_ATTENDANCE, counts_toward_grade: true }]);
    render(<GradesScreen />);

    const ist = screen.getByRole('region', { name: 'IST 323' });
    const ecn = screen.getByRole('region', { name: 'ECN 304' });
    expect(within(ist).getByText('Quiz 2')).toBeInTheDocument();
    expect(within(ist).queryByText('Attendance')).toBeNull();
    expect(within(ecn).getByText('Attendance')).toBeInTheDocument();
  });

  it('does not add two shells together — it names the one that published a total', () => {
    hooks.courses = stub([
      course({
        display_id: 'GEO.103.lecture',
        code: 'GEO 103',
        shell_ids: ['GEO.103.lecture', 'GEO.103.recitation'],
      }),
    ]);
    hooks.grades = stub([
      { ...NO_TOTAL_COURSE, course_id: 'GEO.103.lecture' },
      { ...NO_TOTAL_COURSE, course_id: 'GEO.103.recitation' },
    ]);
    hooks.gradebook = stub([]);
    render(<GradesScreen />);

    expect(screen.getByText('Blackboard publishes no total')).toBeInTheDocument();
    expect(screen.getByText(/GEO.103.lecture \+ GEO.103.recitation/)).toBeInTheDocument();
  });
});

describe('GradesScreen — the title is the link (G-3, P-grades-2)', () => {
  it('makes the course title itself a link to that course', () => {
    render(<GradesScreen />);
    const card = screen.getByRole('region', { name: 'IST 323' });
    const link = within(card).getByRole('link', { name: 'IST 323' });
    expect(link).toHaveAttribute('href', '/course/IST.323');
  });

  it('keeps the link inside the level-2 heading, so the card still announces itself', () => {
    render(<GradesScreen />);
    const heading = screen.getByRole('heading', { level: 2, name: 'IST 323' });
    expect(within(heading).getByRole('link')).toHaveAttribute('href', '/course/IST.323');
  });

  it('encodes a display id that needs it', () => {
    hooks.courses = stub([course({ display_id: 'GEO.103.lecture', code: 'GEO 103' })]);
    hooks.grades = stub([makeCourseGrade({ course_id: 'GEO.103.lecture' })]);
    hooks.gradebook = stub([]);
    render(<GradesScreen />);
    expect(screen.getByRole('link', { name: 'GEO 103' })).toHaveAttribute(
      'href',
      '/course/GEO.103.lecture',
    );
  });

  it('no longer draws a separate "Course tab" button', () => {
    render(<GradesScreen />);
    expect(screen.queryByRole('link', { name: /Course tab/ })).toBeNull();
    expect(screen.queryByText(/Course tab/)).toBeNull();
  });
});

describe('GradesScreen — queries that have not landed', () => {
  it('says the courses are loading rather than "no courses"', () => {
    hooks.courses = stub(undefined, { isPending: true, isFetching: true });
    render(<GradesScreen />);
    expect(screen.getByText('loading…')).toBeInTheDocument();
    expect(screen.queryByText(/No courses are recorded/)).toBeNull();
  });

  it('does not claim a course is unsynced while the totals are still loading', () => {
    hooks.grades = stub(undefined, { isPending: true, isFetching: true });
    hooks.gradebook = stub(undefined, { isPending: true, isFetching: true });
    render(<GradesScreen />);
    expect(screen.getAllByText('loading…').length).toBeGreaterThan(0);
  });

  it('shows the database message when the gradebook read failed', () => {
    hooks.grades = stub(undefined, { isError: true, error: new Error('permission denied') });
    render(<GradesScreen />);
    expect(screen.getByRole('alert').textContent).toContain('permission denied');
  });
});

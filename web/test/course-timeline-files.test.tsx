/**
 * The course timeline's per-session file line (Phase 18, task 24, R-67 interim).
 *
 * Session and week links on files were written once at seed time, so most
 * courses have no session-linked file at all, and every session row used to
 * read "no files" — a claim about the course's materials that was really a
 * claim about a missing join. Until the links are filled, a course with no
 * session-linked files prints no sub-line; a course with any keeps the
 * per-session counts, "no files" included, because there the line means
 * something.
 *
 * Every query hook is a stub; nothing here reaches Supabase.
 */

import { fireEvent, render, screen } from '@testing-library/react';
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

function session(id: number, week: number, date: string, topic: string) {
  return {
    id,
    course_id: 'IST.352',
    week_no: week,
    session_date: date,
    topic,
    kind: 'lecture',
    confidence: 'confirmed',
    notes: null,
  };
}

const SESSIONS = [
  session(129, 1, '2026-08-26', 'Introduction to SA&D'),
  session(130, 2, '2026-08-31', 'The systems development environment'),
  session(131, 2, '2026-09-02', 'Project management'),
];

const hooks = vi.hoisted(() => ({ files: null as unknown }));

vi.mock('@/lib/supabase/client', () => ({
  getSupabaseBrowserClient: () => ({ auth: { getSession: vi.fn() } }),
}));

vi.mock('@/lib/queries.course', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/queries.course')>();
  return {
    ...actual,
    useCourseDisplay: () =>
      stub({ display_id: 'IST.352', code: 'IST 352', title: 'SA&D', shell_ids: ['IST.352'] }),
    useCourseShells: () => stub([{ id: 'IST.352', term_id: 'fall-2026' }]),
    useTerm: () => stub({ id: 'fall-2026', start_date: '2026-08-24' }),
    useCourseSessions: () => stub(SESSIONS),
    useCourseWorkItems: () => stub([]),
    useCourseGradingScheme: () => stub(null),
    useCourseSessionFiles: () => hooks.files,
  };
});

const { CourseScreen } = await import('@/app/(app)/course/[id]/classwork/CourseScreen');

function renderAllWeeks() {
  render(<CourseScreen courseId="IST.352" />);
  fireEvent.click(screen.getByRole('button', { name: 'Show weeks 1–16' }));
}

beforeEach(() => {
  hooks.files = stub([]);
  // jsdom has no layout; picking a week scrolls it into view.
  Element.prototype.scrollIntoView = vi.fn();
});

describe('CourseScreen timeline — the per-session file line', () => {
  it('prints no "no files" line on any session when the course has 0 session-linked files', () => {
    renderAllWeeks();
    expect(screen.getByText('Introduction to SA&D')).toBeInTheDocument();
    expect(screen.queryByText('no files')).toBeNull();
    expect(screen.queryByText(/^\d+ files?$/)).toBeNull();
  });

  it('prints nothing while the files query has not landed', () => {
    hooks.files = stub(undefined, { isPending: true, isFetching: true });
    renderAllWeeks();
    expect(screen.queryByText('no files')).toBeNull();
  });

  it('keeps per-session counts once the course has at least one linked file', () => {
    hooks.files = stub([
      { id: 31, session_id: 129, file_name: 'SAD-ch1.pptx', bucket: 'lecture' },
      { id: 47, session_id: 130, file_name: 'SAD-ch2.pptx', bucket: 'lecture' },
      { id: 48, session_id: 130, file_name: 'SAD-ch2-notes.pdf', bucket: 'lecture' },
    ]);
    renderAllWeeks();
    expect(screen.getByText('1 file')).toBeInTheDocument();
    expect(screen.getByText('2 files')).toBeInTheDocument();
    // Session 131 has none while its course has some: there the line is true.
    expect(screen.getAllByText('no files')).toHaveLength(1);
  });
});

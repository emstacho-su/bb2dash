/**
 * The IST.466 attendance marker (T-15, R-49; brief 97 B-27 and the phase-start
 * note, item 2).
 *
 * The schedule stars 8 of IST.466's classes: "*indicates 1 out of 15 classes
 * where attendance and participation counts." The syllabus also gives points
 * for every class: "A student earns up to 5 points for on-time attendance per
 * class." So a starred session carries the marker, and the timeline's session
 * panel carries the syllabus line for every IST.466 class, starred or not.
 * No other course shows either.
 */

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Session } from '@/lib/queries.course';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/course/IST.466/classwork',
}));
vi.mock('@/lib/supabase/client', () => ({
  getSupabaseBrowserClient: () => ({ auth: { getSession: vi.fn() } }),
}));

const { SessionRow, SessionPanel } = await import(
  '@/app/(app)/course/[id]/classwork/CourseScreen'
);
const { AttendanceMarker, showsAttendanceMarker } = await import(
  '@/components/popout/SessionPopout'
);

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: 1,
    course_id: 'IST.466',
    session_date: '2026-09-29',
    kind: 'lecture',
    week_no: 6,
    topic: 'Ethics presentations',
    notes: null,
    confidence: 'confirmed',
    source: 'syllabus',
    counts_attendance: false,
    ...overrides,
  } as Session;
}

const MARKER = 'Attendance and participation count';
const RULE = 'Every class earns attendance points (syllabus)';

describe('showsAttendanceMarker', () => {
  it('is true only for an IST.466 session with counts_attendance true', () => {
    expect(showsAttendanceMarker(makeSession({ counts_attendance: true }))).toBe(true);
    expect(showsAttendanceMarker(makeSession({ counts_attendance: false }))).toBe(false);
    expect(showsAttendanceMarker(makeSession({ counts_attendance: null }))).toBe(false);
    expect(
      showsAttendanceMarker(makeSession({ course_id: 'IST.323', counts_attendance: true })),
    ).toBe(false);
  });
});

describe('AttendanceMarker', () => {
  it('reads the schedule’s words and names its source in the title', () => {
    render(<AttendanceMarker session={makeSession({ counts_attendance: true })} />);
    expect(screen.getByText(MARKER)).toHaveAttribute('title', 'IST 466 schedule; this course only');
  });

  it('renders nothing for an unstarred session', () => {
    const { container } = render(<AttendanceMarker session={makeSession()} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('the IST.466 timeline', () => {
  it('marks a starred session row (9/29) and not an unstarred one', () => {
    const { unmount } = render(
      <SessionRow
        session={makeSession({ counts_attendance: true })}
        fileCount={0}
        active={false}
        onClick={vi.fn()}
      />,
    );
    expect(screen.getByText(MARKER)).toBeInTheDocument();
    unmount();

    render(
      <SessionRow
        session={makeSession({ session_date: '2026-09-24', counts_attendance: false })}
        fileCount={0}
        active={false}
        onClick={vi.fn()}
      />,
    );
    expect(screen.queryByText(MARKER)).toBeNull();
  });

  it('never marks a session of another course', () => {
    render(
      <SessionRow
        session={makeSession({ course_id: 'IST.323', counts_attendance: true })}
        fileCount={0}
        active={false}
        onClick={vi.fn()}
      />,
    );
    expect(screen.queryByText(MARKER)).toBeNull();
  });

  it('gives the panel the marker and the syllabus line on a starred session', () => {
    render(
      <SessionPanel session={makeSession({ counts_attendance: true })} files={[]} onClose={vi.fn()} />,
    );
    expect(screen.getByText(MARKER)).toBeInTheDocument();
    expect(screen.getByText(RULE)).toBeInTheDocument();
  });

  it('keeps the syllabus line on an unstarred IST.466 session, so it never reads as free', () => {
    render(<SessionPanel session={makeSession()} files={[]} onClose={vi.fn()} />);
    expect(screen.queryByText(MARKER)).toBeNull();
    expect(screen.getByText(RULE)).toBeInTheDocument();
  });

  it('shows neither on another course’s panel', () => {
    render(
      <SessionPanel
        session={makeSession({ course_id: 'IST.323', counts_attendance: true })}
        files={[]}
        onClose={vi.fn()}
      />,
    );
    expect(screen.queryByText(MARKER)).toBeNull();
    expect(screen.queryByText(RULE)).toBeNull();
  });
});

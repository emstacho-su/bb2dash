/**
 * The course Stream: what a feed row shows for each `post_kind`, and how the
 * feed is filtered and grouped before it gets there.
 *
 * The row renders on its own — no router, no query client, no network. The
 * Supabase browser client is mocked because the module graph reaches it through
 * the query layer.
 */

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { makeStreamRow } from './factories.course';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/lib/supabase/client', () => ({
  getSupabaseBrowserClient: () => ({ auth: { getSession: vi.fn() } }),
}));

const { StreamRow, formatPoints, formatDayHeading } = await import(
  '@/app/(app)/course/[id]/stream/CourseStream'
);
const { filterStreamRows, groupStreamByDay } = await import('@/lib/course-dimension');

function renderRow(overrides: Parameters<typeof makeStreamRow>[0] = {}) {
  return render(<StreamRow row={makeStreamRow(overrides)} />);
}

describe('StreamRow — announcement', () => {
  it('names the kind and shows the announcement body', () => {
    renderRow();
    expect(screen.getByText('Announcement')).toBeInTheDocument();
    expect(screen.getByText('Quiz 2 moves to Thursday')).toBeInTheDocument();
    expect(screen.getByText('The quiz will now open Thursday at 9am.')).toBeInTheDocument();
  });

  it('badges an unread announcement, and only an unread one', () => {
    const { unmount } = renderRow({ meta: { is_read: false } });
    expect(screen.getByText('unread')).toBeInTheDocument();
    unmount();

    renderRow({ meta: { is_read: true } });
    expect(screen.queryByText('unread')).toBeNull();
  });
});

describe('StreamRow — material', () => {
  it('shows the bucket in words and the file name', () => {
    renderRow({
      post_kind: 'material',
      ref_kind: 'bb_file',
      title: 'Lecture 3 — Planning, Policy and Risk',
      body: 'Course Content / Week 3',
      meta: { bucket: 'lecture_slides', file_name: 'Lecture3.pptx', mime_type: null },
    });
    expect(screen.getByText('Material')).toBeInTheDocument();
    expect(screen.getByText(/Lecture slides/)).toBeInTheDocument();
    expect(screen.getByText(/Lecture3\.pptx/)).toBeInTheDocument();
  });

  it('never leaks the speaker notes behind a body, and says they were hidden', () => {
    renderRow({
      post_kind: 'material',
      ref_kind: 'bb_file',
      body: 'What is a system?\n[notes] Remind them about the quiz.',
      meta: { bucket: 'lecture_slides', file_name: 'Lecture1.pptx', mime_type: null },
    });
    expect(screen.getByText('What is a system?')).toBeInTheDocument();
    expect(screen.queryByText(/Remind them/)).toBeNull();
    expect(screen.getByText('speaker notes hidden')).toBeInTheDocument();
  });
});

describe('StreamRow — assignments', () => {
  it('shows what a posted assignment carries and nothing it does not', () => {
    renderRow({
      post_kind: 'assignment_posted',
      ref_kind: 'assignment',
      title: 'Case analysis 1',
      body: null,
      meta: { type: 'homework', due_on: '2026-09-18', points_possible: 40, status: null },
    });
    expect(screen.getByText('Assignment posted')).toBeInTheDocument();
    expect(screen.getByText(/homework/)).toBeInTheDocument();
    expect(screen.getByText(/due 2026-09-18/)).toBeInTheDocument();
    expect(screen.getByText(/40 pts/)).toBeInTheDocument();
  });

  it('renders a due post with its status, and no points when none are recorded', () => {
    renderRow({
      post_kind: 'assignment_due',
      ref_kind: 'assignment',
      title: 'Case analysis 1',
      body: null,
      meta: { due_on: '2026-09-18', status: 'not_started', points_possible: null, type: null },
    });
    expect(screen.getByText('Due')).toBeInTheDocument();
    expect(screen.getByText(/not started/)).toBeInTheDocument();
    expect(screen.queryByText(/pts/)).toBeNull();
  });

  it('marks the row with its kind so the four are distinguishable', () => {
    const { container } = renderRow({ post_kind: 'assignment_due' });
    expect(container.querySelector('[data-post-kind="assignment_due"]')).not.toBeNull();
  });
});

describe('formatPoints — never invents a number', () => {
  it('formats what is there, in whole points or one decimal', () => {
    expect(formatPoints(40)).toBe('40 pts');
    expect(formatPoints('1')).toBe('1 pt');
    expect(formatPoints(2.55)).toBe('2.6 pts');
  });

  it('says nothing at all when the row has no points', () => {
    expect(formatPoints(null)).toBeNull();
    expect(formatPoints(undefined)).toBeNull();
    expect(formatPoints('')).toBeNull();
    expect(formatPoints('n/a')).toBeNull();
  });
});

describe('the feed — filtering and grouping', () => {
  it('drops an assignment_due outside the ±14-day window and keeps one inside', () => {
    const rows = [
      makeStreamRow({ post_kind: 'assignment_due', ref_id: 'near', meta: { due_on: '2026-09-18' } }),
      makeStreamRow({ post_kind: 'assignment_due', ref_id: 'far', meta: { due_on: '2026-11-30' } }),
      makeStreamRow({ post_kind: 'assignment_due', ref_id: 'past', meta: { due_on: '2026-06-01' } }),
    ];
    const kept = filterStreamRows(rows, '2026-09-10').map((r) => r.ref_id);
    expect(kept).toEqual(['near']);
  });

  it('never windows anything that is not a due post', () => {
    const rows = [
      makeStreamRow({ post_kind: 'announcement', posted_at: '2026-01-02T14:00:00Z' }),
      makeStreamRow({ post_kind: 'material', posted_at: '2026-01-03T14:00:00Z' }),
      makeStreamRow({ post_kind: 'assignment_posted', posted_at: '2026-01-04T14:00:00Z' }),
    ];
    expect(filterStreamRows(rows, '2026-09-10')).toHaveLength(3);
  });

  it('groups by the New York day, newest day and newest post first', () => {
    // 23:30Z on the 8th and 02:00Z on the 9th are the same evening in New York.
    const rows = [
      makeStreamRow({ ref_id: 'a', posted_at: '2026-09-08T23:30:00Z' }),
      makeStreamRow({ ref_id: 'b', posted_at: '2026-09-09T02:00:00Z' }),
      makeStreamRow({ ref_id: 'c', posted_at: '2026-09-09T18:00:00Z' }),
    ];
    const days = groupStreamByDay(rows);
    expect(days.map((d) => d.day)).toEqual(['2026-09-09', '2026-09-08']);
    expect(days[1].rows.map((r) => r.ref_id)).toEqual(['b', 'a']);
    expect(days[0].rows.map((r) => r.ref_id)).toEqual(['c']);
  });
});

describe('formatDayHeading', () => {
  it('says "Today" for today and a weekday for anything else', () => {
    expect(formatDayHeading('2026-09-10', '2026-09-10')).toBe('Today');
    expect(formatDayHeading('2026-09-08', '2026-09-10')).toBe('Tue · Sep 8');
  });
});

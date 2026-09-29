/**
 * The course Stream since round 3 (R3-4): the Upcoming-work tracker over the
 * course timeline. The day-grouped post feed is gone; what each lane shows is
 * covered in `CourseTimeline.test.tsx`. This file pins the page's composition
 * and the one helper of the old feed that the timeline still uses.
 */

import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeCourseDisplay } from './factories';
import { newQueryClient, readChain } from './hydration-harness';

const state = vi.hoisted(() => ({ byTable: {} as Record<string, unknown[]> }));

vi.mock('@/lib/supabase/client', () => ({
  getSupabaseBrowserClient: () => ({
    from: (table: string) =>
      readChain(state.byTable, table, { singleTables: ['v_course_display', 'terms'] }),
    auth: { getSession: vi.fn() },
  }),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/course/IST.352/stream',
}));

const { CourseStream } = await import('@/app/(app)/course/[id]/stream/CourseStream');
const { streamDayKey } = await import('@/lib/course-dimension');

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-29T14:00:00Z'));
  state.byTable = {
    v_course_display: [makeCourseDisplay({ display_id: 'IST.352', code: 'IST 352', shell_ids: ['IST.352'] })],
    courses: [{ id: 'IST.352', term_id: 'fall-2026' }],
    terms: [{ id: 'fall-2026', start_date: '2026-08-24' }],
  };
});

afterEach(() => {
  vi.useRealTimers();
});

describe('CourseStream — the tracker over the timeline', () => {
  it('renders the Upcoming strip and then the week timeline, and no post feed', async () => {
    render(
      <QueryClientProvider client={newQueryClient()}>
        <CourseStream courseId="IST.352" />
      </QueryClientProvider>,
    );

    const timeline = await waitFor(() => screen.getByRole('region', { name: 'Course timeline' }));
    expect(screen.getByText('Upcoming work · IST 352')).toBeInTheDocument();
    expect(timeline.querySelector('[data-week="6"]')).not.toBeNull();
    expect(screen.queryByRole('region', { name: 'Course stream' })).toBeNull();
  });

  it('says so when the course does not exist', async () => {
    state.byTable.v_course_display = [];
    render(
      <QueryClientProvider client={newQueryClient()}>
        <CourseStream courseId="NOPE.101" />
      </QueryClientProvider>,
    );
    await waitFor(() => expect(screen.getByText('No course with id NOPE.101.')).toBeInTheDocument());
  });
});

describe('streamDayKey — the New York day an announcement lands on', () => {
  it('reads a late-evening UTC time as the same New York evening', () => {
    // 23:30Z on the 8th and 02:00Z on the 9th are the same evening in New York.
    expect(streamDayKey('2026-09-08T23:30:00Z')).toBe('2026-09-08');
    expect(streamDayKey('2026-09-09T02:00:00Z')).toBe('2026-09-08');
    expect(streamDayKey('2026-09-09T18:00:00Z')).toBe('2026-09-09');
  });
});

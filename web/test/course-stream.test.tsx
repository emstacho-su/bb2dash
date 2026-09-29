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

const state = vi.hoisted(() => ({ byTable: {} as Record<string, unknown[]>, hangTerms: false }));

vi.mock('@/lib/supabase/client', () => ({
  getSupabaseBrowserClient: () => ({
    from: (table: string) => {
      if (table === 'terms' && state.hangTerms) {
        const chain: Record<string, unknown> = {};
        for (const name of ['select', 'eq', 'order', 'limit']) chain[name] = () => chain;
        chain.maybeSingle = () => new Promise(() => {});
        return chain;
      }
      return readChain(state.byTable, table, { singleTables: ['v_course_display', 'terms'] });
    },
    auth: { getSession: vi.fn() },
  }),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/course/IST.352/stream',
}));

/**
 * The tracker is stubbed to record what the Stream hands it: its scrolling is
 * UpcomingTracker's own suite (UpcomingTracker.scroll.test.tsx, R3-1).
 */
const trackerProps = vi.hoisted(() => ({ calls: [] as Record<string, unknown>[] }));
vi.mock('@/components/tracker/UpcomingTracker', () => ({
  UpcomingTracker: (props: Record<string, unknown>) => {
    trackerProps.calls.push(props);
    return <h2>{props.title as string}</h2>;
  },
}));

const { CourseStream } = await import('@/app/(app)/course/[id]/stream/CourseStream');
const { streamDayKey } = await import('@/lib/course-dimension');

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-29T14:00:00Z'));
  trackerProps.calls = [];
  state.hangTerms = false;
  state.byTable = {
    v_course_display: [makeCourseDisplay({ display_id: 'IST.352', code: 'IST 352', shell_ids: ['IST.352'] })],
    courses: [{ id: 'IST.352', term_id: 'fall-2026' }],
    terms: [{ id: 'fall-2026', name: 'Fall 2026', start_date: '2026-08-24', end_date: '2026-12-11' }],
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

describe('CourseStream — the strip reaches back to the term start (R3-1)', () => {
  it('hands the tracker the term’s first day, the same source Home uses, and no anchor', async () => {
    render(
      <QueryClientProvider client={newQueryClient()}>
        <CourseStream courseId="IST.352" />
      </QueryClientProvider>,
    );
    await waitFor(() => expect(trackerProps.calls.at(-1)?.startIso).toBe('2026-08-24'));
    // No anchor from the Stream: the strip still opens on today.
    for (const props of trackerProps.calls) expect(props.anchor).toBeUndefined();
  });

  it('passes no start when the term has not begun, so nothing before today is invented', async () => {
    state.byTable.terms = [{ id: 'spring-2027', name: 'Spring 2027', start_date: '2027-01-19', end_date: '2027-05-07' }];
    render(
      <QueryClientProvider client={newQueryClient()}>
        <CourseStream courseId="IST.352" />
      </QueryClientProvider>,
    );
    await waitFor(() => expect(trackerProps.calls.length).toBeGreaterThan(0));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(trackerProps.calls.at(-1)?.startIso ?? null).toBeNull();
  });
});

describe('CourseStream — the tracker waits for the term (code review)', () => {
  it('reports the tracker as loading while the term row is in flight', async () => {
    state.hangTerms = true;
    render(
      <QueryClientProvider client={newQueryClient()}>
        <CourseStream courseId="IST.352" />
      </QueryClientProvider>,
    );
    await waitFor(() => expect(trackerProps.calls.length).toBeGreaterThan(0));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(trackerProps.calls.at(-1)?.isPending).toBe(true);
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

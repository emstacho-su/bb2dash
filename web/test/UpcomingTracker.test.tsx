/**
 * The shared Upcoming-work tracker: what the ◂ ▸ arrows actually do to the
 * screen, and what the detail panel says about the day you clicked.
 *
 * The clock is pinned to Thursday 2026-09-10 so "today" is a fixed column. Only
 * `Date` is faked — Testing Library's own scheduling still runs on real timers.
 * The Supabase browser client is mocked because the module graph reaches it
 * through the query layer; no test here touches the network.
 */

import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeWorkItem } from './factories';

vi.mock('@/lib/supabase/client', () => ({
  getSupabaseBrowserClient: () => ({ auth: { getSession: vi.fn() } }),
}));

const { UpcomingTracker } = await import('@/components/tracker/UpcomingTracker');

const TODAY = '2026-09-10';

/** Today, day 4 of the window, day 15 (page 2) and day 43 (page 4). */
const ITEMS = [
  makeWorkItem({ item_id: 'a-today', title: 'Reading for today', due_on: TODAY, category: 'reading', glyph: 'R', effort: 1 }),
  makeWorkItem({ item_id: 'a-soon', title: 'Lab #1 report', due_on: '2026-09-14', effort: 4 }),
  makeWorkItem({ item_id: 'a-page2', title: 'Midterm exam', due_on: '2026-09-25', category: 'exam', glyph: 'E', effort: 8 }),
  makeWorkItem({ item_id: 'a-page4', title: 'Final project', due_on: '2026-10-23', effort: 6 }),
];

function renderTracker(props: Partial<React.ComponentProps<typeof UpcomingTracker>> = {}) {
  const onStatusChange = vi.fn();
  const utils = render(
    <UpcomingTracker items={ITEMS} onStatusChange={onStatusChange} {...props} />,
  );
  return { ...utils, onStatusChange };
}

/** The day columns, in order. */
function dayColumns(): HTMLElement[] {
  return screen.getAllByRole('tab');
}

function pagerBack(): HTMLElement {
  return screen.getByRole('button', { name: 'Earlier days' });
}
function pagerForward(): HTMLElement {
  return screen.getByRole('button', { name: 'Later days' });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 8, 10, 9, 0, 0));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('UpcomingTracker — the default window', () => {
  it('shows 14 day columns starting today', () => {
    renderTracker();
    const columns = dayColumns();
    expect(columns).toHaveLength(14);
    expect(within(columns[0]).getByText('Today')).toBeInTheDocument();
    expect(within(columns[0]).getByText('Sep')).toBeInTheDocument();
    expect(within(columns[13]).getByText('23')).toBeInTheDocument();
  });

  it('summarises only the visible window, not the whole 56-day fetch', () => {
    renderTracker();
    // Sep 10 (1 pt) + Sep 14 (4 pts); the Sep 25 and Oct 23 rows are off-window.
    expect(screen.getByText('2 items · 5 pts · next 14 days')).toBeInTheDocument();
    expect(screen.getByText('Window · Sep 10 – Sep 23')).toBeInTheDocument();
  });

  it('takes a course-scoped title', () => {
    renderTracker({ title: 'Upcoming work · IST 323' });
    expect(
      screen.getByRole('heading', { name: 'Upcoming work · IST 323' }),
    ).toBeInTheDocument();
  });

  it('opens on today in the detail panel', () => {
    renderTracker();
    expect(screen.getByText('Today, Sep 10')).toBeInTheDocument();
    expect(screen.getByText('Reading for today')).toBeInTheDocument();
    expect(screen.queryByText('Lab #1 report')).toBeNull();
  });

  it('names the five glyphs in the legend', () => {
    renderTracker();
    for (const label of ['reading', 'assignment', 'quiz', 'project', 'exam']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });
});

describe('UpcomingTracker — click to detail', () => {
  it('fills the panel with the clicked day and no other', () => {
    renderTracker();
    fireEvent.click(dayColumns()[4]); // Mon Sep 14
    expect(screen.getByText('Mon, Sep 14')).toBeInTheDocument();
    expect(screen.getByText('Lab #1 report')).toBeInTheDocument();
    expect(screen.queryByText('Reading for today')).toBeNull();
  });

  it('says so plainly when a day has nothing due', () => {
    renderTracker();
    fireEvent.click(dayColumns()[1]); // Fri Sep 11
    expect(screen.getByText('0 due · 0 pts')).toBeInTheDocument();
    expect(
      screen.getByText(/Nothing due — a good day to start on what's coming\./),
    ).toBeInTheDocument();
  });

  it('reports the status change with the row that was edited', () => {
    const { onStatusChange } = renderTracker();
    fireEvent.change(screen.getByLabelText('Status for Reading for today'), {
      target: { value: 'in_progress' },
    });
    expect(onStatusChange).toHaveBeenCalledTimes(1);
    expect(onStatusChange.mock.calls[0][0].item_id).toBe('a-today');
    expect(onStatusChange.mock.calls[0][1]).toBe('in_progress');
  });

  it('disables the select for the row whose write is in flight', () => {
    renderTracker({ pendingItemId: 'a-today' });
    expect(screen.getByLabelText('Status for Reading for today')).toBeDisabled();
  });
});

describe('UpcomingTracker — ◂ ▸ paging', () => {
  it('starts with ◂ dead and ▸ live', () => {
    renderTracker();
    expect(pagerBack()).toBeDisabled();
    expect(pagerForward()).toBeEnabled();
  });

  it('▸ advances the window by 14 days and brings the next items into view', () => {
    renderTracker();
    fireEvent.click(pagerForward());

    expect(screen.getByText('Window · Sep 24 – Oct 7')).toBeInTheDocument();
    expect(screen.getByText('1 item · 8 pts · 14 days from Sep 24')).toBeInTheDocument();
    expect(pagerBack()).toBeEnabled();

    const columns = dayColumns();
    expect(columns).toHaveLength(14);
    expect(within(columns[0]).getByText('Thu')).toBeInTheDocument();
    expect(screen.queryByText('Today')).toBeNull();
  });

  it('◂ returns to the day the window started on', () => {
    renderTracker();
    fireEvent.click(pagerForward());
    fireEvent.click(pagerBack());
    expect(screen.getByText('Window · Sep 10 – Sep 23')).toBeInTheDocument();
    expect(pagerBack()).toBeDisabled();
  });

  it('runs out of pages at the end of the 56-day horizon', () => {
    renderTracker();
    fireEvent.click(pagerForward());
    fireEvent.click(pagerForward());
    fireEvent.click(pagerForward());
    expect(screen.getByText('Window · Oct 22 – Nov 4')).toBeInTheDocument();
    expect(pagerForward()).toBeDisabled();

    fireEvent.click(dayColumns()[1]); // Fri Oct 23
    expect(screen.getByText('Fri, Oct 23')).toBeInTheDocument();
    expect(screen.getByText('Final project')).toBeInTheDocument();
  });

  it('moves the detail panel onto the new window rather than leaving it behind', () => {
    renderTracker();
    fireEvent.click(pagerForward());
    expect(screen.getByText('Thu, Sep 24')).toBeInTheDocument();
    expect(screen.queryByText('Today, Sep 10')).toBeNull();
  });

  it('keeps the selection when it is still on screen after paging back', () => {
    renderTracker();
    fireEvent.click(pagerForward());
    fireEvent.click(dayColumns()[7]); // Thu Oct 1
    expect(screen.getByText('Thu, Oct 1')).toBeInTheDocument();
    fireEvent.click(pagerForward());
    // Oct 1 is off the Oct 8 – Oct 21 window, so the panel follows the window.
    expect(screen.getByText('Thu, Oct 8')).toBeInTheDocument();
  });

  it('honours a caller-supplied horizon and window size', () => {
    renderTracker({ horizonDays: 14, visibleDays: 7 });
    expect(dayColumns()).toHaveLength(7);
    expect(screen.getByText('Window · Sep 10 – Sep 16')).toBeInTheDocument();
    fireEvent.click(pagerForward());
    expect(screen.getByText('Window · Sep 17 – Sep 23')).toBeInTheDocument();
    expect(pagerForward()).toBeDisabled();
  });
});

describe('UpcomingTracker — controlled anchor and selection', () => {
  it('renders the anchor it is given and reports the one it wants next', () => {
    const onAnchorChange = vi.fn();
    renderTracker({ anchor: '2026-09-24', onAnchorChange });
    expect(screen.getByText('Window · Sep 24 – Oct 7')).toBeInTheDocument();

    fireEvent.click(pagerForward());
    expect(onAnchorChange).toHaveBeenCalledWith('2026-10-08');
    // Still on the anchor it was given: the parent owns the state.
    expect(screen.getByText('Window · Sep 24 – Oct 7')).toBeInTheDocument();
  });

  it('reports the selected day instead of moving on its own', () => {
    const onSelectDay = vi.fn();
    renderTracker({ selectedDay: TODAY, onSelectDay });
    fireEvent.click(dayColumns()[4]);
    expect(onSelectDay).toHaveBeenCalledWith('2026-09-14');
    expect(screen.getByText('Today, Sep 10')).toBeInTheDocument();
  });

  it('falls back to today when handed an anchor outside the horizon', () => {
    renderTracker({ anchor: '2026-01-01' });
    expect(screen.getByText('Window · Sep 10 – Sep 23')).toBeInTheDocument();
  });
});

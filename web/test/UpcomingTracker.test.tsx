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
/**
 * Since H-2 the strip runs from the first dated item to the last. `ITEMS`
 * starts on today, so that is also the first column; `STRIP_LAST` is the last.
 */
const STRIP_START = TODAY;
const STRIP_LAST = '2026-10-23';
/** Sep 10 → Oct 23 inclusive. */
const STRIP_COLUMNS = 44;

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

/** Every day column on the strip, in order — not just the fourteen on screen. */
function dayColumns(): HTMLElement[] {
  return screen.getAllByRole('tab');
}

/**
 * The column for a given date. Since H-2 the strip renders the whole range, so
 * addressing a column by its position in the visible window no longer works —
 * these tests name the day they mean.
 */
function columnOn(iso: string): HTMLElement {
  const day = (value: string) => new Date(`${value}T00:00:00`).getTime();
  const offset = Math.round((day(iso) - day(STRIP_START)) / 86_400_000);
  const column = dayColumns()[offset];
  if (!column) throw new Error(`no column for ${iso} (offset ${offset})`);
  return column;
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
  it('opens anchored on today, at the head of the strip', () => {
    renderTracker();
    const columns = dayColumns();
    expect(within(columns[0]).getByText('Today')).toBeInTheDocument();
    expect(within(columns[0]).getByText('Sep')).toBeInTheDocument();
    expect(screen.getByText('Window · Sep 10 – Sep 23')).toBeInTheDocument();
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
    fireEvent.click(columnOn('2026-09-14')); // Mon Sep 14
    expect(screen.getByText('Mon, Sep 14')).toBeInTheDocument();
    expect(screen.getByText('Lab #1 report')).toBeInTheDocument();
    expect(screen.queryByText('Reading for today')).toBeNull();
  });

  it('says so plainly when a day has nothing due', () => {
    renderTracker();
    fireEvent.click(columnOn('2026-09-11')); // Fri Sep 11
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

    // The strip itself does not change — paging scrolls it. Today's column is
    // still there, just off screen; Sep 24 is now the first one in view.
    expect(dayColumns()).toHaveLength(STRIP_COLUMNS);
    expect(within(columnOn('2026-09-24')).getByText('Thu')).toBeInTheDocument();
    expect(within(columnOn(TODAY)).getByText('Today')).toBeInTheDocument();
  });

  it('◂ returns to the day the window started on', () => {
    renderTracker();
    fireEvent.click(pagerForward());
    fireEvent.click(pagerBack());
    expect(screen.getByText('Window · Sep 10 – Sep 23')).toBeInTheDocument();
    expect(pagerBack()).toBeDisabled();
  });

  it('runs out of pages at the end of the strip, not at day 56', () => {
    renderTracker();
    fireEvent.click(pagerForward()); // Sep 24
    fireEvent.click(pagerForward()); // Oct 8
    fireEvent.click(pagerForward()); // Oct 10 — the last full window

    // The strip ends on the last dated item, so the last window ends there too
    // rather than running on to the empty tail of the 56-day fetch.
    expect(screen.getByText('Window · Oct 10 – Oct 23')).toBeInTheDocument();
    expect(pagerForward()).toBeDisabled();

    fireEvent.click(columnOn(STRIP_LAST)); // Fri Oct 23
    expect(screen.getByText('Fri, Oct 23')).toBeInTheDocument();
    expect(screen.getByText('Final project')).toBeInTheDocument();
  });

  it('moves the detail panel onto the new window rather than leaving it behind', () => {
    renderTracker();
    fireEvent.click(pagerForward());
    expect(screen.getByText('Thu, Sep 24')).toBeInTheDocument();
    expect(screen.queryByText('Today, Sep 10')).toBeNull();
  });

  it('moves the panel on when paging leaves the selected day behind', () => {
    renderTracker();
    fireEvent.click(pagerForward()); // Sep 24 – Oct 7
    fireEvent.click(columnOn('2026-10-01'));
    expect(screen.getByText('Thu, Oct 1')).toBeInTheDocument();
    fireEvent.click(pagerForward());
    // Oct 1 is off the Oct 8 – Oct 21 window, so the panel follows the window.
    expect(screen.getByText('Thu, Oct 8')).toBeInTheDocument();
  });

  it('honours a caller-supplied horizon and window size', () => {
    // The horizon bounds the strip: a 14-day fetch is a 14-column strip, with
    // seven of them on screen, however far out the items themselves reach.
    renderTracker({ horizonDays: 14, visibleDays: 7 });
    expect(dayColumns()).toHaveLength(14);
    expect(screen.getByText('Window · Sep 10 – Sep 16')).toBeInTheDocument();
    fireEvent.click(pagerForward());
    expect(screen.getByText('Window · Sep 17 – Sep 23')).toBeInTheDocument();
    expect(pagerForward()).toBeDisabled();
  });
});

describe('UpcomingTracker — the scrolling strip (H-2)', () => {
  it('renders one column per day from the first dated item to the last', () => {
    renderTracker();
    const columns = dayColumns();
    expect(columns).toHaveLength(STRIP_COLUMNS);
    expect(within(columns[0]).getByText('Today')).toBeInTheDocument();
    expect(within(columns[STRIP_COLUMNS - 1]).getByText('23')).toBeInTheDocument();
    expect(columns[STRIP_COLUMNS - 1]).toBe(columnOn(STRIP_LAST));
    // The month label keeps its rule over the longer strip: the 1st, and the
    // first column, and nothing else.
    expect(within(columnOn('2026-10-01')).getByText('Oct')).toBeInTheDocument();
  });

  it('names the whole span it scrolls over, next to the window it is showing', () => {
    renderTracker();
    expect(screen.getByText(/Scrolls Sep 10 – Oct 23/)).toBeInTheDocument();
  });

  it('sizes a column against the columns on screen, not the ones that exist', () => {
    renderTracker();
    // The CSS divides the visible width by this, so the strip overflows and
    // scrolls instead of squeezing 44 columns into one screen.
    expect(screen.getByRole('tablist')).toHaveStyle({ '--tracker-columns': '14' });
  });

  it('reaches back to work that was due earlier this week', () => {
    renderTracker({
      items: [
        makeWorkItem({ item_id: 'a-past', title: 'Monday quiz', due_on: '2026-09-07', effort: 2 }),
        ...ITEMS,
      ],
    });
    const columns = dayColumns();
    expect(within(columns[0]).getByText('7')).toBeInTheDocument();
    expect(columns).toHaveLength(STRIP_COLUMNS + 3);
    // …but it still opens on today, not on the oldest column.
    expect(screen.getByText('Window · Sep 10 – Sep 23')).toBeInTheDocument();
    expect(screen.getByText('Today, Sep 10')).toBeInTheDocument();
    expect(pagerBack()).toBeEnabled();
  });

  it('draws one screenful and nothing to scroll when nothing is dated', () => {
    renderTracker({ items: [] });
    expect(dayColumns()).toHaveLength(14);
    expect(screen.getByText(/Scrolls Sep 10 – Sep 23/)).toBeInTheDocument();
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
    fireEvent.click(columnOn('2026-09-14'));
    expect(onSelectDay).toHaveBeenCalledWith('2026-09-14');
    expect(screen.getByText('Today, Sep 10')).toBeInTheDocument();
  });

  it('falls back to today when handed an anchor outside the horizon', () => {
    renderTracker({ anchor: '2026-01-01' });
    expect(screen.getByText('Window · Sep 10 – Sep 23')).toBeInTheDocument();
  });
});

describe('UpcomingTracker — a fetch that has not answered', () => {
  it('says it is loading instead of counting an empty array', () => {
    renderTracker({ items: [], isPending: true });

    expect(screen.getAllByText('loading…')).toHaveLength(2); // head + detail panel
    expect(screen.queryByText(/0 items · 0 pts · next 14 days/)).toBeNull();
    expect(screen.queryByText(/0 due · 0 pts/)).toBeNull();
    expect(screen.queryByText(/Nothing due/)).toBeNull();
  });

  it('still draws the calendar while loading, with no bars on it', () => {
    renderTracker({ items: [], isPending: true });
    expect(dayColumns()).toHaveLength(14);
    expect(screen.getByText('Window · Sep 10 – Sep 23')).toBeInTheDocument();
  });

  it('names the failure rather than reporting a quiet fortnight', () => {
    renderTracker({ items: [], error: new Error('network unreachable') });

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Could not load upcoming work: network unreachable',
    );
    expect(screen.queryByText(/Nothing due/)).toBeNull();
    expect(screen.queryByText(/0 items · 0 pts/)).toBeNull();
    expect(screen.getAllByText('could not load')).toHaveLength(2);
  });

  it('counts normally once the fetch has answered', () => {
    renderTracker({ isPending: false, error: null });
    expect(screen.getByText('2 items · 5 pts · next 14 days')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('UpcomingTracker — a tab left open across midnight', () => {
  it('moves the selection onto the new today instead of describing yesterday', () => {
    const { rerender } = renderTracker();

    // Thursday Sep 10: today's column is selected and today's work is listed.
    expect(screen.getByText('Today, Sep 10')).toBeInTheDocument();
    expect(screen.getByText('Reading for today')).toBeInTheDocument();
    expect(columnOn(TODAY)).toHaveAttribute('aria-selected', 'true');

    // The clock rolls over; a window-focus refetch re-renders the same instance.
    vi.setSystemTime(new Date(2026, 8, 11, 0, 30, 0));
    rerender(<UpcomingTracker items={ITEMS} onStatusChange={vi.fn()} />);

    // Sep 10 keeps its column — it is the first dated item — but "Today" has
    // moved to the 11th, and so has everything that follows from it.
    expect(within(columnOn('2026-09-11')).getByText('Today')).toBeInTheDocument();
    expect(within(columnOn(TODAY)).getByText('Thu')).toBeInTheDocument();

    expect(screen.getByText('Today, Sep 11')).toBeInTheDocument();
    expect(screen.queryByText('Thu, Sep 10')).toBeNull();
    expect(screen.queryByText('Reading for today')).toBeNull();

    // And exactly one column is still selected — the new today.
    const selected = dayColumns().filter((c) => c.getAttribute('aria-selected') === 'true');
    expect(selected).toHaveLength(1);
    expect(selected[0]).toBe(columnOn('2026-09-11'));
  });

  it('keeps a selection that is still inside the window after the roll-over', () => {
    const { rerender } = renderTracker();
    fireEvent.click(columnOn('2026-09-14')); // Mon Sep 14
    expect(screen.getByText('Lab #1 report')).toBeInTheDocument();

    vi.setSystemTime(new Date(2026, 8, 11, 0, 30, 0));
    rerender(<UpcomingTracker items={ITEMS} onStatusChange={vi.fn()} />);

    // Sep 14 is still on screen, so the owner's choice stands.
    expect(screen.getByText('Mon, Sep 14')).toBeInTheDocument();
    expect(screen.getByText('Lab #1 report')).toBeInTheDocument();
  });
});

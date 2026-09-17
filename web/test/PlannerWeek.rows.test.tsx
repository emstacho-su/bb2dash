/**
 * A crowded hour grows, on the real screen (P-planner-2/3/4).
 *
 * Stack: "In order to visually fit multiple items into a one hour block, the
 * height of the block (for that hour, or however long the block with
 * overlapping items is) should scale up instead of cramming assignments and
 * classes into the same block and require scaling."
 *
 * The fixture is the case in the brief: a Wednesday IST 323 lecture, 3:45–5:05
 * PM, with two of its own assignments due inside it. They nest in the class
 * block rather than overlapping it, so nothing here is about lanes — it is
 * about the class block being three times as tall as the two lines it used to
 * get, and about everything else on the grid moving down with it: the gutter's
 * hour labels, the now-line and the 196 half-hour click targets.
 *
 * The numbers are written out rather than recomputed from the module, so a
 * change to the table is a change to this file too. `slotToPx` is then asked
 * the same question, which is what pins the component to the one map.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeWorkItem } from './factories';
import {
  PLANNER_BASE_SLOT_PX,
  buildSlotHeights,
  gridHeightPx,
  pxToSlot,
  slotToPx,
} from '@/lib/planner-rows';
import { PLANNER_SLOT_COUNT } from '@/lib/planner-week';

/* ---------------------------------------------------------------------------
 * Mocks
 * ------------------------------------------------------------------------ */

const db = vi.hoisted(() => ({ rows: {} as Record<string, unknown[]> }));

vi.mock('@/lib/supabase/client', () => ({
  getSupabaseBrowserClient: () => ({ from: (table: string) => chainFor(table) }),
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/planner',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
    [key: string]: unknown;
  }) => (
    <a href={href} {...(rest as Record<string, string>)}>
      {children}
    </a>
  ),
}));

const { PlannerWeek } = await import('@/components/planner/PlannerWeek');

function chainFor(table: string) {
  const result = () => {
    const rows = db.rows[table] ?? [];
    return { data: table === 'terms' ? (rows[0] ?? null) : rows, error: null };
  };
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  Object.assign(chain, {
    select: self,
    eq: self,
    gte: self,
    lt: self,
    lte: self,
    order: self,
    limit: self,
    maybeSingle: async () => result(),
    upsert: async () => ({ error: null }),
    then: (onFulfilled: (value: unknown) => unknown) => Promise.resolve(result()).then(onFulfilled),
  });
  return chain;
}

/* ---------------------------------------------------------------------------
 * Fixtures — Wednesday 2026-09-16, week of Monday 2026-09-14.
 * ------------------------------------------------------------------------ */

const LECTURE = {
  id: 1,
  course_id: 'IST.323',
  day_of_week: 3,
  start_time: '15:45:00',
  end_time: '17:05:00',
  location: 'Hinds Hall 010',
  starts_on: '2026-08-24',
  ends_on: '2026-12-11',
  courses: { id: 'IST.323', title_short: 'Cybersecurity', subject: 'IST', number: '323' },
};

/** Two IST 323 items due inside the IST 323 lecture, so both nest in it. */
const NESTED_ITEMS = [
  makeWorkItem({
    item_id: 'IST.323/quiz-3',
    title: 'Quiz 3',
    course_id: 'IST.323',
    due_on: '2026-09-16',
    due_at: '2026-09-16T20:00:00Z', // 4:00 PM New York
    category: 'quiz',
    glyph: 'Q',
  }),
  makeWorkItem({
    item_id: 'IST.323/lab-1',
    title: 'Lab #1 — packet capture and analysis for the midterm review',
    course_id: 'IST.323',
    due_on: '2026-09-16',
    due_at: '2026-09-16T20:30:00Z', // 4:30 PM New York
    category: 'project',
    glyph: 'P',
  }),
];

const TERM = [
  { id: 'fall-2026', name: 'Fall 2026', start_date: '2026-08-24', end_date: '2026-12-11' },
];

/**
 * The lecture covers slots 15.5 … 18.167, so rows 15–18 are the ones asked for
 * three lanes' worth of room: the class itself plus its two chips.
 */
const CROWDED_ROWS = [15, 16, 17, 18];

function crowdedHeights(): number[] {
  const weights = new Array<number>(PLANNER_SLOT_COUNT).fill(1);
  for (const slot of CROWDED_ROWS) weights[slot] = 3;
  return buildSlotHeights(weights);
}

function flatHeights(): number[] {
  return buildSlotHeights(new Array<number>(PLANNER_SLOT_COUNT).fill(1));
}

function renderPlanner() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <PlannerWeek />
    </QueryClientProvider>,
  );
}

function dayColumn(iso: string): HTMLElement {
  const column = document.querySelector(`[data-day="${iso}"]`);
  if (!(column instanceof HTMLElement)) throw new Error(`no column for ${iso}`);
  return column;
}

function board(): HTMLElement {
  const node = document.querySelector('[data-planner-board]');
  if (!(node instanceof HTMLElement)) throw new Error('no board');
  return node;
}

/** A slot button's own `--top-px`, in numbers. */
function slotTopPx(iso: string, slot: number): number {
  const button = dayColumn(iso).querySelector(`[data-slot="${slot}"]`);
  if (!(button instanceof HTMLElement)) throw new Error(`no slot ${slot}`);
  return Number.parseFloat(button.style.getPropertyValue('--top-px'));
}

function px(node: HTMLElement, name: string): number {
  return Number.parseFloat(node.style.getPropertyValue(name));
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 8, 16, 10, 0, 0)); // Wednesday, 10:00
  window.localStorage.clear();
  db.rows = {
    meetings: [LECTURE],
    sessions: [],
    v_work_items: NESTED_ITEMS,
    terms: TERM,
    planner_events: [],
  };
});

afterEach(() => {
  vi.useRealTimers();
  window.localStorage.clear();
});

/* ---------------------------------------------------------------------------
 * The crowded hour
 * ------------------------------------------------------------------------ */

describe('a class with two due items in it', () => {
  it('draws the class three times as tall as its hours alone would give it', async () => {
    renderPlanner();
    await within(dayColumn('2026-09-16')).findByText('Quiz 3');

    const block = dayColumn('2026-09-16').querySelector('[data-block="meeting"]');
    expect(block).toBeInstanceOf(HTMLElement);
    const meeting = block as HTMLElement;

    // Phase 11: 2.667 slots × 24px = 64px, and the two chips scrolled.
    // Now: rows 15–18 are 72px each, so the same hours are 192px of screen.
    expect(px(meeting, '--top-px')).toBe(396);
    expect(px(meeting, '--height-px')).toBeCloseTo(192, 6);

    const heights = crowdedHeights();
    expect(px(meeting, '--top-px')).toBe(slotToPx(15.5, heights));
  });

  it('keeps both chips in the block, and gives the long one room to wrap', async () => {
    renderPlanner();
    const column = dayColumn('2026-09-16');
    await within(column).findByText('Quiz 3');

    const blocks = column.querySelectorAll('[data-block]');
    expect(blocks).toHaveLength(1); // one class, nothing overlapping it
    const meeting = blocks[0] as HTMLElement;

    expect(within(meeting).getByText('Quiz 3')).toBeInTheDocument();
    expect(
      within(meeting).getByText('Lab #1 — packet capture and analysis for the midterm review'),
    ).toBeInTheDocument();
    // A 192px block, less its padding, pays for more than one line of title.
    expect(px(meeting, '--title-lines')).toBeGreaterThan(1);
  });

  it('makes the whole grid taller by exactly what the four rows gained', async () => {
    renderPlanner();
    await within(dayColumn('2026-09-16')).findByText('Quiz 3');

    const flat = PLANNER_SLOT_COUNT * PLANNER_BASE_SLOT_PX;
    expect(board().style.getPropertyValue('--planner-grid-height')).toBe(
      `${flat + CROWDED_ROWS.length * 2 * PLANNER_BASE_SLOT_PX}px`,
    );
    expect(board().style.getPropertyValue('--planner-grid-height')).toBe(
      `${gridHeightPx(crowdedHeights())}px`,
    );
  });
});

/* ---------------------------------------------------------------------------
 * Everything else moves with it
 * ------------------------------------------------------------------------ */

describe('the rest of the grid reads the same table', () => {
  it('puts the half-hour click targets below the grown hour at the right time', async () => {
    renderPlanner();
    await within(dayColumn('2026-09-16')).findByText('Quiz 3');

    const heights = crowdedHeights();
    // 5:30 PM is slot 19, the first row after the lecture.
    expect(slotTopPx('2026-09-16', 19)).toBe(648);
    expect(slotTopPx('2026-09-16', 19)).toBe(slotToPx(19, heights));
    // Read back the other way: that pixel is slot 19 and nothing else.
    expect(pxToSlot(slotTopPx('2026-09-16', 19), heights)).toBeCloseTo(19, 9);

    const button = dayColumn('2026-09-16').querySelector('[data-slot="19"]');
    expect(button).toHaveAttribute('aria-label', 'New event, Wed Sep 16, 5:30 PM');
  });

  it('grows the click target of a grown row, so no pixel of it is dead', async () => {
    renderPlanner();
    await within(dayColumn('2026-09-16')).findByText('Quiz 3');

    const column = dayColumn('2026-09-16');
    const crowded = column.querySelector('[data-slot="16"]') as HTMLElement;
    const ordinary = column.querySelector('[data-slot="4"]') as HTMLElement;
    expect(crowded.style.getPropertyValue('--height-px')).toBe('72px');
    expect(ordinary.style.getPropertyValue('--height-px')).toBe('24px');
  });

  it('moves the gutter hour labels down with the rows they name', async () => {
    renderPlanner();
    await within(dayColumn('2026-09-16')).findByText('Quiz 3');

    const heights = crowdedHeights();
    // 5 PM is slot 18: fifteen base rows, then three grown ones.
    expect(px(screen.getByText('5:00 PM'), '--top-px')).toBe(576);
    expect(px(screen.getByText('5:00 PM'), '--top-px')).toBe(slotToPx(18, heights));
    // 9 AM is above the crowd and has not moved at all.
    expect(px(screen.getByText('9:00 AM'), '--top-px')).toBe(slotToPx(2, flatHeights()));
  });

  it('places the now-line off the same table', async () => {
    renderPlanner();
    await within(dayColumn('2026-09-16')).findByText('Quiz 3');

    // 10:00 is slot 4, above the crowded rows, so it stays at 4 × 24.
    expect(px(screen.getByTestId('now-line'), '--top-px')).toBe(
      slotToPx(4, crowdedHeights()),
    );
  });

  it('draws one hour rule per hour after the first, on the same map', async () => {
    renderPlanner();
    await within(dayColumn('2026-09-16')).findByText('Quiz 3');

    const rules = Array.from(
      dayColumn('2026-09-16').querySelectorAll<HTMLElement>('[class*="hourRule"]'),
    );
    expect(rules).toHaveLength(13); // 08:00 … 21:00, less the column's own top edge
    const heights = crowdedHeights();
    expect(rules.map((rule) => px(rule, '--top-px'))).toEqual(
      [2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26].map((slot) => slotToPx(slot, heights)),
    );
  });
});

/* ---------------------------------------------------------------------------
 * The base case
 * ------------------------------------------------------------------------ */

describe('a week with nothing overlapping is the grid Phase 11 drew', () => {
  beforeEach(() => {
    db.rows.v_work_items = [
      makeWorkItem({
        item_id: 'ECN.304/pset-2',
        title: 'Problem set 2',
        course_id: 'ECN.304',
        due_on: '2026-09-17',
        due_at: '2026-09-17T18:00:00Z', // 2:00 PM Thursday — nothing near it
      }),
    ];
  });

  it('leaves every row at the base height', async () => {
    renderPlanner();
    await within(dayColumn('2026-09-17')).findByText('Problem set 2');

    expect(board().style.getPropertyValue('--planner-grid-height')).toBe(
      `${PLANNER_SLOT_COUNT * PLANNER_BASE_SLOT_PX}px`,
    );
    for (const slot of [0, 7, 19, 27]) {
      expect(slotTopPx('2026-09-17', slot)).toBe(slot * PLANNER_BASE_SLOT_PX);
    }
  });

  it('puts the class and the due card exactly where slot × 24 would', async () => {
    renderPlanner();
    const thursday = dayColumn('2026-09-17');
    await within(thursday).findByText('Problem set 2');

    const item = thursday.querySelector('[data-block="item"]') as HTMLElement;
    expect(px(item, '--top-px')).toBe(12 * PLANNER_BASE_SLOT_PX); // 14:00 → slot 12

    const lecture = dayColumn('2026-09-16').querySelector('[data-block="meeting"]') as HTMLElement;
    expect(px(lecture, '--top-px')).toBe(15.5 * PLANNER_BASE_SLOT_PX);
    expect(px(lecture, '--height-px')).toBeCloseTo((80 / 30) * PLANNER_BASE_SLOT_PX, 6);
  });

  it('still lets two clashing courses share the hour side by side, and grows it', async () => {
    db.rows.v_work_items = [
      makeWorkItem({
        item_id: 'ECN.304/pset-2',
        title: 'Problem set 2',
        course_id: 'ECN.304', // a different course, so it does not nest
        due_on: '2026-09-16',
        due_at: '2026-09-16T20:00:00Z', // 4:00 PM, inside the IST 323 lecture
      }),
    ];
    renderPlanner();
    const column = dayColumn('2026-09-16');
    await within(column).findByText('Problem set 2');

    const blocks = Array.from(column.querySelectorAll<HTMLElement>('[data-block]'));
    expect(blocks.map((b) => b.getAttribute('data-block'))).toEqual(['meeting', 'item']);
    // Lanes are untouched: still half the column each.
    for (const block of blocks) {
      expect(block.style.getPropertyValue('--lane-width')).toBe('50%');
    }
    // And the rows they share grew to two lanes' worth of room.
    await waitFor(() =>
      expect(board().style.getPropertyValue('--planner-grid-height')).not.toBe(
        `${PLANNER_SLOT_COUNT * PLANNER_BASE_SLOT_PX}px`,
      ),
    );
  });
});

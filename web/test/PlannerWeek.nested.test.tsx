/**
 * R-3-8 (Stack's preview walk, 2026-09-29): due items nested inside a class
 * block are always fully visible. The block and its hour rows grow to fit the
 * chips — past the 4× row cap when they have to — titles wrap in full, and the
 * block's text area is its whole height, so nothing is clipped. The chip
 * heights are sized for the narrowest column the planner supports (1040 px
 * with the sidebar open), so a wider window only has room to spare.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeWorkItem } from './factories';
import { PLANNER_BASE_SLOT_PX, PLANNER_BLOCK_PADDING_PX, PLANNER_MAX_SLOT_SCALE } from '@/lib/planner-rows';
import {
  nestedChipPx,
  nestedMeetingRequiredPx,
} from '@/components/planner/nested-fit';

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
 * Fixtures — Wednesday 2026-09-16: IST 323, 3:45–5:05 PM, three items inside it.
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

const TITLES = [
  'Quiz #5 — symmetric and asymmetric cryptography, chapters 7 and 8',
  'Lab #2 — packet capture and analysis of the captured handshake traffic',
  'Reading response: the Colonial Pipeline incident and what it teaches',
];

/** Due 3:50, 4:20 and 4:50 PM New York (EDT), all inside the class. */
const DUE_AT = ['2026-09-16T19:50:00Z', '2026-09-16T20:20:00Z', '2026-09-16T20:50:00Z'];

const NESTED = TITLES.map((title, index) =>
  makeWorkItem({
    item_id: `IST.323/nested-${index}`,
    title,
    course_id: 'IST.323',
    due_on: '2026-09-16',
    due_at: DUE_AT[index],
    category: 'quiz',
    glyph: 'Q',
  }),
);

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

function px(node: HTMLElement, name: string): number {
  return Number.parseFloat(node.style.getPropertyValue(name));
}

async function lectureBlock(): Promise<HTMLElement> {
  renderPlanner();
  const column = document.querySelector('[data-day="2026-09-16"]');
  if (!(column instanceof HTMLElement)) throw new Error('no Wednesday column');
  await within(column).findByText(TITLES[0]);
  const block = column.querySelector('[data-block="meeting"]');
  if (!(block instanceof HTMLElement)) throw new Error('no class block');
  return block;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 8, 16, 10, 0, 0));
  window.localStorage.clear();
  db.rows = {
    meetings: [LECTURE],
    sessions: [{ course_id: 'IST.323', session_date: '2026-09-16', topic: 'Cryptography 2' }],
    v_work_items: NESTED,
    terms: [{ id: 'fall-2026', name: 'Fall 2026', start_date: '2026-08-24', end_date: '2026-12-11' }],
    planner_events: [],
  };
});

afterEach(() => {
  vi.useRealTimers();
  window.localStorage.clear();
});

describe('R3-8 — a class with three due items in it', () => {
  it('nests all three and marks the block as carrying them', async () => {
    const block = await lectureBlock();
    for (const title of TITLES) expect(within(block).getByText(title)).toBeInTheDocument();
    expect(block).toHaveAttribute('data-nested', 'true');
  });

  it('is at least as tall as the sum of its chips, past the row cap if need be', async () => {
    const block = await lectureBlock();
    const chips = TITLES.reduce((total, title) => total + nestedChipPx(title), 0);
    const height = px(block, '--height-px');
    expect(height).toBeGreaterThanOrEqual(chips);
    expect(height).toBeGreaterThanOrEqual(
      nestedMeetingRequiredPx(
        { courseCode: 'IST 323', timeText: '3:45 – 5:05 PM', room: 'Hinds Hall 010', topic: 'Cryptography 2' },
        TITLES,
      ) - 0.001,
    );
    // The 4× cap alone would stop an 80-minute class at 2⅔ × 96 = 256 px.
    expect(height).toBeGreaterThan((8 / 3) * PLANNER_BASE_SLOT_PX * PLANNER_MAX_SLOT_SCALE);
  });

  it('gives the text area the whole block, so no chip is cut on a line boundary', async () => {
    const block = await lectureBlock();
    const body = block.querySelector('[data-block-body]') as HTMLElement;
    expect(px(body, '--content-px')).toBeCloseTo(px(block, '--height-px') - PLANNER_BLOCK_PADDING_PX, 6);
  });

  it('sizes a chip by its title: a longer title is a taller chip', () => {
    expect(nestedChipPx('Quiz 3')).toBeLessThan(nestedChipPx(TITLES[0]));
  });
});

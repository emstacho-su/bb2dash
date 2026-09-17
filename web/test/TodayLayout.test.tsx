/**
 * H-3 — the shape of the Home screen (P-home-3 and P-home-5).
 *
 * Two complaints, one row. "Upcoming work" and "today's work" used to be a bare
 * section with a separate card floating under it, which read as two unrelated
 * blocks; and the needs-attention row sat third from the top, above the work
 * Stack actually opens Home to see.
 *
 * So this asserts structure rather than appearance: that the strip and the day
 * panel have the SAME nearest card ancestor (one card, not two), and that the
 * needs-attention row is the last thing on the page.
 *
 * The whole screen is rendered with its query layer stubbed — every hook
 * `Today` calls is replaced, so nothing here reaches Supabase or TanStack.
 */

import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeCourseDisplay, makeWorkItem } from './factories';

const TODAY = '2026-09-10';

const stub = vi.hoisted(() => ({
  window: [] as unknown[],
  undated: [] as unknown[],
  courses: [] as unknown[],
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/lib/supabase/client', () => ({
  getSupabaseBrowserClient: () => ({ auth: { getSession: vi.fn() } }),
}));

const idle = { isPending: false, isFetching: false, isError: false, error: null };

vi.mock('@/lib/queries.today', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/queries.today')>();
  return {
    ...actual,
    useWorkItemsWindow: () => ({ ...idle, data: stub.window }),
    useUndatedWorkItems: () => ({ ...idle, data: stub.undated }),
    useCourseDisplay: () => ({ ...idle, data: stub.courses }),
    useTerm: () => ({ ...idle, data: null }),
    useSetItemStatus: () => ({ isPending: false, variables: undefined, mutate: vi.fn() }),
  };
});

// The needs-attention row has a query layer of its own; it is the position of
// the section that is under test here, not its contents.
vi.mock('@/app/(app)/NeedsAttention', () => ({
  NeedsAttentionRow: () => <section aria-label="Needs attention">needs attention</section>,
}));

const { Today } = await import('@/app/(app)/Today');

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 8, 10, 9, 0, 0));
  stub.window = [makeWorkItem({ item_id: 'a-today', title: 'Reading for today', due_on: TODAY })];
  stub.undated = [];
  stub.courses = [makeCourseDisplay({ display_id: 'IST.323', code: 'IST 323' })];
});

afterEach(() => {
  vi.useRealTimers();
});

/** The nearest ancestor carrying the `card` token class, if any. */
function cardAround(element: HTMLElement): HTMLElement | null {
  return element.closest('[class*="card"]');
}

describe('Home — one card for upcoming work and today (P-home-3)', () => {
  it('puts the day strip and the day panel inside the same card', () => {
    render(<Today />);

    const strip = screen.getByRole('tablist', { name: 'Effort by day' });
    const panel = screen.getByText('Today, Sep 10');

    const stripCard = cardAround(strip);
    expect(stripCard).not.toBeNull();
    expect(cardAround(panel)).toBe(stripCard);
  });

  it('gives the panel no card of its own to float in', () => {
    render(<Today />);
    const panel = screen.getByText('Today, Sep 10');
    // Walking up from the panel, the first card reached is the section's —
    // there is no inner one between them.
    const strip = screen.getByRole('tablist', { name: 'Effort by day' });
    expect(cardAround(panel)).toContainElement(strip);
  });

  it('keeps the heading with them, so the whole block is one element', () => {
    render(<Today />);
    const card = cardAround(screen.getByRole('tablist', { name: 'Effort by day' }));
    expect(card).toContainElement(screen.getByRole('heading', { name: 'Upcoming work' }));
  });
});

describe('Home — the needs-attention row goes last (P-home-5)', () => {
  it('renders it after the course cards, not before the undated tray', () => {
    const { container } = render(<Today />);

    const sections = Array.from(
      container.querySelectorAll('section'),
    ) as HTMLElement[];
    const labels = sections.map(
      (section) =>
        section.getAttribute('aria-label') ??
        section.querySelector('h2')?.textContent ??
        '',
    );

    expect(labels.at(-1)).toBe('Needs attention');
    expect(labels.indexOf('Needs attention')).toBeGreaterThan(labels.indexOf('Undated'));
    expect(labels.indexOf('Needs attention')).toBeGreaterThan(labels.indexOf('Courses'));
  });

  it('still renders it — moving it down is not dropping it', () => {
    render(<Today />);
    expect(screen.getByRole('region', { name: 'Needs attention' })).toBeInTheDocument();
  });
});

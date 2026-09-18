/**
 * CR-1 / P-home-2 — the strip's pixels, not just its labels.
 *
 * H-2 made the tracker a scrolling strip whose anchor drives `scrollLeft`. The
 * rest of `UpcomingTracker.test.tsx` asserts what the window LABEL and the
 * arrows say; nothing asserted where the strip actually is, and that is exactly
 * where it went wrong:
 *
 *   Home opens anchored on today. Free-scroll fourteen days right. Press ◂.
 *   `pageStripAnchor` returns today — which is already the stored anchor — so
 *   `strip.anchor` does not change, the effect keyed on it never fires, and the
 *   strip stays fourteen days ahead while the Window label, the counters and
 *   the arrow states all describe today's window.
 *
 * jsdom has no layout, so `clientWidth` is 0 and `scrollLeft` is a read-only 0.
 * Both are stubbed below — that is the whole reason this lives in its own file
 * rather than in the main tracker suite, which must keep running without them.
 */

import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeWorkItem } from './factories';

vi.mock('@/lib/supabase/client', () => ({
  getSupabaseBrowserClient: () => ({ auth: { getSession: vi.fn() } }),
}));

const { UpcomingTracker } = await import('@/components/tracker/UpcomingTracker');

const TODAY = '2026-09-10';
/** 700px over 14 visible columns = 50px a column, so the maths is readable. */
const WIDTH = 700;
const COLUMN = 50;

/** Sep 10 → Oct 23: a 44-column strip with 14 on screen. */
const ITEMS = [
  makeWorkItem({ item_id: 'a-today', title: 'Reading for today', due_on: TODAY, effort: 1 }),
  makeWorkItem({ item_id: 'a-soon', title: 'Lab #1 report', due_on: '2026-09-14', effort: 4 }),
  makeWorkItem({ item_id: 'a-page4', title: 'Final project', due_on: '2026-10-23', effort: 6 }),
];

/* ---------------------------------------------------------------------------
 * A jsdom that can scroll
 * ------------------------------------------------------------------------ */

const scrollLefts = new WeakMap<HTMLElement, number>();
let width = WIDTH;
let resizeCallbacks: (() => void)[] = [];
const originals: Record<string, PropertyDescriptor | undefined> = {};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 8, 10, 9, 0, 0));
  width = WIDTH;
  resizeCallbacks = [];

  originals.clientWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth');
  originals.scrollLeft = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollLeft');

  Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
    configurable: true,
    get() {
      return width;
    },
  });
  Object.defineProperty(HTMLElement.prototype, 'scrollLeft', {
    configurable: true,
    get(this: HTMLElement) {
      return scrollLefts.get(this) ?? 0;
    },
    set(this: HTMLElement, value: number) {
      scrollLefts.set(this, value);
    },
  });

  // jsdom ships no ResizeObserver; the component must cope either way, so the
  // tests that need one install it and the others leave it absent.
  delete (globalThis as { ResizeObserver?: unknown }).ResizeObserver;
});

afterEach(() => {
  for (const [name, descriptor] of Object.entries(originals)) {
    if (descriptor) Object.defineProperty(HTMLElement.prototype, name, descriptor);
    else delete (HTMLElement.prototype as unknown as Record<string, unknown>)[name];
  }
  delete (globalThis as { ResizeObserver?: unknown }).ResizeObserver;
  vi.useRealTimers();
});

function installResizeObserver() {
  class FakeResizeObserver {
    constructor(private readonly callback: () => void) {}
    observe() {
      resizeCallbacks.push(this.callback);
    }
    unobserve() {}
    disconnect() {
      resizeCallbacks = resizeCallbacks.filter((cb) => cb !== this.callback);
    }
  }
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = FakeResizeObserver;
}

const strip = () => screen.getByRole('tablist', { name: 'Effort by day' });
const pagerBack = () => screen.getByRole('button', { name: 'Earlier days' });
const pagerForward = () => screen.getByRole('button', { name: 'Later days' });

/** Let the effect's 0ms "programmatic scroll finished" timer fire. */
async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

/** Drag the strip to `days` from the left, the way a trackpad would. */
function freeScrollTo(days: number) {
  const el = strip();
  el.scrollLeft = days * COLUMN;
  fireEvent.scroll(el);
}

async function renderTracker() {
  const utils = render(<UpcomingTracker items={ITEMS} onStatusChange={vi.fn()} />);
  await settle();
  return utils;
}

/* ---------------------------------------------------------------------------
 * The repro
 * ------------------------------------------------------------------------ */

describe('UpcomingTracker — paging moves the strip, not just the label', () => {
  it('opens with the strip at today', async () => {
    await renderTracker();
    expect(strip().scrollLeft).toBe(0);
    expect(screen.getByText('Window · Sep 10 – Sep 23')).toBeInTheDocument();
  });

  it('◂ scrolls back to today after a free scroll, even though the anchor never moved', async () => {
    await renderTracker();

    freeScrollTo(14);
    expect(strip().scrollLeft).toBe(14 * COLUMN);
    // The label follows the reader's scroll…
    expect(screen.getByText('Window · Sep 24 – Oct 7')).toBeInTheDocument();

    fireEvent.click(pagerBack());
    await settle();

    // …and ◂ must bring the PIXELS back, not only the label. `pageStripAnchor`
    // returns today here, which is already the stored anchor.
    expect(strip().scrollLeft).toBe(0);
    expect(screen.getByText('Window · Sep 10 – Sep 23')).toBeInTheDocument();
    expect(pagerBack()).toBeDisabled();
  });

  it('▸ scrolls forward a whole window', async () => {
    await renderTracker();
    fireEvent.click(pagerForward());
    await settle();
    expect(strip().scrollLeft).toBe(14 * COLUMN);
  });

  it('▸ after a free scroll continues from where the reader is', async () => {
    await renderTracker();
    freeScrollTo(7); // Sep 17
    fireEvent.click(pagerForward());
    await settle();
    // Sep 17 + 14 = Oct 1, column 21.
    expect(strip().scrollLeft).toBe(21 * COLUMN);
  });

  it('lands exactly on the last window at the end of the strip', async () => {
    await renderTracker();
    fireEvent.click(pagerForward());
    await settle();
    fireEvent.click(pagerForward());
    await settle();
    fireEvent.click(pagerForward());
    await settle();
    // maxStripAnchor over 44 columns with 14 in view = column 30 (Oct 10).
    expect(strip().scrollLeft).toBe(30 * COLUMN);
    expect(pagerForward()).toBeDisabled();
  });

  it('does not fight the reader: clicking a day column never scrolls the strip', async () => {
    await renderTracker();
    freeScrollTo(14);
    const before = strip().scrollLeft;
    fireEvent.click(screen.getAllByRole('tab')[20]);
    await settle();
    expect(strip().scrollLeft).toBe(before);
  });
});

/* ---------------------------------------------------------------------------
 * Resize
 * ------------------------------------------------------------------------ */

describe('UpcomingTracker — a resized container', () => {
  it('recomputes the offset so the same day stays at the left edge', async () => {
    installResizeObserver();
    await renderTracker();

    fireEvent.click(pagerForward());
    await settle();
    expect(strip().scrollLeft).toBe(14 * COLUMN);

    // The window narrows: 14 columns now fit in 420px, so a column is 30px and
    // the SAME day sits at a different pixel offset.
    width = 420;
    await act(async () => {
      resizeCallbacks.forEach((cb) => cb());
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(strip().scrollLeft).toBe(14 * 30);
  });

  it('keeps the reader’s own scroll position across a resize', async () => {
    installResizeObserver();
    await renderTracker();

    freeScrollTo(7);
    width = 420;
    await act(async () => {
      resizeCallbacks.forEach((cb) => cb());
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(strip().scrollLeft).toBe(7 * 30);
  });

  it('stops observing when it unmounts', async () => {
    installResizeObserver();
    const { unmount } = await renderTracker();
    expect(resizeCallbacks).toHaveLength(1);
    unmount();
    expect(resizeCallbacks).toHaveLength(0);
  });

  it('renders and pages normally where there is no ResizeObserver at all', async () => {
    // Not installed in this test — the component must not assume one.
    await renderTracker();
    fireEvent.click(pagerForward());
    await settle();
    expect(strip().scrollLeft).toBe(14 * COLUMN);
  });
});

/* ---------------------------------------------------------------------------
 * The programmatic-scroll guard
 * ------------------------------------------------------------------------ */

describe('UpcomingTracker — the strip’s own scrolling is not read as a drag', () => {
  it('does not treat the scroll it just performed as the reader moving', async () => {
    await renderTracker();
    fireEvent.click(pagerForward());
    // The scroll event the browser fires for the programmatic move, before the
    // guard is released.
    fireEvent.scroll(strip());
    await settle();

    expect(screen.getByText('Window · Sep 24 – Oct 7')).toBeInTheDocument();
    expect(strip().scrollLeft).toBe(14 * COLUMN);
  });
});

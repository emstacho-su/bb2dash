/**
 * The Workspace page's own clock (`web/src/lib/workspace-clock.ts`; Phase 21,
 * the review round of 2026-10-06, ruling V4).
 *
 * Every "how long ago" the Workspace decides by is counted on one clock, the
 * page's monotonic one, from a moment the page saw itself. These cases hold the
 * three things that clock is used for:
 *
 *   * a reading for a render, ticking, that a changed system clock does not move;
 *   * the moment this page read a row, which a row it did not read does not have;
 *   * how long ago an owner first saw a key (the bound of the poll after Stop).
 *
 * The fake timers move `performance.now()` with the timers, and
 * `vi.setSystemTime()` moves the wall clock alone: that is the skew a laptop
 * with a wrong clock has.
 */

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { monotonicNowMs, readAtMs, stampRead, useMonotonicNow } from '@/lib/workspace-clock';

const START = Date.parse('2026-10-06T15:00:00Z');
const ONE_HOUR_MS = 60 * 60_000;

beforeEach(() => {
  vi.useFakeTimers({ now: START });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('monotonicNowMs: the page`s own count', () => {
  it('moves with the time that passes', () => {
    const before = monotonicNowMs();
    vi.advanceTimersByTime(30_000);
    expect(monotonicNowMs() - before).toBe(30_000);
  });

  it('does not move when the system clock is changed, forward or back', () => {
    const before = monotonicNowMs();
    vi.setSystemTime(START + ONE_HOUR_MS);
    expect(monotonicNowMs()).toBe(before);
    vi.setSystemTime(START - ONE_HOUR_MS);
    expect(monotonicNowMs()).toBe(before);
  });
});

describe('useMonotonicNow: that count for a render', () => {
  it('reads it on mount', () => {
    vi.advanceTimersByTime(1_234);
    const { result } = renderHook(() => useMonotonicNow(30_000));
    expect(result.current).toBe(monotonicNowMs());
  });

  it('re-reads it every interval', () => {
    const { result } = renderHook(() => useMonotonicNow(5_000));
    const mounted = result.current;
    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    expect(result.current).toBe(mounted + 5_000);
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(result.current).toBe(mounted + 15_000);
  });

  it('counts 30 s as 30 s while the system clock jumps an hour', () => {
    const { result } = renderHook(() => useMonotonicNow(30_000));
    const mounted = result.current;
    vi.setSystemTime(START + ONE_HOUR_MS);
    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(result.current).toBe(mounted + 30_000);
  });

  it('stops ticking when the last reader unmounts', () => {
    const { unmount } = renderHook(() => useMonotonicNow(5_000));
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('gives two readers one reading', () => {
    const first = renderHook(() => useMonotonicNow(5_000));
    act(() => {
      vi.advanceTimersByTime(2_000);
    });
    const second = renderHook(() => useMonotonicNow(5_000));
    expect(first.result.current).toBe(second.result.current);
  });
});

describe('stampRead and readAtMs: when this page read a row', () => {
  it('stamps the row with the page`s count at that moment, and hands the row back', () => {
    vi.advanceTimersByTime(4_000);
    const row = { polled_at: null };
    expect(stampRead(row)).toBe(row);
    const at = monotonicNowMs();

    vi.advanceTimersByTime(30_000);

    expect(readAtMs(row)).toBe(at);
  });

  it('has no moment for a row this page did not read: an equal copy is another row', () => {
    const read = stampRead({ polled_at: null });
    // What the saved cache restores: the same fields, parsed out of localStorage.
    const restored: object = JSON.parse(JSON.stringify(read));

    expect(readAtMs(restored)).toBeNull();
    expect(readAtMs(read)).not.toBeNull();
  });

  it('keeps nothing on the row itself, so the saved cache never carries a stamp', () => {
    const row = stampRead({ polled_at: null });
    expect(Object.keys(row)).toEqual(['polled_at']);
    expect(JSON.stringify(row)).toBe('{"polled_at":null}');
  });
});

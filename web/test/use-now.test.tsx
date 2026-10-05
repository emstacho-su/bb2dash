/** `useNow`: the clock as external state, re-read on subscribe and ticking only while asked to. */

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useNow } from '@/lib/use-now';

const START = new Date('2026-10-05T18:08:00.000Z');

beforeEach(() => {
  vi.useFakeTimers({ now: START });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useNow', () => {
  it('reads the clock on mount', () => {
    const { result } = renderHook(() => useNow(null));
    expect(result.current).toBe(START.getTime());
  });

  it('does not tick when given no interval', () => {
    const { result } = renderHook(() => useNow(null));
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(result.current).toBe(START.getTime());
  });

  it('re-reads the clock every interval while asked to', () => {
    const { result } = renderHook(() => useNow(5_000));
    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    expect(result.current).toBe(START.getTime() + 5_000);
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(result.current).toBe(START.getTime() + 15_000);
  });

  it('re-reads the clock at once when a tick is switched on after mounting without one', () => {
    const { result, rerender } = renderHook<number, { tick: number | null }>(
      ({ tick }) => useNow(tick),
      { initialProps: { tick: null } },
    );
    act(() => {
      vi.advanceTimersByTime(10 * 60_000);
    });
    expect(result.current).toBe(START.getTime());

    rerender({ tick: 5_000 });

    expect(result.current).toBe(START.getTime() + 10 * 60_000);
  });

  it('stops ticking when the interval is withdrawn, keeping the reading of that moment', () => {
    const { result, rerender } = renderHook<number, { tick: number | null }>(
      ({ tick }) => useNow(tick),
      { initialProps: { tick: 5_000 } },
    );
    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    rerender({ tick: null });
    const atSwitch = result.current;
    expect(atSwitch).toBe(START.getTime() + 5_000);

    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(result.current).toBe(atSwitch);
  });
});

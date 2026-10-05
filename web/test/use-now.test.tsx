/** `useNow`: the clock as state, ticking only while asked to. */

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
  it('reads the clock once on mount', () => {
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

  it('stops ticking when the interval is withdrawn', () => {
    const { result, rerender } = renderHook<number, { tick: number | null }>(
      ({ tick }) => useNow(tick),
      { initialProps: { tick: 5_000 } },
    );
    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    const ticked = result.current;
    rerender({ tick: null });
    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(result.current).toBe(ticked);
  });
});

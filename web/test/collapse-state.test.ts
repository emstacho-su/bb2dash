/**
 * P-70 — one collapse store for Home and Materials.
 *
 * Each surface has its own storage key and its own default: Materials opens
 * everything, Home's Undated tray starts folded (B-2). A missing or unreadable
 * key means the default; a stored JSON array of keys is Stack's last choice.
 * The hook reads through `useSyncExternalStore`, so no screen adopts storage in
 * a set-state effect (T-23).
 */

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  HOME_COLLAPSE,
  MATERIALS_COLLAPSE,
  UNDATED_SECTION,
  readCollapseSet,
  toggleKey,
  useCollapseState,
  writeCollapseSet,
} from '@/lib/collapse-state';
import {
  MATERIALS_COLLAPSE_KEY,
  readCollapsed,
  sectionKey,
  toggleCollapsed,
  writeCollapsed,
} from '@/lib/materials-collapse';

beforeEach(() => window.localStorage.clear());
afterEach(() => window.localStorage.clear());

describe('collapse-state — the surfaces', () => {
  it('keeps Materials under its pre-phase key, open by default', () => {
    expect(MATERIALS_COLLAPSE.storageKey).toBe('bb2dash.materials.collapsed');
    expect([...MATERIALS_COLLAPSE.defaultCollapsed]).toEqual([]);
  });

  it('gives Home a new key, with Undated folded by default (B-2)', () => {
    expect(HOME_COLLAPSE.storageKey).toBe('bb2dash.home.collapsed');
    expect([...HOME_COLLAPSE.defaultCollapsed]).toEqual([UNDATED_SECTION]);
  });
});

describe('collapse-state — reading', () => {
  it('answers the default when nothing is stored', () => {
    expect([...readCollapseSet(HOME_COLLAPSE)]).toEqual([UNDATED_SECTION]);
    expect([...readCollapseSet(MATERIALS_COLLAPSE)]).toEqual([]);
  });

  it('answers the stored choice, even an empty one', () => {
    window.localStorage.setItem(HOME_COLLAPSE.storageKey, '[]');
    expect([...readCollapseSet(HOME_COLLAPSE)]).toEqual([]);
  });

  it('answers the default for junk', () => {
    window.localStorage.setItem(HOME_COLLAPSE.storageKey, '{not json');
    expect([...readCollapseSet(HOME_COLLAPSE)]).toEqual([UNDATED_SECTION]);
    window.localStorage.setItem(HOME_COLLAPSE.storageKey, '{"a":1}');
    expect([...readCollapseSet(HOME_COLLAPSE)]).toEqual([UNDATED_SECTION]);
  });

  it('drops entries that are not strings', () => {
    window.localStorage.setItem(MATERIALS_COLLAPSE.storageKey, '["IST.466::readings", 4, null]');
    expect([...readCollapseSet(MATERIALS_COLLAPSE)]).toEqual(['IST.466::readings']);
  });

  it('answers the default when storage throws', () => {
    const getItem = Storage.prototype.getItem;
    Storage.prototype.getItem = () => {
      throw new Error('The operation is insecure.');
    };
    try {
      expect([...readCollapseSet(HOME_COLLAPSE)]).toEqual([UNDATED_SECTION]);
    } finally {
      Storage.prototype.getItem = getItem;
    }
  });

  it('reads a pre-phase Materials value back unchanged', () => {
    const prePhase = '["GEO.103.lecture::slides","IST.466::readings"]';
    window.localStorage.setItem(MATERIALS_COLLAPSE_KEY, prePhase);
    expect([...readCollapseSet(MATERIALS_COLLAPSE)]).toEqual([
      'GEO.103.lecture::slides',
      'IST.466::readings',
    ]);
    expect([...readCollapsed()]).toEqual(['GEO.103.lecture::slides', 'IST.466::readings']);
    expect(window.localStorage.getItem(MATERIALS_COLLAPSE_KEY)).toBe(prePhase);
  });
});

describe('collapse-state — writing', () => {
  it('stores a sorted JSON array', () => {
    writeCollapseSet(MATERIALS_COLLAPSE, new Set(['b', 'a']));
    expect(window.localStorage.getItem(MATERIALS_COLLAPSE.storageKey)).toBe('["a","b"]');
  });

  it('keeps the surfaces apart', () => {
    writeCollapseSet(HOME_COLLAPSE, new Set());
    expect(window.localStorage.getItem(MATERIALS_COLLAPSE.storageKey)).toBeNull();
  });

  it('reports a refused write instead of throwing', () => {
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw new Error('QuotaExceededError');
    };
    try {
      expect(writeCollapseSet(HOME_COLLAPSE, new Set())).toBe(false);
    } finally {
      Storage.prototype.setItem = setItem;
    }
  });

  it('toggles into a new set, leaving the old one alone', () => {
    const before = new Set(['a']);
    const after = toggleKey(before, 'b');
    expect([...before]).toEqual(['a']);
    expect([...after].sort()).toEqual(['a', 'b']);
    expect([...toggleKey(after, 'a')]).toEqual(['b']);
  });
});

describe('materials-collapse — thin re-exports keep their contract', () => {
  it('still names the same key and section format', () => {
    expect(MATERIALS_COLLAPSE_KEY).toBe(MATERIALS_COLLAPSE.storageKey);
    expect(sectionKey('IST.466', 'readings')).toBe('IST.466::readings');
  });

  it('round-trips through the old helpers', () => {
    writeCollapsed(toggleCollapsed(new Set(), 'IST.466::readings'));
    expect([...readCollapsed()]).toEqual(['IST.466::readings']);
  });
});

describe('useCollapseState — the hook', () => {
  it('starts on the surface default', () => {
    const { result } = renderHook(() => useCollapseState(HOME_COLLAPSE));
    expect(result.current.collapsed.has(UNDATED_SECTION)).toBe(true);
  });

  it('starts on the stored choice', () => {
    window.localStorage.setItem(HOME_COLLAPSE.storageKey, '[]');
    const { result } = renderHook(() => useCollapseState(HOME_COLLAPSE));
    expect(result.current.collapsed.has(UNDATED_SECTION)).toBe(false);
  });

  it('toggles, stores, and re-renders', () => {
    const { result } = renderHook(() => useCollapseState(HOME_COLLAPSE));
    act(() => result.current.toggle(UNDATED_SECTION));
    expect(result.current.collapsed.has(UNDATED_SECTION)).toBe(false);
    expect(window.localStorage.getItem(HOME_COLLAPSE.storageKey)).toBe('[]');
  });

  it('keeps the same set between renders while nothing changes', () => {
    const { result, rerender } = renderHook(() => useCollapseState(MATERIALS_COLLAPSE));
    const first = result.current.collapsed;
    rerender();
    expect(result.current.collapsed).toBe(first);
  });

  it('tells every mounted reader of the surface', () => {
    const a = renderHook(() => useCollapseState(MATERIALS_COLLAPSE));
    const b = renderHook(() => useCollapseState(MATERIALS_COLLAPSE));
    act(() => a.result.current.toggle('IST.466'));
    expect(b.result.current.collapsed.has('IST.466')).toBe(true);
  });

  it('still toggles for this page when storage refuses the write', () => {
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw new Error('QuotaExceededError');
    };
    try {
      const { result } = renderHook(() => useCollapseState(HOME_COLLAPSE));
      act(() => result.current.toggle(UNDATED_SECTION));
      expect(result.current.collapsed.has(UNDATED_SECTION)).toBe(false);
    } finally {
      Storage.prototype.setItem = setItem;
    }
    // A later successful write takes over from the page-only choice.
    const { result } = renderHook(() => useCollapseState(HOME_COLLAPSE));
    act(() => result.current.toggle(UNDATED_SECTION));
    expect(result.current.collapsed.has(UNDATED_SECTION)).toBe(true);
    expect(window.localStorage.getItem(HOME_COLLAPSE.storageKey)).toBe('["undated"]');
  });

  it('follows a change made in another tab', () => {
    const { result } = renderHook(() => useCollapseState(HOME_COLLAPSE));
    act(() => {
      window.localStorage.setItem(HOME_COLLAPSE.storageKey, '[]');
      window.dispatchEvent(new StorageEvent('storage', { key: HOME_COLLAPSE.storageKey }));
    });
    expect(result.current.collapsed.has(UNDATED_SECTION)).toBe(false);
  });
});

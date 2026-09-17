'use client';

/**
 * Which sections of the Grades screens are folded away, and where that choice
 * lives (Phase 12b, P-grades-1 / G-2).
 *
 * Stack's answer 4: each course's block collapses, and the groups inside it
 * collapse too. The choice has to survive a reload, so it goes to
 * localStorage — under the same rules as `sidebar-preference.ts`, which is the
 * precedent this file follows deliberately:
 *
 *   localStorage is best-effort. A blocked-cookies browser, a private window or
 *   a full quota all throw on access, and none of those is a reason to fail the
 *   page: the section's own default is a correct answer in every one of them.
 *   These are two of the few places in the app where a swallowed error is
 *   deliberate.
 *
 * Only a deviation from a section's default is recorded, so changing a default
 * in code takes effect for sections the owner never touched — the same shape as
 * `readStoredSidebar()` returning null and `resolveSidebar()` deciding.
 *
 * Every write is a read-modify-write of the whole record, so two components
 * toggling different sections cannot overwrite each other.
 */

import { useMemo, useState } from 'react';
import { useHydrated } from './use-hydrated';

export const GRADES_SECTIONS_KEY = 'bb2dash.grades.sections';

export type SectionState = 'open' | 'closed';

export type StoredSections = Readonly<Record<string, SectionState>>;

function isSectionState(value: unknown): value is SectionState {
  return value === 'open' || value === 'closed';
}

/** One course's whole block. */
export function courseSectionKey(displayId: string): string {
  return `course:${displayId}`;
}

/** The attendance-and-bookkeeping group inside one course's table. */
export function bookkeepingSectionKey(displayId: string): string {
  return `bookkeeping:${displayId}`;
}

/**
 * Everything the owner has explicitly chosen. Junk entries are dropped rather
 * than trusted: this record is read back out of a browser, which is a boundary
 * like any other.
 */
export function readStoredSections(): StoredSections {
  try {
    const raw = globalThis.localStorage?.getItem(GRADES_SECTIONS_KEY);
    if (typeof raw !== 'string') return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>).filter(
        (entry): entry is [string, SectionState] => isSectionState(entry[1]),
      ),
    );
  } catch {
    return {};
  }
}

/** Remember one section's state. Silent no-op where storage is unavailable. */
export function writeStoredSection(key: string, state: SectionState): void {
  try {
    const next: StoredSections = { ...readStoredSections(), [key]: state };
    globalThis.localStorage?.setItem(GRADES_SECTIONS_KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable; the choice simply does not survive the reload */
  }
}

/** The owner's choice wins; without one, the section's own default decides. */
export function resolveSection(
  stored: SectionState | undefined,
  fallback: SectionState,
): SectionState {
  return stored ?? fallback;
}

/**
 * One section's open/closed state, remembered across reloads.
 *
 * `key` is optional so a caller that has no stable identity for its section —
 * the gradebook table rendered outside a course card — still gets a working
 * toggle, just one that forgets. A hook cannot be called conditionally, so the
 * choice is made inside it rather than at the call site.
 *
 * The stored value is read only once this render may use browser-only state
 * (`useHydrated`), so the first client render matches the server's HTML and
 * React never throws the tree away. After the first toggle the local answer
 * wins and nothing is re-read — until `key` changes, which means this component
 * instance is now showing a different section and the old answer would be a
 * lie. Navigating from one course's Grades tab to the next does exactly that:
 * the route changes, React reuses the tree, and only the key moves.
 */
export function useSectionState(
  key: string | undefined,
  fallback: SectionState,
): readonly [open: boolean, toggle: () => void] {
  const hydrated = useHydrated();
  const [chosen, setChosen] = useState<SectionState | null>(null);
  const [chosenFor, setChosenFor] = useState(key);

  // Adjusting state during render because a prop changed — React's own pattern
  // for it, and cheaper than an effect: this render already produces the right
  // answer instead of painting the stale one first.
  if (chosenFor !== key) {
    setChosenFor(key);
    setChosen(null);
  }

  const stored = useMemo(
    () => (hydrated && key !== undefined ? readStoredSections()[key] : undefined),
    [hydrated, key],
  );
  const state = (chosenFor === key ? chosen : null) ?? resolveSection(stored, fallback);

  const toggle = () => {
    const next: SectionState = state === 'open' ? 'closed' : 'open';
    setChosen(next);
    if (key !== undefined) writeStoredSection(key, next);
  };

  return [state === 'open', toggle];
}

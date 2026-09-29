'use client';

/**
 * Which sections Stack has folded away, per screen (P-70).
 *
 * One store serves Home and Materials. Each surface has its own storage key
 * and its own default: Materials opens everything (collapsible is not
 * collapsed), Home's Undated tray starts folded (B-2). A missing or unreadable
 * key means the surface's default; a stored JSON array of keys is Stack's last
 * choice, and it is never rewritten on read, so a value stored before this
 * file existed reads back unchanged.
 *
 * Screens read it through `useCollapseState`, which is `useSyncExternalStore`
 * with the default as the server snapshot (DECISIONS 2026-09-16): the server
 * HTML and the first client render agree, and the stored choice arrives on the
 * next render without a set-state effect (T-23).
 *
 * localStorage is best-effort on purpose. A private window, blocked site data
 * or a full quota all throw, and none is a reason to fail the screen: a read
 * answers the default, and a refused write still folds the section for this
 * page, it just does not survive the reload. These are the only swallowed
 * storage errors here, and each one is deliberate.
 */

import { useCallback, useSyncExternalStore } from 'react';

export interface CollapseSurface {
  /** The localStorage key holding this surface's JSON array of folded keys. */
  readonly storageKey: string;
  /** What is folded before Stack has chosen anything. */
  readonly defaultCollapsed: ReadonlySet<string>;
}

function defineSurface(storageKey: string, defaultCollapsed: readonly string[]): CollapseSurface {
  return Object.freeze({ storageKey, defaultCollapsed: new Set(defaultCollapsed) });
}

/** Home's Undated tray: its one key. */
export const UNDATED_SECTION = 'undated';

/** Materials: course keys (`<courseId>`) and bucket keys (`<courseId>::<bucket>`). Open by default. */
export const MATERIALS_COLLAPSE = defineSurface('bb2dash.materials.collapsed', []);

/** Home: Undated starts folded (B-2), then remembered. */
export const HOME_COLLAPSE = defineSurface('bb2dash.home.collapsed', [UNDATED_SECTION]);

/* ---------------------------------------------------------------------------
 * Storage, pure
 * ------------------------------------------------------------------------ */

/** Parse a stored value; `null` when it is absent or not a JSON array. */
function parseStored(raw: string | null | undefined): ReadonlySet<string> | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null; // junk in storage is "no choice", not an error to show
  }
  if (!Array.isArray(parsed)) return null;
  return new Set(parsed.filter((entry): entry is string => typeof entry === 'string'));
}

/** The raw stored value, or `undefined` when storage refuses to answer. */
function readRaw(storageKey: string): string | null | undefined {
  try {
    return globalThis.localStorage?.getItem(storageKey) ?? null;
  } catch {
    return undefined; // storage unavailable; see header
  }
}

/** The folded set: Stack's stored choice, or the surface's default. */
export function readCollapseSet(surface: CollapseSurface): ReadonlySet<string> {
  return parseStored(readRaw(surface.storageKey)) ?? surface.defaultCollapsed;
}

/** Store the folded set as a sorted JSON array. False when storage refused it. */
export function writeCollapseSet(surface: CollapseSurface, collapsed: ReadonlySet<string>): boolean {
  try {
    globalThis.localStorage?.setItem(surface.storageKey, JSON.stringify([...collapsed].sort()));
    return true;
  } catch {
    return false; // storage unavailable; see header
  }
}

/** The set with one key flipped, as a NEW set. */
export function toggleKey(collapsed: ReadonlySet<string>, key: string): ReadonlySet<string> {
  const next = new Set(collapsed);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  return next;
}

/* ---------------------------------------------------------------------------
 * The external store behind the hook
 * ------------------------------------------------------------------------ */

/** Choices this page made that storage refused, by storage key. */
const pageOnly = new Map<string, ReadonlySet<string>>();
/** The last parsed value per key, so an unchanged value keeps its identity. */
const parsedCache = new Map<string, { raw: string | null | undefined; set: ReadonlySet<string> }>();
const listeners = new Map<string, Set<() => void>>();

function snapshot(surface: CollapseSurface): ReadonlySet<string> {
  const held = pageOnly.get(surface.storageKey);
  if (held) return held;
  const raw = readRaw(surface.storageKey);
  const cached = parsedCache.get(surface.storageKey);
  if (cached && cached.raw === raw) return cached.set;
  const set = parseStored(raw) ?? surface.defaultCollapsed;
  parsedCache.set(surface.storageKey, { raw, set });
  return set;
}

function notify(storageKey: string): void {
  listeners.get(storageKey)?.forEach((listener) => listener());
}

function subscribeTo(storageKey: string, listener: () => void): () => void {
  const set = listeners.get(storageKey) ?? new Set<() => void>();
  set.add(listener);
  listeners.set(storageKey, set);

  function onStorage(event: StorageEvent) {
    if (event.key === null || event.key === storageKey) listener();
  }
  window.addEventListener('storage', onStorage);
  return () => {
    set.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

function commit(surface: CollapseSurface, next: ReadonlySet<string>): void {
  if (writeCollapseSet(surface, next)) pageOnly.delete(surface.storageKey);
  else pageOnly.set(surface.storageKey, next);
  notify(surface.storageKey);
}

export interface CollapseState {
  collapsed: ReadonlySet<string>;
  toggle: (key: string) => void;
}

/** A surface's folded set, and a toggle that remembers the choice. */
export function useCollapseState(surface: CollapseSurface): CollapseState {
  const subscribe = useCallback(
    (listener: () => void) => subscribeTo(surface.storageKey, listener),
    [surface.storageKey],
  );
  const collapsed = useSyncExternalStore(
    subscribe,
    () => snapshot(surface),
    () => surface.defaultCollapsed,
  );
  const toggle = useCallback(
    (key: string) => commit(surface, toggleKey(snapshot(surface), key)),
    [surface],
  );
  return { collapsed, toggle };
}

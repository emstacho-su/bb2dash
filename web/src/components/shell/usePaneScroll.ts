'use client';

import { useEffect, useRef, type RefObject } from 'react';
import { usePathname } from 'next/navigation';

/**
 * The content pane keeps its scroll position per page (Phase 22, task 26; D-1, entry `app-frame-panes`).
 *
 * Since the pane scrolls and the document does not, a browser no longer puts a scroll position back
 * on Back and Forward: it restores a document's, not a pane's. So the shell keeps the pane's
 * `scrollTop` for each pathname as the reader scrolls it, and puts it back when the pathname
 * changes by Back or Forward (the `popstate` event); a page reached any other way starts at 0.
 *
 * Kept in memory, and mirrored to `sessionStorage` (a reload then Back still finds it). Never
 * `localStorage`, and nothing is written to the database. A page is a pathname: a change of query
 * alone (a tab, a week, `?item=`) neither resets the pane nor is remembered apart.
 */

/** Where the positions are mirrored. One key, in `sessionStorage`. */
export const PANE_SCROLL_KEY = 'bb2dash.pane-scroll';

/** How many animation frames (about a second) a restore waits for the page to grow tall enough. */
const RESTORE_FRAMES = 60;

/** The positions of this tab's pages, by pathname. */
const memory = new Map<string, number>();
let loaded = false;

function load(): void {
  if (loaded) return;
  loaded = true;
  try {
    const stored: unknown = JSON.parse(window.sessionStorage.getItem(PANE_SCROLL_KEY) ?? '{}');
    if (typeof stored !== 'object' || stored === null) return;
    for (const [path, value] of Object.entries(stored)) {
      if (typeof value === 'number' && Number.isFinite(value) && !memory.has(path)) memory.set(path, value);
    }
  } catch {
    // Storage disabled, or not JSON: the positions live in memory alone.
  }
}

function persist(): void {
  try {
    window.sessionStorage.setItem(PANE_SCROLL_KEY, JSON.stringify(Object.fromEntries(memory)));
  } catch {
    // Storage disabled or full: the positions live in memory alone.
  }
}

/**
 * Puts the pane at `target` and, when the page is not yet tall enough, keeps asking for a moment:
 * its data may still be arriving, and a pane cannot scroll further than its content is tall. The
 * reader's own scroll ends the wait. Returns the function that stops it.
 */
function putBack(node: HTMLElement, target: number): () => void {
  node.scrollTop = target;
  if (target === 0 || node.scrollTop >= target) return () => undefined;
  let frames = 0;
  let frame = 0;
  function settle() {
    node.scrollTop = target;
    frames += 1;
    if (node.scrollTop < target && frames < RESTORE_FRAMES) frame = window.requestAnimationFrame(settle);
  }
  function stop() {
    window.cancelAnimationFrame(frame);
  }
  frame = window.requestAnimationFrame(settle);
  node.addEventListener('wheel', stop, { passive: true, once: true });
  node.addEventListener('touchstart', stop, { passive: true, once: true });
  return () => {
    stop();
    node.removeEventListener('wheel', stop);
    node.removeEventListener('touchstart', stop);
  };
}

export function usePaneScroll(pane: RefObject<HTMLElement | null>): void {
  const pathname = usePathname();
  // Set by a `popstate`, read and cleared by the next change of pathname.
  const cameBack = useRef(false);

  // Remember the pane's position under the address it is scrolled at.
  useEffect(() => {
    const node = pane.current;
    if (node === null) return;
    load();
    function onScroll() {
      if (node !== null) memory.set(window.location.pathname, node.scrollTop);
    }
    node.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('pagehide', persist);
    return () => {
      node.removeEventListener('scroll', onScroll);
      window.removeEventListener('pagehide', persist);
    };
  }, [pane]);

  // Back and Forward arrive as a `popstate` just before the pathname changes.
  useEffect(() => {
    function onPop() {
      cameBack.current = true;
    }
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  // A new pathname starts at 0, unless the reader came back to it.
  useEffect(() => {
    const node = pane.current;
    if (node === null) return;
    load();
    const known = memory.get(pathname);
    const target = cameBack.current && known !== undefined ? known : 0;
    cameBack.current = false;
    const stop = putBack(node, target);
    memory.set(pathname, target);
    persist();
    return stop;
  }, [pathname, pane]);
}

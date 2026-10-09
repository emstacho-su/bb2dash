'use client';

import { useEffect, useState } from 'react';

/**
 * A panel that leaves (Phase 22, task 29; D-3).
 *
 * On `main` a panel was taken out of the page the moment it closed. Since this task a closing
 * panel stays for one exit, carries `data-leaving`, and is then removed. The time is read from the
 * panel's own computed custom property and never written in script. Where it reads 0 or cannot be
 * read, the panel is removed in the render that closes it: under reduced motion (the global reduce
 * block redeclares both exit times `0ms`) and in jsdom, which loads no stylesheet.
 *
 * `usePopover` keeps the shape R-51 gave it; this hook only decides whether the panel is still drawn.
 * No state waits for the exit: a panel reopened inside it is open and not leaving, and the timer
 * of the exit before is cleared.
 */

/** The exit time of a menu, a popover or a toast. */
export const EXIT_TOKEN = '--motion-exit';
/** The exit time of the popout. */
export const EXIT_TOKEN_LG = '--motion-exit-lg';

const MS_PER_SECOND = 1000;
const TIME = /^(\d*\.?\d+)(ms|s)$/;

/** The time a node's computed `token` names, in milliseconds; 0 when there is no node or it names none. */
export function readExitMs(node: Element | null, token: string): number {
  if (node === null || typeof window === 'undefined') return 0;
  const named = window.getComputedStyle(node).getPropertyValue(token).trim();
  const match = TIME.exec(named);
  if (match === null) return 0;
  const amount = Number(match[1]);
  return match[2] === 's' ? amount * MS_PER_SECOND : amount;
}

export interface Exit {
  /** Draw the panel: it is open, or it is on its way out. */
  present: boolean;
  /** It has closed and is still drawn, for one exit: put `data-leaving` on it. */
  leaving: boolean;
}

/** A callback ref for the panel element whose computed style names the exit time. */
export type ExitRef = (node: HTMLElement | null) => void;

/**
 * `const [exit, exitRef] = useExit(open)`. The ref is returned apart from the state, as
 * `usePopover` does (R-51): the React Compiler treats an object whose property reaches a `ref` prop
 * as a ref, and would report every read of `exit.present` as a ref read.
 */
export function useExit(open: boolean, token: string = EXIT_TOKEN): [Exit, ExitRef] {
  const [node, setNode] = useState<HTMLElement | null>(null);
  const [wasOpen, setWasOpen] = useState(open);
  const [exitMs, setExitMs] = useState(0);

  // Derived while rendering, the way the lint config asks for state that follows a prop: the
  // render that closes the panel already knows whether it stays.
  if (open !== wasOpen) {
    setWasOpen(open);
    setExitMs(open ? 0 : readExitMs(node, token));
  }

  useEffect(() => {
    if (exitMs === 0) return;
    const timer = window.setTimeout(() => setExitMs(0), exitMs);
    return () => window.clearTimeout(timer);
  }, [exitMs]);

  const leaving = !open && exitMs > 0;
  return [{ present: open || leaving, leaving }, setNode];
}

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

/** The pop-down's state and the actions a menu wires to its button. */
export interface PopoverState {
  open: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
  close: () => void;
}

/** A callback ref for the element that bounds the pop-down. */
export type PopoverAnchor<T extends HTMLElement> = (node: T | null) => void;

/**
 * Minimal pop-down behaviour: click outside to dismiss, Escape to dismiss,
 * and only one panel open at a time (the caller closes its sibling).
 * Deliberately hand-rolled — no UI framework in this project.
 *
 * `const [popover, anchor] = usePopover()`, then `ref={anchor}` on the element
 * that bounds the pop-down (R-51, Phase 17). The anchor used to ride in the
 * same object as `open`, and the React Compiler treats an object whose property
 * reaches a `ref` prop as a ref — so every read of `popover.open` during render
 * was reported as a ref read (`react-hooks/refs`, 18 findings in three menus).
 * Returned apart, the state object holds no ref. The anchor is a callback that
 * keeps the element in state, so the hook owns no ref object at all.
 */
export function usePopover<T extends HTMLElement = HTMLDivElement>(): [
  PopoverState,
  PopoverAnchor<T>,
] {
  const [open, setOpen] = useState(false);
  const [root, setRoot] = useState<T | null>(null);

  const close = useCallback(() => setOpen(false), []);
  const toggle = useCallback(() => setOpen((v) => !v), []);
  const anchor = useCallback((node: T | null) => setRoot(node), []);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent | TouchEvent) {
      if (root && !root.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, root]);

  const state = useMemo<PopoverState>(() => ({ open, setOpen, toggle, close }), [open, toggle, close]);
  return [state, anchor];
}

'use client';

import { useEffect, type RefObject } from 'react';

/**
 * Escape puts focus back on the button that opened a panel (Phase 22, task 32; D-4).
 *
 * `usePopover` closes on Escape and returns no focus (R-51), and keeps that shape. A panel that
 * wants focus back says so with this hook: while it is open, an Escape moves focus to its own
 * button. An outside press is not Escape: the press puts focus where the pointer went.
 */
export function useEscapeFocus(open: boolean, button: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') button.current?.focus();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, button]);
}

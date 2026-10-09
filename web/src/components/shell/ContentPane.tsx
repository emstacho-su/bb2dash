'use client';

import { useRef, type ReactNode } from 'react';
import { usePaneScroll } from './usePaneScroll';

/**
 * The shell's content pane: the page's one `main` element, which scrolls by itself since the frame
 * (Phase 22, task 26). It keeps its scroll position per page across Back and Forward
 * (`usePaneScroll`). `tabIndex={-1}` makes it the skip link's target.
 */
export function ContentPane({ id, className, children }: { id: string; className?: string; children: ReactNode }) {
  const pane = useRef<HTMLElement>(null);
  usePaneScroll(pane);
  return (
    <main ref={pane} id={id} tabIndex={-1} className={className}>
      {children}
    </main>
  );
}

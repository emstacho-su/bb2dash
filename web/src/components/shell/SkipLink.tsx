'use client';

import type { ReactNode } from 'react';

/**
 * "Skip to content" (Phase 22, task 32; D-4): the first Tab stop inside the shell. It is drawn only
 * while it has focus, and a press moves focus to the content pane (`target` is that pane's id; the
 * pane carries `tabIndex={-1}`). The press is handled here, not by the browser's fragment jump, so
 * the address and the history are left alone.
 */
export function SkipLink({
  target,
  className,
  children,
}: {
  target: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <a
      href={`#${target}`}
      className={className}
      onClick={(event) => {
        const pane = document.getElementById(target);
        if (pane === null) return;
        event.preventDefault();
        pane.focus();
      }}
    >
      {children}
    </a>
  );
}

'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import styles from './Popout.module.css';

/**
 * The modal surface every popout shares (R-05).
 *
 * Closing is the caller's business (the popouts are route-driven, so "close"
 * means dropping `?item=` from the URL) — this component only owns the shell:
 * backdrop, panel, the ✕, Esc, and returning focus to whatever opened it.
 *
 * Focus: the element that had focus when the popout mounted is remembered and
 * refocused on unmount, so dismissing the panel puts the reader back on the row
 * they clicked instead of at the top of the document. Focus moves into the
 * panel on open and Tab is contained inside it while it is up.
 */
export function PopoutShell({
  label,
  onClose,
  children,
}: {
  /** Accessible name for the dialog, e.g. "Assignment detail". */
  label: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<Element | null>(null);

  // Remember the opener, move focus in, and hand focus back on the way out.
  useEffect(() => {
    openerRef.current = document.activeElement;
    panelRef.current?.focus();
    return () => {
      const opener = openerRef.current;
      if (opener instanceof HTMLElement && document.contains(opener)) opener.focus();
    };
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;

      const panel = panelRef.current;
      if (!panel) return;
      const focusable = panel.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && (active === first || active === panel)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div
      className={styles.backdrop}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
      >
        <button type="button" className={styles.close} onClick={onClose} aria-label="Close">
          ✕
        </button>
        {children}
      </div>
    </div>
  );
}

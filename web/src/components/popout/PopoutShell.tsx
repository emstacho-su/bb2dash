'use client';

import { useCallback, useEffect, useRef, type ReactNode } from 'react';
import { Mark } from '@/components/shell/icons';
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
 *
 * Leaving (task 29): a host that keeps the frame for one exit passes `leaving` (it is marked
 * `data-leaving`, and takes no presses) and `onPanelNode`, so it can read the exit time from the
 * panel. The frame never waits before it calls `onClose`: the host decides how long it stays.
 */
export function PopoutShell({
  label,
  onClose,
  leaving = false,
  itemKey,
  onPanelNode,
  children,
}: {
  /** Accessible name for the dialog, e.g. "Assignment detail". */
  label: string;
  onClose: () => void;
  /** The host has closed the popout and keeps it for its exit. */
  leaving?: boolean;
  /** What the popout shows. A host that keeps the frame across items says which, so a different item inside an exit is a reopen. */
  itemKey?: string;
  /** Receives the panel element (and null when it goes), for `useExit`. */
  onPanelNode?: (node: HTMLElement | null) => void;
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const panelCallback = useCallback(
    (node: HTMLDivElement | null) => {
      panelRef.current = node;
      onPanelNode?.(node);
    },
    [onPanelNode],
  );
  const openerRef = useRef<Element | null>(null);

  // Hand focus back to the opener when the popout goes for good.
  useEffect(
    () => () => {
      const opener = openerRef.current;
      if (opener instanceof HTMLElement && document.contains(opener)) opener.focus();
    },
    [],
  );

  // Opening, and reopening inside an exit (the same item, or another one): remember what the reader
  // opened it from, unless focus is already in the panel, and move focus in.
  useEffect(() => {
    if (leaving) return;
    const panel = panelRef.current;
    const active = document.activeElement;
    if (panel !== null && !panel.contains(active)) openerRef.current = active;
    panel?.focus();
  }, [leaving, itemKey]);

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
      data-leaving={leaving ? '' : undefined}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelCallback}
        className={styles.panel}
        data-leaving={leaving ? '' : undefined}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
      >
        <button type="button" className={styles.close} onClick={onClose} aria-label="Close">
          <Mark name="close" />
        </button>
        {children}
      </div>
    </div>
  );
}

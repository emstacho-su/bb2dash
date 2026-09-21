'use client';

/**
 * "This event / This and following events / All events" (T-1).
 *
 * Editing or deleting an occurrence that is still part of a series asks this
 * first. It is the one place the scope of a calendar write is chosen, and the
 * write it leads to reaches Stack's real Google calendar within two minutes,
 * so nothing is assumed: the default is the narrowest answer, "This event",
 * and the button says what will happen.
 *
 * WHY NOT `PopoutShell`. This dialog opens *on top of* the planner-event form,
 * which is itself a `PopoutShell` listening for Escape on `window`. One Escape
 * must close one dialog, so the key is caught here in the **capture** phase and
 * its propagation stopped, which keeps it from reaching the shell underneath.
 * Everything else the shell gives is done here too: a focus trap, focus moved
 * in on open and handed back to the opener on close, and a backdrop that
 * dismisses.
 */

import { useEffect, useId, useRef, useState } from 'react';
import tokens from '@/styles/tokens.module.css';
import { SERIES_SCOPES, type SeriesScope } from '@/lib/planner-series-types';
import styles from './PlannerSeriesScopeDialog.module.css';

export type SeriesScopeIntent = 'edit' | 'delete';

const SCOPE_LABELS: Record<SeriesScope, string> = {
  this: 'This event',
  following: 'This and following events',
  all: 'All events',
};

const WORDING: Record<SeriesScopeIntent, { heading: string; confirm: string; consequence: string }> = {
  edit: {
    heading: 'Change repeating event',
    confirm: 'Save',
    consequence: 'The change reaches the bb2dash Google calendar within two minutes.',
  },
  delete: {
    heading: 'Delete repeating event',
    confirm: 'Delete',
    consequence: 'They are removed from the bb2dash Google calendar too.',
  },
};

const FOCUSABLE =
  'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

export interface PlannerSeriesScopeDialogProps {
  intent: SeriesScopeIntent;
  /** The occurrence's title, so the question names what it is about. */
  title: string;
  onChoose: (scope: SeriesScope) => void;
  onCancel: () => void;
  /** The write this dialog started is still in flight. */
  pending?: boolean;
}

export function PlannerSeriesScopeDialog({
  intent,
  title,
  onChoose,
  onCancel,
  pending = false,
}: PlannerSeriesScopeDialogProps) {
  const [scope, setScope] = useState<SeriesScope>('this');
  const panelRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<Element | null>(null);
  const headingId = useId();
  const groupName = useId();
  const wording = WORDING[intent];

  // Remember the opener, move focus onto the first choice, hand it back after.
  useEffect(() => {
    openerRef.current = document.activeElement;
    panelRef.current?.querySelector<HTMLElement>('input[type="radio"]')?.focus();
    return () => {
      const opener = openerRef.current;
      if (opener instanceof HTMLElement && document.contains(opener)) opener.focus();
    };
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        // Capture phase: stop the form's own Escape handler seeing this one.
        event.stopPropagation();
        onCancel();
        return;
      }
      if (event.key !== 'Tab') return;

      const panel = panelRef.current;
      if (!panel) return;
      const focusable = panel.querySelectorAll<HTMLElement>(FOCUSABLE);
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

    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [onCancel]);

  return (
    <div
      className={styles.backdrop}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <div
        ref={panelRef}
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        tabIndex={-1}
      >
        <h2 id={headingId} className={styles.heading}>
          {wording.heading}
        </h2>
        <p className={styles.subject}>{title}</p>

        <fieldset className={styles.choices}>
          <legend className={styles.legend}>What should this apply to?</legend>
          {SERIES_SCOPES.map((value) => (
            <label key={value} className={styles.choice}>
              <input
                type="radio"
                name={groupName}
                value={value}
                checked={scope === value}
                disabled={pending}
                onChange={() => setScope(value)}
              />
              {SCOPE_LABELS[value]}
            </label>
          ))}
        </fieldset>

        <p className={styles.consequence}>{wording.consequence}</p>

        <div className={styles.actions}>
          <button
            type="button"
            className={tokens.btnSecondary}
            onClick={onCancel}
            disabled={pending}
          >
            Cancel
          </button>
          <button
            type="button"
            className={intent === 'delete' ? styles.danger : tokens.btnPrimary}
            onClick={() => onChoose(scope)}
            disabled={pending}
          >
            {pending ? 'Saving…' : wording.confirm}
          </button>
        </div>
      </div>
    </div>
  );
}

'use client';

/**
 * Activity — the in-app half of R-26 (Phase 9).
 *
 * The transform writes a plain-language line into `sync_runs.summary.changes`
 * for everything it changed ("IST.323 Quiz 2 due date moved 9/2 → 9/9"). This
 * pop-down is where those lines are read, newest first, next to the (still
 * disabled) announcement bell.
 *
 * "Seen" is a per-browser convenience, not shared state: the highest run id
 * Stack has opened, kept in localStorage. Every storage access is wrapped —
 * a private window, blocked site data or a server render all throw, and none
 * of them is a reason to break the top bar.
 */

import { useRef, useState, useSyncExternalStore } from 'react';
import {
  readActivitySeen,
  relativeTime,
  unseenCount,
  useActivity,
  writeActivitySeen,
  type ActivityEntry,
} from '@/lib/queries.sync';
import tokens from '@/styles/tokens.module.css';
import { useEscapeFocus } from './useEscapeFocus';
import { useExit } from './useExit';
import { usePopover } from './usePopover';
import styles from './TopNav.module.css';

export function ActivityMenu() {
  const [popover, anchor] = usePopover<HTMLSpanElement>();
  const [exit, exitRef] = useExit(popover.open);
  const buttonRef = useRef<HTMLButtonElement>(null);
  useEscapeFocus(popover.open, buttonRef);
  const activity = useActivity();
  const entries = activity.data ?? [];

  // The stored mark is read through useSyncExternalStore: 0 on the server and
  // during hydration (localStorage does not exist there), the stored value on
  // every client render after. What this tab opened is kept beside it, so the
  // badge still clears where storage throws.
  const storedSeen = useSyncExternalStore(subscribeToStorage, readActivitySeen, serverSeen);
  const [openedSeen, setOpenedSeen] = useState(0);
  const seen = Math.max(storedSeen, openedSeen);

  const unseen = unseenCount(entries, seen);
  const newest = entries.length > 0 ? Math.max(...entries.map((entry) => entry.runId)) : 0;

  function open() {
    popover.toggle();
    if (!popover.open && newest > seen) {
      writeActivitySeen(newest);
      setOpenedSeen(newest);
    }
  }

  return (
    <span ref={anchor} className={styles.anchor}>
      <button
        type="button"
        ref={buttonRef}
        className={`${popover.open ? styles.icOpen : styles.ic} ${tokens.tip}`}
        onClick={open}
        aria-expanded={popover.open}
        aria-haspopup="menu"
        data-tip="Activity"
        aria-label={unseen > 0 ? `Activity ${unseen}` : 'Activity'}
      >
        <ActivityIcon />
        <span className="sr-only">Activity</span>
        {unseen > 0 && <span className={styles.badge}>{unseen}</span>}
      </button>

      {exit.present && (
        <div
          ref={exitRef}
          className={styles.ddActivity}
          role="menu"
          data-leaving={exit.leaving ? '' : undefined}
        >
          <div className={styles.ddHead}>Activity</div>
          {activity.isPending && <div className={styles.ddNote}>Loading…</div>}
          {activity.isError && (
            <div className={styles.ddNote}>Could not load activity: {activity.error.message}</div>
          )}
          {!activity.isPending && entries.length === 0 && (
            <div className={styles.ddNote}>
              No sync has reported a change yet. Run a sync and this fills in.
            </div>
          )}
          {entries.map((entry) => (
            <ActivityRow key={`${entry.runId}:${entry.lineNo}`} entry={entry} unseen={entry.runId > seen} />
          ))}
        </div>
      )}
    </span>
  );
}

/** Another tab opening Activity moves the stored mark; follow it. */
function subscribeToStorage(onChange: () => void): () => void {
  window.addEventListener('storage', onChange);
  return () => window.removeEventListener('storage', onChange);
}

/** Nothing has been seen as far as the server knows. */
function serverSeen(): number {
  return 0;
}

export function ActivityRow({ entry, unseen }: { entry: ActivityEntry; unseen: boolean }) {
  return (
    <div className={styles.ddActivityRow}>
      <span className={unseen ? styles.ddDotUnseen : styles.ddDot} aria-hidden="true" />
      <span className={styles.ddActivityLine}>{entry.line}</span>
      <span className={styles.ddActivityWhen}>{relativeTime(entry.at)}</span>
    </div>
  );
}

function ActivityIcon() {
  return (
    <svg viewBox="0 0 256 256" aria-hidden="true">
      <path d="M232 128a8 8 0 0 1-8 8h-42.11l-26.22 60.5a8 8 0 0 1-14.66-.2l-46.4-119.3-22.28 51.4A8 8 0 0 1 65 136H32a8 8 0 0 1 0-16h27.76l30.9-71.28a8 8 0 0 1 14.66.2l46.4 119.3 22.28-51.4A8 8 0 0 1 181.35 112H224a8 8 0 0 1 8 16Z" />
    </svg>
  );
}

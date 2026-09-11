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

import { useEffect, useState } from 'react';
import {
  readActivitySeen,
  relativeTime,
  unseenCount,
  useActivity,
  writeActivitySeen,
  type ActivityEntry,
} from '@/lib/queries.sync';
import { usePopover } from './usePopover';
import styles from './TopNav.module.css';

export function ActivityMenu() {
  const popover = usePopover<HTMLSpanElement>();
  const activity = useActivity();
  const entries = activity.data ?? [];

  // 0 until the first client render: localStorage does not exist on the server
  // and reading it during render would desynchronise hydration.
  const [seen, setSeen] = useState(0);
  useEffect(() => {
    setSeen(readActivitySeen());
  }, []);

  const unseen = unseenCount(entries, seen);
  const newest = entries.length > 0 ? Math.max(...entries.map((entry) => entry.runId)) : 0;

  function open() {
    popover.toggle();
    if (!popover.open && newest > seen) {
      writeActivitySeen(newest);
      setSeen(newest);
    }
  }

  return (
    <span ref={popover.ref} style={{ display: 'contents' }}>
      <button
        type="button"
        className={popover.open ? styles.icOpen : styles.ic}
        onClick={open}
        aria-expanded={popover.open}
        aria-haspopup="menu"
        title="Activity — what the last syncs changed"
      >
        <ActivityIcon />
        <span className="sr-only">Activity</span>
        {unseen > 0 && <span className={styles.badge}>{unseen}</span>}
      </button>

      {popover.open && (
        <div className={styles.ddActivity} role="menu">
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

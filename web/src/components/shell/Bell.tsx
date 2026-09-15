'use client';

/**
 * The announcements bell (R-20, Phase 11) — the cross-course "something new
 * arrived" signal the Stream could not give.
 *
 * Badge = the row count of `v_announcements_unread` (063). Opening the dropdown
 * lists up to eight, unread first then the newest already-seen, each as
 * `course · author · date` with its title; a row opens that course's Stream.
 *
 * WHAT HAPPENS ON OPEN. Once the list has rendered, `mark_announcements_seen()`
 * fires exactly once and the badge invalidates to zero. The rows keep the
 * unread styling they had **at the moment it opened** until the dropdown
 * closes: stamping `read_at` and then instantly re-rendering every row as read
 * would delete the one thing Stack opened the bell to see. The snapshot is a
 * set of ids, so it cannot be confused with the rows' real `read_at`.
 *
 * The list itself is only fetched while the dropdown is open — the badge query
 * is what runs on every screen.
 */

import { useMemo } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  allAnnouncementsOptions,
  bellRows,
  useUnreadAnnouncements,
  useUnreadSnapshot,
  type AnnouncementCard,
} from '@/lib/queries.announcements';
import { BellIcon } from './icons';
import { usePopover } from './usePopover';
import styles from './Bell.module.css';

/** How many rows the dropdown shows before "See all" takes over. */
const DROPDOWN_LIMIT = 8;

export function Bell() {
  const popover = usePopover<HTMLSpanElement>();
  const unread = useUnreadAnnouncements();
  const list = useQuery({ ...allAnnouncementsOptions(), enabled: popover.open });

  /**
   * `undefined` until the list has *succeeded* — that is what gates the whole
   * seen-once step. A failed list fetch leaves it undefined, so nothing is
   * stamped as read that was never shown.
   */
  const unreadIds = useMemo(
    () => (list.isSuccess ? (unread.data ?? []).map((row) => row.id) : undefined),
    [list.isSuccess, unread.data],
  );
  const unreadAtOpen = useUnreadSnapshot(popover.open, unreadIds);

  const badge = unread.data?.length ?? 0;
  const rows = bellRows(list.data ?? [], unreadAtOpen, DROPDOWN_LIMIT);

  return (
    <span ref={popover.ref} style={{ display: 'contents' }}>
      <button
        type="button"
        className={popover.open ? styles.icOpen : styles.ic}
        onClick={() => popover.toggle()}
        aria-expanded={popover.open}
        aria-haspopup="menu"
        title="Announcements"
      >
        <BellIcon />
        <span className="sr-only">Announcements</span>
        {badge > 0 && (
          <span className={styles.badge} data-testid="bell-badge">
            {badge}
          </span>
        )}
      </button>

      {popover.open && (
        <BellPanel
          rows={rows}
          state={list.isPending ? 'loading' : list.isError ? list.error.message : 'ready'}
          onNavigate={popover.close}
        />
      )}
    </span>
  );
}

/** The pop-down itself: a state line, the rows, and "See all". */
function BellPanel({
  rows,
  state,
  onNavigate,
}: {
  rows: AnnouncementCard[];
  /** 'loading' | 'ready' | an error message. */
  state: string;
  onNavigate: () => void;
}) {
  return (
    <div className={styles.panel} role="menu" aria-label="Announcements">
      <div className={styles.head}>Announcements</div>

      {state === 'loading' && <div className={styles.note}>Loading…</div>}
      {state !== 'loading' && state !== 'ready' && (
        <div className={styles.note} role="alert">
          Could not load announcements: {state}
        </div>
      )}
      {state === 'ready' && rows.length === 0 && (
        <div className={styles.note}>No announcements have been posted yet.</div>
      )}

      {rows.map((row) => (
        <BellRow key={row.id} row={row} onNavigate={onNavigate} />
      ))}

      <div className={styles.footer}>
        <Link href="/announcements" className={styles.seeAll} onClick={onNavigate}>
          See all
        </Link>
      </div>
    </div>
  );
}

/** One announcement: its unread dot, `course · author · date`, and its title. */
function BellRow({ row, onNavigate }: { row: AnnouncementCard; onNavigate: () => void }) {
  return (
    <Link
      href={`/course/${row.courseId}/stream`}
      className={styles.row}
      role="menuitem"
      onClick={onNavigate}
    >
      <span
        className={row.unread ? styles.dotUnread : styles.dot}
        aria-hidden="true"
        data-unread={String(row.unread)}
      />
      <span className={styles.rowBody}>
        <span className={styles.meta}>{row.meta}</span>
        <span className={row.unread ? styles.titleUnread : styles.title}>{row.title}</span>
      </span>
    </Link>
  );
}

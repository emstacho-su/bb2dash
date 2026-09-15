'use client';

/**
 * /announcements — every course's announcements in one list (R-20, Phase 11).
 *
 * Newest first, each row `course · author · date`, its title, and its body run
 * through the same `scrubSnippet` the course Stream uses: plain text, never
 * `dangerouslySetInnerHTML`, and a professor's PPTX speaker notes can never
 * surface here as if they were the announcement.
 *
 * Visiting the page marks everything seen (Stack's answer to Q4), so a reload
 * finds the badge at zero. As in the bell, the unread marks on screen are the
 * snapshot taken when the list first landed, not the rows' current `read_at` —
 * stamping them and then instantly re-rendering every row as read would delete
 * the one thing the page was opened to show.
 */

import { useEffect, useRef, useState } from 'react';
import { scrubSnippet } from '@/lib/queries.search';
import {
  isUnreadRow,
  toAnnouncementCard,
  useAllAnnouncements,
  useMarkAnnouncementsSeen,
  type AnnouncementCard,
} from '@/lib/queries.announcements';
import styles from './AnnouncementsList.module.css';

export function AnnouncementsList() {
  const announcements = useAllAnnouncements();
  const markSeen = useMarkAnnouncementsSeen();

  /** Which rows were unread when the list first landed. null = not landed yet. */
  const [unreadOnArrival, setUnreadOnArrival] = useState<ReadonlySet<number> | null>(null);
  const markedThisVisit = useRef(false);

  const rows = announcements.data ?? [];
  const landed = announcements.isSuccess;

  useEffect(() => {
    if (!landed || unreadOnArrival !== null) return;
    setUnreadOnArrival(new Set(rows.filter(isUnreadRow).map((row) => row.id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [landed, unreadOnArrival]);

  useEffect(() => {
    if (!landed || markedThisVisit.current) return;
    markedThisVisit.current = true;
    markSeen.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [landed]);

  const cards: AnnouncementCard[] = rows.map((row) =>
    toAnnouncementCard(row, unreadOnArrival?.has(row.id) ?? false),
  );
  const unreadCount = cards.filter((card) => card.unread).length;

  return (
    <section className={styles.screen} aria-label="Announcements">
      <div className={styles.headLine}>
        <span className={styles.sub}>
          {announcements.isPending
            ? 'loading…'
            : announcements.isError
              ? 'could not load'
              : `${cards.length} announcement${cards.length === 1 ? '' : 's'}${
                  unreadCount > 0 ? ` · ${unreadCount} new` : ''
                }`}
        </span>
      </div>

      {announcements.isError && (
        <p className={styles.state} role="alert">
          Could not load announcements: {announcements.error.message}
        </p>
      )}

      {landed && cards.length === 0 && (
        <p className={styles.state}>No course has posted an announcement yet.</p>
      )}

      <div className={styles.list}>
        {cards.map((card) => (
          <AnnouncementRow key={card.id} card={card} />
        ))}
      </div>
    </section>
  );
}

export function AnnouncementRow({ card }: { card: AnnouncementCard }) {
  const scrubbed = scrubSnippet(card.body);

  return (
    <article className={styles.row} data-unread={String(card.unread)}>
      <span className={card.unread ? styles.dotUnread : styles.dot} aria-hidden="true" />
      <div className={styles.body}>
        <div className={styles.meta}>
          <span>{card.meta}</span>
          {card.unread && <span className={styles.unreadTag}>new</span>}
        </div>
        <h2 className={styles.title}>{card.title}</h2>

        {scrubbed.notesOnly ? (
          <span className={styles.note}>speaker notes only — nothing shown</span>
        ) : (
          scrubbed.text !== '' && <p className={styles.text}>{scrubbed.text}</p>
        )}
        {scrubbed.notesHidden && !scrubbed.notesOnly && (
          <span className={styles.note}>speaker notes hidden</span>
        )}
      </div>
    </article>
  );
}

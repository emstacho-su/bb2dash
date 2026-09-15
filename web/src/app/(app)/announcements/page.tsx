import type { Metadata } from 'next';
import { AnnouncementsList } from '@/components/announcements/AnnouncementsList';
import styles from '../Shell.module.css';

export const metadata: Metadata = {
  title: 'Announcements · bb2dash',
};

/**
 * /announcements — every course's announcements, newest first (R-20).
 *
 * Reached from the bell's "See all". Client-side for the whole list: visiting
 * the page stamps `read_at` on everything unseen, which is a write, and the
 * read/unread marks are read back through the same query layer.
 */
export default function AnnouncementsPage() {
  return (
    <>
      <header className={styles.header}>
        <div className={styles.headerText}>
          <span className={styles.kicker}>Posted</span>
          <h1 className={styles.title}>Announcements</h1>
        </div>
      </header>

      <AnnouncementsList />
    </>
  );
}

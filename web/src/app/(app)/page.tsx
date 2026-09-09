import type { Metadata } from 'next';
import { TodaySummary } from './TodaySummary';
import styles from './Shell.module.css';

export const metadata: Metadata = {
  title: 'Today · bb2dash',
};

/**
 * Today (Home). The real screen — the scrollable Upcoming-work effort tracker,
 * the collapsed Needs-attention row and the 2-up course cards with the M–F
 * strip — is artboard 13-home-v2 and belongs to W-5.
 *
 * What is here is the shell plus a live read through the query layer, so the
 * scaffold proves the whole path (auth cookie -> RLS -> PostgREST -> TanStack
 * cache) end to end without inventing any content.
 */
export default function TodayPage() {
  return (
    <>
      <header className={styles.header}>
        <div className={styles.headerText}>
          <span className={styles.kicker}>Home</span>
          <h1 className={styles.title}>Today</h1>
        </div>
      </header>

      <TodaySummary />
    </>
  );
}

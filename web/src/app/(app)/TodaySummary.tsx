'use client';

import { ScreenStub } from '@/components/shell/ScreenStub';
import { baseEffort, useCourses, useUpcoming } from '@/lib/queries';
import styles from './TodaySummary.module.css';

/** Renders a value, or an em dash while it is unknown. Never a stand-in number. */
function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className={styles.stat}>
      <span className={styles.statLabel}>{label}</span>
      <span className={styles.statValue}>{value}</span>
      <span className={styles.statNote}>{note}</span>
    </div>
  );
}

export function TodaySummary() {
  const courses = useCourses();
  const upcoming = useUpcoming();

  const loading = courses.isPending || upcoming.isPending;
  const failed = courses.error ?? upcoming.error;

  const effort = upcoming.data?.reduce((sum, item) => sum + baseEffort(item.type), 0);

  return (
    <>
      {failed && (
        <p className={styles.problem} role="alert">
          Could not load data from Supabase: {failed.message}
        </p>
      )}

      <div className={styles.grid}>
        <Stat
          label="Courses"
          value={loading ? '…' : String(courses.data?.length ?? '—')}
          note="rows in courses"
        />
        <Stat
          label="Upcoming work"
          value={loading ? '…' : String(upcoming.data?.length ?? '—')}
          note="rows in v_upcoming"
        />
        <Stat
          label="Effort ahead"
          value={loading || effort === undefined ? '…' : String(Math.round(effort * 10) / 10)}
          note="base effort score (T-15)"
        />
      </div>

      <ScreenStub title="Upcoming work tracker" owner="W-5 · Today screen">
        The horizontal chronological tracker (one column per day, 14 visible, scrollable across
        eight weeks) and the 2-up course cards from artboard 13-home-v2 land here. The counts above
        are the same data the tracker will read, straight from the query layer.
      </ScreenStub>
    </>
  );
}

'use client';

/**
 * The /planner header row and day heads (R-19, Phase 11; split out in 11b so
 * `PlannerWeek.tsx` stays the board). The range label, the term week, the
 * counts line, the ◂ ▸ Today pager and, at the top right, "+" — the new-event
 * wizard (R3-9).
 */

import Link from 'next/link';
import tokens from '@/styles/tokens.module.css';
import { useTerm } from '@/lib/queries.today';
import { termWeekNumber, type PlannerDay, type PlannerWeekModel } from '@/lib/planner-week';
import { Mark } from '@/components/shell/icons';
import styles from './PlannerWeek.module.css';

/** '2 classes · 3 due', plus ' · 1 event' when the week has planner events. */
export function countLine(meetingCount: number, itemCount: number, eventCount: number): string {
  const base = `${meetingCount} class${meetingCount === 1 ? '' : 'es'} · ${itemCount} due`;
  return eventCount > 0 ? `${base} · ${eventCount} event${eventCount === 1 ? '' : 's'}` : base;
}

export function WeekHeader({
  view,
  pathname,
  loading,
  error,
  meetingCount,
  itemCount,
  eventCount,
  onAdd,
  captionTitle,
}: {
  view: PlannerWeekModel;
  pathname: string;
  loading: boolean;
  error: Error | null;
  meetingCount: number;
  itemCount: number;
  /** Planner events touching the week; named only when there are some. */
  eventCount: number;
  /** R3-9: open the new-event wizard; the button is where focus returns. */
  onAdd?: (opener: HTMLElement) => void;
  /** What the count line explains, as its tooltip (the how-to lines left the page). */
  captionTitle?: string;
}) {
  const term = useTerm();
  const termWeek = termWeekNumber(term.data ?? null, view.weekStart);

  return (
    <div className={styles.head}>
      <h2 className={styles.h2}>{view.rangeLabel}</h2>
      {termWeek !== null && (
        <span className={tokens.kicker}>
          {term.data ? `Week ${termWeek} · ${term.data.name}` : `Week ${termWeek}`}
        </span>
      )}
      <span className={styles.sub} title={captionTitle}>
        {loading
          ? 'loading…'
          : error !== null
            ? 'could not load'
            : countLine(meetingCount, itemCount, eventCount)}
      </span>

      <WeekPager view={view} pathname={pathname} />
      {onAdd && (
        <button
          type="button"
          className={styles.addEvent}
          onClick={(event) => onAdd(event.currentTarget)}
          aria-label="New event"
          title="New event"
        >
          +
        </button>
      )}
    </div>
  );
}

/** ◂ ▸ write `?week=`; Today drops it. Plain links, so a week is linkable. */
function WeekPager({ view, pathname }: { view: PlannerWeekModel; pathname: string }) {
  return (
    <span className={styles.pager}>
      <Link
        className={styles.pageLink}
        href={`?week=${view.previousWeek}`}
        title="Previous week"
        aria-label="Previous week"
        scroll={false}
      >
        <Mark name="caretLeft" />
      </Link>
      <Link
        className={styles.pageLink}
        href={`?week=${view.nextWeek}`}
        title="Next week"
        aria-label="Next week"
        scroll={false}
      >
        <Mark name="caretRight" />
      </Link>
      <Link className={styles.todayLink} href={pathname} scroll={false}>
        Today
      </Link>
    </span>
  );
}

export function DayHead({ day }: { day: PlannerDay }) {
  return (
    <div className={styles.dayHead} data-today={String(day.isToday)}>
      <span className={styles.dayName}>{day.isToday ? 'Today' : day.dowLabel}</span>
      <span className={styles.dayDate}>{day.dayOfMonth}</span>
    </div>
  );
}

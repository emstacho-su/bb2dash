'use client';

/**
 * Course Stream (Phase 8, R-01/R-02) — the course's front page.
 *
 * Two blocks:
 *   1. the per-course Upcoming-work tracker (the same component Home uses, fed
 *      only this course's shells' `v_work_items` rows);
 *   2. the feed: every `v_course_stream` post, grouped by the New York day it
 *      was posted on, newest day first.
 *
 * The feed is honest about what each post is. An announcement shows its body,
 * a material shows its bucket and file name, an assignment shows what the row
 * actually carries (due date, points, status) and nothing it does not. Body
 * text runs through `scrubSnippet`, so a professor's PPTX speaker notes can
 * never surface here as if they were course content.
 */

import { useMemo } from 'react';
import {
  courseToday,
  filterStreamRows,
  groupStreamByDay,
  useCourseDisplay,
  useCourseStream,
  useCourseWorkItems,
  type CourseStreamRow,
  type StreamPostKind,
} from '@/lib/queries.course';
import { bucketLabel } from '@/lib/queries.materials';
import { scrubSnippet } from '@/lib/queries.search';
import { useSetItemStatus, type WorkItem as TrackerWorkItem } from '@/lib/queries.today';
import type { ProgressStatus } from '@/lib/queries';
import { UpcomingTracker } from '@/components/tracker/UpcomingTracker';
import tokens from '@/styles/tokens.module.css';
import styles from './CourseStream.module.css';

/* -- pure presentation helpers --------------------------------------------- */

const KIND_LABEL: Record<StreamPostKind, string> = {
  announcement: 'Announcement',
  material: 'Material',
  assignment_posted: 'Assignment posted',
  assignment_due: 'Due',
};

const KIND_GLYPH: Record<StreamPostKind, string> = {
  announcement: '!',
  material: 'M',
  assignment_posted: 'A',
  assignment_due: 'D',
};

const KIND_CLASS: Record<StreamPostKind, string> = {
  announcement: tokens.glyphQuiz,
  material: tokens.glyphReading,
  assignment_posted: tokens.glyphAssignment,
  assignment_due: tokens.glyphExam,
};

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** 'YYYY-MM-DD' → "Mon · Sep 7" (parsed as UTC so the day never shifts). */
export function formatDayHeading(dayISO: string, todayISO: string): string {
  if (dayISO === todayISO) return 'Today';
  const [y, m, d] = dayISO.split('-').map(Number);
  const dt = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
  const mon = dt.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
  return `${DOW[dt.getUTCDay()]} · ${mon} ${dt.getUTCDate()}`;
}

/** Points, only when the row carries them. Never invented, never zero-filled. */
export function formatPoints(points: number | string | null | undefined): string | null {
  if (points === null || points === undefined || points === '') return null;
  const n = typeof points === 'number' ? points : Number(points);
  if (!Number.isFinite(n)) return null;
  const text = Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10);
  return `${text} pt${n === 1 ? '' : 's'}`;
}

/* -- one feed row ---------------------------------------------------------- */

export function StreamRow({ row }: { row: CourseStreamRow }) {
  const meta = row.meta ?? {};
  const scrubbed = scrubSnippet(row.body);
  const points = formatPoints(meta.points_possible);

  const detail: string[] = [];
  if (row.post_kind === 'material') {
    if (meta.bucket) detail.push(bucketLabel(meta.bucket));
    if (meta.file_name) detail.push(meta.file_name);
  }
  if (row.post_kind === 'assignment_posted' || row.post_kind === 'assignment_due') {
    if (meta.type) detail.push(meta.type.replace(/_/g, ' '));
    if (meta.due_on) detail.push(`due ${meta.due_on}`);
    if (points) detail.push(points);
    if (meta.status) detail.push(meta.status.replace(/_/g, ' '));
  }

  return (
    <article className={styles.row} data-post-kind={row.post_kind}>
      <span className={KIND_CLASS[row.post_kind]} aria-hidden="true">
        {KIND_GLYPH[row.post_kind]}
      </span>

      <div className={styles.rowBody}>
        <div className={styles.rowHead}>
          <span className={styles.kind}>{KIND_LABEL[row.post_kind]}</span>
          {row.post_kind === 'announcement' && meta.is_read === false && (
            <span className={styles.unread}>unread</span>
          )}
          <span className={styles.rowTitle}>{row.title}</span>
        </div>

        {detail.length > 0 && <div className={styles.rowMeta}>{detail.join(' · ')}</div>}

        {scrubbed.notesOnly ? (
          <p className={styles.rowNote}>speaker notes only — nothing shown</p>
        ) : (
          scrubbed.text !== '' && <p className={styles.rowText}>{scrubbed.text}</p>
        )}
        {scrubbed.notesHidden && !scrubbed.notesOnly && (
          <span className={styles.rowNote}>speaker notes hidden</span>
        )}
      </div>
    </article>
  );
}

/* -- the screen ------------------------------------------------------------ */

export function CourseStream({ courseId }: { courseId: string }) {
  const display = useCourseDisplay(courseId);
  const shellIds = useMemo(() => display.data?.shell_ids ?? [], [display.data]);

  const streamQ = useCourseStream(shellIds);
  const workItemsQ = useCourseWorkItems(shellIds);
  const setStatus = useSetItemStatus();

  const todayISO = courseToday();

  /**
   * `v_work_items` comes back typed from the generated view, where Postgres
   * reports no not-null constraints so every column is nullable. The tracker's
   * frozen prop type is the hand-written `WorkItem` in queries.today, the same
   * columns with the nullability the data actually has. One documented cast at
   * the boundary; no field is reshaped.
   */
  const trackerItems = useMemo(
    () =>
      (workItemsQ.data ?? []).filter(
        (item) => item.in_workload !== false && item.undated !== true,
      ) as unknown as TrackerWorkItem[],
    [workItemsQ.data],
  );

  const days = useMemo(
    () => groupStreamByDay(filterStreamRows(streamQ.data ?? [], todayISO)),
    [streamQ.data, todayISO],
  );

  const handleStatus = (item: TrackerWorkItem, status: ProgressStatus) => {
    setStatus.mutate({ item: { item_kind: item.item_kind, item_id: item.item_id }, status });
  };

  if (display.isPending) return <p className={styles.state}>Loading course…</p>;
  if (display.isError) return <p className={styles.state}>Could not load this course.</p>;
  if (!display.data) return <p className={styles.state}>No course with id {courseId}.</p>;

  return (
    <div className={styles.screen}>
      <h1 className="sr-only">{display.data.code} — Stream</h1>

      <UpcomingTracker
        items={trackerItems}
        horizonDays={56}
        visibleDays={14}
        title={`Upcoming work · ${display.data.code}`}
        onStatusChange={handleStatus}
        pendingItemId={setStatus.isPending ? setStatus.variables?.item.item_id ?? null : null}
      />

      <section className={styles.feed} aria-label="Course stream">
        {streamQ.isPending && <p className={styles.state}>Loading the stream…</p>}
        {streamQ.isError && (
          <p className={styles.state} role="alert">
            Could not load the stream: {streamQ.error.message}
          </p>
        )}
        {!streamQ.isPending && !streamQ.isError && days.length === 0 && (
          <p className={styles.state}>Nothing has been posted to this course yet.</p>
        )}

        {days.map((day) => (
          <div key={day.day} className={styles.day}>
            <div className={styles.dayHead}>
              <span className={tokens.kicker}>{formatDayHeading(day.day, todayISO)}</span>
              <span className={styles.dayCount}>
                {day.rows.length} post{day.rows.length === 1 ? '' : 's'}
              </span>
            </div>
            {day.rows.map((row) => (
              <StreamRow key={`${row.post_kind}:${row.ref_kind}:${row.ref_id}`} row={row} />
            ))}
          </div>
        ))}
      </section>
    </div>
  );
}

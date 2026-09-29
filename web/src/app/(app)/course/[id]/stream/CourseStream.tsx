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
 *
 * Every post opens what it is about (R-37, T-12), by `ref_kind`:
 *   assignment   -> the `?item=assignment:<id>` popout over this route
 *   bb_file      -> the shared `FileOpenAction` ladder, from 110's routes
 *   bb_content   -> its Blackboard page when `meta.url` is set, else no link
 *   announcement -> /announcements
 * An assignment post also carries the status select, written through
 * `useSetItemStatus` on `ref_id`, and "unread" follows the bell (B-17).
 */

import Link from 'next/link';
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
import { UNKNOWN_ROUTE, bucketLabel, type FileRoutes, type RouteValue } from '@/lib/queries.materials';
import { itemQuery } from '@/lib/queries.popout';
import { scrubSnippet } from '@/lib/queries.search';
import { useSetItemStatus, type WorkItem as TrackerWorkItem } from '@/lib/queries.today';
import type { ProgressTarget } from '@/lib/progress-cache';
// S-1 (P-grades-7) / F-1: one status vocabulary, this screen included.
import { statusLabel } from '@/lib/progress-status';
import type { ProgressStatus } from '@/lib/queries';
import { isQueryLoading } from '@/components/shared/QueryState';
import { FileOpenAction } from '@/components/materials/FileOpenAction';
import { StatusSelect } from '@/components/tracker/StatusSelect';
import { UpcomingTracker } from '@/components/tracker/UpcomingTracker';
import { DEFAULT_HORIZON_DAYS, DEFAULT_VISIBLE_DAYS } from '@/components/tracker/anchor';
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

/* -- links per ref_kind ---------------------------------------------------- */

/**
 * A meta key the view did not carry is unknown, not absent: before migration
 * 110 a file post has no `storage_path`/`source_url`, and the ladder must say
 * "Not stored" rather than claim the file has no route.
 */
function routeValue(value: string | null | undefined): RouteValue {
  return value === undefined ? UNKNOWN_ROUTE : value;
}

/** The Open ladder's routes for a file post; the feed never carries a disk path. */
export function streamFileRoutes(row: CourseStreamRow): FileRoutes {
  return {
    storage_path: routeValue(row.meta?.storage_path),
    source_url: routeValue(row.meta?.source_url),
    local_path: UNKNOWN_ROUTE,
  };
}

function StreamTitle({ row }: { row: CourseStreamRow }) {
  const linkClass = `${styles.rowTitle} ${styles.titleLink}`;
  if (row.ref_kind === 'assignment') {
    return (
      <Link
        className={linkClass}
        href={itemQuery({ kind: 'assignment', id: row.ref_id })}
        scroll={false}
      >
        {row.title}
      </Link>
    );
  }
  if (row.ref_kind === 'announcement') {
    return (
      <Link className={linkClass} href="/announcements">
        {row.title}
      </Link>
    );
  }
  const url = row.ref_kind === 'bb_content' ? row.meta?.url : null;
  if (url) {
    return (
      <a className={linkClass} href={url} target="_blank" rel="noreferrer">
        {row.title} ↗
      </a>
    );
  }
  return <span className={styles.rowTitle}>{row.title}</span>;
}

/* -- one feed row ---------------------------------------------------------- */

export function StreamRow({
  row,
  onStatusChange,
  pendingItemId = null,
}: {
  row: CourseStreamRow;
  /** Offered on assignment posts only; without it the row just reads the status. */
  onStatusChange?: (target: ProgressTarget, status: ProgressStatus) => void;
  /** The assignment id whose status write is in flight, if any. */
  pendingItemId?: string | null;
}) {
  const meta = row.meta ?? {};
  const isAssignment =
    row.ref_kind === 'assignment' &&
    (row.post_kind === 'assignment_posted' || row.post_kind === 'assignment_due');
  const statusEditable = isAssignment && onStatusChange !== undefined;
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
    // S-1 / F-1: the shared vocabulary, not this file's own spelling. The view
    // types `status` loosely (string | null), so a value the enum does not
    // carry is spelled out rather than swallowed.
    if (meta.status && !statusEditable) {
      detail.push(statusLabel(meta.status as ProgressStatus) ?? meta.status.replace(/_/g, ' '));
    }
  }

  return (
    <article className={styles.row} data-post-kind={row.post_kind}>
      <span className={KIND_CLASS[row.post_kind]} aria-hidden="true">
        {KIND_GLYPH[row.post_kind]}
      </span>

      <div className={styles.rowBody}>
        <div className={styles.rowHead}>
          <span className={styles.kind}>{KIND_LABEL[row.post_kind]}</span>
          {row.post_kind === 'announcement' && meta.is_unread === true && (
            <span className={styles.unread}>unread</span>
          )}
          <StreamTitle row={row} />
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

      {row.ref_kind === 'bb_file' && (
        <div className={styles.rowAction}>
          <FileOpenAction routes={streamFileRoutes(row)} />
        </div>
      )}
      {statusEditable && (
        <div className={styles.rowAction}>
          <StatusSelect
            item={{ title: row.title, status: (meta.status ?? 'not_started') as ProgressStatus }}
            onChange={(_post, status) =>
              onStatusChange({ item_kind: 'assignment', item_id: row.ref_id }, status)
            }
            pending={pendingItemId === row.ref_id}
          />
        </div>
      )}
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
  const handlePostStatus = (target: ProgressTarget, status: ProgressStatus) => {
    setStatus.mutate({ item: target, status });
  };
  const pendingItemId = setStatus.isPending ? setStatus.variables?.item.item_id ?? null : null;

  if (display.isPending) return <p className={styles.state}>Loading course…</p>;
  if (display.isError) return <p className={styles.state}>Could not load this course.</p>;
  if (!display.data) return <p className={styles.state}>No course with id {courseId}.</p>;

  return (
    <div className={styles.screen}>
      <h1 className="sr-only">{display.data.code} — Stream</h1>

      <UpcomingTracker
        items={trackerItems}
        horizonDays={DEFAULT_HORIZON_DAYS}
        visibleDays={DEFAULT_VISIBLE_DAYS}
        title={`Upcoming work · ${display.data.code}`}
        onStatusChange={handleStatus}
        pendingItemId={pendingItemId}
        isPending={isQueryLoading(workItemsQ)}
        error={workItemsQ.error}
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
              <StreamRow
                key={`${row.post_kind}:${row.ref_kind}:${row.ref_id}`}
                row={row}
                onStatusChange={handlePostStatus}
                pendingItemId={pendingItemId}
              />
            ))}
          </div>
        ))}
      </section>
    </div>
  );
}

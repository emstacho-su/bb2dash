'use client';

/**
 * Course Stream — the course's front page.
 *
 * Three blocks:
 *   1. the per-course Upcoming-work tracker (the same component Home uses, fed
 *      only this course's shells' `v_work_items` rows);
 *   2. new and changed materials (Phase 19, R-38): one post per file or
 *      content item a registered crawl found new or changed, labelled "New" or
 *      "Changed" and dated by that crawl. The rows are `v_course_stream`'s
 *      material arm, which migration 133 feeds from `bb_material_history`.
 *      A course with no such post gets no block at all;
 *   3. the course timeline (R3-4): the week-divided two-lane view that was
 *      Classwork's `?view=timeline`. Classes on the left, with their files and
 *      the announcements posted that week; assignments on the right, with
 *      their files and the status select. See `components/course/CourseTimeline`.
 *
 * The day-grouped post feed this page used to show (Phase 8) is gone: every
 * other kind of post it carried now sits on the timeline next to the class or
 * the due date it belongs to.
 */

import { useMemo } from 'react';
import {
  courseToday,
  streamDayKey,
  useCourseDisplay,
  useCourseStream,
  useCourseWorkItems,
  type CourseStreamRow,
} from '@/lib/queries.course';
import { UNKNOWN_ROUTE, type FileRoutes, type RouteValue } from '@/lib/queries.materials';
import {
  trackerWindowStart,
  useSetItemStatus,
  useTerm,
  type WorkItem as TrackerWorkItem,
} from '@/lib/queries.today';
import type { ProgressStatus } from '@/lib/queries';
import { isQueryLoading } from '@/components/shared/QueryState';
import { CourseTimeline } from '@/components/course/CourseTimeline';
import { formatDay } from '@/components/course/TimelineRows';
import { FileOpenAction } from '@/components/materials/FileOpenAction';
import { UpcomingTracker } from '@/components/tracker/UpcomingTracker';
import { DEFAULT_HORIZON_DAYS, DEFAULT_VISIBLE_DAYS } from '@/components/tracker/anchor';
import tokens from '@/styles/tokens.module.css';
import styles from './CourseStream.module.css';

/* -- material history: pure helpers ---------------------------------------- */

/** What a material post is called. */
export type MaterialChangeLabel = 'New' | 'Changed';

/**
 * How many material posts sit above the timeline before the rest fold under
 * "N earlier". History is kept for the whole term, so an unbounded list would
 * push the timeline, which is the Stream (R3-4), off the screen.
 */
export const MATERIAL_POSTS_SHOWN = 8;

/**
 * `meta.change` → the label. `appeared` is New, `changed` is Changed. Anything
 * else, a vanished item or a row that does not say, has no label and is not
 * posted.
 */
export function materialChangeLabel(change: unknown): MaterialChangeLabel | null {
  if (change === 'appeared') return 'New';
  if (change === 'changed') return 'Changed';
  return null;
}

function runIdOf(row: CourseStreamRow): string | null {
  const runId = row.meta?.run_id;
  return typeof runId === 'string' && runId.length > 0 ? runId : null;
}

/**
 * One key per item, per crawl, per kind of change. The run id is in it because
 * one file posts once for every crawl it changed in, so `ref_id` alone repeats.
 */
export function materialPostKey(row: CourseStreamRow): string {
  return `material:${row.ref_kind}:${row.ref_id}:${runIdOf(row) ?? ''}:${row.meta?.change ?? ''}`;
}

/**
 * The stream rows that are material-history posts, in the order the view gave
 * them (newest crawl first).
 *
 * A material row is posted only when it says what changed, names its crawl and
 * can be dated. The view before migration 133 says none of that, so it posts
 * nothing here and the page stays what it was. Two rows with the same key are
 * one file carried by two content items in one crawl: it is posted once.
 */
export function materialHistoryPosts(rows: readonly CourseStreamRow[]): CourseStreamRow[] {
  const seen = new Set<string>();
  return rows.filter((row) => {
    if (row.post_kind !== 'material') return false;
    if (materialChangeLabel(row.meta?.change) === null) return false;
    if (runIdOf(row) === null) return false;
    if (Number.isNaN(Date.parse(row.posted_at))) return false;
    const key = materialPostKey(row);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * A meta key the view did not carry is unknown, not absent: the ladder must
 * say "Not stored" rather than claim the file has no route.
 */
function routeValue(value: string | null | undefined): RouteValue {
  return value === undefined ? UNKNOWN_ROUTE : value;
}

/** The Open ladder's routes for a file post; the stream never carries a disk path. */
function streamFileRoutes(row: CourseStreamRow): FileRoutes {
  return {
    storage_path: routeValue(row.meta?.storage_path),
    source_url: routeValue(row.meta?.source_url),
    local_path: UNKNOWN_ROUTE,
  };
}

/* -- material history: the block ------------------------------------------- */

function MaterialPost({ row }: { row: CourseStreamRow }) {
  const label = materialChangeLabel(row.meta?.change);
  if (label === null) return null;
  return (
    <li className={styles.materialRow} data-change={row.meta?.change ?? undefined}>
      <span className={label === 'New' ? styles.changeNew : styles.changeChanged}>{label}</span>
      {/* The title is Blackboard's text. It is rendered as text, never as HTML. */}
      <span className={styles.materialTitle}>{row.title}</span>
      <time className={styles.materialDate} dateTime={row.posted_at}>
        synced {formatDay(streamDayKey(row.posted_at))}
      </time>
      {row.ref_kind === 'bb_file' && (
        <FileOpenAction routes={streamFileRoutes(row)} className={tokens.btnGhost} />
      )}
    </li>
  );
}

function MaterialList({ posts }: { posts: readonly CourseStreamRow[] }) {
  return (
    <ul className={styles.materialList}>
      {posts.map((row) => (
        <MaterialPost key={materialPostKey(row)} row={row} />
      ))}
    </ul>
  );
}

const MATERIALS_HEADING_ID = 'course-stream-materials';

function MaterialHistory({ posts }: { posts: readonly CourseStreamRow[] }) {
  if (posts.length === 0) return null;
  const shown = posts.slice(0, MATERIAL_POSTS_SHOWN);
  const earlier = posts.slice(MATERIAL_POSTS_SHOWN);
  return (
    <section className={styles.materials} aria-labelledby={MATERIALS_HEADING_ID}>
      <h2 id={MATERIALS_HEADING_ID} className={tokens.kicker}>
        New and changed materials
      </h2>
      <MaterialList posts={shown} />
      {earlier.length > 0 && (
        <details className={styles.earlier}>
          <summary>{earlier.length} earlier</summary>
          <MaterialList posts={earlier} />
        </details>
      )}
    </section>
  );
}

/* -- the screen ------------------------------------------------------------ */

export function CourseStream({ courseId }: { courseId: string }) {
  const display = useCourseDisplay(courseId);
  const shellIds = useMemo(() => display.data?.shell_ids ?? [], [display.data]);
  const workItemsQ = useCourseWorkItems(shellIds);
  // The same cache entry the timeline reads; it reports this query's loading and failure.
  const streamQ = useCourseStream(shellIds);
  const setStatus = useSetItemStatus();

  // R3-1: the strip can scroll back to the term's first day, from the same
  // term row Home reads (`useTerm` + `trackerWindowStart`); it still opens on
  // today. Before the term starts there is nothing earlier to reach.
  const termQ = useTerm();
  const todayIso = courseToday();
  const windowStart = trackerWindowStart(termQ.data, todayIso);
  const startIso = windowStart === todayIso ? null : windowStart;

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

  const materialPosts = useMemo(() => materialHistoryPosts(streamQ.data ?? []), [streamQ.data]);

  const handleStatus = (item: TrackerWorkItem, status: ProgressStatus) => {
    setStatus.mutate({ item: { item_kind: item.item_kind, item_id: item.item_id }, status });
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
        startIso={startIso}
        title={`Upcoming work · ${display.data.code}`}
        onStatusChange={handleStatus}
        pendingItemId={pendingItemId}
        // The start date waits on the term row, so the strip is loading until it answers.
        isPending={isQueryLoading(workItemsQ) || isQueryLoading(termQ)}
        error={workItemsQ.error}
      />

      <MaterialHistory posts={materialPosts} />

      <CourseTimeline courseId={courseId} />
    </div>
  );
}

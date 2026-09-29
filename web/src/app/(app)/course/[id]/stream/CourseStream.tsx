'use client';

/**
 * Course Stream — the course's front page.
 *
 * Two blocks:
 *   1. the per-course Upcoming-work tracker (the same component Home uses, fed
 *      only this course's shells' `v_work_items` rows);
 *   2. the course timeline (R3-4): the week-divided two-lane view that was
 *      Classwork's `?view=timeline`. Classes on the left, with their files and
 *      the announcements posted that week; assignments on the right, with
 *      their files and the status select. See `components/course/CourseTimeline`.
 *
 * The day-grouped post feed this page used to show (Phase 8) is gone: every
 * kind of post it carried now sits on the timeline next to the class or the
 * due date it belongs to.
 */

import { useMemo } from 'react';
import { courseToday, useCourseDisplay, useCourseWorkItems } from '@/lib/queries.course';
import {
  trackerWindowStart,
  useSetItemStatus,
  useTerm,
  type WorkItem as TrackerWorkItem,
} from '@/lib/queries.today';
import type { ProgressStatus } from '@/lib/queries';
import { isQueryLoading } from '@/components/shared/QueryState';
import { CourseTimeline } from '@/components/course/CourseTimeline';
import { UpcomingTracker } from '@/components/tracker/UpcomingTracker';
import { DEFAULT_HORIZON_DAYS, DEFAULT_VISIBLE_DAYS } from '@/components/tracker/anchor';
import styles from './CourseStream.module.css';

export function CourseStream({ courseId }: { courseId: string }) {
  const display = useCourseDisplay(courseId);
  const shellIds = useMemo(() => display.data?.shell_ids ?? [], [display.data]);
  const workItemsQ = useCourseWorkItems(shellIds);
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
        isPending={isQueryLoading(workItemsQ)}
        error={workItemsQ.error}
      />

      <CourseTimeline courseId={courseId} />
    </div>
  );
}

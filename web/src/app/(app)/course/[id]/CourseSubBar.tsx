'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  meetingPatterns,
  realRoomDispute,
  useCourseDisplay,
  useCourseShells,
} from '@/lib/queries.course';
import styles from './CourseSubBar.module.css';

/**
 * Course sub-bar — Stream · Classwork · Grades · Info, plus the merged meeting
 * pattern(s), room and a Blackboard link (GUI decision 1c). Since Phase 8 the
 * tabs are real routes: each is a <Link> into `course/[id]/<tab>` and the
 * current one carries `aria-current="page"`, so the tab strip is navigable by
 * keyboard and readable by a screen reader instead of being decoration.
 *
 * Meeting time/room and the Blackboard link come from `v_course_display`, which
 * merges a course's shells (GEO 103 = lecture + recitation → M/W lecture +
 * F recitation).
 */
const TABS = [
  { segment: 'stream', label: 'Stream' },
  { segment: 'classwork', label: 'Classwork' },
  { segment: 'grades', label: 'Grades' },
  { segment: 'info', label: 'Info' },
] as const;

type TabSegment = (typeof TABS)[number]['segment'];

/**
 * Which tab the current URL is on. `/course/IST.323` (before the redirect to
 * /stream lands) reads as Stream, and `classwork?view=timeline` is still
 * Classwork — the query string does not change the tab.
 */
export function activeTabFor(pathname: string | null): TabSegment {
  const segments = (pathname ?? '').split('/').filter(Boolean);
  const last = segments[segments.length - 1];
  const match = TABS.find((tab) => tab.segment === last);
  return match ? match.segment : 'stream';
}

export function CourseSubBar({ courseId }: { courseId: string }) {
  const pathname = usePathname();
  const active = activeTabFor(pathname);
  const base = `/course/${encodeURIComponent(courseId)}`;

  const { data: course, isPending, isError } = useCourseDisplay(courseId);
  const shellIds = course?.shell_ids ?? [];
  const { data: shells } = useCourseShells(shellIds);

  const patterns = course ? meetingPatterns(course.meetings) : [];
  // Only judge a dispute once the shell locations are loaded, otherwise an empty
  // known-room set would flag every disputed course (incl. the ECN false-positive).
  const disputed =
    course && shells
      ? realRoomDispute(course.room_disputed, course.meetings, shells.map((s) => s.location))
      : false;

  return (
    <nav className={styles.bar} aria-label="Course sections">
      {TABS.map((tab) => (
        <Link
          key={tab.segment}
          href={`${base}/${tab.segment}`}
          className={tab.segment === active ? styles.tabActive : styles.tab}
          aria-current={tab.segment === active ? 'page' : undefined}
        >
          {tab.label}
        </Link>
      ))}

      <span className={styles.meta}>
        {isPending && <span className={styles.missing}>loading…</span>}
        {isError && <span className={styles.missing}>could not load course</span>}
        {!isPending && !isError && !course && (
          <span className={styles.missing}>no course with id {courseId}</span>
        )}
        {course && (
          <>
            <span className={styles.title}>
              {course.code} · {course.title}
            </span>

            {patterns.length > 0 ? (
              <span className={styles.meetings}>
                {patterns.map((p, i) => (
                  <span key={i} className={styles.meeting}>
                    <span className={styles.days}>{p.days}</span> {p.time}
                    {p.room && <span className={styles.room}> · {p.room}</span>}
                  </span>
                ))}
              </span>
            ) : (
              <span className={styles.missing}>no scheduled meetings</span>
            )}

            {disputed && (
              <span className={styles.dispute} title="Meeting room differs from the room on file — confirm.">
                ⚠ room disputed
              </span>
            )}

            {course.bb_url && (
              <a href={course.bb_url} target="_blank" rel="noreferrer">
                Blackboard ↗
              </a>
            )}
          </>
        )}
      </span>
    </nav>
  );
}

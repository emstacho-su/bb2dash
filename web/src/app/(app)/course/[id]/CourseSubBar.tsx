'use client';

import {
  meetingPatterns,
  realRoomDispute,
  useCourseDisplay,
  useCourseShells,
} from '@/lib/queries.course';
import styles from './CourseSubBar.module.css';

/**
 * Course sub-bar — Stream · Grades · Materials · Info, plus the merged meeting
 * pattern(s), room and a Blackboard link (GUI decision 1c). The tabs stay inert
 * until their panes exist (Grades/Materials/Info are other screens); Stream is
 * this page. Meeting time/room and the Blackboard link come from
 * `v_course_display`, which merges a course's shells (GEO 103 = lecture +
 * recitation → M/W lecture + F recitation).
 */
const TABS = ['Stream', 'Grades', 'Materials', 'Info'] as const;

export function CourseSubBar({ courseId }: { courseId: string }) {
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
      {TABS.map((tab, index) => (
        <button key={tab} type="button" className={index === 0 ? styles.tabActive : styles.tab}>
          {tab}
        </button>
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

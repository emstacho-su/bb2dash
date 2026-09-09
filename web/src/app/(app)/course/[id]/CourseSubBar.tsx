'use client';

import { courseCode, useCourse } from '@/lib/queries';
import styles from './CourseSubBar.module.css';

/**
 * Course sub-bar — Stream · Grades · Materials · Info, plus meeting time/room
 * and a Blackboard link (GUI decision 1c). Tabs are inert until W-6 builds the
 * panes; the bar itself and its data binding are scaffold.
 */
const TABS = ['Stream', 'Grades', 'Materials', 'Info'] as const;

export function CourseSubBar({ courseId }: { courseId: string }) {
  const { data: course, isPending, isError } = useCourse(courseId);

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
              {courseCode(course)} · {course.title_short}
            </span>
            {/* Meeting time comes from `meetings`; until W-6 joins it, say so
                rather than print a placeholder time. */}
            <span>{course.location ?? 'room not recorded'}</span>
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

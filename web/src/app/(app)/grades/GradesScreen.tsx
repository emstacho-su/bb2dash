'use client';

/**
 * `/grades` — every course, Blackboard's number or the honest empty state
 * (Phase 10a, R-10/R-11).
 *
 * Grouped by course, in the same order the Home cards use (Stack's answer 2),
 * one card per `v_course_display` row. Each card carries Blackboard's own
 * published total with the `seen_at` of the run that read it, or says exactly
 * "Blackboard publishes no total", or "not synced yet" — three distinct facts,
 * never collapsed into one blank.
 *
 * Nothing on this screen is computed by bb2dash. Every figure is a value read
 * out of `v_course_grade` / `v_gradebook_latest` and shown with the time we saw
 * it; there is no sum, no average, no projection and no letter we invented.
 */

import { useMemo } from 'react';
import Link from 'next/link';
import { useCourseDisplay } from '@/lib/queries.today';
import { pickCourseGrade, useCourseGrades, useGradebookLatest } from '@/lib/queries.grades';
import { CourseGradeCard } from '@/components/grades/CourseGradeCard';
import { GradebookTable } from '@/components/grades/GradebookTable';
import { QueryState, isQueryUnresolved } from '@/components/shared/QueryState';
import tokens from '@/styles/tokens.module.css';
import styles from './GradesScreen.module.css';

export function GradesScreen() {
  const coursesQ = useCourseDisplay();
  const courses = useMemo(() => coursesQ.data ?? [], [coursesQ.data]);

  // One gradebook read for the whole screen: a query per card would be a hook
  // inside a loop, and the rows split by `course_id` client-side anyway.
  const allShellIds = useMemo(
    () => courses.flatMap((course) => course.shell_ids ?? []),
    [courses],
  );
  const gradesQ = useCourseGrades();
  const gradebookQ = useGradebookLatest(allShellIds);

  if (isQueryUnresolved(coursesQ)) {
    return <QueryState query={coursesQ} of="your courses" className={styles.state} />;
  }
  if (courses.length === 0) {
    return <p className={styles.state}>No courses are recorded for this term.</p>;
  }

  return (
    <div className={styles.screen}>
      <QueryState query={gradesQ} of="the gradebook totals" className={styles.state} />
      <QueryState query={gradebookQ} of="the gradebook" className={styles.state} />

      {courses.map((course) => {
        const shellIds = course.shell_ids ?? [];
        const row = pickCourseGrade(gradesQ.data, shellIds);
        const rows = (gradebookQ.data ?? []).filter((item) => shellIds.includes(item.course_id));

        return (
          <CourseGradeCard
            key={course.display_id}
            title={course.code}
            subtitle={shellIds.length > 1 ? `${course.title} · ${shellIds.join(' + ')}` : course.title}
            row={row}
            headerRight={
              <Link
                className={tokens.btnGhost}
                href={`/course/${encodeURIComponent(course.display_id)}/grades`}
              >
                Course tab →
              </Link>
            }
          >
            {isQueryUnresolved(gradebookQ) ? null : <GradebookTable rows={rows} caption={`${course.code} gradebook`} />}
          </CourseGradeCard>
        );
      })}
    </div>
  );
}

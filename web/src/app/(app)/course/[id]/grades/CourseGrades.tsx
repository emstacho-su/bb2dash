'use client';

/**
 * `/course/[id]/grades` (Phase 10a) — one course's gradebook.
 *
 * The same header and the same table as `/grades`, scoped to this display
 * course's shells, so one row can be put side by side with the same row in
 * Blackboard (acceptance step 2). GEO 103's two shells are read together; the
 * header speaks for whichever shell publishes a total, and says so by name,
 * rather than adding the two together.
 */

import { useMemo } from 'react';
import Link from 'next/link';
import { useCourseDisplay } from '@/lib/queries.course';
import { pickCourseGrade, useCourseGrades, useGradebookLatest } from '@/lib/queries.grades';
import { CourseGradeCard } from '@/components/grades/CourseGradeCard';
import { GradebookTable } from '@/components/grades/GradebookTable';
import { QueryState, isQueryUnresolved } from '@/components/shared/QueryState';
import tokens from '@/styles/tokens.module.css';
import styles from './CourseGrades.module.css';

export function CourseGrades({ courseId }: { courseId: string }) {
  const display = useCourseDisplay(courseId);
  const shellIds = useMemo(() => display.data?.shell_ids ?? [], [display.data]);

  const gradesQ = useCourseGrades();
  const gradebookQ = useGradebookLatest(shellIds);

  if (isQueryUnresolved(display)) {
    return <QueryState query={display} of="this course" className={styles.state} />;
  }
  if (!display.data) {
    return <p className={styles.state}>No course with id {courseId}.</p>;
  }

  const row = pickCourseGrade(gradesQ.data, shellIds);
  const rows = gradebookQ.data ?? [];
  // `v_course_display` reports every column nullable (Postgres says nothing
  // about a view's not-nulls), so fall back to the id rather than render blank.
  const code = display.data.code ?? courseId;
  const title = display.data.title ?? null;

  return (
    <div className={styles.screen}>
      <h1 className="sr-only">{code} — Grades</h1>

      <QueryState query={gradesQ} of="the gradebook total" className={styles.state} />
      <QueryState query={gradebookQ} of="the gradebook" className={styles.state} />

      <CourseGradeCard
        title={code}
        subtitle={shellIds.length > 1 && title ? `${title} · ${shellIds.join(' + ')}` : title}
        row={row}
        headerRight={
          <Link className={tokens.btnGhost} href="/grades">
            All courses →
          </Link>
        }
      >
        {isQueryUnresolved(gradebookQ) ? null : (
          <GradebookTable rows={rows} caption={`${code} gradebook`} />
        )}
      </CourseGradeCard>
    </div>
  );
}

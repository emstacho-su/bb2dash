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
 * Every Blackboard figure is a value read out of `v_course_grade` /
 * `v_gradebook_latest` and shown with the time we saw it.
 *
 * Phase 10b: when `model` is passed (by `GradesModelScreen`, which does the
 * reads), each card also carries the read-only "Our model" line under
 * Blackboard's header and a score-history disclosure on rows that changed. The
 * only computed figures are inside that labelled container; what-if values,
 * the solver and the link picker live on the course tab, never here. Without
 * `model` the screen is exactly 10a's.
 */

import { useMemo } from 'react';
import Link from 'next/link';
import { useCourseDisplay } from '@/lib/queries.today';
import { pickCourseGrade, useCourseGrades, useGradebookLatest } from '@/lib/queries.grades';
import { CourseGradeCard } from '@/components/grades/CourseGradeCard';
import { GradebookTable } from '@/components/grades/GradebookTable';
import { ModelStanding } from '@/components/grades/ModelStanding';
import { QueryState, isQueryUnresolved } from '@/components/shared/QueryState';
import type { GradebookHistoryRow } from '@/lib/grade-model-input';
import type { ModelStandingState } from '@/lib/grade-model-run';
import type { LinkState } from '@/lib/grade-model-view';
import tokens from '@/styles/tokens.module.css';
import styles from './GradesScreen.module.css';

/** The read-only model data `/grades` renders (Phase 10b). */
export interface GradesModelProps {
  /** By scheme course id — `v_course_display.display_id`. */
  readonly standings: Readonly<Record<string, ModelStandingState>>;
  /** History rows by column item key, across every shell. */
  readonly history: ReadonlyMap<string, readonly GradebookHistoryRow[]>;
  /** Why the history could not be read, if it could not. */
  readonly historyError?: string | null;
  /** Stack's link choices by column item key, so rows sit where the course tab puts them (R2-8). */
  readonly overrides?: ReadonlyMap<string, LinkState>;
}

const MODEL_LOADING: ModelStandingState = { result: null, error: null, loading: true };

export function GradesScreen({ model }: { model?: GradesModelProps } = {}) {
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
      {model?.historyError && (
        <p className={styles.state} role="alert">
          {model.historyError}
        </p>
      )}

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
            {model && <ModelStanding {...(model.standings[course.display_id] ?? MODEL_LOADING)} />}
            {isQueryUnresolved(gradebookQ) ? null : (
              <GradebookTable rows={rows} caption={`${course.code} gradebook`} history={model?.history} overrides={model?.overrides} />
            )}
          </CourseGradeCard>
        );
      })}
    </div>
  );
}

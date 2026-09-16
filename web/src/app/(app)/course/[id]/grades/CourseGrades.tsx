'use client';

/**
 * `/course/[id]/grades` (Phase 10a; model added in 10b) — one course's gradebook.
 *
 * The same header and the same table as `/grades`, scoped to this display
 * course's shells, so one row can be put side by side with the same row in
 * Blackboard (acceptance step 2). GEO 103's two shells are read together; the
 * header speaks for whichever shell publishes a total, and says so by name,
 * rather than adding the two together.
 *
 * Phase 10b puts "Our model" under that header — the standing from the
 * syllabus rules, the target solver and Reset scenario, all inside the one
 * labelled container — and adds the what-if cells, the "Counts toward…" picker,
 * score history and the "Not in Blackboard yet" rows to the table. The model is
 * keyed on the scheme course (GEO 103: the lecture shell), so both shells'
 * columns feed one standing.
 */

import { useMemo } from 'react';
import Link from 'next/link';
import { useCourseDisplay } from '@/lib/queries.course';
import { pickCourseGrade, useCourseGrades, useGradebookLatest } from '@/lib/queries.grades';
import { schemeCourseIdFor } from '@/lib/queries.grade-model';
import { RESET_LABEL } from '@/lib/grade-model/labels';
import { CourseGradeCard } from '@/components/grades/CourseGradeCard';
import { GradebookTable } from '@/components/grades/GradebookTable';
import { ModelStanding } from '@/components/grades/ModelStanding';
import { PlaceholderRows } from '@/components/grades/PlaceholderRows';
import { TargetSolver } from '@/components/grades/TargetSolver';
import { useCourseGradeModel } from '@/components/grades/useCourseGradeModel';
import { useCourseModelActions } from '@/components/grades/useCourseModelActions';
import modelStyles from '@/components/grades/GradeModel.module.css';
import { QueryState, isQueryUnresolved } from '@/components/shared/QueryState';
import tokens from '@/styles/tokens.module.css';
import styles from './CourseGrades.module.css';

export function CourseGrades({ courseId }: { courseId: string }) {
  const display = useCourseDisplay(courseId);
  const shellIds = useMemo(() => display.data?.shell_ids ?? [], [display.data]);
  const schemeCourseId = schemeCourseIdFor(display.data ?? null);

  const gradesQ = useCourseGrades();
  const gradebookQ = useGradebookLatest(shellIds);
  const model = useCourseGradeModel(schemeCourseId, shellIds);
  const actions = useCourseModelActions(schemeCourseId, model);

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
      {model.historyError && (
        <p className={styles.state} role="alert">
          {model.historyError}
        </p>
      )}

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
        <ModelStanding
          result={model.run?.result ?? null}
          realResult={model.run?.realResult ?? null}
          components={model.run?.input?.components ?? []}
          error={model.loadError ?? model.run?.error ?? null}
          loading={model.loading}
        >
          {actions.solver && <TargetSolver {...actions.solver} />}
          {(actions.canReset || actions.scenarioError) && (
            <div className={modelStyles.actions}>
              {actions.canReset && (
                <button
                  type="button"
                  className={modelStyles.resetButton}
                  disabled={actions.resetPending}
                  onClick={actions.onReset}
                >
                  {RESET_LABEL}
                </button>
              )}
              {actions.scenarioError && (
                <p className={modelStyles.alert} role="alert">
                  {actions.scenarioError}
                </p>
              )}
            </div>
          )}
        </ModelStanding>

        {isQueryUnresolved(gradebookQ) ? null : (
          <GradebookTable
            rows={rows}
            caption={`${code} gradebook`}
            whatIf={actions.whatIf}
            history={model.history}
            links={actions.links}
            footer={
              <PlaceholderRows
                items={model.items}
                whatIf={actions.whatIf}
                dropped={model.run?.states?.droppedPlaceholderKeys ?? []}
              />
            }
          />
        )}
      </CourseGradeCard>
    </div>
  );
}

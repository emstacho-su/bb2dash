'use client';

/**
 * `/grades` with the grade model (Phase 10b).
 *
 * Does the model reads for every course at once — one request per relation,
 * not one per card — runs the engine per scheme course, and hands the result to
 * `GradesScreen` as its optional `model` prop. Kept apart from `GradesScreen` so
 * that screen stays renderable on its own, exactly as 10a shipped it.
 *
 * Read-only here (PM call 4): the saved scenario is applied, so a standing that
 * uses what-if values says so, but nothing on `/grades` writes anything.
 */

import { useMemo } from 'react';
import { useCourseDisplay } from '@/lib/queries.today';
import {
  schemeCourseIdFor,
  useGradeHistory,
  useGradeModelItemsForCourses,
  useGradeModelTotalsForCourses,
  useGradeScenariosForCourses,
  useGradingSchemesForCourses,
} from '@/lib/queries.grade-model';
import { modelStandingStates } from '@/lib/grade-model-run';
import { historyByColumn, linkStates } from '@/lib/grade-model-view';
import { queryErrorMessage } from '@/components/shared/QueryState';
import { GradesScreen, type GradesModelProps } from './GradesScreen';

export function GradesModelScreen() {
  const coursesQ = useCourseDisplay();
  const courses = useMemo(() => coursesQ.data ?? [], [coursesQ.data]);

  const schemeIds = useMemo(
    () => courses.map((course) => schemeCourseIdFor(course)).filter((id): id is string => id !== null),
    [courses],
  );
  const shellIds = useMemo(() => courses.flatMap((course) => course.shell_ids ?? []), [courses]);

  const schemesQ = useGradingSchemesForCourses(schemeIds);
  const itemsQ = useGradeModelItemsForCourses(schemeIds);
  const totalsQ = useGradeModelTotalsForCourses(schemeIds);
  const scenariosQ = useGradeScenariosForCourses(schemeIds);
  const historyQ = useGradeHistory(shellIds);

  const failed = [schemesQ, itemsQ, totalsQ, scenariosQ].find((query) => query.isError);
  const loadError = failed ? `Could not load the grade model: ${queryErrorMessage(failed.error)}` : null;

  const standings = useMemo(
    () =>
      modelStandingStates(
        schemeIds,
        { schemes: schemesQ.data, items: itemsQ.data, totals: totalsQ.data, scenarios: scenariosQ.data },
        loadError,
      ),
    [schemeIds, schemesQ.data, itemsQ.data, totalsQ.data, scenariosQ.data, loadError],
  );
  const history = useMemo(() => historyByColumn(historyQ.data ?? []), [historyQ.data]);
  const overrides = useMemo(() => linkStates(itemsQ.data ?? []), [itemsQ.data]);

  const model = useMemo<GradesModelProps>(
    () => ({
      standings,
      history,
      overrides,
      historyError: historyQ.isError
        ? `Could not load the score history: ${queryErrorMessage(historyQ.error)}`
        : null,
    }),
    [standings, history, overrides, historyQ.isError, historyQ.error],
  );

  return <GradesScreen model={model} />;
}

'use client';

/**
 * `/grades` with the grade figure (Phase 10b; rewritten for Phase 12b G-1/G-2).
 *
 * Does the reads for every course at once — one request per relation, not one
 * per card — works out each course's figure, and hands the result to
 * `GradesScreen` as its optional `figures` prop. Kept apart from `GradesScreen`
 * so that screen stays renderable on its own, exactly as 10a shipped it.
 *
 * Read-only. Phase 10b wrote a saved scenario from here; there is no scenario
 * any more, and `/grades` writes nothing at all.
 */

import { useMemo } from 'react';
import { useCourseDisplay } from '@/lib/queries.today';
import {
  schemeCourseIdFor,
  useGradeModelItemsForCourses,
  useGradingSchemesForCourses,
} from '@/lib/queries.grade-model';
import { courseFigureStates } from '@/lib/grade-figure-run';
import { linkStates } from '@/lib/grade-model-view';
import { queryErrorMessage } from '@/components/shared/QueryState';
import { GradesScreen, type GradesFiguresProps } from './GradesScreen';

export function GradesModelScreen() {
  const coursesQ = useCourseDisplay();
  const courses = useMemo(() => coursesQ.data ?? [], [coursesQ.data]);

  const schemeIds = useMemo(
    () => courses.map((course) => schemeCourseIdFor(course)).filter((id): id is string => id !== null),
    [courses],
  );

  const schemesQ = useGradingSchemesForCourses(schemeIds);
  const itemsQ = useGradeModelItemsForCourses(schemeIds);

  const failed = [schemesQ, itemsQ].find((query) => query.isError);
  const loadError = failed ? `Could not load the grading rules: ${queryErrorMessage(failed.error)}` : null;

  const figures = useMemo(
    () => courseFigureStates(schemeIds, { schemes: schemesQ.data, items: itemsQ.data }, loadError),
    [schemeIds, schemesQ.data, itemsQ.data, loadError],
  );
  const overrides = useMemo(() => linkStates(itemsQ.data ?? []), [itemsQ.data]);

  const model = useMemo<GradesFiguresProps>(() => ({ figures, overrides }), [figures, overrides]);

  return <GradesScreen model={model} />;
}

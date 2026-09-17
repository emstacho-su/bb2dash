'use client';

/**
 * One graded-so-far figure per scheme course (Phase 12b, G-2 / P-home-10).
 *
 * The bulk reads and `courseFigureStates()` behind a single hook, so `/grades`
 * and Home's course cards run the same function over the same rows and cannot
 * disagree. Read-only.
 */

import { useMemo } from 'react';
import type { CourseDisplay } from '@/lib/queries.today';
import {
  schemeCourseIdFor,
  useGradeModelItemsForCourses,
  useGradingSchemesForCourses,
} from '@/lib/queries.grade-model';
import { courseFigureStates, type CourseFigureState } from '@/lib/grade-figure-run';
import { queryErrorMessage } from '@/components/shared/QueryState';

export interface CourseFigures {
  /** Keyed by scheme course id (`schemeCourseIdFor(course)`). */
  readonly figures: Record<string, CourseFigureState>;
  /** The item rows the figures were worked out from; undefined while loading. */
  readonly items: ReturnType<typeof useGradeModelItemsForCourses>['data'];
}

export function useCourseFigures(courses: readonly CourseDisplay[]): CourseFigures {
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

  return { figures, items: itemsQ.data };
}

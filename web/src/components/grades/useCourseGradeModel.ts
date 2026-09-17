'use client';

/**
 * One course's grade figure, read and computed (Phase 12b, course tab).
 *
 * Two reads for the scheme course: the scheme with its components, and the
 * model items. Phase 10b needed four — the Blackboard total fed the
 * agrees-with-Blackboard sentence and the saved scenario fed the what-if
 * values, and G-1 removed both. The figure is computed only once both have
 * answered; until then the header says "loading…", and a failed read says which
 * read failed rather than showing a figure built from half the rows.
 */

import { useMemo } from 'react';
import {
  useGradeModelItems,
  useGradingScheme,
  type GradeComponentRow,
  type GradeModelItemRow,
} from '@/lib/queries.grade-model';
import { runCourseFigure, type CourseFigureState } from '@/lib/grade-figure-run';
import { queryErrorMessage } from '@/components/shared/QueryState';

export interface CourseGradeModel {
  /** Null until both reads have answered, and when one failed. */
  readonly figure: CourseFigureState['figure'];
  readonly loading: boolean;
  /** "Could not load …" for the first read that failed, else the engine's own. */
  readonly error: string | null;
  readonly items: readonly GradeModelItemRow[];
  /** The syllabus parts, for the "Counts toward…" picker's options. */
  readonly components: readonly GradeComponentRow[];
}

export function useCourseGradeModel(schemeCourseId: string | null): CourseGradeModel {
  const schemeQ = useGradingScheme(schemeCourseId);
  const itemsQ = useGradeModelItems(schemeCourseId);

  const failed = [
    { query: schemeQ, of: 'the grading rules' },
    { query: itemsQ, of: 'the model items' },
  ].find(({ query }) => query.isError);
  const loadError = failed
    ? `Could not load ${failed.of}: ${queryErrorMessage(failed.query.error)}`
    : null;

  const bundle = schemeQ.data;
  const items = itemsQ.data;

  const state = useMemo<CourseFigureState | null>(() => {
    // No scheme course to key on: the reads are disabled, so there is nothing
    // to wait for — the figure says "no grading rules recorded" by itself.
    if (schemeCourseId === null) {
      return runCourseFigure({ bundle: { scheme: null, components: [] }, items: [] });
    }
    if (loadError || bundle === undefined || items === undefined) return null;
    return runCourseFigure({ bundle, items });
  }, [schemeCourseId, loadError, bundle, items]);

  return {
    figure: state?.figure ?? null,
    loading: state === null && loadError === null,
    error: loadError ?? state?.error ?? null,
    items: items ?? [],
    components: bundle?.components ?? [],
  };
}

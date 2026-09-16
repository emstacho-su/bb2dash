'use client';

/**
 * One course's grade model, read and computed (Phase 10b, course tab).
 *
 * Four reads for the scheme course (scheme + components, model items, the
 * Blackboard total, the saved scenario) and one for the shells' score history.
 * The engine runs only once all four have answered; until then the container
 * says "loading…", and a failed read says which read failed rather than showing
 * a standing computed from partial rows.
 */

import { useMemo } from 'react';
import {
  useGradeHistory,
  useGradeModelItems,
  useGradeModelTotal,
  useGradeScenario,
  useGradingScheme,
  type GradeModelItemRow,
  type GradeScenarioRow,
  type GradebookHistoryRow,
} from '@/lib/queries.grade-model';
import { runCourseModel, type CourseModelRows, type ModelRun } from '@/lib/grade-model-run';
import { historyByColumn } from '@/lib/grade-model-view';
import { queryErrorMessage } from '@/components/shared/QueryState';

export interface CourseGradeModel {
  /** Null until every read has answered, and when one failed. */
  readonly run: ModelRun | null;
  readonly loading: boolean;
  /** "Could not load …" for the first read that failed. */
  readonly loadError: string | null;
  readonly items: readonly GradeModelItemRow[];
  readonly scenario: GradeScenarioRow | null;
  readonly history: ReadonlyMap<string, readonly GradebookHistoryRow[]>;
  readonly historyError: string | null;
}

const NO_ROWS: CourseModelRows = {
  bundle: { scheme: null, components: [] },
  items: [],
  total: null,
  scenario: null,
};

export function useCourseGradeModel(
  schemeCourseId: string | null,
  shellIds: readonly string[],
): CourseGradeModel {
  const schemeQ = useGradingScheme(schemeCourseId);
  const itemsQ = useGradeModelItems(schemeCourseId);
  const totalQ = useGradeModelTotal(schemeCourseId);
  const scenarioQ = useGradeScenario(schemeCourseId);
  const historyQ = useGradeHistory(shellIds);

  const failed = [
    { query: schemeQ, of: 'the grading rules' },
    { query: itemsQ, of: 'the model items' },
    { query: totalQ, of: "Blackboard's total" },
    { query: scenarioQ, of: 'the saved scenario' },
  ].find(({ query }) => query.isError);
  const loadError = failed ? `Could not load ${failed.of}: ${queryErrorMessage(failed.query.error)}` : null;

  const bundle = schemeQ.data;
  const items = itemsQ.data;
  const total = totalQ.data;
  const scenario = scenarioQ.data;

  const run = useMemo(() => {
    // No scheme course to key on: the reads are disabled, so there is nothing
    // to wait for — the engine says "no grading rules recorded" by itself.
    if (schemeCourseId === null) return runCourseModel(NO_ROWS);
    if (loadError || bundle === undefined || items === undefined || total === undefined || scenario === undefined) {
      return null;
    }
    return runCourseModel({ bundle, items, total, scenario });
  }, [schemeCourseId, loadError, bundle, items, total, scenario]);

  const history = useMemo(() => historyByColumn(historyQ.data ?? []), [historyQ.data]);

  return {
    run,
    loading: run === null && loadError === null,
    loadError,
    items: items ?? [],
    scenario: scenario ?? null,
    history,
    historyError: historyQ.isError
      ? `Could not load the score history: ${queryErrorMessage(historyQ.error)}`
      : null,
  };
}

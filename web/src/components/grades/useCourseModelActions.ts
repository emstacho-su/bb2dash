'use client';

/**
 * The course tab's writes, wired into the props the table, the placeholder
 * rows and the solver take (Phase 10b).
 *
 * Every write goes to one of Stack's two tables: a what-if value or a target
 * letter upserts the course's one `grade_scenarios` row; Reset deletes it; a
 * picker change writes or clears one `grade_column_links` row. Each write's
 * failure comes back as a sentence the screen shows — never swallowed.
 */

import { useCallback, useMemo, useState } from 'react';
import { useLinkColumn } from '@/lib/queries.grade-model';
import { useResetScenario, useSaveScenario } from '@/lib/queries.grade-scenario';
import { pickTargetLetter, runSolver } from '@/lib/grade-model-run';
import {
  columnItemKey,
  linkOptions,
  linkStates,
  whatIfTargets,
  type LinkState,
  type LinkTarget,
  type WhatIfTarget,
} from '@/lib/grade-model-view';
import type { TargetResult } from '@/lib/grade-model/types';
import { queryErrorMessage } from '@/components/shared/QueryState';
import type { GradebookLinksProps } from './GradebookTable';
import type { WhatIfProps } from './WhatIfCell';
import type { CourseGradeModel } from './useCourseGradeModel';

export interface SolverProps {
  readonly result: TargetResult | null;
  readonly error: string | null;
  readonly letters: readonly string[];
  readonly selected: string;
  readonly onSelect: (letter: string) => void;
}

export interface CourseModelActions {
  readonly whatIf: WhatIfProps;
  readonly links: GradebookLinksProps;
  /** Null unless the model computed: a solver over a hidden model says nothing new. */
  readonly solver: SolverProps | null;
  readonly canReset: boolean;
  readonly onReset: () => void;
  readonly resetPending: boolean;
  /** The last scenario write that failed, as a sentence. */
  readonly scenarioError: string | null;
}

const NO_TARGETS: ReadonlyMap<string, WhatIfTarget> = new Map();
const NO_VALUES: Readonly<Record<string, number>> = {};

export function useCourseModelActions(
  schemeCourseId: string | null,
  model: CourseGradeModel,
): CourseModelActions {
  const save = useSaveScenario(schemeCourseId);
  const reset = useResetScenario(schemeCourseId);
  const link = useLinkColumn();
  const [linkKey, setLinkKey] = useState<string | null>(null);

  const input = model.run?.input ?? null;
  const values = model.scenario?.item_scores ?? NO_VALUES;
  const savedLetter = model.scenario?.target_letter ?? null;
  const saveMutate = save.mutate;
  const linkMutate = link.mutate;

  // A save carries only its own change; the full row is built when it runs
  // (R2-5), so two quick commits can never overwrite each other.
  const onCommit = useCallback(
    (key: string, value: number | null) => {
      if (!schemeCourseId) return;
      saveMutate({ item: { key, value } });
    },
    [schemeCourseId, saveMutate],
  );

  const targets = useMemo(() => (input ? whatIfTargets(input) : NO_TARGETS), [input]);
  const whatIf = useMemo<WhatIfProps>(
    () => ({ targets, values, onCommit, disabled: !schemeCourseId }),
    [targets, values, onCommit, schemeCourseId],
  );

  const onLink = useCallback(
    (state: LinkState, target: LinkTarget) => {
      setLinkKey(columnItemKey(state.shellCourseId, state.columnId));
      linkMutate({ shellCourseId: state.shellCourseId, columnId: state.columnId, target });
    },
    [linkMutate],
  );
  const states = useMemo(() => linkStates(model.items), [model.items]);
  const options = useMemo(() => (input ? linkOptions(input.components) : []), [input]);
  const links = useMemo<GradebookLinksProps>(
    () => ({
      states,
      options,
      onChange: onLink,
      pendingKey: link.isPending ? linkKey : null,
      errorKey: link.isError ? linkKey : null,
      error: link.isError ? `Could not save the link: ${queryErrorMessage(link.error)}` : null,
    }),
    [states, options, onLink, link.isPending, link.isError, link.error, linkKey],
  );

  const letters = useMemo(() => input?.scheme?.letterScale.map((step) => step.letter) ?? [], [input]);
  const selected = pickTargetLetter(letters, savedLetter);
  const computed = model.run?.result?.state === 'computed';
  const solved = useMemo(() => (input && computed ? runSolver(input, selected) : null), [input, computed, selected]);
  const onSelect = useCallback(
    (letter: string) => {
      if (!schemeCourseId) return;
      saveMutate({ targetLetter: letter });
    },
    [schemeCourseId, saveMutate],
  );

  const scenarioError = save.isError
    ? `Could not save the scenario: ${queryErrorMessage(save.error)}`
    : reset.isError
      ? `Could not reset the scenario: ${queryErrorMessage(reset.error)}`
      : null;

  return {
    whatIf,
    links,
    solver: solved ? { ...solved, letters, selected, onSelect } : null,
    canReset: Boolean(schemeCourseId) && model.scenario !== null,
    onReset: () => {
      if (schemeCourseId) reset.mutate();
    },
    resetPending: reset.isPending,
    scenarioError,
  };
}

'use client';

/**
 * The "Counts toward…" picker's wiring (Phase 12b, G-1).
 *
 * All that survives of Phase 10b's `useCourseModelActions`, which also carried
 * what-if commits, the target solver and Reset scenario. The picker stays
 * because it is the one control that changes what the figure counts: it links a
 * Blackboard column to a syllabus rule, or marks it "Not graded".
 *
 * One picker change writes or clears one `grade_column_links` row. The write's
 * pending and error state is tracked against the item key it was fired from, so
 * a failure shows on the row that caused it rather than on every row at once.
 */

import { useCallback, useMemo, useState } from 'react';
import {
  useLinkColumn,
  type GradeComponentRow,
  type GradeModelItemRow,
} from '@/lib/queries.grade-model';
import {
  columnItemKey,
  linkOptions,
  linkStates,
  type LinkState,
  type LinkTarget,
} from '@/lib/grade-model-view';
import type { GradebookLinksProps } from './GradebookTable';
import { queryErrorMessage } from '@/components/shared/QueryState';

export function useCourseLinkActions(
  schemeCourseId: string | null,
  items: readonly GradeModelItemRow[],
  components: readonly GradeComponentRow[],
): GradebookLinksProps {
  const link = useLinkColumn();
  const [linkKey, setLinkKey] = useState<string | null>(null);
  const linkMutate = link.mutate;

  const onChange = useCallback(
    (state: LinkState, target: LinkTarget) => {
      if (!schemeCourseId) return;
      setLinkKey(columnItemKey(state.shellCourseId, state.columnId));
      linkMutate({ shellCourseId: state.shellCourseId, columnId: state.columnId, target });
    },
    [schemeCourseId, linkMutate],
  );

  const states = useMemo(() => linkStates(items), [items]);
  const options = useMemo(
    () => linkOptions(components.map((c) => ({ id: c.id, name: c.name, parentId: c.parent_id }))),
    [components],
  );

  return useMemo<GradebookLinksProps>(
    () => ({
      states,
      options,
      onChange,
      pendingKey: link.isPending ? linkKey : null,
      errorKey: link.isError ? linkKey : null,
      error: link.isError ? `Could not save the link: ${queryErrorMessage(link.error)}` : null,
    }),
    [states, options, onChange, link.isPending, link.isError, link.error, linkKey],
  );
}

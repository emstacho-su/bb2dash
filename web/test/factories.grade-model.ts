/**
 * Fixtures for Phase 10b.
 *
 * Row builders for migration 058's views and 057's tables, with values taken
 * from prod on 2026-09-16 (`docs/planning/sprint-1-hub/verification/68a_W20_VERIFICATION.md`): IST.466's
 * two major-case columns linked `tentative`, IST.323's Total Score with
 * `bb_running = true`, GEO 103's recitation Attendance column under the
 * lecture's scheme, IST.323 Quiz #3 going from ungraded to 10.
 *
 * Phase 12b (G-1) removed the `ModelResult` / `TargetResult` fixtures, the
 * placeholder rows, the saved scenario and Blackboard's total row along with
 * the features they described. What is left is row data for the reads that
 * survive.
 */

import type {
  GradeComponentRow,
  GradeModelItemRow,
  GradebookHistoryRow,
  GradingSchemeRow,
} from '@/lib/grade-model-input';

export const SEEN_0914 = '2026-09-14T17:19:23.154Z';
export const SEEN_0916 = '2026-09-16T17:14:02.645Z';

export function makeItem(overrides: Partial<GradeModelItemRow> = {}): GradeModelItemRow {
  return {
    scheme_course_id: 'IST.466',
    item_key: 'col:IST.466:_3562497_1',
    assignment_id: 'IST.466/ethics-team-2-presentation',
    shell_course_id: 'IST.466',
    column_id: '_3562497_1',
    component_id: 25,
    link_source: 'assignment',
    link_confidence: 'confirmed',
    excluded: false,
    name: 'Ethics Case Presentation',
    possible: 100,
    score: null,
    is_exempt: false,
    column_kind: 'item',
    is_extra_credit: false,
    due_at: null,
    seen_at: SEEN_0916,
    ...overrides,
  };
}

/** IST.466 Synchrony Major Case #1 — linked by assignment, `tentative`. */
export const IST466_SYNCHRONY = makeItem({
  item_key: 'col:IST.466:_3562496_1',
  assignment_id: 'IST.466/major-project-1-synchrony',
  column_id: '_3562496_1',
  component_id: 24,
  link_confidence: 'tentative',
  name: 'Synchrony Major Case #1',
  possible: 150,
});

export const IST466_SCHEME: GradingSchemeRow = {
  course_id: 'IST.466',
  method: 'points',
  total_points: 1020,
  graded_out_of: 1020,
  letter_scale: [
    { min: 930, letter: 'A' },
    { min: 900, letter: 'A-' },
    { min: 870, letter: 'B+' },
    { min: 0, letter: 'F' },
  ],
};

export function makeComponent(overrides: Partial<GradeComponentRow> = {}): GradeComponentRow {
  return {
    id: 25,
    course_id: 'IST.466',
    code: 'ethics_presentations',
    name: 'Team Ethics Case Presentations',
    parent_id: null,
    weight_pct: null,
    points: 100,
    count_expected: 1,
    aggregation: 'single',
    drop_lowest: 0,
    rank_weights: null,
    normalize_to: null,
    is_extra_credit: false,
    ...overrides,
  };
}

export const IST466_COMPONENTS: GradeComponentRow[] = [
  makeComponent({ id: 24, code: 'major_cases', name: 'Two Major Case Studies (Synchrony, SU IT)', points: 300, count_expected: 2, aggregation: 'sum' }),
  makeComponent(),
  makeComponent({ id: 35, code: 'letter_of_gratitude', name: 'Letter of Gratitude', points: 100 }),
];

/** Three registered observations of one column: ungraded, 9, 9.5. */
export const QUIZ_HISTORY: GradebookHistoryRow[] = [
  { shell_course_id: 'IST.323', column_id: '_3560532_1', name: 'Quiz #3', run_id: 'r1', seen_at: '2026-09-10T17:00:00.000Z', score: null, possible: 10, previous_score: null },
  { shell_course_id: 'IST.323', column_id: '_3560532_1', name: 'Quiz #3', run_id: 'r2', seen_at: SEEN_0914, score: 9, possible: 10, previous_score: null },
  { shell_course_id: 'IST.323', column_id: '_3560532_1', name: 'Quiz #3', run_id: 'r3', seen_at: SEEN_0916, score: 9.5, possible: 10, previous_score: 9 },
];

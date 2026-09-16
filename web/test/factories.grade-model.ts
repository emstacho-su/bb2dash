/**
 * Fixtures for Phase 10b.
 *
 * Row builders for migration 058's views and 057's tables, with values taken
 * from prod on 2026-09-16 (`docs/planning/68a_W20_VERIFICATION.md`): IST.466's
 * two major-case columns linked `tentative`, IST.323's Total Score with
 * `bb_running = true`, GEO 103's recitation Attendance column under the
 * lecture's scheme, IST.323 Quiz #3 going from ungraded to 10.
 *
 * `ModelResult` / `TargetResult` fixtures are typed against the frozen
 * `grade-model/types.ts`, so a Contract change breaks these at compile time.
 */

import type { ComputedResult, ModelResult, Standing, TargetResult } from '@/lib/grade-model/types';
import type {
  GradeComponentRow,
  GradeModelItemRow,
  GradeModelTotalRow,
  GradeScenarioRow,
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

/** IST.466 Letter of Gratitude — a placeholder: no Blackboard column yet. */
export const IST466_LETTER_PLACEHOLDER = makeItem({
  item_key: 'asg:IST.466/letter-of-gratitude',
  assignment_id: 'IST.466/letter-of-gratitude',
  column_id: null,
  component_id: 35,
  name: 'Letter of Gratitude',
  possible: 100,
  column_kind: 'placeholder',
  due_at: '2026-12-11T04:59:00.000Z',
  seen_at: null,
});

/**
 * ECN.304 Exam 1 as prod holds it: a confirmed placeholder with no possible,
 * linked to the rank-weighted Exams component (Round 1b A1).
 */
export const ECN304_EXAM1_PLACEHOLDER = makeItem({
  scheme_course_id: 'ECN.304',
  item_key: 'asg:ECN.304/exam-1',
  assignment_id: 'ECN.304/exam-1',
  shell_course_id: 'ECN.304',
  column_id: null,
  component_id: 3,
  name: 'Exam 1',
  possible: null,
  column_kind: 'placeholder',
  due_at: '2026-10-02T03:59:00.000Z',
  seen_at: null,
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

export const IST323_TOTAL_ROW: GradeModelTotalRow = {
  scheme_course_id: 'IST.323',
  shell_course_id: 'IST.323',
  column_id: '_3599279_1',
  name: 'Total Score',
  score: 14.8,
  possible: 104,
  seen_at: SEEN_0916,
  bb_running: true,
};

export function makeScenario(overrides: Partial<GradeScenarioRow> = {}): GradeScenarioRow {
  return {
    course_id: 'IST.466',
    item_scores: {},
    target_letter: null,
    updated_at: SEEN_0916,
    ...overrides,
  };
}

/** Three registered observations of one column: ungraded, 9, 9.5. */
export const QUIZ_HISTORY: GradebookHistoryRow[] = [
  { shell_course_id: 'IST.323', column_id: '_3560532_1', name: 'Quiz #3', run_id: 'r1', seen_at: '2026-09-10T17:00:00.000Z', score: null, possible: 10, previous_score: null },
  { shell_course_id: 'IST.323', column_id: '_3560532_1', name: 'Quiz #3', run_id: 'r2', seen_at: SEEN_0914, score: 9, possible: 10, previous_score: null },
  { shell_course_id: 'IST.323', column_id: '_3560532_1', name: 'Quiz #3', run_id: 'r3', seen_at: SEEN_0916, score: 9.5, possible: 10, previous_score: 9 },
];

/* ---------------------------------------------------------------------------
 * Engine result fixtures
 * ------------------------------------------------------------------------ */

export function standing(pct: number, letter: string | null, denominator = 100): Standing {
  return { pct, earned: (pct * denominator) / 100, denominator, letter };
}

export function makeComputed(overrides: Partial<ComputedResult> = {}): ComputedResult {
  return {
    state: 'computed',
    standings: {
      graded_so_far: standing(87.36, 'B+'),
      zeros_on_rest: standing(41.25, 'F'),
      best_case: standing(96.04, 'A'),
    },
    components: [
      { componentId: 11, code: 'quizzes', name: 'Blackboard Quizzes', state: 'partly_graded', earned: 5, gradedCap: 5, cap: 5, usesHypothetical: false, capacityFromKnownItems: false },
      { componentId: 15, code: 'exams', name: 'Exams', state: 'partly_graded', earned: 9.8, gradedCap: 10, cap: 30, usesHypothetical: false, capacityFromKnownItems: false },
      { componentId: 16, code: 'labs', name: 'Required Labs', state: 'ungraded', earned: 0, gradedCap: 0, cap: 20, usesHypothetical: false, capacityFromKnownItems: false },
    ],
    unlinkedScoredKeys: [],
    usesHypotheticals: false,
    agreement: null,
    ...overrides,
  };
}

export const NOT_COMPUTED_MANUAL: ModelResult = {
  state: 'not_computable',
  reason: 'manual_unscored',
  unscoredManual: ['Class Participation'],
};

export const TARGET_NEEDED: TargetResult = {
  state: 'needed',
  letter: 'A-',
  targetPct: 90,
  averageNeeded: 0.91234,
  remainingCount: 7,
  remainingShare: 0.6125,
};

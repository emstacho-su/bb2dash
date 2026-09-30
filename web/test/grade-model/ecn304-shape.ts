/**
 * ECN.304's real grading shape, copied from prod on 2026-09-30 (task 27, the
 * Exam 1 rehearsal): `grade_components` 1–3 and the course's
 * `v_grade_model_items` rows. Exams are the only thing a test varies: a
 * number is a posted Blackboard column scored out of 100, `null` is the
 * `asg:` placeholder the view emits while no column is bound.
 */

import type { ModelInput } from '@/lib/grade-model';
import { component, item, modelInput, scheme } from './builders';

export const ECN304_EXAMS_PART = 'Exams (rank-weighted)';

const SEEN_AT = '2026-09-29T14:12:18.855Z';

const COMPONENTS = [
  component({ id: 1, code: 'participation', name: 'Participation', weightPct: 10, aggregation: 'manual' }),
  component({
    id: 2,
    code: 'quizzes',
    name: 'Average Quiz Grade',
    weightPct: 15,
    aggregation: 'average_drop_lowest',
    dropLowest: 1,
  }),
  component({
    id: 3,
    code: 'exams',
    name: ECN304_EXAMS_PART,
    weightPct: 75,
    aggregation: 'rank_weighted',
    rankWeights: [30, 25, 20],
    countExpected: 3,
  }),
];

/** Attendance and Quiz 1–4 exactly as prod's view reads them today. */
const POSTED = [
  { key: 'col:ECN.304:_3598937_1', name: 'Attendance', componentId: 1, possible: 100, score: 80, kind: 'attendance' as const },
  { key: 'col:ECN.304:_3607818_1', name: 'Quiz 1', componentId: 2, possible: 10, score: 9, kind: 'item' as const },
  { key: 'col:ECN.304:_3615278_1', name: 'Quiz 2', componentId: 2, possible: 8, score: 6, kind: 'item' as const },
  { key: 'col:ECN.304:_3618944_1', name: 'Quiz 3', componentId: 2, possible: 7, score: 4, kind: 'item' as const },
  { key: 'col:ECN.304:_3621234_1', name: 'Quiz 4', componentId: 2, possible: 10, score: 8, kind: 'item' as const },
].map((row) => item({ ...row, seenAt: SEEN_AT }));

function examRow(n: 1 | 2 | 3, score: number | null) {
  if (score === null) {
    return item({ key: `asg:ECN.304/exam-${n}`, name: `Exam ${n}`, componentId: 3, possible: null, score: null, kind: 'placeholder' });
  }
  return item({ key: `col:ECN.304:_999900${n}_1`, name: `Exam ${n}`, componentId: 3, possible: 100, score, seenAt: SEEN_AT });
}

export function ecn304Input(exams: readonly [number | null, number | null, number | null]): ModelInput {
  return modelInput({
    scheme: scheme({ courseId: 'ECN.304' }),
    components: COMPONENTS,
    items: [...POSTED, examRow(1, exams[0]), examRow(2, exams[1]), examRow(3, exams[2])],
  });
}

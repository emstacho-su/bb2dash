/**
 * L1 — Contract amendment A1 (Round 1b): a placeholder with `possible` null, a
 * confirmed link and a fraction-only aggregation takes a what-if value as a
 * percentage (`f = v / 100`) and then counts as graded. `sum` placeholders with
 * no points and unsure series placeholders stay bookkeeping, value or not.
 */

import { describe, expect, it } from 'vitest';
import { projectCourse, solveTarget, type ComputedResult, type ItemInput, type ModelInput } from '@/lib/grade-model';
import { component, item, modelInput, PCT_SCALE, scheme } from './builders';

/** ECN.304 as in prod on 9/16, with Attendance (85.714) linked to Participation so the course computes. */
const ecn304Components = [
  component({ id: 1, code: 'participation', name: 'Participation', weightPct: 10, aggregation: 'manual' }),
  component({ id: 2, code: 'quizzes', name: 'Average Quiz Grade', weightPct: 15, aggregation: 'average_drop_lowest', dropLowest: 1 }),
  component({ id: 3, code: 'exams', name: 'Exams (rank-weighted)', weightPct: 75, countExpected: 3, aggregation: 'rank_weighted', rankWeights: [30, 25, 20] }),
];
const pointless = (id: string, componentId: number, confidence: ItemInput['linkConfidence'] = 'confirmed') =>
  item({ key: `asg:${id}`, componentId, possible: null, kind: 'placeholder', linkConfidence: confidence });
const ecn304Items: readonly ItemInput[] = [
  item({ key: 'col:ECN.304:_3598937_1', componentId: 1, linkSource: 'override', possible: 100, score: 85.714, kind: 'attendance' }),
  item({ key: 'col:ECN.304:_3607818_1', componentId: 2, possible: 10, score: 9 }),
  pointless('ECN.304/exam-1', 3),
  pointless('ECN.304/exam-2', 3),
  pointless('ECN.304/exam-3', 3),
  pointless('ECN.304/quiz-02', 2),
  pointless('ECN.304/quiz-series', 2, 'inferred'),
];
const ecn304 = (itemScores: Record<string, number>): ModelInput =>
  modelInput({ scheme: scheme({ courseId: 'ECN.304', letterScale: PCT_SCALE }), components: ecn304Components, items: ecn304Items, scenario: { itemScores } });

function computed(input: ModelInput): ComputedResult {
  const result = projectCourse(input);
  expect(result.state).toBe('computed');
  return result as ComputedResult;
}

describe('A1 percent what-if on a pointless confirmed placeholder', () => {
  it('ECN.304: 90 and 70 typed on Exams 1–2 count as graded and re-order the rank weights', () => {
    const result = computed(ecn304({ 'asg:ECN.304/exam-1': 90, 'asg:ECN.304/exam-2': 70 }));
    // Exams graded so far: two of three typed, ranks unknown -> mean(0.9, 0.7) = 0.8 -> 75 * 0.8 = 60.
    // Participation 10 * 0.85714 = 8.5714; quizzes 15 * 0.9 = 13.5 (one graded <= drop 1).
    expect(result.standings.graded_so_far.pct).toBeCloseTo(8.5714 + 13.5 + 60, 9);
    expect(result.standings.graded_so_far.letter).toBe('B-');
    // Zeros: ranked [0.9, 0.7, 0] -> 30*0.9 + 25*0.7 + 20*0 = 44.5 -> 66.5714 % (D).
    expect(result.standings.zeros_on_rest.pct).toBeCloseTo(8.5714 + 13.5 + 44.5, 9);
    expect(result.standings.zeros_on_rest.letter).toBe('D');
    // Best: ranked [1, 0.9, 0.7] -> 30 + 25*0.9 + 20*0.7 = 66.5 -> 88.5714 % (B+): the typed 90 drops from the 30 % rank to 25 %.
    expect(result.standings.best_case.pct).toBeCloseTo(8.5714 + 13.5 + 66.5, 9);
    expect(result.standings.best_case.letter).toBe('B+');
    expect(result.usesHypotheticals).toBe(true);
    expect(result.components[2]).toMatchObject({ code: 'exams', state: 'partly_graded', usesHypothetical: true, gradedCap: 75 });
  });

  it('the typed exam order does not matter', () => {
    const forward = computed(ecn304({ 'asg:ECN.304/exam-1': 90, 'asg:ECN.304/exam-2': 70 }));
    const reversed = computed(ecn304({ 'asg:ECN.304/exam-1': 70, 'asg:ECN.304/exam-2': 90 }));
    expect(reversed.standings).toEqual(forward.standings);
  });

  it('solves on the remaining exam: B+ needs 0.947619, A- is out of reach', () => {
    const input = ecn304({ 'asg:ECN.304/exam-1': 90, 'asg:ECN.304/exam-2': 70 });
    // projection(r) = 22.0714 + E(r); for r >= 0.9, E = 30r + 25*0.9 + 20*0.7 = 30r + 36.5.
    // B+ (87): E = 64.9286 -> r = 28.4286 / 30 = 0.947619.
    const bPlus = solveTarget(input, 'B+');
    expect(bPlus).toMatchObject({ state: 'needed', remainingCount: 1, remainingShare: 0.25 });
    expect(bPlus.state === 'needed' && bPlus.averageNeeded).toBeCloseTo((87 - 22.0714 - 36.5) / 30, 5);
    // A- (90): E = 67.9286 > max 66.5 -> unreachable, best 88.5714.
    expect(solveTarget(input, 'A-')).toMatchObject({ state: 'unreachable', bestCase: { letter: 'B+' } });
  });

  it('with no value the placeholder stays bookkeeping (the weights supply the slot)', () => {
    const none = computed(ecn304({}));
    expect(none.components[2]).toMatchObject({ state: 'ungraded', gradedCap: 0 });
    expect(none.usesHypotheticals).toBe(false);
  });

  it.each([
    { name: 'a negative percentage', value: -1 },
    { name: 'a percentage above 100', value: 100.5 },
    { name: 'a non-finite percentage', value: Number.POSITIVE_INFINITY },
  ])('ignores $name', ({ value }) => {
    expect(computed(ecn304({ 'asg:ECN.304/exam-1': value }))).toEqual(computed(ecn304({})));
  });

  it('accepts the bounds 0 and 100', () => {
    const zero = computed(ecn304({ 'asg:ECN.304/exam-1': 0 }));
    const full = computed(ecn304({ 'asg:ECN.304/exam-1': 100 }));
    expect(zero.components[2]).toMatchObject({ state: 'partly_graded', earned: 0 });
    expect(full.components[2]).toMatchObject({ state: 'partly_graded', earned: 75 });
  });

  it('an inferred series placeholder ignores a value (ECN.304 quiz-series)', () => {
    expect(computed(ecn304({ 'asg:ECN.304/quiz-series': 50 }))).toEqual(computed(ecn304({})));
  });

  it('a confirmed quiz placeholder under average_drop_lowest takes one (ECN.304 quiz-02)', () => {
    const result = computed(ecn304({ 'asg:ECN.304/quiz-02': 60 }));
    // Quizzes [0.9, 0.6], 2 > drop 1 -> 0.6 dropped -> 15 * 0.9 = 13.5, but now a what-if value.
    expect(result.components[1]).toMatchObject({ earned: 13.5, usesHypothetical: true });
  });

  it('a sum placeholder with no points ignores a value (IST.352 term-project)', () => {
    const components = [
      component({ id: 30, code: 'project_deliverables', name: 'Project Assignment Deliverables', weightPct: 60, aggregation: 'sum' }),
      component({ id: 29, code: 'research', name: 'Research', weightPct: 40, countExpected: 1, aggregation: 'single' }),
    ];
    const items = [
      item({ key: 'col:IST.352:_3607154_1', componentId: 30, possible: 10, score: 9.5 }),
      item({ key: 'col:IST.352:_3543038_1', componentId: 29, possible: 5, score: 4 }),
      pointless('IST.352/term-project', 30),
    ];
    const plain = computed(modelInput({ components, items }));
    const typed = computed(modelInput({ components, items, scenario: { itemScores: { 'asg:IST.352/term-project': 80 } } }));
    expect(typed).toEqual(plain);
    expect(typed.usesHypotheticals).toBe(false);
  });

  it('a manual component never takes one: the course stays manual_unscored', () => {
    const components = [component({ id: 1, name: 'Participation', weightPct: 100, aggregation: 'manual' })];
    const result = projectCourse(
      modelInput({ components, items: [pointless('participation', 1)], scenario: { itemScores: { 'asg:participation': 100 } } }),
    );
    expect(result).toEqual({ state: 'not_computable', reason: 'manual_unscored', unscoredManual: ['Participation'] });
  });

  it('an exempt, excluded, non-placeholder, unsure or unknown-component row never takes one', () => {
    const components = [component({ id: 1, name: 'Exam', weightPct: 100, countExpected: 1, aggregation: 'single' })];
    const base = pointless('exam', 1);
    const run = (row: ItemInput) =>
      projectCourse(modelInput({ components, items: [row], scenario: { itemScores: { 'asg:exam': 80 } } })).state;
    expect(run(base)).toBe('computed');
    expect(run({ ...base, exempt: true })).toBe('not_computable');
    expect(run({ ...base, excluded: true })).toBe('not_computable');
    expect(run({ ...base, kind: 'item' })).toBe('not_computable');
    expect(run({ ...base, linkConfidence: 'tentative' })).toBe('not_computable');
    expect(run({ ...base, componentId: 99 })).toBe('not_computable');
  });
});

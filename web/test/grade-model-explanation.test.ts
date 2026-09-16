/**
 * Round 3, R3-2: "N of M parts graded" counts parts graded by real scores only.
 *
 * The real engine on the L3 fixtures, through `runModel` — which also runs
 * `projectCourse` on the same input with an empty scenario — so the wording is
 * checked against the engine's own answer, never a re-derived rule. ECN.304
 * read "3 of 3" on the preview with only hypothetical exams typed.
 */

import { describe, expect, it } from 'vitest';
import { explanationText } from '@/lib/grade-model-format';
import { runModel } from '@/lib/grade-model-run';
import type { ModelInput } from '@/lib/grade-model/types';
import { fixtureFor, inputOf, stateOf } from './grade-model/fixture-loader';

function fixtureInput(course: string, state: string): ModelInput {
  const fixture = fixtureFor(course);
  return inputOf(fixture, stateOf(fixture, state));
}

/** The explanation line exactly as `ModelStanding` renders it for this input. */
function explanationFor(input: ModelInput): string {
  const run = runModel(input);
  if (run.result?.state !== 'computed') throw new Error(`not computed: ${JSON.stringify(run.result ?? run.error)}`);
  return explanationText(run.result.components, run.realResult, input.components);
}

describe('explanationText — graded by real scores only (R3-2)', () => {
  it('ECN.304 with two exams typed: the exams are what-if, not graded', () => {
    const input = fixtureInput('ECN.304', 'exam_what_ifs');
    expect(Object.keys(input.scenario.itemScores)).toEqual(['asg:ECN.304/exam-1', 'asg:ECN.304/exam-2']);
    expect(explanationFor(input)).toBe(
      '2 of 3 parts graded: Participation, Average Quiz Grade · what-if on Exams (rank-weighted)',
    );
  });

  it('ECN.304 with nothing typed: no what-if clause', () => {
    expect(explanationFor(fixtureInput('ECN.304', 'live_with_attendance_link'))).toBe(
      '2 of 3 parts graded: Participation, Average Quiz Grade',
    );
  });

  it('IST.466 with one what-if: nothing is graded, the typed part is named', () => {
    const live = fixtureInput('IST.466', 'live_2026_09_16');
    const input = { ...live, scenario: { itemScores: { 'col:IST.466:_3562491_1': 45 } } };
    expect(runModel(live).result?.state).toBe('not_computable');
    expect(explanationFor(input)).toBe('0 of 6 parts graded · what-if on Ethics Case Practice');
  });

  it('a part with real scores and what-if values on its other items counts as graded, with no what-if clause', () => {
    const input = fixtureInput('ECN.304', 'live_with_attendance_link');
    const typed = { ...input, scenario: { itemScores: { 'asg:ECN.304/quiz-02': 80 } } };
    expect(explanationFor(typed)).toBe('2 of 3 parts graded: Participation, Average Quiz Grade');
  });
});

/**
 * L5 — target solver. Round trip on ECN.304 (`rank_weighted`, participation
 * scored) and GEO 103 reading quizzes (`average_drop_lowest`, manual parts
 * scored): `projection(averageNeeded) ≥ target`, and just below it does not
 * reach; the unreachable / secured / no-remaining-work fixtures; a seeded
 * property over random courses; the solver's edge decisions.
 */

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { letterFor, projectCourse, solveTarget, type ModelInput, type TargetResult } from '@/lib/grade-model';
import { stepFor, stepPct, scaleValue } from '@/lib/grade-model/letter';
import { evaluateCourse } from '@/lib/grade-model/project';
import { standingAtR } from '@/lib/grade-model/solve';
import { modelInputArb } from './arbitraries';
import { component, item, modelInput, scheme } from './builders';
import { assertProperty } from './fc-params';
import { fixtureFor, inputOf, stateOf } from './fixture-loader';

const BELOW = 2e-6;

/** Does the course, with every remaining slot at `r`, reach `letter`'s step? */
function reachesAt(input: ModelInput, letter: string, r: number): boolean {
  const evaluation = evaluateCourse(input);
  if (evaluation.state !== 'computed') throw new Error('not computed');
  const { scheme: s } = evaluation.model;
  const step = stepFor(letter, s);
  const value = scaleValue(standingAtR(evaluation, r).pct, s);
  return step !== null && value !== null && value >= step.min;
}

function neededOrThrow(result: TargetResult) {
  if (result.state !== 'needed') throw new Error(`expected needed, got ${result.state}`);
  return result;
}

describe.each([
  { course: 'ECN.304', state: 'mid' },
  { course: 'ECN.304', state: 'live_with_attendance_link' },
  { course: 'ECN.304', state: 'exam_what_ifs' },
  { course: 'GEO.103.lecture', state: 'mid' },
])('L5 round trip: $course $state', ({ course, state }) => {
  const fixture = fixtureFor(course);
  const input = inputOf(fixture, stateOf(fixture, state));
  const letters = fixture.scheme.letterScale.map((step) => step.letter);

  it.each(letters)('%s', (letter) => {
    const result = solveTarget(input, letter);
    if (result.state === 'needed') {
      expect(result.averageNeeded).toBeGreaterThanOrEqual(0);
      expect(result.averageNeeded).toBeLessThanOrEqual(1);
      expect(reachesAt(input, letter, result.averageNeeded)).toBe(true);
      expect(reachesAt(input, letter, Math.max(0, result.averageNeeded - BELOW))).toBe(false);
      // The solved standing earns the target letter or a higher one.
      const rank = (name: string | null) => fixture.scheme.letterScale.findIndex((step) => step.letter === name);
      const earned = letterFor(standingAtRFor(input, result.averageNeeded), fixture.scheme);
      expect(rank(earned)).toBeGreaterThanOrEqual(0);
      expect(rank(earned)).toBeLessThanOrEqual(rank(letter));
    } else {
      expect(['unreachable', 'secured']).toContain(result.state);
    }
  });
});

function standingAtRFor(input: ModelInput, r: number): number {
  const evaluation = evaluateCourse(input);
  if (evaluation.state !== 'computed') throw new Error('not computed');
  return standingAtR(evaluation, r).pct;
}

describe('L5 round trip through the scenario (ECN.304, A1 percent what-ifs on the three exams)', () => {
  it('typing averageNeeded on every remaining exam reaches A- in graded so far', () => {
    const fixture = fixtureFor('ECN.304');
    const input = inputOf(fixture, stateOf(fixture, 'live_with_attendance_link'));
    const needed = neededOrThrow(solveTarget(input, 'A-'));
    const pct = needed.averageNeeded * 100;
    const itemScores = { 'asg:ECN.304/exam-1': pct, 'asg:ECN.304/exam-2': pct, 'asg:ECN.304/exam-3': pct };
    const result = projectCourse({ ...input, scenario: { itemScores } });
    expect(result.state === 'computed' && result.standings.graded_so_far.pct).toBeGreaterThanOrEqual(90);
    expect(result.state === 'computed' && result.standings.graded_so_far.letter).toBe('A-');
    expect(solveTarget({ ...input, scenario: { itemScores } }, 'A-').state).toBe('no_remaining_work');
  });
});

describe('L5 edge states from the fixtures', () => {
  it.each([
    { course: 'ECN.304', state: 'mid', letter: 'A', expected: 'unreachable' },
    { course: 'IST.352', state: 'mid', letter: 'A', expected: 'unreachable' },
    { course: 'IST.323', state: 'all_graded', letter: 'A', expected: 'unreachable' },
    { course: 'ECN.304', state: 'mid', letter: 'F', expected: 'secured' },
    { course: 'IST.323', state: 'all_graded', letter: 'A-', expected: 'secured' },
    { course: 'ECN.304', state: 'all_graded', letter: 'A-', expected: 'no_remaining_work' },
    { course: 'GEO.103.lecture', state: 'all_graded', letter: 'A-', expected: 'no_remaining_work' },
    { course: 'IST.466', state: 'all_graded', letter: 'A-', expected: 'no_remaining_work' },
    { course: 'IST.471', state: 'all_graded', letter: 'A-', expected: 'not_computable' },
  ])('$course $state → $letter is $expected', ({ course, state, letter, expected }) => {
    const fixture = fixtureFor(course);
    expect(solveTarget(inputOf(fixture, stateOf(fixture, state)), letter).state).toBe(expected);
  });
});

describe('L5 property', () => {
  it('every letter on a random course solves consistently, and needed round-trips', () => {
    const letters = ['A', 'A-', 'B', 'C', 'D', 'F'];
    assertProperty(
      fc.property(modelInputArb({ extraCredit: true, unsure: true }), fc.constantFrom(...letters), (input, letter) => {
        const result = solveTarget(input, letter);
        const evaluation = evaluateCourse(input);
        if (evaluation.state !== 'computed') return result.state === 'not_computable';
        const target = stepPct(stepFor(letter, evaluation.model.scheme)!, evaluation.model.scheme)!;
        switch (result.state) {
          case 'needed':
            return reachesAt(input, letter, result.averageNeeded) && result.remainingCount > 0 && result.targetPct === target;
          case 'unreachable':
            return result.bestCase.pct < target;
          case 'secured':
            return result.worstCase.pct >= target;
          case 'no_remaining_work':
            return evaluation.zeros.remainingCount === 0;
          default:
            return false;
        }
      }),
    );
  });
});

describe('L5 decisions', () => {
  const exam = component({ id: 1, code: 'exam', name: 'Exam', points: 100, countExpected: 1 });
  const bonus = component({ id: 2, code: 'bonus', name: 'Bonus', points: 10, countExpected: 1, isExtraCredit: true });
  const points = scheme({ method: 'points', totalPoints: 110, gradedOutOf: 100 });
  const items = [
    item({ key: 'asg:exam', componentId: 1, possible: 100, kind: 'placeholder' }),
    item({ key: 'asg:bonus', componentId: 2, possible: 10, kind: 'placeholder', isExtraCredit: true }),
  ];
  const input = modelInput({ scheme: points, components: [exam, bonus], items, scenario: { itemScores: { 'asg:exam': 0 } } });

  it('ungraded extra credit is not remaining work and is never counted on', () => {
    // A what-if 0 on the exam makes the course compute with nothing left but the bonus.
    expect(solveTarget(input, 'A').state).toBe('no_remaining_work');
    const homework = component({ id: 3, code: 'hw', name: 'Homework', points: 10, countExpected: 1 });
    const open = modelInput({
      scheme: points,
      components: [homework, { ...exam, points: 90 }, bonus],
      items: [item({ key: 'col:hw', componentId: 3, possible: 10, score: 10 }), { ...items[0]!, possible: 90 }, items[1]!],
    });
    const needed = neededOrThrow(solveTarget(open, 'A-'));
    // 10 + 90r >= 90 -> r = 8/9; counting the ungraded bonus at r would give 10 + 100r -> 0.8.
    expect(needed.remainingCount).toBe(1);
    expect(needed.averageNeeded).toBeCloseTo(8 / 9, 5);
    expect(needed.remainingShare).toBeCloseTo(0.9, 12);
    // The standings' best case still counts the bonus: (10 + 90 + 10) / 100.
    const projected = projectCourse(open);
    expect(projected.state === 'computed' && projected.standings.best_case.pct).toBeCloseTo(110, 9);
  });

  it('throws a RangeError for a letter that is not on the scale', () => {
    expect(() => solveTarget(input, 'Z')).toThrow(RangeError);
  });

  it('throws a RangeError for a points scale with no point total to convert against', () => {
    const noTotals = scheme({ method: 'points', letterScale: [{ min: 900, letter: 'A' }, { min: 0, letter: 'F' }] });
    const graded = modelInput({ scheme: noTotals, components: [exam], items: [item({ key: 'col:e', componentId: 1, possible: 100, score: 50 })] });
    expect(() => solveTarget(graded, 'A')).toThrow(RangeError);
  });
});

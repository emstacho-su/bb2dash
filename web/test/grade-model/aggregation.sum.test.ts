/**
 * L1 — `sum`: earned `cap·Σs/Σp_exp`, graded capacity `cap·Σp_graded/Σp_exp`;
 * `Σp_exp` = `points` under the points method, else Σ possible over known
 * counted items. Includes IST.323 `final_project` = proposal + log + defense.
 */

import { describe, expect, it } from 'vitest';
import { run as runCourse, type RunResult } from './run';
import { sumAggregate } from '@/lib/grade-model/aggregations/sum';
import { component, counted, item, leaf, modelInput, scheme } from './builders';

describe('sum under weighted_pct (capacity from known items)', () => {
  const CAP = 60; // IST.352 project_deliverables
  it.each([
    { name: 'IST.352 live: #1A 9.5/10, the only known deliverable', items: [counted(10, 9.5)], r: null, earned: 57, gradedCap: 60, remainingCap: 0, remainingCount: 0 },
    { name: 'same at best case: no unknown slot is invented', items: [counted(10, 9.5)], r: 1, earned: 57, gradedCap: 60, remainingCap: 0, remainingCount: 0 },
    { name: 'one graded, one ungraded known: graded so far', items: [counted(10, 9.5), counted(10, null)], r: null, earned: 28.5, gradedCap: 30, remainingCap: 30, remainingCount: 1 },
    { name: 'one graded, one ungraded known: zeros on the rest', items: [counted(10, 9.5), counted(10, null)], r: 0, earned: 28.5, gradedCap: 30, remainingCap: 30, remainingCount: 1 },
    { name: 'one graded, one ungraded known: best case', items: [counted(10, 9.5), counted(10, null)], r: 1, earned: 58.5, gradedCap: 30, remainingCap: 30, remainingCount: 1 },
    { name: 'unequal possibles weigh by points', items: [counted(20, 10), counted(5, 5)], r: null, earned: 36, gradedCap: 60, remainingCap: 0, remainingCount: 0 },
    { name: 'decision: nothing known, graded so far', items: [], r: null, earned: 0, gradedCap: 0, remainingCap: 60, remainingCount: 1 },
    { name: 'decision: nothing known, best case is the whole capacity', items: [], r: 1, earned: 60, gradedCap: 0, remainingCap: 60, remainingCount: 1 },
  ])('$name', ({ items, r, earned, gradedCap, remainingCap, remainingCount }) => {
    const outcome = sumAggregate(leaf({ aggregation: 'sum' }, items, CAP), r);
    expect(outcome.earned).toBeCloseTo(earned, 12);
    expect(outcome.gradedCap).toBeCloseTo(gradedCap, 12);
    expect(outcome.remainingCap).toBeCloseTo(remainingCap, 12);
    expect(outcome.remainingCount).toBe(remainingCount);
    expect(outcome.capacityFromKnownItems).toBe(true);
  });
});

describe('sum under points (Σp_exp = points)', () => {
  it.each([
    { name: 'IST.323 exams 9/16: Exam #1 9.8/10 + two placeholders', cap: 30, count: 3, items: [counted(10, 9.8), counted(10, null), counted(10, null)], r: null, earned: 9.8, gradedCap: 10, remainingCap: 20, remainingCount: 2 },
    { name: 'IST.323 exams, zeros on the rest', cap: 30, count: 3, items: [counted(10, 9.8), counted(10, null), counted(10, null)], r: 0, earned: 9.8, gradedCap: 10, remainingCap: 20, remainingCount: 2 },
    { name: 'IST.323 exams, best case', cap: 30, count: 3, items: [counted(10, 9.8), counted(10, null), counted(10, null)], r: 1, earned: 29.8, gradedCap: 10, remainingCap: 20, remainingCount: 2 },
    { name: 'IST.466 attendance: 150 pts over 30 days, none posted, graded so far', cap: 150, count: 30, items: [], r: null, earned: 0, gradedCap: 0, remainingCap: 150, remainingCount: 30 },
    { name: 'IST.466 attendance at r = 0.5', cap: 150, count: 30, items: [], r: 0.5, earned: 75, gradedCap: 0, remainingCap: 150, remainingCount: 30 },
    { name: 'IST.323 fp_log: checkpoint (1) known, completed log (2) missing', cap: 3, count: 2, items: [counted(1, 1)], r: null, earned: 1, gradedCap: 1, remainingCap: 2, remainingCount: 1 },
    { name: 'IST.323 fp_log at best case', cap: 3, count: 2, items: [counted(1, 1)], r: 1, earned: 3, gradedCap: 1, remainingCap: 2, remainingCount: 1 },
    { name: 'missing capacity with no count still leaves one slot', cap: 20, count: null, items: [counted(5, 4)], r: 0, earned: 4, gradedCap: 5, remainingCap: 15, remainingCount: 1 },
    { name: 'known possibles above points: no missing capacity, nothing clamped', cap: 11, count: 1, items: [counted(13, 13)], r: 1, earned: 13, gradedCap: 13, remainingCap: 0, remainingCount: 0 },
  ])('$name', ({ cap, count, items, r, earned, gradedCap, remainingCap, remainingCount }) => {
    const outcome = sumAggregate(leaf({ aggregation: 'sum', points: cap, countExpected: count }, items, cap, 'points'), r);
    expect(outcome.earned).toBeCloseTo(earned, 12);
    expect(outcome.gradedCap).toBeCloseTo(gradedCap, 12);
    expect(outcome.remainingCap).toBeCloseTo(remainingCap, 12);
    expect(outcome.remainingCount).toBe(remainingCount);
    expect(outcome.capacityFromKnownItems).toBe(false);
  });

  it('reproduces 9.8 exactly and prices extra credit per point', () => {
    const outcome = sumAggregate(leaf({ aggregation: 'sum', points: 30, countExpected: 3 }, [counted(10, 9.8)], 30, 'points'), null);
    expect(outcome.earned).toBe(9.8);
    expect(outcome.unitCap.perPoint).toBe(1);
  });

  it('a points component with no points falls back to the known items', () => {
    const outcome = sumAggregate(leaf({ aggregation: 'sum', points: null }, [counted(10, 5)], 0, 'points'), null);
    expect(outcome.capacityFromKnownItems).toBe(true);
    expect(outcome.earned).toBe(0);
  });
});

describe('sum with children: IST.323 final_project = proposal 11 + log 3 + defense 6', () => {
  const components = [
    component({ id: 14, code: 'final_project', name: 'Final Project', points: 20, aggregation: 'sum' }),
    component({ id: 18, code: 'fp_proposal', name: 'Proposal', parentId: 14, points: 11, countExpected: 1, aggregation: 'single' }),
    component({ id: 19, code: 'fp_log', name: 'Running Log', parentId: 14, points: 3, countExpected: 2, aggregation: 'sum' }),
    component({ id: 20, code: 'fp_defense', name: 'Defense', parentId: 14, points: 6, countExpected: 1, aggregation: 'single' }),
  ];
  const baseItems = [
    item({ key: 'col:proposal', componentId: 18, possible: 11, score: 9 }),
    item({ key: 'col:log-checkpoint', componentId: 19, possible: 1, score: 1 }),
    item({ key: 'col:fp-defense', componentId: 20, possible: 6 }),
  ];
  const points = scheme({ method: 'points', totalPoints: 20, gradedOutOf: null, letterScale: [{ min: 0, letter: 'F' }] });

  function run(items = baseItems) {
    const result = runCourse(modelInput({ scheme: points, components, items }));
    expect(result.state).toBe('computed');
    return result as Extract<RunResult, { state: 'computed' }>;
  }

  it('computes the parent from its children in points', () => {
    const result = run();
    // graded so far: 9 + 1 earned over 11 + 1 of graded capacity
    expect(result.standing.earned).toBe(10);
    expect(result.standing.denominator).toBe(12);
    expect(result.components.map((c) => [c.code, c.state, c.earned, c.gradedCap, c.cap])).toEqual([
      ['final_project', 'partly_graded', 10, 12, 20],
      ['fp_proposal', 'graded', 9, 11, 11],
      ['fp_log', 'partly_graded', 1, 1, 3],
      ['fp_defense', 'ungraded', 0, 0, 6],
    ]);
  });

  // G-1: an unsure link used to remove its child from the parent and the
  // course. It now counts like any other, and the screen says the link is
  // unsure instead.
  it('an unsure child still counts toward its parent', () => {
    const items = baseItems.map((row) => (row.key === 'col:fp-defense' ? { ...row, linkConfidence: 'tentative' as const, score: 6 } : row));
    const result = run(items);
    expect(result.components.find((c) => c.code === 'final_project')?.cap).toBe(20);
    expect(result.components.find((c) => c.code === 'fp_defense')?.state).toBe('graded');
    expect(result.standing).toMatchObject({ earned: 16, denominator: 18 });
  });

  it('a parent whose every child is graded is graded', () => {
    const items = [
      ...baseItems.filter((row) => row.key !== 'col:fp-defense'),
      item({ key: 'col:log-final', componentId: 19, possible: 2, score: 2 }),
      item({ key: 'col:defense', componentId: 20, possible: 6, score: 5 }),
    ];
    const result = run(items);
    expect(result.components[0]).toMatchObject({ state: 'graded', earned: 17, gradedCap: 20, cap: 20 });
  });
});

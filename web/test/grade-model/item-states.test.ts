/**
 * L1 — `itemStates()` (Round 2, R2-3), one block per field, built from the
 * engine's own item preparation: what-if targets (points or percent), muted
 * components (children included), placeholders dropped as surplus.
 */

import { describe, expect, it } from 'vitest';
import { itemStates, projectCourse, type ItemInput, type ModelInput } from '@/lib/grade-model';
import { component, item, modelInput, scheme } from './builders';
import { fixtureFor, inputOf, loadFixtures, stateOf } from './fixture-loader';

const fixtureInput = (course: string, state: string) => {
  const fixture = fixtureFor(course);
  return inputOf(fixture, stateOf(fixture, state));
};
const keysOf = (input: ModelInput) => itemStates(input).whatIfTargets.map((target) => target.key);

/** IST.323-like points course: labs (count 4), a manual part, a final project with children. */
const components = [
  component({ id: 10, code: 'participation', name: 'Class Participation', points: 5, aggregation: 'manual' }),
  component({ id: 11, code: 'quizzes', name: 'Quizzes', points: 5, countExpected: 3, aggregation: 'normalized' }),
  component({ id: 14, code: 'final_project', name: 'Final Project', points: 20, aggregation: 'sum' }),
  component({ id: 18, code: 'fp_proposal', name: 'Proposal', parentId: 14, points: 14, countExpected: 1 }),
  component({ id: 20, code: 'fp_defense', name: 'Defense', parentId: 14, points: 6, countExpected: 1 }),
  component({ id: 16, code: 'labs', name: 'Required Labs', points: 20, countExpected: 4, aggregation: 'sum' }),
  component({ id: 21, code: 'research', name: 'Research', points: 50, countExpected: 1, aggregation: 'sum' }),
];
const lab = (n: number) => item({ key: `asg:IST.323/lab-${n}`, componentId: 16, possible: 5, kind: 'placeholder' });
const items: readonly ItemInput[] = [
  item({ key: 'col:participation', componentId: 10, linkSource: 'override', possible: 5, score: 5 }),
  item({ key: 'col:quiz-1', componentId: 11, possible: 10, score: 10 }),
  item({ key: 'col:quiz-2', componentId: 11, possible: 10 }),
  item({ key: 'asg:quiz-03', componentId: 11, possible: null, kind: 'placeholder' }),
  item({ key: 'col:proposal', componentId: 14, possible: 13 }),
  item({ key: 'asg:fp-packet', componentId: 14, possible: null, kind: 'placeholder' }),
  item({ key: 'asg:fp-proposal', componentId: 18, possible: 14, kind: 'placeholder' }),
  item({ key: 'asg:fp-defense', componentId: 20, possible: 6, kind: 'placeholder', linkConfidence: 'tentative' }),
  item({ key: 'col:lab-1', componentId: 16, linkSource: 'override', possible: 5, dueAt: '2026-09-24T03:59:00Z' }),
  lab(1), lab(2), lab(3), lab(4),
  item({ key: 'asg:research-series', componentId: 21, possible: null, kind: 'placeholder' }),
  item({ key: 'col:selection', componentId: null, linkSource: null, linkConfidence: null, possible: 100 }),
  item({ key: 'col:exempt', componentId: 21, possible: 50, exempt: true }),
  item({ key: 'col:excluded', componentId: 21, possible: 50, excluded: true }),
  item({ key: 'col:zero', componentId: 21, possible: 0 }),
  item({ key: 'col:research', componentId: 21, possible: 50 }),
];
const input = modelInput({ scheme: scheme({ method: 'points', totalPoints: 100, gradedOutOf: 100 }), components, items });

describe('itemStates().whatIfTargets', () => {
  it('lists exactly the ungraded items whose value the engine uses, in input order, with unit and max', () => {
    expect(itemStates(input).whatIfTargets).toEqual([
      { key: 'col:quiz-2', unit: 'points', max: 10 },
      { key: 'asg:quiz-03', unit: 'percent', max: 100 },
      { key: 'asg:fp-proposal', unit: 'points', max: 14 },
      { key: 'col:lab-1', unit: 'points', max: 5 },
      { key: 'asg:IST.323/lab-2', unit: 'points', max: 5 },
      { key: 'asg:IST.323/lab-3', unit: 'points', max: 5 },
      { key: 'asg:IST.323/lab-4', unit: 'points', max: 5 },
      { key: 'col:research', unit: 'points', max: 50 },
    ]);
  });

  it.each([
    { name: 'a graded item (Blackboard wins)', key: 'col:quiz-1' },
    { name: 'a manual part’s column', key: 'col:participation' },
    { name: 'R2-1: a column linked straight to a parent', key: 'col:proposal' },
    { name: 'R2-1: a pointless placeholder on a parent', key: 'asg:fp-packet' },
    { name: 'a muted part’s placeholder', key: 'asg:fp-defense' },
    { name: 'R2-2: the dropped seeded duplicate lab-1', key: 'asg:IST.323/lab-1' },
    { name: 'a pointless placeholder under sum', key: 'asg:research-series' },
    { name: 'an unlinked column', key: 'col:selection' },
    { name: 'an exempt item', key: 'col:exempt' },
    { name: 'an excluded (Not graded) item', key: 'col:excluded' },
    { name: 'a zero-point item', key: 'col:zero' },
  ])('leaves out $name', ({ key }) => {
    expect(keysOf(input)).not.toContain(key);
    const typed = projectCourse({ ...input, scenario: { itemScores: { [key]: 1 } } });
    expect(typed).toEqual(projectCourse(input));
  });

  it('keeps a percent placeholder that already has a value, and never lists an unsure one', () => {
    const valued = { ...input, scenario: { itemScores: { 'asg:quiz-03': 40 } } };
    expect(keysOf(valued)).toContain('asg:quiz-03');
    const unsure = { ...input, items: input.items.map((row) => (row.key === 'asg:quiz-03' ? { ...row, linkConfidence: 'inferred' as const } : row)) };
    expect(keysOf(unsure)).not.toContain('asg:quiz-03');
  });

  it('probes the surplus drop a percent value would cause: a placeholder that would drop itself is no target', () => {
    const single = [component({ id: 1, name: 'Exam', weightPct: 100, countExpected: 1 })];
    const rows = [
      item({ key: 'col:exam', componentId: 1, possible: 100 }),
      item({ key: 'asg:exam', componentId: 1, possible: null, kind: 'placeholder' }),
    ];
    expect(itemStates(modelInput({ components: single, items: rows })).whatIfTargets).toEqual([{ key: 'col:exam', unit: 'points', max: 100 }]);
  });

  it('probes un-muting: a percent value that pushes out an unsure placeholder makes a muted part a target', () => {
    const parts = [component({ id: 1, name: 'Essays', weightPct: 100, countExpected: 2, aggregation: 'average' })];
    const rows = [
      item({ key: 'col:essay-1', componentId: 1, possible: 10, score: 8 }),
      item({ key: 'asg:a-unsure', componentId: 1, possible: 10, kind: 'placeholder', linkConfidence: 'tentative' }),
      item({ key: 'asg:b-essay', componentId: 1, possible: null, kind: 'placeholder' }),
    ];
    const course = modelInput({ components: parts, items: rows });
    expect(itemStates(course).mutedComponentIds).toEqual([1]);
    expect(keysOf(course)).toEqual(['asg:b-essay']);
    const typed = projectCourse({ ...course, scenario: { itemScores: { 'asg:b-essay': 70 } } });
    expect(typed.state === 'computed' && typed.usesHypotheticals).toBe(true);
  });

  it.each([
    { name: 'manual_unscored (IST.323 live)', course: 'IST.323', state: 'live_2026_09_16' },
    { name: 'qualitative_method (IST.471 live)', course: 'IST.471', state: 'live_2026_09_16' },
  ])('is empty when the course is not computable: $name', ({ course, state }) => {
    expect(itemStates(fixtureInput(course, state)).whatIfTargets).toEqual([]);
  });

  it('is empty for no scheme and for an unknown rule', () => {
    expect(itemStates({ ...input, scheme: null }).whatIfTargets).toEqual([]);
    const unknown = { ...input, components: input.components.map((c) => (c.id === 21 ? { ...c, aggregation: 'unknown' as const } : c)) };
    expect(itemStates(unknown).whatIfTargets).toEqual([]);
  });

  it('is not empty for nothing_graded (IST.466 live): unsure major cases and AI Team are not targets', () => {
    expect(itemStates(fixtureInput('IST.466', 'live_2026_09_16')).whatIfTargets).toEqual([
      { key: 'col:IST.466:_3562491_1', unit: 'points', max: 50 },
      { key: 'col:IST.466:_3562495_1', unit: 'points', max: 120 },
      { key: 'col:IST.466:_3562497_1', unit: 'points', max: 100 },
      { key: 'asg:IST.466/letter-of-gratitude', unit: 'points', max: 100 },
    ]);
  });

  it('A1 on the live ECN.304 exams once Participation is linked', () => {
    const targets = itemStates(fixtureInput('ECN.304', 'live_with_attendance_link')).whatIfTargets;
    expect(targets).toEqual([
      { key: 'asg:ECN.304/exam-1', unit: 'percent', max: 100 },
      { key: 'asg:ECN.304/exam-2', unit: 'percent', max: 100 },
      { key: 'asg:ECN.304/exam-3', unit: 'percent', max: 100 },
      { key: 'asg:ECN.304/quiz-02', unit: 'percent', max: 100 },
    ]);
  });
});

describe('itemStates().mutedComponentIds', () => {
  it('lists muted components in input order, children included', () => {
    expect(itemStates(input).mutedComponentIds).toEqual([20]);
    expect(itemStates(fixtureInput('IST.466', 'live_2026_09_16')).mutedComponentIds).toEqual([24, 36]);
  });

  it('is reported even when the course is not computable (IST.323 live: Individual Presentation)', () => {
    expect(itemStates(fixtureInput('IST.323', 'live_2026_09_16')).mutedComponentIds).toEqual([13]);
    expect(itemStates({ ...input, scheme: null }).mutedComponentIds).toEqual([20]);
  });

  it('an override un-mutes', () => {
    const confirmed = { ...input, items: input.items.map((row) => (row.key === 'asg:fp-defense' ? { ...row, linkConfidence: 'confirmed' as const } : row)) };
    expect(itemStates(confirmed).mutedComponentIds).toEqual([]);
  });
});

describe('itemStates().droppedPlaceholderKeys', () => {
  it('R2-2: the live IST.323 lab shape drops lab-1 only', () => {
    expect(itemStates(input).droppedPlaceholderKeys).toEqual(['asg:IST.323/lab-1']);
  });

  it('is empty when nothing is surplus, and ignores unlinked or parent-linked rows', () => {
    const noLink = { ...input, items: input.items.filter((row) => row.key !== 'col:lab-1') };
    expect(itemStates(noLink).droppedPlaceholderKeys).toEqual([]);
  });

  it('a percent placeholder only drops once it has a value', () => {
    const single = [component({ id: 1, name: 'Exam', weightPct: 100, countExpected: 1 })];
    const rows = [
      item({ key: 'col:exam', componentId: 1, possible: 100, score: 70 }),
      item({ key: 'asg:exam', componentId: 1, possible: null, kind: 'placeholder' }),
    ];
    const course = modelInput({ components: single, items: rows });
    expect(itemStates(course).droppedPlaceholderKeys).toEqual([]);
    expect(itemStates({ ...course, scenario: { itemScores: { 'asg:exam': 50 } } }).droppedPlaceholderKeys).toEqual(['asg:exam']);
  });
});

describe('itemStates().unsureItemKeys (Round 3, R3-3)', () => {
  const MAJOR_CASE_2 = 'col:IST.466:_3562492_1';
  const MAJOR_CASE_1 = 'col:IST.466:_3562496_1';
  const AI_TEAM = 'asg:IST.466/ai-team-assignment';
  const override = (course: ModelInput, key: string): ModelInput => ({
    ...course,
    items: course.items.map((row) => (row.key === key ? { ...row, linkSource: 'override' as const, linkConfidence: 'confirmed' as const } : row)),
  });

  it('IST.466 live: the two major-case columns and the AI Team placeholder, in input order', () => {
    expect(itemStates(fixtureInput('IST.466', 'live_2026_09_16')).unsureItemKeys).toEqual([MAJOR_CASE_2, MAJOR_CASE_1, AI_TEAM]);
  });

  it('IST.466: after overriding one major case, only the other major case remains (AI Team is its own part)', () => {
    const states = itemStates(override(fixtureInput('IST.466', 'live_2026_09_16'), MAJOR_CASE_1));
    expect(states.unsureItemKeys).toEqual([MAJOR_CASE_2, AI_TEAM]);
    expect(states.mutedComponentIds).toEqual([24, 36]);
    const both = itemStates(override(override(fixtureInput('IST.466', 'live_2026_09_16'), MAJOR_CASE_1), MAJOR_CASE_2));
    expect(both.unsureItemKeys).toEqual([AI_TEAM]);
    expect(both.mutedComponentIds).toEqual([36]);
  });

  it('lists a muting placeholder, and nothing that cannot mute', () => {
    // asg:fp-defense (tentative placeholder on a leaf) mutes; nothing else here is unsure and counted.
    expect(itemStates(input).unsureItemKeys).toEqual(['asg:fp-defense']);
    const unsureRows = new Set(['col:proposal', 'col:selection', 'col:exempt', 'col:excluded', 'col:zero', 'asg:IST.323/lab-1']);
    const noisy = {
      ...input,
      items: input.items.map((row) => (unsureRows.has(row.key) ? { ...row, linkSource: 'assignment' as const, linkConfidence: 'tentative' as const } : row)),
    };
    // A column on a parent (R2-1), an unlinked one, exempt / excluded / zero-point columns: none is counted
    // on a leaf, so none mutes. lab-1 is still dropped as surplus before it could mute Required Labs.
    expect(itemStates(noisy).unsureItemKeys).toEqual(['asg:fp-defense']);
    expect(itemStates(noisy).droppedPlaceholderKeys).toEqual(['asg:IST.323/lab-1']);
  });

  it('agrees with mutedComponentIds on every fixture state: each key sits on a muted part, each muted leaf has a key', () => {
    for (const fixture of loadFixtures()) {
      for (const state of fixture.states) {
        const course = inputOf(fixture, state);
        const states = itemStates(course);
        const muted = new Set(states.mutedComponentIds);
        const componentOf = new Map(course.items.map((row) => [row.key, row.componentId]));
        for (const key of states.unsureItemKeys) {
          expect(muted.has(componentOf.get(key) ?? Number.NaN), `${fixture.course}/${state.name}: ${key}`).toBe(true);
        }
        const parents = new Set(course.components.map((c) => c.parentId));
        const unsureParts = new Set(states.unsureItemKeys.map((key) => componentOf.get(key)));
        for (const id of states.mutedComponentIds) {
          const parent = course.components.find((c) => c.id === id)?.parentId ?? null;
          if (parents.has(id) || (parent !== null && muted.has(parent))) continue;
          expect(unsureParts.has(id), `${fixture.course}/${state.name}: component ${id}`).toBe(true);
        }
      }
    }
  });
});

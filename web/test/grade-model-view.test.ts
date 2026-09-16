/**
 * The pure gates and wording around the engine: which rows take a what-if
 * value or a picker, how a typed value is validated, how figures are rounded
 * for display, and how a screen survives an engine that throws.
 */

import { describe, expect, it, vi } from 'vitest';
import type { ModelInput } from '@/lib/grade-model/types';
import {
  ECN304_EXAM1_PLACEHOLDER,
  IST466_COMPONENTS,
  IST466_LETTER_PLACEHOLDER,
  IST466_SCHEME,
  IST466_SYNCHRONY,
  QUIZ_HISTORY,
  makeComputed,
  makeItem,
  makeScenario,
  standing,
} from './factories.grade-model';

const engine = vi.hoisted(() => ({ project: vi.fn(), solve: vi.fn() }));
vi.mock('@/lib/grade-model', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/grade-model')>();
  return { ...actual, projectCourse: engine.project, solveTarget: engine.solve };
});

const view = await import('@/lib/grade-model-view');
const format = await import('@/lib/grade-model-format');
const runner = await import('@/lib/grade-model-run');
const { toModelInput } = await import('@/lib/grade-model-input');

function inputOf(items = [makeItem(), IST466_SYNCHRONY, IST466_LETTER_PLACEHOLDER]): ModelInput {
  return toModelInput(IST466_SCHEME, IST466_COMPONENTS, items, null, null);
}

describe('muting (answer 3, PM call 10)', () => {
  it('mutes a component with a counted, unsure item and names it', () => {
    const input = inputOf();
    expect([...view.mutedComponentIds(input)]).toEqual([24]);
    expect(view.mutedComponentNames(input)).toEqual(['Two Major Case Studies (Synchrony, SU IT)']);
  });

  it('never mutes on a bookkeeping, exempt or "Not graded" item', () => {
    const input = inputOf([
      { ...IST466_SYNCHRONY, possible: 0 },
      { ...IST466_SYNCHRONY, item_key: 'b', is_exempt: true },
      { ...IST466_SYNCHRONY, item_key: 'c', excluded: true },
      { ...IST466_SYNCHRONY, item_key: 'd', possible: null },
    ]);
    expect(view.mutedComponentIds(input).size).toBe(0);
  });

  it('an override is confirmed, so it un-mutes the part', () => {
    const input = inputOf([{ ...IST466_SYNCHRONY, link_source: 'override', link_confidence: 'confirmed' }]);
    expect(view.mutedComponentIds(input).size).toBe(0);
  });
});

describe('whatIfTargets', () => {
  it('offers ungraded, counted items of live components, placeholders included', () => {
    const targets = view.whatIfTargets(inputOf());
    expect([...targets.keys()]).toEqual(['col:IST.466:_3562497_1', 'asg:IST.466/letter-of-gratitude']);
    expect(targets.get('asg:IST.466/letter-of-gratitude')).toEqual({
      key: 'asg:IST.466/letter-of-gratitude', name: 'Letter of Gratitude', unit: 'points', possible: 100,
    });
  });

  it('offers nothing on a muted, graded, unlinked or hand-graded item', () => {
    const manual = { ...IST466_COMPONENTS[1], id: 99, aggregation: 'manual' as const };
    const input = toModelInput(IST466_SCHEME, [...IST466_COMPONENTS, manual], [
      IST466_SYNCHRONY,
      makeItem({ item_key: 'graded', score: 88 }),
      makeItem({ item_key: 'unlinked', component_id: null, link_source: null, link_confidence: null }),
      makeItem({ item_key: 'manual', component_id: 99 }),
      makeItem({ item_key: 'orphan-component', component_id: 12345 }),
    ], null, null);
    expect(view.whatIfTargets(input).size).toBe(0);
  });
});

describe('percentage what-if on a pointless placeholder (Round 1b A1)', () => {
  const ECN_SCHEME = { ...IST466_SCHEME, course_id: 'ECN.304', method: 'weighted_pct' as const };
  const component = (aggregation: string, id = 3) =>
    ({ ...IST466_COMPONENTS[0], id, course_id: 'ECN.304', points: null, weight_pct: 75, aggregation }) as (typeof IST466_COMPONENTS)[number];

  it.each(['single', 'average', 'average_drop_lowest', 'rank_weighted', 'normalized'])(
    'offers a percent cell on a confirmed pointless placeholder of a %s part',
    (aggregation) => {
      const input = toModelInput(ECN_SCHEME, [component(aggregation)], [ECN304_EXAM1_PLACEHOLDER], null, null);
      expect(view.whatIfTargets(input).get('asg:ECN.304/exam-1')).toEqual({
        key: 'asg:ECN.304/exam-1', name: 'Exam 1', unit: 'percent', possible: 100,
      });
    },
  );

  it('offers none on a sum or manual part, an unsure link, or a pointless column', () => {
    const input = toModelInput(
      ECN_SCHEME,
      [component('sum', 30), component('manual', 1), component('rank_weighted', 3)],
      [
        { ...ECN304_EXAM1_PLACEHOLDER, item_key: 'asg:IST.352/term-project', component_id: 30 },
        { ...ECN304_EXAM1_PLACEHOLDER, item_key: 'asg:ECN.304/participation', component_id: 1 },
        { ...ECN304_EXAM1_PLACEHOLDER, item_key: 'asg:ECN.304/quiz-series', link_confidence: 'inferred' },
        { ...ECN304_EXAM1_PLACEHOLDER, item_key: 'col:ECN.304:x', column_kind: 'item', column_id: 'x' },
        { ...ECN304_EXAM1_PLACEHOLDER, item_key: 'asg:ECN.304/zero', possible: 0 },
      ],
      null,
      null,
    );
    expect(view.whatIfTargets(input).size).toBe(0);
  });

  it('never mutes a part: a pointless placeholder is not a counted item', () => {
    const input = toModelInput(ECN_SCHEME, [component('rank_weighted')], [{ ...ECN304_EXAM1_PLACEHOLDER, link_confidence: 'inferred' }], null, null);
    expect(view.mutedComponentIds(input).size).toBe(0);
  });

  it('keeps its saved percentage in the scenario handed to the engine', () => {
    const input = toModelInput(ECN_SCHEME, [component('rank_weighted')], [ECN304_EXAM1_PLACEHOLDER], makeScenario({ course_id: 'ECN.304', item_scores: { 'asg:ECN.304/exam-1': 90 } }), null);
    expect(input.scenario.itemScores).toEqual({ 'asg:ECN.304/exam-1': 90 });
  });
});

describe('linkStates (answer 2, PM call 9)', () => {
  it('offers the picker on an unsure link, preselected', () => {
    expect(view.linkStates([IST466_SYNCHRONY]).get(IST466_SYNCHRONY.item_key)).toEqual({
      shellCourseId: 'IST.466', columnId: '_3562496_1', componentId: 24, excluded: false, unsure: true, override: false,
    });
  });

  it('offers it on an unlinked column scored or not, and on an override; never on a placeholder or a confirmed link', () => {
    const unlinked = { component_id: null, link_source: null, link_confidence: null } as const;
    const scoredUnlinked = makeItem({ item_key: 'col:IST.323:lab', score: 4, ...unlinked });
    const unscoredUnlinked = makeItem({ item_key: 'col:IST.323:_3569973_1', column_id: '_3569973_1', possible: 13, score: null, assignment_id: null, ...unlinked });
    const notGraded = makeItem({ item_key: 'col:IST.323:sel', link_source: 'override', excluded: true, component_id: 13 });
    const states = view.linkStates([scoredUnlinked, unscoredUnlinked, notGraded, makeItem(), IST466_LETTER_PLACEHOLDER]);
    expect([...states.keys()]).toEqual(['col:IST.323:lab', 'col:IST.323:_3569973_1', 'col:IST.323:sel']);
    expect(states.get('col:IST.323:_3569973_1')).toMatchObject({ componentId: null, unsure: false, override: false });
    expect(states.get('col:IST.323:sel')).toMatchObject({ override: true, excluded: true, componentId: null, unsure: false });
  });

  it('offers none on a zero-point or pointless column, unlinked or unsure (Round 1b A2)', () => {
    const states = view.linkStates([
      makeItem({ item_key: 'col:IST.352:kc', possible: 0, score: 1, component_id: null, link_source: null, link_confidence: null }),
      makeItem({ item_key: 'col:IST.352:null', possible: null, component_id: null, link_source: null, link_confidence: null }),
      { ...IST466_SYNCHRONY, item_key: 'col:IST.466:zero', possible: 0 },
    ]);
    expect(states.size).toBe(0);
  });

  it('keeps an override pickable even on a zero-point column, so it can be undone', () => {
    const states = view.linkStates([makeItem({ item_key: 'col:IST.352:kc', possible: 0, link_source: 'override', link_confidence: 'confirmed' })]);
    expect(states.get('col:IST.352:kc')).toMatchObject({ override: true });
  });

  it('lists a parent before its parts', () => {
    const options = view.linkOptions([
      { id: 18, name: 'Proposal', parentId: 14 },
      { id: 15, name: 'Exams', parentId: null },
      { id: 14, name: 'Final Project', parentId: null },
    ]);
    expect(options.map((o) => o.name)).toEqual(['Final Project', 'Proposal', 'Exams']);
  });
});

describe('parseWhatIf — the boundary', () => {
  it.each([
    ['9', 9], ['9.5', 9.5], ['0', 0], ['10', 10], ['.5', 0.5], [' 7 ', 7],
  ])('accepts %j', (raw, value) => {
    expect(view.parseWhatIf(raw, 10)).toEqual({ ok: true, value });
  });

  it('reads an empty field as "clear"', () => {
    expect(view.parseWhatIf('   ', 10)).toEqual({ ok: true, value: null });
  });

  it.each(['-1', '10.01', 'abc', '0x10', '1e2', 'Infinity', '9,5'])('refuses %j', (raw) => {
    expect(view.parseWhatIf(raw, 10)).toEqual({ ok: false, error: 'Enter a number from 0 to 10.' });
  });

  it('sets and removes one key without touching the original', () => {
    const scores = Object.freeze({ a: 1, b: 2 });
    expect(view.withItemScore(scores, 'c', 3)).toEqual({ a: 1, b: 2, c: 3 });
    expect(view.withItemScore(scores, 'a', null)).toEqual({ b: 2 });
    expect(scores).toEqual({ a: 1, b: 2 });
  });
});

describe('historyByColumn', () => {
  it('groups by column item key, oldest first whatever the input order', () => {
    const grouped = view.historyByColumn([QUIZ_HISTORY[2], QUIZ_HISTORY[0], QUIZ_HISTORY[1]]);
    expect(grouped.get('col:IST.323:_3560532_1')?.map((r) => r.score)).toEqual([null, 9, 9.5]);
  });
});

describe('display rounding, once', () => {
  it('rounds a percentage to one decimal and points to at most two', () => {
    expect(format.formatPct(87.36)).toBe('87.4%');
    expect(format.formatPoints(14.8)).toBe('14.8');
    expect(format.formatPoints(3.14159)).toBe('3.14');
    expect(format.formatShare(0.61249)).toBe('61.2%');
  });

  it('never prints NaN', () => {
    expect(format.formatPct(Number.NaN)).toBe('—');
    expect(format.standingText(standing(Number.NaN, 'A'))).toBe('—');
  });

  it('writes the standing with its letter, the delta without a sign', () => {
    expect(format.standingText(standing(87.36, 'B+'))).toBe('87.4% (B+)');
    expect(format.agreementDeltaText({ delta: -1.234, unit: 'points' })).toBe('1.23');
    expect(format.agreementDeltaText({ delta: 0.66, unit: 'pct' })).toBe('0.7');
    expect(format.agreementUnitText('pct')).toBe('percentage points');
  });

  it('explains the headline from the component results, leaving muted parts out', () => {
    const { components } = makeComputed();
    expect(format.explanationText(components)).toBe('2 of 3 parts graded: Blackboard Quizzes, Exams');
    expect(format.explanationText([{ ...components[2], state: 'muted' }])).toBe('0 of 0 parts graded');
  });

  it('writes a history line with the dash for "not graded yet"', () => {
    expect(format.historyText(QUIZ_HISTORY.map((r) => ({ score: r.score, seenAt: r.seen_at })))).toBe(
      '— → 9 → 9.5 · seen 10 Sep, 14 Sep, 16 Sep',
    );
  });

  it('counts unlinked columns in words', () => {
    expect(format.unlinkedCountText(1)).toBe('1 scored Blackboard column is not linked to a syllabus rule');
    expect(format.unlinkedCountText(2)).toBe('2 scored Blackboard columns are not linked to a syllabus rule');
  });
});

describe('running the engine from a screen', () => {
  it('turns an engine exception into a sentence instead of a blank screen', () => {
    engine.project.mockImplementationOnce(() => {
      throw new Error('boom');
    });
    expect(runner.runModel(inputOf())).toMatchObject({ result: null, error: 'Could not compute the model: boom' });
    engine.solve.mockImplementationOnce(() => {
      throw new Error('no');
    });
    expect(runner.runSolver(inputOf(), 'A-')).toEqual({ result: null, error: 'Could not solve for A-: no' });
  });

  it('starts the solver on the saved letter, else A-, else the best letter', () => {
    expect(runner.pickTargetLetter(['A', 'A-', 'B'], 'B')).toBe('B');
    expect(runner.pickTargetLetter(['A', 'A-', 'B'], 'Z')).toBe('A-');
    expect(runner.pickTargetLetter(['A', 'B'], null)).toBe('A');
  });

  it('builds /grades states: loading, a shared load error, then one result per course', () => {
    const computed = makeComputed();
    engine.project.mockReturnValue(computed);
    const empty = { schemes: undefined, items: undefined, totals: undefined, scenarios: undefined };
    expect(runner.modelStandingStates(['IST.466'], empty, null)).toEqual({ 'IST.466': { result: null, error: null, loading: true } });
    expect(runner.modelStandingStates(['IST.466'], empty, 'Could not load x')).toEqual({ 'IST.466': { result: null, error: 'Could not load x', loading: false } });

    const states = runner.modelStandingStates(
      ['IST.466', 'IST.471'],
      {
        schemes: { 'IST.466': { scheme: IST466_SCHEME, components: IST466_COMPONENTS } },
        items: [makeItem(), makeItem({ scheme_course_id: 'IST.471', item_key: 'other' })],
        totals: [],
        scenarios: [makeScenario({ item_scores: { 'col:IST.466:_3562497_1': 90 } })],
      },
      null,
    );
    expect(states['IST.466']).toEqual({ result: computed, error: null, loading: false });
    const firstInput = engine.project.mock.calls.at(-2)?.[0] as ModelInput;
    expect(firstInput.items.map((i) => i.key)).toEqual(['col:IST.466:_3562497_1']);
    expect(firstInput.scenario.itemScores).toEqual({ 'col:IST.466:_3562497_1': 90 });
    const secondInput = engine.project.mock.calls.at(-1)?.[0] as ModelInput;
    expect(secondInput.scheme).toBeNull();
  });
});

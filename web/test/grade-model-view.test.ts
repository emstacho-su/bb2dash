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
const grades = await import('@/lib/queries.grades');
const runner = await import('@/lib/grade-model-run');
const { toModelInput } = await import('@/lib/grade-model-input');
const { itemStates } = await import('@/lib/grade-model');

function inputOf(items = [makeItem(), IST466_SYNCHRONY, IST466_LETTER_PLACEHOLDER]): ModelInput {
  return toModelInput(IST466_SCHEME, IST466_COMPONENTS, items, null, null);
}

describe('whatIfCellTargets — the engine decides, the view only names (R2-3w / R2-15)', () => {
  it('draws exactly the engine targets, labelled with each item name', () => {
    const input = inputOf();
    const cells = view.whatIfCellTargets(itemStates(input), input.items);
    expect([...cells.keys()]).toEqual(itemStates(input).whatIfTargets.map((t) => t.key));
    expect(cells.get('asg:IST.466/letter-of-gratitude')).toEqual({
      key: 'asg:IST.466/letter-of-gratitude', name: 'Letter of Gratitude', unit: 'points', possible: 100,
    });
    // The unsure major case is muted by the engine, so it gets no cell.
    expect(cells.has(IST466_SYNCHRONY.item_key)).toBe(false);
  });

  it("carries a percent target's unit and 100 bound through unchanged", () => {
    const exams = { ...IST466_COMPONENTS[0], id: 3, course_id: 'ECN.304', points: null, weight_pct: 100, aggregation: 'rank_weighted' as const, rank_weights: [30, 25, 20], count_expected: 3 };
    const input = toModelInput({ ...IST466_SCHEME, course_id: 'ECN.304', method: 'weighted_pct' }, [exams], [ECN304_EXAM1_PLACEHOLDER], null, null);
    const cells = view.whatIfCellTargets(itemStates(input), input.items);
    expect(cells.get('asg:ECN.304/exam-1')).toEqual({ key: 'asg:ECN.304/exam-1', name: 'Exam 1', unit: 'percent', possible: 100 });
  });

  it('falls back to the key for a target whose item is not in the list', () => {
    const cells = view.whatIfCellTargets({ whatIfTargets: [{ key: 'asg:x', unit: 'points', max: 5 }] }, []);
    expect(cells.get('asg:x')).toEqual({ key: 'asg:x', name: 'asg:x', unit: 'points', possible: 5 });
  });

  it('draws nothing for a course the engine will not compute', () => {
    const input = toModelInput({ ...IST466_SCHEME, method: 'qualitative' }, IST466_COMPONENTS, [makeItem()], makeScenario(), null);
    expect(view.whatIfCellTargets(itemStates(input), input.items).size).toBe(0);
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

  it("offers leaf components only, a parent's parts where the parent sat (R2-1w)", () => {
    const options = view.linkOptions([
      { id: 18, name: 'Proposal', parentId: 14 },
      { id: 15, name: 'Exams', parentId: null },
      { id: 14, name: 'Final Project', parentId: null },
      { id: 20, name: 'Defense', parentId: 14 },
    ]);
    expect(options.map((o) => o.name)).toEqual(['Proposal', 'Defense', 'Exams']);
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
    const parts = components.map((c) => ({ id: c.componentId, parentId: null, isExtraCredit: false }));
    expect(format.explanationText(components, makeComputed(), parts)).toBe('2 of 3 parts graded: Blackboard Quizzes, Exams');
    expect(format.explanationText([{ ...components[2], state: 'muted' }], makeComputed(), parts)).toBe('0 of 0 parts graded');
  });

  describe('IST.323 counts parts, not pieces (R2-12)', () => {
    // grade_components for IST.323: Final Project (14) has three children; 17 is extra credit.
    const IST323 = [
      { id: 10, name: 'Class Participation', parentId: null, isExtraCredit: false },
      { id: 11, name: 'Blackboard Quizzes', parentId: null, isExtraCredit: false },
      { id: 12, name: 'Security in the News Group Presentation', parentId: null, isExtraCredit: false },
      { id: 13, name: 'Individual Security Presentation', parentId: null, isExtraCredit: false },
      { id: 14, name: 'Final Project: Security Program Proposal', parentId: null, isExtraCredit: false },
      { id: 15, name: 'Exams', parentId: null, isExtraCredit: false },
      { id: 16, name: 'Required Labs', parentId: null, isExtraCredit: false },
      { id: 17, name: 'Extra Credit Lab', parentId: null, isExtraCredit: true },
      { id: 18, name: 'Final Project: Proposal', parentId: 14, isExtraCredit: false },
      { id: 19, name: 'Final Project: Running Log', parentId: 14, isExtraCredit: false },
      { id: 20, name: 'Final Project: In-class Defense', parentId: 14, isExtraCredit: false },
    ];
    const results = (graded: number[], muted: number[] = []) =>
      IST323.map((c) => ({
        componentId: c.id, code: String(c.id), name: c.name,
        state: muted.includes(c.id) ? 'muted' as const : graded.includes(c.id) ? 'graded' as const : 'ungraded' as const,
        earned: 0, gradedCap: 0, cap: 0, usesHypothetical: false, capacityFromKnownItems: false,
      }));
    /** The same component results with no what-if values in play. */
    const real = (components: ReturnType<typeof results>) => makeComputed({ components });

    it('reads "of 7 parts", with children and extra credit not counted', () => {
      expect(format.explanationText(results([11, 15, 17, 18]), real(results([11, 15, 17, 18])), IST323)).toBe('2 of 7 parts graded: Blackboard Quizzes, Exams');
    });

    it('names a muted parent once, not its pieces', () => {
      const muted = results([], [14, 18, 19, 20]);
      expect(format.mutedPartNames(muted, IST323)).toEqual(['Final Project: Security Program Proposal']);
      expect(format.explanationText(muted, real(muted), IST323)).toBe('0 of 6 parts graded');
    });

    it('names a lone muted piece when its parent is not muted', () => {
      expect(format.mutedPartNames(results([], [19]), IST323)).toEqual(['Final Project: Running Log']);
    });

    it('sorts the unsure items under the part they mute, pieces included (R3-3)', () => {
      const items = [
        { key: 'col:IST.323:_3569947_1', name: 'Log Checkpoint Assignment', kind: 'item' as const, componentId: 19 },
        { key: 'asg:IST.323/fp-log-final', name: 'Running Log (final)', kind: 'placeholder' as const, componentId: 19 },
        { key: 'col:IST.323:quiz', name: 'Quiz #3', kind: 'item' as const, componentId: 11 },
      ];
      const unsure = ['col:IST.323:_3569947_1', 'asg:IST.323/fp-log-final'];
      expect(format.mutedParts(results([], [14, 18, 19, 20]), IST323, items, unsure)).toEqual([
        { part: 'Final Project: Security Program Proposal', confirmable: ['Log Checkpoint Assignment'], notInBlackboard: 1 },
      ]);
      expect(format.mutedParts(results([], [19]), IST323, items, unsure.slice(1))).toEqual([
        { part: 'Final Project: Running Log', confirmable: [], notInBlackboard: 1 },
      ]);
      expect(format.mutedParts(results([11]), IST323, items, unsure)).toEqual([]);
    });
  });

  it('writes a history line with the dash for "not graded yet"', () => {
    expect(format.historyText(QUIZ_HISTORY.map((r) => ({ score: r.score, seenAt: r.seen_at })))).toBe(
      '— → 9 → 9.5 · seen 10 Sep, 14 Sep, 16 Sep',
    );
  });

  it('prints each history value exactly as the score cell does (R3-4)', () => {
    // ECN.304's Attendance: Blackboard stores three decimals; the cell reads "85.714 / 100".
    const points = [
      { score: 83.333, seenAt: '2026-09-14T17:19:23.154Z' },
      { score: 85.714, seenAt: '2026-09-16T17:14:02.645Z' },
    ];
    expect(format.historyText(points)).toBe('83.333 → 85.714 · seen 14 Sep, 16 Sep');
    expect(grades.scoreText(85.714, 100)).toBe('85.714 / 100');
    for (const { score } of points) {
      expect(format.historyText([{ score, seenAt: points[0].seenAt }])).toContain(grades.scoreNumberText(score));
    }
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
    expect(runner.MODEL_STANDING_LOADING).toMatchObject({ result: null, realResult: null, components: [], error: null, loading: true });
    expect(runner.modelStandingStates(['IST.466'], empty, null)).toEqual({ 'IST.466': runner.MODEL_STANDING_LOADING });
    expect(runner.modelStandingStates(['IST.466'], empty, 'Could not load x')).toEqual({
      'IST.466': { ...runner.MODEL_STANDING_LOADING, error: 'Could not load x', loading: false },
    });

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
    expect(states['IST.466']).toMatchObject({ result: computed, realResult: computed, error: null, loading: false });
    expect(states['IST.466'].components.map((c) => c.id)).toEqual(IST466_COMPONENTS.map((c) => c.id));
    // IST.466 holds a what-if value, so it runs twice: with its scenario, then real-only (R3-2).
    // IST.471 holds none, so its real-only result is its result and it runs once.
    const [firstInput, realOnlyInput, secondInput] = engine.project.mock.calls.slice(-3).map((call) => call[0] as ModelInput);
    expect(firstInput.items.map((i) => i.key)).toEqual(['col:IST.466:_3562497_1']);
    expect(firstInput.scenario.itemScores).toEqual({ 'col:IST.466:_3562497_1': 90 });
    expect(realOnlyInput).toEqual({ ...firstInput, scenario: { itemScores: {} } });
    expect(secondInput.scheme).toBeNull();
  });

  it('runs the real-only projection on the same input with an empty scenario (R3-2)', () => {
    const typed = makeComputed({ usesHypotheticals: true });
    const real = makeComputed();
    engine.project.mockReset();
    engine.project.mockReturnValueOnce(typed).mockReturnValueOnce(real);
    const input = { ...inputOf(), scenario: { itemScores: { 'col:IST.466:_3562497_1': 90 } } };
    expect(runner.runModel(input)).toMatchObject({ result: typed, realResult: real, error: null });
    expect(engine.project.mock.calls.map((call) => call[0])).toEqual([input, { ...input, scenario: { itemScores: {} } }]);
    expect(input.scenario.itemScores).toEqual({ 'col:IST.466:_3562497_1': 90 });

    engine.project.mockReset();
    engine.project.mockReturnValue(real);
    const noValues = { ...input, scenario: { itemScores: {} } };
    expect(runner.runModel(noValues)).toMatchObject({ result: real, realResult: real });
    expect(engine.project).toHaveBeenCalledTimes(1);
  });
});

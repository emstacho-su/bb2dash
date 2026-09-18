/**
 * The pure gates and wording around the engine: which rows get the "Counts
 * toward…" picker, how the score history groups, how figures are rounded for
 * display, and how a screen survives an engine that throws.
 *
 * Phase 12b (G-1) removed the what-if cells and their validation, the solver's
 * letter, the muted-part sentences, the agreement wording and the three-way
 * "parts graded" explanation, so the cases about them went with them. The
 * picker's own rules are unchanged and matter more than ever: they decide which
 * Blackboard columns the figure counts at all.
 */

import { describe, expect, it, vi } from 'vitest';
import {
  IST466_COMPONENTS,
  IST466_SCHEME,
  IST466_SYNCHRONY,
  QUIZ_HISTORY,
  makeItem,
} from './factories.grade-model';

const engine = vi.hoisted(() => ({ graded: vi.fn() }));
vi.mock('@/lib/graded-so-far', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/graded-so-far')>();
  return { ...actual, gradedSoFar: engine.graded };
});

const view = await import('@/lib/grade-model-view');
const format = await import('@/lib/grade-model-format');
const grades = await import('@/lib/queries.grades');
const runner = await import('@/lib/grade-figure-run');

describe('linkStates (answer 2, PM call 9)', () => {
  it('offers the picker on an unsure link, preselected', () => {
    expect(view.linkStates([IST466_SYNCHRONY]).get(IST466_SYNCHRONY.item_key)).toEqual({
      shellCourseId: 'IST.466', columnId: '_3562496_1', componentId: 24, excluded: false, unsure: true, override: false,
    });
  });

  it('offers it on an unlinked column scored or not, and on an override; never on a confirmed link', () => {
    const unlinked = { component_id: null, link_source: null, link_confidence: null } as const;
    const scoredUnlinked = makeItem({ item_key: 'col:IST.323:lab', score: 4, ...unlinked });
    const unscoredUnlinked = makeItem({ item_key: 'col:IST.323:_3569973_1', column_id: '_3569973_1', possible: 13, score: null, assignment_id: null, ...unlinked });
    const notGraded = makeItem({ item_key: 'col:IST.323:sel', link_source: 'override', excluded: true, component_id: 13 });
    const states = view.linkStates([scoredUnlinked, unscoredUnlinked, notGraded, makeItem()]);
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
  });

  it('never prints NaN', () => {
    expect(format.formatPct(Number.NaN)).toBe('—');
    expect(format.formatPoints(Number.NaN)).toBe('—');
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
  const bundle = { scheme: IST466_SCHEME, components: IST466_COMPONENTS };

  it('turns an engine exception into a sentence instead of a blank screen', () => {
    engine.graded.mockImplementationOnce(() => {
      throw new Error('boom');
    });
    expect(runner.runCourseFigure({ bundle, items: [makeItem()] })).toEqual({
      figure: null,
      error: 'Could not work out the grade: boom',
    });
  });

  it('builds /grades states: loading, a shared load error, then one figure per course', () => {
    const figure = { state: 'nothing_graded' } as const;
    engine.graded.mockReturnValue(figure);
    const empty = { schemes: undefined, items: undefined };

    expect(runner.FIGURE_LOADING).toEqual({ figure: null, error: null });
    expect(runner.courseFigureStates(['IST.466'], empty, null)).toEqual({
      'IST.466': runner.FIGURE_LOADING,
    });
    expect(runner.courseFigureStates(['IST.466'], empty, 'Could not load x')).toEqual({
      'IST.466': { figure: null, error: 'Could not load x' },
    });

    const states = runner.courseFigureStates(
      ['IST.466', 'IST.471'],
      {
        schemes: { 'IST.466': bundle },
        items: [makeItem(), makeItem({ scheme_course_id: 'IST.471', item_key: 'other' })],
      },
      null,
    );
    expect(states['IST.466']).toEqual({ figure, error: null });
    expect(states['IST.471']).toEqual({ figure, error: null });
  });

  it('gives each course its own rows, in order, over a list big enough to notice', () => {
    engine.graded.mockClear();
    engine.graded.mockReturnValue({ state: 'nothing_graded' });
    const ids = ['IST.466', 'IST.471', 'IST.323'];
    // Interleaved, so a grouping that trusted input order would be caught.
    const items = Array.from({ length: 300 }, (_, n) =>
      makeItem({ scheme_course_id: ids[n % 3], item_key: `col:k${n}` }),
    );
    runner.courseFigureStates(ids, { schemes: {}, items }, null);

    const passed = engine.graded.mock.calls.map((call) => call[0] as { items: { key: string }[] });
    expect(passed.map((input) => input.items.length)).toEqual([100, 100, 100]);
    expect(passed[0].items.slice(0, 3).map((i) => i.key)).toEqual(['col:k0', 'col:k3', 'col:k6']);
    expect(passed[1].items.slice(0, 3).map((i) => i.key)).toEqual(['col:k1', 'col:k4', 'col:k7']);
  });

  it('gives a course with no rows of its own an empty input rather than another course’s', () => {
    engine.graded.mockClear();
    engine.graded.mockReturnValue({ state: 'nothing_graded' });
    runner.courseFigureStates(['IST.471'], { schemes: {}, items: [makeItem()] }, null);
    const passed = engine.graded.mock.calls[0]?.[0];
    expect(passed).toMatchObject({ scheme: null, components: [], items: [] });
  });
});

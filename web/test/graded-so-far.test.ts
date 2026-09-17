/**
 * `gradedSoFar()` — the one figure the app shows (Phase 12b, G-1 / G-2).
 *
 * This is the permanent regression suite for Stack's pick. The same fixtures
 * that decided it in `docs/planning/80e_GRADE_METHOD_COMPARISON.md` are run
 * against the production function here, so the arithmetic he chose cannot drift
 * without a test naming the fixture that moved. Every fixture carries a
 * hand-written derivation in its own file and asserts it there; this file only
 * asks whether the shipped function reproduces it.
 *
 * The rest covers what the figure says *around* the number — which parts it
 * covers, which it does not, and which scored columns count toward nothing —
 * because that is the half the strict rule and the muting used to hide.
 */

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { asOfFor, gradedSoFar, type GradedSoFarResult } from '@/lib/graded-so-far';
import type { ModelInput } from '@/lib/grade-model';
import { FIXTURES } from './grade-fixtures/fixtures';
import type { ComparisonFixture } from './grade-fixtures/types';
import { modelInputArb } from './grade-model/arbitraries';
import { assertProperty } from './grade-model/fc-params';
import { deepFreeze } from './grade-model/builders';

function modelOf(fixture: ComparisonFixture): ModelInput {
  return {
    scheme: fixture.input.scheme,
    components: fixture.input.components,
    items: fixture.input.items,
  };
}

function figureFor(id: string): GradedSoFarResult {
  const fixture = FIXTURES.find((entry) => entry.id === id);
  if (fixture === undefined) throw new Error(`no fixture ${id}`);
  return gradedSoFar(modelOf(fixture));
}

const measurable = FIXTURES.filter((fixture) => fixture.truth.state === 'computed');

describe('the figure reproduces every hand-derived grade', () => {
  it('has a fixture set worth calling a regression suite', () => {
    expect(FIXTURES.length).toBeGreaterThanOrEqual(12);
    expect(measurable.length).toBeGreaterThanOrEqual(12);
  });

  it.each(measurable.map((fixture) => [fixture.id, fixture] as const))(
    '%s',
    (_id, fixture) => {
      const figure = gradedSoFar(modelOf(fixture));
      expect(figure.state).toBe('figure');
      if (figure.state !== 'figure') return;
      expect(figure.percent).toBeCloseTo(
        (fixture.truth as { state: 'computed'; pct: number }).pct,
        10,
      );
    },
  );

  it('says nothing has been graded rather than printing a zero (F09)', () => {
    expect(figureFor('F09')).toEqual({ state: 'nothing_graded' });
  });

  it('states no number at all for a qualitatively graded course (F17)', () => {
    expect(figureFor('F17')).toEqual({ state: 'not_computable', reason: 'qualitative_method' });
  });
});

describe('both 10b gates are off', () => {
  it('an unscored hand-graded part no longer hides the course (F12)', () => {
    const figure = figureFor('F12');
    expect(figure.state).toBe('figure');
    if (figure.state !== 'figure') return;
    expect(figure.percent).toBeCloseTo((75 / 90) * 100, 10);
    expect(figure.leftOutParts).toEqual(['Participation']);
    expect(figure.countedParts).toEqual(['Exams', 'Quizzes']);
  });

  it('two unscored attendance parts no longer hide the course either (F13)', () => {
    const figure = figureFor('F13');
    expect(figure.state).toBe('figure');
    if (figure.state !== 'figure') return;
    expect(figure.percent).toBeCloseTo(90, 10);
    expect(figure.leftOutParts).toEqual([
      'Exams',
      'Lecture Attendance',
      'Discussion Section Attendance & Participation',
    ]);
  });

  it('an unsure link keeps its graded score in the figure (F16)', () => {
    const figure = figureFor('F16');
    expect(figure.state).toBe('figure');
    if (figure.state !== 'figure') return;
    // 87 %, not the 85.5 % muting used to give by dropping a graded 135/150.
    expect(figure.percent).toBeCloseTo(87, 10);
    expect(figure.countedParts).toContain('Major Cases');
  });
});

describe('what the figure does not cover', () => {
  it('names a part nobody has graded yet (F06)', () => {
    const figure = figureFor('F06');
    expect(figure.state).toBe('figure');
    if (figure.state !== 'figure') return;
    expect(figure.countedParts).toEqual(['Essays']);
    expect(figure.leftOutParts).toEqual(['Participation', 'Final exam']);
  });

  it('names a scored column no syllabus rule claims (F07)', () => {
    const figure = figureFor('F07');
    expect(figure.state).toBe('figure');
    if (figure.state !== 'figure') return;
    expect(figure.unlinkedColumns).toEqual(['orientationQuiz']);
    expect(figure.percent).toBeCloseTo(85, 10);
  });

  it('leaves extra credit out of both lists — it has no capacity to be in (F15)', () => {
    const figure = figureFor('F15');
    expect(figure.state).toBe('figure');
    if (figure.state !== 'figure') return;
    expect(figure.countedParts).not.toContain('Extra credit lab');
    expect(figure.leftOutParts).not.toContain('Extra credit lab');
    expect(figure.unlinkedColumns).toEqual(['labUnlinked']);
  });

  it('has nothing to report when every part is graded (F10)', () => {
    const figure = figureFor('F10');
    expect(figure.state).toBe('figure');
    if (figure.state !== 'figure') return;
    expect(figure.leftOutParts).toEqual([]);
    expect(figure.unlinkedColumns).toEqual([]);
  });
});

describe('the fraction beside the percentage', () => {
  it('gives points under a points scheme (F15)', () => {
    const figure = figureFor('F15');
    expect(figure.state).toBe('figure');
    if (figure.state !== 'figure') return;
    expect(figure.pointsEarned).toBeCloseTo(53, 10);
    expect(figure.pointsPossible).toBeCloseTo(55, 10);
  });

  it('gives none under a weighted scheme — weight units are not a mark (F01)', () => {
    const figure = figureFor('F01');
    expect(figure.state).toBe('figure');
    if (figure.state !== 'figure') return;
    expect(figure.pointsEarned).toBeNull();
    expect(figure.pointsPossible).toBeNull();
  });
});

describe('as of', () => {
  it('is the newest instant among the graded rows the figure used', () => {
    const fixture = FIXTURES.find((entry) => entry.id === 'F01');
    if (fixture === undefined) throw new Error('no fixture F01');
    const items = fixture.input.items.map((item, index) =>
      index === 0 ? { ...item, seenAt: '2026-09-18T09:00:00.000Z' } : item,
    );
    const figure = gradedSoFar({ ...modelOf(fixture), items });
    expect(figure.state).toBe('figure');
    if (figure.state !== 'figure') return;
    expect(figure.asOf).toBe('2026-09-18T09:00:00.000Z');
  });

  it('ignores an ungraded row, however recently it was seen', () => {
    const fixture = FIXTURES.find((entry) => entry.id === 'F01');
    if (fixture === undefined) throw new Error('no fixture F01');
    const items = fixture.input.items.map((item) =>
      item.score === null ? { ...item, seenAt: '2027-01-01T00:00:00.000Z' } : item,
    );
    expect(asOfFor(items)).not.toBe('2027-01-01T00:00:00.000Z');
  });

  it('is null when nothing carries a timestamp', () => {
    expect(asOfFor([])).toBeNull();
  });
});

describe('determinism', () => {
  it('gives the same answer twice for the same input, and never touches it', () => {
    assertProperty(
      fc.property(modelInputArb({ extraCredit: true, unsure: true }), (input) => {
        const frozen = deepFreeze(structuredClone(input)) as ModelInput;
        const first = gradedSoFar(frozen);
        const second = gradedSoFar(frozen);
        expect(second).toEqual(first);
      }),
    );
  });

  it('never states a percentage that is not a finite number', () => {
    assertProperty(
      fc.property(modelInputArb({ extraCredit: true, unsure: true }), (input) => {
        const figure = gradedSoFar(input);
        if (figure.state !== 'figure') return;
        expect(Number.isFinite(figure.percent)).toBe(true);
        expect(figure.percent).toBeGreaterThanOrEqual(0);
      }),
    );
  });

  it.each(FIXTURES.map((fixture) => [fixture.id, fixture] as const))(
    '%s is not mutated by being read',
    (_id, fixture) => {
      const before = structuredClone(modelOf(fixture));
      gradedSoFar(modelOf(fixture));
      expect(modelOf(fixture)).toEqual(before);
    },
  );
});

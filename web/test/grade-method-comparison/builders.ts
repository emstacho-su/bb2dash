/**
 * Terse builders for the comparison fixtures, so each fixture file states only
 * what it is about. Defaults are the harmless case: a confirmed link, a
 * non-exempt, non-excluded, ungraded 10-point item.
 */

import type {
  FixtureComponent,
  FixtureInput,
  FixtureItem,
  FixtureLetterStep,
  FixtureScheme,
} from './types';

/** A plain percentage scale. Letters play no part in the comparison. */
export const PCT_SCALE: readonly FixtureLetterStep[] = [
  { min: 93, letter: 'A' },
  { min: 90, letter: 'A-' },
  { min: 87, letter: 'B+' },
  { min: 83, letter: 'B' },
  { min: 80, letter: 'B-' },
  { min: 70, letter: 'C' },
  { min: 0, letter: 'F' },
];

/** A scale stated in points, as IST.466's syllabus states it (largest min > 100). */
export function pointsScale(totalPoints: number): readonly FixtureLetterStep[] {
  return PCT_SCALE.map((step) => ({ min: (step.min / 100) * totalPoints, letter: step.letter }));
}

export function scheme(overrides: Partial<FixtureScheme> = {}): FixtureScheme {
  return {
    courseId: 'DUMMY.000',
    method: 'weighted_pct',
    totalPoints: null,
    gradedOutOf: null,
    letterScale: PCT_SCALE,
    ...overrides,
  };
}

export function part(
  overrides: Partial<FixtureComponent> & Pick<FixtureComponent, 'id' | 'name'>,
): FixtureComponent {
  return {
    code: `p${overrides.id}`,
    parentId: null,
    weightPct: null,
    points: null,
    countExpected: null,
    aggregation: 'single',
    dropLowest: 0,
    rankWeights: null,
    normalizeTo: null,
    isExtraCredit: false,
    ...overrides,
  };
}

export function column(
  overrides: Partial<FixtureItem> & Pick<FixtureItem, 'key'>,
): FixtureItem {
  return {
    componentId: null,
    linkSource: 'assignment',
    linkConfidence: 'confirmed',
    excluded: false,
    name: overrides.key,
    possible: 10,
    score: null,
    exempt: false,
    kind: 'item',
    isExtraCredit: false,
    dueAt: null,
    ...overrides,
  };
}

export function input(
  parts: readonly FixtureComponent[],
  columns: readonly FixtureItem[],
  schemeOverrides: Partial<FixtureScheme> = {},
): FixtureInput {
  return { scheme: scheme(schemeOverrides), components: parts, items: columns };
}

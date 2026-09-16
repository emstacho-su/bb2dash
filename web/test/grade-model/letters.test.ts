/**
 * L1 — letters: the highest step with `min ≤ value`, compared unrounded; a
 * scale whose largest `min` exceeds 100 is in points (IST.466).
 */

import { describe, expect, it } from 'vitest';
import { DEFAULT_TARGET_LETTER, letterFor, type LetterStep } from '@/lib/grade-model';
import { PCT_SCALE, scheme } from './builders';

const IST466_SCALE: readonly LetterStep[] = [
  { min: 930, letter: 'A' },
  { min: 900, letter: 'A-' },
  { min: 870, letter: 'B+' },
  { min: 830, letter: 'B' },
  { min: 800, letter: 'B-' },
  { min: 770, letter: 'C+' },
  { min: 730, letter: 'C' },
  { min: 700, letter: 'C-' },
  { min: 600, letter: 'D' },
  { min: 0, letter: 'F' },
];
const IST471_SCALE: readonly LetterStep[] = [
  { min: 93, letter: 'A' },
  { min: 90, letter: 'A-' },
  { min: 71, letter: 'C-' },
];

describe('letterFor', () => {
  it.each([
    { name: 'exactly on a step', pct: 90, scale: PCT_SCALE, letter: 'A-' },
    { name: 'unrounded: 89.9999 is not A-', pct: 89.9999, scale: PCT_SCALE, letter: 'B+' },
    { name: 'above 100 stays at the top step', pct: 104, scale: PCT_SCALE, letter: 'A' },
    { name: 'zero', pct: 0, scale: PCT_SCALE, letter: 'F' },
    { name: 'below every step (IST.471 stops at C-)', pct: 70, scale: IST471_SCALE, letter: null },
    { name: 'an unsorted scale still picks the highest reached step', pct: 91, scale: [...PCT_SCALE].reverse(), letter: 'A-' },
    { name: 'empty scale', pct: 95, scale: [], letter: null },
    { name: 'NaN', pct: Number.NaN, scale: PCT_SCALE, letter: null },
    { name: 'Infinity', pct: Number.POSITIVE_INFINITY, scale: PCT_SCALE, letter: null },
  ])('$name', ({ pct, scale, letter }) => {
    expect(letterFor(pct, scheme({ letterScale: scale }))).toBe(letter);
  });

  it.each([
    { name: '91.2 % of 1020 = 930.24 points is an A', pct: 91.2, letter: 'A' },
    { name: '88.25 % of 1020 = 900.15 points is an A-', pct: 88.25, letter: 'A-' },
    { name: '88.2 % of 1020 = 899.64 points is a B+', pct: 88.2, letter: 'B+' },
  ])('points scale (IST.466): $name', ({ pct, letter }) => {
    const ist466 = scheme({ method: 'points', totalPoints: 1020, gradedOutOf: 1020, letterScale: IST466_SCALE });
    expect(letterFor(pct, ist466)).toBe(letter);
  });

  it('points scale converts against gradedOutOf before totalPoints', () => {
    const outOf500 = scheme({ method: 'points', totalPoints: 1020, gradedOutOf: 500, letterScale: [{ min: 450, letter: 'A' }, { min: 0, letter: 'F' }] });
    expect(letterFor(90, outOf500)).toBe('A');
    expect(letterFor(89, outOf500)).toBe('F');
  });

  it('decision: a points scale with no point total gives no letter', () => {
    expect(letterFor(99, scheme({ method: 'points', letterScale: IST466_SCALE }))).toBeNull();
  });

  it('defaults the target letter to A-', () => {
    expect(DEFAULT_TARGET_LETTER).toBe('A-');
  });
});

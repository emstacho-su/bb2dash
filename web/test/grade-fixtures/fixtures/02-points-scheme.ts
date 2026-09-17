/**
 * F02 — a points syllabus: 500 points, no weights. DUMMY DATA.
 *
 * Labs are worth 200 points, exams 300. One lab and one exam are graded.
 *
 * HAND DERIVATION
 *   Graded points earned    = 90 + 120                            = 210
 *   Graded points available = 100 + 150                           = 250
 *   Grade so far            = 210 ÷ 250                           = 0.84
 *                                                                 = 84 %
 *
 * Nothing separates the three here: with no weights and no averaging, every
 * reasonable method is the same division. That is the point of the fixture —
 * a method that misses this one is broken outright.
 */

import { column, input, part } from '../builders';
import type { ComparisonFixture } from '../types';

export const fixture: ComparisonFixture = {
  id: 'F02',
  title: 'Points syllabus, half the work graded',
  probes: 'a points scheme, where weights play no part',
  input: input(
    [
      part({ id: 1, name: 'Labs', points: 200, aggregation: 'sum' }),
      part({ id: 2, name: 'Exams', points: 300, aggregation: 'sum' }),
    ],
    [
      column({ key: 'lab1', componentId: 1, possible: 100, score: 90 }),
      column({ key: 'lab2', componentId: 1, possible: 100, score: null }),
      column({ key: 'exam1', componentId: 2, possible: 150, score: 120 }),
      column({ key: 'exam2', componentId: 2, possible: 150, score: null }),
    ],
    { courseId: 'DUMMY.200', method: 'points', totalPoints: 500, gradedOutOf: 500 },
  ),
  truth: { state: 'computed', pct: 84 },
  derivation: () => ((90 + 120) / (100 + 150)) * 100,
  derivationText: '(90 + 120) points earned over (100 + 150) points graded = 210/250 = 84 %.',
};

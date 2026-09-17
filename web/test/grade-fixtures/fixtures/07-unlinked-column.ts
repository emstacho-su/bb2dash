/**
 * F07 — a scored column no syllabus rule claims. DUMMY DATA, shaped like
 * IST.323's unlinked "Lab #1" column.
 *
 * The orientation quiz is in the gradebook and scored 25/50, but the syllabus
 * gives it no share of the grade.
 *
 * HAND DERIVATION
 *   Homework:  90 ÷ 100                                            = 0.90
 *   Midterm:   80 ÷ 100                                            = 0.80
 *   Orientation quiz: counts toward nothing, so it moves nothing.
 *   Graded weight = 50 + 50                                        = 100
 *   Earned weight = 50 × 0.90 + 50 × 0.80 = 45 + 40                = 85
 *   Grade so far  = 85 ÷ 100                                       = 0.85
 *                                                                  = 85 %
 *
 * A method that sweeps up every scored column reads 195/250 = 78 % — seven
 * points lost to a column the syllabus never mentions.
 */

import { column, input, part } from '../builders';
import type { ComparisonFixture } from '../types';

export const fixture: ComparisonFixture = {
  id: 'F07',
  title: 'An unlinked scored column',
  probes: 'a gradebook column with no syllabus rule behind it',
  input: input(
    [
      part({ id: 1, name: 'Homework', weightPct: 50, aggregation: 'average', countExpected: 2 }),
      part({ id: 2, name: 'Midterm', weightPct: 50, aggregation: 'single' }),
    ],
    [
      column({ key: 'hw1', componentId: 1, possible: 100, score: 90 }),
      column({ key: 'hw2', componentId: 1, possible: 100, score: null }),
      column({ key: 'midterm', componentId: 2, possible: 100, score: 80 }),
      column({
        key: 'orientationQuiz',
        componentId: null,
        linkSource: null,
        linkConfidence: null,
        possible: 50,
        score: 25,
      }),
    ],
    { courseId: 'DUMMY.700' },
  ),
  truth: { state: 'computed', pct: 85 },
  derivation: () => ((50 * (90 / 100) + 50 * (80 / 100)) / (50 + 50)) * 100,
  derivationText:
    'Homework 0.90 at weight 50, Midterm 0.80 at weight 50; the unlinked quiz counts toward nothing. (45 + 40) / 100 = 85 %.',
};

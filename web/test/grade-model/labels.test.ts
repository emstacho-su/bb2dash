/**
 * The frozen wording (`labels.ts`, Contract §Labels): exact strings for every
 * enum value and template, so a screen can only render what the brief froze.
 * Also the one guard in the aggregation dispatch.
 */

import { describe, expect, it } from 'vitest';
import type { DeltaReason, NotComputableReason } from '@/lib/grade-model';
import { aggregateFor } from '@/lib/grade-model/aggregations';
import {
  AGREES_TEXT,
  DELTA_REASON_TEXT,
  LINK_LABEL,
  LINK_NOT_GRADED,
  LINK_UNSURE,
  MODEL_LABEL,
  PLACEHOLDER_GROUP,
  PROJECTION_LABEL,
  RESET_LABEL,
  WHAT_IF_LABEL,
  WHAT_IF_NOTE,
  differsText,
  mutedText,
  notComputableText,
  solverNeededText,
  solverNoRemainingText,
  solverSecuredText,
  solverUnreachableText,
} from '@/lib/grade-model/labels';

describe('grade-model labels', () => {
  it('carries the fixed strings', () => {
    expect([MODEL_LABEL, WHAT_IF_NOTE, AGREES_TEXT, WHAT_IF_LABEL, PLACEHOLDER_GROUP, LINK_LABEL, LINK_NOT_GRADED, LINK_UNSURE, RESET_LABEL]).toEqual([
      'Our model', 'includes what-if values', "Agrees with Blackboard's number", 'what if', 'Not in Blackboard yet',
      'Counts toward…', 'Not graded', 'unsure', 'Reset scenario',
    ]);
    expect(PROJECTION_LABEL).toEqual({ graded_so_far: 'graded so far', zeros_on_rest: 'zeros on the rest', best_case: 'best case' });
  });

  it.each<[NotComputableReason, readonly string[], string]>([
    ['qualitative_method', [], 'Model not computed — this course is graded qualitatively'],
    ['manual_unscored', ['Class Participation'], 'Model not computed — Class Participation not scored yet'],
    ['manual_unscored', ['Lecture Attendance', 'Discussion Section Attendance & Participation'], 'Model not computed — Lecture Attendance and Discussion Section Attendance & Participation not scored yet'],
    ['manual_unscored', ['A', 'B', 'C'], 'Model not computed — A, B and C not scored yet'],
    ['no_scheme', [], 'Model not computed — no grading rules recorded'],
    ['unknown_method', [], 'Model not computed — a grading rule is unknown'],
    ['unknown_aggregation', [], 'Model not computed — a grading rule is unknown'],
    ['nothing_graded', [], 'Model not computed yet — nothing that counts has been graded'],
  ])('notComputableText(%s, %j)', (reason, names, text) => {
    expect(notComputableText(reason, names)).toBe(text);
  });

  it('renders the templates', () => {
    expect(differsText('17', 'points')).toBe("Differs from Blackboard's number by 17 points:");
    expect(solverNeededText({ letter: 'A-', min: '90%', avg: '93.2%', n: 4, share: '35%' })).toBe(
      'For A- (≥ 90%) you need 93.2% average on the 4 remaining items (35% of the grade left).',
    );
    expect(solverUnreachableText('A', '92.3%', 'A-')).toBe('A is out of reach — the most you can finish with is 92.3% (A-).');
    expect(solverSecuredText('F', '44.3%', 'F')).toBe('F is secured — even zeros on the rest leave 44.3% (F).');
    expect(solverNoRemainingText('86.9%', 'B')).toBe('Nothing is left to grade — the course stands at 86.9% (B).');
  });

  describe('mutedText — one sentence per part left out (R3-3)', () => {
    const PART = 'Two Major Case Studies (Synchrony, SU IT)';

    it.each<[string, readonly string[], string]>([
      ['one', ['Synchrony Major Case #1'], `Left out: ${PART} — confirm the unsure link on Synchrony Major Case #1`],
      ['two', ['SU IT - Major Case #2', 'Synchrony Major Case #1'], `Left out: ${PART} — confirm the unsure links on SU IT - Major Case #2 and Synchrony Major Case #1`],
      ['three', ['A', 'B', 'C'], `Left out: ${PART} — confirm the unsure links on A, B and C`],
    ])('items with a Blackboard column only: %s', (_count, confirmable, text) => {
      expect(mutedText({ part: PART, confirmable, notInBlackboard: 0 })).toBe(text);
    });

    it('placeholders only', () => {
      expect(mutedText({ part: 'AI Team Assignment', confirmable: [], notInBlackboard: 1 })).toBe(
        "Left out: AI Team Assignment — its link is unsure and it isn't in Blackboard yet",
      );
      expect(mutedText({ part: 'Reflections', confirmable: [], notInBlackboard: 3 })).toBe(
        "Left out: Reflections — its link is unsure and it isn't in Blackboard yet",
      );
    });

    it('both: the columns to confirm, then how many more are not in Blackboard yet', () => {
      expect(mutedText({ part: 'Reflections', confirmable: ['Reflection 1'], notInBlackboard: 2 })).toBe(
        'Left out: Reflections — confirm the unsure link on Reflection 1; 2 more not in Blackboard yet',
      );
      expect(mutedText({ part: 'Reflections', confirmable: ['Reflection 1', 'Reflection 2'], notInBlackboard: 1 })).toBe(
        'Left out: Reflections — confirm the unsure links on Reflection 1 and Reflection 2; 1 more not in Blackboard yet',
      );
    });

    it('never prints an empty list: a part with no unsure item keeps the round-2 sentence', () => {
      expect(mutedText({ part: PART, confirmable: [], notInBlackboard: 0 })).toBe(
        `Left out: ${PART} — the link to the syllabus is unsure`,
      );
    });
  });

  it('has a sentence for every delta reason', () => {
    const reasons: readonly DeltaReason[] = [
      'bb_running_total', 'ungraded_counted_as_zero', 'drop_lowest_pending', 'extra_credit', 'muted_component', 'unlinked_column', 'unexplained',
    ];
    expect(Object.keys(DELTA_REASON_TEXT).sort()).toEqual([...reasons].sort());
    expect(DELTA_REASON_TEXT.unexplained).toBe('no known reason');
  });
});

describe('aggregation dispatch', () => {
  it('refuses an unknown aggregation (the order of checks stops it first)', () => {
    expect(() => aggregateFor('unknown')).toThrow('check computability first');
  });
});

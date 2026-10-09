/**
 * `attemptText` (Phase 22, task 8 and task 34; D-5, entry `copy-captions`).
 *
 * Blackboard's last-attempt status arrives as a code in capitals with
 * underscores ("NEEDS_GRADING"), and both screens printed it after "last
 * attempt:". `submissionLabel` now carries the words beside the code:
 * `attemptText`, lower case with spaces for the three codes Blackboard sends,
 * the code itself for any other.
 *
 * Two promises that keep the old tests valid and unedited:
 *   - `attemptStatus` is still Blackboard's own word, never the gloss;
 *   - `attemptText` is absent exactly when `attemptStatus` is null. The key is
 *     left off, never set to null or undefined: `queries.grades.test.ts` compares
 *     the whole object for a row with no status with `toEqual`, which passes over
 *     a missing key and not over a null one.
 */

import { describe, expect, it } from 'vitest';
import { submissionLabel } from '@/lib/queries.grades';

describe('submissionLabel().attemptText', () => {
  it.each([
    ['NEEDS_GRADING', 'needs grading'],
    ['IN_PROGRESS', 'in progress'],
    ['COMPLETED', 'completed'],
  ])('puts %s into words: "%s"', (code, words) => {
    // COMPLETED is dropped beside a settled column, so the column is one it is not dropped beside.
    const label = submissionLabel('UNOPENED', code);
    expect(label.attemptStatus).toBe(code);
    expect(label.attemptText).toBe(words);
  });

  it('reads an unknown code as itself', () => {
    const label = submissionLabel('SUBMITTED', 'NEEDS_ATTENTION');
    expect(label.attemptStatus).toBe('NEEDS_ATTENTION');
    expect(label.attemptText).toBe('NEEDS_ATTENTION');
  });

  it('keeps attemptStatus as Blackboard sent it, trimmed and not glossed', () => {
    expect(submissionLabel('SUBMITTED', '  NEEDS_GRADING ').attemptStatus).toBe('NEEDS_GRADING');
  });

  it('is absent exactly when attemptStatus is null: the key is left off, never null', () => {
    const repeated = submissionLabel('GRADED', 'GRADED');
    expect(repeated.attemptStatus).toBeNull();
    expect('attemptText' in repeated).toBe(false);

    const none = submissionLabel('SUBMITTED', null);
    expect(none.attemptStatus).toBeNull();
    expect('attemptText' in none).toBe(false);

    const settled = submissionLabel('GRADED', 'COMPLETED');
    expect(settled.attemptStatus).toBeNull();
    expect('attemptText' in settled).toBe(false);
  });

  it('gives a row with no status exactly the three keys queries.grades.test.ts compares, and no fourth', () => {
    const label = submissionLabel(null);
    expect(label).toEqual({ status: null, text: '—', attemptStatus: null });
    expect(Object.keys(label).sort()).toEqual(['attemptStatus', 'status', 'text']);
  });

  it('is present for every row that has an attemptStatus', () => {
    for (const code of ['NEEDS_GRADING', 'IN_PROGRESS', 'COMPLETED', 'SOMETHING_ELSE']) {
      const label = submissionLabel('UNOPENED', code);
      expect(label.attemptStatus).not.toBeNull();
      expect(typeof label.attemptText).toBe('string');
    }
  });
});

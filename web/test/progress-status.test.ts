import { describe, expect, it } from 'vitest';

import {
  AUTO_GRADED_FROM,
  OFFERED_STATUSES,
  RETIRED_STATUS_FOLD,
  STATUS_LABEL,
  foldStatus,
  statusLabel,
  type ProgressStatus,
} from '@/lib/progress-status';

const ALL_STATUSES: readonly ProgressStatus[] = [
  'not_started',
  'planned',
  'in_progress',
  'submitted',
  'graded',
  'missed',
  'excused',
  'waived',
  'not_applicable',
];

describe('progress-status', () => {
  it('offers exactly the six statuses, in menu order', () => {
    expect(OFFERED_STATUSES).toEqual([
      'not_started',
      'in_progress',
      'submitted',
      'graded',
      'excused',
      'missed',
    ]);
  });

  it('labels the six in Stack’s words', () => {
    expect(OFFERED_STATUSES.map(statusLabel)).toEqual([
      'not opened',
      'in progress',
      'submitted',
      'graded',
      'excused',
      'DNF',
    ]);
  });

  it('folds every retired value into an offered one', () => {
    expect(foldStatus('planned')).toBe('not_started');
    expect(foldStatus('waived')).toBe('excused');
    expect(foldStatus('not_applicable')).toBe('excused');
    for (const target of Object.values(RETIRED_STATUS_FOLD)) {
      expect(OFFERED_STATUSES).toContain(target);
    }
  });

  it('leaves an offered value unchanged', () => {
    for (const status of OFFERED_STATUSES) {
      expect(foldStatus(status)).toBe(status);
    }
  });

  it('labels the whole enum, and every value is offered or retired', () => {
    for (const status of ALL_STATUSES) {
      expect(STATUS_LABEL[status]).toBe(statusLabel(status));
      const offered = (OFFERED_STATUSES as readonly ProgressStatus[]).includes(status);
      expect(offered || status in RETIRED_STATUS_FOLD).toBe(true);
    }
  });

  it('never auto-advances from graded, excused or DNF', () => {
    expect(AUTO_GRADED_FROM).not.toContain('graded');
    expect(AUTO_GRADED_FROM).not.toContain('excused');
    expect(AUTO_GRADED_FROM).not.toContain('missed');
    expect(AUTO_GRADED_FROM).not.toContain('waived');
    expect(AUTO_GRADED_FROM).not.toContain('not_applicable');
  });
});

/**
 * The due line, shared by the `?item=` popout, the full-details page and the
 * planner's popover (`assignment-detail-format.ts`).
 *
 * The walk found `IST.323/lab-1-performing-a-ransomware-attack` reading "Due
 * not recorded · 11:59 PM": the row carries `due_date = null` and
 * `due_at = 2026-09-24 03:59+00`, and the date half was read off `due_date`
 * alone. 38 of the 44 timed assignments are shaped that way.
 *
 * So: the date falls back to the New York calendar day of `due_at`, and
 * "not recorded" is reserved for a row that records neither. Both halves are
 * read in the term's zone through `Intl`, so the date and the clock can never
 * disagree and both survive a DST change — the UTC date and the New York date
 * are different days for every one of these 11:59 PM deadlines.
 */

import { describe, expect, it } from 'vitest';
import {
  NOT_RECORDED,
  dueDateText,
  formatClock,
  formatDate,
  formatDue,
} from '@/components/popout/assignment-detail-format';

/** The row from the walk, and the shape 38 of 44 timed assignments share. */
const RANSOMWARE_DUE_AT = '2026-09-24T03:59:00Z'; // Wed Sep 23, 11:59 PM New York

describe('dueDateText — the date half', () => {
  it('uses the recorded due date when there is one', () => {
    expect(dueDateText('2026-09-14', null)).toBe('Mon · Sep 14');
  });

  it('prefers the recorded date over the instant', () => {
    expect(dueDateText('2026-09-14', RANSOMWARE_DUE_AT)).toBe('Mon · Sep 14');
  });

  it('falls back to the New York day of the instant — the walk finding', () => {
    expect(dueDateText(null, RANSOMWARE_DUE_AT)).toBe('Wed · Sep 23');
    expect(dueDateText(null, RANSOMWARE_DUE_AT)).not.toBe(NOT_RECORDED);
  });

  it('reads the day in the term zone, not off the UTC string', () => {
    // The instant is Sep *24* in UTC. Slicing the ISO string would say so.
    expect(dueDateText(null, RANSOMWARE_DUE_AT)).not.toContain('24');
  });

  it('is "not recorded" only when the row records neither', () => {
    expect(dueDateText(null, null)).toBe(NOT_RECORDED);
    expect(dueDateText(undefined, undefined)).toBe(NOT_RECORDED);
    expect(dueDateText(null, 'not a timestamp')).toBe(NOT_RECORDED);
  });
});

describe('dueDateText — across a DST change', () => {
  it('is the evening before, on the night the clocks go back', () => {
    // 03:30 UTC on Nov 1 is still EDT (UTC-4): 11:30 PM on Oct 31.
    expect(dueDateText(null, '2026-11-01T03:30:00Z')).toBe('Sat · Oct 31');
    expect(formatClock('2026-11-01T03:30:00Z')).toBe('11:30 PM');
  });

  it('is the same day once the clocks have gone back', () => {
    // 06:30 UTC is EST (UTC-5): 1:30 AM on Nov 1.
    expect(dueDateText(null, '2026-11-01T06:30:00Z')).toBe('Sun · Nov 1');
    expect(formatClock('2026-11-01T06:30:00Z')).toBe('1:30 AM');
  });

  it('holds on the morning the clocks go forward', () => {
    // 07:30 UTC on Mar 8 is EDT (UTC-4): 3:30 AM, the hour after the gap.
    expect(dueDateText(null, '2026-03-08T07:30:00Z')).toBe('Sun · Mar 8');
    expect(formatClock('2026-03-08T07:30:00Z')).toBe('3:30 AM');
  });
});

describe('formatClock — the term zone, not the reader’s', () => {
  it('reads the clock in New York', () => {
    expect(formatClock(RANSOMWARE_DUE_AT)).toBe('11:59 PM');
    expect(formatClock('2026-09-17T18:00:00Z')).toBe('2:00 PM');
  });

  it('is empty for nothing and for rubbish', () => {
    expect(formatClock(null)).toBe('');
    expect(formatClock(undefined)).toBe('');
    expect(formatClock('not a timestamp')).toBe('');
  });
});

describe('formatDue — the popover’s one line', () => {
  it('names the day and the time of an instant-only row', () => {
    expect(formatDue(null, RANSOMWARE_DUE_AT, null)).toBe('Wed, Sep 23 · 11:59 PM');
  });

  it('keeps the recorded date when there is one', () => {
    expect(formatDue('2026-09-17', '2026-09-17T18:00:00Z', null)).toBe('Thu, Sep 17 · 2:00 PM');
  });

  it('falls back to the recorded rule when there is no instant', () => {
    expect(formatDue('2026-09-17', null, 'end of the week')).toBe('Thu, Sep 17 · end of the week');
  });

  it('is the date alone when nothing says when', () => {
    expect(formatDue('2026-09-17', null, null)).toBe('Thu, Sep 17');
  });

  it('is "not recorded" for a row that records nothing at all', () => {
    expect(formatDue(null, null, null)).toBe(NOT_RECORDED);
  });
});

describe('formatDate — unchanged, the stacked spelling', () => {
  it('still separates the day and the date with an interpunct', () => {
    expect(formatDate('2026-09-23')).toBe('Wed · Sep 23');
    expect(formatDate(null)).toBe(NOT_RECORDED);
  });
});

/**
 * I-2 / P-inbox-2 — what pressing an Inbox button actually does.
 *
 * The controls said "Accept Blackboard" / "Keep mine" / "Save" / "Dismiss" and
 * nothing more, so the only way to know what one would do to THIS row was to
 * read `apply_resolutions()`. And most rows in the queue are ones nothing
 * applies at all — a course-map seed, a staff-name disagreement, an ambiguous
 * gradebook column — which looked identical to the ones that do.
 *
 * Everything here is checked against migration 042. Its rule: kind in
 * (conflict, stack_must_confirm, missing), `entity = 'assignment'`, a `ref`
 * that is an assignment id, and a `field` in {due_at, due_date,
 * points_possible, bb_url}. "Keep mine" is the exception — it writes
 * `confidence` alone, so it needs no field.
 *
 * Dates read in America/New_York, because that is the calendar the deadlines
 * are on. The fixtures use a UTC instant that falls on a different DAY in New
 * York, so a test passing by accident in UTC would be visible.
 */

import { describe, expect, it } from 'vitest';
import {
  APPLIED_FIELDS,
  INBOX_APPLY_HELP,
  RECORDED_ONLY,
  fieldPhrase,
  fieldValueText,
  describeDetails,
  isAssignmentRef,
  keyPhrase,
  outcomeApplies,
  outcomeText,
  type AttentionItem,
  type AttentionKind,
} from '@/lib/queries.sync';

function makeItem(overrides: Partial<AttentionItem> = {}): AttentionItem {
  return {
    id: 1,
    raised_at: '2026-09-16T14:00:00Z',
    raised_by: 47,
    kind: 'conflict' as AttentionKind,
    course_id: 'ECN.304',
    entity: 'assignment',
    ref: 'ECN.304/quiz-01',
    field: 'due_at',
    from_value: '2026-09-24T03:59:00Z',
    to_value: '2026-09-25T03:59:00Z',
    question: 'Blackboard moved this quiz. Which date stands?',
    suggested: null,
    state: 'open',
    resolved_at: null,
    resolution: null,
    resolution_note: null,
    applied_at: null,
    ...overrides,
  };
}

describe('isAssignmentRef — a real id, not a prefixed pseudo-ref', () => {
  it('accepts an assignment id', () => {
    expect(isAssignmentRef('ECN.304/quiz-01')).toBe(true);
    expect(isAssignmentRef('IST.466/ethics-team-2-presentation')).toBe(true);
  });

  it('rejects the pseudo-refs the stages raise', () => {
    // apply_resolutions() looks `ref` up in assignments.id, so none of these
    // ever match and the answer stays unapplied however it is worded.
    expect(isAssignmentRef('column:_3569973_1')).toBe(false);
    expect(isAssignmentRef('staff:_34252_1')).toBe(false);
    expect(isAssignmentRef('course_field:academic_advisor')).toBe(false);
    expect(isAssignmentRef('map_gap:GEO.103')).toBe(false);
    expect(isAssignmentRef('87')).toBe(false);
    expect(isAssignmentRef(null)).toBe(false);
  });
});

describe('fieldValueText — New York, and never a made-up clock', () => {
  it('prints a timestamp on the day it falls on in New York', () => {
    // 2026-09-25T03:59Z is 11:59 PM on the 24th in New York. Printing the 25th
    // would move a deadline by a day.
    expect(fieldValueText('due_at', '2026-09-25T03:59:00Z')).toBe('Thu, Sep 24, 11:59 PM');
  });

  it('prints a bare date as a day, with no time invented', () => {
    const text = fieldValueText('due_date', '2026-09-24');
    expect(text).toBe('Thu, Sep 24');
    expect(text).not.toMatch(/AM|PM|:/);
  });

  it('prints a number as itself', () => {
    expect(fieldValueText('points_possible', 25)).toBe('25');
    expect(fieldValueText('points_possible', '25')).toBe('25');
  });

  it('prints a URL as itself rather than as a date', () => {
    const url = 'https://blackboard.syracuse.edu/x/1';
    expect(fieldValueText('bb_url', url)).toBe(url);
  });

  it('says nothing recorded rather than inventing a value', () => {
    expect(fieldValueText('due_at', null)).toBe('—');
    expect(fieldValueText('due_at', '')).toBe('—');
  });

  it('prints an unparseable timestamp as itself, not as "Invalid Date"', () => {
    expect(fieldValueText('due_at', 'sometime next week')).toBe('sometime next week');
  });

  /* -----------------------------------------------------------------------
   * F-3 (P-inbox-3), found on the PM's browser walk.
   *
   * An out-of-term conflict printed "Tue, Sep 20, 11:06 AM" for a date that is
   * really in 2022. The year IS the finding on those rows — it is the whole
   * reason the transform flagged them — and leaving it off makes a four-year-old
   * value read as this term's.
   * -------------------------------------------------------------------- */

  const NOW = new Date('2026-09-17T12:00:00Z');

  it('prints the year when it is not the current one', () => {
    expect(fieldValueText('due_at', '2022-09-21T03:06:00Z', NOW)).toBe(
      'Tue, Sep 20, 2022, 11:06 PM',
    );
    expect(fieldValueText('due_date', '2022-09-20', NOW)).toBe('Tue, Sep 20, 2022');
  });

  it('leaves the year off when it is the current one', () => {
    expect(fieldValueText('due_at', '2026-09-25T03:59:00Z', NOW)).toBe('Thu, Sep 24, 11:59 PM');
    expect(fieldValueText('due_date', '2026-09-24', NOW)).toBe('Thu, Sep 24');
  });

  it('prints a future year too — "different" is not "older"', () => {
    expect(fieldValueText('due_date', '2027-01-04', NOW)).toBe('Mon, Jan 4, 2027');
  });

  it('decides the year in New York, not in UTC', () => {
    // 2027-01-01T04:00Z is still 11:00 PM on 2026-12-31 in New York, so this is
    // the CURRENT year and carries no year label.
    expect(fieldValueText('due_at', '2027-01-01T04:00:00Z', NOW)).toBe('Thu, Dec 31, 11:00 PM');
  });

  it('compares against the reader’s year, not a hard-coded one', () => {
    const later = new Date('2027-03-01T12:00:00Z');
    expect(fieldValueText('due_date', '2026-09-24', later)).toBe('Thu, Sep 24, 2026');
    expect(fieldValueText('due_date', '2027-09-24', later)).toBe('Fri, Sep 24');
  });
});

describe('outcomeApplies — mirrors apply_resolutions()', () => {
  it('applies to the four writable fields on an assignment', () => {
    for (const field of APPLIED_FIELDS) {
      expect(outcomeApplies(makeItem({ field }), 'accept_blackboard'), field).toBe(true);
    }
  });

  it('does not apply to a field apply_resolutions() cannot write', () => {
    expect(outcomeApplies(makeItem({ field: 'bb_column_id' }), 'accept_blackboard')).toBe(false);
    expect(outcomeApplies(makeItem({ field: null }), 'accept_blackboard')).toBe(false);
  });

  it('does not apply to anything that is not an assignment', () => {
    for (const entity of ['course', 'course_staff', 'bb_file', 'reading', null]) {
      expect(outcomeApplies(makeItem({ entity }), 'accept_blackboard'), String(entity)).toBe(
        false,
      );
    }
  });

  it('does not apply to an ambiguous gradebook column', () => {
    const column = makeItem({ ref: 'column:_3569973_1', field: 'bb_column_id' });
    expect(outcomeApplies(column, 'accept_blackboard')).toBe(false);
    expect(outcomeApplies(column, 'keep_mine')).toBe(false);
  });

  it('lets "Keep mine" apply without a writable field — it writes confidence', () => {
    expect(outcomeApplies(makeItem({ field: 'bb_column_id' }), 'keep_mine')).toBe(true);
    expect(outcomeApplies(makeItem({ field: null }), 'keep_mine')).toBe(true);
  });

  it('never applies a dismissal — dismissing is the answer', () => {
    expect(outcomeApplies(makeItem({ kind: 'data_gap' }), 'dismiss')).toBe(false);
    expect(outcomeApplies(makeItem(), 'dismiss')).toBe(false);
  });
});

describe('outcomeText — a sentence per kind and field', () => {
  const NOW = new Date('2026-09-17T12:00:00Z');

  it('names the field and the date "Accept Blackboard" would write', () => {
    expect(outcomeText(makeItem(), 'accept_blackboard', NOW)).toBe(
      'Sets this assignment’s due date to Thu, Sep 24, 11:59 PM.',
    );
  });

  it('carries the year into the sentence on an out-of-term row (F-3)', () => {
    const stale = makeItem({
      from_value: '2022-09-21T03:06:00Z',
      to_value: '2022-09-28T03:06:00Z',
    });
    expect(outcomeText(stale, 'accept_blackboard', NOW)).toBe(
      'Sets this assignment’s due date to Tue, Sep 27, 2022, 11:06 PM.',
    );
    expect(outcomeText(stale, 'keep_mine', NOW)).toContain('Tue, Sep 20, 2022, 11:06 PM');
  });

  it('names the value "Keep mine" would keep, and why it stops the asking', () => {
    expect(outcomeText(makeItem(), 'keep_mine', NOW)).toBe(
      'Keeps this assignment’s due date at Wed, Sep 23, 11:59 PM and marks it confirmed, ' +
        'so the next sync stops asking.',
    );
  });

  it('says what a points conflict changes, in points', () => {
    const points = makeItem({ field: 'points_possible', from_value: 10, to_value: 25 });
    expect(outcomeText(points, 'accept_blackboard', NOW)).toBe(
      'Sets this assignment’s points possible to 25.',
    );
  });

  it('names the destination for a typed answer, not a value it cannot know', () => {
    const missing = makeItem({ kind: 'missing', field: 'due_at', to_value: null });
    expect(outcomeText(missing, 'save')).toBe(
      'Saves what you type as this assignment’s due date.',
    );
  });

  it('says it clears the field when Blackboard shows nothing', () => {
    expect(outcomeText(makeItem({ to_value: null }), 'accept_blackboard', NOW)).toBe(
      'Clears this assignment’s due date, because that is what Blackboard shows.',
    );
  });

  it('falls back honestly when we hold no value of our own to keep', () => {
    expect(outcomeText(makeItem({ from_value: null }), 'keep_mine', NOW)).toBe(
      'Keeps what bb2dash already has and marks it confirmed, so the next sync stops asking.',
    );
  });

  /* — the "recorded only" half, Stack's answer 16 — */

  it('says recorded only on a course-map seed', () => {
    const seed = makeItem({
      kind: 'stack_must_confirm',
      entity: 'course',
      ref: 'course_field:academic_advisor',
      field: null,
    });
    expect(outcomeText(seed, 'save')).toBe(RECORDED_ONLY);
  });

  it('says recorded only on a staff-name conflict', () => {
    const staff = makeItem({ entity: 'course_staff', ref: 'staff:_34252_1', field: 'name' });
    expect(outcomeText(staff, 'accept_blackboard')).toBe(RECORDED_ONLY);
    expect(outcomeText(staff, 'keep_mine')).toBe(RECORDED_ONLY);
  });

  it('says recorded only on a grading_scheme "missing"', () => {
    const scheme = makeItem({
      kind: 'missing',
      entity: 'course',
      ref: 'GEO.103.recitation',
      field: 'grading_scheme',
    });
    expect(outcomeText(scheme, 'save')).toBe(RECORDED_ONLY);
  });

  it('says recorded only, and that the row closes, on a dismissal', () => {
    for (const kind of ['deadline', 'data_gap'] as AttentionKind[]) {
      const text = outcomeText(makeItem({ kind, entity: 'bb_file', ref: '117' }), 'dismiss');
      expect(text).toContain(RECORDED_ONLY);
      expect(text).toContain('stops asking');
    }
  });

  it('says recorded only on a dismissal even for a row that could otherwise apply', () => {
    expect(outcomeText(makeItem({ kind: 'deadline' }), 'dismiss')).toContain(RECORDED_ONLY);
  });

  it('never leaves a control without a sentence', () => {
    const rows = [
      makeItem(),
      makeItem({ entity: 'course', ref: 'course_field:x', field: null }),
      makeItem({ field: 'bb_column_id', ref: 'column:_1_1' }),
      makeItem({ kind: 'data_gap', entity: 'reading', ref: '87', field: 'for_date' }),
    ];
    for (const row of rows) {
      for (const action of ['accept_blackboard', 'keep_mine', 'save', 'dismiss'] as const) {
        expect(outcomeText(row, action).length).toBeGreaterThan(20);
        expect(outcomeText(row, action)).toMatch(/\.$/);
      }
    }
  });
});

describe('fieldPhrase / INBOX_APPLY_HELP', () => {
  it('names the four writable columns in words', () => {
    expect(fieldPhrase('due_at')).toBe('due date');
    expect(fieldPhrase('due_date')).toBe('due date');
    expect(fieldPhrase('points_possible')).toBe('points possible');
    expect(fieldPhrase('bb_url')).toBe('Blackboard link');
  });

  it('spells an unknown column rather than hiding it', () => {
    expect(fieldPhrase('bb_column_id')).toBe('bb column id');
    expect(fieldPhrase(null)).toBe('value');
  });

  it('states the rule once, on the screen', () => {
    expect(INBOX_APPLY_HELP).toContain('due date');
    expect(INBOX_APPLY_HELP).toContain('recorded');
  });
});

/* ---------------------------------------------------------------------------
 * I-3 / P-inbox-3 — describing a jsonb payload without printing jsonb
 * ------------------------------------------------------------------------ */

describe('describeDetails — no braces, no quotes, nothing dropped', () => {
  it('turns an object into labelled lines, keys as words', () => {
    expect(
      describeDetails({
        due: '2026-09-14T16:50:00+00:00',
        possible: 0,
        column_id: '_3613591_1',
        source: 'stage_assignments',
      }),
    ).toEqual([
      { label: 'due', text: 'Mon, Sep 14, 12:50 PM' },
      { label: 'possible', text: '0' },
      { label: 'column id', text: '_3613591_1' },
      { label: 'source', text: 'stage_assignments' },
    ]);
  });

  it('unrolls one level of nesting onto the line', () => {
    expect(
      describeDetails({
        gap: { what: 'Meeting days Mon vs Mon/Wed', owner: 'stack' },
        version: 3,
      }),
    ).toEqual([
      { label: 'gap', text: 'what Meeting days Mon vs Mon/Wed · owner stack' },
      { label: 'version', text: '3' },
    ]);
  });

  it('says "none" for a null rather than printing null', () => {
    expect(describeDetails({ field: { name: 'weekly_hours', value: null } })).toEqual([
      { label: 'field', text: 'name weekly_hours · value none' },
    ]);
  });

  it('reads booleans as yes and no', () => {
    expect(describeDetails({ out_of_term: true, stale: false })).toEqual([
      { label: 'out of term', text: 'yes' },
      { label: 'stale', text: 'no' },
    ]);
  });

  it('numbers the entries of an array', () => {
    expect(describeDetails(['Mon', 'Wed'])).toEqual([
      { label: '1', text: 'Mon' },
      { label: '2', text: 'Wed' },
    ]);
  });

  it('gives a plain value no label it does not have', () => {
    expect(describeDetails('IST.323 Quiz 2')).toEqual([{ label: '', text: 'IST.323 Quiz 2' }]);
    expect(describeDetails(25, 'points_possible')).toEqual([{ label: '', text: '25' }]);
  });

  it('describes nothing at all as nothing, not as an empty row', () => {
    expect(describeDetails(null)).toEqual([]);
    expect(describeDetails(undefined)).toEqual([]);
    expect(describeDetails('')).toEqual([]);
  });

  it('stops rather than unrolling something unreadable', () => {
    const deep = { a: { b: { c: { d: 1 } } } };
    expect(describeDetails(deep)[0].text).toContain('…');
  });

  it('never emits a brace or a quote from any real payload shape', () => {
    const payloads: unknown[] = [
      { source: 'stage_assignments', column_id: '_3562491_1', out_of_term: true },
      { from: 'course_map', field: { name: 'sitn_date', note: 'derivable', value: null } },
      { gap: { what: 'OIA textbook: keep or opt out', owner: 'stack' }, from: 'course_map' },
      { source: 'stage_gaps', source_url: 'https://blackboard.syracuse.edu/x' },
      ['a', { b: 1 }],
    ];
    for (const payload of payloads) {
      const text = describeDetails(payload)
        .map((line) => `${line.label} ${line.text}`)
        .join(' ');
      expect(text, JSON.stringify(payload)).not.toMatch(/[{}"]/);
    }
  });
});

describe('keyPhrase', () => {
  it('spells a snake_case key as words', () => {
    expect(keyPhrase('column_id')).toBe('column id');
    expect(keyPhrase('out_of_term')).toBe('out of term');
  });

  it('keeps the four writable columns on their nicer phrasing', () => {
    expect(keyPhrase('points_possible')).toBe('points possible');
    expect(keyPhrase('bb_url')).toBe('Blackboard link');
  });
});

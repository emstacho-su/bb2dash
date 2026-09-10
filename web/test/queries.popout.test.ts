/**
 * The popout contract layer: what `?item=` is allowed to mean, and what the
 * planner block is allowed to write.
 *
 * Both are boundaries — the first reads the URL, the second reads a form — so
 * both are tested for the bad input, not just the good.
 */

import { describe, expect, it } from 'vitest';
import {
  EST_MINUTES_MAX,
  NOTES_MAX_LENGTH,
  itemHref,
  itemParam,
  itemQuery,
  parseItemParam,
  validatePlannerPatch,
} from '@/lib/queries.popout';

describe('parseItemParam', () => {
  it('reads an assignment id, colons in the id and all', () => {
    expect(parseItemParam('assignment:IST.323/lab-1')).toEqual({
      kind: 'assignment',
      id: 'IST.323/lab-1',
    });
    expect(parseItemParam('assignment:GEO.103/quiz:2')).toEqual({
      kind: 'assignment',
      id: 'GEO.103/quiz:2',
    });
  });

  it('reads a numeric session id', () => {
    expect(parseItemParam('session:12')).toEqual({ kind: 'session', id: 12 });
  });

  it('opens nothing for a value it does not recognise', () => {
    expect(parseItemParam(null)).toBeNull();
    expect(parseItemParam(undefined)).toBeNull();
    expect(parseItemParam('')).toBeNull();
    expect(parseItemParam('assignment')).toBeNull();
    expect(parseItemParam('assignment:')).toBeNull();
    expect(parseItemParam('assignment:   ')).toBeNull();
    expect(parseItemParam(':12')).toBeNull();
    expect(parseItemParam('reading:4')).toBeNull();
    expect(parseItemParam('course:IST.323')).toBeNull();
  });

  it('refuses a session id that is not a positive whole number', () => {
    expect(parseItemParam('session:abc')).toBeNull();
    expect(parseItemParam('session:0')).toBeNull();
    expect(parseItemParam('session:-3')).toBeNull();
    expect(parseItemParam('session:1.5')).toBeNull();
  });
});

describe('itemParam / itemQuery / itemHref', () => {
  it('round-trips through parseItemParam', () => {
    const target = { kind: 'assignment', id: 'IST.323/lab-1' } as const;
    expect(parseItemParam(itemParam(target))).toEqual(target);
  });

  it('encodes the value for a URL', () => {
    expect(itemQuery({ kind: 'assignment', id: 'IST.323/lab-1' })).toBe(
      '?item=assignment%3AIST.323%2Flab-1',
    );
    expect(itemHref('/materials', { kind: 'session', id: 12 })).toBe(
      '/materials?item=session%3A12',
    );
  });

  it('survives the round trip after decoding', () => {
    const query = itemQuery({ kind: 'assignment', id: 'IST.323/lab-1' });
    const value = new URLSearchParams(query).get('item');
    expect(parseItemParam(value)).toEqual({ kind: 'assignment', id: 'IST.323/lab-1' });
  });
});

describe('validatePlannerPatch', () => {
  it('passes a clean patch through', () => {
    expect(
      validatePlannerPatch({
        status: 'in_progress',
        priority: 'high',
        planned_start: '2026-09-12',
        est_minutes: 90,
        notes: 'read the lab manual first',
      }),
    ).toEqual({
      status: 'in_progress',
      priority: 'high',
      planned_start: '2026-09-12',
      est_minutes: 90,
      notes: 'read the lab manual first',
    });
  });

  it('only sends the keys the caller actually set', () => {
    expect(validatePlannerPatch({ status: 'planned' })).toEqual({ status: 'planned' });
    expect(Object.keys(validatePlannerPatch({}))).toHaveLength(0);
  });

  it('treats an emptied field as a clear, not as a bad value', () => {
    expect(validatePlannerPatch({ planned_start: '' })).toEqual({ planned_start: null });
    expect(validatePlannerPatch({ planned_finish: null })).toEqual({ planned_finish: null });
    expect(validatePlannerPatch({ est_minutes: null })).toEqual({ est_minutes: null });
    expect(validatePlannerPatch({ notes: '   ' })).toEqual({ notes: null });
  });

  it('trims notes and caps their length', () => {
    expect(validatePlannerPatch({ notes: '  keep this  ' })).toEqual({ notes: 'keep this' });
    expect(() => validatePlannerPatch({ notes: 'x'.repeat(NOTES_MAX_LENGTH + 1) })).toThrow(
      /limited to/,
    );
  });

  it('rejects a date that is not a date', () => {
    expect(() => validatePlannerPatch({ planned_start: '12/09/2026' })).toThrow(/YYYY-MM-DD/);
    expect(() => validatePlannerPatch({ planned_finish: 'tomorrow' })).toThrow(/YYYY-MM-DD/);
  });

  it('rejects an estimate that is negative, fractional or absurd', () => {
    expect(() => validatePlannerPatch({ est_minutes: -1 })).toThrow(/whole number/);
    expect(() => validatePlannerPatch({ est_minutes: 12.5 })).toThrow(/whole number/);
    expect(() => validatePlannerPatch({ est_minutes: EST_MINUTES_MAX + 1 })).toThrow(
      /whole number/,
    );
  });

  it('accepts the boundary values', () => {
    expect(validatePlannerPatch({ est_minutes: 0 })).toEqual({ est_minutes: 0 });
    expect(validatePlannerPatch({ est_minutes: EST_MINUTES_MAX })).toEqual({
      est_minutes: EST_MINUTES_MAX,
    });
  });
});

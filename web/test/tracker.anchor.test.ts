/**
 * Tracker paging maths (R-03).
 *
 * `today` is injected into every call rather than read from the clock, so these
 * are ordinary pure-function tests — no fake timers, no DOM. The reference term
 * date is Thursday 2026-09-10; with the 56-day horizon and 14 visible days that
 * gives exactly four pages: 09-10, 09-24, 10-08, 10-22, ending 2026-11-04.
 */

import { describe, expect, it } from 'vitest';
import {
  buildTrackerWindow,
  clampAnchor,
  columnCount,
  daysBetween,
  formatDay,
  formatDayRange,
  horizonLastDay,
  isValidIsoDate,
  isoDate,
  maxAnchor,
  pageAnchor,
  shiftIso,
  DEFAULT_HORIZON_DAYS,
  DEFAULT_VISIBLE_DAYS,
} from '@/components/tracker/anchor';

const TODAY = '2026-09-10'; // Thursday
const base = {
  today: TODAY,
  horizonDays: DEFAULT_HORIZON_DAYS,
  visibleDays: DEFAULT_VISIBLE_DAYS,
};

describe('isoDate / shiftIso / daysBetween', () => {
  it('renders a local date without a timezone shift', () => {
    expect(isoDate(new Date(2026, 8, 10))).toBe('2026-09-10');
    expect(isoDate(new Date(2026, 0, 1))).toBe('2026-01-01');
  });

  it('shifts across a month and a year boundary', () => {
    expect(shiftIso('2026-09-10', 55)).toBe('2026-11-04');
    expect(shiftIso('2026-01-01', -1)).toBe('2025-12-31');
    expect(shiftIso('2026-09-10', 0)).toBe('2026-09-10');
  });

  it('counts whole days in both directions', () => {
    expect(daysBetween('2026-09-10', '2026-09-24')).toBe(14);
    expect(daysBetween('2026-09-24', '2026-09-10')).toBe(-14);
    expect(daysBetween('2026-09-10', '2026-09-10')).toBe(0);
  });
});

describe('isValidIsoDate', () => {
  it('accepts a real calendar date', () => {
    expect(isValidIsoDate('2026-09-10')).toBe(true);
  });

  it('rejects malformed strings, nulls and impossible days', () => {
    expect(isValidIsoDate(null)).toBe(false);
    expect(isValidIsoDate(undefined)).toBe(false);
    expect(isValidIsoDate('')).toBe(false);
    expect(isValidIsoDate('2026-9-10')).toBe(false);
    expect(isValidIsoDate('yesterday')).toBe(false);
    expect(isValidIsoDate('2026-02-31')).toBe(false);
    expect(isValidIsoDate('2026-13-01')).toBe(false);
  });
});

describe('columnCount / horizonLastDay / maxAnchor — the 56 / 14 shape', () => {
  it('draws 14 columns out of a 56-day horizon', () => {
    expect(columnCount(56, 14)).toBe(14);
  });

  it('never draws more columns than the horizon holds', () => {
    expect(columnCount(7, 14)).toBe(7);
    expect(columnCount(0, 14)).toBe(1);
  });

  it('ends the horizon on day 56, counting today as day 1', () => {
    expect(horizonLastDay(TODAY, 56)).toBe('2026-11-04');
  });

  it('stops the anchor where the last full window starts', () => {
    expect(maxAnchor(TODAY, 56, 14)).toBe('2026-10-22');
    expect(daysBetween(TODAY, maxAnchor(TODAY, 56, 14))).toBe(42);
  });

  it('pins the anchor to today when the horizon is one window or less', () => {
    expect(maxAnchor(TODAY, 14, 14)).toBe(TODAY);
    expect(maxAnchor(TODAY, 7, 14)).toBe(TODAY);
  });
});

describe('clampAnchor', () => {
  it('defaults to today when the anchor is missing or unusable', () => {
    expect(clampAnchor({ ...base, anchor: undefined })).toBe(TODAY);
    expect(clampAnchor({ ...base, anchor: null })).toBe(TODAY);
    expect(clampAnchor({ ...base, anchor: 'not-a-date' })).toBe(TODAY);
    expect(clampAnchor({ ...base, anchor: '2026-02-31' })).toBe(TODAY);
  });

  it('never looks backwards past today', () => {
    expect(clampAnchor({ ...base, anchor: '2026-09-01' })).toBe(TODAY);
  });

  it('never scrolls past the last full window', () => {
    expect(clampAnchor({ ...base, anchor: '2026-12-25' })).toBe('2026-10-22');
  });

  it('passes an in-range anchor through untouched', () => {
    expect(clampAnchor({ ...base, anchor: '2026-09-24' })).toBe('2026-09-24');
  });
});

describe('pageAnchor — ◂ ▸', () => {
  it('steps forward one visible window', () => {
    expect(pageAnchor(base, 1)).toBe('2026-09-24');
    expect(pageAnchor({ ...base, anchor: '2026-09-24' }, 1)).toBe('2026-10-08');
  });

  it('steps back one visible window', () => {
    expect(pageAnchor({ ...base, anchor: '2026-10-08' }, -1)).toBe('2026-09-24');
  });

  it('gives exactly four pages over 56 days at 14 a page', () => {
    const pages: string[] = [TODAY];
    let anchor = TODAY;
    for (let i = 0; i < 5; i++) {
      const next = pageAnchor({ ...base, anchor }, 1);
      if (next === anchor) break;
      pages.push(next);
      anchor = next;
    }
    expect(pages).toEqual(['2026-09-10', '2026-09-24', '2026-10-08', '2026-10-22']);
  });

  it('settles on the ends rather than running off them', () => {
    expect(pageAnchor({ ...base, anchor: '2026-10-22' }, 1)).toBe('2026-10-22');
    expect(pageAnchor({ ...base, anchor: TODAY }, -1)).toBe(TODAY);
  });

  it('honours a caller-supplied window size', () => {
    expect(pageAnchor({ ...base, visibleDays: 7 }, 1)).toBe('2026-09-17');
  });
});

describe('buildTrackerWindow', () => {
  it('lays out 14 consecutive days from the anchor', () => {
    const view = buildTrackerWindow(base);
    expect(view.days).toHaveLength(14);
    expect(view.firstIso).toBe('2026-09-10');
    expect(view.lastIso).toBe('2026-09-23');
    expect(view.days.map((d) => d.iso)).toEqual([
      '2026-09-10', '2026-09-11', '2026-09-12', '2026-09-13', '2026-09-14', '2026-09-15',
      '2026-09-16', '2026-09-17', '2026-09-18', '2026-09-19', '2026-09-20', '2026-09-21',
      '2026-09-22', '2026-09-23',
    ]);
  });

  it('marks today on exactly one column, and none once paged forward', () => {
    const first = buildTrackerWindow(base);
    expect(first.days.filter((d) => d.isToday).map((d) => d.iso)).toEqual([TODAY]);
    expect(first.days[0].dowLabel).toBe('Today');
    expect(first.isAtStart).toBe(true);

    const second = buildTrackerWindow({ ...base, anchor: '2026-09-24' });
    expect(second.days.some((d) => d.isToday)).toBe(false);
    expect(second.days[0].dowLabel).toBe('Thu');
    expect(second.isAtStart).toBe(false);
  });

  it('rules every Monday and nothing else', () => {
    const view = buildTrackerWindow(base);
    expect(view.days.filter((d) => d.isMonday).map((d) => d.iso)).toEqual([
      '2026-09-14',
      '2026-09-21',
    ]);
  });

  it('flags Saturdays and Sundays as weekend', () => {
    const view = buildTrackerWindow(base);
    expect(view.days.filter((d) => d.isWeekend).map((d) => d.iso)).toEqual([
      '2026-09-12', '2026-09-13', '2026-09-19', '2026-09-20',
    ]);
  });

  it('labels the month on the first column only, when no 1st is in range', () => {
    const view = buildTrackerWindow(base);
    expect(view.days.filter((d) => d.monthLabel).map((d) => [d.iso, d.monthLabel])).toEqual([
      ['2026-09-10', 'Sep'],
    ]);
  });

  it('labels the month again on the 1st of a month', () => {
    const view = buildTrackerWindow({ ...base, anchor: '2026-09-24' });
    expect(view.days.filter((d) => d.monthLabel).map((d) => [d.iso, d.monthLabel])).toEqual([
      ['2026-09-24', 'Sep'],
      ['2026-10-01', 'Oct'],
    ]);
  });

  it('reports which arrows are live at each end of the horizon', () => {
    const first = buildTrackerWindow(base);
    expect(first.canPageBack).toBe(false);
    expect(first.canPageForward).toBe(true);

    const middle = buildTrackerWindow({ ...base, anchor: '2026-09-24' });
    expect(middle.canPageBack).toBe(true);
    expect(middle.canPageForward).toBe(true);

    const last = buildTrackerWindow({ ...base, anchor: '2026-10-22' });
    expect(last.canPageBack).toBe(true);
    expect(last.canPageForward).toBe(false);
    expect(last.lastIso).toBe('2026-11-04');
    expect(last.lastIso).toBe(last.horizonLastIso);
  });

  it('clamps a window wider than its horizon', () => {
    const view = buildTrackerWindow({ ...base, horizonDays: 7 });
    expect(view.days).toHaveLength(7);
    expect(view.canPageForward).toBe(false);
  });

  it('takes a caller-supplied window size (a course page could show a week)', () => {
    const view = buildTrackerWindow({ ...base, visibleDays: 7 });
    expect(view.days).toHaveLength(7);
    expect(view.lastIso).toBe('2026-09-16');
  });
});

describe('formatDayRange / formatDay', () => {
  it('names both ends of the window', () => {
    expect(formatDayRange('2026-09-10', '2026-09-23')).toBe('Sep 10 – Sep 23');
    expect(formatDayRange('2026-10-22', '2026-11-04')).toBe('Oct 22 – Nov 4');
  });

  it('names one day short', () => {
    expect(formatDay('2026-09-24')).toBe('Sep 24');
  });
});

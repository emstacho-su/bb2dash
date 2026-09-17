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
  buildTrackerStrip,
  buildTrackerWindow,
  clampAnchor,
  clampStripAnchor,
  columnCount,
  daysBetween,
  formatDay,
  formatDayRange,
  horizonLastDay,
  isValidIsoDate,
  isoDate,
  maxAnchor,
  maxStripAnchor,
  pageAnchor,
  pageStripAnchor,
  rangeLength,
  shiftIso,
  stripWindow,
  trackerRange,
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

/* ---------------------------------------------------------------------------
 * H-2 / P-home-2 — the scrolling strip (Stack's answer 11)
 * ------------------------------------------------------------------------ */

const rangeBase = {
  today: TODAY,
  horizonDays: DEFAULT_HORIZON_DAYS,
  visibleDays: DEFAULT_VISIBLE_DAYS,
};

describe('trackerRange — the span the strip scrolls over', () => {
  it('runs from the first dated item to the last', () => {
    expect(
      trackerRange({ ...rangeBase, dueDates: ['2026-09-14', '2026-10-23', '2026-09-25'] }),
    ).toEqual({ firstIso: TODAY, lastIso: '2026-10-23' });
  });

  it('reaches back before today when work was due earlier this week', () => {
    const range = trackerRange({ ...rangeBase, dueDates: ['2026-09-07', '2026-09-30'] });
    expect(range.firstIso).toBe('2026-09-07');
    expect(range.lastIso).toBe('2026-09-30');
  });

  it('always includes today, even when every item is in the past', () => {
    const range = trackerRange({ ...rangeBase, dueDates: ['2026-09-01'] });
    expect(range.firstIso).toBe('2026-09-01');
    expect(daysBetween(range.firstIso, range.lastIso) + 1).toBeGreaterThanOrEqual(14);
    expect(range.lastIso >= TODAY).toBe(true);
  });

  it('draws one screenful when nothing is dated yet', () => {
    expect(trackerRange({ ...rangeBase, dueDates: [] })).toEqual({
      firstIso: TODAY,
      lastIso: '2026-09-23',
    });
  });

  it('ignores nulls and malformed dates rather than guessing at them', () => {
    expect(
      trackerRange({ ...rangeBase, dueDates: [null, undefined, '', 'soon', '2026-02-31'] }),
    ).toEqual({ firstIso: TODAY, lastIso: '2026-09-23' });
  });

  it('never runs past what the caller actually fetched', () => {
    // Fetched 14 days; an item dated well beyond that would otherwise put 39
    // empty columns on screen that only look like "nothing due".
    const range = trackerRange({ ...rangeBase, horizonDays: 14, dueDates: ['2026-10-23'] });
    expect(range.lastIso).toBe('2026-09-23');
  });

  it('shrinks to the horizon when the horizon is shorter than a screen', () => {
    // Same rule `columnCount` has always applied: a caller that fetched five
    // days gets five columns, and they fill the width rather than scrolling.
    const range = trackerRange({ ...rangeBase, horizonDays: 5, dueDates: [] });
    expect(rangeLength(range)).toBe(5);
    expect(range).toEqual({ firstIso: TODAY, lastIso: '2026-09-14' });
  });
});

describe('maxStripAnchor / clampStripAnchor', () => {
  const range = { firstIso: TODAY, lastIso: '2026-10-23' }; // 44 days

  it('stops where the last full screen starts', () => {
    expect(rangeLength(range)).toBe(44);
    expect(maxStripAnchor(range, 14)).toBe('2026-10-10');
  });

  it('pins the anchor to the start when the range is one screen or less', () => {
    expect(maxStripAnchor({ firstIso: TODAY, lastIso: '2026-09-23' }, 14)).toBe(TODAY);
  });

  it('opens on today when the anchor is missing or unusable', () => {
    for (const anchor of [undefined, null, 'not-a-date', '2026-02-31']) {
      expect(clampStripAnchor({ range, today: TODAY, visibleDays: 14, anchor })).toBe(TODAY);
    }
  });

  it('clamps to either end of the range', () => {
    const spec = { range, today: TODAY, visibleDays: 14 };
    expect(clampStripAnchor({ ...spec, anchor: '2026-01-01' })).toBe(TODAY);
    expect(clampStripAnchor({ ...spec, anchor: '2026-12-25' })).toBe('2026-10-10');
    expect(clampStripAnchor({ ...spec, anchor: '2026-09-24' })).toBe('2026-09-24');
  });

  it('opens at the range start when today is before it', () => {
    const later = { firstIso: '2026-10-01', lastIso: '2026-11-30' };
    expect(clampStripAnchor({ range: later, today: TODAY, visibleDays: 14 })).toBe('2026-10-01');
  });
});

describe('pageStripAnchor — ◂ ▸ still move 14 days', () => {
  const range = { firstIso: TODAY, lastIso: '2026-10-23' };
  const spec = { range, today: TODAY, visibleDays: DEFAULT_VISIBLE_DAYS };

  it('steps a whole screen each way', () => {
    expect(pageStripAnchor(spec, 1)).toBe('2026-09-24');
    expect(pageStripAnchor({ ...spec, anchor: '2026-09-24' }, 1)).toBe('2026-10-08');
    expect(pageStripAnchor({ ...spec, anchor: '2026-10-08' }, -1)).toBe('2026-09-24');
  });

  it('settles on the ends rather than running off them', () => {
    expect(pageStripAnchor({ ...spec, anchor: '2026-10-08' }, 1)).toBe('2026-10-10');
    expect(pageStripAnchor({ ...spec, anchor: '2026-10-10' }, 1)).toBe('2026-10-10');
    expect(pageStripAnchor({ ...spec, anchor: TODAY }, -1)).toBe(TODAY);
  });
});

describe('stripWindow — what the arrows report and the label says', () => {
  const range = { firstIso: TODAY, lastIso: '2026-10-23' };
  const at = (iso: string) => stripWindow(range, iso, DEFAULT_VISIBLE_DAYS, TODAY);

  it('names the 14 columns on screen', () => {
    expect(at(TODAY)).toMatchObject({
      firstIso: TODAY,
      lastIso: '2026-09-23',
      index: 0,
      columnsInView: 14,
      isAtStart: true,
    });
  });

  it('counts the columns to scroll past', () => {
    expect(at('2026-09-24').index).toBe(14);
    expect(at('2026-10-08').index).toBe(28);
  });

  it('reports which arrows are live at each end', () => {
    expect(at(TODAY)).toMatchObject({ canPageBack: false, canPageForward: true });
    expect(at('2026-09-24')).toMatchObject({ canPageBack: true, canPageForward: true });
    expect(at('2026-10-10')).toMatchObject({ canPageBack: true, canPageForward: false });
  });

  it('stops the window at the end of the range, not past it', () => {
    expect(at('2026-10-10').lastIso).toBe('2026-10-23');
  });

  it('is not "at start" once it has been paged off today', () => {
    expect(at('2026-09-24').isAtStart).toBe(false);
  });
});

describe('buildTrackerStrip', () => {
  const range = { firstIso: TODAY, lastIso: '2026-10-23' };
  const strip = buildTrackerStrip({ range, today: TODAY, visibleDays: DEFAULT_VISIBLE_DAYS });

  it('lays out one column per day of the whole range, not just the screen', () => {
    expect(strip.days).toHaveLength(44);
    expect(strip.days[0].iso).toBe(TODAY);
    expect(strip.days[43].iso).toBe('2026-10-23');
    expect(strip.columnsInView).toBe(14);
  });

  it('opens anchored on today', () => {
    expect(strip.anchor).toBe(TODAY);
  });

  it('marks today on exactly one column across the whole strip', () => {
    expect(strip.days.filter((d) => d.isToday).map((d) => d.iso)).toEqual([TODAY]);
    expect(strip.days[0].dowLabel).toBe('Today');
  });

  it('keeps the Monday rule and the month labels over the whole range', () => {
    expect(strip.days.filter((d) => d.isMonday)).toHaveLength(6);
    expect(strip.days.filter((d) => d.monthLabel).map((d) => [d.iso, d.monthLabel])).toEqual([
      ['2026-09-10', 'Sep'],
      ['2026-10-01', 'Oct'],
    ]);
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

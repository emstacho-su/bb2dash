'use client';

/**
 * Upcoming-work effort tracker (R-02 / R-03) — extracted from Today.tsx.
 *
 * One column per day: bar height = Σ effort for that day, one segment per item,
 * segment tint = assignment-type hue. Monday carries a rule, the 1st of a month
 * carries its label, clicking a day fills the detail panel beneath, and the
 * legend names the five glyphs.
 *
 * H-2 (P-home-2, Stack's answer 11): the strip renders EVERY day from the first
 * dated item to the last and scrolls across them, opening anchored on today.
 * `visibleDays` is now how many columns fit on screen, not how many exist, and
 * `◂ ▸` page by whole screens as they always did. Free scrolling moves the view
 * without moving the anchor; the arrows carry on from wherever the view is.
 *
 * The same component serves Home (every course's items) and a course Stream
 * (that course's shells only) — the caller filters `items` and supplies the
 * mutation, so nothing here talks to Supabase.
 *
 * Anchor/selection are controlled-or-uncontrolled: pass `anchor` +
 * `onAnchorChange` (or `selectedDay` + `onSelectDay`) to drive them from a
 * parent, or omit both and the component keeps its own state. All the date
 * maths lives in ./anchor.ts, which has no React in it.
 *
 * An assignment row in the detail panel links to `?item=assignment:<id>`, which
 * the (app) layout turns into the popout — a relative query href, so the tracker
 * never has to read the router.
 *
 * Honesty: every figure is Σ over the rows the caller passed. A day with no
 * rows says so; nothing is invented. An empty `items` means "nothing is due"
 * only once the caller's fetch has answered, so the caller passes `isPending`
 * and `error` and the counts step aside until then.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import tokens from '@/styles/tokens.module.css';
import {
  courseCodeFromId,
  effortLabel,
  toNumber,
  type WorkCategory,
  type WorkItem,
} from '@/lib/queries.today';
import type { ProgressStatus } from '@/lib/queries';
import { itemQuery } from '@/lib/queries.popout';
import { StatusSelect } from './StatusSelect';
import {
  DEFAULT_HORIZON_DAYS,
  DEFAULT_VISIBLE_DAYS,
  buildTrackerStrip,
  daysBetween,
  formatDay,
  formatDayRange,
  isValidIsoDate,
  pageStripAnchor,
  parseDateOnly,
  shiftIso,
  stripWindow,
  todayIso,
  trackerRange,
  DOW_LABELS,
  MONTH_LABELS,
  type TrackerDay,
} from './anchor';
import styles from './UpcomingTracker.module.css';

/* ---------------------------------------------------------------------------
 * Props — frozen by the Phase 8 brief (§Tracker component).
 * ------------------------------------------------------------------------ */

export interface UpcomingTrackerProps {
  /** `v_work_items` rows, already course-filtered by the caller. */
  items: WorkItem[];
  /**
   * Days forward the caller fetched. The strip never runs past it: a column
   * beyond the fetch would render empty and read as "nothing due".
   */
  horizonDays?: number;
  /** Day columns on screen at once. The strip scrolls; this is the viewport. */
  visibleDays?: number;
  /** 'YYYY-MM-DD' first visible day. Defaults to today; clamped to the range. */
  anchor?: string;
  onAnchorChange?: (iso: string) => void;
  /** 'YYYY-MM-DD' day whose detail panel is open. Defaults to today. */
  selectedDay?: string;
  onSelectDay?: (iso: string) => void;
  onStatusChange: (item: WorkItem, status: ProgressStatus) => void;
  pendingItemId?: string | null;
  /** 'Upcoming work' | 'Upcoming work · IST 323'. */
  title?: string;
  /**
   * The caller's fetch has not answered yet. Additive to the frozen props (the
   * brief allows optional additions) because `items = []` is indistinguishable
   * from "nothing is due" here, and the tracker was reading out
   * "0 items · 0h · next 14 days" and "Nothing due" over a request in flight.
   *
   * Pass TanStack's `isLoading` (`isPending && isFetching`), not `isPending`
   * alone: a disabled query is pending for ever.
   */
  isPending?: boolean;
  /** The caller's fetch failed. An error is never an empty day. */
  error?: Error | null;
}

/* ---------------------------------------------------------------------------
 * Constants
 * ------------------------------------------------------------------------ */

/** Pixel height of the bar area; segments scale into it. */
const BAR_AREA_PX = 120;

const SEG_CLASS: Record<WorkCategory, string> = {
  reading: styles.segReading,
  assignment: styles.segAssignment,
  quiz: styles.segQuiz,
  project: styles.segProject,
  exam: styles.segExam,
};
const GLYPH_CLASS: Record<WorkCategory, string> = {
  reading: tokens.glyphReading,
  assignment: tokens.glyphAssignment,
  quiz: tokens.glyphQuiz,
  project: tokens.glyphProject,
  exam: tokens.glyphExam,
};
const SUBMISSION_LABEL: Record<string, string> = {
  in_class: 'in class',
  blackboard: 'Blackboard',
  email: 'email',
};

const LEGEND: { category: WorkCategory; glyph: string; label: string }[] = [
  { category: 'reading', glyph: 'R', label: 'reading' },
  { category: 'assignment', glyph: 'A', label: 'assignment' },
  { category: 'quiz', glyph: 'Q', label: 'quiz' },
  { category: 'project', glyph: 'P', label: 'project' },
  { category: 'exam', glyph: 'E', label: 'exam' },
];

/* ---------------------------------------------------------------------------
 * Row-level display helpers (pure)
 * ------------------------------------------------------------------------ */

/** The detail-panel "time" cell: a clock when we have one, else the rule/mode. */
export function itemTimeText(item: WorkItem): string {
  if (item.due_at) {
    return new Date(item.due_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }
  if (item.due_rule) return item.due_rule;
  if (item.submission && SUBMISSION_LABEL[item.submission]) return SUBMISSION_LABEL[item.submission];
  return '—';
}

/** "start Sun 9/28", "day of", or '' when the row has no suggested start. */
export function suggestedStartText(item: WorkItem): string {
  if (!item.suggested_start) return '';
  if (item.due_on && item.suggested_start === item.due_on) return 'day of';
  const start = parseDateOnly(item.suggested_start);
  return `start ${DOW_LABELS[start.getDay()]} ${start.getMonth() + 1}/${start.getDate()}`;
}

/** Bucket the caller's rows by due date so each column is one map lookup. */
function groupByDueDate(items: WorkItem[]): Map<string, WorkItem[]> {
  const byDay = new Map<string, WorkItem[]>();
  for (const item of items) {
    if (!item.due_on) continue;
    const list = byDay.get(item.due_on);
    if (list) list.push(item);
    else byDay.set(item.due_on, [item]);
  }
  return byDay;
}

function sumEffort(items: WorkItem[]): number {
  return items.reduce((total, item) => total + toNumber(item.effort), 0);
}

/* ---------------------------------------------------------------------------
 * Component
 * ------------------------------------------------------------------------ */

export function UpcomingTracker({
  items,
  horizonDays = DEFAULT_HORIZON_DAYS,
  visibleDays = DEFAULT_VISIBLE_DAYS,
  anchor,
  onAnchorChange,
  selectedDay,
  onSelectDay,
  onStatusChange,
  pendingItemId = null,
  title = 'Upcoming work',
  isPending = false,
  error = null,
}: UpcomingTrackerProps) {
  const today = todayIso();
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  /** True while the effect below is moving the scroller, so its own scroll
   *  events are not mistaken for the reader dragging the strip. */
  const programmatic = useRef(false);

  /**
   * Anchor and selection are self-managed as `null` = "follow today", not as a
   * date seeded once. A tab left open across midnight re-renders (the query
   * layer refetches on window focus) with a new `today`, and a seeded date
   * would hold yesterday: no column highlighted, and the panel going on
   * describing yesterday's work under yesterday's heading. Null defers to
   * whatever today now is, and the moment Stack pages or clicks, his choice is
   * stored and stands.
   */
  const [ownAnchor, setOwnAnchor] = useState<string | null>(null);
  const [ownSelected, setOwnSelected] = useState<string | null>(null);
  /** Where the reader has scrolled to, when that is not the anchor. */
  const [scrolledFirst, setScrolledFirst] = useState<string | null>(null);

  const range = useMemo(
    () =>
      trackerRange({
        dueDates: items.map((item) => item.due_on),
        today,
        horizonDays,
        visibleDays,
      }),
    [items, today, horizonDays, visibleDays],
  );

  const strip = useMemo(
    () => buildTrackerStrip({ range, today, visibleDays, anchor: anchor ?? ownAnchor }),
    [range, today, visibleDays, anchor, ownAnchor],
  );
  const byDay = useMemo(() => groupByDueDate(items), [items]);

  // What is actually on screen: the anchor, unless the reader has scrolled away
  // from it. Both are clamped into the range by `stripWindow`.
  const view = stripWindow(range, scrolledFirst ?? strip.anchor, visibleDays, today);
  const columnsInView = strip.columnsInView;

  /**
   * Scroll the anchor's column to the left edge whenever the anchor moves.
   * `clientWidth` is 0 under jsdom and before layout, which is why the guard is
   * a width check rather than a mount flag: no width, nothing to scroll, and
   * the render is still correct.
   */
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    setScrolledFirst(null);
    const columnWidth = el.clientWidth / columnsInView;
    if (!Number.isFinite(columnWidth) || columnWidth <= 0) return;
    programmatic.current = true;
    el.scrollLeft = daysBetween(range.firstIso, strip.anchor) * columnWidth;
    const timer = window.setTimeout(() => {
      programmatic.current = false;
    }, 0);
    return () => window.clearTimeout(timer);
  }, [strip.anchor, range.firstIso, columnsInView]);

  /** Free scrolling moves the view and the arrows — never the saved anchor. */
  function handleScroll(event: React.UIEvent<HTMLDivElement>) {
    if (programmatic.current) return;
    const el = event.currentTarget;
    const columnWidth = el.clientWidth / columnsInView;
    if (!Number.isFinite(columnWidth) || columnWidth <= 0) return;
    const index = Math.round(el.scrollLeft / columnWidth);
    setScrolledFirst(shiftIso(range.firstIso, index));
  }

  /**
   * The selection is *derived*, never merely stored: clamped into the range so
   * a stale value (a controlled `selectedDay` the parent has not caught up on,
   * or a day that fell off the end when the fetch narrowed) can never leave the
   * panel describing a column that is not there.
   */
  const requestedSelected = selectedDay ?? ownSelected ?? today;
  const activeSelected =
    isValidIsoDate(requestedSelected) &&
    requestedSelected >= range.firstIso &&
    requestedSelected <= range.lastIso
      ? requestedSelected
      : view.firstIso;

  function moveAnchor(pages: number) {
    const next = pageStripAnchor(
      { range, today, visibleDays, anchor: view.firstIso },
      pages,
    );
    if (next === view.firstIso) return;
    setScrolledFirst(null);
    if (anchor === undefined) setOwnAnchor(next);
    onAnchorChange?.(next);

    // Keep the detail panel describing something on screen: if the selection
    // falls outside the *new* window, move it to that window's first day.
    const nextLastIso = shiftIso(next, columnsInView - 1);
    if (activeSelected < next || activeSelected > nextLastIso) selectDay(next);
  }

  function selectDay(iso: string) {
    if (selectedDay === undefined) setOwnSelected(iso);
    onSelectDay?.(iso);
  }

  const columns = strip.days.map((day) => {
    const dayItems = byDay.get(day.iso) ?? [];
    return { day, items: dayItems, effort: sumEffort(dayItems) };
  });

  // Bars scale to the tallest day on the whole strip, so scrolling never
  // re-scales the bars under the reader's eye.
  const maxEffort = Math.max(1, ...columns.map((c) => c.effort));
  const scale = BAR_AREA_PX / maxEffort;

  // The two counters describe what is on screen, not the whole strip.
  const inView = columns.filter(
    (c) => c.day.iso >= view.firstIso && c.day.iso <= view.lastIso,
  );
  const windowItems = inView.reduce((total, c) => total + c.items.length, 0);
  const windowEffort = inView.reduce((total, c) => total + c.effort, 0);

  const selectedItems = byDay.get(activeSelected) ?? [];
  const selectedDate = parseDateOnly(activeSelected);

  // "next 14 days" only while the window starts today; otherwise name the start.
  const rangeHint = view.isAtStart
    ? `next ${columnsInView} days`
    : `${columnsInView} days from ${formatDay(view.firstIso)}`;

  /**
   * Nothing counted from `items` is a fact until the caller's fetch has
   * answered. While it has not, the two sub-lines say so and the detail panel
   * stays empty: "0 items · 0h" and "Nothing due" are claims about the term,
   * and a request in flight supports neither.
   */
  const unresolved = isPending || error !== null;
  const headSub = isPending
    ? 'loading…'
    : error !== null
      ? 'could not load'
      : `${windowItems} item${windowItems === 1 ? '' : 's'} · ${effortLabel(windowEffort)} · ${rangeHint}`;
  const detailSub = unresolved
    ? isPending
      ? 'loading…'
      : 'could not load'
    : `${selectedItems.length} due · ${effortLabel(sumEffort(selectedItems))}`;

  return (
    <section className={styles.section}>
      <div className={styles.sectionHead}>
        <h2 className={styles.h2}>{title}</h2>
        <span className={styles.sub}>{headSub}</span>
        <span className={styles.legend}>
          {LEGEND.map((entry) => (
            <span key={entry.category} className={styles.legendItem}>
              <span className={GLYPH_CLASS[entry.category]}>{entry.glyph}</span>
              {entry.label}
            </span>
          ))}
        </span>
        <span className={styles.pager}>
          <button
            type="button"
            className={tokens.btnGhost}
            onClick={() => moveAnchor(-1)}
            disabled={!view.canPageBack}
            title="Earlier"
            aria-label="Earlier days"
          >
            ◂
          </button>
          <button
            type="button"
            className={tokens.btnGhost}
            onClick={() => moveAnchor(1)}
            disabled={!view.canPageForward}
            title="Later"
            aria-label="Later days"
          >
            ▸
          </button>
        </span>
      </div>

      <div
        ref={scrollerRef}
        className={styles.tracker}
        role="tablist"
        aria-label="Effort by day"
        onScroll={handleScroll}
        style={{ ['--tracker-columns' as string]: String(columnsInView) }}
      >
        {columns.map(({ day, items: dayItems }) => (
          <DayColumn
            key={day.iso}
            day={day}
            items={dayItems}
            scale={scale}
            selected={day.iso === activeSelected}
            onSelect={() => selectDay(day.iso)}
          />
        ))}
      </div>

      <div className={styles.windowSummary}>
        <span>Window · {formatDayRange(view.firstIso, view.lastIso)}</span>
        <span>
          Scrolls {formatDayRange(strip.firstIso, strip.lastIso)} · line = Monday · click a day for
          detail
        </span>
      </div>

      <div className={`${tokens.card} ${styles.detail}`}>
        <div className={styles.detailHead}>
          <span className={styles.detailTitle}>
            {activeSelected === today ? 'Today' : DOW_LABELS[selectedDate.getDay()]},{' '}
            {MONTH_LABELS[selectedDate.getMonth()]} {selectedDate.getDate()}
          </span>
          <span className={styles.sub}>{detailSub}</span>
          <span className={styles.detailHint}>status is click-to-edit</span>
        </div>

        {error !== null && (
          <div className={styles.detailEmpty} role="alert">
            Could not load upcoming work: {error.message}
          </div>
        )}

        {!unresolved && selectedItems.map((item) => {
          const start = suggestedStartText(item);
          return (
            <div key={`${item.item_kind}:${item.item_id}`} className={styles.detailRow}>
              <span className={GLYPH_CLASS[item.category]}>{item.glyph}</span>
              <span className={tokens.mono}>{courseCodeFromId(item.course_id)}</span>
              <span className={styles.titleCell}>
                {item.item_kind === 'assignment' ? (
                  <Link
                    className={styles.titleLink}
                    href={itemQuery({ kind: 'assignment', id: item.item_id })}
                    scroll={false}
                  >
                    {item.title}
                  </Link>
                ) : (
                  <span className={styles.titleText}>{item.title}</span>
                )}
              </span>
              <span className={styles.timeCell} title={itemTimeText(item)}>
                {itemTimeText(item)}
              </span>
              <span className={styles.effortCell}>
                {effortLabel(toNumber(item.effort))}
                {start ? ` · ${start}` : ''}
                {item.is_override ? <span className={styles.overrideTag}> · override</span> : ''}
              </span>
              <StatusSelect
                item={item}
                onChange={onStatusChange}
                pending={pendingItemId === item.item_id}
              />
            </div>
          );
        })}

        {!unresolved && selectedItems.length === 0 && (
          <div className={styles.detailEmpty}>
            Nothing due — a good day to start on what&apos;s coming.
          </div>
        )}
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------------------
 * One day column
 * ------------------------------------------------------------------------ */

function DayColumn({
  day,
  items,
  scale,
  selected,
  onSelect,
}: {
  day: TrackerDay;
  items: WorkItem[];
  scale: number;
  selected: boolean;
  onSelect: () => void;
}) {
  const dowClass = day.isToday ? styles.dowToday : day.isWeekend ? styles.dowWeekend : '';
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      onClick={onSelect}
      className={[styles.day, selected ? styles.daySelected : '', day.isMonday ? styles.dayMonday : '']
        .filter(Boolean)
        .join(' ')}
    >
      <span className={styles.monthLabel}>{day.monthLabel}</span>
      <span className={styles.dayCount}>{items.length || ''}</span>
      <span className={styles.barArea}>
        {items.map((item) => (
          <span
            key={`${item.item_kind}:${item.item_id}`}
            className={`${styles.seg} ${SEG_CLASS[item.category]}`}
            style={{ height: `${Math.max(3, toNumber(item.effort) * scale)}px` }}
            title={`${item.title} · ${effortLabel(toNumber(item.effort))}`}
          />
        ))}
      </span>
      <span className={`${styles.dowLabel} ${dowClass}`}>{day.dowLabel}</span>
      <span className={styles.dateNum}>{day.dayOfMonth}</span>
    </button>
  );
}

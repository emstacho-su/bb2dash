'use client';

/**
 * UpcomingTracker — STUB (worker W-13).
 *
 * The real component is worker W-14's deliverable: the Home tracker extracted
 * out of `Today.tsx` with no visual change, plus the R-03 paging. It is not on
 * `origin/feat/course-dimension-shared` yet, so this file stands in at the same
 * path with the props frozen in `docs/planning/61_PHASE8_course_dimension.md`
 * §Tracker component. Merging W-14's branch replaces this file wholesale —
 * nothing outside it needs to change.
 *
 * What the stub does honestly: one column per day over `visibleDays`, bar
 * height proportional to the day's summed effort, `◂ ▸` paging by a whole page,
 * a Monday rule, the month label on the 1st, and a detail list under the
 * selected day with the status quick-edit. What it does not do: the Nocturne
 * skin, the legend and the 8-week scroll affordance — W-14 brings those.
 *
 * No number here is invented: every figure is summed from the rows the caller
 * passed in.
 */

import { useState } from 'react';
import type { ProgressStatus } from '@/lib/queries';
import { STATUS_LABEL, STATUS_OPTIONS, toNumber, type WorkItem } from '@/lib/queries.today';
import styles from './UpcomingTracker.module.css';

export type UpcomingTrackerProps = {
  /** `v_work_items` rows, already course-filtered by the caller. */
  items: WorkItem[];
  /** How far the tracker can page. Default 56 days. */
  horizonDays?: number;
  /** How many day columns show at once. Default 14. */
  visibleDays?: number;
  /** 'YYYY-MM-DD' first visible day; defaults to today. */
  anchor?: string;
  onAnchorChange?: (iso: string) => void;
  selectedDay?: string;
  onSelectDay?: (iso: string) => void;
  onStatusChange: (item: WorkItem, status: ProgressStatus) => void;
  pendingItemId?: string | null;
  /** 'Upcoming work' | 'Upcoming work · IST 323'. */
  title?: string;
};

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;
const BAR_AREA_PX = 96;

/** Local-time 'YYYY-MM-DD' — matches how Postgres date columns come back. */
function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function parseDateOnly(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}
function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

export function UpcomingTracker({
  items,
  horizonDays = 56,
  visibleDays = 14,
  anchor,
  onAnchorChange,
  selectedDay,
  onSelectDay,
  onStatusChange,
  pendingItemId = null,
  title = 'Upcoming work',
}: UpcomingTrackerProps) {
  const today = isoDate(new Date());
  const [ownAnchor, setOwnAnchor] = useState(anchor ?? today);
  const [ownSelected, setOwnSelected] = useState(selectedDay ?? today);

  const anchorISO = anchor ?? ownAnchor;
  const selectedISO = selectedDay ?? ownSelected;

  function moveAnchor(deltaDays: number) {
    const first = parseDateOnly(today);
    const last = addDays(first, Math.max(0, horizonDays - visibleDays));
    let next = addDays(parseDateOnly(anchorISO), deltaDays);
    if (next < first) next = first;
    if (next > last) next = last;
    const iso = isoDate(next);
    setOwnAnchor(iso);
    onAnchorChange?.(iso);
  }

  function pickDay(iso: string) {
    setOwnSelected(iso);
    onSelectDay?.(iso);
  }

  const start = parseDateOnly(anchorISO);
  const days = Array.from({ length: visibleDays }, (_, i) => {
    const date = addDays(start, i);
    const key = isoDate(date);
    const dayItems = items.filter((it) => it.due_on === key);
    return {
      date,
      key,
      items: dayItems,
      effort: dayItems.reduce((sum, it) => sum + toNumber(it.effort), 0),
    };
  });

  const maxEffort = Math.max(1, ...days.map((d) => d.effort));
  const scale = BAR_AREA_PX / maxEffort;
  const selected = days.find((d) => d.key === selectedISO) ?? days[0];
  const totalItems = days.reduce((sum, d) => sum + d.items.length, 0);

  return (
    <section className={styles.tracker} aria-label={title}>
      <div className={styles.head}>
        <h2 className={styles.title}>{title}</h2>
        <span className={styles.sub}>
          {totalItems} item{totalItems === 1 ? '' : 's'} in this {visibleDays}-day window
        </span>
        <span className={styles.paging}>
          <button
            type="button"
            className={styles.pageBtn}
            onClick={() => moveAnchor(-visibleDays)}
            aria-label={`Back ${visibleDays} days`}
            disabled={anchorISO <= today}
          >
            ◂
          </button>
          <button
            type="button"
            className={styles.pageBtn}
            onClick={() => moveAnchor(visibleDays)}
            aria-label={`Forward ${visibleDays} days`}
          >
            ▸
          </button>
        </span>
      </div>

      <div className={styles.strip} role="tablist" aria-label="Effort by day">
        {days.map((d) => {
          const isMonday = d.date.getDay() === 1;
          const isToday = d.key === today;
          const showMonth = d.date.getDate() === 1 || d.key === days[0].key;
          return (
            <button
              key={d.key}
              type="button"
              role="tab"
              aria-selected={d.key === selected?.key}
              onClick={() => pickDay(d.key)}
              className={[
                styles.day,
                d.key === selected?.key ? styles.daySelected : '',
                isMonday ? styles.dayMonday : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <span className={styles.monthLabel}>{showMonth ? MON[d.date.getMonth()] : ''}</span>
              <span className={styles.dayCount}>{d.items.length || ''}</span>
              <span className={styles.barArea}>
                {d.items.map((it) => (
                  <span
                    key={`${it.item_kind}:${it.item_id}`}
                    className={styles.seg}
                    style={{ height: `${Math.max(3, toNumber(it.effort) * scale)}px` }}
                    title={it.title}
                  />
                ))}
              </span>
              <span className={isToday ? styles.dowToday : styles.dowLabel}>
                {isToday ? 'Today' : DOW[d.date.getDay()]}
              </span>
              <span className={styles.dateNum}>{d.date.getDate()}</span>
            </button>
          );
        })}
      </div>

      <div className={styles.detail}>
        <div className={styles.detailHead}>
          <span className={styles.detailTitle}>
            {selected
              ? `${DOW[selected.date.getDay()]}, ${MON[selected.date.getMonth()]} ${selected.date.getDate()}`
              : 'No day selected'}
          </span>
          <span className={styles.sub}>{selected?.items.length ?? 0} due</span>
        </div>
        {(selected?.items ?? []).map((it) => (
          <div key={`${it.item_kind}:${it.item_id}`} className={styles.detailRow}>
            <span className={styles.detailTitleCell}>{it.title}</span>
            <select
              className={styles.statusSelect}
              value={it.status}
              disabled={pendingItemId === it.item_id}
              aria-label={`Status for ${it.title}`}
              onChange={(e) => onStatusChange(it, e.target.value as ProgressStatus)}
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </div>
        ))}
        {(selected?.items.length ?? 0) === 0 && (
          <div className={styles.detailEmpty}>Nothing due on this day.</div>
        )}
      </div>
    </section>
  );
}

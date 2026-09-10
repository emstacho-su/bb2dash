'use client';

/**
 * Today (Home) — artboard 13-home-v2.
 *
 * Structure & interactions are the spec; the Nocturne skin is a placeholder.
 *   1. 14-day horizontal effort tracker (bar = Σ effort/day, segments tinted by
 *      assignment-type ramp, Monday ruled, month label on the 1st). Click a day
 *      to fill the detail panel.
 *   2. Undated tray (v_work_items where undated = true).
 *   3. Status quick-edit (T-06) writing assignment_progress / reading_progress.
 *   4. Last-sync line (reconciled form of the old Needs-attention row).
 *   5. 2-up course cards, NO grade line (no gradebook this term — honesty rule).
 *
 * Every figure traces to a v_work_items / v_course_display row. Missing data
 * shows "—" or an empty state; nothing is invented.
 */

import { useState } from 'react';
import tokens from '@/styles/tokens.module.css';
import styles from './Today.module.css';
import {
  courseCodeFromId,
  effortLabel,
  STATUS_LABEL,
  STATUS_OPTIONS,
  toNumber,
  useCourseDisplay,
  useLastSync,
  useSetItemStatus,
  useTerm,
  useUndatedWorkItems,
  useWorkItemsWindow,
  type CourseDisplay,
  type CourseMeeting,
  type WorkCategory,
  type WorkItem,
} from '@/lib/queries.today';
import type { ProgressStatus } from '@/lib/queries';

/* ---------------------------------------------------------------------------
 * Constants & small pure helpers
 * ------------------------------------------------------------------------ */

const TRACKER_DAYS = 14;
const BAR_AREA_PX = 120;
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;
const STRIP_LABELS = ['M', 'T', 'W', 'T', 'F'] as const;
/** Order the typed next-due counts most-effortful first. */
const CATEGORY_ORDER: WorkCategory[] = ['exam', 'project', 'quiz', 'assignment', 'reading'];

const GLYPH_CLASS: Record<WorkCategory, string> = {
  reading: tokens.glyphReading,
  assignment: tokens.glyphAssignment,
  quiz: tokens.glyphQuiz,
  project: tokens.glyphProject,
  exam: tokens.glyphExam,
};
const SEG_CLASS: Record<WorkCategory, string> = {
  reading: styles.segReading,
  assignment: styles.segAssignment,
  quiz: styles.segQuiz,
  project: styles.segProject,
  exam: styles.segExam,
};
const SUBMISSION_LABEL: Record<string, string> = {
  in_class: 'in class',
  blackboard: 'Blackboard',
  email: 'email',
};

/** 'HH:MM:SS' -> '3:45' or '5:05p' (meridiem only when asked). */
function clockFromHms(hms: string, meridiem: boolean): string {
  const [h, m] = hms.split(':').map(Number);
  const h12 = ((h + 11) % 12) + 1;
  const mm = String(m).padStart(2, '0');
  return meridiem ? `${h12}:${mm}${h < 12 ? 'a' : 'p'}` : `${h12}:${mm}`;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}
/** Local-time 'YYYY-MM-DD' — matches how Postgres date columns come back. */
function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
/** Parse a 'YYYY-MM-DD' date column into a local Date (no TZ shift). */
function parseDateOnly(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '—';
  const secs = Math.round((Date.now() - then) / 1000);
  if (secs < 0) return 'just now';
  if (secs < 60) return 'just now';
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hr${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  return new Date(iso).toLocaleDateString();
}

/** The detail-panel "time" cell: clock if we have one, else the rule/mode. */
function itemTimeText(it: WorkItem): string {
  if (it.due_at) {
    return new Date(it.due_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }
  if (it.due_rule) return it.due_rule;
  if (it.submission && SUBMISSION_LABEL[it.submission]) return SUBMISSION_LABEL[it.submission];
  return '—';
}

/** "start Sun 9/28", "day of", or '' when there is no suggested start. */
function suggestedStartText(it: WorkItem): string {
  if (!it.suggested_start) return '';
  if (it.due_on && it.suggested_start === it.due_on) return 'day of';
  const s = parseDateOnly(it.suggested_start);
  return `start ${DOW[s.getDay()]} ${s.getMonth() + 1}/${s.getDate()}`;
}

/** Group meetings that share time+room and label the days: "MW 3:45–5:05p · Hinds Hall 010". */
function formatMeetings(meetings: CourseMeeting[] | null): string[] {
  if (!meetings || meetings.length === 0) return [];
  const dayLetter = (d: number) => (d === 0 || d === 7 ? 'Su' : ['', 'M', 'T', 'W', 'Th', 'F', 'Sa'][d] ?? '?');
  const groups = new Map<string, { days: number[]; start: string; end: string; room: string }>();
  for (const m of meetings) {
    const key = `${m.start}|${m.end}|${m.room}`;
    const g = groups.get(key);
    if (g) g.days.push(m.day);
    else groups.set(key, { days: [m.day], start: m.start, end: m.end, room: m.room });
  }
  return Array.from(groups.values()).map((g) => {
    const days = g.days.sort((a, b) => a - b).map(dayLetter).join('');
    return `${days} ${clockFromHms(g.start, false)}–${clockFromHms(g.end, true)} · ${g.room}`;
  });
}

/* ---------------------------------------------------------------------------
 * Status quick-edit control (T-06)
 * ------------------------------------------------------------------------ */

function StatusSelect({
  item,
  onChange,
  pending,
}: {
  item: WorkItem;
  onChange: (item: WorkItem, status: ProgressStatus) => void;
  pending: boolean;
}) {
  return (
    <select
      className={styles.statusSelect}
      value={item.status}
      disabled={pending}
      aria-label={`Status for ${item.title}`}
      onChange={(e) => onChange(item, e.target.value as ProgressStatus)}
    >
      {STATUS_OPTIONS.map((s) => (
        <option key={s} value={s}>
          {STATUS_LABEL[s]}
        </option>
      ))}
    </select>
  );
}

/* ---------------------------------------------------------------------------
 * Screen
 * ------------------------------------------------------------------------ */

export function Today() {
  const [selected, setSelected] = useState(0); // 0 = today

  const today = startOfDay(new Date());
  const dow = today.getDay();
  const weekMonday = addDays(today, dow === 0 ? -6 : 1 - dow);
  const weekSunday = addDays(weekMonday, 6);
  const trackerEnd = addDays(today, TRACKER_DAYS - 1);

  // Fetch from the Monday of this week (so the course-card week strip is whole)
  // through the end of the 14-day tracker horizon.
  const windowQ = useWorkItemsWindow(isoDate(weekMonday), isoDate(trackerEnd));
  const undatedQ = useUndatedWorkItems();
  const coursesQ = useCourseDisplay();
  const termQ = useTerm();
  const syncQ = useLastSync();
  const setStatus = useSetItemStatus();

  const pendingId = setStatus.isPending ? setStatus.variables?.item.item_id ?? null : null;
  const handleStatus = (item: WorkItem, status: ProgressStatus) => {
    setStatus.mutate({ item: { item_kind: item.item_kind, item_id: item.item_id }, status });
  };

  const items = windowQ.data ?? [];
  const weekMondayKey = isoDate(weekMonday);
  const weekSundayKey = isoDate(weekSunday);
  const todayKey = isoDate(today);

  // 14 tracker columns from today.
  const days = Array.from({ length: TRACKER_DAYS }, (_, i) => {
    const date = addDays(today, i);
    const key = isoDate(date);
    const dItems = items.filter((x) => x.due_on === key);
    return {
      i,
      date,
      key,
      items: dItems,
      effort: dItems.reduce((a, b) => a + toNumber(b.effort), 0),
    };
  });
  const maxEffort = Math.max(1, ...days.map((d) => d.effort));
  const scale = BAR_AREA_PX / maxEffort;
  const selectedDay = days[selected] ?? days[0];

  const windowItemCount = days.reduce((a, d) => a + d.items.length, 0);
  const windowEffort = days.reduce((a, d) => a + d.effort, 0);

  const failed = windowQ.error ?? undatedQ.error ?? coursesQ.error;

  // Header kicker: real weekday/date + truthful term week (only if the term row loaded).
  const kicker = (() => {
    const base = today.toLocaleDateString(undefined, {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
    const term = termQ.data;
    if (!term) return base;
    const start = parseDateOnly(term.start_date);
    const end = parseDateOnly(term.end_date);
    const week = Math.floor((today.getTime() - start.getTime()) / (7 * 864e5)) + 1;
    const total = Math.ceil((end.getTime() - start.getTime()) / (7 * 864e5));
    if (week < 1 || total < 1) return base;
    return `${base} · Week ${week} of ${total}`;
  })();

  return (
    <>
      <header className={styles.header}>
        <div className={styles.headerText}>
          <span className={tokens.kicker}>{kicker}</span>
          <h1 className={styles.title}>Today</h1>
        </div>
        <div className={styles.headerMeta}>
          <a href="/planner" className={tokens.btnGhost} style={{ fontSize: 'var(--text-sm)' }}>
            Open planner →
          </a>
        </div>
      </header>

      {failed && (
        <p className={styles.problem} role="alert">
          Could not load data from Supabase: {failed.message}
        </p>
      )}

      {/* ---- 1. Upcoming-work effort tracker ---- */}
      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <h2 className={styles.h2}>Upcoming work</h2>
          <span className={styles.sub}>
            {windowQ.isPending
              ? 'loading…'
              : `${windowItemCount} item${windowItemCount === 1 ? '' : 's'} · ${effortLabel(windowEffort)} · next 14 days`}
          </span>
          <span className={styles.legend}>
            <span className={styles.legendItem}>
              <span className={tokens.glyphReading}>R</span>reading
            </span>
            <span className={styles.legendItem}>
              <span className={tokens.glyphAssignment}>A</span>assignment
            </span>
            <span className={styles.legendItem}>
              <span className={tokens.glyphQuiz}>Q</span>quiz
            </span>
            <span className={styles.legendItem}>
              <span className={tokens.glyphProject}>P</span>project
            </span>
            <span className={styles.legendItem}>
              <span className={tokens.glyphExam}>E</span>exam
            </span>
          </span>
        </div>

        <div className={styles.tracker} role="tablist" aria-label="Effort by day">
          {days.map((d) => {
            const isMonday = d.date.getDay() === 1;
            const isToday = d.i === 0;
            const isWeekend = d.date.getDay() === 0 || d.date.getDay() === 6;
            const showMonth = d.date.getDate() === 1 || d.i === 0;
            const dowClass = isToday ? styles.dowToday : isWeekend ? styles.dowWeekend : '';
            return (
              <button
                key={d.key}
                type="button"
                role="tab"
                aria-selected={d.i === selected}
                onClick={() => setSelected(d.i)}
                className={[
                  styles.day,
                  d.i === selected ? styles.daySelected : '',
                  isMonday ? styles.dayMonday : '',
                ].join(' ')}
              >
                <span className={styles.monthLabel}>{showMonth ? MON[d.date.getMonth()] : ''}</span>
                <span className={styles.dayCount}>{d.items.length || ''}</span>
                <span className={styles.barArea}>
                  {d.items.map((it) => (
                    <span
                      key={`${it.item_kind}:${it.item_id}`}
                      className={`${styles.seg} ${SEG_CLASS[it.category]}`}
                      style={{ height: `${Math.max(3, toNumber(it.effort) * scale)}px` }}
                      title={`${it.title} · ${effortLabel(toNumber(it.effort))}`}
                    />
                  ))}
                </span>
                <span className={`${styles.dowLabel} ${dowClass}`}>{isToday ? 'Today' : DOW[d.date.getDay()]}</span>
                <span className={styles.dateNum}>{d.date.getDate()}</span>
              </button>
            );
          })}
        </div>

        <div className={styles.windowSummary}>
          <span>
            Window · {MON[today.getMonth()]} {today.getDate()} – {MON[trackerEnd.getMonth()]} {trackerEnd.getDate()}
          </span>
          <span>line = Monday · click a day for detail</span>
        </div>

        {/* detail panel */}
        <div className={`${tokens.card} ${styles.detail}`}>
          <div className={styles.detailHead}>
            <span className={styles.detailTitle}>
              {selectedDay.i === 0 ? 'Today' : DOW[selectedDay.date.getDay()]}, {MON[selectedDay.date.getMonth()]}{' '}
              {selectedDay.date.getDate()}
            </span>
            <span className={styles.sub}>
              {selectedDay.items.length} due · {effortLabel(selectedDay.effort)}
            </span>
            <span className={styles.detailHint}>status is click-to-edit</span>
          </div>

          {selectedDay.items.map((it) => {
            const start = suggestedStartText(it);
            return (
              <div key={`${it.item_kind}:${it.item_id}`} className={styles.detailRow}>
                <span className={GLYPH_CLASS[it.category]}>{it.glyph}</span>
                <span className={tokens.mono}>{courseCodeFromId(it.course_id)}</span>
                <span className={styles.titleCell}>
                  <span className={styles.titleText}>{it.title}</span>
                </span>
                <span className={styles.timeCell} title={itemTimeText(it)}>
                  {itemTimeText(it)}
                </span>
                <span className={styles.effortCell}>
                  {effortLabel(toNumber(it.effort))}
                  {start ? ` · ${start}` : ''}
                  {it.is_override ? <span className={styles.overrideTag}> · override</span> : ''}
                </span>
                <StatusSelect item={it} onChange={handleStatus} pending={pendingId === it.item_id} />
              </div>
            );
          })}

          {selectedDay.items.length === 0 && (
            <div className={styles.detailEmpty}>Nothing due — a good day to start on what&apos;s coming.</div>
          )}
        </div>
      </section>

      {/* ---- 4. Last-sync line (reconciled Needs-attention) ---- */}
      <div className={styles.syncRow}>
        <span>Data sync</span>
        <span className={styles.syncRowMeta}>
          {syncQ.isPending
            ? 'checking…'
            : syncQ.data
              ? `last synced ${relativeTime(syncQ.data)}`
              : 'no sync recorded yet'}
        </span>
      </div>

      {/* ---- 2. Undated tray ---- */}
      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <h2 className={styles.h2}>Undated</h2>
          <span className={styles.sub}>
            {undatedQ.isPending
              ? 'loading…'
              : `${undatedQ.data?.length ?? 0} item${(undatedQ.data?.length ?? 0) === 1 ? '' : 's'} with no due date yet`}
          </span>
        </div>
        <div className={`${tokens.card} ${styles.undatedList}`}>
          {(undatedQ.data ?? []).map((it) => (
            <div key={`${it.item_kind}:${it.item_id}`} className={styles.undatedRow}>
              <span className={GLYPH_CLASS[it.category]}>{it.glyph}</span>
              <span className={tokens.mono}>{courseCodeFromId(it.course_id)}</span>
              <span className={styles.titleText}>{it.title}</span>
              <StatusSelect item={it} onChange={handleStatus} pending={pendingId === it.item_id} />
            </div>
          ))}
          {!undatedQ.isPending && (undatedQ.data?.length ?? 0) === 0 && (
            <div className={styles.detailEmpty}>Nothing undated — every item has a date.</div>
          )}
        </div>
      </section>

      {/* ---- 5. Course cards (no grade line) ---- */}
      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <h2 className={styles.h2}>Courses</h2>
          <span className={styles.sub}>Open = items due this week · strip = meeting days, dot = something due</span>
        </div>
        <div className={styles.courseGrid}>
          {(coursesQ.data ?? []).map((course) => (
            <CourseCard
              key={course.display_id}
              course={course}
              items={items.filter((it) => course.shell_ids.includes(it.course_id))}
              todayKey={todayKey}
              weekMonday={weekMonday}
              weekMondayKey={weekMondayKey}
              weekSundayKey={weekSundayKey}
            />
          ))}
          {coursesQ.isPending && <span className={styles.muted}>loading courses…</span>}
        </div>
      </section>
    </>
  );
}

/* ---------------------------------------------------------------------------
 * Course card
 * ------------------------------------------------------------------------ */

function CourseCard({
  course,
  items,
  todayKey,
  weekMonday,
  weekMondayKey,
  weekSundayKey,
}: {
  course: CourseDisplay;
  items: WorkItem[];
  todayKey: string;
  weekMonday: Date;
  weekMondayKey: string;
  weekSundayKey: string;
}) {
  const meetingLines = formatMeetings(course.meetings);

  // Next due: earliest due_on from today forward within the fetched horizon.
  const upcoming = items
    .filter((it) => it.due_on && it.due_on >= todayKey)
    .sort((a, b) => (a.due_on! < b.due_on! ? -1 : a.due_on! > b.due_on! ? 1 : 0));
  const nextDate = upcoming[0]?.due_on ?? null;
  const nextDayItems = nextDate ? upcoming.filter((it) => it.due_on === nextDate) : [];
  const counts = CATEGORY_ORDER.map((cat) => ({
    cat,
    n: nextDayItems.filter((it) => it.category === cat).length,
  })).filter((c) => c.n > 0);

  const openThisWeek = items.filter(
    (it) => it.due_on && it.due_on >= weekMondayKey && it.due_on <= weekSundayKey,
  ).length;

  const strip = STRIP_LABELS.map((label, idx) => {
    const date = addDays(weekMonday, idx);
    const key = isoDate(date);
    const meets = course.meetings?.some((m) => m.day === idx + 1) ?? false;
    const due = items.some((it) => it.due_on === key);
    return { label, meets, due, idx };
  });

  return (
    <div className={`${tokens.card} ${tokens.elevSm} ${styles.courseCard}`}>
      <div className={styles.courseMain}>
        <div className={styles.courseCodeRow}>
          <span className={styles.courseCode}>{course.code}</span>
          <span className={styles.courseTitle}>{course.title}</span>
        </div>
        <span className={styles.courseMeet}>
          {meetingLines.length ? meetingLines.join('  ·  ') : 'no scheduled meetings'}
        </span>
        <div className={styles.courseStats}>
          <div className={styles.stat}>
            <span className={tokens.kicker}>
              Next due{nextDate ? ` · ${formatShortDate(nextDate)}` : ''}
            </span>
            <span className={styles.statValue}>
              {counts.length ? counts.map((c) => `${c.n} ${c.cat}`).join(' · ') : '—'}
            </span>
          </div>
          <div className={styles.stat}>
            <span className={tokens.kicker}>Open</span>
            <span className={styles.statValue}>{openThisWeek || '—'}</span>
          </div>
        </div>
      </div>
      <div className={styles.strip}>
        <span className={tokens.kicker} style={{ textAlign: 'center' }}>
          this week
        </span>
        <span className={styles.stripCells}>
          {strip.map((s) => (
            <span key={s.idx} className={styles.stripCell}>
              <span className={`${styles.stripBar} ${s.meets ? styles.stripBarMeet : ''}`} />
              <span className={`${styles.stripDot} ${s.due ? styles.stripDotDue : ''}`} />
              <span className={styles.stripLabel}>{s.label}</span>
            </span>
          ))}
        </span>
      </div>
    </div>
  );
}

function formatShortDate(dateOnly: string): string {
  const d = parseDateOnly(dateOnly);
  return `${DOW[d.getDay()]} ${d.getMonth() + 1}/${d.getDate()}`;
}

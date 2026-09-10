'use client';

/**
 * Today (Home) — artboard 13-home-v2.
 *
 * Structure & interactions are the spec; the Nocturne skin is a placeholder.
 *   1. Horizontal effort tracker — now the shared `<UpcomingTracker>` component
 *      (`@/components/tracker`), fed a 56-day window so its ◂ ▸ paging has
 *      somewhere to go. Unpaged it shows the same 14 days it always did.
 *   2. Undated tray (v_work_items where undated = true).
 *   3. Status quick-edit (T-06) writing assignment_progress / reading_progress.
 *   4. Last-sync line (reconciled form of the old Needs-attention row).
 *   5. 2-up course cards, NO grade line (no gradebook this term — honesty rule).
 *
 * Every figure traces to a v_work_items / v_course_display row. Missing data
 * shows "—" or an empty state; nothing is invented.
 */

import tokens from '@/styles/tokens.module.css';
import styles from './Today.module.css';
import {
  courseCodeFromId,
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
import { StatusSelect } from '@/components/tracker/StatusSelect';
import { UpcomingTracker } from '@/components/tracker/UpcomingTracker';
import {
  DEFAULT_HORIZON_DAYS,
  DEFAULT_VISIBLE_DAYS,
  addDays,
  isoDate,
  parseDateOnly,
} from '@/components/tracker/anchor';

/* ---------------------------------------------------------------------------
 * Constants & small pure helpers
 * ------------------------------------------------------------------------ */

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const STRIP_LABELS = ['M', 'T', 'W', 'T', 'F'] as const;
/** Order the typed next-due counts most-effortful first. */
const CATEGORY_ORDER: WorkCategory[] = ['exam', 'project', 'quiz', 'assignment', 'reading'];

/**
 * A course card's "Next due" summarises the same stretch of days the tracker
 * shows unpaged. The fetch now runs 56 days out for the tracker's ◂ ▸ paging;
 * without this bound the card would silently start reporting dates eight weeks
 * away, which is a different claim from the one the card has been making.
 */
const CARD_HORIZON_DAYS = DEFAULT_VISIBLE_DAYS;

const GLYPH_CLASS: Record<WorkCategory, string> = {
  reading: tokens.glyphReading,
  assignment: tokens.glyphAssignment,
  quiz: tokens.glyphQuiz,
  project: tokens.glyphProject,
  exam: tokens.glyphExam,
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
 * Screen
 * ------------------------------------------------------------------------ */

export function Today() {
  const today = startOfDay(new Date());
  const dow = today.getDay();
  const weekMonday = addDays(today, dow === 0 ? -6 : 1 - dow);
  const weekSunday = addDays(weekMonday, 6);
  const horizonEnd = addDays(today, DEFAULT_HORIZON_DAYS - 1);

  // Fetch from the Monday of this week (so the course-card week strip is whole)
  // through the end of the tracker's 56-day paging horizon.
  const windowQ = useWorkItemsWindow(isoDate(weekMonday), isoDate(horizonEnd));
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
  const cardHorizonKey = isoDate(addDays(today, CARD_HORIZON_DAYS - 1));

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

      {/* ---- 1. Upcoming-work effort tracker (shared component) ---- */}
      <UpcomingTracker
        items={items}
        onStatusChange={handleStatus}
        pendingItemId={pendingId}
      />

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
              cardHorizonKey={cardHorizonKey}
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
  cardHorizonKey,
  weekMonday,
  weekMondayKey,
  weekSundayKey,
}: {
  course: CourseDisplay;
  items: WorkItem[];
  todayKey: string;
  cardHorizonKey: string;
  weekMonday: Date;
  weekMondayKey: string;
  weekSundayKey: string;
}) {
  const meetingLines = formatMeetings(course.meetings);

  // Next due: earliest due_on from today forward, within the card's horizon.
  const upcoming = items
    .filter((it) => it.due_on && it.due_on >= todayKey && it.due_on <= cardHorizonKey)
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

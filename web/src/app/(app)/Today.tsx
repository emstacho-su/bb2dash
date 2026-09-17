'use client';

/**
 * Today (Home) — artboard 13-home-v2.
 *
 * Structure & interactions are the spec; the Nocturne skin is a placeholder.
 *   1. Horizontal effort tracker — now the shared `<UpcomingTracker>` component
 *      (`@/components/tracker`), fed a 56-day window. Since H-2 the strip
 *      scrolls that whole span and opens anchored on today; H-3 put the strip
 *      and the day panel in one card.
 *   2. Undated tray (v_work_items where undated = true).
 *   3. Status quick-edit (T-06) writing assignment_progress / reading_progress.
 *   4. 2-up course cards.
 *   5. Needs-attention row, LAST on the page (H-3 / P-home-5): the queue Stack
 *      clears when he has time, not the thing he opens Home to see.
 *
 * Every figure traces to a v_work_items / v_course_display row. Missing data
 * shows "—" or an empty state; nothing is invented.
 */

import Link from 'next/link';
import tokens from '@/styles/tokens.module.css';
import styles from './Today.module.css';
import {
  courseCodeFromId,
  useCourseDisplay,
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
import { itemQuery } from '@/lib/queries.popout';
import { StatusSelect } from '@/components/tracker/StatusSelect';
import { isQueryLoading } from '@/components/shared/QueryState';
import { UpcomingTracker } from '@/components/tracker/UpcomingTracker';
import {
  DEFAULT_HORIZON_DAYS,
  DEFAULT_VISIBLE_DAYS,
  addDays,
  isoDate,
  parseDateOnly,
} from '@/components/tracker/anchor';
import { pickCourseGrade, useCourseGrades } from '@/lib/queries.grades';
import { NeedsAttentionRow } from './NeedsAttention';
import {
  blackboardGradeFigure,
  CourseGradeFigureView,
  type CourseGradeFigure,
} from './CourseGradeFigure';

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
  const gradesQ = useCourseGrades();
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

  /**
   * G-2 / P-home-10 — what the course card is handed to show.
   *
   * Blackboard's own published total is wired now, through the Phase 10a
   * helpers, so the card and `/grades` read the same row and cannot disagree.
   * While the gradebook read is in flight or has failed the card shows no
   * figure at all: "not synced yet" is a claim about the data, and neither a
   * request in flight nor a failed one supports it.
   *
   * >>> SLOT: the graded-so-far figure goes here, second in the array, once
   * Stack picks the method (G-0 / `80e_GRADE_METHOD_COMPARISON.md`). It is a
   * `CourseGradeFigure` produced by W-31's winning function — this screen must
   * not compute one, or Home and /grades will drift apart. Nothing else on the
   * card changes when it is added.
   */
  function cardGrades(course: CourseDisplay): CourseGradeFigure[] {
    if (gradesQ.isPending || gradesQ.error) return [];
    return [blackboardGradeFigure(pickCourseGrade(gradesQ.data, course.shell_ids))];
  }

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
        isPending={isQueryLoading(windowQ)}
        error={windowQ.error}
      />

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
              {it.item_kind === 'assignment' ? (
                <Link
                  className={styles.titleLink}
                  href={itemQuery({ kind: 'assignment', id: it.item_id })}
                  scroll={false}
                >
                  {it.title}
                </Link>
              ) : (
                <span className={styles.titleText}>{it.title}</span>
              )}
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
              grades={cardGrades(course)}
            />
          ))}
          {coursesQ.isPending && <span className={styles.muted}>loading courses…</span>}
        </div>
      </section>

      {/* ---- 4. Needs-attention row (Phase 9; replaces the last-sync line) ----
          H-3 (P-home-5): last on the page. It is the queue Stack clears when he
          has time, not the thing he opens Home to see. */}
      <NeedsAttentionRow />
    </>
  );
}

/* ---------------------------------------------------------------------------
 * Course card
 *
 * Exported for its unit test: it is a pure render over the rows it is handed,
 * with no hooks of its own.
 * ------------------------------------------------------------------------ */

export function CourseCard({
  course,
  items,
  todayKey,
  cardHorizonKey,
  weekMonday,
  weekMondayKey,
  weekSundayKey,
  grades = [],
}: {
  course: CourseDisplay;
  items: WorkItem[];
  todayKey: string;
  cardHorizonKey: string;
  weekMonday: Date;
  weekMondayKey: string;
  weekSundayKey: string;
  /**
   * G-2 / P-home-10 (Stack's answer 12) — THE GRADE SLOT.
   *
   * Figures the card shows, already formatted by whoever produced them. The
   * card renders them and does no arithmetic: it cannot compute a grade, which
   * is the point. Home wires Blackboard's own total today; the graded-so-far
   * figure is appended here by the PM once Stack picks the method from
   * `80e_GRADE_METHOD_COMPARISON.md`, with no change to this component.
   *
   * Empty by default, so a caller with nothing honest to say says nothing.
   */
  grades?: readonly CourseGradeFigure[];
}) {
  const meetingLines = formatMeetings(course.meetings);
  const note = course.card_note?.trim() ?? '';

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
    // H-5 (P-home-8): the card was a bare <div> that looked clickable and was
    // not. The whole card is the link now — one target, in the tab order, with
    // an accessible name that says where it goes. Nothing inside it is
    // interactive, so there is no nested control to swallow the click.
    <Link
      href={`/course/${encodeURIComponent(course.display_id)}`}
      className={`${tokens.card} ${tokens.elevSm} ${styles.courseCard}`}
      aria-label={`Open ${course.code} — ${course.title}`}
    >
      <div className={styles.courseMain}>
        <div className={styles.courseCodeRow}>
          <span className={styles.courseCode}>{course.code}</span>
          <span className={styles.courseTitle}>{course.title}</span>
        </div>
        <span className={styles.courseMeet}>
          {meetingLines.length ? meetingLines.join('  ·  ') : 'no scheduled meetings'}
        </span>
        {/* R-04: Stack's own one-line note. Nothing is rendered when he has not
            written one — an empty row would read as missing data. */}
        {note && (
          <span className={styles.courseNote} title={note}>
            {note}
          </span>
        )}
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
          {grades.map((figure) => (
            <CourseGradeFigureView key={figure.label} figure={figure} />
          ))}
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
    </Link>
  );
}

function formatShortDate(dateOnly: string): string {
  const d = parseDateOnly(dateOnly);
  return `${DOW[d.getDay()]} ${d.getMonth() + 1}/${d.getDate()}`;
}

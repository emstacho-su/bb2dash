'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import tokens from '@/styles/tokens.module.css';
import {
  RAIL_WEEKS,
  isZeroToleranceAiPolicy,
  useCourseDisplay,
  useCourseGradingScheme,
  useCourseSessionFiles,
  useCourseSessions,
  useCourseShells,
  useCourseWorkItems,
  useTerm,
  weekNumberFor,
  weekRangeLabel,
  workItemDueDate,
  type Session,
  type WorkItem,
} from '@/lib/queries.course';
import styles from './CourseScreen.module.css';

/* -- small pure helpers ---------------------------------------------------- */

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** 'YYYY-MM-DD' → "Mon · Sep 7" (parsed as UTC so the day never shifts). */
function formatDay(dateISO: string | null): string {
  if (!dateISO) return '';
  const [y, m, d] = dateISO.split('-').map(Number);
  const dt = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
  const dow = DOW[dt.getUTCDay()];
  const mon = dt.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
  return `${dow} · ${mon} ${dt.getUTCDate()}`;
}

/** Category → the token glyph background/foreground class. */
const GLYPH_CLASS: Record<string, string> = {
  reading: styles.avReading,
  assignment: styles.avAssignment,
  quiz: styles.avQuiz,
  project: styles.avProject,
  exam: styles.avExam,
};

function statusLabel(status: string | null): string {
  return (status ?? 'not_started').replace(/_/g, ' ');
}

type WeekBucket = {
  week: number;
  lectures: Session[];
  readings: WorkItem[];
  assignments: WorkItem[];
  graded: boolean; // has an assignment-kind item due → rail ring
};

/* -- component ------------------------------------------------------------- */

export function CourseScreen({ courseId }: { courseId: string }) {
  const display = useCourseDisplay(courseId);
  const shellIds = useMemo(() => display.data?.shell_ids ?? [], [display.data]);

  const shells = useCourseShells(shellIds);
  const termId = shells.data?.[0]?.term_id;
  const term = useTerm(termId);

  const sessionsQ = useCourseSessions(shellIds);
  const workItemsQ = useCourseWorkItems(shellIds);
  const schemeQ = useCourseGradingScheme(shellIds);
  const filesQ = useCourseSessionFiles(shellIds);

  const [mode, setMode] = useState<'current' | 'all'>('current');
  const [selectedWeek, setSelectedWeek] = useState<number | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(null);

  const termStart = term.data?.start_date ?? null;
  const sessions = sessionsQ.data ?? [];
  const workItems = workItemsQ.data ?? [];

  /* Bucket everything by week; collect undated items separately. */
  const { weeks, maxWeek, undated, totalLectureItems } = useMemo(() => {
    const readings = workItems.filter((i) => i.item_kind === 'reading');
    const assignments = workItems.filter((i) => i.item_kind === 'assignment');

    const weekOf = (item: WorkItem): number | null => {
      if (!termStart) return null;
      const due = workItemDueDate(item);
      return due ? weekNumberFor(due, termStart) : null;
    };

    let max = RAIL_WEEKS;
    const put = (w: number | null | undefined) => {
      if (w && w > max) max = w;
    };
    sessions.forEach((s) => put(s.week_no));
    const readingWeeks = new Map<number, WorkItem[]>();
    const assignmentWeeks = new Map<number, WorkItem[]>();
    const undatedItems: WorkItem[] = [];

    for (const r of readings) {
      const w = weekOf(r);
      if (w == null) undatedItems.push(r);
      else {
        put(w);
        (readingWeeks.get(w) ?? readingWeeks.set(w, []).get(w)!).push(r);
      }
    }
    for (const a of assignments) {
      const w = weekOf(a);
      if (w == null) undatedItems.push(a);
      else {
        put(w);
        (assignmentWeeks.get(w) ?? assignmentWeeks.set(w, []).get(w)!).push(a);
      }
    }

    const sessionWeeks = new Map<number, Session[]>();
    for (const s of sessions) {
      const w = s.week_no ?? 0;
      if (w >= 1) (sessionWeeks.get(w) ?? sessionWeeks.set(w, []).get(w)!).push(s);
    }

    const buckets: WeekBucket[] = [];
    for (let w = 1; w <= max; w++) {
      const asg = (assignmentWeeks.get(w) ?? []).slice().sort(sortByDue);
      buckets.push({
        week: w,
        lectures: (sessionWeeks.get(w) ?? [])
          .slice()
          .sort((a, b) => a.session_date.localeCompare(b.session_date)),
        readings: (readingWeeks.get(w) ?? []).slice().sort(sortByDue),
        assignments: asg,
        graded: asg.length > 0,
      });
    }

    return {
      weeks: buckets,
      maxWeek: max,
      undated: undatedItems,
      totalLectureItems: sessions.length + readings.length,
    };
  }, [sessions, workItems, termStart]);

  /* Files grouped per session id. */
  const filesBySession = useMemo(() => {
    const map = new Map<number, string[]>();
    for (const f of filesQ.data ?? []) {
      if (f.session_id == null) continue;
      (map.get(f.session_id) ?? map.set(f.session_id, []).get(f.session_id)!).push(f.file_name);
    }
    return map;
  }, [filesQ.data]);

  const todayISO = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  const currentWeek = termStart
    ? Math.min(maxWeek, weekNumberFor(todayISO, termStart))
    : 1;
  const railCurrent = Math.min(RAIL_WEEKS, Math.max(1, currentWeek));

  const from = mode === 'all' ? 1 : Math.min(currentWeek, maxWeek);
  const visibleWeeks = mode === 'all' ? weeks : weeks.filter((w) => w.week >= from);

  const twoLanes = totalLectureItems > 0;

  /* Scroll a week into view when it becomes the selection. */
  const weekRefs = useRef(new Map<number, HTMLDivElement | null>());
  useEffect(() => {
    if (selectedWeek == null) return;
    weekRefs.current.get(selectedWeek)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [selectedWeek, mode]);

  function pickWeek(w: number) {
    if (w < currentWeek) setMode('all');
    setSelectedWeek(w);
  }

  /* -- loading / error / not-found gates -- */
  if (display.isPending || (shellIds.length > 0 && term.isPending)) {
    return <p className={styles.state}>Loading course…</p>;
  }
  if (display.isError) {
    return <p className={styles.state}>Could not load this course.</p>;
  }
  if (!display.data) {
    return <p className={styles.state}>No course with id {courseId}.</p>;
  }

  const scheme = schemeQ.data ?? null;
  const zeroTolerance = isZeroToleranceAiPolicy(scheme?.ai_policy);
  const selectedSession = selectedSessionId
    ? sessions.find((s) => s.id === selectedSessionId) ?? null
    : null;

  return (
    <div className={styles.screen}>
      <h1 className="sr-only">
        {display.data.code} — {display.data.title}
      </h1>

      {/* AI policy — verbatim; prominent when zero-tolerance (IST 352). */}
      <AiPolicyCard
        policy={scheme?.ai_policy ?? null}
        confidence={scheme?.confidence ?? null}
        zeroTolerance={zeroTolerance}
      />

      <div className={styles.layout}>
        {/* Sticky week rail 1–16. */}
        <nav className={styles.rail} aria-label="Weeks">
          <span className={tokens.kicker}>wk</span>
          {Array.from({ length: RAIL_WEEKS }, (_, i) => i + 1).map((w) => {
            const bucket = weeks[w - 1];
            const isCurrent = w === railCurrent;
            const isSelected = w === selectedWeek;
            const cls = [
              styles.week,
              isCurrent ? styles.weekCurrent : '',
              bucket?.graded ? styles.weekGraded : '',
              isSelected ? styles.weekSelected : '',
            ]
              .filter(Boolean)
              .join(' ');
            return (
              <button
                key={w}
                type="button"
                className={cls}
                aria-current={isCurrent ? 'true' : undefined}
                title={termStart ? weekRangeLabel(w, termStart) : `Week ${w}`}
                onClick={() => pickWeek(w)}
              >
                {w}
              </button>
            );
          })}
          <span className={styles.railLegend}>ring = graded due</span>
        </nav>

        <div className={styles.content}>
          {/* Controls: mode + toggles. */}
          <div className={styles.controls}>
            <span className={styles.modeLabel}>
              {mode === 'all' ? 'Weeks 1–16' : `Current · anchored to week ${railCurrent}`}
            </span>
            <span className={styles.controlsRight}>
              {mode === 'current' ? (
                <button type="button" className={tokens.btnGhost} onClick={() => { setMode('all'); setSelectedWeek(1); }}>
                  Show weeks 1–16
                </button>
              ) : (
                <button type="button" className={tokens.btnGhost} onClick={() => { setMode('current'); setSelectedWeek(null); }}>
                  Back to current
                </button>
              )}
            </span>
          </div>

          {/* Session panel — appears on session click. */}
          {selectedSession && (
            <SessionPanel
              session={selectedSession}
              files={filesBySession.get(selectedSession.id) ?? []}
              onClose={() => setSelectedSessionId(null)}
            />
          )}

          {/* Lane headers. */}
          <div className={twoLanes ? styles.laneHead : styles.laneHeadSingle}>
            <span className={styles.laneSpacer} />
            {twoLanes && (
              <span className={styles.laneTitle}>
                Lecture materials <em>sessions · readings · files</em>
              </span>
            )}
            <span className={styles.laneTitle}>
              Assignment materials <em>due · points · status</em>
            </span>
          </div>

          {!twoLanes && (
            <p className={styles.fallback}>
              No class sessions are recorded for this course (an online or internship shell). The
              week map and assignment lane below still apply.
            </p>
          )}

          {/* Earlier-weeks affordance in current mode. */}
          {mode === 'current' && from > 1 && (
            <button
              type="button"
              className={styles.earlier}
              onClick={() => { setMode('all'); setSelectedWeek(from - 1); }}
            >
              ↑ scroll up for weeks 1–{from - 1}
            </button>
          )}

          {/* Week rows. */}
          {visibleWeeks.map((wk) => {
            const isNow = wk.week === railCurrent;
            const rowCls = [
              twoLanes ? styles.weekRow : styles.weekRowSingle,
              wk.week < currentWeek ? styles.weekPast : '',
              wk.week === selectedWeek ? styles.weekRowSelected : '',
            ]
              .filter(Boolean)
              .join(' ');
            return (
              <div
                key={wk.week}
                className={rowCls}
                ref={(el) => { weekRefs.current.set(wk.week, el); }}
              >
                <div className={styles.weekLabel}>
                  <span className={isNow ? styles.weekLabelNow : undefined}>Week {wk.week}</span>
                  {termStart && <span className={styles.weekRange}>{weekRangeLabel(wk.week, termStart)}</span>}
                  {isNow && <span className={styles.nowTag}>this week</span>}
                </div>

                {/* Lecture lane. */}
                {twoLanes && (
                  <div className={styles.lane}>
                    {wk.lectures.map((s) => (
                      <SessionRow
                        key={s.id}
                        session={s}
                        fileCount={(filesBySession.get(s.id) ?? []).length}
                        active={s.id === selectedSessionId}
                        onClick={() => setSelectedSessionId(s.id === selectedSessionId ? null : s.id)}
                      />
                    ))}
                    {wk.readings.map((r) => (
                      <div key={r.item_id ?? r.title} className={styles.readingRow}>
                        <span className={styles.readingDot}>R</span>
                        <span className={styles.readingTitle}>{r.title}</span>
                      </div>
                    ))}
                    {wk.lectures.length === 0 && wk.readings.length === 0 && (
                      <div className={styles.laneEmpty}>No session</div>
                    )}
                  </div>
                )}

                {/* Assignment lane. */}
                <div className={styles.lane}>
                  {wk.assignments.map((a) => (
                    <AssignmentRow key={a.item_id ?? a.title} item={a} termStart={termStart} />
                  ))}
                  {wk.assignments.length === 0 && <div className={styles.laneEmpty}>Nothing due</div>}
                </div>
              </div>
            );
          })}

          {/* Undated items. */}
          {undated.length > 0 && (
            <div className={styles.undated}>
              <div className={styles.weekLabel}>
                <span>No date yet</span>
                <span className={styles.weekRange}>{undated.length} item{undated.length === 1 ? '' : 's'}</span>
              </div>
              <div className={styles.lane}>
                {undated.map((a) => (
                  <AssignmentRow key={a.item_id ?? a.title} item={a} termStart={termStart} />
                ))}
              </div>
            </div>
          )}

          <div className={styles.tail}>
            {visibleWeeks.length > 0 && visibleWeeks[visibleWeeks.length - 1].week < maxWeek
              ? `weeks ${visibleWeeks[visibleWeeks.length - 1].week + 1}–${maxWeek} continue ↓`
              : 'end of semester'}
          </div>
        </div>
      </div>
    </div>
  );
}

function sortByDue(a: WorkItem, b: WorkItem): number {
  const da = workItemDueDate(a) ?? '';
  const db = workItemDueDate(b) ?? '';
  return da.localeCompare(db);
}

/* -- sub-components --------------------------------------------------------- */

function AiPolicyCard({
  policy,
  confidence,
  zeroTolerance,
}: {
  policy: string | null;
  confidence: string | null;
  zeroTolerance: boolean;
}) {
  return (
    <section className={zeroTolerance ? styles.aiCardStrict : styles.aiCard} aria-label="AI policy">
      <div className={styles.aiHead}>
        <span className={tokens.kicker}>AI policy</span>
        {zeroTolerance && <span className={styles.aiBadge}>zero tolerance</span>}
        {confidence && confidence !== 'confirmed' && (
          <span className={styles.aiConfidence}>{confidence}</span>
        )}
      </div>
      {policy ? (
        <p className={styles.aiPolicy}>{policy}</p>
      ) : (
        <p className={styles.aiPolicyMissing}>No AI policy is recorded for this course.</p>
      )}
    </section>
  );
}

function SessionRow({
  session,
  fileCount,
  active,
  onClick,
}: {
  session: Session;
  fileCount: number;
  active: boolean;
  onClick: () => void;
}) {
  const tentative = session.confidence !== 'confirmed';
  const noClass = session.kind === 'no_class';
  return (
    <button
      type="button"
      className={[styles.sessionRow, active ? styles.sessionRowActive : '', noClass ? styles.sessionRowMuted : '']
        .filter(Boolean)
        .join(' ')}
      onClick={onClick}
      aria-pressed={active}
    >
      <span className={styles.avatarLecture}>L</span>
      <span className={styles.sessionBody}>
        <span className={styles.sessionMetaRow}>
          <span className={styles.sessionDate}>{formatDay(session.session_date)}</span>
          {session.kind && session.kind !== 'lecture' && (
            <span className={styles.kindTag}>{session.kind.replace(/_/g, ' ')}</span>
          )}
          {tentative && <span className={styles.tentativeTag}>tentative</span>}
        </span>
        <span className={styles.sessionTitle}>{session.topic ?? 'Untitled session'}</span>
        <span className={styles.sessionSub}>
          {fileCount > 0 ? `${fileCount} file${fileCount === 1 ? '' : 's'}` : 'no files'}
        </span>
      </span>
    </button>
  );
}

function AssignmentRow({ item, termStart }: { item: WorkItem; termStart: string | null }) {
  const due = workItemDueDate(item);
  const glyphCls = GLYPH_CLASS[item.category ?? 'assignment'] ?? styles.avAssignment;
  const tentative = item.confidence && item.confidence !== 'confirmed';
  const points =
    item.points_possible != null ? `${item.points_possible} pt${item.points_possible === 1 ? '' : 's'}` : null;
  return (
    <div className={styles.asgRow}>
      <span className={[styles.avatar, glyphCls].join(' ')}>{item.glyph ?? 'A'}</span>
      <span className={styles.asgBody}>
        <span className={styles.asgMetaRow}>
          <span className={styles.sessionDate}>{due ? formatDay(due) : 'no date'}</span>
          {tentative && <span className={styles.tentativeTag}>tentative</span>}
          <span className={styles.asgStatus}>{statusLabel(item.status)}</span>
        </span>
        <span className={styles.sessionTitle}>{item.title}</span>
        {points && <span className={styles.sessionSub}>{points}</span>}
      </span>
    </div>
  );
}

function SessionPanel({
  session,
  files,
  onClose,
}: {
  session: Session;
  files: string[];
  onClose: () => void;
}) {
  const tentative = session.confidence !== 'confirmed';
  return (
    <section className={styles.panel} aria-label="Session detail">
      <div className={styles.panelHead}>
        <span className={tokens.kicker}>Session</span>
        {session.kind && session.kind !== 'lecture' && (
          <span className={styles.kindTag}>{session.kind.replace(/_/g, ' ')}</span>
        )}
        {tentative && <span className={styles.tentativeTag}>tentative — date/detail inferred</span>}
        <button type="button" className={styles.panelClose} onClick={onClose} aria-label="Close">
          ✕
        </button>
      </div>
      <h2 className={styles.panelTitle}>{session.topic ?? 'Untitled session'}</h2>
      <div className={styles.panelMeta}>
        <span>{formatDay(session.session_date)}</span>
        <span>·</span>
        <span>{files.length} material{files.length === 1 ? '' : 's'}</span>
      </div>
      {files.length > 0 && (
        <ul className={styles.panelFiles}>
          {files.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
      )}
      {session.notes && <p className={styles.panelNotes}>{session.notes}</p>}
    </section>
  );
}

'use client';

/**
 * The course timeline (R3-4) — the Stream tab's body since round 3, and the
 * one place the week-rail two-lane view lives (it used to be Classwork's
 * `?view=timeline`, `classwork/CourseScreen.tsx`).
 *
 * A sticky week rail 1–16 beside week rows. Each week row has two lanes:
 *
 *   left   class sessions (their lecture files listed beneath each), the
 *          readings for the week, and announcements on the day they were
 *          posted, behind a bell so they read apart from classes
 *   right  assignments on their due dates, each with the files linked to it
 *          and the status select, which writes through `useSetItemStatus`
 *
 * An online shell with nothing for the left lane gets one lane. Undated work
 * is listed after the weeks. Nothing here is computed that the rows do not
 * carry: no invented dates, counts or points.
 *
 * The lanes are drawn only once every source has answered. An empty lane, "no
 * files" or "No class sessions … are recorded" is a claim about the course, so
 * while any source is in flight the pane says it is loading, and when one
 * fails it names what could not be loaded and draws no lanes at all.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import tokens from '@/styles/tokens.module.css';
import {
  RAIL_WEEKS,
  splitVanishedRows,
  useContentTree,
  useCourseDisplay,
  useCourseSessions,
  useCourseShells,
  useCourseStream,
  useCourseWorkItems,
  useTerm,
  weekNumberFor,
  weekRangeLabel,
  type WorkItem,
} from '@/lib/queries.course';
import { useSetItemStatus } from '@/lib/queries.today';
import type { ProgressStatus } from '@/lib/queries';
import { isQueryLoading, queryErrorMessage, type QueryLike } from '@/components/shared/QueryState';
import { buildTimeline, filesByAssignment, filesBySession, type TimelineFile } from './timeline-model';
import { useCourseTimelineFiles } from './timeline-queries';
import { AnnouncementRow, AssignmentRow, SessionPanel, SessionRow, TimelineFiles } from './TimelineRows';
import styles from './CourseTimeline.module.css';

const NO_FILES: readonly TimelineFile[] = [];

export function CourseTimeline({ courseId }: { courseId: string }) {
  const display = useCourseDisplay(courseId);
  const shellIds = useMemo(() => display.data?.shell_ids ?? [], [display.data]);

  const shells = useCourseShells(shellIds);
  const term = useTerm(shells.data?.[0]?.term_id);
  const sessionsQ = useCourseSessions(shellIds);
  const workItemsQ = useCourseWorkItems(shellIds);
  const filesQ = useCourseTimelineFiles(shellIds);
  const treeQ = useContentTree(shellIds);
  const streamQ = useCourseStream(shellIds);
  const setStatus = useSetItemStatus();

  const [mode, setMode] = useState<'current' | 'all'>('current');
  const [selectedWeek, setSelectedWeek] = useState<number | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(null);

  const termStart = term.data?.start_date ?? null;
  const sessions = useMemo(() => sessionsQ.data ?? [], [sessionsQ.data]);
  const workItems = useMemo(() => workItemsQ.data ?? [], [workItemsQ.data]);
  const announcements = useMemo(
    () => (streamQ.data ?? []).filter((row) => row.post_kind === 'announcement'),
    [streamQ.data],
  );

  const { weeks, maxWeek, undated, leftLaneItems } = useMemo(
    () => buildTimeline({ sessions, workItems, announcements, termStart }),
    [sessions, workItems, announcements, termStart],
  );
  const bySession = useMemo(() => filesBySession(filesQ.data ?? []), [filesQ.data]);
  const byAssignment = useMemo(
    // Ghost and stale content nodes do not lend their files to an assignment.
    () => filesByAssignment(filesQ.data ?? [], splitVanishedRows(treeQ.data ?? []).live),
    [filesQ.data, treeQ.data],
  );

  const todayISO = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  const currentWeek = termStart ? Math.min(maxWeek, weekNumberFor(todayISO, termStart)) : 1;
  const railCurrent = Math.min(RAIL_WEEKS, Math.max(1, currentWeek));
  const from = mode === 'all' ? 1 : Math.min(currentWeek, maxWeek);
  const visibleWeeks = mode === 'all' ? weeks : weeks.filter((w) => w.week >= from);
  const twoLanes = leftLaneItems > 0;

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

  function changeStatus(item: WorkItem, status: ProgressStatus) {
    if (!item.item_id || (item.item_kind !== 'assignment' && item.item_kind !== 'reading')) return;
    setStatus.mutate({ item: { item_kind: item.item_kind, item_id: item.item_id }, status });
  }
  const pendingId = setStatus.isPending ? setStatus.variables?.item.item_id ?? null : null;

  const sources: { query: QueryLike; of: string }[] = [
    { query: sessionsQ, of: 'the class sessions' },
    { query: workItemsQ, of: 'the assignments and readings' },
    { query: streamQ, of: 'the announcements' },
    { query: filesQ, of: 'the files' },
    { query: treeQ, of: 'the content links' },
  ];
  const failures = sources.filter(({ query }) => query.isError);
  const loading = sources.some(({ query }) => isQueryLoading(query));

  const assignmentRow = (item: WorkItem) => (
    <AssignmentRow
      key={item.item_id ?? item.title}
      item={item}
      files={(item.item_id && byAssignment.get(item.item_id)) || NO_FILES}
      onStatusChange={changeStatus}
      pending={pendingId != null && pendingId === item.item_id}
    />
  );

  if (display.isPending || (shellIds.length > 0 && term.isPending)) {
    return <p className={styles.state}>Loading the timeline…</p>;
  }
  if (display.isError) return <p className={styles.state}>Could not load this course.</p>;
  if (!display.data) return <p className={styles.state}>No course with id {courseId}.</p>;

  const selectedSession = selectedSessionId
    ? sessions.find((s) => s.id === selectedSessionId) ?? null
    : null;

  return (
    <section className={styles.screen} aria-label="Course timeline">
      <div className={styles.layout}>
        <nav className={styles.rail} aria-label="Weeks">
          <span className={tokens.kicker}>wk</span>
          {Array.from({ length: RAIL_WEEKS }, (_, i) => i + 1).map((w) => {
            const cls = [
              styles.week,
              w === railCurrent ? styles.weekCurrent : '',
              weeks[w - 1]?.graded ? styles.weekGraded : '',
              w === selectedWeek ? styles.weekSelected : '',
            ]
              .filter(Boolean)
              .join(' ');
            return (
              <button
                key={w}
                type="button"
                className={cls}
                aria-current={w === railCurrent ? 'true' : undefined}
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

          {failures.length > 0 ? (
            <div className={styles.state} role="alert">
              {failures.map(({ query, of }) => (
                <p key={of} className={styles.stateLine}>
                  Could not load {of}: {queryErrorMessage(query.error)}
                </p>
              ))}
            </div>
          ) : loading ? (
            <p className={styles.state}>Loading the timeline…</p>
          ) : (
            <>
            {selectedSession && (
              <SessionPanel
                session={selectedSession}
                files={(bySession.get(selectedSession.id) ?? []).map((f) => f.file_name ?? 'Untitled file')}
                onClose={() => setSelectedSessionId(null)}
              />
            )}

            <div className={twoLanes ? styles.laneHead : styles.laneHeadSingle}>
              <span className={styles.laneSpacer} />
              {twoLanes && (
                <span className={styles.laneTitle}>
                  Classes <em>sessions · files · announcements</em>
                </span>
              )}
              <span className={styles.laneTitle}>
                Assignments <em>due · files · status</em>
              </span>
            </div>

            {!twoLanes && (
              <p className={styles.fallback}>
                No class sessions or announcements are recorded for this course (an online or
                internship shell). The assignment lane below still applies.
              </p>
            )}

            {mode === 'current' && from > 1 && (
              <button
                type="button"
                className={styles.earlier}
                onClick={() => { setMode('all'); setSelectedWeek(from - 1); }}
              >
                ↑ scroll up for weeks 1–{from - 1}
              </button>
            )}

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
                  data-week={wk.week}
                  ref={(el) => { weekRefs.current.set(wk.week, el); }}
                >
                  <div className={styles.weekLabel}>
                    <span className={isNow ? styles.weekLabelNow : undefined}>Week {wk.week}</span>
                    {termStart && <span className={styles.weekRange}>{weekRangeLabel(wk.week, termStart)}</span>}
                    {isNow && <span className={styles.nowTag}>this week</span>}
                  </div>

                  {twoLanes && (
                    <div className={styles.lane} data-lane="sessions">
                      {wk.left.map((entry) =>
                        entry.kind === 'session' ? (
                          <div key={`s${entry.session.id}`} className={styles.sessionGroup}>
                            <SessionRow
                              session={entry.session}
                              fileCount={(bySession.get(entry.session.id) ?? []).length}
                              active={entry.session.id === selectedSessionId}
                              onClick={() =>
                                setSelectedSessionId(entry.session.id === selectedSessionId ? null : entry.session.id)
                              }
                            />
                            {/* The session's lecture files, listed under its row. */}
                            <TimelineFiles files={bySession.get(entry.session.id) ?? NO_FILES} />
                          </div>
                        ) : (
                          <AnnouncementRow key={`a${entry.post.ref_id}`} post={entry.post} day={entry.date} />
                        ),
                      )}
                      {wk.readings.map((r) => (
                        <div key={r.item_id ?? r.title} className={styles.readingRow}>
                          <span className={styles.readingDot}>R</span>
                          <span className={styles.readingTitle}>{r.title}</span>
                        </div>
                      ))}
                      {wk.left.length === 0 && wk.readings.length === 0 && (
                        <div className={styles.laneEmpty}>No session</div>
                      )}
                    </div>
                  )}

                  <div className={styles.lane} data-lane="assignments">
                    {wk.assignments.map(assignmentRow)}
                    {wk.assignments.length === 0 && <div className={styles.laneEmpty}>Nothing due</div>}
                  </div>
                </div>
              );
            })}

            {undated.length > 0 && (
              <div className={styles.undated}>
                <div className={styles.weekLabel}>
                  <span>No date yet</span>
                  <span className={styles.weekRange}>{undated.length} item{undated.length === 1 ? '' : 's'}</span>
                </div>
                <div className={styles.lane} data-lane="assignments">
                  {undated.map(assignmentRow)}
                </div>
              </div>
            )}

            <div className={styles.tail}>
              {visibleWeeks.length > 0 && visibleWeeks[visibleWeeks.length - 1].week < maxWeek
                ? `weeks ${visibleWeeks[visibleWeeks.length - 1].week + 1}–${maxWeek} continue ↓`
                : 'end of semester'}
            </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

/**
 * The course timeline's model (R3-4): which week and lane each thing lands in.
 *
 * Pure: no React, no queries. The week arithmetic is the one the week rail has
 * always used (`weekNumberFor`, Monday-anchored from the term start), so a
 * session, an announcement and an assignment on the same calendar day always
 * share a week row.
 *
 *   left lane   sessions (by `week_no`) and announcements (by the New York day
 *               they were posted), in date order, sessions first on a tie;
 *               readings stay under them as before
 *   right lane  assignments by due date
 *   undated     work items with no date, listed after the weeks
 */

import {
  RAIL_WEEKS,
  streamDayKey,
  weekNumberFor,
  workItemDueDate,
  type ContentTreeRow,
  type CourseStreamRow,
  type Session,
  type WorkItem,
} from '@/lib/queries.course';
import { UNKNOWN_ROUTE, type RouteValue } from '@/lib/queries.materials';

/** A file the timeline lists, with the three routes the Open ladder reads. */
export interface TimelineFile {
  id: number;
  session_id: number | null;
  assignment_id: string | null;
  file_name: string | null;
  bucket: string | null;
  mime_type: string | null;
  storage_path: RouteValue;
  source_url: RouteValue;
  local_path: RouteValue;
}

export type LeftEntry =
  | { kind: 'session'; date: string; session: Session }
  | { kind: 'announcement'; date: string; post: CourseStreamRow };

export interface TimelineWeek {
  week: number;
  lectures: Session[];
  readings: WorkItem[];
  announcements: CourseStreamRow[];
  assignments: WorkItem[];
  /** Sessions and announcements merged in date order. */
  left: LeftEntry[];
  /** Has an assignment due: the rail's ring. */
  graded: boolean;
}

export interface Timeline {
  weeks: TimelineWeek[];
  maxWeek: number;
  undated: WorkItem[];
  /** Anything that would fill the left lane; 0 means one lane (an online shell). */
  leftLaneItems: number;
}

function sortByDue(a: WorkItem, b: WorkItem): number {
  return (workItemDueDate(a) ?? '').localeCompare(workItemDueDate(b) ?? '');
}

function pushTo<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

function leftEntries(lectures: Session[], announcements: CourseStreamRow[]): LeftEntry[] {
  const entries: LeftEntry[] = [
    ...lectures.map((session): LeftEntry => ({ kind: 'session', date: session.session_date, session })),
    ...announcements.map(
      (post): LeftEntry => ({ kind: 'announcement', date: streamDayKey(post.posted_at), post }),
    ),
  ];
  return entries.sort((a, b) => {
    const byDate = a.date.localeCompare(b.date);
    if (byDate !== 0) return byDate;
    if (a.kind !== b.kind) return a.kind === 'session' ? -1 : 1;
    return 0;
  });
}

export function buildTimeline(input: {
  sessions: Session[];
  workItems: WorkItem[];
  announcements: CourseStreamRow[];
  termStart: string | null;
}): Timeline {
  const { sessions, workItems, announcements, termStart } = input;
  let maxWeek = RAIL_WEEKS;
  const seeWeek = (week: number | null | undefined) => {
    if (week && week > maxWeek) maxWeek = week;
  };

  const sessionWeeks = new Map<number, Session[]>();
  for (const session of sessions) {
    const week = session.week_no ?? 0;
    if (week < 1) continue;
    seeWeek(week);
    pushTo(sessionWeeks, week, session);
  }

  const readingWeeks = new Map<number, WorkItem[]>();
  const assignmentWeeks = new Map<number, WorkItem[]>();
  const undated: WorkItem[] = [];
  for (const item of workItems) {
    const due = termStart ? workItemDueDate(item) : null;
    if (!due || !termStart) {
      undated.push(item);
      continue;
    }
    const week = weekNumberFor(due, termStart);
    seeWeek(week);
    pushTo(item.item_kind === 'reading' ? readingWeeks : assignmentWeeks, week, item);
  }

  const announcementWeeks = new Map<number, CourseStreamRow[]>();
  if (termStart) {
    for (const post of announcements) {
      const week = weekNumberFor(streamDayKey(post.posted_at), termStart);
      seeWeek(week);
      pushTo(announcementWeeks, week, post);
    }
  }

  const weeks: TimelineWeek[] = [];
  for (let week = 1; week <= maxWeek; week++) {
    const lectures = (sessionWeeks.get(week) ?? [])
      .slice()
      .sort((a, b) => a.session_date.localeCompare(b.session_date));
    const posts = (announcementWeeks.get(week) ?? [])
      .slice()
      .sort((a, b) => a.posted_at.localeCompare(b.posted_at));
    const assignments = (assignmentWeeks.get(week) ?? []).slice().sort(sortByDue);
    weeks.push({
      week,
      lectures,
      readings: (readingWeeks.get(week) ?? []).slice().sort(sortByDue),
      announcements: posts,
      assignments,
      left: leftEntries(lectures, posts),
      graded: assignments.length > 0,
    });
  }

  const readings = workItems.filter((item) => item.item_kind === 'reading').length;
  return {
    weeks,
    maxWeek,
    undated,
    leftLaneItems: sessions.length + readings + (termStart ? announcements.length : 0),
  };
}

/** Files pinned to a session, by session id. */
export function filesBySession(files: readonly TimelineFile[]): Map<number, TimelineFile[]> {
  const map = new Map<number, TimelineFile[]>();
  for (const file of files) {
    if (file.session_id != null) pushTo(map, file.session_id, file);
  }
  return map;
}

/**
 * Files linked to an assignment, by assignment id: a file whose
 * `bb_files.assignment_id` names it, then a file on the Blackboard content node
 * that links it (`v_content_tree`). A file linked both ways is listed once. The
 * tree carries `storage_path` only, so its other two routes are unknown.
 */
export function filesByAssignment(
  files: readonly TimelineFile[],
  treeRows: readonly ContentTreeRow[],
): Map<string, TimelineFile[]> {
  const map = new Map<string, TimelineFile[]>();
  const seen = new Set<string>();
  const add = (assignmentId: string, file: TimelineFile) => {
    const key = `${assignmentId} ${file.id}`;
    if (seen.has(key)) return;
    seen.add(key);
    pushTo(map, assignmentId, file);
  };

  for (const file of files) {
    if (file.assignment_id) add(file.assignment_id, file);
  }
  for (const row of treeRows) {
    if (!row.assignment_id || row.file_id == null) continue;
    add(row.assignment_id, {
      id: row.file_id,
      session_id: null,
      assignment_id: row.assignment_id,
      file_name: row.file_name,
      bucket: row.bucket,
      mime_type: null,
      storage_path: row.storage_path,
      source_url: UNKNOWN_ROUTE,
      local_path: UNKNOWN_ROUTE,
    });
  }
  return map;
}

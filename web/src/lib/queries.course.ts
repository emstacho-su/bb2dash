/**
 * Course-page (W-6) query layer.
 *
 * Follows the same conventions as `queries.ts` (see its header) but lives in
 * its own file so the W-6 screen can add queries without editing the shared
 * layer. Row types come from the generated `database.types.ts` via the `Tables`
 * / `Views` helpers re-exported from `queries.ts`; nothing here hand-writes a
 * table shape.
 *
 * The course page reads seven things and merges shells for display courses that
 * span more than one Blackboard shell (GEO 103 = lecture + recitation):
 *   - v_course_display  one row per *display* course (merged meetings, bb_url)
 *   - courses           the underlying shells (locations, term_id)
 *   - terms             start_date, so week 1 = the week of start_date
 *   - sessions          lecture lane, carries week_no + session_date + topic
 *   - v_work_items      assignment lane + readings, effort/glyph precomputed
 *   - grading_schemes   the AI policy shown verbatim
 *   - bb_files          harvested files, counted per session
 */

import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { getSupabaseBrowserClient } from './supabase/client';
import type { Tables, Views } from './queries';
import { COURSE_WORK_ITEMS_KEY } from './progress-cache';
import {
  normalizeCardNote,
  validateCardNote,
  type CourseStreamRow,
  type ContentTreeRow,
} from './course-dimension';

/**
 * `v_course_stream`, `v_content_tree` and `courses.card_note` landed with
 * migrations 026-028 and `database.types.ts` was regenerated at Phase 8
 * integration, so every query here uses the ordinary typed client.
 *
 * The two view row types stay hand-narrowed (`CourseStreamRow`,
 * `ContentTreeRow` in `course-dimension.ts`): Postgres reports no not-null
 * constraints on a view, so the generated row types make every column
 * nullable, and the frozen contract in
 * `docs/planning/61_PHASE8_course_dimension.md` is stricter than that. Each of
 * those two reads therefore carries one documented cast at the call site — no
 * field is reshaped, and nothing else in this module needs one.
 */

export type CourseDisplay = Views<'v_course_display'>;
export type WorkItem = Views<'v_work_items'>;
export type Session = Tables<'sessions'>;
export type GradingScheme = Tables<'grading_schemes'>;
export type Term = Tables<'terms'>;

/** One weekly meeting slot inside `v_course_display.meetings` (jsonb array). */
export type MeetingSlot = {
  day: number; // 0 = Sunday … 6 = Saturday (meetings.day_of_week)
  start: string | null; // "HH:MM:SS"
  end: string | null;
  room: string | null;
};

/**
 * The shell columns the course screens read: the room-dispute check needs
 * `location`, the week rail needs `term_id`, and the Info tab needs both notes.
 * One query, one cache — `card_note` used to be fetched separately because it
 * arrived in a later migration than this query; that migration is applied, so
 * the split only bought a second copy of the same `courses` rows.
 */
export type CourseShell = Pick<
  Tables<'courses'>,
  'id' | 'location' | 'term_id' | 'kind' | 'group_notes' | 'card_note'
>;

const COURSE_SHELL_COLUMNS = 'id, location, term_id, kind, group_notes, card_note';

/** The `session_id`-bearing subset of bb_files the panel needs. */
export type SessionFile = Pick<
  Tables<'bb_files'>,
  'id' | 'session_id' | 'file_name' | 'bucket'
>;

/* ---------------------------------------------------------------------------
 * Cache keys
 * ------------------------------------------------------------------------ */

/** Stable, greppable key for a set of shells (order-independent). */
function shellKey(shellIds: string[]): string {
  return [...shellIds].sort().join('+');
}

export const courseQueryKeys = {
  display: (courseId: string) => ['course-display', courseId] as const,
  shells: (shellIds: string[]) => ['course-shells', shellKey(shellIds)] as const,
  term: (termId: string) => ['term', termId] as const,
  sessions: (shellIds: string[]) => ['course-sessions', shellKey(shellIds)] as const,
  workItems: (shellIds: string[]) => [...COURSE_WORK_ITEMS_KEY, shellKey(shellIds)] as const,
  gradingScheme: (shellIds: string[]) => ['course-grading-scheme', shellKey(shellIds)] as const,
  sessionFiles: (shellIds: string[]) => ['course-session-files', shellKey(shellIds)] as const,
  stream: (shellIds: string[]) => ['course-stream', shellKey(shellIds)] as const,
  contentTree: (shellIds: string[]) => ['course-content-tree', shellKey(shellIds)] as const,
  staff: (shellIds: string[]) => ['course-staff', shellKey(shellIds)] as const,
} as const;

/* ---------------------------------------------------------------------------
 * Queries
 * ------------------------------------------------------------------------ */

/**
 * The merged display row for a course. Resolves whether the route id is the
 * display id ('GEO.103.lecture') or a child shell ('GEO.103.recitation') by
 * also matching on the shell_ids array, so a link to either shell lands on the
 * one merged page.
 */
export function courseDisplayOptions(courseId: string) {
  return queryOptions({
    queryKey: courseQueryKeys.display(courseId),
    queryFn: async (): Promise<CourseDisplay | null> => {
      const supabase = getSupabaseBrowserClient();
      const { data, error } = await supabase
        .from('v_course_display')
        .select('*')
        .or(`display_id.eq.${courseId},shell_ids.cs.{${courseId}}`)
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    staleTime: 30 * 60 * 1000,
  });
}

/**
 * The underlying shells: locations (for the room-dispute check), term_id, and
 * the two free-text notes the Info tab renders — `group_notes` (synced,
 * verbatim) and `card_note` (Stack's own one-liner, R-04).
 */
export function courseShellsOptions(shellIds: string[]) {
  return queryOptions({
    queryKey: courseQueryKeys.shells(shellIds),
    queryFn: async (): Promise<CourseShell[]> => {
      const supabase = getSupabaseBrowserClient();
      const { data, error } = await supabase
        .from('courses')
        .select(COURSE_SHELL_COLUMNS)
        .in('id', shellIds);
      if (error) throw error;
      return data ?? [];
    },
    enabled: shellIds.length > 0,
    staleTime: 30 * 60 * 1000,
  });
}

/** One term row — the week rail is derived from `start_date`. */
export function termOptions(termId: string | undefined) {
  return queryOptions({
    queryKey: courseQueryKeys.term(termId ?? 'none'),
    queryFn: async (): Promise<Term | null> => {
      const supabase = getSupabaseBrowserClient();
      const { data, error } = await supabase
        .from('terms')
        .select('*')
        .eq('id', termId as string)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: Boolean(termId),
    staleTime: 60 * 60 * 1000,
  });
}

/** Every session across the display course's shells, oldest first. */
export function courseSessionsOptions(shellIds: string[]) {
  return queryOptions({
    queryKey: courseQueryKeys.sessions(shellIds),
    queryFn: async (): Promise<Session[]> => {
      const supabase = getSupabaseBrowserClient();
      const { data, error } = await supabase
        .from('sessions')
        .select('*')
        .in('course_id', shellIds)
        .order('session_date', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: shellIds.length > 0,
    staleTime: 15 * 60 * 1000,
  });
}

/** Work items (assignments + readings) across the display course's shells. */
export function courseWorkItemsOptions(shellIds: string[]) {
  return queryOptions({
    queryKey: courseQueryKeys.workItems(shellIds),
    queryFn: async (): Promise<WorkItem[]> => {
      const supabase = getSupabaseBrowserClient();
      const { data, error } = await supabase
        .from('v_work_items')
        .select('*')
        .in('course_id', shellIds);
      if (error) throw error;
      return data ?? [];
    },
    enabled: shellIds.length > 0,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * The grading scheme for the display course. A merged course keys its scheme on
 * one shell (GEO on the lecture shell); we take whichever shell has one.
 */
export function courseGradingSchemeOptions(shellIds: string[]) {
  return queryOptions({
    queryKey: courseQueryKeys.gradingScheme(shellIds),
    queryFn: async (): Promise<GradingScheme | null> => {
      const supabase = getSupabaseBrowserClient();
      const { data, error } = await supabase
        .from('grading_schemes')
        .select('*')
        .in('course_id', shellIds);
      if (error) throw error;
      if (!data || data.length === 0) return null;
      // Prefer a scheme with an ai_policy; otherwise the first row.
      return data.find((s) => s.ai_policy) ?? data[0];
    },
    enabled: shellIds.length > 0,
    staleTime: 30 * 60 * 1000,
  });
}

/** Harvested files that are pinned to a session, for the per-session count. */
export function courseSessionFilesOptions(shellIds: string[]) {
  return queryOptions({
    queryKey: courseQueryKeys.sessionFiles(shellIds),
    queryFn: async (): Promise<SessionFile[]> => {
      const supabase = getSupabaseBrowserClient();
      const { data, error } = await supabase
        .from('bb_files')
        .select('id, session_id, file_name, bucket')
        .in('course_id', shellIds)
        .not('session_id', 'is', null);
      if (error) throw error;
      return data ?? [];
    },
    enabled: shellIds.length > 0,
    staleTime: 15 * 60 * 1000,
  });
}

/* ---------------------------------------------------------------------------
 * Hooks
 * ------------------------------------------------------------------------ */

export function useCourseDisplay(courseId: string) {
  return useQuery(courseDisplayOptions(courseId));
}
export function useCourseShells(shellIds: string[]) {
  return useQuery(courseShellsOptions(shellIds));
}
export function useTerm(termId: string | undefined) {
  return useQuery(termOptions(termId));
}
export function useCourseSessions(shellIds: string[]) {
  return useQuery(courseSessionsOptions(shellIds));
}
export function useCourseWorkItems(shellIds: string[]) {
  return useQuery(courseWorkItemsOptions(shellIds));
}
export function useCourseGradingScheme(shellIds: string[]) {
  return useQuery(courseGradingSchemeOptions(shellIds));
}
export function useCourseSessionFiles(shellIds: string[]) {
  return useQuery(courseSessionFilesOptions(shellIds));
}

/* ---------------------------------------------------------------------------
 * Display helpers — pure functions, unit-testable, no React
 * ------------------------------------------------------------------------ */

/** Total weeks on the rail. The rail is fixed 1–16 per the layout spec. */
export const RAIL_WEEKS = 16;

const DAY_LETTERS = ['Su', 'M', 'T', 'W', 'Th', 'F', 'Sa'];

/** UTC midnight for a 'YYYY-MM-DD' date string (TZ-stable arithmetic). */
function utcMidnight(dateISO: string): number {
  const [y, m, d] = dateISO.split('-').map(Number);
  return Date.UTC(y, (m ?? 1) - 1, d ?? 1);
}

/** Milliseconds of the Monday that opens `dateISO`'s week. */
function mondayOfWeek(ms: number): number {
  const dow = new Date(ms).getUTCDay(); // 0=Sun … 6=Sat
  const back = (dow + 6) % 7; // days since Monday
  return ms - back * 86_400_000;
}

/**
 * Week number (1-based) of a date within a term, where week 1 is the week that
 * contains `start_date`. Weeks run Monday→Sunday, so a weekend due date lands in
 * the same week as its Monday. Returns at least 1.
 */
export function weekNumberFor(dateISO: string, termStartISO: string): number {
  const start = mondayOfWeek(utcMidnight(termStartISO));
  const target = mondayOfWeek(utcMidnight(dateISO));
  const weeks = Math.round((target - start) / (7 * 86_400_000));
  return Math.max(1, weeks + 1);
}

/** The Monday-anchored date range label for a rail week, e.g. "Sep 7 – 11". */
export function weekRangeLabel(week: number, termStartISO: string): string {
  const start = mondayOfWeek(utcMidnight(termStartISO)) + (week - 1) * 7 * 86_400_000;
  const end = start + 4 * 86_400_000; // Mon–Fri span
  const fmt = (ms: number, withMonth: boolean) => {
    const dt = new Date(ms);
    const mon = dt.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
    const day = dt.getUTCDate();
    return withMonth ? `${mon} ${day}` : `${day}`;
  };
  const sameMonth = new Date(start).getUTCMonth() === new Date(end).getUTCMonth();
  return `${fmt(start, true)} – ${fmt(end, !sameMonth)}`;
}

/** The date a work item is due, as 'YYYY-MM-DD' in America/New_York, or null. */
export function workItemDueDate(item: WorkItem): string | null {
  if (item.due_on) return item.due_on;
  if (item.due_at) {
    // en-CA renders ISO-ordered Y-M-D; scope to the course's local zone.
    return new Date(item.due_at).toLocaleDateString('en-CA', {
      timeZone: 'America/New_York',
    });
  }
  return null;
}

/** "15:45:00" → "3:45p". Null-safe. */
export function formatClock(t: string | null): string {
  if (!t) return '';
  const [hRaw, m] = t.split(':');
  let h = Number(hRaw);
  const suffix = h >= 12 ? 'p' : 'a';
  h = h % 12;
  if (h === 0) h = 12;
  return m === '00' ? `${h}${suffix}` : `${h}:${m}${suffix}`;
}

/** A collapsed weekly meeting pattern, e.g. "MW 3:45–5:05p · Hinds Hall 010". */
export type MeetingPattern = { days: string; time: string; room: string | null };

/**
 * Collapse the jsonb meetings array into one line per distinct (time, room):
 * days that share a time and room are merged ("MW", "TTh", "MWF").
 */
export function meetingPatterns(meetings: unknown): MeetingPattern[] {
  if (!Array.isArray(meetings)) return [];
  const slots = meetings as MeetingSlot[];
  const groups = new Map<string, { days: number[]; start: string | null; end: string | null; room: string | null }>();
  for (const s of slots) {
    const key = `${s.start ?? ''}|${s.end ?? ''}|${s.room ?? ''}`;
    const g = groups.get(key);
    if (g) g.days.push(s.day);
    else groups.set(key, { days: [s.day], start: s.start, end: s.end, room: s.room });
  }
  return [...groups.values()]
    .sort((a, b) => Math.min(...a.days) - Math.min(...b.days))
    .map((g) => {
      const days = [...g.days].sort((a, b) => a - b).map((d) => DAY_LETTERS[d] ?? '?').join('');
      const start = formatClock(g.start);
      const end = formatClock(g.end);
      // Drop the am/pm on the start when it matches the end (e.g. 3:45–5:05p).
      const startTrim =
        start && end && start.slice(-1) === end.slice(-1) ? start.slice(0, -1) : start;
      const time = start && end ? `${startTrim}–${end}` : start || end;
      return { days, time, room: g.room };
    });
}

/** Normalize a room string so cosmetic variants compare equal. */
function normalizeRoom(room: string | null | undefined): string {
  if (!room) return '';
  return room
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ') // drop parentheticals like "(LSB)"
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * `v_course_display.room_disputed` flags any string difference between a shell's
 * `location` and its meeting `location`. That fires on cosmetic variants too
 * (ECN 304: "Life Sciences Building (LSB) 001" vs "…Building 001" — same room).
 * A dispute is only *real* when a meeting room, once normalized, matches no
 * shell location on file (GEO 103: room 108 on file vs confirmed room 140).
 */
export function realRoomDispute(
  roomDisputed: boolean | null,
  meetings: unknown,
  shellLocations: (string | null)[],
): boolean {
  if (!roomDisputed) return false;
  const known = new Set(shellLocations.map(normalizeRoom).filter(Boolean));
  const rooms = meetingPatterns(meetings)
    .map((p) => normalizeRoom(p.room))
    .filter(Boolean);
  if (rooms.length === 0) return false;
  return rooms.some((r) => !known.has(r));
}

/**
 * A verbatim AI policy reads as "zero tolerance" when it forbids AI outright at
 * every stage. IST 352 is the one such course; surface it prominently.
 */
export function isZeroToleranceAiPolicy(policy: string | null | undefined): boolean {
  if (!policy) return false;
  return /zero[\s-]?tolerance/i.test(policy);
}

/* ===========================================================================
 * Phase 8 — course dimension (stream, classwork tree, staff, card note)
 *
 * The row types and the pure grouping helpers live in `course-dimension.ts`
 * (the relations land with migrations 026-028, so their shapes are still
 * hand-declared). They are re-exported here so screens have one import.
 * ======================================================================== */

export type {
  ContentFile,
  ContentNode,
  ContentTreeRow,
  CourseStreamMeta,
  CourseStreamRow,
  StreamDay,
  StreamPostKind,
  StreamRefKind,
} from './course-dimension';
export {
  CARD_NOTE_MAX_LENGTH,
  COURSE_TIME_ZONE,
  DUE_WINDOW_DAYS,
  NOT_RECORDED,
  courseToday,
  filterStreamRows,
  groupContentTree,
  groupStreamByDay,
  isFolderNode,
  normalizeCardNote,
  orNotRecorded,
  streamDayKey,
  ultraStateLabel,
  validateCardNote,
} from './course-dimension';

/** The staff columns the Info tab shows. */
export type CourseStaff = Pick<
  Tables<'course_staff'>,
  'id' | 'course_id' | 'name' | 'role' | 'email' | 'office' | 'office_hours'
>;

const STREAM_COLUMNS = 'course_id, post_kind, posted_at, ref_kind, ref_id, title, body, meta';

const CONTENT_TREE_COLUMNS =
  'course_id, content_id, parent_id, bb_item_id, path, depth, title, item_kind, bb_type, ' +
  'state, url, modified_at, assignment_id, file_id, file_name, storage_path, bucket';

const COURSE_STAFF_COLUMNS = 'id, course_id, name, role, email, office, office_hours';

/* ---------------------------------------------------------------------------
 * Phase 8 queries
 * ------------------------------------------------------------------------ */

/**
 * The Stream feed for a display course: every post across its shells, newest
 * first. The +/-14-day window on `assignment_due` rows is a client filter (see
 * `filterStreamRows`) so the same fetch can also feed a wider view later.
 */
export function courseStreamOptions(shellIds: string[]) {
  return queryOptions({
    queryKey: courseQueryKeys.stream(shellIds),
    queryFn: async (): Promise<CourseStreamRow[]> => {
      const supabase = getSupabaseBrowserClient();
      const { data, error } = await supabase
        .from('v_course_stream')
        .select(STREAM_COLUMNS)
        .in('course_id', shellIds)
        .order('posted_at', { ascending: false });
      if (error) throw error;
      // Narrowed to the frozen contract — see the module header.
      return (data ?? []) as unknown as CourseStreamRow[];
    },
    enabled: shellIds.length > 0,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Blackboard's own folder tree for a display course, ordered by `path` — which
 * puts a folder ahead of its children by construction. A node with several
 * files yields several rows; `groupContentTree` folds them back together.
 */
export function contentTreeOptions(shellIds: string[]) {
  return queryOptions({
    queryKey: courseQueryKeys.contentTree(shellIds),
    queryFn: async (): Promise<ContentTreeRow[]> => {
      const supabase = getSupabaseBrowserClient();
      const { data, error } = await supabase
        .from('v_content_tree')
        .select(CONTENT_TREE_COLUMNS)
        .in('course_id', shellIds)
        .order('path', { ascending: true });
      if (error) throw error;
      // Narrowed to the frozen contract — see the module header.
      return (data ?? []) as unknown as ContentTreeRow[];
    },
    enabled: shellIds.length > 0,
    staleTime: 15 * 60 * 1000,
  });
}

/** Instructors and TAs recorded for the display course's shells. */
export function courseStaffOptions(shellIds: string[]) {
  return queryOptions({
    queryKey: courseQueryKeys.staff(shellIds),
    queryFn: async (): Promise<CourseStaff[]> => {
      const supabase = getSupabaseBrowserClient();
      const { data, error } = await supabase
        .from('course_staff')
        .select(COURSE_STAFF_COLUMNS)
        .in('course_id', shellIds)
        .order('role', { ascending: true })
        .order('name', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: shellIds.length > 0,
    staleTime: 30 * 60 * 1000,
  });
}

export function useCourseStream(shellIds: string[]) {
  return useQuery(courseStreamOptions(shellIds));
}
export function useContentTree(shellIds: string[]) {
  return useQuery(contentTreeOptions(shellIds));
}
export function useCourseStaff(shellIds: string[]) {
  return useQuery(courseStaffOptions(shellIds));
}

/* ---------------------------------------------------------------------------
 * Card note (R-04) — the one writable field on the course page
 * ------------------------------------------------------------------------ */

/**
 * Write the course card note. `courseId` is a single shell id — the display
 * course's parent shell (`v_course_display.display_id`), which is where the
 * Home card reads it from. Returns the value actually stored so the caller can
 * show the normalized text without a refetch.
 */
export async function updateCardNote(
  courseId: string,
  note: string | null,
): Promise<string | null> {
  if (!courseId) throw new Error('updateCardNote: courseId is required');
  const value = validateCardNote(note);
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.from('courses').update({ card_note: value }).eq('id', courseId);
  if (error) throw error;
  return value;
}

/** The two caches that carry a course's `card_note`. */
const CARD_NOTE_CACHE_KEYS: readonly (readonly unknown[])[] = [
  ['course-shells'],
  ['course-display'],
];

/** A cached row that may carry the note, whichever query it came from. */
interface CardNoteRow {
  id?: string;
  display_id?: string;
  card_note?: string | null;
}

/** True when this cached row is the shell the note is being written to. */
function isNoteRow(row: CardNoteRow | null | undefined, courseId: string): boolean {
  if (!row || typeof row !== 'object') return false;
  return row.id === courseId || row.display_id === courseId;
}

/**
 * Patch one cache entry, whichever shape it holds: `courseShellsOptions` and
 * the Home card's `courseDisplayOptions` cache lists of rows, the course page's
 * `courseDisplayOptions(courseId)` caches a single row.
 */
function patchCardNoteEntry(
  entry: CardNoteRow[] | CardNoteRow | null | undefined,
  courseId: string,
  value: string | null,
): CardNoteRow[] | CardNoteRow | null | undefined {
  if (Array.isArray(entry)) {
    return entry.map((row) => (isNoteRow(row, courseId) ? { ...row, card_note: value } : row));
  }
  if (isNoteRow(entry, courseId)) return { ...(entry as CardNoteRow), card_note: value };
  return entry;
}

/**
 * Mutation wrapper: writes the note and patches both caches that carry it
 * immediately.
 *
 * The optimistic patch is what keeps the Info-tab input steady. Without it the
 * field's `stored` prop stayed on the old value for the whole round trip, and
 * the re-seed effect put that old value back under the owner's cursor. On
 * failure every cache goes back to what it held and the field keeps the draft,
 * so the typed text is never lost to a failed save.
 */
export function useUpdateCardNote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ courseId, note }: { courseId: string; note: string | null }) =>
      updateCardNote(courseId, note),

    onMutate: async ({ courseId, note }: { courseId: string; note: string | null }) => {
      const value = normalizeCardNote(note);
      const previous: [readonly unknown[], unknown][] = [];

      for (const queryKey of CARD_NOTE_CACHE_KEYS) {
        await queryClient.cancelQueries({ queryKey });
        for (const [key, entry] of queryClient.getQueriesData<CardNoteRow[] | CardNoteRow>({
          queryKey,
        })) {
          previous.push([key, entry]);
          if (entry === undefined) continue;
          queryClient.setQueryData(key, patchCardNoteEntry(entry, courseId, value));
        }
      }

      return { previous };
    },

    onError: (_error, _variables, context) => {
      context?.previous.forEach(([key, entry]) => {
        queryClient.setQueryData(key, entry);
      });
    },

    onSettled: () => {
      for (const queryKey of CARD_NOTE_CACHE_KEYS) {
        void queryClient.invalidateQueries({ queryKey });
      }
    },
  });
}


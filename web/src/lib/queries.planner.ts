/**
 * bb2dash — /planner query layer (R-19, Phase 11).
 *
 * Kept separate from `queries.ts` and `queries.today.ts` for the same reason
 * the other feature modules are: parallel workers extend the data layer at the
 * same time and a shared file collides on every merge. Conventions follow
 * `queries.ts` — a key in `plannerKeys`, an `xOptions()` returning
 * queryOptions, a `useX()` hook, throw on error, no fabricated fallbacks.
 *
 * The week grid reads three things. Two are here: the weekly `meetings`
 * patterns (with the course code they belong to) and the `sessions` rows in the
 * visible week (for a block's topic). The third — the due items — comes from
 * `useWorkItemsWindow(from, to)` in `queries.today.ts`, which this module does
 * not touch: it is read by several screens and owned by none of them.
 *
 * Row shapes are composed from the generated `database.types.ts` with `Pick`,
 * never hand-written. The one cast is at the select boundary, where PostgREST's
 * embedded `courses(...)` resource is narrowed to the four columns asked for.
 */

import { queryOptions, useQuery } from '@tanstack/react-query';
import { getSupabaseBrowserClient } from './supabase/client';
import type { Tables } from './queries';
import type { MeetingPattern } from './planner-week';

/* ---------------------------------------------------------------------------
 * Row types
 * ------------------------------------------------------------------------ */

/** The course identity a meeting block prints. */
export type MeetingCourse = Pick<Tables<'courses'>, 'id' | 'title_short' | 'subject' | 'number'>;

/** One `meetings` row with its course embedded (owner RLS covers both). */
export type PlannerMeetingRow = Pick<
  Tables<'meetings'>,
  | 'id'
  | 'course_id'
  | 'day_of_week'
  | 'start_time'
  | 'end_time'
  | 'location'
  | 'starts_on'
  | 'ends_on'
> & { courses: MeetingCourse | null };

/**
 * One `sessions` row in the visible week — the block's topic comes from here.
 * Exactly the three columns the grid reads, which makes it the same shape as
 * the pure module's `SessionRow`; the rows go straight to `expandMeetings`.
 */
export type PlannerSessionRow = Pick<
  Tables<'sessions'>,
  'course_id' | 'session_date' | 'topic'
>;

const MEETING_COLUMNS =
  'id, course_id, day_of_week, start_time, end_time, location, starts_on, ends_on, ' +
  'courses(id, title_short, subject, number)';

const SESSION_COLUMNS = 'course_id, session_date, topic';

/* ---------------------------------------------------------------------------
 * Cache keys
 * ------------------------------------------------------------------------ */

export const plannerKeys = {
  /** Every planner query shares this prefix so one invalidate covers them. */
  all: () => ['planner'] as const,
  meetings: () => ['planner', 'meetings'] as const,
  sessions: (from: string, to: string) => ['planner', 'sessions', from, to] as const,
} as const;

/* ---------------------------------------------------------------------------
 * Queries
 * ------------------------------------------------------------------------ */

/**
 * Every weekly meeting pattern, with its course. Not windowed: there are a
 * couple of dozen rows for the whole term and `expandMeetings` decides which of
 * them run in the week on screen, so paging ◂ ▸ costs no fetch.
 */
export function meetingsOptions() {
  return queryOptions({
    queryKey: plannerKeys.meetings(),
    queryFn: async (): Promise<PlannerMeetingRow[]> => {
      const supabase = getSupabaseBrowserClient();
      const { data, error } = await supabase
        .from('meetings')
        .select(MEETING_COLUMNS)
        .order('day_of_week', { ascending: true })
        .order('start_time', { ascending: true });
      if (error) throw error;
      // One documented cast: the embedded `courses(...)` resource is narrowed
      // to the four columns selected. No field is reshaped.
      return (data ?? []) as unknown as PlannerMeetingRow[];
    },
    // Meeting patterns move once a term, and only a sync moves them.
    staleTime: 30 * 60 * 1000,
  });
}

/** The `sessions` rows inside a date window (inclusive), for block topics. */
export function sessionsForWeekOptions(from: string, to: string) {
  return queryOptions({
    queryKey: plannerKeys.sessions(from, to),
    queryFn: async (): Promise<PlannerSessionRow[]> => {
      const supabase = getSupabaseBrowserClient();
      const { data, error } = await supabase
        .from('sessions')
        .select(SESSION_COLUMNS)
        .gte('session_date', from)
        .lte('session_date', to)
        .order('session_date', { ascending: true })
        .order('course_id', { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as PlannerSessionRow[];
    },
    staleTime: 30 * 60 * 1000,
  });
}

/* ---------------------------------------------------------------------------
 * Hooks
 * ------------------------------------------------------------------------ */

export function useMeetings() {
  return useQuery(meetingsOptions());
}

export function useSessionsForWeek(from: string, to: string) {
  return useQuery(sessionsForWeekOptions(from, to));
}

/* ---------------------------------------------------------------------------
 * Row → grid adapters (pure)
 * ------------------------------------------------------------------------ */

/**
 * 'IST 323' for a meeting's block. The joined course row is authoritative
 * (`subject` + `number`); `title_short` and then the raw id are the fallbacks,
 * so a row whose join came back empty still names something real.
 */
export function meetingCourseCode(row: PlannerMeetingRow): string {
  const course = row.courses;
  if (course && course.subject && course.number) return `${course.subject} ${course.number}`;
  if (course?.title_short) return course.title_short;
  return row.course_id;
}

/**
 * `meetings` rows as the pure week module wants them: the row as selected,
 * plus the course code resolved from the embedded course.
 */
export function toMeetingPatterns(rows: readonly PlannerMeetingRow[]): MeetingPattern[] {
  return rows.map((row) => ({ ...row, course_code: meetingCourseCode(row) }));
}

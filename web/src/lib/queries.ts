/**
 * bb2dash typed query layer.
 *
 * ONE place where the app talks to Postgres. Screens import a `use*` hook or a
 * `*Options()` object; nobody calls `supabase.from(...)` in a component.
 *
 * Conventions for whoever extends this (W-5 Today, W-6 Course, W-7 Materials,
 * W-8 cmd-K):
 *   1. Add the row type as `Tables<'name'> | Views<'name'>` — never hand-write
 *      a shape. Regenerate database.types.ts after every migration
 *      (mcp__Supabase__generate_typescript_types).
 *   2. Add a key to `queryKeys` so cache invalidation stays greppable.
 *   3. Export an `xOptions()` returning queryOptions({...}) so the same query
 *      can be used by useQuery, useSuspenseQuery and prefetching alike.
 *   4. Throw on error. TanStack turns a thrown error into `error`; swallowing
 *      it produces an empty screen with no explanation, which is worse.
 *   5. NO fabricated fallback values. If the data isn't there the screen says
 *      so (project rule: no invented numbers anywhere).
 */

import { queryOptions, useQuery } from '@tanstack/react-query';
import { getSupabaseBrowserClient } from './supabase/client';
import type { Database } from './supabase/database.types';

type PublicSchema = Database['public'];
export type Tables<T extends keyof PublicSchema['Tables']> = PublicSchema['Tables'][T]['Row'];
export type Views<T extends keyof PublicSchema['Views']> = PublicSchema['Views'][T]['Row'];
export type Enums<T extends keyof PublicSchema['Enums']> = PublicSchema['Enums'][T];

export type Course = Tables<'courses'>;
export type UpcomingItem = Views<'v_upcoming'>;
export type AssignmentType = Enums<'assignment_type'>;
export type ProgressStatus = Enums<'progress_status'>;

/** The subset of `courses` the nav pop-down and course cards need. */
export type CourseSummary = Pick<
  Course,
  'id' | 'subject' | 'number' | 'section' | 'title_short' | 'title_bb' | 'kind' | 'location' | 'bb_url' | 'term_id'
>;

const COURSE_SUMMARY_COLUMNS =
  'id, subject, number, section, title_short, title_bb, kind, location, bb_url, term_id';

/* ---------------------------------------------------------------------------
 * Cache keys
 * ------------------------------------------------------------------------ */

export const queryKeys = {
  courses: () => ['courses'] as const,
  course: (courseId: string) => ['courses', courseId] as const,
  upcoming: (courseId?: string) => ['upcoming', courseId ?? 'all'] as const,
} as const;

/* ---------------------------------------------------------------------------
 * Queries
 * ------------------------------------------------------------------------ */

/** Every course in the active term, ordered the way the nav lists them. */
export function coursesOptions() {
  return queryOptions({
    queryKey: queryKeys.courses(),
    queryFn: async (): Promise<CourseSummary[]> => {
      const supabase = getSupabaseBrowserClient();
      const { data, error } = await supabase
        .from('courses')
        .select(COURSE_SUMMARY_COLUMNS)
        .order('subject', { ascending: true })
        .order('number', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    // Course rows change once a term; a sync is the only thing that moves them.
    staleTime: 30 * 60 * 1000,
  });
}

/** One course by slug id ('IST.323'). */
export function courseOptions(courseId: string) {
  return queryOptions({
    queryKey: queryKeys.course(courseId),
    queryFn: async (): Promise<Course | null> => {
      const supabase = getSupabaseBrowserClient();
      const { data, error } = await supabase
        .from('courses')
        .select('*')
        .eq('id', courseId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    staleTime: 30 * 60 * 1000,
  });
}

/**
 * `v_upcoming` — assignments still to do, due today or later, already
 * excluding submitted/graded/excused/waived/missed (migration 009).
 * Pass a courseId to scope it to one course page's tracker.
 */
export function upcomingOptions(courseId?: string) {
  return queryOptions({
    queryKey: queryKeys.upcoming(courseId),
    queryFn: async (): Promise<UpcomingItem[]> => {
      const supabase = getSupabaseBrowserClient();
      let query = supabase.from('v_upcoming').select('*');
      if (courseId) query = query.eq('course_id', courseId);
      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 5 * 60 * 1000,
  });
}

/* ---------------------------------------------------------------------------
 * Hooks
 * ------------------------------------------------------------------------ */

export function useCourses() {
  return useQuery(coursesOptions());
}

export function useCourse(courseId: string) {
  return useQuery(courseOptions(courseId));
}

export function useUpcoming(courseId?: string) {
  return useQuery(upcomingOptions(courseId));
}

/* ---------------------------------------------------------------------------
 * Display helpers shared by the screens
 * ------------------------------------------------------------------------ */

/** 'IST.323' -> 'IST 323'. Course ids are dotted slugs; the UI shows spaces. */
export function courseCode(course: Pick<Course, 'subject' | 'number'>): string {
  return `${course.subject} ${course.number}`;
}

/**
 * The five tracker categories the artboards use, collapsed from the 19-value
 * `assignment_type` enum. Glyphs: R · A · Q · P · E (spec T-15).
 */
export type TrackerCategory = 'reading' | 'assignment' | 'quiz' | 'project' | 'exam';

const CATEGORY_BY_TYPE: Record<AssignmentType, TrackerCategory> = {
  reading: 'reading',
  form: 'assignment',
  discussion_post: 'assignment',
  homework: 'assignment',
  activity: 'assignment',
  attendance: 'assignment',
  participation: 'assignment',
  checkpoint: 'assignment',
  meeting: 'assignment',
  evaluation: 'assignment',
  other: 'assignment',
  quiz: 'quiz',
  lab: 'project',
  presentation: 'project',
  group_presentation: 'project',
  project: 'project',
  paper: 'project',
  exam: 'exam',
  final_exam: 'exam',
};

export function trackerCategory(type: AssignmentType | null): TrackerCategory {
  return type ? CATEGORY_BY_TYPE[type] : 'assignment';
}

export const CATEGORY_GLYPH: Record<TrackerCategory, string> = {
  reading: 'R',
  assignment: 'A',
  quiz: 'Q',
  project: 'P',
  exam: 'E',
};

/**
 * Effort score per spec T-15 (reading 1 · form 1 · discussion 1.5 ·
 * homework/activity 2 · quiz 3 · lab/presentation 4 · project/paper 6 ·
 * exam 8 · final 10). Point-multiplier and manual override are W-5's job;
 * this is the base table so everyone agrees on the numbers.
 */
export const EFFORT_BY_TYPE: Record<AssignmentType, number> = {
  reading: 1,
  form: 1,
  discussion_post: 1.5,
  homework: 2,
  activity: 2,
  attendance: 1,
  participation: 1,
  checkpoint: 1,
  meeting: 1,
  evaluation: 1,
  other: 1,
  quiz: 3,
  lab: 4,
  presentation: 4,
  group_presentation: 4,
  project: 6,
  paper: 6,
  exam: 8,
  final_exam: 10,
};

export function baseEffort(type: AssignmentType | null): number {
  return type ? EFFORT_BY_TYPE[type] : 1;
}

/** Suggested start = due − (⌈score ÷ 2⌉ − 1) days (spec T-15). */
export function suggestedStartOffsetDays(effort: number): number {
  return Math.max(0, Math.ceil(effort / 2) - 1);
}

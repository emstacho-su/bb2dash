/**
 * bb2dash — Today screen query layer (W-5).
 *
 * Kept separate from queries.ts on purpose: the four screen workers extend the
 * data layer in parallel and a shared file would collide on every merge. This
 * module follows the same conventions as queries.ts (a key in `todayKeys`, an
 * `xOptions()` returning queryOptions, a `useX()` hook, throw on error, no
 * fabricated fallbacks) and imports the shared enum types from it.
 *
 * ROW TYPES. The generated `database.types.ts` predates migrations 014/015/017,
 * so it does not yet describe `v_work_items`, `v_course_display` or `terms`.
 * The shapes below are transcribed verbatim from the live schema
 * (information_schema on project goultdzqcavefcgnifdy, 2026-09-09) so the
 * screen stays fully typed. When database.types.ts is regenerated these should
 * be replaced with `Views<'v_work_items'>` etc. — see the note in the report.
 */

import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseBrowserClient } from './supabase/client';
import type { ProgressStatus } from './queries';

/**
 * The generated Database type predates `v_work_items` and `v_course_display`
 * (migrations 014/015 were applied to prod but database.types.ts was not
 * regenerated), so the typed client rejects `.from('v_work_items')`. Read those
 * two views through an un-narrowed client until the types are regenerated; the
 * returned rows are pinned to the WorkItem / CourseDisplay interfaces below,
 * which are transcribed from the live schema. Every other relation this module
 * touches (terms, sync_runs, assignment_progress, reading_progress) is in the
 * generated types and uses the fully typed client.
 */
function untypedClient(): SupabaseClient {
  return getSupabaseBrowserClient() as unknown as SupabaseClient;
}

/* ---------------------------------------------------------------------------
 * Row types (transcribed from the live schema — see header)
 * ------------------------------------------------------------------------ */

/** The five tracker categories v_work_items pre-computes (glyph + tint ramp). */
export type WorkCategory = 'reading' | 'assignment' | 'quiz' | 'project' | 'exam';

/** One row of `v_work_items` — the unified assignment+reading workload feed. */
export interface WorkItem {
  item_kind: 'assignment' | 'reading';
  item_id: string;
  course_id: string;
  title: string;
  type: string | null;
  category: WorkCategory;
  glyph: string;
  in_workload: boolean;
  due_at: string | null;
  due_on: string | null;
  due_rule: string | null;
  /** Postgres numeric — supabase-js returns it as a string. */
  points_possible: number | string | null;
  submission: string | null;
  series_key: string | null;
  sequence_no: number | null;
  status: ProgressStatus;
  priority: string | null;
  /** Postgres numeric — supabase-js returns it as a string. */
  effort: number | string | null;
  effort_source: string | null;
  is_override: boolean;
  multiplier_applied: boolean;
  suggested_start: string | null;
  undated: boolean;
  confidence: string | null;
}

/** A single class meeting inside `v_course_display.meetings` (jsonb array). */
export interface CourseMeeting {
  /** ISO-style weekday: 1 = Monday … 5 = Friday, 0/6 = weekend. */
  day: number;
  start: string; // 'HH:MM:SS'
  end: string; // 'HH:MM:SS'
  room: string;
}

/** One row of `v_course_display` — the card-facing course identity + meetings. */
export interface CourseDisplay {
  display_id: string;
  code: string;
  title: string;
  shell_ids: string[];
  meetings: CourseMeeting[] | null;
  room_disputed: boolean;
  bb_url: string | null;
  /**
   * `courses.card_note` (R-04), carried through the recreated view by Phase 8
   * migration 028. Owner-written, so it may be null or empty — the card renders
   * nothing at all in that case rather than a blank line.
   *
   * PM: regenerate database.types.ts at integration and replace this whole
   * interface with `Views<'v_course_display'>`.
   */
  card_note: string | null;
}

/** The active term (for the "Week N of 16" kicker). */
export interface Term {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
}

/* ---------------------------------------------------------------------------
 * Cache keys
 * ------------------------------------------------------------------------ */

export const todayKeys = {
  /** All work-item queries share this prefix so one invalidate covers them. */
  work: () => ['work-items'] as const,
  workWindow: (from: string, to: string) => ['work-items', 'window', from, to] as const,
  undated: () => ['work-items', 'undated'] as const,
  courseDisplay: () => ['course-display'] as const,
  term: () => ['term'] as const,
  lastSync: () => ['last-sync'] as const,
} as const;

const WORK_ITEM_COLUMNS =
  'item_kind, item_id, course_id, title, type, category, glyph, in_workload, ' +
  'due_at, due_on, due_rule, points_possible, submission, series_key, sequence_no, ' +
  'status, priority, effort, effort_source, is_override, multiplier_applied, ' +
  'suggested_start, undated, confidence';

/* ---------------------------------------------------------------------------
 * Queries
 * ------------------------------------------------------------------------ */

/**
 * Dated workload in a [from, to] date window (inclusive), for the horizontal
 * effort tracker. `from`/`to` are ISO dates ('YYYY-MM-DD'). Excludes undated
 * items — those live in the tray (see below).
 */
export function workItemsWindowOptions(from: string, to: string) {
  return queryOptions({
    queryKey: todayKeys.workWindow(from, to),
    queryFn: async (): Promise<WorkItem[]> => {
      const supabase = untypedClient();
      const { data, error } = await supabase
        .from('v_work_items')
        .select(WORK_ITEM_COLUMNS)
        .eq('in_workload', true)
        .eq('undated', false)
        .gte('due_on', from)
        .lte('due_on', to)
        .order('due_on', { ascending: true })
        .order('course_id', { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as WorkItem[];
    },
    staleTime: 5 * 60 * 1000,
  });
}

/** Everything with no due date yet — the undated tray. */
export function undatedWorkItemsOptions() {
  return queryOptions({
    queryKey: todayKeys.undated(),
    queryFn: async (): Promise<WorkItem[]> => {
      const supabase = untypedClient();
      const { data, error } = await supabase
        .from('v_work_items')
        .select(WORK_ITEM_COLUMNS)
        .eq('in_workload', true)
        .eq('undated', true)
        .order('course_id', { ascending: true })
        .order('title', { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as WorkItem[];
    },
    staleTime: 5 * 60 * 1000,
  });
}

/** Card-facing course identities + meeting times/rooms. */
export function courseDisplayOptions() {
  return queryOptions({
    queryKey: todayKeys.courseDisplay(),
    queryFn: async (): Promise<CourseDisplay[]> => {
      const supabase = untypedClient();
      const { data, error } = await supabase
        .from('v_course_display')
        // card_note arrives with migration 028 (W-12); this query depends on
        // that migration being applied first — see the merge order in the brief.
        .select('display_id, code, title, shell_ids, meetings, room_disputed, bb_url, card_note')
        .order('display_id', { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as CourseDisplay[];
    },
    staleTime: 30 * 60 * 1000,
  });
}

/** The active term — for the term-week kicker. One row is expected. */
export function termOptions() {
  return queryOptions({
    queryKey: todayKeys.term(),
    queryFn: async (): Promise<Term | null> => {
      const supabase = getSupabaseBrowserClient();
      const { data, error } = await supabase
        .from('terms')
        .select('id, name, start_date, end_date')
        .order('start_date', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as unknown as Term | null;
    },
    staleTime: 24 * 60 * 60 * 1000,
  });
}

/**
 * The most recent sync run's timestamp, for the last-sync line (the reconciled
 * form of the old Needs-attention row). `v_data_freshness` is currently empty,
 * so this reads `sync_runs.ran_at` directly as the spec's fallback.
 */
export function lastSyncOptions() {
  return queryOptions({
    queryKey: todayKeys.lastSync(),
    queryFn: async (): Promise<string | null> => {
      const supabase = getSupabaseBrowserClient();
      const { data, error } = await supabase
        .from('sync_runs')
        .select('ran_at')
        .order('ran_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data?.ran_at ?? null;
    },
    staleTime: 5 * 60 * 1000,
  });
}

/* ---------------------------------------------------------------------------
 * Hooks
 * ------------------------------------------------------------------------ */

export function useWorkItemsWindow(from: string, to: string) {
  return useQuery(workItemsWindowOptions(from, to));
}

export function useUndatedWorkItems() {
  return useQuery(undatedWorkItemsOptions());
}

export function useCourseDisplay() {
  return useQuery(courseDisplayOptions());
}

export function useTerm() {
  return useQuery(termOptions());
}

export function useLastSync() {
  return useQuery(lastSyncOptions());
}

/* ---------------------------------------------------------------------------
 * Status quick-edit (T-06) — writes planner state, never the synced facts.
 * ------------------------------------------------------------------------ */

/** The statuses the quick-edit offers, in a sensible planner order. */
export const STATUS_OPTIONS: readonly ProgressStatus[] = [
  'not_started',
  'planned',
  'in_progress',
  'submitted',
  'graded',
  'missed',
  'excused',
  'waived',
  'not_applicable',
] as const;

/** Human labels for the status enum. */
export const STATUS_LABEL: Record<ProgressStatus, string> = {
  not_started: 'not started',
  planned: 'planned',
  in_progress: 'in progress',
  submitted: 'submitted',
  graded: 'graded',
  missed: 'missed',
  excused: 'excused',
  waived: 'waived',
  not_applicable: 'n/a',
};

interface StatusPatch {
  item: Pick<WorkItem, 'item_kind' | 'item_id'>;
  status: ProgressStatus;
}

/**
 * Change an item's status. Assignment items write `assignment_progress`,
 * reading items write `reading_progress` — the two planner-state tables that
 * a Blackboard sync never overwrites. Upsert (not update) because a handful of
 * items have no progress row yet; the tables' defaults fill priority/updated_at
 * on insert, and we stamp `updated_at` so an update refreshes it too.
 *
 * Optimistic: every cached work-item list is patched immediately, rolled back
 * on error, and the whole `['work-items']` subtree is invalidated on settle.
 */
export function useSetItemStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ item, status }: StatusPatch): Promise<void> => {
      const supabase = getSupabaseBrowserClient();
      const updated_at = new Date().toISOString();

      if (item.item_kind === 'reading') {
        const reading_id = Number(item.item_id);
        if (!Number.isFinite(reading_id)) {
          throw new Error(`reading item_id is not numeric: ${item.item_id}`);
        }
        const { error } = await supabase
          .from('reading_progress')
          .upsert({ reading_id, status, updated_at }, { onConflict: 'reading_id' });
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('assignment_progress')
          .upsert({ assignment_id: item.item_id, status, updated_at }, { onConflict: 'assignment_id' });
        if (error) throw error;
      }
    },

    onMutate: async ({ item, status }: StatusPatch) => {
      await queryClient.cancelQueries({ queryKey: todayKeys.work() });
      const previous = queryClient.getQueriesData<WorkItem[]>({ queryKey: todayKeys.work() });
      for (const [key, list] of previous) {
        if (!list) continue;
        queryClient.setQueryData<WorkItem[]>(
          key,
          list.map((row) =>
            row.item_kind === item.item_kind && row.item_id === item.item_id
              ? { ...row, status }
              : row,
          ),
        );
      }
      return { previous };
    },

    onError: (_err, _vars, context) => {
      context?.previous.forEach(([key, list]) => {
        queryClient.setQueryData(key, list);
      });
    },

    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: todayKeys.work() });
    },
  });
}

/* ---------------------------------------------------------------------------
 * Display helpers (pure — traceable to a row, no fabricated values)
 * ------------------------------------------------------------------------ */

/** Coerce a Postgres numeric (string from supabase-js) to a number, or 0. */
export function toNumber(value: number | string | null | undefined): number {
  if (value === null || value === undefined) return 0;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** 'GEO.103.lecture' -> 'GEO 103'. Course ids are dotted subject.number slugs. */
export function courseCodeFromId(courseId: string): string {
  const m = /^([A-Za-z]+)\.(\d+)/.exec(courseId);
  return m ? `${m[1]} ${m[2]}` : courseId;
}

/** Round effort to at most one decimal and drop a trailing '.0'. */
export function effortLabel(effort: number): string {
  const rounded = Math.round(effort * 10) / 10;
  const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  return `${text} pt${rounded === 1 ? '' : 's'}`;
}

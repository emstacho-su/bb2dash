/**
 * bb2dash — popout query layer (Phase 8, R-05).
 *
 * The route-driven assignment / session popouts open over any screen, so they
 * cannot borrow a screen's data: each one fetches exactly what it shows, keyed
 * by the id in `?item=`. Conventions follow `queries.ts` (row types from the
 * generated `database.types.ts`, a greppable key namespace, `*Options()`
 * returning queryOptions, throw on error, no fabricated fallbacks).
 *
 * The one write here — the planner block — follows the same pattern as
 * `useSetItemStatus` in `queries.today.ts`: upsert into `assignment_progress`
 * (never into `assignments`, which a Blackboard sync owns), patch the cached
 * work-item lists optimistically, roll back on error, invalidate on settle.
 */

import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { getSupabaseBrowserClient } from './supabase/client';
import type { Tables, Views } from './queries';
import { todayKeys, type WorkItem } from './queries.today';

export type Assignment = Tables<'assignments'>;
export type AssignmentProgress = Tables<'assignment_progress'>;
export type GradeComponent = Tables<'grade_components'>;
export type GradingScheme = Tables<'grading_schemes'>;
export type Session = Tables<'sessions'>;
export type Reading = Tables<'readings'>;
export type SessionWorkItem = Views<'v_work_items'>;
export type BbFile = Tables<'bb_files'>;

/** The subset of a file row the popout lists. */
export type PopoutFile = Pick<
  BbFile,
  'id' | 'file_name' | 'bucket' | 'mime_type' | 'bytes' | 'storage_path' | 'source_url' | 'local_path'
>;

const POPOUT_FILE_COLUMNS =
  'id, file_name, bucket, mime_type, bytes, storage_path, source_url, local_path';

/* ---------------------------------------------------------------------------
 * The `?item=` parameter (pure — parsed before anything is fetched)
 * ------------------------------------------------------------------------ */

export type PopoutTarget =
  | { kind: 'assignment'; id: string }
  | { kind: 'session'; id: number };

/**
 * Read `?item=assignment:<id>` / `?item=session:<id>`.
 *
 * The value comes off the URL, so it is untrusted: anything that is not one of
 * the two known kinds with a usable id resolves to `null` and the popout simply
 * does not open. Assignment ids contain '/' and '.' ('IST.323/lab-1'), so only
 * the FIRST colon separates kind from id.
 */
export function parseItemParam(raw: string | null | undefined): PopoutTarget | null {
  if (typeof raw !== 'string') return null;
  const separator = raw.indexOf(':');
  if (separator <= 0) return null;

  const kind = raw.slice(0, separator);
  const id = raw.slice(separator + 1).trim();
  if (!id) return null;

  if (kind === 'assignment') return { kind, id };
  if (kind === 'session') {
    const numeric = Number(id);
    if (!Number.isInteger(numeric) || numeric <= 0) return null;
    return { kind, id: numeric };
  }
  return null;
}

/** The inverse: build the `item` value a link should carry. */
export function itemParam(target: PopoutTarget): string {
  return `${target.kind}:${target.id}`;
}

/** An href that opens the popout over the screen the reader is already on. */
export function itemHref(pathname: string, target: PopoutTarget): string {
  return `${pathname}?item=${encodeURIComponent(itemParam(target))}`;
}

/**
 * The same href as a bare query string. A relative `?item=…` resolves against
 * whatever path the reader is on, so a shared component can offer an opener
 * without reading the router — which would otherwise force a Suspense boundary
 * onto every screen that mounts it. It replaces the rest of the query string,
 * which is why the course tabs are routes rather than query parameters.
 */
export function itemQuery(target: PopoutTarget): string {
  return `?item=${encodeURIComponent(itemParam(target))}`;
}

/* ---------------------------------------------------------------------------
 * Cache keys
 * ------------------------------------------------------------------------ */

export const popoutKeys = {
  assignment: (id: string) => ['popout', 'assignment', id] as const,
  progress: (id: string) => ['popout', 'assignment-progress', id] as const,
  component: (id: number) => ['popout', 'grade-component', id] as const,
  scheme: (courseId: string) => ['popout', 'grading-scheme', courseId] as const,
  series: (courseId: string, seriesKey: string) =>
    ['popout', 'series', courseId, seriesKey] as const,
  session: (id: number) => ['popout', 'session', id] as const,
  sessionReadings: (courseId: string, forDate: string) =>
    ['popout', 'session-readings', courseId, forDate] as const,
  sessionFiles: (id: number) => ['popout', 'session-files', id] as const,
} as const;

/* ---------------------------------------------------------------------------
 * Assignment popout
 * ------------------------------------------------------------------------ */

/** The synced facts. Never written by this app. */
export function assignmentOptions(assignmentId: string) {
  return queryOptions({
    queryKey: popoutKeys.assignment(assignmentId),
    queryFn: async (): Promise<Assignment | null> => {
      const supabase = getSupabaseBrowserClient();
      const { data, error } = await supabase
        .from('assignments')
        .select('*')
        .eq('id', assignmentId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    staleTime: 5 * 60 * 1000,
  });
}

/** Stack's planner state. Absent until he first edits it — null is normal. */
export function assignmentProgressOptions(assignmentId: string) {
  return queryOptions({
    queryKey: popoutKeys.progress(assignmentId),
    queryFn: async (): Promise<AssignmentProgress | null> => {
      const supabase = getSupabaseBrowserClient();
      const { data, error } = await supabase
        .from('assignment_progress')
        .select('*')
        .eq('assignment_id', assignmentId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    staleTime: 60 * 1000,
  });
}

/** The grade component this assignment counts towards ("Labs", "Exams"). */
export function gradeComponentOptions(componentId: number | null | undefined) {
  return queryOptions({
    queryKey: popoutKeys.component(componentId ?? -1),
    queryFn: async (): Promise<GradeComponent | null> => {
      const supabase = getSupabaseBrowserClient();
      const { data, error } = await supabase
        .from('grade_components')
        .select('*')
        .eq('id', componentId as number)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: typeof componentId === 'number',
    staleTime: 30 * 60 * 1000,
  });
}

/** Late policy + AI policy, shown verbatim. */
export function gradingSchemeOptions(courseId: string | undefined) {
  return queryOptions({
    queryKey: popoutKeys.scheme(courseId ?? 'none'),
    queryFn: async (): Promise<GradingScheme | null> => {
      const supabase = getSupabaseBrowserClient();
      const { data, error } = await supabase
        .from('grading_schemes')
        .select('*')
        .eq('course_id', courseId as string)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: Boolean(courseId),
    staleTime: 30 * 60 * 1000,
  });
}

/**
 * The rest of the series (T-11): every sibling that shares `series_key` inside
 * the course, with the status the view already resolved.
 */
export function assignmentSeriesOptions(
  courseId: string | undefined,
  seriesKey: string | null | undefined,
) {
  return queryOptions({
    queryKey: popoutKeys.series(courseId ?? 'none', seriesKey ?? 'none'),
    queryFn: async (): Promise<SessionWorkItem[]> => {
      const supabase = getSupabaseBrowserClient();
      const { data, error } = await supabase
        .from('v_work_items')
        .select('item_kind, item_id, course_id, title, due_on, status, sequence_no, series_key')
        .eq('course_id', courseId as string)
        .eq('series_key', seriesKey as string)
        .order('sequence_no', { ascending: true, nullsFirst: false })
        .order('due_on', { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as SessionWorkItem[];
    },
    enabled: Boolean(courseId) && Boolean(seriesKey),
    staleTime: 5 * 60 * 1000,
  });
}

export function useAssignment(assignmentId: string) {
  return useQuery(assignmentOptions(assignmentId));
}
export function useAssignmentProgress(assignmentId: string) {
  return useQuery(assignmentProgressOptions(assignmentId));
}
export function useGradeComponent(componentId: number | null | undefined) {
  return useQuery(gradeComponentOptions(componentId));
}
export function useGradingScheme(courseId: string | undefined) {
  return useQuery(gradingSchemeOptions(courseId));
}
export function useAssignmentSeries(
  courseId: string | undefined,
  seriesKey: string | null | undefined,
) {
  return useQuery(assignmentSeriesOptions(courseId, seriesKey));
}

/* ---------------------------------------------------------------------------
 * Session popout
 * ------------------------------------------------------------------------ */

export function sessionOptions(sessionId: number) {
  return queryOptions({
    queryKey: popoutKeys.session(sessionId),
    queryFn: async (): Promise<Session | null> => {
      const supabase = getSupabaseBrowserClient();
      const { data, error } = await supabase
        .from('sessions')
        .select('*')
        .eq('id', sessionId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    staleTime: 15 * 60 * 1000,
  });
}

/** Readings assigned for the session's own date. */
export function sessionReadingsOptions(
  courseId: string | undefined,
  forDate: string | null | undefined,
) {
  return queryOptions({
    queryKey: popoutKeys.sessionReadings(courseId ?? 'none', forDate ?? 'none'),
    queryFn: async (): Promise<Reading[]> => {
      const supabase = getSupabaseBrowserClient();
      const { data, error } = await supabase
        .from('readings')
        .select('*')
        .eq('course_id', courseId as string)
        .eq('for_date', forDate as string)
        .order('required', { ascending: false })
        .order('citation', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: Boolean(courseId) && Boolean(forDate),
    staleTime: 15 * 60 * 1000,
  });
}

/** Files pinned to this session. */
export function sessionFilesOptions(sessionId: number) {
  return queryOptions({
    queryKey: popoutKeys.sessionFiles(sessionId),
    queryFn: async (): Promise<PopoutFile[]> => {
      const supabase = getSupabaseBrowserClient();
      const { data, error } = await supabase
        .from('bb_files')
        .select(POPOUT_FILE_COLUMNS)
        .eq('session_id', sessionId)
        .is('superseded_by', null)
        .order('file_name', { ascending: true });
      if (error) throw error;
      return (data ?? []) as PopoutFile[];
    },
    staleTime: 15 * 60 * 1000,
  });
}

export function useSession(sessionId: number) {
  return useQuery(sessionOptions(sessionId));
}
export function useSessionReadings(
  courseId: string | undefined,
  forDate: string | null | undefined,
) {
  return useQuery(sessionReadingsOptions(courseId, forDate));
}
export function useSessionFiles(sessionId: number) {
  return useQuery(sessionFilesOptions(sessionId));
}

/* ---------------------------------------------------------------------------
 * Planner block — the only write in this module
 * ------------------------------------------------------------------------ */

/** The columns the planner block owns. Score/feedback belong to Phase 10. */
export type PlannerPatch = Partial<
  Pick<
    AssignmentProgress,
    'status' | 'priority' | 'planned_start' | 'planned_finish' | 'est_minutes' | 'notes'
  >
>;

/** Notes are free text typed by the owner; cap them so one paste cannot bloat a row. */
export const NOTES_MAX_LENGTH = 2000;
/** A plausible ceiling for a single assignment estimate (7 × 24 h). */
export const EST_MINUTES_MAX = 10_080;

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Validate the patch at the boundary before it reaches Postgres. Every failure
 * is a thrown Error with a message the panel can show — nothing is silently
 * dropped or coerced.
 */
export function validatePlannerPatch(patch: PlannerPatch): PlannerPatch {
  const clean: PlannerPatch = {};

  if ('status' in patch) clean.status = patch.status;
  if ('priority' in patch) clean.priority = patch.priority;

  for (const key of ['planned_start', 'planned_finish'] as const) {
    if (!(key in patch)) continue;
    const value = patch[key];
    if (value === null || value === '') {
      clean[key] = null;
      continue;
    }
    if (typeof value !== 'string' || !ISO_DATE_PATTERN.test(value)) {
      throw new Error(`${key.replace('_', ' ')} must be a date (YYYY-MM-DD).`);
    }
    clean[key] = value;
  }

  if ('est_minutes' in patch) {
    const value = patch.est_minutes;
    if (value === null || value === undefined) {
      clean.est_minutes = null;
    } else {
      const minutes = Number(value);
      if (!Number.isInteger(minutes) || minutes < 0 || minutes > EST_MINUTES_MAX) {
        throw new Error(`Estimate must be a whole number of minutes, 0–${EST_MINUTES_MAX}.`);
      }
      clean.est_minutes = minutes;
    }
  }

  if ('notes' in patch) {
    const value = patch.notes;
    if (value === null || value === undefined) {
      clean.notes = null;
    } else if (typeof value !== 'string') {
      throw new Error('Notes must be text.');
    } else {
      const trimmed = value.trim();
      if (trimmed.length > NOTES_MAX_LENGTH) {
        throw new Error(`Notes are limited to ${NOTES_MAX_LENGTH} characters.`);
      }
      clean.notes = trimmed === '' ? null : trimmed;
    }
  }

  return clean;
}

/** The planner priorities, in the order the select lists them. */
export const PRIORITY_OPTIONS: readonly AssignmentProgress['priority'][] = [
  'low',
  'normal',
  'high',
  'critical',
] as const;

/** Human labels for the priority enum. */
export const PRIORITY_LABEL: Record<AssignmentProgress['priority'], string> = {
  low: 'low',
  normal: 'normal',
  high: 'high',
  critical: 'critical',
};

export interface PlannerWrite {
  assignmentId: string;
  patch: PlannerPatch;
}

/**
 * Write the planner block. Upsert rather than update because most assignments
 * have no `assignment_progress` row until Stack first touches them; PostgREST's
 * merge-duplicates only overwrites the columns present in the payload, so a
 * partial patch never clears a field the panel did not send.
 */
export function useSavePlanner() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ assignmentId, patch }: PlannerWrite): Promise<void> => {
      if (!assignmentId) throw new Error('No assignment to save against.');
      const clean = validatePlannerPatch(patch);
      if (Object.keys(clean).length === 0) return;

      const supabase = getSupabaseBrowserClient();
      const { error } = await supabase
        .from('assignment_progress')
        .upsert(
          { assignment_id: assignmentId, ...clean, updated_at: new Date().toISOString() },
          { onConflict: 'assignment_id' },
        );
      if (error) throw error;
    },

    onMutate: async ({ assignmentId, patch }: PlannerWrite) => {
      await queryClient.cancelQueries({ queryKey: popoutKeys.progress(assignmentId) });
      const previousProgress = queryClient.getQueryData<AssignmentProgress | null>(
        popoutKeys.progress(assignmentId),
      );
      if (previousProgress) {
        queryClient.setQueryData<AssignmentProgress>(popoutKeys.progress(assignmentId), {
          ...previousProgress,
          ...patch,
        });
      }

      // A status change also shows in every cached tracker/tray list.
      let previousWork: [readonly unknown[], WorkItem[] | undefined][] = [];
      if (patch.status) {
        await queryClient.cancelQueries({ queryKey: todayKeys.work() });
        previousWork = queryClient.getQueriesData<WorkItem[]>({ queryKey: todayKeys.work() });
        for (const [key, list] of previousWork) {
          if (!list) continue;
          queryClient.setQueryData<WorkItem[]>(
            key,
            list.map((row) =>
              row.item_kind === 'assignment' && row.item_id === assignmentId
                ? { ...row, status: patch.status! }
                : row,
            ),
          );
        }
      }

      return { previousProgress, previousWork };
    },

    onError: (_error, variables, context) => {
      if (context?.previousProgress !== undefined) {
        queryClient.setQueryData(
          popoutKeys.progress(variables.assignmentId),
          context.previousProgress,
        );
      }
      context?.previousWork.forEach(([key, list]) => {
        queryClient.setQueryData(key, list);
      });
    },

    onSettled: (_data, _error, variables) => {
      void queryClient.invalidateQueries({ queryKey: popoutKeys.progress(variables.assignmentId) });
      void queryClient.invalidateQueries({ queryKey: todayKeys.work() });
    },
  });
}

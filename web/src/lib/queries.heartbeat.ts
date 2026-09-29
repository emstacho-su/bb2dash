'use client';

/**
 * Scheduler heartbeat (P-12, P-71, R-52) — the Home lines that say a pg_cron
 * job has stopped or keeps failing.
 *
 * `v_scheduler_heartbeat` (migration 113) returns one row per job, `transform`
 * (`bb2dash-transform-tick`) and `calendar_push` (`bb2dash-calendar-push`),
 * with the stage `private.heartbeat_stage()` computed: `off` when the job is
 * switched off, `failing` after 3 consecutive failures, `missing` when it has
 * not ticked for 600 s, `late` after 240 s, else `ok`. Home says nothing at
 * `ok` or `late` (B-20).
 *
 * The row is typed here from the Contract's RPC signature (brief 97) rather
 * than from `database.types.ts`, which the PM regenerates once 113 is applied.
 * Nothing about a row is trusted: `normalizeHeartbeat` drops a row whose job or
 * stage it does not know rather than guessing a line for it.
 */

import { queryOptions, useQuery } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseBrowserClient } from './supabase/client';
import { relativeTime } from './queries.sync';

export type HeartbeatJob = 'transform' | 'calendar_push';
export type HeartbeatStage = 'ok' | 'late' | 'missing' | 'failing' | 'off';

const JOBS: readonly HeartbeatJob[] = ['transform', 'calendar_push'];
const STAGES: readonly HeartbeatStage[] = ['ok', 'late', 'missing', 'failing', 'off'];

/** One `v_scheduler_heartbeat` row (113's `private.scheduler_heartbeat()`). */
export interface HeartbeatRow {
  job: HeartbeatJob;
  cron_jobname: string;
  tick_seconds: number;
  last_tick_at: string | null;
  last_ok_at: string | null;
  consecutive_failures: number;
  last_error: string | null;
  stage: HeartbeatStage;
}

const HEARTBEAT_COLUMNS =
  'job, cron_jobname, tick_seconds, last_tick_at, last_ok_at, consecutive_failures, last_error, stage';

/** Both jobs tick every two minutes; re-reading once a minute is plenty. */
const HEARTBEAT_REFETCH_MS = 60 * 1000;

export const heartbeatKeys = {
  all: () => ['scheduler-heartbeat'] as const,
} as const;

/** The name each job goes by in a sentence, at the start and on its own. */
const JOB_SUBJECT: Record<HeartbeatJob, string> = {
  transform: 'The sync scheduler',
  calendar_push: 'Google Calendar push',
};
const JOB_OFF_NAME: Record<HeartbeatJob, string> = {
  transform: 'Scheduler',
  calendar_push: 'Calendar push',
};

/* ---------------------------------------------------------------------------
 * Pure
 * ------------------------------------------------------------------------ */

function textOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

function wholeNumber(value: unknown): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : 0;
}

/** The view's rows, validated; a row with an unknown job or stage is dropped. */
export function normalizeHeartbeat(value: unknown): HeartbeatRow[] {
  if (!Array.isArray(value)) return [];
  const rows: HeartbeatRow[] = [];
  for (const entry of value) {
    if (entry === null || typeof entry !== 'object') continue;
    const row = entry as Record<string, unknown>;
    const job = JOBS.find((known) => known === row.job);
    const stage = STAGES.find((known) => known === row.stage);
    if (!job || !stage) continue;
    rows.push({
      job,
      stage,
      cron_jobname: textOrNull(row.cron_jobname) ?? '',
      tick_seconds: wholeNumber(row.tick_seconds),
      last_tick_at: textOrNull(row.last_tick_at),
      last_ok_at: textOrNull(row.last_ok_at),
      consecutive_failures: wholeNumber(row.consecutive_failures),
      last_error: textOrNull(row.last_error)?.trim() ?? null,
    });
  }
  return rows;
}

function heartbeatLine(row: HeartbeatRow, now: Date): string | null {
  const subject = JOB_SUBJECT[row.job];
  switch (row.stage) {
    case 'ok':
    case 'late':
      return null;
    case 'off':
      return `${JOB_OFF_NAME[row.job]} is switched off.`;
    case 'missing': {
      const since = row.last_tick_at ? `since ${relativeTime(row.last_tick_at, now)}` : 'yet';
      return row.job === 'transform'
        ? `${subject} has not run ${since}; new crawls will not fold until it does.`
        : `${subject} has not run ${since}.`;
    }
    case 'failing': {
      const n = row.consecutive_failures;
      const since = row.last_ok_at ? ` since ${relativeTime(row.last_ok_at, now)}` : '';
      const reason = row.last_error ? `: ${row.last_error}` : '.';
      return `${subject} has failed ${n} time${n === 1 ? '' : 's'}${since}${reason}`;
    }
  }
}

/** One line per job whose stage calls for it, transform first; none at ok or late. */
export function heartbeatLines(rows: readonly HeartbeatRow[], now: Date = new Date()): string[] {
  return JOBS.flatMap((job) => rows.filter((row) => row.job === job))
    .map((row) => heartbeatLine(row, now))
    .filter((line): line is string => line !== null);
}

/* ---------------------------------------------------------------------------
 * Query
 * ------------------------------------------------------------------------ */

export function heartbeatOptions() {
  return queryOptions({
    queryKey: heartbeatKeys.all(),
    queryFn: async (): Promise<HeartbeatRow[]> => {
      // The view is not in the generated types until the PM regenerates them (T-10).
      const supabase = getSupabaseBrowserClient() as unknown as SupabaseClient;
      const { data, error } = await supabase
        .from('v_scheduler_heartbeat')
        .select(HEARTBEAT_COLUMNS);
      if (error) throw error;
      return normalizeHeartbeat(data);
    },
    refetchInterval: HEARTBEAT_REFETCH_MS,
    staleTime: HEARTBEAT_REFETCH_MS / 2,
  });
}

export function useSchedulerHeartbeat() {
  return useQuery(heartbeatOptions());
}

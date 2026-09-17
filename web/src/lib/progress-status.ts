/**
 * Planner status vocabulary (Phase 12b, P-grades-7) — PM-owned, frozen before
 * the worker branches were cut. Every status menu and label in the app reads
 * this file; no screen keeps its own list.
 *
 * The Postgres enum `progress_status` keeps its nine values (migrations are
 * additive). Six are offered; the three retired ones are folded by migration
 * 078 and, until then, read as the offered status they fold into.
 */
import type { Enums } from '@/lib/supabase/database.types';

export type ProgressStatus = Enums<'progress_status'>;

/** The six statuses a menu offers, in menu order. */
export const OFFERED_STATUSES = [
  'not_started',
  'in_progress',
  'submitted',
  'graded',
  'excused',
  'missed',
] as const satisfies readonly ProgressStatus[];

export type OfferedStatus = (typeof OFFERED_STATUSES)[number];

/** Retired enum values and the offered status each one folds into. */
export const RETIRED_STATUS_FOLD = {
  planned: 'not_started',
  waived: 'excused',
  not_applicable: 'excused',
} as const satisfies Partial<Record<ProgressStatus, OfferedStatus>>;

const OFFERED_LABEL: Record<OfferedStatus, string> = {
  not_started: 'not opened',
  in_progress: 'in progress',
  submitted: 'submitted',
  graded: 'graded',
  excused: 'excused',
  missed: 'DNF',
};

/** The offered status a stored value reads as. */
export function foldStatus(status: ProgressStatus): OfferedStatus {
  if (status in RETIRED_STATUS_FOLD) {
    return RETIRED_STATUS_FOLD[status as keyof typeof RETIRED_STATUS_FOLD];
  }
  return status as OfferedStatus;
}

/** Human label for any stored status, retired values included. */
export function statusLabel(status: ProgressStatus): string {
  return OFFERED_LABEL[foldStatus(status)];
}

/** Label lookup over the whole enum, for callers that index by status. */
export const STATUS_LABEL: Record<ProgressStatus, string> = {
  not_started: statusLabel('not_started'),
  planned: statusLabel('planned'),
  in_progress: statusLabel('in_progress'),
  submitted: statusLabel('submitted'),
  graded: statusLabel('graded'),
  missed: statusLabel('missed'),
  excused: statusLabel('excused'),
  waived: statusLabel('waived'),
  not_applicable: statusLabel('not_applicable'),
};

/**
 * Statuses the sync may advance to `graded` when Blackboard posts a score
 * (DECISIONS 2026-09-17: the one sanctioned sync write to planner state).
 * Mirrors migration 078; `excused` and `missed` are never touched.
 */
export const AUTO_GRADED_FROM: readonly ProgressStatus[] = [
  'not_started',
  'planned',
  'in_progress',
  'submitted',
];

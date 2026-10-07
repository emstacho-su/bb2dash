/**
 * bb2dash — the Apply answers button's read of an `inbox_feedback` request
 * (Phase 23, Inbox auto-apply; DECISIONS 2026-10-07).
 *
 * The request is filed two ways: the sync container files one after a sync that
 * closed done when answered items wait (migration 180), and a press of "Apply
 * answers" files one between syncs. Either way the `apply` container's worker
 * claims it (`claimed_by = 'inbox-apply-runner'`) and runs `/inbox-apply`; the app
 * sees only what the worker writes on the row.
 *
 *   queued, young            → waiting for the worker
 *   queued, past the grace   → unclaimed: nothing took it, the paste command is the fallback
 *   claimed by the worker    → running
 *   claimed by anyone else   → a Claude Code session (the `/inbox-apply` skill on the host)
 *   done / failed / cancelled
 *
 * Pure, like `sync-request-phase.ts`, which this mirrors: nothing here imports
 * React, TanStack Query or Supabase, and nothing throws.
 */

import { asRecord } from './json-record';
import type { AgentRequestState } from './queries.sync';
import type { AgoFormatter, PressAction } from './sync-request-phase';

/** What the apply worker's claim writes in `claimed_by` (migration 181). */
export const APPLY_RUNNER_CLAIMANT = 'inbox-apply-runner';

/**
 * How long a queued request may wait before the button says nothing took it. The
 * worker polls every 10 seconds; this is the Sync button's grace, so the two
 * buttons give up at the same moment.
 */
export const APPLY_QUEUE_GRACE_MS = 75_000;

export type ApplyPhase =
  | 'idle'
  | 'queued'
  | 'unclaimed'
  | 'running'
  | 'session'
  | 'done'
  | 'failed'
  | 'cancelled';

/** The columns of an `agent_requests` row the phase and the status line are read from. */
export interface ApplyRequest {
  id: number;
  state: AgentRequestState;
  created_at: string;
  claimed_by: string | null;
  finished_at: string | null;
  params: Record<string, unknown> | null;
  result: Record<string, unknown> | null;
}

/** What the button says in each phase: R3-2's plain words, and the worker named only when it is missing. */
export const APPLY_PHASE_LABEL: Record<ApplyPhase, string> = {
  idle: 'Apply answers',
  queued: 'queued',
  unclaimed: 'waiting on the worker…',
  running: 'running',
  session: 'running',
  done: 'done',
  failed: 'failed',
  cancelled: 'cancelled',
};

/** The toast lines the button shows. */
export const APPLY_COPY = Object.freeze({
  requested: 'Requested. The apply worker takes it within about a minute.',
  alreadyOpen: 'A request is already open. Following that one.',
  fallbackCopied:
    'Nothing has claimed this request. If the apply worker is down, the command is copied; run it in Claude Code.',
  fallbackCopy:
    'Nothing has claimed this request. If the apply worker is down, copy this and run it in Claude Code.',
});

/** Postgres's unique_violation: migration 181 allows one open `inbox_feedback` request at a time. */
const UNIQUE_VIOLATION = '23505';

/** Who queued the request, from `params.trigger`; anything else is a press of the button. */
const QUEUED_LINE: ReadonlyMap<string, string> = new Map([
  ['sync', 'Queued after the last sync'],
  ['followup', 'Queued for the answers still waiting'],
]);
const QUEUED_FROM_BUTTON = 'Queued from Apply answers';

/** The phases of a request that is still open. */
const MOVING: ReadonlySet<ApplyPhase> = new Set<ApplyPhase>(['queued', 'unclaimed', 'running', 'session']);

function sinceMs(iso: string | null, now: number): number {
  if (!iso) return 0;
  const then = Date.parse(iso);
  return Number.isFinite(then) ? Math.max(0, now - then) : 0;
}

/** The phase of the request shown, or idle with none. */
export function applyPhase(request: ApplyRequest | null | undefined, now: number): ApplyPhase {
  if (!request) return 'idle';
  if (request.state === 'queued') {
    return sinceMs(request.created_at, now) > APPLY_QUEUE_GRACE_MS ? 'unclaimed' : 'queued';
  }
  if (request.state === 'claimed') {
    return request.claimed_by === APPLY_RUNNER_CLAIMANT ? 'running' : 'session';
  }
  return request.state;
}

/** True while the request is open, whoever (or nobody yet) is moving it. */
export function isMovingApplyPhase(phase: ApplyPhase): boolean {
  return MOVING.has(phase);
}

/** What a press does in the phase: file a request, offer the paste command, or re-show the status. */
export function applyPressAction(phase: ApplyPhase): PressAction {
  if (phase === 'unclaimed') return 'fallback';
  return isMovingApplyPhase(phase) ? 'status' : 'file';
}

/** The button's tooltip: one sentence on what is happening. */
export function applyPhaseTitle(
  phase: ApplyPhase,
  request: ApplyRequest | null | undefined,
  ago: AgoFormatter,
): string {
  switch (phase) {
    case 'idle':
      return 'Ask the apply worker to apply your Inbox answers';
    case 'queued':
      return 'Requested; the apply worker takes queued requests within about a minute';
    case 'unclaimed':
      return (
        `Nothing has claimed this request, filed ${ago(request?.created_at ?? null)}. ` +
        'The apply worker may be down; press again for the fallback command.'
      );
    case 'running':
      return 'The apply worker is applying your answers';
    case 'session':
      return request?.claimed_by
        ? `A Claude Code session (${request.claimed_by}) is applying your answers`
        : 'A Claude Code session is applying your answers';
    case 'done':
    case 'failed':
    case 'cancelled': {
      const finished = request?.finished_at ?? null;
      return finished ? `Apply ${phase} ${ago(finished)}` : `Apply ${phase}`;
    }
  }
}

function textOf(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

/** "2 answers archived", from the skill's `result.archived`; null unless it is a whole count. */
function archivedLine(report: Record<string, unknown>): string | null {
  const archived = report.archived;
  if (typeof archived !== 'number' || !Number.isInteger(archived) || archived < 0) return null;
  if (archived === 0) return 'Nothing to apply';
  return archived === 1 ? '1 answer archived' : `${archived} answers archived`;
}

/**
 * The one line of a closed request: the worker's first `lines` entry, else the
 * error of a failed one, else the count the skill recorded. Null for anything
 * else; nothing is invented.
 */
function closedLine(phase: 'done' | 'failed', result: unknown): string | null {
  const report = asRecord(result);
  if (!report) return null;
  const first = Array.isArray(report.lines) ? textOf(report.lines[0]) : null;
  if (first !== null) return first;
  const error = textOf(report.error);
  if (phase === 'failed' && error !== null) return error;
  return archivedLine(report) ?? error;
}

/**
 * The one line the "Answered, not applied" section shows beside the button: who
 * queued the request, that it is running, or what it did. Null at rest and for a
 * cancelled request.
 */
export function applyStatusLine(phase: ApplyPhase, request: ApplyRequest | null | undefined): string | null {
  switch (phase) {
    case 'idle':
    case 'cancelled':
      return null;
    case 'queued': {
      const trigger = textOf(asRecord(request?.params)?.trigger);
      return (trigger !== null ? QUEUED_LINE.get(trigger) : undefined) ?? QUEUED_FROM_BUTTON;
    }
    case 'unclaimed':
      return 'Nothing has taken the request yet';
    case 'running':
      return 'Applying your answers now';
    case 'session':
      return 'A Claude Code session is applying your answers';
    case 'done':
    case 'failed':
      return closedLine(phase, request?.result);
  }
}

/** True for the insert the database refused because an `inbox_feedback` request is already open. */
export function isUniqueViolation(error: unknown): boolean {
  return asRecord(error)?.code === UNIQUE_VIOLATION;
}

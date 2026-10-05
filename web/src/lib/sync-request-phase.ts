/**
 * bb2dash — the Sync button's read of an open request after the Phase 14 cut-over
 * (R-96's "the SyncButton's copy after cut-over", 2026-10-05).
 *
 * Since 2026-10-04 the desktop runs `syncLauncher = queue-only`: a press files the
 * `agent_requests` row and the `sync` container's runner claims it (`claimed_by =
 * 'sync-runner'`) within one poll of 25 s plus a login check. The app cannot see
 * the container; it sees only what the runner writes. So the phase is read off two
 * rows: the request, and the `sync_runs` row its claim opened (migration 135's
 * trigger), which the runner's fold moves from `running` to `ok`, `partial` or
 * `failed` before the files step and the close.
 *
 *   queued, young            → waiting for the runner
 *   queued, past the grace   → unclaimed: nothing took it, the paste command is the fallback
 *   claimed by sync-runner   → starting (no run row) / crawling (running) / pulling files
 *                              (folded) / finishing (the run failed; the close is next)
 *   claimed by anyone else   → a Claude Code session (the Windows /bb-sync skill)
 *   done / failed / cancelled
 *
 * Pure: nothing here imports React, TanStack Query or Supabase, and nothing throws.
 * `queries.sync.ts` is past the project's size rule, which is why this is its own file.
 */

import type { AgentRequestState } from './queries.sync';

/** What `sync_claim()` writes in `claimed_by` (migration 091). */
export const RUNNER_CLAIMANT = 'sync-runner';

/**
 * How long a queued request may wait before the button says nothing took it:
 * three of the runner's 25-second polls. Live claims land in 11–25 s.
 */
export const QUEUE_GRACE_MS = 75_000;

export type SyncPhase =
  | 'idle'
  | 'queued'
  | 'unclaimed'
  | 'starting'
  | 'crawling'
  | 'pulling_files'
  | 'finishing'
  | 'session'
  | 'done'
  | 'failed'
  | 'cancelled';

/** The columns of an `agent_requests` row the phase is read from. */
export interface PhaseRequest {
  id: number;
  state: AgentRequestState;
  created_at: string;
  claimed_by: string | null;
  finished_at: string | null;
  result: Record<string, unknown> | null;
}

/** The one column of the request's `sync_runs` row the phase is read from. */
export interface PhaseRun {
  status: string | null;
}

/** What a press does: file a new request, offer the paste command, or re-show the status. */
export type PressAction = 'file' | 'fallback' | 'status';

/** What the button says in each phase. */
export const PHASE_LABEL: Record<SyncPhase, string> = {
  idle: 'Sync',
  queued: 'sync requested',
  unclaimed: 'waiting on the container…',
  starting: 'container: starting…',
  crawling: 'container: crawling…',
  pulling_files: 'container: pulling files…',
  finishing: 'container: finishing…',
  session: 'Claude Code: syncing…',
  done: 'sync done',
  failed: 'sync failed',
  cancelled: 'sync cancelled',
};

/** The toast lines the button shows. */
export const SYNC_COPY = Object.freeze({
  requested: 'Sync requested — the sync container picks it up within about a minute. No terminal needed.',
  fallbackCopied:
    'Nothing has claimed this sync. If the sync container is down, the command is copied — run it in Claude Code with a logged-in Blackboard tab.',
  fallbackCopy:
    'Nothing has claimed this sync. If the sync container is down, copy this and run it in Claude Code with a logged-in Blackboard tab.',
});

/** The phases in which the container is working on the request right now. */
const LIVE: ReadonlySet<SyncPhase> = new Set<SyncPhase>([
  'starting',
  'crawling',
  'pulling_files',
  'finishing',
]);

/** The phases of a request that is still open: somebody, or nobody yet, is moving it. */
const MOVING: ReadonlySet<SyncPhase> = new Set<SyncPhase>([
  'queued',
  'unclaimed',
  ...LIVE,
  'session',
]);

const MS_SECOND = 1000;
const MS_MINUTE = 60 * MS_SECOND;
const MS_HOUR = 60 * MS_MINUTE;
const MS_DAY = 24 * MS_HOUR;

/** Milliseconds since an ISO instant, or 0 when the instant is unreadable. */
function sinceMs(iso: string | null, now: number): number {
  if (!iso) return 0;
  const then = Date.parse(iso);
  return Number.isFinite(then) ? Math.max(0, now - then) : 0;
}

/** "45 s" under two minutes, "3 min" from there: how long a queued request has waited. */
function elapsedText(ms: number): string {
  if (ms < 2 * MS_MINUTE) return `${Math.round(ms / MS_SECOND)} s`;
  return `${Math.floor(ms / MS_MINUTE)} min`;
}

/** "just now" / "2 min ago" / "3 hrs ago" / "4 days ago": when a request closed. */
function agoText(ms: number): string {
  if (ms < MS_MINUTE) return 'just now';
  if (ms < MS_HOUR) return `${Math.round(ms / MS_MINUTE)} min ago`;
  if (ms < MS_DAY) {
    const hours = Math.round(ms / MS_HOUR);
    return `${hours} hr${hours === 1 ? '' : 's'} ago`;
  }
  const days = Math.round(ms / MS_DAY);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

/** The runner's phase from the run row its claim opened. No row yet, or an unknown status, is starting. */
function runnerPhase(run: PhaseRun | null | undefined): SyncPhase {
  switch (run?.status) {
    case 'running':
      return 'crawling';
    case 'ok':
    case 'partial':
      return 'pulling_files';
    case 'failed':
      return 'finishing';
    default:
      return 'starting';
  }
}

/** The phase of the open request, or idle with none. */
export function syncPhase(
  request: PhaseRequest | null | undefined,
  run: PhaseRun | null | undefined,
  now: number,
): SyncPhase {
  if (!request) return 'idle';
  if (request.state === 'queued') {
    return sinceMs(request.created_at, now) > QUEUE_GRACE_MS ? 'unclaimed' : 'queued';
  }
  if (request.state === 'claimed') {
    return request.claimed_by === RUNNER_CLAIMANT ? runnerPhase(run) : 'session';
  }
  return request.state;
}

/** True while the container is working on the request: the button shows its live mark. */
export function isLivePhase(phase: SyncPhase): boolean {
  return LIVE.has(phase);
}

/** True while the request is open, whoever (or nobody yet) is moving it. */
export function isMovingPhase(phase: SyncPhase): boolean {
  return MOVING.has(phase);
}

/** The button's tooltip: one sentence on what is happening. */
export function phaseTitle(
  phase: SyncPhase,
  request: PhaseRequest | null | undefined,
  now: number,
): string {
  switch (phase) {
    case 'idle':
      return 'Ask the sync container to crawl Blackboard';
    case 'queued':
      return 'Requested; the sync container takes queued requests within about a minute';
    case 'unclaimed':
      return (
        `Nothing has claimed this sync in ${elapsedText(sinceMs(request?.created_at ?? null, now))}. ` +
        'Is the sync container up? Press again for the fallback command.'
      );
    case 'starting':
      return 'The sync container claimed the request and is opening the run';
    case 'crawling':
      return 'The sync container is crawling Blackboard and folding the result in';
    case 'pulling_files':
      return 'The crawl folded in; the sync container is pulling new files';
    case 'finishing':
      return 'The run failed; the sync container is closing the request';
    case 'session':
      return request?.claimed_by
        ? `A Claude Code session (${request.claimed_by}) is running this sync`
        : 'A Claude Code session is running this sync';
    case 'done':
    case 'failed':
    case 'cancelled': {
      const finished = request?.finished_at ?? null;
      return finished ? `Sync ${phase} ${agoText(sinceMs(finished, now))}` : `Sync ${phase}`;
    }
  }
}

/** What a press does in the phase. */
export function pressAction(phase: SyncPhase): PressAction {
  if (phase === 'unclaimed') return 'fallback';
  return isMovingPhase(phase) ? 'status' : 'file';
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * The one line of a closed request's report: the runner's first `lines` entry,
 * the skill's figures rebuilt into the same sentence, or the error word. Null
 * for anything else; nothing is invented.
 */
export function resultHeadline(result: unknown): string | null {
  const report = asRecord(result);
  if (!report) return null;
  const first = Array.isArray(report.lines) ? report.lines[0] : undefined;
  if (typeof first === 'string' && first.trim() !== '') return first;
  if (typeof report.files_pulled === 'number') {
    const notPulled = typeof report.files_not_pulled === 'number' ? report.files_not_pulled : 0;
    return `Files: ${report.files_pulled} pulled${notPulled > 0 ? `, ${notPulled} not pulled` : ''}`;
  }
  if (typeof report.error === 'string' && report.error.trim() !== '') return report.error;
  return null;
}

/** "Sync done · Files: 3 pulled, 1 not pulled": the toast when a watched request closes. */
export function closeAnnouncement(request: Pick<PhaseRequest, 'state' | 'result'>): string {
  const head = `Sync ${request.state}`;
  const line = resultHeadline(request.result);
  return line ? `${head} · ${line}` : head;
}

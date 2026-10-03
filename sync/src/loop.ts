/**
 * The runner, one pass (brief 100, "The runner, one pass"; B-43 and B-44: no LLM and no step 0).
 *
 *   1. sync_sweep_stale()
 *   2. sync_next(); nothing queued -> the pass ends
 *   3. the login check (the watch's own, with its silent re-login): dead -> sync_close(queued ->
 *      failed, login_required) and nothing retries; alive -> sync_login_ok()
 *   4. sync_claim(id); lost -> the next pass takes over
 *   5. mint a run id, sync_register_run(id, run_id) (register-first)
 *   6. the crawl (crawler v5 in the logged-in tab)
 *   7. the fold wait: sync_run_outcome until it is not running, at most FOLD_WAIT_MS; a timeout
 *      leaves the row claimed and Phase 19's 30-minute rule closes it
 *   8–9. the files and the embed step (files.ts)
 *  10. sync_close(id, done | failed, report)
 *
 * Every step is an injected port, so the pass runs on fakes in loop.test.ts and integration.test.ts.
 */

import type { RunOutcome, SyncRpc } from './db.js';
import type { Verdict } from './login.js';
import { buildReport, failureReport, loginRequiredReport, type FilesSummary } from './report.js';

export const POLL_INTERVAL_MS = 25_000;
/** The same in SQL (091's c_max_claim_attempts) and here; loop.test.ts reads 091 to keep them equal. */
export const MAX_CLAIM_ATTEMPTS = 3;
const QUARANTINED = '42501';

export interface FilesStepResult {
  files: FilesSummary;
  stopped: 'session_expired' | null;
  embedError: string | null;
}

export interface PassDeps {
  rpc: SyncRpc;
  login: { check(label: string): Promise<Verdict> };
  crawl(runId: string): Promise<unknown>;
  waitFold(runId: string): Promise<RunOutcome | null>;
  files(): Promise<FilesStepResult>;
  mintRunId(): string;
  setPassRunning(running: boolean): void;
  log(line: string): void;
  /** Claims this process made per request id, for the report; a restart starts it again. */
  claimCounts?: Map<string, number>;
}

export type PassOutcome =
  | 'idle'
  | 'login_required'
  | 'probe_error'
  | 'claim_lost'
  | 'register_refused'
  | 'crawl_failed'
  | 'fold_timeout'
  | 'done'
  | 'failed';

function message(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).split('\n')[0] ?? '';
}

const NO_FILES: FilesStepResult = { files: { pulled: 0, not_pulled: [] }, stopped: null, embedError: null };

/** Steps 8–10 for a run that has folded: the files and the embed step (unless the fold failed), then the close. */
async function finishRun(d: PassDeps, id: string, outcome: RunOutcome, attempts: number): Promise<'done' | 'failed'> {
  let files = NO_FILES;
  let filesError: string | null = null;
  if (outcome.status !== 'failed') {
    try {
      files = await d.files();
    } catch (error) {
      filesError = message(error);
    }
  }
  const { state, report } = buildReport({
    foldStatus: outcome.status,
    files: files.files,
    claimAttempts: attempts,
    filesStopped: files.stopped,
    filesError,
    embedError: files.embedError,
  });
  await d.rpc.close(id, state, report);
  d.log(`pass: request ${id} closed ${state}`);
  return state;
}

/**
 * R2 item 1: the runner's own registered claims it never closed (a fold-wait timeout, a stop during
 * the wait, a throw after the registration). Each run is waited for again; a folded run gets its
 * files and its close, a failed run closes failed, and a run still running is left for the next
 * pass (or Phase 19's 30-minute rule). Only sync_own_claims' rows, which are claimed_by =
 * 'sync-runner', are ever closed here; an unregistered one is the requeue's, on start.
 */
export async function resumeOwnClaims(d: PassDeps): Promise<number> {
  const claims = (await d.rpc.ownClaims()).filter((c) => c.runId !== null);
  let closed = 0;
  for (const claim of claims) {
    d.setPassRunning(true);
    try {
      d.log(`pass: resuming request ${claim.id}, run ${claim.runId}`);
      const outcome = await d.waitFold(claim.runId!);
      if (!outcome) {
        d.log(`pass: run ${claim.runId} has still not folded; request ${claim.id} stays claimed`);
        continue;
      }
      await finishRun(d, claim.id, outcome, claim.claimAttempts);
      closed += 1;
    } finally {
      d.setPassRunning(false);
    }
  }
  return closed;
}

export async function runPass(d: PassDeps): Promise<PassOutcome> {
  const swept = await d.rpc.sweepStale();
  if (swept > 0) d.log(`pass: the sweep flagged ${swept} stale claim(s)`);

  await resumeOwnClaims(d);

  const request = await d.rpc.next();
  if (!request) return 'idle';

  d.setPassRunning(true);
  try {
    const id = request.id;
    const verdict = await d.login.check('pass');
    if (verdict === 'dead') {
      await d.rpc.close(id, 'failed', loginRequiredReport());
      d.log(`pass: request ${id} failed: login_required (the Inbox asks Stack to log in)`);
      return 'login_required';
    }
    if (verdict === 'error') {
      d.log(`pass: the login probe did not answer; request ${id} stays queued`);
      return 'probe_error';
    }
    await d.rpc.loginOk();

    if (!(await d.rpc.claim(id))) {
      d.log(`pass: lost the claim on request ${id}`);
      return 'claim_lost';
    }
    const counts = d.claimCounts ?? new Map<string, number>();
    const attempts = (counts.get(id) ?? 0) + 1;
    counts.set(id, attempts);
    if (attempts >= MAX_CLAIM_ATTEMPTS) {
      d.log(`pass: request ${id} claimed ${attempts} times by this runner; the sweep flags it at ${MAX_CLAIM_ATTEMPTS}`);
    }

    const runId = d.mintRunId();
    let registered = false;
    try {
      registered = await d.rpc.registerRun(id, runId);
    } catch (error) {
      if ((error as { code?: unknown })?.code !== QUARANTINED) throw error;
      await d.rpc.close(id, 'failed', failureReport('register', `run id ${runId} was quarantined (42501)`, attempts));
      return 'register_refused';
    }
    if (!registered) {
      await d.rpc.close(id, 'failed', failureReport('register', `sync_register_run refused run ${runId}`, attempts));
      return 'register_refused';
    }
    d.log(`pass: request ${id} claimed and registered as run ${runId}`);

    try {
      await d.crawl(runId);
    } catch (error) {
      await d.rpc.close(id, 'failed', failureReport('crawl', message(error), attempts));
      d.log(`pass: request ${id} failed in the crawl: ${message(error)}`);
      return 'crawl_failed';
    }

    const outcome = await d.waitFold(runId);
    if (!outcome) {
      d.log(`pass: run ${runId} has not folded yet; request ${id} stays claimed and the next pass resumes it`);
      return 'fold_timeout';
    }
    return await finishRun(d, id, outcome, attempts);
  } finally {
    d.setPassRunning(false);
  }
}

export interface LoopDeps extends PassDeps {
  sleep(ms: number): Promise<void>;
  shouldStop(): boolean;
  heartbeat(): void;
}

/** Passes until told to stop, POLL_INTERVAL_MS apart. A pass that throws is logged, not fatal. */
export async function runLoop(d: LoopDeps): Promise<void> {
  while (!d.shouldStop()) {
    d.heartbeat();
    try {
      await runPass(d);
    } catch (error) {
      d.log(`pass: failed: ${message(error)}`);
    }
    if (d.shouldStop()) break;
    await d.sleep(POLL_INTERVAL_MS);
  }
}

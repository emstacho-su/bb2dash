/**
 * "Update desktop app", on demand (Stack, 2026-09-30: "close and reopen isn't very clear").
 *
 *   request  ->  start the logon builder now (or join the run already going)
 *            ->  wait for that run to finish (bounded by FORCE_UPDATE_TIMEOUT_MS)
 *            ->  newer build on disk  ->  start the swap helper, resolve 'restarting', quit soon
 *                that run fetched origin/main and its desktop/ tree is the running build
 *                                     ->  'up-to-date'
 *                anything else        ->  'failed' with a short reason
 *
 * "Up to date" is a claim that the builder looked (PM, 2026-09-30): the run must have
 * written `last-check.json` (checkedAt, remoteTree, skip) no earlier than it started, with
 * no skip. Docker down, a failed fetch, an unresolved ref, an older builder that writes no
 * check, or a different tree with no build on disk all answer 'failed'.
 *
 * One request at a time: a second request while one runs gets the same promise. Under the
 * test env var nothing is started; the request is recorded and answers 'up-to-date'.
 * Portable: every OS step is injected (`main/update-os.ts` is the Windows adapter).
 */

import { type Logger, describeError } from '../redact';
import { isTree } from './build-paths';
import type { BuilderStartOutcome } from './builder-trigger';
import { decideUpdate } from './update-check';

export const FORCE_UPDATE_TIMEOUT_MS = 15 * 60 * 1000;
export const BUILDER_POLL_INTERVAL_MS = 5_000;
/** Task Scheduler's LastRunTime and last-check.json have whole-second precision. */
export const LAST_RUN_SLACK_MS = 5_000;
const SHORT_BUILD_LENGTH = 7;

/** What the renderer is told. Fixed strings: no path, no stderr, nothing from outside. */
export const FAILURE_REASONS = Object.freeze({
  notInstalled: 'this copy is not an installed build',
  builderStart: 'the builder could not be started',
  builderStatus: 'the builder status could not be read',
  buildFailed: 'the build failed',
  timedOut: 'the build took too long',
  swapFailed: 'the update could not start',
  dockerDown: "Docker isn't running — start Docker Desktop and try again",
  fetchFailed: 'could not reach GitHub — check the connection and try again',
  refUnresolved: 'the build ref could not be read',
  noCheck: 'the builder did not report a check',
  notOnDisk: 'the newer build is not on disk',
});

/** What the builder could not do on its last run; '' for a clean check. */
export const CHECK_SKIPS = ['', 'fetch-failed', 'ref-unresolved', 'docker-not-ready'] as const;
export type CheckSkip = (typeof CHECK_SKIPS)[number];

/** The builder's `last-check.json` (`logon-build.ps1`, `Get-BuildCheckRecord`). */
export interface BuildCheck {
  /** Epoch ms. */
  readonly checkedAt: number;
  /** The desktop/ tree hash at origin/main; `null` when it could not be resolved. */
  readonly remoteTree: string | null;
  readonly skip: CheckSkip;
}

const ISO_UTC_SECONDS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;

/** `last-check.json`, or `null` for anything not exactly its shape. */
export function parseBuildCheck(json: string): BuildCheck | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const record = parsed as { checkedAt?: unknown; remoteTree?: unknown; skip?: unknown };
  if (typeof record.checkedAt !== 'string' || !ISO_UTC_SECONDS.test(record.checkedAt)) return null;
  const checkedAt = Date.parse(record.checkedAt);
  if (Number.isNaN(checkedAt)) return null;
  const remoteTree = record.remoteTree;
  if (remoteTree !== '' && !isTree(remoteTree)) return null;
  const skip = record.skip;
  if (typeof skip !== 'string' || !(CHECK_SKIPS as readonly string[]).includes(skip)) return null;
  return Object.freeze({
    checkedAt,
    remoteTree: remoteTree === '' ? null : remoteTree,
    skip: skip as CheckSkip,
  });
}

const SKIP_REASONS: Readonly<Record<Exclude<CheckSkip, ''>, string>> = Object.freeze({
  'fetch-failed': FAILURE_REASONS.fetchFailed,
  'ref-unresolved': FAILURE_REASONS.refUnresolved,
  'docker-not-ready': FAILURE_REASONS.dockerDown,
});

export type UpdateResult =
  | { readonly status: 'up-to-date'; readonly build: string | null }
  | { readonly status: 'restarting'; readonly build: string }
  | { readonly status: 'failed'; readonly reason: string };

/** One reading of the builder's scheduled task. */
export interface BuilderTaskStatus {
  /** Running or queued. */
  readonly running: boolean;
  /** When the task last started (epoch ms), `null` when it never has. */
  readonly lastRunAt: number | null;
  /** The last run's exit code; `null` while running. */
  readonly lastResult: number | null;
}

export interface ForceUpdateDeps {
  readonly runningTree: string | null;
  /** Start the builder task; rejects when it cannot be started. */
  readonly startBuilder: () => Promise<BuilderStartOutcome>;
  readonly readBuilderStatus: () => Promise<BuilderTaskStatus>;
  /** The builder's `lastBuiltSha`, or `null`. May throw. */
  readonly readLastBuiltSha: () => string | null;
  /** The builder's `last-check.json`, or `null`. May throw. */
  readonly readLastCheck: () => BuildCheck | null;
  readonly buildOnDisk: (tree: string) => boolean;
  /** Spawn the detached swap helper; resolves once it is running. */
  readonly startUpdate: (tree: string) => Promise<void>;
  /** Quit shortly after the result has been sent back. */
  readonly quitSoon: () => void;
  readonly now: () => number;
  readonly sleep: (ms: number) => Promise<void>;
  readonly testMode: boolean;
  readonly record: (kind: string, payload: unknown) => void;
  readonly log: Logger;
  readonly timeoutMs?: number;
  readonly pollMs?: number;
}

export interface ForceUpdate {
  /** Never rejects. */
  request(): Promise<UpdateResult>;
}

type WaitOutcome =
  | { readonly kind: 'done'; readonly runStartedAt: number }
  | { readonly kind: 'failed' }
  | { readonly kind: 'timed-out' }
  | { readonly kind: 'unreadable' };

const failed = (reason: string): UpdateResult => ({ status: 'failed', reason });
const short = (tree: string | null): string | null => (tree === null ? null : tree.slice(0, SHORT_BUILD_LENGTH));

export function createForceUpdate(deps: ForceUpdateDeps): ForceUpdate {
  const timeoutMs = deps.timeoutMs ?? FORCE_UPDATE_TIMEOUT_MS;
  const pollMs = deps.pollMs ?? BUILDER_POLL_INTERVAL_MS;
  let inFlight: Promise<UpdateResult> | null = null;

  /** Wait until a builder run that started at or after `since` (or was already running) ends. */
  const waitForBuilder = async (since: number, alreadyRunning: boolean): Promise<WaitOutcome> => {
    const deadline = deps.now() + timeoutMs;
    let seenRunning = alreadyRunning;
    for (;;) {
      let status: BuilderTaskStatus;
      try {
        status = await deps.readBuilderStatus();
      } catch (error) {
        deps.log.error(`force update: the builder status could not be read: ${describeError(error)}`);
        return { kind: 'unreadable' };
      }
      if (status.running) {
        seenRunning = true;
      } else {
        const ranSince = status.lastRunAt !== null && status.lastRunAt >= since - LAST_RUN_SLACK_MS;
        if (seenRunning || ranSince) {
          if (status.lastResult === 0) return { kind: 'done', runStartedAt: status.lastRunAt ?? since };
          deps.log.error(`force update: the builder exited ${String(status.lastResult)}`);
          return { kind: 'failed' };
        }
      }
      if (deps.now() >= deadline) return { kind: 'timed-out' };
      await deps.sleep(pollMs);
    }
  };

  const newerBuild = (runningTree: string): string | null => {
    let lastBuiltSha: string | null;
    try {
      lastBuiltSha = deps.readLastBuiltSha();
    } catch (error) {
      deps.log.warn(`force update: builder state unreadable: ${describeError(error)}`);
      lastBuiltSha = null;
    }
    const decision = decideUpdate({
      runningTree,
      lastBuiltSha,
      buildOnDisk: deps.buildOnDisk,
      remindAfter: null,
      now: new Date(deps.now()),
    });
    return decision.kind === 'prompt' ? decision.tree : null;
  };

  /** 'up-to-date' only when the finished run looked, and saw the running build. */
  const upToDateOrWhyNot = (runningTree: string, runStartedAt: number): UpdateResult => {
    let check: BuildCheck | null;
    try {
      check = deps.readLastCheck();
    } catch (error) {
      deps.log.warn(`force update: last-check.json unreadable: ${describeError(error)}`);
      check = null;
    }
    if (check === null || check.checkedAt < runStartedAt - LAST_RUN_SLACK_MS) {
      deps.log.warn('force update: the builder run left no check of its own');
      return failed(FAILURE_REASONS.noCheck);
    }
    if (check.skip !== '') {
      deps.log.warn(`force update: the builder could not check (${check.skip})`);
      return failed(SKIP_REASONS[check.skip]);
    }
    if (check.remoteTree !== runningTree) {
      deps.log.warn(`force update: origin/main has desktop tree ${String(check.remoteTree)}, but no build of it is ready`);
      return failed(FAILURE_REASONS.notOnDisk);
    }
    deps.log.info(`force update: origin/main is the running build ${runningTree}`);
    return { status: 'up-to-date', build: short(runningTree) };
  };

  const run = async (): Promise<UpdateResult> => {
    if (deps.testMode) {
      deps.record('update-request', {});
      deps.log.info('force update recorded (test mode); nothing started');
      return { status: 'up-to-date', build: null };
    }
    const runningTree = deps.runningTree;
    if (runningTree === null) return failed(FAILURE_REASONS.notInstalled);

    const since = deps.now();
    let outcome: BuilderStartOutcome;
    try {
      outcome = await deps.startBuilder();
    } catch (error) {
      deps.log.error(`force update: the builder could not be started: ${describeError(error)}`);
      return failed(FAILURE_REASONS.builderStart);
    }
    deps.log.info(`force update: builder ${outcome}; waiting for it to finish`);

    const waited = await waitForBuilder(since, outcome === 'already-running');
    if (waited.kind === 'unreadable') return failed(FAILURE_REASONS.builderStatus);
    if (waited.kind === 'failed') return failed(FAILURE_REASONS.buildFailed);
    if (waited.kind === 'timed-out') {
      deps.log.error(`force update: the builder was still running after ${timeoutMs} ms`);
      return failed(FAILURE_REASONS.timedOut);
    }

    // A newer build already on disk is a real update whatever this run could check.
    const tree = newerBuild(runningTree);
    if (tree === null) return upToDateOrWhyNot(runningTree, waited.runStartedAt);
    try {
      await deps.startUpdate(tree);
    } catch (error) {
      deps.log.error(`force update: the swap helper could not start; staying: ${describeError(error)}`);
      return failed(FAILURE_REASONS.swapFailed);
    }
    deps.log.info(`force update: helper started for build ${tree}; quitting so it can swap`);
    deps.quitSoon();
    return { status: 'restarting', build: short(tree) ?? tree };
  };

  return {
    request(): Promise<UpdateResult> {
      if (inFlight !== null) return inFlight;
      const current = run().finally(() => {
        inFlight = null;
      });
      inFlight = current;
      return current;
    },
  };
}

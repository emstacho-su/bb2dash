/**
 * C-8 (amended) — the Sync button, with zero renderer changes.
 *
 * The web app's own button already inserts the `agent_requests` row and copies
 * the command. The shell watches the partition for that `POST`, reads back the
 * newest queued sync row (R4) and opens a terminal in the repo that runs
 * `claude "/bb-sync <id>"`.
 *
 * Nothing here trusts the renderer: the id comes from a PostgREST row this
 * process read, is checked against `^\d{1,12}$`, and reaches `spawn` as one
 * element of an argv array — never a shell string.
 */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { session as electronSession } from 'electron';

import type { DesktopConfig } from '../core/config';
import { InvalidSyncIdError, buildSyncCommand } from '../core/sync-command';
import type { RestGet } from '../core/types';
import { log, logError } from './log';
import { IS_TEST_MODE, recordEvent } from './test-hook';
import { resolveWtPath } from './wt';
import { PARTITION } from './window';

/** R4, frozen by C-6: the newest queued sync request. */
const R4_QUERY = 'kind=eq.sync&state=eq.queued&select=id,created_at&order=id.desc&limit=1';

interface QueuedRequest {
  readonly id: string;
}

/** PostgREST returns `bigint` ids as numbers or strings depending on the column. */
function validateQueuedRequests(rows: unknown): readonly QueuedRequest[] {
  if (!Array.isArray(rows)) throw new Error('expected an array of rows');
  return rows.map((row) => {
    if (row === null || typeof row !== 'object') throw new Error('expected a row object');
    const id = (row as { id?: unknown }).id;
    if (typeof id !== 'number' && typeof id !== 'string') throw new Error('expected an id');
    return Object.freeze({ id: String(id) });
  });
}

/**
 * Spawn one argv and resolve once it is clear whether the process started.
 *
 * `child_process.spawn` reports a missing or unusable executable asynchronously, through
 * an `error` event, not by throwing — which is why R2-6 existed: the old code logged that
 * event and did nothing else, so a `wt.exe` that had been uninstalled produced a line in a
 * log file nobody was reading and no terminal at all.
 *
 * `error` and `spawn` are mutually exclusive, so the first of the two settles this.
 */
function spawnOnce(argv: readonly string[], cwd: string | undefined): Promise<void> {
  return new Promise((resolve, reject) => {
    const [command, ...args] = argv;
    if (command === undefined) {
      reject(new Error('empty argv'));
      return;
    }

    let child;
    try {
      child = spawn(command, args, {
        ...(cwd === undefined ? {} : { cwd }),
        detached: true,
        stdio: 'ignore',
      });
    } catch (error) {
      // A synchronous throw (an invalid cwd, mostly) never emits an event.
      reject(error instanceof Error ? error : new Error(String(error)));
      return;
    }

    child.once('error', reject);
    child.once('spawn', () => {
      // Detached and unreferenced only once it is really running: unref'ing a process that
      // is about to emit `error` would let this Promise never settle.
      child.unref();
      resolve();
    });
  });
}

/**
 * R2-6 — open the terminal, falling back to PowerShell alone if the first argv will not
 * start. Resolves true when a terminal is running, false when neither would start.
 */
async function launchTerminal(
  argv: readonly string[],
  fallbackArgv: readonly string[] | null,
  repoDir: string,
): Promise<boolean> {
  if (IS_TEST_MODE) {
    recordEvent('sync-terminal', { argv: [...argv], cwd: repoDir });
    log(`sync terminal recorded (test mode): ${argv.length} argv elements`);
    return true;
  }

  // `wt -d` already sets the start directory; `cwd` matters only for the
  // PowerShell fallback, and a missing folder there would fail the spawn.
  const cwd = existsSync(repoDir) ? repoDir : undefined;
  if (cwd === undefined) log(`repoDir ${repoDir} does not exist; spawning without a cwd`);

  try {
    await spawnOnce(argv, cwd);
    return true;
  } catch (error) {
    logError('the sync terminal could not be started', error);
  }

  if (fallbackArgv === null) return false;

  log('retrying the sync terminal with PowerShell alone');
  try {
    await spawnOnce(fallbackArgv, cwd);
    recordEvent('sync-terminal-fallback', { cwd: repoDir });
    return true;
  } catch (error) {
    logError('the PowerShell fallback could not be started either', error);
    return false;
  }
}

export interface SyncWatcherOptions {
  readonly config: DesktopConfig;
  readonly restGet: RestGet;
  /** Overridable so the unit tests never look at this machine's filesystem. */
  readonly wtPath?: string | null;
}

/**
 * Attach the watcher. Returns a `handle` the tests drive directly; in the app
 * it is driven by `webRequest.onCompleted`.
 */
export function createSyncWatcher(options: SyncWatcherOptions): {
  handleAgentRequestPost: () => Promise<void>;
} {
  // `syncterm:<id>` for this run. A request is only ever acted on because this
  // process saw its POST, so an in-memory set is the whole dedupe surface: a
  // restart cannot re-observe a POST that happened before it started.
  const spawnedIds = new Set<string>();

  async function handleAgentRequestPost(): Promise<void> {
    let rows: readonly QueuedRequest[];
    try {
      rows = await options.restGet('agent_requests', R4_QUERY, validateQueuedRequests);
    } catch (error) {
      logError('the queued sync request could not be read back', error);
      return;
    }

    const newest = rows[0];
    if (newest === undefined) {
      log('a POST to agent_requests left no queued sync row; nothing to open');
      return;
    }
    if (spawnedIds.has(newest.id)) return;

    let argv: readonly string[];
    let fallbackArgv: readonly string[] | null;
    let wtPath: string | null;
    try {
      wtPath = options.wtPath === undefined ? resolveWtPath() : options.wtPath;
      const input = {
        repoDir: options.config.repoDir,
        id: newest.id,
        dryRun: options.config.syncDryRun,
      };
      argv = buildSyncCommand({ ...input, wtPath });
      // R2-6: the same command with `wtPath: null` is the PowerShell-alone form. Built
      // here, before anything is spawned, so a failure to build is not mistaken for a
      // failure to launch.
      fallbackArgv = wtPath === null ? null : buildSyncCommand({ ...input, wtPath: null });
    } catch (error) {
      if (error instanceof InvalidSyncIdError) {
        log(`sync request rejected: ${error.message}`);
        return;
      }
      logError('the sync terminal could not be prepared', error);
      return;
    }

    // Marked before the spawn so a second POST arriving mid-launch cannot open a second
    // terminal, and un-marked below if nothing started — otherwise one failed launch would
    // mean this request could never open a terminal for the rest of the run (R2-6).
    spawnedIds.add(newest.id);
    log(
      `sync request ${newest.id}: opening ${wtPath === null ? 'PowerShell' : 'Windows Terminal'}` +
        `${options.config.syncDryRun ? ' (dry run)' : ''}`,
    );

    try {
      const launched = await launchTerminal(argv, fallbackArgv, options.config.repoDir);
      if (!launched) {
        spawnedIds.delete(newest.id);
        log(`sync request ${newest.id}: no terminal started; the id is free to retry`);
      }
    } catch (error) {
      spawnedIds.delete(newest.id);
      logError(`sync request ${newest.id}: the terminal launch failed unexpectedly`, error);
    }
  }

  return { handleAgentRequestPost };
}

/** Wire the watcher to the renderer's own `POST /rest/v1/agent_requests` (C-8). */
export function attachSyncWatcher(options: SyncWatcherOptions): void {
  const watcher = createSyncWatcher(options);
  const filter = { urls: [`${options.config.supabaseUrl.replace(/\/+$/, '')}/rest/v1/agent_requests*`] };

  electronSession.fromPartition(PARTITION).webRequest.onCompleted(filter, (details) => {
    if (details.method !== 'POST') return;
    if (details.statusCode < 200 || details.statusCode >= 300) return;
    void watcher.handleAgentRequestPost();
  });

  log(`sync watcher attached to ${filter.urls[0]}`);
}

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
import { join } from 'node:path';
import { session as electronSession } from 'electron';

import type { DesktopConfig } from '../core/config';
import { InvalidSyncIdError, buildSyncCommand, pickWtPath } from '../core/sync-command';
import type { RestGet } from '../core/types';
import { log, logError } from './log';
import { IS_TEST_MODE, recordEvent } from './test-hook';
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
 * `%LOCALAPPDATA%\Microsoft\WindowsApps\wt.exe` first — the Store execution
 * alias — then `wt.exe` on PATH, then `null` for the PowerShell fallback.
 */
export function resolveWtPath(env: NodeJS.ProcessEnv = process.env): string | null {
  const candidates: string[] = [];
  const localAppData = env.LOCALAPPDATA;
  if (localAppData) candidates.push(join(localAppData, 'Microsoft', 'WindowsApps', 'wt.exe'));
  for (const dir of (env.PATH ?? '').split(';')) {
    if (dir.length > 0) candidates.push(join(dir, 'wt.exe'));
  }
  return pickWtPath(candidates, existsSync);
}

function launchTerminal(argv: readonly string[], repoDir: string): void {
  if (IS_TEST_MODE) {
    recordEvent('sync-terminal', { argv: [...argv], cwd: repoDir });
    log(`sync terminal recorded (test mode): ${argv.length} argv elements`);
    return;
  }

  const [command, ...args] = argv;
  if (command === undefined) throw new Error('empty argv');

  // `wt -d` already sets the start directory; `cwd` matters only for the
  // PowerShell fallback, and a missing folder there would fail the spawn.
  const cwd = existsSync(repoDir) ? repoDir : undefined;
  if (cwd === undefined) log(`repoDir ${repoDir} does not exist; spawning without a cwd`);

  const child = spawn(command, args, {
    ...(cwd === undefined ? {} : { cwd }),
    detached: true,
    stdio: 'ignore',
  });
  child.on('error', (error) => logError('the sync terminal could not be started', error));
  child.unref();
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

    try {
      const wtPath = options.wtPath === undefined ? resolveWtPath() : options.wtPath;
      const argv = buildSyncCommand({
        repoDir: options.config.repoDir,
        id: newest.id,
        wtPath,
        dryRun: options.config.syncDryRun,
      });
      spawnedIds.add(newest.id);
      log(
        `sync request ${newest.id}: opening ${wtPath === null ? 'PowerShell' : 'Windows Terminal'}` +
          `${options.config.syncDryRun ? ' (dry run)' : ''}`,
      );
      launchTerminal(argv, options.config.repoDir);
    } catch (error) {
      if (error instanceof InvalidSyncIdError) {
        log(`sync request rejected: ${error.message}`);
        return;
      }
      logError('the sync terminal could not be prepared', error);
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

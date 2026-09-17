/**
 * R2-6 — the Sync terminal's spawn, with `child_process` and `electron` mocked.
 *
 * `spawn` reports a missing or unusable executable asynchronously, through an `error`
 * event, not by throwing. The old code marked the request id as spawned *before* the
 * spawn and only logged that event, so a `wt.exe` that had been uninstalled produced a
 * line in a log file nobody reads, no terminal, and an id that could never be retried for
 * the rest of the run — while the app's own toast told Stack a sync was starting.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const fake = vi.hoisted(() => ({
  spawns: [] as { command: string; args: string[]; cwd: string | undefined }[],
  /** Commands whose spawn emits `error` instead of `spawn`. */
  failing: new Set<string>(),
  /** Commands whose spawn throws synchronously. */
  throwing: new Set<string>(),
  unrefs: 0,
}));

vi.mock('node:child_process', () => ({
  spawn(command: string, args: string[], options: { cwd?: string }) {
    fake.spawns.push({ command, args, cwd: options.cwd });
    if (fake.throwing.has(command)) throw new Error(`EINVAL spawning ${command}`);

    const handlers: Record<string, ((...a: unknown[]) => void)[]> = {};
    const child = {
      once(event: string, handler: (...a: unknown[]) => void) {
        (handlers[event] ??= []).push(handler);
        return child;
      },
      unref() {
        fake.unrefs += 1;
      },
    };
    // Asynchronously, as the real thing does: `error` and `spawn` are exclusive.
    queueMicrotask(() => {
      const event = fake.failing.has(command) ? 'error' : 'spawn';
      const payload = event === 'error' ? new Error(`ENOENT ${command}`) : undefined;
      for (const handler of handlers[event] ?? []) handler(payload);
    });
    return child;
  },
}));

vi.mock('electron', () => ({
  session: {
    fromPartition: () => ({ webRequest: { onCompleted: () => undefined } }),
  },
}));

vi.mock('../../src/main/log', () => ({
  log: () => undefined,
  logError: () => undefined,
  logFilePath: () => null,
  createNamedLogger: () => ({ info: () => undefined, warn: () => undefined, error: () => undefined }),
}));

import { createSyncWatcher } from '../../src/main/sync-terminal';
import type { DesktopConfig } from '../../src/core/config';
import type { RestGet } from '../../src/core/types';

const WT = 'C:\\Users\\estac\\AppData\\Local\\Microsoft\\WindowsApps\\wt.exe';
const POWERSHELL = 'powershell.exe';

const CONFIG = {
  appUrl: 'http://127.0.0.1:4321',
  supabaseUrl: 'http://127.0.0.1:4321',
  supabaseAnonKey: 'eyJhbGciOiJIUzI1NiJ9.anon.signature',
  repoDir: 'C:\\Users\\estac\\projects\\bb2dash',
  pollIntervalMinutes: 15,
  dueReminderTime: '18:00',
  syncDryRun: false,
} as DesktopConfig;

/** R4 answers with one queued row of the given id, or none. */
function restStub(id: string | null): RestGet {
  return async <T>(_relation: string, _query: string, validate: (rows: unknown) => T) =>
    validate(id === null ? [] : [{ id, created_at: '2026-09-17T00:00:00.000Z' }]);
}

function watcher(options: { id?: string | null; wtPath?: string | null } = {}) {
  return createSyncWatcher({
    config: CONFIG,
    restGet: restStub(options.id === undefined ? '77' : options.id),
    wtPath: options.wtPath === undefined ? WT : options.wtPath,
  });
}

beforeEach(() => {
  fake.spawns.length = 0;
  fake.failing.clear();
  fake.throwing.clear();
  fake.unrefs = 0;
});

describe('the happy path', () => {
  it('spawns Windows Terminal once and unrefs it', async () => {
    const { handleAgentRequestPost } = watcher();
    await handleAgentRequestPost();

    expect(fake.spawns).toHaveLength(1);
    expect(fake.spawns[0]?.command).toBe(WT);
    expect(fake.spawns[0]?.args).toContain('--title');
    expect(fake.spawns[0]?.args).toContain('bb-sync 77');
    expect(fake.unrefs).toBe(1);
  });

  it('opens no second terminal for the same request', async () => {
    const { handleAgentRequestPost } = watcher();
    await handleAgentRequestPost();
    await handleAgentRequestPost();
    expect(fake.spawns).toHaveLength(1);
  });
});

describe('R2-6 — the PowerShell fallback', () => {
  it('falls back once when Windows Terminal will not start', async () => {
    fake.failing.add(WT);
    const { handleAgentRequestPost } = watcher();

    await handleAgentRequestPost();

    // Before the fix this logged the error and opened nothing at all.
    expect(fake.spawns.map((s) => s.command)).toEqual([WT, POWERSHELL]);
    // The fallback carries the repo through `Set-Location`, since there is no `wt -d`.
    expect(fake.spawns[1]?.args.at(-1)).toContain('Set-Location');
    expect(fake.spawns[1]?.args.at(-1)).toContain(CONFIG.repoDir);
    expect(fake.spawns[1]?.args.at(-1)).toContain("claude '/bb-sync 77'");
    expect(fake.unrefs).toBe(1);
  });

  it('falls back when the spawn throws synchronously too', async () => {
    fake.throwing.add(WT);
    const { handleAgentRequestPost } = watcher();
    await handleAgentRequestPost();
    expect(fake.spawns.map((s) => s.command)).toEqual([WT, POWERSHELL]);
  });

  it('does not fall back to PowerShell when PowerShell was already the command', async () => {
    fake.failing.add(POWERSHELL);
    const { handleAgentRequestPost } = watcher({ wtPath: null });
    await handleAgentRequestPost();
    expect(fake.spawns.map((s) => s.command)).toEqual([POWERSHELL]);
  });

  it('having fallen back once, the request is done', async () => {
    fake.failing.add(WT);
    const { handleAgentRequestPost } = watcher();
    await handleAgentRequestPost();
    await handleAgentRequestPost();
    expect(fake.spawns).toHaveLength(2);
  });
});

describe('R2-6 — an id is only spent when a terminal actually started', () => {
  it('frees the id when neither command starts, so a retry can work', async () => {
    fake.failing.add(WT);
    fake.failing.add(POWERSHELL);
    const { handleAgentRequestPost } = watcher();

    await handleAgentRequestPost();
    expect(fake.spawns.map((s) => s.command)).toEqual([WT, POWERSHELL]);

    // Before the fix the id was marked before the spawn and never un-marked, so this
    // request could never open a terminal again for the rest of the run.
    fake.failing.clear();
    await handleAgentRequestPost();
    expect(fake.spawns.map((s) => s.command)).toEqual([WT, POWERSHELL, WT]);
  });

  it('keeps the id when the terminal did start', async () => {
    const { handleAgentRequestPost } = watcher();
    await handleAgentRequestPost();
    await handleAgentRequestPost();
    expect(fake.spawns).toHaveLength(1);
  });
});

describe('nothing is spawned when there is nothing to spawn', () => {
  it('rejects an id that is not ^\\d{1,12}$ before building any argv', async () => {
    for (const id of ['', 'nope', '1.5', '-1', '1234567890123', '77; rm -rf /']) {
      fake.spawns.length = 0;
      const { handleAgentRequestPost } = createSyncWatcher({
        config: CONFIG,
        restGet: restStub(id),
        wtPath: WT,
      });
      await handleAgentRequestPost();
      expect(fake.spawns).toEqual([]);
    }
  });

  it('does nothing when the POST left no queued row', async () => {
    const { handleAgentRequestPost } = watcher({ id: null });
    await handleAgentRequestPost();
    expect(fake.spawns).toEqual([]);
  });

  it('does nothing when the read-back fails', async () => {
    const { handleAgentRequestPost } = createSyncWatcher({
      config: CONFIG,
      restGet: async () => {
        throw new Error('PostgREST is unreachable');
      },
      wtPath: WT,
    });
    await handleAgentRequestPost();
    expect(fake.spawns).toEqual([]);
  });
});

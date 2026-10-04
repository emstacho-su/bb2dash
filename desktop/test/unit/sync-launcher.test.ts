/**
 * Brief 100 task 18 (R-85, P-43): `syncLauncher`. Under `terminal` (the default) the Sync button
 * still opens Windows Terminal through the sync watcher. Under `queue-only` the button only
 * queues the request, the container's runner takes it, and the shell attaches no watcher; it
 * looks for the container's "login needed" item through the poller's per-tick hook instead
 * (2026-10-03), and again right after the window's page finishes loading (round 2, item 5).
 *
 * `main/index.ts` bootstraps at import, so each case imports it fresh with every collaborator
 * mocked and `app.whenReady()` resolved, then reads what `start()` wired. Nothing opens a window,
 * a terminal or a browser.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import { parseConfig, usesSyncTerminal } from '../../src/core/config';
import type { DesktopConfig } from '../../src/core/config';

const ANON = { supabaseAnonKey: 'eyJhbGciOiJIUzI1NiJ9.anon.signature' };

const fake = vi.hoisted(() => ({
  config: null as unknown as DesktopConfig,
  watcherAttached: 0,
  sessionReader: async () => null,
  pollerGetSession: null as (() => Promise<unknown>) | null,
  pollerOnTick: undefined as unknown,
  afterSessionReloads: 0,
  windowHandlers: {} as Record<string, (() => void)[]>,
  logs: [] as string[],
}));

vi.mock('electron', () => {
  const app = {
    disableHardwareAcceleration: () => undefined,
    requestSingleInstanceLock: () => true,
    setAppUserModelId: () => undefined,
    on: () => app,
    whenReady: () => Promise.resolve(),
    getPath: () => 'C:\\fake',
    quit: () => undefined,
    exit: () => undefined,
  };
  return { app, BrowserWindow: class {}, ipcMain: {}, shell: {} };
});

vi.mock('../../src/main/log', () => ({
  log: (message: string) => fake.logs.push(message),
  logError: (context: string) => fake.logs.push(context),
  logFilePath: () => null,
  createNamedLogger: () => ({ info: () => undefined, warn: () => undefined, error: () => undefined }),
}));
vi.mock('../../src/main/config', () => ({
  loadConfig: () => fake.config,
  reportConfigError: () => undefined,
}));
vi.mock('../../src/main/sync-terminal', () => ({
  attachSyncWatcher: () => {
    fake.watcherAttached += 1;
  },
}));
vi.mock('../../src/main/session', () => ({ createUsableSessionReader: () => fake.sessionReader }));
vi.mock('../../src/main/poller-wiring', () => ({
  startPoller: (deps: { getSession: () => Promise<unknown>; onTick?: unknown }) => {
    fake.pollerGetSession = deps.getSession;
    fake.pollerOnTick = deps.onTick;
    return {
      runOnce: async () => ({}),
      attachWindow: () => undefined,
      stop: () => undefined,
      navigate: () => false,
      afterSessionReload: () => {
        fake.afterSessionReloads += 1;
      },
    };
  },
}));
vi.mock('../../src/main/rest', () => ({
  createMainRest: () => async () => [],
  createMainSessionRest: () => () => async () => [],
}));
vi.mock('../../src/main/navigation', () => ({ attachNavigationGuards: () => undefined }));
vi.mock('../../src/main/test-hook', () => ({
  IS_TEST_MODE: false,
  installShellTestHook: () => undefined,
  recordEvent: () => undefined,
}));
vi.mock('../../src/main/update-os', () => ({
  buildOnDisk: () => false,
  createDockerReadyCheck: () => async () => true,
  createReadBuilderStatus: () => async () => ({}),
  createStartBuilderTask: () => async () => 'started',
  launchStateDir: () => null,
  readLastBuiltSha: () => null,
  readLastCheck: () => null,
  readRunningTree: () => null,
  startUpdateHelper: async () => undefined,
  writeForceRequest: () => undefined,
}));
vi.mock('../../src/main/update-request', () => ({
  createUpdateRequestHandler: () => () => undefined,
  registerUpdateRequest: () => undefined,
}));
vi.mock('../../src/main/update-prompt', () => ({ showUpdatePrompt: async () => 'dismissed' }));
vi.mock('../../src/main/update-reminder-store', () => ({
  REMINDER_FILENAME: 'update-reminder.json',
  createReminderStore: () => ({}),
}));
vi.mock('../../src/main/tray', () => ({
  MENU_CHECK_NOW: 'Check now',
  createTray: () => ({ click: () => undefined }),
}));
vi.mock('../../src/main/window', () => ({
  createWindow: () => ({}),
  ensureLoaded: () => undefined,
  firstLoad: async () => undefined,
  needsReload: () => false,
  refreshSessionWithoutWindow: () => undefined,
  showWindow: () => undefined,
}));
/** A window whose `webContents.on` handlers the cases can fire, as Electron would. */
function fakeWindow() {
  const on = (event: string, handler: () => void) => {
    (fake.windowHandlers[event] ??= []).push(handler);
  };
  return { webContents: { on, once: on }, once: () => undefined, on: () => undefined };
}

vi.mock('../../src/main/window-controller', () => ({
  createWindowController: (deps: { onCreated: (window: unknown) => void }) => ({
    open: () => {
      const window = fakeWindow();
      deps.onCreated(window);
      return { created: true, window };
    },
    current: () => null,
  }),
}));

/** Import `main/index.ts` fresh under `config` and let `start()` run. */
async function startShellWith(config: DesktopConfig): Promise<void> {
  vi.resetModules();
  fake.config = config;
  fake.watcherAttached = 0;
  fake.pollerGetSession = null;
  fake.pollerOnTick = undefined;
  fake.afterSessionReloads = 0;
  fake.windowHandlers = {};
  fake.logs.length = 0;
  await import('../../src/main/index');
  await new Promise((resolve) => setTimeout(resolve, 0));
}

afterEach(() => {
  vi.resetModules();
});

describe('usesSyncTerminal', () => {
  it('is true for the default and for terminal, false for queue-only', () => {
    expect(usesSyncTerminal(parseConfig(ANON))).toBe(true);
    expect(usesSyncTerminal(parseConfig({ ...ANON, syncLauncher: 'terminal' }))).toBe(true);
    expect(usesSyncTerminal(parseConfig({ ...ANON, syncLauncher: 'queue-only' }))).toBe(false);
  });
});

describe('main/index.ts under each syncLauncher', () => {
  it('terminal attaches the sync watcher, and the poller has no login hook', async () => {
    await startShellWith(parseConfig({ ...ANON, syncLauncher: 'terminal' }));
    expect(fake.watcherAttached).toBe(1);
    expect(fake.pollerGetSession).toBe(fake.sessionReader);
    expect(fake.pollerOnTick).toBeUndefined();
  });

  it('queue-only attaches no watcher, so pressing Sync opens no terminal', async () => {
    await startShellWith(parseConfig({ ...ANON, syncLauncher: 'queue-only' }));
    expect(fake.watcherAttached).toBe(0);
    expect(fake.logs.some((line) => /queue-only/.test(line))).toBe(true);
  });

  it('queue-only hands the poller an explicit per-tick hook; the session reader is the plain one', async () => {
    await startShellWith(parseConfig({ ...ANON, syncLauncher: 'queue-only' }));
    expect(typeof fake.pollerOnTick).toBe('function');
    expect(fake.pollerGetSession).toBe(fake.sessionReader);
  });

  it("a finished page load (a session reload) runs the hook again at once", async () => {
    await startShellWith(parseConfig({ ...ANON, syncLauncher: 'queue-only' }));
    expect(fake.windowHandlers['did-finish-load']).toHaveLength(1);
    fake.windowHandlers['did-finish-load']?.[0]?.();
    expect(fake.afterSessionReloads).toBe(1);
  });
});

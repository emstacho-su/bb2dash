/**
 * The seam (`main/poller-wiring.ts`): it builds the store over `userData`, the notifier, the
 * deep-link navigator and the scheduler, then attaches window focus and `powerMonitor`
 * `resume` and installs the test hook.
 *
 * `electron` is mocked, so this runs in vitest. The scheduler's own behaviour is proven in
 * `scheduler.test.ts`; what is proven here is the wiring.
 */

import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** Hoisted so the `vi.mock` factory, which runs before the module body, can reach it. */
const fake = vi.hoisted(() => ({
  powerHandlers: {} as Record<string, ((...args: unknown[]) => void)[]>,
}));

vi.mock('electron', () => ({
  powerMonitor: {
    on(event: string, handler: (...args: unknown[]) => void) {
      (fake.powerHandlers[event] ??= []).push(handler);
    },
    removeListener(event: string, handler: (...args: unknown[]) => void) {
      fake.powerHandlers[event] = (fake.powerHandlers[event] ?? []).filter((h) => h !== handler);
    },
  },
  Notification: class {
    static isSupported() {
      return false;
    }
  },
}));

import { WATERMARK_FILENAME, startPoller } from '../../src/main/poller-wiring';

import type { BrowserWindow } from 'electron';
import type { RestGet, WebSession } from '../../src/core/types';
import { COURSES, syncRow } from '../fixtures/rows';

type Host = typeof globalThis & { __bb2dashTest?: Record<string, unknown> };

const { powerHandlers } = fake;

const SESSION: WebSession = { accessToken: 'token', expiresAt: 4_102_444_800 };
const APP_URL = 'https://web-xi-ten-uy9xk6c6p0.vercel.app';

let dir: string;
const focusHandlers: (() => void)[] = [];

function fakeWindow(): BrowserWindow {
  return {
    on(event: string, handler: () => void) {
      if (event === 'focus') focusHandlers.push(handler);
      return this;
    },
    isMinimized: () => false,
    isVisible: () => true,
    isDestroyed: () => false,
    restore: () => undefined,
    show: () => undefined,
    focus: () => undefined,
    loadURL: async () => undefined,
  } as unknown as BrowserWindow;
}

const SYNC_ROWS = [
  {
    id: 41,
    run_id: 'run-1',
    status: 'ok',
    started_at: '2026-09-16T17:58:00+00:00',
    finished_at: '2099-01-01T00:00:00+00:00',
    trigger: 'app_request',
    summary: { changes: ['2 new announcement(s)'], attention_raised: 1, errors: [] },
  },
];

function restStub(): RestGet {
  const rows: Record<string, unknown> = {
    v_sync_status: SYNC_ROWS,
    v_gradebook_history: [],
    v_work_items: [],
    courses: COURSES,
  };
  return async <T>(relation: string, _q: string, validate: (r: unknown) => T) => validate(rows[relation]);
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'bb2dash-wire-'));
  focusHandlers.length = 0;
  for (const key of Object.keys(powerHandlers)) delete powerHandlers[key];
  delete (globalThis as Host).__bb2dashTest;
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
  delete (globalThis as Host).__bb2dashTest;
});

function start(window: BrowserWindow | null = fakeWindow()) {
  return startPoller({
    userDataDir: dir,
    appUrl: APP_URL,
    config: { pollIntervalMinutes: 15, dueReminderTime: '18:00' },
    getSession: async () => SESSION,
    createRest: () => restStub(),
    getWindow: () => window,
    env: { BB2DASH_TEST: '1' },
    log: { info: () => undefined, warn: () => undefined, error: () => undefined },
  });
}

describe('startPoller', () => {
  it('writes the watermark next to userData under the frozen name', async () => {
    const handle = start();
    await vi.waitFor(async () => {
      const text = await readFile(join(dir, WATERMARK_FILENAME), 'utf8');
      expect(JSON.parse(text)).toMatchObject({ version: 1 });
    });
    handle.stop();
    expect(WATERMARK_FILENAME).toBe('notify-watermark.json');
  });

  it('attaches the focus listener to the window it was given', () => {
    const handle = start();
    expect(focusHandlers).toHaveLength(1);
    handle.stop();
  });

  it('attaches a focus listener at most once per window', () => {
    const window = fakeWindow();
    const handle = start(window);
    handle.attachWindow(window);
    handle.attachWindow(window);
    expect(focusHandlers).toHaveLength(1);
    handle.stop();
  });

  it('survives having no window yet', () => {
    const handle = start(null);
    expect(focusHandlers).toHaveLength(0);
    expect(handle.navigate('/inbox')).toBe(false);
    handle.stop();
  });

  it('subscribes to powerMonitor resume and unsubscribes on stop', () => {
    const handle = start();
    expect(powerHandlers['resume']).toHaveLength(1);
    handle.stop();
    expect(powerHandlers['resume']).toHaveLength(0);
  });

  it('a resume event and a focus event each drive a tick', async () => {
    const handle = start();
    await vi.waitFor(() => readFile(join(dir, WATERMARK_FILENAME), 'utf8'));
    const before = await readFile(join(dir, WATERMARK_FILENAME), 'utf8');

    powerHandlers['resume']?.[0]?.();
    focusHandlers[0]?.();
    // Both paths are fire-and-forget; the watermark advancing is the observable effect.
    await vi.waitFor(async () => {
      expect(await readFile(join(dir, WATERMARK_FILENAME), 'utf8')).not.toBe(before);
    });
    handle.stop();
  });

  it('a toast click routes through the deep-link validator', async () => {
    const window = fakeWindow();
    const handle = start(window);
    await vi.waitFor(() => readFile(join(dir, WATERMARK_FILENAME), 'utf8'));
    expect(handle.navigate('/course/IST.323/grades')).toBe(true);
    expect(handle.navigate('https://evil.example/')).toBe(false);
    handle.stop();
  });

  it('falls back to a redacting console logger when none is injected', async () => {
    const lines: string[] = [];
    const spy = vi.spyOn(console, 'log').mockImplementation((line: unknown) => {
      lines.push(String(line));
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const handle = startPoller({
      userDataDir: dir,
      appUrl: APP_URL,
      config: { pollIntervalMinutes: 15, dueReminderTime: '18:00' },
      getSession: async () => null,
      createRest: () => restStub(),
      getWindow: () => null,
      env: {},
    });
    await vi.waitFor(() => expect(lines.some((line) => line.startsWith('[poller]'))).toBe(true));
    handle.stop();
    spy.mockRestore();
    warn.mockRestore();
    error.mockRestore();
  });

  it('installs the C-10 hook, and tick(fixture) drives a real tick end to end', async () => {
    const handle = start();
    const surface = (globalThis as Host).__bb2dashTest as {
      recorded: () => { toasts: { key: string; route: string }[]; navigations: unknown[] };
      tick: (rows: unknown) => Promise<{ outcome: string }>;
      clickToast: (key: string) => boolean;
    };
    expect(surface).toBeDefined();

    // The launch tick runs first; wait for the watermark before driving a fixture tick.
    await vi.waitFor(() => readFile(join(dir, WATERMARK_FILENAME), 'utf8'));

    const first = await surface.tick({
      sync: syncRow({ id: 77, finished_at: '2099-01-02T00:00:00.000Z' }),
      grades: [],
      due: null,
      courses: COURSES,
    });
    expect(first.outcome).toBe('fired');
    expect(surface.recorded().toasts.map((t) => t.key)).toContain('sync:77');

    // A second identical tick fires nothing.
    const second = await surface.tick({
      sync: syncRow({ id: 77, finished_at: '2099-01-02T00:00:00.000Z' }),
      grades: [],
      due: null,
      courses: COURSES,
    });
    expect(second.outcome).toBe('quiet');

    // And a recorded click navigates to the toast's own route.
    expect(surface.clickToast('sync:77')).toBe(true);
    expect(surface.recorded().navigations).toHaveLength(1);
    expect(surface.clickToast('does-not-exist')).toBe(false);

    handle.stop();
  });

  it('runOnce is the tray Check now path', async () => {
    const handle = start();
    await vi.waitFor(() => readFile(join(dir, WATERMARK_FILENAME), 'utf8'));
    const result = await handle.runOnce();
    expect(result.reason).toBe('manual');
    handle.stop();
  });

  it('installs no hook when BB2DASH_TEST is not set', () => {
    const handle = startPoller({
      userDataDir: dir,
      appUrl: APP_URL,
      config: { pollIntervalMinutes: 15, dueReminderTime: '18:00' },
      getSession: async () => null,
      createRest: () => restStub(),
      getWindow: () => null,
      env: {},
      log: { info: () => undefined, warn: () => undefined, error: () => undefined },
    });
    expect((globalThis as Host).__bb2dashTest).toBeUndefined();
    handle.stop();
  });
});

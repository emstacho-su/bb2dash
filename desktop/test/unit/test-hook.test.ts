/**
 * The e2e surface (C-10). Two things matter beyond the obvious:
 *  - it exists only under `BB2DASH_TEST=1`;
 *  - it *merges* into `globalThis.__bb2dashTest` instead of assigning over it, because
 *    W-25's sync-terminal recorder (C-8) installs its own entries there and neither worker
 *    may clobber the other's.
 */

import { afterEach, describe, expect, it } from 'vitest';

import {
  createRecorder,
  installShellTestHook,
  installTestHook,
  isTestMode,
} from '../../src/main/test-hook';
import type { TickResult, TickRows } from '../../src/core/poller/scheduler';

type Host = typeof globalThis & { __bb2dashTest?: Record<string, unknown> };

const TEST_ENV = { BB2DASH_TEST: '1' } as NodeJS.ProcessEnv;

function hook(): Record<string, unknown> | undefined {
  return (globalThis as Host).__bb2dashTest;
}

afterEach(() => {
  delete (globalThis as Host).__bb2dashTest;
});

const TOAST = { key: 'sync:41', title: 't', body: 'b', route: '/inbox' };
const RESULT: TickResult = { reason: 'test', outcome: 'fired', toastCount: 1 };

function parts(overrides: Partial<Parameters<typeof installTestHook>[0]> = {}) {
  const recorder = createRecorder();
  return {
    recorder,
    tick: async (_fixture: TickRows) => RESULT,
    clickToast: () => true,
    ...overrides,
  };
}

describe('isTestMode', () => {
  it('is true only for exactly "1"', () => {
    expect(isTestMode({ BB2DASH_TEST: '1' })).toBe(true);
    expect(isTestMode({ BB2DASH_TEST: 'true' })).toBe(false);
    expect(isTestMode({})).toBe(false);
  });
});

describe('createRecorder', () => {
  it('stamps each toast and returns a new array every time (immutability)', () => {
    const recorder = createRecorder(() => new Date('2026-09-16T22:30:00.000Z'));
    const before = recorder.toasts();
    recorder.recordToast(TOAST);
    expect(before).toHaveLength(0);
    expect(recorder.toasts()).toEqual([{ ...TOAST, shownAt: '2026-09-16T22:30:00.000Z' }]);
  });

  it('records navigations and resets both lists', () => {
    const recorder = createRecorder();
    recorder.recordToast(TOAST);
    recorder.recordNavigation('/inbox', true);
    expect(recorder.navigations()).toHaveLength(1);
    recorder.reset();
    expect(recorder.toasts()).toEqual([]);
    expect(recorder.navigations()).toEqual([]);
  });
});

describe('installTestHook', () => {
  it('installs nothing outside test mode', () => {
    installTestHook(parts(), {});
    expect(hook()).toBeUndefined();
  });

  it('exposes recorded(), tick(), clickToast() and resetNotifications()', async () => {
    const p = parts();
    installTestHook(p, TEST_ENV);
    p.recorder.recordToast(TOAST);

    const surface = hook() as {
      recorded: () => { toasts: unknown[]; navigations: unknown[] };
      tick: (f: TickRows) => Promise<TickResult>;
      clickToast: (key: string) => boolean;
      resetNotifications: () => void;
    };

    expect(surface.recorded().toasts).toHaveLength(1);
    expect(await surface.tick({ sync: null, grades: [], due: null, courses: [] })).toEqual(RESULT);
    expect(surface.clickToast('sync:41')).toBe(true);
    surface.resetNotifications();
    expect(surface.recorded().toasts).toEqual([]);
  });

  it('keeps W-25\u2019s entries and merges its recorded() output', () => {
    // Stand in for the sync-terminal recorder installing first (C-8).
    (globalThis as Host).__bb2dashTest = {
      recorded: () => ({ spawns: [['wt.exe', '-d', 'C:/repo']] }),
      resetSpawns: () => 'untouched',
    };

    const p = parts();
    installTestHook(p, TEST_ENV);
    p.recorder.recordNavigation('/inbox', true);

    const surface = hook() as {
      recorded: () => Record<string, unknown>;
      resetSpawns: () => string;
    };
    const recorded = surface.recorded();
    expect(recorded['spawns']).toEqual([['wt.exe', '-d', 'C:/repo']]);
    expect(recorded['navigations']).toHaveLength(1);
    expect(surface.resetSpawns()).toBe('untouched');
  });

  it('is idempotent: installing twice does not nest recorded() forever', () => {
    const first = parts();
    installTestHook(first, TEST_ENV);
    const second = parts();
    installTestHook(second, TEST_ENV);
    second.recorder.recordToast(TOAST);
    const recorded = (hook() as { recorded: () => { toasts: unknown[] } }).recorded();
    expect(recorded.toasts).toHaveLength(1);
  });
});

describe("installShellTestHook (W-25's half)", () => {
  it('installs nothing outside test mode', () => {
    installShellTestHook({ clickTrayItem: () => undefined }, {});
    expect(hook()).toBeUndefined();
  });

  it('brings recorded() into being before any poller exists', () => {
    const clicked: string[] = [];
    installShellTestHook({ clickTrayItem: (label) => clicked.push(label) }, TEST_ENV);

    const surface = hook() as {
      recorded: () => { events?: unknown[]; toasts?: unknown[] };
      clickTrayItem: (label: string) => void;
    };
    surface.clickTrayItem('Check now');

    expect(clicked).toEqual(['Check now']);
    // `events` is always present; `toasts` only once the poller half installed.
    expect(surface.recorded().events).toEqual([]);
    expect(surface.recorded().toasts).toBeUndefined();
  });

  it('survives the poller half installing after it, in either order', () => {
    const clicked: string[] = [];
    const p = parts();

    installShellTestHook({ clickTrayItem: (label) => clicked.push(label) }, TEST_ENV);
    installTestHook(p, TEST_ENV);
    p.recorder.recordToast(TOAST);

    const surface = hook() as {
      recorded: () => { events?: unknown[]; toasts?: unknown[] };
      clickTrayItem: (label: string) => void;
      clickToast: (key: string) => boolean;
    };

    surface.clickTrayItem('Quit');
    expect(clicked).toEqual(['Quit']);
    expect(surface.recorded().toasts).toHaveLength(1);
    expect(surface.recorded().events).toEqual([]);
    expect(surface.clickToast('sync:41')).toBe(true);
  });

  it('does not nest a foreign recorded() when both halves install', () => {
    (globalThis as Host).__bb2dashTest = {
      recorded: () => ({ spawns: [['wt.exe']] }),
    };

    const p = parts();
    installShellTestHook({ clickTrayItem: () => undefined }, TEST_ENV);
    installTestHook(p, TEST_ENV);
    installShellTestHook({ clickTrayItem: () => undefined }, TEST_ENV);

    const recorded = (hook() as { recorded: () => Record<string, unknown> }).recorded();
    expect(recorded['spawns']).toEqual([['wt.exe']]);
    expect(recorded['toasts']).toEqual([]);
    expect(recorded['events']).toEqual([]);
  });
});

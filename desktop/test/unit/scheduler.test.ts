/**
 * Tick orchestration (C-7 Scheduler).
 *
 * The clock, the timers, the session, the transport, the notifier and the store are all
 * injected, so every case here is deterministic and nothing touches Electron or the network.
 *
 * What is proven: launch + interval + focus (throttled to 60 s) + resume + runOnce, that two
 * ticks never overlap, and that a tick which cannot read the session or any relation changes
 * nothing at all.
 */

import { describe, expect, it, vi } from 'vitest';

import {
  FOCUS_THROTTLE_MS,
  type TimerHandle,
  type Timers,
  createPoller,
} from '../../src/core/poller/scheduler';
import type { Notifier, RestGet, Toast, Watermark, WatermarkStore, WebSession } from '../../src/core/types';
import { COURSES, dueRow, gradeRow, syncRow, watermark } from '../fixtures/rows';

const SESSION: WebSession = { accessToken: 'test-token', expiresAt: 4_102_444_800 };
const CONFIG = { pollIntervalMinutes: 15, dueReminderTime: '18:00' };

/** 18:30 New York. */
const NOW = new Date('2026-09-16T22:30:00.000Z');
/** 12:00 New York — before the due reminder time. */
const MIDDAY = new Date('2026-09-16T16:00:00.000Z');

function memoryStore(initial: Watermark | null = watermark()): WatermarkStore & {
  value: Watermark | null;
  writes: number;
} {
  const state = {
    value: initial,
    writes: 0,
    async read() {
      return state.value;
    },
    async write(next: Watermark) {
      state.writes += 1;
      state.value = next;
    },
  };
  return state;
}

function recordingNotifier(): Notifier & { shown: Toast[] } {
  const shown: Toast[] = [];
  return {
    shown,
    async show(toast) {
      shown.push(toast);
    },
  };
}

interface RestOptions {
  readonly sync?: unknown;
  readonly grades?: unknown;
  readonly due?: unknown;
  readonly courses?: unknown;
  readonly failOn?: string;
}

function restStub(options: RestOptions = {}): { createRest: () => RestGet; relations: string[] } {
  const relations: string[] = [];
  const rows: Record<string, unknown> = {
    v_sync_status: options.sync ?? [],
    v_gradebook_history: options.grades ?? [],
    v_work_items: options.due ?? [],
    courses: options.courses ?? COURSES,
  };
  const get: RestGet = async <T>(relation: string, _q: string, validate: (r: unknown) => T) => {
    relations.push(relation);
    if (options.failOn === relation) throw new Error(`${relation} is unreachable`);
    return validate(rows[relation]);
  };
  return { createRest: () => get, relations };
}

function manualTimers(): Timers & { fire(): void; cleared: boolean; ms: number | null } {
  let callback: (() => void) | null = null;
  const state = {
    cleared: false,
    ms: null as number | null,
    setInterval(fn: () => void, ms: number): TimerHandle {
      callback = fn;
      state.ms = ms;
      return { id: 'manual' };
    },
    clearInterval(_handle: TimerHandle) {
      state.cleared = true;
      callback = null;
    },
    fire() {
      callback?.();
    },
  };
  return state;
}

const SYNC_ROWS = [
  {
    id: 41,
    run_id: 'run-1',
    status: 'ok',
    started_at: '2026-09-16T17:58:00+00:00',
    finished_at: '2026-09-16T18:00:00+00:00',
    trigger: 'app_request',
    summary: { changes: ['2 new announcement(s)'], attention_raised: 0, errors: [] },
  },
];

function poller(overrides: Partial<Parameters<typeof createPoller>[0]> = {}) {
  const store = memoryStore();
  const notifier = recordingNotifier();
  const rest = restStub({ sync: SYNC_ROWS });
  const instance = createPoller({
    config: CONFIG,
    store,
    notifier,
    getSession: async () => SESSION,
    createRest: rest.createRest,
    clock: () => NOW,
    timers: manualTimers(),
    ...overrides,
  });
  return { instance, store, notifier, rest };
}

describe('a normal tick', () => {
  it('fires the toasts and writes the watermark', async () => {
    const { instance, store, notifier } = poller();
    const result = await instance.runOnce();
    expect(result.outcome).toBe('fired');
    expect(notifier.shown.map((t) => t.key)).toEqual(['sync:41']);
    expect(store.value?.lastSeenAt).toBe(NOW.toISOString());
    expect(store.value?.firedKeys).toContain('sync:41');
  });

  it('is quiet when there is nothing new', async () => {
    const rest = restStub({});
    const { instance, notifier } = poller({ createRest: rest.createRest });
    expect((await instance.runOnce()).outcome).toBe('quiet');
    expect(notifier.shown).toEqual([]);
  });

  it('reads the course labels once per launch, not once per tick', async () => {
    const rest = restStub({ sync: SYNC_ROWS });
    const { instance } = poller({ createRest: rest.createRest });
    await instance.runOnce();
    await instance.runOnce();
    expect(rest.relations.filter((r) => r === 'courses')).toHaveLength(1);
    expect(rest.relations.filter((r) => r === 'v_sync_status')).toHaveLength(2);
  });

  it('still writes the watermark when a toast is refused', async () => {
    const store = memoryStore();
    const notifier: Notifier = {
      async show() {
        throw new Error('Windows declined it');
      },
    };
    const { instance } = poller({ store, notifier });
    expect((await instance.runOnce()).outcome).toBe('fired');
    expect(store.value?.firedKeys).toContain('sync:41');
  });

  it('reports a failed watermark write rather than claiming success', async () => {
    const store: WatermarkStore = {
      read: async () => watermark(),
      write: async () => {
        throw new Error('disk full');
      },
    };
    const { instance } = poller({ store });
    expect((await instance.runOnce()).outcome).toBe('skipped-write-failed');
  });
});

describe('the daily due check', () => {
  it('is not issued before the reminder time', async () => {
    const rest = restStub({});
    const { instance } = poller({ createRest: rest.createRest, clock: () => MIDDAY });
    await instance.runOnce();
    expect(rest.relations).not.toContain('v_work_items');
  });

  it('is issued once at or after the reminder time and then not again that day', async () => {
    const rest = restStub({ due: [{ ...dueRow(), item_kind: 'assignment' }] });
    const store = memoryStore();
    const { instance, notifier } = poller({ createRest: rest.createRest, store });
    await instance.runOnce();
    expect(rest.relations.filter((r) => r === 'v_work_items')).toHaveLength(1);
    expect(notifier.shown.map((t) => t.key)).toEqual(['due:2026-09-16']);
    expect(store.value?.dueCheckedOn).toBe('2026-09-16');

    await instance.runOnce();
    expect(rest.relations.filter((r) => r === 'v_work_items')).toHaveLength(1);
    expect(notifier.shown).toHaveLength(1);
  });
});

describe('a tick that cannot complete changes nothing', () => {
  it('skips when there is no readable session', async () => {
    const store = memoryStore();
    const rest = restStub({ sync: SYNC_ROWS });
    const { instance, notifier } = poller({
      store,
      createRest: rest.createRest,
      getSession: async () => null,
    });
    expect((await instance.runOnce()).outcome).toBe('skipped-no-session');
    expect(notifier.shown).toEqual([]);
    expect(store.writes).toBe(0);
    expect(rest.relations).toEqual([]);
  });

  it.each(['courses', 'v_sync_status', 'v_gradebook_history'])(
    'skips when %s is unreachable',
    async (relation) => {
      const store = memoryStore();
      const before = store.value;
      const rest = restStub({ sync: SYNC_ROWS, failOn: relation });
      const { instance, notifier } = poller({ store, createRest: rest.createRest });
      expect((await instance.runOnce()).outcome).toBe('skipped-read-failed');
      expect(notifier.shown).toEqual([]);
      expect(store.writes).toBe(0);
      expect(store.value).toBe(before);
    },
  );

  it('skips when a relation returns a shape that fails validation', async () => {
    const store = memoryStore();
    const rest = restStub({ grades: [{ shell_course_id: 1 }] });
    const { instance } = poller({ store, createRest: rest.createRest });
    expect((await instance.runOnce()).outcome).toBe('skipped-read-failed');
    expect(store.writes).toBe(0);
  });

  it('does not let a thrown session read escape', async () => {
    const { instance } = poller({
      getSession: async () => {
        throw new Error('cookie partition gone');
      },
    });
    expect((await instance.runOnce()).outcome).toBe('skipped-read-failed');
  });
});

describe('first launch', () => {
  it('initialises the watermark and fires nothing historical', async () => {
    const store = memoryStore(null);
    const rest = restStub({ sync: SYNC_ROWS });
    const { instance, notifier } = poller({ store, createRest: rest.createRest });
    const result = await instance.runOnce();
    expect(result.outcome).toBe('initialised');
    expect(notifier.shown).toEqual([]);
    expect(store.value).toEqual({
      version: 1,
      lastSeenAt: NOW.toISOString(),
      dueCheckedOn: null,
      firedKeys: [],
    });
    expect(rest.relations).toEqual([]);
  });

  it('a relaunch behind the stored watermark fires nothing', async () => {
    const store = memoryStore(null);
    const rest = restStub({ sync: SYNC_ROWS });
    const first = poller({ store, createRest: rest.createRest });
    await first.instance.runOnce();
    // The second process reads the same file.
    const second = poller({ store, createRest: restStub({ sync: SYNC_ROWS }).createRest });
    await second.instance.runOnce();
    expect(second.notifier.shown).toEqual([]);
  });
});

describe('ticks never overlap', () => {
  it('drops a trigger that arrives while a tick is in flight', async () => {
    let release: (() => void) | null = null;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { instance, notifier } = poller({
      getSession: async () => {
        await gate;
        return SESSION;
      },
    });

    const first = instance.runOnce();
    const second = await instance.runOnce('manual');
    expect(second.outcome).toBe('skipped-busy');
    release?.();
    expect((await first).outcome).toBe('fired');
    expect(notifier.shown).toHaveLength(1);
  });

  it('accepts the next trigger once the tick has finished', async () => {
    const { instance } = poller();
    await instance.runOnce();
    expect((await instance.runOnce()).outcome).toBe('quiet');
  });
});

describe('triggers', () => {
  it('start() runs a launch tick and arms the interval from config', async () => {
    const timers = manualTimers();
    const rest = restStub({ sync: SYNC_ROWS });
    const { instance, notifier } = poller({ timers, createRest: rest.createRest });
    const result = await instance.start();
    expect(result.reason).toBe('launch');
    expect(timers.ms).toBe(15 * 60_000);
    expect(notifier.shown).toHaveLength(1);

    // Firing the interval really runs a tick; it is quiet only because sync:41 is deduped.
    timers.fire();
    await vi.waitFor(() =>
      expect(rest.relations.filter((r) => r === 'v_sync_status')).toHaveLength(2),
    );
    expect(notifier.shown).toHaveLength(1);

    instance.stop();
    expect(timers.cleared).toBe(true);
  });

  it('start() is a no-op the second time', async () => {
    const { instance } = poller();
    await instance.start();
    expect((await instance.start()).outcome).toBe('skipped-busy');
  });

  it('never arms an interval shorter than a minute', async () => {
    const timers = manualTimers();
    const { instance } = poller({ timers, config: { ...CONFIG, pollIntervalMinutes: 0 } });
    await instance.start();
    expect(timers.ms).toBe(60_000);
    instance.stop();
  });

  it('onFocus runs at most one tick per 60 s', async () => {
    let at = NOW.getTime();
    const rest = restStub({ sync: SYNC_ROWS });
    const { instance, notifier } = poller({ clock: () => new Date(at), createRest: rest.createRest });

    expect((await instance.onFocus()).reason).toBe('focus');
    at += FOCUS_THROTTLE_MS - 1;
    expect((await instance.onFocus()).outcome).toBe('skipped-busy');
    expect(rest.relations.filter((r) => r === 'v_sync_status')).toHaveLength(1);

    at += 1;
    expect((await instance.onFocus()).outcome).not.toBe('skipped-busy');
    expect(rest.relations.filter((r) => r === 'v_sync_status')).toHaveLength(2);
    expect(notifier.shown).toHaveLength(1); // the second focus tick dedupes
  });

  it('onResume runs a tick, unthrottled', async () => {
    const rest = restStub({ sync: SYNC_ROWS });
    const { instance } = poller({ createRest: rest.createRest });
    expect((await instance.onResume()).reason).toBe('resume');
    expect((await instance.onResume()).reason).toBe('resume');
    expect(rest.relations.filter((r) => r === 'v_sync_status')).toHaveLength(2);
  });

  it('runOnce is the tray Check now path and reports what it did', async () => {
    const { instance } = poller();
    expect(await instance.runOnce()).toEqual({ reason: 'manual', outcome: 'fired', toastCount: 1 });
  });
});

describe('runWithRows (the e2e test hook)', () => {
  it('fires from fixture rows without any transport at all', async () => {
    const rest = restStub({});
    const { instance, notifier, store } = poller({ createRest: rest.createRest });
    const result = await instance.runWithRows({
      sync: syncRow(),
      grades: [gradeRow()],
      due: [dueRow()],
      courses: COURSES,
    });
    expect(result.outcome).toBe('fired');
    expect(notifier.shown.map((t) => t.key)).toEqual([
      'sync:41',
      'grade:IST.323:col-9001:run-a',
      'due:2026-09-16',
    ]);
    expect(rest.relations).toEqual([]);
    expect(store.value?.firedKeys).toHaveLength(3);
  });

  it('a second identical fixture tick fires nothing', async () => {
    const { instance, notifier } = poller();
    const rows = { sync: syncRow(), grades: [gradeRow()], due: [dueRow()], courses: COURSES };
    await instance.runWithRows(rows);
    const second = await instance.runWithRows(rows);
    expect(second.outcome).toBe('quiet');
    expect(notifier.shown).toHaveLength(3);
  });

  it('initialises the watermark on a first-launch store before reducing', async () => {
    const store = memoryStore(null);
    const { instance } = poller({ store });
    await instance.runWithRows({ sync: null, grades: [], due: null, courses: COURSES });
    expect(store.value?.lastSeenAt).toBe(NOW.toISOString());
  });
});

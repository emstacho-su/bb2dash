/**
 * The Electron `Notifier` (C-7 Delivery) with `electron` mocked, so the adapter's own
 * branches are proven without launching a browser process:
 *  - under `BB2DASH_TEST=1` it records and shows nothing;
 *  - otherwise it constructs one `Notification` per toast, click-only (Q6), and routes the
 *    click to the deep-link handler;
 *  - a host that cannot show toasts, or a `Notification` that throws, never takes the tick
 *    down with it.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

/** Hoisted so the `vi.mock` factory, which runs before the module body, can reach it. */
const fake = vi.hoisted(() => ({
  shown: [] as { title: string; body: string }[],
  handlers: {} as Record<string, ((...args: unknown[]) => void)[]>,
  supported: true,
  constructorThrows: false,
}));

vi.mock('electron', () => {
  class FakeNotification {
    constructor(readonly options: { title: string; body: string }) {
      if (fake.constructorThrows) throw new Error('no AUMID');
    }
    static isSupported(): boolean {
      return fake.supported;
    }
    on(event: string, handler: (...args: unknown[]) => void): this {
      (fake.handlers[event] ??= []).push(handler);
      return this;
    }
    show(): void {
      fake.shown.push(this.options);
    }
  }
  return { Notification: FakeNotification };
});

import { createNotifier } from '../../src/main/notify';
import { createRecorder } from '../../src/main/test-hook';

const { shown, handlers } = fake;

const TOAST = {
  key: 'sync:41',
  title: 'Sync landed · 2 change(s)',
  body: 'a\nb',
  route: '/inbox',
};

beforeEach(() => {
  shown.length = 0;
  for (const key of Object.keys(handlers)) delete handlers[key];
  fake.supported = true;
  fake.constructorThrows = false;
});

describe('under BB2DASH_TEST=1', () => {
  it('records the toast and shows nothing to the OS', async () => {
    const recorder = createRecorder();
    const notifier = createNotifier({ onClick: () => undefined, recorder, env: { BB2DASH_TEST: '1' } });
    await notifier.show(TOAST);
    expect(shown).toEqual([]);
    expect(recorder.toasts()).toHaveLength(1);
    expect(recorder.toasts()[0]).toMatchObject(TOAST);
    expect(recorder.toasts()[0]?.shownAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('is happy with no recorder at all', async () => {
    const notifier = createNotifier({ onClick: () => undefined, env: { BB2DASH_TEST: '1' } });
    await expect(notifier.show(TOAST)).resolves.toBeUndefined();
    expect(shown).toEqual([]);
  });
});

describe('outside test mode', () => {
  const live = { BB2DASH_TEST: '0' };

  it('shows one notification carrying the reducer’s title and body', async () => {
    await createNotifier({ onClick: () => undefined, env: live }).show(TOAST);
    expect(shown).toEqual([{ title: TOAST.title, body: TOAST.body }]);
  });

  it('routes a click to the deep-link handler with the toast’s own route', async () => {
    const clicks: string[] = [];
    await createNotifier({ onClick: (route) => clicks.push(route), env: live }).show(TOAST);
    handlers['click']?.[0]?.();
    expect(clicks).toEqual(['/inbox']);
  });

  it('registers click only — no action buttons (Q6)', async () => {
    await createNotifier({ onClick: () => undefined, env: live }).show(TOAST);
    // `close` joined the list with R2-3: it is how a dismissed toast is released from the
    // live set. What Q6 forbids is `action` and `reply`, which need a ToastActivatorCLSID.
    expect(Object.keys(handlers).sort()).toEqual(['click', 'close', 'failed']);
    expect(Object.keys(handlers)).not.toContain('action');
    expect(Object.keys(handlers)).not.toContain('reply');
  });

  it('swallows a throwing click handler', async () => {
    const notifier = createNotifier({
      onClick: () => {
        throw new Error('window gone');
      },
      env: live,
    });
    await notifier.show(TOAST);
    expect(() => handlers['click']?.[0]?.()).not.toThrow();
  });

  it('drops the toast when the host cannot show notifications', async () => {
    fake.supported = false;
    await createNotifier({ onClick: () => undefined, env: live }).show(TOAST);
    expect(shown).toEqual([]);
  });

  it('never rejects when constructing the notification throws', async () => {
    fake.constructorThrows = true;
    await expect(
      createNotifier({ onClick: () => undefined, env: live }).show(TOAST),
    ).resolves.toBeUndefined();
  });

  it('logs a Windows "failed" event without leaking anything', async () => {
    const lines: string[] = [];
    await createNotifier({
      onClick: () => undefined,
      env: live,
      log: { info: () => undefined, warn: (m) => lines.push(m), error: () => undefined },
    }).show(TOAST);
    handlers['failed']?.[0]?.({}, 'toast blocked by policy');
    expect(lines.some((line) => line.includes('sync:41'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------
// R2-3 — a shown notification must outlive the call that showed it
// ---------------------------------------------------------------------------------------

describe('R2-3 — live notifications are held against garbage collection', () => {
  /** Not test mode: this is the branch that actually constructs a `Notification`. */
  function osNotifier(onClick: (route: string) => void = () => undefined) {
    return createNotifier({ onClick, env: {} });
  }

  /** Fire the nth registered handler for `event`, as Windows would. */
  function fire(event: string, index: number, ...args: unknown[]): void {
    const handler = handlers[event]?.[index];
    if (!handler) throw new Error(`no ${event} handler at ${index}`);
    handler(...args);
  }

  it('holds each notification it showed', async () => {
    const notifier = osNotifier();
    await notifier.show({ ...TOAST, key: 'a' });
    await notifier.show({ ...TOAST, key: 'b' });
    await notifier.show({ ...TOAST, key: 'c' });

    // Before the fix the only reference was a local that went out of scope the moment
    // `show()` returned, taking the click listener with it whenever V8 got round to it.
    expect(notifier.liveCount()).toBe(3);
    expect(shown).toHaveLength(3);
  });

  it('releases one when Windows closes it', async () => {
    const notifier = osNotifier();
    await notifier.show(TOAST);
    await notifier.show({ ...TOAST, key: 'sync:42' });
    expect(notifier.liveCount()).toBe(2);

    fire('close', 0);
    expect(notifier.liveCount()).toBe(1);
    fire('close', 1);
    expect(notifier.liveCount()).toBe(0);
  });

  it('releases one when it is clicked, and still routes the click', async () => {
    const routes: string[] = [];
    const notifier = osNotifier((route) => routes.push(route));
    await notifier.show(TOAST);

    fire('click', 0);

    expect(routes).toEqual(['/inbox']);
    expect(notifier.liveCount()).toBe(0);
  });

  it('releases one Windows refused', async () => {
    const notifier = osNotifier();
    await notifier.show(TOAST);
    fire('failed', 0, {}, 'no AUMID');
    expect(notifier.liveCount()).toBe(0);
  });

  it('a throwing click handler still releases the notification', async () => {
    const notifier = osNotifier(() => {
      throw new Error('deep link blew up');
    });
    await notifier.show(TOAST);
    expect(() => fire('click', 0)).not.toThrow();
    expect(notifier.liveCount()).toBe(0);
  });

  it('holds nothing when the constructor throws', async () => {
    fake.constructorThrows = true;
    const notifier = osNotifier();
    await notifier.show(TOAST);
    expect(notifier.liveCount()).toBe(0);
  });

  it('holds nothing when the host cannot show toasts', async () => {
    fake.supported = false;
    const notifier = osNotifier();
    await notifier.show(TOAST);
    expect(notifier.liveCount()).toBe(0);
  });

  it('holds nothing under BB2DASH_TEST=1, where nothing reaches the OS', async () => {
    const notifier = createNotifier({ onClick: () => undefined, env: { BB2DASH_TEST: '1' } });
    await notifier.show(TOAST);
    expect(notifier.liveCount()).toBe(0);
  });
});

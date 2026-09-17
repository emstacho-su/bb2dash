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
    expect(Object.keys(handlers).sort()).toEqual(['click', 'failed']);
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

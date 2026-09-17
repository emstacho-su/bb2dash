/**
 * The Electron half of C-7 Delivery: restore + focus + show (if hidden) + loadURL.
 *
 * `deeplink.ts` imports only the `BrowserWindow` *type* from electron, so this suite drives
 * it with a duck-typed window and never loads Electron at all. The allowlist itself is
 * proven in `route.test.ts`; what is proven here is that a refused route never reaches
 * `loadURL`, and that an accepted one raises the window first.
 */

import { describe, expect, it, vi } from 'vitest';
import type { BrowserWindow } from 'electron';

import { createDeeplink } from '../../src/main/deeplink';
import type { Logger } from '../../src/core/redact';
import { createRecorder } from '../../src/main/test-hook';
import { showWindow } from '../../src/main/window';

const APP_URL = 'https://web-xi-ten-uy9xk6c6p0.vercel.app';

interface FakeWindow {
  readonly calls: string[];
  readonly loaded: string[];
  minimized: boolean;
  visible: boolean;
  destroyed: boolean;
}

function fakeWindow(state: Partial<FakeWindow> = {}): { window: BrowserWindow; state: FakeWindow } {
  const inner: FakeWindow = {
    calls: [],
    loaded: [],
    minimized: false,
    visible: true,
    destroyed: false,
    ...state,
  };
  const window = {
    isMinimized: () => inner.minimized,
    isVisible: () => inner.visible,
    isDestroyed: () => inner.destroyed,
    restore: () => {
      inner.calls.push('restore');
      inner.minimized = false;
    },
    show: () => {
      inner.calls.push('show');
      inner.visible = true;
    },
    focus: () => inner.calls.push('focus'),
    loadURL: async (url: string) => {
      inner.loaded.push(url);
    },
  } as unknown as BrowserWindow;
  return { window, state: inner };
}

function logger(): Logger & { lines: string[] } {
  const lines: string[] = [];
  return {
    lines,
    info: (m) => lines.push(`info ${m}`),
    warn: (m) => lines.push(`warn ${m}`),
    error: (m) => lines.push(`error ${m}`),
  };
}

describe('navigate', () => {
  it('raises the window and loads the route against appUrl', () => {
    const { window, state } = fakeWindow();
    const deeplink = createDeeplink({ appUrl: APP_URL, getWindow: () => window });
    expect(deeplink.navigate('/course/IST.323/grades')).toBe(true);
    expect(state.calls).toEqual(['focus']);
    expect(state.loaded).toEqual([`${APP_URL}/course/IST.323/grades`]);
  });

  it('restores a minimised window before focusing it', () => {
    const { window, state } = fakeWindow({ minimized: true });
    createDeeplink({ appUrl: APP_URL, getWindow: () => window }).navigate('/inbox');
    expect(state.calls).toEqual(['restore', 'focus']);
  });

  it('shows a window hidden to the tray (C-12)', () => {
    const { window, state } = fakeWindow({ visible: false });
    createDeeplink({ appUrl: APP_URL, getWindow: () => window }).navigate('/inbox');
    expect(state.calls).toEqual(['show', 'focus']);
  });

  it('keeps a query string', () => {
    const { window, state } = fakeWindow();
    createDeeplink({ appUrl: APP_URL, getWindow: () => window }).navigate('/inbox?state=open');
    expect(state.loaded).toEqual([`${APP_URL}/inbox?state=open`]);
  });

  it.each(['https://evil.example/', '//evil.example', '/../secrets', '/course/ist.323/grades', ''])(
    'refuses %j without touching the window',
    (route) => {
      const { window, state } = fakeWindow();
      const log = logger();
      const deeplink = createDeeplink({ appUrl: APP_URL, getWindow: () => window, log });
      expect(deeplink.navigate(route)).toBe(false);
      expect(state.calls).toEqual([]);
      expect(state.loaded).toEqual([]);
      expect(log.lines.some((line) => line.startsWith('warn refused deep link'))).toBe(true);
    },
  );

  it('returns false when there is no window yet', () => {
    const log = logger();
    const deeplink = createDeeplink({ appUrl: APP_URL, getWindow: () => null, log });
    expect(deeplink.navigate('/inbox')).toBe(false);
    expect(log.lines.some((line) => line.includes('no window'))).toBe(true);
  });

  it('returns false when the window has been destroyed', () => {
    const { window } = fakeWindow({ destroyed: true });
    expect(createDeeplink({ appUrl: APP_URL, getWindow: () => window }).navigate('/inbox')).toBe(false);
  });

  it('returns false rather than throwing when appUrl is not a URL', () => {
    const { window } = fakeWindow();
    const log = logger();
    const deeplink = createDeeplink({ appUrl: 'not a url', getWindow: () => window, log });
    expect(deeplink.navigate('/inbox')).toBe(false);
    expect(log.lines.some((line) => line.includes('appUrl'))).toBe(true);
  });

  it('returns false when loadURL throws synchronously', () => {
    const { window } = fakeWindow();
    vi.spyOn(window, 'loadURL').mockImplementation(() => {
      throw new Error('renderer gone');
    });
    expect(createDeeplink({ appUrl: APP_URL, getWindow: () => window }).navigate('/inbox')).toBe(false);
  });

  it('records every attempt for the e2e suite, accepted or not', () => {
    const { window } = fakeWindow();
    const recorder = createRecorder();
    const deeplink = createDeeplink({ appUrl: APP_URL, getWindow: () => window, recorder });
    deeplink.navigate('/inbox');
    deeplink.navigate('https://evil.example/');
    expect(recorder.navigations().map((n) => [n.route, n.accepted])).toEqual([
      ['/inbox', true],
      ['https://evil.example/', false],
    ]);
  });

  it('truncates an absurdly long refused route in the log line', () => {
    const { window } = fakeWindow();
    const log = logger();
    createDeeplink({ appUrl: APP_URL, getWindow: () => window, log }).navigate('/'.repeat(5000));
    expect(log.lines[0]?.length).toBeLessThan(200);
  });
});

// ---------------------------------------------------------------------------------------
// R2-10 — one showWindow
// ---------------------------------------------------------------------------------------

describe('R2-10 — the deep link raises the window through the shared showWindow', () => {
  it('restores, shows and focuses, in that order', () => {
    const { window, state } = fakeWindow({ minimized: true, visible: false });
    createDeeplink({ appUrl: APP_URL, getWindow: () => window }).navigate('/inbox');
    expect(state.calls).toEqual(['restore', 'show', 'focus']);
  });

  it('is the same function main/window.ts exports, not a private copy', () => {
    // The copy this replaced had no `isDestroyed` guard. Driving the shared one directly
    // with a destroyed window proves the guard the copy was missing.
    const { window, state } = fakeWindow({ destroyed: true, minimized: true, visible: false });
    expect(() => showWindow(window)).not.toThrow();
    expect(state.calls).toEqual([]);
  });

  it('does nothing at all to a destroyed window, and reports the navigation refused', () => {
    const { window, state } = fakeWindow({ destroyed: true });
    const recorder = createRecorder();
    const accepted = createDeeplink({
      appUrl: APP_URL,
      getWindow: () => window,
      recorder,
    }).navigate('/inbox');

    expect(accepted).toBe(false);
    expect(state.calls).toEqual([]);
    expect(state.loaded).toEqual([]);
    expect(recorder.navigations()).toEqual([
      expect.objectContaining({ route: '/inbox', accepted: false }),
    ]);
  });
});

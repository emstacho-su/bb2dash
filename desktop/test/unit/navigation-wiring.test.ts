/**
 * Phase 12b, item X-2 (P-shell-2). The allowlist was attached to `will-navigate`
 * only, and `will-navigate` fires for the main frame and for nothing else.
 *
 * Two doors were open. A server-side redirect (`will-redirect`) continues a
 * navigation that was allowed to start, so an allowed origin could 302 the window
 * anywhere and the rule never saw it. A subframe (`will-frame-navigate`) could
 * navigate itself off the allowlist without the rule seeing it either.
 *
 * All three events now go through one decision. `decideNavigation` itself is
 * unchanged and tested in navigation-policy.test.ts; this file is about the
 * wiring: which events are registered, which frame each one owns, and what
 * happens on each answer.
 *
 * `electron` and the logger are mocked; `src/main/navigation.ts` runs for real.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const fake = vi.hoisted(() => ({
  /** `webContents.on(event)` handlers, so a test can play Chromium. */
  handlers: {} as Record<string, ((...args: unknown[]) => void)[]>,
  external: [] as string[],
  logs: [] as string[],
}));

vi.mock('electron', () => ({
  BrowserWindow: class {},
  shell: {
    openExternal(url: string) {
      fake.external.push(url);
      return Promise.resolve();
    },
  },
}));

vi.mock('../../src/main/log', () => ({
  log: (message: string) => fake.logs.push(message),
  logError: (message: string) => fake.logs.push(`error: ${message}`),
}));

const APP = 'https://web-xi-ten-uy9xk6c6p0.vercel.app';
const SUPABASE = 'https://goultdzqcavefcgnifdy.supabase.co';
const ALLOWED = Object.freeze([APP, SUPABASE]);

/** A navigation event as Electron delivers it: one object that can veto itself. */
function navigationEvent(url: string, isMainFrame: boolean) {
  let prevented = false;
  return {
    url,
    isMainFrame,
    isSameDocument: false,
    frame: null,
    preventDefault() {
      prevented = true;
    },
    get prevented() {
      return prevented;
    },
  };
}

function fire(event: string, details: ReturnType<typeof navigationEvent>) {
  const handlers = fake.handlers[event] ?? [];
  expect(handlers.length, `no handler is registered for ${event}`).toBeGreaterThan(0);
  for (const handler of handlers) handler(details);
  return details;
}

async function attach() {
  const { attachNavigationGuards } = await import('../../src/main/navigation');
  const webContents = {
    on(event: string, handler: (...args: unknown[]) => void) {
      (fake.handlers[event] ??= []).push(handler);
      return webContents;
    },
    setWindowOpenHandler() {},
    session: {
      setPermissionRequestHandler() {},
      setPermissionCheckHandler() {},
    },
  };
  attachNavigationGuards({ webContents } as never, ALLOWED, APP);
}

describe('attachNavigationGuards', () => {
  beforeEach(async () => {
    fake.handlers = {};
    fake.external = [];
    fake.logs = [];
    vi.resetModules();
    await attach();
  });

  it('polices all three navigation events, not just will-navigate', () => {
    expect(Object.keys(fake.handlers).sort()).toEqual([
      'will-frame-navigate',
      'will-navigate',
      'will-redirect',
    ]);
  });

  describe('will-navigate', () => {
    it('lets an allowed origin through', () => {
      const event = fire('will-navigate', navigationEvent(`${APP}/planner`, true));
      expect(event.prevented).toBe(false);
      expect(fake.external).toEqual([]);
    });

    it('blocks a foreign origin and hands it to the default browser', () => {
      const event = fire('will-navigate', navigationEvent('https://example.com/outside', true));
      expect(event.prevented).toBe(true);
      expect(fake.external).toEqual(['https://example.com/outside']);
    });

    it('drops a non-http scheme without opening anything', () => {
      const event = fire('will-navigate', navigationEvent('file:///C:/Windows/System32/calc.exe', true));
      expect(event.prevented).toBe(true);
      expect(fake.external).toEqual([]);
      expect(fake.logs.join('\n')).toContain('dropped');
    });
  });

  describe('will-redirect', () => {
    it('lets a redirect between allowed origins through', () => {
      const event = fire('will-redirect', navigationEvent(`${SUPABASE}/auth/v1/verify?token=x`, true));
      expect(event.prevented).toBe(false);
      expect(fake.external).toEqual([]);
    });

    it('blocks a redirect off the allowlist and hands it to the default browser', () => {
      const event = fire('will-redirect', navigationEvent('https://example.com/redirected', true));
      expect(event.prevented).toBe(true);
      expect(fake.external).toEqual(['https://example.com/redirected']);
      expect(fake.logs.join('\n')).toContain('will-redirect');
    });

    it('drops a redirect into a non-http scheme', () => {
      const event = fire('will-redirect', navigationEvent('ms-settings:privacy', true));
      expect(event.prevented).toBe(true);
      expect(fake.external).toEqual([]);
    });

    it('blocks a subframe redirect without opening the browser', () => {
      const event = fire('will-redirect', navigationEvent('https://example.com/ad', false));
      expect(event.prevented).toBe(true);
      expect(fake.external).toEqual([]);
    });
  });

  describe('will-frame-navigate', () => {
    it('ignores the main frame, which will-navigate owns', () => {
      // Both events fire for a main-frame navigation. Acting on both would hand
      // the same URL to the browser twice.
      const event = fire('will-frame-navigate', navigationEvent('https://example.com/outside', true));
      expect(event.prevented).toBe(false);
      expect(fake.external).toEqual([]);
    });

    it('lets a subframe stay inside an allowed origin', () => {
      const event = fire('will-frame-navigate', navigationEvent(`${APP}/embed`, false));
      expect(event.prevented).toBe(false);
      expect(fake.external).toEqual([]);
    });

    it('blocks a subframe leaving the allowlist, and does NOT open the browser', () => {
      // A frame navigating itself is not a click. Handing its target to Chrome
      // would make any embedded frame a pop-up.
      const event = fire('will-frame-navigate', navigationEvent('https://example.com/embedded', false));
      expect(event.prevented).toBe(true);
      expect(fake.external).toEqual([]);
      expect(fake.logs.join('\n')).toContain('will-frame-navigate');
    });

    it('drops a subframe reaching for a local file', () => {
      const event = fire('will-frame-navigate', navigationEvent('file:///C:/secret.txt', false));
      expect(event.prevented).toBe(true);
      expect(fake.external).toEqual([]);
    });
  });
});

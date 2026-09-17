/**
 * The sidebar's memory, on its own.
 *
 * These are the rules three readers share — the inline boot script, the React
 * provider and the component tests — so they are worth pinning down without a
 * DOM tree in the way. The one thing that needs jsdom is the boot script,
 * which is evaluated here exactly as the browser would run it.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  SIDEBAR_BOOT_SCRIPT,
  SIDEBAR_BREAKPOINT,
  SIDEBAR_STORAGE_KEY,
  isOverlayWidth,
  readStoredSidebar,
  resolveSidebar,
  viewportDefault,
  writeStoredSidebar,
} from '@/lib/sidebar-preference';

function setWidth(width: number) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: width });
}

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
  document.documentElement.removeAttribute('data-sidebar');
  setWidth(1024);
});

describe('viewportDefault', () => {
  it('opens the sidebar on a laptop and leaves it closed on a phone', () => {
    expect(viewportDefault(SIDEBAR_BREAKPOINT)).toBe('open');
    expect(viewportDefault(1440)).toBe('open');
    expect(viewportDefault(SIDEBAR_BREAKPOINT - 1)).toBe('closed');
    expect(viewportDefault(390)).toBe('closed');
  });

  it('treats anything under the breakpoint as overlay territory', () => {
    expect(isOverlayWidth(SIDEBAR_BREAKPOINT)).toBe(false);
    expect(isOverlayWidth(SIDEBAR_BREAKPOINT - 1)).toBe(true);
  });
});

describe('readStoredSidebar', () => {
  it('returns the stored state', () => {
    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, 'closed');
    expect(readStoredSidebar()).toBe('closed');
  });

  it('returns null when nothing is stored', () => {
    expect(readStoredSidebar()).toBeNull();
  });

  it('returns null for a value it does not recognise', () => {
    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, 'sideways');
    expect(readStoredSidebar()).toBeNull();
  });

  it('returns null instead of throwing when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('The operation is insecure.');
    });
    expect(readStoredSidebar()).toBeNull();
  });
});

describe('writeStoredSidebar', () => {
  it('remembers the choice', () => {
    writeStoredSidebar('closed');
    expect(window.localStorage.getItem(SIDEBAR_STORAGE_KEY)).toBe('closed');
  });

  it('stays quiet when storage is full or blocked', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    expect(() => writeStoredSidebar('open')).not.toThrow();
  });
});

describe('resolveSidebar', () => {
  it('lets the stored choice beat the viewport', () => {
    expect(resolveSidebar('closed', 1440)).toBe('closed');
    expect(resolveSidebar('open', 390)).toBe('open');
  });

  it('falls back to the viewport when there is no stored choice', () => {
    expect(resolveSidebar(null, 1440)).toBe('open');
    expect(resolveSidebar(null, 390)).toBe('closed');
  });
});

describe('SIDEBAR_BOOT_SCRIPT', () => {
  function boot() {
    // Indirect eval on purpose: the boot script is a string the document runs
    // before hydration, and running it the same way is the only honest test of
    // it. (`no-eval` is not in eslint-config-next, so there is no directive to
    // disable here — ESLint reports an unused one as a problem of its own.)
    (0, eval)(SIDEBAR_BOOT_SCRIPT);
    return document.documentElement.getAttribute('data-sidebar');
  }

  it('stamps the stored state on the document before React sees it', () => {
    setWidth(1440);
    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, 'closed');
    expect(boot()).toBe('closed');
  });

  it('stamps the viewport default when nothing is stored', () => {
    setWidth(1440);
    expect(boot()).toBe('open');
    setWidth(390);
    expect(boot()).toBe('closed');
  });

  it('stamps the viewport default when storage throws', () => {
    setWidth(390);
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('The operation is insecure.');
    });
    expect(boot()).toBe('closed');
  });
});

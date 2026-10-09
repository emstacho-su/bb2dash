/**
 * ThemeMenu (Phase 22, task 10; P-77): Dark / Light / Auto in the account menu.
 *
 * Three `menuitemradio` rows in that order and no `menuitem`, because
 * `TopNav.update.test.tsx` asserts the exact `menuitem` list. Dark is checked
 * while nothing is stored, under a light system too. A pick stamps
 * `html[data-theme]` and every `theme-color` meta, and writes or removes the key.
 * jsdom has no `matchMedia`; this file brings its own stub.
 */

import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeMenu } from '@/components/shell/ThemeMenu';
import { THEME_BG, THEME_STORAGE_KEY, THEME_SWITCHING_ATTRIBUTE } from '@/lib/theme-preference';

let frames: Array<() => void> = [];

function stubSystem(light: boolean | null): void {
  if (light === null) {
    Reflect.deleteProperty(window, 'matchMedia');
    return;
  }
  window.matchMedia = ((media: string) => ({
    matches: light,
    media,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
}

function flushFrame(): void {
  const due = frames;
  frames = [];
  for (const callback of due) callback();
}

const attribute = (): string | null => document.documentElement.getAttribute('data-theme');
const metas = (): string[] =>
  [...document.querySelectorAll('meta[name="theme-color"]')].map((m) => m.getAttribute('content') ?? '');
const row = (name: string): HTMLElement => screen.getByRole('menuitemradio', { name });

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.removeAttribute(THEME_SWITCHING_ATTRIBUTE);
  document.head.innerHTML = '<meta name="theme-color" content="#050505"><meta name="theme-color" content="#050505">';
  frames = [];
  vi.stubGlobal('requestAnimationFrame', (callback: () => void) => frames.push(callback));
  stubSystem(null);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(window, 'matchMedia');
  document.head.innerHTML = '';
});

describe('ThemeMenu rows', () => {
  it('has exactly three menuitemradio rows, named Dark, Light and Auto in that order, and no menuitem', () => {
    render(<ThemeMenu />);
    const rows = screen.getAllByRole('menuitemradio');
    expect(rows.map((r) => r.textContent)).toEqual(['Dark', 'Light', 'Auto']);
    expect(screen.queryAllByRole('menuitem')).toEqual([]);
    expect(screen.getByRole('group', { name: 'Theme' })).toBeInTheDocument();
  });

  it('checks Dark while nothing is stored', () => {
    render(<ThemeMenu />);
    expect(row('Dark')).toHaveAttribute('aria-checked', 'true');
    expect(row('Light')).toHaveAttribute('aria-checked', 'false');
    expect(row('Auto')).toHaveAttribute('aria-checked', 'false');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
  });

  it('checks Dark under a light system too', () => {
    stubSystem(true);
    render(<ThemeMenu />);
    expect(row('Dark')).toHaveAttribute('aria-checked', 'true');
  });

  it.each([
    ['light', 'Light'],
    ['auto', 'Auto'],
  ])('checks %s when it is stored', (stored, name) => {
    localStorage.setItem(THEME_STORAGE_KEY, stored);
    render(<ThemeMenu />);
    expect(row(name)).toHaveAttribute('aria-checked', 'true');
    expect(row('Dark')).toHaveAttribute('aria-checked', 'false');
  });

  it.each(['dark', 'sepia', ''])('shows Dark checked for a stored %j', (stored) => {
    localStorage.setItem(THEME_STORAGE_KEY, stored);
    render(<ThemeMenu />);
    expect(row('Dark')).toHaveAttribute('aria-checked', 'true');
  });
});

describe('picking a row', () => {
  it('Light: data-theme light, key light, every theme-color meta the light ground, Light checked', () => {
    render(<ThemeMenu />);
    fireEvent.click(row('Light'));
    expect(attribute()).toBe('light');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
    expect(metas()).toEqual([THEME_BG.light, THEME_BG.light]);
    expect(row('Light')).toHaveAttribute('aria-checked', 'true');
    expect(row('Dark')).toHaveAttribute('aria-checked', 'false');
  });

  it('Auto under a light system: key auto, attribute and every meta follow the system', () => {
    stubSystem(true);
    render(<ThemeMenu />);
    fireEvent.click(row('Auto'));
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('auto');
    expect(attribute()).toBe('light');
    expect(metas()).toEqual([THEME_BG.light, THEME_BG.light]);
  });

  it('Auto under a dark system stamps dark', () => {
    stubSystem(false);
    render(<ThemeMenu />);
    fireEvent.click(row('Light'));
    fireEvent.click(row('Auto'));
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('auto');
    expect(attribute()).toBe('dark');
    expect(metas()).toEqual([THEME_BG.dark, THEME_BG.dark]);
  });

  it('Auto with no matchMedia stamps dark', () => {
    render(<ThemeMenu />);
    fireEvent.click(row('Auto'));
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('auto');
    expect(attribute()).toBe('dark');
  });

  it('Dark: the key is removed, data-theme dark, every meta the dark ground', () => {
    stubSystem(true);
    localStorage.setItem(THEME_STORAGE_KEY, 'light');
    render(<ThemeMenu />);
    fireEvent.click(row('Dark'));
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
    expect(attribute()).toBe('dark');
    expect(metas()).toEqual([THEME_BG.dark, THEME_BG.dark]);
    expect(row('Dark')).toHaveAttribute('aria-checked', 'true');
  });

  it('a throwing storage still stamps the page, and the checked row follows the pick', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    render(<ThemeMenu />);
    expect(row('Dark')).toHaveAttribute('aria-checked', 'true');

    expect(() => fireEvent.click(row('Light'))).not.toThrow();
    expect(attribute()).toBe('light');
    expect(metas()).toEqual([THEME_BG.light, THEME_BG.light]);
    expect(row('Light')).toHaveAttribute('aria-checked', 'true');
  });

  it('a pick sets data-theme-switching and it is gone two animation frames later', () => {
    render(<ThemeMenu />);
    fireEvent.click(row('Light'));
    expect(document.documentElement.hasAttribute(THEME_SWITCHING_ATTRIBUTE)).toBe(true);
    act(() => flushFrame());
    expect(document.documentElement.hasAttribute(THEME_SWITCHING_ATTRIBUTE)).toBe(true);
    act(() => flushFrame());
    expect(document.documentElement.hasAttribute(THEME_SWITCHING_ATTRIBUTE)).toBe(false);
  });
});

describe("another tab's pick (R2-5)", () => {
  /** Fires the event another tab's write makes in this one. */
  function otherTabWrites(value: string | null): void {
    if (value === null) localStorage.removeItem(THEME_STORAGE_KEY);
    else localStorage.setItem(THEME_STORAGE_KEY, value);
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: THEME_STORAGE_KEY, newValue: value }));
    });
  }

  it('the menu follows another tab before any local pick', () => {
    render(<ThemeMenu />);
    otherTabWrites('light');
    expect(row('Light')).toHaveAttribute('aria-checked', 'true');
    expect(row('Dark')).toHaveAttribute('aria-checked', 'false');
  });

  it('after a local pick the menu still follows a later change from another tab', () => {
    render(<ThemeMenu />);
    fireEvent.click(row('Light'));
    expect(row('Light')).toHaveAttribute('aria-checked', 'true');

    otherTabWrites('auto');
    expect(row('Auto')).toHaveAttribute('aria-checked', 'true');
    expect(row('Light')).toHaveAttribute('aria-checked', 'false');

    otherTabWrites(null);
    expect(row('Dark')).toHaveAttribute('aria-checked', 'true');
  });

  it('with a storage that cannot be written the pick still shows, until storage itself changes', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    render(<ThemeMenu />);
    fireEvent.click(row('Light'));
    expect(row('Light')).toHaveAttribute('aria-checked', 'true');
    vi.restoreAllMocks();
    otherTabWrites('auto');
    expect(row('Auto')).toHaveAttribute('aria-checked', 'true');
  });
});

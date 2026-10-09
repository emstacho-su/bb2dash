/**
 * The theme preference (Phase 22, task 9; P-76, P-78; brief 103, "Theme mechanism").
 *
 * Dark is the default. This file pins the one table the whole mechanism turns on,
 * `resolveTheme`, and then runs the real `THEME_BOOT_SCRIPT` in jsdom against the
 * same nine rows with a stubbed `matchMedia` (jsdom has none, and nothing else in
 * `web/test` stubs it). It also pins the system-change listener, the
 * `theme-color` meta, the two-frame `data-theme-switching` mark, and the two
 * grounds against the blocks of `globals.css`.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearStoredTheme,
  LIGHT_SYSTEM_QUERY,
  readStoredTheme,
  resolveTheme,
  stampTheme,
  THEME_BG,
  THEME_BOOT_SCRIPT,
  THEME_COLOR,
  THEME_STORAGE_KEY,
  THEME_SWITCHING_ATTRIBUTE,
  writeStoredTheme,
} from '@/lib/theme-preference';
import { readGlobalsThemeMaps } from './css-tokens';

type System = 'light' | 'dark' | 'none';
type Stored = string | null | 'throws';

/** The nine rows of the brief, in its order. */
const ROWS: readonly { name: string; stored: Stored; system: System; expected: 'light' | 'dark' }[] = [
  { name: 'nothing stored + system light', stored: null, system: 'light', expected: 'dark' },
  { name: 'nothing stored + system dark', stored: null, system: 'dark', expected: 'dark' },
  { name: 'stored light + system dark', stored: 'light', system: 'dark', expected: 'light' },
  { name: 'stored auto + system light', stored: 'auto', system: 'light', expected: 'light' },
  { name: 'stored auto + system dark', stored: 'auto', system: 'dark', expected: 'dark' },
  { name: 'stored auto + no matchMedia', stored: 'auto', system: 'none', expected: 'dark' },
  { name: 'stored dark + system light', stored: 'dark', system: 'light', expected: 'dark' },
  { name: 'junk + system light', stored: 'sepia', system: 'light', expected: 'dark' },
  { name: 'storage throws + system light', stored: 'throws', system: 'light', expected: 'dark' },
];

interface FakeQuery {
  matches: boolean;
  listeners: Array<() => void>;
}

let query: FakeQuery | null = null;
let frames: Array<() => void> = [];

/** Install a `matchMedia` for the given system, or none. Returns the query it hands out. */
function stubSystem(system: System): void {
  query = null;
  if (system === 'none') {
    Reflect.deleteProperty(window, 'matchMedia');
    return;
  }
  const fake: FakeQuery = { matches: system === 'light', listeners: [] };
  query = fake;
  window.matchMedia = ((media: string) => {
    expect(media).toBe(LIGHT_SYSTEM_QUERY);
    return {
      get matches() {
        return fake.matches;
      },
      media,
      addEventListener: (_type: string, listener: () => void) => fake.listeners.push(listener),
      removeEventListener: () => undefined,
    };
  }) as unknown as typeof window.matchMedia;
}

/** Change the stubbed system and fire the query's `change` event. */
function changeSystem(system: 'light' | 'dark'): void {
  if (query === null) throw new Error('no stubbed system');
  query.matches = system === 'light';
  for (const listener of query.listeners) listener();
}

/** Run every queued animation frame once. */
function flushFrame(): void {
  const due = frames;
  frames = [];
  for (const callback of due) callback();
}

function metaColours(): string[] {
  return [...document.querySelectorAll('meta[name="theme-color"]')].map((m) => m.getAttribute('content') ?? '');
}

function runBootScript(): void {
  // The script is a plain statement list that refers to window and document.
  new Function(THEME_BOOT_SCRIPT)();
}

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.removeAttribute(THEME_SWITCHING_ATTRIBUTE);
  document.head.innerHTML = '<meta name="theme-color" content="#050505"><meta name="theme-color" content="#050505">';
  frames = [];
  vi.stubGlobal('requestAnimationFrame', (callback: () => void) => frames.push(callback));
  stubSystem('none');
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(window, 'matchMedia');
  document.head.innerHTML = '';
});

describe('resolveTheme', () => {
  it.each(ROWS)('$name resolves to $expected', ({ stored, system, expected }) => {
    const value = stored === 'throws' ? null : stored;
    const systemLight = system === 'none' ? null : system === 'light';
    expect(resolveTheme(value, systemLight)).toBe(expected);
  });

  it('is dark for anything that is not light or auto, whatever the system says', () => {
    for (const junk of [undefined, null, '', 'dark', 'Light', 'AUTO', 1, {}]) {
      expect(resolveTheme(junk, true)).toBe('dark');
    }
  });
});

describe('the boot script, run for each of the nine rows', () => {
  it.each(ROWS)('$name stamps $expected and writes no storage', ({ stored, system, expected }) => {
    stubSystem(system);
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const removeItem = vi.spyOn(Storage.prototype, 'removeItem');
    if (stored === 'throws') {
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('storage blocked');
      });
    } else if (stored !== null) {
      localStorage.setItem(THEME_STORAGE_KEY, stored);
      setItem.mockClear();
    }

    expect(runBootScript).not.toThrow();

    expect(document.documentElement.getAttribute('data-theme')).toBe(expected);
    expect(setItem).not.toHaveBeenCalled();
    expect(removeItem).not.toHaveBeenCalled();
    // The boot stamp never marks a switch: nothing is on screen to ease at boot.
    expect(document.documentElement.hasAttribute(THEME_SWITCHING_ATTRIBUTE)).toBe(false);
  });

  it('leaves a stray stored value where it is', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    runBootScript();
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    localStorage.setItem(THEME_STORAGE_KEY, 'sepia');
    runBootScript();
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('sepia');
  });

  it('with no matchMedia it stamps dark and does not throw, even with auto stored', () => {
    stubSystem('none');
    localStorage.setItem(THEME_STORAGE_KEY, 'auto');
    expect(runBootScript).not.toThrow();
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('a resolved light sets every theme-color meta to the light ground; a resolved dark leaves them', () => {
    stubSystem('dark');
    localStorage.setItem(THEME_STORAGE_KEY, 'light');
    runBootScript();
    expect(metaColours()).toEqual([THEME_BG.light, THEME_BG.light]);

    document.head.innerHTML = '<meta name="theme-color" content="#050505">';
    localStorage.clear();
    runBootScript();
    expect(metaColours()).toEqual([THEME_BG.dark]);
  });

  it('is a script with no interpolated input: it names the key, the grounds and nothing else of ours', () => {
    expect(THEME_BOOT_SCRIPT).toContain(JSON.stringify(THEME_STORAGE_KEY));
    expect(THEME_BOOT_SCRIPT).toContain(JSON.stringify(THEME_BG));
    expect(THEME_BOOT_SCRIPT).not.toContain('</script');
  });
});

describe('the system-change listener', () => {
  it('with auto stored, a change re-stamps data-theme and every theme-color meta and marks the switch for two frames', () => {
    stubSystem('dark');
    localStorage.setItem(THEME_STORAGE_KEY, 'auto');
    runBootScript();
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');

    changeSystem('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(metaColours()).toEqual([THEME_BG.light, THEME_BG.light]);
    expect(document.documentElement.hasAttribute(THEME_SWITCHING_ATTRIBUTE)).toBe(true);

    flushFrame();
    expect(document.documentElement.hasAttribute(THEME_SWITCHING_ATTRIBUTE)).toBe(true);
    flushFrame();
    expect(document.documentElement.hasAttribute(THEME_SWITCHING_ATTRIBUTE)).toBe(false);

    changeSystem('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(metaColours()).toEqual([THEME_BG.dark, THEME_BG.dark]);
  });

  it.each([null, 'light', 'dark', 'sepia'])('with %s stored, the same event changes neither the attribute nor the metas', (stored) => {
    stubSystem('dark');
    if (stored !== null) localStorage.setItem(THEME_STORAGE_KEY, stored);
    runBootScript();
    const before = document.documentElement.getAttribute('data-theme');
    const metasBefore = metaColours();

    changeSystem('light');

    expect(document.documentElement.getAttribute('data-theme')).toBe(before);
    expect(metaColours()).toEqual(metasBefore);
    expect(document.documentElement.hasAttribute(THEME_SWITCHING_ATTRIBUTE)).toBe(false);
  });

  it('is registered whatever is stored, so Auto picked after boot is followed', () => {
    stubSystem('dark');
    runBootScript();
    expect(query?.listeners).toHaveLength(1);

    // Auto is picked after boot (ThemeMenu writes the key), then the system changes.
    localStorage.setItem(THEME_STORAGE_KEY, 'auto');
    changeSystem('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('reads storage again on each change: an Auto removed after boot stops following', () => {
    stubSystem('dark');
    localStorage.setItem(THEME_STORAGE_KEY, 'auto');
    runBootScript();
    localStorage.removeItem(THEME_STORAGE_KEY);
    changeSystem('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });
});

describe('the stored choice', () => {
  it('reads light and auto, and nothing else', () => {
    expect(readStoredTheme()).toBeNull();
    for (const value of ['light', 'auto'] as const) {
      localStorage.setItem(THEME_STORAGE_KEY, value);
      expect(readStoredTheme()).toBe(value);
    }
    for (const value of ['dark', 'sepia', '']) {
      localStorage.setItem(THEME_STORAGE_KEY, value);
      expect(readStoredTheme()).toBeNull();
    }
  });

  it('writes light or auto, and clearing removes the key', () => {
    writeStoredTheme('light');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
    writeStoredTheme('auto');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('auto');
    clearStoredTheme();
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
  });

  it('a throwing storage reads as nothing and a throwing write or clear is silent', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(readStoredTheme()).toBeNull();
    expect(() => writeStoredTheme('light')).not.toThrow();
    expect(() => clearStoredTheme()).not.toThrow();
  });
});

describe('stampTheme', () => {
  it('sets data-theme and every theme-color meta, with no switching mark when asked for none', () => {
    stampTheme('light', false);
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(metaColours()).toEqual([THEME_BG.light, THEME_BG.light]);
    expect(document.documentElement.hasAttribute(THEME_SWITCHING_ATTRIBUTE)).toBe(false);
  });

  it('with the switch mark it is gone two animation frames later', () => {
    stampTheme('dark', true);
    expect(document.documentElement.hasAttribute(THEME_SWITCHING_ATTRIBUTE)).toBe(true);
    flushFrame();
    expect(document.documentElement.hasAttribute(THEME_SWITCHING_ATTRIBUTE)).toBe(true);
    flushFrame();
    expect(document.documentElement.hasAttribute(THEME_SWITCHING_ATTRIBUTE)).toBe(false);
  });
});

describe('the grounds', () => {
  it("THEME_BG.dark and .light equal the blocks' --color-bg", () => {
    const { dark, light } = readGlobalsThemeMaps();
    expect(THEME_BG.dark).toBe(dark.get('--color-bg'));
    expect(THEME_BG.light).toBe(light.get('--color-bg'));
  });

  it('THEME_COLOR is the dark ground, one value', () => {
    expect(THEME_COLOR).toBe(THEME_BG.dark);
  });
});

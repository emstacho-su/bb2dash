/**
 * The *Update now / Update later* prompt (2026-09-30): a small app-owned window, not a
 * native dialog. Its page reports the answer by setting `document.title`, which main reads
 * from `page-title-updated` — no preload, no IPC, no navigation.
 *
 * `electron` is mocked; the page itself is checked as a string.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const fake = vi.hoisted(() => ({
  windowHandlers: {} as Record<string, ((...args: unknown[]) => void)[]>,
  contentHandlers: {} as Record<string, ((...args: unknown[]) => void)[]>,
  loaded: [] as string[],
  constructed: [] as Record<string, unknown>[],
  closed: 0,
  openHandler: null as null | ((details: { url: string }) => unknown),
}));

vi.mock('electron', () => {
  class FakeBrowserWindow {
    destroyed = false;
    readonly webContents = {
      on(event: string, handler: (...args: unknown[]) => void) {
        (fake.contentHandlers[event] ??= []).push(handler);
      },
      setWindowOpenHandler(handler: (details: { url: string }) => unknown) {
        fake.openHandler = handler;
      },
    };
    constructor(options: Record<string, unknown>) {
      fake.constructed.push(options);
    }
    on(event: string, handler: (...args: unknown[]) => void) {
      (fake.windowHandlers[event] ??= []).push(handler);
    }
    once(event: string, handler: (...args: unknown[]) => void) {
      (fake.windowHandlers[event] ??= []).push(handler);
    }
    loadURL(url: string) {
      fake.loaded.push(url);
      return Promise.resolve();
    }
    isDestroyed = () => this.destroyed;
    show() {}
    close() {
      fake.closed += 1;
      this.destroyed = true;
      for (const handler of fake.windowHandlers['closed'] ?? []) handler();
    }
  }
  return { BrowserWindow: FakeBrowserWindow };
});

import { PROMPT_TITLE_PREFIX, parsePromptTitle, promptHtml, showUpdatePrompt } from '../../src/main/update-prompt';

function fireTitle(title: string): { prevented: boolean } {
  const event = { prevented: false, preventDefault() { this.prevented = true; } };
  for (const handler of fake.contentHandlers['page-title-updated'] ?? []) handler(event, title);
  for (const handler of fake.windowHandlers['page-title-updated'] ?? []) handler(event, title);
  return event;
}

beforeEach(() => {
  fake.windowHandlers = {};
  fake.contentHandlers = {};
  fake.loaded = [];
  fake.constructed = [];
  fake.closed = 0;
  fake.openHandler = null;
});

describe('parsePromptTitle', () => {
  it('accepts exactly the four answers', () => {
    expect(parsePromptTitle(`${PROMPT_TITLE_PREFIX}update-now`)).toBe('update-now');
    expect(parsePromptTitle(`${PROMPT_TITLE_PREFIX}one-hour`)).toBe('one-hour');
    expect(parsePromptTitle(`${PROMPT_TITLE_PREFIX}four-hours`)).toBe('four-hours');
    expect(parsePromptTitle(`${PROMPT_TITLE_PREFIX}tomorrow`)).toBe('tomorrow');
  });

  it('ignores every other title', () => {
    expect(parsePromptTitle('bb2dash update')).toBeNull();
    expect(parsePromptTitle(`${PROMPT_TITLE_PREFIX}rm -rf`)).toBeNull();
    expect(parsePromptTitle(`${PROMPT_TITLE_PREFIX}`)).toBeNull();
  });
});

describe('promptHtml', () => {
  it('offers Update now, Update later, and the three reminder times', () => {
    const html = promptHtml();
    for (const label of ['Update now', 'Update later', 'In 1 hour', 'In 4 hours', 'Tomorrow']) {
      expect(html).toContain(label);
    }
  });

  it('locks the page down with a CSP that allows nothing from outside', () => {
    expect(promptHtml()).toMatch(/Content-Security-Policy" content="default-src 'none'/);
  });
});

describe('showUpdatePrompt', () => {
  it('opens a small sandboxed window with no preload and resolves with the answer', async () => {
    const answer = showUpdatePrompt(null);
    expect(fake.loaded[0]).toMatch(/^data:text\/html/);
    const prefs = fake.constructed[0]?.['webPreferences'] as Record<string, unknown>;
    expect(prefs).toMatchObject({ sandbox: true, contextIsolation: true, nodeIntegration: false });
    expect(prefs['preload']).toBeUndefined();

    const event = fireTitle(`${PROMPT_TITLE_PREFIX}four-hours`);
    expect(event.prevented).toBe(true);
    expect(await answer).toBe('four-hours');
    expect(fake.closed).toBe(1);
  });

  it('resolves as dismissed when the window is closed without an answer', async () => {
    const answer = showUpdatePrompt(null);
    for (const handler of fake.windowHandlers['closed'] ?? []) handler();
    expect(await answer).toBe('dismissed');
  });

  it('never lets the prompt page navigate or open windows', () => {
    void showUpdatePrompt(null);
    const event = { prevented: false, preventDefault() { this.prevented = true; } };
    for (const handler of fake.contentHandlers['will-navigate'] ?? []) handler(event);
    expect(event.prevented).toBe(true);
    expect(fake.openHandler?.({ url: 'https://example.com' })).toEqual({ action: 'deny' });
  });
});

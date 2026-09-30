/**
 * Closing the window releases the renderer (Stack, 2026-09-30).
 *
 * Before this, close hid the window, so the whole web app stayed alive in the tray: four
 * processes and ~360 MB for as long as the shell ran. Now close destroys the window; the main
 * process, the poller and the tray stay, and every way back in (tray, a toast click, a second
 * launch) builds a new window and routes it.
 *
 * `window-controller.ts` is written over a duck-typed window, so this suite needs no Electron.
 */

import { describe, expect, it } from 'vitest';

import { createWindowController } from '../../src/main/window-controller';
import type { LifecycleWindow } from '../../src/main/window-controller';

interface FakeWindow extends LifecycleWindow {
  readonly id: number;
  readonly initialUrl: string | undefined;
  readonly shown: number;
  /** Play Electron: the user pressed the close button. */
  close(): void;
}

function harness() {
  const created: FakeWindow[] = [];
  const onCreatedCalls: number[] = [];
  const shows: number[] = [];

  const create = (initialUrl?: string): FakeWindow => {
    const handlers: Record<string, (() => void)[]> = {};
    let destroyed = false;
    const window: FakeWindow = {
      id: created.length + 1,
      initialUrl,
      shown: 0,
      isDestroyed: () => destroyed,
      on(event: string, handler: () => void) {
        (handlers[event] ??= []).push(handler);
        return window;
      },
      close() {
        // Nothing vetoes the close any more: the window is destroyed, then `closed` fires.
        for (const handler of handlers['close'] ?? []) handler();
        destroyed = true;
        for (const handler of handlers['closed'] ?? []) handler();
      },
    };
    created.push(window);
    return window;
  };

  const controller = createWindowController<FakeWindow>({
    create,
    onCreated: (window) => onCreatedCalls.push(window.id),
    show: (window) => shows.push(window.id),
    log: () => undefined,
  });

  return { controller, created, onCreatedCalls, shows };
}

describe('window lifecycle', () => {
  it('has no window until one is opened', () => {
    const { controller, created } = harness();
    expect(controller.current()).toBeNull();
    expect(created).toHaveLength(0);
  });

  it('creates the window on the first open and wires it once', () => {
    const { controller, created, onCreatedCalls } = harness();
    const opened = controller.open();
    expect(opened.created).toBe(true);
    expect(created).toHaveLength(1);
    expect(controller.current()).toBe(created[0]);
    expect(onCreatedCalls).toEqual([1]);
  });

  it('close destroys the window: nothing is left to hide in the tray', () => {
    const { controller, created } = harness();
    controller.open();
    created[0]!.close();
    expect(created[0]!.isDestroyed()).toBe(true);
    expect(controller.current()).toBeNull();
  });

  it('reopening after close recreates the window and wires the new one', () => {
    const { controller, created, onCreatedCalls } = harness();
    controller.open();
    created[0]!.close();

    const reopened = controller.open();
    expect(reopened.created).toBe(true);
    expect(created).toHaveLength(2);
    expect(controller.current()).toBe(created[1]);
    expect(onCreatedCalls).toEqual([1, 2]);
  });

  it('opening while a window exists shows that window instead of making a second', () => {
    const { controller, created, shows } = harness();
    controller.open();
    const again = controller.open();
    expect(again.created).toBe(false);
    expect(again.window).toBe(created[0]);
    expect(created).toHaveLength(1);
    expect(shows).toEqual([1]);
  });

  it('a toast click after close builds the window straight at the route', () => {
    const { controller, created } = harness();
    controller.open();
    created[0]!.close();

    const target = 'https://app.example/course/IST.323/grades';
    const opened = controller.open(target);
    expect(opened.created).toBe(true);
    // The first load is the route itself, so no second `loadURL` races the initial one.
    expect(created[1]!.initialUrl).toBe(target);
  });

  it('a close event from an old window does not clear a newer one', () => {
    const { controller, created } = harness();
    controller.open();
    const first = created[0]!;
    first.close();
    controller.open();
    // A late duplicate `closed` from the first window must not orphan the second.
    first.close();
    expect(controller.current()).toBe(created[1]);
  });
});

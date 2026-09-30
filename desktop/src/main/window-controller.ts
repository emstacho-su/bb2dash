/**
 * The window's lifecycle (Stack, 2026-09-30; amends C-12's "close hides").
 *
 * Closing the window destroys it. The renderer processes — the whole web app — go away;
 * the main process, the poller and the tray stay. Every way back in (tray *Open*, a toast
 * click, a second launch) calls `open()`, which builds a new window when there is none and
 * shows the live one otherwise. Tray *Quit* is still the only full exit.
 *
 * Written over a duck-typed window so the unit suite needs no Electron; `index.ts` supplies
 * the real `createWindow` and the per-window wiring (navigation guards, the poller's focus
 * trigger, the update check).
 */

/** The part of a `BrowserWindow` the lifecycle needs. */
export interface LifecycleWindow {
  isDestroyed(): boolean;
  on(event: 'closed', handler: () => void): unknown;
}

export interface WindowControllerDeps<W extends LifecycleWindow> {
  /** Build a window. `initialUrl` is its first load; the app URL when omitted. */
  readonly create: (initialUrl?: string) => W;
  /** Wire a freshly built window. Called once per window. */
  readonly onCreated: (window: W) => void;
  /** Restore, show and focus an existing window. */
  readonly show: (window: W) => void;
  readonly log: (message: string) => void;
}

export interface OpenedWindow<W> {
  readonly window: W;
  /** True when this call built the window (and so already pointed it at `initialUrl`). */
  readonly created: boolean;
}

export interface WindowController<W> {
  /** The live window, or `null` while the app sits in the tray. */
  current(): W | null;
  /** Show the live window, or build one (at `initialUrl` when given). */
  open(initialUrl?: string): OpenedWindow<W>;
}

export function createWindowController<W extends LifecycleWindow>(
  deps: WindowControllerDeps<W>,
): WindowController<W> {
  let live: W | null = null;

  const current = (): W | null => (live !== null && !live.isDestroyed() ? live : null);

  const build = (initialUrl?: string): W => {
    const window = deps.create(initialUrl);
    live = window;
    window.on('closed', () => {
      // Only the window this controller still holds; a late event from an older window
      // must not orphan the one that replaced it.
      if (live === window) live = null;
      deps.log('window closed: renderer released; the tray and the poller keep running');
    });
    deps.onCreated(window);
    return window;
  };

  return {
    current,
    open(initialUrl?: string): OpenedWindow<W> {
      const existing = current();
      if (existing !== null) {
        deps.show(existing);
        return { window: existing, created: false };
      }
      return { window: build(initialUrl), created: true };
    },
  };
}

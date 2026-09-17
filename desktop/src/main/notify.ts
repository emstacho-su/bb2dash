/**
 * The Electron `Notifier` (C-7 Delivery): `new Notification({ title, body })`, click routed
 * through `deeplink.navigate`. Under `BB2DASH_TEST=1` it records instead of showing, which
 * is what the Playwright suite asserts on (C-10).
 *
 * This is an adapter, so it lives in `main/` and imports `electron`; everything it decides
 * was already decided by the pure reducer.
 */

import { Notification } from 'electron';

import type { Notifier, Toast } from '../core/types';
import { type Logger, describeError, silentLogger } from '../core/redact';
import { type Recorder, isTestMode } from './test-hook';

export interface NotifierOptions {
  /** Called with the toast's already-validated route when Windows reports a click. */
  readonly onClick: (route: string) => void;
  /** Supplied under `BB2DASH_TEST=1`; when present nothing reaches the OS. */
  readonly recorder?: Recorder;
  readonly log?: Logger;
  readonly env?: NodeJS.ProcessEnv;
}

/**
 * A `Notifier` over Electron's `Notification`. `show()` resolves once the toast has been
 * handed to Windows; it never waits for a click, and it never rejects for a toast the OS
 * declined — the scheduler logs and moves on.
 */
/** The `Notifier`, plus the one thing only a test needs to see (R2-3). */
export interface MainNotifier extends Notifier {
  /** How many notifications Windows has not yet finished with. */
  liveCount(): number;
}

export function createNotifier(options: NotifierOptions): MainNotifier {
  const log = options.log ?? silentLogger;
  const testMode = isTestMode(options.env ?? process.env);

  /**
   * R2-3 — every notification Windows still owns. A strong Set, not a `WeakSet`: the whole
   * point is to be the strong reference that stops the object being collected while its
   * `click` listener is the only thing standing between a toast and the right screen.
   * Entries leave on `click`, `close` or `failed`, which between them cover every way
   * Windows finishes with a toast.
   */
  const live = new Set<Notification>();

  return {
    liveCount: () => live.size,

    async show(toast: Toast): Promise<void> {
      if (testMode) {
        // Recording is the whole behaviour under test: no OS toast, no AUMID dependency.
        options.recorder?.recordToast(toast);
        log.info(`recorded toast ${toast.key}`);
        return;
      }

      if (!Notification.isSupported()) {
        log.warn(`notifications are unsupported on this host; dropped ${toast.key}`);
        return;
      }

      try {
        const notification = new Notification({ title: toast.title, body: toast.body });

        // R2-3: hold a reference until Windows is finished with it.
        //
        // A toast can sit in the Action Center for minutes. `notification` is a local, and
        // the only thing keeping the object — and therefore its `click` listener — alive is
        // Electron's own internal reference, which is not a guarantee: once V8 collects the
        // JS wrapper the click does nothing, silently, and the toast the whole feature
        // exists for stops opening the right screen. Every live notification stays in this
        // Set until Windows reports it closed, clicked or failed.
        live.add(notification);
        const release = (): void => {
          live.delete(notification);
        };

        // Click-only for the MVP (Q6): no actions, no reply field.
        notification.on('click', () => {
          release();
          try {
            options.onClick(toast.route);
          } catch (error) {
            log.error(`toast click handler failed: ${describeError(error)}`);
          }
        });
        notification.on('close', release);
        notification.on('failed', (_event, error) => {
          release();
          log.warn(`Windows declined ${toast.key}: ${String(error).slice(0, 200)}`);
        });
        notification.show();
        log.info(`showed toast ${toast.key} (${live.size} live)`);
      } catch (error) {
        log.error(`could not show ${toast.key}: ${describeError(error)}`);
      }
    },
  };
}

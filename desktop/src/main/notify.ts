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
export function createNotifier(options: NotifierOptions): Notifier {
  const log = options.log ?? silentLogger;
  const testMode = isTestMode(options.env ?? process.env);

  return {
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
        // Click-only for the MVP (Q6): no actions, no reply field.
        notification.on('click', () => {
          try {
            options.onClick(toast.route);
          } catch (error) {
            log.error(`toast click handler failed: ${describeError(error)}`);
          }
        });
        notification.on('failed', (_event, error) => {
          log.warn(`Windows declined ${toast.key}: ${String(error).slice(0, 200)}`);
        });
        notification.show();
        log.info(`showed toast ${toast.key}`);
      } catch (error) {
        log.error(`could not show ${toast.key}: ${describeError(error)}`);
      }
    },
  };
}

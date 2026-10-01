/**
 * The one IPC channel the renderer can reach (2026-09-30, amends C-1): the account menu's
 * "Update desktop app" item calls `window.bb2dashDesktop.requestUpdate()`, which invokes
 * `bb2dash:request-update` with no arguments.
 *
 * Main answers only the main window's **top frame** on the **configured app origin**. The
 * update prompt window, the hidden session-refresh page (it carries the same preload), any
 * subframe and any other origin are refused with `UpdateRequestRejected` and a log line;
 * the update never runs for them. Nothing the renderer sends is read: the channel takes no
 * arguments, so there is no input to validate beyond who is asking.
 *
 * No runtime `electron` import: `index.ts` passes `ipcMain` in, so the unit suite drives
 * this with plain objects.
 */

import type { Logger } from '../core/redact';
import type { UpdateResult } from '../core/update/force-update';

export const UPDATE_REQUEST_CHANNEL = 'bb2dash:request-update';

/** The parts of an `IpcMainInvokeEvent` the check reads. */
export interface UpdateRequestEvent {
  readonly sender: { readonly id: number };
  /** `null` when the frame has gone (navigated away or destroyed). */
  readonly senderFrame: { readonly url: string; readonly parent: unknown } | null;
}

export interface UpdateSenderPolicy {
  /** The main window's `webContents.id`, or `null` while there is no window. */
  readonly mainWebContentsId: number | null;
  readonly appOrigin: string;
}

export class UpdateRequestRejected extends Error {
  constructor(reason: string) {
    super(`update request refused: ${reason}`);
    this.name = 'UpdateRequestRejected';
  }
}

function originOf(url: string): string | null {
  try {
    const origin = new URL(url).origin;
    // `data:`, `about:blank` and friends have the opaque origin "null".
    return origin === 'null' ? null : origin;
  } catch {
    return null;
  }
}

/** `null` when the sender may request an update, otherwise why not. */
export function validateUpdateSender(event: UpdateRequestEvent, policy: UpdateSenderPolicy): string | null {
  if (policy.mainWebContentsId === null || event.sender.id !== policy.mainWebContentsId) {
    return 'not the main window';
  }
  const frame = event.senderFrame;
  if (frame === null) return 'the sending frame is gone';
  if (frame.parent !== null) return 'not the top frame';
  const origin = originOf(frame.url);
  if (origin === null || origin !== policy.appOrigin) return 'not the app origin';
  return null;
}

export interface UpdateRequestHandlerDeps {
  readonly appOrigin: string;
  readonly mainWebContentsId: () => number | null;
  readonly run: () => Promise<UpdateResult>;
  readonly log: Logger;
}

export function createUpdateRequestHandler(
  deps: UpdateRequestHandlerDeps,
): (event: UpdateRequestEvent) => Promise<UpdateResult> {
  return async (event) => {
    const refusal = validateUpdateSender(event, {
      mainWebContentsId: deps.mainWebContentsId(),
      appOrigin: deps.appOrigin,
    });
    if (refusal !== null) {
      // The origin only: a full URL could carry a query string worth keeping out of the log.
      const origin = event.senderFrame === null ? 'none' : (originOf(event.senderFrame.url) ?? 'opaque');
      deps.log.warn(`update request refused (${refusal}; sender ${event.sender.id}, origin ${origin})`);
      throw new UpdateRequestRejected(refusal);
    }
    deps.log.info('update requested from the account menu');
    return deps.run();
  };
}

/** The part of `ipcMain` this needs (a method, so Electron's richer event type fits). */
export interface IpcHandleRegistrar {
  handle(channel: string, listener: (event: UpdateRequestEvent) => Promise<UpdateResult>): void;
}

export function registerUpdateRequest(
  ipc: IpcHandleRegistrar,
  handler: (event: UpdateRequestEvent) => Promise<UpdateResult>,
): void {
  ipc.handle(UPDATE_REQUEST_CHANNEL, handler);
}

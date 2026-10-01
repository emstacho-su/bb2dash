/**
 * C-1 — the whole preload. One frozen object over `contextBridge`.
 *
 * Amended 2026-09-30 (Stack: an explicit "Update desktop app" item in the account menu,
 * because closing and reopening to pick up a new build was not clear). The object is now
 * `{ version, requestUpdate }`. `requestUpdate()` is the one IPC call a page can make: an
 * argument-less `invoke` on `bb2dash:request-update`. It forwards nothing from the page,
 * and main answers it only for the main window's top frame on the app origin
 * (`main/update-request.ts`). There is no `send`, no `on`, no other channel.
 *
 * The version is a literal rather than a `require('../../package.json')`: a
 * sandboxed preload cannot require a relative file. `test/unit/preload.test.ts`
 * fails if this string and `package.json` ever drift apart.
 */

import { contextBridge, ipcRenderer } from 'electron';

const VERSION = '0.1.0';

/** Resolves with main's `UpdateResult`; the web app checks its shape before use. */
function requestUpdate(): Promise<unknown> {
  return ipcRenderer.invoke('bb2dash:request-update');
}

contextBridge.exposeInMainWorld('bb2dashDesktop', Object.freeze({ version: VERSION, requestUpdate }));

/**
 * C-1 — the whole preload. One frozen object over `contextBridge`, carrying the
 * shell's version and nothing else.
 *
 * The web app is the product and is untouched by this phase (`web/` has zero
 * changes); this exists so a page can tell it is running inside the shell if it
 * ever wants to. There is no IPC channel: nothing here can reach the main
 * process, so a compromised renderer gains nothing from it.
 *
 * The version is a literal rather than a `require('../../package.json')`: a
 * sandboxed preload cannot require a relative file. `test/unit/preload.test.ts`
 * fails if this string and `package.json` ever drift apart.
 */

import { contextBridge } from 'electron';

const VERSION = '0.1.0';

contextBridge.exposeInMainWorld('bb2dashDesktop', Object.freeze({ version: VERSION }));

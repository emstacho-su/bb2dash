/**
 * W-26 TEST HARNESS ONLY — not a second shell, and not shipped.
 *
 * C-10's e2e suite launches `dist/main/index.js`, which is W-25's entry point (C-1) and is
 * not on this branch. This file is the smallest Electron main that can exercise W-26's half
 * of the Contract for real: one window over the loopback fixture origin, and `startPoller`
 * with a stub session and a stub `RestGet` that returns no rows, so nothing reaches the
 * network. The toasts under test come from `globalThis.__bb2dashTest.tick(fixture)`.
 *
 * `test/e2e/harness.ts` prefers `dist/main/index.js` whenever it exists, so the moment W-25's
 * branch is merged the same specs run against the real shell and this file stops being used.
 * Delete it then if the PM prefers.
 *
 * Plain CommonJS, so it needs no build step of its own; it requires the compiled
 * `dist/main/poller-wiring.js` that `npm run build` produces from W-26's TypeScript.
 */

'use strict';

const { app, BrowserWindow } = require('electron');
const { startPoller } = require('../../../dist/main/poller-wiring');

const APP_URL = process.env.BB2DASH_APP_URL || 'http://127.0.0.1:1/';

/** Far enough in the future that the poller never treats the session as expired. */
const STUB_SESSION = { accessToken: 'e2e-stub-token', expiresAt: 4102444800 };

/** Every relation answers with no rows: a launch tick is quiet and touches no network. */
const STUB_REST = async (_relation, _query, validate) => validate([]);

let window = null;
let poller = null;

app.setAppUserModelId('su.stack.bb2dash');

app.whenReady().then(() => {
  window = new BrowserWindow({
    width: 1280,
    height: 800,
    show: true,
    webPreferences: {
      partition: 'persist:bb2dash',
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
    },
  });
  window.loadURL(APP_URL);

  poller = startPoller({
    userDataDir: app.getPath('userData'),
    appUrl: APP_URL,
    config: { pollIntervalMinutes: 15, dueReminderTime: '18:00' },
    getSession: async () => STUB_SESSION,
    createRest: () => STUB_REST,
    getWindow: () => window,
  });
});

app.on('before-quit', () => {
  if (poller) poller.stop();
});

app.on('window-all-closed', () => {
  app.quit();
});

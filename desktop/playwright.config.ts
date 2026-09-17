/**
 * Playwright for Electron (C-10). Electron's own docs name Playwright as the supported E2E
 * path, and `electronApp.evaluate()` runs in the **main** process — the documented way to
 * reach `globalThis.__bb2dashTest`.
 *
 * One worker: the specs launch a real Electron process against a per-test `--user-data-dir`,
 * and running two at once would fight over the single-instance lock (C-3).
 */

import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './test/e2e',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env['CI'],
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],
});

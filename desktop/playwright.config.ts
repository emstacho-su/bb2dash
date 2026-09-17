/**
 * Playwright for Electron (C-10).
 *
 * One worker, no parallelism: the shell holds a single-instance lock, so two
 * launches sharing a user-data directory are exactly the case one test exists
 * to prove and every other test would trip over.
 */

import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './test/e2e',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],
});

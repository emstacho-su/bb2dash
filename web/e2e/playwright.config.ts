/**
 * The logged-in walk harness (Phase 17, P-7 / T-01).
 *
 * Run from `web/`: `npx playwright test -c e2e/playwright.config.ts <spec>`.
 *
 * * The host is `WALK_BASE_URL`, default `http://localhost:3000` (the local
 *   `next dev` server). The PM and Phase 22 point it at a preview host.
 * * The session is the one `e2e/login.mjs` saved to `e2e/.auth/state.json`
 *   (gitignored in `web/.gitignore`). A saved session is host-only: a run
 *   against another host re-runs `login.mjs` with that `WALK_BASE_URL` first.
 * * The specs only read. `walk.ts`'s write guard aborts every write to the
 *   REST API and fails the test that tried one.
 * * Screenshots go to `docs/planning/sprint-2/walks/walk-17/` (`metadata.shotDir`,
 *   read by `shotPath()`). Brief 103's specs write `walk-22/` by explicit path.
 */

import { join } from 'node:path';
import { defineConfig, devices } from '@playwright/test';

const BASE_URL = process.env.WALK_BASE_URL ?? 'http://localhost:3000';

// `__dirname`, not `import.meta`: this package is CommonJS, so Playwright loads
// the config as CommonJS.
const STATE_PATH = join(__dirname, '.auth', 'state.json');
const SHOT_DIR = join(__dirname, '..', '..', 'docs', 'planning', 'sprint-2', 'walks', 'walk-17');
const OUTPUT_DIR = join(__dirname, '.results');

export default defineConfig({
  testDir: '.',
  testMatch: '**/*.spec.ts',
  // The acceptance run's specs have a config of their own (`accept.config.ts`): they are never
  // part of a walk, and a walk is never part of them.
  testIgnore: '**/accept*.spec.ts',
  outputDir: OUTPUT_DIR,
  // One browser at a time: the walk reads one account's live data, and the
  // screenshots are evidence, so they are taken in a stable order.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env['CI'],
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 20_000 },
  reporter: [['list']],
  metadata: { shotDir: SHOT_DIR },
  use: {
    ...devices['Desktop Chrome'],
    baseURL: BASE_URL,
    storageState: STATE_PATH,
    viewport: { width: 1440, height: 900 },
    trace: 'off',
    screenshot: 'off',
  },
});

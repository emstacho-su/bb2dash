/**
 * The acceptance run's browser tests (acceptance/README.md at the root of the
 * repository). The Claude operator in a throwaway sandbox container runs them
 * from `web/`, one at a time:
 *
 *   ACCEPT_ONLY="<title>" npx playwright test -c e2e/accept.config.ts
 *
 * * NOTHING RUNS UNLESS IT IS ASKED FOR. Without `ACCEPT=1` every test is
 *   skipped where it is declared and nothing is written; with it, the one test
 *   whose exact title is `ACCEPT_ONLY` runs (`accept.lib.ts`).
 * * The site is `WALK_BASE_URL`, and the session is the file `ACCEPT_STATE`:
 *   the host signed in for this stage and handed the sandbox its own copy.
 *   Both are required once the run is asked for (`accept.env.ts` says which is
 *   missing).
 * * Shots, facts and Playwright's own JSON report
 *   (`pw-<slug of the title>.json`) go to `ACCEPT_OUT`, a folder outside every
 *   repository. Playwright's working folder is the system's temporary folder:
 *   the checkout is mounted read-only in the sandbox, and nothing is ever
 *   written into it.
 * * One browser, one test, no retry: a retry would ask a live question twice.
 *   A second run of a step is the operator's decision, and it is recorded.
 * * The window is 1440 by 900 and a shot is the window; no trace, no video.
 *
 * `playwright.config.ts` (the walk harness) leaves these specs out, so a walk
 * never lists them and this config never lists a walk.
 */

import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig, devices, type ReporterDescription } from '@playwright/test';
import { acceptSettings } from './accept.env';

// `__dirname`, not `import.meta`: this package is CommonJS, so Playwright loads
// the config as CommonJS.
const CHECKOUT_ROOT = join(__dirname, '..', '..');
const SETTINGS = acceptSettings(process.env, CHECKOUT_ROOT);

const LIST: ReporterDescription = ['list'];
const REPORTERS: ReporterDescription[] =
  SETTINGS === null || SETTINGS.reportFile === null ? [LIST] : [LIST, ['json', { outputFile: SETTINGS.reportFile }]];

export default defineConfig({
  testDir: '.',
  testMatch: '**/accept*.spec.ts',
  outputDir: join(tmpdir(), 'bb2dash-accept-pw'),
  fullyParallel: false,
  workers: 1,
  forbidOnly: true,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 20_000 },
  reporter: REPORTERS,
  use: {
    ...devices['Desktop Chrome'],
    baseURL: SETTINGS?.baseUrl,
    storageState: SETTINGS?.statePath,
    viewport: { width: 1440, height: 900 },
    trace: 'off',
    screenshot: 'off',
    video: 'off',
  },
});

/** Test setup: jest-dom matchers, and an unmounted DOM between tests. */

import { configure } from '@testing-library/dom';
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

/**
 * How long `findBy*` / `waitFor` may wait for an async render.
 *
 * Testing Library's default is one second, and a screen that mounts React
 * Query and four queries does not reliably paint inside a second when the rest
 * of the suite is spawning jsdom workers beside it. Measured on this machine:
 * the same work takes ~3x longer with one other suite running, and on a cold
 * run straight after `npm ci` vitest reported ~13.75s just to start each
 * worker. A one-second wait under that load reports "the element never
 * appeared" for a screen that was going to appear — a single test red in one
 * run of six and green in the next eleven, which is the flake W-31 and W-32
 * both hit and neither could reproduce.
 *
 * This raises no assertion's tolerance: a control that never renders still
 * fails, and fails for the same reason. It only stops a busy machine from
 * being reported as a defect. `PlannerWeek.band.test.tsx` had already argued
 * exactly this per call site; this makes it the default everywhere instead of
 * the one suite that happened to get there first.
 */
configure({ asyncUtilTimeout: 15_000 });

afterEach(() => {
  cleanup();
});

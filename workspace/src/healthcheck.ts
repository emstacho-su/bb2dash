/**
 * The container healthcheck:
 *   node /app/workspace/dist/healthcheck.js
 *
 * Exit 0 while the alive file is under 90 s old, 1 when it is older or missing. It prints nothing.
 * A path given as the first argument replaces the in-image one (the test runs it that way).
 *
 * This file runs on load and is never imported; the rule is in `alive.ts`. An error here leaves the
 * process to exit non-zero on its own, which reads as unhealthy.
 */

import { isAliveFresh } from './alive.js';
import { PATHS } from './config.js';

const HEALTHY = 0;
const UNHEALTHY = 1;

process.exitCode = isAliveFresh(process.argv[2] ?? PATHS.aliveFile, Date.now()) ? HEALTHY : UNHEALTHY;

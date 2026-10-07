/**
 * The container healthcheck:
 *   node /app/apply/dist/healthcheck.js
 *
 * Exit 0 while the alive file is under 90 s old, 1 when it is older or missing. It prints nothing.
 * A path given as the first argument replaces the in-image one. The worker touches the file after
 * each heartbeat that reached the database, a 14-minute Claude run included.
 *
 * This file runs on load and is never imported; the rule is Phase 21's (`workspace/src/alive.ts`).
 */

import { isAliveFresh } from '../../workspace/src/alive.js';
import { HEALTH_MAX_AGE_MS, PATHS } from './config.js';

const HEALTHY = 0;
const UNHEALTHY = 1;

process.exitCode = isAliveFresh(process.argv[2] ?? PATHS.aliveFile, Date.now(), HEALTH_MAX_AGE_MS) ? HEALTHY : UNHEALTHY;

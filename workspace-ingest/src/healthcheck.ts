/**
 * The container healthcheck for both services: exit 0 while the alive file is fresh.
 *
 *   node dist/healthcheck.js parser   the parser's file in the exchange folder, 35 s
 *   node dist/healthcheck.js worker   the worker's file, 90 s
 *
 * This file runs on load and is never imported; the rule is Phase 21's (`workspace/src/alive.ts`).
 */

import path from 'node:path';

import { isAliveFresh } from '../../workspace/src/alive.js';
import { PATHS } from './config.js';
import { ALIVE_MAX_AGE_MS, EXCHANGE_DIR, WORKER_ALIVE_MAX_AGE_MS } from './constants.js';
import { EXCHANGE_FILES } from './exchange.js';

const which = process.argv[2];
const fresh =
  which === 'parser'
    ? isAliveFresh(path.join(EXCHANGE_DIR, EXCHANGE_FILES.alive), Date.now(), ALIVE_MAX_AGE_MS)
    : which === 'worker'
      ? isAliveFresh(PATHS.aliveFile, Date.now(), WORKER_ALIVE_MAX_AGE_MS)
      : false;
process.exitCode = fresh ? 0 : 1;

/**
 * The ingest worker's process (service `workspace-ingest`):
 *
 *   node /app/workspace-ingest/dist/main.js
 *
 * It reads its configuration, connects as `workspace_ingest_runner`, and loops. A heartbeat every
 * 30 s reaches the database and touches the alive file, through a 330 s wait for the parser too.
 * On SIGTERM or SIGINT it stops taking work and exits 0. A configuration refusal exits 1 with one
 * line that names a variable or a file, never a value. Logs: ids, states and timings only.
 */

import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

import { touchAlive } from '../../workspace/src/alive.js';
import { ConfigError, readTextOrNull } from '../../workspace/src/config.js';
import { createPgQuery, newPgClient, redactDsn } from '../../workspace/src/db.js';
import { PATHS, loadConfig, type IngestConfig } from './config.js';
import { EXCHANGE_DIR, HEARTBEAT_MS } from './constants.js';
import { createIngestRpc } from './db.js';
import { embedDocument } from './embed.js';
import { processDocument } from './process-document.js';
import { runWorkerLoop } from './worker-loop.js';

const EXIT_OK = 0;
const EXIT_CONFIG = 1;
const RUNNER_SUFFIX_BYTES = 6;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

function printLine(line: string): void {
  process.stdout.write(`${new Date().toISOString()} ${line}\n`);
}

async function main(): Promise<number> {
  let config: IngestConfig;
  try {
    config = loadConfig({ env: process.env, readFile: readTextOrNull });
  } catch (error) {
    printLine(`config: ${error instanceof ConfigError ? error.message : 'could not be read'}`);
    return EXIT_CONFIG;
  }
  const log = (line: string): void => printLine(redactDsn(line, config.dbUrl));
  const runner = `workspace-ingest@${randomBytes(RUNNER_SUFFIX_BYTES).toString('hex')}`;
  const query = createPgQuery({ dsn: config.dbUrl, ca: config.dbCa, log, newClient: newPgClient });
  const rpc = createIngestRpc(query, runner);
  fs.mkdirSync(PATHS.runDir, { recursive: true });

  let stopping = false;
  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.once(signal, () => {
      log(`${signal}: stopping`);
      stopping = true;
    });
  }
  const heartbeat = (): void => {
    rpc.heartbeat().then(
      () => touchAlive(PATHS.aliveFile),
      () => log('heartbeat: the database did not answer'),
    );
  };
  heartbeat();
  const beat = setInterval(heartbeat, HEARTBEAT_MS);

  log('ingest worker: started');
  await runWorkerLoop({
    rpc,
    process: (claim) =>
      processDocument(claim, {
        rpc,
        fetch,
        embed: (documentId) => embedDocument({ documentId, jwt: config.anonJwt, fetch }),
        exchangeDir: EXCHANGE_DIR,
        now: Date.now,
        sleep,
        log,
      }),
    sleep,
    shouldStop: () => stopping,
    log,
  });
  clearInterval(beat);
  await query.end();
  log('ingest worker: stopped');
  return EXIT_OK;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main();
}

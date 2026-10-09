/**
 * The parser's process (service `workspace-extract`):
 *
 *   node /app/workspace-ingest/dist/parser-main.js
 *
 * No secret is read and no connection is opened. The alive file in the exchange folder is touched
 * from a thread of its own every 10 s, so a long extraction does not stop it. On SIGTERM or SIGINT
 * the loop ends after the request it is on.
 */

import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { startAliveBeat } from './alive-beat.js';
import { ALIVE_TOUCH_MS, EXCHANGE_DIR, INGEST_DIR } from './constants.js';
import { EXCHANGE_FILES } from './exchange.js';
import { makeExtractor, runParserLoop } from './parser-loop.js';

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

function printLine(line: string): void {
  process.stdout.write(`${new Date().toISOString()} ${line}\n`);
}

async function main(): Promise<number> {
  let stopping = false;
  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.once(signal, () => {
      printLine(`${signal}: stopping`);
      stopping = true;
    });
  }
  const beat = startAliveBeat(path.join(EXCHANGE_DIR, EXCHANGE_FILES.alive), ALIVE_TOUCH_MS);
  printLine('parser: started');
  await runParserLoop({
    dir: EXCHANGE_DIR,
    extract: makeExtractor(INGEST_DIR),
    log: printLine,
    sleep,
    shouldStop: () => stopping,
  });
  beat.stop();
  printLine('parser: stopped');
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main();
}

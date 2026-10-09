/**
 * The alive file's beat, from a thread of its own. `extractUnits` runs the extractor with
 * `execFileSync`, which holds the main thread for up to 300 s; a timer on that thread would stop
 * for the whole extraction and the service's healthcheck would call a working parser dead.
 */

import { Worker } from 'node:worker_threads';

/** Touch the file now and every `everyMs`; create it when it is not there. Plain `fs` calls only. */
const BEAT_SOURCE = `
const { workerData } = require('node:worker_threads');
const fs = require('node:fs');
function touch() {
  const now = new Date();
  try { fs.utimesSync(workerData.file, now, now); }
  catch { try { fs.closeSync(fs.openSync(workerData.file, 'w')); } catch {} }
}
touch();
setInterval(touch, workerData.everyMs);
`;

export function startAliveBeat(file: string, everyMs: number): { stop(): void } {
  const worker = new Worker(BEAT_SOURCE, { eval: true, workerData: { file, everyMs } });
  worker.on('error', () => undefined);
  return { stop: () => void worker.terminate() };
}

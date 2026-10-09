/**
 * The worker's loop: claim, process, claim again at once; ask again every WORKER_POLL_MS when
 * nothing was handed out. One document at a time, as the claim function allows. A claim or a
 * process that throws is logged by class (a SQLSTATE or the error's name) and never stops the loop.
 */

import { WORKER_POLL_MS } from './constants.js';
import type { IngestClaim, IngestRpc } from './db.js';
import { describeError } from './process-document.js';

export interface WorkerLoopDeps {
  readonly rpc: Pick<IngestRpc, 'claim'>;
  readonly process: (claim: IngestClaim) => Promise<string>;
  readonly sleep: (ms: number) => Promise<void>;
  readonly shouldStop: () => boolean;
  readonly log: (line: string) => void;
}

export async function runWorkerLoop(d: WorkerLoopDeps): Promise<void> {
  while (!d.shouldStop()) {
    let claim: IngestClaim | null = null;
    try {
      claim = await d.rpc.claim();
    } catch (error) {
      d.log(`ingest: the claim failed (${describeError(error)})`);
    }
    if (claim !== null) {
      try {
        await d.process(claim);
      } catch (error) {
        d.log(`ingest: document ${claim.document_id} was not finished (${describeError(error)})`);
      }
      continue;
    }
    if (!d.shouldStop()) await d.sleep(WORKER_POLL_MS);
  }
}

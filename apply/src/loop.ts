/**
 * The worker, one pass (Phase 23). Every step that must not be left to a model is here, in code
 * (ORCHESTRATOR: "a skill step written as prose gets skipped"):
 *
 *   1. inbox_apply_claim(): releases dead claims, then claims the oldest queued request; none -> idle
 *   2. inbox_apply_prepare(id): apply_resolutions(), the queue, the day's run count
 *   3. archive, with a templated record, every row that needs no reading (`batch.ts`)
 *   4. at most six of the rest go to one `claude -p` run of /inbox-apply, unless the day's cap is
 *      reached; the run is killed at 14 minutes
 *   5. inbox_apply_run_facts(id): what the request did, read from the tables
 *   6. inbox_apply_close(id, done | failed, result): the close files the follow-up for the rest
 *
 * A pass that throws after its claim still closes the request, failed. If even that close cannot
 * be made (the database is gone), the claim is released by the next inbox_apply_claim(), which
 * closes any claim of the worker's own it finds open.
 *
 * Every step is an injected port, so the pass runs on fakes in loop.test.ts.
 */

import { planBatch, templatedDecision, type Prepared } from './batch.js';
import { MAX_RUNS_PER_DAY, POLL_INTERVAL_MS } from './config.js';
import type { ApplyRpc } from './db.js';
import { buildReport, type ClaudeOutcome } from './report.js';

export interface RunInput {
  readonly requestId: number;
  readonly itemIds: readonly number[];
}

export interface PassDeps {
  readonly rpc: ApplyRpc;
  readonly runClaude: (input: RunInput) => Promise<ClaudeOutcome>;
  readonly log: (line: string) => void;
  readonly maxRunsPerDay?: number;
}

export type PassOutcome = 'idle' | 'done' | 'failed';

function message(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).split('\n')[0] ?? '';
}

/** What steps 2 to 4 leave for the close: the queue as it was read, the batch, and how the run ended. */
interface BatchRun {
  readonly prepared: Prepared;
  readonly batchIds: readonly number[];
  readonly claude: ClaudeOutcome | null;
  readonly capped: boolean;
}

/** Steps 2 to 4 for a claimed request. `onRun` is told before Claude is started, so a later throw still knows it was. */
async function runBatch(d: PassDeps, requestId: number, onRun: () => void): Promise<BatchRun> {
  const prepared = await d.rpc.prepare(requestId);
  const plan = planBatch(prepared);

  for (const entry of plan.templated) {
    const { row } = entry;
    try {
      const archived = await d.rpc.archive(requestId, row.id, templatedDecision(entry, requestId));
      if (!archived) d.log(`pass: item ${row.id} was taken back before it could be recorded`);
    } catch (error) {
      // One row's refusal never stops the request: it stays in the queue and is reported as left.
      d.log(`pass: item ${row.id} could not be recorded: ${message(error)}`);
    }
  }

  const batchIds = plan.forClaude.map((row) => row.id);
  const capped = batchIds.length > 0 && prepared.runsToday >= (d.maxRunsPerDay ?? MAX_RUNS_PER_DAY);
  let claude: ClaudeOutcome | null = null;
  if (capped) {
    d.log(`pass: request ${requestId}: today's ${prepared.runsToday} runs reached the cap; ${batchIds.length} item(s) wait`);
  } else if (batchIds.length > 0) {
    d.log(`pass: request ${requestId}: ${plan.templated.length} recorded here, ${batchIds.length} to Claude, ${plan.deferred.length} deferred, ${plan.skipped.length} skipped`);
    onRun();
    claude = await d.runClaude({ requestId, itemIds: batchIds });
  }
  return { prepared, batchIds, claude, capped };
}

/** Steps 5 and 6: what the request did, read from the tables, then the close. */
async function finish(d: PassDeps, requestId: number, run: BatchRun): Promise<'done' | 'failed'> {
  const facts = await d.rpc.runFacts(requestId);
  const report = buildReport({
    trigger: run.prepared.trigger,
    batchIds: run.batchIds,
    priorSkip: run.prepared.skip,
    facts,
    claude: run.claude,
    capped: run.capped,
  });
  const followUp = await d.rpc.close(requestId, report.state, report.result);
  d.log(`pass: request ${requestId} closed ${report.state}${followUp === null ? '' : `; follow-up ${followUp} queued`}`);
  return report.state;
}

/** How many items this request has archived, for the fallback close; 0 when even that cannot be read. */
async function archivedSoFar(d: PassDeps, requestId: number): Promise<number> {
  try {
    return (await d.rpc.runFacts(requestId)).archivedIds.length;
  } catch {
    return 0;
  }
}

export async function runPass(d: PassDeps): Promise<PassOutcome> {
  const request = await d.rpc.claim();
  if (request === null) return 'idle';
  d.log(`pass: claimed request ${request.id}`);
  let started = false;
  try {
    const run = await runBatch(d, request.id, () => {
      started = true;
    });
    return await finish(d, request.id, run);
  } catch (error) {
    d.log(`pass: request ${request.id} failed: ${message(error)}`);
    try {
      await d.rpc.close(request.id, 'failed', {
        lines: ['The apply worker hit an error before it could finish.'],
        error: 'cli_error',
        // What was archived before the error stays archived and is counted, so the close files the
        // follow-up for the rest; a run that started Claude counts toward the day's cap.
        archived: await archivedSoFar(d, request.id),
        claude: { started },
      });
    } catch (closeError) {
      d.log(`pass: request ${request.id} could not be closed (${message(closeError)}); the next claim releases it`);
    }
    return 'failed';
  }
}

export interface LoopDeps extends PassDeps {
  sleep(ms: number): Promise<void>;
  shouldStop(): boolean;
}

/** Passes until told to stop, POLL_INTERVAL_MS apart. A pass that throws is logged, not fatal. */
export async function runLoop(d: LoopDeps): Promise<void> {
  while (!d.shouldStop()) {
    try {
      await runPass(d);
    } catch (error) {
      d.log(`pass: failed: ${message(error)}`);
    }
    if (d.shouldStop()) break;
    await d.sleep(POLL_INTERVAL_MS);
  }
}

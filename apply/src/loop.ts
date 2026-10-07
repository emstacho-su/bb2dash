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

import { planBatch, templatedDecision } from './batch.js';
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

/** Steps 2 to 6 for a claimed request. Throws only when a database call does. */
async function work(d: PassDeps, requestId: number): Promise<'done' | 'failed'> {
  const prepared = await d.rpc.prepare(requestId);
  const plan = planBatch(prepared);

  for (const { row, bucket } of plan.templated) {
    try {
      const archived = await d.rpc.archive(requestId, row.id, templatedDecision(row, bucket, requestId));
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
    claude = await d.runClaude({ requestId, itemIds: batchIds });
  }

  const facts = await d.rpc.runFacts(requestId);
  const report = buildReport({ trigger: prepared.trigger, batchIds, priorSkip: prepared.skip, facts, claude, capped });
  const followUp = await d.rpc.close(requestId, report.state, report.result);
  d.log(`pass: request ${requestId} closed ${report.state}${followUp === null ? '' : `; follow-up ${followUp} queued`}`);
  return report.state;
}

export async function runPass(d: PassDeps): Promise<PassOutcome> {
  const request = await d.rpc.claim();
  if (request === null) return 'idle';
  d.log(`pass: claimed request ${request.id}`);
  try {
    return await work(d, request.id);
  } catch (error) {
    d.log(`pass: request ${request.id} failed: ${message(error)}`);
    try {
      await d.rpc.close(request.id, 'failed', {
        lines: ['The apply worker hit an error before it could finish.'],
        error: 'cli_error',
        archived: 0,
        claude: { started: false },
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

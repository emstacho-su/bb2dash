// Task 9 (R-81, R-83): one pass of the runner, on a fake RPC client and fake steps.

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { FOLD_POLL_MS, FOLD_WAIT_MS, waitForFold } from '../src/crawl.js';
import type { RunOutcome, SyncRequest, SyncRpc } from '../src/db.js';
import { LOGIN_HOSTS, classifyProbe, type Verdict } from '../src/login.js';
import { MAX_CLAIM_ATTEMPTS, POLL_INTERVAL_MS, runLoop, runPass, type PassDeps } from '../src/loop.js';
import type { Report } from '../src/report.js';

const REPO = path.resolve(import.meta.dirname, '..', '..');
const RUN_ID = '00000000-1491-4000-8000-0000000000aa';

interface Recorder {
  calls: string[];
  closes: { id: string; state: string; report: Report }[];
}

function fakeRpc(over: Partial<SyncRpc> = {}, request: SyncRequest | null = { id: '501', createdAt: '2026-10-03T12:00:00Z', params: {} }) {
  const rec: Recorder = { calls: [], closes: [] };
  let open = request;
  const rpc: SyncRpc = {
    sweepStale: vi.fn(async () => { rec.calls.push('sweep'); return 0; }),
    ownClaims: vi.fn(async () => []),
    next: vi.fn(async () => { rec.calls.push('next'); return open; }),
    claim: vi.fn(async () => { rec.calls.push('claim'); return true; }),
    requeueOrphans: vi.fn(async () => 0),
    registerRun: vi.fn(async () => { rec.calls.push('register'); return true; }),
    runOutcome: vi.fn(async (): Promise<RunOutcome | null> => { rec.calls.push('outcome'); return { syncRunId: '62', status: 'ok', summary: {} }; }),
    fileWorklist: vi.fn(async () => []),
    fileStored: vi.fn(async () => true),
    close: vi.fn(async (id: string, state: 'done' | 'failed', report: Report) => {
      rec.calls.push(`close ${state}`);
      rec.closes.push({ id, state, report });
      open = null;
    }),
    enqueue: vi.fn(async () => null),
    loginOk: vi.fn(async () => { rec.calls.push('login_ok'); return 0; }),
    loginRequired: vi.fn(async () => '1'),
    ...over,
  };
  return { rpc, rec };
}

function deps(rpc: SyncRpc, rec: Recorder, over: Partial<PassDeps> = {}): PassDeps {
  return {
    rpc,
    login: { check: vi.fn(async (): Promise<Verdict> => { rec.calls.push('probe'); return 'alive'; }) },
    crawl: vi.fn(async () => { rec.calls.push('crawl'); }),
    waitFold: vi.fn(async (runId: string) => { rec.calls.push('wait'); return rpc.runOutcome(runId); }),
    files: vi.fn(async () => { rec.calls.push('files'); return { files: { pulled: 0, not_pulled: [] }, stopped: null, embedError: null }; }),
    mintRunId: () => RUN_ID,
    setPassRunning: vi.fn(),
    log: () => {},
    ...over,
  };
}

describe('the named constants', () => {
  it('match the frozen Contract, and MAX_CLAIM_ATTEMPTS is the same in SQL and TS', () => {
    expect(POLL_INTERVAL_MS).toBe(25000);
    expect(FOLD_WAIT_MS).toBe(600000);
    expect(MAX_CLAIM_ATTEMPTS).toBe(3);
    const sql = fs.readFileSync(path.join(REPO, 'db', 'migrations', '091_sync_runner_role.sql'), 'utf8');
    const inSql = [...sql.matchAll(/c_max_claim_attempts constant smallint := (\d+);/g)].map((m) => Number(m[1]));
    expect(inSql.length).toBeGreaterThanOrEqual(2);
    expect(new Set(inSql)).toEqual(new Set([MAX_CLAIM_ATTEMPTS]));
    expect(sql).toContain("c_dead_letter_after  constant interval := interval '20 minutes'");
  });
});

describe('one pass', () => {
  it('an empty queue sweeps, reads the queue, and does nothing else', async () => {
    const { rpc, rec } = fakeRpc({}, null);
    expect(await runPass(deps(rpc, rec))).toBe('idle');
    expect(rec.calls).toEqual(['sweep', 'next']);
  });

  it('done: probe, claim, register, crawl, wait, files, close done; the pass flag brackets it', async () => {
    const { rpc, rec } = fakeRpc();
    const d = deps(rpc, rec);
    expect(await runPass(d)).toBe('done');
    expect(rec.calls).toEqual(['sweep', 'next', 'probe', 'login_ok', 'claim', 'register', 'crawl', 'wait', 'outcome', 'files', 'close done']);
    expect(rpc.registerRun).toHaveBeenCalledWith('501', RUN_ID);
    expect(d.crawl).toHaveBeenCalledWith(RUN_ID);
    expect(rec.closes[0]).toMatchObject({ id: '501', state: 'done', report: { lines: ['Files: nothing new to pull'], error: null, claim_attempts: 1 } });
    expect(d.setPassRunning).toHaveBeenNthCalledWith(1, true);
    expect(d.setPassRunning).toHaveBeenLastCalledWith(false);
  });

  it.each([401, 403])('users/me %i closes the request queued -> failed as login_required, and claims nothing', async (status) => {
    const { rpc, rec } = fakeRpc();
    const verdict = classifyProbe({ status, location: null }, 'https://blackboard.syracuse.edu/ultra/stream');
    const d = deps(rpc, rec, { login: { check: async () => verdict } });
    expect(await runPass(d)).toBe('login_required');
    expect(rpc.claim).not.toHaveBeenCalled();
    expect(rec.closes).toHaveLength(1);
    expect(rec.closes[0]).toMatchObject({ id: '501', state: 'failed', report: { error: 'login_required' } });
  });

  it.each(LOGIN_HOSTS.map((h) => [h]))('a tab on %s closes the request as login_required', async (host) => {
    const { rpc, rec } = fakeRpc();
    const verdict = classifyProbe({ status: 200, location: null }, `https://${host}/common/login`);
    expect(await runPass(deps(rpc, rec, { login: { check: async () => verdict } }))).toBe('login_required');
    expect(rec.closes[0]!.report.error).toBe('login_required');
  });

  it('a probe that errors leaves the request queued for the next pass', async () => {
    const { rpc, rec } = fakeRpc();
    expect(await runPass(deps(rpc, rec, { login: { check: async () => 'error' as Verdict } }))).toBe('probe_error');
    expect(rpc.claim).not.toHaveBeenCalled();
    expect(rpc.close).not.toHaveBeenCalled();
  });

  it('a lost claim stops the pass: nothing registered, nothing closed', async () => {
    const { rpc, rec } = fakeRpc({ claim: vi.fn(async () => false) });
    const d = deps(rpc, rec);
    expect(await runPass(d)).toBe('claim_lost');
    expect(rpc.registerRun).not.toHaveBeenCalled();
    expect(d.crawl).not.toHaveBeenCalled();
    expect(rpc.close).not.toHaveBeenCalled();
  });

  it('a refused registration closes failed and never crawls', async () => {
    const { rpc, rec } = fakeRpc({ registerRun: vi.fn(async () => false) });
    const d = deps(rpc, rec);
    expect(await runPass(d)).toBe('register_refused');
    expect(d.crawl).not.toHaveBeenCalled();
    expect(rec.closes[0]).toMatchObject({ state: 'failed', report: { error: expect.stringMatching(/^register failed/) } });
  });

  it('a quarantined run id (42501) closes failed and never crawls', async () => {
    const err = Object.assign(new Error('run was quarantined'), { code: '42501' });
    const { rpc, rec } = fakeRpc({ registerRun: vi.fn(async () => { throw err; }) });
    const d = deps(rpc, rec);
    expect(await runPass(d)).toBe('register_refused');
    expect(d.crawl).not.toHaveBeenCalled();
    expect(rec.closes[0]!.report.error).toMatch(/quarantined/);
  });

  it('a crawl that throws closes failed with the error, and never waits or pulls', async () => {
    const { rpc, rec } = fakeRpc();
    const d = deps(rpc, rec, { crawl: vi.fn(async () => { throw new Error('TypeError: bb.runAll is not a function'); }) });
    expect(await runPass(d)).toBe('crawl_failed');
    expect(d.waitFold).not.toHaveBeenCalled();
    expect(d.files).not.toHaveBeenCalled();
    expect(rec.closes[0]).toMatchObject({ state: 'failed', report: { error: 'crawl failed: TypeError: bb.runAll is not a function' } });
  });

  it('a fold timeout leaves the row claimed: no files, no close', async () => {
    const { rpc, rec } = fakeRpc();
    const d = deps(rpc, rec, { waitFold: vi.fn(async () => null) });
    expect(await runPass(d)).toBe('fold_timeout');
    expect(d.files).not.toHaveBeenCalled();
    expect(rpc.close).not.toHaveBeenCalled();
  });

  it('a failed fold closes failed and skips the files', async () => {
    const { rpc, rec } = fakeRpc({ runOutcome: vi.fn(async () => ({ syncRunId: '62', status: 'failed' as const, summary: {} })) });
    const d = deps(rpc, rec);
    expect(await runPass(d)).toBe('failed');
    expect(d.files).not.toHaveBeenCalled();
    expect(rec.closes[0]!.report.error).toBe('fold failed');
  });

  it('a files step that throws still closes, failed, with the error', async () => {
    const { rpc, rec } = fakeRpc();
    const d = deps(rpc, rec, { files: vi.fn(async () => { throw new Error('worklist read failed'); }) });
    expect(await runPass(d)).toBe('failed');
    expect(rec.closes[0]!.report.error).toBe('files failed: worklist read failed');
  });

  it('R2 item 7: reports the claim_attempts column the database holds, not a count of its own', async () => {
    let claimed = false;
    const { rpc, rec } = fakeRpc({
      claim: vi.fn(async () => { rec.calls.push('claim'); claimed = true; return true; }),
      ownClaims: vi.fn(async () => (claimed ? [{ id: '501', runId: null, claimedAt: '2026-10-03T22:00:00Z', claimAttempts: 3 }] : [])),
    });
    await runPass(deps(rpc, rec));
    expect(rec.closes[0]!.report.claim_attempts).toBe(3);
  });

  it('the pass flag is cleared even when a call throws', async () => {
    const { rpc, rec } = fakeRpc({ claim: vi.fn(async () => { throw new Error('connection terminated'); }) });
    const d = deps(rpc, rec);
    await expect(runPass(d)).rejects.toThrow('connection terminated');
    expect(d.setPassRunning).toHaveBeenLastCalledWith(false);
  });
});

describe('resuming the runner\'s own registered claims (R2 item 1)', () => {
  interface Row { state: string; run_id: string | null; claimed_by: string | null; attempts: number }

  /** A database with one queued request, '601', and one claimed by somebody else, '602'. */
  function statefulRpc(outcome: RunOutcome['status'] = 'ok') {
    const rows = new Map<string, Row>([
      ['601', { state: 'queued', run_id: null, claimed_by: null, attempts: 0 }],
      ['602', { state: 'claimed', run_id: '00000000-1491-4000-8000-0000000000cc', claimed_by: 'bb-sync session', attempts: 0 }],
    ]);
    const closes: { id: string; state: string; report: Report }[] = [];
    const rpc: SyncRpc = {
      sweepStale: async () => 0,
      ownClaims: async () =>
        [...rows].filter(([, r]) => r.state === 'claimed' && r.claimed_by === 'sync-runner')
          .map(([id, r]) => ({ id, runId: r.run_id, claimedAt: '2026-10-03T22:00:00Z', claimAttempts: r.attempts })),
      next: async () => {
        const q = [...rows].find(([, r]) => r.state === 'queued');
        return q ? { id: q[0], createdAt: '2026-10-03T22:00:00Z', params: {} } : null;
      },
      claim: async (id) => {
        const r = rows.get(id)!;
        if (r.state !== 'queued') return false;
        Object.assign(r, { state: 'claimed', claimed_by: 'sync-runner', attempts: r.attempts + 1 });
        return true;
      },
      requeueOrphans: async () => 0,
      registerRun: async (id, runId) => {
        rows.get(id)!.run_id = runId;
        return true;
      },
      runOutcome: async () => ({ syncRunId: '62', status: outcome, summary: {} }),
      fileWorklist: async () => [],
      fileStored: async () => true,
      close: async (id, state, report) => {
        const r = rows.get(id)!;
        if (r.claimed_by !== 'sync-runner' && r.state === 'claimed') throw new Error('sync_close: another claimant');
        r.state = state;
        closes.push({ id, state, report });
      },
      enqueue: async () => null,
      loginOk: async () => 0,
      loginRequired: async () => '1',
    };
    return { rpc, rows, closes };
  }

  function stateDeps(rpc: SyncRpc, over: Partial<PassDeps> = {}): PassDeps {
    return {
      rpc,
      login: { check: async () => 'alive' as Verdict },
      crawl: async () => {},
      waitFold: (runId) => rpc.runOutcome(runId),
      files: async () => ({ files: { pulled: 0, not_pulled: [] }, stopped: null, embedError: null }),
      mintRunId: () => RUN_ID,
      setPassRunning: () => {},
      log: () => {},
      ...over,
    };
  }

  it('a fold-wait timeout leaves the claim; the next pass waits again and closes it done', async () => {
    const { rpc, rows, closes } = statefulRpc();
    expect(await runPass(stateDeps(rpc, { waitFold: async () => null }))).toBe('fold_timeout');
    expect(rows.get('601')!.state).toBe('claimed');
    expect(await runPass(stateDeps(rpc))).toBe('idle');
    expect(closes).toEqual([expect.objectContaining({ id: '601', state: 'done' })]);
  });

  it('a stop during the fold wait leaves the claim; the next runner closes it', async () => {
    const { rpc, rows, closes } = statefulRpc();
    let t = 0;
    const stopping = stateDeps(rpc, {
      waitFold: (runId) => waitForFold(runId, { rpc: { runOutcome: async () => ({ syncRunId: '62', status: 'running', summary: null }) }, now: () => t, sleep: async (ms) => { t += ms; }, shouldStop: () => true }),
    });
    expect(await runPass(stopping)).toBe('fold_timeout');
    expect(rows.get('601')!.state).toBe('claimed');
    expect(await runPass(stateDeps(rpc))).toBe('idle');
    expect(closes.map((c) => [c.id, c.state])).toEqual([['601', 'done']]);
  });

  it('a throw after the registration leaves the claim; the next pass closes it', async () => {
    const { rpc, rows, closes } = statefulRpc();
    await expect(runPass(stateDeps(rpc, { waitFold: async () => { throw new Error('connection terminated'); } }))).rejects.toThrow('connection terminated');
    expect(rows.get('601')!.state).toBe('claimed');
    expect(await runPass(stateDeps(rpc))).toBe('idle');
    expect(closes.map((c) => [c.id, c.state])).toEqual([['601', 'done']]);
  });

  it('a resumed run that failed closes failed, and the files step is not run', async () => {
    const { rpc, closes } = statefulRpc('failed');
    const files = vi.fn(async () => ({ files: { pulled: 0, not_pulled: [] }, stopped: null, embedError: null }));
    await runPass(stateDeps(rpc, { waitFold: async () => null }));
    await runPass(stateDeps(rpc, { files }));
    expect(closes.map((c) => [c.id, c.state, c.report.error])).toEqual([['601', 'failed', 'fold failed']]);
    expect(files).not.toHaveBeenCalled();
  });

  it('R2 item 7: the third claim of a request reports claim_attempts 3', async () => {
    const { rpc, rows, closes } = statefulRpc();
    rows.get('601')!.attempts = 2;
    await runPass(stateDeps(rpc));
    expect(closes.map((c) => [c.id, c.report.claim_attempts])).toEqual([['601', 3]]);
  });

  it('never touches a claim it did not make, and leaves its own unregistered claims to the requeue', async () => {
    const { rpc, rows, closes } = statefulRpc();
    rows.set('603', { state: 'claimed', run_id: null, claimed_by: 'sync-runner', attempts: 1 });
    rows.get('601')!.state = 'done';
    expect(await runPass(stateDeps(rpc))).toBe('idle');
    expect(closes).toEqual([]);
    expect(rows.get('602')!.state).toBe('claimed');
    expect(rows.get('603')!.state).toBe('claimed');
  });
});

describe('the loop', () => {
  it('runs passes until told to stop, sleeping POLL_INTERVAL_MS between them, and survives a failed pass', async () => {
    const { rpc, rec } = fakeRpc({}, null);
    let n = 0;
    rpc.next = vi.fn(async () => {
      n += 1;
      if (n === 2) throw new Error('db down');
      return null;
    });
    const sleeps: number[] = [];
    const lines: string[] = [];
    let beats = 0;
    await runLoop({
      ...deps(rpc, rec),
      log: (l) => lines.push(l),
      sleep: async (ms) => { sleeps.push(ms); },
      shouldStop: () => n >= 3,
      heartbeat: () => { beats += 1; },
    });
    expect(n).toBe(3);
    // No sleep after the pass that saw the stop.
    expect(sleeps).toEqual([POLL_INTERVAL_MS, POLL_INTERVAL_MS]);
    expect(beats).toBe(3);
    expect(lines.some((l) => l.includes('db down'))).toBe(true);
  });
});

describe('the fold wait', () => {
  it('polls sync_run_outcome until the run is no longer running', async () => {
    const statuses: RunOutcome['status'][] = ['running', 'running', 'ok'];
    const rpc = { runOutcome: vi.fn(async () => ({ syncRunId: '1', status: statuses.shift()!, summary: null })) };
    let t = 0;
    const sleeps: number[] = [];
    const out = await waitForFold(RUN_ID, { rpc, now: () => t, sleep: async (ms) => { sleeps.push(ms); t += ms; } });
    expect(out?.status).toBe('ok');
    expect(sleeps).toEqual([FOLD_POLL_MS, FOLD_POLL_MS]);
  });

  it('gives up at FOLD_WAIT_MS and returns null', async () => {
    const rpc = { runOutcome: vi.fn(async () => ({ syncRunId: '1', status: 'running' as const, summary: null })) };
    let t = 0;
    const out = await waitForFold(RUN_ID, { rpc, now: () => t, sleep: async (ms) => { t += ms; } });
    expect(out).toBeNull();
    expect(t).toBe(FOLD_WAIT_MS);
  });

  it('keeps waiting while the run has no row yet', async () => {
    const answers: (RunOutcome | null)[] = [null, { syncRunId: '1', status: 'partial', summary: null }];
    const rpc = { runOutcome: vi.fn(async () => answers.shift() ?? null) };
    let t = 0;
    const out = await waitForFold(RUN_ID, { rpc, now: () => t, sleep: async (ms) => { t += ms; } });
    expect(out?.status).toBe('partial');
  });
});

describe('progress during the fold wait (R2 item 5)', () => {
  it('waitForFold reports progress on every poll', async () => {
    const statuses: RunOutcome['status'][] = ['running', 'running', 'ok'];
    const rpc = { runOutcome: vi.fn(async () => ({ syncRunId: '1', status: statuses.shift()!, summary: null })) };
    let t = 0;
    const onPoll = vi.fn();
    await waitForFold(RUN_ID, { rpc, now: () => t, sleep: async (ms) => { t += ms; }, onPoll });
    expect(onPoll).toHaveBeenCalledTimes(3);
  });
});

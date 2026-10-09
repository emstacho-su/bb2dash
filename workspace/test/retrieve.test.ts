import { describe, expect, it } from 'vitest';

import { fallbackPlan, type Plan } from '../src/plan.js';
import {
  ATTACHMENT_MAX_CHARS,
  FAILURES_BEFORE_PAUSE,
  PAUSE_MS,
  RETRIEVE_TIMEOUT_MS,
  createRetriever,
  mergeHits,
  runBatchChild,
  type BatchRun,
  type BatchSpec,
  type RetrieveRequest,
  type RunBatch,
} from '../src/retrieve.js';
import type { Hit, QueryAnswer } from '../src/store-types.js';
import { hitFixture, readContractJson } from './helpers/context24.js';

const PLAN: Plan = readPlan();

function readPlan(): Plan {
  const raw = readContractJson('plan.json') as { queries: Array<{ q: string; kinds: Array<'material' | 'upload' | 'memory'>; course: string | null }>; feed: { from: null; to: null } };
  return raw;
}

const request = (overrides: Partial<RetrieveRequest> = {}): RetrieveRequest => ({
  plan: PLAN,
  scope: ['BIO.110', 'BIO.110.lab'],
  attachments: [
    { kind: 'file', id: 412 },
    { kind: 'upload', id: 17 },
  ],
  signal: new AbortController().signal,
  ...overrides,
});

const OK_STDOUT = JSON.stringify(readContractJson('batch-answer.json'));
const okRun = (overrides: Partial<BatchRun> = {}): BatchRun => ({ exitCode: 0, stdout: OK_STDOUT, stderrChars: 0, timedOut: false, ...overrides });

interface Harness {
  readonly logs: string[];
  readonly inputs: string[];
  readonly clock: { now: number };
  retrieve: ReturnType<typeof createRetriever>;
  runs: number;
}

function harness(run: (n: number) => BatchRun | Promise<BatchRun>): Harness {
  const logs: string[] = [];
  const inputs: string[] = [];
  const clock = { now: 1_000 };
  const state = { runs: 0 };
  const fake: RunBatch = async (_spec, input) => {
    inputs.push(input);
    state.runs += 1;
    return run(state.runs);
  };
  const retrieve = createRetriever({ run: fake, now: () => clock.now, log: (line) => logs.push(line) });
  return {
    logs,
    inputs,
    clock,
    retrieve,
    get runs() {
      return state.runs;
    },
  } as Harness;
}

describe('the request the child gets', () => {
  it('has the shape of batch-request.json: queries with their courses, the limit, the floor and the attachments', async () => {
    const h = harness(() => okRun());
    await h.retrieve(request());
    const sent = JSON.parse(h.inputs[0] ?? '{}') as Record<string, unknown>;
    const frozen = readContractJson('batch-request.json') as Record<string, unknown>;
    expect(Object.keys(sent).sort()).toEqual(Object.keys(frozen).sort());
    expect(sent.version).toBe(1);
    expect(sent.limit).toBe(10);
    expect(sent.min_similarity).toBe(0.78);
    expect(sent.queries).toEqual([
      { q: 'membrane transport', kinds: ['material', 'upload', 'memory'], courses: ['BIO.110'] },
      { q: 'lab report 2 rubric', kinds: ['material'], courses: ['BIO.110', 'BIO.110.lab'] },
    ]);
    expect(sent.attachments).toEqual([
      { kind: 'file', id: 412, max_chars: ATTACHMENT_MAX_CHARS },
      { kind: 'upload', id: 17, max_chars: ATTACHMENT_MAX_CHARS },
    ]);
  });

  it('sends courses null for a query when the request has no scope', async () => {
    const h = harness(() => okRun());
    await h.retrieve(request({ scope: null }));
    const sent = JSON.parse(h.inputs[0] ?? '{}') as { queries: Array<{ courses: unknown }> };
    expect(sent.queries[1]?.courses).toBeNull();
  });

  it('cuts the search text to at most 2,000 characters', async () => {
    const h = harness(() => okRun());
    await h.retrieve(request({ plan: fallbackPlan('x'.repeat(3000), null) }));
    const sent = JSON.parse(h.inputs[0] ?? '{}') as { queries: Array<{ q: string }> };
    expect([...(sent.queries[0]?.q ?? '')]).toHaveLength(2000);
  });
});

describe('a good answer', () => {
  it('gives the merged hits, the attachments and the timing', async () => {
    const h = harness(() => {
      h.clock.now += 912;
      return okRun();
    });
    const result = await h.retrieve(request());
    expect(result.state).toBe('ok');
    expect(result.found).toBe(3);
    expect(result.hits.map((hit) => hit.kind)).toEqual(['material', 'upload', 'memory']);
    expect(result.attachments.map((a) => a.state)).toEqual(['cut', 'read']);
    expect(result.ms).toBe(912);
    expect(h.logs.join('\n')).toMatch(/retrieve: ok queries=2 failed_queries=0 found=3 attachments=2 ms=912/);
  });

  it('counts a refused query as no hits and no failure, and says refused when all are', async () => {
    const refused = JSON.stringify({ version: 1, queries: [{ ok: false, state: 'refused', hits: [] }], attachments: [] });
    const h = harness(() => okRun({ stdout: refused }));
    for (let i = 0; i < FAILURES_BEFORE_PAUSE + 1; i += 1) {
      const result = await h.retrieve(request());
      expect(result.state).toBe('refused');
      expect(result.hits).toEqual([]);
    }
    expect(h.runs).toBe(FAILURES_BEFORE_PAUSE + 1);
  });
});

describe('a child that fails', () => {
  it('gives failed when it exits 1, and the turn goes on', async () => {
    const h = harness(() => okRun({ exitCode: 1, stdout: '', stderrChars: 100 }));
    const result = await h.retrieve(request());
    expect(result.state).toBe('failed');
    expect(result.hits).toEqual([]);
    expect(result.attachments).toEqual([]);
    expect(h.logs.join('\n')).toContain('retrieve: failed class=exit exit=1 stderr_chars=100');
  });

  it('gives failed on a timeout, on stdout that is not the answer and on a child that cannot start', async () => {
    for (const run of [okRun({ exitCode: null, timedOut: true }), okRun({ stdout: 'not json' }), okRun({ stdout: '{"queries":[]}' }), okRun({ exitCode: null, startError: 'Error' })]) {
      const h = harness(() => run);
      expect((await h.retrieve(request())).state).toBe('failed');
    }
    const thrown = harness(() => {
      throw new Error('a message with a passage in it');
    });
    expect((await thrown.retrieve(request())).state).toBe('failed');
    expect(thrown.logs.join('\n')).not.toContain('a passage');
  });

  it('gives failed when every query failed inside the child', async () => {
    const down = JSON.stringify({ version: 1, queries: [{ ok: false, state: 'failed', hits: [] }, { ok: false, state: 'failed', hits: [] }], attachments: [] });
    const h = harness(() => okRun({ stdout: down }));
    expect((await h.retrieve(request())).state).toBe('failed');
  });

  it('is not run at all when the turn was stopped while it ran', async () => {
    const controller = new AbortController();
    const h = harness(() => {
      controller.abort();
      return okRun();
    });
    const result = await h.retrieve(request({ signal: controller.signal }));
    expect(result.state).toBe('failed');
    expect(result.hits).toEqual([]);
  });

  it('skips the search for 5 minutes after three failures in a row, on a fake clock, then tries again', async () => {
    const h = harness(() => okRun({ exitCode: 1, stderrChars: 3 }));
    for (let i = 0; i < FAILURES_BEFORE_PAUSE; i += 1) expect((await h.retrieve(request())).state).toBe('failed');
    expect(h.runs).toBe(3);
    const paused = await h.retrieve(request());
    expect(paused.state).toBe('paused');
    expect(h.runs).toBe(3);
    h.clock.now += PAUSE_MS - 1_000;
    expect((await h.retrieve(request())).state).toBe('paused');
    expect(h.runs).toBe(3);
    h.clock.now += 2_000;
    expect((await h.retrieve(request())).state).toBe('failed');
    expect(h.runs).toBe(4);
  });

  it('forgets earlier failures after a good answer', async () => {
    const h = harness((n) => (n % 3 === 0 ? okRun() : okRun({ exitCode: 1 })));
    for (let i = 0; i < 9; i += 1) await h.retrieve(request());
    expect(h.runs).toBe(9);
  });
});

describe('the real child', () => {
  const nodeSpec = (script: string): BatchSpec => ({ command: process.execPath, args: ['-e', script], env: { PATH: process.env.PATH ?? '' } });
  const signal = new AbortController().signal;

  it('leaves a log line with the length of 100 stderr characters and none of the characters', async () => {
    const script = "process.stderr.write('Q'.repeat(100)); process.exit(1);";
    const logs: string[] = [];
    const retrieve = createRetriever({
      run: (spec, input, options) => runBatchChild(nodeSpec(script), input, options),
      now: () => Date.now(),
      log: (line) => logs.push(line),
    });
    const result = await retrieve(request());
    expect(result.state).toBe('failed');
    const text = logs.join('\n');
    expect(text).toContain('stderr_chars=100');
    expect(text).not.toContain('QQQ');
  });

  it('reads one JSON object from stdout after one goes in on stdin', async () => {
    const script = "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>{const r=JSON.parse(s);process.stdout.write(JSON.stringify({version:1,queries:r.queries.map(()=>({ok:true,state:'ok',hits:[]})),attachments:[]}))})";
    const run = await runBatchChild(nodeSpec(script), JSON.stringify({ queries: [{}, {}] }), { timeoutMs: 5000, signal });
    expect(run.exitCode).toBe(0);
    expect(JSON.parse(run.stdout)).toEqual({ version: 1, queries: [{ ok: true, state: 'ok', hits: [] }, { ok: true, state: 'ok', hits: [] }], attachments: [] });
  });

  it('is killed at its time limit and when the turn is stopped', async () => {
    const hang = 'setInterval(()=>{},1000)';
    const timedOut = await runBatchChild(nodeSpec(hang), '{}', { timeoutMs: 150, signal });
    expect(timedOut.timedOut).toBe(true);
    const controller = new AbortController();
    const pending = runBatchChild(nodeSpec(hang), '{}', { timeoutMs: 5000, signal: controller.signal });
    setTimeout(() => controller.abort(), 100);
    const stopped = await pending;
    expect(stopped.timedOut).toBe(false);
    expect(stopped.exitCode).not.toBe(0);
    expect(RETRIEVE_TIMEOUT_MS).toBe(10_000);
  });

  it('reports a command that is not there as a start error', async () => {
    const run = await runBatchChild({ command: 'definitely-not-a-command-w77', args: [], env: {} }, '{}', { timeoutMs: 1000, signal });
    expect(run.startError).toBeDefined();
  });
});

describe('the merge', () => {
  const hit = (kind: Hit['kind'], id: number, similarity: number | null): Hit => hitFixture({ kind, unitId: id, similarity, documentId: kind === 'material' ? null : id, fileId: kind === 'material' ? id : null });
  const query = (...hits: Hit[]): QueryAnswer => ({ state: 'ok', hits });

  it('takes the queries in turn by rank, one row per id', () => {
    const merged = mergeHits([query(hit('material', 1, 0.9), hit('material', 2, 0.85)), query(hit('material', 3, 0.88), hit('material', 1, 0.84), hit('material', 4, 0.81))]);
    expect(merged.map((h) => h.unitId)).toEqual([1, 3, 2, 4]);
  });

  it('applies the 0.78 floor and puts keyword-only hits after the ones with a similarity', () => {
    const merged = mergeHits([query(hit('material', 1, null), hit('material', 2, 0.9), hit('material', 3, 0.7), hit('material', 4, 0.8))]);
    expect(merged.map((h) => h.unitId)).toEqual([2, 4, 1]);
  });

  it('gives 14 passages for 15 hits, and 3 remembered items', () => {
    const many = query(...Array.from({ length: 15 }, (_, i) => hit(i % 2 === 0 ? 'material' : 'upload', i + 1, 0.9 - i / 1000)));
    expect(mergeHits([many]).filter((h) => h.kind !== 'memory')).toHaveLength(14);
    const memories = query(...Array.from({ length: 6 }, (_, i) => hit('memory', 100 + i, 0.85)));
    expect(mergeHits([memories])).toHaveLength(3);
    const both = mergeHits([many, memories]);
    expect(both).toHaveLength(17);
    expect(both.slice(14).every((h) => h.kind === 'memory')).toBe(true);
  });

  it('treats a material and an upload with one id as two rows', () => {
    expect(mergeHits([query(hit('material', 7, 0.9), hit('upload', 7, 0.9))])).toHaveLength(2);
  });
});

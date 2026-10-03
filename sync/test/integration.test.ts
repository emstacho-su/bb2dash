// Task 12 (R-81, P-35): the whole runner on fakes. The scrubbed recorded crawl is replayed through a
// fake page into a fake database that answers the twelve functions by name, twice: two requests,
// two runner starts. Also the two other entry points, probe.js and enqueue.js.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { readFixture } from '../../db/fixtures/phase14/scrub_crawl.mjs';
import { CrawlError, runCrawl, type CrawlPage } from '../src/crawl.js';
import { createPgQuery, redactDsn, type PgClientLike, type QueryFn, type QueryResult } from '../src/db.js';
import { enqueueMain } from '../src/enqueue.js';
import { realDeps, startRunner, writeAtomic, type BrowserSession, type RunnerDeps } from '../src/main.js';
import { probeMain } from '../src/probe.js';
import type { RunnerConfig } from '../src/secrets.js';

// Playwright, replaced: the real wiring in main.ts is checked without a browser.
const { launches, requests } = vi.hoisted(() => ({
  launches: [] as { dir: string; options: Record<string, unknown> }[],
  requests: [] as { url: string; options: Record<string, unknown> }[],
}));
vi.mock('playwright', () => {
  const listeners: Record<string, () => void> = {};
  const page = {
    url: () => 'https://blackboard.syracuse.edu/ultra/',
    goto: vi.fn(async () => null),
    addScriptTag: vi.fn(async () => null),
    evaluate: vi.fn(async () => true),
  };
  const context = {
    pages: () => [page],
    newPage: async () => page,
    request: {
      get: vi.fn(async (url: string, options: Record<string, unknown>) => {
        requests.push({ url, options });
        return { status: () => (url.includes('users/me') ? 200 : 302), headers: () => ({ location: 'https://x.content.blackboardcdn.com/f' }) };
      }),
    },
    on: (event: string, cb: () => void) => {
      listeners[event] = cb;
    },
    close: vi.fn(async () => {
      listeners.close?.();
    }),
    fireClose: () => listeners.close?.(),
  };
  return {
    chromium: {
      launchPersistentContext: vi.fn(async (dir: string, options: Record<string, unknown>) => {
        launches.push({ dir, options });
        return context;
      }),
    },
  };
});

interface FixtureRow { kind: string; bb_course_id: string | null }
const FIXTURE = readFixture() as { rows: FixtureRow[] };
const PDF = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(3000, 0x41)]);
const CDN = 'https://x.content.blackboardcdn.com/f?sig=1';
const PASS_EVENTS = new Set(['claim', 'register', 'crawl', 'wait', 'files', 'embed', 'close']);

interface Req {
  id: number;
  kind: string;
  state: string;
  claimed_by: string | null;
  run_id: string | null;
  params: Record<string, unknown>;
  finished_at: Date | null;
  result: unknown;
  created_at: Date;
}

/** An in-memory stand-in for the twelve functions, close enough to 091 to drive the runner. */
class FakeDb {
  events: string[] = [];
  fns: string[] = [];
  requests: Req[] = [];
  runs = new Map<string, { id: number; status: string; summary: { changes: string[] } }>();
  bbRaw: { run_id: string; kind: string; bb_course_id: string | null }[] = [];
  files = [{ id: 901, stored: false }];
  stored: unknown[][] = [];
  private nextId = 500;

  insertRequest(params: Record<string, unknown>): number {
    this.nextId += 1;
    this.requests.push({ id: this.nextId, kind: 'sync', state: 'queued', claimed_by: null, run_id: null, params, finished_at: null, result: null, created_at: new Date() });
    return this.nextId;
  }

  private open(): Req | undefined {
    return this.requests.find((r) => r.state === 'queued' || r.state === 'claimed');
  }

  query: QueryFn = async (sql, params = []): Promise<QueryResult> => {
    const fn = /public\.(sync_\w+)\(/.exec(sql)?.[1] ?? 'other';
    this.fns.push(fn);
    const one = (row: Record<string, unknown>) => ({ rows: [row] });
    const req = (id: unknown) => this.requests.find((r) => String(r.id) === String(id));
    switch (fn) {
      case 'sync_sweep_stale':
      case 'sync_requeue_orphans':
        return one({ n: 0 });
      case 'sync_own_claims':
        return {
          rows: this.requests
            .filter((r) => r.state === 'claimed' && r.claimed_by === 'sync-runner')
            .map((r) => ({ id: String(r.id), run_id: r.run_id, claimed_at: r.created_at, claim_attempts: 1 })),
        };
      case 'sync_next': {
        const q = this.requests.find((r) => r.state === 'queued');
        return { rows: q ? [{ id: String(q.id), created_at: q.created_at, params: q.params }] : [] };
      }
      case 'sync_claim': {
        this.events.push('claim');
        const r = req(params[0]);
        if (!r || r.state !== 'queued') return one({ ok: false });
        Object.assign(r, { state: 'claimed', claimed_by: 'sync-runner' });
        return one({ ok: true });
      }
      case 'sync_register_run': {
        this.events.push('register');
        const r = req(params[0]);
        if (!r || r.state !== 'claimed' || r.run_id) return one({ ok: false });
        r.run_id = String(params[1]);
        this.runs.set(r.run_id, { id: 6000 + this.runs.size, status: 'running', summary: { changes: [] } });
        return one({ ok: true });
      }
      case 'sync_run_outcome': {
        this.events.push('wait');
        const run = this.runs.get(String(params[0]));
        if (!run) return { rows: [] };
        // The scheduled fold: a registered run folds once its calendar row has landed.
        if (run.status === 'running' && this.bbRaw.some((b) => b.run_id === params[0] && b.kind === 'calendar')) {
          run.status = 'ok';
          run.summary = { changes: ['fold line'] };
        }
        return one({ sync_run_id: String(run.id), status: run.status, summary: run.summary });
      }
      case 'sync_file_worklist':
        this.events.push('files');
        return { rows: this.files.filter((f) => !f.stored).map((f) => ({ id: String(f.id), file_name: 'Lecture 1.pdf', relpath: 'IST.323/lecture_slides/week-01/Lecture 1.pdf', mime: 'application/pdf', source_url: 'https://blackboard.syracuse.edu/bbcswebdav/xid-901_1', bucket: 'lecture_slides', attempt_id: null })) };
      case 'sync_file_stored': {
        this.stored.push([...params]);
        const f = this.files.find((x) => String(x.id) === String(params[0]));
        if (!f || f.stored) return one({ ok: false });
        f.stored = true;
        return one({ ok: true });
      }
      case 'sync_close': {
        this.events.push('close');
        const r = req(params[0])!;
        const report = JSON.parse(String(params[2])) as { lines: string[] };
        Object.assign(r, { state: params[1], finished_at: new Date(), result: report });
        const run = r.run_id ? this.runs.get(r.run_id) : undefined;
        if (run) run.summary = { changes: [...run.summary.changes, ...report.lines] };
        return { rows: [] };
      }
      case 'sync_enqueue': {
        const open = this.open();
        if (open) return one({ id: String(open.id) });
        const doneToday = this.requests.some((r) => r.state === 'done' && r.finished_at);
        if (params[0] === 'login' && doneToday) return one({ id: null });
        return one({ id: String(this.insertRequest({ trigger: params[0] })) });
      }
      case 'sync_login_ok':
        return one({ n: 0 });
      case 'sync_login_required':
        return one({ id: '77' });
      default:
        throw new Error(`fake db: unexpected SQL ${sql}`);
    }
  };
}

function fakeBrowser(db: FakeDb): BrowserSession {
  const url = 'https://blackboard.syracuse.edu/ultra/stream';
  return {
    login: { currentUrl: () => url, goto: async () => {}, probe: async () => ({ status: 200, location: null }) },
    crawlPage: {
      currentUrl: () => url,
      goto: async () => {},
      addScriptTag: async () => {},
      evaluateScript: async () => {},
      evaluate: (async (fn: { name: string }, arg: { runId: string }) => {
        if (fn.name === 'crawlerInstalled') return true;
        db.events.push('crawl');
        // runAll replayed: the recorded rows land in bb_raw under the registered run, calendar last.
        const log = FIXTURE.rows.map((row) => {
          const dup = db.bbRaw.some((b) => b.run_id === arg.runId && b.kind === row.kind && b.bb_course_id === row.bb_course_id);
          if (!dup) db.bbRaw.push({ run_id: arg.runId, kind: row.kind, bb_course_id: row.bb_course_id });
          return [row.bb_course_id ?? row.kind, dup ? 409 : 201];
        });
        return { run_id: arg.runId, log };
      }) as BrowserSession['crawlPage']['evaluate'],
    },
    hop: async () => ({ status: 302, headers: { location: CDN } }),
    close: async () => {},
    onUnexpectedClose: () => {},
  };
}

function deps(db: FakeDb, state: Map<string, string>, tmp: string): RunnerDeps {
  const config: RunnerConfig = {
    dbUrl: 'postgresql://x', anonKey: 'sb_publishable_x', anonJwt: 'eyJ.x.y', supabaseUrl: 'https://p.supabase.co',
    keepaliveMinutes: 20, repoRoot: tmp, profileDir: `${tmp}/profile`, courseFilesDir: `${tmp}/course context`,
    stateDir: `${tmp}/state`, tmpDir: `${tmp}/dl`,
  };
  const query = Object.assign(db.query, { end: async () => {} });
  return {
    config,
    query,
    openBrowser: async () => fakeBrowser(db),
    fetchImpl: (async (u: string) => (u === CDN ? new Response(PDF) : new Response('{}', { status: 201 }))) as unknown as typeof fetch,
    extract: async () => [{ unit_kind: 'page', unit_no: 1, text: 'hello' }],
    embed: async () => {
      db.events.push('embed');
      return { code: 0, tail: 'remaining_parts=0' };
    },
    readSource: async () => '',
    writeState: async (name, text) => {
      state.set(name, text);
    },
    log: () => {},
    sleep: () => new Promise((r) => setImmediate(r)),
    random: () => 0.5,
  };
}

async function until(cond: () => boolean, what: string): Promise<void> {
  for (let i = 0; i < 5000; i += 1) {
    if (cond()) return;
    await new Promise((r) => setImmediate(r));
  }
  throw new Error(`timed out waiting for ${what}`);
}

function passOrder(events: string[]): string[] {
  return events.filter((e) => PASS_EVENTS.has(e)).filter((e, i, a) => !(e === 'wait' && a[i - 1] === 'wait'));
}

describe('the runner end to end, on fakes', () => {
  it('replays the recorded crawl twice: one request per runner start, in the frozen call order', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'w55-int-'));
    const db = new FakeDb();
    const state = new Map<string, string>();
    try {
      const first = db.insertRequest({});
      const runner = startRunner(deps(db, state, tmp));
      await until(() => db.requests.find((r) => r.id === first)?.state === 'done', 'the first request to close');

      expect(passOrder(db.events)).toEqual(['claim', 'register', 'crawl', 'wait', 'files', 'embed', 'close']);
      const runA = db.requests.find((r) => r.id === first)!.run_id!;
      expect(runA).toMatch(/^[0-9a-f-]{36}$/);
      expect(db.bbRaw.filter((b) => b.run_id === runA)).toHaveLength(9);
      expect(db.runs.get(runA)!.summary.changes).toEqual(['fold line', 'Files: 1 pulled']);
      expect(db.requests.find((r) => r.id === first)!.result).toMatchObject({ lines: ['Files: 1 pulled'], error: null, files: { pulled: 1, not_pulled: [] }, claim_attempts: 1 });

      // The next pass finds the request done: it reads the queue and calls nothing after sync_next().
      const eventsBefore = db.events.length;
      const nextsBefore = db.fns.filter((f) => f === 'sync_next').length;
      await until(() => db.fns.filter((f) => f === 'sync_next').length >= nextsBefore + 2, 'two more passes');
      await runner.stop();
      expect(db.events.slice(eventsBefore).filter((e) => PASS_EVENTS.has(e))).toEqual([]);
      const lastNext = db.fns.lastIndexOf('sync_next');
      expect(db.fns.slice(lastNext + 1).filter((f) => !['sync_sweep_stale', 'sync_next', 'sync_login_ok', 'sync_enqueue'].includes(f))).toEqual([]);

      // The heartbeat and the last probe were written for probe.js and the healthcheck.
      expect(state.get('heartbeat')).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(JSON.parse(state.get('login')!)).toMatchObject({ status: 200, verdict: 'alive' });

      // `just sync-now`, then a restart: the second replay lands under a new run id.
      const out: string[] = [];
      expect(await enqueueMain([], { query: Object.assign(db.query, { end: async () => {} }), out: (l) => out.push(l) })).toBe(0);
      const second = db.requests.find((r) => r.state === 'queued')!;
      expect(second.params).toEqual({ trigger: 'just' });
      expect(out).toEqual([`sync_enqueue('just') -> request ${second.id}`]);

      db.events.length = 0;
      const again = startRunner(deps(db, state, tmp));
      await until(() => second.state === 'done', 'the second request to close');
      await again.stop();
      expect(passOrder(db.events)).toEqual(['claim', 'register', 'crawl', 'wait', 'files', 'close']);
      expect(second.run_id).not.toBe(runA);
      expect(db.bbRaw.filter((b) => b.run_id === second.run_id)).toHaveLength(9);
      expect(db.bbRaw).toHaveLength(18);
      expect(second.result).toMatchObject({ lines: ['Files: nothing new to pull'] });
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('a runner whose browser will not open ends, and says why', async () => {
    const db = new FakeDb();
    const lines: string[] = [];
    const d = { ...deps(db, new Map(), '/nowhere'), openBrowser: async () => { throw new Error('Failed to launch chromium'); }, log: (l: string) => lines.push(l) };
    const runner = startRunner(d);
    await expect(runner.done).rejects.toThrow('Failed to launch chromium');
    expect(db.fns).toContain('sync_requeue_orphans');
  });
});

describe('probe.js', () => {
  const at = '2026-10-03T21:00:00.000Z';
  const read = (map: Record<string, string>) => (p: string) => map[p.replace(/\\/g, '/')] ?? null;

  it('prints users/me <status> <time> from the state file: exit 0 on 200, 3 otherwise', async () => {
    const out: string[] = [];
    expect(await probeMain([], { stateDir: '/s', readFile: read({ '/s/login.json': JSON.stringify({ status: 200, verdict: 'alive', at }) }), out: (l) => out.push(l), now: () => new Date(at) })).toBe(0);
    expect(await probeMain([], { stateDir: '/s', readFile: read({ '/s/login.json': JSON.stringify({ status: 401, verdict: 'dead', at }) }), out: (l) => out.push(l), now: () => new Date(at) })).toBe(3);
    expect(await probeMain([], { stateDir: '/s', readFile: read({}), out: (l) => out.push(l), now: () => new Date(at) })).toBe(3);
    expect(await probeMain([], { stateDir: '/s', readFile: read({ '/s/login.json': 'not json' }), out: (l) => out.push(l), now: () => new Date(at) })).toBe(3);
    expect(out).toEqual([`users/me 200 ${at}`, `users/me 401 ${at}`, `users/me none ${at}`, `users/me none ${at}`]);
  });

  it('--heartbeat: 0 while the heartbeat is fresh, 1 when stale or missing (the compose healthcheck)', async () => {
    const now = () => new Date('2026-10-03T21:05:00.000Z');
    const out: string[] = [];
    expect(await probeMain(['--heartbeat'], { stateDir: '/s', readFile: read({ '/s/heartbeat': '2026-10-03T21:04:30.000Z' }), out: (l) => out.push(l), now })).toBe(0);
    expect(await probeMain(['--heartbeat'], { stateDir: '/s', readFile: read({ '/s/heartbeat': '2026-10-03T20:55:00.000Z' }), out: (l) => out.push(l), now })).toBe(1);
    expect(await probeMain(['--heartbeat'], { stateDir: '/s', readFile: read({}), out: (l) => out.push(l), now })).toBe(1);
  });
});

describe('enqueue.js', () => {
  it('prints the open request\'s id when one is open, and never a second row', async () => {
    const db = new FakeDb();
    const open = db.insertRequest({});
    const out: string[] = [];
    expect(await enqueueMain([], { query: Object.assign(db.query, { end: async () => {} }), out: (l) => out.push(l) })).toBe(0);
    expect(out).toEqual([`sync_enqueue('just') -> request ${open}`]);
    expect(db.requests).toHaveLength(1);
  });

  it('a database error is exit 2 with the DSN redacted', async () => {
    const out: string[] = [];
    const query = Object.assign(vi.fn(async () => { throw new Error('connect ECONNREFUSED aws-0-us-east-1.pooler.supabase.com:5432'); }), { end: async () => {} });
    const code = await enqueueMain([], { query, out: (l) => out.push(l), dsn: 'postgresql://u:p4ss@aws-0-us-east-1.pooler.supabase.com:5432/postgres' });
    expect(code).toBe(2);
    expect(out[0]).toMatch(/^enqueue: /);
    expect(out[0]).not.toContain('pooler.supabase.com');
  });

  it('a missing credential is exit 2 and names the variable', async () => {
    const out: string[] = [];
    expect(await enqueueMain([], { env: {}, readFile: () => null, out: (l) => out.push(l) })).toBe(2);
    expect(out[0]).toMatch(/SYNC_RUNNER_DB_URL/);
  });

  it('with an unreadable credential file it exits 2 and names the variable', async () => {
    const out: string[] = [];
    expect(await enqueueMain([], { env: { SYNC_RUNNER_DB_URL_FILE: path.join(os.tmpdir(), 'w55-missing-secret') }, out: (l) => out.push(l) })).toBe(2);
    expect(out[0]).toBe('enqueue: SYNC_RUNNER_DB_URL_FILE names a file that cannot be read');
  });
});

describe('the pg adapter', () => {
  const DSN = 'postgresql://sync_runner.goultdzqcavefcgnifdy:pw-s3cret@aws-0-us-east-1.pooler.supabase.com:5432/postgres?sslmode=require';

  function fakeClient(script: { connect?: () => Promise<void>; query?: (sql: string) => Promise<QueryResult> }) {
    const made: PgClientLike[] = [];
    const ended: number[] = [];
    const newClient = () => {
      const n = made.length;
      const run = script.query ?? (async () => ({ rows: [{ ok: true }] }));
      const c: PgClientLike = {
        connect: script.connect ?? (async () => {}),
        query: async (sql: string) => (sql.includes('current_user') ? { rows: [{ role: 'sync_runner' }] } : run(sql)),
        end: async () => {
          ended.push(n);
        },
        on: () => {},
      };
      made.push(c);
      return c;
    };
    return { newClient, made, ended };
  }

  it('connects once and logs one line per connect naming the role, never the DSN', async () => {
    const lines: string[] = [];
    const f = fakeClient({});
    const q = createPgQuery({ dsn: DSN, log: (l) => lines.push(l), newClient: f.newClient, now: () => new Date('2026-10-03T22:00:00Z') });
    await q('select 1');
    await q('select 2');
    expect(f.made).toHaveLength(1);
    expect(lines).toEqual(['db: connected as sync_runner 2026-10-03T22:00:00.000Z']);
    await q.end();
    expect(f.ended).toEqual([0]);
  });

  it('a broken connection is dropped and the next call reconnects; a SQLSTATE refusal keeps it', async () => {
    let fail: 'socket' | 'sql' | null = 'socket';
    const f = fakeClient({
      query: async () => {
        if (fail === 'socket') {
          fail = 'sql';
          throw new Error('read ECONNRESET aws-0-us-east-1.pooler.supabase.com pw-s3cret');
        }
        if (fail === 'sql') {
          fail = null;
          throw Object.assign(new Error('sync_close: refusing done -> done'), { code: '22023' });
        }
        return { rows: [] };
      },
    });
    const q = createPgQuery({ dsn: DSN, log: () => {}, newClient: f.newClient });
    const first = await q('select x').catch((e: Error) => e);
    expect(String(first)).not.toContain('pw-s3cret');
    expect(String(first)).not.toContain('pooler.supabase.com');
    const second = await q('select y').catch((e: Error) => e);
    expect((second as { code?: string }).code).toBe('22023');
    await q('select z');
    expect(f.made).toHaveLength(2);
  });

  it.each(['08006', '08003', '57P01', '57P03', 'XX000'])('R2 item 8: SQLSTATE %s is connection-class: the client is dropped and the next call reconnects', async (code) => {
    let first = true;
    const f = fakeClient({
      query: async () => {
        if (first) {
          first = false;
          throw Object.assign(new Error('terminating connection'), { code });
        }
        return { rows: [] };
      },
    });
    const q = createPgQuery({ dsn: DSN, log: () => {}, newClient: f.newClient });
    await expect(q('select 1')).rejects.toMatchObject({ code });
    await q('select 2');
    expect(f.made).toHaveLength(2);
    expect(f.ended).toContain(0);
  });

  it('a failed connect is closed and reported, and the next call tries again', async () => {
    let attempts = 0;
    const f = fakeClient({
      connect: async () => {
        attempts += 1;
        if (attempts === 1) throw new Error('password authentication failed');
      },
    });
    const q = createPgQuery({ dsn: DSN, log: () => {}, newClient: f.newClient });
    await expect(q('select 1')).rejects.toThrow('password authentication failed');
    await q('select 1');
    expect(f.ended).toContain(0);
    expect(f.made).toHaveLength(2);
  });

  it('redactDsn removes the DSN, its password and its host', () => {
    expect(redactDsn(`a ${DSN} b pw-s3cret c aws-0-us-east-1.pooler.supabase.com`, DSN)).toBe('a <redacted> b <redacted> c <redacted>');
    expect(redactDsn('nothing', null)).toBe('nothing');
  });
});

describe('runCrawl', () => {
  const RUN = '00000000-1491-4000-8000-0000000000bb';
  function page(over: { installed?: boolean[]; result?: unknown; url?: string } = {}) {
    const installed = [...(over.installed ?? [true])];
    const calls: string[] = [];
    const p: CrawlPage = {
      currentUrl: () => over.url ?? 'https://blackboard.syracuse.edu/ultra/stream',
      goto: async (u) => {
        calls.push(`goto ${u}`);
      },
      addScriptTag: async (f) => {
        calls.push(`tag ${f}`);
      },
      evaluateScript: async () => {
        calls.push('script');
      },
      evaluate: (async (fn: { name: string }) => {
        if (fn.name === 'crawlerInstalled') return installed.length > 1 ? installed.shift() : installed[0];
        calls.push('runAll');
        return over.result ?? { run_id: RUN, log: [['memberships', 201], ['IST.323', 201], ['calendar', 201]] };
      }) as CrawlPage['evaluate'],
    };
    return { p, calls };
  }
  const opts = {
    runId: RUN,
    supabaseUrl: 'https://p.supabase.co',
    anonKey: 'sb_publishable_x',
    crawlerPath: '/app/ingest/bb_crawler.js',
    readSource: async () => 'function installCrawler(){}',
    log: () => {},
  };

  it('injects the crawler and runs runAll under the registered run id', async () => {
    const { p, calls } = page();
    expect(await runCrawl(p, opts)).toEqual({ runId: RUN, posts: [['memberships', 201], ['IST.323', 201], ['calendar', 201]] });
    expect(calls).toEqual(['tag /app/ingest/bb_crawler.js', 'runAll']);
  });

  it('goes back to Ultra first when the tab is elsewhere, and evaluates the source when the tag is blocked', async () => {
    const { p, calls } = page({ url: 'about:blank', installed: [false, true] });
    await runCrawl(p, opts);
    expect(calls).toEqual(['goto https://blackboard.syracuse.edu/ultra/', 'tag /app/ingest/bb_crawler.js', 'script', 'runAll']);
  });

  it('throws a CrawlError when the crawler will not install, a post failed, the run id differs, or no calendar row landed', async () => {
    await expect(runCrawl(page({ installed: [false] }).p, opts)).rejects.toThrow(CrawlError);
    await expect(runCrawl(page({ result: { run_id: RUN, log: [['IST.323', 401], ['calendar', 201]] } }).p, opts)).rejects.toThrow(/refused 1 post/);
    await expect(runCrawl(page({ result: { run_id: 'other', log: [] } }).p, opts)).rejects.toThrow(/not the registered/);
    await expect(runCrawl(page({ result: { run_id: RUN, log: [['IST.323', 201]] } }).p, opts)).rejects.toThrow(/no calendar row/);
  });
});

describe('writeAtomic (R2-1)', () => {
  it('concurrent writes to the same file all succeed and leave valid JSON', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'w55-atomic-'));
    try {
      const file = path.join(tmp, 'state', 'login.json');
      // Startup writes the heartbeat twice at once; many concurrent writes make the race certain.
      const results = await Promise.allSettled(
        Array.from({ length: 20 }, (_, n) => writeAtomic(file, JSON.stringify({ status: 200, n }))),
      );
      expect(results.filter((r) => r.status === 'rejected')).toEqual([]);
      expect(JSON.parse(fs.readFileSync(file, 'utf8'))).toMatchObject({ status: 200 });
      expect(fs.readdirSync(path.dirname(file))).toEqual(['login.json']);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe('the real wiring (Playwright mocked)', () => {
  const jwt = `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ role: 'anon' })).toString('base64url')}.sig`;

  it('launches the persistent profile headful with the Chromium sandbox on, and probes users/me without following redirects', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'w55-real-'));
    try {
      const d = realDeps({
        SYNC_RUNNER_DB_URL: 'postgresql://u:p@localhost:5432/postgres?sslmode=require',
        SB_ANON_KEY: 'sb_publishable_x',
        SB_ANON_JWT: jwt,
        BB_PROFILE_DIR: path.join(tmp, 'profile'),
        SYNC_STATE_DIR: path.join(tmp, 'state'),
      });
      expect(d.config.profileDir).toBe(path.join(tmp, 'profile'));

      await d.writeState('heartbeat', '2026-10-03T22:00:00.000Z');
      expect(fs.readFileSync(path.join(tmp, 'state', 'heartbeat'), 'utf8')).toBe('2026-10-03T22:00:00.000Z');
      expect(await probeMain(['--heartbeat'], { stateDir: path.join(tmp, 'state'), out: () => {}, now: () => new Date('2026-10-03T22:00:30.000Z') })).toBe(0);

      const session = await d.openBrowser();
      expect(launches.at(-1)).toEqual({
        dir: path.join(tmp, 'profile'),
        options: expect.objectContaining({ headless: false, chromiumSandbox: true }),
      });
      expect(await session.login.probe()).toEqual({ status: 200, location: 'https://x.content.blackboardcdn.com/f' });
      expect(requests.at(-1)).toEqual({
        url: 'https://blackboard.syracuse.edu/learn/api/public/v1/users/me',
        options: expect.objectContaining({ maxRedirects: 0 }),
      });
      expect(await session.hop('https://blackboard.syracuse.edu/bbcswebdav/xid-1_1')).toMatchObject({ status: 302 });
      expect(requests.at(-1)!.options).toMatchObject({ maxRedirects: 0 });
      expect(session.login.currentUrl()).toBe('https://blackboard.syracuse.edu/ultra/');
      await session.login.goto('https://blackboard.syracuse.edu/ultra/stream');
      await session.crawlPage.addScriptTag('/app/ingest/bb_crawler.js');
      await session.crawlPage.evaluateScript('1');
      expect(await session.crawlPage.evaluate(() => true, null)).toBe(true);

      const closed = vi.fn();
      session.onUnexpectedClose(closed);
      await session.close();
      expect(closed).not.toHaveBeenCalled();
      expect(await d.readSource(path.join(tmp, 'state', 'heartbeat'))).toBe('2026-10-03T22:00:00.000Z');
      await d.query.end();
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});

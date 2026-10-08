// @vitest-environment node

/**
 * What Phase 22's walk specs share (`e2e/walk22.lib.ts`; brief 103, task 0), the part that needs
 * no browser.
 *
 * What is held here: a shot is written only when `WALK_SHOTS=1`, under `WALK_SHOT_DIR`, by a bare
 * name, and never into a git checkout; every RPC the app calls is a write unless it is on the read
 * list, and `mark_announcements_seen` is answered without reaching the database; a file write to
 * Storage and a sign-out are stopped too; and `quietSync` pins the Sync button's label by handing
 * the app rows that its own `syncPhase()` reads as the phase asked for.
 *
 * The route handlers are driven through a stand-in for Playwright's context that runs them the way
 * Playwright does: the handler registered last sees a request first, and one that falls back hands
 * it to the one before.
 */

import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { BrowserContext } from '@playwright/test';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PHASE_LABEL, syncPhase, type PhaseRequest, type PhaseRun } from '@/lib/sync-request-phase';
import {
  LONGEST_SYNC_PHASE_22,
  QUIET_REQUEST_ID,
  QUIET_RUN_ID,
  READ_RPCS,
  SYNC_LABEL_22,
  SYNC_PHASES_22,
  guardVerdict,
  guardWrites22,
  quietSync,
  quietSyncAnswer,
  rpcNameOf,
  rpcVerdict,
  shotPath22,
  shotPathFrom,
  shotsAsked,
  shotsAsked22,
  type SyncPhase22,
} from '../e2e/walk22.lib';

const API = 'https://project.supabase.example';
const REST = `${API}/rest/v1`;
const NOW = new Date('2026-10-08T12:00:00.000Z');

const made: string[] = [];
function scratch(): string {
  const dir = realpathSync.native(mkdtempSync(join(tmpdir(), 'bb2dash-walk22-test-')));
  made.push(dir);
  return dir;
}

afterEach(() => {
  vi.unstubAllEnvs();
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/* ---------------------------------------------------------------------------
 * Shots
 * ------------------------------------------------------------------------ */

describe('where a shot goes', () => {
  const CHECKOUT = resolve('/checkouts/bb2dash');

  it('is asked for only when WALK_SHOTS is exactly 1', () => {
    expect(shotsAsked({})).toBe(false);
    expect(shotsAsked({ WALK_SHOTS: '0' })).toBe(false);
    expect(shotsAsked({ WALK_SHOTS: 'true' })).toBe(false);
    expect(shotsAsked({ WALK_SHOTS: '1' })).toBe(true);
  });

  it('is a bare name under WALK_SHOT_DIR', () => {
    const out = scratch();
    expect(shotPathFrom({ WALK_SHOTS: '1', WALK_SHOT_DIR: out }, CHECKOUT, '01-home-dark.png')).toBe(join(out, '01-home-dark.png'));
    // A folder that is not made yet is taken: Playwright makes it when it writes the file.
    const later = join(out, 'shots');
    expect(shotPathFrom({ WALK_SHOTS: '1', WALK_SHOT_DIR: later }, CHECKOUT, '30_wizard.light.png')).toBe(join(later, '30_wizard.light.png'));
  });

  it('is refused unless shots were asked for, whatever else is set', () => {
    const out = scratch();
    expect(() => shotPathFrom({ WALK_SHOT_DIR: out }, CHECKOUT, 'a.png')).toThrow(/WALK_SHOTS=1/);
    expect(() => shotPathFrom({ WALK_SHOTS: '0', WALK_SHOT_DIR: out }, CHECKOUT, 'a.png')).toThrow(/WALK_SHOTS=1/);
  });

  it('is refused without a folder, or with one that is not absolute', () => {
    expect(() => shotPathFrom({ WALK_SHOTS: '1' }, CHECKOUT, 'a.png')).toThrow(/WALK_SHOT_DIR is not set/);
    expect(() => shotPathFrom({ WALK_SHOTS: '1', WALK_SHOT_DIR: '' }, CHECKOUT, 'a.png')).toThrow(/WALK_SHOT_DIR is not set/);
    expect(() => shotPathFrom({ WALK_SHOTS: '1', WALK_SHOT_DIR: 'shots' }, CHECKOUT, 'a.png')).toThrow(/absolute/);
    expect(() => shotPathFrom({ WALK_SHOTS: '1', WALK_SHOT_DIR: './shots' }, CHECKOUT, 'a.png')).toThrow(/absolute/);
  });

  it('is refused inside the checkout the spec runs from, with or without a .git there', () => {
    // In the walk box the checkout is a copy with no .git: the folder alone decides.
    const checkout = scratch();
    for (const dir of [checkout, join(checkout, 'docs', 'walks', 'walk-22'), join(checkout, 'web', 'e2e', '.results')]) {
      expect(() => shotPathFrom({ WALK_SHOTS: '1', WALK_SHOT_DIR: dir }, checkout, 'a.png')).toThrow(/git checkout/);
    }
  });

  it('is refused inside any other git checkout: a repository or a worktree, at any depth', () => {
    const repository = scratch();
    mkdirSync(join(repository, '.git'));
    const worktree = scratch();
    writeFileSync(join(worktree, '.git'), 'gitdir: somewhere/else\n');
    for (const other of [repository, worktree]) {
      expect(() => shotPathFrom({ WALK_SHOTS: '1', WALK_SHOT_DIR: other }, CHECKOUT, 'a.png')).toThrow(/git checkout/);
      expect(() => shotPathFrom({ WALK_SHOTS: '1', WALK_SHOT_DIR: join(other, 'a', 'b') }, CHECKOUT, 'a.png')).toThrow(/git checkout/);
    }
  });

  it('is refused when a link leads into a checkout', () => {
    const checkout = scratch();
    mkdirSync(join(checkout, 'shots'));
    const outside = scratch();
    const link = join(outside, 'walk-out');
    // A junction on Windows needs no privilege; elsewhere it is a plain symlink.
    symlinkSync(join(checkout, 'shots'), link, 'junction');
    expect(() => shotPathFrom({ WALK_SHOTS: '1', WALK_SHOT_DIR: link }, checkout, 'a.png')).toThrow(/git checkout/);
    expect(() => shotPathFrom({ WALK_SHOTS: '1', WALK_SHOT_DIR: join(link, '22') }, checkout, 'a.png')).toThrow(/git checkout/);
  });

  it('takes a bare .png name and nothing that could leave the folder', () => {
    const env = { WALK_SHOTS: '1', WALK_SHOT_DIR: scratch() };
    for (const name of ['', 'a', 'a.jpg', '../a.png', 'a/b.png', 'a\\b.png', '.hidden.png', '-a.png', 'a b.png', 'C:a.png']) {
      expect(() => shotPathFrom(env, CHECKOUT, name), name).toThrow(/bare \.png file name/);
    }
  });

  it('shotPath22 reads the environment, and its checkout is the one this file is in', () => {
    const out = scratch();
    vi.stubEnv('WALK_SHOTS', '1');
    vi.stubEnv('WALK_SHOT_DIR', out);
    expect(shotsAsked22()).toBe(true);
    expect(shotPath22('01-home-dark.png')).toBe(join(out, '01-home-dark.png'));
    // web/e2e/.results is gitignored, and still inside this checkout.
    vi.stubEnv('WALK_SHOT_DIR', resolve(__dirname, '..', 'e2e', '.results'));
    expect(() => shotPath22('01-home-dark.png')).toThrow(/git checkout/);
    vi.stubEnv('WALK_SHOTS', '0');
    expect(shotsAsked22()).toBe(false);
    expect(() => shotPath22('01-home-dark.png')).toThrow(/WALK_SHOTS=1/);
  });
});

/* ---------------------------------------------------------------------------
 * The write guard: the decision
 * ------------------------------------------------------------------------ */

/** Every RPC `web/src` calls on 2026-10-08 (`grep "rpc("`), and the one the brief names beside them. */
const WRITE_RPCS = [
  'workspace_ask',
  'workspace_cancel',
  'sync_enqueue',
  'planner_series_create',
  'planner_series_update',
  'planner_series_delete',
];

describe('the RPC allowlist', () => {
  it('reads the function name out of an RPC address, and nothing out of any other', () => {
    expect(rpcNameOf(`${REST}/rpc/workspace_ask`)).toBe('workspace_ask');
    expect(rpcNameOf(`${REST}/rpc/search_file_text?q=late%20work`)).toBe('search_file_text');
    expect(rpcNameOf(`${REST}/rpc/`)).toBeNull();
    expect(rpcNameOf(`${REST}/rpc/a/b`)).toBeNull();
    expect(rpcNameOf(`${REST}/assignments?select=id`)).toBeNull();
    expect(rpcNameOf(`${REST}/rpc_log?select=id`)).toBeNull();
    expect(rpcNameOf(`${API}/functions/v1/search`)).toBeNull();
    expect(rpcNameOf('not an address')).toBeNull();
  });

  it('holds the search functions and nothing else', () => {
    expect([...READ_RPCS].sort()).toEqual(['hybrid_search_file_text', 'match_file_text', 'search_file_text']);
    for (const name of READ_RPCS) expect(rpcVerdict(name), name).toBe('pass');
  });

  it('stops every write the app can make through an RPC', () => {
    for (const name of WRITE_RPCS) expect(rpcVerdict(name), name).toBe('abort');
    expect(rpcVerdict('planner_series_anything_new')).toBe('abort');
  });

  it('stops an RPC nobody has listed: what is not known to read is taken to write', () => {
    for (const name of ['run_transform', 'apply_resolutions', 'sync_claim', 'some_new_function', '']) {
      expect(rpcVerdict(name), name).toBe('abort');
    }
    // A name that only looks like a read is not one.
    expect(rpcVerdict('search_file_text_and_log')).toBe('abort');
    expect(rpcVerdict('SEARCH_FILE_TEXT')).toBe('abort');
  });

  it('answers mark_announcements_seen itself', () => {
    expect(rpcVerdict('mark_announcements_seen')).toBe('answer_seen');
  });
});

describe('what the guard does with a request', () => {
  it('decides an RPC by its name, whatever the method, and lets a preflight through', () => {
    expect(guardVerdict('POST', `${REST}/rpc/workspace_ask`)).toBe('abort');
    expect(guardVerdict('GET', `${REST}/rpc/planner_series_delete?p_series_id=1`)).toBe('abort');
    expect(guardVerdict('POST', `${REST}/rpc/hybrid_search_file_text`)).toBe('pass');
    expect(guardVerdict('POST', `${REST}/rpc/mark_announcements_seen`)).toBe('answer_seen');
    // Aborting a preflight would stop the write and leave no record of it.
    expect(guardVerdict('OPTIONS', `${REST}/rpc/workspace_ask`)).toBe('pass');
    expect(guardVerdict('OPTIONS', `${REST}/rpc/mark_announcements_seen`)).toBe('pass');
    // An address under rpc/ that names no one function is not let through as "not an RPC".
    expect(guardVerdict('POST', `${REST}/rpc/`)).toBe('abort');
    expect(guardVerdict('POST', `${REST}/rpc/a/b`)).toBe('abort');
  });

  it('stops a file write to Storage, and passes a read and a signed link for one', () => {
    const object = `${API}/storage/v1/object`;
    expect(guardVerdict('POST', `${object}/bb-files/submissions/IST.471/a1/draft.pdf`)).toBe('abort');
    expect(guardVerdict('PUT', `${object}/bb-files/submissions/IST.471/a1/draft.pdf`)).toBe('abort');
    expect(guardVerdict('DELETE', `${object}/bb-files`)).toBe('abort');
    expect(guardVerdict('POST', `${object}/upload/sign/bb-files/a.pdf`)).toBe('abort');
    expect(guardVerdict('POST', `${object}/move`)).toBe('abort');
    expect(guardVerdict('POST', `${object}/sign/bb-files/IST.323/syllabus.pdf`)).toBe('pass');
    expect(guardVerdict('GET', `${object}/sign/bb-files/IST.323/syllabus.pdf?token=abc`)).toBe('pass');
    expect(guardVerdict('HEAD', `${object}/bb-files/a.pdf`)).toBe('pass');
    expect(guardVerdict('OPTIONS', `${object}/bb-files/a.pdf`)).toBe('pass');
  });

  it('stops a sign-out, which would end every session of the owner, and passes the session refresh', () => {
    expect(guardVerdict('POST', `${API}/auth/v1/logout?scope=global`)).toBe('abort');
    expect(guardVerdict('POST', `${API}/auth/v1/logout`)).toBe('abort');
    expect(guardVerdict('POST', `${API}/auth/v1/token?grant_type=refresh_token`)).toBe('pass');
    expect(guardVerdict('GET', `${API}/auth/v1/user`)).toBe('pass');
  });

  it('leaves tables to walk.ts, and everything else alone', () => {
    expect(guardVerdict('POST', `${REST}/assignment_progress`)).toBe('pass');
    expect(guardVerdict('GET', `${REST}/assignments?select=id`)).toBe('pass');
    expect(guardVerdict('POST', `${API}/functions/v1/search`)).toBe('pass');
    expect(guardVerdict('GET', 'http://localhost:3000/inbox')).toBe('pass');
  });
});

/* ---------------------------------------------------------------------------
 * A stand-in for Playwright's context
 * ------------------------------------------------------------------------ */

type Matcher = string | RegExp | ((url: URL) => boolean);

type Outcome =
  | { kind: 'network' }
  | { kind: 'abort'; code: string | undefined }
  | { kind: 'answer'; status: number; contentType: string | undefined; body: string };

interface FakeRoute {
  request(): { method(): string; url(): string; postData(): string | null };
  abort(code?: string): Promise<void>;
  fulfill(response: { status?: number; contentType?: string; body?: string }): Promise<void>;
  fallback(): Promise<void>;
}

/** Playwright's glob, as far as walk.ts uses it: `**` is anything, `*` anything but a slash. */
function globToRegExp(glob: string): RegExp {
  const escaped = glob.replace(/[.+^${}()|[\]\\?]/g, '\\$&');
  return new RegExp(`^${escaped.replace(/\*\*/g, '\u0000').replace(/\*/g, '[^/]*').replace(/\u0000/g, '.*')}$`);
}

function matches(matcher: Matcher, url: string): boolean {
  if (typeof matcher === 'string') return globToRegExp(matcher).test(url);
  if (matcher instanceof RegExp) return matcher.test(url);
  return matcher(new URL(url));
}

function fakeContext() {
  const routes: { matcher: Matcher; handler: (route: FakeRoute) => Promise<void> | void }[] = [];
  const context = {
    route: async (matcher: Matcher, handler: (route: FakeRoute) => Promise<void> | void) => {
      routes.push({ matcher, handler });
    },
  };

  /** One request through the handlers, last registered first. Returns what became of it. */
  async function send(method: string, url: string, postData: string | null = null): Promise<Outcome> {
    for (const { matcher, handler } of [...routes].reverse()) {
      if (!matches(matcher, url)) continue;
      const seen: { outcome: Outcome | null; fellBack: boolean } = { outcome: null, fellBack: false };
      await handler({
        request: () => ({ method: () => method, url: () => url, postData: () => postData }),
        abort: async (code) => {
          seen.outcome = { kind: 'abort', code };
        },
        fulfill: async (response) => {
          seen.outcome = { kind: 'answer', status: response.status ?? 200, contentType: response.contentType, body: response.body ?? '' };
        },
        fallback: async () => {
          seen.fellBack = true;
        },
      });
      if (seen.outcome !== null) return seen.outcome;
      if (!seen.fellBack) throw new Error(`a handler neither answered nor fell back: ${method} ${url}`);
    }
    return { kind: 'network' };
  }

  return { context: context as unknown as BrowserContext, send };
}

const NETWORK: Outcome = { kind: 'network' };
const ABORTED: Outcome = { kind: 'abort', code: 'blockedbyclient' };

/* ---------------------------------------------------------------------------
 * The write guard: on a context
 * ------------------------------------------------------------------------ */

describe('guardWrites22 on a context', () => {
  it('keeps walk.ts\'s rule: a table write is stopped and recorded, a read is not', async () => {
    const { context, send } = fakeContext();
    const writes = await guardWrites22(context);
    expect(await send('GET', `${REST}/assignments?select=id`)).toEqual(NETWORK);
    expect(await send('PATCH', `${REST}/assignment_progress?id=eq.7`)).toEqual(ABORTED);
    expect(await send('POST', `${REST}/agent_requests?select=id`)).toEqual(ABORTED);
    expect(writes).toEqual([`PATCH ${REST}/assignment_progress?id=eq.7`, `POST ${REST}/agent_requests?select=id`]);
  });

  it('stops and records each write RPC, and one nobody listed', async () => {
    const { context, send } = fakeContext();
    const writes = await guardWrites22(context);
    const names = [...WRITE_RPCS, 'some_new_function'];
    for (const name of names) expect(await send('POST', `${REST}/rpc/${name}`), name).toEqual(ABORTED);
    expect(writes).toEqual(names.map((name) => `POST ${REST}/rpc/${name}`));
  });

  it('answers mark_announcements_seen with no rows stamped: nothing reaches the database, nothing is recorded', async () => {
    const { context, send } = fakeContext();
    const writes = await guardWrites22(context);
    const outcome = await send('POST', `${REST}/rpc/mark_announcements_seen`);
    expect(outcome).toEqual({ kind: 'answer', status: 200, contentType: 'application/json; charset=utf-8', body: '0' });
    expect(writes).toEqual([]);
  });

  it('passes a search RPC and a preflight', async () => {
    const { context, send } = fakeContext();
    const writes = await guardWrites22(context);
    expect(await send('POST', `${REST}/rpc/hybrid_search_file_text`)).toEqual(NETWORK);
    expect(await send('OPTIONS', `${REST}/rpc/workspace_ask`)).toEqual(NETWORK);
    expect(writes).toEqual([]);
  });

  it('stops and records a file write and a sign-out, and passes a signed link and the session refresh', async () => {
    const { context, send } = fakeContext();
    const writes = await guardWrites22(context);
    const upload = `${API}/storage/v1/object/bb-files/submissions/IST.471/a1/draft.pdf`;
    const logout = `${API}/auth/v1/logout?scope=global`;
    expect(await send('POST', upload)).toEqual(ABORTED);
    expect(await send('POST', logout)).toEqual(ABORTED);
    expect(await send('POST', `${API}/storage/v1/object/sign/bb-files/IST.323/syllabus.pdf`)).toEqual(NETWORK);
    expect(await send('POST', `${API}/auth/v1/token?grant_type=refresh_token`)).toEqual(NETWORK);
    expect(writes).toEqual([`POST ${upload}`, `POST ${logout}`]);
  });

  it('gives each context a record of its own', async () => {
    const first = fakeContext();
    const second = fakeContext();
    const firstWrites = await guardWrites22(first.context);
    const secondWrites = await guardWrites22(second.context);
    await first.send('POST', `${REST}/rpc/workspace_ask`);
    expect(firstWrites).toHaveLength(1);
    expect(secondWrites).toEqual([]);
  });
});

/* ---------------------------------------------------------------------------
 * The quiet Sync button: the rows
 * ------------------------------------------------------------------------ */

const OPEN_LOOKUP =
  `${REST}/agent_requests?select=id%2Ccreated_at%2Ckind%2Cstate&kind=eq.sync&state=in.%28queued%2Cclaimed%29&order=created_at.desc&limit=1`;
const BY_ID = `${REST}/agent_requests?select=id%2Ccreated_at%2Ckind%2Cstate&id=eq.${QUIET_REQUEST_ID}`;
const RUN_LOOKUP =
  `${REST}/sync_runs?select=id%2Crun_id%2Cstatus&run_id=eq.${QUIET_RUN_ID}&or=%28scope.is.null%2Cscope.neq.unregistered%29&order=id.desc&limit=1`;
const INSERT = `${REST}/agent_requests?select=id%2Ccreated_at%2Ckind%2Cstate`;
const SYNC_PRESS = JSON.stringify({ kind: 'sync', scope: 'all', params: {}, note: null });

/** The columns the app selects (`AGENT_REQUEST_COLUMNS` in `src/lib/queries.sync.ts`). */
const REQUEST_COLUMNS = [
  'claim_attempts',
  'claimed_at',
  'claimed_by',
  'created_at',
  'finished_at',
  'id',
  'kind',
  'note',
  'params',
  'result',
  'run_id',
  'scope',
  'state',
  'sync_run_id',
];

const get = (url: string) => ({ method: 'GET', url, postData: null });

function rowsOf(answer: { status: number; body: unknown } | null): Record<string, unknown>[] {
  expect(answer).not.toBeNull();
  expect(answer?.status).toBe(200);
  expect(Array.isArray(answer?.body)).toBe(true);
  return answer?.body as Record<string, unknown>[];
}

/** What the app would show: its own `syncPhase()` over the rows the lib hands it. */
function phaseTheAppReads(phase: SyncPhase22, readAt: Date, clockAt: Date): string {
  const requests = rowsOf(quietSyncAnswer(phase, get(OPEN_LOOKUP), readAt));
  const runs = rowsOf(quietSyncAnswer(phase, get(RUN_LOOKUP), readAt));
  const request = (requests[0] ?? null) as unknown as PhaseRequest | null;
  // The button asks for the run row only when the runner holds the request and it has a run id.
  const asksRun = request !== null && request.state === 'claimed' && typeof requests[0]?.['run_id'] === 'string';
  const run = asksRun ? ((runs[0] ?? null) as unknown as PhaseRun | null) : null;
  return syncPhase(request, run, clockAt.getTime());
}

describe('the labels of the Sync button', () => {
  it('are the app\'s own, phase for phase', () => {
    expect(SYNC_LABEL_22).toEqual(PHASE_LABEL);
    expect([...SYNC_PHASES_22].sort()).toEqual(Object.keys(PHASE_LABEL).sort());
  });

  it('name the phase with the longest label', () => {
    const longest = Math.max(...Object.values(PHASE_LABEL).map((label) => label.length));
    expect(PHASE_LABEL[LONGEST_SYNC_PHASE_22]).toHaveLength(longest);
    expect(Object.values(PHASE_LABEL).filter((label) => label.length === longest)).toHaveLength(1);
  });
});

describe('the rows quietSync hands the app', () => {
  it('read as the phase asked for, by the app\'s own syncPhase()', () => {
    for (const phase of SYNC_PHASES_22) expect(phaseTheAppReads(phase, NOW, NOW), phase).toBe(phase);
  });

  it('still read as that phase when the clock has run on to the next poll: the label is pinned', () => {
    // The button polls every 10 s and its clock ticks every 5 s; each answer is stamped when it is made.
    const nextPoll = new Date(NOW.getTime() + 15_000);
    for (const phase of SYNC_PHASES_22) expect(phaseTheAppReads(phase, NOW, nextPoll), phase).toBe(phase);
  });

  it('are none at all when idle: no open request, by lookup or by id', () => {
    expect(rowsOf(quietSyncAnswer('idle', get(OPEN_LOOKUP), NOW))).toEqual([]);
    expect(rowsOf(quietSyncAnswer('idle', get(BY_ID), NOW))).toEqual([]);
    expect(rowsOf(quietSyncAnswer('idle', get(RUN_LOOKUP), NOW))).toEqual([]);
  });

  it('are one request row with every column the app selects, the same by lookup and by id', () => {
    for (const phase of SYNC_PHASES_22.filter((each) => each !== 'idle')) {
      const byLookup = rowsOf(quietSyncAnswer(phase, get(OPEN_LOOKUP), NOW));
      expect(byLookup, phase).toHaveLength(1);
      expect(Object.keys(byLookup[0] ?? {}).sort(), phase).toEqual(REQUEST_COLUMNS);
      expect(byLookup[0]?.['id']).toBe(QUIET_REQUEST_ID);
      expect(byLookup[0]?.['kind']).toBe('sync');
      expect(rowsOf(quietSyncAnswer(phase, get(BY_ID), NOW))).toEqual(byLookup);
    }
  });

  it('carry a run row only while the runner has one open', () => {
    const statusOf = (phase: SyncPhase22) => rowsOf(quietSyncAnswer(phase, get(RUN_LOOKUP), NOW)).map((row) => row['status']);
    expect(statusOf('crawling')).toEqual(['running']);
    expect(statusOf('pulling_files')).toEqual(['ok']);
    expect(statusOf('finishing')).toEqual(['failed']);
    for (const phase of ['idle', 'queued', 'unclaimed', 'requeued', 'starting', 'session', 'done'] as const) {
      expect(statusOf(phase), phase).toEqual([]);
    }
    expect(rowsOf(quietSyncAnswer('crawling', get(RUN_LOOKUP), NOW))[0]?.['run_id']).toBe(QUIET_RUN_ID);
  });

  it('answer a press of Sync with a filed row, in every phase, and file nothing', () => {
    for (const phase of SYNC_PHASES_22) {
      const answer = quietSyncAnswer(phase, { method: 'POST', url: INSERT, postData: SYNC_PRESS }, NOW);
      expect(answer?.status, phase).toBe(201);
      // `.insert().select().single()` reads one object, not a list.
      const row = answer?.body as Record<string, unknown>;
      expect(Array.isArray(row)).toBe(false);
      expect(Object.keys(row).sort()).toEqual(REQUEST_COLUMNS);
      expect(row['id']).toBe(QUIET_REQUEST_ID);
      expect(row['state']).toBe('queued');
    }
  });

  it('leave every other request alone', () => {
    const notMine = [
      get(`${REST}/agent_requests?select=id&kind=eq.inbox_feedback&state=in.%28queued%2Cclaimed%29&limit=1`),
      get(`${REST}/agent_requests?select=id&id=eq.412`),
      get(`${REST}/agent_requests?select=id`),
      get(`${REST}/sync_runs?select=id%2Cran_at%2Csummary&source=neq.ical&order=id.desc&limit=8`),
      get(`${REST}/sync_runs?select=id&run_id=eq.0b6f7c1e-2d3a-4b5c-8d9e-0f1a2b3c4d5e`),
      get(`${REST}/sync_runs_archive?select=id&run_id=eq.${QUIET_RUN_ID}`),
      get(`${REST}/assignments?select=id&kind=eq.sync`),
      { method: 'POST', url: INSERT, postData: JSON.stringify({ kind: 'inbox_feedback' }) },
      { method: 'POST', url: INSERT, postData: JSON.stringify([{ kind: 'sync' }]) },
      { method: 'POST', url: INSERT, postData: 'not json' },
      { method: 'POST', url: INSERT, postData: null },
      { method: 'PATCH', url: `${REST}/agent_requests?id=eq.${QUIET_REQUEST_ID}`, postData: JSON.stringify({ state: 'cancelled' }) },
      { method: 'DELETE', url: `${REST}/agent_requests?kind=eq.sync`, postData: null },
      { method: 'POST', url: `${REST}/sync_runs`, postData: SYNC_PRESS },
    ];
    for (const phase of ['idle', 'crawling'] as const) {
      for (const request of notMine) expect(quietSyncAnswer(phase, request, NOW), `${request.method} ${request.url}`).toBeNull();
    }
  });
});

/* ---------------------------------------------------------------------------
 * The quiet Sync button: on a context
 * ------------------------------------------------------------------------ */

describe('quietSync on a context', () => {
  it('is refused on a context without the write guard: a walk that pins the label is guarded', async () => {
    const { context } = fakeContext();
    await expect(quietSync(context)).rejects.toThrow(/guardWrites22/);
  });

  it('is refused for a phase the button does not have', async () => {
    const { context } = fakeContext();
    await guardWrites22(context);
    await expect(quietSync(context, 'syncing' as SyncPhase22)).rejects.toThrow(/not a phase/);
  });

  it('pins idle by default: the open lookup is answered here, with no request', async () => {
    const { context, send } = fakeContext();
    const writes = await guardWrites22(context);
    await quietSync(context);
    const outcome = await send('GET', OPEN_LOOKUP);
    expect(outcome).toMatchObject({ kind: 'answer', status: 200, contentType: 'application/json; charset=utf-8' });
    expect(outcome.kind === 'answer' ? JSON.parse(outcome.body) : null).toEqual([]);
    expect(writes).toEqual([]);
  });

  it('pins the phase asked for', async () => {
    const { context, send } = fakeContext();
    await guardWrites22(context);
    await quietSync(context, LONGEST_SYNC_PHASE_22);
    const outcome = await send('GET', OPEN_LOOKUP);
    const rows = outcome.kind === 'answer' ? (JSON.parse(outcome.body) as PhaseRequest[]) : [];
    expect(rows).toHaveLength(1);
    expect(syncPhase(rows[0], null, Date.now())).toBe(LONGEST_SYNC_PHASE_22);
  });

  it('answers a press of Sync itself: nothing is filed, and the guard records nothing', async () => {
    const { context, send } = fakeContext();
    const writes = await guardWrites22(context);
    await quietSync(context);
    const outcome = await send('POST', INSERT, SYNC_PRESS);
    expect(outcome).toMatchObject({ kind: 'answer', status: 201 });
    expect(writes).toEqual([]);
  });

  it('leaves every other write to the guard, and every other read to the network', async () => {
    const { context, send } = fakeContext();
    const writes = await guardWrites22(context);
    await quietSync(context, 'crawling');
    const apply = JSON.stringify({ kind: 'inbox_feedback' });
    expect(await send('POST', INSERT, apply)).toEqual(ABORTED);
    expect(await send('PATCH', `${REST}/agent_requests?id=eq.${QUIET_REQUEST_ID}`, '{"state":"cancelled"}')).toEqual(ABORTED);
    expect(await send('GET', `${REST}/agent_requests?select=id&kind=eq.inbox_feedback&limit=1`)).toEqual(NETWORK);
    expect(await send('GET', `${REST}/sync_runs?select=id%2Csummary&source=neq.ical&limit=8`)).toEqual(NETWORK);
    expect(writes).toEqual([`POST ${INSERT}`, `PATCH ${REST}/agent_requests?id=eq.${QUIET_REQUEST_ID}`]);
  });
});

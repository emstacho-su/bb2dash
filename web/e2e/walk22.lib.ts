/**
 * What every spec of Phase 22's walk shares (brief 103, task 0). The specs run in the walk box
 * (`scripts/walk-box.mjs` at the root): a throwaway container that builds this checkout's web app,
 * signs in as the owner and reads production data. So a spec only reads, and it does not have to
 * remember to say so: it takes `test` from here, never from `@playwright/test`.
 *
 *   import { expect, quietSync, shotPath22, shotsAsked22, test } from './walk22.lib';
 *
 *   test('home, dark', async ({ page, context }) => {
 *     await quietSync(context);                    // the Sync label stays "Sync" while the walk looks
 *     …
 *     if (shotsAsked22()) await page.screenshot({ path: shotPath22('01-home-dark.png') });
 *   });
 *
 * That `test` puts the write guard on the context before the test runs and fails the test
 * afterwards if it tried to write. `walk.ts` has an older guard with nearly the same name,
 * `guardWrites`, which lets every RPC through; a spec written from Phase 22 on never takes it
 * (`test/walk22-lib.test.ts` reads every new file under `web/e2e` and holds that).
 *
 * Here, in this order: where a shot goes; the write guard; the guarded `test`; the quiet Sync
 * button.
 *
 * Not a spec: the config's `testMatch` takes `*.spec.ts` only. Like the specs, it drives the built
 * app from the outside and imports nothing from `src/`. What it copies from there (the Sync
 * button's labels and row shapes) is held against the app's own code by `test/walk22-lib.test.ts`.
 */

import { existsSync, realpathSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { test as playwrightTest, type BrowserContext, type Route } from '@playwright/test';
import { assertNoWrites, guardWrites } from './walk';

export type Env = Readonly<Record<string, string | undefined>>;

const JSON_TYPE = 'application/json; charset=utf-8';

/* ---------------------------------------------------------------------------
 * Where a shot goes
 * ------------------------------------------------------------------------ */

/** The walk box passes it on (`WALK_SHOTS=1 node scripts/walk-box.mjs …`). */
const SHOTS_SWITCH = 'WALK_SHOTS';
/** The walk box sets it: `shots/` in the run's own folder, outside every repository. */
const SHOT_DIR_VARIABLE = 'WALK_SHOT_DIR';
/** A bare `.png` file name, so the path made from it stays in the shot folder. */
const SHOT_NAME = /^[0-9a-z][0-9a-z._-]*\.png$/i;

/** Shots are asked for: `WALK_SHOTS` is exactly `1`. */
export function shotsAsked(env: Env): boolean {
  return env[SHOTS_SWITCH] === '1';
}

/** The path with every link followed, as far as the path exists; what is not there yet is kept as written. */
function realPathOf(file: string): string {
  try {
    return realpathSync.native(file);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== 'ENOENT' && code !== 'ENOTDIR') throw error;
    const parent = dirname(file);
    return parent === file ? file : join(realPathOf(parent), basename(file));
  }
}

/** Whether one absolute path is another or under it, read as written. */
function isUnder(folder: string, file: string): boolean {
  const fromFolder = relative(folder, file);
  // Outside is one level up or more, or (on Windows) another drive, which `relative` gives whole.
  return fromFolder !== '..' && !fromFolder.startsWith(`..${sep}`) && !isAbsolute(fromFolder);
}

/** Whether a folder is in a git checkout: a repository has a `.git` folder, a worktree a `.git` file. */
function hasCheckoutAbove(folder: string): boolean {
  for (let dir = folder; ; dir = dirname(dir)) {
    if (existsSync(join(dir, '.git'))) return true;
    if (dirname(dir) === dir) return false;
  }
}

/**
 * Whether a folder is inside a git checkout: the one the spec runs from (in the walk box that is a
 * copy with no `.git`, so the folder alone decides) or any other, as written or once every link
 * is followed.
 */
function isInsideACheckout(checkoutRoot: string, folder: string): boolean {
  const root = resolve(checkoutRoot);
  const real = realPathOf(folder);
  return isUnder(root, folder) || isUnder(realPathOf(root), real) || hasCheckoutAbove(folder) || hasCheckoutAbove(real);
}

/**
 * Where a shot goes: `<WALK_SHOT_DIR>/<name>`. Refused unless shots were asked for, the folder is
 * set, absolute and outside every git checkout, and the name is a bare `.png` file name. No file
 * and no folder is made here: Playwright makes the folder when it writes the shot.
 */
export function shotPathFrom(env: Env, checkoutRoot: string, name: string): string {
  if (!shotsAsked(env)) throw new Error(`no shot is taken unless ${SHOTS_SWITCH}=1`);
  const asked = env[SHOT_DIR_VARIABLE] ?? '';
  if (asked === '') throw new Error(`${SHOT_DIR_VARIABLE} is not set: the walk box sets it (scripts/walk-box.mjs)`);
  if (!isAbsolute(asked)) throw new Error(`${SHOT_DIR_VARIABLE} must be an absolute path`);
  const folder = resolve(asked);
  if (isInsideACheckout(checkoutRoot, folder)) {
    throw new Error(`${SHOT_DIR_VARIABLE} is inside a git checkout: a shot belongs outside every repository`);
  }
  if (!SHOT_NAME.test(name)) throw new Error(`a shot's name is a bare .png file name, not "${name}"`);
  return join(folder, name);
}

/** Whether this run may shoot. A spec asks before every shot: `if (shotsAsked22()) …`. */
export function shotsAsked22(): boolean {
  return shotsAsked(process.env);
}

/**
 * The one way a Phase 22 spec makes a shot's path. It throws when shots were not asked for, so a
 * shot taken without asking `shotsAsked22()` first fails the test instead of writing a file.
 */
export function shotPath22(name: string): string {
  // `__dirname`: this package is CommonJS (see playwright.config.ts).
  return shotPathFrom(process.env, join(__dirname, '..', '..'), name);
}

/* ---------------------------------------------------------------------------
 * The write guard
 * ------------------------------------------------------------------------ */

/**
 * The RPCs that only read. The app calls none of them itself on 2026-10-08: search goes through
 * the `search` edge function, which calls these three in the database. They are listed so that a
 * screen that calls one directly still passes. Every other RPC is taken to write.
 */
export const READ_RPCS: ReadonlySet<string> = new Set(['search_file_text', 'match_file_text', 'hybrid_search_file_text']);

/**
 * Stamps `read_at` on every unseen announcement (migration 063). The app calls it when the bell
 * opens and when `/announcements` is visited, so a walk cannot avoid it. The guard answers it
 * itself, with "no rows stamped", and the database is never reached.
 */
const SEEN_RPC = 'mark_announcements_seen';
const NO_ROWS_STAMPED = '0';

/** pass: to the next handler. abort: stopped and recorded. answer_seen: answered here, see `SEEN_RPC`. */
export type GuardVerdict = 'pass' | 'abort' | 'answer_seen';

const WRITE_METHODS: ReadonlySet<string> = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
/** A preflight carries no write. Aborting one would stop the write behind it and leave no record of it. */
const PREFLIGHT = 'OPTIONS';

const RPC_AREA = /\/rest\/v1\/rpc\//;
const RPC_NAME = /\/rest\/v1\/rpc\/([^/]+)$/;
const STORAGE_AREA = /\/storage\/v1\//;
/** `createSignedUrl`: a POST that makes a link to read a file, and writes nothing. */
const STORAGE_SIGNED_READ = /\/storage\/v1\/object\/sign\//;
/** `supabase.auth.signOut()` ends every session of the owner, the desktop app's among them. */
const SIGN_OUT = /\/auth\/v1\/logout$/;

/** The function an RPC address calls, or null when the address is not one RPC's. */
export function rpcNameOf(address: string): string | null {
  if (!URL.canParse(address)) return null;
  return RPC_NAME.exec(new URL(address).pathname)?.[1] ?? null;
}

/** What the guard does with an RPC, by its exact name. */
export function rpcVerdict(name: string): GuardVerdict {
  if (READ_RPCS.has(name)) return 'pass';
  return name === SEEN_RPC ? 'answer_seen' : 'abort';
}

function isGuardedPath(pathname: string): boolean {
  return RPC_AREA.test(pathname) || STORAGE_AREA.test(pathname) || SIGN_OUT.test(pathname);
}

/**
 * What the guard does with a request beyond `walk.ts`'s table rule: an RPC is decided by its name
 * (one that cannot be read off the address is stopped), a write to Storage is stopped unless it
 * only signs a link, and a sign-out is stopped. Everything else passes on, tables included:
 * those are `walk.ts`'s.
 */
export function guardVerdict(method: string, address: string): GuardVerdict {
  if (method === PREFLIGHT || !URL.canParse(address)) return 'pass';
  const { pathname } = new URL(address);
  if (RPC_AREA.test(pathname)) {
    const name = rpcNameOf(address);
    return name === null ? 'abort' : rpcVerdict(name);
  }
  if (SIGN_OUT.test(pathname)) return 'abort';
  if (STORAGE_AREA.test(pathname)) {
    const signsARead = method === 'POST' && STORAGE_SIGNED_READ.test(pathname);
    return WRITE_METHODS.has(method) && !signsARead ? 'abort' : 'pass';
  }
  return 'pass';
}

/** Each guarded context's record of attempted writes: a second call hands back the same one. */
const GUARDED = new WeakMap<BrowserContext, string[]>();

/**
 * The specs only read. `walk.ts`'s guard stops and records every write to a table; this adds what
 * that guard lets through:
 *
 * * an RPC that is not on the read list is stopped and recorded: `workspace_ask`,
 *   `workspace_cancel`, `sync_enqueue`, every `planner_series_*`, and any name nobody listed;
 * * `mark_announcements_seen` is answered here and never reaches the database (not recorded:
 *   opening the bell is not a spec's mistake);
 * * a file write to Storage (upload, replace, remove) and a sign-out are stopped and recorded.
 *
 * Returns the record, for `assertNoWrites` from `./walk`. Call it before the page is opened, and
 * before `quietSync`. Calling it again on the same context returns the same record.
 *
 * A spec does not call this for the context Playwright hands it: `test` below already has. It is
 * called by hand only for a context the spec opens itself (`browser.newContext()`).
 */
export async function guardWrites22(context: BrowserContext): Promise<string[]> {
  const known = GUARDED.get(context);
  if (known !== undefined) return known;
  const attempted = await guardWrites(context);
  await context.route(
    (url) => isGuardedPath(url.pathname),
    async (route: Route) => {
      const request = route.request();
      const verdict = guardVerdict(request.method(), request.url());
      if (verdict === 'abort') {
        attempted.push(`${request.method()} ${request.url()}`);
        await route.abort('blockedbyclient');
      } else if (verdict === 'answer_seen') {
        await route.fulfill({ status: 200, contentType: JSON_TYPE, body: NO_ROWS_STAMPED });
      } else {
        await route.fallback();
      }
    },
  );
  GUARDED.set(context, attempted);
  return attempted;
}

/* ---------------------------------------------------------------------------
 * The guarded test
 * ------------------------------------------------------------------------ */

/**
 * The guard around one test: on the context before `runTest` runs the test, and after it the
 * test fails if anything was recorded. The body of the `writes22` fixture, apart so that it can be
 * tested without a browser.
 */
export async function withWriteGuard22(context: BrowserContext, runTest: (writes: string[]) => Promise<void>): Promise<void> {
  const writes = await guardWrites22(context);
  await runTest(writes);
  assertNoWrites(writes);
}

/**
 * Playwright's `test`, with the write guard on every test of the spec that takes it from here.
 * `writes22` is an automatic fixture: it runs for each test whether the test names it or not,
 * before the test's own page is opened, and it fails the test that tried to write. A spec cannot
 * leave the guard out or take the older one by mistake, because it never names a guard at all.
 *
 * A test may name `writes22` to read the record. One that ends with anything in it fails.
 */
export const test = playwrightTest.extend<{ writes22: string[] }>({
  writes22: [({ context }, use) => withWriteGuard22(context, use), { auto: true }],
});

export { expect } from '@playwright/test';

/* ---------------------------------------------------------------------------
 * The quiet Sync button
 * ------------------------------------------------------------------------ */

/** The Sync button's phases (`SyncPhase` in `src/lib/sync-request-phase.ts`). Copied, not imported. */
export const SYNC_PHASES_22 = [
  'idle',
  'queued',
  'unclaimed',
  'requeued',
  'starting',
  'crawling',
  'pulling_files',
  'finishing',
  'session',
  'done',
  'failed',
  'cancelled',
] as const;

export type SyncPhase22 = (typeof SYNC_PHASES_22)[number];

/** What the button says in each phase (`PHASE_LABEL` in `src/lib/sync-request-phase.ts`). Copied, not imported. */
export const SYNC_LABEL_22: Readonly<Record<SyncPhase22, string>> = {
  idle: 'Sync',
  queued: 'sync requested',
  unclaimed: 'waiting on the container…',
  requeued: 'sync requeued…',
  starting: 'starting…',
  crawling: 'crawling…',
  pulling_files: 'pulling files…',
  finishing: 'finishing…',
  session: 'Claude Code: syncing…',
  done: 'sync done',
  failed: 'sync failed',
  cancelled: 'sync cancelled',
};

/** The phase with the longest label: the one to pin when the bar's width is measured. */
export const LONGEST_SYNC_PHASE_22: SyncPhase22 = 'unclaimed';

/**
 * The request `quietSync` hands the app: an id no real row has (the column is a 32-bit serial in
 * the hundreds), and a run id of the shape the button accepts.
 */
export const QUIET_REQUEST_ID = 2_147_480_022;
export const QUIET_RUN_ID = '00000000-0000-4000-8000-000000000022';
const QUIET_RUN_ROW_ID = 2_147_480_023;

/** What `sync_claim()` writes in `claimed_by` (`RUNNER_CLAIMANT` in `src/lib/sync-request-phase.ts`). */
const RUNNER = 'sync-runner';
/** Any other claimant reads as a Claude Code session. */
const SESSION_CLAIMANT = 'walk22';

const MINUTE_MS = 60_000;
/** Past the button's 75-second grace: nothing took the request. */
const UNCLAIMED_AGO_MS = 10 * MINUTE_MS;
const CLOSED_FILED_AGO_MS = 5 * MINUTE_MS;
const CLOSED_FINISHED_AGO_MS = 2 * MINUTE_MS;

type RequestState = 'queued' | 'claimed' | 'done' | 'failed' | 'cancelled';

/** The request and run rows that read as one phase (`syncPhase()` in the app). */
interface PhaseShape {
  state: RequestState;
  claimedBy: string | null;
  /** Above 0 on a queued row: the runner took it once and let it go. */
  claimAttempts: number;
  /** How long ago the request was filed: what the button's two graces are read against. */
  filedAgoMs: number;
  /** The run row's status, or null while the request has no run. */
  runStatus: 'running' | 'ok' | 'failed' | null;
}

const queued = (claimAttempts: number, filedAgoMs: number): PhaseShape => ({
  state: 'queued',
  claimedBy: null,
  claimAttempts,
  filedAgoMs,
  runStatus: null,
});

const claimed = (claimedBy: string, runStatus: PhaseShape['runStatus']): PhaseShape => ({
  state: 'claimed',
  claimedBy,
  claimAttempts: claimedBy === RUNNER ? 1 : 0,
  filedAgoMs: 0,
  runStatus,
});

const closed = (state: RequestState): PhaseShape => ({
  state,
  claimedBy: RUNNER,
  claimAttempts: 1,
  filedAgoMs: CLOSED_FILED_AGO_MS,
  runStatus: null,
});

const SHAPE: Readonly<Record<Exclude<SyncPhase22, 'idle'>, PhaseShape>> = {
  queued: queued(0, 0),
  unclaimed: queued(0, UNCLAIMED_AGO_MS),
  requeued: queued(1, 0),
  starting: claimed(RUNNER, null),
  crawling: claimed(RUNNER, 'running'),
  pulling_files: claimed(RUNNER, 'ok'),
  finishing: claimed(RUNNER, 'failed'),
  session: claimed(SESSION_CLAIMANT, null),
  done: closed('done'),
  failed: closed('failed'),
  cancelled: closed('cancelled'),
};

const isoAgo = (now: Date, agoMs: number): string => new Date(now.getTime() - agoMs).toISOString();

/** One `agent_requests` row, with every column the app selects (`AGENT_REQUEST_COLUMNS`). */
function requestRow(shape: PhaseShape, now: Date): Record<string, unknown> {
  const isClosed = shape.state !== 'queued' && shape.state !== 'claimed';
  return {
    id: QUIET_REQUEST_ID,
    created_at: isoAgo(now, shape.filedAgoMs),
    kind: 'sync',
    scope: 'all',
    params: {},
    note: null,
    state: shape.state,
    claimed_at: shape.state === 'queued' ? null : isoAgo(now, shape.filedAgoMs),
    claimed_by: shape.claimedBy,
    finished_at: isClosed ? isoAgo(now, CLOSED_FINISHED_AGO_MS) : null,
    sync_run_id: null,
    run_id: shape.runStatus === null ? null : QUIET_RUN_ID,
    claim_attempts: shape.claimAttempts,
    result: null,
  };
}

/** The `sync_runs` row of a phase, with the columns the button selects, or none. */
function runRows(phase: SyncPhase22, now: Date): Record<string, unknown>[] {
  const status = phase === 'idle' ? null : SHAPE[phase].runStatus;
  if (status === null) return [];
  const finishedAt = status === 'running' ? null : now.toISOString();
  return [{ id: QUIET_RUN_ROW_ID, run_id: QUIET_RUN_ID, status, started_at: now.toISOString(), finished_at: finishedAt }];
}

/** The request as the page sent it: what the answer is decided from. */
export interface QuietRequest {
  method: string;
  url: string;
  postData: string | null;
}

/** What the page is told, as JSON. */
export interface QuietAnswer {
  status: number;
  body: unknown;
}

const AGENT_REQUESTS = /\/rest\/v1\/agent_requests$/;
const SYNC_RUNS = /\/rest\/v1\/sync_runs$/;

function isSyncPath(pathname: string): boolean {
  return AGENT_REQUESTS.test(pathname) || SYNC_RUNS.test(pathname);
}

/** The `kind` of the one row an insert files, or null when the body is anything else. */
function filedKind(postData: string | null): string | null {
  if (postData === null) return null;
  let body: unknown;
  try {
    body = JSON.parse(postData);
  } catch {
    // Not JSON: not the Sync button's insert, so not this helper's to answer. The guard stops it.
    return null;
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return null;
  const kind = (body as Record<string, unknown>)['kind'];
  return typeof kind === 'string' ? kind : null;
}

/** The answer to a read or an insert of `agent_requests`, when it is the Sync button's. */
function requestAnswer(phase: SyncPhase22, request: QuietRequest, filters: URLSearchParams, now: Date): QuietAnswer | null {
  if (request.method === 'GET') {
    // The open lookup (`kind = sync`, queued or claimed) and the read of the followed request by id.
    const isTheButtons = filters.get('kind') === 'eq.sync' || filters.get('id') === `eq.${QUIET_REQUEST_ID}`;
    if (!isTheButtons) return null;
    return { status: 200, body: phase === 'idle' ? [] : [requestRow(SHAPE[phase], now)] };
  }
  if (request.method === 'POST' && filedKind(request.postData) === 'sync') {
    // A press of Sync: the app needs the filed row back. The label does not follow it: the next
    // read of that id is answered above, with the phase that is pinned.
    return { status: 201, body: requestRow(SHAPE.queued, now) };
  }
  return null;
}

/**
 * What `quietSync` answers, or null when the request is not the Sync button's and goes on to the
 * next handler: the Inbox's own request (`kind = inbox_feedback`), Activity's read of `sync_runs`,
 * and every write but a press of Sync. Each answer is stamped with `now`, so a phase that depends
 * on the request's age (queued, unclaimed, requeued) holds for as long as the walk looks.
 */
export function quietSyncAnswer(phase: SyncPhase22, request: QuietRequest, now: Date): QuietAnswer | null {
  if (!URL.canParse(request.url)) return null;
  const { pathname, searchParams } = new URL(request.url);
  if (AGENT_REQUESTS.test(pathname)) return requestAnswer(phase, request, searchParams, now);
  if (SYNC_RUNS.test(pathname) && request.method === 'GET' && searchParams.get('run_id') === `eq.${QUIET_RUN_ID}`) {
    return { status: 200, body: runRows(phase, now) };
  }
  return null;
}

/**
 * Pins the Sync button's label for the whole walk: `idle` ("Sync") by default, or the phase asked
 * for, such as `LONGEST_SYNC_PHASE_22`. A sync that runs while the walk looks cannot change it.
 *
 * The button's reads of `agent_requests` and of its run in `sync_runs` are answered here, and so
 * is its insert: a press of Sync shows its toast, files nothing, and is not recorded as a write.
 * Everything else goes on to the write guard, which must be on the context first (it is, in
 * every test of a spec that takes `test` from here).
 *
 * Calling it again pins another phase; the page reads it at its next poll (10 s) or on a reload.
 */
export async function quietSync(context: BrowserContext, phase: SyncPhase22 = 'idle'): Promise<void> {
  if (!GUARDED.has(context)) {
    throw new Error('quietSync: call guardWrites22(context) first, so that every write quietSync does not answer is stopped');
  }
  if (!SYNC_PHASES_22.includes(phase)) {
    throw new Error(`"${String(phase)}" is not a phase of the Sync button: ${SYNC_PHASES_22.join(', ')}`);
  }
  await context.route(
    (url) => isSyncPath(url.pathname),
    async (route: Route) => {
      const request = route.request();
      const answer = quietSyncAnswer(phase, { method: request.method(), url: request.url(), postData: request.postData() }, new Date());
      if (answer === null) {
        await route.fallback();
        return;
      }
      await route.fulfill({ status: answer.status, contentType: JSON_TYPE, body: JSON.stringify(answer.body) });
    },
  );
}

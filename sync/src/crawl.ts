/**
 * Steps 5–7 of a pass: mint the run id, run crawler v5 inside the logged-in tab, and wait for the
 * scheduled transform to fold it.
 *
 * The crawler is `ingest/bb_crawler.js` as Phase 18 left it, injected with `addScriptTag`, then
 * `installCrawler({ userId: '_21025199_1', … })` and `runAll({ termName: 'Fall 2026', runId })`, the
 * call its header documents. The run id is minted here and registered before the crawl starts
 * (register-first, Phase 19), so the transform folds it only once its calendar row has landed.
 */

import { randomUUID } from 'node:crypto';

import { BLACKBOARD_ORIGIN } from './login.js';
import type { RunOutcome, SyncRpc } from './db.js';

/** Stack's Blackboard user id, the one `skills/bb-sync/SKILL.md` §Inputs names. */
export const BB_USER_ID = '_21025199_1';
export const TERM_NAME = 'Fall 2026';
/** How long a pass waits for the fold before it leaves the row claimed for Phase 19's 30-minute rule. */
export const FOLD_WAIT_MS = 600_000;
/** How often the fold wait reads `sync_run_outcome`; the transform tick runs every two minutes. */
export const FOLD_POLL_MS = 15_000;

const HTTP_SUCCESS_MIN = 200;
const HTTP_SUCCESS_MAX = 299;

export interface CrawlPage {
  currentUrl(): string;
  goto(url: string): Promise<void>;
  addScriptTag(path: string): Promise<void>;
  /** Run a function in the page with one serialisable argument. */
  evaluate<A, R>(fn: (arg: A) => R | Promise<R>, arg: A): Promise<R>;
  /** Run a script's source in the page (the fallback when a Content-Security-Policy blocks the tag). */
  evaluateScript(source: string): Promise<void>;
}

export interface CrawlOptions {
  runId: string;
  supabaseUrl: string;
  anonKey: string;
  crawlerPath: string;
  readSource: (path: string) => Promise<string>;
  log: (line: string) => void;
}

export interface CrawlLog {
  runId: string;
  posts: [string, number][];
}

export class CrawlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CrawlError';
  }
}

export function mintRunId(): string {
  return randomUUID();
}

function isBlackboardPage(url: string): boolean {
  try {
    return new URL(url).origin === BLACKBOARD_ORIGIN;
  } catch {
    return false;
  }
}

interface CrawlArgs {
  userId: string;
  supabaseUrl: string;
  anonKey: string;
  termName: string;
  runId: string;
}

/* The two functions below run in the page, not in Node: they read the crawler from the page's
   global scope, where its top-level `function installCrawler` lands. */
type PageGlobal = { installCrawler?: (o: object) => { runAll: (o: object) => Promise<unknown> } };

function crawlerInstalled(): boolean {
  return typeof (globalThis as PageGlobal).installCrawler === 'function';
}

async function crawlInPage(a: CrawlArgs): Promise<unknown> {
  const bb = (globalThis as PageGlobal).installCrawler!({ userId: a.userId, supabaseUrl: a.supabaseUrl, anonKey: a.anonKey });
  return bb.runAll({ termName: a.termName, runId: a.runId });
}

/** Inject the crawler, run every current-term course and the calendar, and check every post landed. */
export async function runCrawl(page: CrawlPage, opts: CrawlOptions): Promise<CrawlLog> {
  if (!isBlackboardPage(page.currentUrl())) await page.goto(`${BLACKBOARD_ORIGIN}/ultra/`);

  await page.addScriptTag(opts.crawlerPath);
  if (!(await page.evaluate(crawlerInstalled, null))) {
    opts.log('crawl: the script tag did not install the crawler (a Content-Security-Policy?); evaluating its source');
    await page.evaluateScript(await opts.readSource(opts.crawlerPath));
    if (!(await page.evaluate(crawlerInstalled, null))) throw new CrawlError('the crawler did not install in the page');
  }

  const result = (await page.evaluate(crawlInPage, {
    userId: BB_USER_ID,
    supabaseUrl: opts.supabaseUrl,
    anonKey: opts.anonKey,
    termName: TERM_NAME,
    runId: opts.runId,
  })) as { run_id?: unknown; log?: unknown };

  if (result?.run_id !== opts.runId) {
    throw new CrawlError(`runAll returned run ${JSON.stringify(result?.run_id)}, not the registered ${opts.runId}`);
  }
  const posts = Array.isArray(result.log) ? (result.log as [string, number][]) : [];
  const failed = posts.filter(([, status]) => !(Number(status) >= HTTP_SUCCESS_MIN && Number(status) <= HTTP_SUCCESS_MAX));
  if (failed.length > 0) {
    throw new CrawlError(`bb_raw refused ${failed.length} post(s): ${failed.map(([n, s]) => `${n} ${s}`).join(', ')}`);
  }
  if (!posts.some(([name]) => name === 'calendar')) throw new CrawlError('runAll posted no calendar row');
  opts.log(`crawl: run ${opts.runId} posted ${posts.length} rows`);
  return { runId: opts.runId, posts };
}

export interface FoldWaitDeps {
  rpc: Pick<SyncRpc, 'runOutcome'>;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
  timeoutMs?: number;
  pollMs?: number;
  /** A stopping runner gives up the wait at once; the row stays claimed, as on a timeout. */
  shouldStop?: () => boolean;
}

/** Poll `sync_run_outcome` until the run is no longer running; null when FOLD_WAIT_MS runs out. */
export async function waitForFold(runId: string, deps: FoldWaitDeps): Promise<RunOutcome | null> {
  const timeout = deps.timeoutMs ?? FOLD_WAIT_MS;
  const poll = deps.pollMs ?? FOLD_POLL_MS;
  const deadline = deps.now() + timeout;
  for (;;) {
    const outcome = await deps.rpc.runOutcome(runId);
    if (outcome && outcome.status !== 'running') return outcome;
    const left = deadline - deps.now();
    if (left <= 0 || deps.shouldStop?.()) return null;
    await deps.sleep(Math.min(poll, left));
  }
}

/**
 * `node sync/dist/main.js` — the sync runner (brief 100, Phase 14; R-81).
 *
 * On start: `sync_requeue_orphans()` once, then Chromium on the container's display with the
 * persistent `bb-profile` (headful on Xvfb, as `pwuser`, under Playwright's seccomp profile with the
 * Chromium sandbox on: P-102), then the login watch beside the passes, and a heartbeat every
 * HEARTBEAT_MS for the healthcheck (`probe.js --heartbeat`). SIGTERM and SIGINT stop it cleanly; the
 * browser closing on its own ends it with exit 1 so the container restarts it.
 *
 * `startRunner` takes every outside thing as a dependency, so integration.test.ts runs it on a fake
 * page and a fake database; `realDeps` is the one place Playwright, pg and the files are wired in.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { runCrawl, mintRunId, waitForFold, type CrawlPage } from './crawl.js';
import { createPgQuery, createRpc, newPgClient, redactDsn, type QueryFn } from './db.js';
import { makeEmbedder, makeExtractor, makeSupabaseFiles, runFilesStep, type ExtractUnit } from './files.js';
import { BLACKBOARD_ORIGIN, LoginWatch, PROBE_URL, type LoginPort } from './login.js';
import { runLoop } from './loop.js';
import { loadConfig, readTextOrNull, stateFiles, type RunnerConfig } from './secrets.js';

export const HEARTBEAT_MS = 30_000;
const NAVIGATION_TIMEOUT_MS = 60_000;
const REQUEST_TIMEOUT_MS = 30_000;

export interface BrowserSession {
  login: LoginPort;
  crawlPage: CrawlPage;
  hop(url: string): Promise<{ status: number; headers: Record<string, string> }>;
  close(): Promise<void>;
  onUnexpectedClose(callback: () => void): void;
}

export interface RunnerDeps {
  config: RunnerConfig;
  query: QueryFn & { end(): Promise<void> };
  openBrowser(): Promise<BrowserSession>;
  fetchImpl: typeof fetch;
  extract(filePath: string): Promise<ExtractUnit[]>;
  embed(): Promise<{ code: number; tail: string }>;
  readSource(file: string): Promise<string>;
  writeState(name: 'heartbeat' | 'login', text: string): Promise<void>;
  log(line: string): void;
  sleep?(ms: number): Promise<void>;
  random?(): number;
}

export type RunnerEnd = 'stopped' | 'browser_closed';

function firstLine(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).split('\n')[0] ?? '';
}

export function startRunner(d: RunnerDeps): { stop(): Promise<void>; done: Promise<RunnerEnd> } {
  let stopping = false;
  let browserClosed = false;
  let wake: (() => void) | null = null;
  let passRunning = false;
  let watch: LoginWatch | null = null;
  let session: BrowserSession | null = null;
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  const sleep =
    d.sleep ??
    ((ms: number) =>
      new Promise<void>((resolve) => {
        if (stopping) return resolve();
        const timer = setTimeout(() => {
          wake = null;
          resolve();
        }, ms);
        wake = () => {
          clearTimeout(timer);
          wake = null;
          resolve();
        };
      }));

  const rpc = createRpc(d.query);
  const { config } = d;
  const supabase = makeSupabaseFiles(config.supabaseUrl, config.anonKey, d.fetchImpl);
  const heartbeat = () => {
    d.writeState('heartbeat', new Date().toISOString()).catch((error) => d.log(`sync-runner: heartbeat write failed: ${firstLine(error)}`));
  };

  const done = (async (): Promise<RunnerEnd> => {
    d.log('sync-runner: start');
    const requeued = await rpc.requeueOrphans();
    d.log(`sync-runner: requeued ${requeued} orphaned claim(s)`);

    const browser = await d.openBrowser();
    session = browser;
    browser.onUnexpectedClose(() => {
      d.log('sync-runner: the browser closed; stopping so the container restarts it');
      browserClosed = true;
      stopping = true;
      wake?.();
    });

    const loginWatch = new LoginWatch({
      page: browser.login,
      rpc,
      keepaliveMinutes: config.keepaliveMinutes,
      isPassRunning: () => passRunning,
      log: d.log,
      ...(d.random ? { random: d.random } : {}),
      onProbe: (record) => {
        d.writeState('login', JSON.stringify(record)).catch((error) => d.log(`sync-runner: state write failed: ${firstLine(error)}`));
      },
    });
    watch = loginWatch;
    loginWatch.start();
    heartbeat();
    heartbeatTimer = setInterval(heartbeat, HEARTBEAT_MS);

    await runLoop({
      rpc,
      login: loginWatch,
      crawl: (runId) =>
        runCrawl(browser.crawlPage, {
          runId,
          supabaseUrl: config.supabaseUrl,
          anonKey: config.anonKey,
          crawlerPath: path.join(config.repoRoot, 'ingest', 'bb_crawler.js'),
          readSource: d.readSource,
          log: d.log,
        }),
      waitFold: (runId) => waitForFold(runId, { rpc, sleep, now: Date.now, shouldStop: () => stopping }),
      files: () =>
        runFilesStep({
          rpc,
          hop: browser.hop,
          fetchSigned: (url) => d.fetchImpl(url),
          storagePost: supabase.storagePost,
          textPost: supabase.textPost,
          extract: d.extract,
          embed: d.embed,
          fs: fs.promises,
          tmpDir: config.tmpDir,
          courseFilesDir: config.courseFilesDir,
          loginCheck: () => loginWatch.check('files'),
          log: d.log,
        }),
      mintRunId,
      setPassRunning: (running) => {
        passRunning = running;
      },
      log: d.log,
      sleep,
      shouldStop: () => stopping,
      heartbeat,
    });
    return browserClosed ? 'browser_closed' : 'stopped';
  })().finally(async () => {
    if (heartbeatTimer !== null) clearInterval(heartbeatTimer);
    watch?.stop();
    if (session && !browserClosed) {
      try {
        await session.close();
      } catch (error) {
        d.log(`sync-runner: browser close failed: ${firstLine(error)}`);
      }
    }
    await d.query.end();
    d.log('sync-runner: stopped');
  });

  return {
    async stop() {
      stopping = true;
      wake?.();
      try {
        await done;
      } catch {
        // The caller reads `done` for the reason; stopping never throws.
      }
    },
    done,
  };
}

// ---------------------------------------------------------------------------------------------
// The real wiring: Playwright, pg, the filesystem
// ---------------------------------------------------------------------------------------------

async function openPlaywright(config: RunnerConfig, log: (line: string) => void): Promise<BrowserSession> {
  const { chromium } = await import('playwright');
  const context = await chromium.launchPersistentContext(config.profileDir, {
    headless: false,
    // P-102: the sandbox stays on. Playwright defaults this to false and would then turn Chromium's
    // sandbox off by itself; the container runs Chromium as pwuser under Playwright's seccomp profile.
    chromiumSandbox: true,
    viewport: null,
    args: ['--window-position=0,0', '--window-size=1440,900', '--hide-crash-restore-bubble'],
  });
  const page = context.pages()[0] ?? (await context.newPage());
  const goto = async (url: string) => {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: NAVIGATION_TIMEOUT_MS });
  };
  try {
    await goto(`${BLACKBOARD_ORIGIN}/ultra/`);
  } catch (error) {
    log(`sync-runner: first load of Ultra failed: ${firstLine(error)}`);
  }
  let closing = false;
  return {
    login: {
      currentUrl: () => page.url(),
      goto,
      probe: async () => {
        const res = await context.request.get(PROBE_URL, { maxRedirects: 0, failOnStatusCode: false, timeout: REQUEST_TIMEOUT_MS });
        return { status: res.status(), location: res.headers()['location'] ?? null };
      },
    },
    crawlPage: {
      currentUrl: () => page.url(),
      goto,
      addScriptTag: async (file) => {
        await page.addScriptTag({ path: file });
      },
      evaluate: (fn, arg) => page.evaluate(fn as never, arg) as never,
      evaluateScript: async (source) => {
        await page.evaluate(source);
      },
    },
    hop: async (url) => {
      const res = await context.request.get(url, { maxRedirects: 0, failOnStatusCode: false, timeout: REQUEST_TIMEOUT_MS });
      return { status: res.status(), headers: res.headers() };
    },
    close: async () => {
      closing = true;
      await context.close();
    },
    onUnexpectedClose: (callback) => {
      context.on('close', () => {
        if (!closing) callback();
      });
    },
  };
}


let writeSeq = 0;
const writesInFlight = new Map<string, Promise<void>>();

/**
 * Write through a temp file and a rename, so probe.js never reads half a file (R2-1: startup writes
 * the heartbeat twice at once). Each write gets its own temp name, so no rename finds another's
 * temp file gone, and writes to one file run one after another in call order, so the last call
 * wins and no two renames race onto the same target (Windows refuses that with EPERM).
 */
export function writeAtomic(file: string, text: string): Promise<void> {
  writeSeq += 1;
  const tmp = `${file}.${process.pid}.${writeSeq}.tmp`;
  const previous = writesInFlight.get(file) ?? Promise.resolve();
  const write = previous
    .catch(() => undefined)
    .then(async () => {
      await fs.promises.mkdir(path.dirname(file), { recursive: true });
      await fs.promises.writeFile(tmp, text, 'utf8');
      try {
        await fs.promises.rename(tmp, file);
      } catch (error) {
        await fs.promises.rm(tmp, { force: true });
        throw error;
      }
    });
  writesInFlight.set(file, write);
  void write.finally(() => {
    if (writesInFlight.get(file) === write) writesInFlight.delete(file);
  }).catch(() => undefined);
  return write;
}

export function realDeps(env: NodeJS.ProcessEnv = process.env): RunnerDeps {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  const config = loadConfig({ env, readFile: readTextOrNull, repoRoot });
  const log = (line: string) => {
    process.stdout.write(`${redactDsn(line, config.dbUrl)}\n`);
  };
  const ingestDir = path.join(repoRoot, 'ingest');
  const files = stateFiles(config.stateDir);
  return {
    config,
    query: createPgQuery({ dsn: config.dbUrl, log, newClient: newPgClient }),
    openBrowser: () => openPlaywright(config, log),
    fetchImpl: fetch,
    extract: makeExtractor(ingestDir, { parentEnv: env }),
    embed: makeEmbedder({ supabaseUrl: config.supabaseUrl, jwt: config.anonJwt, log }),
    readSource: (file) => fs.promises.readFile(file, 'utf8'),
    writeState: (name, text) => writeAtomic(files[name], text),
    log,
  };
}

const invokedDirectly =
  Boolean(process.argv[1]) && pathToFileURL(path.resolve(process.argv[1]!)).href === pathToFileURL(fileURLToPath(import.meta.url)).href;

if (invokedDirectly) {
  let runner: ReturnType<typeof startRunner>;
  try {
    runner = startRunner(realDeps());
  } catch (error) {
    process.stdout.write(`sync-runner: cannot start: ${firstLine(error)}\n`);
    process.exit(2);
  }
  const stop = (signal: string) => {
    process.stdout.write(`sync-runner: ${signal}, stopping\n`);
    void runner.stop().then(() => process.exit(0));
  };
  process.on('SIGTERM', () => stop('SIGTERM'));
  process.on('SIGINT', () => stop('SIGINT'));
  runner.done.then(
    (end) => process.exit(end === 'browser_closed' ? 1 : 0),
    (error) => {
      process.stdout.write(`sync-runner: ended: ${firstLine(error)}\n`);
      process.exit(1);
    },
  );
}

/**
 * Shared machinery for the Electron e2e specs (C-10).
 *
 * Two things every spec needs:
 *  - a **local** app origin. C-10 says `BB2DASH_APP_URL=<local static fixture page>`; this
 *    serves one over loopback so `new URL(route, appUrl)` resolves the way it does in
 *    production. Nothing in the suite may touch `*.supabase.co`, and nothing here can.
 *  - a per-test `--user-data-dir`, so the watermark starts clean and a *relaunch* can be
 *    pointed at the same directory on purpose.
 *
 * The shell's entry point (`dist/main/index.js`) is W-25's (C-1) and is not on this branch.
 * `mainEntry()` prefers it whenever it exists and otherwise falls back to W-26's own test
 * harness entry, so the same specs run today and need no edit after the merge.
 */

import { createServer, type Server } from 'node:http';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { AddressInfo } from 'node:net';

import { _electron as electron, type ElectronApplication } from '@playwright/test';

/** The shell's real entry point, built by `npm run build`; owned by W-25 (C-1). */
export const SHELL_ENTRY = resolve(__dirname, '..', '..', 'dist', 'main', 'index.js');

/** W-26's stand-in while W-25's branch is unmerged. See the file's own header. */
export const HARNESS_ENTRY = resolve(__dirname, 'fixtures', 'harness-main.cjs');

/** What `npm run build` must have produced for either entry to load. */
const BUILT_WIRING = resolve(__dirname, '..', '..', 'dist', 'main', 'poller-wiring.js');

/** Prefer the real shell whenever it exists, so these specs need no edit after the merge. */
export function mainEntry(): string {
  return existsSync(SHELL_ENTRY) ? SHELL_ENTRY : HARNESS_ENTRY;
}

export function shellIsBuilt(): boolean {
  return existsSync(BUILT_WIRING) && existsSync(mainEntry());
}

export const SKIP_REASON =
  'desktop/dist is not built. Run `npm run build` first (the e2e script does it for you).';

/** A one-page site on loopback: every path returns the same document. */
export async function startAppServer(): Promise<{ origin: string; close: () => Promise<void> }> {
  const server: Server = createServer((request, response) => {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(
      `<!doctype html><html><head><meta charset="utf-8"><title>bb2dash fixture</title></head>` +
        `<body><main id="route">${request.url ?? '/'}</main></body></html>`,
    );
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const { port } = server.address() as AddressInfo;
  return {
    origin: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise<void>((done, fail) => server.close((error) => (error ? fail(error) : done()))),
  };
}

export async function makeUserDataDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'bb2dash-e2e-'));
}

export async function removeDir(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true });
}

export interface LaunchOptions {
  readonly userDataDir: string;
  readonly appUrl: string;
}

/** Launch the shell under `BB2DASH_TEST=1` against a throwaway profile. */
export function launchShell({ userDataDir, appUrl }: LaunchOptions): Promise<ElectronApplication> {
  return electron.launch({
    args: [mainEntry(), `--user-data-dir=${userDataDir}`],
    env: {
      ...process.env,
      BB2DASH_TEST: '1',
      BB2DASH_APP_URL: appUrl,
    },
  });
}

/** The shape `globalThis.__bb2dashTest` exposes for this worker's half (C-10). */
export interface RecordedToast {
  key: string;
  title: string;
  body: string;
  route: string;
  shownAt: string;
}

export interface RecordedNavigation {
  route: string;
  accepted: boolean;
  at: string;
}

export interface TickFixture {
  sync: unknown;
  grades: unknown[];
  due: unknown[] | null;
  courses: { id: string; title_short: string }[];
}

interface TestSurface {
  recorded: () => { toasts?: RecordedToast[]; navigations?: RecordedNavigation[] };
  tick: (fixture: TickFixture) => Promise<{ outcome: string; toastCount: number }>;
  clickToast: (key: string) => boolean;
  resetNotifications: () => void;
}

export function tick(app: ElectronApplication, fixture: TickFixture) {
  return app.evaluate(async (_electron, payload) => {
    const hook = (globalThis as { __bb2dashTest?: TestSurface }).__bb2dashTest;
    if (!hook) throw new Error('globalThis.__bb2dashTest is not installed');
    return hook.tick(payload);
  }, fixture);
}

export function recordedToasts(app: ElectronApplication): Promise<RecordedToast[]> {
  return app.evaluate(() => {
    const hook = (globalThis as { __bb2dashTest?: TestSurface }).__bb2dashTest;
    if (!hook) throw new Error('globalThis.__bb2dashTest is not installed');
    return hook.recorded().toasts ?? [];
  });
}

export function recordedNavigations(app: ElectronApplication): Promise<RecordedNavigation[]> {
  return app.evaluate(() => {
    const hook = (globalThis as { __bb2dashTest?: TestSurface }).__bb2dashTest;
    if (!hook) throw new Error('globalThis.__bb2dashTest is not installed');
    return hook.recorded().navigations ?? [];
  });
}

export function clickToast(app: ElectronApplication, key: string): Promise<boolean> {
  return app.evaluate((_electron, toastKey) => {
    const hook = (globalThis as { __bb2dashTest?: TestSurface }).__bb2dashTest;
    if (!hook) throw new Error('globalThis.__bb2dashTest is not installed');
    return hook.clickToast(toastKey);
  }, key);
}

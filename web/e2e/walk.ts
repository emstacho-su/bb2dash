/**
 * Shared pieces of the walk harness (Phase 17, T-01). Specs import from here,
 * never from `src/`: the harness drives the built app from the outside.
 */

import { join } from 'node:path';
import { expect, type BrowserContext, type Page, type Route, type TestInfo } from '@playwright/test';

/**
 * The persisted React Query cache key (`src/lib/query-provider.tsx`,
 * `PERSIST_KEY`). Copied, not imported: the harness does not load app modules.
 */
export const QUERY_CACHE_KEY = 'bb2dash.query-cache';

/** The sidebar preference key (`src/lib/sidebar-preference.ts`). */
export const SIDEBAR_KEY = 'bb2dash.sidebar';

/** `STAGED_LABEL` in `src/lib/queries.grades.ts`. */
export const STAGED_LABEL = 'Staged in bb2dash — attach in Blackboard ↗';

/** The IST.471 A1 popout: the pasted URL of acceptance step 6 and the staging rows. */
export const A1_POPOUT = '/course/IST.471/classwork?item=assignment:IST.471/a1-proposal';

/** Where a numbered screenshot goes: the config's `metadata.shotDir` (walk-17/). */
export function shotPath(testInfo: TestInfo, name: string): string {
  const dir = testInfo.config.metadata['shotDir'];
  if (typeof dir !== 'string' || dir.length === 0) {
    throw new Error('playwright.config.ts has no metadata.shotDir');
  }
  return join(dir, name);
}

const WRITE_METHODS: ReadonlySet<string> = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * The specs only read. Every write to a PostgREST table is aborted and
 * recorded, and `assertNoWrites` fails the test that attempted one. RPC calls
 * pass (PostgREST serves reads such as search as POST /rpc), and so does the
 * auth endpoint, which refreshes the saved session.
 */
export async function guardWrites(context: BrowserContext): Promise<string[]> {
  const attempted: string[] = [];
  await context.route('**/rest/v1/**', async (route: Route) => {
    const request = route.request();
    const url = request.url();
    if (WRITE_METHODS.has(request.method()) && !url.includes('/rest/v1/rpc/')) {
      attempted.push(`${request.method()} ${url}`);
      await route.abort('blockedbyclient');
      return;
    }
    await route.fallback();
  });
  return attempted;
}

export function assertNoWrites(attempted: readonly string[]): void {
  expect(attempted, 'a walk spec tried to write').toEqual([]);
}

/** Drops the persisted query cache before any app script runs, so every read is cold. */
export async function coldCache(context: BrowserContext): Promise<void> {
  await context.addInitScript((key: string) => {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // Storage disabled: there is no persisted cache to drop.
    }
  }, QUERY_CACHE_KEY);
}

/** Console messages of the kinds a clean page never prints. */
export function collectConsole(page: Page): string[] {
  const messages: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') {
      messages.push(`${message.type()}: ${message.text()}`);
    }
  });
  page.on('pageerror', (error) => messages.push(`pageerror: ${error.message}`));
  return messages;
}

/** Any native browser dialog is dismissed at once, so no run can stall on one. */
export function dismissNativeDialogs(page: Page): void {
  page.on('dialog', (dialog) => void dialog.dismiss());
}

/** Lands on a signed-in screen, failing clearly when the saved session is stale. */
export async function openSignedIn(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await expect(page, 'the saved session is missing or expired: re-run e2e/login.mjs').not.toHaveURL(
    /\/login(\?|$)/,
  );
}

/** Hands a view read a fixed body, as JSON, the way PostgREST answers an array read. */
export async function fulfillView(
  context: BrowserContext,
  view: string,
  rows: readonly Record<string, unknown>[],
): Promise<void> {
  await context.route(`**/rest/v1/${view}?**`, async (route) => {
    if (route.request().method() !== 'GET') {
      await route.fallback();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      headers: { 'content-range': `0-${Math.max(rows.length - 1, 0)}/${rows.length}` },
      body: JSON.stringify(rows),
    });
  });
}

/** Aborts every read of the named tables or views: the harness's forced failed read. */
export async function failReads(context: BrowserContext, relations: readonly string[]): Promise<void> {
  for (const relation of relations) {
    await context.route(`**/rest/v1/${relation}?**`, (route) => route.abort('failed'));
  }
}

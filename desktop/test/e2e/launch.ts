/**
 * Launching the built shell under Playwright, always against the local fixture
 * and never against a real origin.
 */

import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { _electron as electron } from '@playwright/test';
import type { ElectronApplication } from '@playwright/test';

// The `electron` package's entry point is the path of the binary it installed.
const ELECTRON_BINARY = require('electron') as unknown as string;

export const MAIN_ENTRY = resolve(__dirname, '..', '..', 'dist', 'main', 'index.js');

/** An anon key shaped like the real one, signing nothing and reaching nothing. */
export const FIXTURE_ANON_KEY = 'eyJhbGciOiJIUzI1NiJ9.ZmFrZS1hbm9u.fixture-signature';

export function makeUserDataDir(): string {
  return mkdtempSync(join(tmpdir(), 'bb2dash-e2e-'));
}

export interface LaunchOptions {
  readonly fixtureUrl: string;
  readonly userDataDir: string;
  /** `BB2DASH_SYNC_DRY_RUN`; the recorder is on anyway, so this only shapes argv. */
  readonly dryRun?: boolean;
}

export async function launchShell(options: LaunchOptions): Promise<ElectronApplication> {
  return electron.launch({
    args: [MAIN_ENTRY, `--user-data-dir=${options.userDataDir}`],
    env: {
      ...process.env,
      BB2DASH_TEST: '1',
      BB2DASH_APP_URL: options.fixtureUrl,
      BB2DASH_SUPABASE_URL: options.fixtureUrl,
      BB2DASH_SUPABASE_ANON_KEY: FIXTURE_ANON_KEY,
      BB2DASH_SYNC_DRY_RUN: options.dryRun === true ? '1' : '0',
    },
  });
}

/** A session cookie in the `@supabase/ssr` shape, with a real expiry. */
export function fixtureAuthCookie(expiresAtSeconds: number): { name: string; value: string } {
  const accessToken = [
    Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'),
    Buffer.from(JSON.stringify({ sub: 'stack', exp: expiresAtSeconds })).toString('base64url'),
    'fixture-signature',
  ].join('.');

  const session = JSON.stringify({
    access_token: accessToken,
    token_type: 'bearer',
    expires_at: expiresAtSeconds,
    refresh_token: 'fixture-refresh',
  });

  return {
    name: 'sb-localfixture-auth-token',
    value: `base64-${Buffer.from(session).toString('base64url')}`,
  };
}

/**
 * A second launch, outside Playwright: `electron.launch` rejects when the app
 * exits, and exiting immediately is precisely what the single-instance lock is
 * supposed to make it do. Resolves with the exit code.
 */
export async function spawnSecondInstance(options: LaunchOptions): Promise<number | null> {
  const child = spawn(
    ELECTRON_BINARY,
    [MAIN_ENTRY, `--user-data-dir=${options.userDataDir}`],
    {
      env: {
        ...process.env,
        BB2DASH_TEST: '1',
        BB2DASH_APP_URL: options.fixtureUrl,
        BB2DASH_SUPABASE_URL: options.fixtureUrl,
        BB2DASH_SUPABASE_ANON_KEY: FIXTURE_ANON_KEY,
      },
      stdio: 'ignore',
    },
  );
  return new Promise((resolve_, reject) => {
    child.on('error', reject);
    child.on('exit', (code) => resolve_(code));
  });
}

export interface RecordedEvent {
  readonly kind: string;
  readonly at: string;
  readonly payload: unknown;
}

export async function recorded(app: ElectronApplication): Promise<readonly RecordedEvent[]> {
  return app.evaluate(() => {
    const hook = (globalThis as { __bb2dashTest?: { recorded: () => unknown } }).__bb2dashTest;
    if (hook === undefined) throw new Error('the test hook is not installed');
    return hook.recorded() as RecordedEvent[];
  }) as Promise<readonly RecordedEvent[]>;
}

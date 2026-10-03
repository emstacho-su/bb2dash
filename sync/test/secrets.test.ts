// Task 12 (R-89): the runner reads its secrets from files, strips what PowerShell adds, refuses the
// wrong key in the wrong place, and never puts a value in an error.

import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  ConfigError,
  DEFAULT_SUPABASE_URL,
  SECRETS,
  assertAnonJwt,
  assertPublishableKey,
  assertSessionDsn,
  cleanSecret,
  loadConfig,
  readSecret,
  requireSecret,
} from '../src/secrets.js';

const DSN = 'postgresql://sync_runner.goultdzqcavefcgnifdy:s3cret-pw@aws-0-us-east-1.pooler.supabase.com:5432/postgres?uselibpqcompat=true&sslmode=require';
// Unsigned test tokens: header.payload.signature with the payload's role in clear.
const jwt = (role: string) => `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ role })).toString('base64url')}.sig`;

function files(map: Record<string, string>) {
  return (p: string) => (p in map ? map[p]! : null);
}

describe('cleanSecret', () => {
  it('strips a UTF-8 BOM, CR and LF, and surrounding spaces', () => {
    expect(cleanSecret('﻿abc\r\n')).toBe('abc');
    expect(cleanSecret('  a\nb  ')).toBe('ab');
  });
});

describe('readSecret', () => {
  it('prefers the variable, then <NAME>_FILE, then /run/secrets/<file>', () => {
    const spec = SECRETS.dbUrl;
    expect(readSecret(spec, { env: { SYNC_RUNNER_DB_URL: 'from-env' }, readFile: files({}) })).toBe('from-env');
    expect(readSecret(spec, { env: { SYNC_RUNNER_DB_URL_FILE: '/x/db' }, readFile: files({ '/x/db': '﻿from-file\r\n' }) })).toBe('from-file');
    expect(readSecret(spec, { env: {}, readFile: files({ [path.posix.join('/run/secrets', 'sync_runner_db_url')]: 'mounted' }) })).toBe('mounted');
    expect(readSecret(spec, { env: {}, readFile: files({}) })).toBeNull();
  });

  it('a _FILE that names a missing file is an error that names the variable, not a value', () => {
    expect(() => readSecret(SECRETS.anonKey, { env: { SB_ANON_KEY_FILE: '/nope' }, readFile: files({}) })).toThrow(
      /SB_ANON_KEY_FILE names a file that cannot be read/,
    );
  });

  it('requireSecret names what to set when nothing is there', () => {
    expect(() => requireSecret(SECRETS.anonJwt, { env: {}, readFile: files({}) })).toThrow(ConfigError);
    expect(() => requireSecret(SECRETS.anonJwt, { env: {}, readFile: files({}) })).toThrow(/SB_ANON_JWT/);
  });
});

describe('the checks on each secret', () => {
  it('the DSN: session pooler or direct, never 6543, and an explicit encrypted sslmode', () => {
    expect(assertSessionDsn(DSN)).toBe(DSN);
    expect(() => assertSessionDsn(DSN.replace(':5432/', ':6543/'))).toThrow(/6543/);
    expect(() => assertSessionDsn(DSN.replace('?uselibpqcompat=true&sslmode=require', ''))).toThrow(/sslmode/);
    expect(() => assertSessionDsn(DSN.replace('sslmode=require', 'sslmode=disable'))).toThrow(/sslmode=disable/);
    expect(() => assertSessionDsn('not a url')).toThrow(ConfigError);
    for (const bad of [DSN.replace(':5432/', ':6543/'), 'not a url']) {
      try {
        assertSessionDsn(bad);
      } catch (error) {
        expect(String((error as Error).message)).not.toContain('s3cret-pw');
      }
    }
  });

  it('the publishable key: never a secret key or a service_role JWT', () => {
    expect(assertPublishableKey('sb_publishable_abc')).toBe('sb_publishable_abc');
    expect(assertPublishableKey(jwt('anon'))).toBe(jwt('anon'));
    expect(() => assertPublishableKey('sb_secret_abc')).toThrow(/service key/);
    expect(() => assertPublishableKey(jwt('service_role'))).toThrow(/service key/);
  });

  it('the anon JWT: never a publishable key (embed-corpus has verify_jwt on), never a service key', () => {
    expect(assertAnonJwt(jwt('anon'))).toBe(jwt('anon'));
    expect(() => assertAnonJwt('sb_publishable_abc')).toThrow(/legacy anon JWT/);
    expect(() => assertAnonJwt('sb_secret_abc')).toThrow(/service key/);
    expect(() => assertAnonJwt(jwt('service_role'))).toThrow(/service key/);
  });
});

describe('loadConfig', () => {
  const secrets = {
    '/run/secrets/sync_runner_db_url': DSN,
    '/run/secrets/supabase_publishable_key': 'sb_publishable_abc\r\n',
    '/run/secrets/supabase_anon_jwt': `﻿${jwt('anon')}`,
  };

  it('reads the three secrets from /run/secrets and fills the defaults', () => {
    const c = loadConfig({ env: {}, readFile: files(secrets), repoRoot: '/app', tmpRoot: '/tmp' });
    expect(c).toEqual({
      dbUrl: DSN,
      anonKey: 'sb_publishable_abc',
      anonJwt: jwt('anon'),
      supabaseUrl: DEFAULT_SUPABASE_URL,
      keepaliveMinutes: 20,
      repoRoot: '/app',
      profileDir: '/home/pwuser/bb-profile',
      courseFilesDir: path.join('/app', 'course context'),
      stateDir: path.join('/tmp', 'bb2dash-sync'),
      tmpDir: path.join('/tmp', 'bb2dash-sync', 'downloads'),
    });
  });

  it('takes overrides from the environment', () => {
    const c = loadConfig({
      env: {
        KEEPALIVE_MINUTES: '0',
        BB_PROFILE_DIR: '/p',
        COURSE_FILES_DIR: '/c',
        SYNC_STATE_DIR: '/s',
        SYNC_TMP_DIR: '/t',
        SUPABASE_URL: 'https://other.supabase.co/',
      },
      readFile: files(secrets),
      repoRoot: '/app',
      tmpRoot: '/tmp',
    });
    expect(c).toMatchObject({ keepaliveMinutes: 0, profileDir: '/p', courseFilesDir: '/c', stateDir: '/s', tmpDir: '/t', supabaseUrl: 'https://other.supabase.co' });
  });

  it('refuses a plain-http Supabase URL and a missing secret', () => {
    expect(() => loadConfig({ env: { SUPABASE_URL: 'http://x' }, readFile: files(secrets), repoRoot: '/app', tmpRoot: '/tmp' })).toThrow(/https/);
    expect(() => loadConfig({ env: {}, readFile: files({}), repoRoot: '/app', tmpRoot: '/tmp' })).toThrow(/SYNC_RUNNER_DB_URL/);
  });
});

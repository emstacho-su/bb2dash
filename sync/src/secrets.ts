/**
 * The runner's secrets and runtime configuration.
 *
 * Three secrets, each read as `X` from the environment, else from the file `X_FILE` names, else from
 * the compose secret mounted at `/run/secrets/<name>` (so `docker compose exec sync node
 * sync/dist/enqueue.js` works without the entrypoint's shim):
 *   SYNC_RUNNER_DB_URL   sync_runner_db_url         the session-pooler DSN for `sync_runner`
 *   SB_ANON_KEY          supabase_publishable_key   Storage and bb_file_text inserts, the crawler's posts
 *   SB_ANON_JWT          supabase_anon_jwt          `embed-corpus` (verify_jwt on)
 * A value is stripped of a UTF-8 BOM, CR and LF (files written by PowerShell carry them). A service
 * key is refused in every slot: the service key never reaches this image (Stack's decision 16).
 * No error message carries a secret's value.
 */

import os from 'node:os';
import path from 'node:path';

import { parseKeepaliveMinutes } from './login.js';

export const DEFAULT_SUPABASE_URL = 'https://goultdzqcavefcgnifdy.supabase.co';
export const SECRETS_DIR = '/run/secrets';
export const DEFAULT_PROFILE_DIR = '/home/pwuser/bb-profile';
const TRANSACTION_POOLER_PORT = '6543';
const SSLMODE_ALLOWED = new Set(['require', 'verify-ca', 'verify-full', 'no-verify']);

export interface SecretSpec {
  env: string;
  file: string;
}

export const SECRETS = Object.freeze({
  dbUrl: { env: 'SYNC_RUNNER_DB_URL', file: 'sync_runner_db_url' },
  anonKey: { env: 'SB_ANON_KEY', file: 'supabase_publishable_key' },
  anonJwt: { env: 'SB_ANON_JWT', file: 'supabase_anon_jwt' },
} satisfies Record<string, SecretSpec>);

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

export interface SecretSource {
  env: Record<string, string | undefined>;
  /** The file's text, or null when it cannot be read. */
  readFile(file: string): string | null;
  secretsDir?: string;
}

export function cleanSecret(raw: string): string {
  return raw.replace(/^﻿/, '').replace(/[\r\n]/g, '').trim();
}

export function readSecret(spec: SecretSpec, src: SecretSource): string | null {
  const direct = src.env[spec.env];
  if (direct !== undefined && cleanSecret(direct) !== '') return cleanSecret(direct);

  const named = src.env[`${spec.env}_FILE`];
  if (named !== undefined && named.trim() !== '') {
    const text = src.readFile(named.trim());
    if (text === null) throw new ConfigError(`${spec.env}_FILE names a file that cannot be read`);
    const value = cleanSecret(text);
    return value === '' ? null : value;
  }

  const mounted = src.readFile(path.posix.join(src.secretsDir ?? SECRETS_DIR, spec.file));
  if (mounted === null) return null;
  const value = cleanSecret(mounted);
  return value === '' ? null : value;
}

export function requireSecret(spec: SecretSpec, src: SecretSource): string {
  const value = readSecret(spec, src);
  if (value === null) {
    throw new ConfigError(`${spec.env} is not set: set ${spec.env} or ${spec.env}_FILE, or mount the ${spec.file} secret`);
  }
  return value;
}

/** The role claim of a JWT-shaped string, or null. The signature is not checked; this is a guard. */
function jwtRole(token: string): string | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1]!, 'base64url').toString('utf8')) as { role?: unknown };
    return typeof payload.role === 'string' ? payload.role : null;
  } catch {
    return null;
  }
}

function refuseServiceKey(value: string, name: string): void {
  if (value.startsWith('sb_secret_') || jwtRole(value) === 'service_role') {
    throw new ConfigError(`${name} holds a service key; the sync runner takes only the publishable key and the anon JWT`);
  }
}

/** A session-pooler or direct DSN (never the transaction pooler: no `set` survives it) with an encrypted sslmode. */
export function assertSessionDsn(dsn: string): string {
  let url: URL;
  try {
    url = new URL(dsn);
  } catch {
    throw new ConfigError('SYNC_RUNNER_DB_URL is not a postgresql:// URL');
  }
  if (url.port === TRANSACTION_POOLER_PORT) {
    throw new ConfigError('SYNC_RUNNER_DB_URL points at port 6543, the transaction pooler; use the session pooler on 5432');
  }
  const sslmode = url.searchParams.get('sslmode')?.trim().toLowerCase() ?? null;
  if (sslmode === null) {
    throw new ConfigError('SYNC_RUNNER_DB_URL names no sslmode; append ?uselibpqcompat=true&sslmode=require');
  }
  if (!SSLMODE_ALLOWED.has(sslmode)) {
    throw new ConfigError(`SYNC_RUNNER_DB_URL sets sslmode=${sslmode}, which permits an unencrypted connection`);
  }
  return dsn;
}

export function assertPublishableKey(key: string): string {
  refuseServiceKey(key, 'SB_ANON_KEY');
  return key;
}

export function assertAnonJwt(token: string): string {
  refuseServiceKey(token, 'SB_ANON_JWT');
  if (token.startsWith('sb_publishable_')) {
    throw new ConfigError('SB_ANON_JWT holds a publishable key; embed-corpus has verify_jwt on and needs the legacy anon JWT');
  }
  return token;
}

export interface RunnerConfig {
  dbUrl: string;
  anonKey: string;
  anonJwt: string;
  supabaseUrl: string;
  keepaliveMinutes: number;
  repoRoot: string;
  profileDir: string;
  courseFilesDir: string;
  /** The heartbeat and the last probe, read by `probe.js`. */
  stateDir: string;
  /** Downloads land here first (tmpfs in the container). */
  tmpDir: string;
}

export interface ConfigSource extends SecretSource {
  repoRoot: string;
  tmpRoot?: string;
}

function supabaseUrlFrom(raw: string | undefined): string {
  const value = (raw ?? '').trim() || DEFAULT_SUPABASE_URL;
  if (!value.startsWith('https://')) throw new ConfigError('SUPABASE_URL must be an https:// URL');
  return value.replace(/\/+$/, '');
}

/** The database URL alone, for `enqueue.js`. */
export function loadDbUrl(src: SecretSource): string {
  return assertSessionDsn(requireSecret(SECRETS.dbUrl, src));
}

/** Where the heartbeat and the last probe live: SYNC_STATE_DIR, else `<tmp>/bb2dash-sync`. */
export function stateDirFrom(env: Record<string, string | undefined>, tmpRoot: string = os.tmpdir()): string {
  return env.SYNC_STATE_DIR?.trim() || path.join(tmpRoot, 'bb2dash-sync');
}

export function loadConfig(src: ConfigSource): RunnerConfig {
  const tmpRoot = src.tmpRoot ?? os.tmpdir();
  const stateDir = stateDirFrom(src.env, tmpRoot);
  return {
    dbUrl: loadDbUrl(src),
    anonKey: assertPublishableKey(requireSecret(SECRETS.anonKey, src)),
    anonJwt: assertAnonJwt(requireSecret(SECRETS.anonJwt, src)),
    supabaseUrl: supabaseUrlFrom(src.env.SUPABASE_URL),
    keepaliveMinutes: parseKeepaliveMinutes(src.env.KEEPALIVE_MINUTES),
    repoRoot: src.repoRoot,
    profileDir: src.env.BB_PROFILE_DIR?.trim() || DEFAULT_PROFILE_DIR,
    courseFilesDir: src.env.COURSE_FILES_DIR?.trim() || path.join(src.repoRoot, 'course context'),
    stateDir,
    tmpDir: src.env.SYNC_TMP_DIR?.trim() || path.join(tmpRoot, 'bb2dash-sync', 'downloads'),
  };
}

/** The two files the runner writes and `probe.js` reads. */
export function stateFiles(stateDir: string): { heartbeat: string; login: string } {
  return { heartbeat: path.join(stateDir, 'heartbeat'), login: path.join(stateDir, 'login.json') };
}

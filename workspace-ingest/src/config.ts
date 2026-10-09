/**
 * The worker's start-up checks. The secret reader, the pinned CA and the DSN parts are Phase 21's
 * (`workspace/src`), imported and not copied. The worker holds two secrets, both files: the ingest
 * role's session-pooler DSN and the public anon JWT the embed call needs. It holds no model, no
 * Claude token and no service key.
 */

import { ConfigError, cleanSecret, readDbCa, type Env, type ReadFile } from '../../workspace/src/config.js';
import { dsnParts } from '../../workspace/src/db.js';
import { INGEST_ROLE } from './constants.js';

export { ConfigError };

/** In-image paths: the seam with `docker/workspace-ingest`. */
export const PATHS = Object.freeze({
  dbUrlSecret: '/run/secrets/workspace_ingest_db_url',
  anonJwtSecret: '/run/secrets/supabase_anon_jwt',
  /** The worker's own directory; the entrypoint creates it, owned by `node`. */
  runDir: '/run/ingest',
  aliveFile: '/run/ingest/alive',
});

const DSN_SECRET_NAME = 'workspace_ingest_db_url';
const JWT_SECRET_NAME = 'supabase_anon_jwt';
const TRANSACTION_POOLER_PORT = 6543;
const SSLMODE_ALLOWED = new Set(['require', 'verify-ca', 'verify-full']);
const PUBLISHABLE_PREFIX = 'sb_publishable_';

export interface IngestConfig {
  /** The `workspace_ingest_runner` session-pooler DSN. Never logged. */
  readonly dbUrl: string;
  /** The pinned CA's certificate, PEM. */
  readonly dbCa: string;
  /** The legacy anon JWT: `workspace-embed` has `verify_jwt` on. Never logged. */
  readonly anonJwt: string;
}

function requireSecret(file: string, name: string, readFile: ReadFile): string {
  const value = cleanSecret(readFile(file) ?? '', `the secret ${name} (read at ${file})`);
  if (value === '') throw new ConfigError(`the secret ${name} is missing or empty (read at ${file})`);
  return value;
}

/** The session pooler as `workspace_ingest_runner`, with an sslmode that asks for a verified connection. */
export function assertIngestDsn(dsn: string): string {
  let parts;
  let sslmode: string | null;
  try {
    parts = dsnParts(dsn);
    sslmode = new URL(dsn).searchParams.get('sslmode')?.trim().toLowerCase() ?? null;
  } catch (error) {
    throw new ConfigError(`${DSN_SECRET_NAME}: ${error instanceof Error ? error.message.replace(/^db: /, '') : 'not a DSN'}`);
  }
  if (parts.port === TRANSACTION_POOLER_PORT) {
    throw new ConfigError(`${DSN_SECRET_NAME} points at port 6543, the transaction pooler; use the session pooler on 5432`);
  }
  // The pooler's user is `<role>.<project ref>`; the role is the part before the first dot.
  if (parts.user.split('.')[0] !== INGEST_ROLE) {
    throw new ConfigError(`${DSN_SECRET_NAME} does not log in as ${INGEST_ROLE}: the worker connects as that role or not at all`);
  }
  if (sslmode === null || !SSLMODE_ALLOWED.has(sslmode)) {
    throw new ConfigError(`${DSN_SECRET_NAME} must set sslmode=verify-full (or require / verify-ca)`);
  }
  return dsn;
}

/** The anon JWT is refused when it is a publishable key: the embed function would answer every call 401. */
export function assertAnonJwt(value: string): string {
  if (value.startsWith(PUBLISHABLE_PREFIX)) {
    throw new ConfigError(`${JWT_SECRET_NAME} holds a publishable key; the embed function needs the legacy anon JWT`);
  }
  return value;
}

export interface ConfigSource {
  readonly env: Env;
  readonly readFile: ReadFile;
}

export function loadConfig(source: ConfigSource): IngestConfig {
  const dbUrl = assertIngestDsn(requireSecret(PATHS.dbUrlSecret, DSN_SECRET_NAME, source.readFile));
  const anonJwt = assertAnonJwt(requireSecret(PATHS.anonJwtSecret, JWT_SECRET_NAME, source.readFile));
  return { dbUrl, anonJwt, dbCa: readDbCa(source.env, source.readFile) };
}

/**
 * The runner's database side: the twelve `sync_runner` functions of migration 091, and nothing
 * else. The role holds no table, view or sequence grant, so every call below is one of them.
 *
 * `createRpc` takes a bare query function, so the loop and the integration test run on a fake;
 * `createPgQuery` is the real one: one session-pooler connection, reconnected after a failure,
 * with one log line per connect (the platform refuses `log_connections` for the role, so this
 * line is the record of each login). Nothing here prints the DSN or any part of it.
 */

import pg from 'pg';

import { isValidSyncId } from '../../desktop/src/core/sync-id.js';
import type { FoldStatus, Report } from './report.js';

/** The application name the runner's sessions carry in pg_stat_activity. */
export const APPLICATION_NAME = 'bb2dash-sync-runner';

export type QueryResult = { rows: Record<string, unknown>[] };
export type QueryFn = (sql: string, params?: readonly unknown[]) => Promise<QueryResult>;

export interface SyncRequest {
  id: string;
  createdAt: string;
  params: Record<string, unknown>;
}

export interface RunOutcome {
  syncRunId: string | null;
  status: FoldStatus;
  summary: unknown;
}

export interface WorklistRow {
  id: string;
  file_name: string;
  relpath: string;
  mime: string | null;
  source_url: string;
  bucket: string;
  attempt_id: string | null;
}

/** One of the runner's own claimed sync requests (093's sync_own_claims). */
export interface OwnClaim {
  id: string;
  runId: string | null;
  claimedAt: string;
  claimAttempts: number;
}

export interface FileStoredArgs {
  id: string;
  key: string;
  relpath: string;
  sha256: string;
  bytes: number;
  mime: string;
  textStatus: 'extracted' | 'failed';
}

export interface SyncRpc {
  sweepStale(): Promise<number>;
  ownClaims(): Promise<OwnClaim[]>;
  next(): Promise<SyncRequest | null>;
  claim(id: string): Promise<boolean>;
  requeueOrphans(): Promise<number>;
  registerRun(id: string, runId: string): Promise<boolean>;
  runOutcome(runId: string): Promise<RunOutcome | null>;
  fileWorklist(): Promise<WorklistRow[]>;
  fileStored(args: FileStoredArgs): Promise<boolean>;
  close(id: string, state: 'done' | 'failed', report: Report): Promise<void>;
  enqueue(trigger: 'just' | 'login'): Promise<string | null>;
  loginOk(): Promise<number>;
  loginRequired(): Promise<string | null>;
}

const FOLD_STATUSES: readonly FoldStatus[] = ['running', 'ok', 'partial', 'failed'];

/** A bigint id off a row, as text; refused unless it is the shape the desktop's check accepts. */
export function asId(value: unknown, what: string): string {
  const text = typeof value === 'bigint' || typeof value === 'number' ? String(value) : value;
  if (typeof text !== 'string' || !isValidSyncId(text)) {
    throw new Error(`${what}: expected a numeric id, got ${JSON.stringify(text)}`);
  }
  return text;
}

function optionalId(value: unknown, what: string): string | null {
  return value === null || value === undefined ? null : asId(value, what);
}

function firstRow(result: QueryResult): Record<string, unknown> | undefined {
  return result.rows[0];
}

function asInt(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** The twelve functions, as typed calls. */
export function createRpc(query: QueryFn): SyncRpc {
  const scalar = async (sql: string, params?: readonly unknown[]): Promise<unknown> =>
    Object.values(firstRow(await query(sql, params)) ?? {})[0];

  return {
    async sweepStale() {
      return asInt(await scalar('select public.sync_sweep_stale() as n'));
    },
    async ownClaims() {
      const result = await query(
        'select id::text as id, run_id::text as run_id, claimed_at, claim_attempts from public.sync_own_claims()',
      );
      return result.rows.map((row) => ({
        id: asId(row.id, 'sync_own_claims'),
        runId: row.run_id === null || row.run_id === undefined ? null : String(row.run_id),
        claimedAt: row.claimed_at instanceof Date ? row.claimed_at.toISOString() : String(row.claimed_at ?? ''),
        claimAttempts: asInt(row.claim_attempts),
      }));
    },
    async next() {
      const row = firstRow(await query('select id::text as id, created_at, params from public.sync_next()'));
      if (!row) return null;
      const created = row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at);
      const params = row.params && typeof row.params === 'object' ? (row.params as Record<string, unknown>) : {};
      return { id: asId(row.id, 'sync_next'), createdAt: created, params };
    },
    async claim(id) {
      return (await scalar('select public.sync_claim($1::bigint) as ok', [asId(id, 'sync_claim')])) === true;
    },
    async requeueOrphans() {
      return asInt(await scalar('select public.sync_requeue_orphans() as n'));
    },
    async registerRun(id, runId) {
      const ok = await scalar('select public.sync_register_run($1::bigint, $2::uuid) as ok', [asId(id, 'sync_register_run'), runId]);
      return ok === true;
    },
    async runOutcome(runId) {
      const row = firstRow(
        await query('select sync_run_id::text as sync_run_id, status, summary from public.sync_run_outcome($1::uuid)', [runId]),
      );
      if (!row) return null;
      const status = String(row.status) as FoldStatus;
      if (!FOLD_STATUSES.includes(status)) throw new Error(`sync_run_outcome: unknown status ${JSON.stringify(row.status)}`);
      return { syncRunId: optionalId(row.sync_run_id, 'sync_run_outcome'), status, summary: row.summary ?? null };
    },
    async fileWorklist() {
      const result = await query(
        'select id::text as id, file_name, relpath, mime, source_url, bucket, attempt_id from public.sync_file_worklist()',
      );
      return result.rows.map((row) => ({
        id: asId(row.id, 'sync_file_worklist'),
        file_name: String(row.file_name ?? ''),
        relpath: String(row.relpath ?? ''),
        mime: row.mime === null || row.mime === undefined ? null : String(row.mime),
        source_url: String(row.source_url ?? ''),
        bucket: String(row.bucket ?? ''),
        attempt_id: row.attempt_id === null || row.attempt_id === undefined ? null : String(row.attempt_id),
      }));
    },
    async fileStored(a) {
      const ok = await scalar('select public.sync_file_stored($1::bigint, $2, $3, $4, $5::integer, $6, $7) as ok', [
        asId(a.id, 'sync_file_stored'),
        a.key,
        a.relpath,
        a.sha256,
        a.bytes,
        a.mime,
        a.textStatus,
      ]);
      return ok === true;
    },
    async close(id, state, report) {
      await query('select public.sync_close($1::bigint, $2, $3::jsonb)', [asId(id, 'sync_close'), state, JSON.stringify(report)]);
    },
    async enqueue(trigger) {
      return optionalId(await scalar('select public.sync_enqueue($1)::text as id', [trigger]), 'sync_enqueue');
    },
    async loginOk() {
      return asInt(await scalar('select public.sync_login_ok() as n'));
    },
    async loginRequired() {
      return optionalId(await scalar('select public.sync_login_required()::text as id'), 'sync_login_required');
    },
  };
}

/** Remove the DSN, its password and its host from any text the runner prints. */
export function redactDsn(text: string, dsn: string | null | undefined): string {
  let out = String(text ?? '');
  if (!dsn) return out;
  const secrets = [dsn];
  try {
    const url = new URL(dsn);
    if (url.password) secrets.push(url.password, decodeURIComponent(url.password));
    if (url.host) secrets.push(url.host);
    if (url.hostname) secrets.push(url.hostname);
  } catch {
    // Not a URL: the whole string is the only secret known.
  }
  for (const secret of secrets) {
    if (secret && secret.length >= 4) out = out.split(secret).join('<redacted>');
  }
  return out;
}

/** The parts of a pg.Client the runner uses. */
export interface PgClientLike {
  connect(): Promise<unknown>;
  query(sql: string, params?: readonly unknown[]): Promise<QueryResult>;
  end(): Promise<unknown>;
  on(event: 'error', listener: (error: Error) => void): unknown;
}

/**
 * True for a SQLSTATE that refuses one statement and leaves the session usable. Class 08
 * (connection exception), 57P (operator intervention: admin shutdown, cannot connect now) and
 * XX000 (internal error) are not: the client is dropped. So is anything without a SQLSTATE.
 */
export function isStatementError(code: unknown): boolean {
  if (typeof code !== 'string' || !/^[0-9A-Z]{5}$/.test(code)) return false;
  return !(code.startsWith('08') || code.startsWith('57P') || code === 'XX000');
}

/** A real pg.Client for the session-pooler DSN; connected by createPgQuery. */
export function newPgClient(dsn: string): PgClientLike {
  return new pg.Client({ connectionString: dsn, application_name: APPLICATION_NAME }) as unknown as PgClientLike;
}

export interface PgQueryDeps {
  dsn: string;
  log: (line: string) => void;
  newClient: (dsn: string) => PgClientLike;
  now?: () => Date;
}

/**
 * A query function over one long-lived connection. A failed connect or query drops the client, so
 * the next call connects afresh; the error is rethrown with the DSN redacted.
 */
export function createPgQuery(deps: PgQueryDeps): QueryFn & { end(): Promise<void> } {
  const now = deps.now ?? (() => new Date());
  let client: PgClientLike | null = null;
  let connecting: Promise<PgClientLike> | null = null;

  const drop = async (): Promise<void> => {
    const old = client;
    client = null;
    try {
      await old?.end();
    } catch {
      // The socket is already gone; closing it again is not news.
    }
  };

  const connected = async (): Promise<PgClientLike> => {
    if (client) return client;
    if (!connecting) {
      connecting = (async () => {
        const fresh = deps.newClient(deps.dsn);
        fresh.on('error', (error) => {
          deps.log(`db: connection error: ${redactDsn(error.message, deps.dsn)}`);
          if (client === fresh) client = null;
        });
        try {
          await fresh.connect();
          const who = await fresh.query('select current_user as role');
          deps.log(`db: connected as ${String(who.rows[0]?.role ?? 'unknown')} ${now().toISOString()}`);
        } catch (error) {
          try {
            await fresh.end();
          } catch {
            // Half-open; nothing to close.
          }
          throw error;
        }
        client = fresh;
        return fresh;
      })().finally(() => {
        connecting = null;
      });
    }
    return connecting;
  };

  const query = (async (sql: string, params?: readonly unknown[]) => {
    try {
      const c = await connected();
      return await c.query(sql, params);
    } catch (error) {
      const message = redactDsn(error instanceof Error ? error.message : String(error), deps.dsn);
      const code = (error as { code?: unknown })?.code;
      // A statement-level refusal leaves the connection usable; a socket error, or a SQLSTATE that
      // means the connection itself is gone or broken (R2 item 8), drops it so the next call reconnects.
      if (!isStatementError(code)) await drop();
      const wrapped = new Error(message) as Error & { code?: unknown };
      wrapped.code = code;
      throw wrapped;
    }
  }) as QueryFn & { end(): Promise<void> };
  query.end = drop;
  return query;
}

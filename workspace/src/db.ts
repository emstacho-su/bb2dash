/**
 * The runner's database side: the five `workspace_runner` functions of migration 142, and nothing
 * else. The role holds no table privilege, so every statement below is one of them.
 *
 * `createRpc` takes a bare query function, so the loop runs on a fake in tests; `createPgQuery` is
 * the real one: one session-pooler connection, reconnected after a failure, with one log line per
 * connect. The connection is verified against the pinned CA whatever the DSN says (`newPgClient`).
 * Nothing here prints the DSN or any part of it.
 */

import pg from 'pg';

import { messageOf, type ErrorCode } from './errors.js';
import type { HistoryMessage, ProviderId, StoredToolCall } from './providers/types.js';
import { isTier, type Tier } from './tiers.js';

/** The application name the runner's session carries in pg_stat_activity. */
export const APPLICATION_NAME = 'bb2dash-workspace-runner';

export type QueryResult = { rows: Record<string, unknown>[] };
export type QueryFn = (sql: string, params?: readonly unknown[]) => Promise<QueryResult>;

/** One claimed request, as `workspace_claim()` returns it. */
export interface Claim {
  readonly requestId: string;
  readonly conversationId: string;
  readonly userMessageId: string;
  /** The request's own user message. */
  readonly prompt: string;
  readonly claudeSessionId: string | null;
  /** The tier of the conversation's latest assistant message; null for a first question. */
  readonly priorTier: Tier | null;
  /** The last 20 messages before the request's user message, oldest first; `[]` for a first question. */
  readonly history: readonly HistoryMessage[];
}

export interface FinishArgs {
  readonly requestId: string;
  readonly state: 'done' | 'failed';
  readonly content: string;
  readonly toolCalls: readonly StoredToolCall[];
  readonly errorCode: ErrorCode | null;
  readonly costUsd: number | null;
  readonly durationMs: number;
  readonly claudeSessionId: string | null;
  readonly model: string | null;
}

export interface WorkspaceRpc {
  claim(runner: string): Promise<Claim | null>;
  begin(requestId: string, tier: Tier, provider: ProviderId, model: string): Promise<string>;
  /** False when the request is no longer claimed (the owner pressed Stop). An empty delta only asks. */
  stream(requestId: string, seq: number, delta: string): Promise<boolean>;
  finish(args: FinishArgs): Promise<void>;
  heartbeat(runner: string): Promise<void>;
}

const REQUEST_ID_SHAPE = /^[1-9][0-9]{0,18}$/;

function requestIdOf(value: unknown): string {
  const text = typeof value === 'bigint' || typeof value === 'number' ? String(value) : value;
  if (typeof text !== 'string' || !REQUEST_ID_SHAPE.test(text)) throw new Error('workspace_claim: the row holds no usable request id');
  return text;
}

const optionalText = (value: unknown): string | null => (typeof value === 'string' && value !== '' ? value : null);

function historyOf(value: unknown): HistoryMessage[] {
  let list: unknown = value;
  if (typeof value === 'string') {
    try {
      list = JSON.parse(value);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(list)) return [];
  return list.flatMap((entry): HistoryMessage[] => {
    if (typeof entry !== 'object' || entry === null) return [];
    const { role, content } = entry as { role?: unknown; content?: unknown };
    return (role === 'user' || role === 'assistant') && typeof content === 'string' ? [{ role, content }] : [];
  });
}

function claimOf(row: Record<string, unknown>): Claim {
  return {
    requestId: requestIdOf(row.request_id),
    conversationId: String(row.conversation_id ?? ''),
    userMessageId: String(row.user_message_id ?? ''),
    prompt: typeof row.prompt === 'string' ? row.prompt : '',
    claudeSessionId: optionalText(row.claude_session_id),
    priorTier: isTier(row.prior_tier) ? row.prior_tier : null,
    history: historyOf(row.history),
  };
}

/** The five functions, as typed calls. */
export function createRpc(query: QueryFn): WorkspaceRpc {
  return {
    async claim(runner) {
      const result = await query(
        'select request_id::text as request_id, conversation_id::text as conversation_id, user_message_id::text as user_message_id, ' +
          'prompt, claude_session_id, prior_tier, history from public.workspace_claim($1)',
        [runner],
      );
      const row = result.rows[0];
      return row ? claimOf(row) : null;
    },
    async begin(requestId, tier, provider, model) {
      const result = await query('select public.workspace_begin($1::bigint, $2, $3, $4)::text as id', [requestId, tier, provider, model]);
      return String(result.rows[0]?.id ?? '');
    },
    async stream(requestId, seq, delta) {
      const result = await query('select public.workspace_stream($1::bigint, $2::integer, $3) as ok', [requestId, seq, delta]);
      return result.rows[0]?.ok === true;
    },
    async finish(args) {
      await query('select public.workspace_finish($1::bigint, $2, $3, $4::jsonb, $5, $6::numeric, $7::integer, $8, $9)', [
        args.requestId,
        args.state,
        args.content,
        JSON.stringify(args.toolCalls),
        args.errorCode,
        args.costUsd,
        Math.round(args.durationMs),
        args.claudeSessionId,
        args.model,
      ]);
    },
    async heartbeat(runner) {
      await query('select public.workspace_heartbeat($1)', [runner]);
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

/**
 * The SQLSTATE of a refusal one of the five functions raises itself (migration 142, "REFUSALS"):
 * the call was understood and turned down, so trying it again cannot change the answer.
 */
export const REFUSAL_SQLSTATE = '22023';

/** True when `error` is one of the functions' own refusals, never a failure to reach the database. */
export function isRefusal(error: unknown): boolean {
  return (error as { code?: unknown } | null | undefined)?.code === REFUSAL_SQLSTATE;
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
 * (connection exception), 57P (operator intervention) and XX000 (internal error) are not: the
 * client is dropped. So is anything without a SQLSTATE.
 */
export function isStatementError(code: unknown): boolean {
  if (typeof code !== 'string' || !/^[0-9A-Z]{5}$/.test(code)) return false;
  return !(code.startsWith('08') || code.startsWith('57P') || code === 'XX000');
}

/** The SQLSTATE classes of a failure that is the statement's own: data exception, integrity constraint violation, syntax error or access rule violation. */
const OWN_FAILURE_CLASSES = ['22', '23', '42'] as const;

/**
 * True when the database refused a statement for what it is or holds (ruling Z1, R2-5): a value it
 * cannot store, a constraint, a function it cannot call. The same statement gets the same answer,
 * so it is not tried again. Narrower than `isStatementError`: a statement cut at its time limit
 * (57014) leaves the session usable too, and may go through on another try. Never 22023, the
 * functions' own refusal, which keeps the meaning `isRefusal` gives it.
 */
export function isBadStatement(error: unknown): boolean {
  const code = (error as { code?: unknown } | null | undefined)?.code;
  if (typeof code !== 'string' || !isStatementError(code) || code === REFUSAL_SQLSTATE) return false;
  return OWN_FAILURE_CLASSES.some((sqlClass) => code.startsWith(sqlClass));
}

/**
 * Bounds on the connection, so a database that cannot be reached fails a call instead of holding
 * it: the heartbeat then stops succeeding and the watchdog can do its work.
 */
export const PG_CLIENT_OPTIONS = Object.freeze({
  application_name: APPLICATION_NAME,
  /** A connect that has not answered by now is given up. */
  connectionTimeoutMillis: 10_000,
  /** Above the role's own 15 s statement_timeout: the database refuses first when it can. */
  query_timeout: 20_000,
  keepAlive: true,
});

/** The parts of the runner DSN a connection is made from. Its query string is not among them. */
export interface DsnParts {
  readonly host: string;
  readonly port: number;
  readonly user: string;
  readonly password: string;
  readonly database: string;
}

/** The session pooler's port, read when the DSN names none. */
const DEFAULT_PG_PORT = 5432;
/** Port 0 is no port: the driver takes `PGPORT` or its own default in its place. */
const NO_PORT = 0;

/**
 * The five parts of the DSN, percent-decoded. Every part must be there: the driver fills an empty
 * one from the `PG*` environment or its own defaults, and the runner connects to what its secret
 * names or not at all. Port 0 is refused for the same reason, as `assertRunnerDsn` refuses it at
 * start (ruling X1). The message names the part, never a value.
 */
export function dsnParts(dsn: string): DsnParts {
  let url: URL;
  try {
    url = new URL(dsn);
  } catch {
    throw new Error('db: the DSN is not a URL');
  }
  let parts: DsnParts;
  try {
    parts = {
      host: url.hostname,
      port: url.port === '' ? DEFAULT_PG_PORT : Number(url.port),
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      database: decodeURIComponent(url.pathname.replace(/^\//, '')),
    };
  } catch {
    throw new Error('db: the DSN holds a part that is not percent-encoded text');
  }
  for (const name of ['host', 'user', 'password', 'database'] as const) {
    if (parts[name] === '') throw new Error(`db: the DSN names no ${name}`);
  }
  if (parts.port === NO_PORT) throw new Error('db: the DSN points at port 0, which is no port');
  return parts;
}

/**
 * A real pg.Client for the session pooler; connected by createPgQuery (ruling V1, SR-1).
 *
 * It is built from the DSN's parsed parts and never from the DSN string, so nothing in the DSN's
 * query string reaches the driver: `sslmode=no-verify`, `uselibpqcompat=true` and `sslrootcert`
 * cannot switch verification off or point it at another file. The pooler's certificate is verified
 * against `ca` alone (not the system's store) and against the host name the DSN gives.
 */
export function newPgClient(dsn: string, ca: string): PgClientLike {
  const { host, port, user, password, database } = dsnParts(dsn);
  const ssl = { ca, rejectUnauthorized: true, servername: host };
  return new pg.Client({ host, port, user, password, database, ssl, ...PG_CLIENT_OPTIONS }) as unknown as PgClientLike;
}

export interface PgQueryDeps {
  readonly dsn: string;
  /** The pinned CA's certificate, PEM. */
  readonly ca: string;
  readonly log: (line: string) => void;
  readonly newClient: (dsn: string, ca: string) => PgClientLike;
}

/**
 * A query function over one long-lived connection. A failed query drops the connection it ran on,
 * and only that one: with two calls in flight the later failure must not close the connection
 * opened since. A failed connect closes its own half-open client. Either way the next call
 * connects afresh, and the error is rethrown with the DSN redacted.
 */
export function createPgQuery(deps: PgQueryDeps): QueryFn & { end(): Promise<void> } {
  let client: PgClientLike | null = null;
  let connecting: Promise<PgClientLike> | null = null;
  /** Connections already closed here, so two failed calls on one connection close it once. */
  const closed = new WeakSet<PgClientLike>();

  /** Close `target` and stop handing it out. The current connection is touched only when it is `target`. */
  const drop = async (target: PgClientLike | null): Promise<void> => {
    if (target === null || closed.has(target)) return;
    closed.add(target);
    if (client === target) client = null;
    try {
      await target.end();
    } catch {
      // The socket is already gone; closing it again is not news.
    }
  };

  /** The error a caller sees: the DSN redacted, the SQLSTATE kept. */
  const redacted = (error: unknown): Error & { code?: unknown } => {
    const message = redactDsn(messageOf(error), deps.dsn);
    return Object.assign(new Error(message), { code: (error as { code?: unknown })?.code });
  };

  const connect = async (): Promise<PgClientLike> => {
    const fresh = deps.newClient(deps.dsn, deps.ca);
    fresh.on('error', (error) => {
      deps.log(`db: connection error: ${redactDsn(error.message, deps.dsn)}`);
      if (client === fresh) client = null;
    });
    try {
      await fresh.connect();
      const who = await fresh.query('select current_user as role');
      deps.log(`db: connected as ${String(who.rows[0]?.role ?? 'unknown')}`);
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
  };

  const connected = (): Promise<PgClientLike> => {
    if (client) return Promise.resolve(client);
    connecting ??= connect().finally(() => {
      connecting = null;
    });
    return connecting;
  };

  const run = async (sql: string, params?: readonly unknown[]): Promise<QueryResult> => {
    // A connect that fails has no connection to drop: connect() closed its own client.
    const ranOn = await connected().catch((error: unknown) => {
      throw redacted(error);
    });
    try {
      return await ranOn.query(sql, params);
    } catch (error) {
      const failure = redacted(error);
      if (!isStatementError(failure.code)) await drop(ranOn);
      throw failure;
    }
  };

  return Object.assign(run, { end: (): Promise<void> => drop(client) });
}

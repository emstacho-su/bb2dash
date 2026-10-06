/**
 * The runner's constants (brief 102, Contract, "The runner" and "Heartbeat, health and shutdown").
 * Every number the loop, the provider and the healthcheck share is named here, with the start-up
 * guards: the key guard, the runner DSN's checks, the pinned CA and the per-answer budget.
 */

import fs from 'node:fs';

/** The one CLI version the image pins and the fixtures are recorded on; the init-line check compares against it. */
export const CLAUDE_CODE_VERSION = '2.1.289';

/** The CLI, found on PATH and spawned as an argv array, never through a shell. */
export const CLAUDE_BIN = 'claude';

/** In-image paths: the seam with the image (pinned by test/mcp-config.test.ts). */
export const PATHS = Object.freeze({
  /** The runner's own directory: created by the entrypoint, 0700, owned by `node`. */
  runDir: '/run/workspace',
  /** The MCP config the runner writes at start, mode 0600. */
  mcpConfig: '/run/workspace/mcp.json',
  /** Touched after every successful heartbeat; the healthcheck reads its age. */
  aliveFile: '/run/workspace/alive',
  settings: '/app/workspace/claude/settings.json',
  systemPrompt: '/app/workspace/prompts/system.md',
  /** The CLI's working directory: empty, so no project settings or memory files load. */
  turnCwd: '/app/turn',
  runnerDbUrlSecret: '/run/secrets/workspace_runner_db_url',
  oauthTokenSecret: '/run/secrets/claude_oauth_token',
  /** The CA the pooler's certificate is verified against, unless DB_CA_FILE_ENV names another file. */
  dbCaFile: '/app/certs/prod-ca.crt',
});

/** Names the file that holds the pinned CA (PEM); PATHS.dbCaFile when it is not set. */
export const DB_CA_FILE_ENV = 'WORKSPACE_DB_CA_FILE';

/** How often the runner asks for the next queued request. */
export const POLL_INTERVAL_MS = 2000;
/** One turn at a time: the plan's limits are shared with the owner's own sessions. */
export const TURN_CONCURRENCY = 1;
/** Answer text is sent to the page in flushes this far apart. */
export const STREAM_FLUSH_MS = 250;
/** With no text flushed for this long, the runner asks whether the request is still claimed. */
export const CANCEL_POLL_MS = 2000;
/** A turn is killed here, under the database's 10-minute stale-claim sweep. */
export const TURN_TIMEOUT_MS = 8 * 60 * 1000;
/** After its `result` line the CLI gets this long to exit; then it is killed and the result is kept. */
export const RESULT_EXIT_GRACE_MS = 10_000;
/** The heartbeat's own timer, during turns too. */
export const HEARTBEAT_MS = 30_000;
/** With no heartbeat success for this long the runner exits non-zero, so the container restarts. */
export const DB_WATCHDOG_MS = 180_000;
/** The healthcheck passes while the alive file is younger than this. */
export const HEALTH_MAX_AGE_MS = 90_000;

/**
 * `workspace_finish()`, and `workspace_begin()` before it, are tried again for this long when the
 * database fails them, so a finished answer outlives a short outage. Under DB_WATCHDOG_MS; the
 * watchdog does not end the process while a finish is inside this window.
 */
export const FINISH_RETRY_MS = 170_000;
/** The wait before the second try; each later wait is twice the one before it. */
export const FINISH_BACKOFF_FIRST_MS = 1000;
/** No wait between two tries is longer than this. */
export const FINISH_BACKOFF_MAX_MS = 15_000;

/** At most this many stored messages are replayed on a fresh start. */
export const HISTORY_REPLAY = 20;
/** The replay with its framing stays within this many bytes of UTF-8 (96 KiB). */
export const REPLAY_MAX_BYTES = 96 * 1024;
/** The kernel's limit on one argument; the prompt element stays under it. */
export const ARG_MAX_BYTES = 131_072;

/** `workspace_stream()` refuses a delta longer than this; the runner splits first. */
export const STREAM_DELTA_MAX_CHARS = 16_000;
/** `workspace_finish()` stores at most this much content; the runner cuts first and logs. */
export const CONTENT_MAX_CHARS = 100_000;
/** Only the first calls of a turn are stored, in call order. */
export const TOOL_CALLS_MAX = 20;
/** A stored tool call's `query` is cut here. */
export const TOOL_QUERY_MAX_CHARS = 200;

/** The per-answer cost cap (`WORKSPACE_TURN_BUDGET_USD`): its default and the range it is refused outside. */
export const TURN_BUDGET_DEFAULT_USD = 1.0;
export const TURN_BUDGET_MIN_USD = 0.01;
export const TURN_BUDGET_MAX_USD = 1.0;
export const TURN_BUDGET_ENV = 'WORKSPACE_TURN_BUDGET_USD';

/**
 * The O-2 switch. True: the budget recording (`test/fixtures/claude-stream-budget-stop.jsonl`)
 * showed the CLI stopping a turn at `--max-budget-usd`. It is set false only if a recording ends
 * `success` with two or more turns and a cost above the cap; the runner then appends
 * NO_CAP_SENTENCE as the stored answer's last line.
 */
export const BUDGET_CAP_HOLDS = true;
export const NO_CAP_SENTENCE = 'No per-answer cost limit applies to this answer.';

/**
 * Variables the runner refuses to start with. An API key, an auth token and the provider switches
 * outrank the OAuth token, so a turn would be billed elsewhere; a base URL would send the token to
 * another host; simple mode never reads the token.
 */
export const REFUSED_ENV_NAMES = ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_BASE_URL', 'CLAUDE_CODE_SIMPLE'] as const;
export const REFUSED_ENV_PREFIX = 'CLAUDE_CODE_USE_';

const TRANSACTION_POOLER_PORT = '6543';
/**
 * The sslmodes a DSN may carry. None of them decides how the connection is made: the runner
 * verifies the pooler's certificate against the pinned CA whatever the DSN says (`db.ts`). A mode
 * that asks for less (`no-verify` among them) is refused, so the stored secret never reads as if
 * less were in force.
 */
const SSLMODE_ALLOWED = new Set(['require', 'verify-ca', 'verify-full']);
const PEM_CERTIFICATE_HEADER = '-----BEGIN CERTIFICATE-----';
/** The byte-order mark an editor may put in front of a file's text, by its code point. */
const BYTE_ORDER_MARK = String.fromCharCode(0xfeff);
const withoutMark = (text: string): string => (text.startsWith(BYTE_ORDER_MARK) ? text.slice(BYTE_ORDER_MARK.length) : text);
/** Dollars with at most two decimals: the flag is written with two, so a third would reach the CLI rounded. */
const BUDGET_SHAPE = /^\d+(\.\d{1,2})?$/;
const RUNNER_NAME_PREFIX = 'workspace@';
const DSN_SECRET_NAME = 'workspace_runner_db_url';
const TOKEN_SECRET_NAME = 'claude_oauth_token';

/** A start-up refusal. Its message names a variable or a file, never a value. */
export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

export type Env = Readonly<Record<string, string | undefined>>;
/** A file's text, or null when it does not exist. */
export type ReadFile = (file: string) => string | null;

/** The one file reader for secrets: the text, or null when the file does not exist. Any other failure names the path, never the contents. */
export function readTextOrNull(file: string): string | null {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch (error) {
    const code = (error as { code?: unknown })?.code;
    if (code === 'ENOENT') return null;
    throw new ConfigError(`cannot read ${file}: ${typeof code === 'string' ? code : 'unreadable'}`);
  }
}

/** The refused variables that are set, an empty value included, in the environment's own order. */
export function refusedEnvNames(env: Env): string[] {
  return Object.keys(env).filter(
    (name) => env[name] !== undefined && ((REFUSED_ENV_NAMES as readonly string[]).includes(name) || name.startsWith(REFUSED_ENV_PREFIX)),
  );
}

/** The key guard: the runner answers on the subscription token or not at all. */
export function assertSubscriptionEnv(env: Env): void {
  const refused = refusedEnvNames(env);
  if (refused.length > 0) {
    throw new ConfigError(`refusing to start with ${refused.join(', ')} set: the Workspace runs on the subscription token only`);
  }
}

/** A secret file's value without the byte-order mark and line ends an editor may have added. */
export function cleanSecret(raw: string): string {
  return raw.replace(/^\uFEFF/, '').replace(/[\r\n]/g, '').trim();
}

/**
 * `WORKSPACE_TURN_BUDGET_USD` in dollars: 1.00 when unset, refused outside 0.01 to 1.00 and with a
 * third decimal, so `--max-budget-usd` receives the amount as it was written.
 */
export function parseTurnBudget(raw: string | undefined): number {
  const value = (raw ?? '').trim();
  if (value === '') return TURN_BUDGET_DEFAULT_USD;
  const dollars = BUDGET_SHAPE.test(value) ? Number(value) : Number.NaN;
  if (!Number.isFinite(dollars) || dollars < TURN_BUDGET_MIN_USD || dollars > TURN_BUDGET_MAX_USD) {
    const range = `${TURN_BUDGET_MIN_USD.toFixed(2)} to ${TURN_BUDGET_MAX_USD.toFixed(2)}`;
    throw new ConfigError(`${TURN_BUDGET_ENV} must be an amount from ${range} with at most two decimals`);
  }
  return dollars;
}

/**
 * The session pooler (never the transaction pooler on 6543) with an sslmode that asks for an
 * encrypted, verified connection. The check reads what the secret says; what is enforced is in
 * `db.ts`, which verifies against the pinned CA whatever the DSN says.
 */
export function assertRunnerDsn(dsn: string): string {
  let url: URL;
  try {
    url = new URL(dsn);
  } catch {
    throw new ConfigError(`${DSN_SECRET_NAME} is not a postgresql:// URL`);
  }
  if (url.port === TRANSACTION_POOLER_PORT) {
    throw new ConfigError(`${DSN_SECRET_NAME} points at port 6543, the transaction pooler; use the session pooler on 5432`);
  }
  // The connection is made from these parts alone, so each must be there (`db.ts`, `dsnParts`).
  const parts = { host: url.hostname, user: url.username, password: url.password, database: url.pathname.replace(/^\//, '') };
  for (const name of ['host', 'user', 'password', 'database'] as const) {
    if (parts[name] === '') throw new ConfigError(`${DSN_SECRET_NAME} names no ${name}`);
  }
  const sslmode = url.searchParams.get('sslmode')?.trim().toLowerCase() ?? null;
  if (sslmode === null) throw new ConfigError(`${DSN_SECRET_NAME} names no sslmode; append ?sslmode=verify-full`);
  if (!SSLMODE_ALLOWED.has(sslmode)) {
    throw new ConfigError(`${DSN_SECRET_NAME} sets an sslmode that asks for less than an encrypted, verified connection; use sslmode=verify-full`);
  }
  return dsn;
}

/**
 * The pinned CA, read at start (ruling V1, SR-1): the PEM text of the file DB_CA_FILE_ENV names, or
 * of PATHS.dbCaFile. A file that is missing, empty or holds no certificate stops the start: the
 * runner never connects without it. The message names the file and the variable, never the text.
 */
export function readDbCa(env: Env, readFile: ReadFile): string {
  const named = (env[DB_CA_FILE_ENV] ?? '').trim();
  const file = named === '' ? PATHS.dbCaFile : named;
  const text = withoutMark(readFile(file) ?? '');
  if (text.trim() === '') {
    throw new ConfigError(`the CA file ${file} (${DB_CA_FILE_ENV}) is missing or empty: the database connection is not made without it`);
  }
  if (!text.includes(PEM_CERTIFICATE_HEADER)) {
    throw new ConfigError(`the CA file ${file} (${DB_CA_FILE_ENV}) holds no PEM certificate: the database connection is not made without it`);
  }
  return text;
}

function requireSecret(file: string, name: string, readFile: ReadFile): string {
  const value = cleanSecret(readFile(file) ?? '');
  if (value === '') throw new ConfigError(`the secret ${name} is missing or empty (read at ${file})`);
  return value;
}

/** The subscription token, read from its file immediately before each CLI start. */
export function readOauthToken(readFile: ReadFile): string {
  return requireSecret(PATHS.oauthTokenSecret, TOKEN_SECRET_NAME, readFile);
}

export interface RunnerConfig {
  /** The `workspace_runner` session-pooler DSN. Never logged. */
  readonly dbUrl: string;
  /** The pinned CA's certificate, PEM: the only authority the pooler's certificate is verified against. */
  readonly dbCa: string;
  readonly budgetUsd: number;
  /** The name the runner claims and sends heartbeats under. */
  readonly runnerName: string;
}

export interface ConfigSource {
  readonly env: Env;
  readonly readFile: ReadFile;
  readonly hostname: string;
}

/** Everything the runner needs to start. The environment is checked before any secret is read. */
export function loadConfig(source: ConfigSource): RunnerConfig {
  assertSubscriptionEnv(source.env);
  const budgetUsd = parseTurnBudget(source.env[TURN_BUDGET_ENV]);
  const dbUrl = assertRunnerDsn(requireSecret(PATHS.runnerDbUrlSecret, DSN_SECRET_NAME, source.readFile));
  const dbCa = readDbCa(source.env, source.readFile);
  return { dbUrl, dbCa, budgetUsd, runnerName: `${RUNNER_NAME_PREFIX}${source.hostname}` };
}

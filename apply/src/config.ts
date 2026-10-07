/**
 * The apply worker's constants and its start-up checks (Phase 23).
 *
 * The subscription guard, the secret reader, the pinned CA and the token reader are Phase 21's
 * (`workspace/src/config.ts`), imported and not copied: there is one implementation of the code
 * that decides which credential a `claude -p` run uses.
 */

import {
  ConfigError,
  assertSubscriptionEnv,
  cleanSecret,
  readDbCa,
  type Env,
  type ReadFile,
} from '../../workspace/src/config.js';
import { dsnParts } from '../../workspace/src/db.js';

/** What `inbox_apply_claim()` writes in `claimed_by` (migration 181); the web reads the same word. */
export const CLAIMANT = 'inbox-apply-runner';

/** How often the worker asks for the next queued request. */
export const POLL_INTERVAL_MS = 10_000;
/** At most this many items go to Claude in one run; the close files a follow-up for the rest. */
export const BATCH_MAX_ITEMS = 6;
/**
 * The run is killed at 14 minutes: the longest recorded /inbox-apply run was 11.3, and the sync
 * runner's sweep flags a claim at 20, so two minutes are left to read the facts and close.
 */
export const RUN_TIMEOUT_MS = 14 * 60_000;
/** SIGTERM first; SIGKILL when the CLI is still there after this long. */
export const KILL_GRACE_MS = 5_000;
/** Runs that start Claude per New York day. A queue that cannot be applied retries on each sync, not forever. */
export const MAX_RUNS_PER_DAY = 12;
/** The healthcheck's limit on the alive file's age. */
export const HEALTH_MAX_AGE_MS = 90_000;

/** `--max-budget-usd` for one run: the CLI's own soft cap, in dollars. */
export const RUN_BUDGET_ENV = 'APPLY_RUN_BUDGET_USD';
export const RUN_BUDGET_DEFAULT_USD = 3.0;
export const RUN_BUDGET_MIN_USD = 0.1;
export const RUN_BUDGET_MAX_USD = 10.0;

/** The session that reads the skill, and the two agents it starts (the skill's three roles). */
export const ORCHESTRATOR_MODEL = 'sonnet';
export const CONTEXT_MODEL = 'sonnet';
export const WRITER_MODEL = 'opus';
export const CONTEXT_AGENT = 'inbox-context';
export const WRITER_AGENT = 'inbox-writer';

export const QUERY_TOOL = 'mcp__db__query';
export const EXECUTE_TOOL = 'mcp__db__execute_sql';
export const MATERIALS_TOOLS = [
  'mcp__bb2dash__search_materials',
  'mcp__bb2dash__get_material_text',
  'mcp__bb2dash__list_courses',
] as const;
/** The CLI's sub-agent tool: `Agent` in a tool call, `Task` in the init line of the pinned version. */
export const AGENT_TOOL_NAMES = ['Agent', 'Task'] as const;
/** Built-in tools removed from the model's view; `--tools Agent` already leaves only the first. */
export const DISALLOWED_TOOLS = ['Bash', 'Read', 'Write', 'Edit', 'WebFetch', 'WebSearch', 'Glob', 'Grep', 'NotebookEdit'] as const;
export const MCP_SERVERS = ['bb2dash', 'db'] as const;
export const SKILL_NAME = 'inbox-apply';

/** In-image paths: the seam with `docker/apply/Dockerfile`. */
export const PATHS = Object.freeze({
  /** The worker's own directory: created by the entrypoint, 0700, owned by `node`. */
  runDir: '/run/apply',
  mcpConfig: '/run/apply/mcp.json',
  aliveFile: '/run/apply/alive',
  settings: '/app/apply/claude/settings.json',
  /** The CLI's working directory: it holds `.claude/skills/inbox-apply` and nothing else. */
  runCwd: '/app/apply/run',
  skillDir: '/app/apply/run/.claude/skills/inbox-apply',
  sqlServer: '/app/apply/dist/mcp-sql/server.js',
  materialsServer: '/app/mcp-materials/dist/index.js',
  dbUrlSecret: '/run/secrets/inbox_apply_db_url',
  serviceKeySecret: '/run/secrets/bb2dash_mcp_service_key',
});

const DSN_SECRET_NAME = 'inbox_apply_db_url';
const DSN_ROLE = 'inbox_apply_runner';
const TRANSACTION_POOLER_PORT = 6543;
const SSLMODE_ALLOWED = new Set(['require', 'verify-ca', 'verify-full']);
const BUDGET_SHAPE = /^\d+(\.\d{1,2})?$/;

export interface ApplyConfig {
  /** The `inbox_apply_runner` session-pooler DSN. Never logged. */
  readonly dbUrl: string;
  /** The pinned CA's certificate, PEM. */
  readonly dbCa: string;
  readonly budgetUsd: number;
}

/**
 * The session pooler as `inbox_apply_runner`, with an sslmode that asks for a verified connection.
 * What is enforced is in `workspace/src/db.ts`, which connects from the parsed parts and verifies
 * against the pinned CA whatever the DSN says; this reads what the secret says, at start.
 */
export function assertApplyDsn(dsn: string): string {
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
  if (parts.user.split('.')[0] !== DSN_ROLE) {
    throw new ConfigError(`${DSN_SECRET_NAME} does not log in as ${DSN_ROLE}: the worker connects as that role or not at all`);
  }
  if (sslmode === null || !SSLMODE_ALLOWED.has(sslmode)) {
    throw new ConfigError(`${DSN_SECRET_NAME} must set sslmode=verify-full (or require / verify-ca)`);
  }
  return dsn;
}

/** `APPLY_RUN_BUDGET_USD` in dollars: 3.00 when unset, refused outside 0.10 to 10.00 or with a third decimal. */
export function parseRunBudget(raw: string | undefined): number {
  const value = (raw ?? '').trim();
  if (value === '') return RUN_BUDGET_DEFAULT_USD;
  const dollars = BUDGET_SHAPE.test(value) ? Number(value) : Number.NaN;
  if (!Number.isFinite(dollars) || dollars < RUN_BUDGET_MIN_USD || dollars > RUN_BUDGET_MAX_USD) {
    throw new ConfigError(
      `${RUN_BUDGET_ENV} must be an amount from ${RUN_BUDGET_MIN_USD.toFixed(2)} to ${RUN_BUDGET_MAX_USD.toFixed(2)} with at most two decimals`,
    );
  }
  return dollars;
}

export interface ConfigSource {
  readonly env: Env;
  readonly readFile: ReadFile;
}

/** Everything the worker needs to start. The environment is checked before any secret is read. */
export function loadConfig(source: ConfigSource): ApplyConfig {
  assertSubscriptionEnv(source.env);
  const budgetUsd = parseRunBudget(source.env[RUN_BUDGET_ENV]);
  const raw = cleanSecret(source.readFile(PATHS.dbUrlSecret) ?? '', `the secret ${DSN_SECRET_NAME} (read at ${PATHS.dbUrlSecret})`);
  if (raw === '') throw new ConfigError(`the secret ${DSN_SECRET_NAME} is missing or empty (read at ${PATHS.dbUrlSecret})`);
  return { dbUrl: assertApplyDsn(raw), dbCa: readDbCa(source.env, source.readFile), budgetUsd };
}

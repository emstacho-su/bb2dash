// bb2dash :: scripts/db-test.mjs
// The SQL test runner (Phase 15, brief 95 §Contract, R-79). Runs the files in db/tests/ against
// prod as `db_test_runner`, one pg.Client per unit, each unit inside the transaction the file
// opens itself and rolls back.
//
//   node scripts/db-test.mjs                      every unit in db/tests, in name order
//   node scripts/db-test.mjs --only <file.sql>    one db/tests file (with its loader, if it has one)
//   node scripts/db-test.mjs --file <path.sql>    one file from anywhere
//   node scripts/db-test.mjs <path.sql>           the positional form of --file
//   node scripts/db-test.mjs --list               print the plan, never connect
//   node scripts/db-test.mjs --ping               connect and print the role
//
// Exit 0 when nothing failed, 1 when a unit failed, 2 on a usage, config, lint or connection
// error. The credential is `BB2DASH_TEST_DB_URL`, from the process environment or from
// `.env.local` at the root of this checkout (gitignored). A transaction-pooler DSN (port 6543) is
// refused: units run `set local role` mid-transaction. No output ever holds the DSN or its
// password.
//
// Importing this module has no side effects. `loadDsn()` and `openClient()` are exported so a
// later Node script reuses this one credential instead of adding a second.

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const REPO_ROOT = path.resolve(import.meta.dirname, '..');
const USAGE =
  'usage: node scripts/db-test.mjs [--only <file.sql> | --file <path.sql> | <path.sql> | --list | --ping]';

/** The frozen loader map (brief 95 §Contract, "Units"). A loader never runs alone. */
export const LOADER_MAP = Object.freeze({
  'phase10a_stage_gradebook.sql': 'phase10a_load_fixtures.sql',
  'phase10a_stage_attempts.sql': 'phase10a_load_fixtures.sql',
  'phase12b_085_stage_attempts_v4.sql': 'phase12b_load_fixture.sql',
});

/** The loader files themselves, derived from the map so the two can never drift. */
export const LOADER_FILES = Object.freeze([...new Set(Object.values(LOADER_MAP))]);

/** Every failure the runner reports as exit 2. */
export class RunnerError extends Error {
  constructor(message) {
    super(message);
    this.name = 'RunnerError';
  }
}

// ---------------------------------------------------------------------------------------------
// The plan
// ---------------------------------------------------------------------------------------------

/**
 * Build the unit plan from a list of db/tests basenames. A unit is a test file, or a loader
 * followed by its test file. Loaders are never units of their own.
 */
export function buildPlan(names) {
  const sqlNames = [...names].filter((n) => n.endsWith('.sql')).sort();
  const units = [];
  for (const name of sqlNames) {
    if (LOADER_FILES.includes(name)) continue;
    const loader = LOADER_MAP[name];
    units.push({
      index: units.length + 1,
      name,
      files: loader ? [loader, name] : [name],
    });
  }
  return units;
}

/** The frozen `--list` line for one unit. */
export function formatPlanLine(unit) {
  return `unit ${String(unit.index).padStart(2, '0')}  ${unit.files.join(' + ')}`;
}

// ---------------------------------------------------------------------------------------------
// Arguments
// ---------------------------------------------------------------------------------------------

/** Parse argv (everything after the script path). Throws a RunnerError on any usage mistake. */
export function parseArgs(argv) {
  let mode = null;
  let target = null;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--list' || arg === '--ping') {
      if (mode !== null) throw new RunnerError(USAGE);
      mode = arg.slice(2);
      continue;
    }
    if (arg === '--only' || arg === '--file') {
      if (mode !== null) throw new RunnerError(USAGE);
      const value = argv[i + 1];
      if (value === undefined || value.startsWith('--')) throw new RunnerError(USAGE);
      mode = arg.slice(2);
      target = value;
      i += 1;
      continue;
    }
    if (arg.startsWith('-')) throw new RunnerError(USAGE);
    // A bare positional path is the --file form.
    if (mode !== null) throw new RunnerError(USAGE);
    mode = 'file';
    target = arg;
  }
  return { mode: mode ?? 'all', target };
}

// ---------------------------------------------------------------------------------------------
// Lint, before connecting
// ---------------------------------------------------------------------------------------------

const DOLLAR_TAG = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/;

/**
 * Remove line comments, (nested) block comments, string literals, quoted identifiers and
 * dollar-quoted bodies, so statement boundaries and first words can be read plainly.
 * Backslash escapes are not honoured: this repo runs with standard_conforming_strings on and
 * uses no E'' literals.
 */
export function stripSql(text) {
  const src = String(text ?? '');
  const n = src.length;
  let out = '';
  let i = 0;
  while (i < n) {
    const c = src[i];
    const c2 = src[i + 1];
    if (c === '-' && c2 === '-') {
      while (i < n && src[i] !== '\n') i += 1;
      continue;
    }
    if (c === '/' && c2 === '*') {
      let depth = 1;
      i += 2;
      while (i < n && depth > 0) {
        if (src[i] === '/' && src[i + 1] === '*') {
          depth += 1;
          i += 2;
        } else if (src[i] === '*' && src[i + 1] === '/') {
          depth -= 1;
          i += 2;
        } else {
          i += 1;
        }
      }
      out += ' ';
      continue;
    }
    if (c === "'") {
      i += 1;
      while (i < n) {
        if (src[i] === "'" && src[i + 1] === "'") {
          i += 2;
          continue;
        }
        if (src[i] === "'") {
          i += 1;
          break;
        }
        i += 1;
      }
      out += " '' ";
      continue;
    }
    if (c === '"') {
      i += 1;
      while (i < n) {
        if (src[i] === '"' && src[i + 1] === '"') {
          i += 2;
          continue;
        }
        if (src[i] === '"') {
          i += 1;
          break;
        }
        i += 1;
      }
      out += ' quoted_identifier ';
      continue;
    }
    if (c === '$') {
      const match = DOLLAR_TAG.exec(src.slice(i));
      if (match) {
        const tag = match[0];
        const close = src.indexOf(tag, i + tag.length);
        i = close === -1 ? n : close + tag.length;
        out += ' ';
        continue;
      }
    }
    out += c;
    i += 1;
  }
  return out;
}

function splitStatements(stripped) {
  return stripped
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function firstWord(statement) {
  const match = /^[A-Za-z_]+/.exec(statement);
  return match ? match[0].toLowerCase() : '';
}

function normalize(statement) {
  return statement.replace(/\s+/g, ' ').trim();
}

/** `rollback`, `rollback transaction` and `rollback work` end the transaction block. */
const ROLLBACK_TERMINATOR = /^rollback( transaction| work)?$/i;
/** `rollback to [savepoint] x` does not: it leaves the explicit block open. */
const ROLLBACK_TO_SAVEPOINT = /^rollback to\b/i;

/**
 * Lint one unit's text. Returns null when it is safe to run, or the rule it broke.
 *
 * The unit goes to the server as ONE multi-statement simple query, so the rules are about that
 * batch, not about a file read line by line:
 *
 *   * the first top-level statement opens the transaction with `begin;`;
 *   * the last one ends it with a plain `rollback;`;
 *   * it is the ONLY top-level rollback. A rollback in the middle of the batch ends the
 *     transaction block, and Postgres then runs everything after it in a fresh implicit
 *     transaction that it COMMITS when the message completes - so `begin; …A…; rollback; …B…;
 *     rollback;` would write B to prod. `commit` and `end` split the batch the same way.
 *   * `rollback to [savepoint] x` is refused as the terminator: it does not end the block. It
 *     aborts rather than commits, so it is not a write path, but it is not a unit terminator
 *     either. No file in db/tests uses savepoints today, so it is refused anywhere at top level;
 *     a unit that needs one changes this rule in its own PR.
 */
export function lintUnitText(text) {
  const statements = splitStatements(stripSql(text)).map(normalize);
  if (statements.length === 0) return 'no statements found';
  if (firstWord(statements[0]) !== 'begin') return 'first statement must be `begin;`';

  const rollbacks = [];
  for (const [i, statement] of statements.entries()) {
    const word = firstWord(statement);
    if (word === 'commit') return 'top-level `commit` is not allowed; a unit must roll back';
    if (word === 'end') return 'top-level `end` is not allowed; a unit must roll back';
    if (word === 'rollback') rollbacks.push(i);
  }

  const last = statements[statements.length - 1];
  if (firstWord(last) !== 'rollback') return 'last statement must be `rollback;`';

  if (rollbacks.length > 1) {
    return (
      'only the last statement may be a top-level `rollback`: a rollback in the middle of the ' +
      'batch ends the transaction, and Postgres commits everything after it'
    );
  }
  if (ROLLBACK_TO_SAVEPOINT.test(last)) {
    return '`rollback to savepoint` does not end the unit; the last statement must be a plain `rollback;`';
  }
  if (!ROLLBACK_TERMINATOR.test(last)) {
    return `last statement must be a plain \`rollback;\`, not \`${last};\``;
  }
  return null;
}

// ---------------------------------------------------------------------------------------------
// The credential
// ---------------------------------------------------------------------------------------------

/**
 * Refuse a transaction-pooler DSN. Four units `set local role` mid-transaction, which needs a
 * session-scoped connection (direct host or the session pooler on 5432). The message carries no
 * part of the DSN.
 */
export function assertDsnAllowed(dsn) {
  let port = null;
  let parsed = true;
  try {
    port = new URL(dsn).port;
  } catch {
    parsed = false;
  }
  const isTransactionPooler = parsed ? port === '6543' : /:6543(\/|\?|$)/.test(dsn);
  if (isTransactionPooler) {
    throw new RunnerError(
      'BB2DASH_TEST_DB_URL points at port 6543, the transaction pooler; db-test needs a direct or ' +
        'session-pooler connection (5432), because units run `set local role` mid-transaction',
    );
  }
  return dsn;
}

/**
 * Parse a `.env`-shaped file into a plain object. Deliberately small: `KEY=value` lines, `#`
 * comments, blank lines and an optional `export ` prefix; surrounding matching quotes are stripped.
 * An unquoted value keeps everything after the first `=`, including any `#`, because a generated
 * password may contain one.
 */
export function parseEnvFile(text) {
  const out = Object.create(null);
  for (const raw of String(text ?? '').split(/\r?\n/)) {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) continue;
    const body = line.startsWith('export ') ? line.slice(7).trim() : line;
    const eq = body.indexOf('=');
    if (eq < 1) continue;
    const key = body.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    let value = body.slice(eq + 1).trim();
    if (value.length >= 2 && (value[0] === '"' || value[0] === "'") && value.at(-1) === value[0]) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

/**
 * Read `BB2DASH_TEST_DB_URL` from the process environment, or else from `.env.local` at the root
 * of this checkout. Exported so a later Node script reuses this one credential.
 *
 * The file is parsed into a local object, never loaded into `process.env`: importing this module
 * has no side effects, and calling it must not either. `options.env` is the only environment
 * consulted, so a caller that passes an explicit `env` cannot silently pick up the ambient
 * credential for a database it did not mean.
 */
export function loadDsn(options = {}) {
  const env = options.env ?? process.env;
  const root = options.root ?? REPO_ROOT;
  const envFile = path.join(root, '.env.local');
  const fromFile = fs.existsSync(envFile) ? parseEnvFile(fs.readFileSync(envFile, 'utf8')) : {};
  const dsn = env.BB2DASH_TEST_DB_URL || fromFile.BB2DASH_TEST_DB_URL;
  if (!dsn) {
    throw new RunnerError(
      `BB2DASH_TEST_DB_URL is not set: put it in the process environment or in ${envFile} (gitignored)`,
    );
  }
  return assertDsnAllowed(dsn.trim());
}

/**
 * An unconnected `pg.Client` for the test credential. The caller connects and ends it. `pg` is
 * imported lazily so importing this module has no side effects and needs no install.
 */
export async function openClient(options = {}) {
  const dsn = options.dsn ?? loadDsn(options);
  const { default: pg } = await import('pg');
  return new pg.Client({ connectionString: dsn, application_name: 'bb2dash-db-test' });
}

// ---------------------------------------------------------------------------------------------
// Output helpers
// ---------------------------------------------------------------------------------------------

/** The first line of a server error, which is the `FAIL ...` the repo's tests raise. */
export function firstLine(text) {
  return String(text ?? '').split(/\r?\n/)[0].trim();
}

/** Remove the DSN, its password and its host from any text the runner prints. */
export function redact(text, dsn) {
  let out = String(text ?? '');
  if (!dsn) return out;
  const secrets = [dsn];
  try {
    const url = new URL(dsn);
    if (url.password) {
      secrets.push(url.password);
      secrets.push(decodeURIComponent(url.password));
    }
    // `host` is host:port; `hostname` is the bare host, which is the form a driver error uses
    // (`getaddrinfo ENOTFOUND aws-0-…pooler.supabase.com` carries no port).
    if (url.host) secrets.push(url.host);
    if (url.hostname) secrets.push(url.hostname);
  } catch {
    // Not a URL: the whole string is the only secret we know about.
  }
  for (const secret of secrets) {
    if (secret && secret.length >= 4) out = out.split(secret).join('<redacted>');
  }
  return out;
}

/** True when one result row's first column ends in `: PASS`. */
export function findPassRow(result) {
  const results = Array.isArray(result) ? result : [result];
  for (const r of results) {
    for (const row of r?.rows ?? []) {
      const first = Object.values(row)[0];
      if (typeof first === 'string' && first.trim().endsWith(': PASS')) return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------------------------
// Resolving what to run
// ---------------------------------------------------------------------------------------------

function refuseLoader(name) {
  throw new RunnerError(`${name} is a loader; a loader never runs alone, only in front of its test file`);
}

function planAll(testsDir) {
  return buildPlan(fs.readdirSync(testsDir)).map((unit) => ({
    ...unit,
    paths: unit.files.map((f) => path.join(testsDir, f)),
  }));
}

function unitForOnly(target, testsDir) {
  const name = path.basename(target);
  if (LOADER_FILES.includes(name)) refuseLoader(name);
  const unit = planAll(testsDir).find((u) => u.name === name);
  if (!unit) throw new RunnerError(`--only ${name}: no such file in ${testsDir}`);
  return { ...unit, index: 1 };
}

function unitForFile(target, testsDir) {
  const abs = path.resolve(target);
  const name = path.basename(abs);
  if (LOADER_FILES.includes(name)) refuseLoader(name);
  if (!fs.existsSync(abs)) throw new RunnerError(`--file ${target}: no such file`);
  const inTestsDir = path.dirname(abs) === path.resolve(testsDir);
  const loader = inTestsDir ? LOADER_MAP[name] : undefined;
  const files = loader ? [loader, name] : [name];
  const paths = loader ? [path.join(testsDir, loader), abs] : [abs];
  return { index: 1, name, files, paths };
}

function readUnitText(unit) {
  return unit.paths.map((p) => fs.readFileSync(p, 'utf8')).join('\n');
}

// ---------------------------------------------------------------------------------------------
// run()
// ---------------------------------------------------------------------------------------------

/**
 * Run the CLI. Returns the exit code; it never calls process.exit, so tests can drive it.
 * `deps.clientFactory` returns an unconnected client, which lets the unit tests prove that a
 * lint failure opens none.
 */
export async function run(argv, deps = {}) {
  const out = deps.out ?? ((line) => process.stdout.write(`${line}\n`));
  const testsDir = deps.testsDir ?? path.join(REPO_ROOT, 'db', 'tests');
  const root = deps.root ?? REPO_ROOT;
  const env = deps.env ?? process.env;
  let dsn = null;

  try {
    const { mode, target } = parseArgs(argv);

    if (mode === 'list') {
      for (const unit of planAll(testsDir)) out(formatPlanLine(unit));
      return 0;
    }

    let units = [];
    if (mode === 'all') units = planAll(testsDir);
    else if (mode === 'only') units = [unitForOnly(target, testsDir)];
    else if (mode === 'file') units = [unitForFile(target, testsDir)];

    // A relocated script or a renamed directory must not report green having run nothing.
    // `--only` and `--file` already exit 2 on a missing file, from unitForOnly / unitForFile.
    if (mode === 'all' && units.length === 0) {
      throw new RunnerError(`no units found in ${testsDir}: nothing was run`);
    }

    // Lint every unit before the credential is read and before any client is opened.
    for (const unit of units) {
      unit.text = readUnitText(unit);
      const rule = lintUnitText(unit.text);
      if (rule) {
        out(`db-test: lint ${unit.name}: ${rule}`);
        return 2;
      }
    }

    dsn = loadDsn({ env, root });
    const factory = deps.clientFactory ?? (() => openClient({ dsn }));

    if (mode === 'ping') {
      const client = await connect(factory);
      try {
        const result = await client.query('select current_user');
        const role = Object.values(result?.rows?.[0] ?? {})[0] ?? 'unknown';
        out(`db-test: connected as ${role}`);
      } finally {
        await endQuietly(client);
      }
      return 0;
    }

    let passed = 0;
    let failed = 0;
    for (const unit of units) {
      const client = await connect(factory);
      try {
        const result = await client.query(unit.text);
        if (findPassRow(result)) {
          out(`PASS  ${unit.name}`);
          passed += 1;
        } else {
          out(`FAIL  ${unit.name}  no result row ends in ": PASS"`);
          failed += 1;
        }
      } catch (err) {
        failed += 1;
        out(`FAIL  ${unit.name}  ${redact(firstLine(err?.message), dsn)}`);
        try {
          await client.query('rollback');
        } catch {
          // The unit already died; a failed rollback changes nothing and must not hide the rest.
        }
      } finally {
        await endQuietly(client);
      }
    }
    out(`db-test: passed ${passed}, failed ${failed}, units ${units.length}`);
    return failed === 0 ? 0 : 1;
  } catch (err) {
    out(`db-test: ${redact(firstLine(err?.message), dsn)}`);
    return 2;
  }
}

async function connect(factory) {
  let client;
  try {
    client = await factory();
    await client.connect();
  } catch (err) {
    // A client `pg` half-opened keeps a handle on the event loop, and the CLI sets
    // `process.exitCode` rather than calling process.exit, so without this the command hangs
    // after a connection failure instead of exiting 2.
    await endQuietly(client);
    throw new RunnerError(`connection failed: ${firstLine(err?.message)}`);
  }
  return client;
}

async function endQuietly(client) {
  try {
    await client?.end();
  } catch {
    // Closing a socket that is already gone is not a test result.
  }
}

// ---------------------------------------------------------------------------------------------
// CLI entry point (nothing above this line runs on import)
// ---------------------------------------------------------------------------------------------

const invokedDirectly =
  Boolean(process.argv[1]) && pathToFileURL(process.argv[1]).href === import.meta.url;

if (invokedDirectly) {
  run(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code;
    },
    (err) => {
      process.stdout.write(`db-test: ${firstLine(err?.message)}\n`);
      process.exitCode = 2;
    },
  );
}

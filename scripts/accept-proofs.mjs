// bb2dash :: scripts/accept-proofs.mjs
// The acceptance run's read-only proofs (acceptance/README.md, "The proofs"). The host runs one
// per call, after a sandbox stage, to read the hard facts itself instead of taking the sandbox's
// word: which model tier answered, that Stop was stored as cancelled, that the planner is as it was.
//
//   node scripts/accept-proofs.mjs <phase> <proof> --sha <commit> [--param key=value]…
//
// It reads acceptance/<phase>/proofs.json AT THAT COMMIT (`git show`; never the working tree),
// checks every parameter against its stated type, and runs the proof's ONE statement inside
//
//   begin; set transaction read only; set local statement_timeout = '15s'; …; rollback
//
// through `openClient()` of scripts/db-test.mjs (the test login, BB2DASH_TEST_DB_URL). It prints
// exactly one line on stdout:
//
//   {"name": "turn", "pass": true, "detail": {…}}        and "blocked": true when the proof says so
//
// `detail` is the row the statement returned: ids, counts, codes and times. Message text never
// leaves the database: a statement that names such a column is refused, a row that carries one
// fails, and any long string is withheld. Why something went wrong is said on stderr.
//
// Exit 0 pass, 1 not passed, 3 blocked (repeat the run), 2 no verdict: a usage, pack, parameter,
// connection or statement error. Importing this module has no side effects.

import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { firstLine, loadDsn, openClient, redact, stripSql } from './db-test.mjs';

const REPO_ROOT = path.resolve(import.meta.dirname, '..');
const USAGE = 'usage: node scripts/accept-proofs.mjs <phase> <proof> --sha <commit> [--param key=value]…';

/** The four ways a call ends. */
export const EXIT = Object.freeze({ pass: 0, fail: 1, error: 2, blocked: 3 });

/** A string in `detail` longer than this is withheld: an id, a code or a time is never this long. */
export const DETAIL_STRING_MAX = 200;

const STATEMENT_TIMEOUT = '15s';
const UUIDS_MAX = 50;
const TEXT_MAX = 100;

/** Why a call ended with no verdict. `code` goes into `detail.error`; the message goes to stderr. */
export class ProofError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ProofError';
    this.code = code;
  }
}

/* ---------------------------------------------------------------------------------------------
 * Arguments
 * ------------------------------------------------------------------------------------------ */

const PHASE = /^[0-9]{1,2}[a-z]?$/;
const PROOF_NAME = /^[a-z][a-z0-9-]{0,47}$/;
const PARAM_NAME = /^[a-z][a-z0-9_]{0,31}$/;
/** A commit id, short or whole. Not a branch, not `HEAD`, and nothing `git show` would read as a path. */
const COMMIT = /^[0-9a-f]{7,40}$/;

const usage = (message) => new ProofError('usage', message);

function takeParam(pair, given) {
  const eq = pair.indexOf('=');
  if (eq < 1) throw usage(`--param takes key=value, as in --param request=412\n${USAGE}`);
  const key = pair.slice(0, eq);
  if (!PARAM_NAME.test(key)) throw usage(`"${key}" is not a parameter name`);
  if (key in given) throw usage(`parameter "${key}" is given twice`);
  given[key] = pair.slice(eq + 1);
}

/** Parse argv (everything after the script path). Throws a ProofError on anything it cannot read exactly. */
export function parseArgs(argv) {
  const [phase, name, ...rest] = argv;
  if (phase === undefined || name === undefined || phase.startsWith('--') || name.startsWith('--')) throw usage(USAGE);
  if (!PHASE.test(phase)) throw usage(`"${phase}" is not a phase (21, 12b)`);
  if (!PROOF_NAME.test(name)) throw usage(`"${name}" is not a proof name`);

  let sha = null;
  const given = Object.create(null);
  for (let i = 0; i < rest.length; i += 2) {
    const flag = rest[i];
    const value = rest[i + 1];
    if ((flag !== '--sha' && flag !== '--param') || value === undefined) throw usage(USAGE);
    if (flag === '--param') takeParam(value, given);
    else if (sha !== null) throw usage('--sha is given twice');
    else sha = value;
  }
  if (sha === null) throw usage(`--sha is required: the pack is read from a commit, never from the working tree\n${USAGE}`);
  if (!COMMIT.test(sha)) throw usage('--sha must be a commit id (7 to 40 hex characters), not a branch or a path');
  return { phase, name, sha, given: { ...given } };
}

/* ---------------------------------------------------------------------------------------------
 * Parameter types
 * ------------------------------------------------------------------------------------------ */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/;
/** The time form the fingerprint is written in: UTC, to the microsecond. */
const STAMP = String.raw`\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z`;
const FINGERPRINT = new RegExp(`^ap=(none|${STAMP}),rp=(none|${STAMP}),n=\\d{1,9},at=${STAMP}$`);
/** A plain name: letters and digits, joined by single `_`, `.` or `-`. No quote, space, bracket or `--`. */
const PLAIN_TEXT = /^[A-Za-z0-9]+(?:[_.-][A-Za-z0-9]+)*$/;
const ENUM_CHOICE = /^[a-z0-9_-]+$/;

const isTime = (raw) => ISO_TIME.test(raw) && !Number.isNaN(Date.parse(raw));

/** The value of a parameter the host handed over as JSON, or undefined when it is not JSON. */
function fromJson(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

/**
 * A list of uuids as one Postgres array value. The host hands a carried list over as a JSON list
 * and a single carried id as it is; a pack may write a few out, joined by commas.
 */
function uuidArray(raw) {
  const ids = raw.startsWith('[') ? fromJson(raw) : raw.split(',');
  const good = Array.isArray(ids) && ids.length >= 1 && ids.length <= UUIDS_MAX && ids.every((id) => typeof id === 'string' && UUID.test(id));
  return good ? `{${ids.join(',')}}` : null;
}

/**
 * A planner fingerprint. The host saves planner-fingerprint's whole detail and hands that back as
 * JSON; the fingerprint is read out of it. Either way it must be the fingerprint's exact form.
 */
function fingerprintOf(raw) {
  const print = raw.startsWith('{') ? fromJson(raw)?.fingerprint : raw;
  return typeof print === 'string' && FINGERPRINT.test(print) ? print : null;
}

/** type → [what a value must be, how it reaches the statement]. */
const TYPES = {
  integer: ['a whole number', (raw) => (/^(0|[1-9][0-9]{0,17})$/.test(raw) ? raw : null)],
  uuid: ['a lower-case uuid', (raw) => (UUID.test(raw) ? raw : null)],
  time: ['an ISO time with its zone', (raw) => (isTime(raw) ? raw : null)],
  uuids: [`1 to ${UUIDS_MAX} uuids, joined by commas or as a JSON list`, uuidArray],
  text: [`a plain name of at most ${TEXT_MAX} characters`, (raw) => (raw.length <= TEXT_MAX && PLAIN_TEXT.test(raw) ? raw : null)],
  fingerprint: ["a planner fingerprint, or planner-fingerprint's detail holding one", fingerprintOf],
};

/** Read a declared type: `integer`, `text?`, `enum:low|mid|high`. */
export function parseParamSpec(spec) {
  const text = String(spec ?? '');
  const optional = text.endsWith('?');
  const body = optional ? text.slice(0, -1) : text;
  if (body.startsWith('enum:')) {
    const choices = body.slice(5).split('|');
    if (choices.every((choice) => ENUM_CHOICE.test(choice))) return { type: 'enum', optional, choices };
  } else if (Object.hasOwn(TYPES, body)) {
    return { type: body, optional, choices: null };
  }
  throw new ProofError('bad_pack', `"${text}" is not a parameter type (${Object.keys(TYPES).join(', ')}, enum:a|b; "?" for optional)`);
}

/** The value as the statement takes it, or a ProofError. The refused value is never repeated. */
export function coerceParam(spec, raw) {
  if (typeof raw !== 'string') throw new ProofError('bad_parameter', 'a parameter is given as text');
  if (spec.type === 'enum') {
    if (spec.choices.includes(raw)) return raw;
    throw new ProofError('bad_parameter', `is not one of ${spec.choices.join(', ')}`);
  }
  const [what, read] = TYPES[spec.type];
  const value = read(raw);
  if (value === null) throw new ProofError('bad_parameter', `is not ${what}`);
  return value;
}

/** The statement's values, in the order the proof declares its parameters; null for an absent optional one. */
export function bindParams(proof, given) {
  for (const key of Object.keys(given)) {
    if (!Object.hasOwn(proof.params, key)) throw new ProofError('bad_parameter', `the proof has no parameter "${key}"`);
  }
  return Object.entries(proof.params).map(([key, declared]) => {
    const spec = parseParamSpec(declared);
    if (!Object.hasOwn(given, key)) {
      if (spec.optional) return null;
      throw new ProofError('bad_parameter', `parameter "${key}" is required`);
    }
    try {
      return coerceParam(spec, given[key]);
    } catch (error) {
      throw new ProofError('bad_parameter', `parameter "${key}" ${error.message}`);
    }
  });
}

/* ---------------------------------------------------------------------------------------------
 * The statement: one plain read
 * ------------------------------------------------------------------------------------------ */

/** Words a read never needs. Each is matched whole, so `updated_at` is not `update`. */
const WRITE_WORDS = [
  'insert', 'update', 'delete', 'merge', 'truncate', 'alter', 'drop', 'create', 'grant', 'revoke', 'copy', 'call', 'do',
  'set', 'reset', 'commit', 'begin', 'start', 'rollback', 'savepoint', 'release', 'prepare', 'execute', 'deallocate',
  'listen', 'notify', 'unlisten', 'vacuum', 'analyze', 'cluster', 'reindex', 'refresh', 'lock', 'comment', 'security',
  'load', 'discard', 'into', 'share',
];
/** Functions that act: settings, sequences, the server's own controls, large objects, other servers. */
const ACTING_FUNCTION = /\b(set_config|nextval|setval|currval|pg_[a-z0-9_]*|lo_[a-z0-9_]*|dblink[a-z0-9_]*)\b/i;
/** Schemas a proof has no business in: the network, the secrets, the logins, the scheduler. */
const OTHER_SCHEMA = /\b(net|vault|auth|storage|realtime|cron|pgsodium|extensions|supabase_functions|graphql|pg_catalog|information_schema)\s*\./i;
/** Columns and keys that hold what someone typed or what a model answered. Read in the raw text: a json key is a literal. */
const TEXT_WORDS = ['content', 'prompt', 'history', 'query', 'note', 'params', 'result'];

const wordIn = (words, text) => words.find((word) => new RegExp(`\\b${word}\\b`, 'i').test(text)) ?? null;

function placeholderRule(code, paramCount) {
  const used = new Set([...code.matchAll(/\$(\d+)/g)].map((match) => Number(match[1])));
  const beyond = [...used].find((n) => n < 1 || n > paramCount);
  if (beyond !== undefined) return `the statement uses $${beyond}, and the proof declares ${paramCount} parameter(s)`;
  for (let n = 1; n <= paramCount; n += 1) {
    if (!used.has(n)) return `the statement does not use $${n}: every declared parameter is bound`;
  }
  return null;
}

/**
 * Lint one proof statement. Returns null when it is one plain read, or the rule it broke.
 *
 * The read-only transaction is what stops a write; this is the second lock, and the one that
 * reads the statement the way a reviewer would. It also covers what a read-only transaction
 * allows: a setting changed, a backend signalled, an advisory lock taken.
 */
export function lintProofSql(sql, paramCount) {
  const raw = String(sql ?? '');
  const code = stripSql(raw);
  const statements = code.split(';').map((part) => part.trim()).filter((part) => part.length > 0);
  if (statements.length === 0) return 'no statement found';
  if (statements.length > 1) return `a proof is one statement, and this is ${statements.length}`;
  if (!/^(select|with)\b/i.test(statements[0])) return 'a proof must start with select or with';
  const write = wordIn(WRITE_WORDS, code);
  if (write !== null) return `a proof only reads: the word "${write}" is not allowed`;
  const acting = ACTING_FUNCTION.exec(code);
  if (acting !== null) return `a proof calls no function that acts: ${acting[1]} (pg_*, lo_*, dblink*, set_config and the sequence functions are refused)`;
  const schema = OTHER_SCHEMA.exec(code);
  if (schema !== null) return `a proof reads schema public only, not schema "${schema[1].toLowerCase()}"`;
  const text = wordIn(TEXT_WORDS, raw);
  if (text !== null) return `a proof never reads message text: the word "${text}" is not allowed`;
  return placeholderRule(code, paramCount);
}

/** Refuse a pack that is not whole, before anything runs. The message starts with the proof's name. */
export function validatePack(pack) {
  if (pack === null || typeof pack !== 'object' || Array.isArray(pack)) {
    throw new ProofError('bad_pack', 'proofs.json is an object of named proofs');
  }
  for (const [name, proof] of Object.entries(pack)) {
    const bad = (message) => new ProofError('bad_pack', `${name}: ${message}`);
    if (!PROOF_NAME.test(name)) throw new ProofError('bad_pack', `"${name}" is not a proof name (lower-case letters, digits and hyphens)`);
    if (proof === null || typeof proof !== 'object') throw bad('not an object');
    if (proof.params === null || typeof proof.params !== 'object' || Array.isArray(proof.params)) throw bad('no "params" object');
    if (typeof proof.sql !== 'string') throw bad('no "sql"');
    if (typeof proof.expect !== 'string' || proof.expect.trim() === '') throw bad('no "expect": say in words what the row must show');
    for (const [key, declared] of Object.entries(proof.params)) {
      if (!PARAM_NAME.test(key)) throw bad(`parameter name "${key}" is not lower-case letters, digits and underscores`);
      try {
        parseParamSpec(declared);
      } catch (error) {
        throw bad(`parameter "${key}": ${error.message}`);
      }
    }
    const rule = lintProofSql(proof.sql, Object.keys(proof.params).length);
    if (rule !== null) throw bad(rule);
  }
  return pack;
}

/* ---------------------------------------------------------------------------------------------
 * The pack, at a commit
 * ------------------------------------------------------------------------------------------ */

function gitShowAt(sha, file) {
  return execFileSync('git', ['show', `${sha}:${file}`], { cwd: REPO_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

/** acceptance/<phase>/proofs.json as the commit has it. `gitShow` is injected by the tests. */
export function readPackAt({ phase, sha, gitShow = gitShowAt }) {
  const file = `acceptance/${phase}/proofs.json`;
  let text;
  try {
    text = gitShow(sha, file);
  } catch {
    throw new ProofError('bad_pack', `no ${file} at ${sha}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new ProofError('bad_pack', `${file} at ${sha} is not valid JSON`);
  }
}

/* ---------------------------------------------------------------------------------------------
 * The decision
 * ------------------------------------------------------------------------------------------ */

/** A row that carries one of these fails its proof: they hold what was typed or answered. */
const FORBIDDEN_COLUMNS = ['content', 'prompt', 'title', 'query', 'note', 'history', 'params', 'result'];

/** One value of `detail`: times as ISO text, long strings withheld, lists and objects walked. */
function plain(value) {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'string') return value.length > DETAIL_STRING_MAX ? { withheld_chars: value.length } : value;
  if (Array.isArray(value)) return value.map(plain);
  if (typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, plain(inner)]));
  return value;
}

/**
 * What a statement's result says. One row whose `ok` is true passes. `blocked` true outranks
 * both pass and fail: the proof could not be read fairly, and the run is repeated.
 */
export function decide(result) {
  const failed = (detail) => ({ pass: false, blocked: false, detail });
  if (Array.isArray(result)) return failed({ error: 'expected_one_result', results: result.length });
  const rows = result?.rows ?? [];
  if (rows.length !== 1) return failed({ error: 'expected_one_row', rows: rows.length });
  const [row] = rows;
  const leaked = FORBIDDEN_COLUMNS.find((column) => Object.hasOwn(row, column));
  if (leaked !== undefined) return failed({ error: 'forbidden_column', column: leaked });
  if (!Object.hasOwn(row, 'ok')) return failed({ error: 'no_ok_column' });
  const { ok, blocked, ...rest } = row;
  const detail = plain(rest);
  if (blocked === true) return { pass: false, blocked: true, detail };
  return { pass: ok === true, blocked: false, detail };
}

/* ---------------------------------------------------------------------------------------------
 * The transaction
 * ------------------------------------------------------------------------------------------ */

/**
 * Run one statement read-only, and roll back whatever happened. A rollback that fails is told
 * to `onRollbackError` and does not replace the statement's own result or error.
 */
export async function runReadOnly(client, sql, values, onRollbackError) {
  try {
    await client.query('begin');
    await client.query('set transaction read only');
    await client.query(`set local statement_timeout = '${STATEMENT_TIMEOUT}'`);
    return await client.query(sql, values);
  } finally {
    try {
      await client.query('rollback');
    } catch (error) {
      onRollbackError(error);
    }
  }
}

async function endQuietly(client) {
  try {
    await client?.end();
  } catch {
    // Closing a socket that is already gone is not a verdict.
  }
}

/* ---------------------------------------------------------------------------------------------
 * run()
 * ------------------------------------------------------------------------------------------ */

/** Connect, run the proof, close. Returns the decision, or throws a ProofError with no verdict. */
async function readProof(proof, values, deps, say) {
  let dsn = null;
  let client;
  try {
    if (!deps.clientFactory) dsn = loadDsn({ env: deps.env ?? process.env });
    const factory = deps.clientFactory ?? (() => openClient({ dsn }));
    client = await factory();
    await client.connect();
  } catch (error) {
    await endQuietly(client);
    throw new ProofError('connection_failed', `connection failed: ${redact(firstLine(error?.message), dsn)}`);
  }
  try {
    const result = await runReadOnly(client, proof.sql, values, (error) =>
      say(`accept-proofs: rollback failed: ${redact(firstLine(error?.message), dsn)}`),
    );
    return decide(result);
  } catch (error) {
    const failure = new ProofError('query_failed', `the statement failed: ${redact(firstLine(error?.message), dsn)}`);
    failure.sqlstate = typeof error?.code === 'string' ? error.code : null;
    throw failure;
  } finally {
    await endQuietly(client);
  }
}

/**
 * Run the CLI. Returns the exit code; it never calls process.exit, so tests can drive it.
 * `deps.readPack` and `deps.clientFactory` are injected by the tests: with them nothing reads
 * git, a credential or a database.
 */
export async function run(argv, deps = {}) {
  const out = deps.out ?? ((line) => process.stdout.write(`${line}\n`));
  const err = deps.err ?? ((line) => process.stderr.write(`${line}\n`));
  const print = (name, decision) => {
    const { pass, blocked, detail } = decision;
    out(JSON.stringify(blocked ? { name, pass, blocked: true, detail } : { name, pass, detail }));
  };
  let name = null;
  try {
    const args = parseArgs(argv);
    name = args.name;
    const pack = validatePack(deps.readPack ? deps.readPack(args) : readPackAt(args));
    if (!Object.hasOwn(pack, name)) throw new ProofError('unknown_proof', `acceptance/${args.phase}/proofs.json holds no proof named "${name}"`);
    const values = bindParams(pack[name], args.given);
    const decision = await readProof(pack[name], values, deps, err);
    print(name, decision);
    if (decision.blocked) return EXIT.blocked;
    return decision.pass ? EXIT.pass : EXIT.fail;
  } catch (error) {
    const code = error instanceof ProofError ? error.code : 'internal_error';
    err(`accept-proofs: ${firstLine(error?.message)}`);
    const detail = error?.sqlstate ? { error: code, sqlstate: error.sqlstate } : { error: code };
    print(name, { pass: false, blocked: false, detail });
    return EXIT.error;
  }
}

/* ---------------------------------------------------------------------------------------------
 * CLI entry point (nothing above this line runs on import)
 * ------------------------------------------------------------------------------------------ */

const invokedDirectly = Boolean(process.argv[1]) && pathToFileURL(process.argv[1]).href === import.meta.url;

if (invokedDirectly) {
  run(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code;
    },
    (error) => {
      process.stderr.write(`accept-proofs: ${firstLine(error?.message)}\n`);
      process.stdout.write(`${JSON.stringify({ name: null, pass: false, detail: { error: 'internal_error' } })}\n`);
      process.exitCode = EXIT.error;
    },
  );
}

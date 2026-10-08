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
// each of the five sent by the extended protocol, so the server takes one statement at a time and
// refuses a text that holds a second. It connects through `openClient()` of scripts/db-test.mjs
// (the test login, BB2DASH_TEST_DB_URL). It prints
// exactly one line on stdout:
//
//   {"name": "turn", "pass": true, "detail": {…}}        and "blocked": true when the proof says so
//
// `detail` is what the statement's row held beside its verdict: ids, counts, codes and times.
// Text never leaves the database: a statement that names a text column is refused
// (lib/accept-proofs-lint.mjs), a row that carries one as a key at any depth fails, and a value
// that is not of an allowed shape is replaced by the word `withheld` (lib/accept-proofs-detail.mjs).
// Why something went wrong is said on stderr.
//
// Exit 0 pass, 1 not passed, 3 blocked (repeat the run), 2 no verdict: a usage, pack, parameter,
// connection or statement error. Importing this module has no side effects.

import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { firstLine, loadDsn, openClient, redact } from './db-test.mjs';
import { decide } from './lib/accept-proofs-detail.mjs';
import { lintProofSql } from './lib/accept-proofs-lint.mjs';
import { FINGERPRINT, HEX32, UUID, isTime } from './lib/accept-proofs-shapes.mjs';

export { decide, lintProofSql };

const REPO_ROOT = path.resolve(import.meta.dirname, '..');
const USAGE = 'usage: node scripts/accept-proofs.mjs <phase> <proof> --sha <commit> [--param key=value]…';

/** The four ways a call ends. */
export const EXIT = Object.freeze({ pass: 0, fail: 1, error: 2, blocked: 3 });

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

/** A plain name: letters and digits, joined by single `_`, `.` or `-`. No quote, space, bracket or `--`. */
const PLAIN_TEXT = /^[A-Za-z0-9]+(?:[_.-][A-Za-z0-9]+)*$/;
const ENUM_CHOICE = /^[a-z0-9_-]+$/;

/** type → [what a value must be, how it reaches the statement]. The shapes are lib/accept-proofs-shapes.mjs's. */
const TYPES = {
  integer: ['a whole number', (raw) => (/^(0|[1-9][0-9]{0,17})$/.test(raw) ? raw : null)],
  uuid: ['a lower-case uuid', (raw) => (UUID.test(raw) ? raw : null)],
  time: ['an ISO time with its zone', (raw) => (isTime(raw) ? raw : null)],
  uuids: [
    `1 to ${UUIDS_MAX} uuids joined by commas`,
    (raw) => {
      const ids = raw.split(',');
      return ids.length <= UUIDS_MAX && ids.every((id) => UUID.test(id)) ? `{${ids.join(',')}}` : null;
    },
  ],
  text: [`a plain name of at most ${TEXT_MAX} characters`, (raw) => (raw.length <= TEXT_MAX && PLAIN_TEXT.test(raw) ? raw : null)],
  fingerprint: ["a planner fingerprint, as planner-fingerprint's detail gives it", (raw) => (FINGERPRINT.test(raw) ? raw : null)],
  hex32: ['an md5: 32 lower-case hex characters', (raw) => (HEX32.test(raw) ? raw : null)],
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
 * The pack: every proof whole, and every statement one plain read (lib/accept-proofs-lint.mjs)
 * ------------------------------------------------------------------------------------------ */

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
 * The transaction
 * ------------------------------------------------------------------------------------------ */

/**
 * One statement and no more. By the extended protocol the server itself refuses a text that holds
 * a second statement; by the simple protocol, which node-postgres uses for a text with no values,
 * it would run them all, and a `commit` among them would end the read-only transaction.
 * apply/src/mcp-sql/server.ts sends its statements the same way.
 */
const single = (text, values = []) => ({ text, values, queryMode: 'extended' });

/**
 * Run one statement read-only, and roll back whatever happened. Every statement, the proof's and
 * the four around it, goes by the extended protocol. A rollback that fails is told to
 * `onRollbackError` and does not replace the statement's own result or error.
 */
export async function runReadOnly(client, sql, values, onRollbackError) {
  try {
    await client.query(single('begin'));
    await client.query(single('set transaction read only'));
    await client.query(single(`set local statement_timeout = '${STATEMENT_TIMEOUT}'`));
    return await client.query(single(sql, values));
  } finally {
    try {
      await client.query(single('rollback'));
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

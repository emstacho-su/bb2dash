#!/usr/bin/env node
// bb2dash :: scripts/exports-run.mjs
// The scheduled run of the Inbox decisions exporter (Phase 23 follow-ups, item 3). The Windows task
// `Bb2dash-Exports` (scripts/register-exports.ps1) calls this at logon plus 5 minutes and every six
// hours:
//
//   node scripts/exports-run.mjs --secrets-dir <folder> --harness-dir <folder>
//
// It hands the two folders to the exporter as SECRETS_DIR and HARNESS_DIR and runs it once with
// `--notes-only`: the private vault notes are filed and each row is marked; no day file is written
// and no pull request is opened (that stays the manual step, `inbox-decisions-pr.mjs`).
//
// What it may not do is held by its test, not by this comment: it starts exactly one command, the
// exporter (node), and never git, gh or docker. The guard below reads `.git/HEAD` as a file, so it
// starts no git either.
//
// Guard: the checkout this file sits in must be on `main` (`.git` a folder whose HEAD is
// `ref: refs/heads/main`). A worktree (`.git` a file), another branch or a detached HEAD is exit 2,
// and nothing is filed.
//
// State: `~/.bb2dash-exports/state.json`, replaced whole at the end of EVERY run (exit 2 and a thrown
// error included), and `exports.log`, which rolls. Both are outside every repository. Another
// repository's doctor reads the state file, so its keys are fixed: schema, started_at, ended_at,
// exit_code, reason, exporters. No path, no decision text and no error message is stored in it, and
// the service key (which only the exporter reads, from its file) is scrubbed from the log.
//
// No network yet: the task starts five minutes after a logon and may start right after a wake, before
// the network is up. The exporter says so with its exit 3 (its first read did not reach Supabase, so
// nothing was read or written), and this run waits and starts it again: after 15 s, 30 s, 1, 2 and 4
// minutes, six tries in under eight minutes. A run that never gets through is exit 1 with the reason
// `no_network`. No other failure is tried again.
//
// Exit 0 when the exporter filed everything (or had nothing), 1 when a row was not filed or the run
// failed or the database was never reached, 2 when the checkout is not on main or a folder argument
// is missing or the exporter stopped on its configuration.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// One copy of the process start, the line printer and the atomic write: the exporter's.
import { EXIT_UNREACHABLE, RESULT_PREFIX, printLine, runCommand, writeAtomic } from './inbox-decisions-export.mjs';

export const STATE_SCHEMA = 1;
export const STATE_FILE = 'state.json';
export const LOG_FILE = 'exports.log';
export const EXPORTER_KEY = 'inbox-decisions';
export const DEFAULT_STATE_DIRNAME = '.bb2dash-exports';
/** The log is moved to `exports.log.1` (replacing the older one) once it passes this size. */
export const MAX_LOG_BYTES = 256 * 1024;
/** Below the task's own 15-minute limit, so a stuck exporter ends here and is recorded. */
const EXPORTER_TIMEOUT_MS = 14 * 60 * 1000;
/**
 * How long the run waits before each new try while the database cannot be reached. An unreachable
 * exporter ends in about a second, so the waits are nearly all of the time spent: 7 minutes 45 seconds
 * for the five, inside the task's 15-minute limit.
 */
export const NETWORK_RETRY_WAITS_MS = Object.freeze([15_000, 30_000, 60_000, 120_000, 240_000]);
const MS_PER_SECOND = 1000;
const MAX_LOGGED_LINES = 200;
const MAX_LOGGED_LINE_CHARS = 500;
const MAIN_HEAD = 'ref: refs/heads/main';
const EXPORTER_FILE = path.join(import.meta.dirname, 'inbox-decisions-export.mjs');
const REPO_ROOT = path.resolve(import.meta.dirname, '..');
const USAGE = 'usage: node scripts/exports-run.mjs --secrets-dir <folder> --harness-dir <folder>';

const EXIT_OK = 0;
const EXIT_FAILED = 1;
const EXIT_STOPPED = 2;

/** The secret forms that must never reach the log: the service key (`sb_secret_...`) and any JWT. */
const SECRET_PATTERNS = [/sb_secret_[A-Za-z0-9_-]+/g, /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g];

export function scrub(text) {
  return SECRET_PATTERNS.reduce((out, pattern) => out.replace(pattern, '<redacted>'), String(text));
}

/** A usage failure: exit 2, reason `config`. */
class UsageError extends Error {}

export function parseArgs(argv) {
  const options = { secretsDir: '', harnessDir: '' };
  for (let i = 0; i < argv.length; i += 2) {
    const flag = argv[i];
    const value = argv[i + 1];
    if ((flag !== '--secrets-dir' && flag !== '--harness-dir') || value === undefined || value.startsWith('--') || value.trim() === '') {
      throw new UsageError(USAGE);
    }
    if (flag === '--secrets-dir') options.secretsDir = value;
    else options.harnessDir = value;
  }
  if (options.secretsDir === '' || options.harnessDir === '') throw new UsageError(USAGE);
  return options;
}

/**
 * True only when `<repoRoot>/.git` is a folder whose HEAD file reads `ref: refs/heads/main`.
 * A `.git` that is a file (a worktree), another branch, a detached HEAD and no `.git` are all false.
 * It reads two paths and starts no command.
 */
export function checkoutIsOnMain(repoRoot, fsImpl = fs) {
  try {
    const dotGit = path.join(repoRoot, '.git');
    if (!fsImpl.statSync(dotGit).isDirectory()) return false;
    return fsImpl.readFileSync(path.join(dotGit, 'HEAD'), 'utf8').trim() === MAIN_HEAD;
  } catch {
    return false;
  }
}

/** The exporter's last `inbox-decisions-result {json}` line as counts, or null when it is missing or malformed. */
export function parseResultLine(stdout) {
  const line = String(stdout ?? '').split(/\r?\n/).filter((l) => l.startsWith(`${RESULT_PREFIX} `)).pop();
  if (line === undefined) return null;
  let parsed;
  try {
    parsed = JSON.parse(line.slice(RESULT_PREFIX.length + 1));
  } catch {
    return null;
  }
  const counts = [parsed?.filed, parsed?.skipped, parsed?.not_filed];
  if (!counts.every((n) => Number.isInteger(n) && n >= 0)) return null;
  return { filed: parsed.filed, skipped: parsed.skipped, notFiled: parsed.not_filed };
}

const NO_COUNTS = Object.freeze({ filed: 0, skipped: 0, notFiled: 0 });

function outcomeOf(exitCode, reason, exporterExit, counts = NO_COUNTS) {
  return { exitCode, reason, exporterExit, counts };
}

/** What a finished exporter means for this run. */
function judge(answer) {
  const counts = parseResultLine(answer.stdout);
  if (answer.status === 2) return outcomeOf(EXIT_STOPPED, 'config', 2, counts ?? NO_COUNTS);
  // Reached only when every try ended this way: the run itself failed, and the reason says on what.
  if (answer.status === EXIT_UNREACHABLE) return outcomeOf(EXIT_FAILED, 'no_network', EXIT_UNREACHABLE);
  if (answer.status === 0 && counts !== null) return outcomeOf(EXIT_OK, null, 0, counts);
  // Exit 1, a killed or timed-out exporter, any other code, and exit 0 without its result line: not trusted.
  return outcomeOf(EXIT_FAILED, 'error', EXIT_FAILED, counts ?? NO_COUNTS);
}

/** Append to the log, moving it aside first when it is large. Returns an error line, or null. */
function appendLog({ stateDir, text, maxLogBytes, fsImpl }) {
  try {
    fsImpl.mkdirSync(stateDir, { recursive: true });
    const file = path.join(stateDir, LOG_FILE);
    if (fsImpl.existsSync(file) && fsImpl.statSync(file).size > maxLogBytes) fsImpl.renameSync(file, `${file}.1`);
    fsImpl.appendFileSync(file, text, 'utf8');
    return null;
  } catch (error) {
    return `exports-run: could not write the log: ${scrub(error?.message ?? error)}`;
  }
}

/** Replace the state file whole, through a temporary file beside it. */
function writeState({ stateDir, state, fsImpl }) {
  writeAtomic(fsImpl, path.join(stateDir, STATE_FILE), `${JSON.stringify(state, null, 2)}\n`);
}

function buildState({ startedAt, endedAt, outcome }) {
  return {
    schema: STATE_SCHEMA,
    started_at: startedAt.toISOString(),
    ended_at: endedAt.toISOString(),
    exit_code: outcome.exitCode,
    reason: outcome.reason,
    exporters: {
      [EXPORTER_KEY]: {
        exit_code: outcome.exporterExit,
        filed: outcome.counts.filed,
        skipped: outcome.counts.skipped,
        not_filed: outcome.counts.notFiled,
      },
    },
  };
}

/** Starts the exporter once and puts what it printed into the log. */
function startExporter({ repoRoot, run, env, folders, note }) {
  const answer = run(process.execPath, [EXPORTER_FILE, '--notes-only'], {
    cwd: repoRoot,
    env: { ...env, SECRETS_DIR: folders.secretsDir, HARNESS_DIR: folders.harnessDir },
  });
  const lines = `${answer.stdout ?? ''}\n${answer.stderr ?? ''}`.split(/\r?\n/).filter((l) => l.trim() !== '');
  for (const line of lines.slice(-MAX_LOGGED_LINES)) note(`exporter: ${line.slice(0, MAX_LOGGED_LINE_CHARS)}`);
  return answer;
}

/**
 * The exporter, started again after each wait while it answers that the database could not be reached.
 * Returns the answer of the last start: the first that is anything else, or the unreachable one of
 * the last try.
 */
async function exportWhenReachable({ start, sleep, note, waits = NETWORK_RETRY_WAITS_MS }) {
  const tries = waits.length + 1;
  for (let attempt = 1; ; attempt += 1) {
    const answer = start();
    if (answer.status !== EXIT_UNREACHABLE) return answer;
    const said = `the exporter did not reach Supabase (try ${attempt} of ${tries})`;
    if (attempt === tries) {
      note(`${said}: giving up`);
      return answer;
    }
    const wait = waits[attempt - 1];
    note(`${said}: trying again in ${wait / MS_PER_SECOND} s`);
    await sleep(wait);
  }
}

/** The run itself, without the bookkeeping. Throws only for a real fault; the caller records it. */
async function runOnce({ argv, repoRoot, run, env, fsImpl, note, sleep }) {
  let folders;
  try {
    folders = parseArgs(argv);
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    note(error.message);
    return outcomeOf(EXIT_STOPPED, 'config', EXIT_STOPPED);
  }
  if (!checkoutIsOnMain(repoRoot, fsImpl)) {
    note('the checkout is not on main: nothing was filed');
    return outcomeOf(EXIT_STOPPED, 'not_main', EXIT_STOPPED);
  }
  const start = () => startExporter({ repoRoot, run, env, folders, note });
  return judge(await exportWhenReachable({ start, sleep, note }));
}

/**
 * One scheduled run. Returns the exit code. `deps` replaces the checkout, the state folder, the
 * clock, the wait between tries, the output and the one command the run starts.
 */
export async function main(argv, deps = {}) {
  const {
    repoRoot = REPO_ROOT,
    stateDir = path.join(os.homedir(), DEFAULT_STATE_DIRNAME),
    spawn,
    run = (command, args, options) => runCommand(command, args, options.cwd, { env: options.env, timeout: EXPORTER_TIMEOUT_MS, spawn }),
    now = () => new Date(),
    sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); }),
    log = printLine,
    env = process.env,
    fsImpl = fs,
    maxLogBytes = MAX_LOG_BYTES,
  } = deps;
  const startedAt = now();
  const pending = [];
  const note = (message) => pending.push(`${startedAt.toISOString()} ${scrub(message)}\n`);

  let outcome;
  try {
    outcome = await runOnce({ argv, repoRoot, run, env, fsImpl, note, sleep });
  } catch (error) {
    // The message goes to the log, scrubbed; the state file keeps only the reason.
    note(`failed: ${error?.message ?? error}`);
    outcome = outcomeOf(EXIT_FAILED, 'error', EXIT_FAILED);
  }
  const endedAt = now();
  note(`exit ${outcome.exitCode}${outcome.reason === null ? '' : ` (${outcome.reason})`}: filed ${outcome.counts.filed}, skipped ${outcome.counts.skipped}, not filed ${outcome.counts.notFiled}`);

  let exitCode = outcome.exitCode;
  const logProblem = appendLog({ stateDir, text: pending.join(''), maxLogBytes, fsImpl });
  if (logProblem !== null) log(logProblem);
  try {
    writeState({ stateDir, state: buildState({ startedAt, endedAt, outcome }), fsImpl });
  } catch (error) {
    log(`exports-run: could not write the state file: ${scrub(error?.message ?? error)}`);
    exitCode = exitCode === EXIT_OK ? EXIT_FAILED : exitCode;
  }
  log(`exports-run: exit ${exitCode}`);
  return exitCode;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main(process.argv.slice(2));
}

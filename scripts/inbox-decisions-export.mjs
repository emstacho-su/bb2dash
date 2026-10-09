#!/usr/bin/env node
// bb2dash :: scripts/inbox-decisions-export.mjs
// The "files after" half of /inbox-apply (Phase 23; DECISIONS 2026-10-07). The apply container
// stores each decision on the archived Inbox row and writes no file. This script, on the host,
// renders every decision not yet filed into its vault note and the day's repo log entry, ingests
// the notes, and marks each row filed (migrations 182 and 187).
//
//   node scripts/inbox-decisions-export.mjs [--dry-run] [--no-ingest] [--notes-only]
//                                           [--log-dir <dir>] [--limit <n>]
//
// Two modes. The default is what a session and the manual step (`inbox-decisions-pr.mjs`) use:
// each unfiled decision in full (note, day file, mark), then each decision that has a note and no
// day-file entry yet (the entry, then the log stamp). `--notes-only` is what the scheduled task
// (`exports-run.mjs`) uses: the note, the ingest and a mark with the note path alone; it writes no
// day file, reads no unlogged row, and refuses `--log-dir`. The day files go to a public repository,
// which is why they stay the manual step's.
//
// In both modes the decision of an acceptance run's test question (ref `accept/...`, entity
// `agent_request`, no course) is marked skipped: no note, no day-file entry. When the database
// refuses the skip (the item has a logged write, so the decision is a real one) the row is filed
// like any other in that same run.
//
// Configuration comes from the environment, never from a path written here:
//   SECRETS_DIR    the secrets folder outside every repo; the service key is read from the file
//                  bb2dash_mcp_service_key in it, at run time, and is never printed
//   HARNESS_DIR    the agentic-harness checkout; its hooks/resolve-config.mjs names the vault
//   SUPABASE_URL   optional; the bb2dash project when unset
//
// Order per decision: the note, the day file, then the mark. A crash between two of them files
// nothing twice: the note is rewritten only when it is identical, the day file skips an item it
// already holds, and the mark is the last thing written. Nothing is filed when the vault does not
// resolve to the `projects` realm. The ingest is best-effort: the harness's nightly job ingests
// the vault again, so a failed ingest is recorded (`ingested: false`) and the row is still filed.
//
// The last line printed is `inbox-decisions-result {json}` with exit_code, filed, skipped and
// not_filed: the scheduled runner reads it for its state file.
//
// Exit 0 when every decision was filed (or there were none), 1 when one could not be, 2 on a
// usage or configuration error.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { appendLogEntry, logDateOf, logFileName, noteFileName, renderLogEntry, renderNote } from './lib/inbox-decision-render.mjs';

export const DEFAULT_SUPABASE_URL = 'https://goultdzqcavefcgnifdy.supabase.co';
export const SERVICE_KEY_FILE = 'bb2dash_mcp_service_key';
/** Where the notes live inside the vault, and the same path as the rag store's `--only` argument. */
export const NOTES_DIR = Object.freeze(['projects', 'bb2dash', 'decisions']);
/** The day files' folder inside a bb2dash checkout. */
export const LOG_DIR = Object.freeze(['docs', 'inbox-decisions']);
export const DEFAULT_LIMIT = 100;
/** What is stored on a skipped row: a fixed sentence, never text of a question or an error. */
export const SKIP_WHY = 'acceptance run test question';
/** The prefix of the final machine-readable line, followed by one JSON object. */
export const RESULT_PREFIX = 'inbox-decisions-result';
const MAX_LIMIT = 500;
const DECISION_SCHEMA = 'inbox-decision/1';
const TEST_REF_PREFIX = 'accept/';
const TEST_ENTITY = 'agent_request';
const REPO_ROOT = path.resolve(import.meta.dirname, '..');
const USAGE =
  'usage: node scripts/inbox-decisions-export.mjs [--dry-run] [--no-ingest] [--notes-only] [--log-dir <dir>] [--limit <n>]';

const EXIT_OK = 0;
const EXIT_FAILED = 1;
const EXIT_CONFIG = 2;

/** A usage or configuration failure: exit 2, and nothing was written. */
export class ExportError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ExportError';
  }
}

export function parseArgs(argv) {
  const options = { dryRun: false, ingest: true, notesOnly: false, logDir: null, limit: DEFAULT_LIMIT };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--no-ingest') options.ingest = false;
    else if (arg === '--notes-only') options.notesOnly = true;
    else if (arg === '--log-dir' || arg === '--limit') {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith('--')) throw new ExportError(USAGE);
      i += 1;
      if (arg === '--log-dir') options.logDir = value;
      else {
        const limit = Number(value);
        if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) throw new ExportError(`--limit must be 1 to ${MAX_LIMIT}`);
        options.limit = limit;
      }
    } else throw new ExportError(USAGE);
  }
  if (options.notesOnly && options.logDir !== null) throw new ExportError('--notes-only writes no day file: it cannot be combined with --log-dir');
  return options;
}

/** The settings a run needs, each validated before anything is read or written. */
export function readConfig({ env, options, repoRoot = REPO_ROOT }) {
  const secretsDir = String(env.SECRETS_DIR ?? '').trim();
  const harnessDir = String(env.HARNESS_DIR ?? '').trim();
  if (secretsDir === '') throw new ExportError('SECRETS_DIR is not set: it names the folder that holds bb2dash_mcp_service_key');
  if (harnessDir === '') throw new ExportError('HARNESS_DIR is not set: it names the agentic-harness checkout');
  const supabaseUrl = String(env.SUPABASE_URL ?? DEFAULT_SUPABASE_URL).trim().replace(/\/+$/, '');
  if (!/^https:\/\/[a-z0-9.-]+$/i.test(supabaseUrl)) throw new ExportError('SUPABASE_URL must be an https origin');
  return {
    secretsDir,
    harnessDir,
    supabaseUrl,
    // --notes-only writes no day file, so it has no log folder at all.
    logDir: options.notesOnly ? null : path.resolve(options.logDir ?? path.join(repoRoot, ...LOG_DIR)),
  };
}

/** The service key, from its one home. The value never leaves this process's memory. */
export function readServiceKey(secretsDir, fsImpl = fs) {
  const file = path.join(secretsDir, SERVICE_KEY_FILE);
  let raw;
  try {
    raw = fsImpl.readFileSync(file, 'utf8');
  } catch {
    throw new ExportError(`could not read ${SERVICE_KEY_FILE} in SECRETS_DIR`);
  }
  const key = raw.replace(/^﻿/, '').trim();
  if (key === '' || /\s/.test(key)) throw new ExportError(`${SERVICE_KEY_FILE} is empty or holds more than one value`);
  return key;
}

/** `run(command, args, cwd)` -> { status, stdout, stderr }: the real one, replaced in tests. */
export function runCommand(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', shell: false, windowsHide: true });
  return { status: result.status ?? 1, stdout: result.stdout ?? '', stderr: result.stderr ?? String(result.error?.message ?? '') };
}

/** The vault and the ingest project, from the harness resolver; refuses anything but the `projects` realm. */
export function resolveVault({ harnessDir, run = runCommand, fsImpl = fs }) {
  const resolver = path.join(harnessDir, 'hooks', 'resolve-config.mjs');
  const result = run(process.execPath, [resolver, '--json', '--require-realm', 'projects'], harnessDir);
  let config = null;
  try {
    config = JSON.parse(result.stdout);
  } catch {
    config = null;
  }
  const vault = typeof config?.vault === 'string' ? config.vault : '';
  const ingestProject = typeof config?.ingestProject === 'string' ? config.ingestProject : '';
  if (result.status !== 0 || config?.realmCheck?.ok !== true || vault === '' || !fsImpl.existsSync(vault)) {
    throw new ExportError(
      `the vault did not resolve to the projects realm (resolver exit ${result.status}, vault ${vault === '' ? 'unset' : 'named'}): nothing was filed`,
    );
  }
  return { vault, ingestProject };
}

/**
 * The shape of an acceptance run's test question: a ref that starts `accept/`, entity
 * `agent_request` and no course. The three fields narrow the guess; they do not prove where a row
 * came from (the worker's role may raise a row of this shape under any ref). What protects a real
 * decision is the database: `inbox_decision_skipped` refuses a row whose item has a logged write,
 * and the exporter then files that row like any other.
 */
export function isTestQuestion(row) {
  return (
    typeof row?.ref === 'string' &&
    row.ref.startsWith(TEST_REF_PREFIX) &&
    row.entity === TEST_ENTITY &&
    (row.course_id === null || row.course_id === undefined)
  );
}

function redact(text, secret) {
  return secret ? String(text).split(secret).join('<redacted>') : String(text);
}

/** The filing functions of migrations 182 and 187, over PostgREST as the service role. */
export function createRpc({ supabaseUrl, serviceKey, fetchImpl = fetch }) {
  async function call(fn, body) {
    let response;
    try {
      response = await fetchImpl(`${supabaseUrl}/rest/v1/rpc/${fn}`, {
        method: 'POST',
        headers: { apikey: serviceKey, authorization: `Bearer ${serviceKey}`, 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch (error) {
      throw new Error(`${fn}: the request did not reach Supabase: ${redact(error?.message ?? error, serviceKey)}`);
    }
    const textBody = await response.text();
    if (!response.ok) throw new Error(`${fn}: HTTP ${response.status}: ${redact(textBody, serviceKey).slice(0, 300)}`);
    return textBody === '' ? null : JSON.parse(textBody);
  }
  async function list(fn, limit) {
    const rows = await call(fn, { p_limit: limit });
    if (!Array.isArray(rows)) throw new Error(`${fn}: the answer is not a list`);
    return rows;
  }
  return {
    unfiled: (limit) => list('inbox_decisions_unfiled', limit),
    unlogged: (limit) => list('inbox_decisions_unlogged', limit),
    async filed(id, filed) {
      return (await call('inbox_decision_filed', { p_id: id, p_filed: filed })) === true;
    },
    async logged(id, logPath) {
      return (await call('inbox_decision_logged', { p_id: id, p_log_path: logPath })) === true;
    },
    async skipped(id, why) {
      return (await call('inbox_decision_skipped', { p_id: id, p_why: why })) === true;
    },
  };
}

/** Write a file through a temporary one beside it, so a reader never sees half of it. */
function writeAtomic(fsImpl, file, textBody) {
  fsImpl.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.tmp-${process.pid}`;
  fsImpl.writeFileSync(temp, textBody, 'utf8');
  fsImpl.renameSync(temp, file);
}

function readIfExists(fsImpl, file) {
  return fsImpl.existsSync(file) ? fsImpl.readFileSync(file, 'utf8') : null;
}

/** The decision's entry in its day file, added unless the file already holds it. Returns the file's repo path. */
function writeLogEntry({ row, logDir, fsImpl }) {
  const date = logDateOf(row);
  const logFile = path.join(logDir, logFileName(date));
  const before = readIfExists(fsImpl, logFile) ?? '';
  const after = appendLogEntry(before, date, row.id, renderLogEntry(row));
  if (after !== before) writeAtomic(fsImpl, logFile, after);
  return [...LOG_DIR, logFileName(date)].join('/');
}

/** A note's text with its `applied_at` line(s) blanked, to tell "only the stamp moved" from a real difference. */
function withoutAppliedAt(text) {
  return text.replace(/^applied_at: .*$/gm, 'applied_at:');
}

/**
 * One decision's files: the note, and the day file unless `logDir` is null (--notes-only).
 * Returns what to mark it with, or the reason it was not filed.
 */
function fileOne({ row, vault, logDir, fsImpl }) {
  if (row?.decision?.schema !== DECISION_SCHEMA) return { ok: false, why: 'not an inbox-decision/1 record' };
  const noteRel = [...NOTES_DIR, noteFileName(row.id)].join('/');
  const noteFile = path.join(vault, ...NOTES_DIR, noteFileName(row.id));
  const note = renderNote(row);
  const existing = readIfExists(fsImpl, noteFile);
  // A note of this id with other text was written by a person or an older run: never overwritten.
  // The one exception: a note that differs only in its `applied_at` line. A fold can stamp a row
  // after its note was written (migration 188), and this row is still unfiled, so the note is
  // written again from the row.
  if (existing !== null && existing !== note && withoutAppliedAt(existing) !== withoutAppliedAt(note)) {
    return { ok: false, why: `a different note already exists at ${noteRel}` };
  }
  if (existing !== note) writeAtomic(fsImpl, noteFile, note);

  const logRel = logDir === null ? null : writeLogEntry({ row, logDir, fsImpl });
  return { ok: true, noteRel, logRel };
}

/** Ingest the new notes in one command. False, never a throw: the nightly job ingests the vault again. */
function ingestNotes({ notes, vault, ingestProject, run, log }) {
  if (notes.length === 0) return true;
  if (ingestProject === '') {
    log('ingest: skipped (the resolver names no ingest project); the nightly job will take the notes');
    return false;
  }
  const only = notes.flatMap((rel) => ['--only', rel]);
  const result = run('uv', ['run', 'ingest', '--source', 'obsidian', '--path', vault, ...only], ingestProject);
  if (result.status !== 0) log(`ingest: failed (exit ${result.status}); the nightly job will take the notes`);
  return result.status === 0;
}

/**
 * Mark each test question skipped: no note and no entry are written for it. A skip the database
 * refuses (the item has a logged write, so the decision is a real one) is returned in `refused`:
 * the caller files that row like any other. Returns its own { skipped, failed, refused }.
 */
async function skipTestQuestions({ rows, rpc, log }) {
  const outcome = { skipped: [], failed: [], refused: [] };
  for (const row of rows) {
    try {
      if (await rpc.skipped(row.id, SKIP_WHY)) {
        outcome.skipped.push(row.id);
        log(`skipped item ${row.id}: an acceptance test question`);
      } else {
        outcome.refused.push(row);
        log(`item ${row.id}: the database kept it (its item has a logged write); it is filed like any other`);
      }
    } catch (error) {
      outcome.failed.push({ id: row.id, why: String(error?.message ?? error) });
    }
  }
  return outcome;
}

/** File the rows: the note (and the day file unless notes-only), one ingest, then the marks. Returns its own { filed, failed }. */
async function fileRows({ rows, deps }) {
  const { rpc, vault, ingestProject, logDir, options, fsImpl = fs, run = runCommand, log } = deps;
  const outcome = { filed: [], failed: [] };
  const written = [];
  for (const row of rows) {
    try {
      const filing = fileOne({ row, vault, logDir: options.notesOnly ? null : logDir, fsImpl });
      if (filing.ok) written.push({ id: row.id, ...filing });
      else outcome.failed.push({ id: row.id, why: filing.why });
    } catch (error) {
      outcome.failed.push({ id: row.id, why: String(error?.message ?? error) });
    }
  }

  const ingested = options.ingest ? ingestNotes({ notes: written.map((w) => w.noteRel), vault, ingestProject, run, log }) : false;

  for (const item of written) {
    try {
      // No log_path key at all in notes-only: the database reads that as "the day-file entry is not written yet".
      const filed = item.logRel === null
        ? { note_path: item.noteRel, ingested }
        : { note_path: item.noteRel, log_path: item.logRel, ingested };
      if (await rpc.filed(item.id, filed)) {
        outcome.filed.push(item.id);
        log(`filed item ${item.id}: ${[item.noteRel, item.logRel].filter(Boolean).join(', ')}`);
      } else outcome.failed.push({ id: item.id, why: 'the database did not mark it (already filed, or no longer archived)' });
    } catch (error) {
      outcome.failed.push({ id: item.id, why: String(error?.message ?? error) });
    }
  }
  return outcome;
}

/**
 * The default mode's second pass: the day-file entry for each row that has a note and no entry,
 * then the stamp. Returns its own { logged, failed }.
 */
async function logRows({ rows, deps }) {
  const { rpc, logDir, fsImpl = fs, log } = deps;
  const outcome = { logged: [], failed: [] };
  for (const row of rows) {
    // A test question is skipped before it can have a note; if one is listed here anyway, it gets no entry.
    if (isTestQuestion(row)) {
      log(`not logged item ${row.id}: an acceptance test question gets no day-file entry`);
      continue;
    }
    try {
      if (row?.decision?.schema !== DECISION_SCHEMA) {
        outcome.failed.push({ id: row?.id, why: 'not an inbox-decision/1 record' });
        continue;
      }
      const logRel = writeLogEntry({ row, logDir, fsImpl });
      if (await rpc.logged(row.id, logRel)) {
        outcome.logged.push(row.id);
        log(`logged item ${row.id}: ${logRel}`);
      } else outcome.failed.push({ id: row.id, why: 'the database did not stamp the log (already logged, or not filed with a note)' });
    } catch (error) {
      outcome.failed.push({ id: row?.id, why: String(error?.message ?? error) });
    }
  }
  return outcome;
}

/**
 * File every unfiled decision, and in the default mode log every unlogged one.
 * `deps`: { rpc, vault, ingestProject, logDir, options, fsImpl, run, log }.
 * Returns a new { filed, skipped, logged: number[], failed: { id, why }[] }.
 */
export async function exportDecisions(deps) {
  const { rpc, options, log } = deps;
  const unfiled = await rpc.unfiled(options.limit);
  const unlogged = options.notesOnly ? [] : await rpc.unlogged(options.limit);
  if (unfiled.length === 0 && unlogged.length === 0) {
    log('nothing to file');
    return { filed: [], skipped: [], logged: [], failed: [] };
  }
  if (options.dryRun) {
    for (const row of unfiled) {
      log(isTestQuestion(row) ? `would skip item ${row.id} (an acceptance test question)` : `would file item ${row.id} (${logDateOf(row)})`);
    }
    for (const row of unlogged) log(`would log item ${row.id} (${logDateOf(row)})`);
    return { filed: [], skipped: [], logged: [], failed: [] };
  }

  const skips = await skipTestQuestions({ rows: unfiled.filter(isTestQuestion), rpc, log });
  const refusedIds = new Set(skips.refused.map((row) => row.id));
  // Original order is kept: a refused test-shaped row is filed in its place among the others.
  const toFile = unfiled.filter((row) => !isTestQuestion(row) || refusedIds.has(row.id));
  const filing = await fileRows({ rows: toFile, deps });
  const logging = await logRows({ rows: unlogged, deps });

  const merged = {
    filed: filing.filed,
    skipped: skips.skipped,
    logged: logging.logged,
    failed: [...skips.failed, ...filing.failed, ...logging.failed],
  };
  for (const item of merged.failed) log(`not filed item ${item.id}: ${item.why}`);
  return merged;
}

/** One line to stdout: this is a command-line script, and its lines are its report. */
function printLine(line) {
  process.stdout.write(`${line}\n`);
}

/**
 * One whole run. Returns { exitCode, filed, skipped, notFiled } (the counts are 0 when the run
 * stopped before it filed anything). `deps` replaces the environment, the output and every outside call.
 */
export async function runExport(argv, { env = process.env, log = printLine, run = runCommand, fetchImpl = fetch } = {}) {
  const none = { filed: 0, skipped: 0, notFiled: 0 };
  try {
    const options = parseArgs(argv);
    const config = readConfig({ env, options });
    const { vault, ingestProject } = resolveVault({ harnessDir: config.harnessDir, run });
    const rpc = createRpc({ supabaseUrl: config.supabaseUrl, serviceKey: readServiceKey(config.secretsDir), fetchImpl });
    const result = await exportDecisions({ rpc, vault, ingestProject, logDir: config.logDir, options, run, log });
    log(`inbox-decisions-export: filed ${result.filed.length}, skipped ${result.skipped.length}, not filed ${result.failed.length}`);
    return {
      exitCode: result.failed.length === 0 ? EXIT_OK : EXIT_FAILED,
      filed: result.filed.length,
      skipped: result.skipped.length,
      notFiled: result.failed.length,
    };
  } catch (error) {
    if (error instanceof ExportError) {
      log(`inbox-decisions-export: ${error.message}`);
      return { exitCode: EXIT_CONFIG, ...none };
    }
    log(`inbox-decisions-export: failed: ${String(error?.message ?? error)}`);
    return { exitCode: EXIT_FAILED, ...none };
  }
}

/** The command-line entry: runs once, prints the machine-readable last line, returns the exit code. */
export async function main(argv, deps = {}) {
  const log = deps.log ?? printLine;
  const outcome = await runExport(argv, { ...deps, log });
  log(`${RESULT_PREFIX} ${JSON.stringify({ exit_code: outcome.exitCode, filed: outcome.filed, skipped: outcome.skipped, not_filed: outcome.notFiled })}`);
  return outcome.exitCode;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main(process.argv.slice(2));
}

/**
 * The parser's loop, the service `workspace-extract` (freeze amendment F-3). It takes one request at
 * a time from the exchange folder, runs `extractUnits` on the file the request names with the 300 s
 * limit in its `run` argument (as `sync/src/files.ts` does), and writes the units back as one JSON
 * file. It reads no secret and opens no network connection: the container has neither.
 *
 * A hostile file can take over this process and return wrong units for this document and later ones
 * until the container restarts. The worker reads what comes back as data and checks every field.
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { extractUnits } from '../../ingest/pull_files.mjs';
import { EXCHANGE_POLL_MS, EXTRACT_LIMIT_MS, type ErrorCode } from './constants.js';
import { DOC_FILE_NAME, EXCHANGE_FILES, docFileName, isRegularFileStat, readRegularFile, writeJsonAtomic } from './exchange.js';
import { asUnits, type Unit } from './units.js';

/** The parts of the environment `uv` needs to find itself, its cache and Python; nothing else. */
const UV_ENV_KEYS = /^(PATH|Path|HOME|USERPROFILE|SYSTEMROOT|SystemRoot|TEMP|TMP|TMPDIR|LANG|LC_ALL|XDG_CACHE_HOME|XDG_DATA_HOME|UV_[A-Z_]+|PYTHON[A-Z_]*)$/;
const TIMED_OUT = 'ETIMEDOUT';
const MAX_BUFFER_BYTES = 64 * 1024 * 1024;
/** A request is a few dozen bytes; a larger file is not one. */
const REQUEST_MAX_BYTES = 4096;

export function uvEnv(parent: Record<string, string | undefined>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(parent)) {
    if (value !== undefined && UV_ENV_KEYS.test(key)) out[key] = value;
  }
  return out;
}

export type ExecSyncFn = (
  file: string,
  args: string[],
  opts: { cwd: string; encoding: 'utf8'; maxBuffer: number; env: Record<string, string>; timeout: number },
) => string;

/**
 * `pull_files.mjs`'s `extractUnits` (the locked project: `uv run --locked --project ingest python
 * ingest/extract_text.py <file>`), with a child environment of only what uv needs and the 300 s
 * limit in the `run` argument, so `ingest/` is not edited.
 */
export function makeExtractor(ingestDir: string, opts: { exec?: ExecSyncFn; parentEnv?: Record<string, string | undefined> } = {}) {
  const exec = opts.exec ?? (execFileSync as unknown as ExecSyncFn);
  const env = uvEnv(opts.parentEnv ?? process.env);
  const run = (cmd: string, args: string[], o: { cwd: string; encoding: 'utf8'; maxBuffer: number }) =>
    exec(cmd, args, { ...o, maxBuffer: Math.min(o.maxBuffer, MAX_BUFFER_BYTES), env, timeout: EXTRACT_LIMIT_MS });
  return async (filePath: string): Promise<Unit[]> => {
    const units = extractUnits(ingestDir, filePath, run as unknown as typeof execFileSync) as unknown;
    const checked = asUnits(units);
    if (checked === null) throw new Error('extract: units are not the agreed shape');
    return checked;
  };
}

export interface ServeDeps {
  readonly dir: string;
  readonly extract: (filePath: string) => Promise<Unit[]>;
  readonly log: (line: string) => void;
  readonly now?: () => number;
}

interface Request {
  readonly documentId: number;
  readonly file: string;
}

/** The request as data: an integer id, and a file name that is exactly `doc-<id>.<ext>`. */
function parseRequest(text: string): { id: number; file: string | null } | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
  const { document_id: id, file } = parsed as Record<string, unknown>;
  if (typeof id !== 'number' || !Number.isSafeInteger(id) || id <= 0) return null;
  const match = typeof file === 'string' ? DOC_FILE_NAME.exec(file) : null;
  return { id, file: match !== null && match[1] === String(id) ? docFileName(id, match[2] as string) : null };
}

function answer(dir: string, documentId: number, body: { ok: true; units: Unit[] } | { ok: false; error: ErrorCode }): void {
  writeJsonAtomic(dir, EXCHANGE_FILES.answer, { document_id: documentId, ...body });
}

/** The named file must be a regular file, not a link to somewhere else. */
function isRegularDocument(file: string): boolean {
  try {
    return isRegularFileStat(fs.lstatSync(file));
  } catch {
    return false;
  }
}

async function extractOne(request: Request, d: ServeDeps): Promise<{ ok: true; units: Unit[] } | { ok: false; error: ErrorCode }> {
  const file = path.join(d.dir, request.file);
  if (!isRegularDocument(file)) return { ok: false, error: 'extract_failed' };
  try {
    return { ok: true, units: await d.extract(file) };
  } catch (error) {
    // The message is the extractor's stderr in part: only the class of failure is kept.
    return { ok: false, error: (error as { code?: unknown } | null)?.code === TIMED_OUT ? 'extract_timeout' : 'extract_failed' };
  }
}

/** Serve the request in the folder, if there is one. True when a request was found. */
export async function serveOne(d: ServeDeps): Promise<boolean> {
  const now = d.now ?? Date.now;
  const requestFile = path.join(d.dir, EXCHANGE_FILES.request);
  const bytes = readRegularFile(requestFile, REQUEST_MAX_BYTES);
  if (bytes === 'absent') return false;
  fs.rmSync(requestFile, { recursive: true, force: true });
  const request = bytes === 'refused' ? null : parseRequest(bytes.toString('utf8'));
  if (request === null) {
    d.log('parser: a request was not the agreed shape and was dropped');
    return true;
  }
  const started = now();
  if (request.file === null) {
    answer(d.dir, request.id, { ok: false, error: 'extract_failed' });
    d.log(`parser: document ${request.id} refused (file name) in ${now() - started} ms`);
    return true;
  }
  const result = await extractOne({ documentId: request.id, file: request.file }, d);
  answer(d.dir, request.id, result);
  const detail = result.ok ? `ok in ${now() - started} ms (${result.units.length} units)` : `${result.error} in ${now() - started} ms`;
  d.log(`parser: document ${request.id} answered ${detail}`);
  return true;
}

export interface ParserLoopDeps extends ServeDeps {
  readonly sleep: (ms: number) => Promise<void>;
  readonly shouldStop: () => boolean;
  readonly pollMs?: number;
  /** Replaceable in a test; `serveOne` otherwise. */
  readonly serve?: (d: ServeDeps) => Promise<boolean>;
}

/** Look for a request until told to stop. A pass that throws is logged by class and not fatal. */
export async function runParserLoop(d: ParserLoopDeps): Promise<void> {
  const serve = d.serve ?? serveOne;
  while (!d.shouldStop()) {
    let served = false;
    try {
      served = await serve(d);
    } catch (error) {
      d.log(`parser: pass failed (${error instanceof Error ? error.name : 'unknown'})`);
    }
    if (!served && !d.shouldStop()) await d.sleep(d.pollMs ?? EXCHANGE_POLL_MS);
  }
}

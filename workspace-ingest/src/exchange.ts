/**
 * The exchange folder: the one place the worker and the parser's loop meet (freeze amendment F-3).
 * Both sides are this package's, so the names and shapes are fixed here and documented in the README.
 *
 *   doc-<document id>.<ext>   the file to read; named by id and type, never by the upload's own name
 *   request.json              { "document_id": 17, "file": "doc-17.pdf" }              worker -> parser
 *   answer.json               { "document_id": 17, "ok": true, "units": [...] }        parser -> worker
 *                             { "document_id": 17, "ok": false, "error": "extract_failed" | "extract_timeout" }
 *   alive                     touched by the parser every 10 s; the service's healthcheck reads its age
 *
 * Every JSON file is written under a `.tmp` name and renamed, so a reader never sees half a file.
 * The worker reads an answer as data (at most 64 MB, every field checked) and clears the folder
 * after each document, whatever its end; the alive file is the only thing it leaves.
 *
 * The parser can write this folder, so neither side trusts what it finds there: a file is opened
 * without following a link (O_NOFOLLOW), a file the worker makes is made with O_EXCL, and what is read
 * must be a regular file (lstat before, fstat on the open descriptor). Anything else is refused and
 * removed, and the document ends `extract_failed`.
 */

import fs from 'node:fs';
import path from 'node:path';

import { ANSWER_MAX_BYTES, EXCHANGE_POLL_MS, EXTRACT_WAIT_MS, type ErrorCode } from './constants.js';
import { asUnits, type Unit } from './units.js';

export const EXCHANGE_FILES = Object.freeze({
  request: 'request.json',
  answer: 'answer.json',
  alive: 'alive',
  tmpSuffix: '.tmp',
});

/** `doc-<id>.<ext>`: the only shape of file name the parser opens. */
export const DOC_FILE_NAME = /^doc-(\d{1,15})\.(pdf|docx|pptx|xlsx)$/;

export const docFileName = (documentId: number, extension: string): string => `doc-${documentId}.${extension}`;

/** Open for reading without following a link, and without blocking on a FIFO. */
export const NOFOLLOW_READ_FLAGS = fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0) | (fs.constants.O_NONBLOCK ?? 0);
/** Create a new file, never through a link and never over a name that is already there. */
export const NOFOLLOW_CREATE_FLAGS = fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | (fs.constants.O_NOFOLLOW ?? 0);
const NEW_FILE_MODE = 0o644;

/** True only for a regular file: not a link, a directory, a device or a FIFO. */
export function isRegularFileStat(stat: fs.Stats): boolean {
  return stat.isFile() && !stat.isSymbolicLink();
}

/**
 * The bytes of a regular file of at most `maxBytes`, `'absent'` when there is no such name, or
 * `'refused'` for anything else (a link, a directory, a device, a FIFO, too large). The link check is
 * made twice: `lstat` on the name, and `fstat` on the descriptor opened with O_NOFOLLOW, so a swap
 * between the two is caught.
 */
export function readRegularFile(file: string, maxBytes: number): Buffer | 'absent' | 'refused' {
  let before: fs.Stats;
  try {
    before = fs.lstatSync(file);
  } catch (error) {
    return (error as { code?: unknown }).code === 'ENOENT' ? 'absent' : 'refused';
  }
  if (!isRegularFileStat(before)) return 'refused';
  let fd: number;
  try {
    fd = fs.openSync(file, NOFOLLOW_READ_FLAGS);
  } catch {
    return 'refused';
  }
  try {
    const opened = fs.fstatSync(fd);
    if (!isRegularFileStat(opened) || opened.size > maxBytes) return 'refused';
    return fs.readFileSync(fd);
  } catch {
    return 'refused';
  } finally {
    fs.closeSync(fd);
  }
}

/** Create `file` with these bytes, failing (EEXIST, ELOOP) when the name is taken, by a link or anything. */
export function writeNewFile(file: string, bytes: Buffer): void {
  const fd = fs.openSync(file, NOFOLLOW_CREATE_FLAGS, NEW_FILE_MODE);
  try {
    fs.writeFileSync(fd, bytes);
  } finally {
    fs.closeSync(fd);
  }
}

/** Errors that mean the name was taken by something the parser put there. */
const TAKEN_CODES: ReadonlySet<unknown> = new Set(['EEXIST', 'ELOOP', 'EISDIR', 'ENXIO', 'EPERM', 'EACCES']);

export type ParserAnswer = { ok: true; units: Unit[] } | { ok: false; code: ErrorCode };

export interface HandOverDeps {
  readonly now: () => number;
  readonly sleep: (ms: number) => Promise<void>;
  readonly pollMs?: number;
  readonly timeoutMs?: number;
}

/** Write a JSON file the other side can only see whole. */
export function writeJsonAtomic(dir: string, name: string, value: unknown): void {
  const tmp = path.join(dir, `${name}${EXCHANGE_FILES.tmpSuffix}`);
  // A stale or planted `.tmp` goes first (removing a link removes the link, not its target); the create
  // is then exclusive and never through a link, and the rename replaces whatever stands at the final name.
  fs.rmSync(tmp, { recursive: true, force: true });
  writeNewFile(tmp, Buffer.from(JSON.stringify(value)));
  fs.renameSync(tmp, path.join(dir, name));
}

/** Empty the folder, the alive file apart. A failure to remove one entry does not stop the rest. */
export function clearExchange(dir: string): void {
  for (const name of fs.readdirSync(dir)) {
    if (name === EXCHANGE_FILES.alive) continue;
    try {
      fs.rmSync(path.join(dir, name), { recursive: true, force: true });
    } catch {
      // The next document clears again; a file the parser still holds open is its own to finish.
    }
  }
}

/** The answer file's content as the worker accepts it, or why not. Never reads more than the limit. */
export function readAnswer(dir: string, documentId: number): ParserAnswer | 'absent' | 'other' {
  const bytes = readRegularFile(path.join(dir, EXCHANGE_FILES.answer), ANSWER_MAX_BYTES);
  if (bytes === 'absent') return 'absent';
  // Anything that is not a regular file within the limit is a refusal; the folder is cleared after.
  if (bytes === 'refused') return { ok: false, code: 'extract_failed' };
  let parsed: unknown;
  try {
    parsed = JSON.parse(bytes.toString('utf8'));
  } catch {
    return { ok: false, code: 'extract_failed' };
  }
  if (typeof parsed !== 'object' || parsed === null) return { ok: false, code: 'extract_failed' };
  const answer = parsed as Record<string, unknown>;
  if (answer.document_id !== documentId) return 'other';
  if (answer.ok === true) {
    const units = asUnits(answer.units);
    return units === null ? { ok: false, code: 'extract_failed' } : { ok: true, units };
  }
  return { ok: false, code: answer.error === 'extract_timeout' ? 'extract_timeout' : 'extract_failed' };
}

/**
 * Hand one file to the parser and wait for its answer. The folder is cleared before the file is
 * written and again in `finally`, so an answer left by an earlier document is never taken for this
 * one, and nothing of this one outlives it. No answer inside `timeoutMs` is `extract_timeout`.
 */
export async function handOver(
  dir: string,
  doc: { documentId: number; extension: string; bytes: Buffer },
  deps: HandOverDeps,
): Promise<ParserAnswer> {
  const pollMs = deps.pollMs ?? EXCHANGE_POLL_MS;
  const timeoutMs = deps.timeoutMs ?? EXTRACT_WAIT_MS;
  try {
    clearExchange(dir);
    const file = docFileName(doc.documentId, doc.extension);
    writeNewFile(path.join(dir, file), doc.bytes);
    writeJsonAtomic(dir, EXCHANGE_FILES.request, { document_id: doc.documentId, file });
    const deadline = deps.now() + timeoutMs;
    for (;;) {
      await deps.sleep(pollMs);
      const answer = readAnswer(dir, doc.documentId);
      if (answer !== 'absent' && answer !== 'other') return answer;
      if (deps.now() >= deadline) return { ok: false, code: 'extract_timeout' };
    }
  } catch (error) {
    // The name was taken by something the parser put there between the clear and the create.
    if (TAKEN_CODES.has((error as { code?: unknown }).code)) return { ok: false, code: 'extract_failed' };
    throw error;
  } finally {
    clearExchange(dir);
  }
}

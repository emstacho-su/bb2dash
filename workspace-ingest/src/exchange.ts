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
  fs.writeFileSync(tmp, JSON.stringify(value));
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
  const file = path.join(dir, EXCHANGE_FILES.answer);
  let size: number;
  try {
    size = fs.statSync(file).size;
  } catch {
    return 'absent';
  }
  if (size > ANSWER_MAX_BYTES) return { ok: false, code: 'extract_failed' };
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
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
    fs.writeFileSync(path.join(dir, file), doc.bytes);
    writeJsonAtomic(dir, EXCHANGE_FILES.request, { document_id: doc.documentId, file });
    const deadline = deps.now() + timeoutMs;
    for (;;) {
      await deps.sleep(pollMs);
      const answer = readAnswer(dir, doc.documentId);
      if (answer !== 'absent' && answer !== 'other') return answer;
      if (deps.now() >= deadline) return { ok: false, code: 'extract_timeout' };
    }
  } finally {
    clearExchange(dir);
  }
}

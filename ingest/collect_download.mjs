#!/usr/bin/env node
// bb2dash :: ingest/collect_download.mjs
//
//   node ingest/collect_download.mjs --id <bb_files id> --name <file_name> --since <iso|epoch ms>
//                                    --to <scratch>/downloads [--from <Chrome Downloads dir>]
//                                    [--timeout 60]
//
// bb-sync step 4b, between the browser and `pull_files.mjs`. The sync runs in Stack's own
// logged-in Chrome through Claude in Chrome, which can navigate a tab but cannot read a redirect's
// `Location` or hand bytes back to the agent. So the tab is pointed at the file's durable
// `bbcswebdav` URL and Chrome saves the file to its Downloads folder the ordinary way; this script
// then finds that file and moves it to `<to>/<id>_<safe name>` (pull_files' `downloadNameFor`),
// which is exactly what `pull_files.mjs` without `--fetch` looks for. The agent never sees, copies
// or retypes a signed CDN URL.
//
// WHICH FILE. A finished file (no `.crdownload` / `.tmp` / `.part`), saved at or after `--since`
// (less one second of clock slack), whose size is the same on two polls in a row, and whose name
// is this row's: the exact catalogue name, Chrome's ` (n)` de-dup suffix, the same name after
// Chrome's character sanitising, or the in-page snippet's `bb2dash-<id><ext>` (SKILL.md step 4b).
//
// OUTCOMES, one JSON line on stdout each:
//   0 · exactly one candidate, moved: {id, collected, from, bytes}
//   2 · nothing finished by the timeout: {id, error: 'no download'} (or 'download not finished')
//   3 · more than one candidate: {id, error, candidates}; NOTHING is moved, a human picks
//   4 · the destination already exists: nothing is moved or overwritten
//   1 · bad arguments
// It never deletes anything: the one file it takes is moved, every other file is left alone.
//
// Importing this module runs nothing: every helper is pure or takes its I/O by argument.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { downloadNameFor, parseArgs } from './pull_files.mjs';

export const EXIT = Object.freeze({ ok: 0, usage: 1, noDownload: 2, ambiguous: 3, destinationExists: 4 });
export const DEFAULT_TIMEOUT_S = 60;
export const MAX_TIMEOUT_S = 600;
export const POLL_MS = 1000;
/** A file system timestamp and the agent's clock may disagree by a little; never by more. */
export const CLOCK_SLACK_MS = 1000;

/** Characters Windows refuses in a file name; Chrome saves them as `_`. */
const ILLEGAL_RE = /[\u0000-\u001f\u007f\\/:*?"<>|]/g;
/** `name (n).ext` or `name (n)`: Chrome's de-dup suffix when the name is taken. */
const DEDUP_RE = /^(.*) \(\d+\)(\.[^. ]+)?$/;
/** The in-page snippet's own name for a file it saved: `bb2dash-<id>` plus an optional extension. */
const SNIPPET_RE = /^bb2dash-(\d+)(\.[a-z0-9]+)?$/;

/** A name as Chrome would save it on Windows, compared case-insensitively. */
function normalise(name) {
  return String(name).normalize('NFC').replace(ILLEGAL_RE, '_').trim().replace(/[. ]+$/, '').toLowerCase();
}

/** The name without Chrome's ` (n)` suffix, or the name itself. */
function withoutDedup(name) {
  const m = DEDUP_RE.exec(name);
  return m ? `${m[1]}${m[2] ?? ''}` : name;
}

/**
 * Is `actual` (a file in Downloads) the file this row asked for (`expected`, the catalogue name)?
 * Exact, de-duped, sanitised, or the snippet's `bb2dash-<id>` name for this id and no other.
 */
export function matchesExpectedName(actual, expected, id) {
  if (typeof actual !== 'string' || !actual || typeof expected !== 'string' || !expected) return false;
  const want = normalise(expected);
  const forms = [normalise(actual), normalise(withoutDedup(actual))];
  if (forms.includes(want)) return true;
  return forms.some((f) => {
    const m = SNIPPET_RE.exec(f);
    return Boolean(m) && Number(m[1]) === Number(id);
  });
}

/** A file Chrome or Windows is still writing, or Explorer's own metadata. Never a candidate. */
export function isPartialDownload(name) {
  return /\.(crdownload|tmp|part)$/i.test(String(name)) || /^desktop\.ini$/i.test(String(name));
}

/** `--since` as epoch ms: an ISO timestamp or epoch milliseconds (12+ digits), else null. */
export function parseSince(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const v = value.trim();
  if (/^\d+$/.test(v)) return v.length >= 12 ? Number(v) : null;
  if (!/^\d{4}-\d{2}-\d{2}/.test(v)) return null;
  const ms = Date.parse(v);
  return Number.isFinite(ms) ? ms : null;
}

/** The finished files in a listing that are this row's and were saved since `sinceMs`. */
export function matchingCandidates(entries, { name, id, sinceMs }) {
  return entries.filter((e) => !isPartialDownload(e.name)
    && e.mtimeMs >= sinceMs - CLOCK_SLACK_MS
    && matchesExpectedName(e.name, name, id));
}

/** Is a matching download still being written? Chrome's in-progress names, saved since `sinceMs`. */
function downloadInFlight(entries, { name, id, sinceMs }) {
  return entries.some((e) => /\.crdownload$/i.test(e.name) && e.mtimeMs >= sinceMs - CLOCK_SLACK_MS
    && (/^Unconfirmed \d+\.crdownload$/i.test(e.name) || matchesExpectedName(e.name.replace(/\.crdownload$/i, ''), name, id)));
}

/** The argument error for this run, or null. */
export function argError(args) {
  if (!/^[1-9]\d*$/.test(String(args.id ?? ''))) return '--id must be a positive bb_files id';
  if (typeof args.name !== 'string' || !args.name.trim()) return '--name must be the row\'s file_name';
  if (parseSince(args.since) === null) return '--since must be an ISO timestamp or epoch milliseconds';
  if (typeof args.to !== 'string' || !args.to.trim()) return '--to must name the scratch downloads folder';
  if (args.from !== undefined && (typeof args.from !== 'string' || !args.from.trim())) return '--from must name a folder';
  if (args.timeout !== undefined) {
    const t = Number(args.timeout);
    if (!Number.isFinite(t) || t <= 0 || t > MAX_TIMEOUT_S) return `--timeout must be seconds, 1 to ${MAX_TIMEOUT_S}`;
  }
  return null;
}

/**
 * Wait for this row's download and move it. `io` is the only way out of this function:
 * `list(dir)` → [{name, mtimeMs, size}], `exists(path)`, `move(from, to)`, `now()`, `sleep(ms)`.
 */
export async function collect({ id, name, sinceMs, from, to, timeoutMs, pollMs = POLL_MS }, io) {
  const want = { name, id, sinceMs };
  const deadline = io.now() + timeoutMs;
  let previous = new Map();
  for (;;) {
    const entries = io.list(from);
    const candidates = matchingCandidates(entries, want);
    const stable = candidates.filter((c) => c.size > 0 && previous.get(c.name) === c.size);
    const settled = candidates.length > 0 && stable.length === candidates.length && !downloadInFlight(entries, want);
    const timedOut = io.now() >= deadline;

    if (candidates.length > 1 && (settled || timedOut)) {
      return { code: EXIT.ambiguous, line: { id, error: 'more than one candidate', candidates: candidates.map((c) => c.name) } };
    }
    if (candidates.length === 1 && settled) {
      const only = candidates[0];
      const collected = downloadNameFor({ id, file_name: name });
      const dest = path.join(to, collected);
      if (io.exists(dest)) return { code: EXIT.destinationExists, line: { id, error: 'destination already exists; nothing moved', collected } };
      io.move(path.join(from, only.name), dest);
      return { code: EXIT.ok, line: { id, collected, from: only.name, bytes: only.size } };
    }
    if (timedOut) {
      return { code: EXIT.noDownload, line: { id, error: candidates.length ? 'download not finished' : 'no download' } };
    }
    previous = new Map(candidates.map((c) => [c.name, c.size]));
    await io.sleep(pollMs);
  }
}

/** The real file system, for `main`. */
export function nodeIo() {
  return {
    now: () => Date.now(),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    exists: (p) => fs.existsSync(p),
    list: (dir) => fs.readdirSync(dir, { withFileTypes: true }).filter((d) => d.isFile()).flatMap((d) => {
      try {
        const st = fs.statSync(path.join(dir, d.name));
        return [{ name: d.name, mtimeMs: st.mtimeMs, size: st.size }];
      } catch (e) {
        if (e && e.code === 'ENOENT') return []; // renamed between readdir and stat: the next poll sees it
        throw e;
      }
    }),
    move: (src, dest) => {
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      try {
        fs.renameSync(src, dest);
      } catch (e) {
        if (!e || e.code !== 'EXDEV') throw e;
        fs.copyFileSync(src, dest, fs.constants.COPYFILE_EXCL);
        fs.unlinkSync(src); // the second half of a cross-device move of the one file we took
      }
    },
  };
}

export async function main(argv = process.argv.slice(2), env = process.env, io = nodeIo()) {
  const args = parseArgs(argv);
  const bad = argError(args);
  if (bad) { console.error(`${bad}\nusage: node ingest/collect_download.mjs --id <id> --name <file_name> --since <iso|ms> --to <dir> [--from <dir>] [--timeout 60]`); return EXIT.usage; }
  const from = args.from || path.join(env.USERPROFILE || os.homedir(), 'Downloads');
  if (!fs.existsSync(from)) { console.error(`--from ${from} does not exist`); return EXIT.usage; }
  const result = await collect({
    id: Number(args.id), name: args.name, sinceMs: parseSince(args.since), from, to: args.to,
    timeoutMs: Number(args.timeout ?? DEFAULT_TIMEOUT_S) * 1000,
  }, io);
  console.log(JSON.stringify(result.line));
  return result.code;
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  main().then(
    (code) => { process.exitCode = code; },
    (e) => { console.error(String((e && e.stack) || e)); process.exitCode = EXIT.usage; },
  );
}

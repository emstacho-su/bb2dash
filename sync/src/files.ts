/**
 * Steps 8 and 9 of a pass: pull the files the fold catalogued, then finish the embedding.
 *
 * Per row of `sync_file_worklist()`:
 *   * walk the redirect hops in the runner's logged-in context and download the signed URL, both
 *     with Phase 18's signed-fetch module (this file has no copy of that fetch); take the sha256;
 *   * POST the bytes to Storage `bb-files/<key>` with the publishable key, never `x-upsert`; a 409
 *     or a Duplicate answer goes on for a course file (its key is the catalogue's) and is never done
 *     for a submission (R2 item 2);
 *   * move the download from tmpfs into course-files (copy-then-unlink on EXDEV, P-104);
 *   * extract with the locked `extract_text.py` project, POST the units to `bb_file_text`;
 *   * record the row through `sync_file_stored(…)`, which writes the prefixes itself.
 * A 401/403 at the first hop stops the step only when the login check then finds users/me dead
 * (R2 item 3); otherwise that file is `refused`; `gone`, `refused` and a
 * submission's Storage 409 go to the report's `not_pulled`. Keys and checks are `ingest/pull_files.mjs`'s
 * exported pure helpers; its `main`, whose update SQL is the owner's, is never run.
 *
 * Once at least one unit was posted, `ingest/embed_corpus.mjs`'s loop runs once, in-process; never on none.
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';

import { makePost, runEmbedLoop } from '../../ingest/embed_corpus.mjs';
import { downloadTo, resolveSignedUrl } from '../../ingest/fetch_signed.mjs';
import {
  BUCKET,
  anonHeaders,
  bytesLookValid,
  downloadNameFor,
  duplicateIsAcceptable,
  encodeKey,
  extractUnits,
  isDuplicateAnswer,
  isSubmissionRow,
  mimeFor,
  storageKeyFor,
  textPostOutcome,
  textRows,
} from '../../ingest/pull_files.mjs';
import type { FileStoredArgs, SyncRpc, WorklistRow } from './db.js';
import type { Verdict } from './login.js';
import type { FilesStepResult } from './loop.js';
import type { NotPulled } from './report.js';

const HTTP_CONFLICT = 409;
const EXTRACT_TIMEOUT_MS = 300_000;

export interface ExtractUnit {
  unit_kind: string;
  unit_no: number;
  text: string;
}

export interface TextRow {
  file_id: number | string;
  unit_kind: string;
  unit_no: number;
  text: string;
}

export interface HttpAnswer {
  status: number;
  body: string;
}

export interface MoveOps {
  mkdir(dir: string, opts: { recursive: true }): Promise<unknown>;
  rename(from: string, to: string): Promise<unknown>;
  copyFile(from: string, to: string): Promise<unknown>;
  unlink(file: string): Promise<unknown>;
}

export interface FileOps extends MoveOps {
  readFile(file: string): Promise<Buffer>;
}

export interface FilesPorts {
  rpc: Pick<SyncRpc, 'fileWorklist' | 'fileStored'>;
  /** One hop, redirects not followed, in the logged-in context (Playwright's request.get). */
  hop(url: string): Promise<{ status: number; headers: Record<string, string> }>;
  /** The signed-URL download; a signed URL carries its own authorisation. */
  fetchSigned(url: string): Promise<Response>;
  storagePost(key: string, bytes: Buffer, mime: string): Promise<HttpAnswer>;
  textPost(rows: TextRow[]): Promise<HttpAnswer>;
  extract(filePath: string): Promise<ExtractUnit[]>;
  embed(): Promise<{ code: number; tail: string }>;
  fs: FileOps;
  /** tmpfs in the container; downloads land here first. */
  tmpDir: string;
  /** The course-files volume, mounted at `/app/course context`. */
  courseFilesDir: string;
  /** The login watch's check (users/me, with its silent re-login), asked when a file answers 401/403. */
  loginCheck(): Promise<Verdict>;
  log(line: string): void;
}

function message(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).split('\n')[0] ?? '';
}

/** `base/relpath`, or null when the relpath is empty, absolute or climbs out of base. */
export function safeJoin(base: string, relpath: string): string | null {
  if (!relpath || path.isAbsolute(relpath) || path.win32.isAbsolute(relpath)) return null;
  const root = path.resolve(base);
  const full = path.resolve(root, relpath);
  return full.startsWith(root + path.sep) ? full : null;
}

/** Move a file across devices if it must: rename, and on EXDEV copy then unlink. Never a bare rename. */
export async function moveIntoPlace(from: string, to: string, ops: MoveOps): Promise<void> {
  await ops.mkdir(path.dirname(to), { recursive: true });
  try {
    await ops.rename(from, to);
  } catch (error) {
    if ((error as { code?: unknown })?.code !== 'EXDEV') throw error;
    await ops.copyFile(from, to);
    await ops.unlink(from);
  }
}

async function removeQuietly(ops: FileOps, file: string): Promise<void> {
  try {
    await ops.unlink(file);
  } catch {
    // Already gone, or never written: a temp file is best-effort.
  }
}

type RowResult = { pulled: true; unitsPosted: number } | { pulled: false; reason: string; stop?: true };

async function pullOne(row: WorklistRow, p: FilesPorts): Promise<RowResult> {
  const dest = safeJoin(p.courseFilesDir, row.relpath);
  if (!dest) return { pulled: false, reason: 'unsafe relpath' };

  const chain = await resolveSignedUrl(p.hop, row.source_url);
  if (chain.outcome === 'session_expired') {
    // R2 item 3: one file's 401/403 is not a dead login. Only a dead users/me (after the watch's
    // silent re-login) stops the step; otherwise this one file was refused.
    const verdict = await p.loginCheck();
    if (verdict === 'dead') return { pulled: false, reason: `session_expired: ${chain.reason}`, stop: true };
    const why = verdict === 'alive' ? 'but the login check passed' : 'and the login check did not answer';
    return { pulled: false, reason: `refused: ${chain.reason} at the first hop, ${why}` };
  }
  if (chain.outcome !== 'ok' || !('signedUrl' in chain) || typeof chain.signedUrl !== 'string') {
    return { pulled: false, reason: `${chain.outcome}: ${chain.reason ?? 'no signed URL'}` };
  }

  const tmp = path.join(p.tmpDir, downloadNameFor(row));
  const got = await downloadTo(p.fetchSigned, chain.signedUrl, tmp);
  if (got.outcome !== 'ok') return { pulled: false, reason: `${got.outcome}: ${got.reason}` };

  try {
    const bytes = await p.fs.readFile(tmp);
    const mime: string = mimeFor(row);
    if (!bytesLookValid(bytes, mime)) {
      return { pulled: false, reason: `bad bytes: ${bytes.length} bytes, magic ${bytes.subarray(0, 4).toString('hex')}` };
    }
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const key: string = storageKeyFor(row);

    const up = await p.storagePost(key, bytes, mime);
    if (up.status === HTTP_CONFLICT || isDuplicateAnswer(up.status, up.body)) {
      // R2 item 2: a course file's key comes from the catalogue, so the object there is this file
      // (an earlier pass uploaded it and then failed later); go on. A submission's key must never
      // be shared (052), so an occupied one is a human's call, never done.
      if (!duplicateIsAcceptable(isSubmissionRow(row))) {
        return { pulled: false, reason: `storage 409: key already occupied; a human decides whether those bytes are this file` };
      }
      p.log(`files: ${row.id} is already in Storage under its catalogue key; recording it`);
    } else if (up.status < 200 || up.status > 299) {
      return { pulled: false, reason: `storage ${up.status}: ${up.body.slice(0, 200)}` };
    }

    await moveIntoPlace(tmp, dest, p.fs);

    let units: ExtractUnit[] = [];
    try {
      units = await p.extract(dest);
    } catch (error) {
      p.log(`files: extract failed for ${row.id}: ${message(error)}`);
    }

    let unitsPosted = 0;
    if (units.length > 0) {
      const answer = await p.textPost(textRows(Number(row.id), units) as TextRow[]);
      const outcome = textPostOutcome(answer.status, answer.body);
      if (outcome === 'error') return { pulled: false, reason: `bb_file_text ${answer.status}: ${answer.body.slice(0, 200)}` };
      if (outcome === 'posted') unitsPosted = units.length;
    }

    const args: FileStoredArgs = {
      id: row.id,
      key,
      relpath: row.relpath,
      sha256,
      bytes: bytes.length,
      mime,
      textStatus: units.length > 0 ? 'extracted' : 'failed',
    };
    let stored = false;
    try {
      stored = await p.rpc.fileStored(args);
    } catch (error) {
      return { pulled: false, reason: `sync_file_stored refused: ${message(error)}` };
    }
    if (!stored) return { pulled: false, reason: 'already stored by another writer' };
    return { pulled: true, unitsPosted };
  } finally {
    await removeQuietly(p.fs, tmp);
  }
}

/** The files step and the embed step. Throws only when the worklist itself cannot be read. */
export async function runFilesStep(p: FilesPorts): Promise<FilesStepResult> {
  const rows = await p.rpc.fileWorklist();
  const notPulled: NotPulled[] = [];
  let pulled = 0;
  let unitsPosted = 0;
  let stopped: FilesStepResult['stopped'] = null;

  for (const row of rows) {
    let result: RowResult;
    try {
      result = await pullOne(row, p);
    } catch (error) {
      result = { pulled: false, reason: message(error) };
    }
    if (result.pulled) {
      pulled += 1;
      unitsPosted += result.unitsPosted;
      continue;
    }
    notPulled.push({ id: row.id, reason: result.reason });
    if (result.stop) {
      stopped = 'session_expired';
      p.log(`files: the Blackboard session expired at file ${row.id}; ${rows.length - pulled - notPulled.length} left for the next sync`);
      break;
    }
  }
  p.log(`files: ${pulled} pulled, ${notPulled.length} not pulled, ${unitsPosted} units posted`);

  let embedError: string | null = null;
  if (unitsPosted > 0) {
    const run = await p.embed();
    if (run.code !== 0) embedError = `embed_corpus.mjs's loop ended ${run.code}: ${run.tail}`;
  }

  return { files: { pulled, not_pulled: notPulled }, stopped, embedError };
}

/** Storage and `bb_file_text` POSTs with the publishable key (`SB_ANON_KEY`), as pull_files.mjs does. */
export function makeSupabaseFiles(supabaseUrl: string, anonKey: string, fetchImpl: typeof fetch = fetch) {
  return {
    async storagePost(key: string, bytes: Buffer, mime: string): Promise<HttpAnswer> {
      const res = await fetchImpl(`${supabaseUrl}/storage/v1/object/${BUCKET}/${encodeKey(key)}`, {
        method: 'POST',
        headers: anonHeaders(anonKey, mime),
        body: new Uint8Array(bytes),
      });
      return { status: res.status, body: await res.text() };
    },
    async textPost(rows: TextRow[]): Promise<HttpAnswer> {
      const res = await fetchImpl(`${supabaseUrl}/rest/v1/bb_file_text`, {
        method: 'POST',
        headers: { ...anonHeaders(anonKey, 'application/json'), Prefer: 'return=minimal' },
        body: JSON.stringify(rows),
      });
      return { status: res.status, body: res.ok ? '' : await res.text() };
    },
  };
}

/** The parts of the environment `uv` needs to find itself, its cache and Python; nothing else. */
const UV_ENV_KEYS = /^(PATH|Path|HOME|USERPROFILE|SYSTEMROOT|SystemRoot|TEMP|TMP|TMPDIR|LANG|LC_ALL|XDG_CACHE_HOME|XDG_DATA_HOME|UV_[A-Z_]+|PYTHON[A-Z_]*)$/;

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
 * R2 item 9: pull_files.mjs's `extractUnits` (the locked project: `uv run --locked --project ingest
 * python ingest/extract_text.py <file>`, W-56's task 14), with a child environment of only what uv
 * needs: no secret of the runner's reaches it.
 */
export function makeExtractor(
  ingestDir: string,
  opts: { exec?: ExecSyncFn; parentEnv?: Record<string, string | undefined> } = {},
) {
  const exec = opts.exec ?? (execFileSync as unknown as ExecSyncFn);
  const env = uvEnv(opts.parentEnv ?? process.env);
  // extractUnits' runner is typed from its execFileSync default; this one adds the env and a timeout.
  const runner = (cmd: string, args: string[], o: { cwd: string; encoding: 'utf8'; maxBuffer: number }) =>
    exec(cmd, args, { ...o, env, timeout: EXTRACT_TIMEOUT_MS });
  return async (filePath: string): Promise<ExtractUnit[]> =>
    extractUnits(ingestDir, filePath, runner as unknown as typeof execFileSync) as ExtractUnit[];
}

/** runEmbedLoop as this file calls it (its JS defaults type it too narrowly to call with post). */
export type EmbedLoopFn = (o: {
  post: (body: object) => Promise<{ status: number; body: unknown }>;
  log: (line: string) => void;
}) => Promise<unknown>;

export interface EmbedderOptions {
  supabaseUrl: string;
  /** The legacy anon JWT (`SB_ANON_JWT`): `embed-corpus` has verify_jwt on. */
  jwt: string;
  log: (line: string) => void;
  runLoop?: EmbedLoopFn;
  makePost?: typeof makePost;
}

/** R2 item 9: `embed_corpus.mjs`'s own loop, in-process, until `remaining_parts = 0`. No child process. */
export function makeEmbedder(o: EmbedderOptions) {
  const loop = o.runLoop ?? (runEmbedLoop as unknown as EmbedLoopFn);
  const post = (o.makePost ?? makePost)(o.supabaseUrl, o.jwt);
  return async (): Promise<{ code: number; tail: string }> => {
    const result = (await loop({ post, log: o.log })) as { exitCode: number; remainingParts?: number | null; error?: string };
    const tail = result.exitCode === 0 ? `remaining_parts=${result.remainingParts ?? 0}` : String(result.error ?? 'embed failed');
    return { code: result.exitCode, tail: tail.slice(0, 300) };
  };
}

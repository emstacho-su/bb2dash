#!/usr/bin/env node
// bb2dash :: ingest/pull_files.mjs
//
//   node ingest/pull_files.mjs --manifest <manifest.json> --downloads <dir> [--mirror <dir>]
//                              [--bucket my_submissions] [--only 119,152] [--out <sql path>]
//                              [--dry-run]
//
// CADENCE_RUNBOOK step 4, the one step no automation replaced: store the bytes of the bb_files
// rows the transform catalogued with `storage_path is null`. First run 2026-09-22 (12 files).
//
// TWO CALLERS, ONE GATE. Course files are runbook step 4; Stack's own submitted files are bb-sync
// step 4b, catalogued by `stage_attempts` with `bucket = 'my_submissions'`. They differ in four
// small ways and nothing else: `--bucket my_submissions` selects them (with no flag the run takes
// course rows only, so neither caller can ever write the other's rows), their update keeps the mime
// Blackboard declared (`coalesce`, see below), their notes line names step 4b, and an occupied
// Storage key fails the row instead of counting as done. A manifest row with no `bucket` key —
// every manifest written before 2026-09-22 — is a course file.
//
// THE SHAPE. Two halves, because bbcswebdav URLs 302 to a cross-origin CDN with no CORS:
//   1. Something holding the Blackboard session records the redirect chain for each file — the
//      browser half. It follows nothing and downloads nothing; it walks hops one at a time with
//      `page.context().request.get(u, { maxRedirects: 0 })` through `ingest/fetch_signed.mjs`'s
//      `resolveSignedUrl`, and writes the resulting `hops` array onto the manifest row. The old
//      route through Playwright's `download` event is gone: it crashed the MCP browser on
//      2026-09-23 and left a sync unable to store three catalogued files.
//   2. This script does the rest, per manifest row. With `--fetch` it validates the row's `hops`
//      and downloads the signed URL itself (a signed CDN URL carries its own authorisation, so no
//      session is needed here); without it, it finds an already-downloaded `<id>_*` in --downloads.
//      Then: check size and magic bytes, copy to the local mirror (`course context/<relpath>`),
//      POST to Storage `bb-files/<key>` with the publishable key (anon is insert-only, never
//      `x-upsert`; a Duplicate answer means the object is already there), run extract_text.py
//      under uv with its three libraries, POST the units to /rest/v1/bb_file_text (anon
//      insert-only; `char_count` is generated, never sent), and write the `update bb_files …`
//      statements to --out for the owner to run through execute_sql. Unless `--no-embed`, a run
//      that posted any unit finishes by calling `ingest/embed_corpus.mjs`'s loop, so the text it
//      just stored is actually searchable when the run ends.
//      A `gone` outcome (404) means the file is no longer on Blackboard: the row is left alone and
//      reported, and a human marks it `superseded_by` its replacement. A `session_expired` outcome
//      (401/403 on the first hop) stops the whole run: every remaining row would fail the same way.
//
// TWO MODES, ALWAYS EXCLUSIVE. Course files (no flag) and Stack's submissions (`--bucket
// my_submissions`) each take their own rows and can never write the other's. Re-pulling a file
// whose stored bytes went stale is deliberately NOT here: it replaces text already in the corpus,
// so it belongs in a step someone runs on purpose, not in every sync.
//
// THE MANIFEST. One JSON array from this query (execute_sql), saved to a file:
//   select jsonb_agg(jsonb_build_object('id', f.id, 'file_name', f.file_name,
//            'relpath', bb_file_relpath(f.id), 'mime', f.mime_type, 'source_url', f.source_url,
//            'bucket', f.bucket, 'attempt_id', f.attempt_id))
//     from bb_files f where f.storage_path is null and f.superseded_by is null;
//   With `--fetch`, the browser half adds `hops` to every row before this script reads it.
//   `mime` may be null: it is then inferred from the extension. An optional `key` overrides the
//   Storage key (a re-upload of an already-stored file needs its own; see file 145). `attempt_id`
//   is carried for the operator's report only; nothing here reads it.
//
// STORAGE KEYS. Supabase Storage rejects `#` in a key; the key drops it, the mirror keeps the real
// name, and `storage_path` records the key. Nothing else is renamed — in particular the
// `attempt-<digits>/` segment migration 052 gives a submission relpath survives into the key, which
// is what keeps a pulled-back submission off the key of a file Stack staged under the same name.
//
// Importing this module runs nothing: every helper is pure and exported for pull_files.test.mjs.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

import { downloadTo, validateHops } from './fetch_signed.mjs';
import { DEFAULT_MAX_PARTS, makePost, runEmbedLoop } from './embed_corpus.mjs';

export const DEFAULT_SUPABASE_URL = 'https://goultdzqcavefcgnifdy.supabase.co';
export const BUCKET = 'bb-files';
/** The one `bb_files.bucket` value that means "Stack handed this in" — bb-sync step 4b's rows. */
export const SUBMISSION_BUCKET = 'my_submissions';
export const MIN_BYTES = 1000;
export const MIME_BY_EXT = {
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};
const EXTRACT_DEPS = ['python-docx', 'python-pptx', 'openpyxl'];

/** Minimal argv parser: `--name value` pairs and `--flag` booleans. */
export function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const name = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) out[name] = true;
    else { out[name] = next; i++; }
  }
  return out;
}

/** Mime type for a manifest row: the catalogued one, else by extension. */
export function mimeFor(row) {
  if (row.mime) return row.mime;
  const ext = path.extname(row.file_name || row.relpath || '').toLowerCase();
  return MIME_BY_EXT[ext] ?? 'application/octet-stream';
}

/** The Storage object key: an explicit override wins; otherwise the relpath without `#`. */
export function storageKeyFor(row) {
  if (row.key) return row.key;
  return String(row.relpath).replace(/#/g, '_');
}

/**
 * A file name that Windows will actually accept. Blackboard display names carry `:`, `?`, `*`,
 * `"` and `|`, none of which may appear in a path here, and a failed write would be reported as a
 * byte-fetch problem rather than the naming problem it is. Only the scratch download name is
 * cleaned; the Storage key and the mirror keep the catalogue's own spelling.
 */
export function safeBasename(name) {
  return path.basename(String(name)).replace(/[:?*"<>|]/g, '_') || 'file';
}

/** Encode a key for the Storage URL, one path segment at a time (slashes stay). */
export function encodeKey(key) {
  return key.split('/').map(encodeURIComponent).join('/');
}

/** Do these bytes look like the file the catalog says? PDF magic, or a zip (docx/pptx/xlsx). */
export function bytesLookValid(bytes, mime) {
  if (!bytes || bytes.length < MIN_BYTES) return false;
  if (mime === 'application/pdf') return bytes.subarray(0, 4).toString() === '%PDF';
  return bytes[0] === 0x50 && bytes[1] === 0x4b;
}

/** The downloaded file for a manifest id: `<id>_<name>` in the downloads dir. */
export function findDownload(fileNames, id) {
  return fileNames.find((f) => f.startsWith(`${id}_`)) ?? null;
}

/** Is this a submission row? A manifest row with no `bucket` key predates 4b and is a course file. */
export function isSubmissionRow(row) {
  return row?.bucket === SUBMISSION_BUCKET;
}

/** Which of the two exclusive runs this is. */
export function modeOf(args) {
  return args?.bucket === SUBMISSION_BUCKET ? 'submissions' : 'course';
}

/**
 * The rows this run may touch: --only (comma-separated ids; empty means all), then the bucket gate.
 * `--bucket my_submissions` keeps submission rows alone; no flag keeps course rows alone. The gate
 * is why a submission pass can never write a course row, or a course pass a submission.
 */
export function filterManifest(rows, only, bucket) {
  const ids = String(only ?? '').split(',').map((s) => s.trim()).filter(Boolean).map(Number);
  const byId = ids.length === 0 ? rows : rows.filter((r) => ids.includes(Number(r.id)));
  const wantSubmissions = bucket === SUBMISSION_BUCKET;
  return byId.filter((r) => isSubmissionRow(r) === wantSubmissions);
}

/**
 * The validated signed URL for a `--fetch` row, from the hops the browser half recorded.
 * A row with no hops is refused, never guessed at: the durable URL is not downloadable.
 */
export function hopsForRow(row) {
  return validateHops(row?.hops);
}

/** The embed step runs once, at the end, and only when this run actually posted new text. */
export function shouldEmbed({ dryRun, noEmbed, unitsPosted }) {
  return !dryRun && !noEmbed && Number(unitsPosted) > 0;
}

/** extract_text.py prints `[{file, status, units}]`; the units of the first (only) file, or []. */
export function parseExtractOutput(json) {
  const parsed = JSON.parse(json);
  const first = Array.isArray(parsed) ? parsed[0] : null;
  return first && Array.isArray(first.units) ? first.units : [];
}

/** bb_file_text rows for a file. `char_count` is a generated column and must not be sent. */
export function textRows(fileId, units) {
  return units.map((u) => ({ file_id: fileId, unit_kind: u.unit_kind, unit_no: u.unit_no, text: u.text }));
}

/** A Storage POST answer that means "the object is already there". */
export function isDuplicateAnswer(status, body) {
  return status !== 200 && /already exists|Duplicate/i.test(String(body));
}

/**
 * Is that duplicate answer good enough to go on? For a course file yes: the key is derived from the
 * catalogue, so the object under it is this file. For a submission NO — migration 052's
 * `attempt-<digits>` segment means nothing should ever share the key, so an occupied one holds
 * bytes this step did not write and must not point a Blackboard row at. bb-sync step 4b reports the
 * row, leaves `storage_path` null, and a human decides.
 */
export function duplicateIsAcceptable(submission) {
  return !submission;
}

const q = (s) => `'${String(s).replace(/'/g, "''")}'`;

/**
 * The one statement the owner runs per file; the script never writes bb_files itself.
 * A submission row differs twice: `mime_type` is `coalesce`d, because since migration 085 the
 * catalogue already carries the type Blackboard declared and a bbcswebdav download often answers
 * `application/octet-stream` — keep what Blackboard said, fall back to the observed type only for a
 * pre-v4 row that has none. And its notes line names the step that pulled it.
 */
export function bbFilesUpdateSql({ id, key, relpath, sha256, size, mime, textStatus, pulledOn, submission = false }) {
  const mimeAssign = submission ? `mime_type = coalesce(mime_type, ${q(mime)})` : `mime_type = ${q(mime)}`;
  const pulledBy = submission ? 'bb-sync step 4b' : 'ingest/pull_files.mjs';
  return (
    `update bb_files set storage_path = ${q(`${BUCKET}/${key}`)}, local_path = ${q(`course context/${relpath}`)}, ` +
    `sha256 = ${q(sha256)}, bytes = ${size}, ${mimeAssign}, downloaded_at = now(), ` +
    `text_status = ${q(textStatus)}, notes = coalesce(notes, '') || ${q(` | bytes pulled ${pulledOn} by ${pulledBy}`)} ` +
    `where id = ${id} and storage_path is null;`
  );
}

/** Headers for the publishable key: apikey + bearer, as every anon insert in this repo does. */
export function anonHeaders(key, contentType) {
  return { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': contentType };
}

function extractUnits(ingestDir, filePath) {
  const args = ['run', '--python', '3.12', ...EXTRACT_DEPS.flatMap((d) => ['--with', d]), 'python', path.join(ingestDir, 'extract_text.py'), filePath];
  const out = execFileSync('uv', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, cwd: ingestDir });
  return parseExtractOutput(out);
}

/**
 * Get this row's bytes onto disk and hand back the local path.
 *
 * With `--fetch` that means validating the hops the browser half recorded and downloading the
 * signed URL; without it, finding the file a browser already saved. A `session_expired` outcome is
 * marked `fatal` so the caller stops the whole run: the session is gone and every remaining row
 * would fail identically, which is a page of noise instead of one clear line.
 */
async function bytesOnDisk(row, ctx) {
  const { downloads, downloadNames, fetchMode, fetchImpl } = ctx;
  if (!fetchMode) {
    const local = findDownload(downloadNames, row.id);
    if (!local) return { error: 'no download' };
    return { localPath: path.join(downloads, local) };
  }
  const chain = hopsForRow(row);
  if (chain.outcome !== 'ok') {
    return { error: `hops ${chain.outcome}: ${chain.reason ?? 'no signed URL'}`, outcome: chain.outcome };
  }
  const dest = path.join(downloads, `${row.id}_${safeBasename(row.file_name || row.relpath)}`);
  const got = await downloadTo(fetchImpl, chain.signedUrl, dest);
  if (got.outcome !== 'ok') {
    return { error: `download ${got.outcome}: ${got.reason}`, outcome: got.outcome, fatal: got.outcome === 'session_expired' };
  }
  return { localPath: dest };
}

async function pullOne(row, ctx) {
  const { mirror, supabaseUrl, key, ingestDir, dryRun, pulledOn } = ctx;

  const got = await bytesOnDisk(row, ctx);
  if (got.error) return { id: row.id, error: got.error, outcome: got.outcome, fatal: got.fatal };
  const localPath = got.localPath;

  const bytes = fs.readFileSync(localPath);
  const mime = mimeFor(row);
  if (!bytesLookValid(bytes, mime)) return { id: row.id, error: `bad bytes: ${bytes.length} bytes, magic ${bytes.subarray(0, 4).toString('hex')}` };
  const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
  const submission = isSubmissionRow(row);
  const storageKey = storageKeyFor(row);
  const tag = submission ? { submission: true } : {};
  if (dryRun) return { id: row.id, key: storageKey, size: bytes.length, sha256: sha256.slice(0, 12), ...tag, dryRun: true };

  const dest = path.join(mirror, row.relpath);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(localPath, dest);

  const up = await fetch(`${supabaseUrl}/storage/v1/object/${BUCKET}/${encodeKey(storageKey)}`, {
    method: 'POST', headers: anonHeaders(key, mime), body: bytes,
  });
  const upBody = await up.text();
  if (!up.ok) {
    if (!isDuplicateAnswer(up.status, upBody)) return { id: row.id, error: `storage ${up.status}: ${upBody.slice(0, 200)}` };
    // A course key is derived from the catalogue, so an occupied one holds this same file. Only a
    // submission key must never be assumed (migration 052: nothing should ever share it).
    if (!duplicateIsAcceptable(submission)) {
      return { id: row.id, key: storageKey, ...tag, error: `Storage key already occupied (${up.status}); a human decides whether those bytes are this file` };
    }
  }

  let units = [];
  let extractError = null;
  try { units = extractUnits(ingestDir, localPath); } catch (e) { extractError = String(e).slice(0, 200); }

  let unitsPosted = 0;
  if (units.length) {
    const tr = await fetch(`${supabaseUrl}/rest/v1/bb_file_text`, {
      method: 'POST', headers: { ...anonHeaders(key, 'application/json'), Prefer: 'return=minimal' },
      body: JSON.stringify(textRows(row.id, units)),
    });
    if (!tr.ok) return { id: row.id, error: `bb_file_text ${tr.status}: ${(await tr.text()).slice(0, 200)}` };
    unitsPosted = units.length;
  }

  const textStatus = units.length ? 'extracted' : 'failed';
  const sql = bbFilesUpdateSql({ id: row.id, key: storageKey, relpath: row.relpath, sha256, size: bytes.length, mime, textStatus, pulledOn, submission });
  return { id: row.id, key: storageKey, size: bytes.length, sha256: sha256.slice(0, 12), ...tag, storage: up.status, units: units.length, unitsPosted, textStatus, extractError, sql };
}

export async function main(argv = process.argv.slice(2), env = process.env) {
  const args = parseArgs(argv);
  if (!args.manifest || !args.downloads) {
    console.error('usage: node ingest/pull_files.mjs --manifest <json> --downloads <dir> [--mirror <dir>] [--bucket my_submissions] [--fetch] [--only ids] [--out <sql>] [--dry-run] [--no-embed]');
    console.error('note: --dry-run writes nothing to Storage, the mirror or the database, but with --fetch it still downloads the bytes, because the key and sha it reports are computed from them.');
    return 2;
  }
  if (args.bucket !== undefined && args.bucket !== SUBMISSION_BUCKET) {
    console.error(`--bucket takes only '${SUBMISSION_BUCKET}' (bb-sync step 4b); omit it for course files`);
    return 2;
  }
  const key = env.SB_ANON_KEY || env.SUPABASE_PUBLISHABLE_KEY;
  if (!key && !args['dry-run']) { console.error('SB_ANON_KEY (the publishable key) is not set'); return 2; }
  const ingestDir = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
  const mode = modeOf(args);
  const ctx = {
    downloads: args.downloads,
    // Only --fetch may name a directory that does not exist yet; it creates it below. Without
    // --fetch a wrong path must fail here, not as a wall of "no download" plus a late ENOENT
    // when the .sql file is written into that same missing directory.
    downloadNames: args.fetch === true
      ? (fs.existsSync(args.downloads) ? fs.readdirSync(args.downloads) : [])
      : fs.readdirSync(args.downloads),
    mirror: args.mirror || path.join(ingestDir, '..', 'course context'),
    supabaseUrl: env.SUPABASE_URL || DEFAULT_SUPABASE_URL,
    key, ingestDir, dryRun: args['dry-run'] === true,
    fetchMode: args.fetch === true,
    fetchImpl: (url) => fetch(url),
    pulledOn: new Date().toISOString().slice(0, 10),
  };
  if (ctx.fetchMode) fs.mkdirSync(args.downloads, { recursive: true });

  const rows = filterManifest(JSON.parse(fs.readFileSync(args.manifest, 'utf8')), args.only, args.bucket);
  const results = [];
  let stopped = null;
  for (const row of rows) {
    const r = await pullOne(row, ctx);
    results.push(r);
    if (r.fatal) {
      // The Blackboard session died mid-run. Stop: every remaining row fails the same way, and the
      // rows already pulled keep their SQL so the run is not wasted.
      stopped = r;
      break;
    }
  }

  const sql = results.filter((r) => r.sql).map((r) => `-- file ${r.id}\n${r.sql}`).join('\n');
  const out = args.out || path.join(args.downloads, 'pull_files.sql');
  if (!ctx.dryRun) fs.writeFileSync(out, sql + '\n');
  for (const r of results) console.log(JSON.stringify({ ...r, sql: undefined }));

  const unitsPosted = results.reduce((n, r) => n + (r.unitsPosted || 0), 0);
  let embedNote = '';
  if (shouldEmbed({ dryRun: ctx.dryRun, noEmbed: args['no-embed'] === true, unitsPosted })) {
    const jwt = env.SB_ANON_JWT;
    if (!jwt) {
      embedNote = '; embed step skipped (SB_ANON_JWT is not set) — run ingest/embed_corpus.mjs';
    } else {
      const embed = await runEmbedLoop({
        post: makePost(ctx.supabaseUrl, jwt),
        maxParts: DEFAULT_MAX_PARTS,
        log: (line) => console.log(line),
      });
      embedNote = embed.exitCode === 0 ? '; embeddings finished' : `; EMBED FAILED — ${embed.error}`;
      if (embed.exitCode !== 0) {
        console.error(embed.error);
        console.log(`${results.filter((r) => r.sql).length} of ${rows.length} pulled (${mode}); bb_files updates in ${out}${embedNote}`);
        return 1;
      }
    }
  }

  if (ctx.dryRun) {
    console.log(`dry run (${mode}): ${results.filter((r) => r.dryRun).length} of ${rows.length} would be pulled`);
  } else {
    console.log(`${results.filter((r) => r.sql).length} of ${rows.length} pulled (${mode}); bb_files updates in ${out}${embedNote}`);
  }
  if (stopped) console.error(`STOPPED: ${stopped.error} — the Blackboard session is gone; re-run the sync after logging in`);
  return results.some((r) => r.error) ? 1 : 0;
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) main().then((code) => process.exit(code));

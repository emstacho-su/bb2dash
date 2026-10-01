#!/usr/bin/env node
// bb2dash :: ingest/pull_files.mjs
//
//   node ingest/pull_files.mjs --manifest <manifest.json> --downloads <dir> [--mirror <dir>]
//                              [--bucket my_submissions] [--only 119,152] [--out <sql path>]
//                              [--dry-run] [--no-embed] [--fetch] [--restale]
//   node ingest/pull_files.mjs --restale-post --downloads <dir> [--only ids] [--no-embed]
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
//   1. The browser half gets each file's bytes onto disk as `<id>_<name>` (`downloadNameFor`).
//      THE SYNC'S WAY (bb-sync step 4b, since 2026-10-01): the sync runs only in Stack's logged-in
//      Chrome through Claude in Chrome, which cannot read a redirect. The tab is navigated to
//      `<source_url>?xythos-download=true`, Chrome saves the file to its Downloads folder (an
//      inline PDF is saved by a same-origin snippet on the CDN page), and
//      `ingest/collect_download.mjs` moves it into --downloads. No signed URL ever passes through
//      the agent. Then this script runs WITHOUT `--fetch`.
//      THE FALLBACK (`--fetch`), only for a caller holding a Playwright-style request API and a
//      logged-in context: walk hops one at a time with `request.get(u, { maxRedirects: 0 })`
//      through `ingest/fetch_signed.mjs`'s `resolveSignedUrl` and write the `hops` array onto each
//      manifest row. Playwright's `download` event is never used: it crashed the MCP browser on
//      2026-09-23 and left a sync unable to store three catalogued files.
//   2. This script does the rest, per manifest row. Without `--fetch` it finds the `<id>_*` file
//      already in --downloads; with `--fetch` it validates the row's `hops` and downloads the
//      signed URL itself (a signed CDN URL carries its own authorisation, so no session is needed).
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
// THE MODES, ALWAYS EXCLUSIVE. Course files (no flag) and Stack's submissions (`--bucket
// my_submissions`) each take their own rows and can never write the other's. Re-pulling a file
// whose stored bytes went stale is `--restale` then `--restale-post` (see the --restale block
// below): it replaces text already in the corpus, so it runs on its own rows and in its own runs,
// and it never puts document text into the owner SQL.
//
// THE MANIFEST. One JSON array from this query (execute_sql), saved to a file:
//   select jsonb_agg(jsonb_build_object('id', f.id, 'file_name', f.file_name,
//            'relpath', bb_file_relpath(f.id), 'mime', f.mime_type, 'source_url', f.source_url,
//            'bucket', f.bucket, 'attempt_id', f.attempt_id))
//     from bb_files f where f.storage_path is null and f.superseded_by is null
//      and f.source_url is not null and not bb_file_is_outside_link(f.source_url);
//   An outside link (migration 161: an http(s) source_url off the Blackboard host) is never pulled.
//   With `--fetch`, the Playwright fallback adds `hops` to every row before this script reads it.
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

/**
 * The name a manifest row's bytes go by in --downloads: `<id>_<safe name>`. `findDownload` looks
 * for this prefix, `--fetch` writes it, and `ingest/collect_download.mjs` moves a Chrome download
 * to it: one spelling for all three.
 */
export function downloadNameFor(row) {
  return `${row.id}_${safeBasename(row.file_name || row.relpath)}`;
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
  if (args?.['restale-post']) return 'restale-post';
  if (args?.restale) return 'restale';
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
export function duplicateIsAcceptable(submission, { restale = false } = {}) {
  // A restale key carries the new bytes' sha. If it is already occupied (a run that stopped midway,
  // or a re-run before the owner SQL), the object is NOT overwritten and NOT trusted: the owner SQL
  // refuses to re-point the row unless storage.objects holds exactly these bytes (md5 eTag + size).
  // That check is what makes an occupied restale key resumable instead of a dead end.
  void restale;
  return !submission;
}

export const sha256Hex = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
/** Storage's eTag for a single (non-multipart) upload is the quoted md5 of the body. */
export const md5Hex = (bytes) => crypto.createHash('md5').update(bytes).digest('hex');

/**
 * Where this run writes its owner SQL. An earlier run's non-empty file is never truncated: its rows
 * may not have been executed yet and are not re-processed here, so a new per-run file is written
 * next to it (`<name>.<stamp>.sql`) and the run says which.
 */
export function resolveOutPath(out, stamp) {
  let existing = '';
  try { existing = fs.readFileSync(out, 'utf8'); } catch { return out; }
  if (existing.trim() === '') return out;
  const ext = path.extname(out) || '.sql';
  return path.join(path.dirname(out), `${path.basename(out, path.extname(out))}.${stamp}${ext}`);
}

const q = (s) => `'${String(s).replace(/'/g, "''")}'`;

// ---------------------------------------------------------------------------------------------
// --restale: re-pull a row whose stored bytes went stale.
//
// `stage_files` (074 and its predecessors) appends `; stored bytes may be stale` to a row's notes
// when the instructor re-uploads a file under the same item (same content id and name, new rid).
// The stored bytes and their text may then be out of date. This mode re-fetches them.
//
// THE RULE IT KEEPS (PR #32's security review): professor-authored document text never lands in
// SQL an agent reads and hands to a privileged execute_sql. Text goes over PostgREST exactly as the
// normal pull posts it. The owner SQL carries only ids, Storage keys, hashes, a mime shape, a date
// and this script's own constant wording, and each of those is shape-checked before it is written.
//
// WHY TWO RUNS. `bb_file_text` is unique on (file_id, unit_kind, unit_no) and anon can insert but
// not select or delete, so the new units cannot be posted while the old ones are there, and only
// the owner can remove the old ones. So:
//   1. `--restale` fetches the bytes and hashes them. Unchanged bytes → owner SQL that only clears
//      the note. Changed bytes → a NEW Storage key (a `restale-<sha12>/` segment; the old object is
//      never overwritten and stays where it is), a mirror copy at that new path, the units staged
//      on local disk (`<downloads>/restale_units/<id>.json`), and one owner transaction per row:
//      delete the old units (their embeddings cascade), point the row at the new key and sha, and
//      replace the marker with a dated "re-pulled" note. Both statements are guarded on the old
//      sha, so a row that changed since the manifest was read is left alone. The transaction
//      opens with a guard that aborts unless storage.objects holds exactly these bytes at the new
//      key (md5 eTag + size): that is why an occupied restale key is resumed, never refused or
//      overwritten. A row that uploads but gets no units reports its orphaned key.
//   2. The owner runs that SQL through execute_sql.
//   3. `--restale-post` posts each staged file's units to /rest/v1/bb_file_text and runs the embed
//      step. A 409 there means step 2 has not run for that row yet; the file stays staged.
//
// THE MANIFEST for --restale adds three keys to the normal one (ids, hashes and a boolean only):
//   select jsonb_agg(jsonb_build_object('id', f.id, 'file_name', f.file_name,
//            'relpath', bb_file_relpath(f.id), 'mime', f.mime_type, 'source_url', f.source_url,
//            'bucket', f.bucket, 'storage_path', f.storage_path, 'sha256', f.sha256,
//            'stale', true) order by f.id)
//     from bb_files f
//    where f.superseded_by is null and f.storage_path is not null
//      and f.notes like '%stored bytes may be stale%' and not bb_file_is_outside_link(f.source_url);
// ---------------------------------------------------------------------------------------------

/** The exact wording stage_files appends (034, 037, 043, 053, 074); prod rows 72 and 144 carry it. */
export const STALE_MARKER = '; stored bytes may be stale';
const RESTALE_BY = 'ingest/pull_files.mjs --restale';
const SHA_RE = /^[0-9a-f]{64}$/;
const MD5_RE = /^[0-9a-f]{32}$/;
// The storage guard is a DO block quoted with this tag, so no key may contain it.
const GUARD_TAG = '$restale$';
const MIME_RE = /^[a-z0-9.+-]+\/[a-z0-9.+-]+$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ID_RE = /^\d+$/;
// A key or relpath is a catalogue path: one line, no control characters.
const NO_CONTROL_RE = /^[^\u0000-\u001f\u007f]+$/;

function mustMatch(value, re, what) {
  if (!re.test(String(value))) throw new Error(`restale: refusing a malformed ${what}`);
  return String(value);
}

/** Rows --restale may take: flagged stale, bytes already stored, a well-formed sha, not a submission. */
export function filterRestale(rows, only) {
  const ids = String(only ?? '').split(',').map((s) => s.trim()).filter(Boolean).map(Number);
  return rows.filter((r) => (ids.length === 0 || ids.includes(Number(r.id)))
    && r.stale === true && Boolean(r.storage_path) && SHA_RE.test(String(r.sha256))
    && ID_RE.test(String(r.id)) && !isSubmissionRow(r));
}

/** The relpath for re-pulled bytes: the same folder plus a `restale-<sha12>/` segment. */
export function restaleRelpath(relpath, sha256) {
  const p = String(relpath);
  const cut = p.lastIndexOf('/');
  const dir = cut >= 0 ? p.slice(0, cut + 1) : '';
  return `${dir}restale-${mustMatch(sha256, SHA_RE, 'sha256').slice(0, 12)}/${p.slice(cut + 1)}`;
}

/** The owner transaction for a row whose bytes changed. Ids, keys and hashes only. */
export function restaleSql({ id, oldSha, newSha, key, relpath, size, mime, pulledOn, md5 }) {
  const fid = mustMatch(id, ID_RE, 'id');
  const was = q(mustMatch(oldSha, SHA_RE, 'old sha256'));
  const now = q(mustMatch(newSha, SHA_RE, 'new sha256'));
  const bytes = mustMatch(size, ID_RE, 'size');
  const type = q(mustMatch(mime, MIME_RE, 'mime'));
  const day = mustMatch(pulledOn, DATE_RE, 'date');
  mustMatch(key, NO_CONTROL_RE, 'key');
  mustMatch(relpath, NO_CONTROL_RE, 'relpath');
  const etag = q(`"${mustMatch(md5, MD5_RE, 'md5')}"`);
  if (String(key).includes(GUARD_TAG)) throw new Error('restale: refusing a key that holds the guard quote tag');
  // The row is re-pointed only if the object at the new key is these bytes. The script cannot read
  // Storage back (anon is insert-only), so the owner checks storage.objects, and a mismatch aborts
  // the whole transaction loudly instead of pointing the row at bytes nobody verified.
  const guard = `do ${GUARD_TAG} begin if not exists (select 1 from storage.objects o where o.bucket_id = ${q(BUCKET)} ` +
    `and o.name = ${q(key)} and o.metadata->>'eTag' = ${etag} and (o.metadata->>'size')::bigint = ${bytes}) ` +
    `then raise exception 'restale file ${fid}: the object at the new key is not the bytes this run fetched'; end if; end ${GUARD_TAG};`;
  return [
    'begin;',
    guard,
    `delete from bb_file_text where file_id = ${fid} and exists (select 1 from bb_files where id = ${fid} and sha256 = ${was});`,
    `update bb_files set storage_path = ${q(`${BUCKET}/${key}`)}, local_path = ${q(`course context/${relpath}`)}, ` +
      `sha256 = ${now}, bytes = ${bytes}, mime_type = ${type}, downloaded_at = now(), text_status = 'extracted', ` +
      `notes = replace(notes, ${q(STALE_MARKER)}, ${q(`; bytes re-pulled ${day} by ${RESTALE_BY}`)}) ` +
      `where id = ${fid} and sha256 = ${was};`,
    'commit;',
  ].join('\n');
}

/** The owner transaction for a row whose bytes turned out unchanged: the note only. */
export function restaleUnchangedSql({ id, sha, pulledOn }) {
  const fid = mustMatch(id, ID_RE, 'id');
  const was = q(mustMatch(sha, SHA_RE, 'sha256'));
  const day = mustMatch(pulledOn, DATE_RE, 'date');
  return [
    'begin;',
    `update bb_files set notes = replace(notes, ${q(STALE_MARKER)}, ${q(`; bytes re-checked ${day} by ${RESTALE_BY}: unchanged`)}) ` +
      `where id = ${fid} and sha256 = ${was};`,
    'commit;',
  ].join('\n');
}

/** What --restale stages on disk for --restale-post: the PostgREST rows, never SQL. */
export function stagedUnits({ id, sha256, units }) {
  return { id, sha256, rows: textRows(id, units) };
}

export function stagedUnitsPath(downloads, id) {
  return path.join(downloads, 'restale_units', `${id}.json`);
}

/** A --restale-post answer: posted, or the owner SQL has not removed the old units yet, or an error. */
export function restalePostOutcome(status, body) {
  if (status >= 200 && status < 300) return 'posted';
  if (status === 409 || /23505/.test(String(body))) return 'owner_sql_pending';
  return 'error';
}

const USAGE = 'usage: node ingest/pull_files.mjs --manifest <json> --downloads <dir> [--mirror <dir>] [--bucket my_submissions] [--fetch] [--restale] [--only ids] [--out <sql>] [--dry-run] [--no-embed]\n' +
  '       node ingest/pull_files.mjs --restale-post --downloads <dir> [--only ids] [--no-embed]';

/** The argument error for this run, or null. */
export function argError(args) {
  if (args.restale && args['restale-post']) return '--restale and --restale-post are exclusive: run --restale, then the owner SQL, then --restale-post';
  if (args['restale-post']) return args.downloads && args.bucket === undefined ? null : USAGE;
  if (!args.manifest || !args.downloads) return USAGE;
  if (args.bucket !== undefined && args.bucket !== SUBMISSION_BUCKET) return `--bucket takes only '${SUBMISSION_BUCKET}' (bb-sync step 4b); omit it for course files`;
  if (args.restale && args.bucket !== undefined) return '--restale takes course rows only; it does not combine with --bucket';
  return null;
}

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
  const dest = path.join(downloads, downloadNameFor(row));
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
  if (ctx.restale) return restaleOne(row, ctx, { localPath, bytes, mime, sha256 });
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

/**
 * --restale, per row, once the fresh bytes are on disk and hashed. Unchanged bytes → the note-only
 * SQL. Changed bytes → new key, mirror at the new path, Storage POST (an occupied key is refused),
 * extract, stage the units on disk, and the one owner transaction. A row whose extraction yields
 * nothing gets no SQL: its old text is better than none.
 */
export async function restaleOne(row, ctx, { localPath, bytes, mime, sha256 }) {
  const { mirror, dryRun, pulledOn, downloads } = ctx;
  if (sha256 === row.sha256) {
    return { id: row.id, restale: 'unchanged', sha256: sha256.slice(0, 12), ...(dryRun ? { dryRun: true } : { sql: restaleUnchangedSql({ id: row.id, sha: sha256, pulledOn }) }) };
  }
  const relpath = restaleRelpath(row.relpath, sha256);
  const storageKey = storageKeyFor({ relpath });
  if (dryRun) return { id: row.id, restale: 'changed', key: storageKey, size: bytes.length, sha256: sha256.slice(0, 12), dryRun: true };

  const dest = path.join(mirror, relpath);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(localPath, dest);

  const up = await ctx.storagePost(storageKey, bytes, mime);
  let resumed = false;
  if (!up.ok) {
    // Occupied: never overwritten. Resumed only because the owner SQL verifies the object's bytes.
    if (!isDuplicateAnswer(up.status, up.body) || !duplicateIsAcceptable(false, { restale: true })) {
      return { id: row.id, key: storageKey, error: `storage ${up.status}: ${String(up.body).slice(0, 200)}` };
    }
    resumed = true;
  }

  // Past this point the object exists at storageKey. A row that gets no SQL leaves it orphaned, so
  // every such outcome names it; a retry reaches it as an occupied key and resumes.
  const orphan = (why) => ({ id: row.id, key: storageKey, orphanKey: storageKey,
    error: `not restaled: ${why}; the old text is kept, no SQL is written, and ${BUCKET}/${storageKey} is orphaned until a retry resumes it or a human removes it` });
  let units = [];
  try { units = ctx.extract(localPath); } catch (e) { return orphan(`extract failed (${String(e).slice(0, 160)})`); }
  if (!units.length) return orphan('extract gave no units');

  const staged = stagedUnitsPath(downloads, row.id);
  fs.mkdirSync(path.dirname(staged), { recursive: true });
  fs.writeFileSync(staged, JSON.stringify(stagedUnits({ id: Number(row.id), sha256, units })));
  const sql = restaleSql({ id: row.id, oldSha: row.sha256, newSha: sha256, key: storageKey, relpath, size: bytes.length, mime, pulledOn, md5: md5Hex(bytes) });
  return { id: row.id, restale: 'changed', key: storageKey, size: bytes.length, sha256: sha256.slice(0, 12), units: units.length, staged, sql, ...(resumed ? { resumed: true } : {}) };
}

/** The embed step, shared by the pull and --restale-post. Returns the note and an exit code. */
async function embedStep(env, supabaseUrl) {
  const jwt = env.SB_ANON_JWT;
  if (!jwt) return { note: '; embed step skipped (SB_ANON_JWT is not set) — run ingest/embed_corpus.mjs', code: 0 };
  const embed = await runEmbedLoop({ post: makePost(supabaseUrl, jwt), maxParts: DEFAULT_MAX_PARTS, log: (line) => console.log(line) });
  if (embed.exitCode !== 0) { console.error(embed.error); return { note: `; EMBED FAILED — ${embed.error}`, code: 1 }; }
  return { note: '; embeddings finished', code: 0 };
}

/**
 * --restale-post: post each staged file's units over PostgREST, exactly as the normal pull posts
 * text. A posted file is renamed `<id>.json.posted` so a re-run never posts it twice. A 409 means
 * the owner SQL has not deleted that row's old units yet: the file stays staged for the next run.
 */
async function restalePost(args, env) {
  const key = env.SB_ANON_KEY || env.SUPABASE_PUBLISHABLE_KEY;
  if (!key) { console.error('SB_ANON_KEY (the publishable key) is not set'); return 2; }
  const supabaseUrl = env.SUPABASE_URL || DEFAULT_SUPABASE_URL;
  const dir = path.dirname(stagedUnitsPath(args.downloads, 0));
  const only = String(args.only ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const names = fs.existsSync(dir) ? fs.readdirSync(dir).filter((n) => /^\d+\.json$/.test(n)) : [];
  const picked = names.filter((n) => only.length === 0 || only.includes(n.replace('.json', '')));
  const results = [];
  for (const name of picked) {
    const file = path.join(dir, name);
    const staged = JSON.parse(fs.readFileSync(file, 'utf8'));
    const id = Number(name.replace('.json', ''));
    if (staged.id !== id || !Array.isArray(staged.rows) || staged.rows.some((r) => r.file_id !== id)) {
      results.push({ id, error: 'staged file does not match its name; not posted' });
      continue;
    }
    const tr = await fetch(`${supabaseUrl}/rest/v1/bb_file_text`, {
      method: 'POST', headers: { ...anonHeaders(key, 'application/json'), Prefer: 'return=minimal' },
      body: JSON.stringify(staged.rows),
    });
    const body = tr.ok ? '' : await tr.text();
    const outcome = restalePostOutcome(tr.status, body);
    if (outcome === 'posted') fs.renameSync(file, `${file}.posted`);
    results.push({ id, outcome, unitsPosted: outcome === 'posted' ? staged.rows.length : 0, ...(outcome === 'error' ? { error: `bb_file_text ${tr.status}: ${body.slice(0, 200)}` } : {}) });
  }
  for (const r of results) console.log(JSON.stringify(r));
  const unitsPosted = results.reduce((n, r) => n + (r.unitsPosted || 0), 0);
  let embed = { note: '', code: 0 };
  if (shouldEmbed({ dryRun: false, noEmbed: args['no-embed'] === true, unitsPosted })) embed = await embedStep(env, supabaseUrl);
  const pending = results.filter((r) => r.outcome === 'owner_sql_pending').map((r) => r.id);
  console.log(`${results.filter((r) => r.outcome === 'posted').length} of ${picked.length} staged file(s) posted (restale-post)` +
    (pending.length ? `; owner SQL not run yet for ${pending.join(', ')}` : '') + embed.note);
  return results.some((r) => r.outcome !== 'posted') || embed.code ? 1 : 0;
}

export async function main(argv = process.argv.slice(2), env = process.env) {
  const args = parseArgs(argv);
  const bad = argError(args);
  if (bad) {
    console.error(bad);
    if (bad === USAGE) console.error('note: --dry-run writes nothing to Storage, the mirror or the database, but with --fetch it still downloads the bytes, because the key and sha it reports are computed from them.');
    return 2;
  }
  if (args['restale-post']) return restalePost(args, env);
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
    restale: args.restale === true,
    storagePost: async (storageKey, bytes, mime) => {
      const up = await fetch(`${env.SUPABASE_URL || DEFAULT_SUPABASE_URL}/storage/v1/object/${BUCKET}/${encodeKey(storageKey)}`, {
        method: 'POST', headers: anonHeaders(key, mime), body: bytes,
      });
      return { ok: up.ok, status: up.status, body: await up.text() };
    },
    extract: (localPath) => extractUnits(ingestDir, localPath),
    fetchImpl: (url) => fetch(url),
    pulledOn: new Date().toISOString().slice(0, 10),
  };
  if (ctx.fetchMode) fs.mkdirSync(args.downloads, { recursive: true });

  const manifest = JSON.parse(fs.readFileSync(args.manifest, 'utf8'));
  const rows = ctx.restale ? filterRestale(manifest, args.only) : filterManifest(manifest, args.only, args.bucket);
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
  const wanted = args.out || path.join(args.downloads, 'pull_files.sql');
  const out = ctx.dryRun ? wanted : resolveOutPath(wanted, new Date().toISOString().replace(/[-:]/g, '').slice(0, 15));
  if (out !== wanted) console.log(`${wanted} holds an earlier run's SQL and is kept; this run's SQL is in ${out}`);
  if (!ctx.dryRun) fs.writeFileSync(out, sql + '\n');
  for (const r of results) console.log(JSON.stringify({ ...r, sql: undefined }));

  const unitsPosted = results.reduce((n, r) => n + (r.unitsPosted || 0), 0);
  let embedNote = '';
  if (shouldEmbed({ dryRun: ctx.dryRun, noEmbed: args['no-embed'] === true, unitsPosted })) {
    const embed = await embedStep(env, ctx.supabaseUrl);
    embedNote = embed.note;
    if (embed.code !== 0) {
      console.log(`${results.filter((r) => r.sql).length} of ${rows.length} pulled (${mode}); bb_files updates in ${out}${embedNote}`);
      return 1;
    }
  }
  if (ctx.restale && !ctx.dryRun) {
    console.log('restale: run the SQL file through execute_sql, then `node ingest/pull_files.mjs --restale-post --downloads <same dir>` to post the staged units');
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
// Set the exit code and let the event loop drain: a hard exit while undici is still closing a
// fetch handle aborts node on Windows (libuv `!(handle->flags & UV_HANDLE_CLOSING)`, async.c:94).
if (invokedDirectly) {
  main().then(
    (code) => { process.exitCode = code; },
    (e) => { console.error(String((e && e.stack) || e)); process.exitCode = 1; },
  );
}

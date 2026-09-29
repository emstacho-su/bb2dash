// bb2dash :: ingest/pull_files.test.mjs
//
//   node --test ingest/pull_files.test.mjs
//
// Covers the pure parts of the file pull — the decisions that, wrong, would land bytes under the
// wrong key or a row in the wrong state: the Storage key (no `#`, override wins, the attempt
// segment survives), the magic-byte check, the download lookup, the manifest filter and its bucket
// gate, the extractor's output shape, the text rows (never `char_count`), the duplicate-answer rule
// and the two forms of the SQL statement the owner runs (course file vs bb-sync step 4b).
// Importing the module must run nothing: the suite finishing asserts that.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  anonHeaders,
  bbFilesUpdateSql,
  bytesLookValid,
  duplicateIsAcceptable,
  encodeKey,
  filterManifest,
  findDownload,
  isDuplicateAnswer,
  isSubmissionRow,
  mimeFor,
  parseArgs,
  parseExtractOutput,
  storageKeyFor,
  isStaleRow,
  restaleKeyFor,
  bbFilesRestaleSql,
  hopsForRow,
  shouldEmbed,
  modeOf,
  SUBMISSION_BUCKET,
  textRows,
} from './pull_files.mjs';

test('storageKeyFor drops # from the relpath and honours an explicit key', () => {
  assert.equal(storageKeyFor({ relpath: 'IST.323/lecture_slides/Lecture#4-Chap 3a.pptx' }), 'IST.323/lecture_slides/Lecture_4-Chap 3a.pptx');
  assert.equal(storageKeyFor({ relpath: 'a/b.pdf' }), 'a/b.pdf');
  assert.equal(storageKeyFor({ relpath: 'a/b.xlsx', key: 'a/b (re-upload).xlsx' }), 'a/b (re-upload).xlsx');
});

test('storageKeyFor keeps the attempt-<digits> segment a submission relpath carries', () => {
  const relpath = 'IST.352/my_submissions/role-of-systems-analyst/attempt-431219701/Role_of_Systems_Analyst.docx';
  assert.equal(storageKeyFor({ relpath, bucket: SUBMISSION_BUCKET }), relpath, 'migration 052 keeps submissions off staged keys');
});

test('encodeKey keeps the slashes and encodes each segment', () => {
  assert.equal(encodeKey('IST.352/readings/Identifying & Selecting.pptx'), 'IST.352/readings/Identifying%20%26%20Selecting.pptx');
});

test('bytesLookValid: PDF magic for pdf, zip magic for the Office types, and a floor on size', () => {
  const pdf = Buffer.concat([Buffer.from('%PDF-1.7'), Buffer.alloc(2000)]);
  const zip = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(2000)]);
  const html = Buffer.concat([Buffer.from('<!DOCTYPE html>'), Buffer.alloc(2000)]);
  assert.equal(bytesLookValid(pdf, 'application/pdf'), true);
  assert.equal(bytesLookValid(zip, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'), true);
  assert.equal(bytesLookValid(html, 'application/pdf'), false, 'a Blackboard error page is not a PDF');
  assert.equal(bytesLookValid(zip, 'application/pdf'), false);
  assert.equal(bytesLookValid(Buffer.from('%PDF'), 'application/pdf'), false, 'too small to be a real file');
  assert.equal(bytesLookValid(null, 'application/pdf'), false);
});

test('findDownload matches on the <id>_ prefix only', () => {
  const names = ['14_x.docx', '147_Project Charter Template.docx', '1470_other.docx'];
  assert.equal(findDownload(names, 147), '147_Project Charter Template.docx');
  assert.equal(findDownload(names, 14), '14_x.docx');
  assert.equal(findDownload(names, 1), null);
});

test('filterManifest: empty --only keeps every row; ids are trimmed and numeric', () => {
  const rows = [{ id: 119 }, { id: 152 }, { id: 145 }];
  assert.deepEqual(filterManifest(rows, undefined), rows);
  assert.deepEqual(filterManifest(rows, ''), rows);
  assert.deepEqual(filterManifest(rows, '152, 119'), [{ id: 119 }, { id: 152 }]);
});

test('isSubmissionRow: only bucket = my_submissions; an old manifest row without one is a course file', () => {
  assert.equal(isSubmissionRow({ id: 140, bucket: 'my_submissions' }), true);
  assert.equal(isSubmissionRow({ id: 119, bucket: 'lecture_slides' }), false);
  assert.equal(isSubmissionRow({ id: 119 }), false, 'manifests written before the bucket key are course files');
});

test('filterManifest gates on the bucket: 4b touches no course row and step 4 no submission', () => {
  const rows = [{ id: 119, bucket: 'lecture_slides' }, { id: 140, bucket: 'my_submissions' }, { id: 141, bucket: 'my_submissions' }, { id: 152 }];
  assert.deepEqual(filterManifest(rows, undefined, 'my_submissions'), [{ id: 140, bucket: 'my_submissions' }, { id: 141, bucket: 'my_submissions' }]);
  assert.deepEqual(filterManifest(rows, undefined, undefined), [{ id: 119, bucket: 'lecture_slides' }, { id: 152 }]);
  assert.deepEqual(filterManifest(rows, '140,152', 'my_submissions'), [{ id: 140, bucket: 'my_submissions' }], '--only narrows, the gate still holds');
});

test('mimeFor uses the catalogued type, else the extension, else octet-stream', () => {
  assert.equal(mimeFor({ mime: 'application/pdf', file_name: 'x.docx' }), 'application/pdf');
  assert.equal(mimeFor({ mime: null, file_name: 'Deck.PPTX' }), 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
  assert.equal(mimeFor({ file_name: 'notes.txt' }), 'application/octet-stream');
});

test('parseExtractOutput reads the [{file, status, units}] envelope and tolerates a failure', () => {
  const ok = JSON.stringify([{ file: 'a.docx', status: 'extracted', units: [{ unit_kind: 'doc', unit_no: 1, text: 'hello' }] }]);
  assert.deepEqual(parseExtractOutput(ok), [{ unit_kind: 'doc', unit_no: 1, text: 'hello' }]);
  assert.deepEqual(parseExtractOutput(JSON.stringify([{ file: 'a.docx', status: 'failed: x', units: [] }])), []);
  assert.deepEqual(parseExtractOutput('{}'), []);
});

test('textRows carries file_id, kind, no and text — and never char_count (a generated column)', () => {
  const rows = textRows(147, [{ unit_kind: 'doc', unit_no: 1, text: 'abc' }]);
  assert.deepEqual(rows, [{ file_id: 147, unit_kind: 'doc', unit_no: 1, text: 'abc' }]);
  assert.equal('char_count' in rows[0], false);
});

test('isDuplicateAnswer: only a non-200 whose body says the object exists', () => {
  assert.equal(isDuplicateAnswer(400, '{"error":"Duplicate","message":"The resource already exists"}'), true);
  assert.equal(isDuplicateAnswer(400, '{"error":"InvalidKey"}'), false);
  assert.equal(isDuplicateAnswer(200, 'Duplicate'), false);
});

test('duplicateIsAcceptable: fine for a course file, never for a submission (a 409 is not "done")', () => {
  assert.equal(duplicateIsAcceptable(false), true);
  assert.equal(duplicateIsAcceptable(true), false);
});

test('bbFilesUpdateSql writes the key as storage_path, the real name as local_path, and guards on null', () => {
  const sql = bbFilesUpdateSql({ id: 119, key: 'IST.323/lecture_slides/Lecture_4.pptx', relpath: "IST.323/lecture_slides/Lecture#4 O'Brien.pptx", sha256: 'abc', size: 12, mime: 'application/pdf', textStatus: 'extracted', pulledOn: '2026-09-22' });
  assert.match(sql, /storage_path = 'bb-files\/IST\.323\/lecture_slides\/Lecture_4\.pptx'/);
  assert.match(sql, /local_path = 'course context\/IST\.323\/lecture_slides\/Lecture#4 O''Brien\.pptx'/, 'single quotes are doubled');
  assert.match(sql, /bytes = 12, mime_type = 'application\/pdf'/);
  assert.match(sql, /where id = 119 and storage_path is null;$/);
  assert.match(sql, / by ingest\/pull_files\.mjs'/, 'a course file is pulled by the runbook step 4 script');
});

test('bbFilesUpdateSql for a submission keeps Blackboard mime with coalesce and says step 4b', () => {
  const base = { id: 140, key: 'IST.352/my_submissions/a/attempt-431219701/x.docx', relpath: 'IST.352/my_submissions/a/attempt-431219701/x.docx', sha256: 'abc', size: 12, mime: 'application/pdf', textStatus: 'extracted', pulledOn: '2026-09-22' };
  const sub = bbFilesUpdateSql({ ...base, submission: true });
  assert.match(sub, /mime_type = coalesce\(mime_type, 'application\/pdf'\)/, 'a bbcswebdav download often answers octet-stream');
  assert.match(sub, / \| bytes pulled 2026-09-22 by bb-sync step 4b'/);
  assert.match(sub, /where id = 140 and storage_path is null;$/);
  const course = bbFilesUpdateSql(base);
  assert.match(course, /mime_type = 'application\/pdf'/);
  assert.equal(/coalesce\(mime_type/.test(course), false, 'course rows keep the plain assignment');
});

test('anonHeaders sends the publishable key both ways, as every anon insert here does', () => {
  assert.deepEqual(anonHeaders('k', 'application/pdf'), { apikey: 'k', Authorization: 'Bearer k', 'Content-Type': 'application/pdf' });
});

test('parseArgs reads --name value pairs and bare --flags', () => {
  assert.deepEqual(parseArgs(['--manifest', 'm.json', '--dry-run', '--only', '1,2']), { manifest: 'm.json', 'dry-run': true, only: '1,2' });
  assert.deepEqual(parseArgs(['--bucket', 'my_submissions']), { bucket: 'my_submissions' });
});

// ---------------------------------------------------------------------------------------------
// Phase 18 task 4: --fetch, --restale and the embed step.
//
// The pull no longer depends on the browser's download event (ingest/fetch_signed.mjs). The
// browser half now records the redirect chain; the script validates it and downloads the signed
// URL itself. Two new gates matter here: a stale row must never overwrite the key its old bytes
// sit under, and the three modes must stay mutually exclusive so one run can never write another
// mode's rows.
// ---------------------------------------------------------------------------------------------

test('filterManifest keeps stale rows out of a normal run and is the only thing a --restale run takes', () => {
  const rows = [
    { id: 1, bucket: 'readings' },
    { id: 2, bucket: 'my_submissions' },
    { id: 3, bucket: 'readings', restale: true },
    { id: 4, bucket: 'my_submissions', restale: true },
  ];
  assert.deepEqual(filterManifest(rows, '', undefined).map((r) => r.id), [1], 'course run: no submissions, no stale rows');
  assert.deepEqual(filterManifest(rows, '', SUBMISSION_BUCKET).map((r) => r.id), [2], 'submission run: no stale rows');
  assert.deepEqual(filterManifest(rows, '', undefined, { restale: true }).map((r) => r.id), [3, 4], 'a restale run takes stale rows of either bucket');
});

test('filterManifest still honours --only alongside the stale gate', () => {
  const rows = [{ id: 3, restale: true }, { id: 5, restale: true }];
  assert.deepEqual(filterManifest(rows, '5', undefined, { restale: true }).map((r) => r.id), [5]);
});

test('isStaleRow reads the explicit flag only', () => {
  assert.equal(isStaleRow({ restale: true }), true);
  assert.equal(isStaleRow({ restale: false }), false);
  assert.equal(isStaleRow({}), false);
  assert.equal(isStaleRow(null), false);
});

test('restaleKeyFor never returns the key the old bytes already occupy', () => {
  const row = { relpath: 'IST.323/readings/Chapter 3.pdf' };
  const key = restaleKeyFor(row, 'abcdef0123456789');
  assert.notEqual(key, storageKeyFor(row));
  assert.match(key, /^IST\.323\/readings\/Chapter 3\.abcdef012345\.pdf$/, 'the content hash goes before the extension');
});

test('restaleKeyFor is stable for identical bytes and differs for different bytes', () => {
  const row = { relpath: 'a/b.docx' };
  assert.equal(restaleKeyFor(row, 'deadbeefdeadbeef'), restaleKeyFor(row, 'deadbeefdeadbeef'));
  assert.notEqual(restaleKeyFor(row, 'deadbeefdeadbeef'), restaleKeyFor(row, 'feedfacefeedface'));
});

test('restaleKeyFor drops # exactly as the normal key does', () => {
  assert.match(restaleKeyFor({ relpath: 'c/Lecture#4.pptx' }, 'aaaaaaaaaaaa'), /^c\/Lecture_4\.aaaaaaaaaaaa\.pptx$/);
});

test('bbFilesRestaleSql is one transaction: old text deleted, new text inserted, row repointed', () => {
  const sql = bbFilesRestaleSql({
    id: 72, key: 'a/b.abc123456789.pdf', relpath: 'a/b.pdf', sha256: 'abc123456789', size: 99,
    mime: 'application/pdf', pulledOn: '2026-09-29',
    units: [{ unit_kind: 'page', unit_no: 1, text: "it's here" }],
  });
  assert.match(sql, /^begin;/);
  assert.match(sql, /commit;$/);
  assert.match(sql, /delete from bb_file_text where file_id = 72;/);
  assert.match(sql, /insert into bb_file_text \(file_id, unit_kind, unit_no, text\) values/);
  assert.match(sql, /\(72, 'page', 1, 'it''s here'\)/, 'single quotes are doubled');
  assert.match(sql, /storage_path = 'bb-files\/a\/b\.abc123456789\.pdf'/);
  assert.match(sql, /text_status = 'extracted'/);
  // The stale marker is what made this row a candidate; leaving it would re-pull it forever.
  assert.match(sql, /notes = replace\(coalesce\(notes, ''\), ' \| stored bytes may be stale', ''\)/);
  assert.equal(/where id = 72 and storage_path is null/.test(sql), false, 'a stale row already has a storage_path');
  assert.match(sql, /where id = 72;/);
});

test('bbFilesRestaleSql with no extracted units marks the row failed and inserts nothing', () => {
  const sql = bbFilesRestaleSql({
    id: 73, key: 'a/c.xyz.pdf', relpath: 'a/c.pdf', sha256: 'xyz', size: 5,
    mime: 'application/pdf', pulledOn: '2026-09-29', units: [],
  });
  assert.match(sql, /delete from bb_file_text where file_id = 73;/);
  assert.equal(/insert into bb_file_text/.test(sql), false);
  assert.match(sql, /text_status = 'failed'/);
});

test('hopsForRow validates the chain the browser half recorded', () => {
  const signed = 'https://eu.content.blackboardcdn.com/x/y.pdf?X-Amz-Signature=a';
  const durable = 'https://blackboard.syracuse.edu/bbcswebdav/pid-1-dt-c-rid-2_1/xid-3_1';
  assert.deepEqual(hopsForRow({ hops: [durable, signed] }), { outcome: 'ok', signedUrl: signed });
  assert.equal(hopsForRow({ hops: [durable, 'https://evil.com/y.pdf'] }).outcome, 'refused');
  assert.equal(hopsForRow({}).outcome, 'refused', 'a --fetch row with no hops is refused, never guessed');
  assert.equal(hopsForRow({ hops: [] }).outcome, 'refused');
});

test('shouldEmbed runs the embed step only after a real run that posted text', () => {
  assert.equal(shouldEmbed({ dryRun: false, noEmbed: false, unitsPosted: 3 }), true);
  assert.equal(shouldEmbed({ dryRun: false, noEmbed: false, unitsPosted: 0 }), false, 'nothing new to embed');
  assert.equal(shouldEmbed({ dryRun: true, noEmbed: false, unitsPosted: 3 }), false, 'a dry run writes nothing');
  assert.equal(shouldEmbed({ dryRun: false, noEmbed: true, unitsPosted: 3 }), false, '--no-embed is explicit');
});

test('modeOf names the three mutually exclusive runs', () => {
  assert.equal(modeOf({}), 'course');
  assert.equal(modeOf({ bucket: SUBMISSION_BUCKET }), 'submissions');
  assert.equal(modeOf({ restale: true }), 'restale');
  assert.equal(modeOf({ bucket: SUBMISSION_BUCKET, restale: true }), 'restale', 'restale wins; the gate still splits by flag');
});

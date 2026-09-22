// bb2dash :: ingest/pull_files.test.mjs
//
//   node --test ingest/pull_files.test.mjs
//
// Covers the pure parts of the file pull — the decisions that, wrong, would land bytes under the
// wrong key or a row in the wrong state: the Storage key (no `#`, override wins), the magic-byte
// check, the download lookup, the manifest filter, the extractor's output shape, the text rows
// (never `char_count`), the duplicate-answer rule and the one SQL statement the owner runs.
// Importing the module must run nothing: the suite finishing asserts that.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  anonHeaders,
  bbFilesUpdateSql,
  bytesLookValid,
  encodeKey,
  filterManifest,
  findDownload,
  isDuplicateAnswer,
  mimeFor,
  parseArgs,
  parseExtractOutput,
  storageKeyFor,
  textRows,
} from './pull_files.mjs';

test('storageKeyFor drops # from the relpath and honours an explicit key', () => {
  assert.equal(storageKeyFor({ relpath: 'IST.323/lecture_slides/Lecture#4-Chap 3a.pptx' }), 'IST.323/lecture_slides/Lecture_4-Chap 3a.pptx');
  assert.equal(storageKeyFor({ relpath: 'a/b.pdf' }), 'a/b.pdf');
  assert.equal(storageKeyFor({ relpath: 'a/b.xlsx', key: 'a/b (re-upload).xlsx' }), 'a/b (re-upload).xlsx');
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

test('bbFilesUpdateSql writes the key as storage_path, the real name as local_path, and guards on null', () => {
  const sql = bbFilesUpdateSql({ id: 119, key: 'IST.323/lecture_slides/Lecture_4.pptx', relpath: "IST.323/lecture_slides/Lecture#4 O'Brien.pptx", sha256: 'abc', size: 12, mime: 'application/pdf', textStatus: 'extracted', pulledOn: '2026-09-22' });
  assert.match(sql, /storage_path = 'bb-files\/IST\.323\/lecture_slides\/Lecture_4\.pptx'/);
  assert.match(sql, /local_path = 'course context\/IST\.323\/lecture_slides\/Lecture#4 O''Brien\.pptx'/, 'single quotes are doubled');
  assert.match(sql, /bytes = 12, mime_type = 'application\/pdf'/);
  assert.match(sql, /where id = 119 and storage_path is null;$/);
});

test('anonHeaders sends the publishable key both ways, as every anon insert here does', () => {
  assert.deepEqual(anonHeaders('k', 'application/pdf'), { apikey: 'k', Authorization: 'Bearer k', 'Content-Type': 'application/pdf' });
});

test('parseArgs reads --name value pairs and bare --flags', () => {
  assert.deepEqual(parseArgs(['--manifest', 'm.json', '--dry-run', '--only', '1,2']), { manifest: 'm.json', 'dry-run': true, only: '1,2' });
});

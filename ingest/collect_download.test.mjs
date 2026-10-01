// bb2dash :: ingest/collect_download.test.mjs
//
//   node --test ingest/collect_download.test.mjs
//
// Covers the collector bb-sync step 4b runs after the logged-in Chrome tab has saved a Blackboard
// file to Stack's Downloads folder: which saved file is the one this row asked for (the exact
// name, Chrome's ` (n)` de-dup suffix, Chrome's character sanitising, the in-page snippet's
// `bb2dash-<id>` name), which files are not finished yet, and the wait-then-move loop's three
// outcomes (one → moved under pull_files' `<id>_<name>`, none → exit 2, several → exit 3 and
// nothing moved). The loop runs against an in-memory folder; no real Downloads is touched.
// Importing the module must run nothing: the suite finishing asserts that.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  matchesExpectedName,
  isPartialDownload,
  parseSince,
  matchingCandidates,
  collect,
  argError,
  EXIT,
} from './collect_download.mjs';
import { downloadNameFor } from './pull_files.mjs';

test('matchesExpectedName: the exact name', () => {
  assert.equal(matchesExpectedName('Major Case #1 - Synchrony.pdf', 'Major Case #1 - Synchrony.pdf', 161), true);
});

test('matchesExpectedName: Chrome de-dup suffix " (n)" before the extension, any n', () => {
  assert.equal(matchesExpectedName('Week 3 Slides (1).pptx', 'Week 3 Slides.pptx', 7), true);
  assert.equal(matchesExpectedName('Week 3 Slides (12).pptx', 'Week 3 Slides.pptx', 7), true);
  assert.equal(matchesExpectedName('README (2)', 'README', 7), true, 'a name with no extension');
  assert.equal(matchesExpectedName('Week 3 Slides(1).pptx', 'Week 3 Slides.pptx', 7), false, 'Chrome always puts a space before (n)');
  assert.equal(matchesExpectedName('Week 3 Slides (x).pptx', 'Week 3 Slides.pptx', 7), false);
});

test('matchesExpectedName: Chrome sanitises characters Windows refuses', () => {
  assert.equal(matchesExpectedName('Quiz_ Chapter 2_.docx', 'Quiz: Chapter 2?.docx', 9), true);
  assert.equal(matchesExpectedName('a_b_c_d_e_f.pdf', 'a<b>c|d"e*f.pdf', 9), true);
  assert.equal(matchesExpectedName('Rubric_v2.pdf', 'Rubric/v2.pdf', 9), true, 'a slash in a display name');
  assert.equal(matchesExpectedName('Quiz_ Chapter 2_ (1).docx', 'Quiz: Chapter 2?.docx', 9), true, 'sanitised and de-duped');
  assert.equal(matchesExpectedName('notes.pdf', 'notes.pdf.', 9), true, 'trailing dots are trimmed by Windows');
  assert.equal(matchesExpectedName('MAJOR CASE.PDF', 'Major Case.pdf', 9), true, 'the Windows file system is case-insensitive');
});

test('matchesExpectedName: the in-page snippet saves as bb2dash-<id><ext>, only for this id', () => {
  assert.equal(matchesExpectedName('bb2dash-161.pdf', 'Major Case #1 - Synchrony.pdf', 161), true);
  assert.equal(matchesExpectedName('bb2dash-161 (1).pdf', 'Major Case #1 - Synchrony.pdf', 161), true);
  assert.equal(matchesExpectedName('bb2dash-161', 'Major Case #1 - Synchrony.pdf', 161), true, 'a content type the snippet had no extension for');
  assert.equal(matchesExpectedName('bb2dash-1610.pdf', 'Major Case #1 - Synchrony.pdf', 161), false);
  assert.equal(matchesExpectedName('bb2dash-16.pdf', 'Major Case #1 - Synchrony.pdf', 161), false);
});

test('matchesExpectedName: refuses everything else', () => {
  assert.equal(matchesExpectedName('Week 3 Slides.pdf', 'Week 3 Slides.pptx', 7), false, 'different extension');
  assert.equal(matchesExpectedName('Week 3 Slides v2.pptx', 'Week 3 Slides.pptx', 7), false);
  assert.equal(matchesExpectedName('Slides.pptx', 'Week 3 Slides.pptx', 7), false);
  assert.equal(matchesExpectedName('', 'x.pdf', 7), false);
  assert.equal(matchesExpectedName('x.pdf', '', 7), false, 'no expected name matches nothing');
  assert.equal(matchesExpectedName(null, 'x.pdf', 7), false);
});

test('isPartialDownload: Chrome and Windows in-progress names', () => {
  assert.equal(isPartialDownload('Unconfirmed 123456.crdownload'), true);
  assert.equal(isPartialDownload('Week 3.pptx.crdownload'), true);
  assert.equal(isPartialDownload('x.TMP'), true);
  assert.equal(isPartialDownload('x.pdf.part'), true);
  assert.equal(isPartialDownload('desktop.ini'), true, 'Explorer metadata is never a download');
  assert.equal(isPartialDownload('Week 3.pptx'), false);
});

test('parseSince: ISO or epoch ms; anything else is null', () => {
  assert.equal(parseSince('2026-10-01T14:00:00.000Z'), Date.parse('2026-10-01T14:00:00.000Z'));
  assert.equal(parseSince('1790000000000'), 1790000000000);
  assert.equal(parseSince('yesterday'), null);
  assert.equal(parseSince(''), null);
  assert.equal(parseSince(undefined), null);
  assert.equal(parseSince('12'), null, 'a bare small number is not a timestamp anybody meant');
});

test('matchingCandidates: name match, finished, and saved at or after since', () => {
  const since = 1_000_000;
  const entries = [
    { name: 'Week 3 Slides.pptx', mtimeMs: since + 5, size: 10 },
    { name: 'Week 3 Slides (1).pptx', mtimeMs: since - 60_000, size: 10 },   // an older copy
    { name: 'Week 3 Slides.pptx.crdownload', mtimeMs: since + 5, size: 4 },
    { name: 'Other.pptx', mtimeMs: since + 5, size: 10 },
    { name: 'Week 3 Slides (2).pptx', mtimeMs: since - 500, size: 10 },      // inside the 1 s clock slack
  ];
  const got = matchingCandidates(entries, { name: 'Week 3 Slides.pptx', id: 7, sinceMs: since }).map((e) => e.name);
  assert.deepEqual(got, ['Week 3 Slides.pptx', 'Week 3 Slides (2).pptx']);
});

/** An in-memory Downloads folder whose contents can change per poll. */
function fakeIo(timeline) {
  let t = 0;
  let poll = 0;
  const moved = [];
  const existing = new Set();
  return {
    moved,
    existing,
    now: () => t,
    sleep: async (ms) => { t += ms; poll++; },
    list: () => (timeline[Math.min(poll, timeline.length - 1)] ?? []),
    exists: (p) => existing.has(p),
    move: (from, to) => { moved.push([from, to]); },
  };
}

const base = { id: 161, name: 'Major Case #1 - Synchrony.pdf', sinceMs: 0, from: 'D', to: 'S', timeoutMs: 10_000, pollMs: 1000 };

test('collect: one finished file is moved to <to>/<id>_<safe name>, once its size is stable', async () => {
  const io = fakeIo([
    [{ name: 'Major Case #1 - Synchrony.pdf.crdownload', mtimeMs: 5, size: 100 }],
    [{ name: 'Major Case #1 - Synchrony.pdf', mtimeMs: 5, size: 900 }],
    [{ name: 'Major Case #1 - Synchrony.pdf', mtimeMs: 5, size: 2000 }],
    [{ name: 'Major Case #1 - Synchrony.pdf', mtimeMs: 5, size: 2000 }],
  ]);
  const r = await collect(base, io);
  assert.equal(r.code, EXIT.ok);
  assert.equal(io.moved.length, 1);
  assert.equal(io.moved[0][0].replace(/\\/g, '/'), 'D/Major Case #1 - Synchrony.pdf');
  assert.equal(io.moved[0][1].replace(/\\/g, '/'), `S/${downloadNameFor({ id: 161, file_name: base.name })}`);
  assert.equal(r.line.id, 161);
  assert.equal(r.line.bytes, 2000);
});

test('collect: nothing by the timeout → exit 2, names the files saved since (a near miss), nothing moved', async () => {
  const io = fakeIo([[
    { name: 'Other.pdf', mtimeMs: 5, size: 2000 },
    { name: 'Older.pdf', mtimeMs: -5000, size: 2000 },
    { name: 'x.pdf.crdownload', mtimeMs: 5, size: 10 },
  ]]);
  const r = await collect(base, io);
  assert.equal(r.code, EXIT.noDownload);
  assert.deepEqual(r.line, { id: 161, error: 'no download', saved_since: ['Other.pdf'] });
  assert.equal(io.moved.length, 0);
});

test('collect: an unrelated download still in flight does not block a finished match past the timeout', async () => {
  const io = fakeIo([[
    { name: 'Major Case #1 - Synchrony.pdf', mtimeMs: 5, size: 2000 },
    { name: 'Unconfirmed 123.crdownload', mtimeMs: 5, size: 10 },
  ]]);
  const r = await collect(base, io);
  assert.equal(r.code, EXIT.ok);
  assert.equal(io.moved.length, 1);
});

test('collect: two candidates → exit 3, nothing moved, both named', async () => {
  const io = fakeIo([[
    { name: 'Major Case #1 - Synchrony.pdf', mtimeMs: 5, size: 2000 },
    { name: 'bb2dash-161.pdf', mtimeMs: 6, size: 2000 },
  ]]);
  const r = await collect(base, io);
  assert.equal(r.code, EXIT.ambiguous);
  assert.equal(r.line.error, 'more than one candidate');
  assert.deepEqual(r.line.candidates.sort(), ['Major Case #1 - Synchrony.pdf', 'bb2dash-161.pdf']);
  assert.equal(io.moved.length, 0);
});

test('collect: a destination that already exists is refused, never overwritten', async () => {
  const io = fakeIo([[{ name: 'Major Case #1 - Synchrony.pdf', mtimeMs: 5, size: 2000 }]]);
  io.existing.add(`S/${downloadNameFor({ id: 161, file_name: base.name })}`);
  const r = await collect({ ...base }, { ...io, exists: (p) => io.existing.has(p.replace(/\\/g, '/')) });
  assert.equal(r.code, EXIT.destinationExists);
  assert.equal(io.moved.length, 0);
});

test('downloadNameFor: <id>_<safe name>, the name findDownload looks for', () => {
  assert.equal(downloadNameFor({ id: 9, file_name: 'Quiz: 2?.docx' }), '9_Quiz_ 2_.docx');
  assert.equal(downloadNameFor({ id: 9, relpath: 'IST.466/case/a.pdf' }), '9_a.pdf');
});

test('argError: id, name, since and to are required and checked', () => {
  const ok = { id: '161', name: 'a.pdf', since: '2026-10-01T14:00:00Z', to: 'x' };
  assert.equal(argError(ok), null);
  assert.match(argError({ ...ok, id: '0' }), /--id/);
  assert.match(argError({ ...ok, id: '16a' }), /--id/);
  assert.match(argError({ ...ok, name: true }), /--name/);
  assert.match(argError({ ...ok, since: 'soon' }), /--since/);
  assert.match(argError({ ...ok, to: undefined }), /--to/);
  assert.match(argError({ ...ok, timeout: '-3' }), /--timeout/);
  assert.equal(argError({ ...ok, timeout: '90' }), null);
});

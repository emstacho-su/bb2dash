// bb2dash :: ingest/extract_text.test.mjs
//
//   node --test ingest/extract_text.test.mjs
//
// The locked Python set (brief 100 task 14). extract_text.py runs through `uv run --locked` on
// ingest/pyproject.toml and ingest/uv.lock, exactly as pull_files.mjs's extractUnits runs it, over
// four synthetic fixtures in fixtures/extract/ (made by make_samples.py; no course material), and
// the units must equal fixtures/extract/expected.json. The same expected file holds on the host
// (Xpdf's pdftotext) and in the sync image (poppler's), so unit text is compared with runs of
// whitespace collapsed: the two pdftotext builds may space a `-layout` line differently, but never
// change a word, a unit kind or a unit number.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { extractUnits } from './pull_files.mjs';

const ingestDir = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(ingestDir, 'fixtures', 'extract');
const LIBRARIES = ['python-docx', 'python-pptx', 'openpyxl'];
const SAMPLES = ['sample.pdf', 'sample.docx', 'sample.pptx', 'sample.xlsx'];

const collapse = (text) => String(text).replace(/\s+/g, ' ').trim();
const comparable = (units) =>
  units.map((u) => ({ unit_kind: u.unit_kind, unit_no: u.unit_no, text: collapse(u.text) }));

function readText(name) {
  return fs.readFileSync(path.join(ingestDir, name), 'utf8');
}

/** `name = "x"` followed by `version = "y"` in each [[package]] block of uv.lock. */
function lockedVersions(lockText) {
  const versions = {};
  for (const block of lockText.split('[[package]]').slice(1)) {
    const name = /^name = "([^"]+)"$/m.exec(block)?.[1];
    const version = /^version = "([^"]+)"$/m.exec(block)?.[1];
    if (name && version) versions[name] = version;
  }
  return versions;
}

test('pyproject.toml pins the three libraries exactly, and uv.lock locks the same versions', () => {
  const pyproject = readText('pyproject.toml');
  const locked = lockedVersions(readText('uv.lock'));
  for (const library of LIBRARIES) {
    const pin = new RegExp(`"${library}==([0-9][^"]*)"`).exec(pyproject)?.[1];
    assert.ok(pin, `${library} is pinned with == in pyproject.toml`);
    assert.equal(locked[library], pin, `uv.lock locks ${library} at the pinned version`);
  }
});

test('extractUnits runs the locked project, never `--with`', () => {
  const calls = [];
  const fakeRun = (command, args, options) => {
    calls.push({ command, args, options });
    return JSON.stringify([{ file: 'x.pdf', status: 'extracted', units: [{ unit_kind: 'page', unit_no: 1, text: 't' }] }]);
  };
  const units = extractUnits(ingestDir, 'x.pdf', fakeRun);

  assert.equal(calls.length, 1);
  const [{ command, args, options }] = calls;
  assert.equal(command, 'uv');
  assert.deepEqual(args.slice(0, 4), ['run', '--locked', '--project', ingestDir]);
  assert.ok(!args.includes('--with'), 'no ad-hoc --with libraries');
  assert.deepEqual(args.slice(-3), ['python', path.join(ingestDir, 'extract_text.py'), 'x.pdf']);
  assert.equal(options.cwd, ingestDir);
  assert.deepEqual(units, [{ unit_kind: 'page', unit_no: 1, text: 't' }]);
});

const expected = JSON.parse(fs.readFileSync(path.join(fixturesDir, 'expected.json'), 'utf8'));

for (const sample of SAMPLES) {
  test(`${sample}: the locked extractor's units equal expected.json`, () => {
    const want = expected[sample];
    assert.ok(Array.isArray(want) && want.length > 0, `expected.json holds units for ${sample}`);
    const got = extractUnits(ingestDir, path.join(fixturesDir, sample));
    assert.deepEqual(comparable(got), comparable(want));
  });
}

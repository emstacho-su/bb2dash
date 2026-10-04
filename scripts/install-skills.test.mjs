// bb2dash :: scripts/install-skills.test.mjs
// One source for the four repo skills (brief 100 task 19, P-49): `skills/<name>/` in the checkout
// is the truth, and the installer copies it into Claude Code's user skills folder, verifying every
// file by SHA-256 (the harness's hooks/install-checkpoint.mjs pattern). `--check` writes nothing
// and fails on drift. Every case runs in a temp folder; nothing touches the real ~/.claude.
// Run: node --test scripts/install-skills.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { SKILLS, SOURCE_ROOT, defaultTarget, installSkills, parseArgs, run } from './install-skills.mjs';

function tempDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'install-skills-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

/** A source root with two skills: one file, and a nested helper. */
function fakeSource(t) {
  const root = tempDir(t);
  fs.mkdirSync(path.join(root, 'alpha'), { recursive: true });
  fs.writeFileSync(path.join(root, 'alpha', 'SKILL.md'), '# alpha\nv2\n');
  fs.mkdirSync(path.join(root, 'beta', 'lib'), { recursive: true });
  fs.writeFileSync(path.join(root, 'beta', 'SKILL.md'), '# beta\n');
  fs.writeFileSync(path.join(root, 'beta', 'lib', 'helper.mjs'), 'export const x = 1;\n');
  return root;
}

const FAKE_SKILLS = ['alpha', 'beta'];

function collect() {
  const lines = [];
  return { lines, out: (line) => lines.push(line), err: (line) => lines.push(line) };
}

test('the four repo skills, each a folder with a SKILL.md in this checkout', () => {
  assert.deepEqual([...SKILLS], ['bb-course-map', 'bb-course-pull', 'bb-sync', 'inbox-apply']);
  for (const skill of SKILLS) {
    assert.ok(fs.existsSync(path.join(SOURCE_ROOT, skill, 'SKILL.md')), `${skill}/SKILL.md exists`);
  }
});

test('the default target is Claude Code user skills folder under the home folder', () => {
  assert.equal(defaultTarget('C:\\Users\\someone'), path.join('C:\\Users\\someone', '.claude', 'skills'));
});

test('arguments: --target and --check; anything else is a usage error', () => {
  assert.deepEqual(parseArgs([]), { ok: true, options: { target: '', check: false } });
  assert.deepEqual(parseArgs(['--check', '--target', 'X']), { ok: true, options: { target: 'X', check: true } });
  assert.equal(parseArgs(['--target']).ok, false);
  assert.equal(parseArgs(['--force']).ok, false);
  const { lines, out, err } = collect();
  assert.equal(run(['--nope'], { out, err }), 2);
  assert.match(lines.join('\n'), /usage: node scripts\/install-skills\.mjs/);
});

test('install copies every file, nested ones included, and verifies each by hash', (t) => {
  const sourceRoot = fakeSource(t);
  const target = tempDir(t);
  const result = installSkills({ sourceRoot, target, skills: FAKE_SKILLS });

  assert.deepEqual(
    result.files.map((f) => `${f.action} ${f.path}`),
    ['create alpha/SKILL.md', 'create beta/SKILL.md', 'create beta/lib/helper.mjs'],
  );
  assert.equal(fs.readFileSync(path.join(target, 'beta', 'lib', 'helper.mjs'), 'utf8'), 'export const x = 1;\n');
  // `drift` counts what was missing or different before the run: here, all three, now written.
  assert.equal(result.drift, 3);
  assert.equal(installSkills({ sourceRoot, target, skills: FAKE_SKILLS, check: true }).drift, 0);
});

test('a second install changes nothing', (t) => {
  const sourceRoot = fakeSource(t);
  const target = tempDir(t);
  installSkills({ sourceRoot, target, skills: FAKE_SKILLS });
  const again = installSkills({ sourceRoot, target, skills: FAKE_SKILLS });
  assert.ok(again.files.every((f) => f.action === 'unchanged'));
});

test('install overwrites a drifted copy and leaves a file the repo does not have alone', (t) => {
  const sourceRoot = fakeSource(t);
  const target = tempDir(t);
  installSkills({ sourceRoot, target, skills: FAKE_SKILLS });
  fs.writeFileSync(path.join(target, 'alpha', 'SKILL.md'), '# alpha\nv1 (stale)\n');
  fs.writeFileSync(path.join(target, 'alpha', 'notes.txt'), 'mine');

  const result = installSkills({ sourceRoot, target, skills: FAKE_SKILLS });
  assert.equal(result.files.find((f) => f.path === 'alpha/SKILL.md')?.action, 'update');
  assert.equal(fs.readFileSync(path.join(target, 'alpha', 'SKILL.md'), 'utf8'), '# alpha\nv2\n');
  assert.deepEqual(result.extras, ['alpha/notes.txt']);
  assert.equal(fs.readFileSync(path.join(target, 'alpha', 'notes.txt'), 'utf8'), 'mine');
});

test('--check on an installed target: in sync, exit 0', (t) => {
  const sourceRoot = fakeSource(t);
  const target = tempDir(t);
  installSkills({ sourceRoot, target, skills: FAKE_SKILLS });
  const { lines, out, err } = collect();
  assert.equal(run(['--check', '--target', target], { out, err, sourceRoot, skills: FAKE_SKILLS }), 0);
  assert.match(lines.at(-1), /in sync/);
});

test('--check names a missing and a differing file, exits 1, and writes nothing', (t) => {
  const sourceRoot = fakeSource(t);
  const target = tempDir(t);
  installSkills({ sourceRoot, target, skills: FAKE_SKILLS });
  fs.writeFileSync(path.join(target, 'alpha', 'SKILL.md'), 'edited by hand\n');
  fs.rmSync(path.join(target, 'beta', 'lib', 'helper.mjs'));

  const { lines, out, err } = collect();
  assert.equal(run(['--check', '--target', target], { out, err, sourceRoot, skills: FAKE_SKILLS }), 1);
  const text = lines.join('\n');
  assert.match(text, /differs\s+alpha\/SKILL\.md/);
  assert.match(text, /missing\s+beta\/lib\/helper\.mjs/);
  assert.match(lines.at(-1), /2 file\(s\) drift/);
  assert.equal(fs.readFileSync(path.join(target, 'alpha', 'SKILL.md'), 'utf8'), 'edited by hand\n');
  assert.equal(fs.existsSync(path.join(target, 'beta', 'lib', 'helper.mjs')), false);
});

test('--check on an empty target reports every file missing', (t) => {
  const sourceRoot = fakeSource(t);
  const target = tempDir(t);
  const result = installSkills({ sourceRoot, target, skills: FAKE_SKILLS, check: true });
  assert.equal(result.drift, 3);
  assert.equal(fs.readdirSync(target).length, 0);
});

test('a skill missing from the source stops the run before anything is written', (t) => {
  const sourceRoot = fakeSource(t);
  const target = tempDir(t);
  assert.throws(() => installSkills({ sourceRoot, target, skills: ['alpha', 'gamma'] }), /gamma/);
  assert.equal(fs.readdirSync(target).length, 0);
  const { lines, out, err } = collect();
  assert.equal(run(['--target', target], { out, err, sourceRoot, skills: ['gamma'] }), 1);
  assert.match(lines.join('\n'), /error: .*gamma/);
});

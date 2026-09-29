// bb2dash :: scripts/validate-grading.test.mjs
// Unit tests for the V-1 launcher (Phase 16, brief 96, task 3; R-34, P-68). Every case injects the
// config path, the temp dir and the spawn function, so no case reads the real ~/.claude.json and
// none starts claude. Run:
//   node --test --test-reporter=tap scripts/validate-grading.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  REPO_ROOT,
  TOOL_LIST,
  ALLOWED_TOOLS,
  DISALLOWED_TOOLS,
  LauncherError,
  parseArgs,
  loadServerEntry,
  checkServerBuild,
  isNodeCommand,
  verdictPathFor,
  buildPrompt,
  buildClaudeArgv,
  run,
} from './validate-grading.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const FAKE_KEY = 'sb_secret_TEST_ONLY_not_a_real_key';

/** A scratch dir holding a fake ~/.claude.json, a fake node build and an empty temp dir. */
function scratch(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vg-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const build = path.join(dir, 'dist', 'index.js');
  fs.mkdirSync(path.dirname(build), { recursive: true });
  fs.writeFileSync(build, '// fake build\n');
  const tmpDir = path.join(dir, 'tmp');
  fs.mkdirSync(tmpDir);
  return { dir, build, tmpDir };
}

function writeConfig(dir, text) {
  const configPath = path.join(dir, 'claude.json');
  fs.writeFileSync(configPath, text);
  return configPath;
}

function nodeEntry(build, command = 'C:/Program Files/nodejs/node.exe') {
  return { type: 'stdio', command, args: [build], env: { SUPABASE_SERVICE_ROLE_KEY: FAKE_KEY } };
}

function configWith(entry) {
  return JSON.stringify({ mcpServers: { bb2dash: entry } });
}

/** Collects output lines instead of printing them. */
function sink() {
  const lines = [];
  return { lines, write: (s) => lines.push(String(s)), text: () => lines.join('') };
}

/** A spawn stand-in: records its call and resolves with the given exit code. */
function fakeSpawn(code = 0, onCall = () => {}) {
  const calls = [];
  const fn = async (command, args, options) => {
    calls.push({ command, args, options });
    onCall({ command, args, options });
    return code;
  };
  fn.calls = calls;
  return fn;
}

/** A fake evidence folder with one 96a export, so the prompt can name the newest. */
function withExport(dir, names = ['96a_GRADING_SCHEMA_EXPORT_2026-09-29.md']) {
  const root = path.join(dir, 'repo');
  const evidence = path.join(root, 'docs', 'planning', 'sprint-2', 'evidence');
  fs.mkdirSync(evidence, { recursive: true });
  for (const n of names) fs.writeFileSync(path.join(evidence, n), '# export\n');
  return root;
}

function baseDeps(t, overrides = {}) {
  const s = scratch(t);
  const configPath = writeConfig(s.dir, configWith(nodeEntry(s.build)));
  const repoRoot = withExport(s.dir);
  const out = sink();
  const err = sink();
  return {
    s,
    out,
    err,
    deps: {
      configPath,
      tmpDir: s.tmpDir,
      repoRoot,
      spawn: fakeSpawn(0),
      stdout: out,
      stderr: err,
      signals: { on() {}, off() {} },
      ...overrides,
    },
  };
}

// --- config -------------------------------------------------------------------------------------

test('a ~/.claude.json with case-duplicate project keys parses (JSON.parse, not ConvertFrom-Json)', (t) => {
  const s = scratch(t);
  const text =
    '{"projects":{"C:/Users/stack/x":{"a":1},"c:/users/stack/x":{"a":2}},' +
    `"mcpServers":{"bb2dash":${JSON.stringify(nodeEntry(s.build))}}}`;
  const entry = loadServerEntry({ configPath: writeConfig(s.dir, text) });
  assert.equal(entry.command, 'C:/Program Files/nodejs/node.exe');
});

test('no bb2dash entry raises a named error', (t) => {
  const s = scratch(t);
  const configPath = writeConfig(s.dir, JSON.stringify({ mcpServers: { other: {} } }));
  assert.throws(() => loadServerEntry({ configPath }), (e) => {
    assert.ok(e instanceof LauncherError);
    assert.match(e.message, /No 'bb2dash' entry under mcpServers/);
    return true;
  });
});

test('a missing config file raises a named error', (t) => {
  const s = scratch(t);
  assert.throws(
    () => loadServerEntry({ configPath: path.join(s.dir, 'absent.json') }),
    /not found; register the bb2dash MCP server first/,
  );
});

test('an unparseable config raises a named error that does not echo the file', (t) => {
  const s = scratch(t);
  const configPath = writeConfig(s.dir, `{"mcpServers": {"bb2dash": {"env": {"K": "${FAKE_KEY}"}}`);
  assert.throws(() => loadServerEntry({ configPath }), (e) => {
    assert.match(e.message, /could not be parsed as JSON/);
    assert.ok(!e.message.includes(FAKE_KEY));
    return true;
  });
});

// --- build check --------------------------------------------------------------------------------

test('isNodeCommand reads the basename, lower-cased, .exe dropped', () => {
  assert.equal(isNodeCommand('node'), true);
  assert.equal(isNodeCommand('C:/Program Files/nodejs/node.exe'), true);
  assert.equal(isNodeCommand('C:\\Program Files\\nodejs\\NODE.EXE'), true);
  assert.equal(isNodeCommand('/usr/bin/node'), true);
  assert.equal(isNodeCommand('docker'), false);
  assert.equal(isNodeCommand('nodemon'), false);
});

for (const command of ['node', 'C:/Program Files/nodejs/node.exe']) {
  test(`missing node build raises a named error (command = ${command})`, (t) => {
    const s = scratch(t);
    const entry = nodeEntry(path.join(s.dir, 'dist', 'missing.js'), command);
    assert.throws(() => checkServerBuild(entry), (e) => {
      assert.ok(e instanceof LauncherError);
      assert.match(e.message, /bb2dash server build missing: .*missing\.js/);
      assert.match(e.message, /npm run build/);
      return true;
    });
  });

  test(`present node build is found (command = ${command})`, (t) => {
    const s = scratch(t);
    assert.equal(checkServerBuild(nodeEntry(s.build, command)), 'build found');
  });
}

test('a docker entry is accepted with no file check', () => {
  const entry = { command: 'docker', args: ['run', '-i', '--rm', 'bb2dash-mcp:dev'] };
  let touched = false;
  const spyFs = { existsSync: () => { touched = true; return false; } };
  assert.equal(checkServerBuild(entry, spyFs), 'command accepted: docker');
  assert.equal(touched, false);
});

test('a docker entry with no inline key launches', async (t) => {
  const { deps } = baseDeps(t);
  fs.writeFileSync(deps.configPath, configWith({ command: 'docker', args: ['run', '-i', 'img'] }));
  assert.equal(await run(['IST.323'], deps), 0);
  assert.equal(deps.spawn.calls.length, 1);
});

// --- argv ---------------------------------------------------------------------------------------

test('argv carries --restricted and --tools as one element, and no Write( rule', () => {
  const argv = buildClaudeArgv({ mcpConfigPath: '/tmp/x.json', prompt: 'p' });
  assert.ok(argv.includes('--restricted'));
  assert.ok(argv.includes('--strict-mcp-config'));
  const i = argv.indexOf('--tools');
  assert.ok(i >= 0);
  assert.equal(argv[i + 1], 'Read,Edit,Write,Glob,Grep');
  assert.equal(TOOL_LIST, 'Read,Edit,Write,Glob,Grep');
  assert.ok(argv.every((a) => !a.includes('Write(')));
  assert.equal(argv[argv.indexOf('--mcp-config') + 1], '/tmp/x.json');
  assert.equal(argv[argv.length - 1], 'p');
});

test('the allow list is the three bb2dash tools, the planning read and the 96b Edit rule', () => {
  assert.deepEqual(ALLOWED_TOOLS, [
    'mcp__bb2dash__list_courses',
    'mcp__bb2dash__search_materials',
    'mcp__bb2dash__get_material_text',
    'Read(docs/planning/**)',
    'Edit(docs/planning/sprint-2/verification/96b_GRADING_VALIDATION_*)',
  ]);
  const argv = buildClaudeArgv({ mcpConfigPath: 't', prompt: 'p' });
  const allowed = argv[argv.indexOf('--allowedTools') + 1];
  assert.ok(allowed.includes('Edit(docs/planning/sprint-2/verification/96b_GRADING_VALIDATION_*)'));
  assert.ok(!/Glob\(|Grep\(/.test(allowed));
});

test('the deny list drops Edit/MultiEdit and adds the three Read denies', () => {
  const argv = buildClaudeArgv({ mcpConfigPath: 't', prompt: 'p' });
  const denied = argv[argv.indexOf('--disallowedTools') + 1].split(',');
  for (const rule of ['Read(./.env*)', 'Read(./**/.env*)', 'Read(./course context/**)']) {
    assert.ok(denied.includes(rule), rule);
  }
  for (const tool of ['Bash', 'PowerShell', 'NotebookEdit', 'WebFetch', 'WebSearch', 'Agent',
    'mcp__plugin_supabase_supabase__*', 'mcp__Supabase__*', 'mcp__rag__*']) {
    assert.ok(denied.includes(tool), tool);
  }
  assert.ok(!denied.includes('Edit'));
  assert.ok(!denied.includes('MultiEdit'));
  assert.deepEqual(denied, DISALLOWED_TOOLS);
});

// --- prompt -------------------------------------------------------------------------------------

test('the prompt names brief 63, the 96c template, the 96a export and the 96b verdict path', () => {
  const prompt = buildPrompt({
    course: 'IST.323',
    exportPath: 'docs/planning/sprint-2/evidence/96a_GRADING_SCHEMA_EXPORT_2026-09-29.md',
  });
  assert.ok(prompt.includes('docs/planning/sprint-1-hub/briefs/63_GRADING_VALIDATION.md'));
  assert.ok(prompt.includes('docs/planning/sprint-2/evidence/96c_V1_VERDICT_TEMPLATE.md'));
  assert.ok(prompt.includes('96a_GRADING_SCHEMA_EXPORT_2026-09-29.md'));
  assert.ok(prompt.includes('docs/planning/sprint-2/verification/96b_GRADING_VALIDATION_IST.323.md'));
});

test('GEO.103 lecture and recitation share one verdict file', () => {
  assert.equal(verdictPathFor('GEO.103.lecture'), 'docs/planning/sprint-2/verification/96b_GRADING_VALIDATION_GEO.103.md');
  assert.equal(verdictPathFor('GEO.103.recitation'), verdictPathFor('GEO.103'));
  assert.equal(verdictPathFor('IST.466'), 'docs/planning/sprint-2/verification/96b_GRADING_VALIDATION_IST.466.md');
});

test('with no course the prompt still names the 96b pattern', () => {
  const prompt = buildPrompt({ course: '', exportPath: 'docs/planning/sprint-2/evidence/96a_GRADING_SCHEMA_EXPORT_x.md' });
  assert.ok(prompt.includes('96b_GRADING_VALIDATION_'));
  assert.ok(prompt.includes('96c_V1_VERDICT_TEMPLATE.md'));
});

test('run names the newest 96a export unless --export is given', async (t) => {
  const { deps, s } = baseDeps(t);
  deps.repoRoot = withExport(s.dir, [
    '96a_GRADING_SCHEMA_EXPORT_2026-09-29.md',
    '96a_GRADING_SCHEMA_EXPORT_2026-10-06.md',
  ]);
  await run(['IST.323'], deps);
  const prompt = deps.spawn.calls[0].args.at(-1);
  assert.ok(prompt.includes('96a_GRADING_SCHEMA_EXPORT_2026-10-06.md'));

  const other = path.join(deps.repoRoot, 'docs', 'planning', 'custom-export.md');
  fs.writeFileSync(other, '# x\n');
  deps.spawn = fakeSpawn(0);
  await run(['IST.323', '--export', other], deps);
  const prompt2 = deps.spawn.calls[0].args.at(-1);
  assert.ok(prompt2.includes('docs/planning/custom-export.md'));
  assert.ok(!prompt2.includes('96a_GRADING_SCHEMA_EXPORT_2026-10-06.md'));
});

// --- args ---------------------------------------------------------------------------------------

test('parseArgs reads course, --export and --dry-run; rejects junk', () => {
  assert.deepEqual(parseArgs(['--dry-run', 'IST.323']), { course: 'IST.323', exportPath: null, dryRun: true });
  assert.deepEqual(parseArgs(['--export', 'a.md']), { course: '', exportPath: 'a.md', dryRun: false });
  assert.throws(() => parseArgs(['--export']), /--export needs a path/);
  assert.throws(() => parseArgs(['--nope']), /unknown option/);
  assert.throws(() => parseArgs(['IST.323', 'IST.466']), /one course/);
  assert.throws(() => parseArgs(['IST.323; rm -rf /']), /not a course id/);
});

// --- temp file ----------------------------------------------------------------------------------

test('the temp file holds only the bb2dash entry and is gone after success', async (t) => {
  let seen = null;
  const { deps } = baseDeps(t);
  deps.spawn = fakeSpawn(0, ({ args }) => {
    const tmp = args[args.indexOf('--mcp-config') + 1];
    assert.match(path.basename(tmp), /^bb2dash-validate-mcp-[0-9a-f]+\.json$/);
    assert.equal(path.dirname(tmp), deps.tmpDir);
    seen = tmp;
    const parsed = JSON.parse(fs.readFileSync(tmp, 'utf8'));
    assert.deepEqual(Object.keys(parsed.mcpServers), ['bb2dash']);
  });
  assert.equal(await run(['IST.323'], deps), 0);
  assert.ok(seen);
  assert.equal(fs.existsSync(seen), false);
  assert.deepEqual(fs.readdirSync(deps.tmpDir), []);
});

test('the temp file is gone after a thrown spawn, and the error is named', async (t) => {
  const { deps } = baseDeps(t);
  deps.spawn = () => { throw new Error('spawn claude ENOENT'); };
  await assert.rejects(run(['IST.323'], deps), /spawn claude ENOENT/);
  assert.deepEqual(fs.readdirSync(deps.tmpDir), []);
});

test('the exit code of claude is passed through', async (t) => {
  const { deps } = baseDeps(t);
  deps.spawn = fakeSpawn(3);
  assert.equal(await run(['IST.323'], deps), 3);
});

test('an interrupt handler is held while claude runs and released after', async (t) => {
  const { deps } = baseDeps(t);
  const held = new Set();
  deps.signals = { on: (sig) => held.add(sig), off: (sig) => held.delete(sig) };
  deps.spawn = fakeSpawn(0, () => assert.ok(held.has('SIGINT')));
  await run(['IST.323'], deps);
  assert.equal(held.size, 0);
});

// --- cwd ----------------------------------------------------------------------------------------

test('REPO_ROOT is the parent of scripts/, resolved from the script itself', () => {
  assert.equal(REPO_ROOT, path.resolve(SCRIPT_DIR, '..'));
  assert.ok(fs.existsSync(path.join(REPO_ROOT, 'scripts', 'validate-grading.mjs')));
});

test("the spawn's cwd is the repo root when called from another directory", async (t) => {
  const { deps } = baseDeps(t);
  delete deps.repoRoot; // use the real default

  const before = process.cwd();
  process.chdir(os.tmpdir());
  t.after(() => process.chdir(before));
  const other = path.join(REPO_ROOT, 'docs', 'planning', 'sprint-1-hub', 'briefs', '63_GRADING_VALIDATION.md');
  await run(['IST.323', '--export', other], deps);
  const call = deps.spawn.calls[0];
  assert.equal(call.command, 'claude');
  assert.equal(path.resolve(call.options.cwd), REPO_ROOT);
  assert.notEqual(path.resolve(call.options.cwd), path.resolve(os.tmpdir()));
});

// --- dry run ------------------------------------------------------------------------------------

test('--dry-run prints the argv with <tmp>, the server line, never the key, and launches nothing', async (t) => {
  const { deps, out } = baseDeps(t);
  assert.equal(await run(['--dry-run', 'IST.323'], deps), 0);
  assert.equal(deps.spawn.calls.length, 0);
  const text = out.text();
  assert.ok(text.includes('<tmp>'));
  assert.ok(text.includes('--restricted'));
  assert.match(text, /^server: bb2dash \(build found\)$/m);
  assert.ok(!text.includes(FAKE_KEY));
  assert.ok(!text.includes('SUPABASE_SERVICE_ROLE_KEY'));
  assert.deepEqual(fs.readdirSync(deps.tmpDir), []);
});

test('a named error rejects run with a LauncherError that never holds the key', async (t) => {
  const { deps, err } = baseDeps(t);
  fs.writeFileSync(deps.configPath, configWith(nodeEntry(path.join(deps.tmpDir, 'gone.js'))));
  const code = await run(['--dry-run', 'IST.323'], deps).catch((e) => e);
  assert.ok(code instanceof LauncherError);
  assert.ok(!code.message.includes(FAKE_KEY));
  assert.equal(err.text(), '');
});

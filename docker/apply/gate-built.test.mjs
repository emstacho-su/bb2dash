// docker/apply/gate-built.test.mjs — the apply tool gate, tested as built (Phase 24a, tasks 32 and 38).
//
//   cd apply && npm ci && npm run build && cd .. && node --test docker/apply/gate-built.test.mjs
//
// `apply/dist/hooks/tool-gate.js` bundles `workspace/src/hooks/gate-rules`, a file the Workspace runner
// rewrites in this phase. A changed signature fails apply's typecheck; a changed behaviour would not,
// and a broken import makes the gate deny every call (`apply/src/hooks/tool-gate.ts`), which stops the
// Inbox auto-apply. So the file the CLI runs is run here, as a process, with the hook's stdin:
// exit 2 for an unknown tool, exit 0 and silence for a listed materials tool, exit 2 for input that
// is not JSON.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const GATE = path.join(REPO, 'apply', 'dist', 'hooks', 'tool-gate.js');
const DENY = 2;
const ALLOW = 0;

function runGate(stdin) {
  assert.ok(fs.existsSync(GATE), 'apply/dist/hooks/tool-gate.js is not built: run `cd apply && npm run build` first');
  return spawnSync(process.execPath, [GATE], { input: stdin, encoding: 'utf8', timeout: 30_000, cwd: REPO });
}

const call = (toolName, extra = {}) => JSON.stringify({ tool_name: toolName, tool_input: {}, ...extra });

test('an unknown tool is denied with exit 2 and a reason on stderr', () => {
  const run = runGate(call('mcp__nothing__unknown'));
  assert.equal(run.status, DENY);
  assert.notEqual(run.stderr.trim(), '');
  assert.equal(run.stdout, '');
});

test('a listed materials tool is allowed: exit 0 and nothing printed', () => {
  for (const tool of ['mcp__bb2dash__search_materials', 'mcp__bb2dash__get_material_text']) {
    const run = runGate(call(tool, { tool_input: { query: 'synthetic' } }));
    assert.equal(run.status, ALLOW, `${tool}: ${run.stderr}`);
    assert.equal(run.stdout, '');
    assert.equal(run.stderr, '');
  }
});

test('input that is not JSON is denied with exit 2', () => {
  for (const input of ['this is not json', '', '{"tool_name":']) {
    const run = runGate(input);
    assert.equal(run.status, DENY, JSON.stringify(input));
    assert.equal(run.stdout, '');
  }
});

test('JSON that is not a hook input is denied too', () => {
  for (const input of ['[]', '42', 'null', '{}']) assert.equal(runGate(input).status, DENY, input);
});

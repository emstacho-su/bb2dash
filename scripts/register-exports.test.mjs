// The registration script is PowerShell and is never run by a test (it registers a scheduled task).
// These checks read its bytes, because an escape sequence once ate its backslashes and turned `\v`
// into a vertical tab: the script then never found powershell.exe and could never register anything.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

const source = fs.readFileSync(path.join(import.meta.dirname, 'register-exports.ps1'), 'utf8');

test('the script holds no control character except tab, CR and LF', () => {
  // eslint-disable-next-line no-control-regex
  const bad = [...source].filter((c) => /[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(c));
  assert.deepEqual(bad.map((c) => c.charCodeAt(0)), []);
});

test('it holds the exact powershell.exe path literal, with its backslashes', () => {
  assert.ok(source.includes(String.raw`'System32\WindowsPowerShell\v1.0\powershell.exe'`));
});

test('every backslash it needs is still there: the trim set and the state-file hint', () => {
  assert.ok(source.includes(String.raw`.TrimEnd('\', '/')`));
  assert.ok(source.includes(String.raw`$env:USERPROFILE\.bb2dash-exports\state.json`));
});

test('its action starts PowerShell hidden and ends with the runner exit code', () => {
  const action = source.split(/\r?\n/).filter((l) => l.startsWith('$arguments = '));
  assert.equal(action.length, 1);
  assert.ok(action[0].includes('-WindowStyle Hidden'));
  assert.ok(action[0].includes('-Command'));
  assert.ok(source.includes("; exit $LASTEXITCODE'"));
  assert.ok(source.includes('New-ScheduledTaskAction -Execute $powershell'));
  assert.ok(source.includes('exports-run.mjs'));
});

test('it checks every folder before it registers, and calls no git, gh or docker', () => {
  assert.ok(source.indexOf('Resolve-Folder $SecretsDir') < source.indexOf('Register-ScheduledTask `'));
  assert.ok(source.indexOf('resolve-config.mjs') < source.indexOf('Register-ScheduledTask `'));
  const code = source.replace(/<#[\s\S]*?#>/, '');
  assert.doesNotMatch(code, /(^|[\s&;(|])(git|gh|docker|docker-compose)(\.exe)?\s/m);
  assert.doesNotMatch(code, /Get-Content[^\n]*SecretsDir|\.env\b/);
});

test('it refuses the four typographic single quotes, named by code point, and the file stays ASCII', () => {
  // PowerShell reads U+2018 to U+201B as single quotes, so one in a folder path would end the quoted
  // literal inside -Command. They are written as [char]0x... so that the file holds no non-ASCII byte.
  for (const point of ['2018', '2019', '201A', '201B']) {
    assert.match(source, new RegExp(`\[char\]0x${point}`, 'i'), `U+${point}`);
  }
  assert.doesNotMatch(source, /[^\x00-\x7F]/);
  assert.ok(source.includes('Test-UnsafePath $Value'), 'the folder check uses the shared test');
  assert.ok(source.includes('Test-UnsafePath $node.Source'), "node's own path gets the same test");
  assert.match(source, /typographic single quote/);
});

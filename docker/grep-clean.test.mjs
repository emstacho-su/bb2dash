// bb2dash :: docker/grep-clean.test.mjs
//
//   node --test docker/grep-clean.test.mjs
//
// R-86 (brief 100 task 16): nothing a bb2dash image copies may be bound to Windows. The test reads the
// COPY instructions of docker/sync/Dockerfile and mcp-server/Dockerfile (every stage; `--from=` copies
// come from a stage, not the context, and are skipped), expands each source in its build context the
// way the context's .dockerignore leaves it, and greps every text file for a Windows drive path, a
// .ps1 script, PowerShell run as a program, Move-Item and OneDrive, with comments stripped first: a
// comment may say what a Windows editor does; code may not depend on it.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Each image: its Dockerfile, its build context and that context's .dockerignore (compose.yaml). */
export const IMAGES = Object.freeze([
  { name: 'sync', dockerfile: 'docker/sync/Dockerfile', context: '.' },
  { name: 'bb2dash-mcp', dockerfile: 'mcp-server/Dockerfile', context: 'mcp-server' },
]);

/** [label, pattern, a planted line the pattern must catch]. */
export const PATTERNS = Object.freeze([
  ['a C:/ drive path', /\bC:\//, "const dir = 'C:/Users/someone/projects';"],
  ['a C:\\ drive path', /\bC:\\/, "const dir = 'C:\\\\Users\\\\someone';"],
  ['a .ps1 script', /\.ps1\b/, "spawn('pwsh', ['-File', 'scripts/run.ps1']);"],
  ['PowerShell as a program', /\bpowershell(\.exe)?\b/i, "execFile('powershell.exe', ['-NoProfile']);"],
  ['Move-Item', /\bMove-Item\b/, "run('Move-Item a b');"],
  ['OneDrive', /onedrive/i, "path.join(home, 'OneDrive', 'bb2dash');"],
]);

/** COPY sources from the build context, every stage; line continuations joined. */
export function copySources(dockerfileText) {
  const joined = dockerfileText.replace(/\\\r?\n/g, ' ');
  const sources = [];
  for (const line of joined.split(/\r?\n/)) {
    const words = line.trim().split(/\s+/);
    if (words[0]?.toUpperCase() !== 'COPY') continue;
    const args = words.slice(1);
    if (args.some((arg) => arg.startsWith('--from='))) continue;
    const paths = args.filter((arg) => !arg.startsWith('--'));
    sources.push(...paths.slice(0, -1));
  }
  return sources;
}

/** The exclusion lines of a .dockerignore (not the `*` and `!…` of an allow-list), as matchers. */
export function ignoreMatchers(dockerignoreText) {
  return dockerignoreText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#') && !line.startsWith('!') && line !== '*')
    .map((pattern) => {
      const body = pattern
        .replace(/\/+$/, '')
        .split('/')
        .map((segment) =>
          segment === '**' ? '(?:.*/)?' : `${segment.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*')}/`,
        )
        .join('')
        .replace(/\/$/, '');
      return new RegExp(`^${body}(?:/.*)?$`);
    });
}

function isIgnored(relative, matchers) {
  return matchers.some((matcher) => matcher.test(relative));
}

function walk(absolute, relative, matchers, out) {
  if (isIgnored(relative, matchers)) return;
  const stat = fs.statSync(absolute);
  if (stat.isDirectory()) {
    for (const name of fs.readdirSync(absolute)) walk(path.join(absolute, name), `${relative}/${name}`, matchers, out);
  } else if (stat.isFile()) {
    out.push(relative);
  }
}

/** Every file the image's COPY instructions take from its context, as context-relative paths. */
export function copiedFiles(image) {
  const contextDir = path.join(REPO, image.context);
  const ignorePath = path.join(contextDir, '.dockerignore');
  const matchers = fs.existsSync(ignorePath) ? ignoreMatchers(fs.readFileSync(ignorePath, 'utf8')) : [];
  const files = [];
  for (const source of copySources(fs.readFileSync(path.join(REPO, image.dockerfile), 'utf8'))) {
    const relative = source.replace(/^\.\//, '').replace(/\/+$/, '');
    const absolute = path.join(contextDir, relative);
    assert.ok(fs.existsSync(absolute), `${image.dockerfile} copies ${source}, which is not in ${image.context}`);
    walk(absolute, relative, matchers, files);
  }
  return [...new Set(files)].sort();
}

/** Code without its comments. Deliberately crude: it may hide code, never show a comment. */
export function stripComments(file, text) {
  const ext = path.extname(file).toLowerCase();
  if (['.ts', '.js', '.mjs', '.cjs'].includes(ext)) {
    return text.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');
  }
  if (['.py', '.sh', '.toml', '.yaml', '.yml'].includes(ext) || text.startsWith('#!')) {
    return text.replace(/^\s*#.*$/gm, '').replace(/\s#.*$/gm, '');
  }
  return text;
}

function isBinary(buffer) {
  return buffer.subarray(0, 8000).includes(0);
}

test('every pattern catches its planted line (a pattern that matches nothing guards nothing)', () => {
  for (const [label, pattern, planted] of PATTERNS) assert.ok(pattern.test(planted), label);
});

test('comments are stripped, code is kept', () => {
  assert.equal(stripComments('a.ts', "// PowerShell writes a BOM\nconst x = 1; // OneDrive\n").includes('owerShell'), false);
  assert.match(stripComments('a.ts', "const url = 'https://example.com';"), /https:\/\/example\.com/);
  assert.equal(stripComments('a.sh', '# Move-Item\necho ok  # OneDrive\n').trim(), 'echo ok');
});

test('the build contexts are the ones compose.yaml builds from', () => {
  const compose = fs.readFileSync(path.join(REPO, 'compose.yaml'), 'utf8');
  assert.match(compose, /context: \.\r?\n\s+dockerfile: docker\/sync\/Dockerfile/);
  assert.match(compose, /context: \.\/mcp-server\r?\n\s+dockerfile: Dockerfile/);
});

test('the .dockerignore exclusions keep host-built and secret folders out', () => {
  const matchers = ignoreMatchers(fs.readFileSync(path.join(REPO, '.dockerignore'), 'utf8'));
  for (const kept of ['ingest/.venv/pyvenv.cfg', 'sync/node_modules/pg/package.json', '.env', 'course context/a.pdf', 'local_cache/model.onnx', 'ingest/__pycache__/x.pyc']) {
    assert.ok(isIgnored(kept, matchers), `${kept} is excluded`);
  }
  assert.equal(isIgnored('ingest/extract_text.py', matchers), false);
});

for (const image of IMAGES) {
  test(`${image.name}: what ${image.dockerfile} copies is clean`, (t) => {
    const files = copiedFiles(image);
    const scanned = [];
    const offenders = [];
    for (const file of files) {
      const buffer = fs.readFileSync(path.join(REPO, image.context, file));
      if (isBinary(buffer)) continue;
      scanned.push(file);
      const code = stripComments(file, buffer.toString('utf8'));
      for (const [label, pattern] of PATTERNS) {
        if (pattern.test(code)) offenders.push(`${file}: ${label}`);
      }
    }
    assert.ok(scanned.length >= 1, `${image.dockerfile}: at least one file scanned`);
    t.diagnostic(`${image.name}: ${scanned.length} file(s) scanned of ${files.length} copied`);
    assert.deepEqual(offenders, []);
  });
}

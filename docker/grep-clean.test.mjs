// bb2dash :: docker/grep-clean.test.mjs
//
//   node --test docker/grep-clean.test.mjs
//
// R-86 (brief 100 task 16): nothing a bb2dash image copies may be bound to Windows. The test reads the
// COPY instructions of docker/sync/Dockerfile, mcp-server/Dockerfile and docker/workspace/Dockerfile
// (every stage; `--from=` copies come from a stage or a named build context, not the build context,
// and are skipped), expands each source in its build context the way the image's ignore file leaves
// it, and greps every text file for a Windows drive path, a .ps1 script, PowerShell run as a program,
// Move-Item and OneDrive, with comments stripped first: a comment may say what a Windows editor does;
// code may not depend on it.
//
// The ignore file is the one BuildKit reads: `<Dockerfile>.dockerignore` beside the Dockerfile when
// there is one (the workspace image, brief 102 task 12), else the context's own `.dockerignore`. The
// workspace image also builds the harness `rag` server, which arrives through a named build context
// (`COPY --from=harness-mcp`): another repo's source, not scanned here.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Each image: its Dockerfile and its build context (compose.yaml); `ignoreFileOf` finds its ignore file. */
export const IMAGES = Object.freeze([
  { name: 'sync', dockerfile: 'docker/sync/Dockerfile', context: '.' },
  { name: 'bb2dash-mcp', dockerfile: 'mcp-server/Dockerfile', context: 'mcp-server' },
  { name: 'workspace', dockerfile: 'docker/workspace/Dockerfile', context: '.' },
]);

/** What BuildKit appends to a Dockerfile's name to find that Dockerfile's own ignore file. */
const PER_DOCKERFILE_IGNORE_SUFFIX = '.dockerignore';

/** What the workspace image may take from `workspace/`: named paths, never the folder whole (brief 102, W-65). */
export const WORKSPACE_COPIED_PATHS = Object.freeze([
  'workspace/claude',
  'workspace/package-lock.json',
  'workspace/package.json',
  'workspace/prompts',
  'workspace/src',
  'workspace/tsconfig.json',
]);

/** The allow-list brief 102 freezes for docker/workspace/Dockerfile.dockerignore, in order. */
export const WORKSPACE_IGNORE_LINES = Object.freeze([
  '*',
  '!docker/workspace/',
  '!workspace/',
  '!mcp-server/',
  '**/node_modules',
  '**/dist',
  '**/coverage',
  '**/.env',
  '**/.env.*',
]);

/** The version brief 102 pins the image's Claude Code CLI to (never `latest`, never the `stable` tag). */
export const CLAUDE_CODE_PIN = '2.1.289';

const imageNamed = (name) => IMAGES.find((image) => image.name === name);

/** The ignore file a build of this image reads, repo-relative; null when the image has none. */
export function ignoreFileOf(image) {
  const perDockerfile = `${image.dockerfile}${PER_DOCKERFILE_IGNORE_SUFFIX}`;
  if (fs.existsSync(path.join(REPO, perDockerfile))) return perDockerfile;
  const ofContext = path.posix.join(image.context, '.dockerignore');
  return fs.existsSync(path.join(REPO, ofContext)) ? ofContext : null;
}

/** The lines of an ignore file that are neither blank nor comments. */
const liveLines = (text) =>
  text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));

/** A COPY source as a context-relative path: no leading `./`, no trailing slash. */
const contextRelative = (source) => source.replace(/^\.\//, '').replace(/\/+$/, '');

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
  const ignoreFile = ignoreFileOf(image);
  const matchers = ignoreFile ? ignoreMatchers(fs.readFileSync(path.join(REPO, ignoreFile), 'utf8')) : [];
  const files = [];
  for (const source of copySources(fs.readFileSync(path.join(REPO, image.dockerfile), 'utf8'))) {
    const relative = contextRelative(source);
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
  assert.match(compose, /context: \.\r?\n\s+dockerfile: docker\/workspace\/Dockerfile/);
});

test('a COPY from a stage or a named build context is not a context source', () => {
  const dockerfile = [
    'COPY --from=harness-mcp package.json package-lock.json ./',
    'COPY --from=runner /build/dist ./dist',
    'COPY --chown=node:node workspace/claude /app/workspace/claude',
  ].join('\n');
  assert.deepEqual(copySources(dockerfile), ['workspace/claude']);
});

test("an image is read through <Dockerfile>.dockerignore when it has one, else its context's .dockerignore", () => {
  assert.equal(ignoreFileOf(imageNamed('workspace')), 'docker/workspace/Dockerfile.dockerignore');
  assert.equal(ignoreFileOf(imageNamed('sync')), '.dockerignore');
  assert.equal(ignoreFileOf(imageNamed('bb2dash-mcp')), 'mcp-server/.dockerignore');
});

test('the workspace image has its own allow-list, and the root .dockerignore does not name it', () => {
  const own = fs.readFileSync(path.join(REPO, 'docker/workspace/Dockerfile.dockerignore'), 'utf8');
  assert.deepEqual(liveLines(own), [...WORKSPACE_IGNORE_LINES]);
  const matchers = ignoreMatchers(own);
  const excluded = [
    'workspace/node_modules/pg/package.json',
    'mcp-server/node_modules/zod/index.js',
    'mcp-server/dist/index.js',
    'workspace/dist/runner.js',
    'workspace/coverage/lcov.info',
    'mcp-server/.env',
    'workspace/.env.local',
    '.env',
  ];
  for (const kept of excluded) assert.ok(isIgnored(kept, matchers), `${kept} is excluded`);
  const sent = ['workspace/src/runner.ts', 'workspace/claude/settings.json', 'mcp-server/src/index.ts', 'docker/workspace/entrypoint.sh'];
  for (const file of sent) assert.equal(isIgnored(file, matchers), false, `${file} is sent`);
  // The sync image builds from the same folder: its allow-list must not change (brief 102, Files).
  assert.doesNotMatch(fs.readFileSync(path.join(REPO, '.dockerignore'), 'utf8'), /workspace/);
});

test('the workspace Dockerfile pins the CLI, builds the materials server in a stage and copies named paths only', () => {
  const dockerfile = fs.readFileSync(path.join(REPO, imageNamed('workspace').dockerfile), 'utf8');
  assert.ok(dockerfile.split(/\r?\n/).includes(`ARG CLAUDE_CODE_VERSION=${CLAUDE_CODE_PIN}`), 'the CLI pin');
  assert.doesNotMatch(dockerfile, /CLAUDE_CODE_VERSION=latest|bb2dash-mcp:local/);
  const sources = copySources(dockerfile).map(contextRelative);
  const fromWorkspace = [...new Set(sources.filter((source) => source === 'workspace' || source.startsWith('workspace/')))].sort();
  assert.deepEqual(fromWorkspace, [...WORKSPACE_COPIED_PATHS]);
  const roots = [...new Set(sources.map((source) => source.split('/')[0]))].sort();
  assert.deepEqual(roots, ['docker', 'mcp-server', 'workspace']);
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

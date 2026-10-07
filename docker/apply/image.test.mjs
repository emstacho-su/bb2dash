// docker/apply/image.test.mjs — what the apply image and its compose service must keep true
// (Phase 23). Text checks on the committed files; no Docker is run.
//
//   node --test docker/apply/image.test.mjs
//
// The reasons are B-43 and B-44 as amended on 2026-10-07: a Claude process may run in a container
// of its own, and never shares a network or a volume with the Blackboard login in `sync`.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { SOURCE, SUBSTITUTIONS, TARGET, forkFirewall } from './fork-firewall.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (relative) => fs.readFileSync(path.join(REPO, relative), 'utf8').replace(/\r\n/g, '\n');

const dockerfile = read('docker/apply/Dockerfile');
const compose = read('compose.yaml');
const config = read('apply/src/config.ts');

/** One service's block of compose.yaml: from its key to the next key at the same depth. */
function service(name) {
  const start = compose.indexOf(`\n  ${name}:\n`);
  assert.notEqual(start, -1, `compose.yaml has no ${name} service`);
  const rest = compose.slice(start + 1);
  const next = rest.slice(1).search(/\n {2}[a-z][a-z0-9-]*:\n|\n[a-z]+:\n/);
  return next === -1 ? rest : rest.slice(0, next + 1);
}

/** The block without its comment lines, so a comment that names something forbidden is not a hit. */
const code = (block) => block.split('\n').filter((line) => !line.trim().startsWith('#')).join('\n');

/** A list under `key:` in a service block, as its items. */
function listOf(block, key) {
  const match = new RegExp(`\\n    ${key}:\\n((?:      - .*\\n)+)`).exec(code(block));
  return match ? match[1].trim().split('\n').map((line) => line.trim().replace(/^- /, '')) : [];
}

/** The runtime stage: the instructions after the last FROM, continuations joined, spaces single, comments dropped. */
const runtime = dockerfile
  .replace(/\\\n/g, ' ')
  .split('\n')
  .map((line) => line.trim().replace(/\s+/g, ' '))
  .filter((line) => line && !line.startsWith('#'));
const runtimeStage = runtime.slice(runtime.findLastIndex((line) => /^FROM\s/.test(line)) + 1);

test('the firewall is the Workspace script with five literals changed, and nothing else', () => {
  const generated = forkFirewall(fs.readFileSync(SOURCE, 'utf8'));
  assert.equal(fs.readFileSync(TARGET, 'utf8').replace(/\r\n/g, '\n'), generated, 'run: node docker/apply/fork-firewall.mjs --write');
  assert.equal(SUBSTITUTIONS.length, 5);
  assert.match(generated, /readonly -a DSN_SECRETS=\(\n {2}"inbox_apply_db_url"\n\)\n/);
  // The names it allows on tcp/443 are the Workspace's two, untouched.
  assert.match(generated, /readonly -a HTTPS_HOSTS=\(\n {2}"api\.anthropic\.com"\n {2}"goultdzqcavefcgnifdy\.supabase\.co"\n\)\n/);
});

test('a literal that moved in the Workspace script stops the fork instead of dropping a rule', () => {
  const source = fs.readFileSync(SOURCE, 'utf8');
  assert.throws(() => forkFirewall(source.replace('readonly HTTPS_SET=workspace-https', 'readonly HTTPS_SET=renamed')), /the HTTPS set occurs 0 times/);
  assert.throws(() => forkFirewall(`${source}\nreadonly POSTGRES_SET=workspace-postgres\n`), /the Postgres set occurs 2 times/);
});

test('the CLI is pinned to the version the worker checks, installed by the recipe, and handed to root', () => {
  const pinned = /export const CLAUDE_CODE_VERSION = '([0-9.]+)';/.exec(read('workspace/src/config.ts'))?.[1];
  assert.ok(pinned, 'workspace/src/config.ts names the pinned version');
  assert.ok(dockerfile.includes(`ARG CLAUDE_CODE_VERSION=${pinned}\n`), `the image pins ${pinned}`);
  const install = dockerfile.indexOf('npm install -g "@anthropic-ai/claude-code@${CLAUDE_CODE_VERSION}"');
  assert.notEqual(install, -1, 'the CLI is installed by the dev container recipe');
  assert.notEqual(dockerfile.indexOf('chown -R root:root /usr/local/share/npm-global', install), -1, 'its folder is handed to root after the install');
  assert.doesNotMatch(dockerfile, /claude-code@(latest|stable)/);
  assert.match(code(service('apply')), /^ {6}DISABLE_AUTOUPDATER: "1"$/m);
});

test('the run folder holds the skill and nothing the worker can write', () => {
  assert.ok(runtimeStage.includes('COPY skills/inbox-apply /app/apply/run/.claude/skills/inbox-apply'));
  assert.ok(runtimeStage.includes('RUN chown -R root:root /app/apply/run && chmod -R a-w /app/apply/run && chmod 0555 /app/apply/run'));
  assert.match(config, /runCwd: '\/app\/apply\/run'/);
  assert.match(config, /skillDir: '\/app\/apply\/run\/\.claude\/skills\/inbox-apply'/);
  for (const file of ['SKILL.md', 'context.md', 'writer.md']) {
    assert.ok(fs.existsSync(path.join(REPO, 'skills', 'inbox-apply', file)), `skills/inbox-apply/${file}`);
  }
  assert.ok(!code(service('apply')).includes('/app/apply/run'), 'compose.yaml mounts nothing over the run folder');
});

test('the layout the worker names is the layout the image builds', () => {
  for (const [name, literal] of [
    ['settings', '/app/apply/claude/settings.json'],
    ['sqlServer', '/app/apply/dist/mcp-sql/server.js'],
    ['materialsServer', '/app/mcp-materials/dist/index.js'],
    ['dbUrlSecret', '/run/secrets/inbox_apply_db_url'],
    ['serviceKeySecret', '/run/secrets/bb2dash_mcp_service_key'],
    ['mcpConfig', '/run/apply/mcp.json'],
    ['aliveFile', '/run/apply/alive'],
  ]) {
    assert.ok(config.includes(`${name}: '${literal}'`), `apply/src/config.ts PATHS.${name}`);
  }
  assert.ok(runtimeStage.includes('COPY --from=worker /build/apply/dist /app/apply/dist'));
  assert.ok(runtimeStage.includes('COPY apply/claude /app/apply/claude'));
  assert.ok(runtimeStage.includes('COPY --from=materials /build/dist /app/mcp-materials/dist'));
  assert.equal(runtimeStage.at(-1), 'CMD ["node", "/app/apply/dist/main.js"]');
  assert.ok(read('docker/apply/entrypoint.sh').includes('readonly RUN_DIR=/run/apply\n'));
  const build = JSON.parse(read('apply/package.json')).scripts.build;
  for (const entry of ['src/main.ts', 'src/healthcheck.ts', 'src/hooks/tool-gate.ts', 'src/mcp-sql/server.ts']) {
    assert.ok(build.includes(entry), `the bundle has the entry ${entry}`);
    assert.ok(fs.existsSync(path.join(REPO, 'apply', entry)), `apply/${entry}`);
  }
  const hook = JSON.parse(read('apply/claude/settings.json')).hooks.PreToolUse[0];
  assert.equal(hook.matcher, '*');
  assert.equal(hook.hooks[0].command, 'node /app/apply/dist/hooks/tool-gate.js');
});

test('the pinned CA is copied once, root\'s and read-only', () => {
  const copies = runtimeStage.filter((line) => line.includes('prod-ca.crt') && /^COPY\s/.test(line));
  assert.deepEqual(copies, ['COPY --from=harness-certs prod-ca.crt /app/certs/prod-ca.crt']);
  assert.ok(runtimeStage.includes('RUN chmod 0444 /app/certs/prod-ca.crt'));
  assert.match(code(service('apply')), /harness-certs: \$\{HARNESS_DIR:-\.\.\/agentic-harness\}\/certs/);
});

test('no process starts as root by a USER line, and no secret is a build argument or a variable', () => {
  assert.equal(runtimeStage.filter((line) => /^USER\s/.test(line)).length, 0, 'the entrypoint drops privileges; the runtime stage has no USER line');
  assert.equal(runtimeStage.at(-2), 'ENTRYPOINT ["/app/docker/apply/entrypoint.sh"]');
  assert.doesNotMatch(dockerfile, /^(ARG|ENV)\s+\S*(TOKEN|SECRET|PASSWORD|KEY|DATABASE_URL)/m);
  const block = code(service('apply'));
  assert.doesNotMatch(block, /TOKEN|PASSWORD|DATABASE_URL|ANTHROPIC_API_KEY|_FILE:/);
  assert.ok(!/\n    user:/.test(block), 'compose.yaml sets no user for the service');
});

test('the service is kept away from the Blackboard login', () => {
  const apply = service('apply');
  const sync = service('sync');
  assert.deepEqual(listOf(apply, 'networks'), ['apply-net']);
  assert.ok(!code(sync).includes('apply-net'), 'sync is not on the apply network');
  assert.deepEqual(listOf(sync, 'networks'), [], 'sync names no network of its own to share');
  assert.deepEqual(listOf(apply, 'volumes'), ['apply-claude-home:/home/node/.claude']);
  for (const forbidden of ['bb-profile', 'course-files', 'novnc_password', 'sync_runner_db_url', 'ports:', 'network_mode', 'privileged', 'pid:', 'docker.sock']) {
    assert.ok(!code(apply).includes(forbidden), `the apply service names ${forbidden}`);
  }
  assert.deepEqual(listOf(apply, 'secrets'), ['inbox_apply_db_url', 'claude_oauth_token', 'bb2dash_mcp_service_key']);
  assert.deepEqual(listOf(apply, 'security_opt'), ['no-new-privileges:true']);
  assert.match(code(apply), /^ {4}cap_add: \[NET_ADMIN, NET_RAW\]$/m);
  assert.match(code(apply), /^ {4}profiles: \[apply\]$/m);
  assert.match(code(apply), /test: \["CMD", "node", "\/app\/apply\/dist\/healthcheck\.js"\]/);
});

test('the build context is an allow-list of what the Dockerfile copies', () => {
  const lines = read('docker/apply/Dockerfile.dockerignore').split('\n').filter((line) => line && !line.startsWith('#'));
  assert.deepEqual(lines, ['*', '!docker/apply/', '!apply/', '!workspace/src/', '!mcp-server/', '!skills/inbox-apply/', '**/node_modules', '**/dist', '**/coverage', '**/.env', '**/.env.*']);
  const sources = [...dockerfile.matchAll(/^COPY (?!--from)(.+) \S+$/gm)].flatMap((match) => match[1].trim().split(/\s+/));
  const allowed = lines.filter((line) => line.startsWith('!')).map((line) => line.slice(1));
  for (const source of sources) {
    assert.ok(allowed.some((prefix) => `${source}/`.startsWith(prefix)), `the Dockerfile copies ${source}, which the allow-list does not send`);
  }
});

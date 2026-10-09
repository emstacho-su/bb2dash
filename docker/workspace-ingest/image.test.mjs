// docker/workspace-ingest/image.test.mjs — what the ingest image and its two compose services must keep
// true (Phase 24a, brief 109 task 37 and the freeze amendment F-3). Text checks on the committed files;
// no Docker is run.
//
//   node --test docker/workspace-ingest/image.test.mjs
//
// One image, two services that meet only in the exchange volume: the worker (a network, two secrets, a
// firewall) and the parser (no network, no secret, a read-only root). A file that takes over the parser
// is in a container with nothing to steal; this test pins that claim.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { SOURCE, SUBSTITUTIONS, TARGET, forkFirewall } from './fork-firewall.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (relative) => fs.readFileSync(path.join(REPO, relative), 'utf8').replace(/\r\n/g, '\n');

const dockerfile = read('docker/workspace-ingest/Dockerfile');
const compose = read('compose.yaml');

const IMAGE = 'bb2dash-workspace-ingest:local';
const VOLUME = 'ingest-exchange';
const EXCHANGE_GID = '1100';

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
  const match = new RegExp(`\\n    ${key}:\\n((?:      - .*\\n)+)`).exec(`${code(block)}\n`);
  return match ? match[1].trim().split('\n').map((line) => line.trim().replace(/^- /, '')) : [];
}

/** A one-line scalar `key: value` of a service block. */
function scalarOf(block, key) {
  return new RegExp(`^ {4}${key}: (.+)$`, 'm').exec(code(block))?.[1].trim();
}

const worker = service('workspace-ingest');
const parser = service('workspace-extract');

/** The top-level `volumes:` block as text. */
const volumesBlock = compose.slice(compose.indexOf('\nvolumes:\n'), compose.indexOf('\nnetworks:\n'));

test('workspace-ingest: the network ingest-net only, one mount (the exchange volume), the two secrets', () => {
  assert.deepEqual(listOf(worker, 'networks'), ['ingest-net']);
  assert.deepEqual(listOf(worker, 'volumes'), [`${VOLUME}:/exchange`]);
  assert.deepEqual(listOf(worker, 'secrets'), ['workspace_ingest_db_url', 'supabase_anon_jwt']);
  assert.match(code(worker), /^ {4}profiles: \[workspace\]$/m);
  assert.deepEqual(listOf(worker, 'security_opt'), ['no-new-privileges:true']);
  assert.match(code(worker), /^ {4}cap_add: \[NET_ADMIN, NET_RAW\]$/m, 'the firewall alone needs these; the entrypoint drops them');
  assert.match(code(worker), /test: \["CMD", "node", "\/app\/workspace-ingest\/dist\/healthcheck\.js", "worker"\]/);
  assert.equal(scalarOf(worker, 'restart'), 'unless-stopped');
});

test('workspace-ingest: its root is not read-only (the firewall pins names in /etc/hosts), and it publishes nothing', () => {
  assert.doesNotMatch(code(worker), /read_only/);
  for (const forbidden of ['ports:', 'network_mode', 'privileged', 'pid:', 'docker.sock', 'hostname']) {
    assert.ok(!code(worker).includes(forbidden), `the worker names ${forbidden}`);
  }
  assert.ok(!/\n {4}user:/.test(code(worker)), 'the worker starts as root (the entrypoint) and drops to node itself');
});

test('workspace-extract: no network, no secret, a read-only root, every capability dropped, the user extract, one mount', () => {
  assert.equal(scalarOf(parser, 'network_mode'), 'none');
  assert.ok(!/\n {4}networks:/.test(code(parser)), 'it names no network');
  assert.ok(!/\n {4}secrets:/.test(code(parser)), 'it names no secret');
  assert.equal(scalarOf(parser, 'read_only'), 'true');
  assert.equal(scalarOf(parser, 'cap_drop'), '[ALL]');
  assert.ok(!code(parser).includes('cap_add'));
  assert.deepEqual(listOf(parser, 'security_opt'), ['no-new-privileges:true']);
  assert.equal(scalarOf(parser, 'user'), 'extract');
  assert.deepEqual(listOf(parser, 'volumes'), [`${VOLUME}:/exchange`]);
  assert.match(code(parser), /^ {4}profiles: \[workspace\]$/m);
  assert.match(code(parser), /test: \["CMD", "node", "\/app\/workspace-ingest\/dist\/healthcheck\.js", "parser"\]/);
  assert.equal(scalarOf(parser, 'restart'), 'unless-stopped');
  for (const forbidden of ['ports:', 'privileged', 'pid:', 'docker.sock', 'cap_add', 'SECRET', 'TOKEN', 'PASSWORD', 'DATABASE_URL', 'JWT', 'KEY']) {
    assert.ok(!code(parser).includes(forbidden), `the parser names ${forbidden}`);
  }
});

test('workspace-extract: no root entrypoint (it runs the parser loop itself), and its scratch is a tmpfs, not the root', () => {
  assert.equal(scalarOf(parser, 'entrypoint'), '["node", "/app/workspace-ingest/dist/parser-main.js"]');
  assert.deepEqual(listOf(parser, 'tmpfs'), ['/tmp:mode=1777,size=256m']);
  assert.match(code(parser), /^ {6}UV_CACHE_DIR: \/tmp\/uv-cache$/m);
  assert.match(code(parser), /^ {6}HOME: \/tmp$/m);
});

test('both services: one image name, mem_limit 1g, pids_limit 128', () => {
  for (const block of [worker, parser]) {
    assert.equal(scalarOf(block, 'image'), IMAGE);
    assert.equal(scalarOf(block, 'mem_limit'), '1g');
    assert.equal(scalarOf(block, 'pids_limit'), '128');
  }
});

test('the exchange volume is tmpfs, 96 MB, and no service but these two mounts it', () => {
  const entry = /\n {2}ingest-exchange:\n((?: {4}.*\n| {6}.*\n)+)/.exec(`${volumesBlock}\n`)?.[1] ?? '';
  const options = code(entry);
  assert.match(options, /^ {4}driver: local$/m);
  assert.match(options, /^ {6}type: tmpfs$/m);
  assert.match(options, /^ {6}device: tmpfs$/m);
  assert.match(options, /^ {6}o: "size=96m,/m);
  const mounters = [...compose.matchAll(/\n {2}([a-z][a-z0-9-]*):\n/g)]
    .map((m) => m[1])
    .filter((name) => {
      const block = code(service(name));
      return block.includes(`${VOLUME}:`) && /\n {4}volumes:\n/.test(block);
    })
    .sort();
  assert.deepEqual(mounters, ['workspace-extract', 'workspace-ingest']);
});

test('the exchange mode lets node remove what extract wrote: a shared group, mode 0770, no sticky bit', () => {
  const options = /o: "([^"]+)"/.exec(volumesBlock.slice(volumesBlock.indexOf('ingest-exchange:')))?.[1] ?? '';
  const parts = Object.fromEntries(options.split(',').map((part) => part.split('=')));
  assert.equal(parts.size, '96m');
  assert.equal(parts.gid, EXCHANGE_GID, 'the volume belongs to the shared group');
  assert.equal(parts.mode, '0770', 'the group can write, and a plain 1777 (sticky) would stop node removing extract\'s file');
  assert.ok(!parts.mode.startsWith('1'), 'no sticky bit');
  // The image makes the same folder, the group, and puts both users in it.
  assert.match(dockerfile, new RegExp(`groupadd --gid ${EXCHANGE_GID} exchange`));
  assert.match(dockerfile, new RegExp(`useradd --uid ${EXCHANGE_GID} --gid ${EXCHANGE_GID} .* extract`));
  assert.match(dockerfile, /usermod --append --groups exchange node/);
  assert.match(dockerfile, /install -d -m 0770 -o root -g exchange \/exchange/);
  // The worker takes node's groups from /etc/group when it drops privileges.
  assert.match(read('docker/workspace-ingest/entrypoint.sh'), /setpriv --reuid node --regid node --init-groups --inh-caps=-all --bounding-set=-all "\$@"/);
});

test('in neither block is the login, the model, the service key or the model API named', () => {
  for (const block of [worker, parser]) {
    for (const forbidden of ['bb-profile', 'course-files', 'claude_oauth_token', 'bb2dash_mcp_service_key', 'api.anthropic.com', 'harness_database_url', 'workspace_runner_db_url']) {
      assert.ok(!code(block).includes(forbidden), `a block names ${forbidden}`);
    }
  }
  assert.doesNotMatch(dockerfile, /claude-code|ANTHROPIC|bb2dash_mcp_service_key|claude_oauth_token/);
});

test('the ingest-net network is the worker\'s alone', () => {
  assert.match(compose, /\nnetworks:\n(?:.*\n)*? {2}ingest-net:\n/);
  const users = [...compose.matchAll(/\n {2}([a-z][a-z0-9-]*):\n/g)].map((m) => m[1]).filter((name) => {
    try {
      return code(service(name)).includes('ingest-net');
    } catch {
      return false;
    }
  });
  assert.deepEqual(users.filter((name) => !['ingest-net'].includes(name)), ['workspace-ingest']);
});

test('the firewall is the Workspace script with the listed literals changed, and nothing else', () => {
  const generated = forkFirewall(fs.readFileSync(SOURCE, 'utf8'));
  assert.equal(fs.readFileSync(TARGET, 'utf8').replace(/\r\n/g, '\n'), generated, 'run: node docker/workspace-ingest/fork-firewall.mjs --write');
  assert.equal(SUBSTITUTIONS.length, 8);
  // tcp/443 to the project host only, tcp/5432 to the pooler of the one secret; not the model API.
  assert.match(generated, /readonly -a HTTPS_HOSTS=\(\n {2}"goultdzqcavefcgnifdy\.supabase\.co"\n\)\n/);
  assert.match(generated, /readonly -a DSN_SECRETS=\(\n {2}"workspace_ingest_db_url"\n\)\n/);
  assert.match(generated, /readonly ALLOWED_PROBE=https:\/\/goultdzqcavefcgnifdy\.supabase\.co\n/);
  assert.match(generated, /readonly HTTPS_PORT=443\n/);
  assert.match(generated, /readonly POSTGRES_PORT=5432\n/);
  const live = generated.split('\n').filter((line) => !line.trim().startsWith('#')).join('\n');
  assert.ok(!live.includes('api.anthropic.com'), 'no live line of the script names the model API');
  assert.ok(!live.includes('harness_database_url') && !live.includes('workspace_runner_db_url'));
});

test('a literal that moved in the Workspace script stops the fork instead of dropping a rule', () => {
  const source = fs.readFileSync(SOURCE, 'utf8');
  assert.throws(() => forkFirewall(source.replace('readonly HTTPS_SET=workspace-https', 'readonly HTTPS_SET=renamed')), /the HTTPS set occurs 0 times/);
  assert.throws(() => forkFirewall(source.replace('"api.anthropic.com"', '"api.anthropic.com"\n  "extra.example"')), /the HTTPS names occurs 0 times/);
  assert.throws(() => forkFirewall(`${source}\nreadonly ALLOWED_PROBE=https://api.anthropic.com\n`), /the allowed probe occurs 2 times/);
});

test('the layout the services run is the layout the image builds', () => {
  const build = JSON.parse(read('workspace-ingest/package.json')).scripts.build;
  for (const entry of ['src/main.ts', 'src/parser-main.ts', 'src/healthcheck.ts']) {
    assert.ok(build.includes(entry), `the bundle has the entry ${entry}`);
    assert.ok(fs.existsSync(path.join(REPO, 'workspace-ingest', entry)), `workspace-ingest/${entry}`);
  }
  assert.ok(dockerfile.includes('COPY --from=build /build/workspace-ingest/dist workspace-ingest/dist'));
  assert.ok(dockerfile.includes('CMD ["node", "/app/workspace-ingest/dist/main.js"]'));
  assert.ok(dockerfile.includes('ENTRYPOINT ["/app/docker/workspace-ingest/entrypoint.sh"]'));
  // The paths the code names are the paths the image makes.
  const constants = read('workspace-ingest/src/constants.ts');
  assert.match(constants, /EXCHANGE_DIR = '\/exchange'/);
  assert.match(constants, /INGEST_DIR = '\/app\/ingest'/);
  const config = read('workspace-ingest/src/config.ts');
  for (const literal of ['/run/secrets/workspace_ingest_db_url', '/run/secrets/supabase_anon_jwt', '/run/ingest/alive']) {
    assert.ok(config.includes(literal), `config.ts names ${literal}`);
  }
  assert.ok(read('docker/workspace-ingest/entrypoint.sh').includes('readonly RUN_DIR=/run/ingest\n'));
  assert.ok(read('docker/workspace-ingest/entrypoint.sh').includes('readonly FIREWALL=/app/docker/workspace-ingest/init-firewall.sh\n'));
  assert.ok(dockerfile.includes('uv sync --locked --project /app/ingest'));
  assert.ok(/poppler-utils/.test(dockerfile), 'pdftotext is in the image');
});

test('no secret is a build argument or a variable, and no process is started by a USER line', () => {
  assert.doesNotMatch(dockerfile, /^(ARG|ENV)\s+\S*(TOKEN|SECRET|PASSWORD|KEY|DATABASE_URL)/m);
  assert.ok(!/^USER\s/m.test(dockerfile), 'the entrypoint drops privileges; compose sets the parser\'s user');
  assert.match(dockerfile, /COPY --from=harness-certs prod-ca\.crt \/app\/certs\/prod-ca\.crt\nRUN chmod 0444 \/app\/certs\/prod-ca\.crt/);
});

test('the build context is an allow-list of what the Dockerfile copies', () => {
  const lines = read('docker/workspace-ingest/Dockerfile.dockerignore').split('\n').filter((line) => line && !line.startsWith('#'));
  const sources = [...dockerfile.matchAll(/^COPY (?!--from)(.+) \S+$/gm)].flatMap((match) => match[1].trim().split(/\s+/));
  const allowed = lines.filter((line) => line.startsWith('!')).map((line) => line.slice(1));
  for (const source of sources) {
    assert.ok(allowed.some((prefix) => `${source}/`.startsWith(prefix) || source === prefix), `the Dockerfile copies ${source}, which the allow-list does not send`);
  }
  assert.ok(lines.includes('*') && lines[0] === '*');
  for (const kept of ['**/node_modules', '**/.venv', '**/.env', '**/.env.*']) assert.ok(lines.includes(kept), `${kept} stays out`);
});

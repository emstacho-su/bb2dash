// bb2dash :: docker/workspace/init-firewall.test.mjs
//
//   node --test docker/workspace/init-firewall.test.mjs        (on Windows: from Git Bash)
//
// A dry run of docker/workspace/init-firewall.sh (brief 102 task 12; 102a, PM rulings T1) against fake
// iptables, ip6tables, iptables-save, ipset, dig and curl that only log what they were asked. Each
// test copies the script into a scratch folder with its five place constants and its PATH line pointed
// at that folder, runs it with a real bash, and reads the log back.
//
// What this proves: the script's own logic. Which rules it asks for and in what order, what a
// connection to a given address and port would meet under those rules (a small model of the OUTPUT
// chain, below), every path that must end at deny-all, and what is printed.
// What it does not prove: anything about netfilter, Docker's resolver or the real hosts. Those are
// task 12's container checks.
//
// The image never copies this file (the Dockerfile copies named files only).

import { after, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(HERE, 'init-firewall.sh');
const SOURCE = fs.readFileSync(SCRIPT, 'utf8');

const PIN_MARK = '# pinned by init-firewall.sh';
const DENY_ALL_LINE = 'Firewall left at deny-all except loopback';
const EX_ALREADY_RAISED = 75;
const HTTPS_SET = 'workspace-https';
const POSTGRES_SET = 'workspace-postgres';

const API = 'api.anthropic.com';
const PROJECT = 'goultdzqcavefcgnifdy.supabase.co';
const POOLER = 'aws-0-us-east-1.pooler.supabase.com';
const OTHER_POOLER = 'aws-1-us-east-1.pooler.supabase.com';
const API_ADDRESS = '160.79.104.10';
const PROJECT_ADDRESSES = Object.freeze(['104.18.38.10', '172.64.149.246']);
const POOLER_ADDRESS = '44.216.29.125';
const OTHER_POOLER_ADDRESS = '52.45.94.125';
const RESOLVER = '127.0.0.11';
/** A public address no rule names, the container's gateway and Docker Desktop's host address. */
const STRANGER = '1.1.1.1';
const GATEWAY = '172.20.0.1';
const DOCKER_HOST = '192.168.65.254';

/** Fake values only. The user and the password are words no log line may ever hold. */
const FAKE_USER = 'role.ref';
const FAKE_PASSWORD = 'FAKEpw';
const dsn = (host, tail = ':5432/postgres?sslmode=require') => `postgresql://${FAKE_USER}:${FAKE_PASSWORD}@${host}${tail}`;

// --- a real bash, and paths it can read -------------------------------------------------------------

/** On Windows: Git for Windows' bash, never the bash.exe under the Windows folder (WSL's launcher). */
function findBash() {
  if (process.platform !== 'win32') return 'bash';
  const windows = (process.env.SystemRoot ?? '').toLowerCase();
  for (const dir of (process.env.PATH ?? '').split(path.delimiter).filter(Boolean)) {
    const lower = dir.toLowerCase();
    if ((windows && lower.startsWith(windows)) || lower.includes('windowsapps')) continue;
    // Git Bash has bash.exe on PATH; PowerShell has git.exe (Git/cmd), with bash.exe in Git/bin beside it.
    const candidates = [path.join(dir, 'bash.exe'), ...(fs.existsSync(path.join(dir, 'git.exe')) ? [path.join(dir, '..', 'bin', 'bash.exe')] : [])];
    const found = candidates.find((candidate) => fs.existsSync(candidate));
    if (found) return found;
  }
  throw new Error('no Git Bash on PATH: run this file from Git Bash');
}

const BASH = findBash();
const toBashPath = (file) =>
  process.platform === 'win32' ? file.replace(/^([A-Za-z]):/, (_, drive) => `/${drive.toLowerCase()}`).replaceAll('\\', '/') : file;

// --- the fake tools ---------------------------------------------------------------------------------

/**
 * The body of each fake, as a shell function's: it logs its arguments to $W/calls.log ($W is the
 * scratch world of the run in hand) and returns what the test asked for. Each fake exists twice
 * with this one body: as a function the script's shell is given (no process per call, which is
 * what makes a run slow on Windows), and as a program on PATH for the one call made through xargs.
 */
const FAKE_TOOLS = Object.freeze({
  iptables: 'echo "iptables $*" >>"$W/calls.log"; if [ -n "${FAIL_IPTABLES:-}" ] && [[ "$*" == $FAIL_IPTABLES ]]; then return 4; fi; return 0',
  ip6tables: 'echo "ip6tables $*" >>"$W/calls.log"; [ "${IP6TABLES_WORKS:-1}" = 1 ] || return 3; return 0',
  // Docker's DNS redirect as iptables-save prints it, and one rule that is not Docker's.
  'iptables-save':
    'echo "iptables-save $*" >>"$W/calls.log"; printf "%s\\n" "-A OUTPUT -d 127.0.0.11/32 -j DOCKER_OUTPUT" "-A DOCKER_OUTPUT -d 127.0.0.11/32 -p udp -m udp --dport 53 -j DNAT --to-destination 127.0.0.11:40001" "-A POSTROUTING -d 10.9.9.9/32 -j MASQUERADE"',
  ipset: 'echo "ipset $*" >>"$W/calls.log"; return 0',
  // Answers from $W/dns/<name>, one address a line; no file, no answer.
  dig: 'local name="${@: -1}" a; echo "dig $*" >>"$W/calls.log"; [ -f "$W/dns/$name" ] || return 0; while read -r a; do printf "%s.\\t60\\tIN\\tA\\t%s\\n" "$name" "$a"; done <"$W/dns/$name"',
  curl: 'local url="${@: -1}"; echo "curl $*" >>"$W/calls.log"; case "$url" in *example.com*) return "${CURL_DENIED_EXIT:-7}";; *) return "${CURL_ALLOWED_EXIT:-0}";; esac',
});
// The script sets IFS to newline and tab; a fake joins its arguments with spaces whoever calls it.
const fakeFunction = (name) => `${name}() {\n  local IFS=' '\n  ${FAKE_TOOLS[name]}\n}\n`;
const FAKE_FUNCTIONS = Object.keys(FAKE_TOOLS).map(fakeFunction).join('');
const fakeProgram = (name) => `#!/bin/bash\n${fakeFunction(name)}${name} "$@"\n`;

/** The script's constants that name a place in the container, and where each points in a scratch world. */
const REDIRECTED = Object.freeze({
  FIREWALL_RUN_MARKER: 'shm/up',
  RESOLV_CONF: 'resolv.conf',
  HOSTS_FILE: 'hosts',
  SECRETS_DIR: 'secrets',
  INET6_ADDRESSES: 'if_inet6',
});

/**
 * The script with its place constants rewritten and, where it sets its PATH, the fakes put in
 * front of the real tools and read in as functions. A constant that moved fails here.
 */
function redirectedScript(worldDir) {
  let text = SOURCE;
  const swap = (pattern, line) => {
    assert.equal(text.match(new RegExp(pattern.source, 'gm'))?.length, 1, `exactly one line matches ${pattern}`);
    text = text.replace(pattern, () => line);
  };
  swap(/^export PATH=.*$/m, `export PATH="${worldDir}/bin:$PATH"\nsource '${worldDir}/fakes.sh'`);
  for (const [name, relative] of Object.entries(REDIRECTED)) swap(new RegExp(`^readonly ${name}=.*$`, 'm'), `readonly ${name}='${worldDir}/${relative}'`);
  return text;
}

const BASE_WORLD = Object.freeze({
  dns: { [API]: [API_ADDRESS], [PROJECT]: PROJECT_ADDRESSES, [POOLER]: [POOLER_ADDRESS] },
  // The second file as a Windows editor leaves it: a byte-order mark and CRLF.
  secrets: { workspace_runner_db_url: dsn(POOLER), harness_database_url: `\uFEFF${dsn(POOLER)}\r\n` },
  hosts: '127.0.0.1 localhost\n172.20.0.2 abc123\n',
  resolvConf: `nameserver ${RESOLVER}\noptions ndots:0\n`,
  inet6: '00000000000000000000000000000001 01 80 10 80       lo\n',
});

/** Every scratch folder a test made, so the suite can take them away when it ends. */
const scratchDirs = [];
function scratchDir(prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  scratchDirs.push(dir);
  return dir;
}

/** A scratch container: its files, the fake tools and the redirected script. `null` leaves a file out. */
function makeWorld({ dns = {}, secrets = {}, hosts = BASE_WORLD.hosts, resolvConf = BASE_WORLD.resolvConf, inet6 = BASE_WORLD.inet6 } = {}) {
  const dir = scratchDir('init-firewall-test-');
  for (const sub of ['bin', 'dns', 'secrets', 'shm']) fs.mkdirSync(path.join(dir, sub));
  for (const name of Object.keys(FAKE_TOOLS)) fs.writeFileSync(path.join(dir, 'bin', name), fakeProgram(name), { mode: 0o755 });
  fs.writeFileSync(path.join(dir, 'fakes.sh'), FAKE_FUNCTIONS);
  for (const [name, answers] of Object.entries({ ...BASE_WORLD.dns, ...dns })) {
    if (answers !== null) fs.writeFileSync(path.join(dir, 'dns', name), answers.map((answer) => `${answer}\n`).join(''));
  }
  for (const [name, value] of Object.entries({ ...BASE_WORLD.secrets, ...secrets })) {
    if (value !== null) fs.writeFileSync(path.join(dir, 'secrets', name), value);
  }
  fs.writeFileSync(path.join(dir, 'hosts'), hosts);
  fs.writeFileSync(path.join(dir, 'resolv.conf'), resolvConf);
  if (inet6 !== null) fs.writeFileSync(path.join(dir, 'if_inet6'), inet6);
  fs.writeFileSync(path.join(dir, 'calls.log'), '');
  const bashDir = toBashPath(dir);
  fs.writeFileSync(path.join(dir, 'init-firewall.sh'), redirectedScript(bashDir));
  return { dir, bashDir };
}

const linesOf = (file) => fs.readFileSync(file, 'utf8').split('\n').filter(Boolean);

/** bash with these arguments: its exit code and all it printed (stdout and stderr together). */
function runBash(args, env = process.env) {
  return new Promise((resolve, reject) => {
    const child = spawn(BASH, args, { env, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    for (const stream of [child.stdout, child.stderr]) stream.setEncoding('utf8').on('data', (chunk) => (out += chunk));
    child.on('error', (err) => reject(new Error(`bash could not be started: ${err.message}`)));
    child.on('close', (status) => resolve({ status, out }));
  });
}

/** One run of the script in a world: its exit code, all it printed, every tool call so far, /etc/hosts after. */
async function raise(world, env = {}) {
  const { status, out } = await runBash([`${world.bashDir}/init-firewall.sh`], { ...process.env, W: world.bashDir, ...env });
  return {
    status,
    out,
    calls: linesOf(path.join(world.dir, 'calls.log')),
    hosts: fs.readFileSync(path.join(world.dir, 'hosts'), 'utf8'),
  };
}

// --- a model of the OUTPUT chain ----------------------------------------------------------------------

const RULE_FLAGS = Object.freeze({ '-o': 'out', '-p': 'proto', '-d': 'dest', '--dport': 'port', '--state': 'state', '-j': 'target', '--reject-with': 'rejectWith' });

/** One `iptables -A OUTPUT …` as a record. A flag the model does not know fails: a new rule shape is modelled on purpose. */
function parseRule(words) {
  const rule = { text: words.join(' ') };
  for (let at = 0; at < words.length; at += 1) {
    const flag = words[at];
    if (flag === '-m') {
      at += 1; // the module's name; its options follow as flags of their own
    } else if (flag === '--match-set') {
      assert.equal(words[at + 2], 'dst', `a set is matched on the destination: ${rule.text}`);
      rule.set = words[at + 1];
      at += 2;
    } else {
      assert.ok(RULE_FLAGS[flag], `the model does not know ${flag} in: ${rule.text}`);
      rule[RULE_FLAGS[flag]] = words[at + 1];
      at += 1;
    }
  }
  return rule;
}

/** The filter table's OUTPUT chain, its policy and the sets, rebuilt from the tool calls in order. */
function outputChain(calls) {
  const sets = new Map();
  let rules = [];
  let policy = 'ACCEPT';
  for (const call of calls) {
    const [tool, ...args] = call.split(' ');
    if (tool === 'ipset' && args[0] === 'create') sets.set(args[1], new Set());
    if (tool === 'ipset' && args[0] === 'destroy') sets.delete(args[1]);
    if (tool === 'ipset' && args[0] === 'add') {
      const [name, address] = args.slice(-2);
      assert.ok(sets.has(name), `ipset add to ${name}, which was never created`);
      sets.get(name).add(address);
    }
    if (tool !== 'iptables' || args[0] === '-t') continue; // the nat and mangle tables are not the filter
    if (args[0] === '-F') rules = [];
    if (args[0] === '-P' && args[1] === 'OUTPUT') policy = args[2];
    if (args[0] === '-A' && args[1] === 'OUTPUT') rules.push(parseRule(args.slice(2)));
  }
  return { sets, rules, policy };
}

function ruleMatches(rule, probe, sets) {
  if (rule.out !== undefined && !(rule.out === 'lo' && probe.address.startsWith('127.'))) return false;
  if (rule.proto !== undefined && rule.proto !== probe.proto) return false;
  if (rule.dest !== undefined && rule.dest !== probe.address) return false;
  if (rule.port !== undefined && rule.port !== String(probe.port)) return false;
  if (rule.set !== undefined && !sets.get(rule.set)?.has(probe.address)) return false;
  if (rule.state !== undefined) return false; // a probe is a new connection, never an established one
  return true;
}

/** What a new connection to `address` on `proto`/`port` meets: 'open' or 'blocked'. */
function verdict(chain, address, proto, port) {
  const hit = chain.rules.find((rule) => ruleMatches(rule, { address, proto, port }, chain.sets));
  return (hit ? hit.target : chain.policy) === 'ACCEPT' ? 'open' : 'blocked';
}

// --- what every test reads the same way ---------------------------------------------------------------

const pinsOf = (hosts) => hosts.split('\n').filter((line) => line.endsWith(PIN_MARK));
const lookups = (calls) => calls.filter((call) => call.startsWith('dig '));

/** No part of a connection string in the log: not its password, not its user. */
function assertNoSecret(out) {
  assert.doesNotMatch(out, new RegExp(FAKE_PASSWORD), 'the password is in the log');
  assert.doesNotMatch(out, new RegExp(FAKE_USER.replace('.', '\\.')), 'the user is in the log');
  assert.doesNotMatch(out, /postgres(ql)?:\/\/\S/, 'a connection string is in the log');
}

/** A start that failed: a non-zero exit, and nothing left but loopback. */
function assertDenyAll(run, status = 1) {
  assert.equal(run.status, status, run.out);
  assert.ok(run.out.includes(DENY_ALL_LINE), run.out);
  const chain = outputChain(run.calls);
  assert.equal(chain.policy, 'DROP');
  assert.deepEqual(chain.rules.map((rule) => rule.text), ['-o lo -j ACCEPT']);
  for (const address of [API_ADDRESS, POOLER_ADDRESS, STRANGER, GATEWAY]) assert.equal(verdict(chain, address, 'tcp', 443), 'blocked');
  assertNoSecret(run.out);
}

const lazy = (make) => {
  let made;
  return () => (made ??= make());
};
/** The start every rule test reads: three names, both database secrets on one pooler. */
const happy = lazy(() => raise(makeWorld()));

// --- the tests ----------------------------------------------------------------------------------------

// Side by side: each run starts some fifty short processes, which is slow one after another on Windows.
describe('docker/workspace/init-firewall.sh, dry run against fake tools', { concurrency: true }, () => {
  after(() => {
    for (const dir of scratchDirs) fs.rmSync(dir, { recursive: true, force: true });
  });

  test('a start that works: one lookup a name, every address pinned, nothing of a connection string printed', async () => {
    const run = await happy();
    assert.equal(run.status, 0, run.out);
    assert.equal(run.out.includes(DENY_ALL_LINE), false);
    assert.deepEqual(lookups(run.calls).map((call) => call.split(' ').at(-1)), [API, PROJECT, POOLER]);
    assert.deepEqual(pinsOf(run.hosts), [
      `${API_ADDRESS} ${API} ${PIN_MARK}`,
      ...PROJECT_ADDRESSES.map((address) => `${address} ${PROJECT} ${PIN_MARK}`),
      `${POOLER_ADDRESS} ${POOLER} ${PIN_MARK}`,
    ]);
    assert.match(run.hosts, /^127\.0\.0\.1 localhost$/m);
    assert.match(run.out, /Firewall raised: 3 name\(s\) allowed/);
    assertNoSecret(run.out);
  });

  test('the port rule (T1 c): tcp/443 to the two HTTPS names, tcp/5432 to the pooler, and no rule without a port', async () => {
    const chain = outputChain((await happy()).calls);
    assert.equal(chain.policy, 'DROP');
    assert.deepEqual(chain.rules.map((rule) => rule.text), [
      '-o lo -j ACCEPT',
      `-p udp -d ${RESOLVER} --dport 53 -j ACCEPT`,
      `-p tcp -d ${RESOLVER} --dport 53 -j ACCEPT`,
      '-m state --state ESTABLISHED,RELATED -j ACCEPT',
      `-p tcp --dport 443 -m set --match-set ${HTTPS_SET} dst -j ACCEPT`,
      `-p tcp --dport 5432 -m set --match-set ${POSTGRES_SET} dst -j ACCEPT`,
      '-j REJECT --reject-with icmp-admin-prohibited',
    ]);
    for (const rule of chain.rules.filter((each) => each.set !== undefined)) {
      assert.equal(rule.proto, 'tcp', rule.text);
      assert.ok(rule.port, `a set is never allowed on every port: ${rule.text}`);
    }
    assert.deepEqual([...chain.sets.keys()].sort(), [HTTPS_SET, POSTGRES_SET]);
    assert.deepEqual([...chain.sets.get(HTTPS_SET)].sort(), [API_ADDRESS, ...PROJECT_ADDRESSES].sort());
    assert.deepEqual([...chain.sets.get(POSTGRES_SET)], [POOLER_ADDRESS]);
  });

  test('by literal address: an allowed address answers on its own port only, and no other address on any', async () => {
    const chain = outputChain((await happy()).calls);
    const cases = [
      [API_ADDRESS, 'tcp', 443, 'open'],
      [PROJECT_ADDRESSES[0], 'tcp', 443, 'open'],
      [PROJECT_ADDRESSES[1], 'tcp', 443, 'open'],
      [POOLER_ADDRESS, 'tcp', 5432, 'open'],
      // An allowed address on a port that is not allowed.
      [API_ADDRESS, 'tcp', 80, 'blocked'],
      [API_ADDRESS, 'tcp', 5432, 'blocked'],
      [PROJECT_ADDRESSES[0], 'tcp', 80, 'blocked'],
      [PROJECT_ADDRESSES[0], 'tcp', 8443, 'blocked'],
      [POOLER_ADDRESS, 'tcp', 443, 'blocked'],
      [POOLER_ADDRESS, 'tcp', 6543, 'blocked'],
      // tcp only: not QUIC, not a stray datagram.
      [API_ADDRESS, 'udp', 443, 'blocked'],
      [POOLER_ADDRESS, 'udp', 5432, 'blocked'],
      // A public address that is not allowed, on the allowed ports.
      [STRANGER, 'tcp', 443, 'blocked'],
      [STRANGER, 'tcp', 5432, 'blocked'],
      [STRANGER, 'udp', 53, 'blocked'],
    ];
    for (const [address, proto, port, want] of cases) assert.equal(verdict(chain, address, proto, port), want, `${address} ${proto}/${port}`);
  });

  test("DNS may go only to the resolvers in /etc/resolv.conf, and a resolver's address opens nothing else", async () => {
    const second = '192.168.65.7';
    const run = await raise(makeWorld({ resolvConf: `nameserver ${RESOLVER}\nnameserver ${second}\nnameserver fe80::1\nsearch example.org\n` }));
    assert.equal(run.status, 0, run.out);
    const chain = outputChain(run.calls);
    const dnsRules = chain.rules.filter((rule) => rule.port === '53').map((rule) => rule.text);
    assert.deepEqual(dnsRules, [RESOLVER, second].flatMap((resolver) => ['udp', 'tcp'].map((proto) => `-p ${proto} -d ${resolver} --dport 53 -j ACCEPT`)));
    assert.equal(verdict(chain, second, 'udp', 53), 'open');
    assert.equal(verdict(chain, second, 'tcp', 443), 'blocked');
    assert.equal(verdict(chain, '8.8.8.8', 'udp', 53), 'blocked');
    assert.equal(verdict(chain, '8.8.8.8', 'tcp', 53), 'blocked');
  });

  test('no rule opens the Docker network: the gateway and the Docker host are refused like any other address', async () => {
    const chain = outputChain((await happy()).calls);
    for (const address of [GATEWAY, DOCKER_HOST, '172.20.0.3']) {
      for (const port of [6080, 443, 5432, 80]) assert.equal(verdict(chain, address, 'tcp', port), 'blocked', `${address}:${port}`);
    }
    for (const rule of chain.rules) assert.equal(String(rule.dest ?? '').includes('/'), false, `no rule names a network: ${rule.text}`);
  });

  test('a second run in the same container is refused before it changes anything', async () => {
    const world = makeWorld();
    const first = await raise(world);
    assert.equal(first.status, 0, first.out);
    const second = await raise(world);
    assert.equal(second.status, EX_ALREADY_RAISED, second.out);
    assert.match(second.out, /a second run is refused; restart the container/);
    assert.deepEqual(second.calls, first.calls, 'the second run called no tool');
    assert.equal(second.hosts, first.hosts);
  });

  test('a database secret that is not a pooler URL stops the start at deny-all, and nothing of it is printed', async () => {
    const cases = [
      ['a host that is not a pooler', { workspace_runner_db_url: dsn('db.goultdzqcavefcgnifdy.supabase.co') }, /workspace_runner_db_url: its host does not end \.pooler\.supabase\.com/],
      ['an unencoded / in the password', { harness_database_url: `postgresql://${FAKE_USER}:${FAKE_PASSWORD}/x@${POOLER}:5432/postgres` }, /harness_database_url: its host does not end/],
      ['a missing file', { harness_database_url: null }, /harness_database_url: the secret file is missing or not readable/],
      ['a file holding only a byte-order mark and CRLF', { workspace_runner_db_url: '\uFEFF\r\n' }, /workspace_runner_db_url: the secret file is empty/],
    ];
    for (const [label, secrets, sentence] of cases) {
      const run = await raise(makeWorld({ secrets }));
      assertDenyAll(run);
      assert.match(run.out, sentence, label);
      assert.equal(run.calls.filter((call) => call.startsWith('ipset create')).length, 0, `${label}: no set is made`);
      assert.equal(lookups(run.calls).length, 0, `${label}: no name is looked up`);
      assert.doesNotMatch(run.out, /db\.goultdzqcavefcgnifdy/, `${label}: the refused host is not printed`);
    }
  });

  test('a database secret on a port other than 5432 stops the start at deny-all, and nothing of it is printed (U2)', async () => {
    const cases = [
      ['the transaction pooler', { workspace_runner_db_url: dsn(POOLER, ':6543/postgres?sslmode=require') }, /workspace_runner_db_url: its port is not 5432/],
      ['another port on the harness secret', { harness_database_url: dsn(POOLER, ':15439/postgres') }, /harness_database_url: its port is not 5432/],
      ['a colon and no port', { workspace_runner_db_url: dsn(POOLER, ':/postgres') }, /workspace_runner_db_url: its port is not 5432/],
    ];
    for (const [label, secrets, sentence] of cases) {
      const run = await raise(makeWorld({ secrets }));
      assertDenyAll(run);
      assert.match(run.out, sentence, label);
      assert.equal(run.calls.filter((call) => call.startsWith('ipset create')).length, 0, `${label}: no set is made`);
      assert.equal(lookups(run.calls).length, 0, `${label}: no name is looked up`);
      assert.doesNotMatch(run.out, /6543|15439/, `${label}: the refused port is not printed`);
      assert.equal(run.out.includes(POOLER), false, `${label}: the host of a refused secret is not printed`);
    }
  });

  test('the header says what a start prints, and a start prints no more: names and the resolver, never an address of an allowed host (U2)', async () => {
    const header = SOURCE.slice(0, SOURCE.indexOf('set -euo pipefail'));
    assert.match(header, /^# What it prints/m, 'the header has its "What it prints" paragraph');
    assert.match(header, /^# It never prints a user, a password, a connection string or any part of one, or the address of an\n# allowed host\.$/m);

    const run = await happy();
    for (const name of [API, PROJECT, POOLER]) assert.ok(run.out.includes(name), `${name} is named in the log`);
    const addresses = new Set(run.out.match(/\b\d{1,3}(\.\d{1,3}){3}\b/g) ?? []);
    assert.deepEqual([...addresses], [RESOLVER], "the one address in the log is the resolver's");
    assertNoSecret(run.out);
  });

  test('a name that does not resolve stops the start at deny-all', async () => {
    assertDenyAll(await raise(makeWorld({ dns: { [API]: null } })));
    assertDenyAll(await raise(makeWorld({ dns: { [POOLER]: [] } })));
  });

  test('the end check: example.com reachable, or api.anthropic.com unreachable, stops the start at deny-all', async () => {
    const open = await raise(makeWorld(), { CURL_DENIED_EXIT: '0' });
    assertDenyAll(open);
    assert.match(open.out, /was able to reach https:\/\/example\.com/);
    const closed = await raise(makeWorld(), { CURL_ALLOWED_EXIT: '7' });
    assertDenyAll(closed);
    assert.match(closed.out, /unable to reach https:\/\/api\.anthropic\.com/);
  });

  test('IPv6 (T1 d): when ip6tables cannot set its rules, any IPv6 address off loopback stops the start', async () => {
    const loopback = BASE_WORLD.inet6;
    const linkLocal = 'fe800000000000000042acfffe140002 0b 40 20 80     eth0\n';
    const without = { IP6TABLES_WORKS: '0' };

    const closed = await happy();
    assert.match(closed.out, /IPv6 closed \(loopback only\)/);
    assert.deepEqual(
      closed.calls.filter((call) => call.startsWith('ip6tables ')).map((call) => call.slice('ip6tables '.length)),
      ['-F', '-X', '-P INPUT DROP', '-P FORWARD DROP', '-P OUTPUT DROP', '-A INPUT -i lo -j ACCEPT', '-A OUTPUT -o lo -j ACCEPT'],
    );

    assertDenyAll(await raise(makeWorld({ inet6: `${loopback}${linkLocal}` }), without));
    const loopbackOnly = await raise(makeWorld(), without);
    assert.equal(loopbackOnly.status, 0, loopbackOnly.out);
    assert.match(loopbackOnly.out, /No IPv6 here \(ip6tables unavailable and no IPv6 address off loopback\)/);
    const absent = await raise(makeWorld({ inet6: null }), without);
    assert.equal(absent.status, 0, absent.out);
    assert.match(absent.out, /No IPv6 here \(ip6tables unavailable and the kernel lists no IPv6 addresses\)/);
  });

  test('IPv6: a long list of addresses off loopback still stops the start (the read is not a pipe that can break)', async () => {
    // More than a pipe holds: a reader that stops at the first line would break the writer's pipe.
    const many = Array.from({ length: 20_000 }, (_, at) => `fe80000000000000004200fffe${String(at).padStart(6, '0')} 0b 40 20 80     eth0\n`).join('');
    const run = await raise(makeWorld({ inet6: `${BASE_WORLD.inet6}${many}` }), { IP6TABLES_WORKS: '0' });
    assertDenyAll(run);
    assert.match(run.out, /has an IPv6 address off loopback and ip6tables could not close it/);
  });

  test('no pipe in the script feeds a reader that stops early (under pipefail a broken pipe reads as a failure)', async () => {
    const earlyExitReader = /\|\s*(grep\s+(-\w*[qm]|--quiet|--max-count)|head\b|sed\s+-n?\s*['"]?\d+q)/;
    const code = SOURCE.split('\n').map((line) => line.trim()).filter((line) => !line.startsWith('#'));
    assert.ok(code.includes('set -euo pipefail'));
    assert.deepEqual(code.filter((line) => earlyExitReader.test(line)), []);
  });

  test('an answer that is not a public IPv4 address is never allowed (T1 b)', async () => {
    const onlyPrivate = await raise(makeWorld({ dns: { [API]: [DOCKER_HOST] } }));
    assertDenyAll(onlyPrivate);
    assert.equal(onlyPrivate.calls.filter((call) => call.startsWith('ipset add') && call.endsWith(DOCKER_HOST)).length, 0);

    const mixed = await raise(makeWorld({ dns: { [API]: ['10.0.0.5', API_ADDRESS, 'not-an-address', '127.0.0.1', '169.254.169.254', '100.64.0.1'] } }));
    assert.equal(mixed.status, 0, mixed.out);
    const chain = outputChain(mixed.calls);
    assert.deepEqual([...chain.sets.get(HTTPS_SET)].sort(), [API_ADDRESS, ...PROJECT_ADDRESSES].sort());
    assert.deepEqual(pinsOf(mixed.hosts).filter((line) => line.includes(` ${API} `)), [`${API_ADDRESS} ${API} ${PIN_MARK}`]);
  });

  test('every address of the one answer is allowed and pinned (T1 a), and a pin an earlier start left is taken out', async () => {
    const stale = `203.0.113.9 ${API} ${PIN_MARK}\n`;
    const run = await raise(makeWorld({ hosts: `${BASE_WORLD.hosts}${stale}` }));
    assert.equal(run.status, 0, run.out);
    assert.equal(run.hosts.includes('203.0.113.9'), false, 'the stale pin is gone');
    assert.match(run.hosts, /^127\.0\.0\.1 localhost$/m);
    assert.deepEqual(pinsOf(run.hosts).filter((line) => line.includes(` ${PROJECT} `)).length, PROJECT_ADDRESSES.length);
    assert.equal(pinsOf(run.hosts).length, 4);
  });

  test('a rule that cannot be added stops the start at deny-all with the failing command\'s own code', async () => {
    assertDenyAll(await raise(makeWorld(), { FAIL_IPTABLES: '-A OUTPUT -p tcp --dport 5432 -m set*' }), 4);
  });

  test('two database secrets on two poolers: both are allowed on 5432, neither on 443', async () => {
    const run = await raise(makeWorld({ secrets: { harness_database_url: dsn(OTHER_POOLER) }, dns: { [OTHER_POOLER]: [OTHER_POOLER_ADDRESS] } }));
    assert.equal(run.status, 0, run.out);
    assert.equal(lookups(run.calls).length, 4);
    assert.match(run.out, /Firewall raised: 4 name\(s\) allowed/);
    const chain = outputChain(run.calls);
    assert.deepEqual([...chain.sets.get(POSTGRES_SET)].sort(), [POOLER_ADDRESS, OTHER_POOLER_ADDRESS].sort());
    for (const address of [POOLER_ADDRESS, OTHER_POOLER_ADDRESS]) {
      assert.equal(verdict(chain, address, 'tcp', 5432), 'open');
      assert.equal(verdict(chain, address, 'tcp', 443), 'blocked');
    }
    assertNoSecret(run.out);
  });

  // --- the two pure functions, read into a shell (the script runs `main` only when executed) ------------

  /** Runs `body` once per line of `inputs` with the script's functions defined; one `status<TAB>stdout` line each. */
  async function eachLine(body, inputs) {
    const dir = scratchDir('init-firewall-fn-');
    fs.writeFileSync(path.join(dir, 'inputs'), inputs.map((input) => `${input}\n`).join(''));
    const driver = `source "$1"; set +e; cd "$2"; while IFS= read -r input; do ${body}; done <inputs`;
    const result = await runBash(['-c', driver, 'driver', toBashPath(SCRIPT), toBashPath(dir)]);
    assert.equal(result.status, 0, result.out);
    return result.out.split('\n').filter(Boolean).map((line) => line.split('\t'));
  }

  test('dsn_host: a pooler URL gives its host, anything else is refused with a fixed sentence', async () => {
    const user = `${FAKE_USER}:${FAKE_PASSWORD}`;
    const allowed = [
      [`postgresql://${user}@${POOLER}:5432/postgres?uselibpqcompat=true&sslmode=require`, POOLER],
      [`postgres://${user}@${OTHER_POOLER.toUpperCase()}:5432/postgres`, OTHER_POOLER],
      [`POSTGRESQL://${user}@${POOLER}/postgres`, POOLER],
      [`postgresql://${user}%40x@${POOLER}/postgres`, POOLER],
      [`postgresql://${user}@x@${POOLER}:5432/postgres`, POOLER],
      [`postgresql://${POOLER}/postgres`, POOLER],
    ];
    const refused = [
      `postgresql://${user}@evilpooler.supabase.com:5432/postgres`,
      `postgresql://${user}@${POOLER}.evil.example:5432/postgres`,
      `postgresql://${user}@pooler.supabase.com:5432/postgres`,
      `postgresql://${user}@db.goultdzqcavefcgnifdy.supabase.co:5432/postgres`,
      `postgresql://${user}@[2001:db8::1]:5432/postgres`,
      `postgresql://${user}@44.216.29.125:5432/postgres`,
      `postgresql://${user}@${POOLER}.:5432/postgres`,
      `postgresql://${user}@a_b.pooler.supabase.com:5432/postgres`,
      `postgresql://${user}@-a.pooler.supabase.com:5432/postgres`,
      `postgresql://${user}@evil.example/x@${POOLER}`,
      `postgresql://${user}@evil.example?x=@${POOLER}`,
      `postgresql://${user}@evil.example#@${POOLER}`,
      `postgresql://${user}@${POOLER}\\@evil.example/postgres`,
      `postgresql://${user}@evil.example:5432@/${POOLER}`,
      `mysql://${user}@${POOLER}/postgres`,
      POOLER,
      `postgresql://${user}@ ${POOLER}/postgres`,
      // A port that is not 5432 (U2): the transaction pooler's, a longer number, none after the colon, two.
      `postgresql://${user}@${POOLER}:6543/postgres`,
      `postgresql://${user}@${POOLER}:54329/postgres`,
      `postgresql://${user}@${POOLER}:05432/postgres`,
      `postgresql://${user}@${POOLER}:/postgres`,
      `postgresql://${user}@${POOLER}:5432:6543/postgres`,
      `postgresql://${POOLER}:6543`,
    ];
    const body = 'printf "%s" "$input" >dsn; got="$(dsn_host dsn)"; printf "%s\\t%s\\n" "$?" "$got"';
    const results = await eachLine(body, [...allowed.map(([url]) => url), ...refused]);
    assert.equal(results.length, allowed.length + refused.length);
    allowed.forEach(([url, host], at) => assert.deepEqual(results[at], ['0', host], url));
    refused.forEach((url, at) => {
      const [status, said] = results[allowed.length + at];
      assert.equal(status, '1', url);
      assert.ok(said.length > 0, `a refusal says why: ${url}`);
      assertNoSecret(said);
      assert.doesNotMatch(said, /evil|2001|44\.216|6543|54329|05432|aws-/, `a refusal prints no part of the URL: ${url}`);
    });
  });

  test('is_public_ipv4: loopback, private, carrier-grade NAT, link-local, multicast and reserved are not public', async () => {
    const publicOnes = [API_ADDRESS, POOLER_ADDRESS, '172.64.149.246', '172.15.0.1', '172.32.0.1', '100.63.0.1', '100.128.0.1', '8.8.8.8'];
    const internal = ['127.0.0.1', RESOLVER, '10.0.0.5', '172.16.0.1', GATEWAY, '172.31.255.254', DOCKER_HOST, '169.254.169.254', '100.64.0.1', '100.127.255.254', '0.0.0.0', '224.0.0.1', '255.255.255.255'];
    const body = 'is_public_ipv4 "$input"; printf "%s\\t%s\\n" "$?" "$input"';
    const results = await eachLine(body, [...publicOnes, ...internal]);
    assert.deepEqual(results, [...publicOnes.map((address) => ['0', address]), ...internal.map((address) => ['1', address])]);
  });
});

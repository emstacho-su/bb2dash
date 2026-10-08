// bb2dash :: scripts/walk-box-main.test.mjs
// The walk box's host script as a whole (brief 103, task 0): main() with docker and git injected.
// What is held here: the run folder and run.json before and after, the exit code, the kept box and
// --exec, and that no value of an env file or of the environment is passed, logged or recorded.
//
// One part of the walk box's host tests. scripts/walk-box.test.mjs reads this file in, so the one
// command runs all of them:
//
//   node --test scripts/walk-box.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { Writable } from 'node:stream';

import { DOCKER_CLIENT, EXIT, WALK_IMAGE, main, runDocker } from './walk-box.mjs';
import {
  COMMIT,
  CONTAINER,
  LATER,
  LATER_RUN_ID,
  NOW,
  REPO_ROOT,
  RUN_ID,
  SECRET_KEY,
  SECRET_PASSWORD,
  SECRET_SHARE,
  fixture,
  posix,
  scratch,
  write,
} from './walk-box-kit.mjs';

/* ---------------------------------------------------------------------------------------------
 * main(): the run folder, run.json, the exit code
 * ------------------------------------------------------------------------------------------ */

/** main()'s dependencies, with docker and git recorded instead of run. */
function harness(f, { exits = [0], dirty = false, times = [NOW, LATER] } = {}) {
  const seen = { docker: [], logged: [], errors: [], records: [] };
  let call = 0;
  let tick = 0;
  const deps = {
    root: f.root,
    cwd: f.cwd,
    env: f.env,
    home: f.home,
    now: () => times[Math.min(tick++, times.length - 1)],
    git: (args) => {
      if (args[0] === 'rev-parse') return `${COMMIT}\n`;
      if (args[0] === 'status') return dirty ? ' M web/e2e/harness.spec.ts\n' : '';
      throw new Error(`unexpected git ${args.join(' ')}`);
    },
    docker: async (argv, options) => {
      const runJson = options.logFile ? path.join(path.dirname(options.logFile), 'run.json') : null;
      seen.docker.push({ argv, options });
      if (runJson) seen.records.push(JSON.parse(fs.readFileSync(runJson, 'utf8')));
      return exits[Math.min(call++, exits.length - 1)];
    },
    log: (line) => seen.logged.push(line),
    err: (line) => seen.errors.push(line),
  };
  return { deps, seen };
}

test('main: a run makes its folder, writes run.json before and after, and ends with docker\'s exit code', async () => {
  const f = fixture();
  const { deps, seen } = harness(f);
  const code = await main(['web/e2e/harness.spec.ts', '--', '-g', 'signed in'], deps);
  const outDir = path.join(f.outBase, RUN_ID);
  assert.equal(code, 0);
  assert.equal(seen.docker.length, 1);
  assert.equal(seen.docker[0].options.logFile, path.join(outDir, 'stdout.log'));
  // What docker saw while it ran: the run is on record before the container starts.
  assert.deepEqual(seen.records[0], {
    schema: 1,
    run_id: RUN_ID,
    command: 'run',
    container: CONTAINER,
    kept: false,
    mode: 'build',
    base_url: 'http://localhost:3000',
    image: WALK_IMAGE,
    worktree: posix(f.root),
    commit: COMMIT,
    dirty: false,
    specs: ['web/e2e/harness.spec.ts'],
    args: ['-g', 'signed in'],
    shots: false,
    started_at: '2026-10-08T05:15:00.000Z',
    finished_at: null,
    duration_s: null,
    exit_code: null,
    result: 'running',
  });
  const after = JSON.parse(fs.readFileSync(path.join(outDir, 'run.json'), 'utf8'));
  assert.deepEqual(after, {
    ...seen.records[0],
    finished_at: '2026-10-08T05:22:30.000Z',
    duration_s: 450,
    exit_code: 0,
    result: 'passed',
  });
  assert.match(seen.logged.join('\n'), new RegExp(RUN_ID));
});

test('main: a failing walk ends with Playwright\'s code, and run.json says the tests failed', async () => {
  const f = fixture();
  const { deps } = harness(f, { exits: [1], dirty: true });
  assert.equal(await main(['web/e2e/harness.spec.ts'], deps), 1);
  const record = JSON.parse(fs.readFileSync(path.join(f.outBase, RUN_ID, 'run.json'), 'utf8'));
  assert.equal(record.exit_code, 1);
  assert.equal(record.result, 'tests failed');
  assert.equal(record.dirty, true);
});

test('main: a box that broke is told from a walk that found something', async () => {
  for (const [exit, result] of [[72, 'box failed: npm ci'], [73, 'box failed: build'], [74, 'box failed: server'], [75, 'box failed: sign-in'], [125, 'docker failed (125)']]) {
    const f = fixture();
    const { deps } = harness(f, { exits: [exit] });
    assert.equal(await main(['web/e2e/harness.spec.ts'], deps), exit);
    assert.equal(JSON.parse(fs.readFileSync(path.join(f.outBase, RUN_ID, 'run.json'), 'utf8')).result, result);
  }
});

test('main: a refusal starts no container, writes no folder and exits 64', async () => {
  const f = fixture();
  const { deps, seen } = harness(f);
  assert.equal(await main(['web/src/elsewhere.spec.ts'], deps), EXIT.refused);
  assert.equal(await main([], deps), EXIT.refused);
  assert.equal(await main(['--rm', 'sync'], deps), EXIT.refused);
  assert.equal(seen.docker.length, 0);
  assert.equal(fs.existsSync(f.outBase), false);
  assert.equal(seen.errors.length, 3);
});

test('main: a run folder is never used twice', async () => {
  const f = fixture();
  const { deps, seen } = harness(f, { times: [NOW] });
  assert.equal(await main(['web/e2e/harness.spec.ts'], deps), 0);
  assert.equal(await main(['web/e2e/harness.spec.ts'], deps), EXIT.refused);
  assert.equal(seen.docker.length, 1);
  assert.match(seen.errors.join('\n'), /already there/);
});

test('main --keep: two docker calls, the container is named with the two commands that follow', async () => {
  const f = fixture();
  const { deps, seen } = harness(f);
  assert.equal(await main(['--keep', 'web/e2e/harness.spec.ts'], deps), 0);
  assert.deepEqual(seen.docker.map((call) => call.argv[0]), ['run', 'exec']);
  const said = seen.logged.join('\n');
  assert.match(said, new RegExp(`--exec ${CONTAINER}`));
  assert.match(said, new RegExp(`--rm ${CONTAINER}`));
});

test('main --keep: a container that did not start is not walked, and is not said to be left running', async () => {
  const f = fixture();
  const { deps, seen } = harness(f, { exits: [125] });
  assert.equal(await main(['--keep', 'web/e2e/harness.spec.ts'], deps), 125);
  assert.equal(seen.docker.length, 1);
  assert.doesNotMatch(seen.logged.join('\n'), /left running|--exec|--rm/);
});

test('main --keep: a walk that failed in a box that started still names the box', async () => {
  const f = fixture();
  const { deps, seen } = harness(f, { exits: [0, 73] });
  assert.equal(await main(['--keep', 'web/e2e/harness.spec.ts'], deps), 73);
  assert.match(seen.logged.join('\n'), new RegExp(`--rm ${CONTAINER}`));
});

test('main --exec: the box is asked first, then the walk has its own folder and run.json under the box\'s', async () => {
  const f = fixture();
  const first = harness(f, { times: [NOW] });
  assert.equal(await main(['--keep', 'web/e2e/harness.spec.ts'], first.deps), 0);
  const second = harness(f, { times: [LATER], exits: [0, 1] });
  assert.equal(await main(['--exec', CONTAINER, 'web/e2e/harness.spec.ts'], second.deps), 1);
  const outDir = path.join(f.outBase, RUN_ID, `exec-${LATER_RUN_ID}`);
  assert.deepEqual(second.seen.docker.map((call) => call.argv.slice(0, 3)), [
    ['exec', CONTAINER, 'true'],
    ['exec', '-e', `WALK_OUT=/out/exec-${LATER_RUN_ID}`],
  ]);
  assert.equal(second.seen.docker[0].options.logFile, null);
  assert.equal(second.seen.docker[1].options.logFile, path.join(outDir, 'stdout.log'));
  const record = JSON.parse(fs.readFileSync(path.join(outDir, 'run.json'), 'utf8'));
  assert.equal(record.command, 'exec');
  assert.equal(record.run_id, LATER_RUN_ID);
  assert.equal(record.box_run_id, RUN_ID);
  assert.equal(record.exit_code, 1);
  assert.equal(record.result, 'tests failed');
});

test('main --exec: a box that is not running is said so, with a code of its own, and nothing is walked', async () => {
  const f = fixture();
  const first = harness(f, { times: [NOW] });
  assert.equal(await main(['--keep', 'web/e2e/harness.spec.ts'], first.deps), 0);
  // docker exec's own answer for a container that is gone: 1, Playwright's code for a failed test.
  const second = harness(f, { times: [LATER], exits: [1] });
  assert.equal(await main(['--exec', CONTAINER, 'web/e2e/harness.spec.ts'], second.deps), EXIT.noBox);
  assert.notEqual(EXIT.noBox, 1);
  assert.equal(second.seen.docker.length, 1);
  assert.match(second.seen.errors.join('\n'), /not running/);
  assert.equal(fs.existsSync(path.join(f.outBase, RUN_ID, `exec-${LATER_RUN_ID}`)), false);
});

test('main --rm: one docker rm -f, no folder, docker\'s exit code', async () => {
  const f = fixture();
  const { deps, seen } = harness(f);
  assert.equal(await main(['--rm', CONTAINER], deps), 0);
  assert.deepEqual(seen.docker.map((call) => call.argv), [['rm', '-f', CONTAINER]]);
  assert.equal(seen.docker[0].options.logFile, null);
  assert.equal(fs.existsSync(f.outBase), false);
});

test('main: docker that cannot be started is an error of its own, on record', async () => {
  const f = fixture();
  const { deps, seen } = harness(f);
  deps.docker = async () => {
    throw new Error('spawn docker ENOENT');
  };
  assert.equal(await main(['web/e2e/harness.spec.ts'], deps), EXIT.docker);
  assert.match(seen.errors.join('\n'), /ENOENT/);
  const record = JSON.parse(fs.readFileSync(path.join(f.outBase, RUN_ID, 'run.json'), 'utf8'));
  assert.equal(record.exit_code, EXIT.docker);
});

test('main: a checkout git cannot read is refused before any container starts', async () => {
  const f = fixture();
  const { deps, seen } = harness(f);
  deps.git = () => {
    throw new Error('fatal: not a git repository');
  };
  assert.equal(await main(['web/e2e/harness.spec.ts'], deps), EXIT.refused);
  assert.equal(seen.docker.length, 0);
});

/* ---------------------------------------------------------------------------------------------
 * No value of an env file or of the environment is ever passed, logged or recorded
 * ------------------------------------------------------------------------------------------ */

test('no env value appears in a docker call, in what is logged, or in run.json', async () => {
  const secrets = [SECRET_KEY, SECRET_PASSWORD, SECRET_SHARE];
  const ways = [
    ['web/e2e/harness.spec.ts'],
    ['--keep', 'web/e2e/harness.spec.ts'],
    ['--url', 'https://x.example', 'web/e2e/harness.spec.ts'],
  ];
  for (const argv of ways) {
    const f = fixture({ env: { WALK_VERCEL_SHARE: SECRET_SHARE, WALK_SHOTS: '1' } });
    const { deps, seen } = harness(f, { exits: [0] });
    assert.equal(await main(argv, deps), 0);
    const exec = harness(f, { times: [LATER] });
    assert.equal(await main(['--exec', CONTAINER, 'web/e2e/harness.spec.ts'], exec.deps), 0);
    const outDir = path.join(f.outBase, RUN_ID);
    const told = [
      ...seen.docker.flatMap((call) => call.argv),
      ...exec.seen.docker.flatMap((call) => call.argv),
      ...seen.logged,
      ...seen.errors,
      ...exec.seen.logged,
      ...exec.seen.errors,
      fs.readFileSync(path.join(outDir, 'run.json'), 'utf8'),
      fs.readFileSync(path.join(outDir, `exec-${LATER_RUN_ID}`, 'run.json'), 'utf8'),
    ].join('\n');
    for (const secret of secrets) assert.ok(!told.includes(secret), `a value leaked by ${argv.join(' ')}`);
  }
});

/* ---------------------------------------------------------------------------------------------
 * The real docker call: started without a shell, its exit code, its output
 * ------------------------------------------------------------------------------------------ */

/** A stream that keeps what is written to it. */
function sink() {
  const chunks = [];
  const stream = new Writable({
    write(chunk, _encoding, done) {
      chunks.push(Buffer.from(chunk));
      done();
    },
  });
  return { stream, text: () => Buffer.concat(chunks).toString('utf8') };
}

/**
 * A stand-in for the docker client: node, running a script that prints its arguments as JSON on
 * stdout and a line on stderr, and ends with the code its last argument names (`exit=<n>`).
 */
function standInClient() {
  const dir = scratch('walkbox-client-');
  const script = write(
    dir,
    'client.mjs',
    [
      'const argv = process.argv.slice(2);',
      'process.stdout.write(`${JSON.stringify(argv)}\n`);',
      "process.stderr.write('said on stderr\n');",
      "process.exitCode = Number(argv.at(-1).split('=')[1]);",
    ].join('\n'),
  );
  return { dir, client: [process.execPath, script] };
}

/** runDocker against the stand-in, with the console caught. */
async function callClient(argv, { logFile = null } = {}) {
  const { dir, client } = standInClient();
  const out = sink();
  const err = sink();
  const file = logFile === null ? null : path.join(dir, logFile);
  const code = await runDocker(argv, { logFile: file, client, out: out.stream, err: err.stream });
  return { code, out: out.text(), err: err.text(), dir, file };
}

test('the client the script starts is docker, by that name and nothing more', () => {
  assert.deepEqual([...DOCKER_CLIENT], ['docker']);
  assert.ok(Object.isFrozen(DOCKER_CLIENT));
});

test('runDocker: the client gets each argument as it was given, with no shell between', async () => {
  // What a shell would split, expand, run or strip.
  const argv = ['run', '--name', 'a b', '$HOME', '%PATH%', 'x; echo injected', 'a&b', '"quoted"', "it's", '*', 'exit=0'];
  const { code, out } = await callClient(argv);
  assert.equal(code, 0);
  assert.deepEqual(JSON.parse(out), argv);
});

test('runDocker: the answer is the client\'s own exit code', async () => {
  for (const exit of [0, 1, 64, 75, 125]) {
    assert.equal((await callClient(['run', `exit=${exit}`])).code, exit);
  }
});

test('runDocker: what the client prints goes to the console and, when a log file is named, to it', async () => {
  const argv = ['run', 'exit=1'];
  const logged = await callClient(argv, { logFile: 'stdout.log' });
  assert.equal(logged.out, `${JSON.stringify(argv)}\n`);
  assert.equal(logged.err, 'said on stderr\n');
  const log = fs.readFileSync(logged.file, 'utf8');
  assert.ok(log.includes(`${JSON.stringify(argv)}\n`), 'stdout is in the log');
  assert.ok(log.includes('said on stderr\n'), 'stderr is in the log');

  const unlogged = await callClient(argv);
  assert.equal(unlogged.out, `${JSON.stringify(argv)}\n`);
  assert.deepEqual(fs.readdirSync(unlogged.dir), ['client.mjs'], 'no log file is made');
});

test('runDocker: a client that cannot be started is an error, never an exit code', async () => {
  const out = sink();
  const err = sink();
  await assert.rejects(
    runDocker(['run'], { logFile: null, client: [path.join(scratch('walkbox-none-'), 'no-such-client')], out: out.stream, err: err.stream }),
    /ENOENT/,
  );
});

test('main, with the real call: the walk ends with the client\'s code and stdout.log holds what it printed', async () => {
  const { client } = standInClient();
  for (const [extra, expected] of [[['exit=0'], 0], [['exit=1'], 1], [['exit=75'], 75]]) {
    const f = fixture();
    const { deps } = harness(f);
    const out = sink();
    const err = sink();
    deps.docker = (argv, options) => runDocker(argv, { ...options, client, out: out.stream, err: err.stream });
    assert.equal(await main(['web/e2e/harness.spec.ts', '--', ...extra], deps), expected);
    const outDir = path.join(f.outBase, RUN_ID);
    assert.equal(JSON.parse(fs.readFileSync(path.join(outDir, 'run.json'), 'utf8')).exit_code, expected);
    const log = fs.readFileSync(path.join(outDir, 'stdout.log'), 'utf8');
    assert.ok(log.includes(`"e2e/harness.spec.ts","--","${extra[0]}"]`), 'the client\'s stdout is in stdout.log');
    assert.ok(log.includes('said on stderr\n'));
  }
});

/* ---------------------------------------------------------------------------------------------
 * The command itself
 * ------------------------------------------------------------------------------------------ */

test('node scripts/walk-box.mjs: a refusal ends the process itself with 64 and starts nothing', () => {
  const script = path.join(REPO_ROOT, 'scripts', 'walk-box.mjs');
  for (const [argv, said] of [[[], /usage/], [['--rm', 'sync'], /not a walk box/], [['web/e2e/harness.spec.ts', '-g', 'x'], /after --/]]) {
    const ended = spawnSync(process.execPath, [script, ...argv], { encoding: 'utf8' });
    assert.equal(ended.status, EXIT.refused, ended.stderr);
    assert.match(ended.stderr, said);
    assert.equal(ended.stdout, '');
  }
});

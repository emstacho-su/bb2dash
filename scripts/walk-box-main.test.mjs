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
import fs from 'node:fs';
import path from 'node:path';

import { EXIT, WALK_IMAGE, main } from './walk-box.mjs';
import { COMMIT, CONTAINER, LATER, LATER_RUN_ID, NOW, RUN_ID, SECRET_KEY, SECRET_PASSWORD, SECRET_SHARE, fixture, posix } from './walk-box-kit.mjs';

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

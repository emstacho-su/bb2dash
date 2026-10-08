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
import { execFileSync, spawnSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import { Writable } from 'node:stream';

import { DOCKER_CLIENT, EXIT, PRODUCTION_ORIGIN, WALK_IMAGE, changedSinceBuild, main, runDocker, watchSignals } from './walk-box.mjs';
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

/**
 * main()'s dependencies, with docker and git recorded instead of run. `head` is the commit git
 * names; `changed` and `untracked` are what it lists under web/ outside web/e2e, against the
 * commit a kept box built.
 */
function harness(f, { exits = [0], dirty = false, times = [NOW, LATER], head = COMMIT, changed = [], untracked = [] } = {}) {
  const seen = { docker: [], git: [], logged: [], errors: [], records: [], watchStops: 0 };
  let call = 0;
  let tick = 0;
  const listed = (files) => files.map((file) => `${file}\n`).join('');
  const deps = {
    root: f.root,
    cwd: f.cwd,
    env: f.env,
    home: f.home,
    now: () => times[Math.min(tick++, times.length - 1)],
    git: (args) => {
      seen.git.push(args);
      if (args[0] === 'rev-parse') return `${head}\n`;
      if (args[0] === 'status') return dirty ? ' M web/e2e/harness.spec.ts\n' : '';
      if (args[0] === 'diff') return listed(changed);
      if (args[0] === 'ls-files') return listed(untracked);
      throw new Error(`unexpected git ${args.join(' ')}`);
    },
    docker: async (argv, options) => {
      const runJson = options.logFile ? path.join(path.dirname(options.logFile), 'run.json') : null;
      seen.docker.push({ argv, options });
      if (runJson) seen.records.push(JSON.parse(fs.readFileSync(runJson, 'utf8')));
      return exits[Math.min(call++, exits.length - 1)];
    },
    // No signal ever comes, and the process's own signals are left alone.
    watch: () => ({
      interrupted: new Promise(() => {}),
      stop: () => {
        seen.watchStops += 1;
      },
    }),
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

test('main --url: a host that is not this project\'s starts no container, so the test login is typed into no stranger\'s form', async () => {
  const f = fixture();
  const { deps, seen } = harness(f);
  for (const url of ['https://web-xi-ten.vercel.app', 'https://x.example']) {
    assert.equal(await main(['--url', url, 'web/e2e/harness.spec.ts'], deps), EXIT.refused, url);
  }
  assert.equal(seen.docker.length, 0);
  assert.equal(fs.existsSync(f.outBase), false);
  assert.match(seen.errors.join('\n'), /not a host of this project/);
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

/* ---------------------------------------------------------------------------------------------
 * --exec: the record names what the box built, and a tree that has moved on is refused
 * ------------------------------------------------------------------------------------------ */

const HEAD_NOW = 'beefcafebeefcafebeefcafebeefcafebeefcafe';
const OUTSIDE_SPECS = ['--', 'web', ':(exclude)web/e2e'];

/** A kept box started through main() at COMMIT, then what an --exec in it is given. */
async function keptThenExec(f, { keep = {}, exec = {} } = {}) {
  const first = harness(f, { times: [NOW], ...keep });
  assert.equal(await main(['--keep', 'web/e2e/harness.spec.ts'], first.deps), 0);
  const second = harness(f, { times: [LATER], exits: [0, 0], ...exec });
  const code = await main(['--exec', CONTAINER, 'web/e2e/harness.spec.ts'], second.deps);
  return { code, seen: second.seen, execDir: path.join(f.outBase, RUN_ID, `exec-${LATER_RUN_ID}`) };
}

test('main --exec: the record names the commit the box built beside the commit the specs are read at', async () => {
  const f = fixture();
  const { code, seen, execDir } = await keptThenExec(f, { exec: { head: HEAD_NOW } });
  assert.equal(code, 0);
  const record = JSON.parse(fs.readFileSync(path.join(execDir, 'run.json'), 'utf8'));
  assert.equal(record.commit, HEAD_NOW);
  assert.equal(record.built_commit, COMMIT);
  assert.equal(record.built_dirty, false);
  assert.equal(record.worktree, posix(f.root));
  // What changed since the build is asked of git against the box's commit, not HEAD, and outside web/e2e only.
  assert.deepEqual(seen.git.filter((args) => args[0] === 'diff'), [['diff', '--name-only', COMMIT, ...OUTSIDE_SPECS]]);
  assert.deepEqual(seen.git.filter((args) => args[0] === 'ls-files'), [['ls-files', '--others', '--exclude-standard', ...OUTSIDE_SPECS]]);
});

test('main --exec: a file under web/ outside web/e2e that is not as the box built it is refused, and nothing is walked', async () => {
  const moved = [
    ['changed since the box\'s commit', { changed: ['web/src/app/globals.css', 'web/package.json'] }, /web\/src\/app\/globals\.css/],
    ['new and not committed', { untracked: ['web/src/components/shell/Menu.module.css'] }, /Menu\.module\.css/],
  ];
  for (const [what, exec, names] of moved) {
    const f = fixture();
    const { code, seen, execDir } = await keptThenExec(f, { exec: { head: HEAD_NOW, ...exec } });
    assert.equal(code, EXIT.refused, what);
    assert.equal(seen.docker.length, 0, `${what}: docker was called`);
    assert.equal(fs.existsSync(execDir), false);
    const said = seen.errors.join('\n');
    assert.match(said, names);
    assert.match(said, /start a new box/);
    assert.match(said, new RegExp(COMMIT.slice(0, 7)));
  }
});

test('main --exec: a box built from a worktree that differed from its commit cannot be compared: on record and said, not refused', async () => {
  const f = fixture();
  const { code, seen, execDir } = await keptThenExec(f, { keep: { dirty: true }, exec: { changed: ['web/src/app/globals.css'] } });
  assert.equal(code, 0);
  assert.equal(JSON.parse(fs.readFileSync(path.join(execDir, 'run.json'), 'utf8')).built_dirty, true);
  assert.deepEqual(seen.git.filter((args) => args[0] === 'diff'), []);
  assert.match(seen.logged.join('\n'), /uncommitted changes when .* was built/);
});

test('main --exec in a --url box: nothing was built there, so nothing is compared', async () => {
  const f = fixture();
  const first = harness(f, { times: [NOW] });
  assert.equal(await main(['--keep', '--url', PRODUCTION_ORIGIN, 'web/e2e/harness.spec.ts'], first.deps), 0);
  const second = harness(f, { times: [LATER], exits: [0, 0], changed: ['web/src/app/globals.css'] });
  assert.equal(await main(['--exec', CONTAINER, 'web/e2e/harness.spec.ts'], second.deps), 0);
  const record = JSON.parse(fs.readFileSync(path.join(f.outBase, RUN_ID, `exec-${LATER_RUN_ID}`, 'run.json'), 'utf8'));
  assert.equal(record.mode, 'url');
  assert.equal(record.base_url, PRODUCTION_ORIGIN);
  assert.equal(record.built_commit, null);
  assert.deepEqual(second.seen.git.filter((args) => args[0] === 'diff'), []);
});

test('main --exec: a commit git cannot compare with is refused, not passed over', async () => {
  const f = fixture();
  const first = harness(f, { times: [NOW] });
  assert.equal(await main(['--keep', 'web/e2e/harness.spec.ts'], first.deps), 0);
  const second = harness(f, { times: [LATER] });
  const git = second.deps.git;
  second.deps.git = (args) => {
    if (args[0] === 'diff') throw new Error(`fatal: bad object ${COMMIT}`);
    return git(args);
  };
  assert.equal(await main(['--exec', CONTAINER, 'web/e2e/harness.spec.ts'], second.deps), EXIT.refused);
  assert.equal(second.seen.docker.length, 0);
  assert.match(second.seen.errors.join('\n'), /could not compare/);
});

test('changedSinceBuild, against a real git: a change under web/e2e is not listed, every other change under web/ is', () => {
  const repo = scratch('walkbox-git-');
  const git = (args) => execFileSync('git', ['-C', repo, '-c', 'user.name=walk box test', '-c', 'user.email=walkbox@test.example', '-c', 'core.autocrlf=false', ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  git(['init', '--quiet']);
  for (const file of ['web/src/app/page.tsx', 'web/e2e/harness.spec.ts', 'web/package.json', 'docs/note.md', '.gitignore']) {
    write(repo, file, file === '.gitignore' ? 'web/.next/\n' : 'first\n');
  }
  git(['add', '--all']);
  git(['commit', '--quiet', '-m', 'the commit the box built']);
  const built = git(['rev-parse', 'HEAD']).trim();
  assert.deepEqual(changedSinceBuild(git, built), []);

  // What --exec is for, and what does not reach the build: none of it is listed.
  write(repo, 'web/e2e/harness.spec.ts', 'second\n');
  write(repo, 'web/e2e/theme-walk.spec.ts', 'new\n');
  write(repo, 'docs/note.md', 'second\n');
  write(repo, 'web/.next/BUILD_ID', 'ignored\n');
  assert.deepEqual(changedSinceBuild(git, built), []);

  // The app moves on, in each of the three ways: edited and not committed, committed, new and not added.
  write(repo, 'web/src/app/page.tsx', 'second\n');
  assert.deepEqual(changedSinceBuild(git, built), ['web/src/app/page.tsx']);
  git(['commit', '--quiet', '--all', '-m', 'the app moves on']);
  assert.deepEqual(changedSinceBuild(git, built), ['web/src/app/page.tsx']);
  write(repo, 'web/src/components/Menu.module.css', 'new\n');
  assert.deepEqual(changedSinceBuild(git, built), ['web/src/app/page.tsx', 'web/src/components/Menu.module.css']);
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
 * A run that is stopped: the box does not outlive the script that started it
 * ------------------------------------------------------------------------------------------ */

const readRecord = (dir) => JSON.parse(fs.readFileSync(path.join(dir, 'run.json'), 'utf8'));
const aborted = () => Object.assign(new Error('The operation was aborted'), { name: 'AbortError' });

/**
 * main()'s dependencies for a run that is stopped from outside: a watch the test fires by hand,
 * and a docker whose walk stays open until the script ends its client, as the real one does.
 * `rmExit` is what `docker rm -f` answers.
 */
function interruptible(f, { times, rmExit = 0 } = {}) {
  const { deps, seen } = harness(f, { times });
  let fire;
  const interrupted = new Promise((resolve) => {
    fire = resolve;
  });
  let walking;
  const walkOpen = new Promise((resolve) => {
    walking = resolve;
  });
  deps.watch = () => ({
    interrupted,
    stop: () => {
      seen.watchStops += 1;
    },
  });
  deps.docker = (argv, options) => {
    seen.docker.push({ argv, options });
    if (argv[0] === 'rm') return Promise.resolve(rmExit);
    const isPrecheck = argv[0] === 'exec' && argv.at(-1) === 'true';
    const isDetachedStart = argv[0] === 'run' && argv.includes('-d');
    if (isPrecheck || isDetachedStart) return Promise.resolve(0);
    return new Promise((_resolve, reject) => {
      walking();
      options.signal.addEventListener('abort', () => reject(aborted()));
    });
  };
  return { deps, seen, fire, walkOpen };
}

test('main: a signal to the script removes the box it started, ends its docker client, and run.json says interrupted', async () => {
  for (const [signal, code] of [['SIGINT', 130], ['SIGTERM', 143], ['SIGHUP', 129]]) {
    const f = fixture();
    const { deps, seen, fire, walkOpen } = interruptible(f);
    const ending = main(['web/e2e/harness.spec.ts'], deps);
    await walkOpen;
    assert.equal(readRecord(path.join(f.outBase, RUN_ID)).result, 'running');
    fire(signal);
    assert.equal(await ending, code, signal);
    assert.deepEqual(seen.docker.map((call) => call.argv.slice(0, 3)), [['run', '--rm', '--init'], ['rm', '-f', CONTAINER]]);
    assert.equal(seen.docker[0].options.signal.aborted, true, 'the docker client of the walk is ended');
    assert.equal(seen.docker[1].options.logFile, null);
    const record = readRecord(path.join(f.outBase, RUN_ID));
    assert.equal(record.exit_code, code);
    assert.equal(record.result, `interrupted (${signal}), box removed`);
    assert.equal(record.finished_at, LATER.toISOString());
    assert.equal(seen.watchStops, 1, 'the script stops listening when it ends');
    assert.doesNotMatch(seen.errors.join('\n'), /could not be started/);
  }
});

test('main --keep: a signal removes the kept box too, and it is not said to be left running', async () => {
  const f = fixture();
  const { deps, seen, fire, walkOpen } = interruptible(f);
  const ending = main(['--keep', 'web/e2e/harness.spec.ts'], deps);
  await walkOpen;
  fire('SIGINT');
  assert.equal(await ending, 130);
  assert.deepEqual(seen.docker.map((call) => call.argv[0]), ['run', 'exec', 'rm']);
  assert.deepEqual(seen.docker[2].argv, ['rm', '-f', CONTAINER]);
  assert.equal(readRecord(path.join(f.outBase, RUN_ID)).result, 'interrupted (SIGINT), box removed');
  assert.doesNotMatch(seen.logged.join('\n'), /left running|--exec/);
});

test('main --exec: a signal ends the docker client and leaves the kept box, which this call did not start', async () => {
  const f = fixture();
  const first = harness(f, { times: [NOW] });
  assert.equal(await main(['--keep', 'web/e2e/harness.spec.ts'], first.deps), 0);
  const { deps, seen, fire, walkOpen } = interruptible(f, { times: [LATER] });
  const ending = main(['--exec', CONTAINER, 'web/e2e/harness.spec.ts'], deps);
  await walkOpen;
  fire('SIGINT');
  assert.equal(await ending, 130);
  assert.deepEqual(seen.docker.map((call) => call.argv[0]), ['exec', 'exec']);
  assert.equal(seen.docker[1].options.signal.aborted, true);
  const record = readRecord(path.join(f.outBase, RUN_ID, `exec-${LATER_RUN_ID}`));
  assert.equal(record.exit_code, 130);
  assert.equal(record.result, 'interrupted (SIGINT), kept box left running');
  assert.match(seen.logged.join('\n'), new RegExp(`--rm ${CONTAINER}`));
});

test('main: a docker call that ends with a signal\'s code is a client that was stopped: the box is removed all the same', async () => {
  for (const [exit, signal] of [[143, 'SIGTERM'], [130, 'SIGINT'], [137, 'SIGKILL'], [129, 'SIGHUP']]) {
    const f = fixture();
    const { deps, seen } = harness(f, { exits: [exit, 0] });
    assert.equal(await main(['web/e2e/harness.spec.ts'], deps), exit);
    assert.deepEqual(seen.docker.map((call) => call.argv.slice(0, 2)), [['run', '--rm'], ['rm', '-f']]);
    assert.deepEqual(seen.docker[1].argv, ['rm', '-f', CONTAINER]);
    const record = readRecord(path.join(f.outBase, RUN_ID));
    assert.equal(record.exit_code, exit);
    assert.equal(record.result, `interrupted (${signal}), box removed`);
  }
});

test('main --exec: a docker call that ends with a signal\'s code leaves the kept box', async () => {
  const f = fixture();
  const first = harness(f, { times: [NOW] });
  assert.equal(await main(['--keep', 'web/e2e/harness.spec.ts'], first.deps), 0);
  const second = harness(f, { times: [LATER], exits: [0, 143] });
  assert.equal(await main(['--exec', CONTAINER, 'web/e2e/harness.spec.ts'], second.deps), 143);
  assert.deepEqual(second.seen.docker.map((call) => call.argv[0]), ['exec', 'exec']);
  assert.equal(readRecord(path.join(f.outBase, RUN_ID, `exec-${LATER_RUN_ID}`)).result, 'interrupted (SIGTERM), kept box left running');
});

test('main: a box that docker did not remove is said so, with where to look', async () => {
  const f = fixture();
  const { deps, seen, fire, walkOpen } = interruptible(f, { rmExit: 1 });
  const ending = main(['web/e2e/harness.spec.ts'], deps);
  await walkOpen;
  fire('SIGINT');
  assert.equal(await ending, 130);
  assert.equal(readRecord(path.join(f.outBase, RUN_ID)).result, 'interrupted (SIGINT), box not removed');
  assert.match(seen.errors.join('\n'), new RegExp(`docker rm -f ${CONTAINER} ended with 1`));
});

test('main: a walk that ends by itself stops listening for signals and removes nothing', async () => {
  for (const exit of [0, 1, 75]) {
    const f = fixture();
    const { deps, seen } = harness(f, { exits: [exit] });
    assert.equal(await main(['web/e2e/harness.spec.ts'], deps), exit);
    assert.equal(seen.watchStops, 1);
    assert.deepEqual(seen.docker.map((call) => call.argv[0]), ['run']);
  }
});

test('watchSignals: the first of SIGINT, SIGTERM and SIGHUP is told by name, and stop() takes every listener away', async () => {
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
    const emitter = new EventEmitter();
    const watch = watchSignals(emitter);
    assert.deepEqual(emitter.eventNames().sort(), ['SIGHUP', 'SIGINT', 'SIGTERM']);
    emitter.emit(signal, signal);
    assert.equal(await watch.interrupted, signal);
    // A second signal while the box is being removed is listened to as well: it ends nothing.
    assert.equal(emitter.emit('SIGINT', 'SIGINT'), true);
    watch.stop();
    assert.deepEqual(emitter.eventNames(), []);
  }
});

const LOOK_EVERY_MS = 20;
const STARTED_WITHIN_MS = 15_000;

/** Waits until `check()` holds, for `limitMs` at most: a wait that cannot end fails the test, it does not hang it. */
async function until(check, limitMs, what) {
  const deadline = Date.now() + limitMs;
  while (!check()) {
    if (Date.now() > deadline) throw new Error(`${what}: not within ${limitMs} ms`);
    await new Promise((resolve) => setTimeout(resolve, LOOK_EVERY_MS));
  }
}

test('runDocker: a client that is still running is ended when its signal is aborted', async () => {
  const dir = scratch('walkbox-waits-');
  // A minute, far longer than the test: a client that is not ended holds this process open that long, no longer.
  const script = write(dir, 'waits.mjs', "process.stdout.write('started\\n');\nsetTimeout(() => {}, 60000);\n");
  const out = sink();
  const stop = new AbortController();
  const ending = runDocker(['run'], { logFile: null, client: [process.execPath, script], out: out.stream, err: sink().stream, signal: stop.signal });
  // Whatever the wait below does, the client is ended and its answer is looked at once.
  const answer = ending.then(
    (code) => ({ code }),
    (error) => ({ error }),
  );
  try {
    await until(() => out.text().includes('started'), STARTED_WITHIN_MS, 'the stand-in client said it started');
  } finally {
    stop.abort();
  }
  const { code, error } = await answer;
  assert.equal(code, undefined, 'the client was ended, it did not end by itself');
  assert.equal(error?.name, 'AbortError');
});

/* ---------------------------------------------------------------------------------------------
 * No value of an env file or of the environment is ever passed, logged or recorded
 * ------------------------------------------------------------------------------------------ */

test('no env value appears in a docker call, in what is logged, or in run.json', async () => {
  const secrets = [SECRET_KEY, SECRET_PASSWORD, SECRET_SHARE];
  const ways = [
    ['web/e2e/harness.spec.ts'],
    ['--keep', 'web/e2e/harness.spec.ts'],
    ['--url', PRODUCTION_ORIGIN, 'web/e2e/harness.spec.ts'],
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
      'process.stdout.write(`${JSON.stringify(argv)}\\n`);',
      "process.stderr.write('said on stderr\\n');",
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

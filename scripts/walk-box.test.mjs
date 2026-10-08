// bb2dash :: scripts/walk-box.test.mjs
// The walk box (brief 103, task 0): one throwaway container that builds this worktree's web app,
// signs in with the test login and runs the named Playwright specs against it. These tests hold the
// part that runs on the host: how the command line is read, the exact docker call for each way of
// running, what is refused before any container starts, and that no value of an env file or of the
// environment reaches the docker call, the log or run.json. Docker is injected: nothing here starts
// a container, and nothing reads the real env files.
//
//   node --test scripts/walk-box.test.mjs

import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CONTAINER_PREFIX,
  EXIT,
  NPM_CACHE_VOLUME,
  WALK_IMAGE,
  WalkBoxError,
  assertOutBase,
  containerNameOf,
  imageFor,
  main,
  parseArgs,
  planExec,
  planRm,
  planRun,
  runIdOf,
  runIdOfContainer,
  specPaths,
} from './walk-box.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NOW = new Date('2026-10-08T05:15:00.000Z');
const RUN_ID = '20261008T051500Z';
const CONTAINER = 'bb2dash-walk22-20261008t051500z';
const LATER = new Date('2026-10-08T05:22:30.000Z');
const LATER_RUN_ID = '20261008T052230Z';

/** Values that must never leave the files or the environment they are in. */
const SECRET_KEY = 'sentinel-anon-key-7f3a';
const SECRET_PASSWORD = 'sentinel-password-91bc';
const SECRET_SHARE = 'sentinel-share-token-55de';

const posix = (file) => file.split(path.sep).join('/');

const made = [];
function scratch(prefix) {
  const dir = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
  made.push(dir);
  return dir;
}
after(() => {
  for (const dir of made) fs.rmSync(dir, { recursive: true, force: true });
});

function write(root, relative, text = '') {
  const file = path.join(root, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
  return file;
}

/** A worktree and a home folder, both made for the test: a checkout, its specs, the two input files. */
function fixture({ env = {} } = {}) {
  const root = scratch('walkbox-root-');
  write(root, '.git', 'gitdir: somewhere/else\n');
  write(root, 'web/package.json', JSON.stringify({ devDependencies: { '@playwright/test': '1.63.0' } }));
  write(root, 'web/e2e/harness.spec.ts');
  write(root, 'web/e2e/theme/walk22.spec.ts');
  write(root, 'web/e2e/walk.ts');
  write(root, 'web/src/elsewhere.spec.ts');
  write(root, 'docker/walk/entry.sh');
  const home = scratch('walkbox-home-');
  const webEnv = write(home, '.bb2dash-walk/web.env', `NEXT_PUBLIC_SUPABASE_ANON_KEY=${SECRET_KEY}\n`);
  const loginEnv = write(home, 'projects/bb2dash/.env.testing', `TEST_USER_PW=${SECRET_PASSWORD}\n`);
  const outBase = path.join(home, '.bb2dash-walk', '22');
  return { root, home, cwd: root, env, now: NOW, webEnv, loginEnv, outBase };
}

const run = (specs, more = {}) => ({ command: 'run', url: null, keep: false, container: null, specs, extra: [], ...more });

function refusal(fn, pattern) {
  assert.throws(fn, (error) => {
    assert.ok(error instanceof WalkBoxError, `a WalkBoxError, not ${error?.name}: ${error?.message}`);
    assert.match(error.message, pattern);
    return true;
  });
}

/* ---------------------------------------------------------------------------------------------
 * The command line
 * ------------------------------------------------------------------------------------------ */

test('parseArgs: specs, then Playwright\'s own arguments after --', () => {
  assert.deepEqual(parseArgs(['web/e2e/harness.spec.ts']), run(['web/e2e/harness.spec.ts']));
  assert.deepEqual(
    parseArgs(['web/e2e/a.spec.ts', 'web/e2e/b.spec.ts', '--', '-g', 'signed in', '--reporter=line']),
    run(['web/e2e/a.spec.ts', 'web/e2e/b.spec.ts'], { extra: ['-g', 'signed in', '--reporter=line'] }),
  );
});

test('parseArgs: --url and --keep, in any place before --', () => {
  assert.deepEqual(
    parseArgs(['--url', 'https://bb2dash.example', 'web/e2e/a.spec.ts']),
    run(['web/e2e/a.spec.ts'], { url: 'https://bb2dash.example' }),
  );
  assert.deepEqual(parseArgs(['web/e2e/a.spec.ts', '--keep']), run(['web/e2e/a.spec.ts'], { keep: true }));
});

test('parseArgs: --exec names a container and takes specs; --rm names one and takes nothing else', () => {
  assert.deepEqual(parseArgs(['--exec', CONTAINER, 'web/e2e/a.spec.ts', '--', '-g', 'x']), {
    command: 'exec',
    url: null,
    keep: false,
    container: CONTAINER,
    specs: ['web/e2e/a.spec.ts'],
    extra: ['-g', 'x'],
  });
  assert.deepEqual(parseArgs(['--rm', CONTAINER]), {
    command: 'rm',
    url: null,
    keep: false,
    container: CONTAINER,
    specs: [],
    extra: [],
  });
});

test('parseArgs refuses what it cannot read exactly', () => {
  const bad = [
    [[], /usage/i],
    [['--keep'], /spec/],
    [['--url'], /--url/],
    [['--url', 'https://x.example'], /spec/],
    [['--exec'], /--exec/],
    [['--exec', CONTAINER], /spec/],
    [['--rm'], /--rm/],
    [['--rm', CONTAINER, 'web/e2e/a.spec.ts'], /--rm/],
    [['--rm', CONTAINER, '--', '-g', 'x'], /--rm/],
    [['--exec', CONTAINER, '--rm', CONTAINER], /one of/],
    [['--exec', CONTAINER, '--keep', 'web/e2e/a.spec.ts'], /--keep/],
    [['--exec', CONTAINER, '--url', 'https://x.example', 'web/e2e/a.spec.ts'], /--url/],
    [['--keep', '--keep', 'web/e2e/a.spec.ts'], /twice/],
    [['--bogus', 'web/e2e/a.spec.ts'], /--bogus/],
    // Playwright's own arguments go after --, so a typo is never taken for a spec.
    [['web/e2e/a.spec.ts', '-g', 'title'], /after --/],
  ];
  for (const [argv, pattern] of bad) refusal(() => parseArgs(argv), pattern);
});

/* ---------------------------------------------------------------------------------------------
 * Names
 * ------------------------------------------------------------------------------------------ */

test('the run id is the UTC time to the second, and the container is named after it', () => {
  assert.equal(runIdOf(NOW), RUN_ID);
  assert.equal(runIdOf(new Date('2026-01-02T03:04:05.999Z')), '20260102T030405Z');
  assert.equal(containerNameOf(RUN_ID), CONTAINER);
  assert.ok(CONTAINER.startsWith(CONTAINER_PREFIX));
  assert.equal(runIdOfContainer(CONTAINER), RUN_ID);
});

test('a container this script did not name is refused: no other container is ever touched', () => {
  for (const name of ['sync', 'bb2dash-sync-1', 'bb2dash-wt21-workspace-1', 'bb2dash-walk22-', `${CONTAINER} sync`, `${CONTAINER};x`, '']) {
    refusal(() => runIdOfContainer(name), /not a walk box/);
  }
});

/* ---------------------------------------------------------------------------------------------
 * The image
 * ------------------------------------------------------------------------------------------ */

test('the image is the stock Playwright image, and its tag is web/package.json\'s @playwright/test version', () => {
  const web = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'web', 'package.json'), 'utf8'));
  assert.equal(WALK_IMAGE, `mcr.microsoft.com/playwright:v${web.devDependencies['@playwright/test']}-noble`);
  assert.equal(imageFor(REPO_ROOT), WALK_IMAGE);
});

test('a checkout whose Playwright version is not the image\'s is refused', () => {
  const { root } = fixture();
  write(root, 'web/package.json', JSON.stringify({ devDependencies: { '@playwright/test': '1.64.0' } }));
  refusal(() => imageFor(root), /1\.64\.0/);
  write(root, 'web/package.json', JSON.stringify({ devDependencies: { '@playwright/test': '^1.63.0' } }));
  refusal(() => imageFor(root), /\^1\.63\.0/);
  write(root, 'web/package.json', '{}');
  refusal(() => imageFor(root), /@playwright\/test/);
});

/* ---------------------------------------------------------------------------------------------
 * The exact docker calls
 * ------------------------------------------------------------------------------------------ */

function mounts(f, outDir) {
  return [
    '--mount',
    `type=bind,source=${posix(f.root)},target=/src,readonly`,
    '--mount',
    `type=bind,source=${posix(f.loginEnv)},target=/work/.env.testing,readonly`,
    '--mount',
    `type=bind,source=${posix(outDir)},target=/out`,
    '--mount',
    `type=volume,source=${NPM_CACHE_VOLUME},target=/npm-cache`,
  ];
}

test('a run: one docker run --rm that builds, signs in and walks', () => {
  const f = fixture();
  const plan = planRun(run(['web/e2e/harness.spec.ts']), f);
  const outDir = path.join(f.outBase, RUN_ID);
  assert.equal(plan.runId, RUN_ID);
  assert.equal(plan.container, CONTAINER);
  assert.equal(plan.outDir, outDir);
  assert.deepEqual(plan.calls, [
    [
      'run', '--rm', '--init', '--name', CONTAINER, '--shm-size', '1g',
      '--env-file', posix(f.webEnv),
      '-e', 'WALK_BOX_MODE=build', '-e', 'WALK_BASE_URL=http://localhost:3000', '-e', 'WALK_OUT=/out', '-e', 'WALK_SHOTS=0',
      ...mounts(f, outDir),
      'mcr.microsoft.com/playwright:v1.63.0-noble',
      'bash', '/src/docker/walk/entry.sh', 'all', 'e2e/harness.spec.ts', '--',
    ],
  ]);
});

test('a run: several specs, Playwright\'s arguments after --, and WALK_SHOTS=1 passed through', () => {
  const f = fixture({ env: { WALK_SHOTS: '1' } });
  const plan = planRun(run(['web/e2e/harness.spec.ts', 'web/e2e/theme/walk22.spec.ts'], { extra: ['-g', 'signed in'] }), f);
  const call = plan.calls[0];
  assert.deepEqual(call.slice(call.indexOf('bash')), [
    'bash', '/src/docker/walk/entry.sh', 'all', 'e2e/harness.spec.ts', 'e2e/theme/walk22.spec.ts', '--', '-g', 'signed in',
  ]);
  assert.ok(call.join(' ').includes('-e WALK_SHOTS=1'));
  assert.equal(plan.record.shots, true);
});

test('a spec is read from the folder the script was started in', () => {
  const f = fixture();
  const plan = planRun(run(['harness.spec.ts']), { ...f, cwd: path.join(f.root, 'web', 'e2e') });
  assert.deepEqual(plan.calls[0].slice(-3), ['all', 'e2e/harness.spec.ts', '--']);
  assert.deepEqual(plan.record.specs, ['web/e2e/harness.spec.ts']);
});

test('--url: no env file, no build; the host is walked, and the share token goes by name only', () => {
  const f = fixture({ env: { WALK_VERCEL_SHARE: SECRET_SHARE } });
  const plan = planRun(run(['web/e2e/harness.spec.ts'], { url: 'https://web-xi-ten.vercel.app' }), f);
  const outDir = path.join(f.outBase, RUN_ID);
  assert.deepEqual(plan.calls, [
    [
      'run', '--rm', '--init', '--name', CONTAINER, '--shm-size', '1g',
      '-e', 'WALK_BOX_MODE=url', '-e', 'WALK_BASE_URL=https://web-xi-ten.vercel.app', '-e', 'WALK_OUT=/out', '-e', 'WALK_SHOTS=0',
      '-e', 'WALK_VERCEL_SHARE',
      ...mounts(f, outDir),
      WALK_IMAGE,
      'bash', '/src/docker/walk/entry.sh', 'all', 'e2e/harness.spec.ts', '--',
    ],
  ]);
});

test('--url without a share token passes none, and a build never passes one', () => {
  const noToken = planRun(run(['web/e2e/harness.spec.ts'], { url: 'https://x.example' }), fixture());
  assert.ok(!noToken.calls[0].includes('WALK_VERCEL_SHARE'));
  const build = planRun(run(['web/e2e/harness.spec.ts']), fixture({ env: { WALK_VERCEL_SHARE: SECRET_SHARE } }));
  assert.ok(!build.calls[0].includes('WALK_VERCEL_SHARE'));
});

test('--url takes an https origin and nothing more', () => {
  const f = fixture();
  const withUrl = (url) => () => planRun(run(['web/e2e/harness.spec.ts'], { url }), f);
  assert.equal(withUrl('https://x.example/')().record.base_url, 'https://x.example');
  for (const url of ['http://x.example', 'https://x.example/login', 'https://x.example/?a=1', 'https://u:p@x.example', 'x.example', 'https://']) {
    refusal(withUrl(url), /https origin/);
  }
});

test('--keep: the container is started detached and left, and the walk is a docker exec in it', () => {
  const f = fixture();
  const plan = planRun(run(['web/e2e/harness.spec.ts'], { keep: true, extra: ['-g', 'no 404'] }), f);
  const outDir = path.join(f.outBase, RUN_ID);
  assert.deepEqual(plan.calls, [
    [
      'run', '-d', '--init', '--name', CONTAINER, '--shm-size', '1g',
      '--env-file', posix(f.webEnv),
      '-e', 'WALK_BOX_MODE=build', '-e', 'WALK_BASE_URL=http://localhost:3000', '-e', 'WALK_OUT=/out', '-e', 'WALK_SHOTS=0',
      ...mounts(f, outDir),
      WALK_IMAGE,
      'sleep', 'infinity',
    ],
    ['exec', '-e', 'WALK_OUT=/out', '-e', 'WALK_SHOTS=0', CONTAINER, 'bash', '/src/docker/walk/entry.sh', 'all', 'e2e/harness.spec.ts', '--', '-g', 'no 404'],
  ]);
  assert.equal(plan.record.kept, true);
});

test('--exec: more specs in a kept container, with a folder of their own under the box\'s', () => {
  const f = fixture({ env: { WALK_SHOTS: '1' } });
  fs.mkdirSync(path.join(f.outBase, RUN_ID), { recursive: true });
  const plan = planExec(
    { command: 'exec', url: null, keep: false, container: CONTAINER, specs: ['web/e2e/harness.spec.ts'], extra: ['-g', 'signed in'] },
    { ...f, now: LATER },
  );
  assert.equal(plan.runId, LATER_RUN_ID);
  assert.equal(plan.outDir, path.join(f.outBase, RUN_ID, `exec-${LATER_RUN_ID}`));
  assert.deepEqual(plan.calls, [
    [
      'exec', '-e', `WALK_OUT=/out/exec-${LATER_RUN_ID}`, '-e', 'WALK_SHOTS=1', CONTAINER,
      'bash', '/src/docker/walk/entry.sh', 'walk', 'e2e/harness.spec.ts', '--', '-g', 'signed in',
    ],
  ]);
  assert.equal(plan.record.box_run_id, RUN_ID);
});

test('--exec passes a share token by name when one is set (the walk signs in again)', () => {
  const f = fixture({ env: { WALK_VERCEL_SHARE: SECRET_SHARE } });
  fs.mkdirSync(path.join(f.outBase, RUN_ID), { recursive: true });
  const plan = planExec({ command: 'exec', url: null, keep: false, container: CONTAINER, specs: ['web/e2e/harness.spec.ts'], extra: [] }, f);
  assert.deepEqual(plan.calls[0].slice(0, 7), ['exec', '-e', `WALK_OUT=/out/exec-${RUN_ID}`, '-e', 'WALK_SHOTS=0', '-e', 'WALK_VERCEL_SHARE']);
});

test('--exec refuses a container whose run folder is not under the output folder', () => {
  const f = fixture();
  refusal(
    () => planExec({ command: 'exec', url: null, keep: false, container: CONTAINER, specs: ['web/e2e/harness.spec.ts'], extra: [] }, f),
    /no run folder/,
  );
});

test('--rm: docker rm -f of that one container', () => {
  assert.deepEqual(planRm({ command: 'rm', container: CONTAINER }).calls, [['rm', '-f', CONTAINER]]);
  refusal(() => planRm({ command: 'rm', container: 'sync' }), /not a walk box/);
});

test('no call names compose, a network, a port, another volume or another container', () => {
  const f = fixture({ env: { WALK_SHOTS: '1', WALK_VERCEL_SHARE: SECRET_SHARE } });
  fs.mkdirSync(path.join(f.outBase, RUN_ID), { recursive: true });
  const exec = { command: 'exec', url: null, keep: false, container: CONTAINER, specs: ['web/e2e/harness.spec.ts'], extra: [] };
  const calls = [
    ...planRun(run(['web/e2e/harness.spec.ts']), f).calls,
    ...planRun(run(['web/e2e/harness.spec.ts'], { keep: true }), f).calls,
    ...planRun(run(['web/e2e/harness.spec.ts'], { url: 'https://x.example' }), f).calls,
    ...planExec(exec, f).calls,
    ...planRm({ command: 'rm', container: CONTAINER }).calls,
  ];
  const forbidden = /^(compose|--network|--net|-p|--publish|-P|--volumes-from|--privileged|--pid|--ipc|--cap-add|-v|--volume)(=|$)/;
  for (const call of calls) {
    assert.ok(['run', 'exec', 'rm'].includes(call[0]), `docker ${call[0]}`);
    for (const word of call) assert.doesNotMatch(word, forbidden);
    const volumes = call.filter((word) => word.startsWith('type=volume'));
    for (const volume of volumes) assert.equal(volume, `type=volume,source=${NPM_CACHE_VOLUME},target=/npm-cache`);
    const names = call.filter((word) => word.startsWith('bb2dash-'));
    assert.deepEqual(names, [CONTAINER]);
  }
  const source = fs.readFileSync(path.join(REPO_ROOT, 'scripts', 'walk-box.mjs'), 'utf8');
  assert.doesNotMatch(source.replace(/^\s*(\/\/|\*|\/\*).*$/gm, ''), /compose/i);
});

/* ---------------------------------------------------------------------------------------------
 * What is refused before any container starts
 * ------------------------------------------------------------------------------------------ */

test('an output folder that is not absolute is refused', () => {
  refusal(() => assertOutBase('walk-out'), /absolute/);
  refusal(() => assertOutBase('./walk-out'), /absolute/);
  refusal(() => assertOutBase(''), /absolute/);
  const f = fixture({ env: { WALK_BOX_OUT: 'relative/out' } });
  refusal(() => planRun(run(['web/e2e/harness.spec.ts']), f), /absolute/);
});

test('an output folder inside a git checkout is refused: a repository, a worktree, at any depth', () => {
  const repository = scratch('walkbox-repo-');
  fs.mkdirSync(path.join(repository, '.git'));
  const worktree = scratch('walkbox-worktree-');
  write(worktree, '.git', 'gitdir: somewhere/else\n');
  for (const checkout of [repository, worktree]) {
    refusal(() => assertOutBase(checkout), /git checkout/);
    refusal(() => assertOutBase(path.join(checkout, 'docs', 'walks', 'walk-22')), /git checkout/);
  }
  const f = fixture();
  refusal(() => planRun(run(['web/e2e/harness.spec.ts']), { ...f, env: { WALK_BOX_OUT: path.join(f.root, 'out') } }), /git checkout/);
});

test('an output folder that leads into a checkout through a link is refused', () => {
  const repository = scratch('walkbox-repo-');
  fs.mkdirSync(path.join(repository, '.git'));
  fs.mkdirSync(path.join(repository, 'shots'));
  const outside = scratch('walkbox-outside-');
  const link = path.join(outside, 'walk-out');
  // A junction on Windows needs no privilege; elsewhere it is a plain symlink.
  fs.symlinkSync(path.join(repository, 'shots'), link, 'junction');
  refusal(() => assertOutBase(link), /git checkout/);
  refusal(() => assertOutBase(path.join(link, '22')), /git checkout/);
});

test('an output folder outside every checkout is taken, made or not', () => {
  const outside = scratch('walkbox-outside-');
  assert.equal(assertOutBase(outside), outside);
  assert.equal(assertOutBase(path.join(outside, 'not', 'made', 'yet')), path.join(outside, 'not', 'made', 'yet'));
});

test('a spec outside web/e2e is refused, however the path is written', () => {
  const f = fixture();
  const other = scratch('walkbox-other-');
  write(other, 'web/e2e/harness.spec.ts');
  const outside = [
    'web/src/elsewhere.spec.ts',
    'web/e2e/../src/elsewhere.spec.ts',
    path.join(other, 'web', 'e2e', 'harness.spec.ts'),
    'web/e2e',
  ];
  for (const spec of outside) refusal(() => specPaths(f.root, f.cwd, [spec]), /under web\/e2e/);
});

test('a spec that is not there, or is not a spec file, is refused', () => {
  const f = fixture();
  refusal(() => specPaths(f.root, f.cwd, ['web/e2e/missing.spec.ts']), /not a file/);
  refusal(() => specPaths(f.root, f.cwd, ['web/e2e/theme']), /\.spec\.ts/);
  refusal(() => specPaths(f.root, f.cwd, ['web/e2e/walk.ts']), /\.spec\.ts/);
});

test('specs are named twice over: as the repository has them and as the container runs them', () => {
  const f = fixture();
  assert.deepEqual(specPaths(f.root, f.cwd, ['web/e2e/harness.spec.ts', path.join(f.root, 'web', 'e2e', 'theme', 'walk22.spec.ts')]), [
    { repo: 'web/e2e/harness.spec.ts', box: 'e2e/harness.spec.ts' },
    { repo: 'web/e2e/theme/walk22.spec.ts', box: 'e2e/theme/walk22.spec.ts' },
  ]);
});

test('a missing web env file is refused for a build, and not asked for with --url', () => {
  const f = fixture();
  fs.rmSync(f.webEnv);
  refusal(() => planRun(run(['web/e2e/harness.spec.ts']), f), /web env file/);
  assert.equal(planRun(run(['web/e2e/harness.spec.ts'], { url: 'https://x.example' }), f).calls.length, 1);
});

test('a missing test login file is refused', () => {
  const f = fixture();
  fs.rmSync(f.loginEnv);
  refusal(() => planRun(run(['web/e2e/harness.spec.ts']), f), /test login file/);
  refusal(() => planRun(run(['web/e2e/harness.spec.ts'], { url: 'https://x.example' }), f), /test login file/);
});

test('WALK_BOX_WEB_ENV and WALK_BOX_LOGIN_ENV name other files, by absolute path', () => {
  const f = fixture();
  const elsewhere = scratch('walkbox-env-');
  const webEnv = write(elsewhere, 'web.env', 'A=1\n');
  const loginEnv = write(elsewhere, 'login.env', 'B=2\n');
  const plan = planRun(run(['web/e2e/harness.spec.ts']), { ...f, env: { WALK_BOX_WEB_ENV: webEnv, WALK_BOX_LOGIN_ENV: loginEnv } });
  const call = plan.calls[0];
  assert.equal(call[call.indexOf('--env-file') + 1], posix(webEnv));
  assert.ok(call.includes(`type=bind,source=${posix(loginEnv)},target=/work/.env.testing,readonly`));
  refusal(() => planRun(run(['web/e2e/harness.spec.ts']), { ...f, env: { WALK_BOX_WEB_ENV: 'web.env' } }), /absolute/);
  refusal(() => planRun(run(['web/e2e/harness.spec.ts']), { ...f, env: { WALK_BOX_LOGIN_ENV: '.env.testing' } }), /absolute/);
});

test('a path docker would read as two mount fields is refused', () => {
  const f = fixture();
  const odd = scratch('walkbox-odd,-');
  const loginEnv = write(odd, 'login.env', 'B=2\n');
  refusal(() => planRun(run(['web/e2e/harness.spec.ts']), { ...f, env: { WALK_BOX_LOGIN_ENV: loginEnv } }), /comma/);
});

/* ---------------------------------------------------------------------------------------------
 * main(): the run folder, run.json, the exit code
 * ------------------------------------------------------------------------------------------ */

const COMMIT = '0123456789abcdef0123456789abcdef01234567';

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

test('main --keep: a container that did not start is not walked', async () => {
  const f = fixture();
  const { deps, seen } = harness(f, { exits: [125] });
  assert.equal(await main(['--keep', 'web/e2e/harness.spec.ts'], deps), 125);
  assert.equal(seen.docker.length, 1);
});

test('main --exec: its own folder and run.json under the box\'s folder', async () => {
  const f = fixture();
  const first = harness(f, { times: [NOW] });
  assert.equal(await main(['--keep', 'web/e2e/harness.spec.ts'], first.deps), 0);
  const second = harness(f, { times: [LATER], exits: [1] });
  assert.equal(await main(['--exec', CONTAINER, 'web/e2e/harness.spec.ts'], second.deps), 1);
  const outDir = path.join(f.outBase, RUN_ID, `exec-${LATER_RUN_ID}`);
  assert.equal(second.seen.docker[0].options.logFile, path.join(outDir, 'stdout.log'));
  const record = JSON.parse(fs.readFileSync(path.join(outDir, 'run.json'), 'utf8'));
  assert.equal(record.command, 'exec');
  assert.equal(record.run_id, LATER_RUN_ID);
  assert.equal(record.box_run_id, RUN_ID);
  assert.equal(record.exit_code, 1);
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
      fs.readFileSync(path.join(outDir, 'run.json'), 'utf8'),
      fs.readFileSync(path.join(outDir, `exec-${LATER_RUN_ID}`, 'run.json'), 'utf8'),
    ].join('\n');
    for (const secret of secrets) assert.ok(!told.includes(secret), `a value leaked by ${argv.join(' ')}`);
  }
});

test('the script reads neither env file: it only asks whether each is there', () => {
  const source = fs.readFileSync(path.join(REPO_ROOT, 'scripts', 'walk-box.mjs'), 'utf8');
  // The one file it reads is web/package.json, for the Playwright version.
  const reads = source.match(/readFileSync\([^)]*\)/g) ?? [];
  assert.deepEqual(reads, ["readFileSync(path.join(root, 'web', 'package.json'), 'utf8')"]);
});

/* ---------------------------------------------------------------------------------------------
 * The script that runs inside the container
 * ------------------------------------------------------------------------------------------ */

test('docker/walk/entry.sh is a bash script with LF line ends that stops at the first failure', () => {
  const entry = fs.readFileSync(path.join(REPO_ROOT, 'docker', 'walk', 'entry.sh'));
  assert.equal(entry.includes(0x0d), false, 'a CR in a shell script stops it from running');
  const text = entry.toString('utf8');
  assert.ok(text.startsWith('#!/usr/bin/env bash\n'));
  assert.match(text, /^set -euo pipefail$/m);
});

test('entry.sh copies web/ without what a build must not inherit, and never copies the login file', () => {
  const text = fs.readFileSync(path.join(REPO_ROOT, 'docker', 'walk', 'entry.sh'), 'utf8');
  for (const left of ['./node_modules', './.next', './e2e/.auth', './e2e/.results', "'./.env*'"]) {
    assert.ok(text.includes(`--exclude=${left}`), `--exclude=${left}`);
  }
  const code = text.replace(/^\s*#.*$/gm, '');
  assert.doesNotMatch(code, /\b(cp|cat|mv|tar)\b[^\n]*\.env\.testing/);
  assert.doesNotMatch(code, /\b(env|printenv|set -x)\b\s*$/m);
});

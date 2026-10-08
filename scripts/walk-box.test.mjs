// bb2dash :: scripts/walk-box.test.mjs
// The walk box (brief 103, task 0): one throwaway container that builds this worktree's web app,
// signs in with the test login and runs the named Playwright specs against it. This is the one
// command for all of its host tests:
//
//   node --test scripts/walk-box.test.mjs
//
// The tests are in three files, and this one reads the other two in (at the end):
//
//   scripts/walk-box.test.mjs        how the command line is read, the exact docker call for each
//                                    way of running, and what is refused before any container starts
//   scripts/walk-box-main.test.mjs   main(): the run folder, run.json, the exit code; and that no
//                                    value of an env file or of the environment is passed on
//   docker/walk/entry.test.mjs       the script that runs inside the container
//
// Docker is injected: nothing here starts a container, and nothing reads the real env files.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  CONTAINER_PREFIX,
  NPM_CACHE_VOLUME,
  WALK_IMAGE,
  assertOutBase,
  containerNameOf,
  imageFor,
  parseArgs,
  planExec,
  planRm,
  planRun,
  runIdOf,
  runIdOfContainer,
  specPaths,
} from './walk-box.mjs';
import { CONTAINER, LATER, LATER_RUN_ID, NOW, REPO_ROOT, RUN_ID, SECRET_SHARE, fixture, posix, refusal, run, scratch, write } from './walk-box-kit.mjs';

// The other two parts: read in here, so that the one command above runs every test.
import './walk-box-main.test.mjs';
import '../docker/walk/entry.test.mjs';

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
  // Asked first, and by itself: docker exec ends with 1 for a container that is gone, which is
  // also Playwright's code for a failed test.
  assert.deepEqual(plan.precheck, ['exec', CONTAINER, 'true']);
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
    planExec(exec, f).precheck,
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
 * No env file is opened
 * ------------------------------------------------------------------------------------------ */

test('the script reads neither env file: it only asks whether each is there', () => {
  const source = fs.readFileSync(path.join(REPO_ROOT, 'scripts', 'walk-box.mjs'), 'utf8');
  // The one file it reads is web/package.json, for the Playwright version.
  const reads = source.match(/readFileSync\([^)]*\)/g) ?? [];
  assert.deepEqual(reads, ["readFileSync(webPackageFile, 'utf8')"]);
  assert.match(source, /const webPackageFile = path\.join\(root, 'web', 'package\.json'\);/);
});

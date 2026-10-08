// bb2dash :: scripts/walk-box.mjs
// The walk box (brief 103, task 0): the one way a Phase 22 browser walk is run. From the root of
// the worktree whose build is under test:
//
//   node scripts/walk-box.mjs <spec under web/e2e>… [-- <playwright arguments such as -g "title">]
//
// It starts ONE throwaway container from the stock Playwright image, with this worktree mounted
// read-only. Inside, docker/walk/entry.sh copies web/ to a scratch folder, runs npm ci and
// npm run build, starts next on port 3000, signs in with web/e2e/login.mjs from the test login
// file, and runs the named specs. The script ends with Playwright's exit code.
//
//   --url <https origin>   no build and no server: that host is walked (WALK_VERCEL_SHARE is passed
//                          on, by name, when it is set)
//   --keep                 the container is left running and its name is printed. Nobody has to
//                          come back for it: it ends and removes itself after four hours
//   --exec <container> <spec>…   more specs in a kept container. web/e2e is read from the worktree
//                          as it is now; the app is the one the box built, so a change under
//                          web/src needs a new box
//   --rm <container>       remove a kept container
//
// Output: <home>/.bb2dash-walk/22/<run id>/ (WALK_BOX_OUT names another base folder), holding
// run.json, stdout.log, next.log, results/ and, with WALK_SHOTS=1, shots/. An --exec run has its
// own folder inside the box's: <run id>/exec-<run id>/. The folder is refused when it is not
// absolute or lies inside any git checkout: no shot and no answer is one `git add` from a public
// repository.
//
// Two files are handed in by path and never opened here: the web app's two public settings
// (<home>/.bb2dash-walk/web.env, or WALK_BOX_WEB_ENV; docker's --env-file) and the test login
// (<home>/projects/bb2dash/.env.testing, or WALK_BOX_LOGIN_ENV; mounted read-only at the scratch
// checkout's root, where login.mjs looks for it).
//
// Docker is called without a shell, as run, exec or rm, on a container this script named and on
// one volume of its own (the npm cache). No other container, network or volume is ever named.
//
// Exit: 0 passed, 1 tests failed (Playwright), 64 refused before any container started,
// 65 docker could not be started, 67 --exec named a box that is not running, 70 to 77 the box
// broke (docker/walk/entry.sh lists them; 77 is a walk that ran past its time limit), 125 to 127
// docker's own, 129, 130 and 143 the run was stopped by a signal.
//
// When this script is stopped, its box does not outlive it:
//   * Ctrl-C, a plain kill or a closed terminal (SIGINT, SIGTERM, SIGHUP): the box this run started
//     is removed with `docker rm -f`, the docker client is ended, and run.json says "interrupted".
//     The same is done when a docker call itself ends with a signal's exit code. An --exec run
//     never removes the kept box: another run started it.
//   * A hard kill, which no script can catch (a tool's time limit on Windows, the task manager):
//     run.json stays at "running". The box ends by itself, because every step inside it has a
//     time limit (docker/walk/entry.sh; under two hours in all), and removes itself, because every
//     box is started with --rm. What the walk found is then in results/.last-run.json, which
//     Playwright writes itself. Start a walk with a time limit of ten minutes or more, or in the
//     background, and read run.json.
//
// Importing this module has no side effects.

import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const USAGE = [
  'usage: node scripts/walk-box.mjs [--url <https origin>] [--keep] <spec under web/e2e>… [-- <playwright arguments>]',
  '       node scripts/walk-box.mjs --exec <container> <spec under web/e2e>… [-- <playwright arguments>]',
  '       node scripts/walk-box.mjs --rm <container>',
].join('\n');

/** How a call ends when no walk decided it. */
export const EXIT = Object.freeze({ passed: 0, testsFailed: 1, refused: 64, docker: 65, internal: 66, noBox: 67 });

/** The stock image. Its tag is web/package.json's @playwright/test version (`imageFor`). */
const IMAGE_REPOSITORY = 'mcr.microsoft.com/playwright';
export const WALK_IMAGE = `${IMAGE_REPOSITORY}:v1.63.0-noble`;
/** The one volume of the walk box's own: npm's download cache, shared by every run. */
export const NPM_CACHE_VOLUME = 'bb2dash-walk-npm-cache';
export const CONTAINER_PREFIX = 'bb2dash-walk22-';
const LOCAL_BASE_URL = 'http://localhost:3000';

/** Where things are inside the container (docker/walk/entry.sh reads the same paths). */
const BOX = Object.freeze({
  src: '/src',
  login: '/work/.env.testing',
  out: '/out',
  npmCache: '/npm-cache',
  entry: '/src/docker/walk/entry.sh',
});
const SHARE_VARIABLE = 'WALK_VERCEL_SHARE';
const SHM_SIZE = '1g';
const RECORD_SCHEMA = 1;

const HOUR_S = 60 * 60;
/**
 * How long a kept box lives when nobody removes it: it is started with --rm and a sleep of this
 * length, so one that is forgotten ends and removes itself. Long enough for a sitting of --exec
 * runs; entry.sh's own limits add up to under two hours.
 */
export const KEPT_BOX_LIFE_S = 4 * HOUR_S;

/** What entry.sh's own exit codes mean (its header lists them). */
const BOX_FAILURES = Object.freeze({
  70: 'entry.sh was called wrongly',
  71: 'copy',
  72: 'npm ci',
  73: 'build',
  74: 'server',
  75: 'sign-in',
  76: 'results',
  77: 'the walk ran past its time limit',
});
const DOCKER_OWN_EXITS = Object.freeze([125, 126, 127]);

/** The signals that ask this script to stop: Ctrl-C, a plain kill, a closed terminal. */
const INTERRUPTS = Object.freeze(['SIGINT', 'SIGTERM', 'SIGHUP']);
const SIGNAL_EXIT_BASE = 128;
/** What a process ended by a signal exits with, by the shell's rule (128 + the signal's number). */
const exitOfSignal = (name) => SIGNAL_EXIT_BASE + (os.constants.signals[name] ?? 0);
/**
 * A docker call that ends with one of these was stopped by a signal: its client, or the box's
 * first process. The client can be gone while the box is still up.
 */
const SIGNAL_EXITS = Object.freeze(Object.fromEntries([...INTERRUPTS, 'SIGKILL'].map((name) => [exitOfSignal(name), name])));
/** How long `docker rm -f` of this run's own box may take, and how long its client may take to end. */
const REMOVE_LIMIT_MS = 60_000;
const CLIENT_END_LIMIT_MS = 10_000;

/** A refusal: said in one line, before any container starts. */
export class WalkBoxError extends Error {
  constructor(message) {
    super(message);
    this.name = 'WalkBoxError';
  }
}
const refused = (message) => new WalkBoxError(message);

const posix = (file) => path.resolve(file).split(path.sep).join('/');

/* ---------------------------------------------------------------------------------------------
 * The command line
 * ------------------------------------------------------------------------------------------ */

const VALUE_FLAGS = Object.freeze(['--url', '--exec', '--rm']);
const FLAGS = Object.freeze([...VALUE_FLAGS, '--keep']);

/** The script's own words (before `--`) as flags and specs. Throws on a flag it does not know or sees twice. */
function readOwnWords(own) {
  const flags = {};
  const specs = [];
  for (let i = 0; i < own.length; i += 1) {
    const word = own[i];
    if (!word.startsWith('-')) {
      specs.push(word);
    } else if (!FLAGS.includes(word)) {
      throw refused(`"${word}" is not an option of the walk box; Playwright's own arguments go after --\n${USAGE}`);
    } else if (word in flags) {
      throw refused(`${word} is given twice`);
    } else if (VALUE_FLAGS.includes(word)) {
      const value = own[i + 1];
      if (value === undefined || value.startsWith('-')) throw refused(`${word} takes a value\n${USAGE}`);
      flags[word] = value;
      i += 1;
    } else {
      flags[word] = true;
    }
  }
  return { flags, specs };
}

/** Parse argv (everything after the script path). Throws a WalkBoxError on anything it cannot read exactly. */
export function parseArgs(argv) {
  if (argv.length === 0) throw refused(USAGE);
  const split = argv.indexOf('--');
  const extra = split === -1 ? [] : argv.slice(split + 1);
  const { flags, specs } = readOwnWords(split === -1 ? argv : argv.slice(0, split));
  const url = flags['--url'] ?? null;
  const keep = flags['--keep'] === true;
  const exec = flags['--exec'] ?? null;
  const rm = flags['--rm'] ?? null;

  if (exec !== null && rm !== null) throw refused('--exec and --rm: one of them, not both');
  if (rm !== null) {
    if (specs.length > 0 || extra.length > 0 || keep || url !== null) throw refused("--rm takes the container's name and nothing else");
    return { command: 'rm', url: null, keep: false, container: rm, specs: [], extra: [] };
  }
  if (exec !== null && keep) throw refused('--keep starts a new box; it does not go with --exec');
  if (exec !== null && url !== null) throw refused('--url starts a new box; it does not go with --exec');
  if (specs.length === 0) throw refused(`name at least one spec file under web/e2e\n${USAGE}`);
  return { command: exec === null ? 'run' : 'exec', url, keep, container: exec, specs, extra };
}

/* ---------------------------------------------------------------------------------------------
 * Names
 * ------------------------------------------------------------------------------------------ */

/** A run's id: the UTC time to the second, as 20261008T051500Z. */
export function runIdOf(date) {
  return `${date.toISOString().slice(0, 19).replace(/[-:]/g, '')}Z`;
}

export function containerNameOf(runId) {
  return `${CONTAINER_PREFIX}${runId.toLowerCase()}`;
}

const CONTAINER_NAME = new RegExp(`^${CONTAINER_PREFIX}([0-9]{8}t[0-9]{6}z)$`);

/** The run id a container was named after. Refuses every name this script did not make. */
export function runIdOfContainer(name) {
  const match = CONTAINER_NAME.exec(name);
  if (match === null) throw refused(`"${name}" is not a walk box: its name is ${CONTAINER_PREFIX}<run id>, as --keep prints it`);
  return match[1].toUpperCase();
}

/* ---------------------------------------------------------------------------------------------
 * The image
 * ------------------------------------------------------------------------------------------ */

/** The image for this checkout: the stock one, refused unless web/package.json pins the same Playwright. */
export function imageFor(root) {
  const webPackageFile = path.join(root, 'web', 'package.json');
  let version;
  try {
    version = JSON.parse(fs.readFileSync(webPackageFile, 'utf8'))?.devDependencies?.['@playwright/test'];
  } catch (error) {
    throw refused(`web/package.json could not be read: ${error.message}`);
  }
  if (typeof version !== 'string') throw refused('web/package.json names no @playwright/test in devDependencies');
  if (`${IMAGE_REPOSITORY}:v${version}-noble` !== WALK_IMAGE) {
    throw refused(
      `web/package.json has @playwright/test ${version}, and the walk box's image is ${WALK_IMAGE}: ` +
        'the browsers in the image fit one version only. Change WALK_IMAGE in scripts/walk-box.mjs with it.',
    );
  }
  return WALK_IMAGE;
}

/* ---------------------------------------------------------------------------------------------
 * Paths: the output folder, the specs, the two files handed in
 * ------------------------------------------------------------------------------------------ */

/** The path with every link followed, as far as the path exists; what is not there yet is kept as written. */
function realPathOf(file) {
  try {
    return fs.realpathSync.native(file);
  } catch (error) {
    if (error.code !== 'ENOENT' && error.code !== 'ENOTDIR') throw error;
    const parent = path.dirname(file);
    return parent === file ? file : path.join(realPathOf(parent), path.basename(file));
  }
}

/** Whether one absolute path is under another, read as written. The folder itself is not under itself. */
function isUnder(folder, file) {
  const fromFolder = path.relative(folder, file);
  return fromFolder !== '' && fromFolder !== '..' && !fromFolder.startsWith(`..${path.sep}`) && !path.isAbsolute(fromFolder);
}

/** The git checkout a folder is in (a repository has a `.git` folder, a worktree a `.git` file), or null. */
function checkoutAbove(folder) {
  for (let dir = folder; ; dir = path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, '.git'))) return dir;
    if (path.dirname(dir) === dir) return null;
  }
}

/** The base output folder, refused unless it is absolute and outside every git checkout, links followed. */
export function assertOutBase(dir) {
  if (typeof dir !== 'string' || !path.isAbsolute(dir)) {
    throw refused('the output folder must be an absolute path (WALK_BOX_OUT)');
  }
  const folder = path.resolve(dir);
  const checkout = checkoutAbove(folder) ?? checkoutAbove(realPathOf(folder));
  if (checkout !== null) {
    throw refused(`the output folder is inside a git checkout (${posix(checkout)}): a walk's output belongs outside every repository`);
  }
  return folder;
}

const SPEC_SUFFIX = '.spec.ts';
const BOX_PATH = /^[A-Za-z0-9._/-]+$/;

/** Each spec as the repository has it and as the container runs it. Refuses anything not a spec file under web/e2e. */
export function specPaths(root, cwd, specs) {
  const e2e = path.join(root, 'web', 'e2e');
  return specs.map((spec) => {
    const file = path.resolve(cwd, spec);
    if (!isUnder(e2e, file) || !isUnder(realPathOf(e2e), realPathOf(file))) {
      throw refused(`"${spec}" is not under web/e2e of this worktree (${posix(root)}): start the script from the worktree under test`);
    }
    if (!file.endsWith(SPEC_SUFFIX)) throw refused(`"${spec}" is not a spec: a spec file's name ends in ${SPEC_SUFFIX}`);
    if (!fs.statSync(file, { throwIfNoEntry: false })?.isFile()) throw refused(`"${spec}" is not a file`);
    const inE2e = path.relative(e2e, file).split(path.sep).join('/');
    if (!BOX_PATH.test(inE2e)) throw refused(`"${spec}" has a character in its path the walk box does not pass on`);
    return { repo: `web/e2e/${inE2e}`, box: `e2e/${inE2e}` };
  });
}

/** A file named by an override or by its default place. An override is an absolute path. */
function fileSetting(asked, standard, variable) {
  if (asked === undefined || asked === '') return standard;
  if (!path.isAbsolute(asked)) throw refused(`${variable} must be an absolute path`);
  return path.resolve(asked);
}

/** What the environment says, by name and by path. No file is opened and no value is kept. */
function settingsFrom({ env, home }) {
  const walkHome = path.join(home, '.bb2dash-walk');
  const outAsked = env.WALK_BOX_OUT === undefined || env.WALK_BOX_OUT === '' ? path.join(walkHome, '22') : env.WALK_BOX_OUT;
  return {
    outBase: assertOutBase(outAsked),
    webEnv: fileSetting(env.WALK_BOX_WEB_ENV, path.join(walkHome, 'web.env'), 'WALK_BOX_WEB_ENV'),
    loginEnv: fileSetting(env.WALK_BOX_LOGIN_ENV, path.join(home, 'projects', 'bb2dash', '.env.testing'), 'WALK_BOX_LOGIN_ENV'),
    shots: env.WALK_SHOTS === '1',
    share: (env[SHARE_VARIABLE] ?? '') !== '',
  };
}

function requireFile(file, what, variable) {
  if (!fs.statSync(file, { throwIfNoEntry: false })?.isFile()) {
    throw refused(`the ${what} is not there: ${posix(file)} (${variable} names another)`);
  }
}

/** A host path as one field of docker's --mount, which splits its value at commas. */
function mountSource(file) {
  const source = posix(file);
  if (source.includes(',')) throw refused(`${source} has a comma in its path, which docker reads as the end of a mount field`);
  return source;
}

const HTTPS_ORIGIN = '--url takes an https origin, as in https://host.example: no path, no query, no sign-in';

function originOf(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw refused(HTTPS_ORIGIN);
  }
  const plain =
    url.protocol === 'https:' && url.username === '' && url.password === '' && url.pathname === '/' && url.search === '' && url.hash === '';
  if (!plain) throw refused(HTTPS_ORIGIN);
  return url.origin;
}

/* ---------------------------------------------------------------------------------------------
 * The docker calls, as plans: nothing here starts anything
 * ------------------------------------------------------------------------------------------ */

/** What one walk in a container is told: where its output goes and whether it may shoot. */
function walkEnv(out, shots) {
  return ['-e', `WALK_OUT=${out}`, '-e', `WALK_SHOTS=${shots ? '1' : '0'}`];
}

function entryCall(phase, specs, extra) {
  return ['bash', BOX.entry, phase, ...specs.map((spec) => spec.box), '--', ...extra];
}

/**
 * `docker run …` up to and including the image: the container's name, settings and mounts. Every
 * box is started with --rm, so one that ends, however it ends, removes itself.
 */
function createCall({ detached, container, mode, baseUrl, settings, root, outDir, image }) {
  return [
    'run', ...(detached ? ['-d'] : []), '--rm', '--init', '--name', container, '--shm-size', SHM_SIZE,
    ...(mode === 'build' ? ['--env-file', posix(settings.webEnv)] : []),
    '-e', `WALK_BOX_MODE=${mode}`, '-e', `WALK_BASE_URL=${baseUrl}`,
    ...walkEnv(BOX.out, settings.shots),
    // By name only: docker takes the value from its own environment, so it is in no argument.
    ...(mode === 'url' && settings.share ? ['-e', SHARE_VARIABLE] : []),
    '--mount', `type=bind,source=${mountSource(root)},target=${BOX.src},readonly`,
    '--mount', `type=bind,source=${mountSource(settings.loginEnv)},target=${BOX.login},readonly`,
    '--mount', `type=bind,source=${mountSource(outDir)},target=${BOX.out}`,
    '--mount', `type=volume,source=${NPM_CACHE_VOLUME},target=${BOX.npmCache}`,
    image,
  ];
}

/** A new box: one `docker run --rm`, or with --keep a detached container and the walk as an exec in it. */
export function planRun(args, ctx) {
  const settings = settingsFrom(ctx);
  const image = imageFor(ctx.root);
  const specs = specPaths(ctx.root, ctx.cwd, args.specs);
  const mode = args.url === null ? 'build' : 'url';
  const baseUrl = args.url === null ? LOCAL_BASE_URL : originOf(args.url);
  if (mode === 'build') requireFile(settings.webEnv, 'web env file', 'WALK_BOX_WEB_ENV');
  requireFile(settings.loginEnv, 'test login file', 'WALK_BOX_LOGIN_ENV');

  const runId = runIdOf(ctx.now);
  const container = containerNameOf(runId);
  const outDir = path.join(settings.outBase, runId);
  const create = createCall({ detached: args.keep, container, mode, baseUrl, settings, root: ctx.root, outDir, image });
  const walk = entryCall('all', specs, args.extra);
  const calls = args.keep
    ? [[...create, 'sleep', String(KEPT_BOX_LIFE_S)], ['exec', ...walkEnv(BOX.out, settings.shots), container, ...walk]]
    : [[...create, ...walk]];
  const record = {
    schema: RECORD_SCHEMA,
    run_id: runId,
    command: 'run',
    container,
    kept: args.keep,
    mode,
    base_url: baseUrl,
    image,
    worktree: posix(ctx.root),
    specs: specs.map((spec) => spec.repo),
    args: [...args.extra],
    shots: settings.shots,
  };
  // ownsBox: this run starts the container, so this run removes it when it is stopped.
  return { runId, container, outDir, calls, record, ownsBox: true };
}

/**
 * More specs in a kept box: one `docker exec`, with a folder of its own inside the box's.
 * `precheck` is asked first: docker exec ends with 1 for a container that is gone or stopped,
 * and 1 is also Playwright's code for a failed test.
 */
export function planExec(args, ctx) {
  const settings = settingsFrom(ctx);
  const boxRunId = runIdOfContainer(args.container);
  const specs = specPaths(ctx.root, ctx.cwd, args.specs);
  const boxDir = path.join(settings.outBase, boxRunId);
  if (!fs.statSync(boxDir, { throwIfNoEntry: false })?.isDirectory()) {
    throw refused(`no run folder for ${args.container} under ${posix(settings.outBase)}: it was started with another WALK_BOX_OUT, or not by this script`);
  }
  const runId = runIdOf(ctx.now);
  const folder = `exec-${runId}`;
  const call = [
    'exec',
    ...walkEnv(`${BOX.out}/${folder}`, settings.shots),
    // The walk signs in again, so a share token set now replaces the one the box was started with.
    ...(settings.share ? ['-e', SHARE_VARIABLE] : []),
    args.container,
    ...entryCall('walk', specs, args.extra),
  ];
  const record = {
    schema: RECORD_SCHEMA,
    run_id: runId,
    command: 'exec',
    container: args.container,
    box_run_id: boxRunId,
    worktree: posix(ctx.root),
    specs: specs.map((spec) => spec.repo),
    args: [...args.extra],
    shots: settings.shots,
  };
  const precheck = ['exec', args.container, 'true'];
  // ownsBox: another run started the container and was asked to keep it; this run never removes it.
  return { runId, container: args.container, outDir: path.join(boxDir, folder), precheck, calls: [call], record, ownsBox: false };
}

/** Remove a kept box: `docker rm -f` of that one container. */
export function planRm(args) {
  runIdOfContainer(args.container);
  return { container: args.container, calls: [['rm', '-f', args.container]] };
}

/* ---------------------------------------------------------------------------------------------
 * main(): the run folder, run.json, the calls
 * ------------------------------------------------------------------------------------------ */

/** What a walk's exit code says, in words, for run.json. */
export function resultOf(code) {
  if (code === EXIT.passed) return 'passed';
  if (code === EXIT.testsFailed) return 'tests failed';
  if (code === EXIT.docker) return 'docker could not be started';
  if (Object.hasOwn(BOX_FAILURES, code)) return `box failed: ${BOX_FAILURES[code]}`;
  return DOCKER_OWN_EXITS.includes(code) ? `docker failed (${code})` : `ended with exit code ${code}`;
}

/** The commit under test and whether the worktree differs from it. Refuses a folder git cannot read. */
function checkoutState(git) {
  try {
    return { commit: git(['rev-parse', 'HEAD']).trim(), dirty: git(['status', '--porcelain']).trim() !== '' };
  } catch (error) {
    throw refused(`git could not read this worktree: ${String(error?.message).split('\n')[0]}`);
  }
}

function makeRunFolder(outDir) {
  fs.mkdirSync(path.dirname(outDir), { recursive: true });
  try {
    fs.mkdirSync(outDir);
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    throw refused(`the run folder ${posix(outDir)} is already there: a run id is the UTC second it started in, so start it again`);
  }
}

function writeRecord(outDir, record) {
  fs.writeFileSync(path.join(outDir, 'run.json'), `${JSON.stringify(record, null, 2)}\n`);
}

/**
 * Each call in turn, stopping at the first that does not end with 0. Returns the exit code and
 * how many calls ended with 0. `stop` ends the docker client of the call in hand; the code is then
 * null, and no further call is made.
 */
async function runCalls(calls, logFile, deps, stop = null) {
  let done = 0;
  try {
    for (const argv of calls) {
      if (stop?.aborted) return { code: null, done };
      const code = await deps.docker(argv, { logFile, signal: stop ?? undefined });
      if (code !== EXIT.passed) return { code, done };
      done += 1;
    }
    return { code: EXIT.passed, done };
  } catch (error) {
    if (stop?.aborted) return { code: null, done };
    deps.err(`walk-box: docker could not be started: ${error?.message}`);
    return { code: EXIT.docker, done };
  }
}

/** Waits for `promise`, for `ms` at most. Returns what it resolved with, or null when the time ran out first. */
async function within(ms, promise) {
  let timer;
  const limit = new Promise((resolve) => {
    timer = setTimeout(resolve, ms, null);
  });
  try {
    return await Promise.race([promise, limit]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Waits for the first signal that asks this script to stop. `interrupted` resolves with the
 * signal's name. While the watch is on, a signal does not end the process: the box is removed and
 * run.json finished first, and a second signal in that time changes nothing. `stop()` ends the
 * watch.
 */
export function watchSignals(emitter = process) {
  let tell;
  const interrupted = new Promise((resolve) => {
    tell = (name) => resolve(name);
  });
  for (const name of INTERRUPTS) emitter.on(name, tell);
  return {
    interrupted,
    stop: () => {
      for (const name of INTERRUPTS) emitter.off(name, tell);
    },
  };
}

/** `docker rm -f` of the box this run started. Returns whether docker said it is removed. */
async function removeBox(container, deps) {
  let code;
  try {
    code = await deps.docker(['rm', '-f', container], { logFile: null, signal: AbortSignal.timeout(REMOVE_LIMIT_MS) });
  } catch (error) {
    deps.err(`walk-box: docker rm -f ${container} could not be run: ${error?.message}`);
    return false;
  }
  if (code === EXIT.passed) return true;
  deps.err(`walk-box: docker rm -f ${container} ended with ${code}: look with docker ps -a --filter name=${container}`);
  return false;
}

/**
 * The plan's calls, watched. Two things mean the docker client is gone while the box may not be:
 * a signal to this script, and a call that ends with a signal's exit code. On either, the box this
 * run started is removed (a kept box that another run started is left), the client is ended, and
 * the run is told as interrupted. So run.json never says a run ended while its own box is up.
 */
async function runWatched(plan, logFile, deps) {
  const watch = deps.watch();
  const client = new AbortController();
  const calls = runCalls(plan.calls, logFile, deps, client.signal);
  try {
    const first = await Promise.race([calls, watch.interrupted.then((signal) => ({ signal }))]);
    const signal = first.signal ?? SIGNAL_EXITS[first.code] ?? null;
    if (signal === null) return { code: first.code, done: first.done, interrupted: null };
    const removed = plan.ownsBox ? await removeBox(plan.container, deps) : false;
    client.abort();
    await within(CLIENT_END_LIMIT_MS, calls);
    return { code: first.code ?? exitOfSignal(signal), done: 0, interrupted: { signal, removed } };
  } finally {
    watch.stop();
  }
}

/** An interrupted run, in words, for run.json. */
function interruptedResult(plan, { signal, removed }) {
  if (!plan.ownsBox) return `interrupted (${signal}), kept box left running`;
  return `interrupted (${signal}), box ${removed ? 'removed' : 'not removed'}`;
}

/** Whether the box a plan needs is running: 0 when it is, or when the plan needs none. */
async function askBox(plan, deps) {
  if (plan.precheck === undefined) return EXIT.passed;
  const { code } = await runCalls([plan.precheck], null, deps);
  if (code === EXIT.passed || code === EXIT.docker) return code;
  deps.err(`walk-box: ${plan.container} is not running (docker exec ended with ${code}): start a new box with --keep`);
  return EXIT.noBox;
}

function announce(plan, log) {
  log(`walk-box: run ${plan.runId} in ${plan.container}`);
  log(`walk-box: output ${posix(plan.outDir)}`);
}

/** Said only for a kept box whose container did start: a name that was never taken is not handed on. */
function sayKept(plan, started, log) {
  if (plan.record.kept !== true || !started) return;
  log(`walk-box: ${plan.container} is left running, for ${KEPT_BOX_LIFE_S / HOUR_S} hours at most. More specs, then remove it:`);
  log(`  node scripts/walk-box.mjs --exec ${plan.container} <spec under web/e2e>…`);
  log(`  node scripts/walk-box.mjs --rm ${plan.container}`);
}

/** Said when an --exec run is stopped: the kept box is another run's, and the walk in it was not ended. */
function sayLeft(plan, log) {
  log(`walk-box: ${plan.container} is a kept box and is left running; the walk inside it may go on to its own limit. Remove it with:`);
  log(`  node scripts/walk-box.mjs --rm ${plan.container}`);
}

async function walk(args, deps) {
  const startedAt = deps.now();
  const ctx = { root: deps.root, cwd: deps.cwd, env: deps.env, home: deps.home, now: startedAt };
  const plan = args.command === 'exec' ? planExec(args, ctx) : planRun(args, ctx);
  const started = {
    ...plan.record,
    ...checkoutState(deps.git),
    started_at: startedAt.toISOString(),
    finished_at: null,
    duration_s: null,
    exit_code: null,
    result: 'running',
  };
  const box = await askBox(plan, deps);
  if (box !== EXIT.passed) return box;
  makeRunFolder(plan.outDir);
  writeRecord(plan.outDir, started);
  announce(plan, deps.log);

  const { code, done, interrupted } = await runWatched(plan, path.join(plan.outDir, 'stdout.log'), deps);
  const finishedAt = deps.now();
  const result = interrupted === null ? resultOf(code) : interruptedResult(plan, interrupted);
  writeRecord(plan.outDir, {
    ...started,
    finished_at: finishedAt.toISOString(),
    duration_s: Math.round((finishedAt.getTime() - startedAt.getTime()) / 1000),
    exit_code: code,
    result,
  });
  deps.log(`walk-box: ${result} (exit ${code}); run.json and stdout.log are in ${posix(plan.outDir)}`);
  if (interrupted === null) sayKept(plan, done > 0, deps.log);
  else if (!plan.ownsBox) sayLeft(plan, deps.log);
  return code;
}

async function remove(args, deps) {
  const plan = planRm(args);
  const { code } = await runCalls(plan.calls, null, deps);
  deps.log(code === EXIT.passed ? `walk-box: ${plan.container} is removed` : `walk-box: docker rm ended with ${code}`);
  return code;
}

/** The docker client: found on PATH by this name. A test names a stand-in instead; nothing else does. */
export const DOCKER_CLIENT = Object.freeze(['docker']);

/**
 * Start docker with these arguments and no shell; what it prints goes to the console and to the
 * log file. Resolves with its exit code (128 + the signal's number when a signal ended it), and
 * rejects when it cannot be started or when `signal` ends it.
 */
export function runDocker(argv, { logFile = null, client = DOCKER_CLIENT, out = process.stdout, err = process.stderr, signal } = {}) {
  return new Promise((resolve, reject) => {
    const log = logFile === null ? null : fs.createWriteStream(logFile, { flags: 'a' });
    let settled = false;
    const settle = (finish) => {
      if (settled) return;
      settled = true;
      if (log === null) finish();
      else log.end(finish);
    };
    log?.on('error', (error) => settle(() => reject(error)));
    const child = spawn(client[0], [...client.slice(1), ...argv], { stdio: ['ignore', 'pipe', 'pipe'], shell: false, windowsHide: true, signal });
    const tee = (from, to) =>
      from.on('data', (chunk) => {
        to.write(chunk);
        if (!settled) log?.write(chunk);
      });
    tee(child.stdout, out);
    tee(child.stderr, err);
    child.once('error', (error) => settle(() => reject(error)));
    child.once('close', (code, killedBy) => settle(() => resolve(code ?? (killedBy === null ? EXIT.docker : exitOfSignal(killedBy)))));
  });
}

function dependencies(deps) {
  const root = deps.root ?? REPO_ROOT;
  return {
    root,
    cwd: process.cwd(),
    env: process.env,
    home: os.homedir(),
    now: () => new Date(),
    git: (args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }),
    docker: runDocker,
    watch: () => watchSignals(process),
    log: (line) => process.stdout.write(`${line}\n`),
    err: (line) => process.stderr.write(`${line}\n`),
    ...deps,
  };
}

/**
 * Run the CLI. Returns the exit code; it never calls process.exit, so tests can drive it. `deps`
 * is injected by the tests: with `docker` and `git` given, nothing starts a container or reads git.
 */
export async function main(argv, deps = {}) {
  const all = dependencies(deps);
  try {
    const args = parseArgs(argv);
    return args.command === 'rm' ? await remove(args, all) : await walk(args, all);
  } catch (error) {
    if (!(error instanceof WalkBoxError)) throw error;
    all.err(`walk-box: ${error.message}`);
    return EXIT.refused;
  }
}

/* ---------------------------------------------------------------------------------------------
 * CLI entry point (nothing above this line runs on import)
 * ------------------------------------------------------------------------------------------ */

/** Whether node was started with this file. Node says so itself from 24.2; before that the two paths are compared. */
function isEntryPoint() {
  if (typeof import.meta.main === 'boolean') return import.meta.main;
  return process.argv[1] !== undefined && realPathOf(path.resolve(process.argv[1])) === realPathOf(fileURLToPath(import.meta.url));
}

if (isEntryPoint()) {
  main(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code;
    },
    (error) => {
      process.stderr.write(`walk-box: ${error?.stack ?? error}\n`);
      process.exitCode = EXIT.internal;
    },
  );
}

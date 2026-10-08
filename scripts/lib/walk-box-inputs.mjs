// bb2dash :: scripts/lib/walk-box-inputs.mjs
// What the walk box is handed (scripts/walk-box.mjs), and the rule each thing is held to before
// any container starts: the output folder, the spec files, the two files named by path, and the
// host of --url. Everything here refuses by throwing a WalkBoxError. Nothing here starts anything,
// and no file handed in is opened: a file is only asked whether it is there.
//
// Importing this module has no side effects.

import fs from 'node:fs';
import path from 'node:path';

/** A refusal: said in one line, before any container starts. */
export class WalkBoxError extends Error {
  constructor(message) {
    super(message);
    this.name = 'WalkBoxError';
  }
}
export const refused = (message) => new WalkBoxError(message);

/** A path made absolute, with forward slashes: how docker and run.json are given it. */
export const posix = (file) => path.resolve(file).split(path.sep).join('/');

/* ---------------------------------------------------------------------------------------------
 * The output folder and the specs
 * ------------------------------------------------------------------------------------------ */

/** The path with every link followed, as far as the path exists; what is not there yet is kept as written. */
export function realPathOf(file) {
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

/* ---------------------------------------------------------------------------------------------
 * The two files handed in by path
 * ------------------------------------------------------------------------------------------ */

/** A file named by an override or by its default place. An override is an absolute path. */
export function fileSetting(asked, standard, variable) {
  if (asked === undefined || asked === '') return standard;
  if (!path.isAbsolute(asked)) throw refused(`${variable} must be an absolute path`);
  return path.resolve(asked);
}

export function requireFile(file, what, variable) {
  if (!fs.statSync(file, { throwIfNoEntry: false })?.isFile()) {
    throw refused(`the ${what} is not there: ${posix(file)} (${variable} names another)`);
  }
}

/** A host path as one field of docker's --mount, which splits its value at commas. */
export function mountSource(file) {
  const source = posix(file);
  if (source.includes(',')) throw refused(`${source} has a comma in its path, which docker reads as the end of a mount field`);
  return source;
}

/* ---------------------------------------------------------------------------------------------
 * The host of --url
 * ------------------------------------------------------------------------------------------ */

const HTTPS_ORIGIN = '--url takes an https origin, as in https://host.example: no path, no query, no sign-in';

export function originOf(value) {
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

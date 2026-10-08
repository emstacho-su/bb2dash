/**
 * Whether a file is inside a folder: the one reading of "inside the checkout"
 * that `login-state.mjs` (where the sign-in saves a session) and
 * `accept.env.ts` (where an acceptance run keeps its session and its output)
 * both use. A session and an answer belong outside every repository, and a
 * path can lead into a checkout without being written under it.
 *
 * So a file is inside when either reading says so:
 *
 * * as written: the path, made absolute, is the folder or under it;
 * * as it really is: with every junction and symlink followed, on both sides.
 *   A file that is not made yet is followed as far as its folders exist.
 *
 * Plain JavaScript with a declaration beside it (`inside.d.mts`), because one
 * of its two users is run by node as it is and the other is TypeScript. No
 * side effects on import.
 */

import { realpathSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

/** The path with every link followed, as far as the path exists; what is not there yet is kept as written. */
function realPathOf(file) {
  const absolute = resolve(file);
  try {
    return realpathSync.native(absolute);
  } catch {
    const parent = dirname(absolute);
    return parent === absolute ? absolute : join(realPathOf(parent), basename(absolute));
  }
}

/** Whether one absolute path is another or under it, read as written. */
function isUnder(folder, file) {
  const fromFolder = relative(folder, file);
  // Outside is one level up or more, or (on Windows) another drive, which `relative` gives whole.
  return fromFolder !== '..' && !fromFolder.startsWith(`..${sep}`) && !isAbsolute(fromFolder);
}

/**
 * Whether `file` is `folder` itself or anything under it, as written or once
 * every link is followed.
 *
 * @param {string} folder
 * @param {string} file
 * @returns {boolean}
 */
export function isInside(folder, file) {
  return isUnder(resolve(folder), resolve(file)) || isUnder(realPathOf(folder), realPathOf(file));
}

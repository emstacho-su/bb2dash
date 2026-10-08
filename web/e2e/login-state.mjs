/**
 * Where `login.mjs` saves the signed-in session.
 *
 * By default it is the walk harness's own file, `e2e/.auth/state.json`
 * (gitignored). `WALK_STATE_PATH` names another file: the acceptance run's host
 * wrapper signs in once per sandbox stage and keeps each stage's session in a
 * folder outside every repository (acceptance/README.md at the root).
 *
 * The file is a signed-in session, so the path is held to three rules: it is
 * absolute, it ends in `.json`, and it is not inside this checkout unless it is
 * the default file itself. A session written anywhere else in the checkout
 * would be one `git add` away from a public repository. "Inside" is read by
 * `inside.mjs`, which follows junctions and symlinks, and which the acceptance
 * run's browser tests use for `ACCEPT_STATE` and `ACCEPT_OUT` too.
 *
 * No side effects on import: `login.mjs` starts a browser, and a test of this
 * rule must not.
 */

import { isAbsolute, resolve } from 'node:path';
import { isInside } from './inside.mjs';

/**
 * The file the session is saved to.
 *
 * @param {Readonly<Record<string, string | undefined>>} env the process environment
 * @param {{ root: string, standard: string }} paths the checkout's root, and the default file
 * @returns {string}
 */
export function statePathFrom(env, { root, standard }) {
  const asked = env.WALK_STATE_PATH ?? '';
  if (asked === '') return standard;
  if (!isAbsolute(asked)) throw new Error('WALK_STATE_PATH must be an absolute path');
  const file = resolve(asked);
  if (!file.endsWith('.json')) throw new Error('WALK_STATE_PATH must end in .json');
  if (file !== resolve(standard) && isInside(root, file)) {
    throw new Error('WALK_STATE_PATH is inside this checkout: a saved session belongs outside every repository');
  }
  return file;
}

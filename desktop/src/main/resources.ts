/**
 * Where the icons live, in a dev run and in the unpacked build alike.
 *
 * `app.getAppPath()` is `desktop/` when Electron is started from source and the
 * `resources/app` folder when `electron-builder --dir` has packaged it; the
 * `build/` folder sits directly under both (electron-builder's `files` list
 * ships it, and `asar` is off, so these are ordinary files on disk either way).
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { app } from 'electron';

/** An absolute path under the app root, or `null` when the file is not there. */
export function resourcePath(...segments: readonly string[]): string | null {
  const candidate = join(app.getAppPath(), ...segments);
  return existsSync(candidate) ? candidate : null;
}

/**
 * Builds `dist/` once before any test file runs. Two suites run built entry files as processes (the
 * tool gate, the healthcheck), and one build before the run keeps them from racing each other.
 *
 * tsc writes its output even when it reports type errors, so a failed build is only warned about
 * here: `npm run typecheck` is the gate for types, and a missing entry file fails its own test.
 */

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PACKAGE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TSC = path.join(PACKAGE, 'node_modules', 'typescript', 'bin', 'tsc');

export default function setup(): void {
  const build = spawnSync(process.execPath, [TSC, '-p', 'tsconfig.json'], { cwd: PACKAGE, encoding: 'utf8' });
  if (build.status !== 0) {
    console.warn(`workspace: tsc -p tsconfig.json exited ${String(build.status)}\n${build.stdout}${build.stderr}`);
  }
}

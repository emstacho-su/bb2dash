/**
 * Where the logon builder keeps builds, and which one is running (2026-09-30).
 *
 * The builder (`desktop/launch/logon-build.ps1`) lands each build in
 * `%LOCALAPPDATA%\bb2dash-launch\builds\<tree>\win-unpacked\bb2dash.exe`, where `<tree>` is
 * the git tree hash of `desktop/`, and points the `current` junction at one of them. The
 * app is started through the junction, so the running build is read from the *resolved*
 * executable path. Anything else (a dev run, a hand-packed build) is not a logon build and
 * gets no update check.
 */

export const TREE_PATTERN = /^[0-9a-f]{40}$/;
export const BUILDS_FOLDER = 'builds';
export const UNPACKED_FOLDER = 'win-unpacked';
export const EXE_NAME = 'bb2dash.exe';

const BUILD_PATH_PATTERN = /[\\/]bb2dash-launch[\\/]builds[\\/]([^\\/]+)[\\/]win-unpacked[\\/][^\\/]+$/i;

/** The tree hash of the build at `realExecPath`, or `null` when it is not a logon build. */
export function runningTreeFromExecPath(realExecPath: string): string | null {
  const match = BUILD_PATH_PATTERN.exec(realExecPath);
  const tree = match?.[1];
  return tree !== undefined && TREE_PATTERN.test(tree) ? tree : null;
}

export function isTree(value: unknown): value is string {
  return typeof value === 'string' && TREE_PATTERN.test(value);
}

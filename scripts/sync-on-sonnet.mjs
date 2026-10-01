// bb2dash :: scripts/sync-on-sonnet.mjs
// Relaunch a /bb-sync on Sonnet in a new Windows Terminal (Stack, 2026-09-30: syncs run on Sonnet).
//
//   node scripts/sync-on-sonnet.mjs <request id>
//
// The bb-sync skill's Step -1 runs this when its session is not on Sonnet, then stops; the
// request stays `queued`, so the new session claims it. It exists because a skill's own `model:`
// frontmatter is not applied in auto mode (Claude Code skills reference), so starting the session
// with `claude --model sonnet` is the one reliable way onto Sonnet. The desktop Sync button and
// the web app's copied command already start that way (`SYNC_MODEL` in desktop/src/core/
// sync-command.ts and web/src/lib/queries.sync.ts); this covers a sync started any other way.
//
// Opens `wt.exe -d <repo> --title "bb-sync <id>" powershell.exe -NoExit -NoLogo -Command
// claude --model sonnet '/bb-sync <id>'`, detached, with an argv list and no shell. The id must be
// a positive integer, so nothing from outside ever reaches the PowerShell command text.

import { spawn as nodeSpawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** The model a sync runs on; the same value as the desktop and web `SYNC_MODEL`. */
export const SYNC_MODEL = 'sonnet';

/** A positive integer of at most ten digits, as `agent_requests.id` is. */
const REQUEST_ID = /^[1-9]\d{0,9}$/;

export function isValidRequestId(id) {
  return typeof id === 'string' && REQUEST_ID.test(id);
}

/** The Windows Terminal argv that runs the sync on Sonnet in `repoRoot`. */
export function buildRelaunch(id, repoRoot) {
  if (!isValidRequestId(id)) {
    throw new Error(`not a request id: ${JSON.stringify(id)} (a positive integer)`);
  }
  return {
    file: 'wt.exe',
    args: [
      '-d',
      repoRoot,
      '--title',
      `bb-sync ${id}`,
      'powershell.exe',
      '-NoExit',
      '-NoLogo',
      // As the desktop's PS_FLAGS: an npm-installed `claude` is a .ps1 shim, which Windows 11
      // Home's default policy refuses (code review, 2026-09-30).
      '-ExecutionPolicy',
      'Bypass',
      '-Command',
      `claude --model ${SYNC_MODEL} '/bb-sync ${id}'`,
    ],
  };
}

/**
 * Spawn and wait for the outcome. Node reports a missing program (ENOENT) as a later `error`
 * event, not a throw, so "opened" is said only after the `spawn` event; the desktop's
 * `spawnOnce` (desktop/src/main/sync-terminal.ts, R2-6) does the same.
 */
function spawnConfirmed(spawn, file, args) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(file, args, { detached: true, stdio: 'ignore', windowsHide: false });
    } catch (error) {
      resolve({ ok: false, error });
      return;
    }
    child.once('spawn', () => {
      child.unref?.();
      resolve({ ok: true });
    });
    child.once('error', (error) => resolve({ ok: false, error }));
  });
}

/** Exit codes: 0 opened, 1 could not open the terminal, 2 bad or missing request id. */
export async function main(argv, deps = {}) {
  const repoRoot =
    deps.repoRoot ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const spawn = deps.spawn ?? nodeSpawn;
  const log = deps.log ?? ((line) => console.log(line));

  const [id] = argv;
  if (!isValidRequestId(id ?? '')) {
    log('usage: node scripts/sync-on-sonnet.mjs <request id>   (a positive integer)');
    return 2;
  }

  const { file, args } = buildRelaunch(id, repoRoot);
  const outcome = await spawnConfirmed(spawn, file, args);
  if (!outcome.ok) {
    const reason = outcome.error instanceof Error ? outcome.error.message : String(outcome.error);
    log(`could not open a terminal for bb-sync ${id}: ${reason}`);
    log(`run it by hand: claude --model ${SYNC_MODEL} "/bb-sync ${id}"`);
    return 1;
  }
  log(`opened a new terminal: bb-sync ${id} on ${SYNC_MODEL} (in ${repoRoot})`);
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  });
}

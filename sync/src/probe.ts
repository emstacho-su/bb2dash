/**
 * `node sync/dist/probe.js` — the runner's last login probe, read from its state file:
 *
 *   users/me <status> <iso time>      exit 0 on 200, 3 otherwise (and `none` when nothing is recorded)
 *
 * `node sync/dist/probe.js --heartbeat` is the compose healthcheck: exit 0 while the runner's
 * heartbeat (written by progress, R2 item 5) is younger than HEARTBEAT_STALE_MS, else 1. The healthcheck reads only the heartbeat,
 * so a dead login (`login_required`) stays healthy; the login is the doctor's row.
 *
 * It connects to nothing and reads no secret. It imports no other entry point.
 */

import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { WATCHDOG_MS } from './loop.js';
import { readTextOrNull, stateDirFrom, stateFiles } from './secrets.js';

/**
 * R2 item 5: the heartbeat is written by progress, so it can rest through a long step with its own
 * timeout (the crawl, 15 minutes); it is stale only past the watchdog's limit, when the runner exits.
 */
export const HEARTBEAT_STALE_MS = WATCHDOG_MS;
const EXIT_ALIVE = 0;
const EXIT_NOT_ALIVE = 3;
const HTTP_OK = 200;

export interface ProbeDeps {
  stateDir?: string;
  readFile?: (file: string) => string | null;
  out?: (line: string) => void;
  now?: () => Date;
  env?: Record<string, string | undefined>;
}


export async function probeMain(argv: readonly string[], deps: ProbeDeps = {}): Promise<number> {
  const readFile = deps.readFile ?? readTextOrNull;
  const out = deps.out ?? ((line: string) => process.stdout.write(`${line}\n`));
  const now = deps.now ?? (() => new Date());
  const files = stateFiles(deps.stateDir ?? stateDirFrom(deps.env ?? process.env));

  if (argv.includes('--heartbeat')) {
    let text: string | null = null;
    try {
      text = readFile(files.heartbeat);
    } catch {
      text = null; // unreadable is as unhealthy as missing
    }
    const beat = Date.parse((text ?? '').trim());
    const fresh = Number.isFinite(beat) && now().getTime() - beat < HEARTBEAT_STALE_MS;
    out(fresh ? `heartbeat ${new Date(beat).toISOString()}` : 'heartbeat stale or missing');
    return fresh ? 0 : 1;
  }

  let record: { status?: unknown; at?: unknown } | null = null;
  try {
    const text = readFile(files.login);
    record = text === null ? null : (JSON.parse(text) as { status?: unknown; at?: unknown });
  } catch {
    record = null;
  }
  if (!record) {
    out(`users/me none ${now().toISOString()}`);
    return EXIT_NOT_ALIVE;
  }
  const status = typeof record.status === 'number' ? record.status : 'error';
  const at = typeof record.at === 'string' ? record.at : now().toISOString();
  out(`users/me ${status} ${at}`);
  return status === HTTP_OK ? EXIT_ALIVE : EXIT_NOT_ALIVE;
}

const invokedDirectly =
  Boolean(process.argv[1]) && pathToFileURL(path.resolve(process.argv[1]!)).href === pathToFileURL(fileURLToPath(import.meta.url)).href;

if (invokedDirectly) {
  probeMain(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code;
    },
    () => {
      process.exitCode = EXIT_NOT_ALIVE;
    },
  );
}

/**
 * `node sync/dist/enqueue.js` — `just sync-now`: `sync_enqueue('just')`, which returns the open
 * sync's id when one is queued or claimed and never inserts a second open row.
 *
 *   sync_enqueue('just') -> request <id>      exit 0
 *   enqueue: <reason>                         exit 2 (no credential, no database)
 *
 * Run as `docker compose exec sync node sync/dist/enqueue.js`, outside the entrypoint's process tree,
 * so it reads its credential itself (SYNC_RUNNER_DB_URL, its _FILE, or /run/secrets). It imports no
 * other entry point.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createPgQuery, createRpc, newPgClient, redactDsn, type QueryFn } from './db.js';
import { loadDbUrl } from './secrets.js';

export interface EnqueueDeps {
  query?: QueryFn & { end(): Promise<void> };
  dsn?: string;
  env?: Record<string, string | undefined>;
  readFile?: (file: string) => string | null;
  out?: (line: string) => void;
}

function readTextOrNull(file: string): string | null {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
}

export async function enqueueMain(_argv: readonly string[], deps: EnqueueDeps = {}): Promise<number> {
  const out = deps.out ?? ((line: string) => process.stdout.write(`${line}\n`));
  let dsn: string | null = deps.dsn ?? null;
  let query = deps.query ?? null;
  try {
    if (!query) {
      dsn = loadDbUrl({ env: deps.env ?? process.env, readFile: deps.readFile ?? readTextOrNull });
      query = createPgQuery({ dsn, log: () => {}, newClient: newPgClient });
    }
    const id = await createRpc(query).enqueue('just');
    out(`sync_enqueue('just') -> request ${id ?? 'none'}`);
    return 0;
  } catch (error) {
    const text = (error instanceof Error ? error.message : String(error)).split('\n')[0] ?? '';
    out(`enqueue: ${redactDsn(text, dsn)}`);
    return 2;
  } finally {
    await query?.end();
  }
}

const invokedDirectly =
  Boolean(process.argv[1]) && pathToFileURL(path.resolve(process.argv[1]!)).href === pathToFileURL(fileURLToPath(import.meta.url)).href;

if (invokedDirectly) {
  enqueueMain(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code;
    },
    () => {
      process.exitCode = 2;
    },
  );
}

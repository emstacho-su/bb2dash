/**
 * The apply worker's process (Phase 23): the wiring around `loop.ts`.
 *
 *   node /app/apply/dist/main.js
 *
 * It reads its configuration (refusing an API key in the environment), writes the MCP config,
 * builds the two agents from the skill's own files, and loops. A heartbeat every 30 s reaches the
 * database and touches the alive file, through a 14-minute run too. On SIGTERM or SIGINT it stops
 * taking work, kills a run in progress (which then closes its request as failed, interrupted) and
 * exits 0. A configuration refusal exits 1 with one line that names a variable or a file, never a
 * value.
 */

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { touchAlive } from '../../workspace/src/alive.js';
import { ConfigError, readOauthToken, readTextOrNull, type Env } from '../../workspace/src/config.js';
import { createPgQuery, newPgClient, redactDsn, type QueryFn } from '../../workspace/src/db.js';
import { childEnv, spawnClaude } from '../../workspace/src/providers/claude-cli.js';
import { buildAgents, runClaude, type RunDeps } from './claude.js';
import { PATHS, loadConfig, type ApplyConfig } from './config.js';
import { createRpc } from './db.js';
import { runLoop } from './loop.js';
import { writeMcpConfig } from './mcp-config.js';

export const HEARTBEAT_MS = 30_000;
const EXIT_OK = 0;
const EXIT_CONFIG = 1;

/** Everything the process touches, so a test can stand in for each. */
export interface WorkerDeps {
  readonly env: Env;
  readonly config: ApplyConfig;
  readonly query: QueryFn & { end(): Promise<void> };
  readonly readSkillFile: (name: string) => string;
  readonly writeMcpConfig: () => void;
  readonly touchAlive: () => void;
  readonly run: Pick<RunDeps, 'spawn' | 'readOauthToken'>;
  readonly log: (line: string) => void;
  readonly sleep: (ms: number, signal: AbortSignal) => Promise<void>;
  readonly setInterval: (fn: () => void, ms: number) => { stop(): void };
}

export interface Worker {
  /** Resolves when the loop has ended. */
  readonly done: Promise<void>;
  stop(): void;
}

export function startWorker(deps: WorkerDeps): Worker {
  const stopping = new AbortController();
  const rpc = createRpc(deps.query);
  const agents = buildAgents(deps.readSkillFile('context.md'), deps.readSkillFile('writer.md'));
  deps.writeMcpConfig();

  const heartbeat = (): void => {
    rpc.ping().then(deps.touchAlive, (error: unknown) => {
      deps.log(`heartbeat: the database did not answer: ${redactDsn(error instanceof Error ? error.message : String(error), deps.config.dbUrl)}`);
    });
  };
  heartbeat();
  const beat = deps.setInterval(heartbeat, HEARTBEAT_MS);

  const runDeps: RunDeps = {
    ...deps.run,
    childEnv: (token) => childEnv(deps.env, token),
    log: deps.log,
  };

  const done = runLoop({
    rpc,
    log: deps.log,
    runClaude: (input) => runClaude({ ...input, agents, budgetUsd: deps.config.budgetUsd }, runDeps, stopping.signal),
    sleep: (ms) => deps.sleep(ms, stopping.signal),
    shouldStop: () => stopping.signal.aborted,
  }).finally(async () => {
    beat.stop();
    await deps.query.end();
  });

  return { done, stop: () => stopping.abort() };
}

/** A sleep the stop signal ends early. */
function sleepUntil(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve();
    const timer = setTimeout(done, ms);
    function done(): void {
      clearTimeout(timer);
      signal.removeEventListener('abort', done);
      resolve();
    }
    signal.addEventListener('abort', done, { once: true });
  });
}

function printLine(line: string): void {
  process.stdout.write(`${new Date().toISOString()} ${line}\n`);
}

async function main(): Promise<number> {
  let config: ApplyConfig;
  try {
    config = loadConfig({ env: process.env, readFile: readTextOrNull });
  } catch (error) {
    printLine(`config: ${error instanceof ConfigError ? error.message : 'could not be read'}`);
    return EXIT_CONFIG;
  }
  const log = (line: string): void => printLine(redactDsn(line, config.dbUrl));
  const worker = startWorker({
    env: process.env,
    config,
    query: createPgQuery({ dsn: config.dbUrl, ca: config.dbCa, log, newClient: newPgClient }),
    readSkillFile: (name) => fs.readFileSync(path.join(PATHS.skillDir, name), 'utf8'),
    writeMcpConfig: () => writeMcpConfig(),
    touchAlive: () => touchAlive(PATHS.aliveFile),
    run: { spawn: spawnClaude, readOauthToken: () => readOauthToken(readTextOrNull) },
    log,
    sleep: sleepUntil,
    setInterval: (fn, ms) => {
      const timer = setInterval(fn, ms);
      return { stop: () => clearInterval(timer) };
    },
  });
  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.once(signal, () => {
      log(`${signal}: stopping`);
      worker.stop();
    });
  }
  log('apply worker: started');
  await worker.done;
  log('apply worker: stopped');
  return EXIT_OK;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main();
}

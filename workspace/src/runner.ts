/**
 * The Workspace runner: the container's entry (`node /app/workspace/dist/runner.js`).
 *
 * It polls `workspace_claim()` every 2 s and answers one request at a time, oldest first. On its own
 * 30 s timer, during turns too, it calls `workspace_heartbeat()` and touches the alive file after
 * each success. With no heartbeat success for 180 s it ends any turn in flight and exits non-zero,
 * so the restart policy brings the container back. On SIGTERM or SIGINT it stops polling, ends a
 * turn in flight as `failed` / `stale_claim`, and exits 0.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { touchAlive } from './alive.js';
import { BUDGET_CAP_HOLDS, DB_WATCHDOG_MS, HEARTBEAT_MS, PATHS, POLL_INTERVAL_MS, loadConfig, readOauthToken, readTextOrNull } from './config.js';
import { createPgQuery, createRpc, newPgClient, type Claim } from './db.js';
import { writeMcpConfig } from './mcp-config.js';
import { createCliTurn, readSystemPrompt, spawnClaude } from './providers/claude-cli.js';
import { createProviders } from './providers/index.js';
import { startTurn, type TurnDeps, type TurnHandle } from './turn.js';

const EXIT_OK = 0;
const EXIT_WATCHDOG = 1;
const EXIT_CONFIG = 2;

export interface RunnerDeps extends TurnDeps {
  /** The name the runner claims and sends heartbeats under. */
  readonly runnerName: string;
  /** Called after every successful heartbeat. */
  readonly touchAlive: () => void;
}

export interface Runner {
  /** Runs until a shutdown or the watchdog; resolves with the process's exit code. */
  run(): Promise<number>;
  /** SIGTERM or SIGINT: stop polling, end the turn in flight, exit 0. */
  shutdown(signalName: string): void;
}

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

export function createRunner(deps: RunnerDeps): Runner {
  const log = (message: string): void => deps.log(`runner ${message}`);
  const state: { stopping: boolean; exitCode: number; turn: TurnHandle | null; wake: (() => void) | null; lastHeartbeatOk: number } = {
    stopping: false,
    exitCode: EXIT_OK,
    turn: null,
    wake: null,
    lastHeartbeatOk: 0,
  };

  const end = (exitCode: number, why: string): void => {
    if (state.stopping) return;
    state.stopping = true;
    state.exitCode = exitCode;
    log(why);
    state.turn?.stop('stale_claim');
    state.wake?.();
  };

  /** A wait that a shutdown cuts short. */
  const pause = (ms: number): Promise<void> =>
    new Promise((resolve) => {
      const done = (): void => {
        clearTimeout(timer);
        state.wake = null;
        resolve();
      };
      const timer = setTimeout(done, ms);
      state.wake = done;
    });

  const beat = async (): Promise<void> => {
    try {
      await deps.rpc.heartbeat(deps.runnerName);
      state.lastHeartbeatOk = Date.now();
      deps.touchAlive();
    } catch (error) {
      log(`heartbeat failed: ${messageOf(error)}`);
    }
    if (Date.now() - state.lastHeartbeatOk >= DB_WATCHDOG_MS) {
      end(EXIT_WATCHDOG, `watchdog: no heartbeat has succeeded for ${DB_WATCHDOG_MS / 1000} s; exiting so the container restarts`);
    }
  };

  const nextClaim = async (): Promise<Claim | null> => {
    try {
      return await deps.rpc.claim(deps.runnerName);
    } catch (error) {
      log(`claim failed: ${messageOf(error)}`);
      return null;
    }
  };

  return {
    async run() {
      state.lastHeartbeatOk = Date.now();
      log(`started as ${deps.runnerName}`);
      void beat();
      const heartbeatTimer = setInterval(() => void beat(), HEARTBEAT_MS);
      try {
        while (!state.stopping) {
          const claim = await nextClaim();
          if (claim === null) {
            if (!state.stopping) await pause(POLL_INTERVAL_MS);
            continue;
          }
          state.turn = startTurn(deps, claim);
          // A request claimed while a shutdown arrived is ended at once, so it is not left claimed.
          if (state.stopping) state.turn.stop('stale_claim');
          await state.turn.done;
          state.turn = null;
        }
      } finally {
        clearInterval(heartbeatTimer);
      }
      return state.exitCode;
    },
    shutdown(signalName) {
      end(EXIT_OK, `${signalName} received: stopping`);
    },
  };
}

function stamp(line: string): void {
  process.stdout.write(`${new Date().toISOString()} workspace: ${line}\n`);
}

/** The real wiring: the two secrets by file, the MCP config, one database connection, the claude CLI. */
export async function main(): Promise<number> {
  let config;
  try {
    config = loadConfig({ env: process.env, readFile: readTextOrNull, hostname: os.hostname() });
    writeMcpConfig();
  } catch (error) {
    stamp(`cannot start: ${messageOf(error)}`);
    return EXIT_CONFIG;
  }
  const query = createPgQuery({ dsn: config.dbUrl, log: stamp, newClient: newPgClient });
  const claudeCli = createCliTurn({
    spawn: spawnClaude,
    readSystemPrompt: () => readSystemPrompt(),
    readOauthToken: () => readOauthToken(readTextOrNull),
    baseEnv: process.env,
    log: stamp,
  });
  const runner = createRunner({
    rpc: createRpc(query),
    providers: createProviders({ claudeCli }),
    log: stamp,
    budgetUsd: config.budgetUsd,
    budgetCapHolds: BUDGET_CAP_HOLDS,
    runnerName: config.runnerName,
    touchAlive: () => touchAlive(PATHS.aliveFile),
  });
  process.once('SIGTERM', () => runner.shutdown('SIGTERM'));
  process.once('SIGINT', () => runner.shutdown('SIGINT'));
  const exitCode = await runner.run();
  await query.end();
  stamp(`exiting ${exitCode}`);
  return exitCode;
}

/** True when this file is the program node was started with, not an import. */
function isEntry(): boolean {
  const started = process.argv[1];
  if (started === undefined) return false;
  try {
    return fs.realpathSync(path.resolve(started)) === fs.realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isEntry()) {
  main().then(
    (exitCode) => process.exit(exitCode),
    (error: unknown) => {
      stamp(`crashed: ${messageOf(error)}`);
      process.exit(EXIT_WATCHDOG);
    },
  );
}

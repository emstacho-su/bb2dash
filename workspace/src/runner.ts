/**
 * The Workspace runner: the container's entry (`node /app/workspace/dist/runner.js`).
 *
 * It polls `workspace_claim()` every 2 s and answers one request at a time, oldest first. On its own
 * 30 s timer, during turns too, it calls `workspace_heartbeat()` and touches the alive file after
 * each success. With no heartbeat success for 180 s it ends any turn in flight and exits non-zero,
 * so the restart policy brings the container back; it waits with that while the turn in flight is
 * retrying its `workspace_finish()` inside the 110 s that call is given (rulings V1, CR-3, and X1), so a
 * finished answer is not thrown away by the restart. On SIGTERM or SIGINT it stops polling, ends a
 * turn in flight as `failed` / `stale_claim`, and exits 0.
 *
 * The 180 s and the 110 s are read on a monotonic clock (ruling Z1, R2-2), so a wall clock that
 * steps (the laptop slept, the VM's clock was set) neither trips the watchdog nor ends its hold.
 * The wall clock is read only to stamp a log line.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { touchAlive } from './alive.js';
import {
  BUDGET_CAP_HOLDS,
  DB_WATCHDOG_MS,
  FINISH_RETRY_MS,
  HEARTBEAT_MS,
  PATHS,
  POLL_INTERVAL_MS,
  loadConfig,
  readOauthToken,
  readTextOrNull,
} from './config.js';
import { createPgQuery, createRpc, newPgClient, type Claim } from './db.js';
import { messageOf } from './errors.js';
import { writeMcpConfig } from './mcp-config.js';
import { createCliTurn, readSystemPrompt, spawnClaude } from './providers/claude-cli.js';
import { createProviders } from './providers/index.js';
import { startTurn, type TurnDeps, type TurnHandle } from './turn.js';

const EXIT_OK = 0;
const EXIT_WATCHDOG = 1;
const EXIT_CONFIG = 2;
const MS_PER_SECOND = 1000;
/** Once a stop is asked for, what is in flight gets this long before the loop returns anyway: inside the service's 30 s stop grace. */
export const SHUTDOWN_GRACE_MS = 20_000;
/** Closing the database connection at exit is given this long. */
const DB_CLOSE_MS = 2000;

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

export function createRunner(deps: RunnerDeps): Runner {
  const log = (message: string): void => deps.log(`runner ${message}`);
  interface LoopState {
    stopping: boolean;
    exitCode: number;
    turn: TurnHandle | null;
    wake: (() => void) | null;
    lastHeartbeatOk: number;
    /** True once the log has said the watchdog is waiting for a finish; a heartbeat that succeeds clears it. */
    watchdogHeld: boolean;
  }
  const state: LoopState = { stopping: false, exitCode: EXIT_OK, turn: null, wake: null, lastHeartbeatOk: 0, watchdogHeld: false };

  let giveUp: () => void = () => undefined;
  const gaveUp = new Promise<'gave up'>((resolve) => {
    giveUp = () => resolve('gave up');
  });
  let graceTimer: ReturnType<typeof setTimeout> | null = null;

  const end = (exitCode: number, why: string): void => {
    if (state.stopping) return;
    state.stopping = true;
    state.exitCode = exitCode;
    log(why);
    state.turn?.stop('stale_claim');
    state.wake?.();
    // What is in flight gets a bounded time to finish, so the process always exits.
    graceTimer = setTimeout(giveUp, SHUTDOWN_GRACE_MS);
  };

  /** The promise's end, or the end of the shutdown grace, whichever comes first. */
  const orGiveUp = async <T>(work: Promise<T>): Promise<T | 'gave up'> => Promise.race([work, gaveUp]);

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

  /** True while the turn in flight is making its `workspace_finish()` and is still inside the retry window. */
  const finishInWindow = (): boolean => {
    const since = state.turn?.finishingSince() ?? null;
    return since !== null && deps.now() - since < FINISH_RETRY_MS;
  };

  const beat = async (): Promise<void> => {
    try {
      await deps.rpc.heartbeat(deps.runnerName);
      state.lastHeartbeatOk = deps.now();
      state.watchdogHeld = false;
      deps.touchAlive();
    } catch (error) {
      log(`heartbeat failed: ${messageOf(error)}`);
    }
    if (deps.now() - state.lastHeartbeatOk < DB_WATCHDOG_MS) return;
    const silentFor = `no heartbeat has succeeded for ${DB_WATCHDOG_MS / MS_PER_SECOND} s`;
    // A finished answer is waiting to be stored: the restart waits for the finish's own window.
    if (finishInWindow()) {
      if (!state.watchdogHeld) log(`watchdog: ${silentFor}; held while the finish of the turn in flight is being retried`);
      state.watchdogHeld = true;
      return;
    }
    end(EXIT_WATCHDOG, `watchdog: ${silentFor}; exiting so the container restarts`);
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
      state.lastHeartbeatOk = deps.now();
      log(`started as ${deps.runnerName}`);
      void beat();
      const heartbeatTimer = setInterval(() => void beat(), HEARTBEAT_MS);
      try {
        while (!state.stopping) {
          const claim = await orGiveUp(nextClaim());
          if (claim === 'gave up') break;
          if (claim === null) {
            if (!state.stopping) await pause(POLL_INTERVAL_MS);
            continue;
          }
          state.turn = startTurn(deps, claim);
          // A request claimed while a shutdown arrived is ended at once, so it is not left claimed.
          if (state.stopping) state.turn.stop('stale_claim');
          const ended = await orGiveUp(
            state.turn.done.catch((error: unknown) => {
              log(`turn request=${claim.requestId} crashed: ${messageOf(error)}`);
            }),
          );
          if (ended === 'gave up') log(`turn request=${claim.requestId} did not finish within the shutdown grace; the stale-claim sweep will close it`);
          state.turn = null;
        }
      } finally {
        clearInterval(heartbeatTimer);
        if (graceTimer !== null) clearTimeout(graceTimer);
      }
      return state.exitCode;
    },
    shutdown(signalName) {
      end(EXIT_OK, `${signalName} received: stopping`);
    },
  };
}

/** The runner's clock for durations: milliseconds since the process started, which no step of the wall clock moves. */
export const monotonicNow = (): number => performance.now();

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
  const query = createPgQuery({ dsn: config.dbUrl, ca: config.dbCa, log: stamp, newClient: newPgClient });
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
    now: monotonicNow,
    runnerName: config.runnerName,
    touchAlive: () => touchAlive(PATHS.aliveFile),
  });
  process.once('SIGTERM', () => runner.shutdown('SIGTERM'));
  process.once('SIGINT', () => runner.shutdown('SIGINT'));
  const exitCode = await runner.run();
  await Promise.race([query.end(), new Promise((resolve) => setTimeout(resolve, DB_CLOSE_MS))]);
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

// bb2dash :: scripts/lib/walk-box-client.mjs
// The two things the walk box's host script (scripts/walk-box.mjs) has with the outside while a
// walk runs: the docker client it starts, and the signals that ask the script itself to stop.
//
// Importing this module has no side effects.

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';

/** The docker client: found on PATH by this name. A test names a stand-in instead; nothing else does. */
export const DOCKER_CLIENT = Object.freeze(['docker']);

/** The signals that ask the script to stop: Ctrl-C, a plain kill, a closed terminal. */
export const INTERRUPTS = Object.freeze(['SIGINT', 'SIGTERM', 'SIGHUP']);

const SIGNAL_EXIT_BASE = 128;
/** What a process ended by a signal exits with, by the shell's rule (128 + the signal's number). */
export const exitOfSignal = (name) => SIGNAL_EXIT_BASE + (os.constants.signals[name] ?? 0);

/**
 * A docker call that ends with one of these was stopped by a signal: its client, or the box's
 * first process. The client can be gone while the box is still up.
 */
export const SIGNAL_EXITS = Object.freeze(Object.fromEntries([...INTERRUPTS, 'SIGKILL'].map((name) => [exitOfSignal(name), name])));

/**
 * Start docker with these arguments and no shell; what it prints goes to the console and to the
 * log file. Resolves with its exit code (128 + the signal's number when a signal ended it), and
 * rejects when it cannot be started or when `signal` ends it.
 */
export function runDocker(argv, { logFile = null, client = DOCKER_CLIENT, out = process.stdout, err = process.stderr, signal } = {}) {
  return new Promise((resolve, reject) => {
    const log = logFile === null ? null : fs.createWriteStream(logFile, { flags: 'a' });
    let settled = false;
    const settle = (finish) => {
      if (settled) return;
      settled = true;
      if (log === null) finish();
      else log.end(finish);
    };
    log?.on('error', (error) => settle(() => reject(error)));
    const child = spawn(client[0], [...client.slice(1), ...argv], { stdio: ['ignore', 'pipe', 'pipe'], shell: false, windowsHide: true, signal });
    const tee = (from, to) =>
      from.on('data', (chunk) => {
        to.write(chunk);
        if (!settled) log?.write(chunk);
      });
    tee(child.stdout, out);
    tee(child.stderr, err);
    child.once('error', (error) => settle(() => reject(error)));
    child.once('close', (code, killedBy) => settle(() => resolve(code ?? exitOfSignal(killedBy))));
  });
}

/**
 * Waits for the first signal that asks the script to stop. `interrupted` resolves with the
 * signal's name. While the watch is on, a signal does not end the process: the box is removed and
 * run.json finished first, and a second signal in that time changes nothing. `stop()` ends the
 * watch.
 */
export function watchSignals(emitter = process) {
  let tell;
  const interrupted = new Promise((resolve) => {
    tell = (name) => resolve(name);
  });
  for (const name of INTERRUPTS) emitter.on(name, tell);
  return {
    interrupted,
    stop: () => {
      for (const name of INTERRUPTS) emitter.off(name, tell);
    },
  };
}

/** Waits for `promise`, for `ms` at most. Returns what it resolved with, or null when the time ran out first. */
export async function within(ms, promise) {
  let timer;
  const limit = new Promise((resolve) => {
    timer = setTimeout(resolve, ms, null);
  });
  try {
    return await Promise.race([promise, limit]);
  } finally {
    clearTimeout(timer);
  }
}

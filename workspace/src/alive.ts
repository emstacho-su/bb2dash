/**
 * The alive file: the runner touches it after every successful heartbeat, and the container's
 * healthcheck reads its age. Healthy therefore means the loop is running and reached the database
 * within the last 90 s, which holds through an 8-minute turn.
 */

import fs from 'node:fs';

import { HEALTH_MAX_AGE_MS } from './config.js';

/** Create the file, or make an existing one new again. It holds nothing. */
export function touchAlive(file: string): void {
  const now = new Date();
  try {
    fs.utimesSync(file, now, now);
  } catch {
    fs.closeSync(fs.openSync(file, 'w'));
  }
}

/** True while the file exists and its mtime is under `maxAgeMs` before `nowMs`. */
export function isAliveFresh(file: string, nowMs: number, maxAgeMs: number = HEALTH_MAX_AGE_MS): boolean {
  let mtimeMs: number;
  try {
    mtimeMs = fs.statSync(file).mtimeMs;
  } catch {
    return false;
  }
  return nowMs - mtimeMs < maxAgeMs;
}

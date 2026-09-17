/**
 * C-10 — a rolling log file at `userData/logs/main.log`, one previous
 * generation kept. Every line goes through `redact` first (C-5): no bearer
 * token, anon key or cookie value is ever written.
 *
 * Logging must never be the reason the app stops, so every filesystem call
 * here is wrapped and a failure degrades to the console.
 */

import { appendFileSync, mkdirSync, renameSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { app } from 'electron';

import { type Logger, createRedactingLogger, redact } from '../core/redact';

const MAX_BYTES = 512 * 1024;

let logFile: string | null = null;

function resolveLogFile(): string | null {
  if (logFile !== null) return logFile;
  try {
    const dir = join(app.getPath('userData'), 'logs');
    mkdirSync(dir, { recursive: true });
    logFile = join(dir, 'main.log');
    return logFile;
  } catch {
    return null;
  }
}

function rotateIfLarge(file: string): void {
  try {
    if (statSync(file).size < MAX_BYTES) return;
    renameSync(file, `${file}.1`);
  } catch {
    // The file does not exist yet, or is locked. Either way, keep appending.
  }
}

/** One redacted, timestamped line. Safe to call before `app.whenReady()`. */
export function log(message: string): void {
  const line = `${new Date().toISOString()} ${redact(message)}\n`;
  const file = resolveLogFile();
  if (file === null) {
    process.stdout.write(line);
    return;
  }
  rotateIfLarge(file);
  try {
    appendFileSync(file, line, 'utf8');
  } catch {
    process.stdout.write(line);
  }
}

/** An error with its message, never its stack: a stack can carry a URL. */
export function logError(context: string, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  log(`${context}: ${message}`);
}

/** Absolute path of the current log file, for the README and the smoke notes. */
export function logFilePath(): string | null {
  return resolveLogFile();
}

/**
 * The `Logger` the poller and its adapters take (C-7). Every line is redacted by
 * `createRedactingLogger` and again by `log` on the way to the file; `redact` is
 * idempotent, and one rolling file with one format is worth the second pass.
 */
export function createNamedLogger(prefix: string): Logger {
  return createRedactingLogger((level, line) => {
    log(level === 'info' ? line : `${level}: ${line}`);
  }, prefix);
}

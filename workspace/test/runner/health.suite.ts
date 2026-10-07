/** The alive file and the container healthcheck. Part of runner.test.ts. */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import { isAliveFresh, touchAlive } from '../../src/alive.js';
import { HEALTH_MAX_AGE_MS } from '../../src/config.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BUILT_HEALTHCHECK = path.resolve(HERE, '..', '..', 'dist', 'healthcheck.js');
const HEALTHY = 0;
const UNHEALTHY = 1;

const temps: string[] = [];

function tempFile(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'w64-alive-'));
  temps.push(dir);
  return path.join(dir, 'alive');
}

/** Set the file's mtime to `ageMs` before now. */
function age(file: string, ageMs: number): void {
  const when = new Date(Date.now() - ageMs);
  fs.utimesSync(file, when, when);
}

afterEach(() => {
  for (const dir of temps.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe('the alive file', () => {
  it('is created by the first touch and made new again by the next', () => {
    const file = tempFile();
    expect(fs.existsSync(file)).toBe(false);
    touchAlive(file);
    expect(fs.existsSync(file)).toBe(true);
    age(file, 10 * 60 * 1000);
    expect(isAliveFresh(file, Date.now())).toBe(false);
    touchAlive(file);
    expect(isAliveFresh(file, Date.now())).toBe(true);
  });

  it('is fresh while its mtime is under 90 s old', () => {
    const file = tempFile();
    touchAlive(file);
    const mtime = fs.statSync(file).mtimeMs;
    expect(HEALTH_MAX_AGE_MS).toBe(90_000);
    expect(isAliveFresh(file, mtime)).toBe(true);
    expect(isAliveFresh(file, mtime + HEALTH_MAX_AGE_MS - 1)).toBe(true);
    expect(isAliveFresh(file, mtime + HEALTH_MAX_AGE_MS)).toBe(false);
    expect(isAliveFresh(file, mtime + 8 * 60 * 1000)).toBe(false);
  });

  it('is not fresh when the file is missing', () => {
    expect(isAliveFresh(tempFile(), Date.now())).toBe(false);
  });

  it('holds nothing: the file is empty', () => {
    const file = tempFile();
    touchAlive(file);
    expect(fs.statSync(file).size).toBe(0);
  });
});

describe('the built healthcheck, run as a process', () => {
  const check = (file: string): number | null => spawnSync(process.execPath, [BUILT_HEALTHCHECK, file], { encoding: 'utf8' }).status;

  it('is built where the service runs it', () => {
    expect(fs.existsSync(BUILT_HEALTHCHECK)).toBe(true);
  });

  it('passes while the alive file is under 90 s old', () => {
    const file = tempFile();
    touchAlive(file);
    expect(check(file)).toBe(HEALTHY);
    age(file, 60_000);
    expect(check(file)).toBe(HEALTHY);
  });

  it('fails when the file is older', () => {
    const file = tempFile();
    touchAlive(file);
    age(file, 91_000);
    expect(check(file)).toBe(UNHEALTHY);
  });

  it('fails when the file is missing', () => {
    expect(check(tempFile())).toBe(UNHEALTHY);
  });

  it('reads the in-image path when it is given none, and fails where that path does not exist', () => {
    const run = spawnSync(process.execPath, [BUILT_HEALTHCHECK], { encoding: 'utf8' });
    expect(run.status).toBe(UNHEALTHY);
    expect(run.stdout).toBe('');
  });
});

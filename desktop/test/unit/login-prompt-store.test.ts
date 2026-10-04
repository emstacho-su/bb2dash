/**
 * Brief 100 round 2, item 2: the login prompt's per-item New York date survives a restart in
 * `userData/login-prompt.json`. Real files in a temp folder; nothing else on the machine is read.
 */

import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createRedactingLogger } from '../../src/core/redact';
import { LOGIN_PROMPT_FILENAME, createLoginPromptStore } from '../../src/main/login-prompt-store';

let dir: string;
let file: string;
let warnings: string[];

function store() {
  warnings = [];
  return createLoginPromptStore({
    filePath: file,
    log: createRedactingLogger((level, line) => {
      if (level === 'warn') warnings.push(line);
    }, 'login-prompt'),
  });
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'bb2dash-login-prompt-'));
  file = join(dir, LOGIN_PROMPT_FILENAME);
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('the login prompt record on disk', () => {
  it('is login-prompt.json beside the watermark', () => {
    expect(LOGIN_PROMPT_FILENAME).toBe('login-prompt.json');
  });

  it('reads as empty before the first prompt, without a warning', () => {
    expect(store().read()).toEqual({});
    expect(warnings).toEqual([]);
  });

  it('round-trips across instances, as a restart does, and leaves no temp file', () => {
    store().write({ 41: '2026-10-03' });
    expect(store().read()).toEqual({ 41: '2026-10-03' });
    expect(existsSync(`${file}.tmp`)).toBe(false);
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({ promptedOn: { 41: '2026-10-03' } });
  });

  it('reads a torn or foreign file as empty, with one warning', () => {
    writeFileSync(file, '{"promptedOn": {"41": "2026-10', 'utf8');
    expect(store().read()).toEqual({});
    expect(warnings).toHaveLength(1);
    writeFileSync(file, '["not", "an", "object"]', 'utf8');
    expect(store().read()).toEqual({});
  });

  it('keeps only digit ids with YYYY-MM-DD dates', () => {
    writeFileSync(
      file,
      JSON.stringify({ promptedOn: { 41: '2026-10-03', abc: '2026-10-03', 42: 'yesterday', 43: 7 } }),
      'utf8',
    );
    expect(store().read()).toEqual({ 41: '2026-10-03' });
  });

  it('warns when the file exists but cannot be read (a folder in its place)', () => {
    rmSync(dir, { recursive: true, force: true });
    dir = mkdtempSync(join(tmpdir(), 'bb2dash-login-prompt-'));
    file = dir; // reading a directory fails with EISDIR, not ENOENT
    expect(store().read()).toEqual({});
    expect(warnings).toHaveLength(1);
  });
});

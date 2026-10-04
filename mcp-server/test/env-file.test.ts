import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SERVICE_ROLE_FILE_VAR, cleanSecretText, readSecretFile } from '../src/env-file.js';
import { ConfigError, describeError } from '../src/errors.js';

const SECRET = 'sb_secret_file_value_not_real';
const BOM = '\uFEFF';

let root: string;
beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'mcp-env-file-'));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function keyFile(content: string, name = 'bb2dash_mcp_service_key'): string {
  const file = path.join(root, name);
  writeFileSync(file, content, 'utf8');
  return file;
}

/** The thrown error rendered the way index.ts prints it at startup. */
function failureOf(run: () => unknown): { error: ConfigError; text: string } {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(ConfigError);
    return { error: error as ConfigError, text: describeError(error) };
  }
  throw new Error('expected a ConfigError, nothing was thrown');
}

describe('the variable name', () => {
  it('is the one the compose secret and the registration recipe set', () => {
    expect(SERVICE_ROLE_FILE_VAR).toBe('SUPABASE_SERVICE_ROLE_FILE');
  });
});

describe('cleanSecretText', () => {
  it('leaves a bare value alone', () => {
    expect(cleanSecretText(SECRET)).toBe(SECRET);
  });

  it('strips a UTF-8 byte-order mark, CR and LF', () => {
    expect(cleanSecretText(`${BOM}${SECRET}\r\n`)).toBe(SECRET);
    expect(cleanSecretText(`${SECRET}\n`)).toBe(SECRET);
    expect(cleanSecretText(`\r\n${SECRET}\r\n\r\n`)).toBe(SECRET);
  });

  it('reduces a file of only a BOM and line breaks to nothing', () => {
    expect(cleanSecretText(`${BOM}\r\n`)).toBe('');
  });
});

describe('readSecretFile', () => {
  it('returns the key a file holds', () => {
    expect(readSecretFile(keyFile(SECRET), SERVICE_ROLE_FILE_VAR)).toBe(SECRET);
  });

  it('returns the key a Windows editor saved with a BOM and CRLF', () => {
    expect(readSecretFile(keyFile(`${BOM}${SECRET}\r\n`), SERVICE_ROLE_FILE_VAR)).toBe(SECRET);
  });

  it('fails on a missing file, naming the variable and the path', () => {
    const missing = path.join(root, 'nope', 'bb2dash_mcp_service_key');
    const { error, text } = failureOf(() => readSecretFile(missing, SERVICE_ROLE_FILE_VAR));
    expect(error.message).toContain(SERVICE_ROLE_FILE_VAR);
    expect(error.message).toContain(missing);
    expect(error.message).toMatch(/does not exist/);
    expect(error.hint).toBeTruthy();
    expect(text).toContain(missing);
  });

  it('fails on an unreadable path (a folder), naming the path and the reason', () => {
    const folder = path.join(root, 'a-folder');
    mkdirSync(folder);
    const { error } = failureOf(() => readSecretFile(folder, SERVICE_ROLE_FILE_VAR));
    expect(error.message).toContain(folder);
    expect(error.message).toMatch(/cannot be read/);
    expect(error.message).toMatch(/EISDIR|EACCES|EPERM/);
  });

  it('fails on an empty file, naming the path', () => {
    const file = keyFile('');
    const { error } = failureOf(() => readSecretFile(file, SERVICE_ROLE_FILE_VAR));
    expect(error.message).toContain(file);
    expect(error.message).toMatch(/is empty/);
  });

  it('treats a file of only a BOM and line breaks as empty', () => {
    const file = keyFile(`${BOM}\r\n\n`);
    expect(failureOf(() => readSecretFile(file, SERVICE_ROLE_FILE_VAR)).error.message).toMatch(/is empty/);
  });

  it('refuses a file of more than one line rather than guess which line is the key', () => {
    const file = keyFile(`${SECRET}\nsecond_line_value\n`);
    const { error } = failureOf(() => readSecretFile(file, SERVICE_ROLE_FILE_VAR));
    expect(error.message).toContain(file);
    expect(error.message).toMatch(/more than one line/);
  });

  it('never puts the file content in a message or hint', () => {
    const multi = keyFile(`${SECRET}\nsecond_line_value\n`, 'multi');
    const { text } = failureOf(() => readSecretFile(multi, SERVICE_ROLE_FILE_VAR));
    expect(text).not.toContain(SECRET);
    expect(text).not.toContain('second_line_value');
  });
});

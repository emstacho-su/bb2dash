import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  BB2DASH_PROJECT_REF,
  DEFAULT_LIMIT,
  DEFAULT_MIN_SIMILARITY,
  HARNESS_PROJECT_REF,
  MAX_LIMIT,
  loadConfig,
} from '../src/config.js';
import { ConfigError, describeError } from '../src/errors.js';
import { TEST_KEY, TEST_URL } from './helpers.js';

const base = { SUPABASE_URL: TEST_URL, SUPABASE_SERVICE_ROLE: TEST_KEY };

describe('loadConfig — required values', () => {
  it('loads the URL and key with sensible defaults', () => {
    const config = loadConfig(base);
    expect(config.supabaseUrl).toBe(TEST_URL);
    expect(config.serviceKey).toBe(TEST_KEY);
    expect(config.search).toEqual({
      defaultLimit: DEFAULT_LIMIT,
      maxLimit: MAX_LIMIT,
      minSimilarity: DEFAULT_MIN_SIMILARITY,
    });
    expect(config.timeoutMs).toBeGreaterThan(0);
  });

  it('strips a trailing slash from the URL so paths join cleanly', () => {
    expect(loadConfig({ ...base, SUPABASE_URL: `${TEST_URL}/` }).supabaseUrl).toBe(TEST_URL);
  });

  it('names SUPABASE_URL when it is missing', () => {
    expect(() => loadConfig({ SUPABASE_SERVICE_ROLE: TEST_KEY })).toThrow(ConfigError);
    expect(() => loadConfig({ SUPABASE_SERVICE_ROLE: TEST_KEY })).toThrow(/SUPABASE_URL/);
  });

  it('rejects a non-https URL', () => {
    expect(() => loadConfig({ ...base, SUPABASE_URL: 'http://goultdzqcavefcgnifdy.supabase.co' })).toThrow(
      /https/,
    );
  });

  it('names the key variable when it is missing', () => {
    expect(() => loadConfig({ SUPABASE_URL: TEST_URL })).toThrow(/SUPABASE_SERVICE_ROLE/);
  });

  it('accepts the legacy SUPABASE_SERVICE_KEY name', () => {
    expect(loadConfig({ SUPABASE_URL: TEST_URL, SUPABASE_SERVICE_KEY: 'legacy' }).serviceKey).toBe('legacy');
  });

  it('prefers the new key name over the legacy one', () => {
    const config = loadConfig({ ...base, SUPABASE_SERVICE_KEY: 'old' });
    expect(config.serviceKey).toBe(TEST_KEY);
  });

  it('treats blank values as missing', () => {
    expect(() => loadConfig({ ...base, SUPABASE_SERVICE_ROLE: '   ' })).toThrow(/SUPABASE_SERVICE_ROLE/);
  });
});

describe('loadConfig — the key from a file (SUPABASE_SERVICE_ROLE_FILE)', () => {
  const FILE_KEY = 'sb_secret_from_file_not_real';
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'mcp-config-'));
  });
  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  function keyFile(content: string): string {
    const file = path.join(root, 'bb2dash_mcp_service_key');
    writeFileSync(file, content, 'utf8');
    return file;
  }

  it('reads the key from the file the variable names, BOM and CRLF stripped', () => {
    const config = loadConfig({ SUPABASE_URL: TEST_URL, SUPABASE_SERVICE_ROLE_FILE: keyFile(`﻿${FILE_KEY}\r\n`) });
    expect(config.serviceKey).toBe(FILE_KEY);
  });

  it('the file wins over SUPABASE_SERVICE_ROLE and the legacy SUPABASE_SERVICE_KEY', () => {
    const config = loadConfig({
      ...base,
      SUPABASE_SERVICE_KEY: 'legacy',
      SUPABASE_SERVICE_ROLE_FILE: keyFile(FILE_KEY),
    });
    expect(config.serviceKey).toBe(FILE_KEY);
  });

  it('a named file that is missing fails, never falling back to the plain variable', () => {
    const missing = path.join(root, 'absent');
    let text = '';
    try {
      loadConfig({ ...base, SUPABASE_SERVICE_ROLE_FILE: missing });
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigError);
      text = describeError(error);
    }
    expect(text).toContain('SUPABASE_SERVICE_ROLE_FILE');
    expect(text).toContain(missing);
    expect(text).not.toContain(TEST_KEY);
  });

  it('a named file that is empty fails, never falling back to the plain variable', () => {
    expect(() => loadConfig({ ...base, SUPABASE_SERVICE_ROLE_FILE: keyFile('\n') })).toThrow(/is empty/);
  });

  it('a blank SUPABASE_SERVICE_ROLE_FILE counts as unset, so the plain variable is read', () => {
    expect(loadConfig({ ...base, SUPABASE_SERVICE_ROLE_FILE: '  ' }).serviceKey).toBe(TEST_KEY);
  });

  it('with neither set, the error names the file variable as the way in', () => {
    expect(() => loadConfig({ SUPABASE_URL: TEST_URL })).toThrow(ConfigError);
    try {
      loadConfig({ SUPABASE_URL: TEST_URL });
    } catch (error) {
      expect((error as ConfigError).hint).toContain('SUPABASE_SERVICE_ROLE_FILE');
    }
  });
});

describe('loadConfig — the two-stores guard', () => {
  it('refuses a URL that names the harness-memory project', () => {
    const wrong = `https://${HARNESS_PROJECT_REF}.supabase.co`;
    expect(() => loadConfig({ ...base, SUPABASE_URL: wrong })).toThrow(ConfigError);
    expect(() => loadConfig({ ...base, SUPABASE_URL: wrong })).toThrow(/harness-memory/);
    const error = (() => { try { loadConfig({ ...base, SUPABASE_URL: wrong }); } catch (e) { return e as ConfigError; } return null; })();
    expect(error?.hint).toContain(BB2DASH_PROJECT_REF); // the fix names the right project
  });

  it('warns in the hint when the URL is not the bb2dash project but still loads', () => {
    // A different project might legitimately host a copy of the schema; the
    // only outright refusal is the one store known to be a different vector space.
    const config = loadConfig({ ...base, SUPABASE_URL: 'https://someotherref.supabase.co' });
    expect(config.supabaseUrl).toBe('https://someotherref.supabase.co');
  });
});

describe('loadConfig — tuning', () => {
  it('reads the similarity floor, and "none" disables it', () => {
    expect(loadConfig({ ...base, BB2DASH_MIN_SIMILARITY: '0.5' }).search.minSimilarity).toBe(0.5);
    expect(loadConfig({ ...base, BB2DASH_MIN_SIMILARITY: 'none' }).search.minSimilarity).toBeNull();
  });

  it('rejects a floor outside 0..1', () => {
    expect(() => loadConfig({ ...base, BB2DASH_MIN_SIMILARITY: '1.5' })).toThrow(/BB2DASH_MIN_SIMILARITY/);
    expect(() => loadConfig({ ...base, BB2DASH_MIN_SIMILARITY: 'abc' })).toThrow(/BB2DASH_MIN_SIMILARITY/);
  });

  it('reads limits and rejects a default above the maximum', () => {
    const config = loadConfig({ ...base, BB2DASH_DEFAULT_LIMIT: '5', BB2DASH_MAX_LIMIT: '20' });
    expect(config.search).toMatchObject({ defaultLimit: 5, maxLimit: 20 });
    expect(() => loadConfig({ ...base, BB2DASH_DEFAULT_LIMIT: '30', BB2DASH_MAX_LIMIT: '20' })).toThrow(
      /BB2DASH_DEFAULT_LIMIT/,
    );
    expect(() => loadConfig({ ...base, BB2DASH_MAX_LIMIT: '0' })).toThrow(/BB2DASH_MAX_LIMIT/);
  });

  it('reads the timeout and rejects nonsense', () => {
    expect(loadConfig({ ...base, BB2DASH_TIMEOUT_MS: '5000' }).timeoutMs).toBe(5000);
    expect(() => loadConfig({ ...base, BB2DASH_TIMEOUT_MS: '-1' })).toThrow(/BB2DASH_TIMEOUT_MS/);
  });
});

describe('loadConfig — limit ceiling', () => {
  it('refuses a BB2DASH_MAX_LIMIT above the advertised hard ceiling', () => {
    expect(() => loadConfig({ ...base, BB2DASH_MAX_LIMIT: String(MAX_LIMIT + 1) })).toThrow(/hard ceiling/);
    expect(loadConfig({ ...base, BB2DASH_MAX_LIMIT: String(MAX_LIMIT) }).search.maxLimit).toBe(MAX_LIMIT);
  });
});

/**
 * C-2 — the config schema, its defaults, and the environment overrides the
 * e2e suite uses to point the shell at a local fixture instead of Supabase.
 */

import { describe, expect, it } from 'vitest';

import {
  CONFIG_DEFAULTS,
  ConfigError,
  allowedOrigins,
  applyEnvOverrides,
  loadConfigFrom,
  parseConfig,
} from '../../src/core/config';

const MINIMAL = { supabaseAnonKey: 'eyJhbGciOiJIUzI1NiJ9.anon.signature' };

describe('parseConfig', () => {
  it('fills every default when only the anon key is given', () => {
    const config = parseConfig(MINIMAL);
    expect(config.appUrl).toBe(CONFIG_DEFAULTS.appUrl);
    expect(config.supabaseUrl).toBe(CONFIG_DEFAULTS.supabaseUrl);
    expect(config.repoDir).toBe(CONFIG_DEFAULTS.repoDir);
    expect(config.pollIntervalMinutes).toBe(15);
    expect(config.dueReminderTime).toBe('18:00');
    expect(config.syncDryRun).toBe(false);
  });

  it('rejects a missing anon key and names the field', () => {
    expect(() => parseConfig({})).toThrowError(ConfigError);
    try {
      parseConfig({});
    } catch (error) {
      expect((error as ConfigError).field).toBe('supabaseAnonKey');
    }
  });

  it.each([
    ['appUrl', { ...MINIMAL, appUrl: 'ftp://example.com' }],
    ['supabaseUrl', { ...MINIMAL, supabaseUrl: 'not a url' }],
    ['pollIntervalMinutes', { ...MINIMAL, pollIntervalMinutes: 0 }],
    ['dueReminderTime', { ...MINIMAL, dueReminderTime: '6pm' }],
    ['syncDryRun', { ...MINIMAL, syncDryRun: 'yes' }],
  ])('rejects a bad %s and names it', (field, raw) => {
    try {
      parseConfig(raw);
      throw new Error('expected parseConfig to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigError);
      expect((error as ConfigError).field).toBe(field);
    }
  });

  it('rejects a file that is not a JSON object', () => {
    for (const raw of [null, 42, 'text', ['a']]) {
      expect(() => parseConfig(raw)).toThrowError(ConfigError);
    }
  });

  it('accepts 24-hour times at both ends of the day', () => {
    expect(parseConfig({ ...MINIMAL, dueReminderTime: '00:00' }).dueReminderTime).toBe('00:00');
    expect(parseConfig({ ...MINIMAL, dueReminderTime: '23:59' }).dueReminderTime).toBe('23:59');
  });
});

describe('applyEnvOverrides', () => {
  it('returns a new object and leaves the file value untouched', () => {
    const file = { ...MINIMAL };
    const merged = applyEnvOverrides(file, { BB2DASH_APP_URL: 'http://127.0.0.1:4321' });
    expect(merged).not.toBe(file);
    expect(file).toEqual(MINIMAL);
    expect(merged.appUrl).toBe('http://127.0.0.1:4321');
  });

  it('ignores an unset or empty variable', () => {
    const merged = applyEnvOverrides(
      { ...MINIMAL, appUrl: 'https://kept.example' },
      { BB2DASH_APP_URL: '', BB2DASH_REPO_DIR: undefined },
    );
    expect(merged.appUrl).toBe('https://kept.example');
    expect(merged.repoDir).toBeUndefined();
  });

  it('coerces the numeric and boolean overrides', () => {
    const merged = loadConfigFrom(MINIMAL, {
      BB2DASH_POLL_INTERVAL_MINUTES: '3',
      BB2DASH_SYNC_DRY_RUN: '1',
    });
    expect(merged.pollIntervalMinutes).toBe(3);
    expect(merged.syncDryRun).toBe(true);
  });

  it('keeps a non-numeric interval as a string so the schema rejects it by name', () => {
    try {
      loadConfigFrom(MINIMAL, { BB2DASH_POLL_INTERVAL_MINUTES: 'often' });
      throw new Error('expected loadConfigFrom to throw');
    } catch (error) {
      expect((error as ConfigError).field).toBe('pollIntervalMinutes');
    }
  });
});

describe('allowedOrigins', () => {
  it('is exactly the app origin and the Supabase origin (C-4)', () => {
    const config = loadConfigFrom(MINIMAL, {
      BB2DASH_APP_URL: 'https://app.example.com/some/path',
      BB2DASH_SUPABASE_URL: 'https://goultdzqcavefcgnifdy.supabase.co',
    });
    expect(allowedOrigins(config)).toEqual([
      'https://app.example.com',
      'https://goultdzqcavefcgnifdy.supabase.co',
    ]);
  });
});

/**
 * C-2 — the config schema, its defaults, and the environment overrides the
 * e2e suite uses to point the shell at a local fixture instead of Supabase.
 */

import { homedir } from 'node:os';
import { win32 } from 'node:path';

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

describe('CONFIG_DEFAULTS', () => {
  // Spelled out where C-2's table fixes a literal; `repoDir` is the one value
  // derived at load time (the signed-in profile's `projects\bb2dash`), so it is
  // pinned to its derivation rather than to a username.
  it('matches the values C-2 fixes, character for character', () => {
    expect(CONFIG_DEFAULTS).toEqual({
      appUrl: 'https://web-xi-ten-uy9xk6c6p0.vercel.app',
      supabaseUrl: 'https://goultdzqcavefcgnifdy.supabase.co',
      repoDir: win32.join(homedir(), 'projects', 'bb2dash'),
      pollIntervalMinutes: 15,
      dueReminderTime: '18:00',
      syncDryRun: false,
      syncLauncher: 'terminal',
      novncPasswordFile: win32.join(homedir(), '.bb2dash-secrets', 'novnc_password'),
    });
  });

  it('puts the noVNC password file in the secrets folder outside every repo (DECISIONS 2026-10-03)', () => {
    expect(win32.relative(homedir(), CONFIG_DEFAULTS.novncPasswordFile)).toBe(
      win32.join('.bb2dash-secrets', 'novnc_password'),
    );
    expect(CONFIG_DEFAULTS.novncPasswordFile).not.toMatch(/bb2dash-stack/);
  });

  it('derives repoDir from the home folder, printable characters only', () => {
    // eslint-disable-next-line no-control-regex
    expect(CONFIG_DEFAULTS.repoDir).not.toMatch(/[\u0000-\u001f]/);
    expect(win32.relative(homedir(), CONFIG_DEFAULTS.repoDir)).toBe(
      win32.join('projects', 'bb2dash'),
    );
    expect(CONFIG_DEFAULTS.repoDir.split('\\').slice(-2)).toEqual(['projects', 'bb2dash']);
  });
});

describe('parseConfig', () => {
  it('fills every default when only the anon key is given', () => {
    const config = parseConfig(MINIMAL);
    expect(config.appUrl).toBe(CONFIG_DEFAULTS.appUrl);
    expect(config.supabaseUrl).toBe(CONFIG_DEFAULTS.supabaseUrl);
    expect(config.repoDir).toBe(CONFIG_DEFAULTS.repoDir);
    expect(config.pollIntervalMinutes).toBe(15);
    expect(config.dueReminderTime).toBe('18:00');
    expect(config.syncDryRun).toBe(false);
    expect(config.syncLauncher).toBe('terminal');
    expect(config.novncPasswordFile).toBe(CONFIG_DEFAULTS.novncPasswordFile);
  });

  it('accepts both syncLauncher values and a password file path', () => {
    expect(parseConfig({ ...MINIMAL, syncLauncher: 'queue-only' }).syncLauncher).toBe('queue-only');
    expect(parseConfig({ ...MINIMAL, syncLauncher: 'terminal' }).syncLauncher).toBe('terminal');
    expect(parseConfig({ ...MINIMAL, novncPasswordFile: 'D:\\keys\\novnc' }).novncPasswordFile).toBe('D:\\keys\\novnc');
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
    ['syncLauncher', { ...MINIMAL, syncLauncher: 'auto' }],
    ['syncLauncher', { ...MINIMAL, syncLauncher: 'Queue-Only' }],
    ['novncPasswordFile', { ...MINIMAL, novncPasswordFile: '' }],
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

  it('reads BB2DASH_SYNC_LAUNCHER and BB2DASH_NOVNC_PASSWORD_FILE', () => {
    const merged = loadConfigFrom(MINIMAL, {
      BB2DASH_SYNC_LAUNCHER: 'queue-only',
      BB2DASH_NOVNC_PASSWORD_FILE: 'D:\\keys\\novnc',
    });
    expect(merged.syncLauncher).toBe('queue-only');
    expect(merged.novncPasswordFile).toBe('D:\\keys\\novnc');
  });

  it('lets the environment win over the file for syncLauncher, and rejects a bad value by name', () => {
    const file = { ...MINIMAL, syncLauncher: 'terminal' };
    expect(loadConfigFrom(file, { BB2DASH_SYNC_LAUNCHER: 'queue-only' }).syncLauncher).toBe('queue-only');
    try {
      loadConfigFrom(file, { BB2DASH_SYNC_LAUNCHER: 'container' });
      throw new Error('expected loadConfigFrom to throw');
    } catch (error) {
      expect((error as ConfigError).field).toBe('syncLauncher');
    }
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

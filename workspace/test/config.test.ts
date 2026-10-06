import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  BUDGET_CAP_HOLDS,
  CANCEL_POLL_MS,
  CLAUDE_CODE_VERSION,
  CONTENT_MAX_CHARS,
  ConfigError,
  DB_WATCHDOG_MS,
  HEALTH_MAX_AGE_MS,
  HEARTBEAT_MS,
  HISTORY_REPLAY,
  NO_CAP_SENTENCE,
  PATHS,
  POLL_INTERVAL_MS,
  REPLAY_MAX_BYTES,
  STREAM_DELTA_MAX_CHARS,
  STREAM_FLUSH_MS,
  TOOL_CALLS_MAX,
  TOOL_QUERY_MAX_CHARS,
  TURN_CONCURRENCY,
  TURN_TIMEOUT_MS,
  assertRunnerDsn,
  assertSubscriptionEnv,
  cleanSecret,
  loadConfig,
  parseTurnBudget,
  readOauthToken,
  refusedEnvNames,
} from '../src/config.js';
import { buildArgs } from '../src/providers/claude-cli.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SETTINGS = path.resolve(HERE, '..', 'claude', 'settings.json');

// Made-up values in the shapes the real ones have; none is a credential.
const DSN = 'postgresql://workspace_runner.projectref:not-a-password@aws-0-us-east-1.pooler.supabase.com:5432/postgres?uselibpqcompat=true&sslmode=require';
const TOKEN = 'not-a-real-token';

function files(map: Record<string, string>): (file: string) => string | null {
  return (file) => (file in map ? (map[file] ?? null) : null);
}

const goodFiles = files({ [PATHS.runnerDbUrlSecret]: DSN, [PATHS.oauthTokenSecret]: TOKEN });

describe('the constants the Contract names', () => {
  it('holds the loop and stream numbers', () => {
    expect(POLL_INTERVAL_MS).toBe(2000);
    expect(TURN_CONCURRENCY).toBe(1);
    expect(STREAM_FLUSH_MS).toBe(250);
    expect(CANCEL_POLL_MS).toBe(2000);
    expect(TURN_TIMEOUT_MS).toBe(8 * 60 * 1000);
    expect(HEARTBEAT_MS).toBe(30000);
    expect(DB_WATCHDOG_MS).toBe(180000);
    expect(HEALTH_MAX_AGE_MS).toBe(90000);
    expect(HISTORY_REPLAY).toBe(20);
    expect(REPLAY_MAX_BYTES).toBe(96 * 1024);
    expect(STREAM_DELTA_MAX_CHARS).toBe(16000);
    expect(CONTENT_MAX_CHARS).toBe(100000);
    expect(TOOL_CALLS_MAX).toBe(20);
    expect(TOOL_QUERY_MAX_CHARS).toBe(200);
  });

  it('kills a turn before the database sweeps its claim at 10 minutes', () => {
    expect(TURN_TIMEOUT_MS).toBeLessThan(10 * 60 * 1000);
  });

  it('pins one exact CLI version', () => {
    expect(CLAUDE_CODE_VERSION).toBe('2.1.289');
  });

  it('reads its two secrets at fixed paths', () => {
    expect(PATHS.runnerDbUrlSecret).toBe('/run/secrets/workspace_runner_db_url');
    expect(PATHS.oauthTokenSecret).toBe('/run/secrets/claude_oauth_token');
    expect(PATHS.aliveFile).toBe('/run/workspace/alive');
    expect(PATHS.turnCwd).toBe('/app/turn');
  });

  it('holds the O-2 switch and its sentence', () => {
    expect(typeof BUDGET_CAP_HOLDS).toBe('boolean');
    expect(NO_CAP_SENTENCE).toBe('No per-answer cost limit applies to this answer.');
  });
});

describe('the subscription guard', () => {
  it('lets a clean environment start', () => {
    expect(() => assertSubscriptionEnv({ PATH: '/usr/bin', CLAUDE_CONFIG_DIR: '/home/node/.claude', ENABLE_TOOL_SEARCH: 'false' })).not.toThrow();
    expect(() => assertSubscriptionEnv({ CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1', CLAUDE_CODE_OAUTH_TOKEN: TOKEN })).not.toThrow();
  });

  it.each([
    ['ANTHROPIC_API_KEY'],
    ['ANTHROPIC_AUTH_TOKEN'],
    ['ANTHROPIC_BASE_URL'],
    ['CLAUDE_CODE_SIMPLE'],
    ['CLAUDE_CODE_USE_BEDROCK'],
    ['CLAUDE_CODE_USE_VERTEX'],
    ['CLAUDE_CODE_USE_FOUNDRY'],
    ['CLAUDE_CODE_USE_ANYTHING_ELSE'],
  ])('refuses to start with %s set', (name) => {
    expect(() => assertSubscriptionEnv({ PATH: '/usr/bin', [name]: 'value-that-must-not-be-printed' })).toThrow(ConfigError);
    try {
      assertSubscriptionEnv({ [name]: 'value-that-must-not-be-printed' });
    } catch (error) {
      expect((error as Error).message).toContain(name);
      expect((error as Error).message).not.toContain('value-that-must-not-be-printed');
    }
  });

  it('refuses a refused name even when its value is empty', () => {
    expect(() => assertSubscriptionEnv({ ANTHROPIC_API_KEY: '' })).toThrow(ConfigError);
  });

  it('names every refused variable at once', () => {
    expect(refusedEnvNames({ ANTHROPIC_API_KEY: 'a', CLAUDE_CODE_USE_BEDROCK: '1', HOME: '/home/node' })).toEqual([
      'ANTHROPIC_API_KEY',
      'CLAUDE_CODE_USE_BEDROCK',
    ]);
  });

  it('does not read an unset name as set', () => {
    expect(refusedEnvNames({ ANTHROPIC_API_KEY: undefined })).toEqual([]);
  });
});

describe('the runner DSN', () => {
  it('accepts the session pooler with an sslmode', () => {
    expect(assertRunnerDsn(DSN)).toBe(DSN);
  });

  it('refuses port 6543, the transaction pooler', () => {
    expect(() => assertRunnerDsn(DSN.replace(':5432/', ':6543/'))).toThrow(/6543/);
  });

  it('refuses a DSN with no sslmode', () => {
    expect(() => assertRunnerDsn(DSN.replace('&sslmode=require', ''))).toThrow(/sslmode/);
  });

  it.each([['disable'], ['allow'], ['prefer']])('refuses sslmode=%s', (mode) => {
    expect(() => assertRunnerDsn(DSN.replace('sslmode=require', `sslmode=${mode}`))).toThrow(/sslmode/);
  });

  it('refuses text that is not a URL', () => {
    expect(() => assertRunnerDsn('not a url')).toThrow(ConfigError);
  });

  it('never prints the DSN in its refusal', () => {
    for (const bad of [DSN.replace(':5432/', ':6543/'), DSN.replace('&sslmode=require', ''), `${DSN} trailing`]) {
      try {
        assertRunnerDsn(bad);
      } catch (error) {
        expect((error as Error).message).not.toContain('not-a-password');
        expect((error as Error).message).not.toContain('pooler.supabase.com');
      }
    }
  });
});

describe('the per-answer budget', () => {
  it.each([
    [undefined, 1],
    ['', 1],
    ['  ', 1],
    ['1.00', 1],
    ['1', 1],
    ['0.01', 0.01],
    ['0.5', 0.5],
    [' 0.25 ', 0.25],
  ])('reads %j as %s dollars', (raw, dollars) => {
    expect(parseTurnBudget(raw)).toBe(dollars);
  });

  it.each([['0'], ['0.00'], ['1.01'], ['2'], ['0.009'], ['-1'], ['abc'], ['1e0'], ['$1'], ['1,00'], ['NaN'], ['Infinity']])(
    'refuses WORKSPACE_TURN_BUDGET_USD=%s',
    (raw) => {
      expect(() => parseTurnBudget(raw)).toThrow(ConfigError);
    },
  );

  // The flag is written with two decimals, so a third would reach the CLI rounded: 0.015 as 0.01, 0.999 as 1.00.
  it.each([['0.015'], ['0.999'], ['0.125'], ['1.000'], ['0.010']])('refuses a third decimal: WORKSPACE_TURN_BUDGET_USD=%s', (raw) => {
    expect(() => parseTurnBudget(raw)).toThrow(ConfigError);
    expect(() => parseTurnBudget(raw)).toThrow(/two decimals/);
    expect(() => loadConfig({ env: { WORKSPACE_TURN_BUDGET_USD: raw }, readFile: goodFiles, hostname: 'h' })).toThrow(ConfigError);
  });

  it('hands --max-budget-usd the same amount for every value it accepts, one cent to one dollar', () => {
    for (let cents = 1; cents <= 100; cents += 1) {
      const written = (cents / 100).toFixed(2);
      const args = buildArgs({
        model: 'haiku',
        session: { mode: 'fresh', sessionId: '9f1c2d3e-4a5b-4c6d-8e7f-001122334455' },
        systemPrompt: 'x',
        budgetUsd: parseTurnBudget(written),
        prompt: 'q',
      });
      expect(args[args.indexOf('--max-budget-usd') + 1]).toBe(written);
    }
  });
});

describe('loadConfig', () => {
  it('reads the DSN from its fixed path and the budget from the environment', () => {
    const config = loadConfig({ env: { WORKSPACE_TURN_BUDGET_USD: '0.01' }, readFile: goodFiles, hostname: 'workspace-1' });
    expect(config.dbUrl).toBe(DSN);
    expect(config.budgetUsd).toBe(0.01);
    expect(config.runnerName).toBe('workspace@workspace-1');
  });

  it('defaults the budget to one dollar', () => {
    expect(loadConfig({ env: {}, readFile: goodFiles, hostname: 'h' }).budgetUsd).toBe(1);
  });

  it('strips the byte-order mark and line ends a secret file may carry', () => {
    const readFile = files({ [PATHS.runnerDbUrlSecret]: `﻿${DSN}\r\n`, [PATHS.oauthTokenSecret]: `${TOKEN}\n` });
    expect(loadConfig({ env: {}, readFile, hostname: 'h' }).dbUrl).toBe(DSN);
    expect(readOauthToken(readFile)).toBe(TOKEN);
    expect(cleanSecret(`﻿  ${TOKEN}\r\n`)).toBe(TOKEN);
  });

  it('refuses to start without the DSN secret', () => {
    expect(() => loadConfig({ env: {}, readFile: files({}), hostname: 'h' })).toThrow(/workspace_runner_db_url/);
    expect(() => loadConfig({ env: {}, readFile: files({ [PATHS.runnerDbUrlSecret]: '\n' }), hostname: 'h' })).toThrow(ConfigError);
  });

  it('refuses to start with an API key in the environment, before it reads any secret', () => {
    let read = 0;
    const readFile = (file: string): string | null => {
      read += 1;
      return goodFiles(file);
    };
    expect(() => loadConfig({ env: { ANTHROPIC_API_KEY: 'x' }, readFile, hostname: 'h' })).toThrow(/ANTHROPIC_API_KEY/);
    expect(read).toBe(0);
  });

  it('refuses a DSN on port 6543 or with no sslmode', () => {
    const on6543 = files({ [PATHS.runnerDbUrlSecret]: DSN.replace(':5432/', ':6543/') });
    const noSsl = files({ [PATHS.runnerDbUrlSecret]: DSN.replace('&sslmode=require', '') });
    expect(() => loadConfig({ env: {}, readFile: on6543, hostname: 'h' })).toThrow(/6543/);
    expect(() => loadConfig({ env: {}, readFile: noSsl, hostname: 'h' })).toThrow(/sslmode/);
  });

  it('refuses a budget outside 0.01 to 1.00', () => {
    expect(() => loadConfig({ env: { WORKSPACE_TURN_BUDGET_USD: '0' }, readFile: goodFiles, hostname: 'h' })).toThrow(ConfigError);
    expect(() => loadConfig({ env: { WORKSPACE_TURN_BUDGET_USD: '1.01' }, readFile: goodFiles, hostname: 'h' })).toThrow(ConfigError);
  });

  it('never takes the DSN from the environment', () => {
    const env = { DATABASE_URL: 'postgresql://other', WORKSPACE_RUNNER_DB_URL: 'postgresql://other' };
    expect(loadConfig({ env, readFile: goodFiles, hostname: 'h' }).dbUrl).toBe(DSN);
  });
});

describe('the OAuth token', () => {
  it('is read from its fixed path', () => {
    expect(readOauthToken(goodFiles)).toBe(TOKEN);
  });

  it.each([
    ['missing', files({})],
    ['empty', files({ [PATHS.oauthTokenSecret]: '' })],
    ['only white space', files({ [PATHS.oauthTokenSecret]: ' \r\n' })],
  ])('is refused when the file is %s', (_what, readFile) => {
    expect(() => readOauthToken(readFile)).toThrow(/claude_oauth_token/);
  });
});

describe('the byte-order mark in source', () => {
  // The mark is invisible in an editor and in a diff, so a file that handles it spells it as an escape.
  const MARK = '﻿';
  // The six characters of the escape. Not String.raw: the test transformer cooks the escape inside a template.
  const ESCAPE = '\\uFEFF';
  const PACKAGE_ROOT = path.resolve(HERE, '..');
  const SOURCE_DIRS = ['src', 'test'];
  const SOURCE_FILE = /\.(ts|mjs)$/;

  const sourceFiles = SOURCE_DIRS.flatMap((dir) =>
    fs
      .readdirSync(path.join(PACKAGE_ROOT, dir), { recursive: true, encoding: 'utf8' })
      .filter((name) => SOURCE_FILE.test(name))
      .map((name) => path.join(dir, name).replaceAll(path.sep, '/')),
  ).sort();
  const read = (file: string): string => fs.readFileSync(path.join(PACKAGE_ROOT, file), 'utf8');

  it('finds the source files it reads, config.ts and this file among them', () => {
    expect(sourceFiles).toContain('src/config.ts');
    expect(sourceFiles).toContain('test/config.test.ts');
  });

  it('is in no source file as a literal character', () => {
    expect(sourceFiles.filter((file) => read(file).includes(MARK))).toEqual([]);
  });

  it('is written as an escape where config.ts strips it', () => {
    expect(ESCAPE).toHaveLength(6);
    expect(read('src/config.ts')).toContain(`/^${ESCAPE}/`);
  });
});

describe('claude/settings.json', () => {
  const settings = JSON.parse(fs.readFileSync(SETTINGS, 'utf8')) as Record<string, unknown>;

  it('carries no apiKeyHelper and no env key', () => {
    expect('apiKeyHelper' in settings).toBe(false);
    expect('env' in settings).toBe(false);
    expect(fs.readFileSync(SETTINGS, 'utf8')).not.toMatch(/apiKeyHelper|ANTHROPIC_|sk-ant-/);
  });

  it('keeps transcripts for 30 days, written on purpose', () => {
    expect(settings.cleanupPeriodDays).toBe(30);
  });

  it('holds only the retention setting and the hook', () => {
    expect(Object.keys(settings).sort()).toEqual(['cleanupPeriodDays', 'hooks']);
  });
});

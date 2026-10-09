import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  ARG_MAX_BYTES,
  BACKGROUND_TURN_BUDGET_USD,
  MEMORY_JOBS_ENV,
  PLAN_BUDGET_USD,
  PLAN_MIN_TURN_BUDGET_USD,
  PLAN_MODEL,
  PLAN_TIMEOUT_MS,
  BUDGET_CAP_HOLDS,
  CANCEL_POLL_MS,
  CLAUDE_CODE_VERSION,
  CONTENT_MAX_CHARS,
  ConfigError,
  DB_CA_FILE_ENV,
  DB_WATCHDOG_MS,
  HEALTH_MAX_AGE_MS,
  HEARTBEAT_MS,
  NO_CAP_SENTENCE,
  PATHS,
  POLL_INTERVAL_MS,
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
import { dsnParts } from '../src/db.js';
import { buildArgs, createCliTurn } from '../src/providers/claude-cli.js';
import { CONVERSATION_ID, QUESTION, collect, fakeSpawn } from './helpers/fakes.js';
import { makeThrowawayCa } from './helpers/throwaway-ca.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SETTINGS = path.resolve(HERE, '..', 'claude', 'settings.json');

// Made-up values in the shapes the real ones have; none is a credential.
const DSN = 'postgresql://workspace_runner.projectref:not-a-password@aws-0-us-east-1.pooler.supabase.com:5432/postgres?uselibpqcompat=true&sslmode=require';
const TOKEN = 'not-a-real-token';

function files(map: Record<string, string>): (file: string) => string | null {
  return (file) => (file in map ? (map[file] ?? null) : null);
}

/** A certificate made for this run (test/helpers/throwaway-ca.ts): the shape of the pinned CA file, never a real one. */
const CA_PEM = makeThrowawayCa('w64 config test CA').certPem;
const DEFAULT_CA_FILE = '/app/certs/prod-ca.crt';
const CA_FILE_ENV = 'WORKSPACE_DB_CA_FILE';
/** The code point of the byte-order mark an editor may put in front of a file. */
const BYTE_ORDER_MARK = 0xfeff;

const goodFiles = files({ [PATHS.runnerDbUrlSecret]: DSN, [PATHS.oauthTokenSecret]: TOKEN, [DEFAULT_CA_FILE]: CA_PEM });

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
    expect(STREAM_DELTA_MAX_CHARS).toBe(16000);
    expect(CONTENT_MAX_CHARS).toBe(100000);
    expect(TOOL_CALLS_MAX).toBe(20);
    expect(TOOL_QUERY_MAX_CHARS).toBe(200);
  });

  it('holds the planning turn numbers of Phase 24a', () => {
    expect(PLAN_BUDGET_USD).toBe(0.05);
    expect(PLAN_TIMEOUT_MS).toBe(20_000);
    expect(PLAN_MIN_TURN_BUDGET_USD).toBe(0.1);
    expect(BACKGROUND_TURN_BUDGET_USD).toBe(0.05);
    expect(PLAN_MODEL).toBe('haiku');
    expect(MEMORY_JOBS_ENV).toBe('WORKSPACE_MEMORY_JOBS');
    expect(ARG_MAX_BYTES).toBe(131_072);
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
  /** What the start check says of a DSN: its refusal, or 'accepted'. */
  const refusalOf = (dsn: string): string => {
    try {
      assertRunnerDsn(dsn);
      return 'accepted';
    } catch (error) {
      return (error as Error).message;
    }
  };

  it('accepts the session pooler with an sslmode', () => {
    expect(assertRunnerDsn(DSN)).toBe(DSN);
  });

  it('refuses port 6543, the transaction pooler', () => {
    expect(() => assertRunnerDsn(DSN.replace(':5432/', ':6543/'))).toThrow(/6543/);
  });

  it('refuses a DSN with no sslmode', () => {
    expect(() => assertRunnerDsn(DSN.replace('&sslmode=require', ''))).toThrow(/sslmode/);
  });

  it.each([['disable'], ['allow'], ['prefer'], ['no-verify'], ['NO-VERIFY']])('refuses sslmode=%s', (mode) => {
    expect(() => assertRunnerDsn(DSN.replace('sslmode=require', `sslmode=${mode}`))).toThrow(ConfigError);
    expect(() => assertRunnerDsn(DSN.replace('sslmode=require', `sslmode=${mode}`))).toThrow(/sslmode/);
  });

  it.each([['require'], ['verify-ca'], ['verify-full']])('accepts sslmode=%s', (mode) => {
    const dsn = DSN.replace('sslmode=require', `sslmode=${mode}`);
    expect(assertRunnerDsn(dsn)).toBe(dsn);
  });

  it('accepts the stored form as it is: its flags decide nothing, the runner verifies whatever they say', () => {
    expect(DSN).toContain('?uselibpqcompat=true&sslmode=require');
    expect(assertRunnerDsn(DSN)).toBe(DSN);
  });

  it('recommends no unverified form in any refusal, and names the verified one', () => {
    const refusals = [DSN.replace(':5432/', ':6543/'), DSN.replace('&sslmode=require', ''), DSN.replace('sslmode=require', 'sslmode=no-verify'), DSN.replace('sslmode=require', 'sslmode=disable')].map((bad) => {
      try {
        assertRunnerDsn(bad);
        return 'accepted';
      } catch (error) {
        return (error as Error).message;
      }
    });
    for (const message of refusals) {
      expect(message).not.toBe('accepted');
      expect(message).not.toMatch(/uselibpqcompat|no-verify|sslmode=require/);
    }
    expect(refusals[1]).toMatch(/sslmode=verify-full/);
  });

  it('refuses text that is not a URL', () => {
    expect(() => assertRunnerDsn('not a url')).toThrow(ConfigError);
  });

  // The connection is made from these parts alone (db.ts), so a DSN without one is refused at start, not at the first connect.
  it('refuses a DSN that names no host: with a user in front of it, that is not a URL at all', () => {
    const noHost = 'postgresql://workspace_runner.projectref:not-a-password@/postgres?sslmode=require';
    expect(() => assertRunnerDsn(noHost)).toThrow(ConfigError);
    expect(() => assertRunnerDsn(noHost)).toThrow(/not a postgresql:\/\/ URL|names no host/);
    expect(() => assertRunnerDsn('postgresql:///postgres?sslmode=require')).toThrow(/names no host/);
  });

  it.each([
    ['user', 'postgresql://:not-a-password@aws-0-us-east-1.pooler.supabase.com:5432/postgres?sslmode=require'],
    ['password', 'postgresql://workspace_runner.projectref@aws-0-us-east-1.pooler.supabase.com:5432/postgres?sslmode=require'],
    ['database', 'postgresql://workspace_runner.projectref:not-a-password@aws-0-us-east-1.pooler.supabase.com:5432/?sslmode=require'],
  ])('refuses a DSN that names no %s, and says which part without printing any', (part, dsn) => {
    expect(() => assertRunnerDsn(dsn)).toThrow(ConfigError);
    try {
      assertRunnerDsn(dsn);
    } catch (error) {
      expect((error as Error).message).toContain(`names no ${part}`);
      expect((error as Error).message).not.toContain('not-a-password');
      expect((error as Error).message).not.toContain('pooler.supabase.com');
      expect((error as Error).message).not.toContain('projectref');
    }
  });

  // What the start check lets through, the connection must be able to read: db.ts percent-decodes
  // these three parts on every connect, and a start that passed must not then fail there for good.
  it.each([
    ['user', 'postgresql://workspace_runner%zz.projectref:not-a-password@aws-0-us-east-1.pooler.supabase.com:5432/postgres?sslmode=require'],
    ['password', 'postgresql://workspace_runner.projectref:not-a-%password@aws-0-us-east-1.pooler.supabase.com:5432/postgres?sslmode=require'],
    ['database', 'postgresql://workspace_runner.projectref:not-a-password@aws-0-us-east-1.pooler.supabase.com:5432/post%gres?sslmode=require'],
  ])('refuses at start a DSN whose %s holds a malformed percent escape, which the connection could never read', (_part, dsn) => {
    expect(() => dsnParts(dsn)).toThrow(/not percent-encoded text/);
    expect(() => assertRunnerDsn(dsn)).toThrow(ConfigError);
    expect(refusalOf(dsn)).toBe('workspace_runner_db_url holds a part that is not percent-encoded text');
    const mounted = files({ [PATHS.runnerDbUrlSecret]: dsn, [PATHS.oauthTokenSecret]: TOKEN, [DEFAULT_CA_FILE]: CA_PEM });
    expect(() => loadConfig({ env: {}, readFile: mounted, hostname: 'h' })).toThrow(ConfigError);
  });

  it('still accepts a user, a password and a database that are percent-encoded as they should be', () => {
    const encoded = 'postgresql://workspace_runner.projectref:not%2Da%40password@aws-0-us-east-1.pooler.supabase.com:5432/post%67res?sslmode=require';
    expect(assertRunnerDsn(encoded)).toBe(encoded);
    expect(dsnParts(encoded)).toMatchObject({ password: 'not-a@password', database: 'postgres' });
  });

  // The driver reads port 0 as no port and takes PGPORT or its own default: not what the secret names.
  it.each([[':0/'], [':00/']])('refuses port 0 (written %s), and says so without printing any part', (port) => {
    const onZero = DSN.replace(':5432/', port);
    expect(() => assertRunnerDsn(onZero)).toThrow(ConfigError);
    const message = refusalOf(onZero);
    expect(message).toMatch(/port 0/);
    expect(message).toMatch(/session pooler on 5432/);
    expect(message).not.toContain('not-a-password');
    expect(message).not.toContain('pooler.supabase.com');
    expect(message).not.toContain('projectref');
  });

  it('hands the client the same DSN it accepted: every part the connection is made from is there', () => {
    expect(dsnParts(assertRunnerDsn(DSN))).toEqual({
      host: 'aws-0-us-east-1.pooler.supabase.com',
      port: 5432,
      user: 'workspace_runner.projectref',
      password: 'not-a-password',
      database: 'postgres',
    });
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
        sessionId: '9f1c2d3e-4a5b-4c6d-8e7f-001122334455',
        kind: 'answer',
        mcpConfig: '/run/workspace/mcp-1.json',
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
    const readFile = files({ [PATHS.runnerDbUrlSecret]: `\uFEFF${DSN}\r\n`, [PATHS.oauthTokenSecret]: `${TOKEN}\n`, [DEFAULT_CA_FILE]: CA_PEM });
    expect(loadConfig({ env: {}, readFile, hostname: 'h' }).dbUrl).toBe(DSN);
    expect(readOauthToken(readFile)).toBe(TOKEN);
    expect(cleanSecret(`\uFEFF  ${TOKEN}\r\n`, 'the secret under test')).toBe(TOKEN);
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

describe('the pinned CA the database connection is verified against (ruling V1, SR-1)', () => {
  const secrets = { [PATHS.runnerDbUrlSecret]: DSN, [PATHS.oauthTokenSecret]: TOKEN };
  const OTHER_CA_FILE = '/run/workspace/another-ca.crt';
  const messageFrom = (work: () => unknown): string => {
    try {
      work();
      return 'started';
    } catch (error) {
      return error instanceof ConfigError ? error.message : `not a ConfigError: ${String(error)}`;
    }
  };

  it('is read at /app/certs/prod-ca.crt when WORKSPACE_DB_CA_FILE is not set', () => {
    expect(PATHS.dbCaFile).toBe(DEFAULT_CA_FILE);
    expect(DB_CA_FILE_ENV).toBe(CA_FILE_ENV);
    expect(loadConfig({ env: {}, readFile: goodFiles, hostname: 'h' }).dbCa).toBe(CA_PEM);
  });

  it('is read at the file WORKSPACE_DB_CA_FILE names, and only there', () => {
    const read: string[] = [];
    const other = makeThrowawayCa('w64 config test CA, another').certPem;
    const map = files({ ...secrets, [DEFAULT_CA_FILE]: CA_PEM, [OTHER_CA_FILE]: other });
    const readFile = (file: string): string | null => {
      read.push(file);
      return map(file);
    };
    expect(loadConfig({ env: { [CA_FILE_ENV]: OTHER_CA_FILE }, readFile, hostname: 'h' }).dbCa).toBe(other);
    expect(read).toContain(OTHER_CA_FILE);
    expect(read).not.toContain(DEFAULT_CA_FILE);
  });

  it.each([[''], ['   ']])('reads WORKSPACE_DB_CA_FILE=%j as not set', (value) => {
    expect(loadConfig({ env: { [CA_FILE_ENV]: value }, readFile: goodFiles, hostname: 'h' }).dbCa).toBe(CA_PEM);
  });

  it('keeps the certificate text as the file holds it, line ends included, without a byte-order mark', () => {
    const readFile = files({ ...secrets, [DEFAULT_CA_FILE]: `${String.fromCharCode(BYTE_ORDER_MARK)}${CA_PEM}` });
    const { dbCa } = loadConfig({ env: {}, readFile, hostname: 'h' });
    expect(dbCa).toBe(CA_PEM);
    expect(dbCa.split('\n').length).toBeGreaterThan(3);
  });

  it.each([
    ['missing', undefined],
    ['empty', ''],
    ['only white space', ' \r\n\n'],
    ['not a certificate', 'this file was meant to hold a certificate\n'],
    ['a private key and no certificate', '-----BEGIN PRIVATE KEY-----\nnot-a-key\n-----END PRIVATE KEY-----\n'],
  ])('refuses to start when the CA file is %s', (_what, content) => {
    const readFile = files(content === undefined ? secrets : { ...secrets, [DEFAULT_CA_FILE]: content });
    const message = messageFrom(() => loadConfig({ env: {}, readFile, hostname: 'h' }));
    expect(message).toContain(DEFAULT_CA_FILE);
    expect(message).toContain(CA_FILE_ENV);
    expect(message).not.toMatch(/^started|^not a ConfigError/);
  });

  it('refuses to start when the file WORKSPACE_DB_CA_FILE names is missing, even with the default file in place', () => {
    const message = messageFrom(() => loadConfig({ env: { [CA_FILE_ENV]: OTHER_CA_FILE }, readFile: goodFiles, hostname: 'h' }));
    expect(message).toContain(OTHER_CA_FILE);
    expect(message).not.toMatch(/^started|^not a ConfigError/);
  });

  it('never prints what the file holds, or anything of the DSN, in its refusal', () => {
    const readFile = files({ ...secrets, [DEFAULT_CA_FILE]: 'a-line-that-must-not-be-printed\n' });
    const message = messageFrom(() => loadConfig({ env: {}, readFile, hostname: 'h' }));
    expect(message).not.toContain('a-line-that-must-not-be-printed');
    expect(message).not.toContain('not-a-password');
    expect(message).not.toContain('pooler.supabase.com');
  });

  it('checks the environment and the DSN before it reads the CA', () => {
    const noCa = files(secrets);
    expect(messageFrom(() => loadConfig({ env: { ANTHROPIC_API_KEY: 'x' }, readFile: noCa, hostname: 'h' }))).toMatch(/ANTHROPIC_API_KEY/);
    const on6543 = files({ [PATHS.runnerDbUrlSecret]: DSN.replace(':5432/', ':6543/') });
    expect(messageFrom(() => loadConfig({ env: {}, readFile: on6543, hostname: 'h' }))).toMatch(/6543/);
  });

  it('is named in the README, which recommends no unverified form of the DSN', () => {
    const readme = fs.readFileSync(path.resolve(HERE, '..', 'README.md'), 'utf8');
    expect(readme).toContain(CA_FILE_ENV);
    expect(readme).toContain(DEFAULT_CA_FILE);
    expect(readme).not.toMatch(/no-verify/);
    expect(readme).not.toMatch(/append[^\n]*sslmode=require/);
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

// From the security review on the delta (ruling Z1): a token saved as UTF-16 would reach the log
// through node's own spawn error, which quotes the value it refuses.
describe('a secret file that holds a NUL character', () => {
  const NUL = '\u0000';
  /** What a byte that is not UTF-8 reads as: the replacement character, two of them for the mark of a UTF-16 file. */
  const REPLACEMENT = String.fromCharCode(0xfffd);
  /** What a file saved as UTF-16 with its mark reads as when it is read as UTF-8: a NUL beside every character. */
  const savedAsUtf16 = (text: string, order: 'little-endian' | 'big-endian'): string => {
    const bytes = Buffer.from(`${String.fromCharCode(BYTE_ORDER_MARK)}${text}`, 'utf16le');
    return (order === 'little-endian' ? bytes : bytes.swap16()).toString('utf8');
  };
  /** Made up, and made of characters the refusal has no word for: capitals, digits and signs it does not use. */
  const ODD_SECRET = 'QZJGXWKHBVYPMD0234579~#%^&*+=!?@$';
  const messageFrom = (work: () => unknown): string => {
    try {
      work();
      return 'no refusal';
    } catch (error) {
      return error instanceof ConfigError ? error.message : `not a ConfigError: ${String(error)}`;
    }
  };
  const caOnly = { [DEFAULT_CA_FILE]: CA_PEM };

  it('reads a UTF-16 file as text with a NUL beside every character, which is what is refused', () => {
    expect(savedAsUtf16('ab', 'little-endian')).toBe(`${REPLACEMENT}${REPLACEMENT}a${NUL}b${NUL}`);
    expect(savedAsUtf16('ab', 'big-endian')).toBe(`${REPLACEMENT}${REPLACEMENT}${NUL}a${NUL}b`);
  });

  it.each([['little-endian'], ['big-endian']] as const)('refuses the token of a file saved as UTF-16 (%s), naming the secret and its file', (order) => {
    const message = messageFrom(() => readOauthToken(files({ [PATHS.oauthTokenSecret]: savedAsUtf16(TOKEN, order) })));
    expect(message).toMatch(/^the secret claude_oauth_token /);
    expect(message).toContain(PATHS.oauthTokenSecret);
    expect(message).toMatch(/NUL/);
    expect(message).not.toContain(TOKEN);
  });

  it.each([['little-endian'], ['big-endian']] as const)('refuses to start on a DSN file saved as UTF-16 (%s), naming the secret and its file', (order) => {
    const readFile = files({ ...caOnly, [PATHS.runnerDbUrlSecret]: savedAsUtf16(DSN, order), [PATHS.oauthTokenSecret]: TOKEN });
    const message = messageFrom(() => loadConfig({ env: {}, readFile, hostname: 'h' }));
    expect(message).toMatch(/^the secret workspace_runner_db_url /);
    expect(message).toContain(PATHS.runnerDbUrlSecret);
    expect(message).toMatch(/NUL/);
    expect(message).not.toContain('not-a-password');
    expect(message).not.toContain('pooler.supabase.com');
    expect(message).not.toMatch(/postgres/);
  });

  it.each([
    ['at the start', `${NUL}${TOKEN}`],
    ['in the middle', `not-a-real${NUL}-token`],
    ['at the end', `${TOKEN}${NUL}`],
    ['after the line end', `${TOKEN}\n${NUL}`],
  ])('refuses a value with one NUL %s', (_where, value) => {
    expect(messageFrom(() => readOauthToken(files({ [PATHS.oauthTokenSecret]: value })))).toMatch(/claude_oauth_token.*NUL/);
    expect(() => cleanSecret(value, 'the secret under test')).toThrow(ConfigError);
  });

  it.each([
    ['the token', (value: string) => () => readOauthToken(files({ [PATHS.oauthTokenSecret]: value }))],
    ['the DSN', (value: string) => () => loadConfig({ env: {}, readFile: files({ ...caOnly, [PATHS.runnerDbUrlSecret]: value }), hostname: 'h' })],
  ])('says nothing of the value when it refuses %s: not one of its characters, no NUL, no replacement character', (_what, read) => {
    for (const order of ['little-endian', 'big-endian'] as const) {
      const message = messageFrom(read(savedAsUtf16(ODD_SECRET, order)));
      expect(message).toMatch(/NUL/);
      expect([...new Set(ODD_SECRET)].filter((char) => message.includes(char))).toEqual([]);
      expect(message).not.toContain(NUL);
      expect(message).not.toContain(REPLACEMENT);
    }
  });

  it('names what it was handed and nothing else when cleanSecret is called by itself', () => {
    const message = messageFrom(() => cleanSecret(savedAsUtf16(ODD_SECRET, 'little-endian'), 'the secret under test'));
    expect(message.startsWith('the secret under test ')).toBe(true);
    expect([...new Set(ODD_SECRET)].filter((char) => message.includes(char))).toEqual([]);
  });

  // The token is read immediately before each CLI start, so this is where a token file is refused.
  it('starts no CLI on such a token: the turn ends sign_in_expired and the log names the file, not the value', async () => {
    const logs: string[] = [];
    const spawn = fakeSpawn({ lines: [], exit: { code: 0, signal: null } });
    const turn = createCliTurn({
      spawn: spawn.spawn,
      readOauthToken: () => readOauthToken(files({ [PATHS.oauthTokenSecret]: savedAsUtf16(ODD_SECRET, 'little-endian') })),
      baseEnv: { PATH: '/usr/bin' },
      log: (line) => logs.push(line),
    });
    const input = { requestId: '41', kind: 'answer' as const, model: 'haiku', prompt: QUESTION, systemPrompt: 'You are read-only.', budgetUsd: 1 };
    const events = await collect(turn(input, new AbortController().signal));
    expect(spawn.calls).toHaveLength(0);
    expect(events).toEqual([{ type: 'result', ok: false, errorCode: 'sign_in_expired', costUsd: null, claudeSessionId: null, model: null }]);
    const said = logs.filter((line) => /no subscription token/.test(line));
    expect(said).toHaveLength(1);
    expect(said[0]).toContain(PATHS.oauthTokenSecret);
    expect(said[0]).not.toContain(NUL);
    expect(said[0]).not.toContain(ODD_SECRET.slice(0, 4));
  });
});

// The package's own source, read as text by the two audits below: every .ts and .mjs file under src/ and test/.
const PACKAGE_ROOT = path.resolve(HERE, '..');
const SOURCE_DIRS = ['src', 'test'];
const SOURCE_FILE = /\.(ts|mjs)$/;
/** The repo's ceiling for one file. */
const SOURCE_FILE_MAX_LINES = 800;

const sourceFiles = SOURCE_DIRS.flatMap((dir) =>
  fs
    .readdirSync(path.join(PACKAGE_ROOT, dir), { recursive: true, encoding: 'utf8' })
    .filter((name) => SOURCE_FILE.test(name))
    .map((name) => path.join(dir, name).replaceAll(path.sep, '/')),
).sort();
const readSource = (file: string): string => fs.readFileSync(path.join(PACKAGE_ROOT, file), 'utf8');

describe('the byte-order mark in source', () => {
  // The mark is invisible in an editor and in a diff, so a file that handles it spells it as an escape.
  const MARK = '\uFEFF';
  // The six characters of the escape. Not String.raw: the test transformer cooks the escape inside a template.
  const ESCAPE = '\\uFEFF';

  it('finds the source files it reads, config.ts and this file among them', () => {
    expect(sourceFiles).toContain('src/config.ts');
    expect(sourceFiles).toContain('test/config.test.ts');
  });

  it('is in no source file as a literal character', () => {
    expect(sourceFiles.filter((file) => readSource(file).includes(MARK))).toEqual([]);
  });

  it('is written as an escape where config.ts strips it', () => {
    expect(ESCAPE).toHaveLength(6);
    expect(readSource('src/config.ts')).toContain(`/^${ESCAPE}/`);
  });
});

describe('the size of a source file', () => {
  /** Lines as `wc -l` counts them: one per line end. */
  const lineCount = (text: string): number => text.split('\n').length - 1;

  it(`is at most ${SOURCE_FILE_MAX_LINES} lines, tests and suites included`, () => {
    const over = sourceFiles
      .map((file) => ({ file, lines: lineCount(readSource(file)) }))
      .filter(({ lines }) => lines > SOURCE_FILE_MAX_LINES);
    expect(over).toEqual([]);
  });
});

describe('helpers written once (ruling V1, CR-12)', () => {
  const src = sourceFiles.filter((file) => file.startsWith('src/'));
  const DECLARES_MESSAGE_OF = /\b(?:const|function)\s+messageOf\b/;
  /** The opening of the uuid pattern as it is spelled in a regular expression. */
  const UUID_PATTERN_OPENING = '[0-9a-f]{8}-';

  it('declares messageOf in errors.ts and nowhere else under src/', () => {
    expect(src.filter((file) => DECLARES_MESSAGE_OF.test(readSource(file)))).toEqual(['src/errors.ts']);
  });

  it('imports messageOf from errors.ts in every other source file that calls it', () => {
    const callers = src.filter((file) => file !== 'src/errors.ts' && /\bmessageOf\(/.test(readSource(file)));
    expect(callers.length).toBeGreaterThanOrEqual(4);
    for (const file of callers) expect(readSource(file), file).toMatch(/import \{[^}]*\bmessageOf\b[^}]*\} from '(?:\.\.?\/)+errors\.js';/);
  });

  it('writes the uuid shape in one source file', () => {
    expect(src.filter((file) => readSource(file).includes(UUID_PATTERN_OPENING))).toEqual(['src/providers/claude-cli.ts']);
  });
});

describe('the typecheck', () => {
  const readJson = (file: string): Record<string, unknown> => JSON.parse(fs.readFileSync(path.join(PACKAGE_ROOT, file), 'utf8')) as Record<string, unknown>;

  it('reads the tests: tsconfig.test.json names its own exclude, without the test folder the build leaves out', () => {
    const build = readJson('tsconfig.json');
    const check = readJson('tsconfig.test.json');
    expect(build.exclude).toContain('test');
    expect(check.include).toContain('test/**/*.ts');
    // An `exclude` that is not written here is inherited from the build's, and takes the tests out again.
    expect(Array.isArray(check.exclude)).toBe(true);
    expect(check.exclude).not.toContain('test');
    expect(check.exclude).toEqual(expect.arrayContaining(['node_modules', 'dist']));
  });

  it('is the script the gate runs', () => {
    const scripts = readJson('package.json').scripts as Record<string, string>;
    expect(scripts.typecheck).toBe('tsc -p tsconfig.test.json');
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

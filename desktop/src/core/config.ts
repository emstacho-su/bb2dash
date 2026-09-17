/**
 * C-2 — the desktop shell's configuration: schema, defaults, environment
 * overrides.
 *
 * Plain Node, no `electron` import (C-13): the Electron adapter
 * (`src/main/config.ts`) reads `%APPDATA%\bb2dash\config.json` and hands the
 * parsed JSON to `parseConfig` here, so a container later can build the same
 * object from environment variables alone.
 *
 * The anon key is the only credential in this package. It is the same legacy
 * anon JWT `web/` ships in its browser bundle; RLS is the security boundary.
 * A service-role key must never appear here (`test/unit/audit.test.ts` greps
 * for one on every run).
 */

import { z } from 'zod';

import { HH_MM } from './patterns';

/** Defaults for every key the user may leave out of `config.json` (C-2). */
export const CONFIG_DEFAULTS = Object.freeze({
  appUrl: 'https://web-xi-ten-uy9xk6c6p0.vercel.app',
  supabaseUrl: 'https://goultdzqcavefcgnifdy.supabase.co',
  // Backslashes are escaped: an unescaped `\b` here is a backspace character and
  // `\U` / `\e` / `\p` silently drop their backslash, which turned this default
  // into the unusable `C:Usersestacprojects\x08b2dash`.
  repoDir: 'C:\\Users\\estac\\projects\\bb2dash',
  /** Q3: 15 minutes, raised from the brief's original 5. */
  pollIntervalMinutes: 15,
  /** Q5: one "due tomorrow" check a day, at this New York wall-clock time. */
  dueReminderTime: '18:00',
  /** When true the Sync terminal echoes the command instead of running it. */
  syncDryRun: false,
});

const HTTP_URL = 'must be an http(s) URL';

function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export const configSchema = z.object({
  appUrl: z.string().refine(isHttpUrl, HTTP_URL).default(CONFIG_DEFAULTS.appUrl),
  supabaseUrl: z.string().refine(isHttpUrl, HTTP_URL).default(CONFIG_DEFAULTS.supabaseUrl),
  supabaseAnonKey: z.string().min(1, 'is required: the project\'s legacy anon JWT'),
  repoDir: z.string().min(1).default(CONFIG_DEFAULTS.repoDir),
  pollIntervalMinutes: z.number().int().min(1).max(1440).default(CONFIG_DEFAULTS.pollIntervalMinutes),
  dueReminderTime: z
    .string()
    .regex(HH_MM, 'must be a 24-hour HH:MM time, e.g. 18:00')
    .default(CONFIG_DEFAULTS.dueReminderTime),
  syncDryRun: z.boolean().default(CONFIG_DEFAULTS.syncDryRun),
});

export type DesktopConfig = Readonly<z.infer<typeof configSchema>>;

/** A config file that does not satisfy the schema. `field` names the first bad key. */
export class ConfigError extends Error {
  readonly field: string;

  constructor(field: string, message: string) {
    super(message);
    this.name = 'ConfigError';
    this.field = field;
  }
}

/**
 * Environment overrides, applied on top of the file before validation. The e2e
 * suite points `BB2DASH_APP_URL` and `BB2DASH_SUPABASE_URL` at a local static
 * fixture so no test reaches `*.supabase.co` (C-10).
 */
const ENV_KEYS = Object.freeze({
  BB2DASH_APP_URL: 'appUrl',
  BB2DASH_SUPABASE_URL: 'supabaseUrl',
  BB2DASH_SUPABASE_ANON_KEY: 'supabaseAnonKey',
  BB2DASH_REPO_DIR: 'repoDir',
  BB2DASH_POLL_INTERVAL_MINUTES: 'pollIntervalMinutes',
  BB2DASH_DUE_REMINDER_TIME: 'dueReminderTime',
  BB2DASH_SYNC_DRY_RUN: 'syncDryRun',
} as const);

type EnvKey = keyof typeof ENV_KEYS;

function coerce(field: string, raw: string): unknown {
  if (field === 'pollIntervalMinutes') {
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : raw;
  }
  if (field === 'syncDryRun') return raw === '1' || raw.toLowerCase() === 'true';
  return raw;
}

/** Returns a new object; never mutates `fileValue`. */
export function applyEnvOverrides(
  fileValue: Record<string, unknown>,
  env: Record<string, string | undefined>,
): Record<string, unknown> {
  const overrides: Record<string, unknown> = {};
  for (const [envKey, field] of Object.entries(ENV_KEYS) as [EnvKey, string][]) {
    const raw = env[envKey];
    if (raw !== undefined && raw !== '') overrides[field] = coerce(field, raw);
  }
  return { ...fileValue, ...overrides };
}

/**
 * Validate a raw config object. Throws `ConfigError` naming the first offending
 * field so the Electron adapter can put that field in a dialog (C-2).
 */
export function parseConfig(raw: unknown): DesktopConfig {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new ConfigError('(root)', 'config.json must contain a JSON object');
  }
  const result = configSchema.safeParse(raw);
  if (!result.success) {
    const issue = result.error.issues[0];
    const field = issue && issue.path.length > 0 ? issue.path.join('.') : '(root)';
    throw new ConfigError(field, `${field} ${issue ? issue.message : 'is invalid'}`);
  }
  return Object.freeze(result.data);
}

/** File JSON + process env -> validated config. The one entry point callers use. */
export function loadConfigFrom(
  fileValue: Record<string, unknown>,
  env: Record<string, string | undefined>,
): DesktopConfig {
  return parseConfig(applyEnvOverrides(fileValue, env));
}

/** The two origins the window may navigate to (C-4). */
export function allowedOrigins(config: DesktopConfig): readonly string[] {
  return Object.freeze([new URL(config.appUrl).origin, new URL(config.supabaseUrl).origin]);
}

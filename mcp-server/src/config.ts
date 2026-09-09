/**
 * Environment-driven configuration.
 *
 * ── WHICH PROJECT ───────────────────────────────────────────────────────────
 * This server talks to `bb2dash` (ref goultdzqcavefcgnifdy): class materials
 * embedded server-side with `gte-small`. There is a second, unrelated RAG store,
 * `harness-memory` (ref hqkytnyiiuxovnnyixye), holding session history embedded
 * with `bge-small-en-v1.5`. Both are 384-dim, so pointing either client at the
 * other project raises NO error — it returns confidently-ranked nonsense from a
 * different vector space. loadConfig refuses the one wrong URL it knows about.
 *
 * ── WHY NO LOCAL EMBEDDING ──────────────────────────────────────────────────
 * The query is embedded inside the `search` Edge Function with the same
 * `Supabase.ai.Session('gte-small')` that embedded the corpus. Parity is
 * guaranteed by construction; this process never touches a model.
 */

import { ConfigError } from './errors.js';

export const BB2DASH_PROJECT_REF = 'goultdzqcavefcgnifdy';
export const HARNESS_PROJECT_REF = 'hqkytnyiiuxovnnyixye';

/** The model the Edge Runtime used for the corpus. Informational — the client never embeds. */
export const EMBEDDING_MODEL = 'gte-small';
export const EMBEDDING_DIMENSIONS = 384;

export const MODES = ['hybrid', 'vector', 'fts'] as const;
export type Mode = (typeof MODES)[number];

export const DEFAULT_LIMIT = 10;
export const MAX_LIMIT = 50;
export const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * Cosine floor on the vector evidence. Measured 2026-09-09 on the live corpus
 * (best-hit cosine, gte-small): relevant queries 0.830–0.920, nonsense English
 * 0.753–0.767, gibberish 0.818. 0.78 clears every real-English nonsense hit and
 * sits under every relevant one; gibberish is the known gap.
 */
export const DEFAULT_MIN_SIMILARITY = 0.78;

export interface Config {
  readonly supabaseUrl: string;
  readonly serviceKey: string;
  readonly timeoutMs: number;
  readonly search: {
    readonly defaultLimit: number;
    readonly maxLimit: number;
    /** Null disables the floor. */
    readonly minSimilarity: number | null;
  };
}

type Env = Record<string, string | undefined>;

function readOptional(env: Env, key: string): string | undefined {
  const raw = env[key];
  if (raw === undefined) return undefined;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function readPositiveInt(env: Env, key: string, fallback: number): number {
  const raw = readOptional(env, key);
  if (raw === undefined) return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new ConfigError(
      `${key} must be a positive integer, got ${JSON.stringify(raw)}.`,
      `Unset ${key} to use the default (${fallback}), or set a whole number greater than zero.`,
    );
  }
  return parsed;
}

function readSimilarity(env: Env, key: string, fallback: number): number | null {
  const raw = readOptional(env, key);
  if (raw === undefined) return fallback;
  if (/^(none|null|off)$/i.test(raw)) return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    throw new ConfigError(
      `${key} must be a number between 0 and 1, or "none", got ${JSON.stringify(raw)}.`,
      `Unset ${key} to use the default (${fallback}). Lower values widen the net; "none" removes the floor.`,
    );
  }
  return parsed;
}

function resolveUrl(env: Env): string {
  const raw = readOptional(env, 'SUPABASE_URL');
  if (!raw) {
    throw new ConfigError(
      'SUPABASE_URL is not set.',
      `Set SUPABASE_URL in the MCP server env block, e.g. https://${BB2DASH_PROJECT_REF}.supabase.co (the bb2dash project).`,
    );
  }
  if (!/^https:\/\//i.test(raw)) {
    throw new ConfigError(
      'SUPABASE_URL must be an https:// URL.',
      `Use the project URL from Supabase → Project Settings → API, e.g. https://${BB2DASH_PROJECT_REF}.supabase.co.`,
    );
  }
  if (raw.includes(HARNESS_PROJECT_REF)) {
    throw new ConfigError(
      `SUPABASE_URL points at harness-memory (${HARNESS_PROJECT_REF}), not bb2dash.`,
      `harness-memory holds session history embedded with bge-small-en-v1.5 — a different vector space that is also 384-dim, so querying it from here would return nonsense with no error. Point SUPABASE_URL at bb2dash (${BB2DASH_PROJECT_REF}).`,
    );
  }
  return raw.replace(/\/+$/, '');
}

function resolveKey(env: Env): string {
  const key = readOptional(env, 'SUPABASE_SERVICE_ROLE') ?? readOptional(env, 'SUPABASE_SERVICE_KEY');
  if (!key) {
    throw new ConfigError(
      'SUPABASE_SERVICE_ROLE is not set.',
      'Set SUPABASE_SERVICE_ROLE (the sb_secret_… key) in the MCP server env block. It is server-side only: this is a local stdio process, never a browser. SUPABASE_SERVICE_KEY is accepted as a legacy alias.',
    );
  }
  return key;
}

/** Build config from the environment; throws ConfigError with a fix rather than half-starting. */
export function loadConfig(env: Env = process.env): Config {
  const defaultLimit = readPositiveInt(env, 'BB2DASH_DEFAULT_LIMIT', DEFAULT_LIMIT);
  const maxLimit = readPositiveInt(env, 'BB2DASH_MAX_LIMIT', MAX_LIMIT);
  if (maxLimit > MAX_LIMIT) {
    // The tool schema advertises MAX_LIMIT to the model and the Edge Function
    // clamps at 100; a larger value here would be silently ignored upstream.
    throw new ConfigError(
      `BB2DASH_MAX_LIMIT (${maxLimit}) exceeds the hard ceiling of ${MAX_LIMIT}.`,
      `BB2DASH_MAX_LIMIT can only lower the ceiling advertised to the model (${MAX_LIMIT}); raise MAX_LIMIT in src/config.ts to change it.`,
    );
  }
  if (defaultLimit > maxLimit) {
    throw new ConfigError(
      `BB2DASH_DEFAULT_LIMIT (${defaultLimit}) exceeds BB2DASH_MAX_LIMIT (${maxLimit}).`,
      'Lower the default or raise the maximum.',
    );
  }

  return {
    supabaseUrl: resolveUrl(env),
    serviceKey: resolveKey(env),
    timeoutMs: readPositiveInt(env, 'BB2DASH_TIMEOUT_MS', DEFAULT_TIMEOUT_MS),
    search: {
      defaultLimit,
      maxLimit,
      minSimilarity: readSimilarity(env, 'BB2DASH_MIN_SIMILARITY', DEFAULT_MIN_SIMILARITY),
    },
  };
}

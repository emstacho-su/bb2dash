/**
 * Limits and scope of one answering turn, from the environment.
 *
 *   BB2DASH_MAX_SEARCHES   whole number; unset or empty means no limit (today's behaviour)
 *   BB2DASH_MAX_READS      whole number; unset or empty means no limit
 *   BB2DASH_COURSES        course ids separated by commas; unset or empty means no scope
 *
 * The Workspace runner writes these into the per-request MCP config's `env`. With a scope,
 * `search_materials` must name a course of the scope; a read by id (`get_material_text`) is
 * not scoped. A call past its limit or outside the scope is an ERROR RESULT (`isError`), never
 * a thrown protocol error: the turn goes on (probe P-6).
 *
 * The counts live here, keyed by the tool dependencies, so `server.ts` stays unchanged and one
 * server (one `deps` object) counts its own calls, searches and reads apart.
 */

import { ConfigError } from './errors.js';
import type { ToolResult } from './tools/schemas.js';

type Env = Record<string, string | undefined>;

export interface Limits {
  /** Null: no limit. */
  readonly maxSearches: number | null;
  readonly maxReads: number | null;
  /** Null: no scope. */
  readonly courses: readonly string[] | null;
}

export const NO_LIMITS: Limits = { maxSearches: null, maxReads: null, courses: null };

const WHOLE_NUMBER = /^\d+$/;

function readOptional(env: Env, key: string): string | undefined {
  const trimmed = env[key]?.trim();
  return trimmed ? trimmed : undefined;
}

function readCount(env: Env, key: string): number | null {
  const raw = readOptional(env, key);
  if (raw === undefined) return null;
  if (!WHOLE_NUMBER.test(raw)) {
    throw new ConfigError(
      `${key} must be a whole number, got ${JSON.stringify(raw)}.`,
      `Unset ${key} for no limit, or set zero or a positive whole number.`,
    );
  }
  return Number(raw);
}

function readCourses(env: Env): readonly string[] | null {
  const raw = readOptional(env, 'BB2DASH_COURSES');
  if (raw === undefined) return null;
  const courses = raw.split(',').map((id) => id.trim()).filter((id) => id.length > 0);
  return courses.length > 0 ? courses : null;
}

/** Limits from the environment; throws ConfigError rather than half-starting. */
export function readLimits(env: Env): Limits {
  return {
    maxSearches: readCount(env, 'BB2DASH_MAX_SEARCHES'),
    maxReads: readCount(env, 'BB2DASH_MAX_READS'),
    courses: readCourses(env),
  };
}

// ---------------------------------------------------------------- enforcement

// Not `errorResult` from tools/schemas: that module imports config, which imports this one.
function errorResult(text: string): ToolResult {
  return { content: [{ type: 'text', text }], isError: true };
}

interface LimitedDeps {
  readonly config: { readonly limits: Limits };
}

interface Counts {
  searches: number;
  reads: number;
}

const counts = new WeakMap<object, Counts>();

function countsOf(deps: LimitedDeps): Counts {
  const existing = counts.get(deps);
  if (existing) return existing;
  const fresh: Counts = { searches: 0, reads: 0 };
  counts.set(deps, fresh);
  return fresh;
}

function count(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/**
 * Take one search from the budget. Returns an error result when the course is outside the
 * scope or the budget is spent, else null. A refused call uses nothing up.
 */
export function takeSearch(deps: LimitedDeps, course: string | undefined): ToolResult | null {
  const { courses, maxSearches } = deps.config.limits;
  if (courses && (course === undefined || !courses.includes(course))) {
    const named = course === undefined ? 'no course' : `course ${course}`;
    return errorResult(
      `search_materials refused: this answer is scoped to ${courses.join(', ')} and the search named ${named}. Search again with course set to one of those ids.`,
    );
  }
  const used = countsOf(deps);
  if (maxSearches !== null && used.searches >= maxSearches) {
    return errorResult(
      `search_materials refused: this answer may make at most ${count(maxSearches, 'search', 'searches')} and they are spent. Answer from what you have.`,
    );
  }
  used.searches += 1;
  return null;
}

/** Take one read from the budget. Returns an error result when it is spent, else null. */
export function takeRead(deps: LimitedDeps): ToolResult | null {
  const { maxReads } = deps.config.limits;
  const used = countsOf(deps);
  if (maxReads !== null && used.reads >= maxReads) {
    return errorResult(
      `get_material_text refused: this answer may make at most ${count(maxReads, 'read', 'reads')} and they are spent. Answer from what you have.`,
    );
  }
  used.reads += 1;
  return null;
}

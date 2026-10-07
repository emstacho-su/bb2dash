/**
 * The acceptance run's browser tests: the part that needs no browser
 * (acceptance/README.md at the root of the repository).
 *
 * Here, as pure functions over the environment and the file system: the run's
 * one switch and its exact-title rule; the settings a run needs; names made
 * from a test's title; files in the stage's output folder; and the carry-over
 * from earlier stages.
 *
 * WHAT THE ENVIRONMENT SAYS (set by the sandbox's stage script, never by hand
 * on a laptop without meaning it):
 *
 *   ACCEPT=1          the run is asked for. Without it every test is skipped
 *                     where it is declared and nothing is written anywhere.
 *   ACCEPT_ONLY       the exact title of the one test this call may run.
 *   WALK_BASE_URL     the site under test.
 *   ACCEPT_STATE      the stage's signed-in browser state (a file).
 *   ACCEPT_OUT        the stage's output folder, outside every repository:
 *                     answers quote course material.
 *   ACCEPT_IN         a folder holding `carry.json`, when earlier stages left
 *                     ids and times for this one.
 *   ACCEPT_DEADLINE   an ISO time, for a stage that has a time limit.
 *
 * No Playwright import: `accept.config.ts` reads this file while it is being
 * loaded, and `test/accept-env.test.ts` holds it in the unit suite.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';

export type Env = Readonly<Record<string, string | undefined>>;

/** What one step found: plain JSON, written to `<step>.json`. */
export type Facts = Record<string, unknown>;

/** `carry.json`: per step (or per saved host reading), its ids and times. */
export type Carry = Readonly<Record<string, unknown>>;

export type CarriedKind = 'integer' | 'uuid' | 'time';

const SWITCH = 'ACCEPT';
const CARRY_FILE = 'carry.json';
/** The version of the facts file's shape. */
const FACTS_SCHEMA = 1;

const STEP_ID = /^[0-9]{1,2}[a-z]?$/;
const BARE_FILE = /^[0-9a-z][0-9a-z.-]*\.(png|json)$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/;

/* ---------------------------------------------------------------------------
 * The switch
 * ------------------------------------------------------------------------ */

/** The run is asked for: `ACCEPT` is exactly `1`. */
export function isAsked(env: Env): boolean {
  return env[SWITCH] === '1';
}

/**
 * This call may run this test: the run is asked for and `ACCEPT_ONLY` is the
 * test's exact title. `ACCEPT=1` alone selects nothing, so no pattern, group
 * name or forgotten variable can start a test that spends a live question.
 */
export function isSelected(env: Env, title: string): boolean {
  return isAsked(env) && title !== '' && env['ACCEPT_ONLY'] === title;
}

/* ---------------------------------------------------------------------------
 * Names made from a title
 * ------------------------------------------------------------------------ */

/** A title as a file-name part: lower case, every other run of characters one hyphen. */
export function slugOf(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** The step a test belongs to: the first word of its title (`14a offline` is step `14a`). */
export function stepOf(title: string): string {
  const first = title.split(' ')[0] ?? '';
  if (!STEP_ID.test(first)) throw new Error(`the title "${title}" does not start with a step id (3, 14a)`);
  return first;
}

/* ---------------------------------------------------------------------------
 * The settings of a run
 * ------------------------------------------------------------------------ */

export interface AcceptSettings {
  /** The site under test. */
  baseUrl: string;
  /** The stage's signed-in browser state. */
  statePath: string;
  /** Where shots, facts and the Playwright report go. */
  outDir: string;
  /** The one test this call may run; null when none is named, and then every test is skipped. */
  only: string | null;
  /** Playwright's JSON report for that test: `pw-<slug of its title>.json`; null when none is named. */
  reportFile: string | null;
}

/** Whether `file` is `folder` itself or anything under it. */
function isInside(folder: string, file: string): boolean {
  const fromFolder = relative(resolve(folder), resolve(file));
  return fromFolder !== '..' && !fromFolder.startsWith(`..${sep}`) && !isAbsolute(fromFolder);
}

function requiredPath(env: Env, name: string): string {
  const value = env[name] ?? '';
  if (value === '' || !isAbsolute(value)) throw new Error(`ACCEPT=1 needs ${name}: an absolute path`);
  return value;
}

function siteOf(env: Env): string {
  const value = env['WALK_BASE_URL'] ?? '';
  let url: URL | null = null;
  try {
    url = new URL(value);
  } catch {
    url = null;
  }
  if (url === null || (url.protocol !== 'https:' && url.protocol !== 'http:')) {
    throw new Error('ACCEPT=1 needs WALK_BASE_URL: the site under test, as an http(s) address');
  }
  return value;
}

/**
 * What a run needs, or null when it was not asked for. A run that is asked for
 * and not whole is refused here, while the config loads, with the name of what
 * is missing: not later, as a test that fails for a reason nobody wrote down.
 */
export function acceptSettings(env: Env, checkoutRoot: string): AcceptSettings | null {
  if (!isAsked(env)) return null;
  const baseUrl = siteOf(env);
  const statePath = requiredPath(env, 'ACCEPT_STATE');
  const outDir = requiredPath(env, 'ACCEPT_OUT');
  if (isInside(checkoutRoot, outDir)) {
    throw new Error('ACCEPT_OUT is inside the checkout: answers quote course material, and it goes outside every repository');
  }
  const only = env['ACCEPT_ONLY'] ? env['ACCEPT_ONLY'] : null;
  return { baseUrl, statePath, outDir, only, reportFile: only === null ? null : join(outDir, `pw-${slugOf(only)}.json`) };
}

/* ---------------------------------------------------------------------------
 * Files in the stage's output folder
 * ------------------------------------------------------------------------ */

/** A file of the output folder, by bare name: nothing here can write beside or above it. */
export function outFile(outDir: string, name: string): string {
  if (!BARE_FILE.test(name)) throw new Error(`"${name}" is not a bare .png or .json file name`);
  return join(outDir, name);
}

function readObject(file: string, label: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    throw new Error(`${label} is not valid JSON`);
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error(`${label} is not a JSON object`);
  return parsed as Record<string, unknown>;
}

/** Writes a step's facts as `<step>.json`, replacing an earlier run's, and returns the file. */
export function writeFacts(outDir: string, step: string, facts: Facts): string {
  const file = outFile(outDir, `${step}.json`);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(file, `${JSON.stringify({ schema: FACTS_SCHEMA, step, ...facts }, null, 2)}\n`);
  return file;
}

/** The facts an earlier test of this stage wrote, or null when that step has not run here. */
export function readFacts(outDir: string, step: string): Facts | null {
  const file = outFile(outDir, `${step}.json`);
  return existsSync(file) ? readObject(file, `${step}.json`) : null;
}

/* ---------------------------------------------------------------------------
 * The carry-over from earlier stages
 * ------------------------------------------------------------------------ */

/** `carry.json` of the folder the host handed in; empty when the stage was given none. */
export function readCarry(inDir: string | undefined): Carry {
  if (!inDir) return {};
  const file = join(inDir, CARRY_FILE);
  return existsSync(file) ? readObject(file, CARRY_FILE) : {};
}

function isOfKind(value: unknown, kind: CarriedKind): boolean {
  if (kind === 'integer') {
    return (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) || (typeof value === 'string' && /^(0|[1-9][0-9]{0,14})$/.test(value));
  }
  if (typeof value !== 'string') return false;
  return kind === 'uuid' ? UUID.test(value) : ISO_TIME.test(value) && !Number.isNaN(Date.parse(value));
}

const KIND_IN_WORDS: Readonly<Record<CarriedKind, string>> = { integer: 'an integer', uuid: 'a uuid', time: 'a time' };

/**
 * One carried value, by step (or saved name) and field: an id or a time, or
 * null when the carry-over does not hold it. A value of another shape is
 * refused: what crosses from one stage to the next is never free text.
 */
export function carried(carry: Carry, step: string, field: string, kind: 'integer'): number | null;
export function carried(carry: Carry, step: string, field: string, kind: 'uuid' | 'time'): string | null;
export function carried(carry: Carry, step: string, field: string, kind: CarriedKind): number | string | null {
  const entry = carry[step];
  if (entry === undefined) return null;
  if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) throw new Error(`${CARRY_FILE}: ${step} is not a JSON object`);
  const value = (entry as Record<string, unknown>)[field];
  if (value === undefined || value === null) return null;
  if (!isOfKind(value, kind)) throw new Error(`${CARRY_FILE}: ${step}.${field} is not ${KIND_IN_WORDS[kind]}`);
  return kind === 'integer' ? Number(value) : String(value);
}

/** The same, for a value the test cannot go on without. */
export function requireCarried(carry: Carry, step: string, field: string, kind: 'integer'): number;
export function requireCarried(carry: Carry, step: string, field: string, kind: 'uuid' | 'time'): string;
export function requireCarried(carry: Carry, step: string, field: string, kind: CarriedKind): number | string {
  const value = kind === 'integer' ? carried(carry, step, field, kind) : carried(carry, step, field, kind);
  if (value === null) throw new Error(`${CARRY_FILE} holds no ${step}.${field}: the stage that makes it has not run, or the host did not carry it`);
  return value;
}

/* ---------------------------------------------------------------------------
 * A stage's time limit
 * ------------------------------------------------------------------------ */

/** `ACCEPT_DEADLINE` in milliseconds since the epoch; required by the test that reads it. */
export function deadlineMs(env: Env): number {
  const value = env['ACCEPT_DEADLINE'] ?? '';
  if (value === '') throw new Error('ACCEPT_DEADLINE is not set: this stage has a time limit, and the host hands it in');
  if (!ISO_TIME.test(value) || Number.isNaN(Date.parse(value))) throw new Error('ACCEPT_DEADLINE is not an ISO time');
  return Date.parse(value);
}

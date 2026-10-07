// @vitest-environment node

/**
 * The acceptance run's browser tests, the part that needs no browser
 * (`e2e/accept.env.ts`; acceptance/README.md at the root of the repository).
 *
 * What is held here: nothing runs and nothing is written unless `ACCEPT=1`,
 * and then only the one test `ACCEPT_ONLY` names; a file goes into
 * `ACCEPT_OUT` by a bare name and never into the checkout; a value carried
 * over from an earlier stage is an id or a time, or it is refused.
 */

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  acceptSettings,
  carried,
  deadlineMs,
  isAsked,
  isSelected,
  outFile,
  readCarry,
  readFacts,
  requireCarried,
  slugOf,
  stepOf,
  writeFacts,
} from '../e2e/accept.env';

const CHECKOUT = resolve('/checkouts/bb2dash');
const OUT = resolve('/accept/out/walk');
const STATE = resolve('/accept/state.json');
const UUID = '0b6f7c1e-2d3a-4b5c-8d9e-0f1a2b3c4d5e';

const ASKED = {
  ACCEPT: '1',
  WALK_BASE_URL: 'https://web-xi-ten-uy9xk6c6p0.vercel.app',
  ACCEPT_STATE: STATE,
  ACCEPT_OUT: OUT,
};

const made: string[] = [];
function scratch(): string {
  const dir = mkdtempSync(join(tmpdir(), 'bb2dash-accept-test-'));
  made.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('the switch', () => {
  it('is off unless ACCEPT is exactly 1', () => {
    expect(isAsked({})).toBe(false);
    expect(isAsked({ ACCEPT: '0' })).toBe(false);
    expect(isAsked({ ACCEPT: 'true' })).toBe(false);
    expect(isAsked({ ACCEPT: '1' })).toBe(true);
  });

  it('selects one test, by its exact title', () => {
    expect(isSelected({ ACCEPT: '1', ACCEPT_ONLY: '3 lookup haiku' }, '3 lookup haiku')).toBe(true);
    expect(isSelected({ ACCEPT: '1', ACCEPT_ONLY: '3 lookup' }, '3 lookup haiku')).toBe(false);
    expect(isSelected({ ACCEPT: '1', ACCEPT_ONLY: '3 Lookup Haiku' }, '3 lookup haiku')).toBe(false);
    // With no title named, nothing is selected: ACCEPT=1 alone starts no test.
    expect(isSelected({ ACCEPT: '1' }, '3 lookup haiku')).toBe(false);
    expect(isSelected({ ACCEPT: '1', ACCEPT_ONLY: '' }, '')).toBe(false);
    // And a title alone is not the switch.
    expect(isSelected({ ACCEPT_ONLY: '3 lookup haiku' }, '3 lookup haiku')).toBe(false);
  });
});

describe('names made from a title', () => {
  it("slugs a title for its Playwright report's file name", () => {
    expect(slugOf('3 lookup haiku')).toBe('3-lookup-haiku');
    expect(slugOf('9 reload mid-answer')).toBe('9-reload-mid-answer');
    expect(slugOf('14a offline')).toBe('14a-offline');
    expect(slugOf('  2  Open!  ')).toBe('2-open');
  });

  it("reads a step's id from the first word of its title", () => {
    expect(stepOf('3 lookup haiku')).toBe('3');
    expect(stepOf('14a offline')).toBe('14a');
    expect(stepOf('15 archive')).toBe('15');
    expect(() => stepOf('archive the walk conversations')).toThrow(/does not start with a step id/);
    expect(() => stepOf('../3 lookup')).toThrow(/does not start with a step id/);
  });
});

describe('the settings of a run', () => {
  it('are absent when the run was not asked for, whatever else is set', () => {
    expect(acceptSettings({}, CHECKOUT)).toBeNull();
    expect(acceptSettings({ ...ASKED, ACCEPT: undefined }, CHECKOUT)).toBeNull();
  });

  it('name the site, the session, the folder and the one report file', () => {
    expect(acceptSettings({ ...ASKED, ACCEPT_ONLY: '9 reload mid-answer' }, CHECKOUT)).toEqual({
      baseUrl: 'https://web-xi-ten-uy9xk6c6p0.vercel.app',
      statePath: STATE,
      outDir: OUT,
      only: '9 reload mid-answer',
      reportFile: join(OUT, 'pw-9-reload-mid-answer.json'),
    });
    // No title named: every test is skipped, and no report file is written.
    expect(acceptSettings(ASKED, CHECKOUT)).toMatchObject({ only: null, reportFile: null });
  });

  it('refuse a run that is asked for and not whole', () => {
    expect(() => acceptSettings({ ...ASKED, WALK_BASE_URL: undefined }, CHECKOUT)).toThrow(/WALK_BASE_URL/);
    expect(() => acceptSettings({ ...ASKED, WALK_BASE_URL: 'web-xi-ten.vercel.app' }, CHECKOUT)).toThrow(/WALK_BASE_URL/);
    expect(() => acceptSettings({ ...ASKED, WALK_BASE_URL: 'file:///etc/passwd' }, CHECKOUT)).toThrow(/WALK_BASE_URL/);
    expect(() => acceptSettings({ ...ASKED, ACCEPT_STATE: undefined }, CHECKOUT)).toThrow(/ACCEPT_STATE/);
    expect(() => acceptSettings({ ...ASKED, ACCEPT_STATE: 'state.json' }, CHECKOUT)).toThrow(/ACCEPT_STATE/);
    expect(() => acceptSettings({ ...ASKED, ACCEPT_OUT: undefined }, CHECKOUT)).toThrow(/ACCEPT_OUT/);
    expect(() => acceptSettings({ ...ASKED, ACCEPT_OUT: 'out' }, CHECKOUT)).toThrow(/ACCEPT_OUT/);
  });

  it('refuse a folder inside the checkout: answers quote course text, and the repository is public', () => {
    const inside = join(CHECKOUT, 'docs', 'planning', 'sprint-2', 'walks', 'walk-21');
    expect(() => acceptSettings({ ...ASKED, ACCEPT_OUT: inside }, CHECKOUT)).toThrow(/inside the checkout/);
    expect(() => acceptSettings({ ...ASKED, ACCEPT_OUT: CHECKOUT }, CHECKOUT)).toThrow(/inside the checkout/);
    // A sibling whose name only starts the same way is not inside.
    expect(acceptSettings({ ...ASKED, ACCEPT_OUT: `${CHECKOUT}-out` }, CHECKOUT)?.outDir).toBe(`${CHECKOUT}-out`);
  });
});

describe('files in ACCEPT_OUT', () => {
  it('are named by a bare file name', () => {
    expect(outFile(OUT, '3-start.png')).toBe(join(OUT, '3-start.png'));
    expect(outFile(OUT, '14a.json')).toBe(join(OUT, '14a.json'));
    for (const name of ['../3.json', 'a/3.json', 'a\\3.json', '3.txt', '.json', '3 start.png', '']) {
      expect(() => outFile(OUT, name), name).toThrow(/bare \.png or \.json file name/);
    }
  });

  it("hold one facts file per step, which a later test of the same stage reads back", () => {
    const dir = join(scratch(), 'walk');
    expect(readFacts(dir, '3')).toBeNull();
    const path = writeFacts(dir, '3', { request_id: 412, conversation_id: UUID, state: 'done' });
    expect(path).toBe(join(dir, '3.json'));
    const text = readFileSync(path, 'utf8');
    expect(text.endsWith('}\n')).toBe(true);
    expect(text).not.toContain('\r');
    expect(JSON.parse(text)).toEqual({ schema: 1, step: '3', request_id: 412, conversation_id: UUID, state: 'done' });
    expect(readFacts(dir, '3')).toMatchObject({ request_id: 412, conversation_id: UUID });
    // A second run of the step replaces the file.
    writeFacts(dir, '3', { request_id: 413 });
    expect(readFacts(dir, '3')).toEqual({ schema: 1, step: '3', request_id: 413 });
  });

  it('refuse a facts file that is not an object', () => {
    const dir = scratch();
    writeFileSync(join(dir, '3.json'), '[1, 2]\n');
    expect(() => readFacts(dir, '3')).toThrow(/3\.json is not a JSON object/);
  });
});

describe('the carry-over', () => {
  function carryIn(value: unknown): string {
    const dir = scratch();
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'carry.json'), typeof value === 'string' ? value : JSON.stringify(value));
    return dir;
  }

  it('is empty when the stage was given none', () => {
    expect(readCarry(undefined)).toEqual({});
    expect(readCarry(scratch())).toEqual({});
  });

  it('gives an id or a time by step and field, and null for what it does not hold', () => {
    const carry = readCarry(
      carryIn({ '3': { request_id: 412, conversation_id: UUID }, '14a': { request_id: '419', still_queued_at: '2026-10-07T18:04:10.000Z' } }),
    );
    expect(carried(carry, '3', 'request_id', 'integer')).toBe(412);
    expect(carried(carry, '14a', 'request_id', 'integer')).toBe(419);
    expect(carried(carry, '3', 'conversation_id', 'uuid')).toBe(UUID);
    expect(carried(carry, '14a', 'still_queued_at', 'time')).toBe('2026-10-07T18:04:10.000Z');
    expect(carried(carry, '3', 'closed_at', 'time')).toBeNull();
    expect(carried(carry, '9', 'request_id', 'integer')).toBeNull();
    expect(requireCarried(carry, '3', 'conversation_id', 'uuid')).toBe(UUID);
    expect(() => requireCarried(carry, '9', 'request_id', 'integer')).toThrow(/carry\.json holds no 9\.request_id/);
  });

  it('refuses a value that is not of the type asked for', () => {
    const carry = readCarry(carryIn({ '3': { request_id: '412; drop', conversation_id: 'spike', asked_at: 'yesterday', count: 4.5 } }));
    expect(() => carried(carry, '3', 'request_id', 'integer')).toThrow(/3\.request_id is not an integer/);
    expect(() => carried(carry, '3', 'conversation_id', 'uuid')).toThrow(/3\.conversation_id is not a uuid/);
    expect(() => carried(carry, '3', 'asked_at', 'time')).toThrow(/3\.asked_at is not a time/);
    expect(() => carried(carry, '3', 'count', 'integer')).toThrow(/3\.count is not an integer/);
  });

  it('refuses a file that is not an object of objects', () => {
    expect(() => readCarry(carryIn('{ not json'))).toThrow(/carry\.json is not valid JSON/);
    expect(() => readCarry(carryIn([1]))).toThrow(/carry\.json is not a JSON object/);
    expect(() => carried(readCarry(carryIn({ '3': 412 })), '3', 'request_id', 'integer')).toThrow(/3 is not a JSON object/);
  });
});

describe('the deadline of a stage', () => {
  it('is an ISO time, and required by the test that reads it', () => {
    expect(deadlineMs({ ACCEPT_DEADLINE: '2026-10-07T18:03:00.000Z' })).toBe(Date.parse('2026-10-07T18:03:00.000Z'));
    expect(() => deadlineMs({})).toThrow(/ACCEPT_DEADLINE is not set/);
    expect(() => deadlineMs({ ACCEPT_DEADLINE: 'in three minutes' })).toThrow(/ACCEPT_DEADLINE is not an ISO time/);
    expect(() => deadlineMs({ ACCEPT_DEADLINE: '1759860180' })).toThrow(/ACCEPT_DEADLINE is not an ISO time/);
  });
});

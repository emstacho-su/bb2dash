/**
 * Loads the L3 fixtures (`fixtures/<course>.json`) and compares engine output
 * with a fixture's hand-computed expectation.
 *
 * A fixture holds the shared `scheme` and `components` of one scheme course and
 * a list of `states`; each state carries the rest of a `ModelInput` (`items`,
 * `scenario`, `blackboardTotal`), whether it is `synthetic`, the `expected`
 * result (a partial `ModelResult`: only the keys written are compared), optional
 * `solver` targets, and a written `derivation` for every expected number.
 */

import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect } from 'vitest';
import type { BlackboardTotal, ComponentInput, ItemInput, ModelInput, Scenario, SchemeInput } from '@/lib/grade-model';

/** Absolute tolerance: the solver's bisection stops within 1e-6 of the exact root. */
export const TOLERANCE = 2e-6;

export interface FixtureState {
  readonly name: string;
  readonly synthetic: boolean;
  readonly description: string;
  readonly items: readonly ItemInput[];
  readonly scenario: Scenario;
  readonly blackboardTotal: BlackboardTotal | null;
  readonly expected: Readonly<Record<string, unknown>>;
  readonly solver?: readonly { readonly letter: string; readonly expected: Readonly<Record<string, unknown>> }[];
  readonly derivation: readonly string[];
}

export interface Fixture {
  readonly course: string;
  readonly provenance: string;
  readonly scheme: SchemeInput;
  readonly components: readonly ComponentInput[];
  readonly states: readonly FixtureState[];
}

export const FIXTURE_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');

export function loadFixtures(): readonly Fixture[] {
  return readdirSync(FIXTURE_DIR)
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) => JSON.parse(readFileSync(path.join(FIXTURE_DIR, file), 'utf8')) as Fixture);
}

export function fixtureFor(course: string): Fixture {
  const fixture = loadFixtures().find((candidate) => candidate.course === course);
  if (fixture === undefined) throw new Error(`no fixture for ${course}`);
  return fixture;
}

export function stateOf(fixture: Fixture, name: string): FixtureState {
  const state = fixture.states.find((candidate) => candidate.name === name);
  if (state === undefined) throw new Error(`${fixture.course}: no state ${name}`);
  return state;
}

export function inputOf(fixture: Fixture, state: FixtureState): ModelInput {
  return {
    scheme: fixture.scheme,
    components: fixture.components,
    items: state.items,
    scenario: state.scenario,
    blackboardTotal: state.blackboardTotal,
  };
}

/**
 * Asserts `actual` matches the partial `expected`: numbers within TOLERANCE,
 * arrays element by element with equal length, objects on the expected keys.
 */
export function expectPartial(actual: unknown, expected: unknown, where: string): void {
  if (typeof expected === 'number') {
    expect(typeof actual, where).toBe('number');
    expect(Math.abs((actual as number) - expected), `${where}: ${String(actual)} vs ${expected}`).toBeLessThanOrEqual(TOLERANCE);
    return;
  }
  if (Array.isArray(expected)) {
    expect(Array.isArray(actual), where).toBe(true);
    expect((actual as unknown[]).length, `${where}.length`).toBe(expected.length);
    expected.forEach((value, index) => expectPartial((actual as unknown[])[index], value, `${where}[${index}]`));
    return;
  }
  if (expected !== null && typeof expected === 'object') {
    expect(actual !== null && typeof actual === 'object', where).toBe(true);
    Object.entries(expected).forEach(([key, value]) =>
      expectPartial((actual as Record<string, unknown>)[key], value, `${where}.${key}`),
    );
    return;
  }
  expect(actual, where).toEqual(expected);
}

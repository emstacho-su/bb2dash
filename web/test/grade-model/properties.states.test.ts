/**
 * L2 — `itemStates()` agrees with `projectCourse` (Round 2, R2-3): a value in
 * 0..max on any what-if target makes `usesHypotheticals` true, and a value on
 * any key outside the set changes nothing at all. Same parameters as the rest
 * of the property suite (≥ 200 runs, `FC_SEED`, seed printed on failure).
 */

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { itemStates, projectCourse, type ModelInput } from '@/lib/grade-model';
import { modelInputArb } from './arbitraries';
import { assertProperty } from './fc-params';

const ANY = modelInputArb({ extraCredit: true, unsure: true });

const withValue = (input: ModelInput, key: string, value: number): ModelInput => ({
  ...input,
  scenario: { itemScores: { ...input.scenario.itemScores, [key]: value } },
});

describe('L2 itemStates', () => {
  it('a value in 0..max on any target key makes usesHypotheticals true', () => {
    assertProperty(
      fc.property(ANY, fc.nat(), fc.integer({ min: 0, max: 100 }), (input, pick, share) => {
        const targets = itemStates(input).whatIfTargets;
        const target = targets[pick % Math.max(1, targets.length)];
        if (target === undefined) return true;
        const before = projectCourse(input);
        const after = projectCourse(withValue(input, target.key, (target.max * share) / 100));
        if (before.state === 'computed') expect(after.state).toBe('computed');
        // A value on extra credit or a zero-capacity part alone cannot make a nothing_graded course compute.
        return after.state !== 'computed' || after.usesHypotheticals;
      }),
    );
  });

  it('a value on any key outside the target set changes nothing', () => {
    assertProperty(
      fc.property(ANY, fc.nat(), fc.integer({ min: 0, max: 100 }), fc.boolean(), (input, pick, value, useItemKey) => {
        const targetKeys = new Set(itemStates(input).whatIfTargets.map((target) => target.key));
        const outside = input.items.map((row) => row.key).filter((key) => !targetKeys.has(key));
        const key = useItemKey && outside.length > 0 ? outside[pick % outside.length]! : `asg:not-an-item-${pick}`;
        expect(projectCourse(withValue(input, key, value))).toEqual(projectCourse(input));
        return true;
      }),
    );
  });

  it('generates both kinds of target often enough to mean something', () => {
    const samples = fc.sample(ANY, { numRuns: 300, seed: 11 });
    const units = samples.flatMap((input) => itemStates(input).whatIfTargets.map((target) => target.unit));
    expect(units.filter((unit) => unit === 'points').length).toBeGreaterThan(100);
    expect(units.filter((unit) => unit === 'percent').length).toBeGreaterThan(20);
  });
});

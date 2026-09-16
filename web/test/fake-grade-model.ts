/**
 * A stand-in for the grade-model engine while W-19's implementation is on its
 * own branch (`index.ts` here still throws "not implemented (W-19)").
 *
 * Container tests route `projectCourse` / `solveTarget` through
 * `engineOrFake`: the real engine answers whenever it is implemented, and this
 * fake only when the stub throws. So once the engine is merged these tests run
 * against it unchanged, and they assert only what the frozen Contract fixes
 * for every engine — which parts are named, whether what-if values are in use —
 * never a number only this fake would produce.
 *
 * The fake follows the Contract's order of checks and its muting rule; its
 * arithmetic is a plain points ratio and is not the Contract's.
 */

import type { ModelInput, ModelResult, NotComputableReason, Standing, TargetResult } from '@/lib/grade-model/types';
import { isCountedItem, mutedComponentIds } from '@/lib/grade-model-view';

function notComputable(reason: NotComputableReason, unscoredManual: string[] = []): ModelResult {
  return { state: 'not_computable', reason, unscoredManual };
}

function letterOf(input: ModelInput, pct: number): string | null {
  return input.scheme?.letterScale.find((step) => step.min <= pct)?.letter ?? null;
}

function standingOf(input: ModelInput, earned: number, denominator: number): Standing {
  const pct = denominator > 0 ? (earned / denominator) * 100 : 0;
  return { pct, earned, denominator, letter: letterOf(input, pct) };
}

export function fakeProjectCourse(input: ModelInput): ModelResult {
  if (!input.scheme) return notComputable('no_scheme');
  if (input.scheme.method === 'qualitative') return notComputable('qualitative_method');
  if (input.scheme.method === 'unknown') return notComputable('unknown_method');
  if (input.components.some((c) => c.aggregation === 'unknown')) return notComputable('unknown_aggregation');

  const valueOf = (item: ModelInput['items'][number]) => item.score ?? input.scenario.itemScores[item.key] ?? null;
  const unscoredManual = input.components
    .filter((c) => c.aggregation === 'manual')
    .filter((c) => !input.items.some((i) => i.componentId === c.id && isCountedItem(i) && i.score !== null))
    .map((c) => c.name);
  if (unscoredManual.length > 0) return notComputable('manual_unscored', unscoredManual);

  const muted = mutedComponentIds(input);
  const live = input.items.filter((i) => i.componentId !== null && isCountedItem(i) && !muted.has(i.componentId));
  const graded = live.filter((i) => valueOf(i) !== null);
  if (graded.length === 0) return notComputable('nothing_graded');

  const sum = (items: typeof live, value: (i: (typeof live)[number]) => number) =>
    items.reduce((total, item) => total + value(item), 0);
  const earned = sum(graded, (i) => valueOf(i) ?? 0);
  const gradedCap = sum(graded, (i) => i.possible ?? 0);
  const cap = sum(live, (i) => i.possible ?? 0);
  const best = earned + sum(live.filter((i) => valueOf(i) === null), (i) => i.possible ?? 0);

  return {
    state: 'computed',
    standings: {
      graded_so_far: standingOf(input, earned, gradedCap),
      zeros_on_rest: standingOf(input, earned, cap),
      best_case: standingOf(input, best, cap),
    },
    components: input.components.map((c) => {
      const mine = graded.filter((i) => i.componentId === c.id);
      return {
        componentId: c.id,
        code: c.code,
        name: c.name,
        state: muted.has(c.id) ? 'muted' : mine.length > 0 ? 'graded' : 'ungraded',
        earned: sum(mine, (i) => valueOf(i) ?? 0),
        gradedCap: sum(mine, (i) => i.possible ?? 0),
        cap: c.points ?? c.weightPct ?? 0,
        usesHypothetical: mine.some((i) => i.score === null),
        capacityFromKnownItems: false,
      };
    }),
    unlinkedScoredKeys: [],
    usesHypotheticals: graded.some((i) => i.score === null),
    agreement: null,
  };
}

export function fakeSolveTarget(input: ModelInput, letter: string): TargetResult {
  const result = fakeProjectCourse(input);
  if (result.state === 'not_computable') return { state: 'not_computable', reason: result.reason };
  const min = input.scheme?.letterScale.find((step) => step.letter === letter)?.min ?? 0;
  return { state: 'needed', letter, targetPct: min, averageNeeded: 0.5, remainingCount: 1, remainingShare: 0.5 };
}

/** The real engine when it is implemented; the fake while the stub throws. */
export function engineOrFake<A extends unknown[], R>(real: (...args: A) => R, fake: (...args: A) => R) {
  return (...args: A): R => {
    try {
      return real(...args);
    } catch (error) {
      if (error instanceof Error && error.message.includes('not implemented')) return fake(...args);
      throw error;
    }
  };
}

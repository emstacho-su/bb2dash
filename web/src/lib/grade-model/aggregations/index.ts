/** Aggregation dispatch. `unknown` has no arithmetic: the course is not computable. */

import type { Aggregation } from '../types';
import { averageAggregate } from './average';
import { averageDropLowestAggregate } from './average-drop-lowest';
import { manualAggregate } from './manual';
import { normalizedAggregate } from './normalized';
import { rankWeightedAggregate } from './rank-weighted';
import { singleAggregate } from './single';
import { sumAggregate } from './sum';
import type { Aggregate } from './types';

export type { Aggregate, LeafContext, LeafOutcome, UnitCap } from './types';

const AGGREGATES: Readonly<Record<Exclude<Aggregation, 'unknown'>, Aggregate>> = {
  sum: sumAggregate,
  average: averageAggregate,
  average_drop_lowest: averageDropLowestAggregate,
  rank_weighted: rankWeightedAggregate,
  normalized: normalizedAggregate,
  single: singleAggregate,
  manual: manualAggregate,
};

/** Throws for `unknown`: callers check computability (order of checks) first. */
export function aggregateFor(aggregation: Aggregation): Aggregate {
  if (aggregation === 'unknown') {
    throw new Error("grade-model: an 'unknown' aggregation has no arithmetic; check computability first");
  }
  return AGGREGATES[aggregation];
}

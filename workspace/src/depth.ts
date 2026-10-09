/**
 * Depth to tier (brief 109, The question's path, step 4). The page's depth menu (Auto, Quick,
 * Standard, Deep) picks the model tier; Auto leaves it to the router.
 *
 * A Deep choice does not stick: the router's follow-up rule (`router.ts`, rule 3) is given the tier
 * of the conversation's last AUTO answer, which `workspace_turn_context` hands over as
 * `last_auto_tier`, not the tier of the last answer whatever its depth.
 */

import { routeTier } from './router.js';
import type { Tier } from './tiers.js';

export const DEPTHS = ['auto', 'quick', 'standard', 'deep'] as const;

export type Depth = (typeof DEPTHS)[number];

export function isDepth(value: unknown): value is Depth {
  return typeof value === 'string' && (DEPTHS as readonly string[]).includes(value);
}

const CHOSEN_TIER: Readonly<Record<Exclude<Depth, 'auto'>, Tier>> = Object.freeze({
  quick: 'low',
  standard: 'mid',
  deep: 'high',
});

export function tierForDepth(depth: Depth, question: string, lastAutoTier: Tier | null): Tier {
  return depth === 'auto' ? routeTier(question, lastAutoTier) : CHOSEN_TIER[depth];
}

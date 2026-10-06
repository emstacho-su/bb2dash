/**
 * The tier map (brief 102, Contract, Tiers). Three tiers, Opus on top; the alias is what `--model`
 * receives. A code constant on purpose: there is no setting that changes it.
 */

export const TIERS = ['low', 'mid', 'high'] as const;

export type Tier = (typeof TIERS)[number];

/** The three providers the seam names; only `claude-cli` is connected in v1. */
export type ProviderId = 'claude-cli' | 'ollama' | 'frontier-api';

export interface TierRoute {
  readonly provider: ProviderId;
  /** The model alias the provider receives. */
  readonly model: string;
}

export const TIER_ROUTES: Readonly<Record<Tier, TierRoute>> = Object.freeze({
  low: Object.freeze({ provider: 'claude-cli', model: 'haiku' }),
  mid: Object.freeze({ provider: 'claude-cli', model: 'sonnet' }),
  high: Object.freeze({ provider: 'claude-cli', model: 'opus' }),
});

export function isTier(value: unknown): value is Tier {
  return typeof value === 'string' && (TIERS as readonly string[]).includes(value);
}

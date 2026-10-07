/**
 * The tier badge of one assistant message (Phase 21, task 16; P-83).
 *
 * Every answer names the model level that wrote it: "Haiku · lookup",
 * "Sonnet · standard" or "Opus · deep work" (PM wording, brief 102). The tier
 * is the stored `workspace_messages.tier`, which `workspace_begin()` writes, so
 * the badge is there while the answer is still streaming.
 */

import type { WorkspaceTier } from '@/lib/queries.workspace';
import { TIER_BADGES } from '@/lib/workspace-labels';
import styles from './TierBadge.module.css';

export function TierBadge({ tier }: { tier: WorkspaceTier }) {
  return (
    <span className={styles.badge} data-tier={tier}>
      {TIER_BADGES[tier]}
    </span>
  );
}

/**
 * Is there a newer build than the one running, and may Stack be asked now? (2026-09-30)
 *
 * "Newer" means: the builder's `state.json` names a `lastBuiltSha` that differs from the
 * running build's tree hash, and that build's executable is on disk. The builder only
 * records a hash after a successful build, and forgets a waiting build when the ref comes
 * back to the active one, so `lastBuiltSha` is always "the build Stack should be on".
 *
 * "May be asked" means: no *Update later* reminder is still in the future.
 */

import { isTree } from './build-paths';

export const REMIND_AFTER_ONE_HOUR_MS = 60 * 60 * 1000;
export const REMIND_AFTER_FOUR_HOURS_MS = 4 * 60 * 60 * 1000;
/** "Tomorrow" is the next calendar day at this local hour. */
export const REMIND_TOMORROW_HOUR = 9;

export const REMIND_LATER_CHOICES = ['one-hour', 'four-hours', 'tomorrow'] as const;
export type RemindLaterChoice = (typeof REMIND_LATER_CHOICES)[number];

export function isRemindLaterChoice(value: unknown): value is RemindLaterChoice {
  return typeof value === 'string' && (REMIND_LATER_CHOICES as readonly string[]).includes(value);
}

/** When an *Update later* choice made at `now` expires. */
export function remindAfter(choice: RemindLaterChoice, now: Date): Date {
  switch (choice) {
    case 'one-hour':
      return new Date(now.getTime() + REMIND_AFTER_ONE_HOUR_MS);
    case 'four-hours':
      return new Date(now.getTime() + REMIND_AFTER_FOUR_HOURS_MS);
    case 'tomorrow':
      return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, REMIND_TOMORROW_HOUR, 0, 0, 0);
  }
}

/** `lastBuiltSha` out of the builder's `state.json`, or `null` for anything malformed. */
export function parseLastBuiltSha(json: string): string | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const sha = (parsed as { lastBuiltSha?: unknown }).lastBuiltSha;
  return isTree(sha) ? sha : null;
}

export interface UpdateCheckInput {
  /** The running build's tree hash; `null` for a dev run. */
  readonly runningTree: string | null;
  readonly lastBuiltSha: string | null;
  readonly buildOnDisk: (tree: string) => boolean;
  /** The persisted *Update later* time, if any. */
  readonly remindAfter: Date | null;
  readonly now: Date;
}

export type UpdateDecision =
  | { readonly kind: 'none'; readonly reason: string }
  | { readonly kind: 'snoozed'; readonly until: Date }
  | { readonly kind: 'prompt'; readonly tree: string };

export function decideUpdate(input: UpdateCheckInput): UpdateDecision {
  if (input.runningTree === null) return { kind: 'none', reason: 'not running from a logon build' };
  if (input.lastBuiltSha === null) return { kind: 'none', reason: 'the builder has recorded no build' };
  if (input.lastBuiltSha === input.runningTree) return { kind: 'none', reason: 'already on the newest build' };
  if (!input.buildOnDisk(input.lastBuiltSha)) {
    return { kind: 'none', reason: `build ${input.lastBuiltSha} is not on disk` };
  }
  if (input.remindAfter !== null && input.now.getTime() < input.remindAfter.getTime()) {
    return { kind: 'snoozed', until: input.remindAfter };
  }
  return { kind: 'prompt', tree: input.lastBuiltSha };
}

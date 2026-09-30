/**
 * R3-3: the Inbox's three filter tabs, as pure rules over the rows.
 *
 * * Needs you: open rows, the questions nobody has answered.
 * * Answered, not applied: resolved or dismissed rows `/inbox-apply` has not
 *   archived yet. This is `v_inbox_queue` (090), so its count is the number
 *   the footer's "N answered" and the Apply answers press work through. A row
 *   the transform already stamped `applied_at` stays here until the worker
 *   archives it, and its chip says "applied".
 * * Archived: finished work, kept because the decision line lives on it.
 */

import { groupByKind, type AttentionItem } from '@/lib/queries.sync';

export type InboxTab = 'needs_you' | 'answered' | 'archived';

export const INBOX_TABS: readonly { id: InboxTab; label: string }[] = [
  { id: 'needs_you', label: 'Needs you' },
  { id: 'answered', label: 'Answered, not applied' },
  { id: 'archived', label: 'Archived' },
];

export function tabOf(item: Pick<AttentionItem, 'state'>): InboxTab {
  if (item.state === 'open') return 'needs_you';
  if (item.state === 'archived') return 'archived';
  return 'answered';
}

/** One tab's rows, in the Inbox's kind order (conflicts first). */
export function rowsForTab(items: readonly AttentionItem[], tab: InboxTab): AttentionItem[] {
  return groupByKind(items.filter((item) => tabOf(item) === tab)).flatMap((group) => group.items);
}

export function tabCounts(items: readonly AttentionItem[]): Record<InboxTab, number> {
  const counts: Record<InboxTab, number> = { needs_you: 0, answered: 0, archived: 0 };
  for (const item of items) counts[tabOf(item)] += 1;
  return counts;
}

/** What an empty tab says. */
export const EMPTY_TAB_TEXT: Record<InboxTab, string> = {
  needs_you: 'Nothing needs you. The last sync answered every question it could on its own.',
  answered: 'Every answer has been applied.',
  archived: 'Nothing has been archived yet.',
};

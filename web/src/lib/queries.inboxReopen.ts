'use client';

/**
 * Undo an Inbox answer (2026-10-05).
 *
 * An answered row sits under "Answered, not applied" until the next fold's
 * `apply_resolutions()` stamps `applied_at` or `/inbox-apply` archives it. Until
 * then the answer is only a row in `attention_items`, so a wrong press (Stack,
 * 2026-10-05: "I accidentally clicked the wrong input button") is taken back by
 * putting the row back exactly as `raise_attention` left it: `open`, with no
 * resolution, no time and no note. The fold then asks nothing new (the row is
 * still the open one for its key) and the card offers its controls again.
 *
 * The write is guarded in the filter, not only in the UI: it touches a row only
 * while it is `resolved` or `dismissed`, unapplied and unarchived, so a race with
 * the fold or the worker reopens nothing and says so. An answer the transform
 * already applied changed a fact; taking that back is a new answer, not an undo.
 *
 * One more refusal comes from the database: `attention_items_open_dedupe_idx`
 * allows one open row per key, so if the next sync has re-asked the question
 * (a newer open twin exists) the reopen fails with 23505 and the message says
 * to answer the newer item instead.
 *
 * `resolveAttentionItem` in queries.sync.ts writes the four columns the other
 * way; that file is past the project's size rule and is not edited here. Same
 * cache invalidations as its hook.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { getSupabaseBrowserClient } from './supabase/client';
import { assertRowId, syncKeys, type AttentionItem } from './queries.sync';

/** The four columns an answer wrote, back to what an open row carries. */
export const REOPEN_PATCH = Object.freeze({
  state: 'open',
  resolved_at: null,
  resolution: null,
  resolution_note: null,
} as const);

/** The sentence under the Undo control: what pressing it changes, and what it does not. */
export const UNDO_OUTCOME =
  'Back under Needs you with no answer. Nothing has been applied yet, so nothing else changes.';

/** The reopen touched no row: the fold or the worker got there first. */
export const REOPEN_REFUSED =
  'this answer was already applied or archived, so it cannot be taken back here';

/** The database refused a second open row for the key: the next sync re-asked the question. */
export const REOPEN_TWIN = 'the next sync asked this again; answer the newer open item instead';

const UNIQUE_VIOLATION = '23505';
const OPEN_DEDUPE_INDEX = 'attention_items_open_dedupe_idx';

/**
 * Can this answer still be taken back? Only while the row is answered or
 * dismissed, the transform has not applied it and the worker has not archived it.
 */
export function canReopen(
  item: Pick<AttentionItem, 'state' | 'applied_at' | 'archived_at'>,
): boolean {
  return (
    (item.state === 'resolved' || item.state === 'dismissed') &&
    item.applied_at === null &&
    item.archived_at === null
  );
}

/** A unique-index refusal on the open-dedupe index, however supabase-js shaped it. */
function isOpenTwinRefusal(error: unknown): boolean {
  if (error === null || typeof error !== 'object') return false;
  const { code, message } = error as { code?: unknown; message?: unknown };
  return code === UNIQUE_VIOLATION || (typeof message === 'string' && message.includes(OPEN_DEDUPE_INDEX));
}

/** Put one answered, unapplied, unarchived row back to open. Throws a readable reason otherwise. */
export async function reopenAttentionItem(id: number): Promise<void> {
  const rowId = assertRowId(id, 'attention item id');
  const supabase = getSupabaseBrowserClient() as unknown as SupabaseClient;
  const { data, error } = await supabase
    .from('attention_items')
    .update(REOPEN_PATCH)
    .eq('id', rowId)
    .in('state', ['resolved', 'dismissed'])
    .is('applied_at', null)
    .is('archived_at', null)
    .select('id');
  if (error) throw isOpenTwinRefusal(error) ? new Error(REOPEN_TWIN) : error;
  if (!Array.isArray(data) || data.length === 0) throw new Error(REOPEN_REFUSED);
}

export function useReopenAttentionItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: reopenAttentionItem,
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: syncKeys.attentionAll() });
      void queryClient.invalidateQueries({ queryKey: syncKeys.status() });
      // Taking an answer back shrinks the worker's queue, so the Apply button's count moves.
      void queryClient.invalidateQueries({ queryKey: syncKeys.inboxQueueCount() });
    },
  });
}

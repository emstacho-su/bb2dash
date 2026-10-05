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
 * What can be taken back, and what cannot:
 *
 *   * `resolved` or `dismissed`, `applied_at` null, `archived_at` null — yes.
 *   * `applied_at` set — no: the transform changed a fact; the correction is a new answer.
 *   * a session-link question (`ref` `session_link/<file id>`) — no: `link_file_sessions`
 *     (123, 163) writes the pick into `bb_files.session_id` without stamping `applied_at`,
 *     and reads only files still unlinked, so a reopened one would never be read again.
 *   * `resolution` null while closed — no: Stack's writes always carry one (`{accept}`,
 *     `{value, value_type}`, `{dismissed: true}`); a bare close is the database's own
 *     (084), and nothing would raise or consume the question again.
 *
 * The same rules sit in the write's filter, not only in `canReopen`, so a race with
 * the fold or the worker reopens nothing and the card says so. Two races remain
 * narrower than this module can close: `apply_resolutions()` stamps `applied_at`
 * after its write without re-checking `state` (042), and `/inbox-apply` reads the
 * queue before it writes; the Inbox therefore hides Undo while an `inbox_feedback`
 * request is queued or claimed (`UNDO_BLOCKED`), and the rest is a follow-up in
 * SQL (a `reopen_attention_item()` that owns the rule beside 090's archive, and a
 * `state = 'resolved'` re-check on 042's stamp).
 *
 * One more refusal comes from the database: `attention_items_open_dedupe_idx`
 * allows one open row per key, so if the next sync has re-asked the question
 * (a newer open twin exists) the reopen fails with 23505 and the message says
 * to answer the newer item instead.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  assertRowId,
  invalidateInboxCaches,
  untypedClient,
  type AttentionItem,
} from './queries.sync';

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

/** The sentence in place of the outcome while `/inbox-apply` holds the queue. */
export const UNDO_BLOCKED = 'Apply answers is running; undo after it finishes.';

/** The reopen touched no row: it was applied or archived meanwhile, or the session is gone. */
export const REOPEN_REFUSED =
  'no row was reopened: it may have been applied or archived since, or you may be signed out';

/** The database refused a second open row for the key: the next sync re-asked the question. */
export const REOPEN_TWIN = 'the next sync asked this again; answer the newer open item instead';

const UNIQUE_VIOLATION = '23505';
const OPEN_DEDUPE_INDEX = 'attention_items_open_dedupe_idx';
const SESSION_LINK_PREFIX = 'session_link/';

/** A session-link question (123): its pick is applied without a stamp, so it is never undoable. */
export function isSessionLinkRef(ref: string | null): boolean {
  return typeof ref === 'string' && ref.startsWith(SESSION_LINK_PREFIX);
}

/**
 * Can this answer still be taken back? Only Stack's own answer or dismissal, on a
 * question the fold applies through `apply_resolutions()` or the worker archives,
 * while neither has acted.
 */
export function canReopen(
  item: Pick<AttentionItem, 'state' | 'applied_at' | 'archived_at' | 'ref' | 'resolution'>,
): boolean {
  return (
    (item.state === 'resolved' || item.state === 'dismissed') &&
    item.applied_at === null &&
    item.archived_at === null &&
    item.resolution !== null &&
    !isSessionLinkRef(item.ref)
  );
}

/** A unique-index refusal on the open-dedupe index, however supabase-js shaped it. */
function isOpenTwinRefusal(error: unknown): boolean {
  if (error === null || typeof error !== 'object') return false;
  const { code, message } = error as { code?: unknown; message?: unknown };
  return code === UNIQUE_VIOLATION || (typeof message === 'string' && message.includes(OPEN_DEDUPE_INDEX));
}

/** Put one undoable row back to open. Throws a readable reason otherwise. */
export async function reopenAttentionItem(id: number): Promise<void> {
  const rowId = assertRowId(id, 'attention item id');
  const { data, error } = await untypedClient()
    .from('attention_items')
    .update(REOPEN_PATCH)
    .eq('id', rowId)
    .in('state', ['resolved', 'dismissed'])
    .is('applied_at', null)
    .is('archived_at', null)
    .not('resolution', 'is', null)
    .not('ref', 'like', `${SESSION_LINK_PREFIX}%`)
    .select('id');
  if (error) throw isOpenTwinRefusal(error) ? new Error(REOPEN_TWIN) : error;
  if (!Array.isArray(data) || data.length === 0) throw new Error(REOPEN_REFUSED);
}

export function useReopenAttentionItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: reopenAttentionItem,
    // Taking an answer back shrinks the worker's queue, so the Apply button's count moves too.
    onSettled: () => invalidateInboxCaches(queryClient),
  });
}

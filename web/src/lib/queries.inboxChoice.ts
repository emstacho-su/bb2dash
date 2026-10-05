'use client';

/**
 * Candidate questions in the Inbox (R3-3 walk finding).
 *
 * Some stages raise a `stack_must_confirm` whose answer is one of a few known
 * rows: Phase 18's `link_file_sessions` (migration 123) asks which class
 * session a file belongs to, with `suggested.candidates` holding the session
 * ids and `suggested.answer_with` the resolution template the fold reads back,
 * e.g. `{"session_id": <one of candidates>} or {"accept": "none"}`.
 *
 * The card offers those candidates as buttons labelled with each session's
 * date and topic, and a choice writes exactly the shape the template names.
 * The shape is READ from `answer_with`, never assumed: no pick key, no buttons.
 *
 * `resolveAttentionItem` in queries.sync.ts only writes `{value, value_type}`
 * and that file is not edited here, so a choice has its own write: the same
 * four columns, the same `resolved` state, the same cache invalidations.
 */

import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseBrowserClient } from './supabase/client';
import { asRecord } from './json-record';
import {
  assertRowId,
  fieldValueText,
  normalizeNote,
  syncKeys,
  type AttentionItem,
  type ResolutionPatch,
} from './queries.sync';

/* ---------------------------------------------------------------------------
 * Reading the question
 * ------------------------------------------------------------------------ */

export interface SessionChoice {
  /** The candidate session ids, as the stage listed them. */
  candidates: number[];
  /** The resolution key a pick is written under (`session_id` for 123). */
  pickKey: string;
  /** The resolution for "none of these", when the template offers one. */
  none: Record<string, unknown> | null;
}

/** `{"session_id": <one of candidates>}` → `session_id`. */
const PICK_KEY = /\{\s*"([a-z_][a-z0-9_]*)"\s*:\s*<[^>]*candidates[^>]*>\s*\}/i;
/** Every brace group with no placeholder in it: a literal resolution. */
const LITERAL_OBJECT = /\{[^{}<>]*\}/g;

/** The candidate question on a row, or null when the row is not one. */
export function parseSessionChoice(item: Pick<AttentionItem, 'suggested'>): SessionChoice | null {
  const suggested = asRecord(item.suggested);
  if (!suggested || !Array.isArray(suggested.candidates)) return null;
  const template = typeof suggested.answer_with === 'string' ? suggested.answer_with : '';
  const pickKey = PICK_KEY.exec(template)?.[1];
  if (!pickKey) return null;

  const candidates = suggested.candidates.filter(
    (entry): entry is number => typeof entry === 'number' && Number.isInteger(entry) && entry > 0,
  );
  if (candidates.length === 0) return null;

  let none: Record<string, unknown> | null = null;
  for (const literal of template.match(LITERAL_OBJECT) ?? []) {
    try {
      const parsed = asRecord(JSON.parse(literal));
      if (parsed && !(pickKey in parsed)) {
        none = parsed;
        break;
      }
    } catch {
      // Not JSON: that part of the template is prose, not a resolution.
    }
  }
  return { candidates, pickKey, none };
}

/* ---------------------------------------------------------------------------
 * Labelling a session
 * ------------------------------------------------------------------------ */

export interface SessionLabelRow {
  id: number;
  session_date: string;
  topic: string | null;
  kind: string;
}

/** "Mon, Sep 21 · Requirements", or the session's kind when it has no topic. */
export function sessionLabel(row: SessionLabelRow, now: Date = new Date()): string {
  const day = fieldValueText(null, row.session_date, now);
  const what = row.topic?.trim() || row.kind;
  return `${day} · ${what}`;
}

/** Every candidate id across the rows, sorted and unique. */
export function candidateIds(items: readonly AttentionItem[]): number[] {
  const ids = new Set<number>();
  for (const item of items) {
    for (const id of parseSessionChoice(item)?.candidates ?? []) ids.add(id);
  }
  return [...ids].sort((a, b) => a - b);
}

export function sessionLabelsOptions(ids: readonly number[]) {
  return queryOptions({
    queryKey: ['inbox-session-labels', ...ids] as const,
    enabled: ids.length > 0,
    queryFn: async (): Promise<Map<number, string>> => {
      const supabase = getSupabaseBrowserClient();
      const { data, error } = await supabase
        .from('sessions')
        .select('id, session_date, topic, kind')
        .in('id', [...ids]);
      if (error) throw error;
      return new Map((data ?? []).map((row) => [row.id, sessionLabel(row)]));
    },
    staleTime: 15 * 60 * 1000,
  });
}

export function useSessionLabels(ids: readonly number[]) {
  return useQuery(sessionLabelsOptions(ids));
}

/* ---------------------------------------------------------------------------
 * Writing a choice
 * ------------------------------------------------------------------------ */

export interface ChoiceInput {
  id: number;
  /** Exactly the shape the question's template names. */
  resolution: Record<string, unknown>;
  note?: string | null;
}

/** The column patch a choice writes: the same four columns a resolve writes. */
export function buildChoicePatch(input: ChoiceInput, now: Date = new Date()): ResolutionPatch {
  assertRowId(input.id, 'attention item id');
  if (asRecord(input.resolution) === null) throw new Error('a choice must be an object');
  return {
    state: 'resolved',
    resolved_at: now.toISOString(),
    resolution: input.resolution,
    resolution_note: normalizeNote(input.note),
  };
}

export async function resolveChoice(input: ChoiceInput): Promise<void> {
  const patch = buildChoicePatch(input);
  const supabase = getSupabaseBrowserClient() as unknown as SupabaseClient;
  const { error } = await supabase.from('attention_items').update(patch).eq('id', input.id);
  if (error) throw error;
}

/** A choice, then the same refreshes `useResolveAttentionItem` makes. */
export function useResolveChoice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: resolveChoice,
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: syncKeys.attentionAll() });
      void queryClient.invalidateQueries({ queryKey: syncKeys.status() });
      void queryClient.invalidateQueries({ queryKey: syncKeys.inboxQueueCount() });
    },
  });
}

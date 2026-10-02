/**
 * bb2dash — the run-state word and the per-stream read (Phase 19, R-41).
 *
 * Pure functions over the three columns migration 137 appends to
 * `v_sync_status`: `notes`, `interrupted` and `streams`. They live here rather
 * than in `queries.sync.ts` because that file is already past the project's
 * size rule; `freshnessLine` there is the only caller.
 *
 * Nothing in this module imports React, TanStack Query or Supabase, and
 * nothing in it throws: `streams` is jsonb, so every element is checked and a
 * malformed one is dropped instead of being trusted or repaired.
 */

/** What Home and the Inbox header call the latest run, when there is something to say. */
export type RunStateWord =
  | 'sync running'
  | 'last run partial'
  | 'last run failed'
  | 'last sync interrupted';

/** The two fields of a `v_sync_status` row the word is read from. */
export interface RunStateInput {
  /** `sync_runs.status`. A value outside the known four has no word. */
  status: string | null;
  /** 137: `interrupted_at is not null`. Absent on a row read before 137. */
  interrupted?: boolean | null;
}

/** `v_sync_status.streams[].state` (137). */
export type StreamStateName = 'fresh' | 'stale' | 'never';

/** One element of `v_sync_status.streams`: R-41's per-stream read. */
export interface StreamState {
  stream: string;
  /** `v_data_freshness.fresh_as_of` for the stage; null when it never finished ok. */
  last_seen_at: string | null;
  state: StreamStateName;
}

const STREAM_STATES: readonly StreamStateName[] = ['fresh', 'stale', 'never'];

const NEVER_SYNCED_SUFFIX = 'never synced';

function isStreamStateName(value: unknown): value is StreamStateName {
  return typeof value === 'string' && (STREAM_STATES as readonly string[]).includes(value);
}

/**
 * The word for the latest run, or null when it landed (or is unknown).
 *
 * A run is running from the moment its request is claimed (135 opens the row
 * then). A reaped run (136's terminal rule) is `failed` with `interrupted`
 * set, and reads as interrupted, never as failed. `interrupted` on any other
 * status changes nothing: only a failed run can have been reaped.
 */
export function runStateWord(run: RunStateInput | null | undefined): RunStateWord | null {
  if (!run) return null;
  if (run.status === 'running') return 'sync running';
  if (run.status === 'partial') return 'last run partial';
  if (run.status === 'failed') {
    return run.interrupted === true ? 'last sync interrupted' : 'last run failed';
  }
  return null;
}

/**
 * Coerce the `streams` jsonb into typed elements. An element that is not an
 * object, names no stream, or carries a state outside `fresh | stale | never`
 * is dropped. A `last_seen_at` that is not a string reads as null. A column
 * that is absent (a row read before 137) or not an array gives an empty list.
 */
export function normalizeStreams(value: unknown): StreamState[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry): StreamState[] => {
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) return [];
    const { stream, last_seen_at: lastSeenAt, state } = entry as Record<string, unknown>;
    if (typeof stream !== 'string' || stream.length === 0) return [];
    if (!isStreamStateName(state)) return [];
    return [
      {
        stream,
        last_seen_at: typeof lastSeenAt === 'string' && lastSeenAt.length > 0 ? lastSeenAt : null,
        state,
      },
    ];
  });
}

/**
 * "content, history never synced": every expected stream whose state is
 * `never`, each named once, sorted. Null when there is none, so the caller
 * adds nothing to the line.
 */
export function neverSyncedLine(streams: readonly StreamState[]): string | null {
  const names = [
    ...new Set(streams.filter((entry) => entry.state === 'never').map((entry) => entry.stream)),
  ].sort();
  return names.length === 0 ? null : `${names.join(', ')} ${NEVER_SYNCED_SUFFIX}`;
}

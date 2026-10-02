/**
 * The run-state word and the per-stream read (Phase 19, tasks 19 and 20; R-41).
 *
 * `runStateWord` is the one place that turns a `v_sync_status` row into what
 * Home and the Inbox header call the run: running from the moment it is
 * claimed, partial, failed, or interrupted when 136's terminal rule reaped it.
 * `normalizeStreams` and `neverSyncedLine` read 137's `streams` column, which
 * arrives as jsonb and is trusted for nothing.
 *
 * The Supabase browser client is mocked only because `freshnessLine` lives in
 * `queries.sync`, whose module graph reaches it. Nothing here touches a network.
 */

import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase/client', () => ({
  getSupabaseBrowserClient: () => ({ from: vi.fn() }),
}));

const { neverSyncedLine, normalizeStreams, runStateWord } = await import('@/lib/sync-run-state');
const { freshnessLine } = await import('@/lib/queries.sync');

/** The nine expected streams of 137, every one fresh unless a test says otherwise. */
const EXPECTED_STREAMS = [
  'announcements',
  'assignments',
  'attempts',
  'content',
  'courses',
  'files',
  'gaps',
  'gradebook',
  'history',
] as const;

const SEEN_AT = '2026-10-02T11:04:00.000Z';

function streamsWith(never: readonly string[] = []) {
  return EXPECTED_STREAMS.map((stream) =>
    never.includes(stream)
      ? { stream, last_seen_at: null, state: 'never' }
      : { stream, last_seen_at: SEEN_AT, state: 'fresh' },
  );
}

describe('runStateWord — what the run is called', () => {
  it('calls a claimed sync running', () => {
    expect(runStateWord({ status: 'running', interrupted: false })).toBe('sync running');
  });

  it('calls a partial run partial', () => {
    expect(runStateWord({ status: 'partial', interrupted: false })).toBe('last run partial');
  });

  it('calls a failed run failed', () => {
    expect(runStateWord({ status: 'failed', interrupted: false })).toBe('last run failed');
  });

  it('calls a reaped run interrupted, never failed', () => {
    expect(runStateWord({ status: 'failed', interrupted: true })).toBe('last sync interrupted');
  });

  it('has nothing to add for a run that landed', () => {
    expect(runStateWord({ status: 'ok', interrupted: false })).toBeNull();
  });

  it('reads a row with no interrupted column as not interrupted (before 137)', () => {
    expect(runStateWord({ status: 'failed' })).toBe('last run failed');
    expect(runStateWord({ status: 'failed', interrupted: null })).toBe('last run failed');
  });

  it('does not call a run interrupted unless it also failed', () => {
    expect(runStateWord({ status: 'ok', interrupted: true })).toBeNull();
    expect(runStateWord({ status: 'running', interrupted: true })).toBe('sync running');
  });

  it('says nothing about a status it does not know, or no row at all', () => {
    expect(runStateWord({ status: null })).toBeNull();
    expect(runStateWord({ status: 'queued' })).toBeNull();
    expect(runStateWord(null)).toBeNull();
  });

  it('leaves "no sync recorded yet" to freshnessLine when there is no row', () => {
    expect(freshnessLine(null)).toBe('no sync recorded yet');
  });
});

describe('normalizeStreams — 137’s jsonb, trusted for nothing', () => {
  it('keeps a well-formed element exactly as the view wrote it', () => {
    expect(
      normalizeStreams([
        { stream: 'files', last_seen_at: SEEN_AT, state: 'fresh' },
        { stream: 'gradebook', last_seen_at: '2026-09-29T11:04:00.000Z', state: 'stale' },
        { stream: 'history', last_seen_at: null, state: 'never' },
      ]),
    ).toEqual([
      { stream: 'files', last_seen_at: SEEN_AT, state: 'fresh' },
      { stream: 'gradebook', last_seen_at: '2026-09-29T11:04:00.000Z', state: 'stale' },
      { stream: 'history', last_seen_at: null, state: 'never' },
    ]);
  });

  it('drops an element with no stream', () => {
    expect(
      normalizeStreams([
        { last_seen_at: null, state: 'never' },
        { stream: '', last_seen_at: null, state: 'never' },
        { stream: 7, last_seen_at: null, state: 'never' },
        { stream: 'history', last_seen_at: null, state: 'never' },
      ]),
    ).toEqual([{ stream: 'history', last_seen_at: null, state: 'never' }]);
  });

  it('drops an element with an unknown state', () => {
    expect(
      normalizeStreams([
        { stream: 'files', last_seen_at: SEEN_AT, state: 'warm' },
        { stream: 'content', last_seen_at: SEEN_AT },
        { stream: 'history', last_seen_at: null, state: 'never' },
      ]),
    ).toEqual([{ stream: 'history', last_seen_at: null, state: 'never' }]);
  });

  it('drops anything that is not an object, and never throws', () => {
    expect(normalizeStreams([null, 'history', 3, ['history'], undefined])).toEqual([]);
  });

  it('reads a last_seen_at that is not a string as null rather than inventing a time', () => {
    expect(normalizeStreams([{ stream: 'files', last_seen_at: 1759400000, state: 'fresh' }])).toEqual([
      { stream: 'files', last_seen_at: null, state: 'fresh' },
    ]);
  });

  it('returns an empty list for a column that is absent or not an array', () => {
    for (const value of [undefined, null, {}, 'never', 9]) {
      expect(normalizeStreams(value)).toEqual([]);
    }
  });

  it('does not change the value it was handed', () => {
    const input = [{ stream: 'history', last_seen_at: null, state: 'never', extra: true }];
    const snapshot = JSON.parse(JSON.stringify(input));
    const out = normalizeStreams(input);
    expect(input).toEqual(snapshot);
    expect(out[0]).not.toBe(input[0]);
  });
});

describe('neverSyncedLine — the streams that have never synced, by name', () => {
  it('names the one stream that never synced', () => {
    expect(neverSyncedLine(normalizeStreams(streamsWith(['history'])))).toBe('history never synced');
  });

  it('names every such stream, sorted', () => {
    expect(neverSyncedLine(normalizeStreams(streamsWith(['history', 'content'])))).toBe(
      'content, history never synced',
    );
  });

  it('says nothing when no stream is in the never state', () => {
    expect(neverSyncedLine(normalizeStreams(streamsWith()))).toBeNull();
  });

  it('does not count a stale stream as never synced', () => {
    expect(
      neverSyncedLine([{ stream: 'files', last_seen_at: '2026-09-29T11:04:00.000Z', state: 'stale' }]),
    ).toBeNull();
  });

  it('says nothing for an empty list, which is what a row without the column gives', () => {
    expect(neverSyncedLine([])).toBeNull();
    expect(neverSyncedLine(normalizeStreams(undefined))).toBeNull();
  });

  it('names a stream once even if the view repeated it', () => {
    expect(
      neverSyncedLine([
        { stream: 'history', last_seen_at: null, state: 'never' },
        { stream: 'history', last_seen_at: null, state: 'never' },
      ]),
    ).toBe('history never synced');
  });
});

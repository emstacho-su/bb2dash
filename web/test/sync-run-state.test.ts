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

const {
  NO_SYNC_RECORDED,
  lastSyncedClause,
  neverSyncedLine,
  newestFoldAt,
  normalizeStreams,
  runStateWord,
} = await import('@/lib/sync-run-state');
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

  it('says nothing when handed no list at all (a status restored from an older cache)', () => {
    expect(neverSyncedLine(undefined)).toBeNull();
    expect(neverSyncedLine(null)).toBeNull();
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

/* ---------------------------------------------------------------------------
 * Round 2, R2-6: a crawl that never folded is not "last synced"
 * ------------------------------------------------------------------------ */

describe('newestFoldAt — the newest real fold across the streams', () => {
  it('picks the newest last_seen_at, comparing instants rather than strings', () => {
    expect(
      newestFoldAt([
        { stream: 'files', last_seen_at: '2026-09-07T15:00:00.000Z', state: 'stale' },
        // 13:30 in New York is 17:30Z: the newest, though it sorts first as a string.
        { stream: 'content', last_seen_at: '2026-09-07T13:30:00-04:00', state: 'stale' },
        { stream: 'history', last_seen_at: null, state: 'never' },
      ]),
    ).toBe('2026-09-07T13:30:00-04:00');
  });

  it('skips a last_seen_at it cannot read', () => {
    expect(
      newestFoldAt([
        { stream: 'files', last_seen_at: 'not a time', state: 'fresh' },
        { stream: 'content', last_seen_at: '2026-09-07T15:00:00.000Z', state: 'stale' },
      ]),
    ).toBe('2026-09-07T15:00:00.000Z');
  });

  it('is null when no stream has ever folded, or there are no streams', () => {
    expect(newestFoldAt([{ stream: 'history', last_seen_at: null, state: 'never' }])).toBeNull();
    expect(newestFoldAt([])).toBeNull();
    expect(newestFoldAt(undefined)).toBeNull();
  });
});

describe('lastSyncedClause — which instant "last synced" names', () => {
  /** Formats an instant the way a test can read: the raw value, or a dash. */
  const ago = (iso: string | null) => `<${iso ?? '—'}>`;
  const REAPED_AT = '2026-09-10T14:55:00.000Z';
  const STARTED_AT = '2026-09-10T14:24:00.000Z';
  const FOLDED_AT = '2026-09-07T15:00:00.000Z';
  const streams = [
    { stream: 'files', last_seen_at: FOLDED_AT, state: 'stale' as const },
    { stream: 'history', last_seen_at: null, state: 'never' as const },
  ];
  const run = (status: string, interrupted: boolean, withStreams = streams) => ({
    status,
    interrupted,
    finished_at: REAPED_AT,
    started_at: STARTED_AT,
    streams: withStreams,
  });

  it('names the newest real fold, not the reap time, for an interrupted run', () => {
    expect(lastSyncedClause(run('failed', true), ago)).toBe(`last synced <${FOLDED_AT}>`);
  });

  it('names the newest real fold for a failed run too', () => {
    expect(lastSyncedClause(run('failed', false), ago)).toBe(`last synced <${FOLDED_AT}>`);
  });

  it('says no sync is recorded when no stream has ever folded', () => {
    const never = [{ stream: 'history', last_seen_at: null, state: 'never' as const }];
    expect(lastSyncedClause(run('failed', true, never), ago)).toBe(NO_SYNC_RECORDED);
    expect(NO_SYNC_RECORDED).toBe('no sync recorded yet');
  });

  it('keeps the run’s own finish for a run that folded', () => {
    expect(lastSyncedClause(run('ok', false), ago)).toBe(`last synced <${REAPED_AT}>`);
    expect(lastSyncedClause(run('partial', false), ago)).toBe(`last synced <${REAPED_AT}>`);
  });

  it('has no clause while a sync is running: the word says it', () => {
    expect(lastSyncedClause(run('running', false), ago)).toBeNull();
  });

  it('falls back to the run’s own times when the row carries no streams (before 137)', () => {
    expect(lastSyncedClause(run('failed', false, []), ago)).toBe(`last synced <${REAPED_AT}>`);
    const noKey = { status: 'failed', finished_at: null, started_at: STARTED_AT };
    expect(lastSyncedClause(noKey, ago)).toBe(`last synced <${STARTED_AT}>`);
  });
});

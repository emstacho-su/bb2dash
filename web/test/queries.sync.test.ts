/**
 * The sync-loop write contract: what a resolution actually sends to Postgres,
 * per kind, and what the boundary refuses to send at all.
 *
 * The Supabase browser client is mocked because the module graph reaches it;
 * `resolveAttentionItem` is then exercised against a recording stub so the
 * update body and the filter are asserted, not guessed.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeSyncStatusRow } from './factories';

const update = vi.fn();
const eq = vi.fn();
const from = vi.fn();

vi.mock('@/lib/supabase/client', () => ({
  getSupabaseBrowserClient: () => ({ from }),
}));

const {
  NOTE_MAX_LENGTH,
  buildResolutionPatch,
  changeLines,
  freshnessLine,
  normalizeOpenAttention,
  normalizeSyncStatus,
  parseDateAnswer,
  relativeTime,
  resolveAttentionItem,
  stalenessLine,
  syncCommand,
  totalOpen,
} = await import('@/lib/queries.sync');

beforeEach(() => {
  vi.clearAllMocks();
  eq.mockResolvedValue({ error: null });
  update.mockReturnValue({ eq });
  from.mockReturnValue({ update });
});

const NOW = new Date('2026-09-10T15:00:00.000Z');

describe('buildResolutionPatch — one shape per kind, the note always along', () => {
  it('conflict: Accept Blackboard resolves with accept=blackboard', () => {
    const patch = buildResolutionPatch(
      { id: 7, kind: 'conflict', accept: 'blackboard', note: '  the syllabus agrees  ' },
      NOW,
    );
    expect(patch).toEqual({
      state: 'resolved',
      resolved_at: '2026-09-10T15:00:00.000Z',
      resolution: { accept: 'blackboard' },
      resolution_note: 'the syllabus agrees',
    });
  });

  it('conflict: Keep mine resolves with accept=keep', () => {
    const patch = buildResolutionPatch({ id: 7, kind: 'conflict', accept: 'keep' }, NOW);
    expect(patch.resolution).toEqual({ accept: 'keep' });
    expect(patch.state).toBe('resolved');
    expect(patch.resolution_note).toBeNull();
  });

  it('stack_must_confirm: a date answer is carried as a parsed YYYY-MM-DD value', () => {
    const patch = buildResolutionPatch(
      {
        id: 11,
        kind: 'stack_must_confirm',
        answer: '2026-10-01',
        answerType: 'date',
        note: 'from the internship agreement',
      },
      NOW,
    );
    expect(patch).toEqual({
      state: 'resolved',
      resolved_at: '2026-09-10T15:00:00.000Z',
      resolution: { value: '2026-10-01', value_type: 'date' },
      resolution_note: 'from the internship agreement',
    });
  });

  it('missing: a text answer is trimmed and typed', () => {
    const patch = buildResolutionPatch(
      { id: 12, kind: 'missing', answer: '  Group 4  ', answerType: 'text', note: 'roster email' },
      NOW,
    );
    expect(patch.resolution).toEqual({ value: 'Group 4', value_type: 'text' });
    expect(patch.resolution_note).toBe('roster email');
  });

  it('an answered data_gap resolves and carries the value, so /inbox-apply can act on it', () => {
    const patch = buildResolutionPatch(
      { id: 3, kind: 'data_gap', answer: 'pull it next sync', answerType: 'text', note: 'still on Blackboard' },
      NOW,
    );
    expect(patch.state).toBe('resolved');
    expect(patch.resolution).toEqual({ value: 'pull it next sync', value_type: 'text' });
    expect(patch.resolution_note).toBe('still on Blackboard');
  });

  it('an answered data_gap on a date field parses the date at the same boundary', () => {
    const patch = buildResolutionPatch(
      { id: 4, kind: 'data_gap', answer: '2026-10-14', answerType: 'date' },
      NOW,
    );
    expect(patch.resolution).toEqual({ value: '2026-10-14', value_type: 'date' });
    expect(() =>
      buildResolutionPatch({ id: 4, kind: 'data_gap', answer: '2026-02-31', answerType: 'date' }, NOW),
    ).toThrow();
    expect(() =>
      buildResolutionPatch({ id: 4, kind: 'data_gap', answer: '   ', answerType: 'text' }, NOW),
    ).toThrow();
  });

  it('deadline and an unanswered data_gap dismiss rather than resolve, and still keep the why', () => {
    for (const kind of ['deadline', 'data_gap'] as const) {
      const patch = buildResolutionPatch({ id: 3, kind, note: 'not a real gap' }, NOW);
      expect(patch.state).toBe('dismissed');
      expect(patch.resolution).toEqual({ dismissed: true });
      expect(patch.resolution_note).toBe('not a real gap');
    }
  });

  it('never writes applied_at — that column belongs to the transform', () => {
    const patch = buildResolutionPatch({ id: 7, kind: 'conflict', accept: 'keep' }, NOW);
    expect(Object.keys(patch).sort()).toEqual([
      'resolution',
      'resolution_note',
      'resolved_at',
      'state',
    ]);
  });
});

describe('buildResolutionPatch — what the boundary refuses', () => {
  it('refuses a note over the 500-character cap', () => {
    expect(() =>
      buildResolutionPatch({ id: 1, kind: 'conflict', accept: 'keep', note: 'x'.repeat(501) }),
    ).toThrow(/limit is 500/);
    expect(NOTE_MAX_LENGTH).toBe(500);
  });

  it('keeps a note of exactly the cap', () => {
    const patch = buildResolutionPatch({
      id: 1,
      kind: 'conflict',
      accept: 'keep',
      note: 'x'.repeat(500),
    });
    expect(patch.resolution_note).toHaveLength(500);
  });

  it('refuses a malformed or impossible date', () => {
    expect(() => parseDateAnswer('10/01/2026')).toThrow(/YYYY-MM-DD/);
    expect(() => parseDateAnswer('2026-02-31')).toThrow(/not a real date/);
    expect(parseDateAnswer('2026-02-28')).toBe('2026-02-28');
  });

  it('refuses an empty answer and a non-positive id', () => {
    expect(() =>
      buildResolutionPatch({ id: 1, kind: 'missing', answer: '   ', answerType: 'text' }),
    ).toThrow(/answer is empty/);
    expect(() => buildResolutionPatch({ id: 0, kind: 'conflict', accept: 'keep' })).toThrow(
      /positive integer/,
    );
  });
});

describe('resolveAttentionItem — the request that reaches Postgres', () => {
  it('updates attention_items with the built patch, filtered to the one row', async () => {
    await resolveAttentionItem({
      id: 7,
      kind: 'conflict',
      accept: 'blackboard',
      note: 'Blackboard is authoritative here',
    });

    expect(from).toHaveBeenCalledWith('attention_items');
    const body = update.mock.calls[0][0];
    expect(body.state).toBe('resolved');
    expect(body.resolution).toEqual({ accept: 'blackboard' });
    expect(body.resolution_note).toBe('Blackboard is authoritative here');
    expect(body.applied_at).toBeUndefined();
    expect(eq).toHaveBeenCalledWith('id', 7);
  });

  it('throws the Postgres error rather than swallowing it', async () => {
    eq.mockResolvedValue({ error: new Error('row-level security') });
    await expect(
      resolveAttentionItem({ id: 7, kind: 'conflict', accept: 'keep' }),
    ).rejects.toThrow(/row-level security/);
  });

  it('never reaches the client when the input is invalid', async () => {
    await expect(
      resolveAttentionItem({ id: 7, kind: 'missing', answer: 'nope', answerType: 'date' }),
    ).rejects.toThrow(/YYYY-MM-DD/);
    expect(from).not.toHaveBeenCalled();
  });
});

describe('syncCommand', () => {
  it('is the exact command Stack pastes into Claude Code', () => {
    expect(syncCommand(42)).toBe('claude --model sonnet "/bb-sync 42"');
  });

  it('refuses to build a command around a non-id', () => {
    expect(() => syncCommand(-1)).toThrow(/positive integer/);
  });
});

describe('v_sync_status normalisation', () => {
  it('reads the counts, the freshness rows and the change lines off one row', () => {
    const status = normalizeSyncStatus(makeSyncStatusRow());
    expect(status?.open_attention).toEqual({
      conflict: 2,
      stack_must_confirm: 5,
      missing: 1,
      deadline: 3,
      data_gap: 7,
    });
    expect(totalOpen(status)).toBe(18);
    expect(status?.freshness.map((row) => row.stage)).toEqual(['assignments', 'files']);
    expect(changeLines(status?.summary ?? null)).toEqual([
      'IST.323 Quiz 2 due date moved 9/2 → 9/9',
      'ECN.304 added 1 announcement',
    ]);
  });

  it('drops counts for kinds the view does not know and never invents one', () => {
    expect(normalizeOpenAttention({ conflict: 1, overdue: 9 })).toEqual({ conflict: 1 });
    expect(normalizeOpenAttention(null)).toEqual({});
  });

  it('survives a row that is missing everything', () => {
    const status = normalizeSyncStatus({ id: null });
    expect(status?.open_attention).toEqual({});
    expect(status?.freshness).toEqual([]);
    expect(freshnessLine(status)).toBe('no sync recorded yet');
  });
});

describe('the freshness line', () => {
  it('says how long ago the last run finished and names the stalest stage', () => {
    const status = normalizeSyncStatus(makeSyncStatusRow());
    expect(freshnessLine(status, NOW)).toBe('last synced 4 hrs ago · files stale 2 days');
  });

  it('calls out a failed stage instead of its age', () => {
    expect(
      stalenessLine(
        [
          { stage: 'files', fresh_as_of: '2026-09-08T11:00:00.000Z', last_attempt_at: null, last_attempt_failed: true },
        ],
        NOW,
      ),
    ).toBe('files last attempt failed');
  });

  it('says nothing when every stage is under a day old', () => {
    expect(
      stalenessLine(
        [
          {
            stage: 'assignments',
            fresh_as_of: '2026-09-10T11:00:00.000Z',
            last_attempt_at: null,
            last_attempt_failed: false,
          },
        ],
        NOW,
      ),
    ).toBeNull();
  });

  it('reports a running sync as running, not as an age', () => {
    const status = normalizeSyncStatus(makeSyncStatusRow({ status: 'running', finished_at: null }));
    expect(freshnessLine(status, NOW)).toContain('sync running');
  });

  it('has no opinion about a timestamp it cannot parse', () => {
    expect(relativeTime(null)).toBe('—');
    expect(relativeTime('not a date')).toBe('—');
  });
});

/* ---------------------------------------------------------------------------
 * Phase 19 (tasks 19 and 20, R-41): the run-state word and 137's three columns
 * ------------------------------------------------------------------------ */

/** Every stage fresh at NOW, so `stalenessLine` has nothing to say. */
const ALL_FRESH = [
  {
    stage: 'assignments',
    fresh_as_of: '2026-09-10T11:04:00.000Z',
    last_attempt_at: '2026-09-10T11:04:00.000Z',
    last_attempt_failed: false,
  },
  {
    stage: 'files',
    fresh_as_of: '2026-09-10T11:04:00.000Z',
    last_attempt_at: '2026-09-10T11:04:00.000Z',
    last_attempt_failed: false,
  },
];

/** 137's `streams`: the named streams read `never`, the rest `fresh`. */
function streamsWith(never: readonly string[]) {
  return ['announcements', 'assignments', 'content', 'files', 'history'].map((stream) =>
    never.includes(stream)
      ? { stream, last_seen_at: null, state: 'never' }
      : { stream, last_seen_at: '2026-09-10T11:04:00.000Z', state: 'fresh' },
  );
}

describe('v_sync_status normalisation — the three columns 137 appends', () => {
  it('carries notes, interrupted and streams off the row', () => {
    const status = normalizeSyncStatus(
      makeSyncStatusRow({
        status: 'failed',
        notes: 'crawl registered · interrupted (reaped)',
        interrupted: true,
        streams: streamsWith(['history']),
      }),
    );
    expect(status?.notes).toBe('crawl registered · interrupted (reaped)');
    expect(status?.interrupted).toBe(true);
    expect(status?.streams).toHaveLength(5);
    expect(status?.streams.find((entry) => entry.stream === 'history')).toEqual({
      stream: 'history',
      last_seen_at: null,
      state: 'never',
    });
  });

  it('reads a row without them (prod before 137) as no notes, not interrupted, no streams', () => {
    const status = normalizeSyncStatus(makeSyncStatusRow());
    expect(status?.notes).toBeNull();
    expect(status?.interrupted).toBe(false);
    expect(status?.streams).toEqual([]);
  });

  it('drops a malformed stream element and does not take a truthy string for interrupted', () => {
    const status = normalizeSyncStatus(
      makeSyncStatusRow({
        interrupted: 'true',
        notes: 7,
        streams: [{ state: 'never' }, { stream: 'files', state: 'warm' }, 'history'],
      }),
    );
    expect(status?.interrupted).toBe(false);
    expect(status?.notes).toBeNull();
    expect(status?.streams).toEqual([]);
  });
});

describe('the freshness line — run state and never-synced streams (Phase 19)', () => {
  it('names a stream that has never synced when every stage is fresh', () => {
    const status = normalizeSyncStatus(
      makeSyncStatusRow({ freshness: ALL_FRESH, streams: streamsWith(['history']) }),
    );
    const line = freshnessLine(status, NOW);
    expect(line).toBe('last synced 4 hrs ago · history never synced');
    expect(line.endsWith('· history never synced')).toBe(true);
  });

  it('names every never-synced stream, sorted', () => {
    const status = normalizeSyncStatus(
      makeSyncStatusRow({ freshness: ALL_FRESH, streams: streamsWith(['history', 'content']) }),
    );
    expect(freshnessLine(status, NOW)).toBe('last synced 4 hrs ago · content, history never synced');
  });

  it('lets a stale stage speak instead, and names no never-synced stream beside it', () => {
    // The factory's `files` row is two days old at NOW.
    const status = normalizeSyncStatus(makeSyncStatusRow({ streams: streamsWith(['history']) }));
    const line = freshnessLine(status, NOW);
    expect(line.endsWith('· files stale 2 days')).toBe(true);
    expect(line).not.toContain('never synced');
  });

  it('returns exactly what main returns for a row with no streams key', () => {
    const row = makeSyncStatusRow();
    expect('streams' in row).toBe(false);
    expect(freshnessLine(normalizeSyncStatus(row), NOW)).toBe(
      'last synced 4 hrs ago · files stale 2 days',
    );
    expect(freshnessLine(normalizeSyncStatus(makeSyncStatusRow({ freshness: ALL_FRESH })), NOW)).toBe(
      'last synced 4 hrs ago',
    );
  });

  it('returns exactly what main returns for each status when the new columns are absent', () => {
    const line = (overrides: Record<string, unknown>) =>
      freshnessLine(normalizeSyncStatus(makeSyncStatusRow({ freshness: ALL_FRESH, ...overrides })), NOW);
    expect(line({ status: 'running', finished_at: null })).toBe('sync running');
    expect(line({ status: 'partial' })).toBe('last synced 4 hrs ago · last run partial');
    expect(line({ status: 'failed' })).toBe('last synced 4 hrs ago · last run failed');
    expect(line({ status: 'ok' })).toBe('last synced 4 hrs ago');
  });

  it('calls a reaped run interrupted, not failed', () => {
    const status = normalizeSyncStatus(
      makeSyncStatusRow({
        status: 'failed',
        interrupted: true,
        notes: 'interrupted (reaped)',
        freshness: ALL_FRESH,
        streams: streamsWith([]),
      }),
    );
    const line = freshnessLine(status, NOW);
    expect(line).toBe('last synced 4 hrs ago · last sync interrupted');
    expect(line).not.toContain('last run failed');
  });

  it('keeps the run-state word ahead of a never-synced stream', () => {
    const status = normalizeSyncStatus(
      makeSyncStatusRow({
        status: 'running',
        finished_at: null,
        freshness: ALL_FRESH,
        streams: streamsWith(['history']),
      }),
    );
    expect(freshnessLine(status, NOW)).toBe('sync running · history never synced');
  });
});

/* ---------------------------------------------------------------------------
 * Round 2, R2-6: a crawl that never folded is not "last synced"
 * ------------------------------------------------------------------------ */

describe('the freshness line — an interrupted or failed run names the newest real fold', () => {
  /** NOW is 15:00Z on 2026-09-10: the run was reaped 5 minutes ago, after 31 minutes. */
  const reaped = {
    started_at: '2026-09-10T14:24:00.000Z',
    finished_at: '2026-09-10T14:55:00.000Z',
  };
  /** Every stream last folded three days before NOW. */
  const threeDaysAgo = '2026-09-07T15:00:00.000Z';
  const streamsSeen = (at: string | null) =>
    ['announcements', 'content', 'files', 'history'].map((stream) => ({
      stream,
      last_seen_at: at,
      state: at === null ? 'never' : 'stale',
    }));
  const staleFreshness = [
    { stage: 'files', fresh_as_of: threeDaysAgo, last_attempt_at: threeDaysAgo, last_attempt_failed: false },
  ];

  it('an interrupted run reaped 5 min ago, streams seen 3 days ago, reads "last synced 3 days ago"', () => {
    const status = normalizeSyncStatus(
      makeSyncStatusRow({
        status: 'failed',
        interrupted: true,
        ...reaped,
        freshness: [],
        streams: streamsSeen(threeDaysAgo),
      }),
    );
    expect(freshnessLine(status, NOW)).toBe('last synced 3 days ago · last sync interrupted');
  });

  it('keeps the staleness half after it when the stages are stale too', () => {
    const status = normalizeSyncStatus(
      makeSyncStatusRow({
        status: 'failed',
        interrupted: true,
        ...reaped,
        freshness: staleFreshness,
        streams: streamsSeen(threeDaysAgo),
      }),
    );
    expect(freshnessLine(status, NOW)).toBe(
      'last synced 3 days ago · last sync interrupted · files stale 3 days',
    );
  });

  it('a failed run reads the same way', () => {
    const status = normalizeSyncStatus(
      makeSyncStatusRow({
        status: 'failed',
        interrupted: false,
        ...reaped,
        freshness: [],
        streams: streamsSeen(threeDaysAgo),
      }),
    );
    expect(freshnessLine(status, NOW)).toBe('last synced 3 days ago · last run failed');
  });

  it('says no sync is recorded when no stream has ever folded', () => {
    const status = normalizeSyncStatus(
      makeSyncStatusRow({
        status: 'failed',
        interrupted: true,
        ...reaped,
        freshness: [],
        streams: streamsSeen(null),
      }),
    );
    expect(freshnessLine(status, NOW)).toBe(
      'no sync recorded yet · last sync interrupted · announcements, content, files, history never synced',
    );
  });

  it('an ok run is unchanged: it names its own finish', () => {
    const status = normalizeSyncStatus(
      makeSyncStatusRow({ status: 'ok', freshness: [], streams: streamsSeen(threeDaysAgo) }),
    );
    expect(freshnessLine(status, NOW)).toBe('last synced 4 hrs ago');
  });

  it('a row with no streams key returns exactly what main returns', () => {
    const row = makeSyncStatusRow({ status: 'failed', ...reaped });
    expect('streams' in row).toBe(false);
    expect(freshnessLine(normalizeSyncStatus(row), NOW)).toBe(
      'last synced 5 min ago · last run failed · files stale 2 days',
    );
  });
});

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

  it('deadline and data_gap dismiss rather than resolve, and still keep the why', () => {
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
    expect(syncCommand(42)).toBe('claude "/bb-sync 42"');
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

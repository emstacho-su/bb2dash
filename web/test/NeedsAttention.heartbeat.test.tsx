/**
 * P-12 / P-71 / R-52 — a dead calendar push or a stopped scheduler says so on Home.
 *
 * `v_scheduler_heartbeat` (migration 113) returns two rows, `transform` and
 * `calendar_push`, each with a stage: ok · late · missing · failing · off.
 * Home says nothing at `ok` or `late` (B-20) and one line per job otherwise,
 * in the PM's wording (brief 97 §Contract, "Home heartbeat lines").
 *
 * The view is W-44's and typed here from the Contract's RPC signature until the
 * PM regenerates `database.types.ts`. The rows below are plain constants on
 * purpose: W-47's walk17.spec.ts copies HEARTBEAT_PUSH_FAILING (not imports it)
 * to fulfil the view for screenshot 08.
 */

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { makeSyncStatusRow } from './factories';

const selects = vi.hoisted(() => [] as { table: string; columns: string }[]);
const viewRows = vi.hoisted(() => ({ data: [] as unknown[], error: null as unknown }));

vi.mock('@/lib/supabase/client', () => ({
  getSupabaseBrowserClient: () => ({
    from: (table: string) => ({
      select: async (columns: string) => {
        selects.push({ table, columns });
        return viewRows;
      },
    }),
  }),
}));
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

const { NeedsAttentionView } = await import('@/app/(app)/NeedsAttention');
const { normalizeSyncStatus } = await import('@/lib/queries.sync');
const { heartbeatLines, heartbeatOptions, normalizeHeartbeat } = await import(
  '@/lib/queries.heartbeat'
);

const NOW = new Date('2026-09-29T15:00:00.000Z');

/* ---------------------------------------------------------------------------
 * Fixtures — v_scheduler_heartbeat rows, copied verbatim by walk17.spec.ts
 * ------------------------------------------------------------------------ */

export const HEARTBEAT_TRANSFORM_OK = {
  job: 'transform',
  cron_jobname: 'bb2dash-transform-tick',
  tick_seconds: 120,
  last_tick_at: '2026-09-29T14:59:00.000Z',
  last_ok_at: '2026-09-29T14:59:00.000Z',
  consecutive_failures: 0,
  last_error: null,
  stage: 'ok',
};

export const HEARTBEAT_PUSH_OK = {
  job: 'calendar_push',
  cron_jobname: 'bb2dash-calendar-push',
  tick_seconds: 120,
  last_tick_at: '2026-09-29T14:59:30.000Z',
  last_ok_at: '2026-09-29T12:03:00.000Z',
  consecutive_failures: 0,
  last_error: null,
  stage: 'ok',
};

/** Screenshot 08's fixture: the calendar push failing three times, the transform fine. */
export const HEARTBEAT_PUSH_FAILING = [
  HEARTBEAT_TRANSFORM_OK,
  {
    job: 'calendar_push',
    cron_jobname: 'bb2dash-calendar-push',
    tick_seconds: 120,
    last_tick_at: '2026-09-29T14:59:30.000Z',
    last_ok_at: '2026-09-29T12:03:00.000Z',
    consecutive_failures: 3,
    last_error: 'refresh token revoked (invalid_grant): re-run scripts/google-consent.mjs',
    stage: 'failing',
  },
];

const transform = (overrides: Record<string, unknown>) => ({ ...HEARTBEAT_TRANSFORM_OK, ...overrides });
const push = (overrides: Record<string, unknown>) => ({ ...HEARTBEAT_PUSH_OK, ...overrides });

function lines(rows: unknown[]) {
  return heartbeatLines(normalizeHeartbeat(rows), NOW);
}

describe('heartbeatLines — one line per job whose stage calls for it', () => {
  it('says nothing when both jobs are ok', () => {
    expect(lines([HEARTBEAT_TRANSFORM_OK, HEARTBEAT_PUSH_OK])).toEqual([]);
  });

  it('says nothing at late (B-20)', () => {
    expect(
      lines([transform({ stage: 'late', last_tick_at: '2026-09-29T14:55:00.000Z' }), HEARTBEAT_PUSH_OK]),
    ).toEqual([]);
  });

  it('names a missing transform scheduler and what it holds up', () => {
    const out = lines([
      transform({ stage: 'missing', last_tick_at: '2026-09-29T12:00:00.000Z' }),
      HEARTBEAT_PUSH_OK,
    ]);
    expect(out).toEqual([
      'The sync scheduler has not run since 3 hrs ago; new crawls will not fold until it does.',
    ]);
  });

  it('says a scheduler that never ran has not run yet, rather than inventing a time', () => {
    const out = lines([transform({ stage: 'missing', last_tick_at: null }), HEARTBEAT_PUSH_OK]);
    expect(out).toEqual([
      'The sync scheduler has not run yet; new crawls will not fold until it does.',
    ]);
  });

  it('counts a failing transform and carries its last error', () => {
    const out = lines([
      transform({
        stage: 'failing',
        consecutive_failures: 3,
        last_ok_at: '2026-09-29T14:00:00.000Z',
        last_error: 'ERROR: deadlock detected',
      }),
      HEARTBEAT_PUSH_OK,
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]).toBe(
      'The sync scheduler has failed 3 times since 1 hr ago: ERROR: deadlock detected',
    );
  });

  it('names the fix for a failing calendar push, from its own last error', () => {
    const out = lines(HEARTBEAT_PUSH_FAILING);
    expect(out).toHaveLength(1);
    expect(out[0]).toContain('Google Calendar push has failed 3 times since 3 hrs ago');
    expect(out[0]).toContain('re-run scripts/google-consent.mjs');
  });

  it('names a missing calendar push', () => {
    const out = lines([
      HEARTBEAT_TRANSFORM_OK,
      push({ stage: 'missing', last_tick_at: '2026-09-28T15:00:00.000Z' }),
    ]);
    expect(out).toEqual(['Google Calendar push has not run since yesterday.']);
  });

  it('says a switched-off job is switched off', () => {
    expect(lines([transform({ stage: 'off' }), push({ stage: 'off' })])).toEqual([
      'Scheduler is switched off.',
      'Calendar push is switched off.',
    ]);
  });

  it('leaves out the since-clause and the error when the row has neither', () => {
    const out = lines([
      HEARTBEAT_TRANSFORM_OK,
      push({ stage: 'failing', consecutive_failures: 4, last_ok_at: null, last_error: null }),
    ]);
    expect(out).toEqual(['Google Calendar push has failed 4 times.']);
  });
});

describe('normalizeHeartbeat — nothing about the row is trusted', () => {
  it('drops rows with an unknown job or stage', () => {
    expect(
      normalizeHeartbeat([
        transform({ job: 'crawl' }),
        push({ stage: 'sleepy' }),
        HEARTBEAT_TRANSFORM_OK,
      ]),
    ).toHaveLength(1);
  });

  it('answers an empty list for a non-array', () => {
    expect(normalizeHeartbeat(null)).toEqual([]);
    expect(normalizeHeartbeat({ job: 'transform' })).toEqual([]);
  });

  it('reads a non-numeric failure count as zero', () => {
    const [row] = normalizeHeartbeat([transform({ consecutive_failures: 'three' })]);
    expect(row.consecutive_failures).toBe(0);
  });
});

describe('heartbeatOptions — the read', () => {
  it('reads v_scheduler_heartbeat', async () => {
    viewRows.data = HEARTBEAT_PUSH_FAILING;
    viewRows.error = null;
    const options = heartbeatOptions();
    const rows = await (options.queryFn as () => Promise<unknown>)();
    expect(selects.at(-1)?.table).toBe('v_scheduler_heartbeat');
    expect(rows).toHaveLength(2);
  });

  it('throws the database error rather than answering nothing', async () => {
    viewRows.data = [];
    viewRows.error = { message: 'permission denied for view v_scheduler_heartbeat' };
    const options = heartbeatOptions();
    await expect((options.queryFn as () => Promise<unknown>)()).rejects.toMatchObject({
      message: 'permission denied for view v_scheduler_heartbeat',
    });
  });
});

describe('NeedsAttention — the heartbeat lines on Home', () => {
  function renderRow(heartbeat: unknown[] | null, heartbeatError: Error | null = null) {
    return render(
      <NeedsAttentionView
        status={normalizeSyncStatus(makeSyncStatusRow())}
        items={[]}
        heartbeat={heartbeat === null ? null : normalizeHeartbeat(heartbeat)}
        heartbeatError={heartbeatError}
        now={NOW}
      />,
    );
  }

  it('shows the failing-push line', () => {
    renderRow(HEARTBEAT_PUSH_FAILING);
    expect(screen.getByText(/Google Calendar push has failed 3 times/)).toBeInTheDocument();
  });

  it('shows nothing extra when both jobs are ok', () => {
    renderRow([HEARTBEAT_TRANSFORM_OK, HEARTBEAT_PUSH_OK]);
    expect(screen.queryByRole('list', { name: 'Scheduler health' })).toBeNull();
  });

  it('shows nothing while the heartbeat has not answered', () => {
    renderRow(null);
    expect(screen.queryByRole('list', { name: 'Scheduler health' })).toBeNull();
  });

  it('says the scheduler health could not be read, rather than going quiet', () => {
    renderRow(null, new Error('relation "v_scheduler_heartbeat" does not exist'));
    expect(screen.getByText('Scheduler health could not be read.')).toHaveAttribute(
      'title',
      'relation "v_scheduler_heartbeat" does not exist',
    );
  });
});

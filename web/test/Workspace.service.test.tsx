/**
 * The service line on a laptop whose clock is wrong (Phase 21, the review round
 * of 2026-10-06; ruling V4, finding CR-8).
 *
 * The page used to set the browser's clock beside the database's `polled_at`.
 * With migration 143 the status row carries `polled_age_seconds`, the heartbeat's
 * age as the database counts it, and the page adds only the time its own
 * monotonic clock has counted since it read the row.
 *
 * Each case mounts the screen over the fake client with the browser's wall
 * clock set apart from the database's, which is how the fault showed. The fake
 * timers move the monotonic clock with the timers; `vi.setSystemTime()` moves
 * the wall clock alone.
 *
 * The cases for a row without the column (143 not applied) are the standing
 * ones in `Workspace.test.tsx`, "the service line": none of their rows carries
 * the column, and they pass unchanged.
 */

import { QueryClientProvider, focusManager, type QueryClient } from '@tanstack/react-query';
import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { newQueryClient } from './hydration-harness';
import { fake, gate, resetFake, type Row } from './workspace-harness';

vi.mock('@/lib/supabase/client', async () =>
  (await import('./workspace-harness')).supabaseClientMock(),
);
vi.mock('next/navigation', async () => (await import('./workspace-harness')).navigationMock());

const { Workspace } = await import('@/app/(app)/workspace/Workspace');
const { workspaceKeys } = await import('@/lib/queries.workspace');

const OFFLINE = 'The Workspace service is offline.';
/** The browser's wall clock when the page opens. */
const BROWSER_START = Date.parse('2026-10-06T15:00:00Z');
const TEN_MINUTES_MS = 10 * 60_000;
const ONE_HOUR_MS = 60 * 60_000;

/**
 * The one row of `v_workspace_status` once 143 is applied: a heartbeat
 * `ageSeconds` old by the database's count. `browserAheadMs` is how far the
 * browser's clock runs ahead of the database's (negative: behind), so
 * `polled_at` is written on the database's clock, as the view writes it.
 */
function counted(ageSeconds: number | null, browserAheadMs = 0): Row[] {
  const dbNow = Date.now() - browserAheadMs;
  return [
    {
      polled_at: ageSeconds === null ? null : new Date(dbNow - ageSeconds * 1_000).toISOString(),
      runner: ageSeconds === null ? null : 'workspace-1',
      open_requests: 0,
      oldest_open_at: null,
      polled_age_seconds: ageSeconds,
    },
  ];
}

async function advance(ms: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

function open(client: QueryClient = newQueryClient()) {
  fake.state.search = '';
  return render(
    <QueryClientProvider client={client}>
      <Workspace />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  resetFake();
  vi.useFakeTimers({ now: BROWSER_START });
  focusManager.setFocused(true);
});

afterEach(() => {
  vi.useRealTimers();
  focusManager.setFocused(undefined);
});

describe('the service line does not depend on the browser`s clock', () => {
  it('does not call a running service offline when the browser`s clock is ten minutes ahead', async () => {
    // The runner beat ten seconds ago. By the browser's clock that was ten minutes and ten seconds ago.
    fake.state.rows = { v_workspace_status: counted(10, TEN_MINUTES_MS) };
    open();
    await advance(100);

    expect(screen.queryByText(OFFLINE)).toBeNull();

    // The runner keeps beating: every read brings a heartbeat ten seconds old.
    await advance(3 * 60_000);
    expect(screen.queryByText(OFFLINE)).toBeNull();
  });

  it('calls a stopped service offline when the browser`s clock is ten minutes behind', async () => {
    // The last heartbeat is five minutes old. By the browser's clock it has not happened yet.
    fake.state.rows = { v_workspace_status: counted(300, -TEN_MINUTES_MS) };
    open();
    await advance(100);

    expect(screen.getByText(OFFLINE)).toBeInTheDocument();
  });

  it('counts on from the database`s seconds with its own clock when no newer row arrives', async () => {
    // 100 s old at the read, on a laptop ten minutes behind. Then the reads stall.
    fake.state.rows = { v_workspace_status: counted(100, -TEN_MINUTES_MS) };
    open();
    await advance(100);
    expect(screen.queryByText(OFFLINE)).toBeNull();
    fake.state.readGate = gate().promise;

    // 100 s + 30 s on the page's own clock: past 120 s, from a row read 30 s ago.
    await advance(30_000);

    expect(screen.getByText(OFFLINE)).toBeInTheDocument();
  });

  it('is not moved by the system clock jumping an hour between two reads', async () => {
    fake.state.rows = { v_workspace_status: counted(10) };
    open();
    await advance(100);
    fake.state.readGate = gate().promise;

    vi.setSystemTime(Date.now() + ONE_HOUR_MS);
    await advance(30_000);

    // 10 s + 30 s: the service is running, whatever the wall clock now says.
    expect(screen.queryByText(OFFLINE)).toBeNull();
  });

  it('reads a service that never polled as offline, from the null count', async () => {
    fake.state.rows = { v_workspace_status: counted(null, TEN_MINUTES_MS) };
    open();
    await advance(100);

    expect(screen.getByText(OFFLINE)).toBeInTheDocument();
  });
});

describe('a counted row this page did not read itself says nothing', () => {
  /** A client whose saved cache holds `row` for the status, read `ageMs` ago by the wall clock. */
  function clientWithStatus(row: Row, ageMs: number): QueryClient {
    const client = newQueryClient();
    client.setQueryData(workspaceKeys.status(), row, { updatedAt: Date.now() - ageMs });
    return client;
  }

  it('waits for its own read: a restored row 200 s old, saved 30 s ago, with the service now up', async () => {
    // The last visit ended while the service was down; the page was closed half a minute ago.
    const restored = counted(200)[0];
    // Since then the service has come back.
    fake.state.rows = { v_workspace_status: counted(5) };

    open(clientWithStatus(restored, 30_000));

    // The first paint. The read has been sent; the restored count has no moment on this page's clock.
    expect(fake.state.log).toContain('from:v_workspace_status');
    expect(screen.queryByText(OFFLINE)).toBeNull();
    await advance(100);
    expect(screen.queryByText(OFFLINE)).toBeNull();
  });

  it('then says what its own read brought', async () => {
    fake.state.rows = { v_workspace_status: counted(300) };

    open(clientWithStatus(counted(5)[0], 30_000));
    expect(screen.queryByText(OFFLINE)).toBeNull();

    await advance(100);
    expect(screen.getByText(OFFLINE)).toBeInTheDocument();
  });
});

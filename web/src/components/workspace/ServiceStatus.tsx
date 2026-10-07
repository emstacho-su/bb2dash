'use client';

/**
 * The service line (Phase 21, task 16).
 *
 * The Workspace answers only while its runner is up: a container on Stack's
 * laptop that beats `workspace_heartbeat()` every 30 s. The page reads
 * `v_workspace_status` every 30 s and says "The Workspace service is offline."
 * when there is no heartbeat yet or the last one is more than 120 s old.
 *
 * WHOSE CLOCK (the review round's ruling V4, CR-8). The heartbeat's age is the
 * database's own count at the read (`polled_age_seconds`, migration 143) plus
 * the time this page's monotonic clock has counted since it read the row. The
 * browser's wall clock is not set beside the database's: on a laptop whose
 * clock is minutes out that called a running service offline. While the column
 * is absent (143 not applied) the row is read as before, `polled_at` against the
 * wall clock (`now`), so the page works on both sides of the apply.
 *
 * THE CLOCKS TICK. `now` is a prop, read by the screen through `useNow(30_000)`,
 * and the monotonic one is read here through `useMonotonicNow(30_000)`: an idle
 * page turns offline, and back, without a reload, because the clock moves even
 * when the data does not.
 *
 * NOTHING IS CLAIMED BEFORE THE ROW IS READ. While the status is loading the
 * line is absent, and a read that failed says so instead of guessing either
 * way. The row comes from a cache restored before hydration, so it is read
 * only once `useHydrated()` is true.
 *
 * AND NOTHING IS CLAIMED FROM AN OLD ROW. The row in hand can be far older than
 * the 30 s it is re-read at: the saved cache restores the last visit's row, and
 * a hidden tab re-reads nothing. Its heartbeat is then old because the row is,
 * not because the service stopped. So the line is said only from a row read
 * within two refetch intervals; past that the page waits for the read that a
 * mount or a return to the tab has already sent. A counted row this page did
 * not read itself (the saved cache's) has no moment on this page's clock, so it
 * says nothing at all until that read answers.
 *
 * NOR BESIDE TEXT THAT IS ARRIVING. The screen re-reads the status at once when
 * a request in view becomes `claimed` and when its first delta arrives
 * (`useStatusOnAnswer` in `Workspace.tsx`), so a service that has just come
 * back is not called offline for the rest of the 30 s.
 *
 * While the service is offline a queued question waits and Stop still works;
 * it is answered when the service returns.
 */

import {
  WORKSPACE_STATUS_REFETCH_MS,
  isWorkspaceOffline,
  useWorkspaceStatus,
  workspaceErrorReason,
  type WorkspaceStatus,
} from '@/lib/queries.workspace';
import { useHydrated } from '@/lib/use-hydrated';
import { readAtMs, useMonotonicNow } from '@/lib/workspace-clock';
import { OFFLINE_LINE, statusProblemLine } from '@/lib/workspace-labels';
import styles from './ServiceStatus.module.css';

/** How long after it was read a status row may still speak: one missed re-read is allowed. */
const STATUS_TRUSTED_FOR_MS = 2 * WORKSPACE_STATUS_REFETCH_MS;

interface Clocks {
  /** The wall clock, for a row without the database's count. */
  now: number;
  /** This page's monotonic clock, for a row with it. */
  monotonicNow: number;
}

/**
 * How long ago the row in hand was read, or null when this page cannot say.
 *
 * A row with the database's count is measured on the page's own clock, from the
 * moment this page read it; a row it did not read itself has no such moment.
 * The render's reading of that clock can be a tick older than the read, hence
 * the floor of 0. A row without the count is measured as before: the wall clock
 * against the time the cache says it was read (`readAtWallMs`).
 */
function sinceRead(status: WorkspaceStatus, readAtWallMs: number, clocks: Clocks): number | null {
  if (status.polled_age_seconds === undefined) return clocks.now - readAtWallMs;
  const readAt = readAtMs(status);
  return readAt === null ? null : Math.max(0, clocks.monotonicNow - readAt);
}

export function ServiceStatus({ now }: { now: number }) {
  const hydrated = useHydrated();
  const status = useWorkspaceStatus();
  const monotonicNow = useMonotonicNow(WORKSPACE_STATUS_REFETCH_MS);

  if (!hydrated) return null;
  if (status.error) {
    return (
      <p className={styles.problem} role="alert">
        {statusProblemLine(workspaceErrorReason(status.error))}
      </p>
    );
  }
  if (status.data === undefined) return null;
  const readAgo = sinceRead(status.data, status.dataUpdatedAt, { now, monotonicNow });
  if (
    readAgo === null ||
    readAgo > STATUS_TRUSTED_FOR_MS ||
    !isWorkspaceOffline(status.data, now, readAgo)
  ) {
    return null;
  }

  return (
    <p className={styles.offline} role="status" data-workspace-offline>
      {OFFLINE_LINE}
    </p>
  );
}

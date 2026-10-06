'use client';

/**
 * The service line (Phase 21, task 16).
 *
 * The Workspace answers only while its runner is up: a container on Stack's
 * laptop that beats `workspace_heartbeat()` every 30 s. The page reads
 * `v_workspace_status` every 30 s and says "The Workspace service is offline."
 * when the heartbeat is null (never polled) or more than 120 s old.
 *
 * THE CLOCK is a prop, read by the screen through `useNow(30_000)`: an idle
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
 * mount or a return to the tab has already sent.
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
} from '@/lib/queries.workspace';
import { useHydrated } from '@/lib/use-hydrated';
import { OFFLINE_LINE, statusProblemLine } from '@/lib/workspace-labels';
import styles from './ServiceStatus.module.css';

/** How long after it was read a status row may still speak: one missed re-read is allowed. */
const STATUS_TRUSTED_FOR_MS = 2 * WORKSPACE_STATUS_REFETCH_MS;

export function ServiceStatus({ now }: { now: number }) {
  const hydrated = useHydrated();
  const status = useWorkspaceStatus();

  if (!hydrated) return null;
  if (status.error) {
    return (
      <p className={styles.problem} role="alert">
        {statusProblemLine(workspaceErrorReason(status.error))}
      </p>
    );
  }
  const readRecently = now - status.dataUpdatedAt <= STATUS_TRUSTED_FOR_MS;
  if (status.data === undefined || !readRecently || !isWorkspaceOffline(status.data, now)) {
    return null;
  }

  return (
    <p className={styles.offline} role="status" data-workspace-offline>
      {OFFLINE_LINE}
    </p>
  );
}

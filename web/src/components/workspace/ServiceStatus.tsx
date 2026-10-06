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
 * While the service is offline a queued question waits and Stop still works;
 * it is answered when the service returns.
 */

import { isWorkspaceOffline, useWorkspaceStatus, workspaceErrorReason } from '@/lib/queries.workspace';
import { useHydrated } from '@/lib/use-hydrated';
import { OFFLINE_LINE, statusProblemLine } from '@/lib/workspace-labels';
import styles from './ServiceStatus.module.css';

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
  if (status.data === undefined || !isWorkspaceOffline(status.data, now)) return null;

  return (
    <p className={styles.offline} role="status" data-workspace-offline>
      {OFFLINE_LINE}
    </p>
  );
}

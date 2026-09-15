'use client';

/**
 * Sync button — the app-to-agent direction (Phase 9).
 *
 * The app cannot crawl Blackboard: every endpoint the crawler uses is
 * authorized by a session cookie obtained through NetID plus a Duo push that
 * only Stack can approve. So "Sync" is a *request*, not an action. It inserts
 * an `agent_requests` row, copies `claude "/bb-sync <id>"` to the clipboard,
 * and then shows that request's state until it is done — the crawl happens in
 * a Claude session with a logged-in Blackboard tab, and the cron folds the
 * result in behind it.
 *
 * The clipboard is best-effort by design: it is denied outside a secure context
 * and in some embedded views, so the command is always shown in the toast as
 * well. A button that silently copies nothing is worse than one that says so.
 *
 * One open request at a time. The tick never touches `kind = 'sync'` rows, so a
 * second press while one is queued or claimed would leave an orphan that nothing
 * ever closes. While a sync request is open (this tab's or any other's), pressing
 * the button re-copies that request's command instead of filing a new row.
 */

import { useEffect, useState } from 'react';
import {
  copyToClipboard,
  syncCommand,
  useAgentRequest,
  useCreateAgentRequest,
  useOpenSyncRequest,
  type AgentRequestState,
} from '@/lib/queries.sync';
import styles from './SyncButton.module.css';

/** How long the "command copied" toast stays up. */
const TOAST_MS = 15000;

/** What the button says while a filed request is still moving. */
const STATE_LABEL: Record<AgentRequestState, string> = {
  queued: 'sync requested',
  claimed: 'syncing…',
  done: 'sync done',
  failed: 'sync failed',
  cancelled: 'sync cancelled',
};

export function SyncButton() {
  const create = useCreateAgentRequest();
  const [requestId, setRequestId] = useState<number | null>(null);
  const [toast, setToast] = useState<{ command: string; copied: boolean } | null>(null);

  const request = useAgentRequest(requestId);
  const open = useOpenSyncRequest();
  const openRequest = open.data ?? null;
  const state = request.data?.state ?? openRequest?.state ?? null;

  // The toast is transient; the request state below the button is not.
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), TOAST_MS);
    return () => window.clearTimeout(timer);
  }, [toast]);

  async function showCommand(id: number) {
    const command = syncCommand(id);
    const copied = await copyToClipboard(command);
    setRequestId(id);
    setToast({ command, copied });
  }

  async function requestSync() {
    if (openRequest) {
      await showCommand(openRequest.id);
      return;
    }
    try {
      const row = await create.mutateAsync({ kind: 'sync', scope: 'all' });
      await showCommand(row.id);
    } catch {
      // The mutation's own error is rendered below; nothing to swallow here.
      setToast(null);
    }
  }

  const busy = create.isPending;
  const label = busy ? 'requesting…' : state ? STATE_LABEL[state] : 'Sync';

  return (
    <span className={styles.wrap}>
      <button
        type="button"
        className={styles.button}
        onClick={() => void requestSync()}
        disabled={busy}
        title="Ask a Claude session to crawl Blackboard"
      >
        <SyncIcon />
        {label}
      </button>

      {create.isError && (
        <span className={styles.toastError} role="alert">
          Could not file the request: {create.error.message}
        </span>
      )}

      {toast && (
        <span className={styles.toast} role="status">
          <span className={styles.toastLine}>
            {toast.copied
              ? 'command copied — run it in Claude Code with a logged-in Blackboard tab'
              : 'copy this and run it in Claude Code with a logged-in Blackboard tab'}
          </span>
          <code className={styles.command}>{toast.command}</code>
        </span>
      )}
    </span>
  );
}

function SyncIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 5V2L8 6l4 4V7c2.76 0 5 2.24 5 5 0 .85-.21 1.65-.6 2.35l1.47 1.47A6.94 6.94 0 0 0 19 12c0-3.87-3.13-7-7-7zm0 12c-2.76 0-5-2.24-5-5 0-.85.21-1.65.6-2.35L6.13 8.18A6.94 6.94 0 0 0 5 12c0 3.87 3.13 7 7 7v3l4-4-4-4v3z" />
    </svg>
  );
}

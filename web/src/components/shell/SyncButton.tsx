'use client';

/**
 * Sync button — the app-to-agent direction (Phase 9), after the Phase 14 cut-over.
 *
 * The app cannot crawl Blackboard: every endpoint the crawler uses is authorized
 * by a session cookie obtained through NetID plus a Duo push that only Stack can
 * approve. So "Sync" is a *request*, not an action. It inserts an
 * `agent_requests` row; since 2026-10-04 the `sync` container's runner, which
 * holds that login, claims the row within about a minute and runs the sync.
 * Nothing is copied and no terminal is named on a press.
 *
 * The label then follows what the runner writes — its claim, the run it opens,
 * the fold, the close — through `syncPhase`. The paste command of the Windows
 * `/bb-sync` skill comes back only as the fallback: a request nothing has claimed
 * after the grace says so, and a second press copies the command and shows it.
 * The clipboard is best-effort by design: it is denied outside a secure context
 * and in some embedded views, so the command is always shown in the toast too.
 *
 * One open request at a time. The tick never touches `kind = 'sync'` rows, so a
 * second press while one is queued or claimed would leave an orphan that nothing
 * ever closes. While a sync request is open (this tab's or any other's), pressing
 * the button re-shows that request's status instead of filing a new row.
 */

import { useEffect, useRef, useState } from 'react';
import {
  copyToClipboard,
  syncCommand,
  useAgentRequest,
  useCreateAgentRequest,
  useOpenSyncRequest,
  type AgentRequest,
} from '@/lib/queries.sync';
import { useSyncRun } from '@/lib/queries.sync-run';
import { useNow } from '@/lib/use-now';
import {
  PHASE_LABEL,
  SYNC_COPY,
  closeAnnouncement,
  isLivePhase,
  isMovingPhase,
  phaseTitle,
  pressAction,
  syncPhase,
  type SyncPhase,
} from '@/lib/sync-request-phase';
import styles from './SyncButton.module.css';

/** How long a toast stays up. */
const TOAST_MS = 15000;

/**
 * How often the clock is re-read while a request is open, so a queued row
 * nothing claims turns to "waiting on the container…" within this of the grace.
 */
const CLOCK_TICK_MS = 5000;

type Toast =
  | { kind: 'note'; text: string }
  | { kind: 'fallback'; command: string; copied: boolean };

/** The request this tab is watching: the one it filed, else the open one anybody filed. */
function watchedRequest(
  filed: AgentRequest | null | undefined,
  open: AgentRequest | null | undefined,
): AgentRequest | null {
  return filed ?? open ?? null;
}

export function SyncButton() {
  const create = useCreateAgentRequest();
  const [requestId, setRequestId] = useState<number | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);

  const filed = useAgentRequest(requestId);
  const open = useOpenSyncRequest();
  const request = watchedRequest(filed.data, open.data);
  const run = useSyncRun(request?.run_id ?? null, request?.state === 'claimed');
  const now = useNow(request ? CLOCK_TICK_MS : null);
  const phase: SyncPhase = syncPhase(request, run.data, now);

  // The toast is transient; the request state in the label is not.
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), TOAST_MS);
    return () => window.clearTimeout(timer);
  }, [toast]);

  // A request this tab saw moving gets one line when it closes. One the page
  // loaded already closed says nothing: that report is Activity's.
  const movingId = useRef<number | null>(null);
  useEffect(() => {
    if (!request) return;
    if (isMovingPhase(phase)) {
      movingId.current = request.id;
      return;
    }
    if ((phase === 'done' || phase === 'failed') && movingId.current === request.id) {
      movingId.current = null;
      setToast({ kind: 'note', text: closeAnnouncement(request) });
    }
  }, [phase, request]);

  async function fileRequest() {
    try {
      const row = await create.mutateAsync({ kind: 'sync', scope: 'all' });
      setRequestId(row.id);
      setToast({ kind: 'note', text: SYNC_COPY.requested });
    } catch {
      // The mutation's own error is rendered below; nothing to swallow here.
      setToast(null);
    }
  }

  async function offerFallback(id: number) {
    const command = syncCommand(id);
    const copied = await copyToClipboard(command);
    setRequestId(id);
    setToast({ kind: 'fallback', command, copied });
  }

  async function press() {
    const action = pressAction(phase);
    if (action === 'file' || request === null) {
      await fileRequest();
      return;
    }
    if (action === 'fallback') {
      await offerFallback(request.id);
      return;
    }
    setRequestId(request.id);
    setToast({ kind: 'note', text: phaseTitle(phase, request, now) });
  }

  const busy = create.isPending;
  const label = busy ? 'requesting…' : PHASE_LABEL[phase];

  return (
    <span className={styles.wrap}>
      <button
        type="button"
        className={styles.button}
        onClick={() => void press()}
        disabled={busy}
        title={phaseTitle(phase, request, now)}
      >
        <SyncIcon />
        {label}
        {isLivePhase(phase) && <span className={styles.live} data-live="" aria-hidden="true" />}
      </button>

      {create.isError && (
        <span className={styles.toastError} role="alert">
          Could not file the request: {create.error.message}
        </span>
      )}

      {toast && (
        <span className={styles.toast} role="status">
          {toast.kind === 'note' ? (
            <span className={styles.toastLine}>{toast.text}</span>
          ) : (
            <>
              <span className={styles.toastLine}>
                {toast.copied ? SYNC_COPY.fallbackCopied : SYNC_COPY.fallbackCopy}
              </span>
              <code className={styles.command}>{toast.command}</code>
            </>
          )}
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

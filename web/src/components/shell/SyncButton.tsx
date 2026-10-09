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
 * the fold, the close — through `syncPhase`, and the arrows circle while the
 * container works. The paste command of the Windows `/bb-sync` skill comes back
 * only as the fallback: a request nothing has claimed after the grace (or one the
 * runner let go) says so, and a second press copies the command and shows it. The
 * clipboard is best-effort by design: it is denied outside a secure context and
 * in some embedded views, so the command is always shown in the toast too.
 *
 * One open request at a time. The tick never touches `kind = 'sync'` rows, so a
 * second press while one is queued or claimed would leave an orphan that nothing
 * ever closes. While a sync request is open (this tab's or any other's), pressing
 * the button re-shows that request's status instead of filing a new row. The tab
 * follows any request it sees open by id, so the row's close is still read (and
 * announced once) after the open lookup stops returning it. A close that left a
 * file unpulled for a reason the next sync will not retry stays up, with the way
 * to the Inbox item that holds the file's Blackboard link, until dismissed.
 */

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import {
  copyToClipboard,
  relativeTime,
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
  RUNNER_CLAIMANT,
  SYNC_COPY,
  closeAnnouncement,
  closePrompt,
  isLivePhase,
  isMovingPhase,
  isOpenState,
  phaseTitle,
  pressAction,
  syncPhase,
  watchedRequest,
  type SyncPhase,
} from '@/lib/sync-request-phase';
import { SyncIcon } from './icons';
import { useExit } from './useExit';
import styles from './SyncButton.module.css';

/** How long a toast with nothing to act on stays up. */
const TOAST_MS = 15000;

/** The clock while the request is queued: the one time-driven edge is queued → unclaimed at the grace. */
const QUEUE_TICK_MS = 5000;

/** The clock once the request has closed: the tooltip's "Sync done N min ago" keeps up. */
const CLOSED_TICK_MS = 60_000;

type Toast =
  | { kind: 'note'; text: string }
  | { kind: 'fallback'; command: string; copied: boolean }
  | { kind: 'close'; text: string; prompt: string | null };

/** A close with a prompt waits for Stack; every other toast goes on its own. */
function staysUp(toast: Toast): boolean {
  return toast.kind === 'close' && toast.prompt !== null;
}

/**
 * How often the clock is re-read for the request shown: while it is queued, once
 * it has closed, and never while the runner or a session holds it (no phase then
 * depends on the time) or nothing is open.
 */
function clockTick(request: AgentRequest | null): number | null {
  if (!request) return null;
  if (request.state === 'queued') return QUEUE_TICK_MS;
  return isOpenState(request.state) ? null : CLOSED_TICK_MS;
}

/** The first read error among the queries still asked, for the alert line. */
function firstError(...errors: readonly (Error | null | undefined)[]): Error | null {
  return errors.find((error): error is Error => error instanceof Error) ?? null;
}

export function SyncButton() {
  const create = useCreateAgentRequest();
  // The request this tab follows by id: the one it filed, or one it saw open.
  const [followedId, setFollowedId] = useState<number | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  // A toast that goes stays for one exit with the words it had (task 29).
  const [toastExit, toastExitRef] = useExit(toast !== null);
  const [lastToast, setLastToast] = useState<Toast | null>(null);
  if (toast !== null && toast !== lastToast) setLastToast(toast);
  const shownToast = toast ?? lastToast;

  const open = useOpenSyncRequest();
  // The tab follows any request it sees open, so the row's close is still read
  // after the open lookup stops returning it. Derived during render, the way the
  // lint config asks for state that follows a query, not copied in an effect.
  const openId = open.data?.id ?? null;
  if (openId !== null && openId !== followedId) setFollowedId(openId);
  const followed = useAgentRequest(followedId);
  const request = watchedRequest(followed.data, open.data);
  // The run row says where the container is; a session's claim never reads it,
  // and a disabled query's cached error is not this request's news.
  const runAsked = request?.state === 'claimed' && request.claimed_by === RUNNER_CLAIMANT;
  const run = useSyncRun(request?.run_id ?? null, runAsked);
  const now = useNow(clockTick(request));
  const phase: SyncPhase = syncPhase(request, run.data, now);
  const ago = (iso: string | null) => relativeTime(iso, new Date(now));
  const title = phaseTitle(phase, request, ago);
  const readError = firstError(followed.error, open.error, runAsked ? run.error : null);

  // A toast with nothing to act on is transient; the request state in the label is not.
  useEffect(() => {
    if (!toast || staysUp(toast)) return;
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
    if (phase !== 'idle' && movingId.current === request.id) {
      movingId.current = null;
      setToast({ kind: 'close', text: closeAnnouncement(request), prompt: closePrompt(request.result) });
    }
  }, [phase, request]);

  async function fileRequest() {
    try {
      const row = await create.mutateAsync({ kind: 'sync', scope: 'all' });
      setFollowedId(row.id);
      setToast({ kind: 'note', text: SYNC_COPY.requested });
    } catch {
      // The mutation's own error is rendered below the button; a prompt already
      // up (a file that needs Stack) stays, since nothing here replaces it.
    }
  }

  async function offerFallback(id: number) {
    const command = syncCommand(id);
    const copied = await copyToClipboard(command);
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
    setToast({ kind: 'note', text: title });
  }

  const busy = create.isPending;
  const label = busy ? 'requesting…' : PHASE_LABEL[phase];
  const alert = create.isError
    ? `Could not file the request: ${create.error.message}`
    : readError
      ? `Could not read the sync's state: ${readError.message}`
      : null;

  return (
    <span className={styles.wrap}>
      <button
        type="button"
        className={styles.button}
        onClick={() => void press()}
        disabled={busy}
        title={title}
        data-testid="sync-button"
        data-live={isLivePhase(phase) ? '' : undefined}
      >
        <SyncIcon />
        {/* The label's own span: icon only at ≤480px, capped with an ellipsis at ≤1023.98px.
            Its title is the full label; the button's own title stays the phase sentence. */}
        <span className={styles.label} title={label}>
          {label}
        </span>
      </button>

      {(alert !== null || toastExit.present) && (
        <span className={styles.stack}>
          {alert !== null && (
            <span className={styles.toastError} role="alert">
              {alert}
            </span>
          )}

          {shownToast && toastExit.present && (
            <span
              ref={toastExitRef}
              className={styles.toast}
              role="status"
              data-leaving={toastExit.leaving ? '' : undefined}
            >
              {shownToast.kind === 'fallback' ? (
                <>
                  <span className={styles.toastLine}>
                    {shownToast.copied ? SYNC_COPY.fallbackCopied : SYNC_COPY.fallbackCopy}
                  </span>
                  <code className={styles.command}>{shownToast.command}</code>
                </>
              ) : (
                <span className={styles.toastLine}>{shownToast.text}</span>
              )}
              {shownToast.kind === 'close' && shownToast.prompt !== null && (
                <>
                  <span className={styles.prompt}>{shownToast.prompt}</span>
                  <span className={styles.toastActions}>
                    <Link className={styles.toastLink} href="/inbox">
                      {SYNC_COPY.openInbox}
                    </Link>
                    <button type="button" className={styles.toastDismiss} onClick={() => setToast(null)}>
                      {SYNC_COPY.dismiss}
                    </button>
                  </span>
                </>
              )}
            </span>
          )}
        </span>
      )}
    </span>
  );
}

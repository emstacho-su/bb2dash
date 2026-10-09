'use client';

/**
 * "Apply answers" — the Inbox's one apply control (090; R3-2), after Phase 23
 * (Inbox auto-apply, DECISIONS 2026-10-07).
 *
 * Answering a row in the Inbox writes four columns and nothing else. Deciding
 * what that answer MEANS — which assignment to edit, whether the syllabus
 * already settles it, how this course records comparable rows — is reading
 * work, and the app cannot do it. So this button is a *request*, exactly like
 * Sync: it inserts an `agent_requests` row of kind `inbox_feedback`, and the
 * `apply` container's worker claims it within about a minute and runs
 * `/inbox-apply`. Nothing is copied on a press.
 *
 * The sync container files the same request by itself after a sync that closed
 * done, when answered items wait (migration 180). So the button also follows a
 * request it did not file: while answers wait it keeps looking for an open one,
 * and it follows any it sees by id so the row's close is still read after the
 * open lookup stops returning it.
 *
 * R3-2: beside the button there is only the request's state, in plain words —
 * who queued it, that it is running, the worker's first report line. The paste
 * command of the `/inbox-apply` skill comes back only as the fallback: a request
 * nothing has claimed after the grace says so, and a second press copies the
 * command and shows it (the clipboard is best-effort, so it is always shown).
 *
 * One open request at a time: the database refuses a second (migration 181), and
 * a press while one is open re-shows its status instead of filing another.
 */

import { useEffect, useState } from 'react';
import {
  copyToClipboard,
  inboxApplyCommand,
  relativeTime,
  useAgentRequest,
  useCreateAgentRequest,
  useInboxQueueCount,
  useOpenInboxApplyRequest,
  useRefreshInboxOnQueueChange,
  useRefreshInboxOnSettled,
} from '@/lib/queries.sync';
import {
  APPLY_COPY,
  APPLY_PHASE_LABEL,
  applyPhase,
  applyPhaseTitle,
  applyPressAction,
  applyStatusLine,
  isMovingApplyPhase,
  isUniqueViolation,
} from '@/lib/inbox-apply-phase';
import { watchedRequest } from '@/lib/sync-request-phase';
import { useNow } from '@/lib/use-now';
import styles from './InboxApplyButton.module.css';

/** The resting label. The count lives in the Inbox footer ("N answered"). */
export const APPLY_LABEL = APPLY_PHASE_LABEL.idle;

/** How long a toast stays up. */
const TOAST_MS = 15000;

/** The clock while the request is queued: the one time-driven edge is queued → unclaimed at the grace. */
const QUEUE_TICK_MS = 5000;

type Toast = { kind: 'note'; text: string } | { kind: 'fallback'; command: string; copied: boolean };

export function InboxApplyButton() {
  const create = useCreateAgentRequest();
  // The request this tab follows by id: the one it filed, or one it saw open.
  const [followedId, setFollowedId] = useState<number | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);

  const queue = useInboxQueueCount();
  const count = queue.data ?? null;
  // A sync files the request without this page, so while answers wait the lookup keeps looking.
  const open = useOpenInboxApplyRequest({ watch: count !== null && count > 0 });
  // Derived during render, the way the lint config asks for state that follows a query.
  const openId = open.data?.id ?? null;
  if (openId !== null && openId !== followedId) setFollowedId(openId);
  const followed = useAgentRequest(followedId);
  const request = watchedRequest(followed.data, open.data);

  const now = useNow(request?.state === 'queued' ? QUEUE_TICK_MS : null);
  const phase = applyPhase(request, now);
  const title = applyPhaseTitle(phase, request, (iso) => relativeTime(iso, new Date(now)));
  const statusLine = applyStatusLine(phase, request);

  // When the worker closes the request it has archived rows and moved the count;
  // the list and the footer refresh on that transition, not on a reload.
  useRefreshInboxOnSettled(request?.state ?? null);
  // A run this page never saw a request for (it opened and closed between two looks, or it was
  // the first of a follow-up chain) still moved the answered count: refresh on that too.
  useRefreshInboxOnQueueChange(count);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), TOAST_MS);
    return () => window.clearTimeout(timer);
  }, [toast]);

  async function fileRequest() {
    try {
      const row = await create.mutateAsync({ kind: 'inbox_feedback', scope: 'all' });
      setFollowedId(row.id);
      setToast({ kind: 'note', text: APPLY_COPY.requested });
    } catch (error) {
      // One is already open (a sync filed it a moment ago): the lookup the
      // mutation refreshes finds it. Any other error is rendered below.
      if (isUniqueViolation(error)) setToast({ kind: 'note', text: APPLY_COPY.alreadyOpen });
    }
  }

  async function offerFallback(id: number) {
    const command = inboxApplyCommand(id);
    const copied = await copyToClipboard(command);
    setToast({ kind: 'fallback', command, copied });
  }

  async function press() {
    const action = applyPressAction(phase);
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
  // Until the open-request lookup has answered, "nothing open" is not known —
  // a click now could file a second request beside one another tab holds.
  const lookingForOpen = open.isPending === true;
  // Known to be empty and nothing moving: there is nothing to ask for.
  const nothingToApply = count === 0 && !isMovingApplyPhase(phase) && !lookingForOpen;
  const label = busy ? 'requesting…' : APPLY_PHASE_LABEL[phase];
  const insertFailed = create.isError && !isUniqueViolation(create.error);

  return (
    <span className={styles.wrap}>
      <button
        type="button"
        className={styles.button}
        onClick={() => void press()}
        disabled={busy || lookingForOpen || nothingToApply}
        aria-busy={busy || lookingForOpen}
        title={title}
      >
        <ApplyIcon />
        {label}
      </button>

      {statusLine !== null && (
        <span className={styles.status} role="status">
          {statusLine}
        </span>
      )}

      {insertFailed && (
        <span className={styles.toastError} role="alert">
          Could not file the request: {messageOf(create.error)}
        </span>
      )}

      {toast && (
        <span className={styles.toast} aria-live="polite">
          {toast.kind === 'fallback' ? (
            <>
              <span className={styles.toastLine}>
                {toast.copied ? APPLY_COPY.fallbackCopied : APPLY_COPY.fallbackCopy}
              </span>
              <code className={styles.command}>{toast.command}</code>
            </>
          ) : (
            <span className={styles.toastLine}>{toast.text}</span>
          )}
        </span>
      )}
    </span>
  );
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function ApplyIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z" />
    </svg>
  );
}

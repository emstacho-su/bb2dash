'use client';

/**
 * "Apply answers" — the Inbox's app-to-agent direction (090).
 *
 * Answering a row in the Inbox writes four columns and nothing else. Deciding
 * what that answer MEANS — which assignment to edit, whether the syllabus
 * already settles it, how this course records comparable rows — is reading
 * work, and the app cannot do it. So this button is a *request*, exactly like
 * Sync: it inserts an `agent_requests` row of kind `inbox_feedback`, copies
 * `claude "/inbox-apply <id>"` to the clipboard, and then shows that request's
 * state until the worker closes it. The worker records a decision on each row
 * and archives it, which is how answered rows leave the queue for good.
 *
 * The clipboard is best-effort by design: it is denied outside a secure context
 * and in some embedded views, so the command is always shown in the toast too.
 *
 * One open request at a time, for the same reason the Sync button has that
 * rule: nothing in the app ever closes an `agent_requests` row, so a second
 * press while one is queued or claimed would leave an orphan. While an
 * `inbox_feedback` request is open (this tab's or any other's), pressing the
 * button re-copies that request's command instead of filing a new row.
 */

import { useEffect, useState } from 'react';
import {
  copyToClipboard,
  inboxApplyCommand,
  useAgentRequest,
  useCreateAgentRequest,
  useInboxQueueCount,
  useOpenInboxApplyRequest,
  useRefreshInboxOnSettled,
  type AgentRequestState,
} from '@/lib/queries.sync';
import styles from './InboxApplyButton.module.css';

/** How long the "command copied" toast stays up. */
const TOAST_MS = 15000;

/** What the button says while a filed request is still moving. */
const STATE_LABEL: Record<AgentRequestState, string> = {
  queued: 'apply requested',
  claimed: 'applying…',
  done: 'answers applied',
  failed: 'apply failed',
  cancelled: 'apply cancelled',
};

/**
 * The resting label. The count comes from `v_inbox_queue`, so it is the number
 * of rows the worker would actually work through — not the number of open
 * questions, which is what the header already says. Until the count has
 * arrived the button claims no number rather than guessing zero.
 */
export function applyLabel(count: number | null): string {
  if (count === null) return 'Apply answers';
  return `Apply ${count} answer${count === 1 ? '' : 's'}`;
}

export function InboxApplyButton() {
  const create = useCreateAgentRequest();
  const [requestId, setRequestId] = useState<number | null>(null);
  const [toast, setToast] = useState<{ command: string; copied: boolean } | null>(null);

  const request = useAgentRequest(requestId);
  const open = useOpenInboxApplyRequest();
  const queue = useInboxQueueCount();

  const openRequest = open.data ?? null;
  const state = request.data?.state ?? openRequest?.state ?? null;
  const count = queue.data ?? null;

  // When the worker closes the request it has archived rows and moved the count;
  // the list and the label refresh on that transition, not on a reload.
  useRefreshInboxOnSettled(request.data?.state ?? null);

  // The toast is transient; the request state below the button is not.
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), TOAST_MS);
    return () => window.clearTimeout(timer);
  }, [toast]);

  async function showCommand(id: number) {
    const command = inboxApplyCommand(id);
    const copied = await copyToClipboard(command);
    setRequestId(id);
    setToast({ command, copied });
  }

  async function requestApply() {
    if (openRequest) {
      await showCommand(openRequest.id);
      return;
    }
    try {
      const row = await create.mutateAsync({ kind: 'inbox_feedback', scope: 'all' });
      await showCommand(row.id);
    } catch {
      // The mutation's own error is rendered below; nothing to swallow here.
      setToast(null);
    }
  }

  const busy = create.isPending;
  // Until the open-request lookup has answered, "nothing open" is not known —
  // a click now could file a second request beside one another tab holds.
  const lookingForOpen = open.isPending === true;
  // Known to be empty and nothing already filed: there is nothing to ask for.
  // An unknown count is not an empty one, so the button stays live until the
  // view has answered.
  const nothingToApply = count === 0 && openRequest === null && !lookingForOpen;
  const label = busy ? 'requesting…' : state ? STATE_LABEL[state] : applyLabel(count);

  return (
    <span className={styles.wrap}>
      <button
        type="button"
        className={styles.button}
        onClick={() => void requestApply()}
        disabled={busy || lookingForOpen || nothingToApply}
        title="Ask a Claude session to apply your Inbox answers"
      >
        <ApplyIcon />
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
              ? 'command copied — run it in Claude Code'
              : 'copy this and run it in Claude Code'}
          </span>
          <code className={styles.command}>{toast.command}</code>
        </span>
      )}
    </span>
  );
}

function ApplyIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z" />
    </svg>
  );
}

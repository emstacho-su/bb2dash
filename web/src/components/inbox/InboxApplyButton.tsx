'use client';

/**
 * "Apply answers" — the Inbox's one apply control (090; R3-2).
 *
 * Answering a row in the Inbox writes four columns and nothing else. Deciding
 * what that answer MEANS — which assignment to edit, whether the syllabus
 * already settles it, how this course records comparable rows — is reading
 * work, and the app cannot do it. So this button is a *request*, exactly like
 * Sync: it inserts an `agent_requests` row of kind `inbox_feedback`, copies
 * `claude "/inbox-apply <id>"` to the clipboard, and then shows that request's
 * state until the worker closes it. The sync also runs `/inbox-apply` as its
 * step 0, so answers are applied without a press too.
 *
 * R3-2: nothing renders under the button but its state, in plain words. The
 * copied command is named in the button's title. Only when the clipboard is
 * denied (outside a secure context, some embedded views) is the command shown
 * beside it, because otherwise there would be no way to run it.
 *
 * One open request at a time, for the same reason the Sync button has that
 * rule: nothing in the app ever closes an `agent_requests` row, so a second
 * press while one is queued or claimed would leave an orphan. While an
 * `inbox_feedback` request is open (this tab's or any other's), pressing the
 * button re-copies that request's command instead of filing a new row.
 */

import { useState } from 'react';
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

/** The resting label. The count lives in the Inbox footer ("N answered"). */
export const APPLY_LABEL = 'Apply answers';

const IDLE_TITLE = 'Ask a Claude session to apply your Inbox answers';

/** What the button says while a filed request is moving: plain words. */
const STATE_LABEL: Record<AgentRequestState, string> = {
  queued: 'queued',
  claimed: 'running',
  done: 'done',
  failed: 'failed',
  cancelled: 'cancelled',
};

export function InboxApplyButton() {
  const create = useCreateAgentRequest();
  const [requestId, setRequestId] = useState<number | null>(null);
  const [command, setCommand] = useState<{ text: string; copied: boolean } | null>(null);

  const request = useAgentRequest(requestId);
  const open = useOpenInboxApplyRequest();
  const queue = useInboxQueueCount();

  const openRequest = open.data ?? null;
  const state = request.data?.state ?? openRequest?.state ?? null;
  const count = queue.data ?? null;

  // When the worker closes the request it has archived rows and moved the count;
  // the list and the footer refresh on that transition, not on a reload.
  useRefreshInboxOnSettled(request.data?.state ?? null);

  async function showCommand(id: number) {
    const text = inboxApplyCommand(id);
    const copied = await copyToClipboard(text);
    setRequestId(id);
    setCommand({ text, copied });
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
      // The mutation keeps its own error, rendered below; nothing is lost here.
      setCommand(null);
    }
  }

  const busy = create.isPending;
  // Until the open-request lookup has answered, "nothing open" is not known —
  // a click now could file a second request beside one another tab holds.
  const lookingForOpen = open.isPending === true;
  // Known to be empty and nothing already filed: there is nothing to ask for.
  const nothingToApply = count === 0 && openRequest === null && !lookingForOpen;
  const label = busy ? 'requesting…' : state ? STATE_LABEL[state] : APPLY_LABEL;
  const title = command?.copied ? `Command copied: ${command.text}` : IDLE_TITLE;

  return (
    <span className={styles.wrap}>
      <button
        type="button"
        className={styles.button}
        onClick={() => void requestApply()}
        disabled={busy || lookingForOpen || nothingToApply}
        title={title}
      >
        <ApplyIcon />
        {label}
      </button>

      {create.isError && (
        <span className={styles.toastError} role="alert">
          Could not file the request: {create.error.message}
        </span>
      )}

      {command && !command.copied && (
        <span className={styles.toast} role="status">
          <span className={styles.toastLine}>copy this and run it in Claude Code</span>
          <code className={styles.command}>{command.text}</code>
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

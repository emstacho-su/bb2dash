'use client';

/**
 * The Workspace screen (Phase 21).
 *
 * TASK 4's SKELETON. This is the route with its live half only: it holds the
 * page's one private Realtime channel and shows the open request's streamed
 * text. The conversation list, the stored messages, the composer and the
 * service line arrive with task 16, once the Realtime spike (task 5) has
 * frozen the transport; the spike reads its text off this page.
 *
 * The selected conversation is route state: `?c=<conversation uuid>`. Anything
 * else is no conversation, and the page holds the lobby channel.
 *
 * HYDRATION. The requests come from a query cache that is restored from
 * localStorage before this boundary hydrates, and the server never has them.
 * So the open request is read only once `useHydrated()` is true; the first
 * client render is the server's.
 *
 * A read that fails is said, in the Inbox's form ("Could not load …"): the
 * stream area would otherwise sit empty with no word of why.
 *
 * The stream area carries what it is doing as data attributes, for a walk or a
 * spec to read: `data-topic` (the channel held), `data-channel` (joining,
 * joined, error), `data-channel-detail` (why, on an error) and
 * `data-request-id` (the open request followed, when there is one).
 */

import { useSearchParams } from 'next/navigation';
import { openRequestOf, parseConversationId, useWorkspaceRequests } from '@/lib/queries.workspace';
import { useHydrated } from '@/lib/use-hydrated';
import { useWorkspaceStream } from '@/lib/use-workspace-stream';
import { LATE_STREAM_LINE } from '@/lib/workspace-labels';
import styles from './Workspace.module.css';

/** The query-string key that names the selected conversation. */
const CONVERSATION_PARAM = 'c';

export function Workspace() {
  const searchParams = useSearchParams();
  const conversationId = parseConversationId(searchParams.get(CONVERSATION_PARAM));
  const hydrated = useHydrated();

  const requests = useWorkspaceRequests(conversationId);
  const openRequest = hydrated ? openRequestOf(requests.data) : null;
  const stream = useWorkspaceStream(conversationId, openRequest?.id ?? null);

  return (
    <section className={styles.workspace} aria-label="Workspace">
      {hydrated && requests.error && (
        <p className={styles.problem} role="alert">
          Could not load this conversation: {requests.error.message}
        </p>
      )}
      <div
        className={styles.stream}
        aria-live="polite"
        data-workspace-stream
        data-topic={stream.topic}
        data-channel={stream.channel}
        data-channel-detail={stream.channelDetail ?? undefined}
        data-request-id={openRequest?.id}
      >
        {stream.late ? (
          <p className={styles.late}>{LATE_STREAM_LINE}</p>
        ) : stream.text === '' ? null : (
          <p className={styles.streamText}>{stream.text}</p>
        )}
      </div>
    </section>
  );
}

'use client';

/**
 * The Workspace screen (Phase 21, task 16; S2-workspace-1).
 *
 * A chat surface over the two stores: the conversation list, the message
 * column, the composer and a service line. The selected conversation is route
 * state, `?c=<conversation uuid>`; anything else is no conversation, the page
 * holds the lobby channel, and the first question creates one.
 *
 * WHERE AN ANSWER COMES FROM. Live, as Realtime Broadcast deltas on the page's
 * one private channel (`use-workspace-stream.ts`), and once more as the stored
 * row `workspace_finish()` writes. The stored row is the record. The page
 * learns that a stream has ended from the `done` broadcast and from a refetch
 * when the tab regains focus; the 5 s interval is only the fallback while the
 * tab is in front, because it does not run in a hidden tab. Whichever of them
 * shows the request closed, the messages are then read once more
 * (`useStoredRowOnClose`): a missed broadcast costs live text, never the answer.
 *
 * WHAT IS SHOWN UNDER A QUESTION comes from its `workspace_requests` row
 * (`components/workspace/thread.ts`). After Stop the stopped sentence shows at
 * once: the request is marked here before the database has answered.
 *
 * TWO PARTS. `Workspace` reads the rows and holds the channel, and stays
 * mounted from one conversation to the next so the old channel is left before
 * the next is joined. `Thread` is keyed by the conversation: what was typed, a
 * refusal and a pressed Stop belong to one conversation and go with it.
 *
 * HYDRATION. The rows come from a query cache that is restored from
 * localStorage before this boundary hydrates, and the server never has them.
 * So they are read only once `useHydrated()` is true; the first client render
 * is the server's.
 *
 * The stream area carries what it is doing as data attributes, for a walk or a
 * spec to read: `data-topic` (the channel held), `data-channel` (joining,
 * joined, error), `data-channel-detail` (why, on an error) and
 * `data-request-id` (the open request, when there is one).
 */

import { useEffect, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import { Composer } from '@/components/workspace/Composer';
import { ConversationList } from '@/components/workspace/ConversationList';
import { MessageList } from '@/components/workspace/MessageList';
import { ServiceStatus } from '@/components/workspace/ServiceStatus';
import { CONVERSATION_PARAM, conversationHref } from '@/components/workspace/route';
import { buildTurns, liveRequestOf, type LiveStream } from '@/components/workspace/thread';
import {
  WORKSPACE_STATUS_REFETCH_MS,
  WorkspaceRefusal,
  isMissingConversation,
  openRequestOf,
  parseConversationId,
  useAskWorkspace,
  useCancelWorkspaceRequest,
  useWorkspaceMessages,
  useWorkspaceRequests,
  workspaceErrorReason,
  workspaceKeys,
  type WorkspaceMessage,
  type WorkspaceRequest,
} from '@/lib/queries.workspace';
import { useHydrated } from '@/lib/use-hydrated';
import { useNow } from '@/lib/use-now';
import { useWorkspaceStream, type WorkspaceStreamView } from '@/lib/use-workspace-stream';
import {
  askProblemLine,
  conversationProblemLine,
  stopProblemLine,
} from '@/lib/workspace-labels';
import styles from './Workspace.module.css';

const NO_REQUESTS: readonly WorkspaceRequest[] = [];
const NO_MESSAGES: readonly WorkspaceMessage[] = [];
const NONE_STOPPED: ReadonlySet<number> = new Set();

/** The key of the thread when no conversation is selected. */
const NO_CONVERSATION_KEY = 'none';

/** What went wrong, one line each. A refused question is not here: it has its own sentence. */
function problemLines(failed: { read: unknown; ask: unknown; stop: unknown }): string[] {
  const lines: string[] = [];
  if (failed.read) lines.push(conversationProblemLine(workspaceErrorReason(failed.read)));
  if (failed.ask && !(failed.ask instanceof WorkspaceRefusal)) {
    const reason = workspaceErrorReason(failed.ask);
    // An id that does not exist (23503) is a conversation that cannot be loaded,
    // not a bad question.
    const missing = isMissingConversation(failed.ask);
    lines.push(missing ? conversationProblemLine(reason) : askProblemLine(reason));
  }
  if (failed.stop) lines.push(stopProblemLine(workspaceErrorReason(failed.stop)));
  // Two failures can say the same line (a read and a question, on an id that does not exist).
  return [...new Set(lines)];
}

/**
 * Stop. The request is marked the moment the button is pressed, so the stopped
 * sentence shows at once; the mark comes off again if the database says the
 * request had already finished (false) or the cancel failed (it is still open).
 */
function useStop(conversationId: string | null) {
  const [stopped, setStopped] = useState<ReadonlySet<number>>(NONE_STOPPED);
  const cancel = useCancelWorkspaceRequest(conversationId);

  function stop(requestId: number) {
    const unmark = () => setStopped((ids) => new Set([...ids].filter((id) => id !== requestId)));
    setStopped((ids) => new Set([...ids, requestId]));
    cancel.mutate(requestId, {
      onSuccess: (changed) => {
        if (!changed) unmark();
      },
      onError: unmark,
    });
  }

  return { stopped, stop, error: cancel.error, pending: cancel.isPending };
}

/** The message column's wrapper: what the channel is doing, as data attributes (see the header). */
function StreamArea(props: {
  stream: WorkspaceStreamView;
  openRequestId: number | undefined;
  children: ReactNode;
}) {
  const { stream } = props;
  return (
    <div
      data-workspace-stream
      data-topic={stream.topic}
      data-channel={stream.channel}
      data-channel-detail={stream.channelDetail ?? undefined}
      data-request-id={props.openRequestId}
    >
      {props.children}
    </div>
  );
}

interface ThreadProps {
  conversationId: string | null;
  requests: readonly WorkspaceRequest[];
  messages: readonly WorkspaceMessage[];
  /** The conversation's open request, as its rows have it. */
  openRequest: WorkspaceRequest | null;
  live: LiveStream | null;
  stream: WorkspaceStreamView;
  /** The conversation could not be read. */
  readError: unknown;
  now: number;
  /** A first question made a conversation: the page moves to it. */
  onCreated: (conversationId: string) => void;
}

function Thread(props: ThreadProps) {
  const { conversationId, requests, messages, live, stream } = props;
  const ask = useAskWorkspace();
  const { stopped, stop, error: stopError, pending: stopping } = useStop(conversationId);

  // Stop was pressed on it: it reads as stopped, and the button as Ask, before the row does.
  const openRequest =
    props.openRequest !== null && !stopped.has(props.openRequest.id) ? props.openRequest : null;
  const turns = buildTurns({ messages, requests, live, stoppedRequestIds: stopped });
  const problems = problemLines({ read: props.readError, ask: ask.error, stop: stopError });

  async function handleAsk(text: string): Promise<boolean> {
    try {
      const result = await ask.mutateAsync({ conversationId, text });
      if (conversationId === null) props.onCreated(result.conversationId);
      return true;
    } catch {
      // Not dropped: the mutation holds the error, and it is said above or under the box.
      return false;
    }
  }

  return (
    <section className={styles.thread}>
      {problems.map((line) => (
        <p key={line} className={styles.problem} role="alert">
          {line}
        </p>
      ))}
      <StreamArea stream={stream} openRequestId={openRequest?.id}>
        <MessageList turns={turns} />
      </StreamArea>
      <Composer
        requestOpen={openRequest !== null}
        busy={ask.isPending || stopping}
        refusal={ask.error instanceof WorkspaceRefusal ? ask.error.message : null}
        onAsk={handleAsk}
        onStop={() => {
          if (openRequest !== null) stop(openRequest.id);
        }}
        onEdit={() => {
          if (ask.isError) ask.reset();
        }}
      />
      <ServiceStatus now={props.now} />
    </section>
  );
}

/**
 * A request that stops being the open one has its stored row: `workspace_finish()`
 * commits the request and the message together. So the messages are read once at
 * that moment, whatever told the page (the `done` broadcast, a poll, a refetch on
 * focus). Without it a missed broadcast could cost the answer, not only the live
 * text: the messages are polled only while a request is open, the two polls keep
 * their own time, and the requests poll can see the close first.
 */
function useStoredRowOnClose(conversationId: string | null, openRequestId: number | null): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (conversationId === null || openRequestId === null) return undefined;
    return () => {
      void queryClient.invalidateQueries({ queryKey: workspaceKeys.messages(conversationId) });
    };
  }, [conversationId, openRequestId, queryClient]);
}

export function Workspace() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const conversationId = parseConversationId(searchParams.get(CONVERSATION_PARAM));
  const hydrated = useHydrated();
  const now = useNow(WORKSPACE_STATUS_REFETCH_MS);

  const requests = useWorkspaceRequests(conversationId);
  const openRequest = hydrated ? openRequestOf(requests.data) : null;
  const messages = useWorkspaceMessages(conversationId, openRequest !== null);
  useStoredRowOnClose(conversationId, openRequest?.id ?? null);
  const requestRows = hydrated ? (requests.data ?? NO_REQUESTS) : NO_REQUESTS;
  const messageRows = hydrated ? (messages.data ?? NO_MESSAGES) : NO_MESSAGES;

  // The newest request is followed until its stored answer has landed.
  const followed = liveRequestOf(requestRows, messageRows);
  const stream = useWorkspaceStream(conversationId, followed?.id ?? null);
  const live =
    followed === null ? null : { requestId: followed.id, text: stream.text, late: stream.late };

  return (
    <div className={styles.workspace}>
      <ConversationList
        selectedId={conversationId}
        now={now}
        onArchivedSelected={() => router.replace(conversationHref(null))}
      />
      <Thread
        key={conversationId ?? NO_CONVERSATION_KEY}
        conversationId={conversationId}
        requests={requestRows}
        messages={messageRows}
        openRequest={openRequest}
        live={live}
        stream={stream}
        readError={hydrated ? (requests.error ?? messages.error) : null}
        now={now}
        onCreated={(id) => router.replace(conversationHref(id))}
      />
    </div>
  );
}

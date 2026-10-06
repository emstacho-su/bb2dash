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
 * WITH NO TURN TO SHOW the column says which of three states it is in (the
 * PM's ruling U1): no conversation selected, rows still being read, or an id
 * that was not found. A conversation that was not found is not asked into, and
 * a 23503 from `workspace_ask` says the same not-found line: the database's own
 * sentence about the foreign key is never shown.
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
import {
  buildTurns,
  emptyColumnOf,
  liveRequestOf,
  type LiveStream,
} from '@/components/workspace/thread';
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

/**
 * What went wrong, one line each, in the reason it came with. Two failures of a
 * question are not here, because each has its own words: a refusal has its
 * sentence under the box, and an id that does not exist (23503) is the column's
 * not-found line. The database's sentence about the foreign key is never shown.
 */
function problemLines(failed: { read: unknown; ask: unknown; stop: unknown }): string[] {
  const { read, ask, stop } = failed;
  const lines: string[] = [];
  if (read) lines.push(conversationProblemLine(workspaceErrorReason(read)));
  if (ask && !(ask instanceof WorkspaceRefusal) && !isMissingConversation(ask)) {
    lines.push(askProblemLine(workspaceErrorReason(ask)));
  }
  if (stop) lines.push(stopProblemLine(workspaceErrorReason(stop)));
  return lines;
}

/**
 * The sentence of a refused question, while its reason holds. "Still answering"
 * is about the conversation, so it goes once the rows show nothing open; the
 * question-length sentence is about the text, and stays until the text changes.
 */
function refusalLine(asked: unknown, openRequest: WorkspaceRequest | null): string | null {
  if (!(asked instanceof WorkspaceRefusal)) return null;
  if (asked.reason === 'still_answering' && openRequest === null) return null;
  return asked.message;
}

/**
 * Stop. The request is marked the moment the button is pressed, so the stopped
 * sentence shows at once; the mark comes off again if the database says the
 * request had already finished (false) or the cancel failed (it is still open).
 *
 * A Stop that failed is reported only while the request it was pressed on is
 * the open one (`openRequest`, as the rows have it): once that request has
 * finished there is nothing left to stop, and the next one never had Stop
 * pressed on it.
 */
function useStop(conversationId: string | null, openRequest: WorkspaceRequest | null) {
  const [stopped, setStopped] = useState<ReadonlySet<number>>(NONE_STOPPED);
  const cancel = useCancelWorkspaceRequest(conversationId);
  const failedOnOpen = openRequest !== null && openRequest.id === cancel.variables;

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

  return {
    stopped,
    stop,
    error: failedOnOpen ? cancel.error : null,
    pending: cancel.isPending,
  };
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

/**
 * Ask a question, and move to the conversation a first question made. `send`
 * answers whether the question was accepted; a failure is not dropped: the
 * mutation holds the error, and it is said above the column, in it, or under
 * the box.
 */
function useQuestionSender(conversationId: string | null, onCreated: (id: string) => void) {
  const ask = useAskWorkspace();

  async function send(text: string): Promise<boolean> {
    try {
      const result = await ask.mutateAsync({ conversationId, text });
      if (conversationId === null) onCreated(result.conversationId);
      return true;
    } catch {
      return false;
    }
  }

  return { ask, send };
}

interface ThreadProps {
  conversationId: string | null;
  requests: readonly WorkspaceRequest[];
  messages: readonly WorkspaceMessage[];
  /** The conversation's open request, as its rows have it. */
  openRequest: WorkspaceRequest | null;
  live: LiveStream | null;
  stream: WorkspaceStreamView;
  /** Both reads of the conversation have answered. */
  loaded: boolean;
  /** The conversation could not be read. */
  readError: unknown;
  now: number;
  /** A first question made a conversation: the page moves to it. */
  onCreated: (conversationId: string) => void;
}

function Thread(props: ThreadProps) {
  const { conversationId, requests, messages, live, stream } = props;
  const { ask, send } = useQuestionSender(conversationId, props.onCreated);
  const stopper = useStop(conversationId, props.openRequest);
  const { stopped, stop } = stopper;

  // Stop was pressed on it: it reads as stopped, and the button as Ask, before the row does.
  const openRequest =
    props.openRequest !== null && !stopped.has(props.openRequest.id) ? props.openRequest : null;
  const turns = buildTurns({ messages, requests, live, stoppedRequestIds: stopped });
  const empty = emptyColumnOf({
    conversationId,
    loaded: props.loaded,
    readFailed: Boolean(props.readError),
    askedIntoMissing: isMissingConversation(ask.error),
    turns: turns.length,
  });
  const problems = problemLines({ read: props.readError, ask: ask.error, stop: stopper.error });

  return (
    <section className={styles.thread}>
      {problems.map((line) => (
        <p key={line} className={styles.problem} role="alert">
          {line}
        </p>
      ))}
      <StreamArea stream={stream} openRequestId={openRequest?.id}>
        <MessageList turns={turns} empty={empty} />
      </StreamArea>
      <Composer
        requestOpen={openRequest !== null}
        busy={ask.isPending || stopper.pending}
        disabled={empty === 'missing'}
        refusal={refusalLine(ask.error, props.openRequest)}
        onAsk={send}
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
  // Until both have answered, an id with no rows is still being read, not "not found".
  const loaded = hydrated && requests.data !== undefined && messages.data !== undefined;

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
        loaded={loaded}
        readError={hydrated ? (requests.error ?? messages.error) : null}
        now={now}
        onCreated={(id) => router.replace(conversationHref(id))}
      />
    </div>
  );
}

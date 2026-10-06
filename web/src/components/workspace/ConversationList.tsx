'use client';

/**
 * The conversation list (Phase 21, task 16).
 *
 * Each row is a link to its conversation (`?c=<uuid>`) with its title and when
 * it was last active, and an "Archive" button. A conversation can be archived,
 * not deleted: v1 has no Delete. The list shows only conversations that are
 * not archived, so archiving one takes it out of the list.
 *
 * "Show archived" is a toggle, off by default. Only when it is on are the
 * archived conversations asked for (their own query, under their own key), and
 * each of their rows reads "Unarchive".
 *
 * The rows come from a cache restored before hydration, so they render only
 * once `useHydrated()` is true; the frame around them is the server's.
 */

import Link from 'next/link';
import { useId, useState } from 'react';
import { relativeTime } from '@/lib/queries.sync';
import {
  useSetConversationArchived,
  useWorkspaceConversations,
  workspaceErrorReason,
  type WorkspaceConversation,
} from '@/lib/queries.workspace';
import { useHydrated } from '@/lib/use-hydrated';
import {
  ARCHIVE_LABEL,
  CONVERSATIONS_HEADING,
  NEW_CONVERSATION_LABEL,
  NO_ARCHIVED_LINE,
  NO_CONVERSATIONS_LINE,
  SHOW_ARCHIVED_LABEL,
  UNARCHIVE_LABEL,
  archiveProblemLine,
  conversationsProblemLine,
} from '@/lib/workspace-labels';
import { conversationHref } from './route';
import styles from './ConversationList.module.css';

/** What every group of rows needs from the list around it. */
interface RowContext {
  selectedId: string | null;
  now: number;
  /** A write is on its way: the buttons wait. */
  busy: boolean;
}

interface RowProps extends RowContext {
  conversation: WorkspaceConversation;
  actionLabel: string;
  onAction: (conversation: WorkspaceConversation) => void;
}

function Row({ conversation, actionLabel, onAction, selectedId, now, busy }: RowProps) {
  const titleId = useId();
  return (
    <li className={styles.row}>
      <Link
        href={conversationHref(conversation.id)}
        className={styles.rowLink}
        aria-current={conversation.id === selectedId ? 'page' : undefined}
      >
        <span id={titleId} className={styles.rowTitle}>
          {conversation.title}
        </span>
        <span className={styles.rowWhen} data-last-activity>
          {relativeTime(conversation.updated_at, new Date(now))}
        </span>
      </Link>
      {/* The button's name is the frozen label; the title says which conversation. */}
      <button
        type="button"
        className={styles.rowAction}
        aria-describedby={titleId}
        disabled={busy}
        onClick={() => onAction(conversation)}
      >
        {actionLabel}
      </button>
    </li>
  );
}

interface RowsProps extends RowContext {
  /** Undefined until the query has answered. */
  conversations: readonly WorkspaceConversation[] | undefined;
  error: unknown;
  emptyLine: string;
  actionLabel: string;
  onAction: (conversation: WorkspaceConversation) => void;
}

function Rows({ conversations, error, emptyLine, actionLabel, onAction, ...context }: RowsProps) {
  if (error) {
    return (
      <p className={styles.problem} role="alert">
        {conversationsProblemLine(workspaceErrorReason(error))}
      </p>
    );
  }
  if (conversations === undefined) return null;
  if (conversations.length === 0) return <p className={styles.empty}>{emptyLine}</p>;
  return (
    <ul className={styles.rows}>
      {conversations.map((conversation) => (
        <Row
          key={conversation.id}
          conversation={conversation}
          actionLabel={actionLabel}
          onAction={onAction}
          {...context}
        />
      ))}
    </ul>
  );
}

/** Mounted only while "Show archived" is on, so the archived rows are read only when asked for. */
function ArchivedRows(props: RowContext & { onUnarchive: (conversation: WorkspaceConversation) => void }) {
  const { onUnarchive, ...context } = props;
  const archived = useWorkspaceConversations(true);
  return (
    <Rows
      conversations={archived.data}
      error={archived.error}
      emptyLine={NO_ARCHIVED_LINE}
      actionLabel={UNARCHIVE_LABEL}
      onAction={onUnarchive}
      {...context}
    />
  );
}

export interface ConversationListProps {
  /** `?c=`, once parsed. */
  selectedId: string | null;
  /** The clock, from the screen's `useNow`, for "last active". */
  now: number;
  /** The selected conversation was archived: it left the list, so the page lets go of it. */
  onArchivedSelected: () => void;
}

/** "Show archived": off by default, and not remembered from one visit to the next. */
function ArchivedToggle({ on, onChange }: { on: boolean; onChange: (on: boolean) => void }) {
  return (
    <label className={styles.toggle}>
      <input type="checkbox" checked={on} onChange={(event) => onChange(event.target.checked)} />
      {SHOW_ARCHIVED_LABEL}
    </label>
  );
}

/** Archive and Unarchive: the one write the list makes. */
function useArchive(selectedId: string | null, onArchivedSelected: () => void) {
  const archive = useSetConversationArchived();

  function setArchived(conversation: WorkspaceConversation, archived: boolean) {
    archive.mutate(
      { conversationId: conversation.id, archived },
      {
        onSuccess: () => {
          if (archived && conversation.id === selectedId) onArchivedSelected();
        },
      },
    );
  }

  return { setArchived, error: archive.error, busy: archive.isPending };
}

export function ConversationList({ selectedId, now, onArchivedSelected }: ConversationListProps) {
  const hydrated = useHydrated();
  const [showArchived, setShowArchived] = useState(false);
  const active = useWorkspaceConversations(false);
  const archive = useArchive(selectedId, onArchivedSelected);
  const context: RowContext = { selectedId, now, busy: archive.busy };
  const { setArchived } = archive;

  return (
    <nav className={styles.list} aria-label={CONVERSATIONS_HEADING}>
      <div className={styles.head}>
        <h2 className={styles.heading}>{CONVERSATIONS_HEADING}</h2>
        <Link href={conversationHref(null)} className={styles.new}>
          {NEW_CONVERSATION_LABEL}
        </Link>
      </div>

      {archive.error && (
        <p className={styles.problem} role="alert">
          {archiveProblemLine(workspaceErrorReason(archive.error))}
        </p>
      )}

      {hydrated && (
        <Rows
          conversations={active.data}
          error={active.error}
          emptyLine={NO_CONVERSATIONS_LINE}
          actionLabel={ARCHIVE_LABEL}
          onAction={(conversation) => setArchived(conversation, true)}
          {...context}
        />
      )}

      <ArchivedToggle on={showArchived} onChange={setShowArchived} />

      {hydrated && showArchived && (
        <ArchivedRows
          onUnarchive={(conversation) => setArchived(conversation, false)}
          {...context}
        />
      )}
    </nav>
  );
}

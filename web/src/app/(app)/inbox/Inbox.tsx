'use client';

/**
 * Inbox — the queue Stack clears (Phase 9, GUI direction D1 section 5a;
 * redesigned in R3-3 after agentic review UIs).
 *
 * `attention_items` is the agent-to-app channel: the transform raises a row for
 * anything it cannot decide, and this screen is the only place those rows get
 * answered. The app owns four columns on the row — `state`, `resolved_at`,
 * `resolution`, `resolution_note` — and nothing else. The mutations and their
 * payloads are unchanged by the redesign; only the layout moved:
 *
 *   * filter tabs with counts: Needs you · Answered, not applied · Archived
 *   * one card per item (`InboxCard`): chips, the question as its title,
 *     Blackboard's value, what bb2dash has and the suggestion side by side,
 *     and the answer controls inline
 *   * a sticky footer: "N answered" and the one Apply answers button (R3-2)
 *   * `j` / `k` move between cards, `Enter` focuses the answer box
 *
 * `InboxView` is exported separately from the data-fetching `Inbox` so the
 * tabs and the per-kind resolve payloads can be tested without a client.
 */

import { useMemo, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { InboxApplyButton } from '@/components/inbox/InboxApplyButton';
import { MARK_CHAR, MarkedLabel } from '@/components/shell/icons';
import { InboxCard } from '@/components/inbox/InboxCard';
import {
  EMPTY_TAB_TEXT,
  INBOX_TABS,
  rowsForTab,
  tabCounts,
  type InboxTab,
} from '@/components/inbox/inbox-tabs';
import { useInboxKeys } from '@/components/inbox/use-inbox-keys';
import {
  candidateIds,
  useResolveChoice,
  useSessionLabels,
  type ChoiceInput,
} from '@/lib/queries.inboxChoice';
import { latestWrite } from '@/components/inbox/inbox-row';
import { UNDO_BLOCKED, useReopenAttentionItem } from '@/lib/queries.inboxReopen';
import shell from '../Shell.module.css';
import styles from './Inbox.module.css';
import {
  freshnessLine,
  useAttentionItems,
  useOpenInboxApplyRequest,
  useResolveAttentionItem,
  useSyncStatus,
  type AttentionItem,
  type AttentionKind,
  type ResolveInput,
  type SyncStatus,
} from '@/lib/queries.sync';

// The row helpers moved beside the card; re-exported so importers are unchanged.
export {
  REOPENED_LINE,
  answerTypeFor,
  failureText,
  reopenedWithin24h,
  sourceHref,
  sourceLinkLabel,
  sourceText,
} from '@/components/inbox/inbox-row';

/* ---------------------------------------------------------------------------
 * Screen (data)
 * ------------------------------------------------------------------------ */

export default function Inbox() {
  const itemsQuery = useAttentionItems();
  const statusQuery = useSyncStatus();
  const resolve = useResolveAttentionItem();
  const choose = useResolveChoice();
  const reopen = useReopenAttentionItem();
  const applying = useOpenInboxApplyRequest();
  const items = useMemo(() => itemsQuery.data ?? [], [itemsQuery.data]);
  const labelIds = useMemo(() => candidateIds(items), [items]);
  const labelsQuery = useSessionLabels(labelIds);

  // A resolve, a choice and an undo are three mutations over the same four
  // columns, and each hook's pending or failed state persists until it runs
  // again. The card that owns the write in flight, or the failure to show, is
  // the one whose write was sent last (`latestWrite`), never a fixed order.
  const pendingId =
    latestWrite<null>([
      resolve.isPending ? { at: resolve.submittedAt, id: resolve.variables?.id ?? null, detail: null } : null,
      choose.isPending ? { at: choose.submittedAt, id: choose.variables?.id ?? null, detail: null } : null,
      reopen.isPending ? { at: reopen.submittedAt, id: reopen.variables ?? null, detail: null } : null,
    ])?.id ?? null;
  const failed = latestWrite<Error>([
    resolve.error ? { at: resolve.submittedAt, id: resolve.variables?.id ?? null, detail: resolve.error } : null,
    choose.error ? { at: choose.submittedAt, id: choose.variables?.id ?? null, detail: choose.error } : null,
    reopen.error ? { at: reopen.submittedAt, id: reopen.variables ?? null, detail: reopen.error } : null,
  ]);
  // While `/inbox-apply` holds the queue (an `inbox_feedback` request is queued or
  // claimed) an undo could land between its read and its write, so Undo waits.
  const undoBlocked = applying.data ? UNDO_BLOCKED : null;

  return (
    <InboxView
      // The button is handed in rather than mounted inside `InboxView`, so the
      // view stays renderable without a query client.
      applyButton={<InboxApplyButton />}
      items={items}
      status={statusQuery.data ?? null}
      loading={itemsQuery.isPending}
      error={itemsQuery.error ?? statusQuery.error ?? null}
      pendingId={pendingId}
      // A failed resolve belongs to the row it was sent from. `resolve.variables`
      // still holds that row's input after the mutation settles, so the error is
      // rendered on the card Stack pressed and nowhere else.
      resolveError={failed?.detail ?? null}
      resolveErrorId={failed?.id ?? null}
      onResolve={(input) => resolve.mutate(input)}
      onChoose={(input) => choose.mutate(input)}
      onReopen={(id) => reopen.mutate(id)}
      undoBlocked={undoBlocked}
      // Labels that failed to load leave the buttons on "loading…" rather than
      // printing ids; the error itself shows on the screen below.
      sessionLabels={labelsQuery.data}
      labelsError={labelsQuery.error ?? null}
    />
  );
}

/* ---------------------------------------------------------------------------
 * Screen (presentation)
 * ------------------------------------------------------------------------ */

export interface InboxViewProps {
  items: readonly AttentionItem[];
  status: SyncStatus | null;
  /** The "Apply answers" request button, mounted by the data component. */
  applyButton?: ReactNode;
  loading?: boolean;
  error?: Error | null;
  pendingId?: number | null;
  /** A failed resolve, shown on the card it came from. */
  resolveError?: Error | null;
  resolveErrorId?: number | null;
  /** The tab the screen opens on. Needs you unless a caller says otherwise. */
  initialTab?: InboxTab;
  onResolve: (input: ResolveInput) => void;
  /** A candidate question's choice (a session, or none of them). */
  onChoose?: (input: ChoiceInput) => void;
  /** Undo: an answered, unapplied row back to open (`queries.inboxReopen.ts`). */
  onReopen?: (id: number) => void;
  /** While the Apply worker holds the queue: the sentence Undo shows instead, disabled. */
  undoBlocked?: string | null;
  /** Session id → its date and topic, for the candidate buttons. */
  sessionLabels?: ReadonlyMap<number, string>;
  /** The session labels could not be read. */
  labelsError?: Error | null;
}

export function InboxView({
  items,
  status,
  applyButton = null,
  loading = false,
  error = null,
  pendingId = null,
  resolveError = null,
  resolveErrorId = null,
  initialTab = 'needs_you',
  onResolve,
  onChoose,
  onReopen,
  undoBlocked = null,
  sessionLabels,
  labelsError = null,
}: InboxViewProps) {
  const [tab, setTab] = useState<InboxTab>(initialTab);
  const listRef = useRef<HTMLDivElement | null>(null);
  useInboxKeys(listRef);

  const counts = useMemo(() => tabCounts(items), [items]);
  const rows = useMemo(() => rowsForTab(items, tab), [items, tab]);
  const panelId = `inbox-panel-${tab}`;

  return (
    <div className={styles.screen}>
      <header className={shell.header}>
        <div className={shell.headerText}>
          <span className={shell.kicker}>What the sync could not decide</span>
          <h1 className={shell.title}>Inbox</h1>
        </div>
        <div className={styles.headerMeta}>
          <span className={styles.headerCount}>
            {loading
              ? 'loading…'
              : `${counts.needs_you} open item${counts.needs_you === 1 ? '' : 's'}`}
          </span>
          <span className={styles.headerFreshness}>{freshnessLine(status)}</span>
          <span className={styles.keysHint}>j / k to move · Enter to answer</span>
        </div>
      </header>

      <div className={styles.tabs} role="tablist" aria-label="Inbox filter">
        {INBOX_TABS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="tab"
            id={`inbox-tab-${entry.id}`}
            aria-selected={tab === entry.id}
            aria-controls={`inbox-panel-${entry.id}`}
            className={styles.tab}
            onClick={() => setTab(entry.id)}
          >
            {entry.label}
            <span className={styles.tabCount}>{loading ? '' : counts[entry.id]}</span>
          </button>
        ))}
      </div>

      {error && (
        <p className={styles.problem} role="alert">
          Could not load the inbox: {error.message}
        </p>
      )}
      {labelsError && (
        <p className={styles.problem} role="alert">
          Could not load the class sessions to choose from: {labelsError.message}
        </p>
      )}

      <div
        ref={listRef}
        id={panelId}
        role="tabpanel"
        aria-labelledby={`inbox-tab-${tab}`}
        className={styles.list}
      >
        {!loading && rows.length === 0 && <p className={styles.empty}>{EMPTY_TAB_TEXT[tab]}</p>}
        {rows.map((item) => (
          <InboxCard
            key={item.id}
            item={item}
            pending={pendingId === item.id}
            failure={resolveErrorId === item.id ? resolveError : null}
            onResolve={onResolve}
            onChoose={onChoose}
            onReopen={onReopen}
            undoBlocked={undoBlocked}
            sessionLabels={sessionLabels}
          />
        ))}
      </div>

      <section className={styles.footer} aria-label="Inbox actions">
        <span className={styles.footerCount}>
          {loading ? 'loading…' : `${counts.answered} answered`}
        </span>
        {applyButton}
      </section>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * The Home row links here; keep one canonical label for the link.
 * ------------------------------------------------------------------------ */

export function InboxLink({ label = `Open inbox ${MARK_CHAR.arrowRight}` }: { label?: string }) {
  return (
    <Link href="/inbox" className={styles.inboxLink}>
      <MarkedLabel label={label} />
    </Link>
  );
}

/** Re-exported so callers do not reach into the query layer for the labels. */
export type { AttentionKind };

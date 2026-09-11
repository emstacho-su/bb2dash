'use client';

/**
 * Inbox — the queue Stack clears (Phase 9, GUI direction D1 section 5a).
 *
 * `attention_items` is the agent-to-app channel: the transform raises a row for
 * anything it cannot decide, and this screen is the only place those rows get
 * answered. The app owns four columns on the row — `state`, `resolved_at`,
 * `resolution`, `resolution_note` — and nothing else. `applied_at` belongs to
 * the transform, so an answered row honestly reads "answered, applies on next
 * sync" until the next run folds it in.
 *
 * Controls per kind, frozen in docs/planning/62_PHASE9_sync_loop.md:
 *   conflict                     Accept Blackboard / Keep mine
 *   stack_must_confirm, missing  a text or date input
 *   deadline, data_gap           Dismiss
 * A free-text "why" note rides along with every one of them.
 *
 * `InboxView` is exported separately from the data-fetching `Inbox` so the
 * grouping and the per-kind resolve payloads can be tested without a client.
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import tokens from '@/styles/tokens.module.css';
import shell from '../Shell.module.css';
import styles from './Inbox.module.css';
import {
  ATTENTION_KIND_HEADING,
  ATTENTION_KIND_LABEL,
  NOTE_MAX_LENGTH,
  freshnessLine,
  groupByKind,
  isAwaitingApply,
  useAttentionItems,
  useResolveAttentionItem,
  useSyncStatus,
  valueText,
  type AttentionItem,
  type AttentionKind,
  type ResolveInput,
  type SyncStatus,
} from '@/lib/queries.sync';

/* ---------------------------------------------------------------------------
 * Pure helpers
 * ------------------------------------------------------------------------ */

/**
 * Which input a `stack_must_confirm` / `missing` row gets. Date-shaped fields
 * (`due_at`, `for_date`, `start_date`, …) get a real date picker so the answer
 * is already 'YYYY-MM-DD' by the time it reaches the boundary parser.
 */
export function answerTypeFor(item: Pick<AttentionItem, 'field'>): 'text' | 'date' {
  const field = item.field ?? '';
  return /(^|_)(date|due|start|end|deadline)($|_)|_at$|_date$/i.test(field) ? 'date' : 'text';
}

/** "assignment · IST.323 quiz-2 · due_at" — where the question came from. */
export function sourceText(item: AttentionItem): string {
  const parts = [item.entity, item.ref, item.field].filter(
    (part): part is string => typeof part === 'string' && part.length > 0,
  );
  if (item.raised_by !== null) parts.push(`run #${item.raised_by}`);
  return parts.length > 0 ? parts.join(' · ') : 'raised by the transform';
}

/* ---------------------------------------------------------------------------
 * Screen (data)
 * ------------------------------------------------------------------------ */

export default function Inbox() {
  const itemsQuery = useAttentionItems();
  const statusQuery = useSyncStatus();
  const resolve = useResolveAttentionItem();

  return (
    <InboxView
      items={itemsQuery.data ?? []}
      status={statusQuery.data ?? null}
      loading={itemsQuery.isPending}
      error={itemsQuery.error ?? statusQuery.error ?? null}
      pendingId={resolve.isPending ? (resolve.variables?.id ?? null) : null}
      onResolve={(input) => resolve.mutate(input)}
    />
  );
}

/* ---------------------------------------------------------------------------
 * Screen (presentation)
 * ------------------------------------------------------------------------ */

export interface InboxViewProps {
  items: readonly AttentionItem[];
  status: SyncStatus | null;
  loading?: boolean;
  error?: Error | null;
  pendingId?: number | null;
  onResolve: (input: ResolveInput) => void;
}

export function InboxView({
  items,
  status,
  loading = false,
  error = null,
  pendingId = null,
  onResolve,
}: InboxViewProps) {
  const [showDismissed, setShowDismissed] = useState(false);

  const { groups, dismissed, openCount } = useMemo(() => {
    const live = items.filter((item) => item.state !== 'dismissed');
    return {
      groups: groupByKind(live),
      dismissed: items.filter((item) => item.state === 'dismissed'),
      openCount: items.filter((item) => item.state === 'open').length,
    };
  }, [items]);

  return (
    <>
      <header className={shell.header}>
        <div className={shell.headerText}>
          <span className={shell.kicker}>What the sync could not decide</span>
          <h1 className={shell.title}>Inbox</h1>
        </div>
        <div className={styles.headerMeta}>
          <span className={styles.headerCount}>
            {loading ? 'loading…' : `${openCount} open item${openCount === 1 ? '' : 's'}`}
          </span>
          <span className={styles.headerFreshness}>{freshnessLine(status)}</span>
        </div>
      </header>

      {error && (
        <p className={styles.problem} role="alert">
          Could not load the inbox: {error.message}
        </p>
      )}

      {!loading && groups.length === 0 && dismissed.length === 0 && (
        <p className={styles.empty}>
          Nothing needs you. The last sync answered every question it could on its own.
        </p>
      )}

      {groups.map((group) => (
        <section key={group.kind} className={styles.group} aria-labelledby={`group-${group.kind}`}>
          <div className={styles.groupHead}>
            <h2 id={`group-${group.kind}`} className={styles.groupTitle}>
              {ATTENTION_KIND_HEADING[group.kind]}
            </h2>
            <span className={tokens.tagNeutral}>{group.items.length}</span>
          </div>
          {group.items.map((item) => (
            <InboxRow
              key={item.id}
              item={item}
              pending={pendingId === item.id}
              onResolve={onResolve}
            />
          ))}
        </section>
      ))}

      {dismissed.length > 0 && (
        <section className={styles.group}>
          <button
            type="button"
            className={styles.dismissedToggle}
            aria-expanded={showDismissed}
            onClick={() => setShowDismissed((open) => !open)}
          >
            {showDismissed ? '▾' : '▸'} dismissed ({dismissed.length})
          </button>
          {showDismissed &&
            dismissed.map((item) => (
              <InboxRow key={item.id} item={item} pending={false} onResolve={onResolve} />
            ))}
        </section>
      )}
    </>
  );
}

/* ---------------------------------------------------------------------------
 * One row
 * ------------------------------------------------------------------------ */

function StateChip({ item }: { item: AttentionItem }) {
  if (item.state === 'open') return null;
  if (isAwaitingApply(item)) {
    return <span className={tokens.tagOutline}>answered, applies on next sync</span>;
  }
  return (
    <span className={tokens.tagNeutral}>
      {item.state === 'dismissed' ? 'dismissed' : 'applied'}
    </span>
  );
}

export function InboxRow({
  item,
  pending,
  onResolve,
}: {
  item: AttentionItem;
  pending: boolean;
  onResolve: (input: ResolveInput) => void;
}) {
  const [note, setNote] = useState('');
  const [answer, setAnswer] = useState('');
  const [problem, setProblem] = useState<string | null>(null);

  const answerType = answerTypeFor(item);
  const done = item.state !== 'open';

  // Narrowed once, here: TypeScript drops a narrowing on `item.kind` the moment
  // it is read inside a click handler's closure, so the kind each control sends
  // is pinned to a const before the JSX rather than re-tested inside it.
  const answerKind =
    item.kind === 'stack_must_confirm' || item.kind === 'missing' ? item.kind : null;
  const dismissKind = item.kind === 'deadline' || item.kind === 'data_gap' ? item.kind : null;

  /** One place where a control's payload is handed up, so failures show inline. */
  function send(input: ResolveInput) {
    try {
      setProblem(null);
      onResolve(input);
    } catch (err) {
      setProblem(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <article className={`${tokens.card} ${styles.row}`} data-kind={item.kind}>
      <div className={styles.rowHead}>
        <span className={tokens.mono}>{item.course_id ?? 'no course'}</span>
        <span className={styles.kindTag}>{ATTENTION_KIND_LABEL[item.kind]}</span>
        <StateChip item={item} />
      </div>

      <p className={styles.question}>{item.question}</p>

      {(item.from_value !== null || item.to_value !== null) && (
        <p className={styles.change}>
          <span className={tokens.kicker}>from</span>
          <span className={styles.value}>{valueText(item.from_value)}</span>
          <span aria-hidden="true">→</span>
          <span className={tokens.kicker}>to</span>
          <span className={styles.value}>{valueText(item.to_value)}</span>
        </p>
      )}

      <p className={styles.meta}>
        <span className={tokens.kicker}>source</span>
        <span>{sourceText(item)}</span>
      </p>

      {item.suggested !== null && item.suggested !== undefined && (
        <p className={styles.meta}>
          <span className={tokens.kicker}>suggested</span>
          <span className={styles.value}>{valueText(item.suggested)}</span>
        </p>
      )}

      {done ? (
        <p className={styles.answered}>
          {item.resolution_note
            ? `“${item.resolution_note}”`
            : 'answered without a note'}
        </p>
      ) : (
        <div className={styles.controls}>
          <label className={styles.noteField}>
            <span className={tokens.kicker}>why (optional)</span>
            <input
              type="text"
              className={tokens.input}
              value={note}
              maxLength={NOTE_MAX_LENGTH}
              aria-label={`Why for item ${item.id}`}
              placeholder="the reason, for future you"
              onChange={(event) => setNote(event.target.value)}
            />
          </label>

          {item.kind === 'conflict' && (
            <div className={styles.buttons}>
              <button
                type="button"
                className={tokens.btnPrimary}
                disabled={pending}
                onClick={() => send({ id: item.id, kind: 'conflict', accept: 'blackboard', note })}
              >
                Accept Blackboard
              </button>
              <button
                type="button"
                className={tokens.btnSecondary}
                disabled={pending}
                onClick={() => send({ id: item.id, kind: 'conflict', accept: 'keep', note })}
              >
                Keep mine
              </button>
            </div>
          )}

          {answerKind && (
            <div className={styles.buttons}>
              <input
                type={answerType}
                className={tokens.input}
                value={answer}
                maxLength={NOTE_MAX_LENGTH}
                aria-label={`Answer for item ${item.id}`}
                onChange={(event) => setAnswer(event.target.value)}
              />
              <button
                type="button"
                className={tokens.btnPrimary}
                disabled={pending || answer.trim().length === 0}
                onClick={() =>
                  send({ id: item.id, kind: answerKind, answer, answerType, note })
                }
              >
                Save
              </button>
            </div>
          )}

          {dismissKind && (
            <div className={styles.buttons}>
              <button
                type="button"
                className={tokens.btnSecondary}
                disabled={pending}
                onClick={() => send({ id: item.id, kind: dismissKind, note })}
              >
                Dismiss
              </button>
            </div>
          )}
        </div>
      )}

      {problem && (
        <p className={styles.problem} role="alert">
          {problem}
        </p>
      )}
    </article>
  );
}

/* ---------------------------------------------------------------------------
 * The Home row links here; keep one canonical label for the link.
 * ------------------------------------------------------------------------ */

export function InboxLink({ label = 'Open inbox →' }: { label?: string }) {
  return (
    <Link href="/inbox" className={tokens.btnGhost} style={{ fontSize: 'var(--text-sm)' }}>
      {label}
    </Link>
  );
}

/** Re-exported so callers do not reach into the query layer for the labels. */
export type { AttentionKind };

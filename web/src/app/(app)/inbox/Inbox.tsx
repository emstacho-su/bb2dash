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
  INBOX_APPLY_HELP,
  NOTE_MAX_LENGTH,
  freshnessLine,
  groupByKind,
  isAwaitingApply,
  outcomeText,
  useAttentionItems,
  useResolveAttentionItem,
  useSyncStatus,
  valueText,
  type AttentionItem,
  type AttentionKind,
  type OutcomeAction,
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

/**
 * What to show Stack when a resolve fails. Supabase hands back a PostgrestError
 * — a plain object with `message`, not an `Error` — so this never assumes an
 * instance, and never renders "undefined" at him.
 */
export function failureText(err: unknown): string {
  if (typeof err === 'string' && err.trim().length > 0) return err;
  if (err !== null && typeof err === 'object') {
    const message = (err as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim().length > 0) return message;
  }
  return 'the database rejected the change';
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
      // A failed resolve belongs to the row it was sent from. `resolve.variables`
      // still holds that row's input after the mutation settles, so the error is
      // rendered under the control Stack pressed and nowhere else.
      resolveError={resolve.error ?? null}
      resolveErrorId={resolve.error ? (resolve.variables?.id ?? null) : null}
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
  /** A failed resolve, shown on the row it came from. */
  resolveError?: Error | null;
  resolveErrorId?: number | null;
  onResolve: (input: ResolveInput) => void;
}

export function InboxView({
  items,
  status,
  loading = false,
  error = null,
  pendingId = null,
  resolveError = null,
  resolveErrorId = null,
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

      {/* I-2: the rule stated once, so it is not only implied row by row. */}
      <p className={styles.applyHelp}>{INBOX_APPLY_HELP}</p>

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
              failure={resolveErrorId === item.id ? resolveError : null}
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
              <InboxRow
                key={item.id}
                item={item}
                pending={false}
                failure={resolveErrorId === item.id ? resolveError : null}
                onResolve={onResolve}
              />
            ))}
        </section>
      )}
    </>
  );
}

/* ---------------------------------------------------------------------------
 * One row
 * ------------------------------------------------------------------------ */

/**
 * I-2: the sentence under a control — what pressing it actually changes, with
 * the real field and the real date, or that nothing is changed at all.
 */
function Outcome({ item, action }: { item: AttentionItem; action: OutcomeAction }) {
  return <p className={styles.outcome}>{outcomeText(item, action)}</p>;
}

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
  failure = null,
  onResolve,
}: {
  item: AttentionItem;
  pending: boolean;
  /** The resolve that failed for this row, if the last one did. */
  failure?: Error | null;
  onResolve: (input: ResolveInput) => void;
}) {
  const [note, setNote] = useState('');
  const [answer, setAnswer] = useState('');

  const answerType = answerTypeFor(item);
  const done = item.state !== 'open';

  // Narrowed once, here: TypeScript drops a narrowing on `item.kind` the moment
  // it is read inside a click handler's closure, so the kind each control sends
  // is pinned to a const before the JSX rather than re-tested inside it.
  const answerKind =
    item.kind === 'stack_must_confirm' || item.kind === 'missing' ? item.kind : null;
  const dismissKind = item.kind === 'deadline' || item.kind === 'data_gap' ? item.kind : null;

  /**
   * One place where a control's payload is handed up. There is no try/catch
   * here on purpose: `onResolve` is `mutate`, which never throws — it hands the
   * failure to the mutation's `error`, which arrives back as `failure` and is
   * rendered below. A catch here would only ever swallow a render-time bug.
   */
  function send(input: ResolveInput) {
    onResolve(input);
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
            <div className={styles.choices}>
              <div className={styles.choice}>
                <button
                  type="button"
                  className={tokens.btnPrimary}
                  disabled={pending}
                  onClick={() => send({ id: item.id, kind: 'conflict', accept: 'blackboard', note })}
                >
                  Accept Blackboard
                </button>
                <Outcome item={item} action="accept_blackboard" />
              </div>
              <div className={styles.choice}>
                <button
                  type="button"
                  className={tokens.btnSecondary}
                  disabled={pending}
                  onClick={() => send({ id: item.id, kind: 'conflict', accept: 'keep', note })}
                >
                  Keep mine
                </button>
                <Outcome item={item} action="keep_mine" />
              </div>
            </div>
          )}

          {answerKind && (
            <div className={styles.choice}>
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
              <Outcome item={item} action="save" />
            </div>
          )}

          {dismissKind && (
            <div className={styles.choice}>
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
              <Outcome item={item} action="dismiss" />
            </div>
          )}
        </div>
      )}

      {failure && (
        <p className={styles.problem} role="alert">
          That answer was not saved: {failureText(failure)}. The controls are still live — try
          again.
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

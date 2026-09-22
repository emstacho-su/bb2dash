'use client';

/**
 * Inbox — the queue Stack clears (Phase 9, GUI direction D1 section 5a).
 *
 * `attention_items` is the agent-to-app channel: the transform raises a row for
 * anything it cannot decide, and this screen is the only place those rows get
 * answered. The app owns four columns on the row — `state`, `resolved_at`,
 * `resolution`, `resolution_note` — and nothing else. `applied_at` belongs to
 * the transform, so an answered row reads "answered, applies on next sync"
 * until the next run folds it in — and "answered · recorded only" (F-4) when
 * the transform will never act on that kind of answer at all.
 *
 * Controls per kind, frozen in docs/planning/sprint-1-hub/briefs/62_PHASE9_sync_loop.md:
 *   conflict                     Accept Blackboard / Keep mine
 *   stack_must_confirm, missing  a text or date input
 *   deadline, data_gap           Dismiss
 * A free-text "why" note rides along with every one of them.
 *
 * `InboxView` is exported separately from the data-fetching `Inbox` so the
 * grouping and the per-kind resolve payloads can be tested without a client.
 */

import { useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { InboxApplyButton } from '@/components/inbox/InboxApplyButton';
import tokens from '@/styles/tokens.module.css';
import shell from '../Shell.module.css';
import styles from './Inbox.module.css';
import {
  ATTENTION_KIND_HEADING,
  ATTENTION_KIND_LABEL,
  INBOX_APPLY_HELP,
  INBOX_APPLY_REQUEST_HELP,
  NOTE_MAX_LENGTH,
  appliesAutomatically,
  decisionLine,
  describeDetails,
  fieldPhrase,
  fieldValueText,
  freshnessLine,
  groupByKind,
  isAssignmentRef,
  keyPhrase,
  outcomeText,
  relativeTime,
  useAttentionItems,
  useResolveAttentionItem,
  useSyncStatus,
  type AttentionItem,
  type AttentionKind,
  type OutcomeAction,
  type ResolveInput,
  type SyncStatus,
} from '@/lib/queries.sync';
import { courseCodeFromId } from '@/lib/queries.today';
import { itemQuery } from '@/lib/queries.popout';

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

/**
 * I-3 / P-inbox-3 — where the question came from, in words.
 *
 * This used to be `entity · ref · field · run #42`: four database values with
 * separators between them. The thing it is describing — "the ECN 304 quiz-01
 * assignment, about its due date" — was there all along, spelled as column
 * names.
 *
 * The prefixed pseudo-refs each get their own phrase, because "column:_3569973_1"
 * and "course_field:academic_advisor" are different KINDS of question and the
 * difference is the first thing worth knowing about the row.
 */
export function sourceText(item: AttentionItem): string {
  const course = item.course_id ? courseCodeFromId(item.course_id) : null;
  const inCourse = course ? ` in ${course}` : '';
  let where: string;

  if (item.entity === 'assignment' && isAssignmentRef(item.ref)) {
    const slug = (item.ref as string).split('/').pop();
    where = `the assignment “${slug}”${inCourse}`;
  } else if (item.ref?.startsWith('column:')) {
    where = `the gradebook column ${item.ref.slice('column:'.length)}${inCourse}`;
  } else if (item.ref?.startsWith('course_field:')) {
    where = `the course record${inCourse}, field “${keyPhrase(
      item.ref.slice('course_field:'.length),
    )}”`;
  } else if (item.ref?.startsWith('map_gap:')) {
    where = `a gap in the course map${inCourse}`;
  } else if (item.ref?.startsWith('staff:')) {
    where = `the staff list${inCourse}`;
  } else if (item.entity === 'bb_file') {
    where = `a Blackboard file${inCourse}`;
  } else if (item.entity === 'reading') {
    where = `reading ${item.ref ?? '—'}${inCourse}`;
  } else if (item.entity === 'course') {
    where = `the course record${inCourse}`;
  } else if (item.entity) {
    where = `${item.entity} ${item.ref ?? ''}`.trim() + inCourse;
  } else {
    where = `the sync${inCourse}`;
  }

  const about = item.field ? `, about its ${fieldPhrase(item.field)}` : '';
  const run =
    item.raised_by !== null ? `sync run #${item.raised_by}` : 'the transform';
  return `From ${where}${about}. Raised by ${run}.`;
}

/**
 * The thing the question is about, if this app has a page for it.
 *
 * An assignment opens its own popout (`?item=`), which the (app) layout mounts
 * on every route including this one. Anything else that names a course falls
 * back to that course. A pseudo-ref points at no row bb2dash can show, so it
 * gets no link rather than a broken one.
 */
export function sourceHref(item: AttentionItem): string | null {
  if (item.entity === 'assignment' && isAssignmentRef(item.ref)) {
    return itemQuery({ kind: 'assignment', id: item.ref as string });
  }
  if (item.course_id) return `/course/${encodeURIComponent(item.course_id)}`;
  return null;
}

/** What that link should say it opens. */
export function sourceLinkLabel(item: AttentionItem): string {
  if (item.entity === 'assignment' && isAssignmentRef(item.ref)) {
    return 'Open the assignment →';
  }
  return `Open ${item.course_id ? courseCodeFromId(item.course_id) : 'the course'} →`;
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
      // The button is handed in rather than mounted inside `InboxView`, so the
      // view stays renderable without a query client — which is the whole
      // reason the two are separate files' worth of component.
      applyButton={<InboxApplyButton />}
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
  /** The "Apply answers" request button, mounted by the data component. */
  applyButton?: ReactNode;
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
  applyButton = null,
  loading = false,
  error = null,
  pendingId = null,
  resolveError = null,
  resolveErrorId = null,
  onResolve,
}: InboxViewProps) {
  const [showDismissed, setShowDismissed] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  /**
   * Three lists, not two. `archived` (090) is a row `/inbox-apply` has already
   * acted on and written a decision for: it is finished work, so it belongs
   * neither in the live queue nor among the rows Stack waved away. It stays
   * reachable because the decision line is the only place the worker's
   * reasoning shows up in the app at all.
   */
  const { groups, dismissed, archived, openCount } = useMemo(() => {
    const live = items.filter(
      (item) => item.state !== 'dismissed' && item.state !== 'archived',
    );
    return {
      groups: groupByKind(live),
      dismissed: items.filter((item) => item.state === 'dismissed'),
      archived: items.filter((item) => item.state === 'archived'),
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
        {applyButton}
        <div className={styles.headerMeta}>
          <span className={styles.headerCount}>
            {loading ? 'loading…' : `${openCount} open item${openCount === 1 ? '' : 's'}`}
          </span>
          <span className={styles.headerFreshness}>{freshnessLine(status)}</span>
        </div>
      </header>

      {/* I-2: the rules stated once, so they are not only implied row by row —
          what the transform applies, and who applies everything else. */}
      <div className={styles.help}>
        <p className={styles.applyHelp}>{INBOX_APPLY_HELP}</p>
        <p className={styles.applyHelp}>{INBOX_APPLY_REQUEST_HELP}</p>
      </div>

      {error && (
        <p className={styles.problem} role="alert">
          Could not load the inbox: {error.message}
        </p>
      )}

      {/* Archived rows are finished work and never leave, so they do not keep this sentence away. */}
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

      {archived.length > 0 && (
        <section className={styles.group}>
          <button
            type="button"
            className={styles.dismissedToggle}
            aria-expanded={showArchived}
            onClick={() => setShowArchived((open) => !open)}
          >
            {showArchived ? '▾' : '▸'} archived ({archived.length})
          </button>
          {showArchived &&
            archived.map((item) => (
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

/**
 * What an answered row says about itself.
 *
 * F-4: "applies on next sync" is a promise, and it used to be made to every
 * answered row — including the kinds `apply_resolutions()` skips, which will
 * carry that chip for the rest of the term without anything ever happening.
 * `appliesAutomatically()` is the same predicate the sentence under each button
 * uses, so the two halves of a row can never disagree.
 */
function StateChip({ item }: { item: AttentionItem }) {
  if (item.state === 'open') return null;
  // 090: the worker has been through this one and written down what it did.
  // That outranks the other chips — none of them is true of it any more.
  if (item.state === 'archived') return <span className={tokens.tagNeutral}>archived</span>;
  if (item.state === 'dismissed') return <span className={tokens.tagNeutral}>dismissed</span>;
  if (item.applied_at !== null) return <span className={tokens.tagNeutral}>applied</span>;
  if (!appliesAutomatically(item)) {
    return <span className={tokens.tagNeutral}>answered · recorded only</span>;
  }
  return <span className={tokens.tagOutline}>answered, applies on next sync</span>;
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
  const href = sourceHref(item);
  /** What `/inbox-apply` recorded, as one line — never the jsonb it came from. */
  const decision = decisionLine(item);
  /** What the stage knew when it raised this — as words, never as jsonb. */
  const details = describeDetails(item.suggested);

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
      {/* I-3: course, kind, age. The age is the thing that says whether this
          is today's question or one that has been sitting here for a fortnight. */}
      <div className={styles.rowHead}>
        <span className={tokens.mono}>
          {item.course_id ? courseCodeFromId(item.course_id) : 'no course'}
        </span>
        <span className={styles.kindTag}>{ATTENTION_KIND_LABEL[item.kind]}</span>
        <span className={styles.age} title={item.raised_at}>
          {relativeTime(item.raised_at)}
        </span>
        <StateChip item={item} />
      </div>

      <p className={styles.question}>{item.question}</p>

      {(item.from_value !== null || item.to_value !== null) && (
        <p className={styles.change}>
          <span className={tokens.kicker}>{fieldPhrase(item.field)}</span>
          <span className={styles.value}>{fieldValueText(item.field, item.from_value)}</span>
          <span aria-hidden="true">→</span>
          <span className={styles.value}>{fieldValueText(item.field, item.to_value)}</span>
        </p>
      )}

      <p className={styles.meta}>
        <span>{sourceText(item)}</span>
        {href && (
          <Link className={styles.sourceLink} href={href} scroll={false}>
            {sourceLinkLabel(item)}
          </Link>
        )}
      </p>

      {details.length > 0 && (
        <dl className={styles.details}>
          {details.map((detail) => (
            <div key={detail.label || detail.text} className={styles.detail}>
              {detail.label && <dt className={tokens.kicker}>{detail.label}</dt>}
              <dd className={styles.value}>{detail.text}</dd>
            </div>
          ))}
        </dl>
      )}

      {done ? (
        <>
          <p className={styles.answered}>
            {item.resolution_note
              ? `“${item.resolution_note}”`
              : 'answered without a note'}
          </p>
          {decision && <p className={styles.decision}>{decision}</p>}
        </>
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

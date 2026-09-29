'use client';

/**
 * One Inbox item as a review card (R3-3), in the manner of a PR review thread:
 * context chips, the question as the title, Blackboard's value, what bb2dash
 * has and the stage's suggestion side by side, and the answer controls inline.
 *
 * The controls and their payloads are the ones frozen in
 * docs/planning/sprint-1-hub/briefs/62_PHASE9_sync_loop.md — only the layout
 * changed:
 *   conflict                     Accept Blackboard / Keep mine
 *   stack_must_confirm, missing  an answer (a date picker for a date field)
 *   data_gap                     an answer, or Dismiss
 *   deadline                     Dismiss
 * A free-text "why" note rides along with every one of them, and every control
 * carries the sentence saying what pressing it changes (I-2).
 */

import { useId, useState, type ChangeEvent } from 'react';
import Link from 'next/link';
import tokens from '@/styles/tokens.module.css';
import {
  ATTENTION_KIND_LABEL,
  GAP_ANSWER_OUTCOME,
  NOTE_MAX_LENGTH,
  appliesAutomatically,
  decisionLine,
  describeDetails,
  fieldPhrase,
  fieldValueText,
  outcomeText,
  relativeTime,
  type AttentionItem,
  type OutcomeAction,
  type ResolveInput,
} from '@/lib/queries.sync';
import { courseCodeFromId } from '@/lib/queries.today';
import {
  REOPENED_LINE,
  answerTypeFor,
  failureText,
  reopenedWithin24h,
  sourceChip,
  sourceHref,
  sourceLinkLabel,
  sourceText,
  suggestedDetails,
} from './inbox-row';
import styles from './InboxCard.module.css';

/** I-2: the sentence under a control — what pressing it actually changes. */
function Outcome({ item, action }: { item: AttentionItem; action: OutcomeAction }) {
  return <p className={styles.outcome}>{outcomeText(item, action)}</p>;
}

/**
 * What an answered row says about itself. F-4: the chip reads the same
 * predicate the sentences under the buttons read, so the two never disagree.
 */
function StateChip({ item }: { item: AttentionItem }) {
  if (item.state === 'open') return null;
  if (item.state === 'archived') return <span className={tokens.tagNeutral}>archived</span>;
  if (item.state === 'dismissed') return <span className={tokens.tagNeutral}>dismissed</span>;
  if (item.applied_at !== null) return <span className={tokens.tagNeutral}>applied</span>;
  if (!appliesAutomatically(item)) {
    return <span className={tokens.tagNeutral}>answered · recorded only</span>;
  }
  return <span className={tokens.tagOutline}>answered, applies on next sync</span>;
}

/** Grow a text box to fit what is typed in it. */
function fitHeight(box: HTMLTextAreaElement) {
  box.style.height = 'auto';
  box.style.height = `${box.scrollHeight}px`;
}

export interface InboxCardProps {
  item: AttentionItem;
  pending: boolean;
  /** The resolve that failed for this row, if the last one did. */
  failure?: Error | null;
  onResolve: (input: ResolveInput) => void;
}

export function InboxCard({ item, pending, failure = null, onResolve }: InboxCardProps) {
  const titleId = useId();
  const answerId = useId();
  const [note, setNote] = useState('');
  const [answer, setAnswer] = useState('');

  const answerType = answerTypeFor(item);
  const done = item.state !== 'open';
  const href = sourceHref(item);
  const decision = decisionLine(item);
  const details = describeDetails(suggestedDetails(item));
  const reopened = reopenedWithin24h(item);
  const hasValues = item.from_value !== null || item.to_value !== null;

  // Narrowed once, here: TypeScript drops a narrowing on `item.kind` inside a
  // click handler's closure, so each control's kind is pinned to a const.
  const answerKind =
    item.kind === 'stack_must_confirm' || item.kind === 'missing' || item.kind === 'data_gap'
      ? item.kind
      : null;
  const dismissKind = item.kind === 'deadline' || item.kind === 'data_gap' ? item.kind : null;
  const answerAction: OutcomeAction = item.kind === 'data_gap' ? 'save_gap' : 'save';

  function onAnswer(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    setAnswer(event.target.value);
    if (event.target instanceof HTMLTextAreaElement) fitHeight(event.target);
  }

  return (
    <article
      className={`${tokens.card} ${styles.card}`}
      data-kind={item.kind}
      data-inbox-card=""
      tabIndex={0}
      aria-labelledby={titleId}
    >
      <div className={styles.chips}>
        <span className={`${tokens.mono} ${styles.chip}`}>
          {item.course_id ? courseCodeFromId(item.course_id) : 'no course'}
        </span>
        <span className={`${styles.chip} ${styles.kindChip}`}>{ATTENTION_KIND_LABEL[item.kind]}</span>
        <span className={styles.chip}>{sourceChip(item)}</span>
        <span className={`${styles.chip} ${styles.age}`} title={item.raised_at}>
          {relativeTime(item.raised_at)}
        </span>
        <StateChip item={item} />
      </div>

      <h3 id={titleId} className={styles.title}>
        {item.question}
      </h3>

      {reopened && <p className={styles.reopened}>{REOPENED_LINE}</p>}

      {(hasValues || details.length > 0) && (
        <div className={styles.compare}>
          {hasValues && <span className={`${tokens.kicker} ${styles.field}`}>{fieldPhrase(item.field)}</span>}
          <div className={styles.panes}>
            {hasValues && (
              <>
                <div role="group" aria-label="Blackboard" className={styles.pane}>
                  <span className={tokens.kicker}>Blackboard</span>
                  <span className={styles.value}>{fieldValueText(item.field, item.to_value)}</span>
                </div>
                <div role="group" aria-label="bb2dash has" className={styles.pane}>
                  <span className={tokens.kicker}>bb2dash has</span>
                  <span className={styles.value}>{fieldValueText(item.field, item.from_value)}</span>
                </div>
              </>
            )}
            {details.length > 0 && (
              <div role="group" aria-label="Suggestion" className={styles.pane}>
                <span className={tokens.kicker}>Suggestion</span>
                <dl className={styles.details}>
                  {details.map((detail) => (
                    <div key={detail.label || detail.text} className={styles.detail}>
                      {detail.label && <dt className={styles.detailLabel}>{detail.label}</dt>}
                      <dd className={styles.value}>{detail.text}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}
          </div>
        </div>
      )}

      <p className={styles.meta}>
        <span>{sourceText(item)}</span>
        {href && (
          <Link className={styles.sourceLink} href={href} scroll={false}>
            {sourceLinkLabel(item)}
          </Link>
        )}
      </p>

      {done ? (
        <>
          <p className={styles.answered}>
            {item.resolution_note ? `“${item.resolution_note}”` : 'answered without a note'}
          </p>
          {item.kind === 'data_gap' && item.state === 'resolved' && (
            <p className={styles.outcome}>{GAP_ANSWER_OUTCOME}</p>
          )}
          {decision && <p className={styles.decision}>{decision}</p>}
        </>
      ) : (
        <div className={styles.controls}>
          {answerKind && (
            <label className={styles.answerField} htmlFor={answerId}>
              <span className={tokens.kicker}>Answer</span>
              {answerType === 'date' ? (
                <input
                  id={answerId}
                  type="date"
                  className={tokens.input}
                  value={answer}
                  data-answer-box=""
                  aria-label={`Answer for item ${item.id}`}
                  onChange={onAnswer}
                />
              ) : (
                <textarea
                  id={answerId}
                  rows={1}
                  className={`${tokens.input} ${styles.answerBox}`}
                  value={answer}
                  maxLength={NOTE_MAX_LENGTH}
                  data-answer-box=""
                  aria-label={`Answer for item ${item.id}`}
                  placeholder={
                    item.kind === 'data_gap' ? 'what should happen about this' : 'your answer'
                  }
                  onChange={onAnswer}
                />
              )}
            </label>
          )}

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

          <div className={styles.choices}>
            {item.kind === 'conflict' && (
              <>
                <div className={styles.choice}>
                  <button
                    type="button"
                    className={tokens.btnPrimary}
                    disabled={pending}
                    onClick={() => onResolve({ id: item.id, kind: 'conflict', accept: 'blackboard', note })}
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
                    onClick={() => onResolve({ id: item.id, kind: 'conflict', accept: 'keep', note })}
                  >
                    Keep mine
                  </button>
                  <Outcome item={item} action="keep_mine" />
                </div>
              </>
            )}

            {answerKind && (
              <div className={styles.choice}>
                <button
                  type="button"
                  className={tokens.btnPrimary}
                  disabled={pending || answer.trim().length === 0}
                  onClick={() => onResolve({ id: item.id, kind: answerKind, answer, answerType, note })}
                >
                  Save
                </button>
                <Outcome item={item} action={answerAction} />
              </div>
            )}

            {dismissKind && (
              <div className={styles.choice}>
                <button
                  type="button"
                  className={tokens.btnSecondary}
                  // A gap offers Save and Dismiss together, and Dismiss sends no
                  // answer: while something is typed, Save is the only way out,
                  // so a typed answer is never discarded silently.
                  disabled={pending || (item.kind === 'data_gap' && answer.trim().length > 0)}
                  onClick={() => onResolve({ id: item.id, kind: dismissKind, note })}
                >
                  Dismiss
                </button>
                <Outcome item={item} action="dismiss" />
              </div>
            )}
          </div>
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

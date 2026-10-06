'use client';

/**
 * The message column (Phase 21, task 16).
 *
 * One turn per question: the question, then what is known of its answer. The
 * turns come from `buildTurns()` in `thread.ts`, which decides the state, the
 * text and the line; this file only lays them out.
 *
 * AN ANSWER IS PLAIN TEXT. Stored content and streamed text are React text
 * nodes in a `white-space: pre-wrap` paragraph: line breaks are kept, nothing
 * is parsed, and `<script>` in an answer is the eight characters it is typed
 * with (brief 102, O-5: no Markdown in v1). There is no raw-HTML sink here.
 *
 * NEVER SHOWN: a tool's result (it is never stored), the stored `query` of a
 * tool call, and the cost estimate (the query layer does not even read it).
 *
 * WITH NO TURN TO SHOW the column is not an empty box: it says which of three
 * states it is in (`emptyColumnOf()` in `thread.ts` decides; the PM's ruling
 * U1). The not-found line is an alert and has the "New conversation" link
 * beside it, the way back to an empty composer.
 *
 * Each turn carries what it is as data attributes, for a walk or a spec:
 * `data-turn` (queued, streaming, done, failed, stopped) and
 * `data-request-id`; inside it `data-tier`, `data-answer-text`, `data-used`
 * and `data-turn-line`. The empty column carries `data-column-empty` (start,
 * loading, missing).
 */

import Link from 'next/link';
import { useEffect, useRef } from 'react';
import {
  ANSWER_ROLE_LABEL,
  COLUMN_LOADING_LINE,
  COLUMN_NOT_FOUND_LINE,
  COLUMN_START_LINE,
  MESSAGES_REGION_LABEL,
  NEW_CONVERSATION_LABEL,
  QUESTION_ROLE_LABEL,
  STATUS_ROLE_LABEL,
} from '@/lib/workspace-labels';
import { TierBadge } from './TierBadge';
import { conversationHref } from './route';
import { usedLine, type EmptyColumn, type WorkspaceTurn } from './thread';
import styles from './MessageList.module.css';

/** How close to its end, in pixels, the column must be scrolled to keep following an answer. */
const FOLLOW_SLACK_PX = 96;

/** The one line of each empty state. */
const EMPTY_LINES: Readonly<Record<EmptyColumn, string>> = {
  start: COLUMN_START_LINE,
  loading: COLUMN_LOADING_LINE,
  missing: COLUMN_NOT_FOUND_LINE,
};

/** What grows as an answer is written: the turns, and the last one's text and line. */
function growthOf(turns: readonly WorkspaceTurn[]): string {
  const last = turns.at(-1);
  return `${turns.length}:${last?.text.length ?? 0}:${last?.line ?? ''}`;
}

function Answer({ turn }: { turn: WorkspaceTurn }) {
  const tier = turn.answer?.tier ?? null;
  const used = usedLine(turn.answer?.tool_calls ?? []);
  if (tier === null && turn.text === '' && used === null && turn.line === null) return null;
  // A line with no text beside it is a status, not an answer: a screen reader is not
  // told "The assistant answered" before "Waiting for the Workspace service".
  const statusOnly = turn.text === '' && turn.line !== null;

  return (
    <div className={styles.answer}>
      <span className="sr-only">{statusOnly ? STATUS_ROLE_LABEL : ANSWER_ROLE_LABEL}</span>
      {tier !== null && <TierBadge tier={tier} />}
      {turn.text !== '' && (
        <p className={styles.text} data-answer-text>
          {turn.text}
        </p>
      )}
      {used !== null && (
        <p className={styles.used} data-used>
          {used}
        </p>
      )}
      {turn.line !== null && (
        <p className={styles.line} data-turn-line>
          {turn.line}
        </p>
      )}
    </div>
  );
}

function Turns({ turns }: { turns: readonly WorkspaceTurn[] }) {
  return (
    <ol className={styles.turns} aria-label={MESSAGES_REGION_LABEL}>
      {turns.map((turn) => (
        <li
          key={turn.key}
          className={styles.turn}
          data-turn={turn.state ?? ''}
          data-request-id={turn.request?.id}
        >
          {turn.question !== null && (
            <div className={styles.question}>
              <span className="sr-only">{QUESTION_ROLE_LABEL}</span>
              <p className={styles.text}>{turn.question.content}</p>
            </div>
          )}
          <Answer turn={turn} />
        </li>
      ))}
    </ol>
  );
}

/** The column with no turn to show: its one line, and for an id that was not found the way out. */
function EmptyLine({ state }: { state: EmptyColumn }) {
  const missing = state === 'missing';
  return (
    <div className={styles.empty} data-column-empty={state}>
      <p className={styles.line} role={missing ? 'alert' : undefined}>
        {EMPTY_LINES[state]}
      </p>
      {missing && (
        <Link href={conversationHref(null)} className={styles.emptyLink}>
          {NEW_CONVERSATION_LABEL}
        </Link>
      )}
    </div>
  );
}

export interface MessageListProps {
  turns: readonly WorkspaceTurn[];
  /** The state the column says it is in, in place of its turns; null shows the turns. */
  empty: EmptyColumn | null;
}

export function MessageList({ turns, empty }: MessageListProps) {
  const box = useRef<HTMLDivElement>(null);
  /** Whether the reader is at the end of the column. Scrolling up lets go of it. */
  const following = useRef(true);
  const growth = growthOf(turns);

  useEffect(() => {
    const element = box.current;
    if (element !== null && following.current) element.scrollTop = element.scrollHeight;
  }, [growth]);

  function noteScroll() {
    const element = box.current;
    if (element === null) return;
    const fromEnd = element.scrollHeight - element.scrollTop - element.clientHeight;
    following.current = fromEnd <= FOLLOW_SLACK_PX;
  }

  return (
    <div ref={box} className={styles.column} onScroll={noteScroll}>
      {empty === null ? <Turns turns={turns} /> : <EmptyLine state={empty} />}
    </div>
  );
}

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

/** The content height before the column has been looked at: no real height is negative. */
const NOT_MEASURED = -1;

/** The one line of each empty state. */
const EMPTY_LINES: Readonly<Record<EmptyColumn, string>> = {
  start: COLUMN_START_LINE,
  loading: COLUMN_LOADING_LINE,
  missing: COLUMN_NOT_FOUND_LINE,
};

/**
 * Keeps the end of the column in view while the reader is at it.
 *
 * WHAT IS FOLLOWED is the height of the column's content, read after every
 * commit, and not a list of the things that can make it taller. The list was
 * the fault (the PM's walk of 2026-10-07, W-2): it held the turn count, the
 * last text's length and the line under it. The "Used:" line and the tier
 * badge arrive with a row and change no character of the text, so they moved
 * nothing, and a long answer ended with its "Used:" line under the visible
 * part of the column.
 *
 * WHO IS FOLLOWING is as it was: a reader within `FOLLOW_SLACK_PX` of the end
 * at their last scroll. Scrolling up lets go of it, and a commit that leaves
 * the height as it was moves no one.
 *
 * ASKING BRINGS THE READER BACK (the third review's R3-5; the PM's ruling of
 * 2026-10-07). `ownQuestion` is the id of the question this page sent, once it
 * is a turn of the column. The first commit that has it takes the column to
 * its end from wherever it was scrolled to, and the reader follows from there:
 * a question asked from further up is not shown, and answered, out of view.
 * It happens once a question, so scrolling up during the answer lets go as
 * before. A turn the reader did not ask (another tab's, a re-read of the rows)
 * is no one's `ownQuestion` and moves no one who has scrolled up.
 */
function useFollowTheEnd(ownQuestion: string | null) {
  const box = useRef<HTMLDivElement>(null);
  /** Whether the reader is at the end of the column. Scrolling up lets go of it. */
  const following = useRef(true);
  /** The height of the column's content at the last commit that changed it. */
  const contentHeight = useRef(NOT_MEASURED);
  /** The question of the reader's own that the column last went to its end for. */
  const broughtBackFor = useRef<string | null>(null);

  useEffect(() => {
    const element = box.current;
    if (element === null) return;
    const asked = ownQuestion !== null && ownQuestion !== broughtBackFor.current;
    if (asked) {
      broughtBackFor.current = ownQuestion;
      following.current = true;
    }
    // The reader's own question moves the column even when this commit made it no taller:
    // the rows can bring the turn a commit before the page learns the question is its own.
    if (!asked && element.scrollHeight === contentHeight.current) return;
    contentHeight.current = element.scrollHeight;
    if (following.current) element.scrollTop = element.scrollHeight;
  });

  function noteScroll() {
    const element = box.current;
    if (element === null) return;
    const fromEnd = element.scrollHeight - element.scrollTop - element.clientHeight;
    following.current = fromEnd <= FOLLOW_SLACK_PX;
  }

  return { box, noteScroll };
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
  /**
   * The id of the question this page last sent, as `workspace_ask()` answered with it; null or
   * absent when it has sent none. Its turn takes the column to its end (`useFollowTheEnd`).
   */
  askedQuestionId?: string | null;
}

export function MessageList({ turns, empty, askedQuestionId = null }: MessageListProps) {
  // The reader's own question, from the commit in which it is one of the turns.
  const ownQuestion =
    askedQuestionId !== null && turns.some((turn) => turn.question?.id === askedQuestionId)
      ? askedQuestionId
      : null;
  const { box, noteScroll } = useFollowTheEnd(ownQuestion);

  return (
    <div ref={box} className={styles.column} onScroll={noteScroll}>
      {empty === null ? <Turns turns={turns} /> : <EmptyLine state={empty} />}
    </div>
  );
}

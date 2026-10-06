'use client';

/**
 * The composer (Phase 21, task 16).
 *
 * A text box and one button. The button reads "Ask"; while a request is open
 * it reads "Stop" (no control reads "Submit": `web/test/audits.test.ts`).
 * Enter asks and Shift+Enter is a new line.
 *
 * A QUESTION IS 1 TO 8000 CHARACTERS AFTER TRIMMING. The page refuses anything
 * else before a request is sent (`askWorkspace` measures it), and the database
 * refuses the same text. A second question while one is open is refused by the
 * database, not only by the button: Enter still sends it, and SQLSTATE 23505
 * comes back as its one sentence. Each refusal is shown here, under the box.
 *
 * The typed text is kept until a question is accepted, so a refusal or a
 * failure never loses it.
 *
 * A CONVERSATION THAT WAS NOT FOUND IS NOT ASKED INTO (the PM's ruling U1):
 * the box and the button are disabled and nothing is sent. What was typed
 * stays in the box.
 *
 * The box has a visible placeholder (PM wording).
 */

import { useRef, useState, type KeyboardEvent } from 'react';
import {
  ASK_LABEL,
  QUESTION_FIELD_LABEL,
  QUESTION_PLACEHOLDER,
  STOP_LABEL,
} from '@/lib/workspace-labels';
import styles from './Composer.module.css';

/** How tall the box starts, in lines. */
const QUESTION_ROWS = 3;

export interface ComposerProps {
  /** A request is open in this conversation: the button stops it. */
  requestOpen: boolean;
  /** A question or a Stop is on its way: the button waits. */
  busy: boolean;
  /** The conversation was not found: there is nothing to ask into, and nothing is sent. */
  disabled: boolean;
  /** The sentence of a refused question, or null. */
  refusal: string | null;
  /** Ask. Resolves true when the question was accepted. */
  onAsk: (text: string) => Promise<boolean>;
  onStop: () => void;
  /** The text changed: a refusal about the old text no longer applies. */
  onEdit: () => void;
}

/**
 * The typed text, and asking with it one question at a time. The text is
 * cleared only when the question was accepted.
 */
function useQuestion(blocked: boolean, onAsk: (text: string) => Promise<boolean>) {
  const [text, setText] = useState('');
  /** A question is on its way. A ref, because a held Enter repeats before `busy` has rendered. */
  const sending = useRef(false);

  async function ask() {
    if (blocked || sending.current) return;
    sending.current = true;
    try {
      if (await onAsk(text)) setText('');
    } finally {
      sending.current = false;
    }
  }

  return { text, setText, ask };
}

export function Composer(props: ComposerProps) {
  const { requestOpen, busy, disabled, refusal, onAsk, onStop, onEdit } = props;
  // Disabled or not, a key event still reaches the box: the guard is in `ask`, not in the markup.
  const { text, setText, ask } = useQuestion(busy || disabled, onAsk);

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    // Shift+Enter is the browser's new line. Enter while an input method is
    // composing picks a candidate.
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    void ask();
  }

  return (
    <div className={styles.composer}>
      <div className={styles.row}>
        <textarea
          className={styles.box}
          aria-label={QUESTION_FIELD_LABEL}
          placeholder={QUESTION_PLACEHOLDER}
          rows={QUESTION_ROWS}
          disabled={disabled}
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            onEdit();
          }}
          onKeyDown={onKeyDown}
        />
        <button
          type="button"
          className={styles.button}
          disabled={busy || disabled}
          onClick={() => (requestOpen ? onStop() : void ask())}
        >
          {requestOpen ? STOP_LABEL : ASK_LABEL}
        </button>
      </div>
      {refusal !== null && (
        <p className={styles.refusal} role="alert">
          {refusal}
        </p>
      )}
    </div>
  );
}

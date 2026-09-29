'use client';

/**
 * "Apply answers now" (R-42, B-21) — beside "Apply answers" in the Inbox header.
 *
 * "Apply answers" asks a Claude session to work through every answered row.
 * This one files a `transform` request, which the next scheduler tick drains by
 * running `apply_resolutions()`: the four assignment fields an answer can set
 * land within about two minutes, with no crawl and no session. The logic lives
 * in `useApplyNow`; this renders it.
 */

import { useId } from 'react';
import {
  APPLY_NOW_HELP,
  APPLY_NOW_LABEL,
  APPLY_NOW_STATE_LABEL,
  useApplyNow,
} from '@/lib/queries.applyNow';
import styles from './ApplyNowButton.module.css';

export function ApplyNowButton() {
  const helpId = useId();
  const { state, failure, filing, lookingForOpen, error, apply } = useApplyNow();

  const label = filing ? 'requesting…' : state ? APPLY_NOW_STATE_LABEL[state] : APPLY_NOW_LABEL;

  return (
    <span className={styles.wrap}>
      <button
        type="button"
        className={styles.button}
        onClick={() => void apply()}
        disabled={filing || lookingForOpen}
        aria-describedby={helpId}
      >
        {label}
      </button>
      <span id={helpId} className={styles.help}>
        {APPLY_NOW_HELP}
      </span>
      {failure && <span className={styles.failure}>The scheduler said: {failure}</span>}
      {error && (
        <span className={styles.error} role="alert">
          Could not file the request: {error.message}
        </span>
      )}
    </span>
  );
}

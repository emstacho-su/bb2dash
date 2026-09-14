'use client';

/**
 * The one Open ladder.
 *
 * Four screens show a file and a way to reach it — the Materials browser, the
 * course Info tab's syllabus, the session popout, and the Classwork tree — and
 * each had hand-copied the same three-rung ladder with its own labels and its
 * own button classes. The same unreachable file read "No route" on one screen,
 * "no route" on another and "on disk only" on a third, and a file with a
 * source URL opened through a primary button on two screens and a secondary
 * one on the third. This component is the ladder; the callers supply the row.
 *
 * The rungs, in order:
 *
 *   1. bytes in the `bb-files` bucket  → a signed-URL open (OpenStoredButton)
 *   2. a recorded source URL           → that link, in a new tab
 *   3. a Blackboard page the caller    → "In Blackboard ↗" (the Classwork tree
 *      offers as a fallback              passes the content item's own URL)
 *   4. nothing reachable               → a disabled control that says which
 *                                        kind of nothing it is
 *
 * Rung 4 is a disabled button rather than nothing at all, because a row with no
 * action looks like a row that failed to render. `fileHonesty` decides what it
 * says — including the "Not stored" case, where the caller could only see
 * `storage_path` and must not claim there is no source link.
 */

import { OpenStoredButton } from './OpenStoredButton';
import {
  fileHonesty,
  sourceUrl,
  storedPath,
  type FileLocation,
  type FileRoutes,
} from '@/lib/queries.materials';
import tokens from '@/styles/tokens.module.css';
import styles from './FileOpenAction.module.css';

/** The tint of the honesty tag. Openable routes read as accented. */
export function honestyTagClass(location: FileLocation): string {
  if (location === 'library') return tokens.tagAccent;
  if (location === 'source') return tokens.tagOutline;
  return tokens.tagNeutral;
}

/** The hover text behind the honesty tag: what the label actually means. */
export function honestyTitle(location: FileLocation): string {
  switch (location) {
    case 'library':
      return 'Bytes stored in the bb-files bucket — opens a signed link.';
    case 'source':
      return 'No stored copy; opens the original source URL.';
    case 'disk':
      return 'Recorded in the local mirror only — no online copy to open here.';
    case 'unknown':
      return 'No stored copy. Whether a source link exists is not recorded here.';
    default:
      return 'No storage, source URL or local copy recorded.';
  }
}

/** What the disabled control says when no rung above it applies. */
function deadEndLabel(location: FileLocation): string {
  if (location === 'disk') return 'On disk only';
  if (location === 'unknown') return 'Not stored';
  return 'No route';
}

export function FileOpenAction({
  routes,
  blackboardUrl = null,
  showLabel = false,
}: {
  /** Any row carrying the three route columns; unseen columns pass UNKNOWN_ROUTE. */
  routes: FileRoutes;
  /** A Blackboard page to fall back to when the file itself is not reachable. */
  blackboardUrl?: string | null;
  /** Render the honesty tag ahead of the action, as the file lists do. */
  showLabel?: boolean;
}) {
  const honesty = fileHonesty(routes);
  const stored = storedPath(routes);
  const source = sourceUrl(routes);

  return (
    <>
      {showLabel && (
        <span className={honestyTagClass(honesty.location)} title={honestyTitle(honesty.location)}>
          {honesty.label}
        </span>
      )}

      {stored ? (
        <OpenStoredButton storagePath={stored} className={tokens.btnPrimary} />
      ) : source ? (
        <span className={styles.action}>
          <a className={tokens.btnPrimary} href={source} target="_blank" rel="noreferrer">
            Open ↗
          </a>
        </span>
      ) : blackboardUrl ? (
        <span className={styles.action}>
          <a className={tokens.btnSecondary} href={blackboardUrl} target="_blank" rel="noreferrer">
            In Blackboard ↗
          </a>
        </span>
      ) : (
        <span className={styles.action}>
          <button
            type="button"
            className={tokens.btnSecondary}
            disabled
            title={honestyTitle(honesty.location)}
          >
            {deadEndLabel(honesty.location)}
          </button>
        </span>
      )}
    </>
  );
}

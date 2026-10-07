/**
 * One retry schedule for the two calls that open and close a request's answer, `workspace_begin()`
 * and `workspace_finish()` (rulings V1, CR-2 and CR-3).
 *
 * A try that fails is made again after 1 s, then 2 s, 4 s, 8 s and every 15 s after that, for 170 s
 * from the first try; the last try is made as the 170 s end. A refusal the function raises itself
 * (SQLSTATE 22023) is an answer, not a failure: it ends the tries at once.
 */

import { FINISH_BACKOFF_FIRST_MS, FINISH_BACKOFF_MAX_MS, FINISH_RETRY_MS } from './config.js';
import { isRefusal } from './db.js';
import { messageOf } from './errors.js';

const BACKOFF_FACTOR = 2;
const MS_PER_SECOND = 1000;

export type RetryEnd<T> =
  /** The call went through. */
  | { readonly outcome: 'made'; readonly value: T }
  /**
   * The function refused the call (22023). `afterFailure` is true when an earlier try of the same
   * call failed in another way: that try may have gone through with its reply lost, so the refusal
   * may be the answer to a call that was already made.
   */
  | { readonly outcome: 'refused'; readonly error: unknown; readonly afterFailure: boolean }
  /** Every try inside the window failed. */
  | { readonly outcome: 'gave_up'; readonly error: unknown }
  /** The caller's signal ended the tries before the window did. */
  | { readonly outcome: 'stopped'; readonly error: unknown };

export interface RetryOptions {
  /** The call's name in the log: `begin` or `finish`. */
  readonly what: string;
  readonly log: (message: string) => void;
  /** Ends the tries early, between two of them. A try in flight is never cut. */
  readonly signal?: AbortSignal;
}

/** A wait that the signal cuts short. */
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }
    const done = (): void => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    signal?.addEventListener('abort', done, { once: true });
  });
}

export async function retryDbCall<T>(call: () => Promise<T>, options: RetryOptions): Promise<RetryEnd<T>> {
  const deadline = Date.now() + FINISH_RETRY_MS;
  let backoff = FINISH_BACKOFF_FIRST_MS;
  for (let attempt = 1; ; attempt += 1) {
    try {
      return { outcome: 'made', value: await call() };
    } catch (error) {
      // Only a try that failed in another way is followed by another try, so a later try means one did.
      if (isRefusal(error)) return { outcome: 'refused', error, afterFailure: attempt > 1 };
      const left = deadline - Date.now();
      if (left <= 0) return { outcome: 'gave_up', error };
      if (options.signal?.aborted) return { outcome: 'stopped', error };
      const wait = Math.min(backoff, left);
      options.log(`${options.what} failed (try ${attempt}, next in ${wait / MS_PER_SECOND} s): ${messageOf(error)}`);
      await sleep(wait, options.signal);
      if (options.signal?.aborted) return { outcome: 'stopped', error };
      backoff = Math.min(backoff * BACKOFF_FACTOR, FINISH_BACKOFF_MAX_MS);
    }
  }
}

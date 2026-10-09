/**
 * The signed link, checked again by the worker before it downloads (steps 2 and 3): https, the
 * project's host, the bucket's signed path, ending in the row's key; no redirect is followed; the
 * body is read up to the bucket's limit and no further.
 */

import { MAX_UPLOAD_BYTES, PROJECT_HOST, SIGNED_PATH_PREFIX, STORAGE_KEY_PREFIX } from './constants.js';

const HTTP_OK = 200;

/** The row's key: `u/` and the hash, as `workspace_upload_register` makes it. */
export const storageKeyFor = (sha256: string): string => `${STORAGE_KEY_PREFIX}${sha256}`;

/**
 * True when `link` is exactly `https://<project host>/storage/v1/object/sign/workspace-uploads/u/<sha256>?<query>`:
 * no credentials, no port, no fragment, and a path that ends in the row's key and has nothing after it.
 */
export function isTrustedLink(link: string, sha256: string): boolean {
  let url: URL;
  try {
    url = new URL(link);
  } catch {
    return false;
  }
  return (
    url.protocol === 'https:' &&
    url.hostname === PROJECT_HOST &&
    url.port === '' &&
    url.username === '' &&
    url.password === '' &&
    url.hash === '' &&
    url.pathname === `${SIGNED_PATH_PREFIX}${storageKeyFor(sha256)}`
  );
}

export type Download =
  | { ok: true; bytes: Buffer }
  | { ok: false; reason: 'status' | 'network' | 'too_large' };

/** One GET, redirects not followed, a non-200 answer refused, the body capped at `maxBytes`. */
export async function downloadBytes(fetchFn: typeof fetch, link: string, maxBytes = MAX_UPLOAD_BYTES): Promise<Download> {
  let response: Response;
  try {
    response = await fetchFn(link, { method: 'GET', redirect: 'manual' });
  } catch {
    return { ok: false, reason: 'network' };
  }
  if (response.status !== HTTP_OK || response.body === null) return { ok: false, reason: 'status' };
  const chunks: Buffer[] = [];
  let total = 0;
  try {
    const reader = response.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > maxBytes) {
        await reader.cancel();
        return { ok: false, reason: 'too_large' };
      }
      chunks.push(Buffer.from(value));
    }
  } catch {
    return { ok: false, reason: 'network' };
  }
  return { ok: true, bytes: Buffer.concat(chunks) };
}

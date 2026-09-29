// bb2dash :: ingest/fetch_signed.mjs
//
// The byte fetch for a Blackboard file, without a browser download event.
//
// WHY THIS EXISTS. A `bbcswebdav` URL does not serve bytes: it 302s to a signed, time-limited CDN
// URL on another origin with no CORS headers, so page JavaScript cannot read it and only a real
// browser could follow it. The pull therefore used Playwright's `download` event — which crashed
// the MCP browser on 2026-09-23 and left a sync unable to store the three files it had catalogued.
// The chain is walkable by hand, one hop at a time, if something holds the session cookie: that is
// what this module does. It takes an injected `get` (Playwright's
// `APIRequestContext.get(url, { maxRedirects: 0 })`, which carries the logged-in context's cookies)
// so the walk is testable without a browser and reusable by the Phase 14 sync runner.
//
// WHAT IT REFUSES, AND WHY THAT MATTERS. A redirect chain is attacker-influenced in principle: it
// is whatever the remote server puts in `Location`. So the walk is bounded at MAX_HOPS and the
// final URL must sit on Blackboard's CDN suffix, checked at a domain boundary rather than by
// `endsWith` on the whole host. Bytes are never fetched from anywhere else, and `downloadTo`
// re-checks the host itself so a caller cannot hand it a URL the walk never approved.
//
// A signed URL is never cached past one run: it expires, and a stale one fails in a way that looks
// like a missing file.
//
// OUTCOMES, which every caller must tell apart:
//   ok              · the chain ended on the CDN; `signedUrl` is the thing to download
//   session_expired · 401/403 at the first hop: the Blackboard session died. The caller STOPS;
//                     retrying every remaining file would just produce a list of identical errors.
//   gone            · 404: the file is no longer on Blackboard. The row is left alone and reported.
//   refused         · too many hops, or a final host that is not the CDN. Reported, never followed.
//
// Importing this module runs nothing: every export is pure or takes its I/O by argument.

import fs from 'node:fs';
import path from 'node:path';

/** The only host suffix signed Blackboard file URLs are accepted from. */
export const SIGNED_HOST_SUFFIX = '.content.blackboardcdn.com';

/** The institution's Blackboard host — where a durable URL starts and redirects may pass. */
export const BLACKBOARD_ORIGIN = 'blackboard.syracuse.edu';

/** The most URLs one chain may contain, the durable URL included. */
export const MAX_HOPS = 3;

/**
 * Is this URL on Blackboard's CDN? The suffix is matched at a domain boundary, so
 * `notcontent.blackboardcdn.com.evil.com` is refused while `content.blackboardcdn.com` is allowed.
 */
export function isSignedHost(url) {
  let host;
  try { host = new URL(String(url)).hostname.toLowerCase(); } catch { return false; }
  const bare = SIGNED_HOST_SUFFIX.replace(/^\./, '');
  return host === bare || host.endsWith(SIGNED_HOST_SUFFIX);
}

/** A bare IP literal, v4 or v6. Never a host we are willing to request. */
function isIpLiteral(host) {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.startsWith('[') || host.includes(':');
}

/**
 * May we issue a request to this URL at all?
 *
 * The final-host rule says where bytes may come FROM; this says where a request may GO. They are
 * not the same question, and conflating them was a real hole: `source_url` is read out of
 * `data-bbfile` attributes in course content, and the crawler's `durableUrl` falls back to any URL
 * string when nothing matches the bbcswebdav pattern. A course-content author could therefore point
 * the walk at `http://127.0.0.1:…` or any internal host, and — because the walk runs inside
 * Playwright's request context, which carries the logged-in profile's cookies — turn it into a
 * credentialed GET whose status came back in the report as an oracle.
 *
 * So: https only, and the host must be Blackboard or the CDN. Bare IPs are refused outright, which
 * also closes loopback, link-local and the RFC1918 ranges.
 */
export function isFollowable(url) {
  let u;
  try { u = new URL(String(url)); } catch { return false; }
  if (u.protocol !== 'https:') return false;
  const host = u.hostname.toLowerCase();
  if (isIpLiteral(host)) return false;
  if (host === BLACKBOARD_ORIGIN || host.endsWith(`.${BLACKBOARD_ORIGIN}`)) return true;
  return isSignedHost(u.href);
}

/**
 * Is this chain one we will download from? A chain is the URLs visited in order, the durable URL
 * first and the signed URL last. Two checks and no others: the length, and the final host.
 */
export function validateHops(hops) {
  const chain = Array.isArray(hops) ? hops : [];
  if (chain.length < 2) {
    return { outcome: 'refused', reason: `a chain needs at least one redirect, got ${chain.length} hop(s)` };
  }
  if (chain.length > MAX_HOPS) {
    return { outcome: 'refused', reason: `chain is ${chain.length} hops, the ceiling is ${MAX_HOPS}` };
  }
  const last = chain[chain.length - 1];
  if (!isSignedHost(last)) {
    return { outcome: 'refused', reason: `final host is not ${SIGNED_HOST_SUFFIX}` };
  }
  return { outcome: 'ok', signedUrl: last };
}

const isRedirect = (status) => status === 301 || status === 302 || status === 303 || status === 307 || status === 308;

/** `Location` off a headers object, however the client cased the key. */
function locationOf(headers) {
  if (!headers || typeof headers !== 'object') return null;
  for (const k of Object.keys(headers)) {
    if (k.toLowerCase() === 'location') return headers[k];
  }
  return null;
}

/**
 * Walk the redirect chain from a durable Blackboard URL to its signed CDN URL, one hop at a time.
 *
 * `get(url)` must NOT follow redirects itself and must carry the Blackboard session
 * (Playwright: `page.context().request.get(url, { maxRedirects: 0 })`). Only the intermediate hops
 * are fetched; the signed URL itself is left for `downloadTo`, so the bytes cross the wire once.
 */
export async function resolveSignedUrl(get, durableUrl) {
  const hops = [String(durableUrl)];
  let current = String(durableUrl);

  // Checked before the first request, not after it: an off-origin starting URL must cost zero
  // credentialed round trips.
  if (!isFollowable(current)) {
    return { outcome: 'refused', reason: `starting URL is not followable (origin or scheme)`, hops };
  }

  for (let i = 0; i < MAX_HOPS; i++) {
    let answer;
    try {
      answer = await get(current);
    } catch (e) {
      return { outcome: 'refused', reason: `request failed: ${String((e && e.message) || e)}`, hops };
    }
    const status = Number(answer?.status);

    if (status === 401 || status === 403) {
      // Only the first hop tells us about the session; deeper in, the CDN rejects a bad signature
      // the same way, which is not a dead session.
      return { outcome: i === 0 ? 'session_expired' : 'refused', reason: `status ${status}`, hops };
    }
    if (status === 404) return { outcome: 'gone', reason: 'status 404', hops };

    if (!isRedirect(status)) {
      // A 200 here is Blackboard serving something that is not the file — a login page, an error
      // page. Never treat it as bytes.
      return { outcome: 'refused', reason: `expected a redirect, got status ${status}`, hops };
    }

    const location = locationOf(answer.headers);
    if (!location) return { outcome: 'refused', reason: `status ${status} with no Location`, hops };

    let next;
    try { next = new URL(String(location), current).href; } catch {
      return { outcome: 'refused', reason: `unparsable Location: ${String(location).slice(0, 120)}`, hops };
    }

    if (!isFollowable(next)) {
      // The redirect target is whatever the remote server chose. Record it, never request it.
      hops.push(next);
      return { outcome: 'refused', reason: 'redirect target is not followable (origin or scheme)', hops };
    }

    hops.push(next);
    if (isSignedHost(next)) return { ...validateHops(hops), hops };
    if (hops.length >= MAX_HOPS) {
      return { outcome: 'refused', reason: `chain reached the ${MAX_HOPS}-hop ceiling without the CDN`, hops };
    }
    current = next;
  }

  return { outcome: 'refused', reason: `chain reached the ${MAX_HOPS}-hop ceiling without the CDN`, hops };
}

/**
 * Download a signed URL to `destPath`, through a temp file in the same directory so a reader never
 * sees a half-written file. `fs.renameSync` raises EXDEV when the temp file and the destination are
 * on different devices, which is the normal case when a container downloads to tmpfs and stores on
 * a mounted volume; that falls back to copy-then-unlink.
 *
 * The host is re-checked here: a caller must not be able to download from a URL the walk refused.
 */
export async function downloadTo(fetchImpl, signedUrl, destPath) {
  if (!isSignedHost(signedUrl)) {
    return { outcome: 'refused', reason: `refusing to download from a host outside ${SIGNED_HOST_SUFFIX}` };
  }

  let res;
  try {
    res = await fetchImpl(String(signedUrl));
  } catch (e) {
    return { outcome: 'refused', reason: `request failed: ${String((e && e.message) || e)}` };
  }

  const status = Number(res?.status);
  if (!res?.ok) {
    // A 401/403 HERE is not a dead Blackboard session. The signed URL carries its own, time-limited
    // authorisation and no cookie, so the CDN refusing it means the signature expired — which
    // happens normally when the browser half walked many rows' hops before the download started.
    // Calling it `session_expired` would abort the whole run and tell Stack to log in again when
    // nothing is wrong with his session. Only `resolveSignedUrl`'s first hop can say that.
    if (status === 401 || status === 403) {
      return { outcome: 'refused', reason: `signed URL rejected (status ${status}); its signature has probably expired — re-walk the hops for this row` };
    }
    if (status === 404) return { outcome: 'gone', reason: 'status 404' };
    return { outcome: 'refused', reason: `status ${status}` };
  }

  const bytes = Buffer.from(await res.arrayBuffer());
  const dir = path.dirname(destPath);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = path.join(dir, `.${path.basename(destPath)}.${process.pid}.${Date.now()}.part`);

  try {
    fs.writeFileSync(tmp, bytes);
    try {
      fs.renameSync(tmp, destPath);
    } catch (e) {
      if (e && e.code === 'EXDEV') {
        fs.copyFileSync(tmp, destPath);
        fs.unlinkSync(tmp);
      } else {
        throw e;
      }
    }
  } catch (e) {
    try { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); } catch { /* the temp file is best-effort */ }
    return { outcome: 'refused', reason: `write failed: ${String((e && e.message) || e)}` };
  }

  return { outcome: 'ok', bytes: bytes.length, path: destPath };
}

/**
 * C-4 — the navigation allowlist, as a pure decision. Plain Node, no `electron`
 * import (C-13), so the rule is unit-testable without launching a window;
 * `src/main/navigation.ts` is the twenty lines that attach it to a
 * `BrowserWindow`.
 *
 * Deny by default. The two allowed origins are the deployed app and the
 * Supabase project (auth redirects and signed Storage URLs); every other
 * http(s) target is handed to the default browser, and anything that is not
 * http(s) — `file:`, a custom scheme, a malformed URL — is dropped and logged.
 */

export type NavigationDecision =
  | { readonly kind: 'allow' }
  | { readonly kind: 'external'; readonly url: string }
  | { readonly kind: 'drop'; readonly reason: string };

const EXTERNAL_PROTOCOLS = Object.freeze(['http:', 'https:']);

function parse(rawUrl: string): URL | null {
  try {
    return new URL(rawUrl);
  } catch {
    return null;
  }
}

/**
 * `will-navigate`: stay inside the window only for the allowed origins. The
 * allowlist is `allowedOrigins(config)`.
 */
export function decideNavigation(
  rawUrl: string,
  allowedOrigins: readonly string[],
): NavigationDecision {
  const url = parse(rawUrl);
  if (url === null) return { kind: 'drop', reason: 'unparseable URL' };
  if (allowedOrigins.includes(url.origin)) return { kind: 'allow' };
  if (EXTERNAL_PROTOCOLS.includes(url.protocol)) return { kind: 'external', url: url.toString() };
  return { kind: 'drop', reason: `non-http(s) scheme ${url.protocol}` };
}

/**
 * `setWindowOpenHandler`: a new window is never created (C-4). An http(s)
 * target goes to the default browser — which is how Materials' signed Storage
 * URLs leave the shell — and anything else is dropped.
 */
export function decideWindowOpen(rawUrl: string): NavigationDecision {
  const url = parse(rawUrl);
  if (url === null) return { kind: 'drop', reason: 'unparseable URL' };
  if (EXTERNAL_PROTOCOLS.includes(url.protocol)) return { kind: 'external', url: url.toString() };
  return { kind: 'drop', reason: `non-http(s) scheme ${url.protocol}` };
}

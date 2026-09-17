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

/**
 * R2-5 — the one OS permission the renderer is allowed, and only from the app itself.
 *
 * C-3 said "deny every request", on the reasoning that the toasts are main's and the Sync
 * button's copy is a user-gesture write rather than a permission request. That is not what
 * Chromium does: `navigator.clipboard.writeText` raises `clipboard-sanitized-write`, and a
 * blanket denial made the Sync button's copy fail inside the shell. It fails *silently*,
 * and it is the only path Stack has to the command when a request is already queued — a
 * second press makes no POST, so no terminal opens and the clipboard is all he gets.
 *
 * `clipboard-read` is a different permission and stays denied: nothing needs to read what
 * is on Stack's clipboard.
 */
export const ALLOWED_PERMISSION = 'clipboard-sanitized-write';

export interface PermissionDecision {
  readonly allow: boolean;
  readonly reason: string;
}

export function decidePermission(
  permission: string,
  requestingUrl: string | undefined,
  appUrl: string,
): PermissionDecision {
  if (permission !== ALLOWED_PERMISSION) {
    return { allow: false, reason: `"${permission}" is not on the allowlist` };
  }

  const requesting = parse(requestingUrl ?? '');
  if (requesting === null) {
    return { allow: false, reason: `"${permission}" from an unparseable origin` };
  }

  const app = parse(appUrl);
  if (app === null) return { allow: false, reason: 'appUrl is not a URL' };

  // Deliberately the app origin only, not `allowedOrigins`: Supabase is in the navigation
  // allowlist for auth redirects and signed Storage URLs, and none of that needs a clipboard.
  if (requesting.origin !== app.origin) {
    return { allow: false, reason: `"${permission}" from ${requesting.origin}, not the app` };
  }

  return { allow: true, reason: `"${permission}" allowed for ${app.origin}` };
}

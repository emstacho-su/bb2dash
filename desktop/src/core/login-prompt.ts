/**
 * Brief 100 (2026-10-03), the Electron login prompt: the pure part.
 *
 * When the container's runner finds the Blackboard login dead it raises one open Inbox item with
 * ref `sync-login-required`. Under `syncLauncher = queue-only` the shell reads that item on each
 * poller tick and, the first time it sees an item id, opens the runner's noVNC login page in the
 * default browser, already unlocked, so Stack only does NetID and Duo. The wiring (the file read,
 * `shell.openExternal`, the remembered ids) is `src/main/login-prompt.ts`.
 *
 * Plain Node, no `electron` and no `fs` (C-13).
 */

/** The frozen login page (brief 100, Local surfaces). */
export const LOGIN_PAGE_URL = 'http://127.0.0.1:6080/vnc.html';

/** The Inbox item the runner raises through `sync_login_required()` (migration 091). */
export const LOGIN_ITEM_REF = 'sync-login-required';

/** The read, owner session and RLS as every other poller read: `GET /rest/v1/attention_items?…`. */
export const LOGIN_ITEMS_RELATION = 'attention_items';
export const LOGIN_ITEMS_QUERY = `select=id&ref=eq.${LOGIN_ITEM_REF}&state=eq.open`;

const UTF8_BOM = '﻿';

/**
 * The page, connecting by itself and scaled to the browser window, unlocked with `password`
 * (URL-encoded) when there is one; the bare page when there is not, where noVNC asks for it.
 */
export function loginPageUrl(password: string | null): string {
  if (password === null) return LOGIN_PAGE_URL;
  return `${LOGIN_PAGE_URL}?autoconnect=true&resize=scale&password=${encodeURIComponent(password)}`;
}

/**
 * The password a `novnc_password` file holds: a leading byte-order mark and the CR and LF an
 * editor may add are stripped; inner characters are kept. `null` when nothing is left.
 */
export function passwordFromFileText(text: string): string | null {
  const withoutBom = text.startsWith(UTF8_BOM) ? text.slice(UTF8_BOM.length) : text;
  const password = withoutBom.replace(/^[\r\n]+|[\r\n]+$/g, '');
  return password.length > 0 ? password : null;
}

/** The open ids not prompted for yet, in the order PostgREST returned them. */
export function newLoginItems(
  openIds: readonly string[],
  promptedIds: ReadonlySet<string>,
): readonly string[] {
  return openIds.filter((id) => !promptedIds.has(id));
}

/** PostgREST rows to ids. A `bigint` id may arrive as a number or a string. */
export function validateLoginItems(rows: unknown): readonly string[] {
  if (!Array.isArray(rows)) throw new Error('expected an array of rows');
  return rows.map((row: unknown) => {
    if (row === null || typeof row !== 'object') throw new Error('expected a row object');
    const id = (row as { id?: unknown }).id;
    if (typeof id !== 'number' && typeof id !== 'string') throw new Error('expected an id');
    return String(id);
  });
}

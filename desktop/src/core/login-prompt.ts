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

/**
 * The Inbox item the container's runner raises through `sync_login_required()` (migration 091):
 * its ref, kind and entity together. The Chrome skill's own login item carries another ref
 * (`chrome-login-required`), so it never opens the container's page (round 2, item 3).
 */
export const LOGIN_ITEM = Object.freeze({
  ref: 'sync-login-required',
  kind: 'stack_must_confirm',
  entity: 'agent_request',
});

/** The read, owner session and RLS as every other poller read: `GET /rest/v1/attention_items?…`. */
export const LOGIN_ITEMS_RELATION = 'attention_items';
export const LOGIN_ITEMS_QUERY =
  `select=id,ref,kind,entity&ref=eq.${LOGIN_ITEM.ref}&kind=eq.${LOGIN_ITEM.kind}` +
  `&entity=eq.${LOGIN_ITEM.entity}&state=eq.open`;

const UTF8_BOM = '﻿';

/** noVNC's options, read from the fragment as well as the query string. */
const PAGE_OPTIONS = 'autoconnect=true&resize=scale';

/**
 * The page, connecting by itself and scaled to the browser window, unlocked with `password`
 * (URL-encoded) when there is one; without one, noVNC asks for it in the page.
 *
 * Every option rides in the fragment, never the query string (round 2, item 1): a browser never
 * sends the fragment, so websockify never sees or logs the password.
 */
export function loginPageUrl(password: string | null): string {
  if (password === null) return `${LOGIN_PAGE_URL}#${PAGE_OPTIONS}`;
  return `${LOGIN_PAGE_URL}#${PAGE_OPTIONS}&password=${encodeURIComponent(password)}`;
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

function isContainerItem(row: object): boolean {
  const { ref, kind, entity } = row as { ref?: unknown; kind?: unknown; entity?: unknown };
  return ref === LOGIN_ITEM.ref && kind === LOGIN_ITEM.kind && entity === LOGIN_ITEM.entity;
}

/**
 * PostgREST rows to the ids of the container's login items. A row with another ref, kind or
 * entity is dropped even if the server returned it, so the query's filter is not the only
 * guard. A `bigint` id may arrive as a number or a string.
 */
export function validateLoginItems(rows: unknown): readonly string[] {
  if (!Array.isArray(rows)) throw new Error('expected an array of rows');
  const ids: string[] = [];
  for (const row of rows as unknown[]) {
    if (row === null || typeof row !== 'object') throw new Error('expected a row object');
    const id = (row as { id?: unknown }).id;
    if (typeof id !== 'number' && typeof id !== 'string') throw new Error('expected an id');
    if (isContainerItem(row)) ids.push(String(id));
  }
  return ids;
}

/**
 * The one id-row check the shell's PostgREST readers share (brief 100 round 2, item 8): the
 * sync watcher's queued request (`main/sync-terminal.ts`) and the login prompt's Inbox item
 * (`core/login-prompt.ts`). A `bigint` id may arrive as a number or a string; it leaves here as
 * a string. Plain Node (C-13).
 */

/** The id of one row, as a string. Throws on a row that is not an object or has no id. */
export function idOfRow(row: unknown): string {
  if (row === null || typeof row !== 'object') throw new Error('expected a row object');
  const id = (row as { id?: unknown }).id;
  if (typeof id !== 'number' && typeof id !== 'string') throw new Error('expected an id');
  return String(id);
}

/** The ids of an array of rows, in order. Throws on anything that is not an array of rows. */
export function validateIdRows(rows: unknown): readonly string[] {
  if (!Array.isArray(rows)) throw new Error('expected an array of rows');
  return (rows as unknown[]).map(idOfRow);
}

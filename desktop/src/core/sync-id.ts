/**
 * The sync request id check, on its own (Phase 14, P-42).
 *
 * Plain Node with no import at all: the desktop's `sync-command.ts` and the
 * container's `sync/` package both read it, and neither brings the other's
 * operating-system code along. The id comes off a PostgREST row and is checked
 * before anything is built from it.
 */

export const SYNC_ID_PATTERN = /^\d{1,12}$/;

export class InvalidSyncIdError extends Error {
  readonly id: string;

  constructor(id: string) {
    super(`sync request id ${JSON.stringify(id)} does not match ${String(SYNC_ID_PATTERN)}`);
    this.name = 'InvalidSyncIdError';
    this.id = id;
  }
}

export function isValidSyncId(id: string): boolean {
  return SYNC_ID_PATTERN.test(id);
}

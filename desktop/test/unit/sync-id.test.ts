/**
 * Phase 14, P-42 — the sync request id check on its own, so the container's
 * `sync/` package can include it without the terminal argv that sits beside it
 * in `sync-command.ts`.
 */

import { describe, expect, it } from 'vitest';

import { InvalidSyncIdError, SYNC_ID_PATTERN, isValidSyncId } from '../../src/core/sync-id';
import * as syncCommand from '../../src/core/sync-command';

describe('the id check, on its own', () => {
  it.each(['1', '42', '999999999999'])('accepts %s', (id) => {
    expect(isValidSyncId(id)).toBe(true);
  });

  it.each([
    ['empty', ''],
    ['thirteen digits', '1234567890123'],
    ['letters', 'abc'],
    ['mixed', '12a'],
    ['negative', '-1'],
    ['decimal', '1.0'],
    ['leading space', ' 1'],
    ['a command separator', '1; rm -rf /'],
  ])('refuses %s', (_label, id) => {
    expect(isValidSyncId(id)).toBe(false);
  });

  it('names the id and the pattern in its error', () => {
    const error = new InvalidSyncIdError('nope');
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('InvalidSyncIdError');
    expect(error.id).toBe('nope');
    expect(error.message).toContain('"nope"');
    expect(error.message).toContain(String(SYNC_ID_PATTERN));
  });
});

describe('sync-command re-exports the same check', () => {
  it('hands out the very same pattern, function and error class', () => {
    expect(syncCommand.SYNC_ID_PATTERN).toBe(SYNC_ID_PATTERN);
    expect(syncCommand.isValidSyncId).toBe(isValidSyncId);
    expect(syncCommand.InvalidSyncIdError).toBe(InvalidSyncIdError);
  });
});

/**
 * Undo an Inbox answer: when a row may be taken back, what the write sends, and
 * what it refuses. The browser client is a recording stub, so the filter is
 * asserted call by call — the guard lives in the filter, not only in the UI.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeAttentionItem } from './factories';

const from = vi.fn();
const chain = {
  update: vi.fn(),
  eq: vi.fn(),
  in: vi.fn(),
  is: vi.fn(),
  select: vi.fn(),
};

vi.mock('@/lib/supabase/client', () => ({
  getSupabaseBrowserClient: () => ({ from }),
}));

const { REOPEN_PATCH, REOPEN_REFUSED, REOPEN_TWIN, canReopen, reopenAttentionItem } = await import(
  '@/lib/queries.inboxReopen'
);

beforeEach(() => {
  vi.clearAllMocks();
  from.mockReturnValue(chain);
  chain.update.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  chain.in.mockReturnValue(chain);
  chain.is.mockReturnValue(chain);
  chain.select.mockResolvedValue({ data: [{ id: 7 }], error: null });
});

describe('canReopen — only an answer nothing has acted on', () => {
  it('is true for a resolved or dismissed row the transform has not applied and the worker has not archived', () => {
    expect(canReopen(makeAttentionItem({ state: 'resolved', resolved_at: '2026-10-05T20:06:20Z' }))).toBe(true);
    expect(canReopen(makeAttentionItem({ state: 'dismissed', resolved_at: '2026-10-05T20:06:20Z' }))).toBe(true);
  });

  it('is false for an open row: there is nothing to take back', () => {
    expect(canReopen(makeAttentionItem({ state: 'open' }))).toBe(false);
  });

  it('is false once the transform applied the answer: the fact changed', () => {
    expect(
      canReopen(makeAttentionItem({ state: 'resolved', applied_at: '2026-10-05T21:00:00Z' })),
    ).toBe(false);
  });

  it('is false once the worker archived the row', () => {
    expect(canReopen(makeAttentionItem({ state: 'archived', archived_at: '2026-10-05T21:00:00Z' }))).toBe(false);
    expect(
      canReopen(makeAttentionItem({ state: 'resolved', archived_at: '2026-10-05T21:00:00Z' })),
    ).toBe(false);
  });
});

describe('reopenAttentionItem — the write', () => {
  it('puts the four answer columns back as raised, on that row only while it is still undoable', async () => {
    await reopenAttentionItem(7);

    expect(from).toHaveBeenCalledWith('attention_items');
    expect(chain.update).toHaveBeenCalledWith(REOPEN_PATCH);
    expect(REOPEN_PATCH).toEqual({ state: 'open', resolved_at: null, resolution: null, resolution_note: null });
    expect(chain.eq).toHaveBeenCalledWith('id', 7);
    expect(chain.in).toHaveBeenCalledWith('state', ['resolved', 'dismissed']);
    expect(chain.is).toHaveBeenCalledWith('applied_at', null);
    expect(chain.is).toHaveBeenCalledWith('archived_at', null);
    expect(chain.select).toHaveBeenCalledWith('id');
  });

  it('refuses an id that is not a positive integer before anything is sent', async () => {
    await expect(reopenAttentionItem(0)).rejects.toThrow(/id/);
    await expect(reopenAttentionItem(1.5)).rejects.toThrow(/id/);
    expect(from).not.toHaveBeenCalled();
  });

  it('says so when no row was reopened: the fold or the worker got there first', async () => {
    chain.select.mockResolvedValue({ data: [], error: null });
    await expect(reopenAttentionItem(7)).rejects.toThrow(REOPEN_REFUSED);
  });

  it('names the newer open twin when the unique open index refuses the row', async () => {
    chain.select.mockResolvedValue({
      data: null,
      error: { code: '23505', message: 'duplicate key value violates unique constraint "attention_items_open_dedupe_idx"' },
    });
    await expect(reopenAttentionItem(7)).rejects.toThrow(REOPEN_TWIN);

    chain.select.mockResolvedValue({
      data: null,
      error: { message: 'duplicate key value violates unique constraint "attention_items_open_dedupe_idx"' },
    });
    await expect(reopenAttentionItem(7)).rejects.toThrow(REOPEN_TWIN);
  });

  it('passes any other database error through untouched', async () => {
    const refused = { code: '42501', message: 'permission denied for table attention_items' };
    chain.select.mockResolvedValue({ data: null, error: refused });
    await expect(reopenAttentionItem(7)).rejects.toEqual(refused);
  });
});

/**
 * Undo on an Inbox card: an answered, unapplied row under "Answered, not
 * applied" offers Undo with the sentence that says what it changes; an applied,
 * archived, open, session-link or database-closed row does not; the press hands
 * the row's id up; a pending, blocked or failed undo reads like any other write
 * on the card. Plus `latestWrite`, the rule that picks which of the three Inbox
 * writes a card's state belongs to.
 */

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { makeAttentionItem, makeSyncStatusRow } from './factories';

vi.mock('@/lib/supabase/client', () => ({
  getSupabaseBrowserClient: () => ({ from: vi.fn() }),
}));
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

const { InboxView } = await import('@/app/(app)/inbox/Inbox');
const { latestWrite } = await import('@/components/inbox/inbox-row');
const { normalizeSyncStatus } = await import('@/lib/queries.sync');
const { REOPEN_TWIN, UNDO_BLOCKED, UNDO_OUTCOME } = await import('@/lib/queries.inboxReopen');

const status = normalizeSyncStatus(makeSyncStatusRow());

function answered(overrides: Parameters<typeof makeAttentionItem>[0] = {}) {
  return makeAttentionItem({
    id: 7,
    state: 'resolved',
    resolved_at: '2026-10-05T20:06:20.000Z',
    resolution: { accept: 'blackboard' },
    resolution_note: 'keep mine, the Blackboard date is from a prior session',
    ...overrides,
  });
}

type ViewProps = Partial<Parameters<typeof InboxView>[0]>;

function renderView(items: ReturnType<typeof makeAttentionItem>[], props: ViewProps = {}) {
  const onReopen = vi.fn();
  render(
    <InboxView
      items={items}
      status={status}
      initialTab="answered"
      onResolve={vi.fn()}
      onReopen={onReopen}
      {...props}
    />,
  );
  return onReopen;
}

describe('Inbox undo — where it is offered', () => {
  it('an answered, unapplied row offers Undo with its sentence, and the press hands the id up', () => {
    const onReopen = renderView([answered()]);

    const undo = screen.getByRole('button', { name: 'Undo' });
    expect(screen.getByText(UNDO_OUTCOME)).toBeInTheDocument();

    fireEvent.click(undo);
    expect(onReopen).toHaveBeenCalledWith(7);
  });

  it('a dismissed row offers it too', () => {
    renderView([answered({ state: 'dismissed', resolution: { dismissed: true }, resolution_note: null })]);
    expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument();
  });

  it('an applied answer has no Undo: the fact changed', () => {
    renderView([answered({ applied_at: '2026-10-05T21:00:00.000Z' })]);
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull();
    expect(screen.queryByText(UNDO_OUTCOME)).toBeNull();
  });

  it('an archived row has no Undo', () => {
    renderView(
      [answered({ state: 'archived', archived_at: '2026-10-05T21:00:00.000Z', archived_by: 'inbox-apply' })],
      { initialTab: 'archived' },
    );
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull();
  });

  it('an open row has no Undo, only its answer controls', () => {
    renderView([makeAttentionItem({ id: 9 })], { initialTab: 'needs_you' });
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Keep mine' })).toBeInTheDocument();
  });

  it('a session-link answer has no Undo: the fold applies the pick without a stamp', () => {
    renderView([
      answered({
        kind: 'stack_must_confirm',
        entity: 'bb_file',
        ref: 'session_link/2489',
        field: 'session_id',
        to_value: [44, 45],
        resolution: { session_id: 44 },
        suggested: {
          source: 'link_file_sessions',
          file_id: 2489,
          week_no: 7,
          candidates: [44, 45],
          answer_with: '{"session_id": <one of candidates>} or {"accept": "none"}',
        },
      }),
    ]);
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull();
  });

  it('a row the database closed itself has no Undo', () => {
    renderView([answered({ state: 'dismissed', resolution: null, resolution_note: 'Closed by 084: nothing to decide' })]);
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull();
  });

  it('is absent when the screen was not given a way to reopen', () => {
    render(<InboxView items={[answered()]} status={status} initialTab="answered" onResolve={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull();
  });
});

describe('Inbox undo — in flight, blocked and failed', () => {
  it('is disabled while its row has a write in flight', () => {
    renderView([answered()], { pendingId: 7 });
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
  });

  it('waits, disabled, while the Apply worker holds the queue, and says so in place of the outcome', () => {
    renderView([answered()], { undoBlocked: UNDO_BLOCKED });
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
    expect(screen.getByText(UNDO_BLOCKED)).toBeInTheDocument();
    expect(screen.queryByText(UNDO_OUTCOME)).toBeNull();
  });

  it('shows the refusal on its row and keeps the control live', () => {
    const onReopen = renderView([answered(), answered({ id: 8, question: 'Other row.' })], {
      resolveError: new Error(REOPEN_TWIN),
      resolveErrorId: 7,
    });

    const alerts = screen.getAllByRole('alert');
    expect(alerts).toHaveLength(1);
    expect(alerts[0].textContent).toContain('That change was not saved');
    expect(alerts[0].textContent).toContain(REOPEN_TWIN);

    fireEvent.click(screen.getAllByRole('button', { name: 'Undo' })[0]);
    expect(onReopen).toHaveBeenCalledWith(7);
  });
});

describe('latestWrite — which of the three Inbox writes a card answers for', () => {
  it('picks the write sent last, whatever its position', () => {
    expect(
      latestWrite([
        { at: 100, id: 7, detail: 'undo' },
        { at: 300, id: 12, detail: 'answer' },
        { at: 200, id: 9, detail: 'choice' },
      ]),
    ).toEqual({ at: 300, id: 12, detail: 'answer' });
  });

  it('skips writes with nothing to report', () => {
    expect(latestWrite([null, { at: 5, id: 3, detail: 'x' }, null])).toEqual({ at: 5, id: 3, detail: 'x' });
    expect(latestWrite([null, null])).toBeNull();
    expect(latestWrite([])).toBeNull();
  });

  it('keeps the first of two writes sent at the same instant', () => {
    expect(latestWrite([{ at: 1, id: 1, detail: 'a' }, { at: 1, id: 2, detail: 'b' }])?.id).toBe(1);
  });
});

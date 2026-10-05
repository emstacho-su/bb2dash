/**
 * Undo on an Inbox card: an answered, unapplied row under "Answered, not
 * applied" offers Undo with the sentence that says what it changes; an applied,
 * archived or open row does not; the press hands the row's id up; a pending or
 * failed undo reads like any other write on the card.
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
const { normalizeSyncStatus } = await import('@/lib/queries.sync');
const { REOPEN_TWIN, UNDO_OUTCOME } = await import('@/lib/queries.inboxReopen');

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
    renderView([answered({ state: 'dismissed', resolution: null, resolution_note: null })]);
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

  it('is absent when the screen was not given a way to reopen', () => {
    render(<InboxView items={[answered()]} status={status} initialTab="answered" onResolve={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull();
  });
});

describe('Inbox undo — in flight and failed', () => {
  it('is disabled while its row has a write in flight', () => {
    renderView([answered()], { pendingId: 7 });
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
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

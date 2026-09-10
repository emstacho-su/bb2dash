/**
 * The Inbox: how the queue is grouped, and exactly what each per-kind control
 * hands up when Stack answers it — including the free-text "why".
 *
 * `InboxView` is rendered on its own with fixture rows and a spy resolver, so
 * no query client, no router and no network are involved. The Supabase browser
 * client is mocked because the module graph reaches it through the query layer.
 */

import { fireEvent, render, screen, within } from '@testing-library/react';
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

const { InboxView, answerTypeFor, sourceText } = await import('@/app/(app)/inbox/Inbox');
const { normalizeSyncStatus } = await import('@/lib/queries.sync');

const status = normalizeSyncStatus(makeSyncStatusRow());

function renderInbox(items: ReturnType<typeof makeAttentionItem>[]) {
  const onResolve = vi.fn();
  render(<InboxView items={items} status={status} onResolve={onResolve} />);
  return onResolve;
}

/** Type a "why" into the row for `id` and return nothing — the spy has the rest. */
function typeNote(id: number, text: string) {
  fireEvent.change(screen.getByLabelText(`Why for item ${id}`), { target: { value: text } });
}

describe('Inbox — grouping', () => {
  it('groups rows by kind, in Inbox order, and skips kinds with no rows', () => {
    renderInbox([
      makeAttentionItem({ id: 1, kind: 'missing', question: 'No date on Reading 4.' }),
      makeAttentionItem({ id: 2, kind: 'conflict', question: 'Quiz 2 moved.' }),
      makeAttentionItem({ id: 3, kind: 'stack_must_confirm', question: 'Supervisor name?' }),
      makeAttentionItem({ id: 4, kind: 'conflict', question: 'Project 1A moved.' }),
    ]);

    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(headings).toEqual(['Conflicts', 'Needs your input', 'Missing']);

    const conflicts = screen.getByRole('region', { name: 'Conflicts' });
    expect(within(conflicts).getByText('Quiz 2 moved.')).toBeInTheDocument();
    expect(within(conflicts).getByText('Project 1A moved.')).toBeInTheDocument();
    expect(within(conflicts).queryByText('Supervisor name?')).toBeNull();
  });

  it('collapses dismissed rows under a "dismissed (n)" toggle', () => {
    renderInbox([
      makeAttentionItem({ id: 1, kind: 'conflict', question: 'Still open.' }),
      makeAttentionItem({
        id: 2,
        kind: 'data_gap',
        question: 'Already dismissed.',
        state: 'dismissed',
        resolved_at: '2026-09-09T10:00:00.000Z',
      }),
    ]);

    expect(screen.queryByText('Already dismissed.')).toBeNull();
    const toggle = screen.getByRole('button', { name: /dismissed \(1\)/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(toggle);
    expect(screen.getByText('Already dismissed.')).toBeInTheDocument();
  });

  it('shows the open count and the freshness line in the header', () => {
    renderInbox([
      makeAttentionItem({ id: 1 }),
      makeAttentionItem({ id: 2, state: 'resolved', resolved_at: '2026-09-09T10:00:00.000Z' }),
    ]);
    expect(screen.getByText('1 open item')).toBeInTheDocument();
    expect(screen.getByText(/last synced/)).toBeInTheDocument();
  });
});

describe('Inbox — state chip', () => {
  it('says "answered, applies on next sync" until the transform stamps applied_at', () => {
    renderInbox([
      makeAttentionItem({
        id: 1,
        state: 'resolved',
        resolved_at: '2026-09-10T10:00:00.000Z',
        resolution: { accept: 'blackboard' },
        resolution_note: 'the syllabus agrees',
        applied_at: null,
      }),
    ]);
    expect(screen.getByText('answered, applies on next sync')).toBeInTheDocument();
    expect(screen.getByText('“the syllabus agrees”')).toBeInTheDocument();
  });

  it('says "applied" once applied_at is set, and offers no controls', () => {
    renderInbox([
      makeAttentionItem({
        id: 1,
        state: 'resolved',
        resolved_at: '2026-09-10T10:00:00.000Z',
        applied_at: '2026-09-10T11:00:00.000Z',
      }),
    ]);
    expect(screen.getByText('applied')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Accept Blackboard' })).toBeNull();
  });
});

describe('Inbox — the resolve payload per kind', () => {
  it('conflict: Accept Blackboard sends accept=blackboard with the note', () => {
    const onResolve = renderInbox([makeAttentionItem({ id: 7, kind: 'conflict' })]);
    typeNote(7, 'the syllabus agrees');
    fireEvent.click(screen.getByRole('button', { name: 'Accept Blackboard' }));

    expect(onResolve).toHaveBeenCalledWith({
      id: 7,
      kind: 'conflict',
      accept: 'blackboard',
      note: 'the syllabus agrees',
    });
  });

  it('conflict: Keep mine sends accept=keep with the note', () => {
    const onResolve = renderInbox([makeAttentionItem({ id: 7, kind: 'conflict' })]);
    typeNote(7, 'I asked in class');
    fireEvent.click(screen.getByRole('button', { name: 'Keep mine' }));

    expect(onResolve).toHaveBeenCalledWith({
      id: 7,
      kind: 'conflict',
      accept: 'keep',
      note: 'I asked in class',
    });
  });

  it('stack_must_confirm: a date field sends a date answer with the note', () => {
    const onResolve = renderInbox([
      makeAttentionItem({
        id: 11,
        kind: 'stack_must_confirm',
        field: 'start_date',
        from_value: null,
        to_value: null,
        question: 'When does the internship start?',
      }),
    ]);

    fireEvent.change(screen.getByLabelText('Answer for item 11'), {
      target: { value: '2026-10-01' },
    });
    typeNote(11, 'from the agreement');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(onResolve).toHaveBeenCalledWith({
      id: 11,
      kind: 'stack_must_confirm',
      answer: '2026-10-01',
      answerType: 'date',
      note: 'from the agreement',
    });
  });

  it('missing: a non-date field sends a text answer with the note', () => {
    const onResolve = renderInbox([
      makeAttentionItem({
        id: 12,
        kind: 'missing',
        field: 'group_number',
        from_value: null,
        to_value: null,
      }),
    ]);

    fireEvent.change(screen.getByLabelText('Answer for item 12'), { target: { value: 'Group 4' } });
    typeNote(12, 'roster email');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(onResolve).toHaveBeenCalledWith({
      id: 12,
      kind: 'missing',
      answer: 'Group 4',
      answerType: 'text',
      note: 'roster email',
    });
  });

  it('Save stays disabled until there is an answer to save', () => {
    renderInbox([makeAttentionItem({ id: 12, kind: 'missing', field: 'group_number' })]);
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it.each(['data_gap', 'deadline'] as const)(
    '%s: Dismiss sends only the kind and the note',
    (kind) => {
      const onResolve = renderInbox([makeAttentionItem({ id: 3, kind })]);
      typeNote(3, 'not a real gap');
      fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
      expect(onResolve).toHaveBeenCalledWith({ id: 3, kind, note: 'not a real gap' });
    },
  );

  it('caps the why field at the same 500 characters the query layer enforces', () => {
    renderInbox([makeAttentionItem({ id: 7 })]);
    expect(screen.getByLabelText('Why for item 7')).toHaveAttribute('maxlength', '500');
  });
});

describe('Inbox — what a row shows', () => {
  it('renders the course, the question, from → to and the source', () => {
    renderInbox([makeAttentionItem({ id: 7 })]);
    expect(screen.getByText('IST.323')).toBeInTheDocument();
    expect(
      screen.getByText('Blackboard moved Quiz 2 from 9/2 to 9/9. Which is right?'),
    ).toBeInTheDocument();
    expect(screen.getByText('2026-09-02')).toBeInTheDocument();
    expect(screen.getByText('2026-09-09')).toBeInTheDocument();
    expect(screen.getByText('assignment · IST.323.quiz-2 · due_at · run #42')).toBeInTheDocument();
  });

  it('shows a suggested answer when the transform offered one', () => {
    renderInbox([makeAttentionItem({ id: 7, suggested: 'IST.323 Quiz 2' })]);
    expect(screen.getByText('suggested')).toBeInTheDocument();
    expect(screen.getByText('IST.323 Quiz 2')).toBeInTheDocument();
  });
});

describe('Inbox — pure helpers', () => {
  it('picks a date input only for date-shaped fields', () => {
    expect(answerTypeFor({ field: 'due_at' })).toBe('date');
    expect(answerTypeFor({ field: 'for_date' })).toBe('date');
    expect(answerTypeFor({ field: 'start_date' })).toBe('date');
    expect(answerTypeFor({ field: 'supervisor_name' })).toBe('text');
    expect(answerTypeFor({ field: null })).toBe('text');
  });

  it('names the source without inventing one', () => {
    expect(
      sourceText(makeAttentionItem({ entity: null, ref: null, field: null, raised_by: null })),
    ).toBe('raised by the transform');
  });
});

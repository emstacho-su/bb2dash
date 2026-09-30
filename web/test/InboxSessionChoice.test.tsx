/**
 * R3-3 walk finding — a machine question reads as a choice, never as JSON.
 *
 * Phase 18's migration 123 raises a `stack_must_confirm` per file whose week
 * holds several class sessions: `to_value` is the candidate session ids and
 * `suggested` carries `{source, file_id, week_no, candidates, answer_with}`,
 * where `answer_with` is the template the fold reads back
 * (`{"session_id": <one of candidates>} or {"accept": "none"}`). The card must
 * show neither the ids nor the template: each candidate is a button labelled
 * with its session's date and topic, plus "None of these", and choosing one
 * writes exactly the shape `answer_with` names.
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

const { InboxView } = await import('@/app/(app)/inbox/Inbox');
const { normalizeSyncStatus } = await import('@/lib/queries.sync');
const { buildChoicePatch, parseSessionChoice, sessionLabel } = await import(
  '@/lib/queries.inboxChoice'
);

const status = normalizeSyncStatus(makeSyncStatusRow());

const ANSWER_WITH = '{"session_id": <one of candidates>} or {"accept": "none"}';

function linkItem(overrides: Parameters<typeof makeAttentionItem>[0] = {}) {
  return makeAttentionItem({
    id: 31,
    kind: 'stack_must_confirm',
    course_id: 'IST.323',
    entity: 'bb_file',
    ref: 'session_link/140',
    field: 'session_id',
    from_value: null,
    to_value: [72, 73],
    question:
      'IST.323: the file "Week5.pptx" belongs to week 5, which has 2 class sessions. Which session is it for?',
    suggested: {
      source: 'link_file_sessions',
      file_id: 140,
      week_no: 5,
      candidates: [72, 73],
      answer_with: ANSWER_WITH,
    },
    ...overrides,
  });
}

const LABELS = new Map<number, string>([
  [72, 'Mon, Sep 21 · Requirements'],
  [73, 'Wed, Sep 23 · Use cases'],
]);

/** `null` renders the card before the session labels have arrived. */
function renderCard(labels: Map<number, string> | null = LABELS) {
  const onResolve = vi.fn();
  const onChoose = vi.fn();
  const view = render(
    <InboxView
      items={[linkItem()]}
      status={status}
      onResolve={onResolve}
      onChoose={onChoose}
      sessionLabels={labels ?? undefined}
    />,
  );
  return { ...view, onResolve, onChoose };
}

describe('parseSessionChoice — read from the row, never guessed', () => {
  it('reads the candidates, the pick key and the none shape out of answer_with', () => {
    expect(parseSessionChoice(linkItem())).toEqual({
      candidates: [72, 73],
      pickKey: 'session_id',
      none: { accept: 'none' },
    });
  });

  it('answers null for a row that is not a candidate question', () => {
    expect(parseSessionChoice(makeAttentionItem({ suggested: { source: 'stage_assignments' } }))).toBeNull();
    expect(parseSessionChoice(makeAttentionItem({ suggested: 'IST.323 Quiz 2' }))).toBeNull();
  });

  it('answers null when the template names no pick key', () => {
    const item = linkItem({
      suggested: { source: 'link_file_sessions', candidates: [72, 73], answer_with: 'pick one' },
    });
    expect(parseSessionChoice(item)).toBeNull();
  });

  it('drops candidates that are not positive whole numbers', () => {
    const item = linkItem({
      suggested: { candidates: [72, 'x', -1, 73.5], answer_with: ANSWER_WITH },
    });
    expect(parseSessionChoice(item)?.candidates).toEqual([72]);
  });

  it('offers no none-choice when the template has none', () => {
    const item = linkItem({
      suggested: { candidates: [72, 73], answer_with: '{"session_id": <one of candidates>}' },
    });
    expect(parseSessionChoice(item)?.none).toBeNull();
  });
});

describe('sessionLabel', () => {
  it('names the date and the topic', () => {
    expect(sessionLabel({ id: 72, session_date: '2026-09-21', topic: 'Requirements', kind: 'lecture' }, new Date('2026-09-29T12:00:00Z'))).toBe(
      'Mon, Sep 21 · Requirements',
    );
  });

  it('falls back to the kind when there is no topic', () => {
    expect(sessionLabel({ id: 72, session_date: '2026-09-21', topic: null, kind: 'lab' }, new Date('2026-09-29T12:00:00Z'))).toBe(
      'Mon, Sep 21 · lab',
    );
  });
});

describe('buildChoicePatch — the columns a choice writes', () => {
  it('resolves the row with exactly the chosen shape and the note', () => {
    const now = new Date('2026-09-29T15:00:00.000Z');
    expect(buildChoicePatch({ id: 31, resolution: { session_id: 73 }, note: ' slides say Wed ' }, now)).toEqual({
      state: 'resolved',
      resolved_at: '2026-09-29T15:00:00.000Z',
      resolution: { session_id: 73 },
      resolution_note: 'slides say Wed',
    });
  });

  it('refuses a bad row id', () => {
    expect(() => buildChoicePatch({ id: 0, resolution: { accept: 'none' } })).toThrow();
  });
});

describe('Inbox card — a session question', () => {
  it('renders no JSON and no internal key', () => {
    const { container } = renderCard();
    const text = container.textContent ?? '';
    expect(text).not.toContain('{');
    expect(text).not.toContain('session_id');
    expect(text).not.toContain('answer_with');
    expect(text).not.toContain('link_file_sessions');
    expect(text).not.toContain('[72');
  });

  it('offers one button per candidate, labelled with its date and topic, plus None of these', () => {
    renderCard();
    const card = within(screen.getByRole('article'));
    expect(card.getByRole('button', { name: 'Mon, Sep 21 · Requirements' })).toBeInTheDocument();
    expect(card.getByRole('button', { name: 'Wed, Sep 23 · Use cases' })).toBeInTheDocument();
    expect(card.getByRole('button', { name: 'None of these' })).toBeInTheDocument();
  });

  it('shows no Blackboard pane of bare ids and no free-text box', () => {
    renderCard();
    expect(screen.queryByRole('group', { name: 'Blackboard' })).toBeNull();
    expect(screen.queryByLabelText('Answer for item 31')).toBeNull();
  });

  it('choosing a session sends exactly {session_id: <id>} with the note', () => {
    const { onChoose, onResolve } = renderCard();
    fireEvent.change(screen.getByLabelText('Why for item 31'), { target: { value: 'slides say Wed' } });
    fireEvent.click(screen.getByRole('button', { name: 'Wed, Sep 23 · Use cases' }));
    expect(onChoose).toHaveBeenCalledWith({ id: 31, resolution: { session_id: 73 }, note: 'slides say Wed' });
    expect(onResolve).not.toHaveBeenCalled();
  });

  it('None of these sends the none shape the template names', () => {
    const { onChoose } = renderCard();
    fireEvent.click(screen.getByRole('button', { name: 'None of these' }));
    expect(onChoose).toHaveBeenCalledWith({ id: 31, resolution: { accept: 'none' }, note: '' });
  });

  it('waits for the labels rather than showing ids', () => {
    renderCard(null);
    const card = within(screen.getByRole('article'));
    expect(card.queryByText(/72|73/)).toBeNull();
    for (const button of card.getAllByRole('button', { name: /loading/ })) {
      expect(button).toBeDisabled();
    }
  });
});

describe('Inbox card — any other payload', () => {
  it('keeps internal keys out of sight behind a details disclosure', () => {
    render(
      <InboxView
        items={[makeAttentionItem({ id: 7, suggested: { source: 'stage_assignments', column_id: '_1_1' } })]}
        status={status}
        onResolve={vi.fn()}
      />,
    );
    expect(screen.queryByRole('group', { name: 'Suggestion' })).toBeNull();
    const details = screen.getByText('details').closest('details');
    expect(details).not.toBeNull();
    expect(details).not.toHaveAttribute('open');
    expect(within(details as HTMLElement).getByText('stage_assignments')).toBeInTheDocument();
  });

  it('never prints a template string that carries braces, even in the details', () => {
    const { container } = render(
      <InboxView
        items={[makeAttentionItem({ id: 7, suggested: { source: 'x', answer_with: '{"value": <text>}' } })]}
        status={status}
        onResolve={vi.fn()}
      />,
    );
    expect(container.textContent).not.toContain('{');
  });

  it('omits a pane whose value is only a list of ids', () => {
    render(
      <InboxView
        items={[makeAttentionItem({ id: 8, field: 'session_id', from_value: null, to_value: [1, 2] })]}
        status={status}
        onResolve={vi.fn()}
      />,
    );
    expect(screen.queryByRole('group', { name: 'Blackboard' })).toBeNull();
  });
});

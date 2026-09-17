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

const { InboxView, answerTypeFor, failureText, sourceHref, sourceText } = await import(
  '@/app/(app)/inbox/Inbox',
);
const { normalizeSyncStatus, INBOX_APPLY_HELP, RECORDED_ONLY } = await import(
  '@/lib/queries.sync',
);

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

  /* -----------------------------------------------------------------------
   * F-4 (I-2 / P-inbox-2), found on the PM's browser walk.
   *
   * Every answered row said "answered, applies on next sync", including the
   * kinds apply_resolutions() skips entirely — a staff-name conflict, a
   * course-level confirm, an ambiguous gradebook column. Those never apply, so
   * the chip was promising something that will never happen, on rows that will
   * carry it for the rest of the term.
   *
   * The chip reads the SAME predicate the button sentences read
   * (`outcomeApplies`, via `appliesAutomatically`), so the two can never
   * disagree about a row.
   * -------------------------------------------------------------------- */

  const resolvedAt = { state: 'resolved' as const, resolved_at: '2026-09-10T10:00:00.000Z' };

  it('says "recorded only" on a resolved staff-name conflict', () => {
    renderInbox([
      makeAttentionItem({
        id: 2,
        ...resolvedAt,
        entity: 'course_staff',
        ref: 'staff:_34252_1',
        field: 'name',
        resolution: { accept: 'blackboard' },
        applied_at: null,
      }),
    ]);
    expect(screen.getByText('answered · recorded only')).toBeInTheDocument();
    expect(screen.queryByText('answered, applies on next sync')).toBeNull();
  });

  it('says "recorded only" on a resolved course-level confirm', () => {
    renderInbox([
      makeAttentionItem({
        id: 3,
        ...resolvedAt,
        kind: 'stack_must_confirm',
        entity: 'course',
        ref: 'course_field:academic_advisor',
        field: null,
        resolution: { value: 'Dr Chen', value_type: 'text' },
        applied_at: null,
      }),
    ]);
    expect(screen.getByText('answered · recorded only')).toBeInTheDocument();
  });

  it('says "recorded only" on a resolved ambiguous gradebook column', () => {
    renderInbox([
      makeAttentionItem({
        id: 4,
        ...resolvedAt,
        ref: 'column:_3569973_1',
        field: 'bb_column_id',
        resolution: { accept: 'blackboard' },
        applied_at: null,
      }),
    ]);
    expect(screen.getByText('answered · recorded only')).toBeInTheDocument();
  });

  it('keeps the promise on a row that really will apply', () => {
    // An assignment due_at conflict — the kind apply_resolutions() writes.
    renderInbox([
      makeAttentionItem({ id: 5, ...resolvedAt, resolution: { accept: 'blackboard' } }),
    ]);
    expect(screen.getByText('answered, applies on next sync')).toBeInTheDocument();
    expect(screen.queryByText('answered · recorded only')).toBeNull();
  });

  it('keeps it for "Keep mine" too, which writes confidence and needs no field', () => {
    renderInbox([
      makeAttentionItem({
        id: 6,
        ...resolvedAt,
        field: 'bb_column_id',
        resolution: { accept: 'keep' },
        applied_at: null,
      }),
    ]);
    expect(screen.getByText('answered, applies on next sync')).toBeInTheDocument();
  });

  it('shows a dismissal as dismissed, never as "applies on next sync"', () => {
    renderInbox([
      makeAttentionItem({
        id: 7,
        kind: 'data_gap',
        entity: 'bb_file',
        ref: '117',
        state: 'dismissed',
        resolved_at: '2026-09-10T10:00:00.000Z',
        resolution: { dismissed: true },
        applied_at: null,
      }),
    ]);
    fireEvent.click(screen.getByRole('button', { name: /dismissed \(1\)/ }));
    expect(screen.queryByText('answered, applies on next sync')).toBeNull();
  });

  it('says "recorded only" on an answer it cannot classify at all', () => {
    renderInbox([
      makeAttentionItem({ id: 8, ...resolvedAt, resolution: {}, applied_at: null }),
    ]);
    expect(screen.getByText('answered · recorded only')).toBeInTheDocument();
  });

  it('still says "applied" once the transform has stamped it', () => {
    renderInbox([
      makeAttentionItem({
        id: 9,
        ...resolvedAt,
        entity: 'course_staff',
        ref: 'staff:_1',
        applied_at: '2026-09-10T11:00:00.000Z',
      }),
    ]);
    expect(screen.getByText('applied')).toBeInTheDocument();
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

/* ---------------------------------------------------------------------------
 * I-3 / P-inbox-3 — the row's anatomy
 *
 * The row used to be a course id, a question, two raw jsonb values, one
 * `entity · ref · field · run #42` line and, when the stage had offered one,
 * `JSON.stringify(suggested)`. No age, no link, and braces on screen.
 * ------------------------------------------------------------------------ */

describe('Inbox — what a row shows', () => {
  it('names the course the way the rest of the app does', () => {
    renderInbox([makeAttentionItem({ id: 7 })]);
    expect(screen.getByText('IST 323')).toBeInTheDocument();
  });

  it('shows the question as written', () => {
    renderInbox([makeAttentionItem({ id: 7 })]);
    expect(
      screen.getByText('Blackboard moved Quiz 2 from 9/2 to 9/9. Which is right?'),
    ).toBeInTheDocument();
  });

  it('shows how old the question is, with the exact time behind it', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-13T14:00:00.000Z'));
    renderInbox([makeAttentionItem({ id: 7, raised_at: '2026-09-10T14:00:00.000Z' })]);
    const age = screen.getByText('3 days ago');
    expect(age).toHaveAttribute('title', '2026-09-10T14:00:00.000Z');
    vi.useRealTimers();
  });

  it('formats from and to as dates, under the field they belong to', () => {
    renderInbox([makeAttentionItem({ id: 7 })]);
    expect(screen.getByText('due date')).toBeInTheDocument();
    expect(screen.getByText('Wed, Sep 2')).toBeInTheDocument();
    expect(screen.getByText('Wed, Sep 9')).toBeInTheDocument();
    // …and not as the raw column values they used to be.
    expect(screen.queryByText('2026-09-02')).toBeNull();
  });

  it('says where the question came from in words, with the run number', () => {
    renderInbox([makeAttentionItem({ id: 7 })]);
    expect(
      screen.getByText(
        'From the assignment “quiz-2” in IST 323, about its due date. Raised by sync run #42.',
      ),
    ).toBeInTheDocument();
  });

  it('links an assignment row to that assignment', () => {
    renderInbox([makeAttentionItem({ id: 7 })]);
    expect(screen.getByRole('link', { name: 'Open the assignment →' })).toHaveAttribute(
      'href',
      '?item=assignment%3AIST.323%2Fquiz-2',
    );
  });

  it('links a course-level row to the course instead', () => {
    renderInbox([
      makeAttentionItem({
        id: 8,
        kind: 'stack_must_confirm',
        entity: 'course',
        ref: 'course_field:academic_advisor',
        field: null,
      }),
    ]);
    expect(screen.getByRole('link', { name: 'Open IST 323 →' })).toHaveAttribute(
      'href',
      '/course/IST.323',
    );
  });

  it('describes a course-map seed as one, not as a column name', () => {
    renderInbox([
      makeAttentionItem({
        id: 8,
        kind: 'stack_must_confirm',
        entity: 'course',
        ref: 'course_field:academic_advisor',
        field: null,
      }),
    ]);
    expect(
      screen.getByText(
        'From the course record in IST 323, field “academic advisor”. Raised by sync run #42.',
      ),
    ).toBeInTheDocument();
  });

  it('describes an ambiguous gradebook column as one', () => {
    renderInbox([
      makeAttentionItem({ id: 9, ref: 'column:_3569973_1', field: 'bb_column_id' }),
    ]);
    expect(screen.getByText(/the gradebook column _3569973_1 in IST 323/)).toBeInTheDocument();
  });

  it('shows the stage payload as labelled words, never as jsonb', () => {
    renderInbox([
      makeAttentionItem({
        id: 7,
        suggested: {
          due: '2026-09-14T16:50:00+00:00',
          possible: 0,
          column_id: '_3613591_1',
          source: 'stage_assignments',
        },
      }),
    ]);

    expect(screen.getByText('column id')).toBeInTheDocument();
    expect(screen.getByText('_3613591_1')).toBeInTheDocument();
    expect(screen.getByText('Mon, Sep 14, 12:50 PM')).toBeInTheDocument();
    expect(screen.getByText('stage_assignments')).toBeInTheDocument();
  });

  it('puts no raw JSON on the screen at all', () => {
    const { container } = render(
      <InboxView
        items={[
          makeAttentionItem({
            id: 7,
            suggested: { gap: { what: 'Meeting days Mon vs Mon/Wed', owner: 'stack' }, version: 3 },
          }),
        ]}
        status={status}
        onResolve={vi.fn()}
      />,
    );
    const text = container.textContent ?? '';
    expect(text).not.toMatch(/[{}]/);
    expect(text).not.toContain('"');
    // …and the content is still all there, in words.
    expect(text).toContain('Meeting days Mon vs Mon/Wed');
    expect(text).toContain('owner stack');
  });

  it('shows a plain suggested answer without a label it does not have', () => {
    renderInbox([makeAttentionItem({ id: 7, suggested: 'IST.323 Quiz 2' })]);
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
      sourceText(
        makeAttentionItem({
          entity: null,
          ref: null,
          field: null,
          raised_by: null,
          course_id: null,
        }),
      ),
    ).toBe('From the sync. Raised by the transform.');
  });

  it('offers no link when there is no row bb2dash can show', () => {
    expect(
      sourceHref(makeAttentionItem({ entity: null, ref: null, course_id: null })),
    ).toBeNull();
    // A pseudo-ref names no assignment, so it falls back to the course.
    expect(sourceHref(makeAttentionItem({ ref: 'column:_1_1' }))).toBe('/course/IST.323');
  });
});

describe('Inbox — a failed resolve', () => {
  /** `resolve.mutate` never throws; the failure arrives as the mutation's error. */
  function renderWithFailure(error: Error | null, errorId: number | null) {
    const onResolve = vi.fn();
    render(
      <InboxView
        items={[makeAttentionItem({ id: 7 }), makeAttentionItem({ id: 8, question: 'Other row.' })]}
        status={status}
        pendingId={null}
        resolveError={error}
        resolveErrorId={errorId}
        onResolve={onResolve}
      />,
    );
    return onResolve;
  }

  it('shows the database message on the row it came from, and nowhere else', () => {
    renderWithFailure(
      new Error('new row violates row-level security policy for table "attention_items"'),
      7,
    );

    const alerts = screen.getAllByRole('alert');
    expect(alerts).toHaveLength(1);
    expect(alerts[0].textContent).toContain('row-level security');
    expect(alerts[0].textContent).toContain('not saved');
  });

  it('leaves the controls live so the answer can be sent again', () => {
    const onResolve = renderWithFailure(new Error('network error'), 7);

    const keepMine = screen.getAllByRole('button', { name: 'Keep mine' })[0];
    expect(keepMine).not.toBeDisabled();

    fireEvent.click(keepMine);
    expect(onResolve).toHaveBeenCalledWith({ id: 7, kind: 'conflict', accept: 'keep', note: '' });
  });

  it('says nothing when the last resolve went through', () => {
    renderWithFailure(null, null);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('renders a PostgrestError, which is not an Error instance, and never "undefined"', () => {
    expect(failureText({ message: 'permission denied for table attention_items' })).toBe(
      'permission denied for table attention_items',
    );
    expect(failureText({})).toBe('the database rejected the change');
    expect(failureText(null)).toBe('the database rejected the change');
  });
});

/* ---------------------------------------------------------------------------
 * I-2 / P-inbox-2 — what each control says it will do
 *
 * The sentences themselves are covered exhaustively in
 * test/queries.sync.outcome.test.ts. What is under test here is that the screen
 * puts one under every control it renders, and states the rule once at the top.
 * ------------------------------------------------------------------------ */

describe('Inbox — the outcome under each button', () => {
  it('states both outcomes of a due-date conflict, with real dates', () => {
    renderInbox([makeAttentionItem({ id: 1, kind: 'conflict' })]);

    expect(
      screen.getByText('Sets this assignment’s due date to Wed, Sep 9.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Keeps this assignment’s due date at Wed, Sep 2 and marks it confirmed, ' +
          'so the next sync stops asking.',
      ),
    ).toBeInTheDocument();
  });

  it('says "recorded only" under a control nothing applies', () => {
    renderInbox([
      makeAttentionItem({
        id: 2,
        kind: 'stack_must_confirm',
        entity: 'course',
        ref: 'course_field:academic_advisor',
        field: null,
        question: 'Who is your academic advisor?',
      }),
    ]);
    expect(screen.getByText(RECORDED_ONLY)).toBeInTheDocument();
  });

  it('says a dismissal closes the row and stops the asking', () => {
    renderInbox([
      makeAttentionItem({ id: 3, kind: 'data_gap', entity: 'bb_file', ref: '117' }),
    ]);
    expect(screen.getByText(/The row closes and the sync stops asking\./)).toBeInTheDocument();
  });

  it('names the destination under a typed answer', () => {
    renderInbox([makeAttentionItem({ id: 4, kind: 'missing', field: 'due_at' })]);
    expect(
      screen.getByText('Saves what you type as this assignment’s due date.'),
    ).toBeInTheDocument();
  });

  it('leaves no control without a sentence beside it', () => {
    renderInbox([
      makeAttentionItem({ id: 1, kind: 'conflict' }),
      makeAttentionItem({ id: 2, kind: 'missing' }),
      makeAttentionItem({ id: 3, kind: 'data_gap', entity: 'bb_file', ref: '117' }),
    ]);
    const controls = screen
      .getAllByRole('button')
      .filter((button) =>
        ['Accept Blackboard', 'Keep mine', 'Save', 'Dismiss'].includes(
          button.textContent ?? '',
        ),
      );
    expect(controls).toHaveLength(4);
    for (const control of controls) {
      const choice = control.closest('[class*="choice"]');
      expect(choice, control.textContent ?? '').not.toBeNull();
      expect(choice?.textContent).toMatch(/\.$/);
    }
  });

  it('states the rule once, at the top of the screen', () => {
    renderInbox([makeAttentionItem({ id: 1 })]);
    expect(screen.getByText(INBOX_APPLY_HELP)).toBeInTheDocument();
  });
});

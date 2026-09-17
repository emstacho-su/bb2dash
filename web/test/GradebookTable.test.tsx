/**
 * What the gradebook table actually draws.
 *
 * The honesty rules are the point of these tests: an ungraded item must read
 * `—` and never `0`, the instructor's feedback must reach the DOM as text (not
 * as markup) and in full once it is expanded, and which rows sit among the
 * items must follow `counts_toward_grade` rather than a list of column names
 * baked into the client.
 */

import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readStoredSections, writeStoredSection } from '@/lib/grades-sections';
import {
  ECN304_ATTENDANCE,
  IST323_LETTER,
  IST323_QUIZ,
  IST323_TOTAL,
  IST352_SUBMITTED,
  makeGradebookRow,
} from './factories.grades';
import type { GradebookLatestRow } from '@/lib/queries.grades';

vi.mock('@/lib/supabase/client', () => ({
  getSupabaseBrowserClient: () => ({ from: vi.fn(), auth: { getSession: vi.fn() } }),
}));
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

const { GradebookTable } = await import('@/components/grades/GradebookTable');

function renderTable(rows: GradebookLatestRow[]) {
  return render(<GradebookTable rows={rows} />);
}

/** The row a name sits in, so a cell can be read next to its own item. */
function rowFor(name: string): HTMLElement {
  return screen.getByText(name).closest('tr') as HTMLElement;
}

afterEach(() => window.localStorage.clear());

describe('GradebookTable — item rows', () => {
  it('shows the score, the points possible, the status and when we saw it', () => {
    renderTable([IST323_QUIZ]);
    const row = rowFor('Quiz 2');
    expect(within(row).getByText('10 / 10')).toBeInTheDocument();
    expect(within(row).getByText('graded')).toBeInTheDocument();
    expect(within(row).getByText('Sep 14, 2:31 PM')).toBeInTheDocument();
  });

  it('renders an em dash for an ungraded item — never a zero', () => {
    renderTable([IST352_SUBMITTED]);
    const row = rowFor('Assignment 1');
    expect(within(row).getByText('—')).toBeInTheDocument();
    expect(within(row).queryByText('0 / 50')).toBeNull();
    expect(within(row).getByText('submitted')).toBeInTheDocument();
    expect(within(row).getByText('last attempt: NEEDS_GRADING')).toBeInTheDocument();
  });

  it('links an item with a linked assignment to its popout', () => {
    renderTable([IST323_QUIZ]);
    expect(screen.getByRole('link', { name: 'Quiz 2' })).toHaveAttribute(
      'href',
      '?item=assignment%3AIST.323%2Fquiz-2',
    );
  });

  it('does not offer a link when no single assignment is linked', () => {
    renderTable([makeGradebookRow({ name: 'Orphan column', assignment_id: null, linked_assignments: 0 })]);
    expect(screen.queryByRole('link', { name: 'Orphan column' })).toBeNull();
    expect(screen.getByText('Orphan column')).toBeInTheDocument();
  });

  it('says so when a column is linked to more than one assignment', () => {
    renderTable([
      makeGradebookRow({ name: 'Ambiguous', assignment_id: null, linked_assignments: 2 }),
    ]);
    expect(screen.getByText(/linked to 2 assignments/)).toBeInTheDocument();
  });

  it('says nothing at all when no column has been pulled', () => {
    renderTable([]);
    expect(screen.getByText(/No gradebook columns have been pulled/)).toBeInTheDocument();
  });
});

/* G-4 / P-grades-6: "graded" and "last attempt: COMPLETED" are one fact. */
describe('GradebookTable — the submission cell says one thing (G-4)', () => {
  it('renders one label for a GRADED column whose last attempt is COMPLETED', () => {
    renderTable([
      makeGradebookRow({
        name: 'Lab #2',
        submission_status: 'GRADED',
        last_attempt_status: 'COMPLETED',
      }),
    ]);
    const row = rowFor('Lab #2');
    expect(within(row).getByText('graded')).toBeInTheDocument();
    expect(within(row).queryByText(/last attempt/)).toBeNull();
  });

  it('does the same for a SUBMITTED column whose last attempt is COMPLETED', () => {
    renderTable([
      makeGradebookRow({
        name: 'Lab #3',
        submission_status: 'SUBMITTED',
        last_attempt_status: 'COMPLETED',
      }),
    ]);
    expect(within(rowFor('Lab #3')).queryByText(/last attempt/)).toBeNull();
  });

  it('still shows an attempt status that says something else', () => {
    renderTable([IST352_SUBMITTED]);
    expect(within(rowFor('Assignment 1')).getByText('last attempt: NEEDS_GRADING')).toBeInTheDocument();
  });
});

/*
 * G-5 / P-grades-8, P-grades-9: the instructor's words and the score history
 * live in the assignment popout now. The table keeps the feedback disclosure
 * for a column with no linked assignment — there is no popout to send the
 * reader to, and the text must not become unreachable.
 */
describe('GradebookTable — feedback (G-5)', () => {
  const unlinkedWithMarkup = makeGradebookRow({
    name: 'Essay',
    assignment_id: null,
    linked_assignments: 0,
    feedback: '<b>Nice work</b> & <script>alert(1)</script>\nSee line 4.',
  });
  const linkedWithFeedback = makeGradebookRow({
    name: 'Lab #1',
    feedback: 'Solid. Watch the third assumption.',
  });

  it('sends a linked row\'s feedback to the popout instead of showing it inline', () => {
    renderTable([linkedWithFeedback]);
    expect(screen.queryByRole('button', { name: /Feedback/ })).toBeNull();
    expect(screen.queryByText(/Watch the third assumption/)).toBeNull();
  });

  it('keeps the disclosure on a column with no assignment to open', () => {
    renderTable([unlinkedWithMarkup]);
    expect(screen.getByRole('button', { name: 'Feedback from Essay' })).toBeInTheDocument();
  });

  it('escapes the instructor\'s text instead of rendering it as markup', () => {
    const { container } = renderTable([unlinkedWithMarkup]);
    expect(container.querySelector('b')).toBeNull();
    expect(container.querySelector('script')).toBeNull();
    expect(
      screen.getByText(/<b>Nice work<\/b> & <script>alert\(1\)<\/script>/),
    ).toBeInTheDocument();
  });

  it('starts collapsed and opens on the disclosure', () => {
    renderTable([unlinkedWithMarkup]);
    const toggle = screen.getByRole('button', { name: /Feedback/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(toggle);
    expect(screen.getByRole('button', { name: /Hide feedback/ })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(screen.getByText(/See line 4\./)).toHaveAttribute('data-expanded', 'true');
  });

  it('offers no disclosure when there is no feedback', () => {
    renderTable([IST352_SUBMITTED]);
    expect(screen.queryByRole('button', { name: /Feedback/ })).toBeNull();
  });
});

/*
 * G-6 / P-grades-10: a small superscript mark says an item has feedback. It
 * sits on the ITEM cell, because that cell is the link to the details
 * (Stack's answer 6).
 */
describe('GradebookTable — the feedback mark (G-6)', () => {
  const marked = makeGradebookRow({ name: 'Lab #1', feedback: 'Solid. Watch the third assumption.' });

  it('marks the item cell of a row that has feedback', () => {
    renderTable([marked]);
    const mark = screen.getByRole('note', { name: 'Lab #1 has feedback' });
    expect(mark).toBeInTheDocument();
    expect(mark.textContent).toBe('*');
  });

  it('puts the mark in the item cell, not the submission cell', () => {
    renderTable([marked]);
    const itemCell = screen.getByText('Lab #1').closest('th') as HTMLElement;
    expect(within(itemCell).getByRole('note')).toBeInTheDocument();
  });

  it.each([
    ['no feedback at all', null],
    ['an empty string', ''],
    ['whitespace only', '   \n '],
  ])('shows no mark for %s', (_why, feedback) => {
    renderTable([makeGradebookRow({ name: 'Lab #4', feedback })]);
    expect(screen.queryByRole('note')).toBeNull();
  });

  it('marks an unlinked column too, beside its own disclosure', () => {
    renderTable([
      makeGradebookRow({
        name: 'Orphan',
        assignment_id: null,
        linked_assignments: 0,
        feedback: 'See me.',
      }),
    ]);
    expect(screen.getByRole('note', { name: 'Orphan has feedback' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Feedback/ })).toBeInTheDocument();
  });

  it('points the mark at the popout only when there is one to open', () => {
    renderTable([marked]);
    expect(screen.getByRole('note')).toHaveAttribute(
      'title',
      'The instructor left feedback — open the item to read it.',
    );
  });

  it('points it at the row itself when the column opens nothing', () => {
    renderTable([
      makeGradebookRow({ name: 'Orphan', assignment_id: null, linked_assignments: 0, feedback: 'See me.' }),
    ]);
    expect(screen.getByRole('note')).toHaveAttribute(
      'title',
      'The instructor left feedback — it is under this row.',
    );
  });
});

describe('GradebookTable — the history toggle is gone (G-5)', () => {
  it('renders no history disclosure on any row', () => {
    renderTable([IST323_QUIZ, IST352_SUBMITTED, ECN304_ATTENDANCE]);
    expect(screen.queryByRole('button', { name: /history/ })).toBeNull();
  });
});

describe('GradebookTable — the bookkeeping group (answer 8)', () => {
  it('collapses attendance that counts toward nothing, with its count', () => {
    renderTable([IST323_QUIZ, ECN304_ATTENDANCE, IST323_LETTER]);

    expect(screen.queryByText('Attendance')).toBeNull();
    expect(screen.queryByText('Final Letter Grade')).toBeNull();

    const toggle = screen.getByRole('button', {
      name: 'Attendance and bookkeeping columns (2)',
    });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(toggle);
    expect(screen.getByText('Attendance')).toBeInTheDocument();
    expect(screen.getByText('Final Letter Grade')).toBeInTheDocument();
    // Still Blackboard's own figure, with its seen_at, and never summed.
    expect(within(rowFor('Attendance')).getByText('83.333 / 100')).toBeInTheDocument();
  });

  /* G-2 / P-grades-1: the inner group's state survives a reload too. */
  it('remembers being opened, under the key it was given', () => {
    render(
      <GradebookTable
        rows={[IST323_QUIZ, ECN304_ATTENDANCE, IST323_LETTER]}
        sectionKey="bookkeeping:IST.323"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /bookkeeping columns/ }));
    expect(readStoredSections()['bookkeeping:IST.323']).toBe('open');
  });

  it('starts open when that is what was stored', () => {
    writeStoredSection('bookkeeping:IST.323', 'open');
    render(
      <GradebookTable
        rows={[IST323_QUIZ, ECN304_ATTENDANCE, IST323_LETTER]}
        sectionKey="bookkeeping:IST.323"
      />,
    );
    expect(screen.getByText('Attendance')).toBeInTheDocument();
  });

  it('re-reads storage when the same table is given another course\'s key', () => {
    writeStoredSection('bookkeeping:IST.352', 'open');
    const rows = [IST323_QUIZ, ECN304_ATTENDANCE, IST323_LETTER];
    const { rerender } = render(<GradebookTable rows={rows} sectionKey="bookkeeping:IST.323" />);

    // Open this course's group, so the component is holding an answer of its own.
    fireEvent.click(screen.getByRole('button', { name: /bookkeeping columns/ }));
    expect(screen.getByText('Attendance')).toBeInTheDocument();
    // Then close it again, so IST.323's stored answer differs from IST.352's.
    fireEvent.click(screen.getByRole('button', { name: /bookkeeping columns/ }));
    expect(screen.queryByText('Attendance')).toBeNull();

    // Navigating from one course's Grades tab to another reuses this component
    // instance: the answer it is showing has to follow the new key, not linger.
    rerender(<GradebookTable rows={rows} sectionKey="bookkeeping:IST.352" />);
    expect(screen.getByText('Attendance')).toBeInTheDocument();
    expect(readStoredSections()).toEqual({
      'bookkeeping:IST.323': 'closed',
      'bookkeeping:IST.352': 'open',
    });
  });

  it('keeps the toggle working, and storage untouched, without a key', () => {
    renderTable([IST323_QUIZ, ECN304_ATTENDANCE, IST323_LETTER]);
    fireEvent.click(screen.getByRole('button', { name: /bookkeeping columns/ }));
    expect(screen.getByText('Attendance')).toBeInTheDocument();
    expect(readStoredSections()).toEqual({});
  });

  it('puts attendance among the items once its assignment has a component', () => {
    renderTable([IST323_QUIZ, { ...ECN304_ATTENDANCE, counts_toward_grade: true }]);

    expect(screen.getByText('Attendance')).toBeInTheDocument();
    expect(screen.getByText('counts toward grade')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /bookkeeping columns/ })).toBeNull();
  });

  it('never draws the total column as a row — the header owns it', () => {
    renderTable([IST323_QUIZ, IST323_TOTAL]);
    expect(screen.queryByText('Total Score')).toBeNull();
    expect(screen.queryByText('5 / 104')).toBeNull();
  });

  it('says the items are empty rather than drawing a blank table', () => {
    renderTable([ECN304_ATTENDANCE]);
    expect(screen.getByText(/no graded items for this course/)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Attendance and bookkeeping columns (1)' }),
    ).toBeInTheDocument();
  });
});

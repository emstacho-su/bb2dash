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
import { describe, expect, it, vi } from 'vitest';
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

describe('GradebookTable — feedback', () => {
  const withMarkup = makeGradebookRow({
    name: 'Essay',
    feedback: '<b>Nice work</b> & <script>alert(1)</script>\nSee line 4.',
  });

  it('escapes the instructor\'s text instead of rendering it as markup', () => {
    const { container } = renderTable([withMarkup]);
    expect(container.querySelector('b')).toBeNull();
    expect(container.querySelector('script')).toBeNull();
    expect(
      screen.getByText(/<b>Nice work<\/b> & <script>alert\(1\)<\/script>/),
    ).toBeInTheDocument();
  });

  it('starts collapsed and opens on the disclosure', () => {
    renderTable([withMarkup]);
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

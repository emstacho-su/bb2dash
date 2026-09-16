/**
 * Score history: a disclosure on a row whose score moved across syncs, reading
 * Blackboard's own figures with the day each was seen. One observation is not a
 * history.
 */

import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ScoreHistory } from '@/components/grades/ScoreHistory';
import { GradebookTable } from '@/components/grades/GradebookTable';
import { historyByColumn } from '@/lib/grade-model-view';
import { makeGradebookRow } from './factories.grades';
import { QUIZ_HISTORY } from './factories.grade-model';

vi.mock('@/lib/supabase/client', () => ({
  getSupabaseBrowserClient: () => ({ from: vi.fn() }),
}));
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));

describe('ScoreHistory', () => {
  it('reads a three-run history oldest first, the dash for "not graded yet"', () => {
    render(<ScoreHistory rows={QUIZ_HISTORY} label="Quiz #3" />);
    const toggle = screen.getByRole('button', { name: /history/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText(/→/)).toBeNull();

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('— → 9 → 9.5 · seen 10 Sep, 14 Sep, 16 Sep')).toBeInTheDocument();
  });

  it('renders nothing for a column seen only once', () => {
    const { container } = render(<ScoreHistory rows={[QUIZ_HISTORY[0]]} label="Quiz #3" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('sits on the matching gradebook row only', () => {
    const quiz = makeGradebookRow({ column_id: '_3560532_1', name: 'Quiz #3', effective_score: 9.5, possible: 10 });
    const lab = makeGradebookRow({ column_id: '_3560541_1', name: 'Lab #1' });
    render(<GradebookTable rows={[quiz, lab]} history={historyByColumn(QUIZ_HISTORY)} />);

    const rowOf = (name: string) => screen.getByText(name).closest('tr') as HTMLElement;
    expect(within(rowOf('Quiz #3')).getByRole('button', { name: /history/ })).toBeInTheDocument();
    expect(within(rowOf('Lab #1')).queryByRole('button', { name: /history/ })).toBeNull();
  });
});

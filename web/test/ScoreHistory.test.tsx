/**
 * Score history: a disclosure reading Blackboard's own figures with the day
 * each was seen. One observation is not a history.
 *
 * Phase 12b (G-5, P-grades-8) moved it off the gradebook row and into the
 * assignment popout; where it now sits is asserted in `SubmissionBlock.test.tsx`,
 * and that the table no longer carries it in `GradebookTable.test.tsx`. This
 * file keeps the component's own contract, which survives whatever G-1 decides.
 */

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ScoreHistory } from '@/components/grades/ScoreHistory';
import { QUIZ_HISTORY } from './factories.grade-model';

vi.mock('@/lib/supabase/client', () => ({
  getSupabaseBrowserClient: () => ({ from: vi.fn() }),
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

  it('names the column it belongs to, for a screen reader', () => {
    render(<ScoreHistory rows={QUIZ_HISTORY} label="Quiz #3" />);
    expect(screen.getByRole('button', { name: 'history of Quiz #3' })).toBeInTheDocument();
  });
});

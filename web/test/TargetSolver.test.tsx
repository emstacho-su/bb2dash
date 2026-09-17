/**
 * The target solver: the letter picker, and one frozen sentence for each of the
 * solver's five answers, rounded once for display.
 */

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TargetSolver, solverSentence } from '@/components/grades/TargetSolver';
import type { TargetResult } from '@/lib/grade-model/types';
import { TARGET_NEEDED, standing } from './factories.grade-model';

const LETTERS = ['A', 'A-', 'B+', 'F'];

describe('solverSentence — the five states', () => {
  it('needed', () => {
    expect(solverSentence(TARGET_NEEDED)).toBe(
      'For A- (≥ 90.0%) you need 91.2% average on the 7 remaining items (61.3% of the grade left).',
    );
  });

  it('unreachable', () => {
    const result: TargetResult = { state: 'unreachable', letter: 'A', bestCase: standing(92.46, 'A-') };
    expect(solverSentence(result)).toBe('A is out of reach — the most you can finish with is 92.5% (A-).');
  });

  it('secured', () => {
    const result: TargetResult = { state: 'secured', letter: 'B+', worstCase: standing(88.04, 'B+') };
    expect(solverSentence(result)).toBe('B+ is secured — even zeros on the rest leave 88.0% (B+).');
  });

  it('no_remaining_work', () => {
    const result: TargetResult = { state: 'no_remaining_work', letter: 'A-', current: standing(91.25, 'A-') };
    expect(solverSentence(result)).toBe('Nothing is left to grade — the course stands at 91.3% (A-).');
  });

  it('not_computable', () => {
    const result: TargetResult = { state: 'not_computable', reason: 'nothing_graded' };
    expect(solverSentence(result)).toBe('Model not computed yet — nothing that counts has been graded');
  });

  it('prints the dash for a letter the scale does not give', () => {
    const result: TargetResult = { state: 'unreachable', letter: 'A', bestCase: standing(50, null) };
    expect(solverSentence(result)).toBe('A is out of reach — the most you can finish with is 50.0% (—).');
  });
});

describe('TargetSolver', () => {
  it("offers the scheme's letters with the chosen one selected", () => {
    render(<TargetSolver result={TARGET_NEEDED} letters={LETTERS} selected="A-" onSelect={vi.fn()} />);
    const select = screen.getByLabelText('Target letter') as HTMLSelectElement;
    expect([...select.options].map((o) => o.value)).toEqual(LETTERS);
    expect(select.value).toBe('A-');
    expect(screen.getByText(/you need 91\.2% average/)).toHaveAttribute('data-solver-state', 'needed');
  });

  it('asks for a new letter on change', () => {
    const onSelect = vi.fn();
    render(<TargetSolver result={TARGET_NEEDED} letters={LETTERS} selected="A-" onSelect={onSelect} />);
    fireEvent.change(screen.getByLabelText('Target letter'), { target: { value: 'B+' } });
    expect(onSelect).toHaveBeenCalledWith('B+');
  });

  it('shows a solver failure as an alert instead of a sentence', () => {
    render(<TargetSolver result={null} error="Could not solve for A-: boom" letters={LETTERS} selected="A-" onSelect={vi.fn()} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Could not solve for A-: boom');
  });
});

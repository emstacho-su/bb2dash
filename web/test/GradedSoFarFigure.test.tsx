/**
 * The headline grade figure (Phase 12b, G-2 / P-grades-1, P-home-10).
 *
 * One presentational component, used in every course header on `/grades`, on
 * the course Grades tab, and — through a prop — on Home's course card. It
 * computes nothing: `gradedSoFar()` does that, and this renders the answer.
 *
 * The honesty rules are the point. A course with nothing graded says so; a
 * qualitatively graded course states no number at all; a figure always carries
 * the time it was true and, when it does not cover everything, says what it
 * leaves out. Blackboard's own total is labelled as Blackboard's and never
 * merged with ours.
 */

import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  GradedSoFarFigure,
  FIGURE_LABEL,
  LEFT_OUT_LABEL,
  NOTHING_GRADED_TEXT,
  UNLINKED_LABEL,
} from '@/components/grades/GradedSoFarFigure';
import type { GradedSoFarResult as Figure } from '@/lib/graded-so-far';

const FIGURE: Figure = {
  state: 'figure',
  percent: 87.3612,
  letter: 'B+',
  pointsEarned: null,
  pointsPossible: null,
  countedParts: ['Exams', 'Quizzes'],
  leftOutParts: ['Participation'],
  unlinkedColumns: [],
  asOf: '2026-09-16T17:14:02.645Z',
};

describe('GradedSoFarResult — the number', () => {
  it('labels it "Graded so far" and rounds once, to one decimal', () => {
    render(<GradedSoFarFigure figure={FIGURE} />);
    expect(screen.getByText(FIGURE_LABEL)).toBeInTheDocument();
    expect(screen.getByText('87.4%')).toBeInTheDocument();
    expect(screen.getByText('B+')).toBeInTheDocument();
  });

  it('says when the figure was true', () => {
    render(<GradedSoFarFigure figure={FIGURE} />);
    expect(screen.getByText(/as of Sep 16, 1:14 PM/)).toBeInTheDocument();
  });

  it('prints a points fraction only when the scheme is in points', () => {
    render(
      <GradedSoFarResult
        figure={{ ...FIGURE, pointsEarned: 53, pointsPossible: 55 }}
      />,
    );
    expect(screen.getByText('53 / 55')).toBeInTheDocument();
  });

  it('prints no fraction under a weighted scheme — weight units are not a mark', () => {
    const { container } = render(<GradedSoFarFigure figure={FIGURE} />);
    expect(container.textContent).not.toMatch(/\d+\s*\/\s*\d+/);
  });
});

describe('GradedSoFarResult — what the number leaves out', () => {
  it('names the parts it does not cover', () => {
    render(<GradedSoFarFigure figure={FIGURE} />);
    expect(screen.getByText(`${LEFT_OUT_LABEL} Participation`)).toBeInTheDocument();
  });

  it('names several parts in one sentence', () => {
    render(
      <GradedSoFarResult
        figure={{ ...FIGURE, leftOutParts: ['Participation', 'Final exam'] }}
      />,
    );
    expect(
      screen.getByText(`${LEFT_OUT_LABEL} Participation, Final exam`),
    ).toBeInTheDocument();
  });

  it('says nothing about left-out parts when it covers everything', () => {
    render(<GradedSoFarFigure figure={{ ...FIGURE, leftOutParts: [] }} />);
    expect(screen.queryByText(new RegExp(LEFT_OUT_LABEL))).toBeNull();
  });

  it('names a scored column that counts toward nothing, and points at the picker', () => {
    render(
      <GradedSoFarFigure figure={{ ...FIGURE, unlinkedColumns: ['Lab #1'] }} />,
    );
    const line = screen.getByText(new RegExp(UNLINKED_LABEL));
    expect(line.textContent).toContain('Lab #1');
    expect(line.textContent).toContain('Counts toward');
  });
});

describe('GradedSoFarResult — the states that are not a number', () => {
  it('says nothing has been graded rather than showing a zero', () => {
    render(<GradedSoFarFigure figure={{ state: 'nothing_graded' }} />);
    expect(screen.getByText(NOTHING_GRADED_TEXT)).toBeInTheDocument();
    expect(screen.queryByText(/%/)).toBeNull();
  });

  it.each([
    ['qualitative_method', /graded qualitatively/],
    ['no_scheme', /No grading rules/],
    ['unknown_method', /cannot read/],
    ['unknown_aggregation', /cannot read/],
  ] as const)('explains %s without inventing a number', (reason, matcher) => {
    const { container } = render(
      <GradedSoFarFigure figure={{ state: 'not_computable', reason }} />,
    );
    expect(screen.getByText(matcher)).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/\d+\.\d+%/);
  });

  it('says it is loading rather than "nothing graded"', () => {
    render(<GradedSoFarFigure figure={null} />);
    expect(screen.getByText('loading…')).toBeInTheDocument();
    expect(screen.queryByText(NOTHING_GRADED_TEXT)).toBeNull();
  });

  it('reports a failed read as an alert, not as an empty figure', () => {
    render(<GradedSoFarFigure figure={null} error="Could not load the grading rules: timeout" />);
    expect(screen.getByRole('alert').textContent).toContain('timeout');
    expect(screen.queryByText('loading…')).toBeNull();
  });
});

describe("GradedSoFarResult — Blackboard's own total", () => {
  const blackboard = {
    score: 14.8,
    possible: 104,
    seenAt: '2026-09-16T17:14:02.645Z',
    name: 'Total Score',
  };

  it("shows it beside ours, labelled as Blackboard's", () => {
    render(<GradedSoFarFigure figure={FIGURE} blackboardTotal={blackboard} />);
    const theirs = screen.getByTestId('blackboard-total');
    expect(within(theirs).getByText(/Blackboard/)).toBeInTheDocument();
    expect(within(theirs).getByText('14.8 / 104')).toBeInTheDocument();
  });

  it('never merges the two figures', () => {
    render(<GradedSoFarFigure figure={FIGURE} blackboardTotal={blackboard} />);
    expect(screen.getByText('87.4%')).toBeInTheDocument();
    expect(screen.getByText('14.8 / 104')).toBeInTheDocument();
    expect(screen.queryByText('102.2%')).toBeNull();
  });

  it('shows ours alone when Blackboard publishes no total', () => {
    render(<GradedSoFarFigure figure={FIGURE} blackboardTotal={null} />);
    expect(screen.queryByTestId('blackboard-total')).toBeNull();
    expect(screen.getByText('87.4%')).toBeInTheDocument();
  });

  it("shows Blackboard's even when ours cannot be computed", () => {
    render(
      <GradedSoFarResult
        figure={{ state: 'not_computable', reason: 'qualitative_method' }}
        blackboardTotal={blackboard}
      />,
    );
    expect(screen.getByTestId('blackboard-total')).toBeInTheDocument();
  });
});

describe('GradedSoFarResult — compact, for Home\'s course card', () => {
  it('keeps the number and the as-of, and drops the explanations', () => {
    render(<GradedSoFarFigure figure={FIGURE} compact />);
    expect(screen.getByText('87.4%')).toBeInTheDocument();
    expect(screen.queryByText(new RegExp(LEFT_OUT_LABEL))).toBeNull();
  });

  it('still refuses to show a number where there is none', () => {
    render(<GradedSoFarFigure figure={{ state: 'nothing_graded' }} compact />);
    expect(screen.getByText(NOTHING_GRADED_TEXT)).toBeInTheDocument();
  });
});

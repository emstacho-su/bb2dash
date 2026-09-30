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
  rankRuleText,
} from '@/components/grades/GradedSoFarFigure';
import { gradedSoFar, type GradedSoFarResult as Figure, type RankRule } from '@/lib/graded-so-far';
import { component, item, modelInput } from './grade-model/builders';

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

describe('GradedSoFarFigure — the number', () => {
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
      <GradedSoFarFigure
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

describe('GradedSoFarFigure — what the number leaves out', () => {
  it('names the parts it does not cover', () => {
    render(<GradedSoFarFigure figure={FIGURE} />);
    expect(screen.getByText(`${LEFT_OUT_LABEL} Participation`)).toBeInTheDocument();
  });

  it('names several parts in one sentence', () => {
    render(
      <GradedSoFarFigure
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

describe('GradedSoFarFigure — the states that are not a number', () => {
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

describe("GradedSoFarFigure — Blackboard's own total", () => {
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
      <GradedSoFarFigure
        figure={{ state: 'not_computable', reason: 'qualitative_method' }}
        blackboardTotal={blackboard}
      />,
    );
    expect(screen.getByTestId('blackboard-total')).toBeInTheDocument();
  });
});

/*
 * R-36 (Phase 16): one sentence per rank-weighted part, under the headline,
 * built from the stored weights. The two strings are the Contract's, frozen.
 */
describe('GradedSoFarFigure — the rank-weighted rule', () => {
  const ECN_RULE: RankRule = { part: 'Exams (rank-weighted)', weights: [30, 25, 20], slots: 3, allGraded: false };

  it('states the rule while not every slot is graded (ECN.304 today)', () => {
    expect(rankRuleText(ECN_RULE)).toBe(
      'Exams (rank-weighted): weighted 30 / 25 / 20 from highest score to lowest once all 3 are graded; until then the graded ones are averaged.',
    );
  });

  it('states the rule once every slot is graded', () => {
    expect(rankRuleText({ ...ECN_RULE, allGraded: true })).toBe(
      'Exams (rank-weighted): weighted 30 / 25 / 20 from highest score to lowest.',
    );
  });

  it('prints each weight as stored, without a trailing ".0", and counts them', () => {
    expect(rankRuleText({ part: 'Quizzes', weights: [12.5, 10, 7.5, 5], slots: 4, allGraded: false })).toBe(
      'Quizzes: weighted 12.5 / 10 / 7.5 / 5 from highest score to lowest once all 4 are graded; until then the graded ones are averaged.',
    );
  });

  it('renders one sentence per rule, after the headline', () => {
    const rules = [ECN_RULE, { part: 'Quizzes', weights: [2, 1], slots: 2, allGraded: true }];
    render(<GradedSoFarFigure figure={{ ...FIGURE, rankRules: rules }} />);
    const lines = screen.getAllByTestId('rank-rule');
    expect(lines.map((line) => line.textContent)).toEqual(rules.map(rankRuleText));
    expect(lines[0].tagName).toBe('P');
    const headline = screen.getByText('87.4%');
    expect(headline.compareDocumentPosition(lines[0]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('renders none on the compact card', () => {
    render(<GradedSoFarFigure figure={{ ...FIGURE, rankRules: [ECN_RULE] }} compact />);
    expect(screen.queryByTestId('rank-rule')).toBeNull();
  });

  it('renders none for a malformed weight list', () => {
    const figure = gradedSoFar(
      modelInput({
        components: [
          component({ id: 1, name: 'Exams (rank-weighted)', weightPct: 100, aggregation: 'rank_weighted', rankWeights: [30, -5, 20], countExpected: 3 }),
        ],
        items: [item({ key: 'col:exam1', componentId: 1, possible: 100, score: 80 })],
      }),
    );
    expect(figure.state).toBe('figure');
    render(<GradedSoFarFigure figure={figure} />);
    expect(screen.queryByTestId('rank-rule')).toBeNull();
  });

  it('takes the weights from the component', () => {
    const figure = gradedSoFar(
      modelInput({
        components: [
          component({ id: 1, name: 'Midterms', weightPct: 100, aggregation: 'rank_weighted', rankWeights: [3, 2, 1], countExpected: 3 }),
        ],
        items: [item({ key: 'col:m1', componentId: 1, possible: 100, score: 80 })],
      }),
    );
    render(<GradedSoFarFigure figure={figure} />);
    expect(screen.getByTestId('rank-rule').textContent).toBe(
      'Midterms: weighted 3 / 2 / 1 from highest score to lowest once all 3 are graded; until then the graded ones are averaged.',
    );
  });

  // Round 2, item 3: more counted columns than weights. The engine ranks over
  // max(weights, items) slots and the extra slots weigh 0; the sentence says so.
  it('states the engine’s slot count, weights padded with 0, when columns outnumber weights', () => {
    const figure = gradedSoFar(
      modelInput({
        components: [
          component({ id: 1, name: 'Exams (rank-weighted)', weightPct: 100, aggregation: 'rank_weighted', rankWeights: [30, 25, 20], countExpected: 3 }),
        ],
        items: [1, 2, 3, 4].map((n) =>
          item({ key: `col:exam${n}`, componentId: 1, possible: 100, score: n === 1 ? 80 : null }),
        ),
      }),
    );
    render(<GradedSoFarFigure figure={figure} />);
    expect(screen.getByTestId('rank-rule').textContent).toBe(
      'Exams (rank-weighted): weighted 30 / 25 / 20 / 0 from highest score to lowest once all 4 are graded; until then the graded ones are averaged.',
    );
  });

  it('reads ECN.304’s real shape unchanged: three exam columns, three weights', () => {
    const figure = gradedSoFar(
      modelInput({
        components: [
          component({ id: 1, name: 'Exams (rank-weighted)', weightPct: 75, aggregation: 'rank_weighted', rankWeights: [30, 25, 20], countExpected: 3 }),
          component({ id: 2, name: 'Participation', weightPct: 25, aggregation: 'manual' }),
        ],
        items: [
          item({ key: 'col:exam1', componentId: 1, possible: 100, score: 88.889 }),
          item({ key: 'col:exam2', componentId: 1, possible: 100, score: null }),
          item({ key: 'col:exam3', componentId: 1, possible: 100, score: null }),
        ],
      }),
    );
    render(<GradedSoFarFigure figure={figure} />);
    expect(screen.getByTestId('rank-rule').textContent).toBe(
      'Exams (rank-weighted): weighted 30 / 25 / 20 from highest score to lowest once all 3 are graded; until then the graded ones are averaged.',
    );
  });

  it('renders none when the figure carries no rules', () => {
    render(<GradedSoFarFigure figure={FIGURE} />);
    expect(screen.queryByTestId('rank-rule')).toBeNull();
  });
});

describe('GradedSoFarFigure — compact, for Home\'s course card', () => {
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

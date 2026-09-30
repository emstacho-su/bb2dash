/**
 * `/grades` report-card strip (Phase 17 round 3, R3-7).
 *
 * One card per class, above the classes: code, name, and whatever the page's
 * own "Graded so far" figure says — the letter and the points where the figure
 * has them, the percentage where it has no points (a weighted scheme), and the
 * page's short wording where it has no figure at all. Never a number the
 * figure does not carry.
 */

import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ReportCardStrip, type ReportCardCourse } from '@/components/grades/ReportCardStrip';
import type { CourseFigureState } from '@/lib/grade-figure-run';

const COURSES: readonly ReportCardCourse[] = [
  { displayId: 'IST.323', code: 'IST 323', title: 'Intro to Cybersecurity' },
  { displayId: 'IST.466', code: 'IST 466', title: 'IM&T Capstone' },
  { displayId: 'ECN.304', code: 'ECN 304', title: 'Economics of Social Issues' },
  { displayId: 'IST.471', code: 'IST 471', title: 'Internship' },
  { displayId: 'GEO.103.lecture', code: 'GEO 103', title: 'Environment and Society' },
];

function figure(over: Partial<{ percent: number; letter: string | null; pointsEarned: number | null; pointsPossible: number | null }>): CourseFigureState {
  return {
    figure: {
      state: 'figure',
      percent: 91.25,
      letter: 'A-',
      pointsEarned: 36.5,
      pointsPossible: 40,
      countedParts: [],
      leftOutParts: [],
      unlinkedColumns: [],
      asOf: '2026-09-16T17:14:02.645Z',
      ...over,
    },
    error: null,
  };
}

const FIGURES: Readonly<Record<string, CourseFigureState>> = {
  'IST.323': figure({}),
  'IST.466': figure({ percent: 87.3612, letter: 'B+', pointsEarned: null, pointsPossible: null }),
  'ECN.304': { figure: { state: 'not_computable', reason: 'qualitative_method' }, error: null },
  'IST.471': { figure: { state: 'nothing_graded' }, error: null },
  // GEO.103.lecture has no entry: its reads are still in flight.
};

function cardFor(code: string): HTMLElement {
  const item = screen
    .getAllByRole('listitem')
    .find((li) => li.textContent?.includes(code));
  if (!item) throw new Error(`no report card for ${code}`);
  return item;
}

describe('ReportCardStrip', () => {
  it('draws one card per class, in the order given, labelled as the report card', () => {
    render(<ReportCardStrip courses={COURSES} figures={FIGURES} />);
    const strip = screen.getByRole('region', { name: 'Report card' });
    const cards = within(strip).getAllByRole('listitem');
    expect(cards).toHaveLength(5);
    expect(cards.map((c) => c.querySelector('[data-code]')?.textContent)).toEqual([
      'IST 323',
      'IST 466',
      'ECN 304',
      'IST 471',
      'GEO 103',
    ]);
    expect(within(cards[0]).getByText('Intro to Cybersecurity')).toBeInTheDocument();
  });

  it("shows the figure's letter and its points scored / possible", () => {
    render(<ReportCardStrip courses={COURSES} figures={FIGURES} />);
    const card = cardFor('IST 323');
    expect(within(card).getByText('A-')).toBeInTheDocument();
    expect(within(card).getByText('36.5 / 40')).toBeInTheDocument();
  });

  it('shows the percentage, not a fraction, where the figure carries no points', () => {
    render(<ReportCardStrip courses={COURSES} figures={FIGURES} />);
    const card = cardFor('IST 466');
    expect(within(card).getByText('B+')).toBeInTheDocument();
    expect(within(card).getByText('87.4%')).toBeInTheDocument();
    expect(card.textContent).not.toContain('/');
  });

  it('says what the page says, and no number, for a class with no figure', () => {
    render(<ReportCardStrip courses={COURSES} figures={FIGURES} />);
    const qualitative = cardFor('ECN 304');
    expect(within(qualitative).getByText('graded qualitatively')).toBeInTheDocument();
    expect(qualitative.textContent?.replace('ECN 304', '')).not.toMatch(/\d/);

    const nothing = cardFor('IST 471');
    expect(within(nothing).getByText('nothing graded yet')).toBeInTheDocument();
    expect(nothing.textContent?.replace('IST 471', '')).not.toMatch(/\d/);
  });

  it('says loading while a class figure is in flight, and names a failure without a number', () => {
    render(
      <ReportCardStrip
        courses={COURSES}
        figures={{ ...FIGURES, 'IST.471': { figure: null, error: 'Could not work out the grade: boom' } }}
      />,
    );
    const loading = cardFor('GEO 103');
    expect(within(loading).getByText('loading…')).toBeInTheDocument();
    expect(loading.textContent?.replace('GEO 103', '')).not.toMatch(/\d/);

    const failed = cardFor('IST 471');
    expect(within(failed).getByText('could not be worked out')).toBeInTheDocument();
    expect(within(failed).queryByRole('alert')).toBeNull();
  });
});

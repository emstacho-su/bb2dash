/**
 * `/grades` with the figure: each card carries "Graded so far" under
 * Blackboard's own header, and none of the course tab's controls. Every hook is
 * a stub and the figures arrive already computed, the way `GradesModelScreen`
 * passes them.
 */

import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { GradesFiguresProps } from '@/app/(app)/grades/GradesScreen';
import { makeCourseGrade, makeGradebookRow } from './factories.grades';

function stub<T>(data: T) {
  return { data, isPending: false, isFetching: false, isError: false, error: null };
}

function course(over: Record<string, unknown>) {
  return { meetings: null, room_disputed: false, bb_url: null, card_note: null, ...over };
}

vi.mock('@/lib/supabase/client', () => ({
  getSupabaseBrowserClient: () => ({ from: vi.fn(), auth: { getSession: vi.fn() } }),
}));
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));
vi.mock('@/lib/queries.today', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/queries.today')>();
  return {
    ...actual,
    useCourseDisplay: () =>
      stub([
        course({ display_id: 'IST.323', code: 'IST 323', title: 'Intro to Cybersecurity', shell_ids: ['IST.323'] }),
        course({ display_id: 'IST.466', code: 'IST 466', title: 'IM&T Capstone', shell_ids: ['IST.466'] }),
      ]),
  };
});
vi.mock('@/lib/queries.grades', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/queries.grades')>();
  return {
    ...actual,
    useCourseGrades: () => stub([makeCourseGrade({ total_effective_score: 14.8 }), makeCourseGrade({ course_id: 'IST.466', has_total: false })]),
    useGradebookLatest: () =>
      stub([
        makeGradebookRow({ column_id: '_3560532_1', name: 'Quiz #3', effective_score: 9.5, possible: 10 }),
        makeGradebookRow({ course_id: 'IST.466', column_id: '_3562497_1', name: 'Ethics Case Presentation', possible: 100 }),
      ]),
  };
});

const { GradesScreen } = await import('@/app/(app)/grades/GradesScreen');

const MODEL: GradesFiguresProps = {
  figures: {
    'IST.323': {
      figure: { state: 'not_computable', reason: 'qualitative_method' },
      error: null,
    },
    'IST.466': {
      figure: {
        state: 'figure',
        percent: 87.3612,
        letter: 'B+',
        pointsEarned: null,
        pointsPossible: null,
        countedParts: ['Major Cases'],
        leftOutParts: ['Ethics Presentation'],
        unlinkedColumns: [],
        asOf: '2026-09-16T17:14:02.645Z',
      },
      error: null,
    },
  },
};

describe('GradesScreen — the figure under each header', () => {
  it("puts each course's figure under Blackboard's own number, never merged with it", () => {
    render(<GradesScreen model={MODEL} />);
    const ist323 = screen.getByRole('region', { name: 'IST 323' });
    expect(within(ist323).getByText('14.8 / 104')).toBeInTheDocument();
    expect(
      within(ist323).getByText(/graded qualitatively/),
    ).toBeInTheDocument();

    const ist466 = screen.getByRole('region', { name: 'IST 466' });
    expect(within(ist466).getByText('87.4%')).toBeInTheDocument();
    expect(within(ist466).getByText('B+')).toBeInTheDocument();
  });

  it('names the parts the figure does not cover', () => {
    render(<GradesScreen model={MODEL} />);
    const ist466 = screen.getByRole('region', { name: 'IST 466' });
    expect(within(ist466).getByText('Not counted yet: Ethics Presentation')).toBeInTheDocument();
  });

  it('offers no what-if cell, no solver, no picker and no Reset', () => {
    render(<GradesScreen model={MODEL} />);
    expect(screen.queryByLabelText(/what if/)).toBeNull();
    expect(screen.queryByLabelText('Target letter')).toBeNull();
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Reset scenario' })).toBeNull();
  });

  /* G-5, P-grades-8: the history disclosure left this screen for the popout. */
  it('shows no history disclosure on any row', () => {
    render(<GradesScreen model={MODEL} />);
    expect(screen.queryByRole('button', { name: /history/ })).toBeNull();
  });

  it('says loading for a course whose reads have not landed, and a failure as an alert', () => {
    render(
      <GradesScreen
        model={{
          figures: {
            'IST.323': { figure: null, error: 'Could not load the grading rules: timeout' },
          },
        }}
      />,
    );
    const ist466 = screen.getByRole('region', { name: 'IST 466' });
    expect(within(ist466).getByText('loading…')).toBeInTheDocument();
    expect(screen.getAllByRole('alert').map((a) => a.textContent)).toEqual([
      'Could not load the grading rules: timeout',
    ]);
  });
});

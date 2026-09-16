/**
 * `/grades` with the model: each card carries the read-only "Our model" line
 * under Blackboard's header and a history disclosure on rows that changed —
 * and none of the course tab's controls (PM call 4). Every hook is a stub and
 * the model arrives as typed results, the way `GradesModelScreen` passes it.
 */

import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { GradesModelProps } from '@/app/(app)/grades/GradesScreen';
import { historyByColumn } from '@/lib/grade-model-view';
import { makeCourseGrade, makeGradebookRow } from './factories.grades';
import { NOT_COMPUTED_MANUAL, QUIZ_HISTORY, makeComputed } from './factories.grade-model';

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

const MODEL: GradesModelProps = {
  standings: {
    'IST.323': { result: NOT_COMPUTED_MANUAL, realResult: NOT_COMPUTED_MANUAL, components: [], items: [], unsureItemKeys: [], error: null, loading: false },
    'IST.466': { result: makeComputed({ usesHypotheticals: true }), realResult: makeComputed(), components: [], items: [], unsureItemKeys: [], error: null, loading: false },
  },
  history: historyByColumn(QUIZ_HISTORY),
};

describe('GradesScreen — the read-only model line', () => {
  it("puts each course's model under Blackboard's own header", () => {
    render(<GradesScreen model={MODEL} />);
    const ist323 = screen.getByRole('region', { name: 'IST 323' });
    expect(within(ist323).getByText('14.8 / 104')).toBeInTheDocument();
    expect(
      within(within(ist323).getByRole('region', { name: 'Our model' })).getByText('Model not computed — Class Participation not scored yet'),
    ).toBeInTheDocument();

    const ist466 = screen.getByRole('region', { name: 'IST 466' });
    const model = within(ist466).getByRole('region', { name: 'Our model' });
    expect(within(model).getByText('87.4% (B+)')).toBeInTheDocument();
    expect(within(model).getByText('includes what-if values')).toBeInTheDocument();
  });

  it('offers no what-if cell, no solver, no picker and no Reset', () => {
    render(<GradesScreen model={MODEL} />);
    expect(screen.queryByLabelText(/what if/)).toBeNull();
    expect(screen.queryByLabelText('Target letter')).toBeNull();
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Reset scenario' })).toBeNull();
  });

  it('shows the history disclosure on the row that changed', () => {
    render(<GradesScreen model={MODEL} />);
    const row = screen.getByText('Quiz #3').closest('tr') as HTMLElement;
    expect(within(row).getByRole('button', { name: /history/ })).toBeInTheDocument();
  });

  it('keeps every computed percentage inside an "Our model" container', () => {
    const { container } = render(<GradesScreen model={MODEL} />);
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    let count = 0;
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!/\d%/.test(node.textContent ?? '')) continue;
      count += 1;
      expect(node.parentElement?.closest('[data-model]')).not.toBeNull();
    }
    expect(count).toBeGreaterThan(0);
  });

  it('says loading for a course whose model has not been computed yet, and a failure as an alert', () => {
    render(
      <GradesScreen
        model={{
          standings: { 'IST.323': { result: null, realResult: null, components: [], items: [], unsureItemKeys: [], error: 'Could not load the grade model: timeout', loading: false } },
          history: new Map(),
          historyError: 'Could not load the score history: timeout',
        }}
      />,
    );
    const ist466 = screen.getByRole('region', { name: 'IST 466' });
    expect(within(ist466).getByText('loading…')).toBeInTheDocument();
    expect(screen.getAllByRole('alert').map((a) => a.textContent)).toEqual([
      'Could not load the score history: timeout',
      'Could not load the grade model: timeout',
    ]);
  });
});

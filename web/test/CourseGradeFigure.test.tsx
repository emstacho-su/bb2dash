/**
 * G-2 / P-home-10 — the grade slot on the Home course card.
 *
 * Stack's answer 12 asks for two numbers on the card: whichever graded-so-far
 * method wins G-0, plus Blackboard's own total where one exists. Only the
 * second is decidable before he picks, so what is under test here is:
 *
 *   1. Blackboard's total is stated correctly, including both of the two
 *      absences, which are different facts and must not collapse into one;
 *   2. the card renders figures it is HANDED and computes nothing, so the
 *      graded-so-far figure can be dropped in later without touching it;
 *   3. nothing is invented while the gradebook read is in flight or failing.
 */

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { makeCourseDisplay, makeWorkItem } from './factories';
import type { CourseGradeRow } from '@/lib/queries.grades';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/lib/supabase/client', () => ({
  getSupabaseBrowserClient: () => ({ auth: { getSession: vi.fn() } }),
}));

const {
  blackboardGradeFigure,
  NEVER_SYNCED_TEXT,
  NO_TOTAL_TEXT,
} = await import('@/app/(app)/CourseGradeFigure');
const { CourseCard } = await import('@/app/(app)/Today');

function makeGradeRow(overrides: Partial<CourseGradeRow> = {}): CourseGradeRow {
  return {
    course_id: 'IST.323',
    has_gradebook: true,
    gradebook_seen_at: '2026-09-16T14:00:00Z',
    has_total: true,
    total_column_id: '_3569973_1',
    total_name: 'Weighted Total',
    total_effective_score: 14.8,
    total_possible: 104,
    total_display_grade: 'C',
    total_seen_at: '2026-09-16T14:00:00Z',
    item_count: 20,
    graded_item_count: 6,
    ...overrides,
  };
}

describe('blackboardGradeFigure — what Blackboard published', () => {
  it('states the total as a score over its possible', () => {
    const figure = blackboardGradeFigure(makeGradeRow());
    expect(figure.label).toBe('Blackboard');
    expect(figure.value).toBe('14.8 / 104');
    expect(figure.absence).toBeNull();
    expect(figure.display).toBe('C');
    expect(figure.asOf).toContain('Sep 16');
  });

  it('keeps "no total" and "never synced" apart — they are different facts', () => {
    const noTotal = blackboardGradeFigure(makeGradeRow({ has_total: false }));
    expect(noTotal.value).toBeNull();
    expect(noTotal.absence).toBe(NO_TOTAL_TEXT);
    // It still says when the gradebook was read: we looked, and it had none.
    expect(noTotal.asOf).toContain('Sep 16');

    const never = blackboardGradeFigure(makeGradeRow({ has_gradebook: false }));
    expect(never.value).toBeNull();
    expect(never.absence).toBe(NEVER_SYNCED_TEXT);
    expect(never.asOf).toBeNull();
  });

  it('treats a missing row as never synced, not as a zero', () => {
    for (const row of [null, undefined]) {
      const figure = blackboardGradeFigure(row);
      expect(figure.value).toBeNull();
      expect(figure.absence).toBe(NEVER_SYNCED_TEXT);
    }
  });

  it('shows a dash for a total column that exists but is ungraded', () => {
    // Still the `total` state — the column is there, nobody has graded it.
    const figure = blackboardGradeFigure(
      makeGradeRow({ total_effective_score: null, total_display_grade: null }),
    );
    expect(figure.value).toBe('—');
    expect(figure.absence).toBeNull();
  });

  it('never fills a value and an absence at the same time', () => {
    const rows = [
      makeGradeRow(),
      makeGradeRow({ has_total: false }),
      makeGradeRow({ has_gradebook: false }),
      makeGradeRow({ total_effective_score: null }),
    ];
    for (const row of rows) {
      const figure = blackboardGradeFigure(row);
      expect(figure.value === null).toBe(figure.absence !== null);
    }
  });
});

/* ---------------------------------------------------------------------------
 * The card end of the slot
 * ------------------------------------------------------------------------ */

function renderCard(grades: Parameters<typeof CourseCard>[0]['grades']) {
  return render(
    <CourseCard
      course={makeCourseDisplay()}
      items={[makeWorkItem({ due_on: '2026-09-10' })]}
      todayKey="2026-09-10"
      cardHorizonKey="2026-09-23"
      weekMonday={new Date(2026, 8, 7)}
      weekMondayKey="2026-09-07"
      weekSundayKey="2026-09-13"
      grades={grades}
    />,
  );
}

describe('CourseCard — the grade slot', () => {
  it('renders the figure it is handed', () => {
    renderCard([blackboardGradeFigure(makeGradeRow())]);
    expect(screen.getByText('Blackboard')).toBeInTheDocument();
    expect(screen.getByText(/14\.8 \/ 104/)).toBeInTheDocument();
    expect(screen.getByText('C')).toBeInTheDocument();
  });

  it('renders an absence in words rather than a number', () => {
    renderCard([blackboardGradeFigure(makeGradeRow({ has_gradebook: false }))]);
    expect(screen.getByText(NEVER_SYNCED_TEXT)).toBeInTheDocument();
    expect(screen.queryByText('0')).toBeNull();
  });

  it('renders every figure it is handed, in order — the slot takes more than one', () => {
    // This is the shape the graded-so-far figure arrives in once Stack picks
    // the method: a second entry, and nothing about the card changes.
    renderCard([
      blackboardGradeFigure(makeGradeRow()),
      { label: 'Graded so far', value: '39.8 / 140', absence: null, asOf: 'Sep 16, 2:00 PM' },
    ]);
    expect(screen.getByText('Blackboard')).toBeInTheDocument();
    expect(screen.getByText('Graded so far')).toBeInTheDocument();
    expect(screen.getByText(/39\.8 \/ 140/)).toBeInTheDocument();
  });

  it('shows no grade row at all when handed nothing', () => {
    renderCard([]);
    expect(screen.queryByText('Blackboard')).toBeNull();
    expect(screen.queryByText(NEVER_SYNCED_TEXT)).toBeNull();
    expect(screen.queryByText(NO_TOTAL_TEXT)).toBeNull();
  });

  it('defaults to nothing when the prop is left off entirely', () => {
    render(
      <CourseCard
        course={makeCourseDisplay()}
        items={[]}
        todayKey="2026-09-10"
        cardHorizonKey="2026-09-23"
        weekMonday={new Date(2026, 8, 7)}
        weekMondayKey="2026-09-07"
        weekSundayKey="2026-09-13"
      />,
    );
    expect(screen.queryByText('Blackboard')).toBeNull();
  });
});

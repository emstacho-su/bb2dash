/**
 * Phase 22, round 2 (R2-4): the card-note field says it is busy while it saves.
 *
 * The field is disabled while the note saves, and the switched-off look is
 * written on `.input:disabled:not([aria-busy='true'])`. Without `aria-busy` the
 * field would flash as switched off (a flat grey box, a not-allowed cursor) on
 * every save. The save mutation is stubbed so a test can hold it pending.
 */

import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const answered = (data: unknown) => ({ data, isPending: false, isFetching: false, isError: false, error: null });

const COURSE = {
  display_id: 'IST.323',
  code: 'IST 323',
  title_short: 'Intro to Cybersecurity',
  shell_ids: ['IST.323'],
  meetings: [],
  room_disputed: false,
  bb_url: null,
};

const save = vi.hoisted(() => ({ pending: false }));

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/lib/supabase/client', () => ({
  getSupabaseBrowserClient: () => ({ auth: { getSession: vi.fn() } }),
}));
vi.mock('@/lib/queries.course', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/queries.course')>();
  return {
    ...actual,
    useCourseDisplay: () => answered(COURSE),
    useCourseShells: () =>
      answered([
        { id: 'IST.323', location: null, term_id: 'FALL26', kind: 'lecture', group_notes: null, card_note: null },
      ]),
    useCourseStaff: () => answered([]),
    useCourseGradingScheme: () => answered(null),
    useUpdateCardNote: () => ({ mutate: vi.fn(), isPending: save.pending, isError: false, error: null }),
  };
});
vi.mock('@/lib/queries.materials', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/queries.materials')>();
  return { ...actual, useCurrentFiles: () => answered([]) };
});

const { CourseInfo } = await import('@/app/(app)/course/[id]/info/CourseInfo');

beforeEach(() => {
  save.pending = false;
});

describe('CourseInfo — the card note while it saves (R2-4)', () => {
  it('is disabled and aria-busy while the save is pending', () => {
    save.pending = true;
    render(<CourseInfo courseId="IST.323" />);
    const field = screen.getByPlaceholderText('No note yet');
    expect(field).toBeDisabled();
    expect(field).toHaveAttribute('aria-busy', 'true');
  });

  it('is neither disabled nor busy when no save is running', () => {
    render(<CourseInfo courseId="IST.323" />);
    const field = screen.getByPlaceholderText('No note yet');
    expect(field).toBeEnabled();
    expect(field).not.toHaveAttribute('aria-busy', 'true');
  });
});

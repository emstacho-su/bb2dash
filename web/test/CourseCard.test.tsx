/**
 * The Home course card (R-04): the one-line note Stack writes on the course
 * Info tab, and what the card shows when he has not written one.
 *
 * The card is rendered on its own — it has no hooks, only the rows it is given.
 * The Supabase browser client is mocked because the module graph reaches it
 * through the query layer.
 */

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { makeCourseDisplay, makeWorkItem } from './factories';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/lib/supabase/client', () => ({
  getSupabaseBrowserClient: () => ({ auth: { getSession: vi.fn() } }),
}));

const { CourseCard } = await import('@/app/(app)/Today');

const WEEK_MONDAY = new Date(2026, 8, 7); // Mon 2026-09-07

function renderCard(overrides: Parameters<typeof makeCourseDisplay>[0] = {}) {
  return render(
    <CourseCard
      course={makeCourseDisplay(overrides)}
      items={[makeWorkItem({ due_on: '2026-09-10' })]}
      todayKey="2026-09-10"
      cardHorizonKey="2026-09-23"
      weekMonday={WEEK_MONDAY}
      weekMondayKey="2026-09-07"
      weekSundayKey="2026-09-13"
    />,
  );
}

describe('CourseCard — the card note', () => {
  it('shows the note when the course has one', () => {
    renderCard({ card_note: 'Lab access code lives in the syllabus PDF' });
    expect(
      screen.getByText('Lab access code lives in the syllabus PDF'),
    ).toBeInTheDocument();
  });

  it('renders nothing when there is no note', () => {
    const { container } = renderCard({ card_note: null });
    expect(container.querySelector('[title]')).toBeNull();
  });

  it('renders nothing for an empty or whitespace-only note', () => {
    const { unmount } = renderCard({ card_note: '' });
    expect(screen.queryByTitle(/\S/)).toBeNull();
    unmount();

    renderCard({ card_note: '   ' });
    expect(screen.queryByTitle(/\S/)).toBeNull();
  });

  it('trims the note it shows', () => {
    renderCard({ card_note: '  bring the lab manual  ' });
    expect(screen.getByText('bring the lab manual')).toBeInTheDocument();
  });

  it('carries the full note as the hover title, since the line is clipped', () => {
    const note = 'Recitation moved to Link Hall for the rest of the term';
    renderCard({ card_note: note });
    expect(screen.getByText(note)).toHaveAttribute('title', note);
  });
});

describe('CourseCard — the rest of the card is unchanged', () => {
  it('still shows the code, title and meeting line', () => {
    renderCard();
    expect(screen.getByText('IST 323')).toBeInTheDocument();
    expect(screen.getByText('Intro to Cybersecurity')).toBeInTheDocument();
    expect(screen.getByText(/Hinds Hall 010/)).toBeInTheDocument();
  });

  it('says so when a course has no scheduled meetings', () => {
    renderCard({ meetings: null });
    expect(screen.getByText('no scheduled meetings')).toBeInTheDocument();
  });
});

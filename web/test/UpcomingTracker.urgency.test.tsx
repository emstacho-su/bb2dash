/**
 * Upcoming work reads most urgent first (Phase 22, task 18; named exception 3 of brief 103).
 *
 * The legend names the five kinds as exam, project, quiz, assignment, reading. A day's bars are
 * drawn with the most urgent on top. `.barArea` is `flex-direction: column-reverse`, so the top
 * bar is the LAST child: a day whose items arrive as reading, quiz, exam ends with the exam, and
 * two items of one kind keep the order they arrived in.
 *
 * The clock is pinned to Thursday 2026-09-10; only `Date` is faked, as `UpcomingTracker.test.tsx`
 * does. The Supabase browser client is mocked because the module graph reaches it.
 */

import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeWorkItem } from './factories';

vi.mock('@/lib/supabase/client', () => ({
  getSupabaseBrowserClient: () => ({ auth: { getSession: vi.fn() } }),
}));

const { UpcomingTracker } = await import('@/components/tracker/UpcomingTracker');

const TODAY = '2026-09-10';
const URGENCY = ['exam', 'project', 'quiz', 'assignment', 'reading'] as const;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 8, 10, 9, 0, 0));
});

afterEach(() => {
  vi.useRealTimers();
});

function dueToday(id: string, category: (typeof URGENCY)[number], title: string) {
  return makeWorkItem({ item_id: id, title, due_on: TODAY, category, glyph: category[0].toUpperCase(), effort: 2 });
}

/** The titles of the bars in today's column, in DOM order (the last one is drawn on top). */
function barTitles(): string[] {
  const today = screen.getAllByRole('tab')[0];
  return [...today.querySelectorAll('span[title]')].map((bar) => (bar.getAttribute('title') ?? '').split(' · ')[0]);
}

describe('UpcomingTracker — most urgent first', () => {
  it('reads the legend as exam, project, quiz, assignment, reading', () => {
    render(<UpcomingTracker items={[]} onStatusChange={vi.fn()} />);
    const legend = screen.getByText('exam').parentElement;
    expect(legend).not.toBeNull();
    const text = legend?.textContent ?? '';
    const positions = URGENCY.map((label) => text.indexOf(label));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  it('draws the exam on top and the reading at the bottom of a mixed day', () => {
    render(
      <UpcomingTracker
        items={[
          dueToday('r', 'reading', 'Bottom reading'),
          dueToday('q', 'quiz', 'Middle quiz'),
          dueToday('e', 'exam', 'Top exam'),
        ]}
        onStatusChange={vi.fn()}
      />,
    );
    expect(barTitles()).toEqual(['Bottom reading', 'Middle quiz', 'Top exam']);
  });

  it('puts a project above an assignment and below an exam', () => {
    render(
      <UpcomingTracker
        items={[
          dueToday('p', 'project', 'A project'),
          dueToday('e', 'exam', 'An exam'),
          dueToday('a', 'assignment', 'An assignment'),
        ]}
        onStatusChange={vi.fn()}
      />,
    );
    expect(barTitles()).toEqual(['An assignment', 'A project', 'An exam']);
  });

  it('keeps two items of one kind in the order they arrived', () => {
    render(
      <UpcomingTracker
        items={[
          dueToday('r1', 'reading', 'Reading one'),
          dueToday('e', 'exam', 'The exam'),
          dueToday('r2', 'reading', 'Reading two'),
        ]}
        onStatusChange={vi.fn()}
      />,
    );
    expect(barTitles()).toEqual(['Reading one', 'Reading two', 'The exam']);
  });
});

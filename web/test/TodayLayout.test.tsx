/**
 * H-3 — the shape of the Home screen (P-home-3 and P-home-5).
 *
 * Two complaints, one row. "Upcoming work" and "today's work" used to be a bare
 * section with a separate card floating under it, which read as two unrelated
 * blocks; and the needs-attention row sat third from the top, above the work
 * Stack actually opens Home to see.
 *
 * So this asserts structure rather than appearance: that the strip and the day
 * panel have the SAME nearest card ancestor (one card, not two), and that the
 * needs-attention row is the last thing on the page.
 *
 * The whole screen is rendered with its query layer stubbed — every hook
 * `Today` calls is replaced, so nothing here reaches Supabase or TanStack.
 */

import { render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeCourseDisplay, makeWorkItem } from './factories';

const TODAY = '2026-09-10';

const stub = vi.hoisted(() => ({
  window: [] as unknown[],
  undated: [] as unknown[],
  courses: [] as unknown[],
  grades: { data: [] as unknown[], isPending: false, error: null as Error | null },
  figures: {} as Record<string, { figure: unknown; error: string | null }>,
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/lib/supabase/client', () => ({
  getSupabaseBrowserClient: () => ({ auth: { getSession: vi.fn() } }),
}));

const idle = { isPending: false, isFetching: false, isError: false, error: null };

vi.mock('@/lib/queries.today', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/queries.today')>();
  return {
    ...actual,
    useWorkItemsWindow: () => ({ ...idle, data: stub.window }),
    useUndatedWorkItems: () => ({ ...idle, data: stub.undated }),
    useCourseDisplay: () => ({ ...idle, data: stub.courses }),
    useTerm: () => ({ ...idle, data: null }),
    useSetItemStatus: () => ({ isPending: false, variables: undefined, mutate: vi.fn() }),
  };
});

// G-2: Home reads `v_course_grade` for the card's Blackboard figure. The
// figure has its own suite (test/CourseGradeFigure.test.tsx); here it only has
// to not want a QueryClient.
vi.mock('@/lib/queries.grades', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/queries.grades')>();
  return { ...actual, useCourseGrades: () => ({ ...idle, ...stub.grades }) };
});

// P-home-10: the graded-so-far figure comes from the hook `/grades` also uses.
// Its arithmetic has its own suite (test/graded-so-far.test.ts); here only the
// wiring is under test, so the hook hands back whatever the test sets.
vi.mock('@/lib/use-course-figures', () => ({
  useCourseFigures: () => ({ figures: stub.figures, items: [] }),
}));

// The needs-attention row has a query layer of its own; it is the position of
// the section that is under test here, not its contents.
vi.mock('@/app/(app)/NeedsAttention', () => ({
  NeedsAttentionRow: () => <section aria-label="Needs attention">needs attention</section>,
}));

const { Today } = await import('@/app/(app)/Today');
const { BLACKBOARD_ERROR_TEXT, GRADED_SO_FAR_ERROR_TEXT } = await import(
  '@/app/(app)/CourseGradeFigure'
);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 8, 10, 9, 0, 0));
  stub.window = [makeWorkItem({ item_id: 'a-today', title: 'Reading for today', due_on: TODAY })];
  stub.undated = [];
  stub.courses = [makeCourseDisplay({ display_id: 'IST.323', code: 'IST 323' })];
  stub.grades = { data: [], isPending: false, error: null };
  stub.figures = {};
});

afterEach(() => {
  vi.useRealTimers();
});

/** The nearest ancestor carrying the `card` token class, if any. */
function cardAround(element: HTMLElement): HTMLElement | null {
  return element.closest('[class*="card"]');
}

describe('Home — one card for upcoming work and today (P-home-3)', () => {
  it('puts the day strip and the day panel inside the same card', () => {
    render(<Today />);

    const strip = screen.getByRole('tablist', { name: 'Effort by day' });
    const panel = screen.getByText('Today, Sep 10');

    const stripCard = cardAround(strip);
    expect(stripCard).not.toBeNull();
    expect(cardAround(panel)).toBe(stripCard);
  });

  it('gives the panel no card of its own to float in', () => {
    render(<Today />);
    const panel = screen.getByText('Today, Sep 10');
    // Walking up from the panel, the first card reached is the section's —
    // there is no inner one between them.
    const strip = screen.getByRole('tablist', { name: 'Effort by day' });
    expect(cardAround(panel)).toContainElement(strip);
  });

  it('keeps the heading with them, so the whole block is one element', () => {
    render(<Today />);
    const card = cardAround(screen.getByRole('tablist', { name: 'Effort by day' }));
    expect(card).toContainElement(screen.getByRole('heading', { name: 'Upcoming work' }));
  });
});

describe('Home — the needs-attention row goes last (P-home-5)', () => {
  it('renders it after the course cards, not before the undated tray', () => {
    const { container } = render(<Today />);

    const sections = Array.from(
      container.querySelectorAll('section'),
    ) as HTMLElement[];
    const labels = sections.map(
      (section) =>
        section.getAttribute('aria-label') ??
        section.querySelector('h2')?.textContent ??
        '',
    );

    expect(labels.at(-1)).toBe('Needs attention');
    expect(labels.indexOf('Needs attention')).toBeGreaterThan(labels.indexOf('Undated'));
    expect(labels.indexOf('Needs attention')).toBeGreaterThan(labels.indexOf('Courses'));
  });

  it('still renders it — moving it down is not dropping it', () => {
    render(<Today />);
    expect(screen.getByRole('region', { name: 'Needs attention' })).toBeInTheDocument();
  });
});

/* ---------------------------------------------------------------------------
 * G-2 / P-home-10 — what Home actually wires into the card's grade slot
 * ------------------------------------------------------------------------ */

describe('Home — the course card grade slot', () => {
  const TOTAL_ROW = {
    course_id: 'IST.323',
    has_gradebook: true,
    gradebook_seen_at: '2026-09-16T14:00:00Z',
    has_total: true,
    total_column_id: '_1_1',
    total_name: 'Weighted Total',
    total_effective_score: 14.8,
    total_possible: 104,
    total_display_grade: null,
    total_seen_at: '2026-09-16T14:00:00Z',
    item_count: 20,
    graded_item_count: 6,
  };

  /** The card itself — "Blackboard" also appears in the tracker's rows. */
  function card(name = /Open IST 323/) {
    return within(screen.getByRole('link', { name }));
  }

  it("shows Blackboard's own total for the course's shell", () => {
    stub.grades = { data: [TOTAL_ROW], isPending: false, error: null };
    render(<Today />);
    expect(card().getByText('Blackboard')).toBeInTheDocument();
    expect(card().getByText(/14\.8 \/ 104/)).toBeInTheDocument();
  });

  it('says a course has no gradebook rather than showing a zero', () => {
    stub.grades = { data: [], isPending: false, error: null };
    render(<Today />);
    expect(card().getByText('not synced yet')).toBeInTheDocument();
  });

  it('claims nothing at all while the gradebook read is in flight', () => {
    // "not synced yet" is a claim about the data; a request in flight does not
    // support it, and neither does a failed one.
    stub.grades = { data: [], isPending: true, error: null };
    render(<Today />);
    expect(card().queryByText('Blackboard')).toBeNull();
    expect(card().queryByText('not synced yet')).toBeNull();
  });

  /* ---------------------------------------------------------------------
   * CR-7 — the two figures are independent.
   *
   * They come from different reads: Blackboard's total from `v_course_grade`,
   * graded-so-far from the scheme and item bulk reads behind `useCourseFigures`.
   * `cardGrades` returned [] the moment the gradebook read failed, so one
   * broken query took away a number the OTHER, perfectly healthy query had
   * already worked out — and it did so silently, leaving a card that looked
   * like a course with nothing to say.
   *
   * In flight still claims nothing: "not synced yet" is a statement about the
   * data, and a request that has not answered supports neither it nor its
   * opposite. A FAILED read is different — that is a fact about us, and the
   * card says it.
   * ------------------------------------------------------------------- */

  it('says so when the gradebook read failed, rather than going quiet', () => {
    stub.grades = { data: [], isPending: false, error: new Error('permission denied') };
    render(<Today />);
    expect(card().getByText('Blackboard')).toBeInTheDocument();
    expect(card().getByText(BLACKBOARD_ERROR_TEXT)).toBeInTheDocument();
    // …and never as a value, which would read as a grade.
    expect(card().queryByText('not synced yet')).toBeNull();
  });

  it('carries the real reason in the title, not on the card', () => {
    stub.grades = { data: [], isPending: false, error: new Error('permission denied') };
    render(<Today />);
    expect(card().getByText(BLACKBOARD_ERROR_TEXT).closest('[title]')).toHaveAttribute(
      'title',
      expect.stringContaining('permission denied'),
    );
  });

  it('still shows graded so far when only the gradebook read failed', () => {
    stub.grades = { data: [], isPending: false, error: new Error('permission denied') };
    stub.figures = { 'IST.323': { figure: FIGURE, error: null } };
    render(<Today />);
    expect(card().getByText('Graded so far')).toBeInTheDocument();
    expect(card().getByText(/84\.5%/)).toBeInTheDocument();
    expect(card().getByText(BLACKBOARD_ERROR_TEXT)).toBeInTheDocument();
  });

  it('still shows graded so far while the gradebook read is in flight', () => {
    stub.grades = { data: [], isPending: true, error: null };
    stub.figures = { 'IST.323': { figure: FIGURE, error: null } };
    render(<Today />);
    expect(card().getByText('Graded so far')).toBeInTheDocument();
    expect(card().queryByText('Blackboard')).toBeNull();
  });

  it('says so when the figures hook failed, and keeps Blackboard’s number', () => {
    stub.grades = { data: [TOTAL_ROW], isPending: false, error: null };
    stub.figures = { 'IST.323': { figure: null, error: 'Could not load the grading rules: x' } };
    render(<Today />);
    expect(card().getByText(/14\.8 \/ 104/)).toBeInTheDocument();
    expect(card().getByText('Graded so far')).toBeInTheDocument();
    expect(card().getByText(GRADED_SO_FAR_ERROR_TEXT)).toBeInTheDocument();
  });

  it('shows both failures at once without either hiding the other', () => {
    stub.grades = { data: [], isPending: false, error: new Error('permission denied') };
    stub.figures = { 'IST.323': { figure: null, error: 'Could not load the grading rules: x' } };
    render(<Today />);
    expect(card().getByText(BLACKBOARD_ERROR_TEXT)).toBeInTheDocument();
    expect(card().getByText(GRADED_SO_FAR_ERROR_TEXT)).toBeInTheDocument();
  });

  it('picks the right shell for a merged course', () => {
    stub.courses = [
      makeCourseDisplay({
        display_id: 'GEO.103',
        code: 'GEO 103',
        shell_ids: ['GEO.103.lecture', 'GEO.103.recitation'],
      }),
    ];
    stub.grades = {
      data: [
        { ...TOTAL_ROW, course_id: 'GEO.103.recitation', has_total: false },
        { ...TOTAL_ROW, course_id: 'GEO.103.lecture' },
        { ...TOTAL_ROW, course_id: 'IST.323', total_effective_score: 99 },
      ],
      isPending: false,
      error: null,
    };
    render(<Today />);
    // The shell that publishes a total wins, and another course's row is never
    // borrowed.
    const geo = card(/Open GEO 103/);
    expect(geo.getByText(/14\.8 \/ 104/)).toBeInTheDocument();
    expect(geo.queryByText(/99/)).toBeNull();
  });

  const FIGURE = {
    state: 'figure',
    percent: 84.46,
    letter: 'B',
    pointsEarned: null,
    pointsPossible: null,
    countedParts: ['Labs'],
    leftOutParts: ['Final Exam'],
    unlinkedColumns: [],
    asOf: '2026-09-16T14:00:00Z',
  };

  it('shows graded so far beside Blackboard’s number (P-home-10)', () => {
    stub.grades = { data: [TOTAL_ROW], isPending: false, error: null };
    stub.figures = { 'IST.323': { figure: FIGURE, error: null } };
    render(<Today />);
    expect(card().getByText('Graded so far')).toBeInTheDocument();
    expect(card().getByText(/84\.5%/)).toBeInTheDocument();
    expect(card().getByText(/14\.8 \/ 104/)).toBeInTheDocument();
  });

  it('says why a course has no graded-so-far number, never a zero', () => {
    stub.grades = { data: [TOTAL_ROW], isPending: false, error: null };
    stub.figures = { 'IST.323': { figure: { state: 'nothing_graded' }, error: null } };
    render(<Today />);
    expect(card().getByText('Graded so far')).toBeInTheDocument();
    expect(card().getByText('nothing graded yet')).toBeInTheDocument();
    expect(card().queryByText(/0%/)).toBeNull();
  });

  it('shows Blackboard’s number alone while the figure is still loading', () => {
    // Loading is `{ figure: null, error: null }` — FIGURE_LOADING. Only a
    // failure gets a message; a request in flight claims nothing.
    stub.grades = { data: [TOTAL_ROW], isPending: false, error: null };
    stub.figures = { 'IST.323': { figure: null, error: null } };
    render(<Today />);
    expect(card().getByText(/14\.8 \/ 104/)).toBeInTheDocument();
    expect(card().queryByText('Graded so far')).toBeNull();
  });

  it('shows Blackboard’s number alone for a course with no scheme at all', () => {
    stub.grades = { data: [TOTAL_ROW], isPending: false, error: null };
    stub.figures = {};
    render(<Today />);
    expect(card().getByText(/14\.8 \/ 104/)).toBeInTheDocument();
    expect(card().queryByText('Graded so far')).toBeNull();
  });
});

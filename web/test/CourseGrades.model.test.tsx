/**
 * The course Grades tab, end to end: the real query layer, a real QueryClient,
 * the real engine, and an in-memory Supabase stand-in whose
 * `v_grade_model_items` applies `grade_column_links` the way migration 058
 * does. No fake stands in for the engine (round 2, R2-16), so a broken one
 * fails here instead of hiding behind a mock.
 *
 * Phase 12b (G-1) removed the saved scenario, the what-if cells, the solver and
 * Reset, so the cases about them went with them. What is left is what the tab
 * is for now: the figure, and the one control that changes what it counts.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GradeComponentRow, GradeModelItemRow, GradingSchemeRow } from '@/lib/grade-model-input';
import type { GradebookLatestRow } from '@/lib/queries.grades';
import { makeGradebookRow } from './factories.grades';
import { IST466_COMPONENTS, IST466_SCHEME, IST466_SYNCHRONY, makeItem } from './factories.grade-model';

/* ---------------------------------------------------------------------------
 * The in-memory database
 * ------------------------------------------------------------------------ */

interface LinkRow { course_id: string; column_id: string; component_id: number | null; excluded: boolean }

const db = vi.hoisted(() => ({
  links: new Map<string, LinkRow>(),
  /** `relation:op` → the error message that write returns instead of succeeding. */
  failures: new Map<string, string>(),
}));

interface CourseFixture {
  readonly id: string;
  readonly code: string;
  readonly scheme: GradingSchemeRow;
  readonly components: readonly GradeComponentRow[];
  readonly items: readonly GradeModelItemRow[];
  readonly gradebook: readonly GradebookLatestRow[];
}

/**
 * IST.466 as prod holds it: the Ethics presentation linked and graded, and the
 * Synchrony major case linked only `tentative`. Before G-1 that unsure link
 * emptied the whole course; now it counts and the row says "unsure".
 */
const IST466_FIXTURE: CourseFixture = {
  id: 'IST.466',
  code: 'IST 466',
  scheme: IST466_SCHEME,
  components: IST466_COMPONENTS,
  items: [
    makeItem({ score: 90 }),
    { ...IST466_SYNCHRONY, score: 120 },
  ],
  gradebook: [
    makeGradebookRow({ course_id: 'IST.466', column_id: '_3562497_1', name: 'Ethics Case Presentation', possible: 100, effective_score: 90, assignment_id: null }),
    makeGradebookRow({ course_id: 'IST.466', column_id: '_3562496_1', name: 'Synchrony Major Case #1', possible: 150, effective_score: 120, assignment_id: null }),
  ],
};

let course: CourseFixture = IST466_FIXTURE;

/** 058's override rule, applied to the base rows. */
function modelItems(): GradeModelItemRow[] {
  return course.items.map((item) => {
    const link = item.column_id ? db.links.get(`${item.shell_course_id}:${item.column_id}`) : undefined;
    if (!link) return item;
    return {
      ...item,
      component_id: link.excluded ? item.component_id : link.component_id,
      link_source: 'override',
      link_confidence: 'confirmed',
      excluded: link.excluded,
    };
  });
}

type Filters = Record<string, string>;

function read(relation: string): unknown {
  switch (relation) {
    case 'grading_schemes': return course.scheme;
    case 'grade_components': return course.components;
    case 'v_grade_model_items': return modelItems();
    case 'v_gradebook_history': return [];
    default: throw new Error(`unexpected read of ${relation}`);
  }
}

function write(relation: string, op: 'upsert' | 'delete', payload: Record<string, unknown> | null, filters: Filters) {
  if (relation === 'grade_column_links' && op === 'upsert' && payload) {
    db.links.set(`${payload.course_id}:${payload.column_id}`, payload as unknown as LinkRow);
  } else if (relation === 'grade_column_links' && op === 'delete') {
    db.links.delete(`${filters.course_id}:${filters.column_id}`);
  } else {
    throw new Error(`unexpected ${op} on ${relation}`);
  }
}

function builder(relation: string) {
  const filters: Filters = {};
  let op: 'select' | 'upsert' | 'delete' = 'select';
  let payload: Record<string, unknown> | null = null;
  const settle = () => {
    if (op === 'select') return { data: read(relation), error: null };
    const failure = db.failures.get(`${relation}:${op}`);
    if (failure) return { data: null, error: new Error(failure) };
    write(relation, op, payload, filters);
    return { data: null, error: null };
  };
  const chain = {
    select: () => chain,
    order: () => chain,
    in: () => chain,
    eq: (column: string, value: unknown) => {
      filters[column] = String(value);
      return chain;
    },
    upsert: (row: Record<string, unknown>) => {
      op = 'upsert';
      payload = row;
      return chain;
    },
    delete: () => {
      op = 'delete';
      return chain;
    },
    maybeSingle: () => Promise.resolve(settle()),
    then: (resolve: (value: { data: unknown; error: Error | null }) => unknown) => Promise.resolve(settle()).then(resolve),
  };
  return chain;
}

vi.mock('@/lib/supabase/client', () => ({
  getSupabaseBrowserClient: () => ({ from: (relation: string) => builder(relation), auth: { getSession: vi.fn() } }),
}));
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));

function stub<T>(data: T) {
  return { data, isPending: false, isFetching: false, isError: false, error: null };
}

vi.mock('@/lib/queries.course', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/queries.course')>();
  return {
    ...actual,
    useCourseDisplay: () =>
      stub({ display_id: course.id, code: course.code, title: course.code, shell_ids: [course.id], meetings: null, room_disputed: false, bb_url: null, card_note: null }),
  };
});
vi.mock('@/lib/queries.grades', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/queries.grades')>();
  return { ...actual, useCourseGrades: () => stub([]), useGradebookLatest: () => stub(course.gradebook) };
});

const { CourseGrades } = await import('@/app/(app)/course/[id]/grades/CourseGrades');

/** A fresh QueryClient each time: a remount here is a page reload. */
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <CourseGrades courseId={course.id} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  course = IST466_FIXTURE;
  db.links.clear();
  db.failures.clear();
});

describe('CourseGrades — the figure', () => {
  it('states one number, worked out by the real engine from the real query layer', async () => {
    mount();
    // Ethics presentation 90/100 of its 100-point part → 90 of 100 graded.
    // Major Cases is a 300-point `sum` over 2 expected cases, so Synchrony's
    // 120/150 is 300 × 120/300 = 120 earned of 300 × 150/300 = 150 graded.
    // (120 + 90) / (150 + 100) = 84 %. The Letter of Gratitude part has no
    // column at all, so it is on neither side.
    expect(await screen.findByText('84.0%')).toBeInTheDocument();
    expect(screen.getByText('Graded so far')).toBeInTheDocument();
  });

  it('G-1: an unsure link no longer empties the course', async () => {
    mount();
    await screen.findByText('84.0%');
    const row = screen.getByText('Synchrony Major Case #1').closest('tr') as HTMLElement;
    // The link is still flagged on the row…
    expect(within(row).getByText('unsure')).toBeInTheDocument();
    // …but its 120/150 is in the figure. Before G-1 the whole Major Cases part
    // was dropped, and the course read 90 %.
    expect(screen.getByText(/Not counted yet/).textContent).not.toContain('Major Case');
  });

  it('offers no what-if cell, no solver and no Reset', async () => {
    mount();
    await screen.findByText('84.0%');
    expect(screen.queryByLabelText(/what if/)).toBeNull();
    expect(screen.queryByLabelText('Target letter')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Reset scenario' })).toBeNull();
  });

  it('says nothing has been graded rather than showing a zero', async () => {
    course = { ...IST466_FIXTURE, items: IST466_FIXTURE.items.map((row) => ({ ...row, score: null })) };
    mount();
    expect(
      await screen.findByText('Nothing that counts toward the grade has been graded yet.'),
    ).toBeInTheDocument();
  });
});

describe('CourseGrades — the "Counts toward…" picker', () => {
  it('confirming the unsure major-case link writes an override, and the row stops saying "unsure"', async () => {
    mount();
    // Wait for the figure: it lands after the same reads the picker needs.
    await screen.findByText('84.0%');
    const row = screen.getByText('Synchrony Major Case #1').closest('tr') as HTMLElement;
    expect(within(row).getByText('unsure')).toBeInTheDocument();

    fireEvent.click(within(row).getByRole('button', { name: 'Confirm link: Synchrony Major Case #1' }));

    await waitFor(() =>
      expect(db.links.get('IST.466:_3562496_1')).toEqual({
        course_id: 'IST.466',
        column_id: '_3562496_1',
        component_id: 24,
        excluded: false,
      }),
    );
    await waitFor(() => {
      const after = screen.getByText('Synchrony Major Case #1').closest('tr') as HTMLElement;
      expect(within(after).queryByText('unsure')).toBeNull();
    });
    // Confirming a link it was already counting does not move the figure.
    expect(screen.getByText('84.0%')).toBeInTheDocument();
  });

  it("surfaces the database's refusal on the row that caused it", async () => {
    db.failures.set('grade_column_links:upsert', 'component belongs to another course');
    mount();
    await screen.findByText('84.0%');
    const row = screen.getByText('Synchrony Major Case #1').closest('tr') as HTMLElement;
    fireEvent.click(within(row).getByRole('button', { name: 'Confirm link: Synchrony Major Case #1' }));
    expect(await screen.findByText(/component belongs to another course/)).toBeInTheDocument();
  });
});

describe('CourseGrades — honesty', () => {
  it('prints no percentage outside the labelled figure', async () => {
    const { container } = mount();
    await screen.findByText('84.0%');
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    let count = 0;
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!/\d%/.test(node.textContent ?? '')) continue;
      count += 1;
      expect(node.parentElement?.closest('[data-figure]')).not.toBeNull();
    }
    expect(count).toBeGreaterThan(0);
  });
});

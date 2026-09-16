/**
 * The course Grades tab with the model: persistence, Reset, and a picker link
 * turning a muted part back on — end to end through the real query layer, a
 * real QueryClient and an in-memory Supabase stand-in whose `v_grade_model_items`
 * applies `grade_column_links` the way migration 058 does.
 *
 * The engine is the real one (round 2, R2-16): no fake stands in for it, so a
 * missing or broken engine fails these tests instead of hiding behind one.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GradeComponentRow, GradeModelItemRow, GradingSchemeRow } from '@/lib/grade-model-input';
import type { GradebookLatestRow } from '@/lib/queries.grades';
import { makeGradebookRow } from './factories.grades';
import {
  ECN304_EXAM1_PLACEHOLDER,
  IST466_COMPONENTS,
  IST466_LETTER_PLACEHOLDER,
  IST466_SCHEME,
  IST466_SYNCHRONY,
  makeComponent,
  makeItem,
} from './factories.grade-model';

/* ---------------------------------------------------------------------------
 * The in-memory database
 * ------------------------------------------------------------------------ */

interface ScenarioRow { course_id: string; item_scores: Record<string, number>; target_letter: string | null; updated_at: string }
interface LinkRow { course_id: string; column_id: string; component_id: number | null; excluded: boolean }

const db = vi.hoisted(() => ({
  scenarios: new Map<string, ScenarioRow>(),
  links: new Map<string, LinkRow>(),
  /** `relation:op` → the error message that write returns instead of succeeding. */
  failures: new Map<string, string>(),
}));

/**
 * A pointless confirmed placeholder on a single-item part of its own (Round 1b A1). It must not
 * share a part with a real column: a part with more items than `count_expected` drops its
 * placeholders first (Contract, Semantics), so the what-if would be ignored.
 */
const ETHICS_PRACTICE_2 = makeComponent({ id: 36, code: 'ethics_practice_2', name: 'Ethics Practice 2', points: 50 });
const ETHICS_PRACTICE_PLACEHOLDER: GradeModelItemRow = {
  ...ECN304_EXAM1_PLACEHOLDER,
  scheme_course_id: 'IST.466',
  shell_course_id: 'IST.466',
  item_key: 'asg:IST.466/ethics-practice-2',
  assignment_id: 'IST.466/ethics-practice-2',
  component_id: ETHICS_PRACTICE_2.id,
  name: 'Ethics Practice 2',
};

const ETHICS_KEY = 'col:IST.466:_3562497_1';

/** One course's rows, as the stand-in database serves them. */
interface CourseFixture {
  readonly id: string;
  readonly code: string;
  readonly scheme: GradingSchemeRow;
  readonly components: readonly GradeComponentRow[];
  readonly items: readonly GradeModelItemRow[];
  readonly gradebook: readonly GradebookLatestRow[];
}

const IST466_FIXTURE: CourseFixture = {
  id: 'IST.466',
  code: 'IST 466',
  scheme: IST466_SCHEME,
  components: [...IST466_COMPONENTS, ETHICS_PRACTICE_2],
  items: [makeItem(), IST466_SYNCHRONY, IST466_LETTER_PLACEHOLDER, ETHICS_PRACTICE_PLACEHOLDER],
  gradebook: [
    makeGradebookRow({ course_id: 'IST.466', column_id: '_3562497_1', name: 'Ethics Case Presentation', possible: 100, assignment_id: null }),
    makeGradebookRow({ course_id: 'IST.466', column_id: '_3562496_1', name: 'Synchrony Major Case #1', possible: 150, assignment_id: null }),
  ],
};

/** The course the tab is showing; each describe may swap it in its own beforeEach. */
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

function read(relation: string, filters: Filters): unknown {
  switch (relation) {
    case 'grading_schemes': return course.scheme;
    case 'grade_components': return course.components;
    case 'v_grade_model_items': return modelItems();
    case 'v_grade_model_total': return null;
    case 'v_gradebook_history': return [];
    case 'grade_scenarios': return db.scenarios.get(filters.course_id) ?? null;
    default: throw new Error(`unexpected read of ${relation}`);
  }
}

function write(relation: string, op: 'upsert' | 'delete', payload: Record<string, unknown> | null, filters: Filters) {
  if (relation === 'grade_scenarios' && op === 'upsert' && payload) {
    db.scenarios.set(String(payload.course_id), { ...(payload as unknown as ScenarioRow), updated_at: 'now' });
  } else if (relation === 'grade_scenarios' && op === 'delete') {
    db.scenarios.delete(filters.course_id);
  } else if (relation === 'grade_column_links' && op === 'upsert' && payload) {
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
    if (op === 'select') return { data: read(relation, filters), error: null };
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

/* ---------------------------------------------------------------------------
 * The 10a hooks the tab also calls, stubbed
 * ------------------------------------------------------------------------ */

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

function whatIfField(name: string): Promise<HTMLInputElement> {
  return screen.findByLabelText(new RegExp(`what if\\s*—\\s*${name}`)) as Promise<HTMLInputElement>;
}

const MUTED_LINE = 'Left out: Two Major Case Studies (Synchrony, SU IT) — the link to the syllabus is unsure';

beforeEach(() => {
  course = IST466_FIXTURE;
  db.scenarios.clear();
  db.links.clear();
  db.failures.clear();
});

describe('CourseGrades — the scenario persists', () => {
  it('saves a what-if value on blur and restores it after a remount', async () => {
    const first = mount();
    const field = await whatIfField('Ethics Case Presentation');
    fireEvent.change(field, { target: { value: '90' } });
    fireEvent.blur(field);

    await waitFor(() => expect(db.scenarios.get('IST.466')?.item_scores).toEqual({ [ETHICS_KEY]: 90 }));
    expect(await screen.findByText('includes what-if values')).toBeInTheDocument();

    first.unmount();
    mount();
    expect((await whatIfField('Ethics Case Presentation')).value).toBe('90');
    expect(await screen.findByText('includes what-if values')).toBeInTheDocument();
  });

  it('types a hypothetical on a "Not in Blackboard yet" row', async () => {
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Not in Blackboard yet (2)' }));
    const field = await whatIfField('Letter of Gratitude');
    fireEvent.change(field, { target: { value: '95' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    await waitFor(() =>
      expect(db.scenarios.get('IST.466')?.item_scores).toEqual({ 'asg:IST.466/letter-of-gratitude': 95 }),
    );
  });

  it('Reset scenario deletes the row and empties every cell', async () => {
    db.scenarios.set('IST.466', { course_id: 'IST.466', item_scores: { [ETHICS_KEY]: 90 }, target_letter: 'A', updated_at: 'x' });
    mount();
    expect((await whatIfField('Ethics Case Presentation')).value).toBe('90');

    fireEvent.click(screen.getByRole('button', { name: 'Reset scenario' }));
    await waitFor(() => expect(db.scenarios.has('IST.466')).toBe(false));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Reset scenario' })).toBeNull());
    expect((await whatIfField('Ethics Case Presentation')).value).toBe('');
  });
});

describe('CourseGrades — a percentage what-if (Round 1b A1)', () => {
  it('types a percentage on a pointless confirmed placeholder and the standing uses it', async () => {
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Not in Blackboard yet (2)' }));
    const field = await whatIfField('Ethics Practice 2');
    const cell = field.closest('[data-what-if-unit]') as HTMLElement;
    expect(cell).toHaveAttribute('data-what-if-unit', 'percent');

    fireEvent.change(field, { target: { value: '101' } });
    fireEvent.blur(field);
    expect(await within(cell).findByRole('alert')).toHaveTextContent('Enter a number from 0 to 100.');
    expect(db.scenarios.has('IST.466')).toBe(false);

    fireEvent.change(field, { target: { value: '80' } });
    fireEvent.blur(field);
    await waitFor(() => expect(db.scenarios.get('IST.466')?.item_scores).toEqual({ 'asg:IST.466/ethics-practice-2': 80 }));
    expect(await screen.findByText('includes what-if values')).toBeInTheDocument();
  });
});

describe('CourseGrades — only the latest scenario action shows its error (R2-10)', () => {
  const SAVED = { course_id: 'IST.466', item_scores: { [ETHICS_KEY]: 90 }, target_letter: null, updated_at: 'x' };

  it("a successful Reset clears a failed save's alert", async () => {
    db.scenarios.set('IST.466', SAVED);
    db.failures.set('grade_scenarios:upsert', 'network down');
    mount();

    const field = await whatIfField('Ethics Case Presentation');
    fireEvent.change(field, { target: { value: '70' } });
    fireEvent.blur(field);
    expect(await screen.findByText('Could not save the scenario: network down')).toBeInTheDocument();

    db.failures.clear();
    fireEvent.click(await screen.findByRole('button', { name: 'Reset scenario' }));
    await waitFor(() => expect(db.scenarios.has('IST.466')).toBe(false));
    await waitFor(() => expect(screen.queryByText(/Could not save the scenario/)).toBeNull());
  });

  it("a successful save clears a failed Reset's alert", async () => {
    db.scenarios.set('IST.466', SAVED);
    db.failures.set('grade_scenarios:delete', 'permission denied');
    mount();

    fireEvent.click(await screen.findByRole('button', { name: 'Reset scenario' }));
    expect(await screen.findByText('Could not reset the scenario: permission denied')).toBeInTheDocument();

    db.failures.clear();
    const field = await whatIfField('Ethics Case Presentation');
    await waitFor(() => expect(field.value).toBe('90'));
    fireEvent.change(field, { target: { value: '80' } });
    fireEvent.blur(field);
    await waitFor(() => expect(db.scenarios.get('IST.466')?.item_scores).toEqual({ [ETHICS_KEY]: 80 }));
    await waitFor(() => expect(screen.queryByText(/Could not reset the scenario/)).toBeNull());
  });
});

describe('CourseGrades — a link turns a muted part on', () => {
  it('confirming the unsure major-case link writes an override and un-mutes the part', async () => {
    db.scenarios.set('IST.466', { course_id: 'IST.466', item_scores: { [ETHICS_KEY]: 90 }, target_letter: null, updated_at: 'x' });
    mount();

    const model = await screen.findByRole('region', { name: 'Our model' });
    expect(await within(model).findByText(MUTED_LINE)).toBeInTheDocument();
    const row = screen.getByText('Synchrony Major Case #1').closest('tr') as HTMLElement;
    expect(within(row).getByText('unsure')).toBeInTheDocument();
    expect(within(row).queryByLabelText(/what if/)).toBeNull();

    fireEvent.click(within(row).getByRole('button', { name: 'Confirm link: Synchrony Major Case #1' }));

    await waitFor(() =>
      expect(db.links.get('IST.466:_3562496_1')).toEqual({ course_id: 'IST.466', column_id: '_3562496_1', component_id: 24, excluded: false }),
    );
    await waitFor(() => expect(screen.queryByText(MUTED_LINE)).toBeNull());
    const after = screen.getByText('Synchrony Major Case #1').closest('tr') as HTMLElement;
    expect(within(after).queryByText('unsure')).toBeNull();
    expect(within(after).getByLabelText(/what if/)).toBeInTheDocument();
  });
});

describe('CourseGrades — honesty', () => {
  it('keeps every computed percentage, the solver included, inside "Our model"', async () => {
    db.scenarios.set('IST.466', { course_id: 'IST.466', item_scores: { [ETHICS_KEY]: 90 }, target_letter: null, updated_at: 'x' });
    const { container } = mount();
    const model = await screen.findByRole('region', { name: 'Our model' });
    await within(model).findByLabelText('Target letter');

    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    let count = 0;
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!/\d%/.test(node.textContent ?? '')) continue;
      count += 1;
      expect(node.parentElement?.closest('[data-model]')).not.toBeNull();
    }
    expect(count).toBeGreaterThan(0);
  });
});

/* ---------------------------------------------------------------------------
 * Round 2: cells, placeholder rows and muting come from itemStates()
 * ------------------------------------------------------------------------ */

/**
 * The live IST.323 lab shape (R2-2 / R2-4): a real "Lab #1" column that no rule
 * is attached to yet, the four seeded lab placeholders, and a Final Project
 * whose Running Log piece is muted by a tentative checkpoint column. Hand-graded
 * participation is left out so the course can compute.
 */
const IST323_LAB_FIXTURE: CourseFixture = (() => {
  const part = (over: Partial<GradeComponentRow>) =>
    makeComponent({ course_id: 'IST.323', weight_pct: null, count_expected: 1, aggregation: 'single', ...over });
  const labPlaceholder = (n: number, due: string) =>
    makeItem({
      scheme_course_id: 'IST.323', shell_course_id: 'IST.323', item_key: `asg:IST.323/lab-${n}`,
      assignment_id: `IST.323/lab-${n}`, column_id: null, component_id: 16, name: `Lab #${n}`,
      possible: 5, column_kind: 'placeholder', due_at: due, seen_at: null,
    });
  const piece = (over: Partial<GradeModelItemRow>) =>
    makeItem({ scheme_course_id: 'IST.323', shell_course_id: 'IST.323', seen_at: null, ...over });
  return {
    id: 'IST.323',
    code: 'IST 323',
    scheme: { course_id: 'IST.323', method: 'points', total_points: 40, graded_out_of: 40, letter_scale: IST466_SCHEME.letter_scale },
    components: [
      part({ id: 14, code: 'final_project', name: 'Final Project: Security Program Proposal', points: 20, count_expected: null, aggregation: 'sum' }),
      part({ id: 16, code: 'labs', name: 'Required Labs', points: 20, count_expected: 4, aggregation: 'sum' }),
      part({ id: 18, code: 'fp_proposal', name: 'Final Project: Proposal', parent_id: 14, points: 11 }),
      part({ id: 19, code: 'fp_log', name: 'Final Project: Running Log', parent_id: 14, points: 3, count_expected: 2, aggregation: 'sum' }),
      part({ id: 20, code: 'fp_defense', name: 'Final Project: In-class Defense', parent_id: 14, points: 6 }),
    ],
    items: [
      piece({ item_key: 'col:IST.323:_3560541_1', column_id: '_3560541_1', assignment_id: null, component_id: null, link_source: null, link_confidence: null, name: 'Lab #1: Performing a Ransomware Attack', possible: 5, score: 4 }),
      labPlaceholder(1, '2026-09-24T03:59:00.000Z'),
      labPlaceholder(2, '2026-10-15T03:59:00.000Z'),
      labPlaceholder(3, '2026-12-01T04:59:00.000Z'),
      labPlaceholder(4, '2026-12-08T04:59:00.000Z'),
      piece({ item_key: 'col:IST.323:_3569947_1', column_id: '_3569947_1', component_id: 19, link_confidence: 'tentative', name: 'Log Checkpoint Assignment', possible: 1 }),
      piece({ item_key: 'asg:IST.323/fp-log-final', column_id: null, column_kind: 'placeholder', component_id: 19, name: 'Running Log (final)', possible: 2 }),
      piece({ item_key: 'asg:IST.323/fp-proposal', column_id: null, column_kind: 'placeholder', component_id: 18, name: 'Proposal', possible: 11 }),
    ],
    gradebook: [
      makeGradebookRow({ course_id: 'IST.323', column_id: '_3560541_1', name: 'Lab #1: Performing a Ransomware Attack', possible: 5, effective_score: 4, assignment_id: null, counts_toward_grade: false }),
      makeGradebookRow({ course_id: 'IST.323', column_id: '_3569947_1', name: 'Log Checkpoint Assignment', possible: 1, assignment_id: null }),
    ],
  };
})();

describe('CourseGrades — the engine decides cells and placeholder rows (R2-3w / R2-4 / R2-15)', () => {
  beforeEach(() => {
    course = IST323_LAB_FIXTURE;
  });

  it('after linking Lab #1, the seeded "Lab #1" placeholder is gone and "Lab #4" still has a cell', async () => {
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Not in Blackboard yet (6)' }));
    expect(await screen.findByText('Lab #1')).toBeInTheDocument();
    expect(await whatIfField('Lab #4')).toBeInTheDocument();

    const labRow = screen.getByText('Lab #1: Performing a Ransomware Attack').closest('tr') as HTMLElement;
    const picker = within(labRow).getByRole('combobox') as HTMLSelectElement;
    expect([...picker.options].map((o) => o.textContent)).not.toContain('Final Project: Security Program Proposal');
    fireEvent.change(picker, { target: { value: '16' } });

    await waitFor(() => expect(db.links.get('IST.323:_3560541_1')).toMatchObject({ component_id: 16, excluded: false }));
    await waitFor(() => expect(screen.queryByText('Lab #1')).toBeNull());
    expect(screen.getByRole('button', { name: 'Not in Blackboard yet (5)' })).toBeInTheDocument();
    expect(await whatIfField('Lab #4')).toBeInTheDocument();
  });

  it('a piece of a muted part has no cell; a sibling piece that is not muted keeps its cell', async () => {
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Not in Blackboard yet (6)' }));
    expect(await whatIfField('Proposal')).toBeInTheDocument();
    const runningLog = screen.getByText('Running Log (final)').closest('tr') as HTMLElement;
    expect(within(runningLog).queryByLabelText(/what if/)).toBeNull();
    const checkpoint = screen.getByText('Log Checkpoint Assignment').closest('tr') as HTMLElement;
    expect(within(checkpoint).queryByLabelText(/what if/)).toBeNull();
  });
});

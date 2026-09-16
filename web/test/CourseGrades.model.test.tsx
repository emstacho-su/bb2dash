/**
 * The course Grades tab with the model: persistence, Reset, and a picker link
 * turning a muted part back on — end to end through the real query layer, a
 * real QueryClient and an in-memory Supabase stand-in whose `v_grade_model_items`
 * applies `grade_column_links` the way migration 058 does.
 *
 * The engine is the real one when W-19's implementation is present and the
 * Contract-shaped fake otherwise (`fake-grade-model.ts`); every assertion here
 * holds for both.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GradeModelItemRow } from '@/lib/grade-model-input';
import { makeGradebookRow } from './factories.grades';
import {
  ECN304_EXAM1_PLACEHOLDER,
  IST466_COMPONENTS,
  IST466_LETTER_PLACEHOLDER,
  IST466_SCHEME,
  IST466_SYNCHRONY,
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
}));

/** A pointless confirmed placeholder on IST.466's single-item Ethics part (Round 1b A1). */
const ETHICS_PRACTICE_PLACEHOLDER: GradeModelItemRow = {
  ...ECN304_EXAM1_PLACEHOLDER,
  scheme_course_id: 'IST.466',
  shell_course_id: 'IST.466',
  item_key: 'asg:IST.466/ethics-practice-2',
  assignment_id: 'IST.466/ethics-practice-2',
  component_id: 25,
  name: 'Ethics Practice 2',
};

const BASE_ITEMS: GradeModelItemRow[] = [makeItem(), IST466_SYNCHRONY, IST466_LETTER_PLACEHOLDER, ETHICS_PRACTICE_PLACEHOLDER];
const ETHICS_KEY = 'col:IST.466:_3562497_1';

/** 058's override rule, applied to the base rows. */
function modelItems(): GradeModelItemRow[] {
  return BASE_ITEMS.map((item) => {
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
    case 'grading_schemes': return IST466_SCHEME;
    case 'grade_components': return IST466_COMPONENTS;
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
    then: (resolve: (value: { data: unknown; error: null }) => unknown) => Promise.resolve(settle()).then(resolve),
  };
  return chain;
}

vi.mock('@/lib/supabase/client', () => ({
  getSupabaseBrowserClient: () => ({ from: (relation: string) => builder(relation), auth: { getSession: vi.fn() } }),
}));

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));

vi.mock('@/lib/grade-model', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/grade-model')>();
  const fake = await import('./fake-grade-model');
  return {
    ...actual,
    projectCourse: fake.engineOrFake(actual.projectCourse, fake.fakeProjectCourse),
    solveTarget: fake.engineOrFake(actual.solveTarget, fake.fakeSolveTarget),
  };
});

/* ---------------------------------------------------------------------------
 * The 10a hooks the tab also calls, stubbed
 * ------------------------------------------------------------------------ */

function stub<T>(data: T) {
  return { data, isPending: false, isFetching: false, isError: false, error: null };
}

const GRADEBOOK = [
  makeGradebookRow({ course_id: 'IST.466', column_id: '_3562497_1', name: 'Ethics Case Presentation', possible: 100, assignment_id: null }),
  makeGradebookRow({ course_id: 'IST.466', column_id: '_3562496_1', name: 'Synchrony Major Case #1', possible: 150, assignment_id: null }),
];

vi.mock('@/lib/queries.course', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/queries.course')>();
  return {
    ...actual,
    useCourseDisplay: () =>
      stub({ display_id: 'IST.466', code: 'IST 466', title: 'IM&T Capstone', shell_ids: ['IST.466'], meetings: null, room_disputed: false, bb_url: null, card_note: null }),
  };
});
vi.mock('@/lib/queries.grades', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/queries.grades')>();
  return { ...actual, useCourseGrades: () => stub([]), useGradebookLatest: () => stub(GRADEBOOK) };
});

const { CourseGrades } = await import('@/app/(app)/course/[id]/grades/CourseGrades');

/** A fresh QueryClient each time: a remount here is a page reload. */
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <CourseGrades courseId="IST.466" />
    </QueryClientProvider>,
  );
}

function whatIfField(name: string): Promise<HTMLInputElement> {
  return screen.findByLabelText(new RegExp(`what if\\s*—\\s*${name}`)) as Promise<HTMLInputElement>;
}

const MUTED_LINE = 'Left out: Two Major Case Studies (Synchrony, SU IT) — the link to the syllabus is unsure';

beforeEach(() => {
  db.scenarios.clear();
  db.links.clear();
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

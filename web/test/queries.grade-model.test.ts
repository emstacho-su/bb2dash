/**
 * The grade-model query layer: what it asks Supabase for, what it writes, and
 * how `toModelInput` reshapes rows for the engine.
 *
 * The view row types are hand-narrowed to the Contract, so nothing but this
 * file watches the relation names, filter columns and payloads. The client is a
 * recording fake; nothing here touches the network.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  IST466_COMPONENTS,
  IST466_SCHEME,
  SEEN_0916,
  IST466_SYNCHRONY,
  makeItem,
} from './factories.grade-model';

type Call = {
  relation: string;
  op: 'select' | 'upsert' | 'delete';
  columns: string;
  filters: string[];
  orders: string[];
  payload?: unknown;
  options?: unknown;
};

const calls: Call[] = [];
const results = new Map<string, { data: unknown; error: unknown }>();

function fakeBuilder(relation: string) {
  const call: Call = { relation, op: 'select', columns: '', filters: [], orders: [] };
  const settle = () => results.get(`${relation}:${call.op}`) ?? results.get(relation) ?? { data: [], error: null };
  const builder = {
    select(columns: string) {
      call.columns = columns;
      calls.push(call);
      return builder;
    },
    upsert(payload: unknown, options: unknown) {
      Object.assign(call, { op: 'upsert', payload, options });
      calls.push(call);
      return builder;
    },
    delete() {
      call.op = 'delete';
      calls.push(call);
      return builder;
    },
    eq(column: string, value: unknown) {
      call.filters.push(`eq:${column}=${String(value)}`);
      return builder;
    },
    in(column: string, values: unknown[]) {
      call.filters.push(`in:${column}=${values.join(',')}`);
      return builder;
    },
    order(column: string, options?: { ascending?: boolean }) {
      call.orders.push(`${column}:${options?.ascending === false ? 'desc' : 'asc'}`);
      return builder;
    },
    maybeSingle: () => Promise.resolve(settle()),
    then: (resolve: (value: { data: unknown; error: unknown }) => unknown) => resolve(settle()),
  };
  return builder;
}

vi.mock('@/lib/supabase/client', () => ({
  getSupabaseBrowserClient: () => ({ from: (relation: string) => fakeBuilder(relation) }),
}));

const q = await import('@/lib/queries.grade-model');

function run(options: { queryFn?: unknown }): Promise<unknown> {
  return (options.queryFn as () => Promise<unknown>)();
}

beforeEach(() => {
  calls.length = 0;
  results.clear();
});

/* ===========================================================================
 * Reads
 * ======================================================================== */

describe('reads — one scheme course', () => {
  it('reads the scheme row and its components, components ordered by id', async () => {
    results.set('grading_schemes', { data: IST466_SCHEME, error: null });
    results.set('grade_components', { data: IST466_COMPONENTS, error: null });
    const bundle = await run(q.gradingSchemeOptions('IST.466'));

    expect(calls.map((c) => c.relation)).toEqual(['grading_schemes', 'grade_components']);
    expect(calls[0].filters).toEqual(['eq:course_id=IST.466']);
    expect(calls[0].columns).toBe('course_id, method, total_points, graded_out_of, letter_scale');
    expect(calls[1].orders).toEqual(['id:asc']);
    expect(bundle).toEqual({ scheme: IST466_SCHEME, components: IST466_COMPONENTS });
  });

  it('returns a null scheme, not a fabricated one, when V-1 recorded none', async () => {
    results.set('grading_schemes', { data: null, error: null });
    expect(await run(q.gradingSchemeOptions('GEO.103.recitation'))).toEqual({ scheme: null, components: [] });
  });

  it('reads v_grade_model_items by scheme_course_id', async () => {
    await run(q.gradeModelItemsOptions('GEO.103.lecture'));
    expect(calls[0]).toMatchObject({
      relation: 'v_grade_model_items',
      filters: ['eq:scheme_course_id=GEO.103.lecture'],
      orders: ['item_key:asc'],
    });
  });

  it('reads v_gradebook_history for the shells, oldest first per column', async () => {
    await run(q.gradeHistoryOptions(['GEO.103.recitation', 'GEO.103.lecture']));
    expect(calls[0]).toMatchObject({
      relation: 'v_gradebook_history',
      filters: ['in:shell_course_id=GEO.103.recitation,GEO.103.lecture'],
      orders: ['shell_course_id:asc', 'column_id:asc', 'seen_at:asc'],
    });
  });

  it('is disabled without a scheme course and keys the same shells the same way', () => {
    expect(q.gradeModelItemsOptions(null).enabled).toBe(false);
    expect(q.gradeHistoryOptions([]).enabled).toBe(false);
    expect(q.gradeModelKeys.history(['b', 'a'])).toEqual(q.gradeModelKeys.history(['a', 'b']));
  });

  it('throws the database error instead of returning an empty list', async () => {
    results.set('v_grade_model_items', { data: null, error: new Error('permission denied') });
    await expect(run(q.gradeModelItemsOptions('IST.466'))).rejects.toThrow('permission denied');
  });
});

describe('reads — every course at once (/grades)', () => {
  it('fires one request per relation and groups components by course', async () => {
    results.set('grading_schemes', { data: [IST466_SCHEME], error: null });
    results.set('grade_components', { data: IST466_COMPONENTS, error: null });
    const byCourse = (await run(q.gradingSchemesForCoursesOptions(['IST.466', 'IST.471']))) as Record<string, unknown>;

    expect(calls).toHaveLength(2);
    expect(calls[0].filters).toEqual(['in:course_id=IST.466,IST.471']);
    expect(byCourse['IST.466']).toEqual({ scheme: IST466_SCHEME, components: IST466_COMPONENTS });
    expect(byCourse['IST.471']).toEqual({ scheme: null, components: [] });
  });

});

/* ===========================================================================
 * The adapter
 * ======================================================================== */

describe('toModelInput', () => {
  it('maps the scheme, sorting the letter scale best first', () => {
    const scrambled = { ...IST466_SCHEME, letter_scale: [{ min: 0, letter: 'F' }, { min: 930, letter: 'A' }, { bad: 1 }] };
    const input = q.toModelInput(scrambled, IST466_COMPONENTS, []);
    expect(input.scheme).toEqual({
      courseId: 'IST.466',
      method: 'points',
      totalPoints: 1020,
      gradedOutOf: 1020,
      letterScale: [{ min: 930, letter: 'A' }, { min: 0, letter: 'F' }],
    });
  });

  it('maps components, parsing rank weights and coercing numeric strings', () => {
    const exams = {
      ...IST466_COMPONENTS[0],
      id: 3,
      aggregation: 'rank_weighted' as const,
      rank_weights: [30, 25, 20],
      weight_pct: '75' as unknown as number,
    };
    const [component] = q.toModelInput(null, [exams], []).components;
    expect(component).toMatchObject({ id: 3, aggregation: 'rank_weighted', rankWeights: [30, 25, 20], weightPct: 75, dropLowest: 0 });
  });

  it('maps an item row field for field', () => {
    const input = q.toModelInput(IST466_SCHEME, IST466_COMPONENTS, [IST466_SYNCHRONY]);
    expect(input.items[0]).toEqual({
      key: 'col:IST.466:_3562496_1',
      componentId: 24,
      linkSource: 'assignment',
      linkConfidence: 'tentative',
      excluded: false,
      name: 'Synchrony Major Case #1',
      possible: 150,
      score: null,
      exempt: false,
      kind: 'item',
      isExtraCredit: false,
      dueAt: null,
      seenAt: SEEN_0916,
    });
  });

  it("puts GEO 103's two shells into one input under the lecture's scheme", () => {
    const lecture = makeItem({ scheme_course_id: 'GEO.103.lecture', shell_course_id: 'GEO.103.lecture', item_key: 'col:GEO.103.lecture:_3602583_1', column_id: '_3602583_1', name: 'Absences' });
    const recitation = makeItem({ scheme_course_id: 'GEO.103.lecture', shell_course_id: 'GEO.103.recitation', item_key: 'col:GEO.103.recitation:_3602445_1', column_id: '_3602445_1', name: 'Attendance', link_source: 'override', component_id: 5 });
    const input = q.toModelInput({ ...IST466_SCHEME, course_id: 'GEO.103.lecture', method: 'weighted_pct' }, [], [lecture, recitation]);
    expect(input.scheme?.courseId).toBe('GEO.103.lecture');
    expect(input.items.map((i) => i.key)).toEqual(['col:GEO.103.lecture:_3602583_1', 'col:GEO.103.recitation:_3602445_1']);
    expect(input.items[1]).toMatchObject({ linkSource: 'override', componentId: 5 });
  });

  it('reads an unknown method, aggregation or confidence as unknown / null, never a guess', () => {
    const input = q.toModelInput(
      { ...IST466_SCHEME, method: 'curve' as never },
      [{ ...IST466_COMPONENTS[0], aggregation: 'best_of' as never }],
      [makeItem({ link_confidence: 'maybe' as never })],
    );
    expect(input.scheme?.method).toBe('unknown');
    expect(input.components[0].aggregation).toBe('unknown');
    expect(input.items[0].linkConfidence).toBeNull();
  });
});

describe('schemeCourseIdFor', () => {
  it('is the display id — the shell with no parent', () => {
    expect(q.schemeCourseIdFor({ display_id: 'GEO.103.lecture', shell_ids: ['GEO.103.lecture', 'GEO.103.recitation'] })).toBe('GEO.103.lecture');
  });
  it('falls back to a lone shell, and says nothing for anything else', () => {
    expect(q.schemeCourseIdFor({ display_id: null, shell_ids: ['IST.323'] })).toBe('IST.323');
    expect(q.schemeCourseIdFor({ display_id: null, shell_ids: ['a', 'b'] })).toBeNull();
    expect(q.schemeCourseIdFor(null)).toBeNull();
  });
});

/* ===========================================================================
 * Writes
 * ======================================================================== */

function wrapper(client: QueryClient) {
  // Named, not an arrow: react/display-name wants every component to say what
  // it is in a stack trace, including one that only exists to hold a provider.
  function QueryWrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client }, children);
  }
  return QueryWrapper;
}

function newClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
}

describe('useLinkColumn', () => {
  async function link(target: Parameters<ReturnType<typeof q.useLinkColumn>['mutateAsync']>[0]['target']) {
    const client = newClient();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => q.useLinkColumn(), { wrapper: wrapper(client) });
    await act(() => result.current.mutateAsync({ shellCourseId: 'GEO.103.recitation', columnId: '_3602445_1', target }));
    return invalidate;
  }

  it('upserts a component link with only the key and the target', async () => {
    const invalidate = await link({ kind: 'component', componentId: 5 });
    expect(calls).toEqual([
      expect.objectContaining({
        relation: 'grade_column_links',
        op: 'upsert',
        payload: { course_id: 'GEO.103.recitation', column_id: '_3602445_1', component_id: 5, excluded: false },
        options: { onConflict: 'course_id,column_id' },
      }),
    ]);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['grade-model', 'items'] });
  });

  it('writes "Not graded" as excluded with no component', async () => {
    await link({ kind: 'excluded' });
    expect(calls[0].payload).toEqual({ course_id: 'GEO.103.recitation', column_id: '_3602445_1', component_id: null, excluded: true });
  });

  it('clears an override by deleting its row', async () => {
    await link({ kind: 'clear' });
    expect(calls[0]).toMatchObject({ op: 'delete', filters: ['eq:course_id=GEO.103.recitation', 'eq:column_id=_3602445_1'] });
  });

  it("surfaces the trigger's refusal as the mutation error", async () => {
    results.set('grade_column_links:upsert', { data: null, error: new Error('grade component 1 does not belong to the grading scheme of IST.323') });
    const client = newClient();
    const { result } = renderHook(() => q.useLinkColumn(), { wrapper: wrapper(client) });
    act(() => result.current.mutate({ shellCourseId: 'IST.323', columnId: 'c', target: { kind: 'component', componentId: 1 } }));
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toContain('does not belong');
  });
});

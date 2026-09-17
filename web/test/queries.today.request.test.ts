/**
 * What the Today screen actually asks Supabase for.
 *
 * These two reads used to go through an `untypedClient()` cast that existed
 * only because `database.types.ts` predated migrations 014/015 — so nothing but
 * this file watches the relation names and the column lists now that they go
 * through the typed client. A select list that drifts from what `WorkItem` /
 * `CourseDisplay` promise is a screen full of `undefined`, not a type error,
 * because the row types are hand-narrowed on purpose (a view reports every
 * column nullable).
 *
 * The client is a recording fake; nothing here touches the network.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

type Recorded = {
  relation: string;
  columns: string;
  /** Every `.eq(column, value)` the read applied, in order. */
  filters: { column: string; value: unknown }[];
};

const recorded: Recorded[] = [];
let nextResult: { data: unknown; error: unknown } = { data: [], error: null };

function fakeBuilder(relation: string) {
  const entry: Recorded = { relation, columns: '', filters: [] };
  const builder = {
    select(columns: string) {
      entry.columns = columns;
      recorded.push(entry);
      return builder;
    },
    eq(column: string, value: unknown) {
      entry.filters.push({ column, value });
      return builder;
    },
    gte: () => builder,
    lte: () => builder,
    order: () => builder,
    then: (resolve: (value: typeof nextResult) => unknown) => resolve(nextResult),
  };
  return builder;
}

vi.mock('@/lib/supabase/client', () => ({
  getSupabaseBrowserClient: () => ({
    from: (relation: string) => fakeBuilder(relation),
    auth: { getSession: vi.fn() },
  }),
}));

const { workItemsWindowOptions, undatedWorkItemsOptions, courseDisplayOptions } = await import(
  '@/lib/queries.today'
);

/** Run an options object's queryFn; the fns here ignore their context. */
function run(options: { queryFn?: unknown }): Promise<unknown> {
  return (options.queryFn as () => Promise<unknown>)();
}

beforeEach(() => {
  recorded.length = 0;
  nextResult = { data: [], error: null };
});

describe('workItemsWindowOptions', () => {
  it('reads v_work_items and asks for every column WorkItem promises', async () => {
    await run(workItemsWindowOptions('2026-09-10', '2026-09-23'));

    expect(recorded).toHaveLength(1);
    expect(recorded[0].relation).toBe('v_work_items');
    for (const column of [
      'item_kind',
      'item_id',
      'course_id',
      'title',
      'due_on',
      'effort',
      'category',
      'glyph',
      'status',
      'in_workload',
      'undated',
    ]) {
      expect(recorded[0].columns).toContain(column);
    }
  });

  it('throws what Supabase reported rather than returning an empty window', async () => {
    nextResult = { data: null, error: new Error('permission denied') };
    await expect(run(workItemsWindowOptions('2026-09-10', '2026-09-23'))).rejects.toThrow(
      'permission denied',
    );
  });

  /**
   * H-4 / P-home-6 and P-home-7. `v_work_items.in_workload` is what migration
   * 073 turns into the switch that hides series placeholders and the ethics
   * case pool: `required is not false` for readings, `not hidden_from_workload`
   * for assignments. It only hides anything if the read asks for it, and a
   * dropped filter would show as twelve phantom rows rather than an error.
   */
  it('asks Postgres for workload rows only, dated ones', async () => {
    await run(workItemsWindowOptions('2026-09-10', '2026-09-23'));
    expect(recorded[0].filters).toEqual([
      { column: 'in_workload', value: true },
      { column: 'undated', value: false },
    ]);
  });
});

describe('undatedWorkItemsOptions', () => {
  it('reads the same view and the same columns as the dated window', async () => {
    await run(undatedWorkItemsOptions());
    const dated = recorded[0];
    recorded.length = 0;
    await run(workItemsWindowOptions('2026-09-10', '2026-09-23'));

    expect(dated.relation).toBe('v_work_items');
    expect(dated.columns).toBe(recorded[0].columns);
  });

  it('filters the Undated tray on in_workload too, or the tray shows the twelve', async () => {
    await run(undatedWorkItemsOptions());
    expect(recorded[0].filters).toEqual([
      { column: 'in_workload', value: true },
      { column: 'undated', value: true },
    ]);
  });
});

describe('courseDisplayOptions', () => {
  it('reads v_course_display including card_note, which the Home card renders', async () => {
    await run(courseDisplayOptions());

    expect(recorded).toHaveLength(1);
    expect(recorded[0].relation).toBe('v_course_display');
    expect(recorded[0].columns).toBe(
      'display_id, code, title, shell_ids, meetings, room_disputed, bb_url, card_note',
    );
  });

  it('throws rather than reporting a term with no courses in it', async () => {
    nextResult = { data: null, error: new Error('connection reset') };
    await expect(run(courseDisplayOptions())).rejects.toThrow('connection reset');
  });
});

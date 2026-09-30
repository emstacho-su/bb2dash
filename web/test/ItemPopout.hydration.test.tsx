/**
 * `?item=` popouts and React's hydration check (R-43: pasting
 * `/course/IST.471/classwork?item=assignment:IST.471/a1-proposal` into a new
 * tab threw React #418).
 *
 * `ItemPopout` is mounted in the (app) layout inside a Suspense boundary, so it
 * hydrates after `PersistQueryClientProvider` has restored the query cache. The
 * server rendered the panel from an empty cache ("Loading assignment…"); the
 * client's first render had the assignment from localStorage, and React threw
 * the server tree away.
 *
 * Each `?item=` kind gets one case: warm the cache with the real panel, render
 * the server HTML from an empty cache, hydrate it with the warm one, and require
 * no recoverable error and the panel's data on screen afterwards.
 */

import { renderToString } from 'react-dom/server';
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  hydrateOverServerHtml,
  newQueryClient,
  readChain,
  warmQueryCache,
} from './hydration-harness';

const state = vi.hoisted(() => ({
  search: '',
  byTable: {} as Record<string, unknown[]>,
}));

const SINGLE_TABLES = [
  'assignments',
  'assignment_progress',
  'grade_components',
  'grading_schemes',
  'sessions',
  'courses',
];

vi.mock('@/lib/supabase/client', () => ({
  getSupabaseBrowserClient: () => ({
    from: (table: string) => readChain(state.byTable, table, { singleTables: SINGLE_TABLES }),
    auth: { getSession: async () => ({ data: { session: null }, error: null }) },
  }),
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(state.search),
  usePathname: () => '/course/IST.471/classwork',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

const { ItemPopout } = await import('@/components/popout/ItemPopout');

function tree(client: QueryClient) {
  return (
    <QueryClientProvider client={client}>
      <ItemPopout />
    </QueryClientProvider>
  );
}

const ASSIGNMENT = {
  id: 'IST.471/a1-proposal',
  course_id: 'IST.471',
  title: 'A1 Internship Proposal',
  type: 'project',
  confidence: 'confirmed',
  source: 'blackboard',
  submission: 'blackboard',
  recurrence: 'none',
  is_group: false,
  is_extra_credit: false,
  hidden_from_workload: false,
  due_at: '2026-09-11T03:59:00Z',
  due_date: null,
  due_rule: null,
  event_start: null,
  event_end: null,
  available_from: null,
  points_possible: 10,
  component_id: null,
  series_key: null,
  sequence_no: null,
  group_key: null,
  bb_url: null,
  bb_column_id: null,
  bb_item_id: null,
  bb_submission_status: null,
  submission_format: null,
  description: null,
};

const SESSION = {
  id: 42,
  course_id: 'IST.466',
  session_date: '2026-09-29',
  kind: 'lecture',
  week_no: 6,
  topic: 'Privacy and surveillance',
  notes: null,
  confidence: 'confirmed',
  counts_attendance: true,
};

beforeEach(() => {
  state.byTable = {
    assignments: [ASSIGNMENT],
    sessions: [SESSION],
    courses: [],
  };
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('ItemPopout hydration', () => {
  it('renders the same placeholder on the server whatever the item', () => {
    state.search = 'item=assignment%3AIST.471%2Fa1-proposal';
    const assignmentHtml = renderToString(tree(newQueryClient()));
    state.search = 'item=session%3A42';
    const sessionHtml = renderToString(tree(newQueryClient()));

    for (const html of [assignmentHtml, sessionHtml]) {
      expect(html).toContain('role="dialog"');
      expect(html).toContain('Loading…');
      expect(html).not.toContain('Loading assignment');
      expect(html).not.toContain('Loading session');
    }
  });

  it('hydrates a pasted assignment link under a warm cache without error #418', async () => {
    state.search = 'item=assignment%3AIST.471%2Fa1-proposal';
    const warm = await warmQueryCache(tree, (container) =>
      expect(container.textContent).toContain('A1 Internship Proposal'),
    );

    const hydrated = await hydrateOverServerHtml(tree(newQueryClient()), tree(warm));
    try {
      await hydrated.waitForText('A1 Internship Proposal');
      expect(hydrated.recoverable).toHaveBeenCalledTimes(0);
    } finally {
      hydrated.unmount();
    }
  });

  it('hydrates a pasted session link under a warm cache without error #418', async () => {
    state.search = 'item=session%3A42';
    const warm = await warmQueryCache(tree, (container) =>
      expect(container.textContent).toContain('Privacy and surveillance'),
    );

    const hydrated = await hydrateOverServerHtml(tree(newQueryClient()), tree(warm));
    try {
      await hydrated.waitForText('Privacy and surveillance');
      expect(hydrated.recoverable).toHaveBeenCalledTimes(0);
    } finally {
      hydrated.unmount();
    }
  });

  it('renders nothing on the server without an item parameter', () => {
    state.search = '';
    expect(renderToString(tree(newQueryClient()))).toBe('');
  });
});

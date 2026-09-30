/**
 * The course timeline's per-session file line (Phase 18, task 24, R-67 interim).
 *
 * Session and week links on files were written once at seed time, so most
 * courses have no session-linked file at all, and every session row used to
 * read "no files" — a claim about the course's materials that was really a
 * claim about a missing join. Until the links are filled, a course with no
 * session-linked files prints no sub-line; a course with any keeps the
 * per-session counts, "no files" included, because there the line means
 * something.
 *
 * Phase 17 moved the timeline to `CourseTimeline` (the Stream tab). The data
 * is IST.352 in week 6 of Fall 2026 (term start Aug 24), clock on Tue Sep 29;
 * every session sits in the current or a later week, so all are drawn.
 */

import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeCourseDisplay } from './factories';
import { newQueryClient, readChain } from './hydration-harness';

const state = vi.hoisted(() => ({
  byTable: {} as Record<string, unknown[]>,
  /** Tables whose read never answers (a query in flight). */
  hang: new Set<string>(),
}));

/** A chain whose every terminal never settles. */
function hangingChain(): Record<string, unknown> {
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  const never = () => new Promise(() => {});
  for (const name of ['select', 'eq', 'neq', 'in', 'is', 'not', 'or', 'gte', 'lt', 'lte', 'order', 'limit']) {
    chain[name] = self;
  }
  chain.maybeSingle = never;
  chain.single = never;
  chain.then = (onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) =>
    never().then(onFulfilled, onRejected);
  return chain;
}

vi.mock('@/lib/supabase/client', () => ({
  getSupabaseBrowserClient: () => ({
    from: (table: string) =>
      state.hang.has(table)
        ? hangingChain()
        : readChain(state.byTable, table, { singleTables: ['v_course_display', 'terms'] }),
    auth: { getSession: vi.fn() },
  }),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/course/IST.352/stream',
  redirect: vi.fn(),
}));

const { CourseTimeline } = await import('@/components/course/CourseTimeline');

function session(id: number, week: number, date: string, topic: string) {
  return {
    id,
    course_id: 'IST.352',
    session_date: date,
    week_no: week,
    topic,
    kind: 'lecture',
    notes: null,
    confidence: 'confirmed',
    source: 'syllabus',
    counts_attendance: false,
  };
}

function file(id: number, sessionId: number, name: string) {
  return {
    id,
    session_id: sessionId,
    assignment_id: null,
    file_name: name,
    bucket: 'lecture_slides',
    mime_type: null,
    storage_path: `bb-files/IST.352/${name}`,
    source_url: null,
    local_path: null,
  };
}

function seed(files: unknown[]) {
  state.hang = new Set();
  state.byTable = {
    v_course_display: [makeCourseDisplay({ display_id: 'IST.352', code: 'IST 352', shell_ids: ['IST.352'] })],
    courses: [{ id: 'IST.352', location: null, term_id: 'fall-2026', kind: 'lecture', group_notes: null, card_note: null }],
    terms: [{ id: 'fall-2026', name: 'Fall 2026', start_date: '2026-08-24', end_date: '2026-12-11' }],
    sessions: [
      session(129, 6, '2026-09-29', 'Use cases'),
      session(130, 6, '2026-10-01', 'Activity diagrams'),
      session(131, 7, '2026-10-06', 'Sequence diagrams'),
    ],
    v_work_items: [],
    bb_files: files,
    v_course_stream: [],
    v_content_tree: [],
  };
}

function renderTimeline() {
  return render(
    <QueryClientProvider client={newQueryClient()}>
      <CourseTimeline courseId="IST.352" />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-29T14:00:00Z'));
  // jsdom has no layout; picking a week scrolls it into view.
  Element.prototype.scrollIntoView = vi.fn();
  seed([]);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('CourseTimeline — the per-session file line', () => {
  it('prints no "no files" line on any session when the course has 0 session-linked files', async () => {
    renderTimeline();
    await waitFor(() => expect(screen.getByText('Sequence diagrams')).toBeInTheDocument());
    expect(screen.getByText('Use cases')).toBeInTheDocument();
    expect(screen.queryByText('no files')).toBeNull();
    expect(screen.queryByText(/^\d+ files?$/)).toBeNull();
  });

  it('prints nothing while the files query has not landed', async () => {
    state.hang.add('bb_files');
    renderTimeline();
    // The pane waits for every source, the files included, before drawing rows.
    await waitFor(() => expect(screen.getByText('Loading the timeline…')).toBeInTheDocument());
    expect(screen.queryByText('no files')).toBeNull();
  });

  it('keeps per-session counts once the course has at least one linked file', async () => {
    seed([
      file(31, 129, 'SAD-ch7.pptx'),
      file(47, 130, 'SAD-ch8.pptx'),
      file(48, 130, 'SAD-ch8-notes.pdf'),
    ]);
    renderTimeline();
    await waitFor(() => expect(screen.getByText('2 files')).toBeInTheDocument());
    expect(screen.getByText('1 file')).toBeInTheDocument();
    // Session 131 has none while its course has some: there the line is true.
    expect(screen.getAllByText('no files')).toHaveLength(1);
  });
});

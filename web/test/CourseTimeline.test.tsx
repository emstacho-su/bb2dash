/**
 * R3-4: the Stream is the week-divided two-lane timeline.
 *
 * Left lane: each class session under its week divider with its lecture files
 * beneath it, and each announcement on the New York day it was posted, marked
 * with a bell. Right lane: assignments on their due dates, each with the files
 * linked to it (bb_files.assignment_id, or a file on the content node that
 * links the assignment) and the status select. Classwork keeps only the
 * folder tree; `?view=timeline` redirects to the Stream.
 *
 * The data is IST.352 in week 6 of Fall 2026 (term start Aug 24), with the
 * clock on Tue Sep 29.
 */

import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeCourseDisplay, makeWorkItem } from './factories';
import { makeStreamRow, makeTreeRow } from './factories.course';
import { newQueryClient, readChain } from './hydration-harness';

const state = vi.hoisted(() => ({ byTable: {} as Record<string, unknown[]> }));
const redirect = vi.hoisted(() =>
  vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT ${to}`);
  }),
);

vi.mock('@/lib/supabase/client', () => ({
  getSupabaseBrowserClient: () => ({
    from: (table: string) =>
      readChain(state.byTable, table, { singleTables: ['v_course_display', 'terms'] }),
    auth: { getSession: vi.fn() },
  }),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/course/IST.352/stream',
  redirect,
}));

const { CourseTimeline } = await import('@/components/course/CourseTimeline');
const { buildTimeline, filesByAssignment } = await import('@/components/course/timeline-model');
const { CourseClasswork } = await import('@/app/(app)/course/[id]/classwork/CourseClasswork');
const { default: CourseClassworkPage } = await import('@/app/(app)/course/[id]/classwork/page');

const TERM_START = '2026-08-24';

const SESSION = {
  id: 10,
  course_id: 'IST.352',
  session_date: '2026-09-29',
  week_no: 6,
  topic: 'Use cases',
  kind: 'lecture',
  notes: null,
  confidence: 'confirmed',
  source: 'syllabus',
  counts_attendance: false,
};

const ASSIGNMENT = makeWorkItem({
  item_id: 'IST.352/case-1',
  course_id: 'IST.352',
  title: 'Case analysis 1',
  item_kind: 'assignment',
  category: 'assignment',
  glyph: 'A',
  due_on: '2026-10-01',
  status: 'not_started',
});

const ANNOUNCEMENT = makeStreamRow({
  course_id: 'IST.352',
  post_kind: 'announcement',
  ref_kind: 'announcement',
  ref_id: '5',
  title: 'Room change Thursday',
  body: 'We meet in Hinds 117.',
  posted_at: '2026-09-30T15:00:00Z',
  meta: { is_read: true, is_unread: false },
});

function seed() {
  state.byTable = {
    v_course_display: [makeCourseDisplay({ display_id: 'IST.352', code: 'IST 352', shell_ids: ['IST.352'] })],
    courses: [{ id: 'IST.352', location: null, term_id: 'fall-2026', kind: 'lecture', group_notes: null, card_note: null }],
    terms: [{ id: 'fall-2026', name: 'Fall 2026', start_date: TERM_START, end_date: '2026-12-11' }],
    sessions: [SESSION],
    v_work_items: [ASSIGNMENT],
    bb_files: [
      { id: 1, session_id: 10, assignment_id: null, file_name: 'Lecture6.pptx', bucket: 'lecture_slides', mime_type: null, storage_path: 'bb-files/IST.352/Lecture6.pptx', source_url: null, local_path: null },
      { id: 2, session_id: null, assignment_id: 'IST.352/case-1', file_name: 'Case1-brief.pdf', bucket: 'assignment_spec', mime_type: 'application/pdf', storage_path: null, source_url: 'https://blackboard.syracuse.edu/bbcswebdav/case1', local_path: null },
    ],
    v_course_stream: [
      ANNOUNCEMENT,
      makeStreamRow({ course_id: 'IST.352', post_kind: 'assignment_posted', ref_kind: 'assignment', ref_id: 'IST.352/case-1', title: 'Case analysis 1 (posted)' }),
    ],
    v_content_tree: [
      makeTreeRow({ course_id: 'IST.352', content_id: 1602, title: 'Case 1', item_kind: 'assessment', assignment_id: 'IST.352/case-1', file_id: 3, file_name: 'Case1-template.docx' }),
    ],
  };
}

function renderTimeline() {
  const client = newQueryClient();
  return render(
    <QueryClientProvider client={client}>
      <CourseTimeline courseId="IST.352" />
    </QueryClientProvider>,
  );
}

async function weekLane(week: number, lane: 'sessions' | 'assignments') {
  const row = await waitFor(() => {
    const el = document.querySelector(`[data-week="${week}"]`);
    if (!el) throw new Error(`week ${week} not drawn yet: ${document.body.textContent?.slice(0, 200)}`);
    return el as HTMLElement;
  });
  return row.querySelector(`[data-lane="${lane}"]`) as HTMLElement;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-29T14:00:00Z'));
  seed();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('buildTimeline — where each thing lands', () => {
  it('puts a session in its week, an announcement on its New York posted day, an assignment on its due week', () => {
    const late = makeStreamRow({ ...ANNOUNCEMENT, ref_id: '6', posted_at: '2026-10-05T02:30:00Z' });
    const { weeks } = buildTimeline({
      sessions: [SESSION] as never,
      workItems: [ASSIGNMENT] as never,
      announcements: [ANNOUNCEMENT, late],
      termStart: TERM_START,
    });
    const w6 = weeks.find((w) => w.week === 6);
    expect(w6?.left.map((e) => e.kind)).toEqual(['session', 'announcement', 'announcement']);
    expect(w6?.assignments.map((a) => a.item_id)).toEqual(['IST.352/case-1']);
    // 02:30Z on Oct 5 is still Sunday Oct 4 in New York: week 6, not week 7.
    expect(w6?.announcements.map((a) => a.ref_id)).toEqual(['5', '6']);
  });

  it('merges an assignment’s direct and content-linked files, once each', () => {
    const map = filesByAssignment(
      [{ id: 2, session_id: null, assignment_id: 'A', file_name: 'x.pdf', bucket: null, mime_type: null, storage_path: null, source_url: 'https://x', local_path: null }],
      [
        makeTreeRow({ assignment_id: 'A', file_id: 2, file_name: 'x.pdf' }),
        makeTreeRow({ assignment_id: 'A', file_id: 3, file_name: 'y.docx' }),
      ],
    );
    expect(map.get('A')?.map((f) => f.file_name)).toEqual(['x.pdf', 'y.docx']);
  });
});

describe('CourseTimeline — the left lane', () => {
  it('draws the session under its week divider with its files below it', async () => {
    renderTimeline();
    const lane = await weekLane(6, 'sessions');
    await waitFor(() => expect(within(lane).getByText('Use cases')).toBeInTheDocument());
    await waitFor(() => expect(within(lane).getByText('Lecture6.pptx')).toBeInTheDocument());
    const session = within(lane).getByText('Use cases');
    const file = within(lane).getByText('Lecture6.pptx');
    expect(session.compareDocumentPosition(file) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('draws an announcement on its posted day, with a bell labelled "Announcement", linking to /announcements', async () => {
    renderTimeline();
    const lane = await weekLane(6, 'sessions');
    const link = await waitFor(() => within(lane).getByRole('link', { name: /Room change Thursday/ }));
    expect(link).toHaveAttribute('href', '/announcements');
    const entry = link.closest('[data-entry="announcement"]') as HTMLElement;
    expect(within(entry).getByRole('img', { name: 'Announcement' })).toBeInTheDocument();
    expect(entry).toHaveTextContent('Wed · Sep 30');
    // Only the announcement arm of the stream is used: the posted-assignment post is not.
    expect(screen.queryByText('Case analysis 1 (posted)')).toBeNull();
  });

  it('keeps the IST.466 attendance marker with the session rows', async () => {
    state.byTable.v_course_display = [makeCourseDisplay({ display_id: 'IST.466', code: 'IST 466', shell_ids: ['IST.466'] })];
    state.byTable.sessions = [{ ...SESSION, course_id: 'IST.466', counts_attendance: true }];
    renderTimeline();
    const lane = await weekLane(6, 'sessions');
    await waitFor(() =>
      expect(within(lane).getByText('Attendance and participation count')).toBeInTheDocument(),
    );
  });
});

describe('CourseTimeline — the right lane', () => {
  it('draws the assignment on its due week with its popout link, its linked files and the status select', async () => {
    renderTimeline();
    const lane = await weekLane(6, 'assignments');
    const link = await waitFor(() => within(lane).getByRole('link', { name: 'Case analysis 1' }));
    expect(link).toHaveAttribute('href', '?item=assignment%3AIST.352%2Fcase-1');
    await waitFor(() => expect(within(lane).getByText('Case1-brief.pdf')).toBeInTheDocument());
    expect(within(lane).getByText('Case1-template.docx')).toBeInTheDocument();
    expect(within(lane).getByRole('link', { name: 'Open ↗' })).toHaveAttribute(
      'href',
      'https://blackboard.syracuse.edu/bbcswebdav/case1',
    );
    expect(within(lane).getByLabelText('Status for Case analysis 1')).toHaveValue('not_started');
  });
});

describe('Classwork keeps only the folder tree', () => {
  it('has no week-timeline toggle', async () => {
    const client = newQueryClient();
    render(
      <QueryClientProvider client={client}>
        <CourseClasswork courseId="IST.352" />
      </QueryClientProvider>,
    );
    await waitFor(() => expect(screen.getByText('Blackboard content')).toBeInTheDocument());
    expect(screen.queryByRole('link', { name: /timeline/i })).toBeNull();
  });

  it('redirects ?view=timeline to the Stream', async () => {
    await expect(
      CourseClassworkPage({
        params: Promise.resolve({ id: 'IST.352' }),
        searchParams: Promise.resolve({ view: 'timeline' }),
      }),
    ).rejects.toThrow('NEXT_REDIRECT');
    expect(redirect).toHaveBeenCalledWith('/course/IST.352/stream');
  });

  it('carries every other query parameter across the redirect, so a pasted ?item= still opens', async () => {
    redirect.mockClear();
    await expect(
      CourseClassworkPage({
        params: Promise.resolve({ id: 'IST.466' }),
        searchParams: Promise.resolve({ view: 'timeline', item: 'session:105', tag: ['a b', 'c&d'] }),
      }),
    ).rejects.toThrow('NEXT_REDIRECT');
    expect(redirect).toHaveBeenCalledWith(
      '/course/IST.466/stream?item=session%3A105&tag=a+b&tag=c%26d',
    );
  });

  it('keeps the redirect on this app’s own stream path whatever the id holds', async () => {
    redirect.mockClear();
    await expect(
      CourseClassworkPage({
        params: Promise.resolve({ id: encodeURIComponent('//evil.example/x') }),
        searchParams: Promise.resolve({ view: 'timeline' }),
      }),
    ).rejects.toThrow('NEXT_REDIRECT');
    expect(redirect).toHaveBeenCalledWith('/course/%2F%2Fevil.example%2Fx/stream');
  });
});

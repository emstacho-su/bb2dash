/**
 * The session popout's two lists, and the counts above them.
 *
 * Both sections read `data ?? []` into a sentence — "No readings are recorded
 * for Wed · Sep 9", "No files are pinned to this session" — and both sentences
 * were being printed over a query that had failed, which is a statement about
 * the syllabus made out of a dropped connection. The sub-title counted the same
 * empty array as "0 materials · 0 readings".
 */

import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Stub = {
  data: unknown;
  isPending: boolean;
  isFetching: boolean;
  isError: boolean;
  error: Error | null;
};

const answered = (data: unknown): Stub => ({
  data,
  isPending: false,
  isFetching: false,
  isError: false,
  error: null,
});
const loading = (): Stub => ({
  data: undefined,
  isPending: true,
  isFetching: true,
  isError: false,
  error: null,
});
const failed = (message: string): Stub => ({
  data: undefined,
  isPending: false,
  isFetching: false,
  isError: true,
  error: new Error(message),
});

const SESSION = {
  id: 7,
  course_id: 'IST.323',
  session_date: '2026-09-09',
  kind: 'lecture',
  week_no: 3,
  topic: 'Threat modelling',
  notes: null,
  confidence: 'confirmed',
};

const state = vi.hoisted(() => ({
  session: null as unknown,
  readings: null as unknown,
  files: null as unknown,
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/lib/supabase/client', () => ({
  getSupabaseBrowserClient: () => ({ auth: { getSession: vi.fn() } }),
}));
vi.mock('@/lib/queries.popout', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/queries.popout')>();
  return {
    ...actual,
    useSession: () => state.session,
    useSessionReadings: () => state.readings,
    useSessionFiles: () => state.files,
  };
});

const { SessionPopout } = await import('@/components/popout/SessionPopout');

beforeEach(() => {
  state.session = answered(SESSION);
  state.readings = answered([]);
  state.files = answered([]);
});

describe('SessionPopout — readings', () => {
  it('says nothing is recorded for the date only once the query has answered', () => {
    render(<SessionPopout sessionId={7} />);
    expect(
      screen.getByText('No readings are recorded for Wed · Sep 9.'),
    ).toBeInTheDocument();
  });

  it('does not report an empty reading list for a query in flight', () => {
    state.readings = loading();
    render(<SessionPopout sessionId={7} />);

    expect(screen.queryByText(/No readings are recorded/)).toBeNull();
    expect(screen.getByText('readings loading…')).toBeInTheDocument();
  });

  it('names the failure rather than reporting no readings', () => {
    state.readings = failed('readings fetch failed');
    render(<SessionPopout sessionId={7} />);

    expect(screen.queryByText(/No readings are recorded/)).toBeNull();
    expect(screen.getByText('Could not load the readings: readings fetch failed')).toBeInTheDocument();
    expect(screen.getByText('readings unavailable')).toBeInTheDocument();
  });
});

describe('SessionPopout — files', () => {
  it('says nothing is pinned only once the query has answered', () => {
    render(<SessionPopout sessionId={7} />);
    expect(screen.getByText('No files are pinned to this session.')).toBeInTheDocument();
    expect(screen.getByText('0 materials')).toBeInTheDocument();
  });

  it('does not report an empty file list for a query in flight', () => {
    state.files = loading();
    render(<SessionPopout sessionId={7} />);

    expect(screen.queryByText(/No files are pinned/)).toBeNull();
    expect(screen.queryByText('0 materials')).toBeNull();
    expect(screen.getByText('materials loading…')).toBeInTheDocument();
  });

  it('names the failure rather than reporting no files', () => {
    state.files = failed('files fetch failed');
    render(<SessionPopout sessionId={7} />);

    expect(screen.queryByText(/No files are pinned/)).toBeNull();
    expect(screen.getByText('Could not load the files: files fetch failed')).toBeInTheDocument();
    expect(screen.getByText('materials unavailable')).toBeInTheDocument();
  });
});

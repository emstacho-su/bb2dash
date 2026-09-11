/**
 * The assignment popout's planner block.
 *
 * Two things are under test. First, what happens to a field while the owner is
 * typing in it: committing one field invalidates the `assignment_progress` row,
 * the refetch hands back a *new object* with the same values, and the effect
 * that seeded the form used to replace all four fields with it — wiping
 * whatever was half-typed. Second, what the panel says when a query it depends
 * on has not landed or has failed: "not recorded" and an editable empty planner
 * are claims, and a failed query has not earned them.
 *
 * Every query hook is a stub; nothing here reaches Supabase.
 */

import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

interface Stub<T> {
  data: T;
  isPending: boolean;
  isFetching: boolean;
  isError: boolean;
  error: Error | null;
}

function stub<T>(data: T, over: Partial<Stub<T>> = {}): Stub<T> {
  return { data, isPending: false, isFetching: false, isError: false, error: null, ...over };
}

const ASSIGNMENT = {
  id: 'IST.323/lab-1',
  course_id: 'IST.323',
  title: 'Lab #1',
  type: 'lab',
  description: 'Build the threat model.',
  due_date: '2026-09-14',
  due_at: null,
  due_rule: null,
  points_possible: 25,
  source: 'blackboard',
  source_ref: 'bb:_1234_1',
  series_key: 'labs',
  sequence_no: 1,
  confidence: 'confirmed',
  component_id: 3,
  is_group: false,
  is_extra_credit: false,
};

const PROGRESS = {
  assignment_id: 'IST.323/lab-1',
  status: 'in_progress',
  priority: 'normal',
  planned_start: '2026-09-11',
  planned_finish: null,
  est_minutes: 90,
  notes: 'saved notes',
};

const hooks = vi.hoisted(() => ({
  assignment: null as unknown,
  progress: null as unknown,
  component: null as unknown,
  scheme: null as unknown,
  series: null as unknown,
  course: null as unknown,
  save: null as unknown,
}));

vi.mock('@/lib/supabase/client', () => ({
  getSupabaseBrowserClient: () => ({ auth: { getSession: vi.fn() } }),
}));

vi.mock('@/lib/queries.popout', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/queries.popout')>();
  return {
    ...actual,
    useAssignment: () => hooks.assignment,
    useAssignmentProgress: () => hooks.progress,
    useGradeComponent: () => hooks.component,
    useGradingScheme: () => hooks.scheme,
    useAssignmentSeries: () => hooks.series,
    useSavePlanner: () => hooks.save,
  };
});

vi.mock('@/lib/queries', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/queries')>();
  return { ...actual, useCourse: () => hooks.course };
});

const { AssignmentPopout } = await import('@/components/popout/AssignmentPopout');

const mutate = vi.fn();

function notesBox(): HTMLTextAreaElement {
  return screen.getByLabelText('Notes') as HTMLTextAreaElement;
}
function estimateBox(): HTMLInputElement {
  return screen.getByLabelText('Estimate (minutes)') as HTMLInputElement;
}

beforeEach(() => {
  mutate.mockReset();
  mutate.mockImplementation((_vars, options) => options?.onSuccess?.());
  hooks.assignment = stub(ASSIGNMENT);
  hooks.progress = stub({ ...PROGRESS });
  hooks.component = stub({ id: 3, name: 'Labs', points: 100, weight_pct: 30 });
  hooks.scheme = stub({ late_policy: '10% a day.', ai_policy: 'Cite any AI use.' });
  hooks.series = stub([]);
  hooks.course = stub({ bb_url: 'https://blackboard.syracuse.edu/course/IST323' });
  hooks.save = { mutate, isPending: false, isError: false, error: null };
});

describe('AssignmentPopout — a refetch while the owner is typing', () => {
  it('keeps the text in a field that has not been committed yet', () => {
    const { rerender } = render(<AssignmentPopout assignmentId="IST.323/lab-1" />);
    expect(notesBox().value).toBe('saved notes');

    fireEvent.change(notesBox(), { target: { value: 'half-typed thought' } });

    // Committing another field invalidates the row; the refetch returns a new
    // object carrying the *old* notes.
    fireEvent.change(estimateBox(), { target: { value: '120' } });
    fireEvent.blur(estimateBox());
    hooks.progress = stub({ ...PROGRESS, est_minutes: 120 });
    rerender(<AssignmentPopout assignmentId="IST.323/lab-1" />);

    expect(notesBox().value).toBe('half-typed thought');
    expect(estimateBox().value).toBe('120');
  });

  it('adopts a server value for a field nobody is editing', () => {
    const { rerender } = render(<AssignmentPopout assignmentId="IST.323/lab-1" />);
    hooks.progress = stub({ ...PROGRESS, notes: 'changed in another tab' });
    rerender(<AssignmentPopout assignmentId="IST.323/lab-1" />);
    expect(notesBox().value).toBe('changed in another tab');
  });

  it('takes the server copy again once the field has been committed', () => {
    const { rerender } = render(<AssignmentPopout assignmentId="IST.323/lab-1" />);
    fireEvent.change(notesBox(), { target: { value: 'new notes' } });
    fireEvent.blur(notesBox());
    expect(mutate.mock.calls[0][0].patch).toEqual({ notes: 'new notes' });

    hooks.progress = stub({ ...PROGRESS, notes: 'new notes, tidied by the server' });
    rerender(<AssignmentPopout assignmentId="IST.323/lab-1" />);
    expect(notesBox().value).toBe('new notes, tidied by the server');
  });

  it('reseeds every field when the popout switches to another assignment', () => {
    const { rerender } = render(<AssignmentPopout assignmentId="IST.323/lab-1" />);
    fireEvent.change(notesBox(), { target: { value: 'notes for lab 1' } });

    hooks.assignment = stub({ ...ASSIGNMENT, id: 'IST.323/lab-2', title: 'Lab #2' });
    hooks.progress = stub(null);
    rerender(<AssignmentPopout assignmentId="IST.323/lab-2" />);

    expect(notesBox().value).toBe('');
    expect(estimateBox().value).toBe('');
  });

  it('does not write a field whose value is unchanged', () => {
    render(<AssignmentPopout assignmentId="IST.323/lab-1" />);
    fireEvent.focus(notesBox());
    fireEvent.blur(notesBox());
    expect(mutate).not.toHaveBeenCalled();
  });
});

describe('AssignmentPopout — queries that have not landed', () => {
  it('says the planner row is loading instead of "not planned yet"', () => {
    hooks.progress = stub(undefined, { isPending: true, isFetching: true });
    render(<AssignmentPopout assignmentId="IST.323/lab-1" />);

    expect(screen.queryByText('not planned yet')).toBeNull();
    expect(screen.getByText('loading…')).toBeInTheDocument();
    expect(notesBox()).toBeDisabled();
  });

  it('says the planner row failed instead of offering an empty form', () => {
    hooks.progress = stub(undefined, { isError: true, error: new Error('permission denied') });
    render(<AssignmentPopout assignmentId="IST.323/lab-1" />);

    expect(screen.queryByText('not planned yet')).toBeNull();
    expect(screen.getByText(/could not load your plan/i)).toBeInTheDocument();
    expect(notesBox()).toBeDisabled();
  });

  it('does not claim there is no grade component while the query is in flight', () => {
    hooks.component = stub(undefined, { isPending: true, isFetching: true });
    render(<AssignmentPopout assignmentId="IST.323/lab-1" />);
    expect(screen.queryByText('no grade component recorded')).toBeNull();
  });

  it('does not claim there is no grade component when the query failed', () => {
    hooks.component = stub(undefined, { isError: true, error: new Error('boom') });
    render(<AssignmentPopout assignmentId="IST.323/lab-1" />);
    expect(screen.queryByText('no grade component recorded')).toBeNull();
    expect(screen.getByText(/could not load the grade component/i)).toBeInTheDocument();
  });

  it('does not claim the course has no late or AI policy while the scheme loads', () => {
    hooks.scheme = stub(undefined, { isPending: true, isFetching: true });
    render(<AssignmentPopout assignmentId="IST.323/lab-1" />);
    expect(screen.queryByText(/No late policy is recorded/)).toBeNull();
    expect(screen.queryByText(/No AI policy is recorded/)).toBeNull();
  });

  it('says so when the scheme query failed, rather than "no policy recorded"', () => {
    hooks.scheme = stub(undefined, { isError: true, error: new Error('down') });
    render(<AssignmentPopout assignmentId="IST.323/lab-1" />);
    expect(screen.queryByText(/No AI policy is recorded/)).toBeNull();
    expect(screen.getAllByText(/could not load/i).length).toBeGreaterThan(0);
  });
});

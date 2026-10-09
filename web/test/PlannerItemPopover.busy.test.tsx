/**
 * Busy says busy on the planner popover's status select (Phase 22, round 2, R2-4b).
 *
 * The select is disabled for two different reasons: a save is in flight (busy) or the planner row
 * has not been read (switched off). Its stylesheet draws a busy field at half strength and a
 * switched-off one as a flat grey box, telling them apart by `aria-busy`. So `aria-busy` must follow
 * the save flag alone, never the other reason: a save must not flash the switched-off look.
 *
 * Every query hook is a stub; nothing here reaches Supabase.
 */

import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hooks = vi.hoisted(() => ({
  assignment: null as unknown,
  progress: null as unknown,
  course: null as unknown,
  grade: null as unknown,
  save: null as unknown,
}));

const ASSIGNMENT = {
  id: 'IST.323/lab-1',
  course_id: 'IST.323',
  title: 'Lab #1',
  type: 'lab',
  due_date: '2026-09-17',
  due_at: '2026-09-17T18:00:00Z',
  due_rule: null,
  points_possible: 25,
  source: 'blackboard',
  source_ref: null,
  series_key: null,
  sequence_no: null,
  confidence: 'confirmed',
  component_id: null,
  is_group: false,
  is_extra_credit: false,
  description: null,
};

function stub<T>(data: T, over: Record<string, unknown> = {}) {
  return { data, isPending: false, isFetching: false, isError: false, error: null, ...over };
}

vi.mock('@/lib/supabase/client', () => ({
  getSupabaseBrowserClient: () => ({ auth: { getSession: vi.fn() } }),
}));
vi.mock('@/lib/queries.popout', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/queries.popout')>();
  return {
    ...actual,
    useAssignment: () => hooks.assignment,
    useAssignmentProgress: () => hooks.progress,
    useSavePlanner: () => hooks.save,
  };
});
vi.mock('@/lib/queries', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/queries')>();
  return { ...actual, useCourse: () => hooks.course };
});
vi.mock('@/lib/queries.grades', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/queries.grades')>();
  return { ...actual, useAssignmentGrade: () => hooks.grade };
});
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode; [key: string]: unknown }) => (
    <a href={href} {...(rest as Record<string, string>)}>
      {children}
    </a>
  ),
}));

const { PlannerItemPopover } = await import('@/components/planner/PlannerItemPopover');

function renderPopover() {
  const card = document.createElement('div');
  card.getBoundingClientRect = () =>
    ({ top: 200, left: 300, width: 120, height: 40, right: 420, bottom: 240 }) as DOMRect;
  document.body.appendChild(card);
  return render(<PlannerItemPopover assignmentId="IST.323/lab-1" anchor={card} onClose={vi.fn()} />);
}

beforeEach(() => {
  document.body.innerHTML = '';
  hooks.assignment = stub(ASSIGNMENT);
  hooks.progress = stub({ assignment_id: 'IST.323/lab-1', status: 'in_progress' });
  hooks.course = stub({ id: 'IST.323', bb_url: 'https://blackboard.syracuse.edu/course/IST323' });
  hooks.grade = stub(null);
  hooks.save = { mutate: vi.fn(), isPending: false, isError: false, error: null };
});

describe('PlannerItemPopover status select — busy says busy', () => {
  it('is enabled and not busy at rest', () => {
    renderPopover();
    const select = screen.getByLabelText('Status');
    expect(select).toBeEnabled();
    expect(select).toHaveAttribute('aria-busy', 'false');
  });

  it('is disabled and busy while a save is in flight', () => {
    hooks.save = { mutate: vi.fn(), isPending: true, isError: false, error: null };
    renderPopover();
    const select = screen.getByLabelText('Status');
    expect(select).toBeDisabled();
    expect(select).toHaveAttribute('aria-busy', 'true');
  });

  it('is disabled but not busy while the planner row has not been read', () => {
    hooks.progress = stub(undefined, { isPending: true, isFetching: true });
    renderPopover();
    const select = screen.getByLabelText('Status');
    expect(select).toBeDisabled();
    expect(select).toHaveAttribute('aria-busy', 'false');
  });
});

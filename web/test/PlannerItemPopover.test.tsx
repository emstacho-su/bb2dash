/**
 * The planner's small assignment popover (T-2, P-planner-5).
 *
 * What is under test is the popover itself: what it says, the one write it
 * makes, and the three interactions that make it a dialog rather than a box —
 * Escape, a press outside, and focus going back to the card that opened it.
 * The geometry has its own suite (`popover-position.test.ts`); what this checks
 * is that the component asks for a placement against the anchor it was given
 * and puts the answer on the panel.
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

const hooks = vi.hoisted(() => ({
  assignment: null as unknown,
  progress: null as unknown,
  course: null as unknown,
  grade: null as unknown,
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
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
    [key: string]: unknown;
  }) => (
    <a href={href} {...(rest as Record<string, string>)}>
      {children}
    </a>
  ),
}));

const { PlannerItemPopover, pointsLine } = await import(
  '@/components/planner/PlannerItemPopover'
);

const mutate = vi.fn();
const onClose = vi.fn();

/**
 * A due card standing in for the one on the grid: an element with the title
 * link inside it, which is what focus has to come back to.
 */
function makeAnchor(): HTMLElement {
  const card = document.createElement('div');
  card.setAttribute('data-open', 'true');
  card.innerHTML = '<a href="/course/IST.323/assignment/IST.323/lab-1">Lab #1</a>';
  card.getBoundingClientRect = () =>
    ({ top: 200, left: 300, width: 120, height: 40, right: 420, bottom: 240 }) as DOMRect;
  document.body.appendChild(card);
  return card;
}

function renderPopover(anchor: HTMLElement) {
  return render(
    <PlannerItemPopover assignmentId="IST.323/lab-1" anchor={anchor} onClose={onClose} />,
  );
}

beforeEach(() => {
  document.body.innerHTML = '';
  mutate.mockReset();
  onClose.mockReset();
  hooks.assignment = stub(ASSIGNMENT);
  hooks.progress = stub({ assignment_id: 'IST.323/lab-1', status: 'in_progress' });
  hooks.course = stub({ id: 'IST.323', bb_url: 'https://blackboard.syracuse.edu/course/IST323' });
  hooks.grade = stub(null);
  hooks.save = { mutate, isPending: false, isError: false, error: null };
});

/* ---------------------------------------------------------------------------
 * The points / score line — mirrored figures only
 * ------------------------------------------------------------------------ */

describe('pointsLine', () => {
  it('shows what the item is worth when nothing is graded', () => {
    expect(pointsLine(25, null, null)).toBe('25 points possible');
  });

  it('shows Blackboard’s own score over its own possible', () => {
    expect(pointsLine(25, 18, 20)).toBe('18 / 20');
  });

  it('falls back to the assignment’s points when the column records none', () => {
    expect(pointsLine(25, 18, null)).toBe('18 / 25');
  });

  it('is null when neither a score nor a points value is recorded', () => {
    expect(pointsLine(null, null, null)).toBeNull();
    expect(pointsLine(undefined, undefined, undefined)).toBeNull();
  });

  it('never turns an absent score into a zero', () => {
    expect(pointsLine(25, null, 25)).toBe('25 points possible');
  });
});

/* ---------------------------------------------------------------------------
 * What it says
 * ------------------------------------------------------------------------ */

describe('PlannerItemPopover — what it holds', () => {
  it('is a dialog named after the assignment', () => {
    renderPopover(makeAnchor());
    expect(screen.getByRole('dialog', { name: 'Lab #1' })).toBeInTheDocument();
  });

  it('names the course, the due date and the points', () => {
    renderPopover(makeAnchor());
    expect(screen.getByText('IST 323')).toBeInTheDocument();
    expect(screen.getByText(/Due Thu · Sep 17/)).toBeInTheDocument();
    expect(screen.getByText('25 points possible')).toBeInTheDocument();
  });

  it('shows the mirrored score once Blackboard has one', () => {
    hooks.grade = stub({ effective_score: 18, possible: 20, points_possible: 25 });
    renderPopover(makeAnchor());
    expect(screen.getByText('18 / 20')).toBeInTheDocument();
  });

  it('offers the six statuses and nothing else', () => {
    renderPopover(makeAnchor());
    const select = screen.getByLabelText('Status') as HTMLSelectElement;
    expect(select.value).toBe('in_progress');
    expect(Array.from(select.options).map((o) => o.value)).toEqual([
      'not_started',
      'in_progress',
      'submitted',
      'graded',
      'excused',
      'missed',
    ]);
  });

  it('links to the full-details page under the course', () => {
    renderPopover(makeAnchor());
    expect(screen.getByRole('link', { name: /See full details/ })).toHaveAttribute(
      'href',
      '/course/IST.323/assignment/IST.323/lab-1',
    );
  });

  it('offers the Blackboard link only when the course has one', () => {
    const { unmount } = renderPopover(makeAnchor());
    expect(screen.getByRole('link', { name: /Blackboard/ })).toHaveAttribute(
      'href',
      'https://blackboard.syracuse.edu/course/IST323',
    );
    unmount();

    document.body.innerHTML = '';
    hooks.course = stub({ id: 'IST.323', bb_url: null });
    renderPopover(makeAnchor());
    expect(screen.queryByRole('link', { name: /Blackboard/ })).toBeNull();
  });

  it('says a read failed rather than drawing an empty popover', () => {
    hooks.assignment = stub(undefined, { isError: true, error: new Error('permission denied') });
    renderPopover(makeAnchor());
    expect(screen.getByRole('alert')).toHaveTextContent('permission denied');
  });
});

/* ---------------------------------------------------------------------------
 * The one write
 * ------------------------------------------------------------------------ */

describe('PlannerItemPopover — the status quick-edit', () => {
  it('writes the chosen status through the popout mutation', () => {
    renderPopover(makeAnchor());
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'submitted' } });

    expect(mutate).toHaveBeenCalledWith({
      assignmentId: 'IST.323/lab-1',
      patch: { status: 'submitted' },
    });
  });

  it('will not offer an editable status before the planner row has been read', () => {
    hooks.progress = stub(undefined, { isPending: true, isFetching: true });
    renderPopover(makeAnchor());
    expect(screen.getByLabelText('Status')).toBeDisabled();
  });
});

/* ---------------------------------------------------------------------------
 * Dismissal and focus
 * ------------------------------------------------------------------------ */

describe('PlannerItemPopover — closing', () => {
  it('closes on Escape', () => {
    renderPopover(makeAnchor());
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on a press outside itself', () => {
    renderPopover(makeAnchor());
    fireEvent.mouseDown(document.body);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('stays open for a press inside itself', () => {
    renderPopover(makeAnchor());
    fireEvent.mouseDown(screen.getByRole('dialog'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('leaves a press on its own card to the card, which toggles it', () => {
    const anchor = makeAnchor();
    renderPopover(anchor);
    fireEvent.mouseDown(anchor);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes with the ✕', () => {
    renderPopover(makeAnchor());
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('PlannerItemPopover — focus', () => {
  it('takes focus on open and gives it back to the item that opened it', () => {
    const anchor = makeAnchor();
    const opener = anchor.querySelector('a') as HTMLAnchorElement;
    opener.focus();
    expect(document.activeElement).toBe(opener);

    const { unmount } = renderPopover(anchor);
    expect(document.activeElement).toBe(screen.getByRole('dialog'));

    unmount();
    expect(document.activeElement).toBe(opener);
  });

  it('falls back to the card’s own link when nothing inside it had focus', () => {
    const anchor = makeAnchor();
    const { unmount } = renderPopover(anchor);
    unmount();
    expect(document.activeElement).toBe(anchor.querySelector('a'));
  });
});

/* ---------------------------------------------------------------------------
 * Placement
 * ------------------------------------------------------------------------ */

describe('PlannerItemPopover — placement', () => {
  /**
   * jsdom gives every element a zero-sized box, so the popover measures as a
   * point; the anchor's rect is stubbed, which is enough to see that the
   * component hands the right box to `placePopover` and writes the answer back
   * onto the panel. The arithmetic itself is `popover-position.test.ts`.
   */
  it('places itself below the anchor it was given', () => {
    renderPopover(makeAnchor());
    const panel = screen.getByRole('dialog');

    expect(panel).toHaveAttribute('data-placed', 'true');
    expect(panel).toHaveAttribute('data-placement', 'below');
    // 200 (anchor top) + 40 (its height) + 8 (the gap).
    expect(panel.style.getPropertyValue('--popover-top')).toBe('248px');
  });

  it('flips above the anchor when the window has no room below it', () => {
    const height = window.innerHeight;
    try {
      window.innerHeight = 100;
      renderPopover(makeAnchor());
      const panel = screen.getByRole('dialog');
      expect(panel).toHaveAttribute('data-placement', 'above');
      // Above the anchor would be 192px; a zero-height panel in a 100px window
      // is then clamped to the bottom margin, which is the clamp doing its job.
      expect(panel.style.getPropertyValue('--popover-top')).toBe('92px');
    } finally {
      window.innerHeight = height;
    }
  });

  it('re-places itself when the window changes size', () => {
    renderPopover(makeAnchor());
    expect(screen.getByRole('dialog')).toHaveAttribute('data-placement', 'below');

    const height = window.innerHeight;
    try {
      window.innerHeight = 100;
      fireEvent(window, new Event('resize'));
      expect(screen.getByRole('dialog')).toHaveAttribute('data-placement', 'above');
    } finally {
      window.innerHeight = height;
    }
  });
});

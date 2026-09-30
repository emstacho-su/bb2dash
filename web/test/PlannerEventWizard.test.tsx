/**
 * R3-9 — the planner's "+" wizard: a new event one step at a time, in the
 * Google Calendar manner, on the grid form's own state, validation and save.
 *
 * Nothing reaches the network: the Supabase client is mocked and `onSave` is a
 * spy, so no test here can write a planner event.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { PlannerEventDraft } from '@/lib/planner-events';
import type { FormSeries, PlannerEventPrefill } from '@/components/planner/planner-event-form-state';

vi.mock('@/lib/supabase/client', () => ({
  getSupabaseBrowserClient: () => ({
    from: () => {
      const chain: Record<string, unknown> = {};
      const self = () => chain;
      Object.assign(chain, {
        select: self,
        eq: self,
        order: self,
        then: (onFulfilled: (value: unknown) => unknown) =>
          Promise.resolve({ data: [], error: null }).then(onFulfilled),
      });
      return chain;
    },
  }),
}));

const { PlannerEventWizard } = await import('@/components/planner/PlannerEventWizard');
const { PlannerEventForm } = await import('@/components/planner/PlannerEventForm');

type Saved = [PlannerEventDraft, FormSeries | null];

const PREFILL: PlannerEventPrefill = { allDay: false, date: '2026-11-09', startMinute: 540 };

function withClient(node: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{node}</QueryClientProvider>;
}

function renderWizard(prefill: PlannerEventPrefill = PREFILL) {
  const saved: Saved[] = [];
  const onSave = vi.fn((draft: PlannerEventDraft, series: FormSeries | null) => {
    saved.push([draft, series]);
  });
  const onClose = vi.fn();
  const view = render(
    withClient(
      <PlannerEventWizard
        target={{ mode: 'create', prefill }}
        onClose={onClose}
        onSave={onSave}
        onDelete={vi.fn()}
        pending={false}
        error={null}
      />,
    ),
  );
  return { saved, onSave, onClose, view };
}

function renderGridForm(prefill: PlannerEventPrefill = PREFILL) {
  const saved: Saved[] = [];
  const onSave = vi.fn((draft: PlannerEventDraft, series: FormSeries | null) => {
    saved.push([draft, series]);
  });
  const view = render(
    withClient(
      <PlannerEventForm
        target={{ mode: 'create', prefill }}
        onClose={vi.fn()}
        onSave={onSave}
        onDelete={vi.fn()}
        pending={false}
        error={null}
      />,
    ),
  );
  return { saved, view };
}

const next = () => screen.getByRole('button', { name: 'Next' });
const back = () => screen.getByRole('button', { name: 'Back' });

function type(label: string | RegExp, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

describe('R3-9 — step by step', () => {
  it('starts on the kind, offering all six, and moves on to when', () => {
    renderWizard();
    expect(screen.getByText('Step 1 of 5')).toBeInTheDocument();
    const kinds = screen.getAllByRole('radio');
    expect(kinds.map((radio) => radio.closest('label')?.textContent)).toEqual([
      'Event',
      'Task',
      'Out of office',
      'Focus time',
      'Working location',
      'Appointment slot',
    ]);
    expect(screen.getByLabelText('Event')).toBeChecked();
    fireEvent.click(screen.getByLabelText('Focus time'));
    fireEvent.click(next());
    expect(screen.getByText('Step 2 of 5')).toBeInTheDocument();
    expect(screen.getByLabelText('Title')).toBeInTheDocument();
  });

  it('keeps Next disabled on the second step until the title and times are valid', () => {
    renderWizard();
    fireEvent.click(next());
    expect(next()).toBeDisabled();
    type('Title', 'Study group');
    expect(next()).toBeEnabled();
    type('End time', '08:00'); // before the 09:00 start
    expect(next()).toBeDisabled();
    type('End time', '10:00');
    expect(next()).toBeEnabled();
  });

  it('refuses 53 occurrences on the repeats step', () => {
    renderWizard();
    fireEvent.click(next());
    type('Title', 'bb2dash test · refuse-53');
    fireEvent.click(next());
    expect(screen.getByText('Step 3 of 5')).toBeInTheDocument();
    type('Repeats', 'daily');
    expect(next()).toBeDisabled(); // no end date yet
    type('Ends on', '2026-12-31');
    expect(
      screen.getByText('A repeating event is limited to 52 occurrences — choose an earlier end date.'),
    ).toBeInTheDocument();
    expect(next()).toBeDisabled();
    type('Ends on', '2026-11-13');
    expect(screen.getByText('5 occurrences')).toBeInTheDocument();
    expect(next()).toBeEnabled();
  });

  it('keeps what was entered when going Back and Next', () => {
    renderWizard();
    fireEvent.click(screen.getByLabelText('Task'));
    fireEvent.click(next());
    type('Title', 'Read chapter 7');
    fireEvent.click(back());
    expect(screen.getByLabelText('Task')).toBeChecked();
    fireEvent.click(next());
    expect(screen.getByLabelText('Title')).toHaveValue('Read chapter 7');
  });

  it('reviews the event before saving it', () => {
    renderWizard();
    fireEvent.click(next());
    type('Title', 'Study group');
    fireEvent.click(next());
    fireEvent.click(next());
    type('Location', 'in_person');
    expect(next()).toBeDisabled(); // a place is required once a location kind is chosen
    type('Place', 'Hinds Hall 010');
    fireEvent.click(next());
    expect(screen.getByText('Step 5 of 5')).toBeInTheDocument();
    const review = screen.getByRole('list', { name: 'Review' });
    expect(within(review).getByText('Study group')).toBeInTheDocument();
    expect(within(review).getByText('Event')).toBeInTheDocument();
    expect(within(review).getByText(/Hinds Hall 010/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
  });
});

describe('R3-9 — the same save as the grid form', () => {
  function wizardSave(fill: () => void, repeat?: { freq: string; until: string }) {
    const result = renderWizard();
    fireEvent.click(next());
    fill();
    fireEvent.click(next());
    if (repeat) {
      type('Repeats', repeat.freq);
      type('Ends on', repeat.until);
    }
    fireEvent.click(next());
    fireEvent.click(next());
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    result.view.unmount();
    return result.saved;
  }

  function formSave(fill: () => void, repeat?: { freq: string; until: string }) {
    const result = renderGridForm();
    fill();
    if (repeat) {
      type('Repeats', repeat.freq);
      type('Ends on', repeat.until);
    }
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    result.view.unmount();
    return result.saved;
  }

  it('sends the grid form payload for a one-off event', () => {
    const fill = () => {
      type('Title', 'Study group');
      type('End time', '10:30');
    };
    const fromWizard = wizardSave(fill);
    const fromForm = formSave(fill);
    expect(fromWizard).toHaveLength(1);
    expect(fromWizard).toEqual(fromForm);
    expect(fromWizard[0]?.[1]).toBeNull();
  });

  it('sends the grid form series for a repeating event', () => {
    const fill = () => type('Title', 'Morning review');
    const repeat = { freq: 'daily', until: '2026-11-13' };
    const fromWizard = wizardSave(fill, repeat);
    const fromForm = formSave(fill, repeat);
    expect(fromWizard).toEqual(fromForm);
    expect(fromWizard[0]?.[1]?.rows).toHaveLength(5);
  });
});

describe('R3-9 — Escape', () => {
  it('closes at once when nothing was entered', () => {
    const { onClose } = renderWizard();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('asks before discarding what was entered', () => {
    const { onClose } = renderWizard();
    fireEvent.click(next());
    type('Title', 'Half-typed');
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText('Discard this event?')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(screen.queryByText('Discard this event?')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Title')).toHaveValue('Half-typed');

    fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

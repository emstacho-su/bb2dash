/**
 * "Repeats" on the planner-event form (T-1).
 *
 * A repeat is up to 52 rows on Stack's real Google calendar, so the form has
 * to be explicit about what it is about to do: how many occurrences, refused
 * rather than truncated over the cap, and never saved as a single event when
 * the rule is half-built. The rule itself is set once — an event already in a
 * series shows it read-only, and says how to change it.
 *
 * Nothing reaches the network: the Supabase client is mocked, so no test here
 * can write a planner event.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { makePlannerEvent } from './factories.plannerEvents';
import type { PlannerEventDraft } from '@/lib/planner-events';
import type { FormSeries } from '@/components/planner/planner-event-form-state';

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

const { PlannerEventForm } = await import('@/components/planner/PlannerEventForm');
const { MAX_SERIES_OCCURRENCES } = await import('@/lib/planner-recurrence');

type Saved = [PlannerEventDraft, FormSeries | null];

function renderForm(
  overrides: Partial<React.ComponentProps<typeof PlannerEventForm>> = {},
) {
  const saved: Saved[] = [];
  const onSave = vi.fn((draft: PlannerEventDraft, series: FormSeries | null) => {
    saved.push([draft, series]);
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <PlannerEventForm
        target={{ mode: 'create', prefill: { allDay: false, date: '2026-09-16', startMinute: 540 } }}
        onClose={vi.fn()}
        onSave={onSave}
        onDelete={vi.fn()}
        pending={false}
        error={null}
        {...overrides}
      />
    </QueryClientProvider>,
  );
  return { onSave, saved };
}

function type(label: string | RegExp, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

function save() {
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
}

describe('a new event', () => {
  it('does not repeat until it is asked to', () => {
    renderForm();
    expect(screen.getByLabelText('Repeats')).toHaveValue('none');
    expect(screen.queryByLabelText('Ends on')).not.toBeInTheDocument();
  });

  it('asks for an end date as soon as it repeats', () => {
    renderForm();
    type('Repeats', 'weekly');
    expect(screen.getByLabelText('Ends on')).toBeInTheDocument();
    expect(screen.getByText(/Choose the date the repeat ends on/)).toBeInTheDocument();
  });

  it('counts the occurrences live', () => {
    renderForm();
    type('Title', 'Studio');
    type('Repeats', 'weekly');
    type('Ends on', '2026-10-07');
    expect(screen.getByText('4 occurrences')).toBeInTheDocument();

    type('Ends on', '2026-09-16');
    expect(screen.getByText('1 occurrence')).toBeInTheDocument();
  });

  it('refuses more than the cap instead of quietly stopping at it', () => {
    const { onSave } = renderForm();
    type('Title', 'Studio');
    type('Repeats', 'daily');
    type('Ends on', '2027-09-16');

    expect(screen.getByText(new RegExp(`limited to ${MAX_SERIES_OCCURRENCES} occurrences`))).toBeInTheDocument();
    // No count line: the rule was refused, not trimmed back to 52.
    expect(screen.queryByText(/^\d+ occurrences?$/)).toBeNull();
    save();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('will not save a repeat with no end date as a single event', () => {
    const { onSave } = renderForm();
    type('Title', 'Studio');
    type('Repeats', 'monthly');
    save();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('hands over the whole expansion when it does repeat', () => {
    const { saved } = renderForm();
    type('Title', 'Studio');
    type('Repeats', 'weekly');
    type('Ends on', '2026-09-30');
    save();

    expect(saved).toHaveLength(1);
    const [draft, series] = saved[0];
    expect(draft.title).toBe('Studio');
    expect(series).not.toBeNull();
    expect(series?.freq).toBe('weekly');
    expect(series?.until).toBe('2026-09-30');
    expect(series?.rows).toHaveLength(3);
    // The first row is the event as typed; the rest are the same wall clock.
    expect(series?.rows[0].starts_at).toBe(draft.starts_at);
    expect(series?.rows.map((row) => row.title)).toEqual(['Studio', 'Studio', 'Studio']);
  });

  it('hands over no series when it does not repeat', () => {
    const { saved } = renderForm();
    type('Title', 'One off');
    save();
    expect(saved[0][1]).toBeNull();
  });
});

describe('an event already in a series', () => {
  const event = makePlannerEvent({ title: 'Studio' });

  it('shows the rule read-only, and how to change it', () => {
    renderForm({
      target: { mode: 'edit', event },
      existingRepeat: { freq: 'weekly', until: '2026-12-16' },
    });

    const repeats = screen.getByLabelText('Repeats');
    expect(repeats).toBeDisabled();
    expect(repeats).toHaveValue('weekly');
    expect(screen.getByLabelText('Ends on')).toHaveValue('2026-12-16');
    expect(screen.getByText(/cannot be changed here/)).toBeInTheDocument();
  });

  it('says only that it repeats when the rule has not been read', () => {
    renderForm({
      target: { mode: 'edit', event },
      existingRepeat: { freq: null, until: null },
    });
    expect(screen.getByText(/part of a repeating event/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Repeats')).not.toBeInTheDocument();
  });
});

describe('an event that is not in a series', () => {
  it('offers no Repeats control while being edited', () => {
    renderForm({ target: { mode: 'edit', event: makePlannerEvent() }, existingRepeat: null });
    expect(screen.queryByLabelText('Repeats')).not.toBeInTheDocument();
    expect(screen.queryByText(/part of a repeating event/)).not.toBeInTheDocument();
  });
});

/**
 * S-1 / P-grades-7, web half — every status menu offers the same six.
 *
 * Before this there were two vocabularies. `queries.today.ts` declared a
 * nine-option menu labelled "not started" / "missed" / "n/a"; the Classwork row
 * spelled its own by replacing underscores; and `progress-status.ts` — the
 * PM-owned file every screen was supposed to read — was imported by nothing.
 *
 * The interesting case is a row still holding a RETIRED value. The Postgres
 * enum keeps all nine (migrations are additive) and migration 078 folds the
 * rows; until it runs, `assignment_progress` holds `planned`, `waived` and
 * `not_applicable`. A controlled <select> whose value matches no option renders
 * as its FIRST option, so such a row would have shown "not opened" — and the
 * next edit to anything on that row would have written it. So: it must display
 * the value's fold, must not offer it, and must not be rewritten by being
 * looked at.
 */

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { makeWorkItem } from './factories';
import { OFFERED_STATUSES, statusLabel } from '@/lib/progress-status';
import type { ProgressStatus } from '@/lib/queries';

vi.mock('@/lib/supabase/client', () => ({
  getSupabaseBrowserClient: () => ({ auth: { getSession: vi.fn() } }),
}));

const { StatusSelect } = await import('@/components/tracker/StatusSelect');

function renderSelect(status: ProgressStatus) {
  const onChange = vi.fn();
  render(
    <StatusSelect
      item={makeWorkItem({ title: 'Lab #1 report', status })}
      onChange={onChange}
      pending={false}
    />,
  );
  return { onChange, select: screen.getByLabelText('Status for Lab #1 report') };
}

/** Every <option>, and only the ones a reader can actually choose. */
function options() {
  return screen.getAllByRole('option') as HTMLOptionElement[];
}
function selectable() {
  return options().filter((option) => !option.disabled);
}

describe('StatusSelect — the six', () => {
  it('offers exactly OFFERED_STATUSES, in that order', () => {
    renderSelect('not_started');
    expect(selectable().map((option) => option.value)).toEqual([...OFFERED_STATUSES]);
  });

  it('labels them in Stack’s words, not the enum’s', () => {
    renderSelect('not_started');
    expect(selectable().map((option) => option.textContent)).toEqual([
      'not opened',
      'in progress',
      'submitted',
      'graded',
      'excused',
      'DNF',
    ]);
  });

  it('offers no retired value on a row that does not hold one', () => {
    renderSelect('submitted');
    expect(options()).toHaveLength(OFFERED_STATUSES.length);
    for (const gone of ['planned', 'waived', 'not_applicable']) {
      expect(options().some((option) => option.value === gone)).toBe(false);
    }
  });

  it('reports the status the reader picked', () => {
    const { onChange, select } = renderSelect('not_started');
    fireEvent.change(select, { target: { value: 'in_progress' } });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][1]).toBe('in_progress');
  });
});

describe('StatusSelect — a row still holding a retired value', () => {
  const RETIRED: [ProgressStatus, string][] = [
    ['planned', 'not opened'],
    ['waived', 'excused'],
    ['not_applicable', 'excused'],
  ];

  it.each(RETIRED)('shows %s as its fold, %s', (stored, fold) => {
    const { select } = renderSelect(stored);
    // The control still holds the stored value…
    expect((select as HTMLSelectElement).value).toBe(stored);
    // …and the option it is showing reads as the fold.
    const shown = options().find((option) => option.value === stored);
    expect(shown?.textContent).toBe(fold);
    expect(shown?.textContent).toBe(statusLabel(stored));
  });

  it.each(RETIRED)('does not let %s be chosen', (stored) => {
    renderSelect(stored);
    expect(options().find((option) => option.value === stored)?.disabled).toBe(true);
    expect(selectable().map((option) => option.value)).toEqual([...OFFERED_STATUSES]);
  });

  it('does not display the first option instead, which would be a wrong status', () => {
    const { select } = renderSelect('waived');
    expect((select as HTMLSelectElement).value).not.toBe('not_started');
  });

  it('writes nothing when the row is merely rendered', () => {
    const { onChange } = renderSelect('waived');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('still lets the reader move it to one of the six', () => {
    const { onChange, select } = renderSelect('waived');
    fireEvent.change(select, { target: { value: 'excused' } });
    expect(onChange.mock.calls[0][1]).toBe('excused');
  });
});

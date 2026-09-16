/**
 * The what-if cell: typed values commit on blur or Enter (never per keystroke),
 * are validated against the item's possible before anything is saved, can be
 * reverted per row, and are never offered on a muted item.
 */

import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { GradebookTable } from '@/components/grades/GradebookTable';
import { WhatIfCell } from '@/components/grades/WhatIfCell';
import { toModelInput } from '@/lib/grade-model-input';
import { whatIfCellTargets } from '@/lib/grade-model-view';
import { itemStates } from '@/lib/grade-model';
import { makeGradebookRow } from './factories.grades';
import { IST466_COMPONENTS, IST466_SCHEME, IST466_SYNCHRONY, makeItem } from './factories.grade-model';

vi.mock('@/lib/supabase/client', () => ({
  getSupabaseBrowserClient: () => ({ from: vi.fn() }),
}));
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));

const TARGET = { key: 'asg:IST.323/exam-2', name: 'Exam #2', unit: 'points', possible: 10 } as const;
const PERCENT = { key: 'asg:ECN.304/exam-1', name: 'Exam 1', unit: 'percent', possible: 100 } as const;

function field(): HTMLInputElement {
  return screen.getByLabelText(/what if/) as HTMLInputElement;
}

describe('WhatIfCell', () => {
  it('is labelled "what if" and commits a valid value on blur', () => {
    const onCommit = vi.fn();
    render(<WhatIfCell target={TARGET} value={undefined} onCommit={onCommit} />);
    expect(screen.getByText('what if')).toBeInTheDocument();

    fireEvent.change(field(), { target: { value: '8' } });
    fireEvent.change(field(), { target: { value: '8.5' } });
    expect(onCommit).not.toHaveBeenCalled();

    fireEvent.blur(field());
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith('asg:IST.323/exam-2', 8.5);
  });

  it('commits on Enter', () => {
    const onCommit = vi.fn();
    render(<WhatIfCell target={TARGET} value={undefined} onCommit={onCommit} />);
    fireEvent.change(field(), { target: { value: '10' } });
    fireEvent.keyDown(field(), { key: 'Enter' });
    expect(onCommit).toHaveBeenCalledWith('asg:IST.323/exam-2', 10);
  });

  it.each(['11', '-1', 'nine', '1e1'])('refuses %j with a field error and saves nothing', (raw) => {
    const onCommit = vi.fn();
    render(<WhatIfCell target={TARGET} value={undefined} onCommit={onCommit} />);
    fireEvent.change(field(), { target: { value: raw } });
    fireEvent.blur(field());
    expect(onCommit).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a number from 0 to 10.');
    expect(field()).toHaveAttribute('aria-invalid', 'true');
  });

  it('writes nothing when the value did not change', () => {
    const onCommit = vi.fn();
    render(<WhatIfCell target={TARGET} value={7} onCommit={onCommit} />);
    fireEvent.blur(field());
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('marks a saved value as ours and reverts it with ×', () => {
    const onCommit = vi.fn();
    const { container } = render(<WhatIfCell target={TARGET} value={7} onCommit={onCommit} />);
    expect(field().value).toBe('7');
    expect(container.querySelector('[data-what-if="set"]')).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Clear this what-if value: Exam #2/ }));
    expect(onCommit).toHaveBeenCalledWith('asg:IST.323/exam-2', null);
  });

  it('clears a value when the field is emptied', () => {
    const onCommit = vi.fn();
    render(<WhatIfCell target={TARGET} value={7} onCommit={onCommit} />);
    fireEvent.change(field(), { target: { value: '' } });
    fireEvent.blur(field());
    expect(onCommit).toHaveBeenCalledWith('asg:IST.323/exam-2', null);
  });

  it('adopts a value that changed underneath (a reset)', () => {
    const { rerender } = render(<WhatIfCell target={TARGET} value={7} onCommit={vi.fn()} />);
    rerender(<WhatIfCell target={TARGET} value={undefined} onCommit={vi.fn()} />);
    expect(field().value).toBe('');
  });
});

describe('WhatIfCell — a percentage (Round 1b A1)', () => {
  it('reads "what if __ %" and stores the typed percentage as that number', () => {
    const onCommit = vi.fn();
    const { container } = render(<WhatIfCell target={PERCENT} value={undefined} onCommit={onCommit} />);
    const cell = container.querySelector('[data-what-if-unit="percent"]') as HTMLElement;
    expect(cell.textContent).toBe('what if — Exam 1%');
    expect(within(cell).queryByText(/\//)).toBeNull();

    fireEvent.change(field(), { target: { value: '87.5' } });
    fireEvent.blur(field());
    expect(onCommit).toHaveBeenCalledWith('asg:ECN.304/exam-1', 87.5);
  });

  it.each(['0', '100'])('accepts the bound %j', (raw) => {
    const onCommit = vi.fn();
    render(<WhatIfCell target={PERCENT} value={undefined} onCommit={onCommit} />);
    fireEvent.change(field(), { target: { value: raw } });
    fireEvent.blur(field());
    expect(onCommit).toHaveBeenCalledWith('asg:ECN.304/exam-1', Number(raw));
  });

  it.each(['100.5', '-1', '150'])('refuses %j outside 0–100', (raw) => {
    const onCommit = vi.fn();
    render(<WhatIfCell target={PERCENT} value={undefined} onCommit={onCommit} />);
    fireEvent.change(field(), { target: { value: raw } });
    fireEvent.blur(field());
    expect(onCommit).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a number from 0 to 100.');
  });
});

describe('what-if cells in the gradebook table', () => {
  const ethics = makeGradebookRow({ course_id: 'IST.466', column_id: '_3562497_1', name: 'Ethics Case Presentation', possible: 100 });
  const synchrony = makeGradebookRow({ course_id: 'IST.466', column_id: '_3562496_1', name: 'Synchrony Major Case #1', possible: 150 });
  const graded = makeGradebookRow({ course_id: 'IST.466', column_id: 'graded', name: 'Graded one', possible: 50, effective_score: 40 });

  const input = toModelInput(
    IST466_SCHEME,
    IST466_COMPONENTS,
    [makeItem(), IST466_SYNCHRONY, makeItem({ item_key: 'col:IST.466:graded', column_id: 'graded', score: 40 })],
    null,
    null,
  );

  it('sits beside the dash on an ungraded counted row, and is absent on a muted or graded one', () => {
    render(
      <GradebookTable
        rows={[ethics, synchrony, graded]}
        whatIf={{ targets: whatIfCellTargets(itemStates(input), input.items), values: {}, onCommit: vi.fn() }}
      />,
    );
    const rowOf = (name: string) => screen.getByText(name).closest('tr') as HTMLElement;

    expect(within(rowOf('Ethics Case Presentation')).getByText('—')).toBeInTheDocument();
    expect(within(rowOf('Ethics Case Presentation')).getByLabelText(/what if/)).toBeInTheDocument();
    expect(within(rowOf('Synchrony Major Case #1')).queryByLabelText(/what if/)).toBeNull();
    expect(within(rowOf('Graded one')).queryByLabelText(/what if/)).toBeNull();
  });

  it('is absent everywhere when the table is given no whatIf prop (/grades)', () => {
    render(<GradebookTable rows={[ethics, synchrony]} />);
    expect(screen.queryByLabelText(/what if/)).toBeNull();
  });
});

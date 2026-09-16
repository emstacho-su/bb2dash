/**
 * "Not in Blackboard yet": the group of syllabus items with no Blackboard
 * column. It starts collapsed, opens itself when a saved what-if value sits on
 * one of its rows — including a value that arrives after the first render
 * (R2-9) — and after that follows the owner's toggle.
 */

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PlaceholderRows } from '@/components/grades/PlaceholderRows';
import type { WhatIfProps } from '@/components/grades/WhatIfCell';
import { IST466_LETTER_PLACEHOLDER } from './factories.grade-model';

const KEY = IST466_LETTER_PLACEHOLDER.item_key;

function whatIf(values: Record<string, number>): WhatIfProps {
  return {
    targets: new Map([[KEY, { key: KEY, name: 'Letter of Gratitude', unit: 'points', possible: 100 }]]),
    values,
    onCommit: vi.fn(),
  };
}

function toggle(): HTMLElement {
  return screen.getByRole('button', { name: 'Not in Blackboard yet (1)' });
}

describe('PlaceholderRows — the group opens for saved values (R2-9)', () => {
  it('starts collapsed with nothing saved', () => {
    render(<PlaceholderRows items={[IST466_LETTER_PLACEHOLDER]} whatIf={whatIf({})} />);
    expect(toggle()).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Letter of Gratitude')).toBeNull();
  });

  it('opens when a saved value arrives after the first render', () => {
    const { rerender } = render(<PlaceholderRows items={[IST466_LETTER_PLACEHOLDER]} whatIf={whatIf({})} />);
    rerender(<PlaceholderRows items={[IST466_LETTER_PLACEHOLDER]} whatIf={whatIf({ [KEY]: 95 })} />);
    expect(toggle()).toHaveAttribute('aria-expanded', 'true');
    expect((screen.getByLabelText(/what if/) as HTMLInputElement).value).toBe('95');
  });

  it("keeps the owner's choice once he has toggled it", () => {
    const { rerender } = render(<PlaceholderRows items={[IST466_LETTER_PLACEHOLDER]} whatIf={whatIf({ [KEY]: 95 })} />);
    expect(toggle()).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(toggle());
    rerender(<PlaceholderRows items={[IST466_LETTER_PLACEHOLDER]} whatIf={whatIf({ [KEY]: 90 })} />);
    expect(toggle()).toHaveAttribute('aria-expanded', 'false');
  });
});

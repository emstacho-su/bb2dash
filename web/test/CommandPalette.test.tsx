/**
 * The ⌘K result row: what a hit actually shows a reader.
 *
 * The row is rendered on its own — no router, no query client, no network. The
 * Supabase browser client is mocked because the module graph reaches it through
 * the query layer.
 */

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { makeResult } from './factories';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/lib/supabase/client', () => ({
  getSupabaseBrowserClient: () => ({ auth: { getSession: vi.fn() } }),
}));

const { ResultRow } = await import('@/components/shell/CommandPalette');

function renderRow(overrides: Parameters<typeof makeResult>[0] = {}) {
  return render(
    <ResultRow
      result={makeResult(overrides)}
      active={false}
      onMouseEnter={() => {}}
      onSelect={() => {}}
    />,
  );
}

describe('ResultRow — what the hit is', () => {
  it('shows the file, course, bucket and unit', () => {
    renderRow();
    expect(screen.getByText('Lecture3 - Planning, Policy and Risk.pptx')).toBeInTheDocument();
    expect(screen.getByText('IST.323')).toBeInTheDocument();
    expect(screen.getByText('lecture slides')).toBeInTheDocument();
    expect(screen.getByText('slide 28')).toBeInTheDocument();
  });

  it('falls back to the unit kind when the unit has no number', () => {
    renderRow({ unit_no: null });
    expect(screen.getByText('slide')).toBeInTheDocument();
  });
});

describe('ResultRow — the part hint', () => {
  it('names the part when the passage came from part 2 or later', () => {
    renderRow({ part_no: 3 });
    expect(screen.getByText('part 3')).toBeInTheDocument();
  });

  it('says nothing for part 1, a null part, or a backend that sends none', () => {
    const { unmount } = renderRow({ part_no: 1 });
    expect(screen.queryByText(/^part \d+$/)).toBeNull();
    unmount();

    renderRow({ part_no: null });
    expect(screen.queryByText(/^part \d+$/)).toBeNull();
  });
});

describe('ResultRow — how the hit was matched', () => {
  it('badges a sub-0.80 hit as a keyword match instead of a confident percentage', () => {
    renderRow({ similarity: 0.786 });
    expect(screen.getByText('keyword match')).toBeInTheDocument();
    expect(screen.queryByText(/% match/)).toBeNull();
  });

  it('shows a rounded percentage for a semantic hit', () => {
    renderRow({ similarity: 0.8912 });
    expect(screen.getByText('89% match')).toBeInTheDocument();
    expect(screen.queryByText('keyword match')).toBeNull();
  });
});

describe('ResultRow — snippet safety', () => {
  it('renders the scrubbed snippet and never the speaker notes behind it', () => {
    renderRow({ snippet: 'What is a system?\n[notes] Remind them about the quiz.' });
    expect(screen.getByText('What is a system?')).toBeInTheDocument();
    expect(screen.queryByText(/quiz/)).toBeNull();
    expect(screen.getByText('speaker notes hidden')).toBeInTheDocument();
  });

  it('renders nothing but a notice when the unit is only speaker notes', () => {
    renderRow({ snippet: '[notes] The whole unit is private commentary.' });
    expect(screen.getByText(/speaker notes only/i)).toBeInTheDocument();
    expect(screen.queryByText(/private commentary/)).toBeNull();
  });
});

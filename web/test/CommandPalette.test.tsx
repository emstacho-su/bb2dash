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

  it('badges an unembedded unit (null similarity) as a keyword match, with no percentage', () => {
    renderRow({ similarity: null });
    expect(screen.getByText('keyword match')).toBeInTheDocument();
    expect(screen.queryByText(/% match/)).toBeNull();
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

/*
 * L-1 (S2-bugs-1): each mode renders the row its mode actually returns.
 *
 * `search` fts rows carry `rank` and a whole-unit plain headline `snippet`, and
 * no similarity, part or score. Vector rows carry `similarity`, `part_no` and
 * the unit's whole `text`, and no snippet. (supabase/functions/search/index.ts,
 * migrations 021 and 024.)
 */
type WireRow = Record<string, unknown>;

function renderModeRow(mode: 'fts' | 'vector', row: WireRow) {
  const base: WireRow = {
    file_id: 5,
    text_id: 495,
    course_id: 'IST.323',
    bucket: 'lecture_slides',
    file_name: 'Lecture3 - Planning, Policy and Risk.pptx',
    unit_kind: 'slide',
    unit_no: 28,
  };
  return render(
    <ResultRow
      result={{ ...base, ...row } as never}
      mode={mode}
      active={false}
      onMouseEnter={() => {}}
      onSelect={() => {}}
    />,
  );
}

describe('ResultRow — Keyword mode (fts)', () => {
  const ftsRow = { rank: 0.0759, snippet: 'The final exam is Tuesday in Heroy auditorium' };

  it('shows the headline and says it matched on wording, with no number at all', () => {
    const { container } = renderModeRow('fts', ftsRow);
    expect(screen.getByText('The final exam is Tuesday in Heroy auditorium')).toBeInTheDocument();
    const badge = screen.getByText('keyword match');
    expect(badge).toHaveAttribute('title', expect.stringMatching(/Keyword mode/));
    expect(container.textContent).not.toMatch(/\d+%|0\.07|rank/i);
  });

  it('still hides speaker notes inside a headline', () => {
    renderModeRow('fts', { rank: 0.1, snippet: 'Risk register\n[notes] do not read this aloud' });
    expect(screen.getByText('Risk register')).toBeInTheDocument();
    expect(screen.queryByText(/aloud/)).toBeNull();
  });
});

describe('ResultRow — Semantic mode (vector)', () => {
  const body = `Risk assessment ${'identifies assets threats and controls '.repeat(12)}`;

  it('shows a passage cut from the unit text and its similarity as hybrid does', () => {
    const { container } = renderModeRow('vector', {
      similarity: 0.874,
      part_no: 3,
      text: `${body}\n[notes] remind them the quiz is Friday`,
    });
    expect(screen.getByText('87% match')).toBeInTheDocument();
    expect(screen.getByText('part 3')).toBeInTheDocument();
    const passage = screen.getByText(/^Risk assessment identifies/);
    expect(passage.textContent?.endsWith('…')).toBe(true);
    expect((passage.textContent ?? '').length).toBeLessThan(body.length);
    expect(screen.queryByText(/quiz is Friday/)).toBeNull();
    expect(screen.getByText('speaker notes hidden')).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/keyword match/);
  });

  it('never calls a weak semantic hit a keyword match, and shows no percentage for it', () => {
    const { container } = renderModeRow('vector', { similarity: 0.781, part_no: 1, text: 'Short slide' });
    expect(screen.getByText('Short slide')).toBeInTheDocument();
    expect(screen.getByText('weak match')).toHaveAttribute('title', 'Semantic similarity 0.781');
    expect(container.textContent).not.toMatch(/keyword match|\d+%/);
  });

  it('shows the notes-only notice when the unit text is all speaker notes', () => {
    renderModeRow('vector', { similarity: 0.9, part_no: 1, text: '[notes] private commentary' });
    expect(screen.getByText(/speaker notes only/i)).toBeInTheDocument();
    expect(screen.queryByText(/private commentary/)).toBeNull();
  });
});

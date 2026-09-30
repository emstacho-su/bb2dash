/**
 * Search in the top bar (2026-09-30: the centered ⌘K dialog became a nav icon
 * that expands into a field, with the results in a popover under it).
 *
 * `ResultRow` is rendered on its own — what a hit actually shows a reader.
 * `NavSearch` is rendered with `useSearch` stubbed, so no test hits the
 * network; the scrub helpers stay real, so the notes rules are exercised
 * through the whole panel too. The Supabase browser client is mocked because
 * the module graph reaches it through the query layer.
 */

import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SearchMode, SearchResponse } from '@/lib/queries.search';
import { makeResponse, makeResult } from './factories';

const stub = vi.hoisted(() => ({
  push: vi.fn(),
  calls: [] as { q: string; mode: SearchMode; course: string | null }[],
  response: null as SearchResponse | null,
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: stub.push }) }));
vi.mock('@/lib/supabase/client', () => ({
  getSupabaseBrowserClient: () => ({ auth: { getSession: vi.fn() } }),
}));
vi.mock('@/lib/queries', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/queries')>();
  return { ...actual, useCourses: () => ({ data: [], isPending: false, isError: false }) };
});
vi.mock('@/lib/queries.search', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/queries.search')>();
  return {
    ...actual,
    useSearch: (params: { q: string; mode: SearchMode; course: string | null }) => {
      stub.calls.push(params);
      const enabled = params.q.length >= 2;
      const data = enabled && stub.response ? { ...stub.response, q: params.q, mode: params.mode } : undefined;
      return {
        data,
        isPending: enabled && !data,
        isSuccess: !!data,
        isError: false,
        isFetching: false,
        error: null,
      };
    },
  };
});

const { ResultRow } = await import('@/components/shell/SearchPanel');
const { NavSearch } = await import('@/components/shell/NavSearch');

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

/* ---------------------------------------------------------------------------
 * NavSearch — the icon, the field and the popover
 * ------------------------------------------------------------------------ */

const icon = () => screen.getByRole('button', { name: 'Search' });
const field = () => screen.getByRole('combobox', { name: 'Search materials' });
const panel = () => screen.getByRole('listbox', { name: 'Results' });

function renderNav() {
  return render(
    <div>
      <NavSearch />
      <button type="button">elsewhere</button>
    </div>,
  );
}

async function typeQuery(text: string) {
  fireEvent.change(field(), { target: { value: text } });
  // The query is debounced (250 ms) before it reaches useSearch.
  await waitFor(() => expect(stub.calls.some((c) => c.q === text.trim())).toBe(true));
}

describe('NavSearch — collapsed and expanded', () => {
  beforeEach(() => {
    stub.push.mockReset();
    stub.calls = [];
    stub.response = makeResponse();
  });

  it('renders only the icon while collapsed: no text field, no results', () => {
    renderNav();
    expect(icon()).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('expands into a focused "Search materials" field when the icon is clicked', () => {
    renderNav();
    fireEvent.click(icon());
    expect(icon()).toHaveAttribute('aria-expanded', 'true');
    expect(field()).toHaveFocus();
  });

  it('expands on ⌘K and on Ctrl+K anywhere', () => {
    renderNav();
    fireEvent.keyDown(window, { key: 'k', metaKey: true });
    expect(field()).toHaveFocus();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('combobox')).toBeNull();

    fireEvent.keyDown(window, { key: 'K', ctrlKey: true });
    expect(field()).toHaveFocus();
  });

  it('expands on the bb2dash:command-palette event other code may dispatch', () => {
    renderNav();
    act(() => {
      window.dispatchEvent(new CustomEvent('bb2dash:command-palette'));
    });
    expect(field()).toHaveFocus();
  });

  it('shows no panel until something is typed', () => {
    renderNav();
    fireEvent.click(icon());
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(field()).toHaveAttribute('aria-expanded', 'false');
  });

  it('shows the results in a panel under the field, scrubbed of speaker notes', async () => {
    stub.response = makeResponse({
      results: [
        makeResult({ file_name: 'Syllabus.pdf', snippet: 'Page 2\nGrading policy\n[notes] curve it quietly' }),
        makeResult({ file_id: 6, file_name: 'Notes only.pptx', snippet: '[notes] private commentary' }),
      ],
    });
    renderNav();
    fireEvent.click(icon());
    await typeQuery('syllabus');

    const list = panel();
    expect(field()).toHaveAttribute('aria-expanded', 'true');
    expect(field()).toHaveAttribute('aria-controls', list.id);
    expect(within(list).getByText('Syllabus.pdf')).toBeInTheDocument();
    expect(within(list).getByText(/Grading policy/)).toBeInTheDocument();
    expect(within(list).queryByText(/curve it quietly/)).toBeNull();
    expect(within(list).queryByText(/Page 2/)).toBeNull();
    expect(within(list).getByText('speaker notes hidden')).toBeInTheDocument();
    expect(within(list).getByText(/speaker notes only/i)).toBeInTheDocument();
    expect(within(list).queryByText(/private commentary/)).toBeNull();
    // Not a centered modal any more.
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('switches modes from the panel and re-runs the same query in that mode', async () => {
    renderNav();
    fireEvent.click(icon());
    await typeQuery('risk');
    const group = screen.getByRole('group', { name: 'Search mode' });
    expect(within(group).getByRole('button', { name: 'Hybrid' })).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(within(group).getByRole('button', { name: 'Keyword' }));
    expect(within(group).getByRole('button', { name: 'Keyword' })).toHaveAttribute('aria-pressed', 'true');
    expect(stub.calls.at(-1)).toMatchObject({ q: 'risk', mode: 'fts' });
    expect(within(panel()).getByText('keyword match')).toBeInTheDocument();
  });

  it('moves the highlight with ↓/↑ and opens the highlighted course on ↵, collapsing', async () => {
    stub.response = makeResponse({
      results: [makeResult(), makeResult({ file_id: 9, course_id: 'GEO.103', file_name: 'Rivers.pdf' })],
    });
    renderNav();
    fireEvent.click(icon());
    await typeQuery('rivers');
    const options = () => within(panel()).getAllByRole('option');
    expect(options()[0]).toHaveAttribute('aria-selected', 'true');

    fireEvent.keyDown(field(), { key: 'ArrowDown' });
    expect(options()[1]).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(field(), { key: 'ArrowDown' });
    expect(options()[1]).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(field(), { key: 'ArrowUp' });
    expect(options()[0]).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(field(), { key: 'ArrowDown' });

    fireEvent.keyDown(field(), { key: 'Enter' });
    expect(stub.push).toHaveBeenCalledWith('/course/GEO.103');
    expect(screen.queryByRole('combobox')).toBeNull();
  });

  it('opens a course when a result is clicked', async () => {
    renderNav();
    fireEvent.click(icon());
    await typeQuery('risk');
    fireEvent.click(within(panel()).getByRole('option'));
    expect(stub.push).toHaveBeenCalledWith('/course/IST.323');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('collapses on Escape, clears the query and hands focus back to the icon', async () => {
    renderNav();
    fireEvent.click(icon());
    await typeQuery('risk');
    fireEvent.keyDown(field(), { key: 'Escape' });
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(icon()).toHaveAttribute('aria-expanded', 'false');
    expect(icon()).toHaveFocus();

    fireEvent.click(icon());
    expect(field()).toHaveValue('');
  });

  it('collapses and clears on a press outside, but not on a press inside the panel', async () => {
    renderNav();
    fireEvent.click(icon());
    await typeQuery('risk');

    fireEvent.mouseDown(screen.getByRole('button', { name: 'Semantic' }));
    expect(field()).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByRole('button', { name: 'elsewhere' }));
    expect(screen.queryByRole('combobox')).toBeNull();
    fireEvent.click(icon());
    expect(field()).toHaveValue('');
  });

  it('collapses when an empty field loses focus, and stays open when it holds a query', async () => {
    renderNav();
    fireEvent.click(icon());
    fireEvent.blur(field());
    expect(screen.queryByRole('combobox')).toBeNull();

    fireEvent.click(icon());
    await typeQuery('risk');
    fireEvent.blur(field());
    expect(field()).toBeInTheDocument();
  });

  it('collapses when the icon is pressed again', () => {
    renderNav();
    fireEvent.click(icon());
    fireEvent.click(icon());
    expect(screen.queryByRole('combobox')).toBeNull();
  });
});

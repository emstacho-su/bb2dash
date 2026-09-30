/**
 * The Classwork pane renders the folder tree, not a flat list.
 *
 * `course-classwork.test.ts` covers the fold and the nesting maths;
 * this file covers what actually reaches the DOM — reading order and the
 * indent step — because the pane used to map a flat, path-sorted array and
 * indent each row by the view's `depth` column. That drew 'Week 1 / Slides'
 * underneath 'Week 1 - Overview', which is a different course than the one
 * Blackboard has.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { makeTreeRow } from './factories.course';
import type { ContentTreeRow } from '@/lib/queries.course';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/lib/supabase/client', () => ({
  getSupabaseBrowserClient: () => ({ auth: { getSession: vi.fn() } }),
}));

const { ClassworkNode, ClassworkFileRow, ClassworkTree } = await import(
  '@/app/(app)/course/[id]/classwork/CourseClasswork'
);
const { buildContentTree } = await import('@/lib/course-dimension');

function renderTree(rows: ContentTreeRow[]) {
  const roots = buildContentTree(rows);
  return render(
    <div data-testid="tree">
      {roots.map((node) => (
        <ClassworkNode key={node.contentId} node={node} />
      ))}
    </div>,
  );
}

/** Every drawn node, in document order, as `content_id` → recursion depth. */
function drawnNodes(): { id: string; depth: string }[] {
  return [...screen.getByTestId('tree').querySelectorAll('[data-content-id]')].map((el) => ({
    id: el.getAttribute('data-content-id') ?? '',
    depth: el.getAttribute('data-depth') ?? '',
  }));
}

describe('ClassworkNode — reading order follows the tree', () => {
  it("draws a folder's children under it, not the sibling that sorts between them", () => {
    renderTree([
      makeTreeRow({ content_id: 1, parent_id: null, path: 'Week 1', depth: 1, title: 'Week 1', item_kind: 'folder' }),
      makeTreeRow({ content_id: 2, parent_id: null, path: 'Week 1 - Overview', depth: 1, title: 'Week 1 - Overview', item_kind: 'document' }),
      makeTreeRow({ content_id: 3, parent_id: 1, path: 'Week 1 / Slides', depth: 2, title: 'Slides', item_kind: 'document' }),
    ]);

    expect(drawnNodes()).toEqual([
      { id: '1', depth: '0' },
      { id: '3', depth: '1' },
      { id: '2', depth: '0' },
    ]);
    expect(screen.getByText('Slides')).toBeInTheDocument();
  });

  it('indents by how deep the recursion went, one step per level, capped at four', () => {
    renderTree([
      makeTreeRow({ content_id: 1, parent_id: null, path: 'A', depth: 1, title: 'A', item_kind: 'folder' }),
      makeTreeRow({ content_id: 2, parent_id: 1, path: 'A / B', depth: 2, title: 'B', item_kind: 'folder' }),
      makeTreeRow({ content_id: 3, parent_id: 2, path: 'A / B / C', depth: 3, title: 'C', item_kind: 'document' }),
    ]);

    const margins = [...screen.getByTestId('tree').querySelectorAll<HTMLElement>('[data-content-id]')].map(
      (el) => el.style.marginLeft,
    );
    expect(margins).toEqual([
      'calc(var(--space-6) * 0)',
      'calc(var(--space-6) * 1)',
      'calc(var(--space-6) * 2)',
    ]);
  });

  it('draws an item whose parent is outside the fetch as a root, flush and present', () => {
    renderTree([
      makeTreeRow({ content_id: 9, parent_id: 404, path: 'Recitation / Handout', depth: 2, title: 'Handout' }),
    ]);

    expect(drawnNodes()).toEqual([{ id: '9', depth: '0' }]);
    expect(screen.getByText('Handout')).toBeInTheDocument();
  });
});

describe('ClassworkFileRow — the shared Open ladder', () => {
  const stored = { fileId: 1, fileName: 'Lecture3.pptx', storagePath: 'IST.323/Lecture3.pptx', bucket: 'lecture_slides' };
  const notStored = { fileId: 2, fileName: 'Handout.pdf', storagePath: null, bucket: null };

  it('opens a stored file through the signed-URL button', () => {
    render(<ClassworkFileRow file={stored} nodeUrl={null} />);
    expect(screen.getByText('In library')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open' })).toBeEnabled();
  });

  it("says 'not stored', never 'no route' — this view cannot see a source link", () => {
    render(<ClassworkFileRow file={notStored} nodeUrl={null} />);
    // Twice over: the honesty tag, and the dead-end control beside it.
    expect(screen.getAllByText('Not stored')).toHaveLength(2);
    expect(screen.queryByText('No route')).toBeNull();
    expect(screen.getByRole('button', { name: 'Not stored' })).toBeDisabled();
  });

  it("offers the item's own Blackboard page when the bytes are not in the library", () => {
    render(<ClassworkFileRow file={notStored} nodeUrl="https://blackboard.syracuse.edu/item/42" />);
    expect(screen.getByRole('link', { name: 'In Blackboard ↗' })).toHaveAttribute(
      'href',
      'https://blackboard.syracuse.edu/item/42',
    );
  });
});

/* ---------------------------------------------------------------------------
 * T-13 (R-39, R-40, B-19): the tree Blackboard lists now, once.
 *
 * The fixture is IST.352 on 2026-09-24: the live WK01 folder and its rename
 * ghost (bb_content 50, same bb_item_id), the two WK04 criteria rows Blackboard
 * re-created under new ids (1095, 1096; no live twin), and a live Knowledge
 * Check carrying its assignment link (the drop zone).
 * ------------------------------------------------------------------------ */

const VANISH_RUN = '7f1c7a52-0000-4000-8000-000000000001';

function ist352Rows(): ContentTreeRow[] {
  return [
    makeTreeRow({ course_id: 'IST.352', content_id: 1601, bb_item_id: '_900_1', path: 'WK01 - The Systems Development Environment', title: 'WK01 - The Systems Development Environment', item_kind: 'folder' }),
    makeTreeRow({ course_id: 'IST.352', content_id: 1602, parent_id: 1601, bb_item_id: '_901_1', path: 'WK01 / KC1', depth: 2, title: 'Knowledge Check 1', item_kind: 'assessment', assignment_id: 'IST.352/kc-1' }),
    makeTreeRow({ course_id: 'IST.352', content_id: 50, bb_item_id: '_900_1', path: 'WK01 - Chapter 1', title: 'WK01 - Chapter 1', item_kind: 'folder', missing_since: VANISH_RUN }),
    makeTreeRow({ course_id: 'IST.352', content_id: 1095, bb_item_id: '_501_1', path: 'WK04 / Criteria', title: 'Project Prioritization Scoring Criteria', item_kind: 'document', missing_since: VANISH_RUN }),
    makeTreeRow({ course_id: 'IST.352', content_id: 1096, bb_item_id: '_502_1', path: 'WK04 / Criteria (2)', title: 'Project Prioritization Scoring Criteria (2)', item_kind: 'document', missing_since: VANISH_RUN }),
  ];
}

/** The drop zone reads the query client, so the tree renders inside one. */
function renderTreeRows(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe('ClassworkTree — ghosts and stale nodes (T-13)', () => {
  it('never draws a rename ghost, and hides stale nodes behind a counted toggle', () => {
    renderTreeRows(<ClassworkTree rows={ist352Rows()} />);

    expect(screen.getAllByText('WK01 - The Systems Development Environment')).toHaveLength(1);
    expect(screen.queryByText('WK01 - Chapter 1')).toBeNull();
    expect(screen.queryByText('Project Prioritization Scoring Criteria')).toBeNull();
    expect(
      screen.getByRole('button', { name: 'Show 2 items Blackboard no longer lists' }),
    ).toHaveAttribute('aria-pressed', 'false');
  });

  it('reveals the stale nodes with a label, and still never the ghost', () => {
    renderTreeRows(<ClassworkTree rows={ist352Rows()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Show 2 items Blackboard no longer lists' }));

    expect(screen.getByText('Project Prioritization Scoring Criteria')).toBeInTheDocument();
    expect(screen.getByText('Project Prioritization Scoring Criteria (2)')).toBeInTheDocument();
    expect(screen.getAllByText('No longer in Blackboard')).toHaveLength(2);
    expect(screen.queryByText('WK01 - Chapter 1')).toBeNull();
    expect(
      screen.getByRole('button', { name: 'Hide 2 items Blackboard no longer lists' }),
    ).toHaveAttribute('aria-pressed', 'true');
  });

  it('says "1 item" for one', () => {
    renderTreeRows(<ClassworkTree rows={[ist352Rows()[0], ist352Rows()[3]]} />);
    expect(screen.getByRole('button', { name: 'Show 1 item Blackboard no longer lists' })).toBeInTheDocument();
  });

  it('shows no toggle for a course with nothing stale', () => {
    renderTreeRows(<ClassworkTree rows={ist352Rows().slice(0, 3)} />);
    expect(screen.queryByRole('button', { name: /Blackboard no longer lists/ })).toBeNull();
  });

  it('keeps the Knowledge Check on the live row, with its drop zone', () => {
    const { container } = renderTreeRows(<ClassworkTree rows={ist352Rows()} />);
    const kc = container.querySelector('[data-content-id="1602"]');
    expect(kc?.textContent).toContain('Knowledge Check 1');
    expect(kc?.textContent).toContain('Stage a file');
  });
});

describe('ClassworkFileRow — the file note (T-13, R-40)', () => {
  it('puts a note in the hover title and marks the row ·note, as Materials does', () => {
    render(
      <ClassworkFileRow
        file={{ fileId: 3, fileName: 'criteria.pdf', storagePath: null, bucket: null, notes: 'Re-created in WK05' }}
        nodeUrl={null}
      />,
    );
    expect(screen.getByText('criteria.pdf')).toHaveAttribute('title', 'Re-created in WK05');
    const mark = screen.getByLabelText('has a note');
    expect(mark).toHaveTextContent('·note');
    expect(mark).toHaveAttribute('title', 'Re-created in WK05');
  });

  it('adds no marker and no title without a note', () => {
    render(
      <ClassworkFileRow
        file={{ fileId: 4, fileName: 'plain.pdf', storagePath: null, bucket: null, notes: null }}
        nodeUrl={null}
      />,
    );
    expect(screen.getByText('plain.pdf')).not.toHaveAttribute('title');
    expect(screen.queryByLabelText('has a note')).toBeNull();
  });
});

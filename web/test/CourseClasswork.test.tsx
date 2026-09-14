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

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { makeTreeRow } from './factories.course';
import type { ContentTreeRow } from '@/lib/queries.course';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/lib/supabase/client', () => ({
  getSupabaseBrowserClient: () => ({ auth: { getSession: vi.fn() } }),
}));

const { ClassworkNode, ClassworkFileRow } = await import(
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

/**
 * The Classwork tree: folding `v_content_tree` rows into nodes, and nesting
 * them the way Blackboard actually nests them.
 *
 * The view emits one row per (content item × file), so a document with three
 * attachments arrives three times. Everything the pane draws depends on that
 * fold being right, and on the nesting coming from `parent_id` — sorting the
 * ' / '-joined `path` by code point only looked like a tree, and put a sibling
 * whose title extends another's in between a folder and its children.
 */

import { describe, expect, it } from 'vitest';
import { makeTreeRow } from './factories.course';
import {
  buildContentTree,
  flattenContentTree,
  groupContentTree,
  isFolderNode,
  ultraStateLabel,
} from '@/lib/course-dimension';

describe('groupContentTree — one node per content_id', () => {
  it('folds a node that arrives once per file into a single node with its files', () => {
    const nodes = groupContentTree([
      makeTreeRow({
        content_id: 7,
        path: 'Course Content / Week 3',
        depth: 2,
        title: 'Week 3',
        item_kind: 'document',
        file_id: 11,
        file_name: 'slides.pptx',
        storage_path: 'bb-files/IST.323/slides.pptx',
        bucket: 'lecture_slides',
      }),
      makeTreeRow({
        content_id: 7,
        path: 'Course Content / Week 3',
        depth: 2,
        title: 'Week 3',
        item_kind: 'document',
        file_id: 12,
        file_name: 'handout.pdf',
        storage_path: 'bb-files/IST.323/handout.pdf',
        bucket: 'readings',
      }),
    ]);

    expect(nodes).toHaveLength(1);
    expect(nodes[0].contentId).toBe(7);
    expect(nodes[0].files.map((f) => f.fileName)).toEqual(['slides.pptx', 'handout.pdf']);
  });

  it('collapses a file that the view repeats under the same node', () => {
    const row = {
      content_id: 7,
      path: 'Course Content / Week 3',
      file_id: 11,
      file_name: 'slides.pptx',
    };
    const nodes = groupContentTree([makeTreeRow(row), makeTreeRow(row)]);
    expect(nodes[0].files).toHaveLength(1);
  });

  it('leaves a node with no file rows carrying no files, not a null entry', () => {
    const nodes = groupContentTree([makeTreeRow({ content_id: 3, file_id: null })]);
    expect(nodes[0].files).toEqual([]);
  });

  it('keeps every distinct content_id', () => {
    const nodes = groupContentTree([
      makeTreeRow({ content_id: 1, path: 'A' }),
      makeTreeRow({ content_id: 2, path: 'B' }),
      makeTreeRow({ content_id: 1, path: 'A' }),
    ]);
    expect(nodes.map((n) => n.contentId)).toEqual([1, 2]);
  });
});

describe('buildContentTree — nesting comes from parent_id', () => {
  it('hangs each node off its parent, whatever order the rows arrive in', () => {
    // Deliberately shuffled input: the fold must not trust arrival order.
    const roots = buildContentTree([
      makeTreeRow({ content_id: 3, parent_id: 2, path: 'Course Content / Week 3 / Reading', depth: 3, title: 'Reading', item_kind: 'document' }),
      makeTreeRow({ content_id: 1, parent_id: null, path: 'Course Content', depth: 1, title: 'Course Content', item_kind: 'folder' }),
      makeTreeRow({ content_id: 4, parent_id: null, path: 'Syllabus', depth: 1, title: 'Syllabus', item_kind: 'document' }),
      makeTreeRow({ content_id: 2, parent_id: 1, path: 'Course Content / Week 3', depth: 2, title: 'Week 3', item_kind: 'folder' }),
    ]);

    expect(roots.map((n) => n.title)).toEqual(['Course Content', 'Syllabus']);
    expect(roots[0].children.map((n) => n.title)).toEqual(['Week 3']);
    expect(roots[0].children[0].children.map((n) => n.title)).toEqual(['Reading']);
    expect(flattenContentTree(roots).map((n) => n.path)).toEqual([
      'Course Content',
      'Course Content / Week 3',
      'Course Content / Week 3 / Reading',
      'Syllabus',
    ]);
  });

  it("keeps a folder's children under it, not under the sibling that sorts between them", () => {
    // The bug this replaces: 'Week 1 - Overview' sorts between 'Week 1' and
    // 'Week 1 / Slides' by code point ('-' is 0x2D, '/' is 0x2F), so the flat
    // path sort drew Slides as a child of the Overview.
    const roots = buildContentTree([
      makeTreeRow({ content_id: 1, parent_id: null, path: 'Week 1', depth: 1, title: 'Week 1', item_kind: 'folder' }),
      makeTreeRow({ content_id: 2, parent_id: null, path: 'Week 1 - Overview', depth: 1, title: 'Week 1 - Overview', item_kind: 'document' }),
      makeTreeRow({ content_id: 3, parent_id: 1, path: 'Week 1 / Slides', depth: 2, title: 'Slides', item_kind: 'document' }),
    ]);

    expect(roots.map((n) => n.title)).toEqual(['Week 1', 'Week 1 - Overview']);
    expect(roots[0].children.map((n) => n.contentId)).toEqual([3]);
    expect(roots[1].children).toEqual([]);
    expect(groupContentTree([
      makeTreeRow({ content_id: 1, parent_id: null, path: 'Week 1', depth: 1, title: 'Week 1', item_kind: 'folder' }),
      makeTreeRow({ content_id: 2, parent_id: null, path: 'Week 1 - Overview', depth: 1, title: 'Week 1 - Overview' }),
      makeTreeRow({ content_id: 3, parent_id: 1, path: 'Week 1 / Slides', depth: 2, title: 'Slides' }),
    ]).map((n) => n.title)).toEqual(['Week 1', 'Slides', 'Week 1 - Overview']);
  });

  it('sorts siblings the way a person counts, so Unit 2 precedes Unit 10', () => {
    const roots = buildContentTree([
      makeTreeRow({ content_id: 2, parent_id: null, path: 'Unit 10', depth: 1, title: 'Unit 10' }),
      makeTreeRow({ content_id: 1, parent_id: null, path: 'Unit 1', depth: 1, title: 'Unit 1', item_kind: 'folder' }),
      makeTreeRow({ content_id: 4, parent_id: null, path: 'Unit 2', depth: 1, title: 'Unit 2', item_kind: 'folder' }),
      makeTreeRow({ content_id: 3, parent_id: 1, path: 'Unit 1 / Lab', depth: 2, title: 'Lab' }),
    ]);
    expect(roots.map((n) => n.title)).toEqual(['Unit 1', 'Unit 2', 'Unit 10']);
    expect(flattenContentTree(roots).map((n) => n.path)).toEqual([
      'Unit 1',
      'Unit 1 / Lab',
      'Unit 2',
      'Unit 10',
    ]);
  });

  it('treats a node whose parent is not in the fetch as a root, never dropping it', () => {
    const roots = buildContentTree([
      makeTreeRow({ content_id: 9, parent_id: 404, path: 'Recitation / Handout', depth: 2, title: 'Handout' }),
    ]);
    expect(roots.map((n) => n.contentId)).toEqual([9]);
  });

  it('surfaces a parent cycle instead of recursing for ever', () => {
    const roots = buildContentTree([
      makeTreeRow({ content_id: 1, parent_id: 2, path: 'A', depth: 1, title: 'A' }),
      makeTreeRow({ content_id: 2, parent_id: 1, path: 'B', depth: 1, title: 'B' }),
    ]);
    expect(flattenContentTree(roots).map((n) => n.contentId).sort()).toEqual([1, 2]);
  });
});

describe('node presentation', () => {
  it('treats folders and learning modules as containers, leaves as items', () => {
    expect(isFolderNode({ itemKind: 'folder' })).toBe(true);
    expect(isFolderNode({ itemKind: 'learning_module' })).toBe(true);
    expect(isFolderNode({ itemKind: 'document' })).toBe(false);
    expect(isFolderNode({ itemKind: null })).toBe(false);
  });

  it('shows an Ultra state only when Blackboard actually recorded one', () => {
    expect(ultraStateLabel('Started')).toBe('Started');
    expect(ultraStateLabel('Completed')).toBe('Completed');
    expect(ultraStateLabel('None')).toBeNull();
    expect(ultraStateLabel(null)).toBeNull();
  });
});

/**
 * The Classwork tree: folding `v_content_tree` rows into nodes.
 *
 * The view emits one row per (content item × file), so a document with three
 * attachments arrives three times. Everything the pane draws depends on that
 * fold being right, and on folders sorting ahead of their children — which the
 * contract gets from `path` ordering rather than a recursive walk.
 */

import { describe, expect, it } from 'vitest';
import { makeTreeRow } from './factories.course';
import {
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

describe('groupContentTree — folders before their children', () => {
  it('orders by path, so a folder precedes everything inside it', () => {
    // Deliberately shuffled input: the fold must not trust arrival order.
    const nodes = groupContentTree([
      makeTreeRow({ content_id: 3, path: 'Course Content / Week 3 / Reading', depth: 3, title: 'Reading', item_kind: 'document' }),
      makeTreeRow({ content_id: 1, path: 'Course Content', depth: 1, title: 'Course Content', item_kind: 'folder' }),
      makeTreeRow({ content_id: 4, path: 'Syllabus', depth: 1, title: 'Syllabus', item_kind: 'document' }),
      makeTreeRow({ content_id: 2, path: 'Course Content / Week 3', depth: 2, title: 'Week 3', item_kind: 'folder' }),
    ]);

    expect(nodes.map((n) => n.path)).toEqual([
      'Course Content',
      'Course Content / Week 3',
      'Course Content / Week 3 / Reading',
      'Syllabus',
    ]);
  });

  it('keeps a folder ahead of a sibling whose name extends it', () => {
    const nodes = groupContentTree([
      makeTreeRow({ content_id: 2, path: 'Unit 10', depth: 1, title: 'Unit 10' }),
      makeTreeRow({ content_id: 1, path: 'Unit 1', depth: 1, title: 'Unit 1', item_kind: 'folder' }),
      makeTreeRow({ content_id: 3, path: 'Unit 1 / Lab', depth: 2, title: 'Lab' }),
    ]);
    expect(nodes.map((n) => n.path)).toEqual(['Unit 1', 'Unit 1 / Lab', 'Unit 10']);
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

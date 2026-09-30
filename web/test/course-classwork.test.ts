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
  splitVanishedRows,
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

/* ---------------------------------------------------------------------------
 * T-13 (R-39, R-40): nodes Blackboard no longer lists, and file notes.
 *
 * 111 projects `missing_since` (the P-98 vanish run id) and the file's `notes`.
 * A vanished node whose `bb_item_id` is live elsewhere in the same shell is a
 * rename ghost (16 on 2026-09-24) and is never drawn. A vanished node with no
 * live twin is stale (5 in all) and waits behind the toggle.
 * ------------------------------------------------------------------------ */

const RUN = '7f1c7a52-0000-4000-8000-000000000001';

describe('splitVanishedRows — ghosts, stale nodes and live nodes', () => {
  it('drops a vanished node whose bb_item_id is live in the same shell as a ghost', () => {
    const split = splitVanishedRows([
      makeTreeRow({ content_id: 1601, bb_item_id: '_900_1', title: 'WK01 - The Systems Development Environment' }),
      makeTreeRow({ content_id: 50, bb_item_id: '_900_1', title: 'WK01 - Chapter 1', missing_since: RUN }),
    ]);
    expect(split.live.map((r) => r.content_id)).toEqual([1601]);
    expect(split.ghosts.map((r) => r.content_id)).toEqual([50]);
    expect(split.stale).toEqual([]);
  });

  it('keeps a vanished node with no live twin as stale', () => {
    const split = splitVanishedRows([
      makeTreeRow({ content_id: 1095, bb_item_id: '_501_1', missing_since: RUN }),
      makeTreeRow({ content_id: 1630, bb_item_id: '_777_1' }),
    ]);
    expect(split.stale.map((r) => r.content_id)).toEqual([1095]);
    expect(split.ghosts).toEqual([]);
  });

  it('does not call a node a ghost because another shell reuses the id', () => {
    const split = splitVanishedRows([
      makeTreeRow({ course_id: 'GEO.103.lecture', content_id: 99, bb_item_id: '_1_1', missing_since: RUN }),
      makeTreeRow({ course_id: 'GEO.103.recitation', content_id: 300, bb_item_id: '_1_1' }),
    ]);
    expect(split.stale.map((r) => r.content_id)).toEqual([99]);
  });

  it('does not let one vanished node be the twin of another', () => {
    const split = splitVanishedRows([
      makeTreeRow({ content_id: 58, bb_item_id: '_2_1', missing_since: RUN }),
      makeTreeRow({ content_id: 59, bb_item_id: '_2_1', missing_since: RUN }),
    ]);
    expect(split.stale.map((r) => r.content_id)).toEqual([58, 59]);
  });

  it('reads a row without the column (before 111) as live', () => {
    const row = makeTreeRow({ content_id: 3 });
    delete (row as { missing_since?: string | null }).missing_since;
    expect(splitVanishedRows([row]).live).toHaveLength(1);
  });

  it('counts stale items by node, not by file row', () => {
    const split = splitVanishedRows([
      makeTreeRow({ content_id: 1203, bb_item_id: '_3_1', missing_since: RUN, file_id: 1 }),
      makeTreeRow({ content_id: 1203, bb_item_id: '_3_1', missing_since: RUN, file_id: 2 }),
    ]);
    expect(split.staleCount).toBe(1);
  });
});

describe('buildContentTree — what 111 adds to a node', () => {
  it('carries missing_since on the node and the note on each file', () => {
    const [node] = buildContentTree([
      makeTreeRow({
        content_id: 1095,
        missing_since: RUN,
        file_id: 4,
        file_name: 'criteria.pdf',
        notes: 'Re-created in WK05',
      }),
    ]);
    expect(node.missingSince).toBe(RUN);
    expect(node.files[0].notes).toBe('Re-created in WK05');
  });

  it('reads an absent note or run id as null', () => {
    const [node] = buildContentTree([makeTreeRow({ content_id: 5, file_id: 6, file_name: 'a.pdf' })]);
    expect(node.missingSince).toBeNull();
    expect(node.files[0].notes).toBeNull();
  });
});

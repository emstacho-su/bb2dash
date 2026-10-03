/**
 * Classwork keeps two nodes that share a path (Phase 19, task 22; R-64).
 *
 * Until migration 131, `bb_content` was unique on `(course_id, path)`, so two
 * Blackboard items with the same title under the same parent folded to one
 * row and the second never reached Classwork. 131 keys the table on
 * `(course_id, bb_item_id)`: IST.466's two sibling lessons named "Information"
 * both arrive, each with children whose paths are also identical, and files 17
 * and 19 hang off them.
 *
 * `path` is therefore no longer unique in `v_content_tree`. This file pins that
 * the tree builder never treats it as a key: nodes are identified by
 * `content_id`, nested by `parent_id`, and a path is only a label.
 */

import { describe, expect, it } from 'vitest';
import { makeTreeRow } from './factories.course';
import {
  buildContentTree,
  groupContentTree,
  splitVanishedRows,
  type ContentNode,
  type ContentTreeRow,
} from '@/lib/course-dimension';

const MODULE_PATH = 'Course Content / Module 3';
const LESSON_PATH = `${MODULE_PATH} / Information`;
const CHILD_PATH = `${LESSON_PATH} / Lecture`;

/**
 * IST.466, Module 3, as 131 leaves it: two sibling lessons titled
 * "Information", each holding one "Lecture" document with one file.
 */
function ist466Rows(): ContentTreeRow[] {
  const base = { course_id: 'IST.466' };
  return [
    makeTreeRow({ ...base, content_id: 300, bb_item_id: '_300_1', path: MODULE_PATH, depth: 2, title: 'Module 3' }),
    makeTreeRow({
      ...base,
      content_id: 310,
      parent_id: 300,
      bb_item_id: '_310_1',
      path: LESSON_PATH,
      depth: 3,
      title: 'Information',
      item_kind: 'learning_module',
    }),
    makeTreeRow({
      ...base,
      content_id: 320,
      parent_id: 300,
      bb_item_id: '_320_1',
      path: LESSON_PATH,
      depth: 3,
      title: 'Information',
      item_kind: 'learning_module',
    }),
    makeTreeRow({
      ...base,
      content_id: 311,
      parent_id: 310,
      bb_item_id: '_311_1',
      path: CHILD_PATH,
      depth: 4,
      title: 'Lecture',
      item_kind: 'document',
      file_id: 17,
      file_name: 'Ethics Criteria.pptx',
      storage_path: 'IST.466/slides/Ethics Criteria.pptx',
      bucket: 'slides',
    }),
    makeTreeRow({
      ...base,
      content_id: 321,
      parent_id: 320,
      bb_item_id: '_321_1',
      path: CHILD_PATH,
      depth: 4,
      title: 'Lecture',
      item_kind: 'document',
      file_id: 19,
      file_name: 'LectureM3_IST466Fall 2026 (2).pptx',
      storage_path: 'IST.466/slides/LectureM3_IST466Fall 2026 (2).pptx',
      bucket: 'slides',
    }),
  ];
}

function fileNames(node: ContentNode): (string | null)[] {
  return node.files.map((file) => file.fileName);
}

describe('buildContentTree — a path is a label, not a key', () => {
  it('keeps both sibling lessons that share a path', () => {
    const [module3] = buildContentTree(ist466Rows());
    expect(module3.contentId).toBe(300);
    expect(module3.children.map((child) => child.contentId)).toEqual([310, 320]);
    expect(module3.children.map((child) => child.path)).toEqual([LESSON_PATH, LESSON_PATH]);
    expect(module3.children.map((child) => child.title)).toEqual(['Information', 'Information']);
  });

  it('hangs each same-path child under its own lesson, with its own file', () => {
    const [module3] = buildContentTree(ist466Rows());
    const [first, second] = module3.children;

    expect(first.children.map((child) => child.contentId)).toEqual([311]);
    expect(second.children.map((child) => child.contentId)).toEqual([321]);
    expect(first.children[0].path).toBe(second.children[0].path);

    expect(fileNames(first.children[0])).toEqual(['Ethics Criteria.pptx']);
    expect(fileNames(second.children[0])).toEqual(['LectureM3_IST466Fall 2026 (2).pptx']);
  });

  it('lists every node once in reading order, none folded into its same-path twin', () => {
    const flat = groupContentTree(ist466Rows());
    expect(flat.map((node) => node.contentId)).toEqual([300, 310, 311, 320, 321]);
  });

  it('orders same-title siblings by content id whichever way the rows arrive', () => {
    const reversed = [...ist466Rows()].reverse();
    const [module3] = buildContentTree(reversed);
    expect(module3.children.map((child) => child.contentId)).toEqual([310, 320]);
  });

  it('keeps two root nodes that share a path', () => {
    const roots = buildContentTree([
      makeTreeRow({ content_id: 1, bb_item_id: '_1_1', path: 'Syllabus', title: 'Syllabus' }),
      makeTreeRow({ content_id: 2, bb_item_id: '_2_1', path: 'Syllabus', title: 'Syllabus' }),
    ]);
    expect(roots.map((node) => node.contentId)).toEqual([1, 2]);
  });

  it('keeps the same path in two shells of one display course as two nodes', () => {
    const roots = buildContentTree([
      makeTreeRow({ course_id: 'GEO.103.lecture', content_id: 10, bb_item_id: '_10_1', path: 'Week 1', title: 'Week 1' }),
      makeTreeRow({ course_id: 'GEO.103.recitation', content_id: 20, bb_item_id: '_20_1', path: 'Week 1', title: 'Week 1' }),
    ]);
    expect(roots.map((node) => [node.courseId, node.contentId])).toEqual([
      ['GEO.103.lecture', 10],
      ['GEO.103.recitation', 20],
    ]);
  });

  it('still folds one node that arrives once per file, same path or not', () => {
    const rows = [
      ...ist466Rows(),
      makeTreeRow({
        course_id: 'IST.466',
        content_id: 311,
        parent_id: 310,
        bb_item_id: '_311_1',
        path: CHILD_PATH,
        depth: 4,
        title: 'Lecture',
        item_kind: 'document',
        file_id: 15,
        file_name: 'Ethics Criteria (1).pptx',
      }),
    ];
    const [module3] = buildContentTree(rows);
    expect(fileNames(module3.children[0].children[0])).toEqual([
      'Ethics Criteria.pptx',
      'Ethics Criteria (1).pptx',
    ]);
    expect(fileNames(module3.children[1].children[0])).toEqual(['LectureM3_IST466Fall 2026 (2).pptx']);
  });
});

describe('splitVanishedRows — same-path live nodes are both live', () => {
  it('calls neither same-path lesson a ghost or stale', () => {
    const rows = ist466Rows();
    const split = splitVanishedRows(rows);
    expect(split.live).toHaveLength(rows.length);
    expect(split.ghosts).toEqual([]);
    expect(split.stale).toEqual([]);
    expect(split.staleCount).toBe(0);
  });

  it('does not take a vanished node for the ghost of a live node that only shares its path', () => {
    const rows = [
      makeTreeRow({ course_id: 'IST.352', content_id: 1, bb_item_id: '_1_1', path: 'WK01', title: 'WK01' }),
      makeTreeRow({
        course_id: 'IST.352',
        content_id: 2,
        bb_item_id: '_2_1',
        path: 'WK01',
        title: 'WK01',
        missing_since: '6b122650-49f3-4a70-a801-c177fbf27f1a',
      }),
    ];
    const split = splitVanishedRows(rows);
    expect(split.live.map((row) => row.content_id)).toEqual([1]);
    expect(split.ghosts).toEqual([]);
    expect(split.stale.map((row) => row.content_id)).toEqual([2]);
  });
});

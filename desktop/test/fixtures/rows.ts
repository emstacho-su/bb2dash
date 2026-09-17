/**
 * Row fixtures shaped like the real relations, so a test that passes here cannot pass
 * against a shape prod does not produce.
 *
 *  - `v_sync_status` (migration 035): one row, `summary = {stages, changes,
 *    attention_raised, errors}`, `changes` from `sync_change_lines()`.
 *  - `v_gradebook_history` (migration 058): `shell_course_id`, `column_id`, `name`,
 *    `run_id`, `seen_at`, `score`, `possible`, `previous_score`; `previous_score` is null
 *    on the first observation of a column.
 *  - `v_work_items` (migration 016): the assignments/readings union.
 *
 * Nothing here touches the network.
 */

import type { CourseLabel, DueRow, GradeRow, SyncStatusRow, Watermark } from '../../src/core/types';

export const COURSES: readonly CourseLabel[] = [
  { id: 'IST.323', title_short: 'IST 323' },
  { id: 'GEO.103.lecture', title_short: 'GEO 103' },
  { id: 'MAT.295', title_short: 'MAT 295' },
];

export function watermark(overrides: Partial<Watermark> = {}): Watermark {
  return {
    version: 1,
    lastSeenAt: '2026-09-16T12:00:00.000Z',
    dueCheckedOn: null,
    firedKeys: [],
    ...overrides,
  };
}

export function syncRow(overrides: Partial<SyncStatusRow> = {}): SyncStatusRow {
  return {
    id: 41,
    run_id: '6b122650-49f3-4a70-a801-c177fbf27f1a',
    status: 'ok',
    started_at: '2026-09-16T17:58:00.000Z',
    finished_at: '2026-09-16T18:00:00.000Z',
    trigger: 'app_request',
    summary: {
      changes: [
        '3 new item(s) in the course content tree',
        '2 new announcement(s)',
        '1 new file(s) catalogued',
        '1 gap(s) added to the Inbox',
      ],
      attention_raised: 0,
      errors: [],
    },
    ...overrides,
  };
}

export function gradeRow(overrides: Partial<GradeRow> = {}): GradeRow {
  return {
    shell_course_id: 'IST.323',
    column_id: 'col-9001',
    name: 'Lab 3',
    run_id: 'run-a',
    seen_at: '2026-09-16T17:59:00.000Z',
    score: 18,
    possible: 20,
    previous_score: null,
    ...overrides,
  };
}

export function dueRow(overrides: Partial<DueRow> = {}): DueRow {
  return {
    item_kind: 'assignment',
    item_id: 'a-1',
    course_id: 'IST.323',
    title: 'Milestone 2 draft',
    due_at: '2026-09-17T23:59:00.000Z',
    due_on: '2026-09-17',
    status: 'not_started',
    ...overrides,
  };
}

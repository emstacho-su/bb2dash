/**
 * Fixtures for the Phase 8 course dimension.
 *
 * `v_course_stream` and `v_content_tree` are created by migrations 026-027 in
 * the same phase, so no test may reach the database for their shape: these
 * builders are the frozen column lists from
 * `docs/planning/61_PHASE8_course_dimension.md`, and the row types they return
 * are the ones the screens consume.
 */

import type {
  ContentTreeRow,
  CourseStaff,
  CourseStreamRow,
} from '@/lib/queries.course';

export function makeStreamRow(overrides: Partial<CourseStreamRow> = {}): CourseStreamRow {
  return {
    course_id: 'IST.323',
    post_kind: 'announcement',
    posted_at: '2026-09-08T14:00:00Z',
    ref_kind: 'announcement',
    ref_id: '17',
    title: 'Quiz 2 moves to Thursday',
    body: 'The quiz will now open Thursday at 9am.',
    meta: { is_read: true },
    ...overrides,
  };
}

export function makeTreeRow(overrides: Partial<ContentTreeRow> = {}): ContentTreeRow {
  return {
    course_id: 'IST.323',
    content_id: 1,
    parent_id: null,
    bb_item_id: '_1234_1',
    path: 'Course Content',
    depth: 1,
    title: 'Course Content',
    item_kind: 'folder',
    bb_type: 'Folder',
    state: 'None',
    url: null,
    modified_at: '2026-09-01T12:00:00Z',
    assignment_id: null,
    file_id: null,
    file_name: null,
    storage_path: null,
    bucket: null,
    ...overrides,
  };
}

export function makeStaff(overrides: Partial<CourseStaff> = {}): CourseStaff {
  return {
    id: 1,
    course_id: 'IST.323',
    name: 'Prof. Example',
    role: 'instructor',
    email: 'example@syr.edu',
    office: 'Hinds Hall 310',
    office_hours: 'Tue 2–4pm',
    ...overrides,
  };
}

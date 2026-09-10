/** Fixtures for the Phase 7 search contract and the Phase 8 shared components.
    No test hits the network. */

import type { SearchResponse, SearchResult } from '@/lib/queries.search';
import type { CourseDisplay, WorkItem } from '@/lib/queries.today';

export function makeResult(overrides: Partial<SearchResult> = {}): SearchResult {
  return {
    file_id: 5,
    text_id: 495,
    course_id: 'IST.323',
    bucket: 'lecture_slides',
    file_name: 'Lecture3 - Planning, Policy and Risk.pptx',
    unit_kind: 'slide',
    unit_no: 28,
    score: 0.019607,
    similarity: 0.8912,
    snippet: 'Risk assessment: identify assets, threats, vulnerabilities and controls.',
    part_no: 1,
    snippet_source: 'fts_headline',
    ...overrides,
  };
}

export function makeResponse(overrides: Partial<SearchResponse> = {}): SearchResponse {
  return {
    mode: 'hybrid',
    q: 'risk assessment',
    course: null,
    min_similarity: null,
    count: 1,
    results: [makeResult()],
    ...overrides,
  };
}

/** A `Response` stand-in with a JSON body. */
export function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** A failing response whose body is not JSON at all (an edge gateway HTML page). */
export function textResponse(status: number, body: string): Response {
  return new Response(body, { status, headers: { 'Content-Type': 'text/html' } });
}

/**
 * One `v_work_items` row. The defaults describe a plain dated assignment; every
 * test overrides only what it is actually asserting on.
 */
export function makeWorkItem(overrides: Partial<WorkItem> = {}): WorkItem {
  return {
    item_kind: 'assignment',
    item_id: 'IST.323/lab-1',
    course_id: 'IST.323',
    title: 'Lab #1',
    type: 'lab',
    category: 'project',
    glyph: 'P',
    in_workload: true,
    due_at: null,
    due_on: '2026-09-10',
    due_rule: null,
    points_possible: 5,
    submission: 'blackboard',
    series_key: 'labs',
    sequence_no: 1,
    status: 'not_started',
    priority: 'normal',
    effort: 4,
    effort_source: 'type',
    is_override: false,
    multiplier_applied: false,
    suggested_start: null,
    undated: false,
    confidence: 'confirmed',
    ...overrides,
  };
}

/** One row of `v_course_display`, as the Home course card reads it. */
export function makeCourseDisplay(overrides: Partial<CourseDisplay> = {}): CourseDisplay {
  return {
    display_id: 'IST.323',
    code: 'IST 323',
    title: 'Intro to Cybersecurity',
    shell_ids: ['IST.323'],
    meetings: [{ day: 1, start: '15:45:00', end: '17:05:00', room: 'Hinds Hall 010' }],
    room_disputed: false,
    bb_url: 'https://blackboard.syracuse.edu/course/IST323',
    card_note: null,
    ...overrides,
  };
}

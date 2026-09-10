/** Fixtures for the Phase 7 search contract and the Phase 9 sync loop.
 *  No test hits the network. */

import type { SearchResponse, SearchResult } from '@/lib/queries.search';
import type { AttentionItem } from '@/lib/queries.sync';

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

/* ---------------------------------------------------------------------------
 * Phase 9 — sync loop
 * ------------------------------------------------------------------------ */

/** One `attention_items` row. Defaults to an open due-date conflict. */
export function makeAttentionItem(overrides: Partial<AttentionItem> = {}): AttentionItem {
  return {
    id: 1,
    raised_at: '2026-09-10T14:00:00.000Z',
    raised_by: 42,
    kind: 'conflict',
    course_id: 'IST.323',
    entity: 'assignment',
    ref: 'IST.323.quiz-2',
    field: 'due_at',
    from_value: '2026-09-02',
    to_value: '2026-09-09',
    question: 'Blackboard moved Quiz 2 from 9/2 to 9/9. Which is right?',
    suggested: null,
    state: 'open',
    resolved_at: null,
    resolution: null,
    resolution_note: null,
    applied_at: null,
    ...overrides,
  };
}

/**
 * A raw `v_sync_status` row, exactly as supabase-js hands it back: the counts
 * and the freshness array are jsonb, so they arrive as plain objects/arrays.
 */
export function makeSyncStatusRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 42,
    run_id: '6b122650-0000-4000-8000-000000000000',
    status: 'ok',
    started_at: '2026-09-10T11:00:00.000Z',
    finished_at: '2026-09-10T11:04:00.000Z',
    trigger: 'app_request',
    summary: {
      stages: { assignments: { updated: 3 } },
      changes: ['IST.323 Quiz 2 due date moved 9/2 → 9/9', 'ECN.304 added 1 announcement'],
      attention_raised: 2,
    },
    open_attention: { conflict: 2, stack_must_confirm: 5, missing: 1, deadline: 3, data_gap: 7 },
    freshness: [
      {
        stage: 'assignments',
        fresh_as_of: '2026-09-10T11:04:00.000Z',
        last_attempt_at: '2026-09-10T11:04:00.000Z',
        last_attempt_failed: false,
      },
      {
        stage: 'files',
        fresh_as_of: '2026-09-08T11:04:00.000Z',
        last_attempt_at: '2026-09-08T11:04:00.000Z',
        last_attempt_failed: false,
      },
    ],
    ...overrides,
  };
}

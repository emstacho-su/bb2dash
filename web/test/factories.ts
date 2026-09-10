/** Fixtures for the Phase 7 search contract. No test hits the network. */

import type { SearchResponse, SearchResult } from '@/lib/queries.search';

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

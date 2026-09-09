/**
 * bb2dash — search query layer (W-8, cmd-K).
 *
 * Lives beside queries.ts (which owns the PostgREST tables) because the corpus
 * search does NOT go through PostgREST: it calls the deployed `search` edge
 * function, which runs with the service role so it can read the embeddings that
 * RLS keeps out of a browser client. Same conventions as queries.ts otherwise —
 * one place the app talks to the backend, `xOptions()` + `useX()`, throw on
 * error (TanStack turns it into `error`; the palette renders an error state).
 *
 * The function contract (verified live via pg_net against the deployed function,
 * 2026-09-09):
 *   POST {q, course?, mode?: 'fts'|'vector'|'hybrid' (default hybrid), limit?}
 *   -> {mode, q, course, count, results: SearchResult[]}
 *
 * verify_jwt is on. We authenticate with the logged-in user's Supabase session
 * access token (a real project-signed JWT), NOT the hardcoded anon key — the
 * anon key only rides along as the `apikey` gateway header.
 */

import { keepPreviousData, queryOptions, useQuery } from '@tanstack/react-query';
import { getSupabaseBrowserClient } from './supabase/client';
import { supabaseAnonKey, supabaseUrl } from './supabase/env';

export type SearchMode = 'fts' | 'vector' | 'hybrid';

/** One row of the `search` function's `results` array. */
export interface SearchResult {
  file_id: number;
  text_id: number;
  course_id: string;
  bucket: string;
  file_name: string;
  /** 'slide' | 'page' | 'doc' | 'sheet' — the extracted unit's kind. */
  unit_kind: string;
  unit_no: number | null;
  /** RRF (hybrid) / rank (fts) / distance-derived (vector) rank score. */
  score: number;
  /** Cosine similarity of the query vector to the unit. See SEMANTIC_SIMILARITY_MIN. */
  similarity: number;
  snippet: string;
}

export interface SearchResponse {
  mode: SearchMode;
  q: string;
  course: string | null;
  count: number;
  results: SearchResult[];
}

/* ---------------------------------------------------------------------------
 * Similarity labelling
 *
 * The hybrid arm returns a real cosine `similarity`. Tuned against the live
 * corpus on 2026-09-09 (see the W-8 report / EVAL_EMBEDDING_POC.md):
 *
 *   - genuine semantic hits cluster at ~0.83–0.90
 *     ("ethics case presentation length" -> 0.90, "project management" -> 0.88,
 *      "final exam date" -> 0.87, "syllabus" -> 0.90)
 *   - lexical-only hits that ride in on the FTS arm sit well below that:
 *     the bare token "Deloitte" pulls four IST466 schedule docs at 0.785–0.790,
 *     and loose / near-nonsense queries floor out around 0.78–0.81.
 *
 * gte-small has a high similarity floor, so the CLAUDE.md-era "~0.78" estimate
 * is a touch low for this corpus; 0.80 sits in the valley between the two
 * clusters. A result below it came in on lexical overlap, not meaning, so we
 * badge it "keyword match" rather than presenting it as a confident semantic
 * hit. This is a *label*, not a filter — the function's own relevance floor
 * decides what is returned at all.
 * ------------------------------------------------------------------------ */

export const SEMANTIC_SIMILARITY_MIN = 0.8;

export function isKeywordMatch(result: Pick<SearchResult, 'similarity'>): boolean {
  return typeof result.similarity === 'number' && result.similarity < SEMANTIC_SIMILARITY_MIN;
}

/* ---------------------------------------------------------------------------
 * Snippet scrubbing (hard requirement)
 *
 * The corpus embeds PPTX speaker notes and page headers/footers inline. A
 * professor's private speaker notes must never be surfaced as if they were
 * slide content. Verified marker shapes in the live corpus:
 *
 *   - Speaker notes: a line-anchored `[notes]` marker; everything from it to the
 *     end of the unit is note text, e.g.
 *       "Terms\nWhat is a system?\n...\n4\n[notes] Systems Analysis and Design (Hoffer...)"
 *   - Page/slide numbers: a standalone numeric line (the slide/page no.), e.g.
 *     the GEO final-exam page is "        9\n\n...\n** Final Exam **\nTuesday...".
 *   - "Page N" headers/footers on HBR case PDFs, often with a trailing doc code:
 *       "       Page 2                                        9B21E001"
 *
 * scrubSnippet() drops the notes tail, strips those number/"Page N" lines, and
 * reports whether notes were present. If a unit is essentially all notes
 * (nothing left after the cut) we label it and render nothing, rather than
 * dumping the notes.
 * ------------------------------------------------------------------------ */

export interface ScrubbedSnippet {
  /** The cleaned, safe-to-render body. May be '' when the unit was all notes. */
  text: string;
  /** True when a speaker-note tail was stripped out. */
  notesHidden: boolean;
  /** True when, after stripping notes, no slide/page body remained. */
  notesOnly: boolean;
}

// [notes], [note], [notes:], with tolerant spacing.
const NOTES_MARKER = /\[\s*notes?\s*:?\s*\]/i;

export function scrubSnippet(raw: string | null | undefined): ScrubbedSnippet {
  if (!raw) return { text: '', notesHidden: false, notesOnly: false };

  // 1. Cut the speaker-note tail: from the first [notes] marker to the end.
  let body = raw;
  let notesHidden = false;
  const marker = body.match(NOTES_MARKER);
  if (marker && marker.index !== undefined) {
    body = body.slice(0, marker.index);
    notesHidden = true;
  }

  // 2. Line-by-line: drop page/slide-number lines and "Page N" headers.
  const kept = body
    .replace(/[\u000b\f\r]/g, '\n') // some slides use a vertical tab as a line break
    .split('\n')
    .filter((line) => {
      const t = line.trim();
      if (t === '') return true; // keep blanks for now; collapsed below
      if (/^page\s+\d+\b/i.test(t)) return false; // "Page 2 ... 9B21E001"
      if (/^\d{1,4}$/.test(t)) return false; // a lone slide / page number
      return true;
    });

  // 3. Collapse the whitespace the slide extractor leaves behind.
  const text = kept
    .join('\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{2,}/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();

  return { text, notesHidden, notesOnly: notesHidden && text === '' };
}

/* ---------------------------------------------------------------------------
 * The query itself
 * ------------------------------------------------------------------------ */

export interface SearchParams {
  q: string;
  course?: string | null;
  mode?: SearchMode;
  limit?: number;
}

export const searchQueryKeys = {
  all: ['search'] as const,
  run: (p: Required<Pick<SearchParams, 'q' | 'mode'>> & { course: string | null; limit: number }) =>
    ['search', p.mode, p.course, p.limit, p.q] as const,
};

async function runSearch(params: SearchParams, signal?: AbortSignal): Promise<SearchResponse> {
  const q = params.q.trim();
  const course = params.course?.trim() || null;
  const mode: SearchMode = params.mode ?? 'hybrid';
  const limit = params.limit ?? 12;

  const supabase = getSupabaseBrowserClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) {
    throw new Error('Your session has expired. Sign in again to search.');
  }

  const res = await fetch(`${supabaseUrl()}/functions/v1/search`, {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      // The user's own JWT satisfies the function's verify_jwt; the anon key is
      // only the gateway apikey header (never used as the bearer identity).
      Authorization: `Bearer ${token}`,
      apikey: supabaseAnonKey(),
    },
    body: JSON.stringify({ q, course, mode, limit }),
  });

  if (!res.ok) {
    let message = `Search failed (${res.status}).`;
    try {
      const errBody = (await res.json()) as { error?: string };
      if (errBody?.error) message = errBody.error;
    } catch {
      /* non-JSON error body — keep the status message */
    }
    throw new Error(message);
  }

  const body = (await res.json()) as SearchResponse & { error?: string };
  if (body?.error) throw new Error(body.error);
  return body;
}

export function searchOptions(params: SearchParams) {
  const q = params.q.trim();
  const course = params.course?.trim() || null;
  const mode: SearchMode = params.mode ?? 'hybrid';
  const limit = params.limit ?? 12;

  return queryOptions({
    queryKey: searchQueryKeys.run({ q, course, mode, limit }),
    queryFn: ({ signal }) => runSearch({ q, course, mode, limit }, signal),
    // ≥2 chars before we spend an embedding round-trip.
    enabled: q.length >= 2,
    // Keep the old list on screen while the next keystroke's query resolves.
    placeholderData: keepPreviousData,
    staleTime: 60 * 1000,
    retry: 1,
  });
}

export function useSearch(params: SearchParams) {
  return useQuery(searchOptions(params));
}

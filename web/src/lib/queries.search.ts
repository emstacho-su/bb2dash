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
 * 2026-09-09; v3 on main is additive — same result columns, plus an optional
 * `min_similarity` request floor that is echoed back; we don't send it, so the
 * palette keeps the "always show something" behaviour and labels instead):
 *   POST {q, course?, mode?: 'fts'|'vector'|'hybrid' (default hybrid), limit?, min_similarity?,
 *         include_superseded?}
 *   -> {mode, q, course, min_similarity, count, results: SearchResult[]}
 *
 * Phase 7 (`search` v4 + migration 021) adds `include_superseded` to the request
 * and `part_no` / `snippet_source` to each result row. Both result fields are
 * optional here so the app keeps working against the older deployed function.
 *
 * verify_jwt is on. We authenticate with the logged-in user's Supabase session
 * access token (a real project-signed JWT), NOT the hardcoded anon key — the
 * anon key only rides along as the `apikey` gateway header.
 */

import { keepPreviousData, queryOptions, useQuery } from '@tanstack/react-query';
import { getSupabaseBrowserClient } from './supabase/client';
import { supabaseAnonKey, supabaseUrl } from './supabase/env';

export type SearchMode = 'fts' | 'vector' | 'hybrid';

/**
 * Where a result's snippet came from (migration 021 / `search` v4):
 *   - `fts_headline` / `vector_part` — the passage that actually matched
 *   - `unit_head` — only the start of the unit, no passage evidence
 * A backend that predates 021 sends neither this nor `part_no`, so both are
 * optional here and the UI degrades to what it showed before.
 */
export type SnippetSource = 'fts_headline' | 'vector_part' | 'unit_head';

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
  /**
   * Cosine similarity of the query vector to the unit. Null when the unit has
   * no embedding at all — it reached the result set through the keyword arm.
   * See SEMANTIC_SIMILARITY_MIN.
   */
  similarity: number | null;
  snippet: string;
  /** The part the snippet was cut from; null for a whole-unit snippet or an unembedded unit. */
  part_no?: number | null;
  /** How the snippet was produced. Absent on a pre-021 backend. */
  snippet_source?: SnippetSource | null;
}

export interface SearchResponse {
  mode: SearchMode;
  q: string;
  course: string | null;
  /** v3: the vector floor applied server-side; null when the caller sent none (we don't). */
  min_similarity?: number | null;
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
  const { similarity } = result;
  // No similarity at all: the unit has no embedding, so the keyword arm is the
  // only way it could have got here. That is a keyword match by definition —
  // never a semantic one, and never a percentage.
  if (typeof similarity !== 'number' || !Number.isFinite(similarity)) return true;
  return similarity < SEMANTIC_SIMILARITY_MIN;
}

/* ---------------------------------------------------------------------------
 * Which part of a long unit matched
 *
 * A 4,000-character syllabus is embedded in parts; the snippet is now cut from
 * the part that carries the match rather than the head of the unit, and
 * `part_no` names that part — null when the snippet is the whole unit (the
 * fallback headline) or the unit has no embedding. Part 1 IS the head, and
 * short units only ever have one part, so naming it would be noise: the hint
 * only means something from part 2 on.
 * ------------------------------------------------------------------------ */

export const FIRST_LABELLED_PART = 2;

/** The part number worth showing, or null when there is nothing to say. */
export function matchedPart(result: Pick<SearchResult, 'part_no'>): number | null {
  const part = result.part_no;
  if (typeof part !== 'number' || !Number.isFinite(part)) return null;
  return part >= FIRST_LABELLED_PART ? part : null;
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
  /**
   * Include files a newer upload has superseded (four dated copies of the same
   * IST466 schedule exist). Not exposed in the UI — wired through so a caller
   * can ask for the history deliberately.
   */
  includeSuperseded?: boolean;
}

/** `SearchParams` with every default resolved. Both the key and the request body build from this. */
export interface ResolvedSearchParams {
  q: string;
  course: string | null;
  mode: SearchMode;
  limit: number;
  includeSuperseded: boolean;
}

const DEFAULT_MODE: SearchMode = 'hybrid';
const DEFAULT_LIMIT = 12;
const DEFAULT_INCLUDE_SUPERSEDED = false;
/** Below this the query is not worth an embedding round-trip. */
const MIN_QUERY_CHARS = 2;

/**
 * One place the defaults live, so the query key and the request body can never
 * describe different searches. Returns a new object; the input is untouched.
 */
export function resolveSearchParams(params: SearchParams): ResolvedSearchParams {
  return {
    q: params.q.trim(),
    course: params.course?.trim() || null,
    mode: params.mode ?? DEFAULT_MODE,
    limit: params.limit ?? DEFAULT_LIMIT,
    includeSuperseded: params.includeSuperseded ?? DEFAULT_INCLUDE_SUPERSEDED,
  };
}

export const searchQueryKeys = {
  all: ['search'] as const,
  run: (p: ResolvedSearchParams) =>
    ['search', p.mode, p.course, p.limit, p.includeSuperseded, p.q] as const,
};

async function runSearch(params: ResolvedSearchParams, signal?: AbortSignal): Promise<SearchResponse> {
  const { q, course, mode, limit, includeSuperseded } = params;

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
    // include_superseded rides along only when true: the deployed function
    // defaults to false, and an older one has no such parameter at all.
    body: JSON.stringify({ q, course, mode, limit, ...(includeSuperseded ? { include_superseded: true } : {}) }),
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
  const resolved = resolveSearchParams(params);

  return queryOptions({
    queryKey: searchQueryKeys.run(resolved),
    queryFn: ({ signal }) => runSearch(resolved, signal),
    enabled: resolved.q.length >= MIN_QUERY_CHARS,
    // Keep the old list on screen while the next keystroke's query resolves.
    placeholderData: keepPreviousData,
    staleTime: 60 * 1000,
    retry: 1,
  });
}

export function useSearch(params: SearchParams) {
  return useQuery(searchOptions(params));
}

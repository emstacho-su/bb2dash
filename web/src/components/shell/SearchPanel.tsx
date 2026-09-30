'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { courseCode, useCourses } from '@/lib/queries';
import {
  MIN_QUERY_CHARS,
  SEMANTIC_SIMILARITY_MIN,
  isKeywordMatch,
  matchedPart,
  scrubSnippet,
  useSearch,
  type SearchMode,
  type SearchResult,
} from '@/lib/queries.search';
import tokens from '@/styles/tokens.module.css';
import styles from './SearchPanel.module.css';

/**
 * Materials search — the state, the results panel and the result row.
 *
 * 2026-09-30 (Stack: "only as a search icon … as the feature is seldom used"):
 * the centered ⌘K dialog is gone. `NavSearch` owns the icon, the field in the
 * top bar and the popover; this module owns what the search *is*, once:
 * `useMaterialSearch` holds the query, debounce, mode, course filter,
 * highlighted row and the open-course action, the field reads its value and
 * key handler from it, and `SearchPanel` renders the modes and results.
 *
 * Retrieval rule (CLAUDE.md): results scrub/label PPTX `[notes]` speaker-note
 * markers and page headers so a professor's private notes are never surfaced as
 * slide content, and hits that arrived on lexical overlap alone are badged
 * "keyword match" rather than presented as confident semantic hits. Both live
 * in `queries.search.ts` (scrubSnippet / isKeywordMatch).
 */

const MODES: { value: SearchMode; label: string; hint: string }[] = [
  { value: 'hybrid', label: 'Hybrid', hint: 'Semantic + keyword (default)' },
  { value: 'vector', label: 'Semantic', hint: 'Meaning only (embeddings)' },
  { value: 'fts', label: 'Keyword', hint: 'Exact terms only (full-text)' },
];

/** How long typing must pause before the query runs. */
const DEBOUNCE_MS = 250;


/** Debounce a value by `delay` ms. */
function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

/**
 * The one source of truth for a search session. Mount it fresh per expansion
 * so the query, debounce and selection start clean each time.
 *
 * `onDone` runs when a result is opened (the caller collapses the search).
 */
export function useMaterialSearch(onDone: () => void) {
  const router = useRouter();

  const [raw, setRaw] = useState('');
  const [mode, setMode] = useState<SearchMode>('hybrid');
  const [course, setCourse] = useState<string>(''); // '' = all courses

  const q = useDebounced(raw.trim(), DEBOUNCE_MS);
  const coursesQuery = useCourses();

  const search = useSearch({ q, course: course || null, mode });
  const results = useMemo<SearchResult[]>(() => search.data?.results ?? [], [search.data]);

  // The highlighted row belongs to one result set. A new query, mode, course or
  // answer starts again at the top: derived here during render rather than reset
  // by an effect (react-hooks/set-state-in-effect).
  const resultSet = useMemo(() => ({ q, mode, course, data: search.data }), [q, mode, course, search.data]);
  const [selection, setSelection] = useState({ resultSet, index: 0 });
  const active = selection.resultSet === resultSet ? selection.index : 0;
  const setActive = (next: (index: number) => number) =>
    setSelection({ resultSet, index: next(active) });

  function open(result: SearchResult | undefined) {
    if (!result) return;
    onDone();
    // Best-effort deep link: the course page. Per-file/materials deep linking is
    // W-6's surface (the course sub-bar Materials tab is not yet route-driven).
    router.push(`/course/${encodeURIComponent(result.course_id)}`);
  }

  /** ↑/↓ move the highlight, ↵ opens it. Escape belongs to the caller. */
  function onInputKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((i) => Math.min(i + 1, Math.max(results.length - 1, 0)));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      open(results[active]);
    }
  }

  // Every state keys off the debounced query so clearing the input can't briefly
  // show stale results alongside the empty-state hint.
  const ready = q.length >= MIN_QUERY_CHARS;

  return {
    raw,
    setRaw,
    mode,
    setMode,
    course,
    setCourse,
    courses: coursesQuery.data,
    search,
    results,
    ready,
    active,
    setActive,
    open,
    onInputKeyDown,
  };
}

export type MaterialSearch = ReturnType<typeof useMaterialSearch>;

/** The popover body under the nav field: modes, course filter, results, key hints. */
export function SearchPanel({ state, listId }: { state: MaterialSearch; listId: string }) {
  const { mode, setMode, course, setCourse, courses, search, results, ready, active, setActive, open } =
    state;

  return (
    <>
      <div className={styles.controls}>
        <div className={styles.modeGroup} role="group" aria-label="Search mode">
          {MODES.map((m) => (
            <button
              key={m.value}
              type="button"
              title={m.hint}
              aria-pressed={mode === m.value}
              className={mode === m.value ? styles.modeBtnActive : styles.modeBtn}
              onClick={() => setMode(m.value)}
            >
              {m.label}
            </button>
          ))}
        </div>

        <label className={styles.courseLabel}>
          <span className="sr-only">Filter by course</span>
          <select
            className={styles.courseSelect}
            value={course}
            onChange={(e) => setCourse(e.target.value)}
          >
            <option value="">All courses</option>
            {courses?.map((c) => (
              <option key={c.id} value={c.id}>
                {courseCode(c)} · {c.title_short}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className={styles.results} id={listId} role="listbox" aria-label="Results">
        {!ready && (
          <p className={styles.note}>
            Type at least two characters to search slides, readings, syllabi and schedules across
            your courses.
          </p>
        )}

        {ready && search.isPending && <p className={styles.note}>Searching…</p>}

        {ready && search.isError && (
          <p className={styles.noteError}>
            {(search.error as Error)?.message ?? 'Search failed.'} Check your connection and try
            again.
          </p>
        )}

        {ready && search.isSuccess && results.length === 0 && (
          <p className={styles.note}>
            No matches for <strong>“{search.data?.q}”</strong>
            {course ? ' in this course' : ''}. Try different words or the Keyword mode for an exact
            term.
          </p>
        )}

        {ready &&
          results.map((r, i) => (
            <ResultRow
              key={`${r.file_id}:${r.text_id}:${i}`}
              result={r}
              mode={search.data?.mode ?? mode}
              active={i === active}
              onMouseEnter={() => setActive(() => i)}
              onSelect={() => open(r)}
            />
          ))}
      </div>

      <div className={styles.footer}>
        <span>
          <kbd className={styles.kbd}>↑</kbd>
          <kbd className={styles.kbd}>↓</kbd> navigate
        </span>
        <span>
          <kbd className={styles.kbd}>↵</kbd> open course
        </span>
        <span>
          <kbd className={styles.kbd}>esc</kbd> close
        </span>
      </div>
    </>
  );
}

/**
 * What each mode's row really carries (L-1; `search` edge function, migrations
 * 021 and 024). `SearchResult` is hybrid's shape; the other two differ:
 *   - fts: `rank` and a whole-unit plain headline `snippet`; no similarity,
 *     no part, no score.
 *   - vector: `similarity`, `part_no` and the unit's whole `text`; no snippet.
 * The row reads only what its mode returned, so it never shows a number the
 * search did not produce.
 */
type ModeRow = SearchResult & { text?: string | null };

/** How much of a vector hit's unit text the row shows. */
const PASSAGE_MAX_CHARS = 240;

/** The head of a scrubbed unit text, cut on a word boundary. */
function cutPassage(text: string): string {
  if (text.length <= PASSAGE_MAX_CHARS) return text;
  const head = text.slice(0, PASSAGE_MAX_CHARS);
  const space = head.lastIndexOf(' ');
  const cut = space > PASSAGE_MAX_CHARS / 2 ? head.slice(0, space) : head;
  return `${cut.trimEnd()}…`;
}

const KEYWORD_ARM_TITLE =
  'Matched on exact wording, not meaning — it came in via the keyword (full-text) arm.';
const KEYWORD_MODE_TITLE =
  'Keyword mode matches exact wording; it returns no similarity, so none is shown.';

/**
 * One result. Exported for its unit test — the palette itself needs a router
 * and a query client, and this row needs neither.
 */
export function ResultRow({
  result,
  mode = 'hybrid',
  active,
  onMouseEnter,
  onSelect,
}: {
  result: SearchResult;
  /** The mode that produced `result` (the response's own `mode`). */
  mode?: SearchMode;
  active: boolean;
  onMouseEnter: () => void;
  onSelect: () => void;
}) {
  const row = result as ModeRow;
  const source = mode === 'vector' ? row.text : row.snippet;
  const scrubbed = useMemo(() => scrubSnippet(source), [source]);
  const bodyText = mode === 'vector' ? cutPassage(scrubbed.text) : scrubbed.text;
  // Keyword mode has no similarity to judge by: every hit is a wording match.
  // Semantic mode has no keyword arm: a low similarity is weak, not lexical.
  const keyword = mode === 'fts' || (mode === 'hybrid' && isKeywordMatch(result));
  // Which part of a long unit the snippet came from; null when it is the head.
  const part = matchedPart(result);
  // A unit with no embedding has no similarity at all; isKeywordMatch is true
  // there, so the percentage branch is never reached with a null.
  const similarity =
    typeof result.similarity === 'number' && Number.isFinite(result.similarity)
      ? result.similarity
      : null;
  const pct = similarity === null ? null : Math.round(similarity * 100);
  const simTitle = similarity === null ? undefined : `Semantic similarity ${similarity.toFixed(3)}`;

  const unit =
    result.unit_no != null ? `${result.unit_kind} ${result.unit_no}` : result.unit_kind;

  return (
    <button
      type="button"
      role="option"
      aria-selected={active}
      className={active ? styles.rowActive : styles.row}
      onMouseEnter={onMouseEnter}
      onClick={onSelect}
    >
      <div className={styles.rowTop}>
        <span className={styles.fileName}>{result.file_name}</span>
        <span className={tokens.tagAccent}>{result.course_id}</span>
      </div>

      <div className={styles.rowMeta}>
        <span className={styles.bucket}>{result.bucket.replace(/_/g, ' ')}</span>
        <span className={styles.dot} aria-hidden="true">
          ·
        </span>
        <span>{unit}</span>
        {part != null && (
          <span
            className={styles.partHint}
            title={`This unit is long enough to be embedded in parts; the passage below is from part ${part}.`}
          >
            part {part}
          </span>
        )}
        {keyword ? (
          <span
            className={styles.keywordBadge}
            title={mode === 'fts' ? KEYWORD_MODE_TITLE : KEYWORD_ARM_TITLE}
          >
            keyword match
          </span>
        ) : similarity !== null && similarity < SEMANTIC_SIMILARITY_MIN ? (
          <span className={styles.keywordBadge} title={simTitle}>
            weak match
          </span>
        ) : (
          pct != null && (
            <span className={styles.simBadge} title={simTitle}>
              <span className={styles.simDot} aria-hidden="true" />
              {pct}% match
            </span>
          )
        )}
      </div>

      {scrubbed.notesOnly ? (
        <p className={styles.notesHidden}>
          This slide is speaker notes only — hidden. Open the course to view it in context.
        </p>
      ) : (
        bodyText && <p className={styles.snippet}>{bodyText}</p>
      )}

      {scrubbed.notesHidden && !scrubbed.notesOnly && (
        <span className={styles.notesTag}>speaker notes hidden</span>
      )}
    </button>
  );
}

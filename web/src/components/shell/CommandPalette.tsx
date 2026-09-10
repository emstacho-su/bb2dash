'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { courseCode, useCourses } from '@/lib/queries';
import {
  isKeywordMatch,
  matchedPart,
  scrubSnippet,
  useSearch,
  type SearchMode,
  type SearchResult,
} from '@/lib/queries.search';
import tokens from '@/styles/tokens.module.css';
import styles from './CommandPalette.module.css';

/**
 * cmd-K command palette.
 *
 * This component owns the keyboard shortcut (⌘K / Ctrl-K), the
 * `bb2dash:command-palette` custom event the top-bar search button dispatches,
 * and the modal surface — that plumbing is a contract W-4 built and other code
 * dispatches into, so it is left exactly as-is. W-8 owns everything *inside* the
 * panel: the live search UI against the `search` edge function.
 *
 * Retrieval rule (CLAUDE.md): results scrub/label PPTX `[notes]` speaker-note
 * markers and page headers so a professor's private notes are never surfaced as
 * slide content, and hits that arrived on lexical overlap alone are badged
 * "keyword match" rather than presented as confident semantic hits. Both live
 * in `queries.search.ts` (scrubSnippet / isKeywordMatch).
 */
export function CommandPalette() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen((v) => !v);
        return;
      }
      if (event.key === 'Escape') setOpen(false);
    }
    function onOpenRequest() {
      setOpen(true);
    }

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('bb2dash:command-palette', onOpenRequest);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('bb2dash:command-palette', onOpenRequest);
    };
  }, []);

  if (!open) return null;

  return (
    <div
      className={styles.backdrop}
      role="dialog"
      aria-modal="true"
      aria-label="Search course materials"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) setOpen(false);
      }}
    >
      <div className={styles.panel}>
        {/* Fresh mount per open so the query, debounce and selection reset. */}
        <SearchBody onClose={() => setOpen(false)} />
      </div>
    </div>
  );
}

const MODES: { value: SearchMode; label: string; hint: string }[] = [
  { value: 'hybrid', label: 'Hybrid', hint: 'Semantic + keyword (default)' },
  { value: 'vector', label: 'Semantic', hint: 'Meaning only (embeddings)' },
  { value: 'fts', label: 'Keyword', hint: 'Exact terms only (full-text)' },
];

/** Debounce a value by `delay` ms. */
function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

function SearchBody({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const [raw, setRaw] = useState('');
  const [mode, setMode] = useState<SearchMode>('hybrid');
  const [course, setCourse] = useState<string>(''); // '' = all courses
  const [active, setActive] = useState(0);

  const q = useDebounced(raw.trim(), 250);
  const coursesQuery = useCourses();

  const search = useSearch({ q, course: course || null, mode });
  const results = useMemo<SearchResult[]>(() => search.data?.results ?? [], [search.data]);

  // Focus the input on mount.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Reset the highlighted row whenever the result set changes.
  useEffect(() => {
    setActive(0);
  }, [q, mode, course, search.data]);

  function go(result: SearchResult | undefined) {
    if (!result) return;
    onClose();
    // Best-effort deep link: the course page. Per-file/materials deep linking is
    // W-6's surface (the course sub-bar Materials tab is not yet route-driven).
    router.push(`/course/${encodeURIComponent(result.course_id)}`);
  }

  function onInputKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((i) => Math.min(i + 1, Math.max(results.length - 1, 0)));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      go(results[active]);
    }
    // Escape is handled by the window listener in CommandPalette.
  }

  // Every state keys off the debounced query so clearing the input can't briefly
  // show stale results alongside the empty-state hint.
  const ready = q.length >= 2;

  return (
    <>
      <div className={styles.searchRow}>
        <SearchGlyph />
        <input
          ref={inputRef}
          className={styles.input}
          type="text"
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          onKeyDown={onInputKeyDown}
          placeholder="Search course materials…"
          role="combobox"
          aria-expanded={ready}
          aria-controls="cmdk-results"
          aria-autocomplete="list"
          autoComplete="off"
          spellCheck={false}
        />
        {search.isFetching && ready && <span className={styles.spinner} aria-hidden="true" />}
      </div>

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
            {coursesQuery.data?.map((c) => (
              <option key={c.id} value={c.id}>
                {courseCode(c)} · {c.title_short}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className={styles.results} id="cmdk-results" role="listbox" aria-label="Results">
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
              active={i === active}
              onMouseEnter={() => setActive(i)}
              onSelect={() => go(r)}
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
 * One result. Exported for its unit test — the palette itself needs a router
 * and a query client, and this row needs neither.
 */
export function ResultRow({
  result,
  active,
  onMouseEnter,
  onSelect,
}: {
  result: SearchResult;
  active: boolean;
  onMouseEnter: () => void;
  onSelect: () => void;
}) {
  const scrubbed = useMemo(() => scrubSnippet(result.snippet), [result.snippet]);
  const keyword = isKeywordMatch(result);
  // Which part of a long unit the snippet came from; null when it is the head.
  const part = matchedPart(result);
  const pct = Number.isFinite(result.similarity) ? Math.round(result.similarity * 100) : null;

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
            title="Matched on exact wording, not meaning — it came in via the keyword (full-text) arm."
          >
            keyword match
          </span>
        ) : (
          pct != null && (
            <span
              className={styles.simBadge}
              title={`Semantic similarity ${result.similarity.toFixed(3)}`}
            >
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
        scrubbed.text && <p className={styles.snippet}>{scrubbed.text}</p>
      )}

      {scrubbed.notesHidden && !scrubbed.notesOnly && (
        <span className={styles.notesTag}>speaker notes hidden</span>
      )}
    </button>
  );
}

function SearchGlyph() {
  return (
    <svg className={styles.searchGlyph} viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <line x1="10.5" y1="10.5" x2="14" y2="14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

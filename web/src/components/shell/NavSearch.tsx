'use client';

import { useCallback, useEffect, useId, useRef, useState, type RefObject } from 'react';
import { SearchIcon } from './icons';
import { SearchPanel, useMaterialSearch } from './SearchPanel';
import styles from './NavSearch.module.css';

/**
 * Search in the top bar — an icon that expands in place into a field.
 *
 * 2026-09-30, Stack: "reimplement search but only as a search icon (that
 * expands when clicked to show the text field) as the feature is seldom used."
 * The wide "Search ⌘K" button and the centered dialog are gone; the results
 * open in a popover anchored under the field.
 *
 * Expands on: the icon, ⌘K / Ctrl+K anywhere, or the `bb2dash:command-palette`
 * window event (kept as the "expand search" trigger for any other caller).
 * Collapses — and forgets the query — on Escape, a press outside, a second
 * press of the icon, opening a result, or an empty field losing focus.
 */

/** The window event any code may dispatch to open search. */
export const SEARCH_EXPAND_EVENT = 'bb2dash:command-palette';

export function NavSearch() {
  const [expanded, setExpanded] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const iconRef = useRef<HTMLButtonElement>(null);
  const fieldRef = useRef<HTMLInputElement>(null);
  const baseId = useId();
  const fieldId = `${baseId}-field`;
  const listId = `${baseId}-results`;

  const expand = useCallback(() => {
    setExpanded(true);
    // Already open: just bring the caret back. A fresh field focuses itself.
    fieldRef.current?.focus();
  }, []);

  const collapse = useCallback((returnFocus: boolean) => {
    setExpanded(false);
    if (returnFocus) iconRef.current?.focus();
  }, []);

  // ⌘K / Ctrl+K and the expand event work whether or not search is open.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        expand();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener(SEARCH_EXPAND_EVENT, expand);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener(SEARCH_EXPAND_EVENT, expand);
    };
  }, [expand]);

  // While open: Escape and a press outside the field-and-panel collapse it.
  useEffect(() => {
    if (!expanded) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') collapse(true);
    }
    function onPointerDown(event: MouseEvent | TouchEvent) {
      const root = rootRef.current;
      if (root && !root.contains(event.target as Node)) collapse(false);
    }
    window.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
    };
  }, [expanded, collapse]);

  return (
    <div
      ref={rootRef}
      className={expanded ? styles.rootOpen : styles.root}
      data-search={expanded ? 'open' : 'closed'}
    >
      <button
        ref={iconRef}
        type="button"
        className={expanded ? styles.iconOpen : styles.icon}
        onClick={expanded ? () => collapse(false) : expand}
        aria-label="Search"
        aria-expanded={expanded}
        aria-controls={expanded ? fieldId : undefined}
        title="Search materials (⌘K)"
      >
        <SearchIcon />
      </button>

      {/* Mounted per expansion, so the query, mode and highlight start clean. */}
      {expanded && (
        <ExpandedSearch
          fieldRef={fieldRef}
          rootRef={rootRef}
          fieldId={fieldId}
          listId={listId}
          onCollapse={collapse}
        />
      )}
    </div>
  );
}

function ExpandedSearch({
  fieldRef,
  rootRef,
  fieldId,
  listId,
  onCollapse,
}: {
  fieldRef: RefObject<HTMLInputElement | null>;
  rootRef: RefObject<HTMLDivElement | null>;
  fieldId: string;
  listId: string;
  onCollapse: (returnFocus: boolean) => void;
}) {
  const state = useMaterialSearch(() => onCollapse(false));
  const { raw, setRaw, ready, search, onInputKeyDown } = state;
  const typing = raw.trim().length > 0;

  useEffect(() => {
    fieldRef.current?.focus();
  }, [fieldRef]);

  function onBlur(event: React.FocusEvent<HTMLInputElement>) {
    // Focus moving into the panel (a mode button, the course filter) or onto
    // the icon keeps the search; an empty field left for anywhere else folds.
    const next = event.relatedTarget as Node | null;
    if (next && rootRef.current?.contains(next)) return;
    if (!typing) onCollapse(false);
  }

  return (
    <>
      <input
        ref={fieldRef}
        id={fieldId}
        className={styles.field}
        type="text"
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
        onKeyDown={onInputKeyDown}
        onBlur={onBlur}
        placeholder="Search materials…"
        aria-label="Search materials"
        role="combobox"
        aria-expanded={typing}
        aria-controls={typing ? listId : undefined}
        aria-autocomplete="list"
        autoComplete="off"
        spellCheck={false}
      />
      {search.isFetching && ready && <span className={styles.spinner} aria-hidden="true" />}

      {typing && (
        <div className={styles.popover}>
          <SearchPanel state={state} listId={listId} />
        </div>
      )}
    </>
  );
}

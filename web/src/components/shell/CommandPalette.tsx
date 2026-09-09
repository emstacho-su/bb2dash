'use client';

import { useEffect, useState } from 'react';
import tokens from '@/styles/tokens.module.css';
import styles from './CommandPalette.module.css';

/**
 * cmd-K MOUNT POINT — placeholder.
 *
 * This owns the keyboard shortcut (⌘K / Ctrl-K), the `bb2dash:command-palette`
 * custom event the top-bar search button dispatches, and the modal surface.
 * W-8 replaces the body with the real hybrid-search UI against the `search`
 * edge function; the open/close plumbing here is meant to survive that.
 *
 * When W-8 lands, remember the retrieval rule from CLAUDE.md: search results
 * must scrub/label PPTX `[notes]` speaker-note markers and `Page N` headers.
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
      aria-label="Search"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) setOpen(false);
      }}
    >
      <div className={styles.panel}>
        <h2 className={styles.title}>Search</h2>
        <p className={styles.body}>
          The command palette is not wired up yet. It will search course materials through the
          hybrid <code>search</code> edge function.
        </p>
        <button type="button" className={tokens.btnSecondary} onClick={() => setOpen(false)}>
          Close
        </button>
      </div>
    </div>
  );
}

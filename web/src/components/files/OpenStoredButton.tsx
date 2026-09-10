'use client';

/**
 * Open a stored file in a new tab by minting a signed URL at click time.
 *
 * The tab is opened synchronously inside the click gesture so pop-up blockers
 * allow it, then pointed at the signed URL once Storage responds. Failures are
 * shown on the row rather than swallowed — a silent no-op reads as a dead
 * button.
 *
 * This is the Materials screen's `OpenStoredButton` lifted into a shared
 * component so the Classwork tree can use the same Open ladder. The copy still
 * inside `materials/MaterialsBrowser.tsx` is identical; it is left in place
 * because worker W-14 is editing that file in the same phase. PM: collapse the
 * two at integration.
 */

import { useState } from 'react';
import { createSignedFileUrl } from '@/lib/queries.materials';
import styles from './OpenStoredButton.module.css';

export function OpenStoredButton({
  storagePath,
  label = 'Open',
  className,
}: {
  storagePath: string;
  label?: string;
  className: string;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleOpen() {
    setError(null);
    setPending(true);
    const tab = window.open('about:blank', '_blank');
    try {
      const url = await createSignedFileUrl(storagePath);
      if (tab) {
        tab.location.href = url;
      } else {
        // Pop-up was blocked before we could await — try a direct open.
        window.open(url, '_blank', 'noopener,noreferrer');
      }
    } catch (err) {
      tab?.close();
      setError(err instanceof Error ? err.message : 'Could not open file');
    } finally {
      setPending(false);
    }
  }

  return (
    <span className={styles.action}>
      <button type="button" className={className} onClick={handleOpen} disabled={pending}>
        {pending ? 'Opening…' : label}
      </button>
      {error && (
        <span className={styles.error} role="alert">
          {error}
        </span>
      )}
    </span>
  );
}

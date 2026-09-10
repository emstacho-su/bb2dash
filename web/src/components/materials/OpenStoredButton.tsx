'use client';

import { useState } from 'react';
import { createSignedFileUrl } from '@/lib/queries.materials';
import styles from './OpenStoredButton.module.css';

/**
 * Open a file that lives in the `bb-files` Storage bucket, minting a signed URL
 * at click time.
 *
 * Lifted out of MaterialsBrowser when the session popout needed the same
 * behaviour. The new tab is opened synchronously inside the click gesture so
 * pop-up blockers allow it, then pointed at the signed URL once Storage
 * responds. A failure is shown next to the button rather than swallowed.
 */
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
        <span className={styles.rowError} role="alert">
          {error}
        </span>
      )}
    </span>
  );
}

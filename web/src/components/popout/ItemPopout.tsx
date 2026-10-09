'use client';

/**
 * The route-driven popout host (R-05).
 *
 * `?item=assignment:<id>` or `?item=session:<id>` on ANY screen opens the
 * matching panel over it, exactly the way the command palette is mounted once in
 * the (app) layout. Driving it from the URL rather than component state means a
 * popout is linkable, survives a refresh, and closes with the browser's Back —
 * and any screen can open one with a plain <Link>, without prop-drilling a
 * handler down to the row that was clicked.
 *
 * Closing drops the parameter with `router.replace`, so dismissing a popout does
 * not leave a dead entry in the history stack.
 *
 * Hydration (R-43): the host sits in the layout's Suspense boundary, so it
 * hydrates after `PersistQueryClientProvider` has restored the query cache. A
 * pasted `?item=` link used to render "Loading…" on the server and the cached
 * panel on the client, and React threw the server tree away (#418). Until
 * `useHydrated` says the client may use its cache, the host renders the same
 * placeholder on both sides; the panel follows on the next render. The panels
 * themselves are not gated, because `AssignmentDetailBody` is shared with the
 * assignment page, which has no Suspense boundary to hydrate inside.
 *
 * Leaving (task 29): when the parameter goes the popout is kept for one exit (`--motion-exit-lg`),
 * marked `data-leaving`, with the item it last showed. `close` is called at once either way.
 */

import { useCallback, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { parseItemParam } from '@/lib/queries.popout';
import { useHydrated } from '@/lib/use-hydrated';
import { AssignmentPopout } from './AssignmentPopout';
import { SessionPopout } from './SessionPopout';
import { EXIT_TOKEN_LG, useExit } from '@/components/shell/useExit';
import { PopoutShell } from './PopoutShell';
import styles from './Popout.module.css';

/** What the server and the hydrating client both render inside the shell. */
export const POPOUT_PLACEHOLDER = 'Loading…';

export function ItemPopout() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const hydrated = useHydrated();

  const raw = searchParams.get('item');
  // The item last shown, kept so the popout can leave with its own words.
  const [shownRaw, setShownRaw] = useState(raw);
  if (raw !== null && raw !== shownRaw) setShownRaw(raw);
  const [exit, exitRef] = useExit(parseItemParam(raw) !== null, EXIT_TOKEN_LG);
  const target = parseItemParam(raw ?? shownRaw);

  const close = useCallback(() => {
    const next = new URLSearchParams(searchParams.toString());
    next.delete('item');
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [pathname, router, searchParams]);

  if (!target || !exit.present) return null;

  return (
    <PopoutShell
      leaving={exit.leaving}
      itemKey={shownRaw ?? undefined}
      onPanelNode={exitRef}
      label={target.kind === 'assignment' ? 'Assignment detail' : 'Session detail'}
      onClose={close}
    >
      {!hydrated ? (
        <p className={styles.state}>{POPOUT_PLACEHOLDER}</p>
      ) : target.kind === 'assignment' ? (
        <AssignmentPopout assignmentId={target.id} />
      ) : (
        <SessionPopout sessionId={target.id} />
      )}
    </PopoutShell>
  );
}

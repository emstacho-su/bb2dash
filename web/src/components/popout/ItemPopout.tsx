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
 */

import { useCallback } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { parseItemParam } from '@/lib/queries.popout';
import { AssignmentPopout } from './AssignmentPopout';
import { SessionPopout } from './SessionPopout';
import { PopoutShell } from './PopoutShell';

export function ItemPopout() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  const raw = searchParams.get('item');
  const target = parseItemParam(raw);

  const close = useCallback(() => {
    const next = new URLSearchParams(searchParams.toString());
    next.delete('item');
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [pathname, router, searchParams]);

  if (!target) return null;

  return (
    <PopoutShell
      label={target.kind === 'assignment' ? 'Assignment detail' : 'Session detail'}
      onClose={close}
    >
      {target.kind === 'assignment' ? (
        <AssignmentPopout assignmentId={target.id} />
      ) : (
        <SessionPopout sessionId={target.id} />
      )}
    </PopoutShell>
  );
}

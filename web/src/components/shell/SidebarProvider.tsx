'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
  type RefObject,
} from 'react';
import { useHydrated } from '@/lib/use-hydrated';
import {
  SIDEBAR_BREAKPOINT,
  readStoredSidebar,
  resolveSidebar,
  writeStoredSidebar,
  type SidebarState,
} from '@/lib/sidebar-preference';

/**
 * The one piece of shell state two distant components share: the ☰ button in
 * the top bar opens the rail that `CourseSidebar` renders below it.
 *
 * Hydration: the server has no viewport and no localStorage, so it renders the
 * desktop default. The inline boot script (see `sidebar-preference.ts`) has
 * already stamped `html[data-sidebar]` by then, and the CSS keys off that
 * attribute — so what the reader SEES is right from the first paint. React
 * reads the same inputs (the stored choice, the viewport) through
 * `useSyncExternalStore`, with the desktop default as the server snapshot, so
 * the hydration render matches the server and the next render adopts the real
 * value — no set-state in a mount effect (R-51). React owns the attribute from
 * the first hydrated render; only the ARIA state is briefly optimistic, for one
 * frame, invisibly.
 */

type SidebarContextValue = {
  /** Is the rail showing? */
  open: boolean;
  /** Below `SIDEBAR_BREAKPOINT` the rail is a drawer over the content. */
  overlay: boolean;
  toggle: () => void;
  /** Close because the reader asked to. Remembered for next time. */
  close: () => void;
  /**
   * Close because the app navigated — H-6 / P-home-9, Stack's answer 10.
   *
   * Deliberately does NOT touch the stored preference. Getting out of the way
   * of the page you just opened is the router's business; whether the rail is
   * up when you arrive at bb2dash is Stack's, and one should never decide the
   * other. (Before this, opening a course from the rail wrote 'closed' and the
   * rail stayed down on every later visit until he re-opened it by hand.)
   */
  closeForNavigation: () => void;
  /** The ☰ button, so the drawer can hand focus back when it dismisses. */
  toggleRef: RefObject<HTMLButtonElement | null>;
};

const SidebarContext = createContext<SidebarContextValue | null>(null);

export function useSidebar(): SidebarContextValue {
  const value = useContext(SidebarContext);
  if (!value) throw new Error('useSidebar must be called inside <SidebarProvider>.');
  return value;
}

/** No viewport on the server; `SIDEBAR_BREAKPOINT` and up is the common case. */
const SSR_WIDE = true;

/** The in-flow rail or the drawer follows the viewport. */
function subscribeToResize(onChange: () => void): () => void {
  window.addEventListener('resize', onChange);
  return () => window.removeEventListener('resize', onChange);
}

function isWideViewport(): boolean {
  return window.innerWidth >= SIDEBAR_BREAKPOINT;
}

function serverWide(): boolean {
  return SSR_WIDE;
}

/** The stored choice is written only by this provider; nothing to subscribe to. */
function subscribeToNothing(): () => void {
  return () => {};
}

function serverStored(): SidebarState | null {
  return null;
}

export function SidebarProvider({ children }: { children: ReactNode }) {
  const hydrated = useHydrated();
  const wide = useSyncExternalStore(subscribeToResize, isWideViewport, serverWide);
  const stored = useSyncExternalStore(subscribeToNothing, readStoredSidebar, serverStored);
  /**
   * What this visit decided, winning over the stored choice: a toggle or a
   * close (both also written down), or a close for navigation (not written).
   * Kept in state too, so a toggle still works where storage throws.
   */
  const [session, setSession] = useState<SidebarState | null>(null);
  const toggleRef = useRef<HTMLButtonElement | null>(null);

  const overlay = !wide;
  // `resolveSidebar` only compares the width with the breakpoint.
  const open = resolveSidebar(session ?? stored, wide ? SIDEBAR_BREAKPOINT : 0) === 'open';

  // React takes the attribute over from the boot script — but not before it has
  // hydrated, or it would overwrite the script with the SSR default and produce
  // exactly the flash the script exists to prevent.
  useEffect(() => {
    if (!hydrated) return;
    document.documentElement.setAttribute('data-sidebar', open ? 'open' : 'closed');
  }, [hydrated, open]);

  const setOpenPersisted = useCallback((next: boolean) => {
    const state: SidebarState = next ? 'open' : 'closed';
    setSession(state);
    writeStoredSidebar(state);
  }, []);

  const toggle = useCallback(() => setOpenPersisted(!open), [open, setOpenPersisted]);
  const close = useCallback(() => setOpenPersisted(false), [setOpenPersisted]);
  /** The same close, minus the memory. See `closeForNavigation` above. */
  const closeForNavigation = useCallback(() => setSession('closed'), []);

  const value = useMemo<SidebarContextValue>(
    () => ({ open, overlay, toggle, close, closeForNavigation, toggleRef }),
    [open, overlay, toggle, close, closeForNavigation],
  );

  return <SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>;
}

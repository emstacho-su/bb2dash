'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import {
  isOverlayWidth,
  readStoredSidebar,
  resolveSidebar,
  writeStoredSidebar,
} from '@/lib/sidebar-preference';

/**
 * The one piece of shell state two distant components share: the ☰ button in
 * the top bar opens the rail that `CourseSidebar` renders below it.
 *
 * Hydration: the server has no viewport and no localStorage, so it renders the
 * desktop default. The inline boot script (see `sidebar-preference.ts`) has
 * already stamped `html[data-sidebar]` by then, and the CSS keys off that
 * attribute — so what the reader SEES is right from the first paint. React
 * adopts the same value in a mount effect and owns the attribute from there;
 * only the ARIA state is briefly optimistic, for one frame, invisibly.
 */

type SidebarContextValue = {
  /** Is the rail showing? */
  open: boolean;
  /** Below `SIDEBAR_BREAKPOINT` the rail is a drawer over the content. */
  overlay: boolean;
  toggle: () => void;
  close: () => void;
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
const SSR_DEFAULT_OPEN = true;

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(SSR_DEFAULT_OPEN);
  const [overlay, setOverlay] = useState(false);
  const [mounted, setMounted] = useState(false);
  const toggleRef = useRef<HTMLButtonElement | null>(null);

  // Adopt the real preference once there is a browser to ask.
  useEffect(() => {
    const width = window.innerWidth;
    setOpen(resolveSidebar(readStoredSidebar(), width) === 'open');
    setOverlay(isOverlayWidth(width));
    setMounted(true);
  }, []);

  // In-flow rail or drawer is a pure function of the viewport.
  useEffect(() => {
    function onResize() {
      setOverlay(isOverlayWidth(window.innerWidth));
    }
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // React takes the attribute over from the boot script — but not before it has
  // adopted the stored value, or it would overwrite the script with the SSR
  // default and produce exactly the flash the script exists to prevent.
  useEffect(() => {
    if (!mounted) return;
    document.documentElement.setAttribute('data-sidebar', open ? 'open' : 'closed');
  }, [mounted, open]);

  const setOpenPersisted = useCallback((next: boolean) => {
    setOpen(next);
    writeStoredSidebar(next ? 'open' : 'closed');
  }, []);

  const toggle = useCallback(() => setOpenPersisted(!open), [open, setOpenPersisted]);
  const close = useCallback(() => setOpenPersisted(false), [setOpenPersisted]);

  const value = useMemo<SidebarContextValue>(
    () => ({ open, overlay, toggle, close, toggleRef }),
    [open, overlay, toggle, close],
  );

  return <SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>;
}

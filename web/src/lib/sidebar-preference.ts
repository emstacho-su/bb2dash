/**
 * Where the course sidebar's open/closed choice lives.
 *
 * Three readers share these rules, so they are kept in one module rather than
 * inlined at each site:
 *   1. the inline boot script (below) — runs before first paint and stamps
 *      `html[data-sidebar]`, which the CSS keys off, so the rail never flashes;
 *   2. `SidebarProvider` — adopts the same value into React state after mount;
 *   3. the tests.
 *
 * localStorage is best-effort on purpose. A blocked-cookies browser, a private
 * window or a full quota all throw on access, and none of those is a reason to
 * fail the page: the viewport default is a correct answer in every one of them.
 * This is the one place in the app where a swallowed error is deliberate.
 */

export const SIDEBAR_STORAGE_KEY = 'bb2dash.sidebar';

/** Above this width the sidebar sits in flow; below it, it is an overlay drawer. */
export const SIDEBAR_BREAKPOINT = 1024;

/** The `id` the rail carries and the ☰ button's `aria-controls` points at. */
export const SIDEBAR_ID = 'course-sidebar';

export type SidebarState = 'open' | 'closed';

function isSidebarState(value: unknown): value is SidebarState {
  return value === 'open' || value === 'closed';
}

/** Open by default on a laptop, closed on a phone. */
export function viewportDefault(width: number): SidebarState {
  return width >= SIDEBAR_BREAKPOINT ? 'open' : 'closed';
}

/** Narrow viewports present the rail as a drawer over the content. */
export function isOverlayWidth(width: number): boolean {
  return width < SIDEBAR_BREAKPOINT;
}

/** The stored choice, or null when there is none, it is junk, or storage throws. */
export function readStoredSidebar(): SidebarState | null {
  try {
    const raw = globalThis.localStorage?.getItem(SIDEBAR_STORAGE_KEY);
    return isSidebarState(raw) ? raw : null;
  } catch {
    return null;
  }
}

/** Remember the choice. Silent no-op where storage is unavailable — see header. */
export function writeStoredSidebar(state: SidebarState): void {
  try {
    globalThis.localStorage?.setItem(SIDEBAR_STORAGE_KEY, state);
  } catch {
    /* storage unavailable; the preference simply does not survive the reload */
  }
}

/** The user's choice wins; without one, the viewport decides. */
export function resolveSidebar(stored: SidebarState | null, width: number): SidebarState {
  return stored ?? viewportDefault(width);
}

/**
 * Stamps `html[data-sidebar]` during HTML parse, before the shell paints.
 * Built from the constants above so the script and the React path can never
 * disagree. No interpolated input — everything in it is a compile-time literal.
 */
export const SIDEBAR_BOOT_SCRIPT = [
  '(function(){try{',
  'var s=null;',
  `try{s=window.localStorage.getItem(${JSON.stringify(SIDEBAR_STORAGE_KEY)});}catch(e){}`,
  `if(s!=='open'&&s!=='closed'){s=window.innerWidth>=${SIDEBAR_BREAKPOINT}?'open':'closed';}`,
  "document.documentElement.setAttribute('data-sidebar',s);",
  '}catch(e){}})();',
].join('');

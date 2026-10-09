/**
 * Where the colour theme's choice lives (Phase 22, task 9; P-76, P-77, P-78).
 *
 * Dark is the default. `html[data-theme]` always holds a resolved value, `light`
 * or `dark`, and `globals.css` has exactly two blocks keyed off it. Three readers
 * share the rules here, as `sidebar-preference.ts` does for the rail:
 *   1. the inline boot script (below), first child of `<body>` in the root layout:
 *      it stamps `html[data-theme]` before first paint and keeps listening to the
 *      system while `auto` is stored;
 *   2. `ThemeMenu`, which stamps and stores on a pick;
 *   3. the tests.
 *
 * STORAGE. `localStorage['bb2dash.theme']` holds `light` or `auto`. Absent, `dark`
 * or junk all mean Dark, also under a light system. The key is written only on an
 * explicit Light or Auto pick; picking Dark removes it. The boot script never
 * writes, so a stray `dark` or junk value stays where it is and reads as Dark.
 * Like `sidebar-preference.ts`, storage is best-effort on purpose: a throwing
 * read means Dark, and a throwing write only means the choice does not survive
 * the reload. This is the second place in the app where a swallowed error is
 * deliberate.
 *
 * AUTO is a stored choice, never what a first visit gets. With `auto` stored the
 * script resolves `matchMedia('(prefers-color-scheme: light)')`. Where `matchMedia`
 * does not exist (jsdom) it resolves dark and does not throw.
 *
 * THE SWITCH HAS NO MOTION. Every control eases its colours, so a switch would
 * ease all of them at once while the page flips. The root carries
 * `data-theme-switching` for two animation frames around a switch and one rule in
 * `globals.css` turns every transition off while it is there. A pick and a
 * system change set it; the boot stamp never does.
 *
 * The two grounds below equal the blocks' `--color-bg` values, pinned by
 * `test/theme-preference.test.ts`. They are the only colour literals this module
 * holds (the token audit's rule A4).
 */

export const THEME_STORAGE_KEY = 'bb2dash.theme';

/** What is stored: Dark is the absence of a key, so it is not a value. */
export type StoredTheme = 'light' | 'auto';

/** What `html[data-theme]` holds. */
export type Theme = 'light' | 'dark';

/** The page's ground in each theme, for `<meta name="theme-color">`. */
export const THEME_BG: Readonly<Record<Theme, string>> = {
  dark: '#050505',
  light: '#f4f4f4',
};

/** `viewport.themeColor`: one value, the dark ground, because a first visit is dark. */
export const THEME_COLOR = THEME_BG.dark;

/** The media query Auto follows. */
export const LIGHT_SYSTEM_QUERY = '(prefers-color-scheme: light)';

/** The root attribute that turns every transition off for two frames. */
export const THEME_SWITCHING_ATTRIBUTE = 'data-theme-switching';

/** How long the switching attribute stays, in animation frames. */
export const THEME_SWITCHING_FRAMES = 2;

function isStoredTheme(value: unknown): value is StoredTheme {
  return value === 'light' || value === 'auto';
}

/**
 * The theme a stored value resolves to. `systemPrefersLight` is null where the
 * system cannot be asked (no `matchMedia`), which reads as dark.
 */
export function resolveTheme(stored: unknown, systemPrefersLight: boolean | null): Theme {
  if (stored === 'light') return 'light';
  if (stored === 'auto' && systemPrefersLight === true) return 'light';
  return 'dark';
}

/** The stored choice, or null when there is none, it is `dark` or junk, or storage throws. */
export function readStoredTheme(): StoredTheme | null {
  try {
    const raw = globalThis.localStorage?.getItem(THEME_STORAGE_KEY);
    return isStoredTheme(raw) ? raw : null;
  } catch {
    return null;
  }
}

/** Remember a Light or Auto pick. Silent no-op where storage is unavailable, see the header. */
export function writeStoredTheme(choice: StoredTheme): void {
  try {
    globalThis.localStorage?.setItem(THEME_STORAGE_KEY, choice);
  } catch {
    /* storage unavailable; the choice simply does not survive the reload */
  }
}

/** Picking Dark removes the key. Silent no-op where storage is unavailable. */
export function clearStoredTheme(): void {
  try {
    globalThis.localStorage?.removeItem(THEME_STORAGE_KEY);
  } catch {
    /* storage unavailable; nothing was stored that could outlive this page */
  }
}

/** Whether the system is light now, or null where `matchMedia` does not exist. */
export function systemPrefersLight(): boolean | null {
  if (typeof globalThis.matchMedia !== 'function') return null;
  try {
    return globalThis.matchMedia(LIGHT_SYSTEM_QUERY).matches;
  } catch {
    return null;
  }
}

/**
 * Stamp a resolved theme on the page: `html[data-theme]` and every
 * `<meta name="theme-color">`. With `switching` the root also carries
 * `data-theme-switching` for two animation frames, so nothing eases through
 * the flip. Called by `ThemeMenu`; the boot script does the same in its own text.
 */
export function stampTheme(theme: Theme, switching: boolean): void {
  const root = document.documentElement;
  if (switching) markSwitching(root);
  root.setAttribute('data-theme', theme);
  for (const meta of document.querySelectorAll('meta[name="theme-color"]')) {
    meta.setAttribute('content', THEME_BG[theme]);
  }
}

function markSwitching(root: HTMLElement): void {
  root.setAttribute(THEME_SWITCHING_ATTRIBUTE, '');
  let frames = THEME_SWITCHING_FRAMES;
  const next = (): void => {
    frames -= 1;
    if (frames <= 0) root.removeAttribute(THEME_SWITCHING_ATTRIBUTE);
    else globalThis.requestAnimationFrame(next);
  };
  globalThis.requestAnimationFrame(next);
}

/**
 * Stamps `html[data-theme]` during HTML parse, before the page paints, and keeps
 * the stamp current while `auto` is stored. Built from the constants above so the
 * script and the React path can never disagree. No interpolated input: everything
 * in it is a compile-time literal.
 *
 * What it does, in order:
 *   - reads the key (a throwing read is "nothing stored"); never writes it;
 *   - resolves: `light` stored is light, `auto` stored follows the system query,
 *     anything else is dark; no `matchMedia` means dark and no throw;
 *   - stamps `data-theme`; when the result is light it also sets every
 *     `theme-color` meta, so a stored Light or Auto keeps its bar colour;
 *   - registers a `change` listener on the query whatever is stored (Auto can be
 *     picked after boot). On a change it reads storage again; with `auto` stored
 *     it sets `data-theme-switching`, re-stamps and re-colours the metas, and
 *     removes the switching attribute two frames later. With anything else it
 *     does nothing;
 *   - keeps every `theme-color` meta on the stamped theme's ground with a
 *     MutationObserver on `<head>`: a client navigation can replace the viewport
 *     meta with a fresh one that holds the server's dark value (R2-3);
 *   - follows another tab: a `storage` event for the key, or for a cleared
 *     storage, re-resolves and re-stamps as a system change does (R2-5).
 */
export const THEME_BOOT_SCRIPT = [
  '(function(){try{',
  `var K=${JSON.stringify(THEME_STORAGE_KEY)},BG=${JSON.stringify(THEME_BG)},A=${JSON.stringify(THEME_SWITCHING_ATTRIBUTE)};`,
  'var d=document,r=d.documentElement,m=null;',
  `try{if(typeof window.matchMedia==='function'){m=window.matchMedia(${JSON.stringify(LIGHT_SYSTEM_QUERY)});}}catch(e){m=null;}`,
  'function stored(){var s=null;try{s=window.localStorage.getItem(K);}catch(e){}return s==="light"||s==="auto"?s:null;}',
  'function resolve(){var s=stored();return s==="light"||(s==="auto"&&m!==null&&m.matches===true)?"light":"dark";}',
  'function metas(t){var l=d.querySelectorAll(\'meta[name="theme-color"]\');for(var i=0;i<l.length;i++){l[i].setAttribute("content",BG[t]);}}',
  `function frames(n,f){if(typeof window.requestAnimationFrame==='function'){window.requestAnimationFrame(function(){if(n<=1){f();}else{frames(n-1,f);}});}else{f();}}`,
  'var t=resolve();',
  'r.setAttribute("data-theme",t);',
  'if(t==="light"){metas(t);}',
  // A client navigation can replace the viewport meta (R2-3): keep every theme-color meta on the
  // stamped theme's ground. Setting a content that is already right changes nothing, so this ends.
  'function sync(){var c=r.getAttribute("data-theme");if(c!=="light"&&c!=="dark"){return;}var l=d.querySelectorAll(\'meta[name="theme-color"]\');for(var i=0;i<l.length;i++){if(l[i].getAttribute("content")!==BG[c]){l[i].setAttribute("content",BG[c]);}}}',
  'try{if(typeof window.MutationObserver==="function"&&d.head){new window.MutationObserver(sync).observe(d.head,{childList:true,subtree:true,attributes:true,attributeFilter:["content","name"]});}}catch(e){}',
  // Re-resolve, re-stamp and mark the switch for two frames: a system change and another tab's pick.
  'function apply(){var u=resolve();r.setAttribute(A,"");r.setAttribute("data-theme",u);metas(u);frames(' + THEME_SWITCHING_FRAMES + ',function(){r.removeAttribute(A);});}',
  'if(m!==null){',
  'var on=function(){if(stored()!=="auto"){return;}apply();};',
  'if(typeof m.addEventListener==="function"){m.addEventListener("change",on);}else if(typeof m.addListener==="function"){m.addListener(on);}',
  '}',
  // Another tab's pick (R2-5): the storage event fires for the key, or for a cleared storage (key null).
  'try{window.addEventListener("storage",function(e){if(e.key!==null&&e.key!==K){return;}apply();});}catch(e){}',
  '}catch(e){}})();',
].join('');

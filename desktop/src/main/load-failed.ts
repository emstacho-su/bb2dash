/**
 * The page a window shows when the app cannot be loaded (Phase 22, task 27; D-1, entry
 * `desktop-shell-details`).
 *
 * On `main` a failed load left a blank window. Now the window shows a dark page in direction D with
 * one sentence and one Retry link to the app's address. It has a drag strip (the window's title bar
 * is the app's bar, so a page with no bar must give the mouse the same handle), a CSP of
 * `default-src 'none'` with inline style only, and no script.
 *
 * It is shown only from `did-fail-load`, only for the main frame, and never for an aborted load.
 * Chromium aborts a load whenever something supersedes it (the app's own redirect included), and
 * `deeplink.ts` already treats code -3 as benign (`isBenignLoadFailure`): without this rule the page
 * could replace one that did load, when a toast click loads a route over a live window or a
 * navigation is stopped. The rule is `showsLoadFailed`.
 *
 * Every hex below is a value the dark block of `web/src/app/globals.css` declares
 * (`test/unit/shell-pages.test.ts`), and none is the one red. The CSP allows no web font, so the page
 * keeps the system face. No Electron import: the test loads this as plain Node.
 */

/** Chromium's code for an aborted load (`ERR_ABORTED`). It is not a failed load. */
const ERR_ABORTED = -3;

/** Whether a `did-fail-load` should put the failed-load page up. */
export function showsLoadFailed(errorCode: number, isMainFrame: boolean): boolean {
  return isMainFrame && errorCode !== ERR_ABORTED;
}

function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** The whole page. The only thing in it that comes from outside this file is the app's address. */
export function failedLoadHtml(appUrl: string): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
<title>bb2dash</title>
<style>
  :root { color-scheme: dark; }
  html, body { height: 100%; margin: 0; }
  body { display: grid; place-items: center; background: #050505; color: #f2f2f2;
         font: 15px/1.55 "Segoe UI", system-ui, sans-serif; }
  .drag { position: fixed; top: 0; left: 0; right: 0; height: env(titlebar-area-height, 0px);
          -webkit-app-region: drag; app-region: drag; }
  main { box-sizing: border-box; max-width: 420px; margin: 24px; padding: 24px; text-align: center;
         background: #1d1d1d; border-radius: 6px; box-shadow: 0 0 0 1px #6b6b6b; }
  p { margin: 0 0 18px; color: #e6e6e6; }
  a { display: inline-block; padding: 7px 18px; border-radius: 999px; text-decoration: none;
      font-weight: 600; background: #fafafa; color: #050505; }
  a:hover { background: #e6e6e6; }
  a:focus-visible { outline: 2px solid #fafafa; outline-offset: 2px; }
</style></head>
<body>
  <div class="drag"></div>
  <main>
    <p>bb2dash could not reach the app, so check the connection and try again.</p>
    <a href="${escapeAttribute(appUrl)}">Retry</a>
  </main>
</body></html>`;
}

/** The `data:` URL the window loads the page from. */
export function failedLoadDataUrl(appUrl: string): string {
  return `data:text/html;charset=utf-8,${encodeURIComponent(failedLoadHtml(appUrl))}`;
}

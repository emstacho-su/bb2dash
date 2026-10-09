/**
 * The *Update now / Update later* prompt (2026-09-30).
 *
 * A small app-owned window over the main one — not a native message box, so it never
 * blocks the main process and it looks like bb2dash. The page is a fixed `data:` URL with a
 * CSP that allows nothing from outside; it has no preload and no IPC. It reports Stack's
 * answer by setting `document.title` to `bb2dash-update:<answer>`, which main reads from
 * `page-title-updated` and checks against a four-item allowlist.
 *
 * `update-flow.ts` never calls this under the test env var.
 */

import { BrowserWindow } from 'electron';

import type { PromptAnswer } from '../core/update/update-flow';
import { isRemindLaterChoice } from '../core/update/update-check';
import { DARK } from './window-background';

export const PROMPT_TITLE_PREFIX = 'bb2dash-update:';
const PROMPT_SIZE = Object.freeze({ width: 460, height: 250 });
// The dark ground, whatever the theme: the prompt is a dark page (D-1). Its other colours are
// values the dark block of globals.css declares (`test/unit/shell-pages.test.ts`). It keeps the
// system face: its CSP allows no web font.
const PROMPT_BACKGROUND = DARK;

/** The answer a page title carries, or `null` for any title that is not one. */
export function parsePromptTitle(title: string): Exclude<PromptAnswer, 'dismissed'> | null {
  if (!title.startsWith(PROMPT_TITLE_PREFIX)) return null;
  const answer = title.slice(PROMPT_TITLE_PREFIX.length);
  if (answer === 'update-now') return answer;
  return isRemindLaterChoice(answer) ? answer : null;
}

/** The whole page. Fixed text: nothing in it comes from outside this file. */
export function promptHtml(): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'">
<title>bb2dash update</title>
<style>
  :root { color-scheme: dark; }
  body { margin: 0; padding: 22px 24px; background: ${PROMPT_BACKGROUND}; color: #f2f2f2;
         font: 14px/1.45 "Segoe UI", system-ui, sans-serif; }
  h1 { font-size: 16px; font-weight: 600; margin: 0 0 6px; }
  p { margin: 0 0 18px; color: #a3a3a3; }
  .row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
  .label { color: #a3a3a3; margin-right: 4px; }
  button { font: inherit; padding: 7px 16px; border-radius: 999px; cursor: pointer;
           border: 1px solid #969696; background: #262626; color: #f2f2f2; }
  button:hover { background: #3a3a3a; }
  button:focus-visible { outline: 2px solid #fafafa; outline-offset: 2px; }
  button.primary { background: #fafafa; border-color: #fafafa; color: #050505; font-weight: 600; }
  button.primary:hover { background: #e6e6e6; border-color: #e6e6e6; }
  [hidden] { display: none !important; }
</style></head>
<body>
  <h1>A new version of bb2dash is ready</h1>
  <p>Update now closes bb2dash and opens it again on the new build. It takes a few seconds.</p>
  <div class="row" id="choose">
    <button class="primary" data-answer="update-now" autofocus>Update now</button>
    <button id="later">Update later</button>
  </div>
  <div class="row" id="when" hidden>
    <span class="label">Remind me</span>
    <button data-answer="one-hour">In 1 hour</button>
    <button data-answer="four-hours">In 4 hours</button>
    <button data-answer="tomorrow">Tomorrow</button>
  </div>
  <script>
    document.getElementById('later').addEventListener('click', function () {
      document.getElementById('choose').hidden = true;
      document.getElementById('when').hidden = false;
    });
    document.querySelectorAll('[data-answer]').forEach(function (button) {
      button.addEventListener('click', function () {
        document.title = '${PROMPT_TITLE_PREFIX}' + button.getAttribute('data-answer');
      });
    });
  </script>
</body></html>`;
}

/**
 * Show the prompt over `parent` (or on its own) and resolve with the answer; closing the
 * prompt without answering resolves `'dismissed'`. Never rejects.
 */
export function showUpdatePrompt(parent: BrowserWindow | null): Promise<PromptAnswer> {
  return new Promise((resolve) => {
    let settled = false;
    const settle = (answer: PromptAnswer): void => {
      if (settled) return;
      settled = true;
      resolve(answer);
    };

    const prompt = new BrowserWindow({
      ...PROMPT_SIZE,
      ...(parent !== null && !parent.isDestroyed() ? { parent } : {}),
      title: 'bb2dash update',
      show: false,
      resizable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      autoHideMenuBar: true,
      backgroundColor: PROMPT_BACKGROUND,
      webPreferences: {
        // Its own in-memory partition: the prompt never sees the app's cookies.
        partition: 'bb2dash-update-prompt',
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        webSecurity: true,
        spellcheck: false,
      },
    });

    prompt.webContents.on('will-navigate', (event) => event.preventDefault());
    prompt.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    prompt.on('page-title-updated', (event, title) => {
      event.preventDefault();
      const answer = parsePromptTitle(title);
      if (answer === null) return;
      settle(answer);
      if (!prompt.isDestroyed()) prompt.close();
    });
    prompt.on('closed', () => settle('dismissed'));
    prompt.once('ready-to-show', () => prompt.show());

    prompt.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(promptHtml())}`).catch(() => {
      // A page that will not load is a prompt nobody can answer: close it, which settles.
      if (!prompt.isDestroyed()) prompt.close();
    });
  });
}

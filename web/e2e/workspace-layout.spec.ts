/**
 * The Workspace message column, laid out by a browser (Phase 21; the PM's walk
 * of 2026-10-07, W-1).
 *
 * NOT A WALK. This spec opens no host, needs no saved session and reads no
 * data, so it runs anywhere the harness's Chromium is installed:
 *
 *   npx playwright test -c e2e/playwright.config.ts workspace-layout
 *
 * It is a static page: the column's own markup (`MessageList.tsx`: column,
 * turns, turn, then a question and an answer, each with its `.sr-only` label
 * first) under the two stylesheets as they are written, `src/app/globals.css`
 * for `.sr-only` and `MessageList.module.css` for the column. A CSS Module's
 * build only renames its classes, so the source names are used as they stand.
 * The other specs drive the built app from the outside; this one reads those
 * two files, and nothing else under `src/`.
 *
 * WHAT IT MEASURES is what jsdom cannot. A `.sr-only` label is an absolute
 * box, and a box that scrolls clips and moves only what it contains. While the
 * column was not positioned its labels were the page's: with a long
 * conversation the document grew as tall as the column's whole content, the
 * window got a scrollbar, and a wheel turn outside the column scrolled into
 * nothing. `test/Workspace.layout.test.tsx` holds the same rule on the
 * stylesheets and on the mounted screen, in every unit run.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

// No saved session: the config's `storageState` file need not exist for this spec.
test.use({ storageState: { cookies: [], origins: [] } });

/** `__dirname`: this package is CommonJS (see playwright.config.ts). */
const SRC = join(__dirname, '..', 'src');
const STYLESHEETS = ['app/globals.css', 'components/workspace/MessageList.module.css'];

/** Enough turns, each long enough, to be several windows tall. */
const TURNS = 6;
const LINES_PER_ANSWER = 24;

/** A label's own `margin: -1px`, and a pixel of rounding. */
const LABEL_SLACK_PX = 2;

function turnMarkup(index: number): string {
  const answer = Array.from(
    { length: LINES_PER_ANSWER },
    (_, line) => `Line ${line + 1} of answer ${index + 1}: the reading and the quiz for the week.`,
  ).join('\n');
  return `
    <li class="turn" data-turn="done" data-request-id="${index + 1}">
      <div class="question">
        <span class="sr-only">You asked</span>
        <p class="text">Question ${index + 1}: what is due this week?</p>
      </div>
      <div class="answer">
        <span class="sr-only">The assistant answered</span>
        <p class="text" data-answer-text>${answer}</p>
        <p class="used" data-used>Used: search_materials · IST.323</p>
      </div>
    </li>`;
}

function pageMarkup(): string {
  const css = STYLESHEETS.map((file) => readFileSync(join(SRC, file), 'utf8')).join('\n');
  const turns = Array.from({ length: TURNS }, (_, index) => turnMarkup(index)).join('');
  return `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><title>The message column</title><style>${css}</style></head>
  <body>
    <div class="column" data-column><ol class="turns" aria-label="Messages">${turns}</ol></div>
  </body>
</html>`;
}

async function openColumn(page: Page): Promise<void> {
  // globals.css imports a web font. Nothing here may reach the network.
  await page.route('**/*', (route) => route.abort());
  await page.setContent(pageMarkup(), { waitUntil: 'load' });
}

test('a long conversation does not make the page taller than its window', async ({ page }) => {
  await openColumn(page);

  const measured = await page.evaluate(() => {
    const column = document.querySelector('[data-column]');
    if (column === null) throw new Error('no column');
    return {
      windowHeight: window.innerHeight,
      documentHeight: document.documentElement.scrollHeight,
      columnHeight: column.clientHeight,
      contentHeight: column.scrollHeight,
      labels: column.querySelectorAll('.sr-only').length,
    };
  });

  // The conversation is several windows tall, and scrolls inside the column.
  expect(measured.labels).toBe(TURNS * 2);
  expect(measured.contentHeight).toBeGreaterThan(measured.windowHeight * 2);
  expect(measured.columnHeight).toBeLessThan(measured.windowHeight);
  // The page itself has nothing to scroll.
  expect(measured.documentHeight).toBe(measured.windowHeight);
});

test('a screen-reader label is contained by the column, and scrolls with what it names', async ({ page }) => {
  await openColumn(page);

  const measured = await page.evaluate(() => {
    const column = document.querySelector('[data-column]');
    if (column === null) throw new Error('no column');
    const labels = [...column.querySelectorAll<HTMLElement>('.sr-only')];
    /** The furthest any label sits from the top of the question or answer it is the first child of. */
    const furthestFromItsBox = () =>
      Math.max(
        ...labels.map((label) => {
          const named = label.parentElement;
          if (named === null) throw new Error('a label with no parent');
          return Math.abs(label.getBoundingClientRect().top - named.getBoundingClientRect().top);
        }),
      );

    const atTheTop = furthestFromItsBox();
    column.scrollTop = column.scrollHeight;
    return {
      containedByColumn: labels.every((label) => label.offsetParent === column),
      scrolledBy: Math.round(column.scrollTop),
      atTheTop: Math.round(atTheTop),
      atTheEnd: Math.round(furthestFromItsBox()),
    };
  });

  expect(measured.containedByColumn).toBe(true);
  expect(measured.scrolledBy).toBeGreaterThan(0);
  expect(measured.atTheTop).toBeLessThanOrEqual(LABEL_SLACK_PX);
  expect(measured.atTheEnd).toBeLessThanOrEqual(LABEL_SLACK_PX);
});

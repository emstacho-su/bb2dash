/**
 * The acceptance run's helpers that read the page, driven by a real browser
 * against a still copy of the Workspace (`accept.lib.ts`; acceptance/README.md
 * at the root).
 *
 * NOT AN ACCEPTANCE TEST, AND NOT A WALK. The acceptance tests themselves
 * (`accept<NN>.spec.ts`) each spend a live question and run only inside an
 * acceptance run, so nothing else ever executes the code they share. This spec
 * does: it opens no host, needs no saved session and asks nothing, so it runs
 * anywhere the harness's Chromium is installed:
 *
 *   npx playwright test -c e2e/playwright.config.ts workspace-acceptance-helpers
 *
 * The page is the message column's own markup (`MessageList.tsx`) and the
 * conversation list's (`ConversationList.tsx`), under the two stylesheets as
 * they are written, the way `workspace-layout.spec.ts` builds its page. What a
 * recorder writes here goes into a temporary folder that is removed again.
 *
 * WHAT IT HOLDS: a turn is read whole and at one moment; a long turn's two
 * shots are each the size of the window, its end with the "Used:" line and its
 * start with the badge; a recorder takes only the shots its step declares;
 * streaming is seen, or the turn closing first; a reloaded page is held to
 * "Answering…" with no half-written text; and a row is found by its
 * conversation or by its exact title.
 */

import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import {
  LATE_STREAM_LINE,
  Recorder,
  conversationsOfRows,
  expectAnswered,
  expectShotsShowTheTurn,
  readTurn,
  rowOfConversation,
  rowsTitled,
  shootTurn,
  turnFacts,
  turnOfRequest,
  waitClosed,
  waitStreaming,
  watchAnswering,
} from './accept.lib';
import { BADGE_HIGH, BADGE_LOW, QUEUED_LINE, SPIKE_TITLE, UNARCHIVE_LABEL, VIEWPORT, lastTurn, listedTitles } from './walk21.lib';
import { pngSize } from './walk21.window';

// No saved session: the config's `storageState` file need not exist for this spec.
test.use({ storageState: { cookies: [], origins: [] } });

/** `__dirname`: this package is CommonJS (see playwright.config.ts). */
const SRC = join(__dirname, '..', 'src');
const STYLESHEETS = ['app/globals.css', 'components/workspace/MessageList.module.css'];

/** Six turns; the last is far taller than the column, so its start and its end are never on screen together. */
const TURNS = 6;
const SHORT_ANSWER_LINES = 12;
const LONG_ANSWER_LINES = 60;
const FIRST_REQUEST = 400;
const LAST_REQUEST = FIRST_REQUEST + TURNS - 1;
const LAST_QUESTION = `Question ${TURNS}: what is due this week?`;
const USED_LINE = 'Used: search_materials · a-course';

const CONVERSATION = '0b6f7c1e-2d3a-4b5c-8d9e-0f1a2b3c4d5e';
const OTHER = '9a8b7c6d-5e4f-4a3b-9c2d-1e0f9a8b7c6d';
const SPIKE = '11111111-2222-4333-8444-555555555555';

function turnMarkup(index: number): string {
  const lines = index === TURNS - 1 ? LONG_ANSWER_LINES : SHORT_ANSWER_LINES;
  const answer = Array.from({ length: lines }, (_, line) => `Line ${line + 1} of answer ${index + 1}: see handbook.pdf for the week.`).join('\n');
  return `
    <li class="turn" data-turn="done" data-request-id="${FIRST_REQUEST + index}">
      <div class="question"><span class="sr-only">You asked</span><p class="text">Question ${index + 1}: what is due this week?</p></div>
      <div class="answer">
        <span class="sr-only">The assistant answered</span>
        <span data-tier="low">${BADGE_LOW}</span>
        <p class="text" data-answer-text>${answer}</p>
        <p class="used" data-used>${USED_LINE}</p>
      </div>
    </li>`;
}

function rowMarkup(id: string, title: string): string {
  return `<li><a href="/workspace?c=${id}"><span>${title}</span><span data-last-activity>2h ago</span></a><button type="button">Archive</button></li>`;
}

function pageMarkup(): string {
  const css = STYLESHEETS.map((file) => readFileSync(join(SRC, file), 'utf8')).join('\n');
  const turns = Array.from({ length: TURNS }, (_, index) => turnMarkup(index)).join('');
  const rows = [rowMarkup(CONVERSATION, 'What is due this week?'), rowMarkup(SPIKE, SPIKE_TITLE), rowMarkup(OTHER, `${SPIKE_TITLE} of another kind`)].join('');
  return `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><title>The Workspace, still</title><style>${css} body { margin: 0; }</style></head>
  <body>
    <nav aria-label="Conversations"><ul>${rows}</ul></nav>
    <h1>Workspace</h1>
    <div data-workspace-stream data-channel="joined"><div class="column"><ol class="turns" aria-label="Messages">${turns}</ol></div></div>
  </body>
</html>`;
}

/** The still page, with the reader at the end of the conversation, where the page leaves one after an answer. */
async function openStill(page: Page): Promise<void> {
  // globals.css imports a web font. Nothing here may reach the network.
  await page.route('**/*', (route) => route.abort());
  await page.setContent(pageMarkup(), { waitUntil: 'load' });
  await page.locator('[data-workspace-stream] > div').evaluate((box) => {
    box.scrollTop = box.scrollHeight;
  });
}

/** Rewrites the last turn after a delay, as a poll or a broadcast would. */
async function later(page: Page, ms: number, state: string, answer: string): Promise<void> {
  await page.evaluate(
    ({ wait, to, html }) => {
      setTimeout(() => {
        const item = document.querySelector('li[data-turn]:last-child');
        if (item === null) return;
        item.setAttribute('data-turn', to);
        const box = item.querySelector('.answer');
        if (box !== null) box.innerHTML = html;
      }, wait);
    },
    { wait: ms, to: state, html: answer },
  );
}

const badge = `<span data-tier="high">${BADGE_HIGH}</span>`;
const waiting = `<p data-turn-line>${QUEUED_LINE}</p>`;
const answering = `${badge}<p data-turn-line>${LATE_STREAM_LINE}</p>`;
const text = (words: string) => `${badge}<p data-answer-text>${words}</p>`;

let outDir = '';

test.beforeEach(() => {
  outDir = mkdtempSync(join(tmpdir(), 'bb2dash-accept-helpers-'));
});

test.afterEach(() => {
  rmSync(outDir, { recursive: true, force: true });
});

test('a turn is read whole, and its facts hold what a playbook reads', async ({ page }) => {
  await openStill(page);
  const turn = turnOfRequest(page, LAST_REQUEST);
  const reading = await readTurn(turn);
  expect(reading).toMatchObject({ state: 'done', requestId: LAST_REQUEST, badge: BADGE_LOW, used: USED_LINE, line: null });
  expect(reading.answer.startsWith(`Line 1 of answer ${TURNS}`)).toBe(true);
  const facts = turnFacts(reading);
  expect(facts).toMatchObject({ state: 'done', badge: BADGE_LOW, used: USED_LINE, line: null, names_file: true });
  expect(facts['answer_chars']).toBe(Array.from(reading.answer).length);
  await expectAnswered(turn, { badge: BADGE_LOW, usedTools: ['search_materials'] });
  expect(await waitClosed(turn)).toMatch(/^\d{4}-\d\d-\d\dT/);
});

test('a long turn gets two shots the size of the window: its end with the "Used:" line, its start with the badge', async ({ page }) => {
  await openStill(page);
  const rec = new Recorder('6 standard sonnet', ['start', 'end'], outDir);
  const turn = lastTurn(page);
  const tallerThanColumn = await turn.evaluate((item) => item.getBoundingClientRect().height > (item.closest('.column')?.clientHeight ?? Infinity));
  expect(tallerThanColumn, 'the turn does not fit the column, so one shot cannot show both ends').toBe(true);

  const shots = await shootTurn(page, rec, turn, LAST_QUESTION);
  expect(shots).toEqual({ usedLineInView: true, questionInView: true, badgeInView: true });
  await expectShotsShowTheTurn(turn, LAST_QUESTION, shots);
  rec.expectEveryShotTaken();
  rec.note({ ...turnFacts(await readTurn(turn)), request_id: LAST_REQUEST, conversation_id: CONVERSATION });
  rec.save();

  for (const name of ['6-start.png', '6-end.png']) expect(pngSize(join(outDir, name)), name).toEqual(VIEWPORT);
  const saved = JSON.parse(readFileSync(join(outDir, '6.json'), 'utf8')) as Record<string, unknown>;
  expect(saved).toMatchObject({ schema: 1, step: '6', title: '6 standard sonnet', request_id: LAST_REQUEST, conversation_id: CONVERSATION, state: 'done' });
  expect(saved['shots']).toEqual(['6-end.png', '6-start.png']);
  expect(saved['end_shot']).toEqual({ used_line_in_view: true });
  expect(saved['start_shot']).toEqual({ question_in_view: true, badge_in_view: true });
});

test('a recorder takes only the shots its step declares, and a step that missed one does not pass', async ({ page }) => {
  await openStill(page);
  const rec = new Recorder('8 stopped', ['stopped'], outDir);
  await expect(rec.shot(page, 'start')).rejects.toThrow(/declares no shot labelled "start"/);
  expect(() => rec.expectEveryShotTaken()).toThrow();
  await rec.shot(page, 'stopped');
  rec.expectEveryShotTaken();
  // A failure leaves the window as it stood, beside the facts.
  await rec.failShot(page);
  rec.save();
  expect(existsSync(join(outDir, '8-fail.png'))).toBe(true);
  expect(JSON.parse(readFileSync(join(outDir, '8.json'), 'utf8'))).toMatchObject({ fail_shot: '8-fail.png', shots: ['8-stopped.png'] });
});

test('streaming is seen once enough text is being written, and not when the turn closes first', async ({ page }) => {
  await openStill(page);
  const turn = lastTurn(page);
  await later(page, 0, 'queued', waiting);
  await later(page, 400, 'streaming', text('short'));
  await later(page, 900, 'streaming', text('a longer run of answer text. '.repeat(3)));
  expect(await waitStreaming(page, turn)).toBe(true);
  expect((await readTurn(turn)).state).toBe('streaming');

  await later(page, 0, 'queued', waiting);
  await later(page, 500, 'done', text('The whole answer, at once.'));
  expect(await waitStreaming(page, turn)).toBe(false);
});

test('a reloaded page is watched until the answer is finished: the line stands, and half-written text fails at once', async ({ page }) => {
  await openStill(page);
  const turn = lastTurn(page);
  await later(page, 0, 'streaming', answering);
  await later(page, 1200, 'done', text('The finished answer.'));
  await expect(turn).toHaveAttribute('data-turn', 'streaming');
  const watch = await watchAnswering(page, turn);
  expect(watch.endedAs).toBe('done');
  expect(watch.looks).toBeGreaterThanOrEqual(2);
  expect((await readTurn(turn)).answer).toBe('The finished answer.');

  await later(page, 0, 'streaming', answering);
  await later(page, 600, 'streaming', text('half of an ans'));
  await expect(turn.locator('[data-turn-line]')).toHaveText(LATE_STREAM_LINE);
  await expect(watchAnswering(page, turn)).rejects.toThrow(/says so|no half-written text/);
});

test("a row of the list is found by its conversation, or by its exact title", async ({ page }) => {
  await openStill(page);
  expect(await listedTitles(page)).toEqual(['What is due this week?', SPIKE_TITLE, `${SPIKE_TITLE} of another kind`]);
  await expect(rowOfConversation(page, CONVERSATION)).toHaveCount(1);
  await expect(rowOfConversation(page, CONVERSATION).getByRole('button', { name: 'Archive', exact: true })).toHaveCount(1);
  // The exact title only: a longer title that starts with the same word is another conversation.
  const spikes = rowsTitled(page, SPIKE_TITLE);
  await expect(spikes).toHaveCount(1);
  expect(await conversationsOfRows(spikes)).toEqual([SPIKE]);
  await expect(spikes.filter({ has: page.getByRole('button', { name: UNARCHIVE_LABEL, exact: true }) })).toHaveCount(0);
  await expect(rowsTitled(page, 'what is due')).toHaveCount(0);
});

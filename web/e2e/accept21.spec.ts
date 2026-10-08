/**
 * Phase 21's acceptance tests: the Workspace on the live site (brief 102,
 * "Stack's acceptance script"; the pack is `acceptance/21/` at the root).
 *
 * THESE RUN ONLY INSIDE AN ACCEPTANCE RUN. Without `ACCEPT=1` every test here
 * is skipped where it is declared; with it, the one test whose exact title is
 * `ACCEPT_ONLY` runs. The Claude operator in the sandbox starts them one at a
 * time, in the order they stand here, and reads what each leaves in
 * `ACCEPT_OUT` (`accept.lib.ts` says what that is).
 *
 * A title starts with the step of the acceptance script it is. Three stages run
 * them, with the host's own steps in between (`acceptance/21/manifest.json`):
 *
 * * `walk`: `2 open`, the five questions `3` to `7`, `8 stopped` and
 *   `9 reload mid-answer`. `3 lookup haiku` starts the run's one conversation;
 *   every test after it asks into that conversation.
 * * `offline`, run right after the host stops the Workspace service:
 *   `14a offline`. The page must say the service is offline before
 *   `ACCEPT_DEADLINE` (three minutes after the stop); a question asked then
 *   waits.
 * * `back`, run after the host has started the service again: `14b back` (the
 *   question that waited is answered) and `15 archive`.
 *
 * Most of them spend a question of Stack's Claude plan, three of them on Opus.
 * None is retried by Playwright; a second run is the operator's call.
 *
 * The questions are the brief's, word for word (`walk21.lib.ts`). An answer's
 * text goes into the step's facts file and is never printed.
 *
 * Each test records first and asserts afterwards, so a step that fails still
 * leaves what the page showed. An assertion is never relaxed to fit the screen.
 */

import { expect, type Locator, type Page } from '@playwright/test';
import {
  BADGE_HIGH,
  BADGE_LOW,
  BADGE_MID,
  COLUMN_START_LINE,
  MINUTE_MS,
  OFFLINE_LINE,
  QUESTION_DECISION,
  QUESTION_DEEP,
  QUESTION_DOCUMENT,
  QUESTION_LOOKUP,
  QUESTION_STANDARD,
  QUEUED_LINE,
  SETTLE_MS,
  SHOW_ARCHIVED_LABEL,
  SPIKE_TITLE,
  STOPPED_SENTENCE,
  STORED_SETTLE_MS,
  UNARCHIVE_LABEL,
  conversationList,
  conversationPath,
  expectUncovered,
  inColumnBox,
  listedTitles,
  openSettled,
  textOrNull,
  utcNow,
  workspaceReady,
} from './walk21.lib';
import {
  LATE_STREAM_LINE,
  acceptStep,
  allowArchive,
  askAndRecord,
  askHere,
  askInto,
  carriedRequest,
  conversationOfStep,
  conversationOfStepOrNull,
  conversationShown,
  conversationsOfRows,
  expectAnswered,
  expectShotsShowTheTurn,
  readTurn,
  registerAcceptHooks,
  rowOfConversation,
  rowsTitled,
  shootTurn,
  stageDeadlineMs,
  turnFacts,
  turnOfRequest,
  waitClosed,
  waitStreaming,
  watchAnswering,
} from './accept.lib';
import { expectDocumentFitsWindow } from './walk21.window';

registerAcceptHooks();

/** The step whose question starts the run's one conversation. */
const FIRST_QUESTION_STEP = '3';
/** The step that asks while the service is stopped. */
const OFFLINE_STEP = '14a';

/** The words step 9 fails with when the answer was over before the page could be reloaded mid-answer. */
const FINISHED_BEFORE_RELOAD = 'inconclusive: the answer finished before the reload';
/** And when it was over between the first look at the reloaded page and its picture. */
const FINISHED_WHILE_RECORDED = 'inconclusive: the answer finished while the reloaded page was being recorded';
/** The stored row follows a closed request within one read; a minute covers a missed broadcast and a poll. */
const STORED_ROW_TIMEOUT_MS = MINUTE_MS;
/**
 * How long a question asked into a stopped service is watched: three reads of its rows. The
 * manifest's `min_wait_s` for step 14b is these 15 seconds: the host's proof asks that the
 * service took the question no sooner than that after it was asked.
 */
const QUEUED_HOLD_MS = 15_000;

const iso = (ms: number): string => new Date(ms).toISOString();

/* ---------------------------------------------------------------------------
 * Stage `walk`
 * ------------------------------------------------------------------------ */

// Step 2: the Workspace is opened from the top bar, as a reader does. The list may hold anything.
acceptStep('2 open', { shots: ['open'] }, async ({ page }, rec) => {
  await openSettled(page, '/');
  const link = page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Workspace', exact: true });
  await link.click();
  await expect(page).toHaveURL(/\/workspace$/);
  await page.waitForLoadState('load');
  await page.waitForTimeout(SETTLE_MS);
  await workspaceReady(page);

  const list = conversationList(page);
  const offline = page.locator('[data-workspace-offline]');
  const titles = await listedTitles(page);
  rec.note({
    path: new URL(page.url()).pathname,
    channel: await page.locator('[data-workspace-stream]').getAttribute('data-channel'),
    listed_count: titles.length,
    spike_listed: titles.includes(SPIKE_TITLE),
    offline_line_shown: (await offline.count()) > 0,
  });
  await rec.shot(page, 'open');

  await expect(link).toHaveAttribute('aria-current', 'page');
  await expect(list).toBeVisible();
  // No conversation is selected: an empty column that says how to start one, and the Ask button.
  await expect(page.locator('li[data-turn]')).toHaveCount(0);
  await expect(page.locator('[data-column-empty="start"]')).toHaveText(COLUMN_START_LINE);
  await expect(page.getByRole('button', { name: 'Ask', exact: true })).toBeVisible();
  await expect(offline, 'the service is answering: the page does not call it offline').toHaveCount(0);
});

// Step 3 starts the run's conversation. Whether the answer names the file it read is the operator's to judge.
acceptStep('3 lookup haiku', { shots: ['start', 'end'] }, async ({ page }, rec) => {
  await askAndRecord(page, rec, { conversation: null, question: QUESTION_LOOKUP, badge: BADGE_LOW, usedTools: ['search_materials'] });
});

acceptStep('4 decision haiku', { shots: ['start', 'end'] }, async ({ page }, rec) => {
  await askAndRecord(page, rec, {
    conversation: conversationOfStep(FIRST_QUESTION_STEP),
    question: QUESTION_DECISION,
    badge: BADGE_LOW,
    usedTools: ['search_context · bb2dash-inbox-decisions'],
  });
});

acceptStep('5 document haiku', { shots: ['start', 'end'] }, async ({ page }, rec) => {
  await askAndRecord(page, rec, {
    conversation: conversationOfStep(FIRST_QUESTION_STEP),
    question: QUESTION_DOCUMENT,
    badge: BADGE_LOW,
    usedTools: ['get_material_text'],
  });
});

acceptStep('6 standard sonnet', { shots: ['start', 'end'] }, async ({ page }, rec) => {
  await askAndRecord(page, rec, {
    conversation: conversationOfStep(FIRST_QUESTION_STEP),
    question: QUESTION_STANDARD,
    badge: BADGE_MID,
    usedTools: [],
  });
});

acceptStep('7 deep opus', { shots: ['start', 'end'] }, async ({ page }, rec) => {
  await askAndRecord(page, rec, {
    conversation: conversationOfStep(FIRST_QUESTION_STEP),
    question: QUESTION_DEEP,
    badge: BADGE_HIGH,
    usedTools: [],
  });
});

// Step 8: the Opus question again, and Stop pressed while its answer is being written.
acceptStep('8 stopped', { shots: ['stopped'] }, async ({ page }, rec) => {
  const turn = await askInto(page, rec, conversationOfStep(FIRST_QUESTION_STEP), QUESTION_DEEP);
  if (!(await waitStreaming(page, turn))) throw new Error('inconclusive: the answer finished before Stop could be pressed');
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  rec.note({ stop_pressed_at: utcNow() });

  const text = turn.locator('[data-answer-text]');
  const line = turn.locator('[data-turn-line]');
  await expect(turn).toHaveAttribute('data-turn', 'stopped');
  await expect(line).toHaveText(STOPPED_SENTENCE);
  const lineAt = await inColumnBox(line);
  rec.note({ ...turnFacts(await readTurn(turn)), stopped_sentence_in_view: lineAt.inside });
  // The window as it is: nothing is scrolled.
  await rec.shot(page, 'stopped');

  await expect(text).not.toBeEmpty();
  await expect(page.getByRole('button', { name: 'Ask', exact: true })).toBeVisible();
  expect(lineAt.inside, "the stopped sentence is wholly inside the column's visible box").toBe(true);
  await expectUncovered(line);
  await expectDocumentFitsWindow(page, '8 stopped');
  // The runner's stored row then replaces the live text: the turn stays stopped, under its badge.
  await page.waitForTimeout(STORED_SETTLE_MS);
  rec.note(turnFacts(await readTurn(turn)));
  await expect(turn).toHaveAttribute('data-turn', 'stopped');
  await expect(line).toHaveText(STOPPED_SENTENCE);
  await expect(turn.locator('[data-tier]')).toHaveText(BADGE_HIGH);
});

/** After the reload: the conversation is shown again, and the turn is in it. Returns what it showed first. */
async function firstLookAfterReload(page: Page, turn: Locator) {
  await conversationShown(page);
  await expect(turn, 'the question is in the reloaded conversation').toBeAttached();
  return readTurn(turn);
}

// Step 9: the Opus question a third time, and the page reloaded as soon as answer text is streaming.
acceptStep('9 reload mid-answer', { shots: ['reloaded', 'end'] }, async ({ page }, rec) => {
  const turn = await askInto(page, rec, conversationOfStep(FIRST_QUESTION_STEP), QUESTION_DEEP);
  if (!(await waitStreaming(page, turn))) throw new Error(FINISHED_BEFORE_RELOAD);
  await page.reload();
  rec.note({ reloaded_at: utcNow() });

  const first = await firstLookAfterReload(page, turn);
  rec.note({ state_after_reload: first.state, line_after_reload: first.line, text_chars_after_reload: Array.from(first.answer).length });
  // Done already, or the stored answer already on the page with the turn about to be marked done:
  // the reload came too late to show anything. Not a pass, and not the page's fault.
  const landedAlready = first.state === 'streaming' && first.answer !== '' && first.line === null;
  if (first.state === 'done' || landedAlready) throw new Error(FINISHED_BEFORE_RELOAD);
  await rec.shot(page, 'reloaded');
  expect(first.state, 'after the reload the answer is still being written').toBe('streaming');
  expect(first.line, 'the reloaded page says it is answering').toBe(LATE_STREAM_LINE);
  expect(Array.from(first.answer).length, 'and shows no half-written text (characters shown)').toBe(0);

  // "Answering…" stands until the turn is finished: every look in between is held to it.
  const watch = await watchAnswering(page, turn);
  rec.note({ answering_looks: watch.looks, answer_landed_first: watch.landed !== null, ended_as: watch.endedAs, closed_at: utcNow() });
  // Not one look after the picture found it still answering: the picture may show the finished answer.
  if (watch.looks === 0) throw new Error(FINISHED_WHILE_RECORDED);
  if (watch.landed === null) {
    expect(watch.endedAs, 'the answer finished').toBe('done');
  } else {
    // The stored answer reached the page a moment before the turn was marked done. Done itself is waited for.
    await expect(turn, 'the answer that landed is then marked done').toHaveAttribute('data-turn', 'done', { timeout: STORED_ROW_TIMEOUT_MS });
    rec.note({ ended_as: 'done', closed_at: utcNow() });
  }
  // Then the finished answer is there: the stored row, whole.
  await expect(turn.locator('[data-answer-text]')).not.toBeEmpty({ timeout: STORED_ROW_TIMEOUT_MS });
  await page.waitForTimeout(STORED_SETTLE_MS);
  const finished = await readTurn(turn);
  rec.note(turnFacts(finished));
  await rec.shot(page, 'end');
  await expectAnswered(turn, { badge: BADGE_HIGH, usedTools: [] });
  // What landed before done was the whole answer, not a part of one still being written.
  if (watch.landed !== null) {
    expect(finished.answer === watch.landed, 'the text that landed before the turn was marked done is the finished answer, whole').toBe(true);
  }
});

/* ---------------------------------------------------------------------------
 * Stage `offline`: right after the host stopped the Workspace service
 * ------------------------------------------------------------------------ */

// Step 14, first half. The deadline is the host's: three minutes after it stopped the service.
acceptStep('14a offline', { shots: ['offline', 'queued'] }, async ({ page }, rec) => {
  const deadline = stageDeadlineMs();
  const conversation = conversationOfStep(FIRST_QUESTION_STEP);
  await openSettled(page, conversationPath(conversation));
  const openedAt = Date.now();
  rec.note({ conversation_id: conversation, deadline: iso(deadline), opened_at: iso(openedAt) });
  if (openedAt > deadline) {
    throw new Error(`inconclusive: the page opened after the deadline (opened ${iso(openedAt)}, deadline ${iso(deadline)})`);
  }

  const offline = page.locator('[data-workspace-offline]');
  await expect(offline, 'the page says the service is offline before the deadline').toBeVisible({ timeout: Math.max(deadline - Date.now(), 1) });
  const seenAt = Date.now();
  rec.note({ offline_seen_at: iso(seenAt), offline_line: await textOrNull(offline), seconds_before_deadline: Math.round((deadline - seenAt) / 1000) });
  await rec.shot(page, 'offline');
  await expect(offline).toHaveText(OFFLINE_LINE);
  expect(seenAt, 'the offline line was seen before the deadline').toBeLessThanOrEqual(deadline);

  // Asked while the service is stopped: the question waits, and does not expire.
  const turn = await askHere(page, rec, QUESTION_LOOKUP);
  await expect(turn).toHaveAttribute('data-turn', 'queued');
  await expect(turn.locator('[data-turn-line]')).toHaveText(QUEUED_LINE);
  await page.waitForTimeout(QUEUED_HOLD_MS);
  const lookedAt = utcNow();
  const held = await readTurn(turn);
  // Noted only when the question was seen waiting at it. A reading for whoever judges the step: the
  // host's proof of the wait takes no time from here, and compares two times of the database.
  rec.note({ ...turnFacts(held), ...(held.state === 'queued' ? { still_queued_at: lookedAt } : {}) });
  await rec.shot(page, 'queued');
  expect(held.state, 'the question is still waiting').toBe('queued');
  expect(held.line).toBe(QUEUED_LINE);
  await expect(offline, 'and the page still says the service is offline').toBeVisible();
});

/* ---------------------------------------------------------------------------
 * Stage `back`: after the host has started the service again
 * ------------------------------------------------------------------------ */

// Step 14, second half: the question that waited is answered. It may be answered before this page opens.
acceptStep('14b back', { shots: ['start', 'end'] }, async ({ page }, rec) => {
  const requestId = carriedRequest(OFFLINE_STEP);
  const conversation = conversationOfStep(FIRST_QUESTION_STEP);
  await openSettled(page, conversationPath(conversation));
  await conversationShown(page);
  const turn = turnOfRequest(page, requestId);
  await expect(turn, 'the question asked while the service was stopped is in this conversation').toBeAttached();
  rec.note({ conversation_id: conversation, request_id: requestId, opened_at: utcNow(), state_when_opened: (await readTurn(turn)).state });

  rec.note({ closed_at: await waitClosed(turn) });
  await page.waitForTimeout(STORED_SETTLE_MS);
  const offline = page.locator('[data-workspace-offline]');
  rec.note({ ...turnFacts(await readTurn(turn)), offline_line_shown: (await offline.count()) > 0 });
  const shots = await shootTurn(page, rec, turn, QUESTION_LOOKUP);

  // Answered, at whatever tier the router chose for it: the step asks for an answer, not for a tier.
  await expect(turn).toHaveAttribute('data-turn', 'done');
  await expect(turn.locator('[data-tier]')).toHaveText(/^(Haiku|Sonnet|Opus) · /);
  await expect(turn.locator('[data-answer-text]')).not.toBeEmpty();
  await expect(turn.locator('[data-turn-line]')).toHaveCount(0);
  await expectShotsShowTheTurn(turn, QUESTION_LOOKUP, shots);
  await expect(offline, 'the service is back: the page does not call it offline').toHaveCount(0);
});

/** The run's own conversations: what its steps asked into, as far as this stage can read. */
function ownConversations(): string[] {
  const ids = [conversationOfStepOrNull(FIRST_QUESTION_STEP), conversationOfStepOrNull(OFFLINE_STEP), conversationOfStepOrNull('14b')];
  return [...new Set(ids.filter((id): id is string => id !== null))];
}

// Step 15: the 'spike' conversation and the run's own are archived through the list's own button.
acceptStep('15 archive', { shots: ['before', 'after', 'archived'] }, async ({ page, context }, rec) => {
  const own = ownConversations();
  expect(own.length, 'the run has a conversation of its own to archive').toBeGreaterThan(0);
  const allowed = await allowArchive(context);
  await openSettled(page, '/workspace');
  await workspaceReady(page);

  const list = conversationList(page);
  const rowOf = (id: string) => rowOfConversation(page, id);
  const spikeRows = rowsTitled(page, SPIKE_TITLE);
  const spikes = await conversationsOfRows(spikeRows);
  const toArchive = [...new Set([...spikes, ...own])];
  rec.note({ own_ids: own, spike_ids: spikes, spike_was_already_archived: spikes.length === 0, listed_before: (await listedTitles(page)).length });
  await rec.shot(page, 'before');

  for (const id of own) await expect(rowOf(id), `the run's conversation ${id} is listed`).toHaveCount(1);
  for (const [index, id] of toArchive.entries()) {
    await rowOf(id).getByRole('button', { name: 'Archive', exact: true }).click();
    await expect(rowOf(id), `conversation ${id} left the list`).toHaveCount(0);
    rec.note({ archived_ids: toArchive.slice(0, index + 1) });
  }
  await page.waitForTimeout(SETTLE_MS);
  rec.note({ archive_writes: allowed.length, listed_after: (await listedTitles(page)).length });
  await rec.shot(page, 'after');
  expect(allowed.length, 'one Archive write for each conversation').toBe(toArchive.length);
  await expect(spikeRows, "no conversation titled 'spike' is listed").toHaveCount(0);

  // Under "Show archived" each of them stands with Unarchive beside it. Nothing there is pressed.
  await list.getByRole('checkbox', { name: SHOW_ARCHIVED_LABEL }).check();
  const unarchive = page.getByRole('button', { name: UNARCHIVE_LABEL, exact: true });
  for (const id of toArchive) await expect(rowOf(id).filter({ has: unarchive }), `conversation ${id} is among the archived`).toHaveCount(1);
  const archivedSpikes = spikeRows.filter({ has: unarchive });
  await expect(archivedSpikes.first(), "a conversation titled 'spike' is among the archived").toBeVisible();
  rec.note({ spike_archived_rows: await archivedSpikes.count() });
  // The archived list can be longer than the window, and 'spike' is among its oldest rows.
  await archivedSpikes.first().scrollIntoViewIfNeeded();
  await rec.shot(page, 'archived');
});

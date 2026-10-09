/**
 * Phase 24a's acceptance tests: the Workspace behind today's page, on the live site (brief 109,
 * "The acceptance pack, 24a"; the pack is `acceptance/24/` at the root). The page does not change in
 * 24a, so no control for an upload, a depth or a routine is used: those are 24b's.
 *
 * THESE RUN ONLY INSIDE AN ACCEPTANCE RUN. Without `ACCEPT=1` every test here is skipped where it is
 * declared; with it, the one test whose exact title is `ACCEPT_ONLY` runs. The Claude operator in the
 * sandbox starts them one at a time, in the order they stand here, and reads what each leaves in
 * `ACCEPT_OUT` (`accept.lib.ts` says what that is). `accept24.lib.ts` holds what they share.
 *
 * A title starts with the step of the acceptance script it is. Four sandbox stages run them, with the
 * host's own steps in between (`acceptance/24/manifest.json`):
 *
 * * `walk`: `2 open workspace`, then eight questions of the Workspace: `3` to `9`.
 * * `upload`: `11 upload file`; the host then waits for the ingest worker to index it.
 * * `find`: `13 find upload` and `14 send twice`.
 * * `delete`: `15 delete upload`.
 *
 * THE QUESTIONS. The page can only send Auto in 24a, so the router (`workspace/src/router.ts`) picks
 * the tier from the words. A lookup opens with one of its cue words (`What`, `Open`) and holds no
 * execution verb: low, so no planning turn. A Standard question opens with neither (`Explain`): mid,
 * so a planning turn runs. A test of the pack runs the router over each of these.
 *
 * EVERY STEP ARCHIVES THE CONVERSATION IT OPENED, through the list's own Archive button, in the last
 * step that uses it. Step 3 opens the conversation that step 7 asks its follow-up into, so step 7
 * archives it. A step that fails is archived all the same (`archiveAfter`).
 *
 * THE FILE IS NEW IN EVERY RUN (`accept24.lib.ts`): step 11 draws a nonce, notes it as `nonce_id`, and
 * every later step and every host proof about the file works from that one value.
 *
 * Each test records first and asserts afterwards, so a step that fails still leaves what the page
 * showed. An answer's text goes into the step's facts file and is never printed.
 */

import { expect } from '@playwright/test';
import {
  FILE_MIME,
  archiveAfter,
  askAndSettle,
  deleteDocument,
  newNonce,
  openWithSession,
  removeObject,
  requestIdOf,
  sendFile,
  syntheticFile,
  uploadRows,
} from './accept24.lib';
import {
  acceptStep,
  askInto,
  conversationOfStep,
  readTurn,
  registerAcceptHooks,
  turnFacts,
  waitClosed,
  waitStreaming,
} from './accept.lib';
import { readCarry, requireCarried } from './accept.env';
import {
  BADGE_LOW,
  BADGE_MID,
  COLUMN_START_LINE,
  SETTLE_MS,
  STOPPED_SENTENCE,
  STORED_SETTLE_MS,
  conversationList,
  conversationOf,
  listedTitles,
  openSettled,
  utcNow,
  workspaceReady,
} from './walk21.lib';

registerAcceptHooks();

/** The step whose question opens the conversation that step 7 continues. */
const FIRST_QUESTION_STEP = '3';
/** The step that makes the file. */
const UPLOAD_STEP = '11';

/** The questions. Each is typed by one test (a test of the pack holds each proof's md5 to the question here). */
const QUESTION_COURSE = 'What does the IST.323 syllabus say about late work?';
const QUESTION_LOOKUP = 'Open the IST.323 syllabus and list its section headings';
const QUESTION_PLAN = "Explain how a systems analyst's role differs from a project manager's, using the IST.352 slides";
const QUESTION_PLANNER = 'What assignments are due in the next two weeks?';
const QUESTION_FOLLOW_UP = 'And what about the grading policy?';
/** Invented words: no course passage, upload or remembered item can match them. It must stay nonsense. */
const QUESTION_NOTHING = 'What is a zxqvl blorptangle wumbaflix frennodyne?';
/** Long answer, mid tier: the stream lasts long enough for Stop to be pressed in it. */
const QUESTION_STOP = 'Explain in detail how a feasibility study differs from a requirements study, using the IST.352 slides';
const QUESTION_AFTER_STOP = 'What does the IST.323 syllabus say about attendance?';
const QUESTION_UPLOAD = 'What does my uploaded memo say about the quillfern lamp of the Marrowbrook archive?';

/** The fixed sentence of an answer whose retrieval found nothing (`workspace/test/fixtures/contract24/lines.txt`, key `empty`). */
const EMPTY_LINE = 'No passage of your course files or uploads matched this question, so this answer comes from general knowledge.';

/** The words step 9 fails with when the answer was over before Stop could be pressed. */
const FINISHED_BEFORE_STOP = 'inconclusive: the answer finished before Stop could be pressed';
/** The objects removed by the bucket's remove call: the one key. */
const ONE_OBJECT = 1;

/* ---------------------------------------------------------------------------
 * Stage `walk`
 * ------------------------------------------------------------------------ */

// Step 2: the Workspace is opened from the top bar, as a reader does. The list may hold anything.
acceptStep('2 open workspace', { shots: ['open'] }, async ({ page }, rec) => {
  await openSettled(page, '/');
  const link = page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Workspace', exact: true });
  await link.click();
  await expect(page).toHaveURL(/\/workspace$/);
  await page.waitForLoadState('load');
  await page.waitForTimeout(SETTLE_MS);
  await workspaceReady(page);

  const offline = page.locator('[data-workspace-offline]');
  rec.note({
    path: new URL(page.url()).pathname,
    channel: await page.locator('[data-workspace-stream]').getAttribute('data-channel'),
    listed_count: (await listedTitles(page)).length,
    offline_line_shown: (await offline.count()) > 0,
  });
  await rec.shot(page, 'open');

  await expect(link).toHaveAttribute('aria-current', 'page');
  await expect(conversationList(page)).toBeVisible();
  await expect(page.locator('li[data-turn]')).toHaveCount(0);
  await expect(page.locator('[data-column-empty="start"]')).toHaveText(COLUMN_START_LINE);
  await expect(page.getByRole('button', { name: 'Ask', exact: true })).toBeVisible();
  await expect(offline, 'the service is answering: the page does not call it offline').toHaveCount(0);
});

// Step 3: a course question. The runner searched before the answering model started (a host proof reads the stored sources).
// The conversation stays open: step 7 asks into it and archives it.
acceptStep('3 course question', { shots: ['start', 'end'] }, async ({ page }, rec) => {
  await askAndSettle(page, rec, { conversation: null, question: QUESTION_COURSE, badge: BADGE_LOW }, []);
});

// Step 4: a lookup takes one turn, no planning.
acceptStep('4 lookup one turn', { shots: ['start', 'end'] }, async ({ page, context }, rec) => {
  const opened: string[] = [];
  await archiveAfter(page, context, rec, opened, async () => {
    await askAndSettle(page, rec, { conversation: null, question: QUESTION_LOOKUP, badge: BADGE_LOW }, opened);
  });
});

// Step 5: a Standard-depth question takes a planning turn. The page can only send Auto: the wording sends it to the middle tier.
acceptStep('5 standard plan', { shots: ['start', 'end'] }, async ({ page, context }, rec) => {
  const opened: string[] = [];
  await archiveAfter(page, context, rec, opened, async () => {
    await askAndSettle(page, rec, { conversation: null, question: QUESTION_PLAN, badge: BADGE_MID }, opened);
  });
});

// Step 6: a planner question. The feed rides on the prompt (a host proof reads its source row and the planner stays as it was).
acceptStep('6 planner feed', { shots: ['start', 'end'] }, async ({ page, context }, rec) => {
  const opened: string[] = [];
  await archiveAfter(page, context, rec, opened, async () => {
    await askAndSettle(page, rec, { conversation: null, question: QUESTION_PLANNER, badge: BADGE_LOW }, opened);
  });
});

// Step 7: a follow-up in step 3's conversation, answered with no session (a host proof reads the null). It archives that conversation.
acceptStep('7 follow-up', { shots: ['start', 'end'] }, async ({ page, context }, rec) => {
  const conversation = conversationOfStep(FIRST_QUESTION_STEP);
  const opened: string[] = [conversation];
  await archiveAfter(page, context, rec, opened, async () => {
    await askAndSettle(page, rec, { conversation, question: QUESTION_FOLLOW_UP, badge: BADGE_LOW }, []);
  });
});

// Step 8: a question nothing matches. The answer exists and its first line is the fixed sentence.
acceptStep('8 nothing matches', { shots: ['start', 'end'] }, async ({ page, context }, rec) => {
  const opened: string[] = [];
  await archiveAfter(page, context, rec, opened, async () => {
    const { turn } = await askAndSettle(page, rec, { conversation: null, question: QUESTION_NOTHING, badge: BADGE_LOW }, opened);
    const lines = (await turn.locator('[data-answer-text]').innerText()).split(/\r?\n/).map((line) => line.trim());
    const first = lines.find((line) => line !== '') ?? '';
    rec.note({ first_line_is_the_fixed_sentence: first === EMPTY_LINE });
    expect(first, 'the answer starts with the fixed sentence of an empty retrieval').toBe(EMPTY_LINE);
  });
});

// Step 9: a Stop reaches the runner, and the next answer in that conversation is done.
acceptStep('9 stop then answer', { shots: ['stopped', 'after'] }, async ({ page, context }, rec) => {
  const opened: string[] = [];
  await archiveAfter(page, context, rec, opened, async () => {
    const turn = await askInto(page, rec, null, QUESTION_STOP);
    const conversation = conversationOf(page);
    opened.push(conversation);
    const stoppedId = await requestIdOf(turn);
    if (!(await waitStreaming(page, turn))) throw new Error(FINISHED_BEFORE_STOP);
    await page.getByRole('button', { name: 'Stop', exact: true }).click();
    await expect(turn).toHaveAttribute('data-turn', 'stopped');
    await expect(turn.locator('[data-turn-line]')).toHaveText(STOPPED_SENTENCE);
    rec.note({ ...turnFacts(await readTurn(turn)), stopped_at: utcNow() });
    await rec.shot(page, 'stopped');
    // The runner's stored row then replaces the live text: the turn stays stopped.
    await page.waitForTimeout(STORED_SETTLE_MS);
    await expect(turn).toHaveAttribute('data-turn', 'stopped');
    await expect(turn.locator('[data-tier]')).toHaveText(BADGE_MID);

    const next = await askInto(page, rec, conversation, QUESTION_AFTER_STOP);
    const nextId = await requestIdOf(next);
    // askInto noted the next request as the step's `request_id`: the stopped one is the step's, the next is `next_request_id`.
    rec.note({ request_id: stoppedId, next_request_id: nextId, conversation_id: conversation });
    rec.note({ closed_at: await waitClosed(next) });
    await page.waitForTimeout(STORED_SETTLE_MS);
    const answered = await readTurn(next);
    rec.note({ next_state: answered.state, next_badge: answered.badge, next_answer_chars: Array.from(answered.answer).length });
    await rec.shot(page, 'after');
    await expect(next).toHaveAttribute('data-turn', 'done');
    await expect(next.locator('[data-tier]')).toHaveText(BADGE_LOW);
    await expect(next.locator('[data-answer-text]')).not.toBeEmpty();
    await expect(next.locator('[data-turn-line]')).toHaveCount(0);
  });
});

/* ---------------------------------------------------------------------------
 * Stage `upload`: the browser's side of an upload, with the page's own signed-in session
 * ------------------------------------------------------------------------ */

// Step 11: a file that is new in this run goes into the bucket under u/<hash>, with a signed link of 7 days, and is registered.
acceptStep('11 upload file', { shots: [] }, async ({ page }, rec) => {
  const file = syntheticFile(newNonce());
  // Noted first: the host and the later stages work from this value, and a step that fails leaves it.
  rec.note({ nonce_id: file.nonce, sha256: file.sha256, byte_size: file.byteSize, storage_key: file.key, mime: FILE_MIME });
  const session = await openWithSession(page);
  expect(await uploadRows(page, session, file.sha256), 'no row holds a hash that no earlier run used').toEqual([]);

  const sent = await sendFile(page, session, file);
  rec.note({ document_id: sent.id, document_state: sent.state, existing: sent.existing, uploaded: sent.uploaded, registered_at: utcNow() });
  expect(sent.uploaded, 'the object was put in the bucket').toBe(true);
  expect(sent.existing, 'the register call made a new row').toBe(false);
  expect(sent.state, 'the row starts in state stored').toBe('stored');
  expect(sent.id).toBeGreaterThan(0);
});

/* ---------------------------------------------------------------------------
 * Stage `find`
 * ------------------------------------------------------------------------ */

/** The file of step 11, rebuilt from the nonce the host carried, and the document it registered. */
function fileOfUploadStep() {
  const carry = readCarry(process.env['ACCEPT_IN']);
  return {
    file: syntheticFile(requireCarried(carry, UPLOAD_STEP, 'nonce_id', 'uuid')),
    documentId: requireCarried(carry, UPLOAD_STEP, 'document_id', 'integer'),
  };
}

// Step 13: a question the file answers. The host proof reads a source row of kind upload that names the document.
acceptStep('13 find upload', { shots: ['start', 'end'] }, async ({ page, context }, rec) => {
  const { documentId } = fileOfUploadStep();
  rec.note({ document_id: documentId });
  const opened: string[] = [];
  await archiveAfter(page, context, rec, opened, async () => {
    await askAndSettle(page, rec, { conversation: null, question: QUESTION_UPLOAD, badge: BADGE_LOW }, opened);
  });
});

// Step 14: the same file is sent a second time. Nothing is uploaded, the register call says `existing`, and one row holds the hash.
acceptStep('14 send twice', { shots: [] }, async ({ page }, rec) => {
  const { file, documentId } = fileOfUploadStep();
  const session = await openWithSession(page);
  const before = await uploadRows(page, session, file.sha256);
  rec.note({ document_id: documentId, sha256: file.sha256, rows_before: before.length });

  const sent = await sendFile(page, session, file);
  const after = await uploadRows(page, session, file.sha256);
  rec.note({ uploaded: sent.uploaded, existing: sent.existing, document_state: sent.state, rows_after: after.length, sent_at: utcNow() });
  expect(before.map((row) => row.id), 'one row holds the hash before the second send').toEqual([documentId]);
  expect(sent.uploaded, 'the second send uploaded nothing').toBe(false);
  expect(sent.existing, 'and the register call found the row').toBe(true);
  expect(sent.id, 'the row is the first send\'s').toBe(documentId);
  expect(after.map((row) => row.id), 'one row holds the hash after the second send').toEqual([documentId]);
});

/* ---------------------------------------------------------------------------
 * Stage `delete`
 * ------------------------------------------------------------------------ */

// Step 15: the delete in its two steps, leaving no row in `deleting`.
acceptStep('15 delete upload', { shots: [] }, async ({ page }, rec) => {
  const { file, documentId } = fileOfUploadStep();
  const session = await openWithSession(page);
  rec.note({ document_id: documentId, sha256: file.sha256 });

  const cut = await deleteDocument(page, session, documentId, false);
  rec.note({ first_call_state: cut.state, storage_key: cut.storageKey });
  expect(cut.state, 'the first call cuts retrieval and leaves the row in deleting').toBe('deleting');
  expect(cut.storageKey, 'and hands back the key to remove').toBe(file.key);
  expect((await uploadRows(page, session, file.sha256)).map((row) => row.state)).toEqual(['deleting']);

  const removed = await removeObject(page, session, file.key);
  rec.note({ objects_removed: removed });
  expect(removed, 'the browser removed the object').toBe(ONE_OBJECT);

  const dropped = await deleteDocument(page, session, documentId, true);
  const left = await uploadRows(page, session, file.sha256);
  rec.note({ second_call_state: dropped.state, rows_after: left.length, deleted_at: utcNow() });
  expect(dropped.state, 'the second call drops the row').toBe('deleted');
  expect(left, 'no row holds the hash').toEqual([]);
});

/**
 * Phase 23's acceptance tests: the Inbox's Apply answers button and the sync, on the live site (brief
 * 110, "The acceptance pack for Phase 23"; the pack is `acceptance/23/` at the root).
 *
 * THESE RUN ONLY INSIDE AN ACCEPTANCE RUN. Without `ACCEPT=1` every test here is skipped where it is
 * declared; with it, the one test whose exact title is `ACCEPT_ONLY` runs. The Claude operator in the
 * sandbox starts them one at a time, in the order they stand here, and reads what each leaves in
 * `ACCEPT_OUT` (`accept.lib.ts` says what that is).
 *
 * A title starts with the step of the acceptance script it is. Three stages run them, with the host's
 * own steps in between (`acceptance/23/manifest.json`):
 *
 * * `walk`: `1 raise questions`, `2 press sync`, `3 watch apply`, `4 archived`, `6 note and apply`.
 * * `offline`, run right after the host stopped the apply service: `7a offline press`.
 * * `back`, run after the host started it again: `7b taken after`.
 *
 * THE RUN'S OWN QUESTIONS. The run cannot answer Stack's Inbox questions for him, so step 1 raises four
 * of its own with the database function `inbox_accept_question(p_run, p_label)`, called through the
 * owner's signed-in session: the request headers the page itself sends are reused for one RPC call,
 * and are never written anywhere. Their labels are `confirm`, `dismiss`, `note` and `offline`; their
 * text is the function's own fixed sentence, so a card is found by that sentence and by the run tag
 * its source line shows (`accept/<tag>/<label>`). No course text is typed, read or written here.
 *
 * WHAT A TEST MAY WRITE. The shared hooks abort every table write. Each test below lets through only
 * the writes it is for, by table, method and (for a question) the item's id: the Inbox's Save and
 * Dismiss (a PATCH of `attention_items`), and the Sync and Apply answers buttons (a POST of
 * `agent_requests` of the kind that button files). Anything else still reaches the guard and fails.
 *
 * TIME. The shared limit of `acceptStep()` is 9.75 minutes a test, and a test may set its own inside
 * its body (`test.setTimeout`): steps 3, 6 and 7a do. Step 3 watches for nine minutes, step 6 for
 * eight and a half (the operator's own limit on one command is ten), and step 7a waits out the button's 75 second
 * grace and presses a second time.
 *
 * Everything is found by role and visible text, and nothing by a class name: another phase restyles
 * the Inbox.
 */

import { randomInt } from 'node:crypto';
import { expect, test, type BrowserContext, type Locator, type Page, type Request } from '@playwright/test';
import { acceptSettings, readCarry, readFacts, requireCarried } from './accept.env';
import { acceptStep, registerAcceptHooks, type Recorder } from './accept.lib';
import { CHECKOUT_ROOT, MINUTE_MS, openSettled, utcNow } from './walk21.lib';

registerAcceptHooks();

/* ---------------------------------------------------------------------------
 * The page's strings and the run's fixed words. Copied from the app, not imported.
 * ------------------------------------------------------------------------ */

const INBOX_PATH = '/inbox';
const HOME_PATH = '/';

/** `src/lib/inbox-apply-phase.ts` (APPLY_PHASE_LABEL): what the Apply answers button reads in each phase. */
const APPLY_LABEL = 'Apply answers';
const APPLY_QUEUED = 'queued';
const APPLY_RUNNING = 'running';
const APPLY_DONE = 'done';
const APPLY_FAILED = 'failed';
const APPLY_UNCLAIMED = 'waiting on the worker…';
/** And its status line for a request a press of the button filed (`applyStatusLine`). */
const QUEUED_FROM_BUTTON = 'Queued from Apply answers';
/** The Inbox's own words for an empty tab and for the footer's count (`EMPTY_TAB_TEXT`, `InboxView`). */
const ANSWERED_TAB_EMPTY = 'Every answer has been applied.';
const NOTHING_ANSWERED = '0 answered';
const ANSWERED_COUNT = /^\d+ answered$/;
/** The paste command the button shows as its fallback (`inboxApplyCommand`), whatever the request's number: "nothing was pasted" is its absence. */
const PASTE_COMMAND = /inbox-apply \d+/;

/** `src/lib/sync-request-phase.ts` (PHASE_LABEL): what the top bar's Sync button reads. */
const SYNC_LABEL = 'Sync';
const SYNC_LABELS = [
  'Sync',
  'requesting…',
  'sync requested',
  'waiting on the container…',
  'sync requeued…',
  'starting…',
  'crawling…',
  'pulling files…',
  'finishing…',
  'Claude Code: syncing…',
  'sync done',
  'sync failed',
  'sync cancelled',
] as const;
/** The labels that show the sync container has taken the request. */
const SYNC_TAKEN_LABELS: readonly string[] = ['starting…', 'crawling…', 'pulling files…', 'finishing…', 'sync done'];
const SYNC_UNCLAIMED = 'waiting on the container…';

const TAB_NEEDS_YOU = /^Needs you/;
const TAB_ANSWERED = /^Answered, not applied/;
const TAB_ARCHIVED = /^Archived/;

/** The word typed into a card's Answer box, and the reason typed into step 6's "why": the pack's own, no course text. */
const ANSWER_WORD = 'accepted';
const REASON_SENTENCE = 'This is a test question of an acceptance run. Nothing changes: record it and archive it.';

/** The labels of the run's four questions, which `inbox_accept_question` writes into each card's sentence and source line. */
type Label = 'confirm' | 'dismiss' | 'note' | 'offline';

/* ---------------------------------------------------------------------------
 * The run's numbers
 * ------------------------------------------------------------------------ */

/** Step 3 watches the Inbox for nine minutes for the apply request the sync files; the longest of the last five syncs took 125 s. */
const SYNC_WATCH_MS = 9 * MINUTE_MS;
const SYNC_WATCH_TEST_MS = 9.75 * MINUTE_MS;
/**
 * Step 6 waits for the request to close no longer than the operator can: one command of the operator is
 * ten minutes at most (acceptance/OPERATOR.md), and the test spends about half a minute before the wait
 * (open, save, press). The wait is 8.5 minutes inside a 9.75 minute test limit, which leaves about 45 seconds
 * after the half minute, so a wait that ends open throws `inconclusive:` before Playwright's own timeout can fire. The worker's own Claude limit is 14 minutes, so a slow run can still be open when
 * the wait ends; the test then says so (`inconclusive:`) and the host's proof is blocked, not failed.
 */
const APPLY_WATCH_MS = 8.5 * MINUTE_MS;
const APPLY_WATCH_TEST_MS = 9.75 * MINUTE_MS;
/** Step 7a waits out the button's 75 second grace, and the label turns at the next 5 second tick of the page's clock. */
const UNCLAIMED_WAIT_MS = 3 * MINUTE_MS;
const OFFLINE_TEST_MS = 5 * MINUTE_MS;
/** Step 2: the sync container takes a queued request within 25 s plus a login check; the button gives up at 75 s. */
const SYNC_TAKEN_WAIT_MS = 2.5 * MINUTE_MS;
/** Step 7b: the worker comes back, takes the waiting request and closes it. */
const TAKEN_AFTER_WAIT_MS = 3 * MINUTE_MS;
const LOOK_EVERY_MS = 2000;
const RELOAD_EVERY_MS = 10_000;
const AFTER_CLOSE_WAIT_MS = 30_000;
/** A run tag the function accepts is 6 to 24 characters of a-z and 0-9: seconds since the epoch and three random digits. */
const TAG_RANDOM_DIGITS = 1000;

/* ---------------------------------------------------------------------------
 * The run tag and the item ids: what step 1 leaves for the later steps
 * ------------------------------------------------------------------------ */

const FIRST_STEP = '1';

/** One number from step 1's facts: of this stage when step 1 ran here, else of the carry-over. */
function fromStepOne(field: string): number {
  const settings = acceptSettings(process.env, CHECKOUT_ROOT);
  const here = settings === null ? null : readFacts(settings.outDir, FIRST_STEP)?.[field];
  if (typeof here === 'number' && Number.isSafeInteger(here) && here > 0) return here;
  return requireCarried(readCarry(process.env['ACCEPT_IN']), FIRST_STEP, field, 'integer');
}

const runTag = (): number => fromStepOne('run_tag_id');
const itemOf = (label: Label): number => fromStepOne(`${label}_item_id`);

/* ---------------------------------------------------------------------------
 * The writes a test lets through
 * ------------------------------------------------------------------------ */

interface AllowedWrite {
  method: 'PATCH' | 'POST';
  table: 'attention_items' | 'agent_requests';
  /** For a PATCH of attention_items: the only items it may name. */
  items?: readonly number[];
  /** For a POST of agent_requests: the only kind it may file. */
  kind?: 'sync' | 'inbox_feedback';
}

function bodyKind(request: Request): string | null {
  try {
    const body: unknown = request.postDataJSON();
    const kind = body !== null && typeof body === 'object' ? (body as Record<string, unknown>)['kind'] : null;
    return typeof kind === 'string' ? kind : null;
  } catch {
    return null;
  }
}

function permits(rule: AllowedWrite, request: Request, url: URL): boolean {
  if (rule.method !== request.method() || url.pathname !== `/rest/v1/${rule.table}`) return false;
  if (rule.table === 'attention_items') return (rule.items ?? []).some((id) => url.searchParams.get('id') === `eq.${id}`);
  return bodyKind(request) === rule.kind;
}

/**
 * Lets the named writes through the shared write guard and nothing else. Registered after the
 * guard, so it is asked first; a request it does not permit falls back to the guard, which aborts
 * it and fails the test.
 */
async function allowWrites(context: BrowserContext, allowed: readonly AllowedWrite[]): Promise<void> {
  await context.route('**/rest/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (allowed.some((rule) => permits(rule, request, url))) await route.continue();
    else await route.fallback();
  });
}

/* ---------------------------------------------------------------------------
 * The Inbox, found by role and visible text
 * ------------------------------------------------------------------------ */

const actionsRegion = (page: Page): Locator => page.getByRole('region', { name: 'Inbox actions' });
const applyButton = (page: Page): Locator => actionsRegion(page).getByRole('button');
const footerCount = (page: Page): Locator => actionsRegion(page).getByText(ANSWERED_COUNT);

/** A test question's card: found by the sentence the function wrote with its label, and by the run tag in its source line. */
function cardOf(page: Page, label: Label): Locator {
  return page
    .getByRole('article', { name: new RegExp(`Acceptance run test question "${label}"`) })
    .filter({ hasText: `accept/${runTag()}/${label}` });
}

async function openInbox(page: Page): Promise<void> {
  await openSettled(page, INBOX_PATH);
  await expect(page.getByRole('heading', { name: 'Inbox', level: 1 })).toBeVisible();
  await expect(footerCount(page)).toBeVisible();
}

async function openTab(page: Page, name: RegExp): Promise<void> {
  await page.getByRole('tab', { name }).click();
  await expect(page.getByRole('tab', { name })).toHaveAttribute('aria-selected', 'true');
}

async function bringToTop(card: Locator): Promise<void> {
  await card.evaluate((element) => element.scrollIntoView({ block: 'start' }));
}

const textOf = async (locator: Locator): Promise<string | null> => ((await locator.count()) === 0 ? null : ((await locator.first().innerText()).trim() || null));

const applyLabel = async (page: Page): Promise<string> => (await applyButton(page).innerText()).trim();
const statusLine = (page: Page): Promise<string | null> => textOf(actionsRegion(page).getByRole('status'));

/** Types the answer into a card and presses Save, with the reason when one is given; resolves when the write has answered. */
async function saveCard(page: Page, card: Locator, reason: string | null): Promise<void> {
  await card.getByRole('textbox', { name: /^Answer for item \d+$/ }).fill(ANSWER_WORD);
  if (reason !== null) await card.getByRole('textbox', { name: /^Why for item \d+$/ }).fill(reason);
  const written = page.waitForResponse((response) => response.request().method() === 'PATCH' && new URL(response.url()).pathname === '/rest/v1/attention_items');
  await card.getByRole('button', { name: 'Save', exact: true }).click();
  expect((await written).ok(), 'the Inbox saved the answer').toBe(true);
}

async function dismissCard(page: Page, card: Locator): Promise<void> {
  const written = page.waitForResponse((response) => response.request().method() === 'PATCH' && new URL(response.url()).pathname === '/rest/v1/attention_items');
  await card.getByRole('button', { name: 'Dismiss', exact: true }).click();
  expect((await written).ok(), 'the Inbox saved the dismissal').toBe(true);
}

/** Presses a button that files an agent request, and returns the id the database gave it, from the answer to the insert. */
async function pressAndFile(page: Page, button: Locator): Promise<number> {
  const filed = page.waitForResponse((response) => response.request().method() === 'POST' && new URL(response.url()).pathname === '/rest/v1/agent_requests');
  await button.click();
  const response = await filed;
  if (!response.ok()) throw new Error(`the press filed no request: the database answered ${response.status()}`);
  const body: unknown = await response.json();
  const row: unknown = Array.isArray(body) ? body[0] : body;
  const id = row !== null && typeof row === 'object' ? (row as Record<string, unknown>)['id'] : null;
  if (typeof id !== 'number' || !Number.isSafeInteger(id) || id <= 0) throw new Error('the press filed no request: the answer holds no id');
  return id;
}

/* ---------------------------------------------------------------------------
 * Watching the Apply answers button until its request has closed
 * ------------------------------------------------------------------------ */

interface ApplyWatch {
  /** The labels the button read, in order, each once. */
  labels: string[];
  /** `done` or `failed` when the request closed, `waiting on the worker…` when nothing took it, null when the time ran out. */
  endedAs: string | null;
}

async function watchApplyButton(page: Page, limitMs: number): Promise<ApplyWatch> {
  const until = Date.now() + limitMs;
  const labels: string[] = [];
  for (;;) {
    const label = await applyLabel(page);
    if (labels.at(-1) !== label) labels.push(label);
    if (label === APPLY_DONE || label === APPLY_FAILED || label === APPLY_UNCLAIMED) return { labels, endedAs: label };
    if (Date.now() > until) return { labels, endedAs: null };
    await page.waitForTimeout(LOOK_EVERY_MS);
  }
}

/** What a closed request leaves on the page: its result line, no paste command, and no answer left waiting. */
async function expectClosedClean(page: Page, rec: Recorder, watch: ApplyWatch): Promise<void> {
  const line = await statusLine(page);
  rec.note({ labels_seen: watch.labels, ended_as: watch.endedAs, status_line: line });
  expect(watch.endedAs, 'the request closed done').toBe(APPLY_DONE);
  expect(line, 'a result line stands beside the button').not.toBeNull();
  await expect(page.locator('code').filter({ hasText: PASTE_COMMAND }), 'nothing was pasted: no command is shown').toHaveCount(0);
  await expect(footerCount(page)).toHaveText(NOTHING_ANSWERED, { timeout: AFTER_CLOSE_WAIT_MS });
}

/* ---------------------------------------------------------------------------
 * Stage `walk`
 * ------------------------------------------------------------------------ */

/** The owner's request headers, taken from a read the page itself makes: used for one RPC call, never written down. */
interface Session {
  origin: string;
  apikey: string;
  authorization: string;
}

async function ownerSession(request: Request): Promise<Session> {
  const headers = await request.allHeaders();
  const apikey = headers['apikey'];
  const authorization = headers['authorization'];
  if (!apikey || !authorization) throw new Error('the page sent no signed-in read to take the session from');
  return { origin: new URL(request.url()).origin, apikey, authorization };
}

async function raiseQuestion(page: Page, session: Session, tag: number, label: Label): Promise<number> {
  const answered = await page.evaluate(
    async ({ url, apikey, authorization, body }) => {
      const response = await fetch(url, { method: 'POST', headers: { apikey, authorization, 'content-type': 'application/json' }, body });
      return { status: response.status, text: await response.text() };
    },
    { url: `${session.origin}/rest/v1/rpc/inbox_accept_question`, apikey: session.apikey, authorization: session.authorization, body: JSON.stringify({ p_run: String(tag), p_label: label }) },
  );
  const id = Number(answered.text);
  if (answered.status !== 200 || !Number.isSafeInteger(id) || id <= 0) throw new Error(`inbox_accept_question for "${label}" answered ${answered.status}`);
  return id;
}

// Step 1: raise the four questions, then confirm the first and dismiss the second in the Inbox.
acceptStep('1 raise questions', { shots: ['raised', 'answered'] }, async ({ page, context }, rec) => {
  const tag = Number(`${Math.floor(Date.now() / 1000)}${String(randomInt(TAG_RANDOM_DIGITS)).padStart(3, '0')}`);
  rec.note({ run_tag_id: tag });

  // A read the page makes as the signed-in owner: its bearer token is not the public key itself.
  const firstRead = page.waitForRequest(async (request) => {
    if (request.method() !== 'GET' || !request.url().includes('/rest/v1/')) return false;
    const headers = await request.allHeaders();
    return Boolean(headers['authorization']) && headers['authorization'] !== `Bearer ${headers['apikey']}`;
  });
  await openSettled(page, INBOX_PATH);
  const session = await ownerSession(await firstRead);

  const items: Record<Label, number> = { confirm: 0, dismiss: 0, note: 0, offline: 0 };
  for (const label of ['confirm', 'dismiss', 'note', 'offline'] as const) {
    items[label] = await raiseQuestion(page, session, tag, label);
    rec.note({ [`${label}_item_id`]: items[label] });
  }
  await allowWrites(context, [{ method: 'PATCH', table: 'attention_items', items: [items.confirm, items.dismiss] }]);

  await openInbox(page);
  for (const label of ['confirm', 'dismiss', 'note', 'offline'] as const) await expect(cardOf(page, label)).toBeVisible();
  rec.note({ cards_seen_open: 4 });
  await bringToTop(cardOf(page, 'confirm'));
  await rec.shot(page, 'raised');

  await saveCard(page, cardOf(page, 'confirm'), null);
  await expect(cardOf(page, 'confirm')).toHaveCount(0);
  await dismissCard(page, cardOf(page, 'dismiss'));
  await expect(cardOf(page, 'dismiss')).toHaveCount(0);
  rec.note({ confirmed: true, dismissed: true });

  await openTab(page, TAB_ANSWERED);
  await expect(cardOf(page, 'confirm')).toBeVisible();
  await expect(cardOf(page, 'dismiss')).toBeVisible();
  await expect(cardOf(page, 'note')).toHaveCount(0);
  await expect(cardOf(page, 'offline')).toHaveCount(0);
  rec.note({ answered_tab_shows: ['confirm', 'dismiss'] });
  await bringToTop(cardOf(page, 'confirm'));
  await rec.shot(page, 'answered');
});

// Step 2: Sync is pressed in the top bar, and the sync container takes the request.
acceptStep('2 press sync', { shots: ['pressed'] }, async ({ page, context }, rec) => {
  await allowWrites(context, [{ method: 'POST', table: 'agent_requests', kind: 'sync' }]);
  await openSettled(page, HOME_PATH);
  const anyLabel = new RegExp(`^(${SYNC_LABELS.join('|')})$`);
  const button = page.getByRole('button', { name: SYNC_LABEL, exact: true });
  await expect(button).toBeVisible();
  rec.note({ label_before: SYNC_LABEL });

  const requestId = await pressAndFile(page, button);
  rec.note({ request_id: requestId, pressed_at: utcNow() });

  const live = page.getByRole('button', { name: anyLabel });
  const labels: string[] = [];
  const until = Date.now() + SYNC_TAKEN_WAIT_MS;
  for (;;) {
    const label = (await live.innerText()).trim();
    if (labels.at(-1) !== label) labels.push(label);
    if (SYNC_TAKEN_LABELS.includes(label) || label === SYNC_UNCLAIMED || Date.now() > until) break;
    await page.waitForTimeout(LOOK_EVERY_MS);
  }
  rec.note({ labels_seen: labels, label_at_shot: labels.at(-1) ?? null });
  await rec.shot(page, 'pressed');
  expect(labels.some((label) => SYNC_TAKEN_LABELS.includes(label)), 'the sync container took the request: the button read a phase of the container').toBe(true);
});

// Step 3: the sync ends and files the apply request; the worker takes it and closes it, with no help and nothing pasted.
acceptStep('3 watch apply', { shots: ['watching', 'done'] }, async ({ page }, rec) => {
  test.setTimeout(SYNC_WATCH_TEST_MS);
  await openInbox(page);
  const countAtStart = (await footerCount(page).innerText()).trim();
  rec.note({ watch_started_at: utcNow(), label_at_start: await applyLabel(page), count_at_start: countAtStart, closed_before_the_page_opened: false });
  await rec.shot(page, 'watching');

  if (countAtStart === NOTHING_ANSWERED) {
    // The sync and the apply request it filed both ended before this page opened (the operator looks at step 2's pictures
    // between the two tests, and a sync takes about two minutes). A page cannot follow a request it never saw open,
    // so it shows no result line; the answers are archived and none waits. The host's proof checks the request itself.
    await openTab(page, TAB_ARCHIVED);
    await expect(cardOf(page, 'confirm')).toBeVisible();
    await expect(cardOf(page, 'dismiss')).toBeVisible();
    await expect(page.locator('code').filter({ hasText: PASTE_COMMAND }), 'nothing was pasted: no command is shown').toHaveCount(0);
    rec.note({ closed_before_the_page_opened: true, labels_seen: [await applyLabel(page)], ended_as: null, status_line: await statusLine(page) });
    await bringToTop(cardOf(page, 'confirm'));
    await rec.shot(page, 'done');
    return;
  }

  const watch = await watchApplyButton(page, SYNC_WATCH_MS);
  rec.note({ labels_seen: watch.labels, ended_as: watch.endedAs });
  if (watch.endedAs === null) throw new Error('inconclusive: the sync was still running after nine minutes');
  if (watch.endedAs === APPLY_UNCLAIMED) throw new Error('the apply worker did not take the request: the button read waiting on the worker');
  await expectClosedClean(page, rec, watch);
  await rec.shot(page, 'done');
});

// Step 4: both answered questions have left Answered, not applied and stand under Archived.
acceptStep('4 archived', { shots: ['answered', 'archived'] }, async ({ page }, rec) => {
  await openInbox(page);
  await openTab(page, TAB_ANSWERED);
  await expect(cardOf(page, 'confirm')).toHaveCount(0);
  await expect(cardOf(page, 'dismiss')).toHaveCount(0);
  await expect(page.getByText(ANSWERED_TAB_EMPTY)).toBeVisible();
  await expect(footerCount(page)).toHaveText(NOTHING_ANSWERED);
  rec.note({ answered_tab_empty: true });
  await rec.shot(page, 'answered');

  await openTab(page, TAB_ARCHIVED);
  await expect(cardOf(page, 'confirm')).toBeVisible();
  await expect(cardOf(page, 'dismiss')).toBeVisible();
  await expect(cardOf(page, 'confirm')).toContainText('archived');
  await expect(cardOf(page, 'dismiss')).toContainText('archived');
  rec.note({ archived_tab_shows: ['confirm', 'dismiss'] });
  await bringToTop(cardOf(page, 'confirm'));
  await rec.shot(page, 'archived');
});

// Step 6: the third question is confirmed with a reason; a press of Apply answers runs by itself, through one Claude run.
acceptStep('6 note and apply', { shots: ['saved', 'done'] }, async ({ page, context }, rec) => {
  test.setTimeout(APPLY_WATCH_TEST_MS);
  await allowWrites(context, [
    { method: 'PATCH', table: 'attention_items', items: [itemOf('note')] },
    { method: 'POST', table: 'agent_requests', kind: 'inbox_feedback' },
  ]);
  await openInbox(page);
  await saveCard(page, cardOf(page, 'note'), REASON_SENTENCE);
  await expect(cardOf(page, 'note')).toHaveCount(0);
  await openTab(page, TAB_ANSWERED);
  await expect(cardOf(page, 'note')).toBeVisible();
  await expect(footerCount(page)).toHaveText('1 answered');
  rec.note({ saved_with_a_reason: true });
  await bringToTop(cardOf(page, 'note'));
  await rec.shot(page, 'saved');

  const button = applyButton(page);
  await expect(button).toHaveText(APPLY_LABEL);
  const requestId = await pressAndFile(page, button);
  rec.note({ request_id: requestId, pressed_at: utcNow() });
  await expect(button).toHaveText(new RegExp(`^(${APPLY_QUEUED}|${APPLY_RUNNING}|${APPLY_DONE})$`));
  rec.note({ status_line_after_press: await statusLine(page) });

  const watch = await watchApplyButton(page, APPLY_WATCH_MS);
  if (watch.endedAs === null) rec.note({ labels_seen: watch.labels });
  if (watch.endedAs === null) throw new Error(`inconclusive: the apply request was still open after ${APPLY_WATCH_MS / MINUTE_MS} minutes`);
  if (watch.endedAs === APPLY_UNCLAIMED) throw new Error('the apply worker did not take the request: the button read waiting on the worker');
  await expectClosedClean(page, rec, watch);
  await openTab(page, TAB_ARCHIVED);
  await expect(cardOf(page, 'note')).toBeVisible();
  await bringToTop(cardOf(page, 'note'));
  await rec.shot(page, 'done');
});

/* ---------------------------------------------------------------------------
 * Stage `offline`
 * ------------------------------------------------------------------------ */

// Step 7a: with the apply service stopped, a press waits; after the grace the button says so and a second press shows the command.
acceptStep('7a offline press', { shots: ['queued', 'waiting', 'command'] }, async ({ page, context }, rec) => {
  test.setTimeout(OFFLINE_TEST_MS);
  await allowWrites(context, [
    { method: 'PATCH', table: 'attention_items', items: [itemOf('offline')] },
    { method: 'POST', table: 'agent_requests', kind: 'inbox_feedback' },
  ]);
  await openInbox(page);
  await dismissCard(page, cardOf(page, 'offline'));
  await expect(cardOf(page, 'offline')).toHaveCount(0);
  await openTab(page, TAB_ANSWERED);
  await expect(cardOf(page, 'offline')).toBeVisible();
  rec.note({ dismissed: true });

  const button = applyButton(page);
  await expect(button).toHaveText(APPLY_LABEL);
  const requestId = await pressAndFile(page, button);
  rec.note({ request_id: requestId, pressed_at: utcNow() });
  await expect(button).toHaveText(APPLY_QUEUED);
  await expect(actionsRegion(page).getByRole('status')).toHaveText(QUEUED_FROM_BUTTON);
  rec.note({ label_after_press: APPLY_QUEUED, status_line_after_press: QUEUED_FROM_BUTTON });
  await rec.shot(page, 'queued');

  await expect(button).toHaveText(APPLY_UNCLAIMED, { timeout: UNCLAIMED_WAIT_MS });
  rec.note({ label_after_grace: APPLY_UNCLAIMED, waiting_seen_at: utcNow(), status_line_after_grace: await statusLine(page) });
  await rec.shot(page, 'waiting');

  await button.click();
  const command = page.locator('code').filter({ hasText: /^claude "\/inbox-apply \d+"$/ });
  await expect(command).toBeVisible();
  const shown = ((await command.first().innerText()) ?? '').trim();
  rec.note({ command_shown: true, command_names_the_request: shown === `claude "/inbox-apply ${requestId}"` });
  await rec.shot(page, 'command');
  expect(shown, 'the command names the request that was filed').toBe(`claude "/inbox-apply ${requestId}"`);
});

/* ---------------------------------------------------------------------------
 * Stage `back`
 * ------------------------------------------------------------------------ */

// Step 7b: with the apply service started again, the waiting request is taken and closes: the fourth question stands under Archived.
acceptStep('7b taken after', { shots: ['archived'] }, async ({ page }, rec) => {
  const until = Date.now() + TAKEN_AFTER_WAIT_MS;
  let reloads = 0;
  for (;;) {
    await openInbox(page);
    await openTab(page, TAB_ARCHIVED);
    if ((await cardOf(page, 'offline').count()) > 0) break;
    reloads += 1;
    if (Date.now() > until) throw new Error('the waiting request was not taken: the fourth question is not under Archived after three minutes');
    await page.waitForTimeout(RELOAD_EVERY_MS);
  }
  rec.note({ reloads, label_on_the_button: await applyLabel(page), status_line: await statusLine(page) });
  await expect(cardOf(page, 'offline')).toContainText('archived');
  await expect(footerCount(page)).toHaveText(NOTHING_ANSWERED);
  rec.note({ archived_tab_shows: ['offline'], nothing_answered: true });
  await bringToTop(cardOf(page, 'offline'));
  await rec.shot(page, 'archived');
});

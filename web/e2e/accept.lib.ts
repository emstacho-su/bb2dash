/**
 * What the acceptance run's browser tests share (acceptance/README.md at the
 * root of the repository). A phase's tests are in `accept<NN>.spec.ts`; they
 * run under `accept.config.ts`, one at a time, started by the Claude operator
 * inside a throwaway sandbox container:
 *
 *   ACCEPT_ONLY="<title>" npx playwright test -c e2e/accept.config.ts
 *
 * Here, in this order: how a test is declared (the switch and the exact-title
 * rule); the hooks every file registers; the recorder (window-sized shots and
 * one facts file per step); what an earlier step left behind; reading a turn;
 * a question asked and recorded; and the one table write, Archive.
 *
 * THE SWITCH. Without `ACCEPT=1` every test is skipped where it is declared:
 * no hook runs, no page is opened, nothing is written. With it, a test runs
 * only when `ACCEPT_ONLY` is its exact title, so one call runs one test and a
 * pattern can never start several (the walk of 2026-10-07 did that once).
 *
 * WHAT A TEST LEAVES in `ACCEPT_OUT`, a folder outside every repository:
 * `<step>-<label>.png` for each shot it declares, each the size of the window,
 * never the whole page; `<step>.json`, its facts: state, badge, "Used:" line,
 * request and conversation ids, times, and the answer's text;
 * `<step>-fail.png` when it failed. The answer's text is never printed: it
 * quotes course material, and it stays in that folder.
 *
 * THE PAGE IS DRIVEN AS THE OWNER DRIVES IT. Asking and Stop are RPC calls and
 * pass the walk's write guard; every table write is aborted and fails the
 * test, but for Archive in the one test that asks for it (`allowArchive`).
 * Sign-out is aborted too: it would sign out every session of the owner.
 *
 * It reuses the walk's helpers (`walk.ts`, `walk21.lib.ts`,
 * `walk21.window.ts`) and, like them, imports nothing from `src/`.
 */

import { mkdirSync } from 'node:fs';
import { expect, test, type BrowserContext, type Locator, type Page } from '@playwright/test';
import {
  acceptSettings,
  carried,
  deadlineMs,
  isSelected,
  outFile,
  readCarry,
  readFacts,
  requireCarried,
  stepOf,
  writeFacts,
  type AcceptSettings,
  type Facts,
} from './accept.env';
import {
  CHECKOUT_ROOT,
  FILE_NAME,
  MINUTE_MS,
  STORED_SETTLE_MS,
  STREAMING_TEXT_MIN_CHARS,
  TURN_TIMEOUT_MS,
  UUID,
  VIEWPORT,
  ask,
  conversationOf,
  conversationPath,
  expectUncovered,
  inColumnBox,
  lastTurn,
  openSettled,
  registerWalkHooks,
  utcNow,
  workspaceReady,
} from './walk21.lib';
import { expectShotIsTheWindow, pngSize, scrollColumnToTurnStart } from './walk21.window';

/**
 * A test ends by itself inside ten minutes, the longest a single command of
 * the operator may run: a turn is given `TURN_TIMEOUT_MS` (9 minutes; the
 * runner ends one at 8) and the rest is opening the page and recording.
 */
export const ACCEPT_TEST_TIMEOUT_MS = 9.75 * MINUTE_MS;

/** The page's own string (`src/lib/workspace-labels.ts`, `LATE_STREAM_LINE`). Copied, not imported. */
export const LATE_STREAM_LINE = 'Answering…';

/** The Supabase REST path of the one table the list's Archive button writes. */
const ARCHIVE_WRITE = '**/rest/v1/workspace_conversations?**';
/** Supabase's sign-out endpoint, in every scope. */
const SIGN_OUT = '**/auth/v1/logout**';

const CLOSED_STATES = /^(done|failed|stopped)$/;
/** How often a turn is looked at while a test waits on it. */
const LOOK_EVERY_MS = 250;

const SETTINGS: AcceptSettings | null = acceptSettings(process.env, CHECKOUT_ROOT);

function settings(): AcceptSettings {
  if (SETTINGS === null) throw new Error('the acceptance run was not asked for: nothing is read or written unless ACCEPT=1');
  return SETTINGS;
}

/* ---------------------------------------------------------------------------
 * The recorder: window-sized shots and one facts file per step
 * ------------------------------------------------------------------------ */

/** The first line of whatever was thrown: enough to say why, without a stack. */
function firstLine(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.split(/\r?\n/)[0] ?? '';
}

/** Shoots the window as it is, and reads the file back: a shot that is not the window's size fails the test. */
async function shootWindow(page: Page, path: string): Promise<void> {
  expect(page.viewportSize(), "the window is the config's 1440 by 900").toEqual(VIEWPORT);
  await page.screenshot({ path });
  const reported = await page.evaluate(() => ({
    windowWidth: globalThis.innerWidth,
    windowHeight: globalThis.innerHeight,
    devicePixelRatio: globalThis.devicePixelRatio,
  }));
  expectShotIsTheWindow({ ...pngSize(path), ...reported });
}

/** What one step gathers while it runs, and writes when it ends, passed or failed. */
export class Recorder {
  readonly step: string;
  private facts: Facts = {};
  private taken: readonly string[] = [];

  constructor(
    readonly title: string,
    private readonly declaredShots: readonly string[],
    private readonly outDir: string,
  ) {
    this.step = stepOf(title);
    mkdirSync(outDir, { recursive: true });
  }

  /** Adds to the step's facts; a later value of the same name replaces the earlier one. */
  note(more: Facts): void {
    this.facts = { ...this.facts, ...more };
  }

  /** Takes one of the shots the step declares: `<step>-<label>.png`, the size of the window. */
  async shot(page: Page, label: string): Promise<void> {
    if (!this.declaredShots.includes(label)) throw new Error(`step ${this.step} declares no shot labelled "${label}"`);
    const name = `${this.step}-${label}.png`;
    await shootWindow(page, outFile(this.outDir, name));
    this.taken = [...this.taken, name];
  }

  /** A step that passes has taken every shot it declares: the manifest lists them as its evidence. */
  expectEveryShotTaken(): void {
    const expected = this.declaredShots.map((label) => `${this.step}-${label}.png`);
    expect([...this.taken].sort(), `step ${this.step} took the shots it declares`).toEqual([...expected].sort());
  }

  /** The window as it stood when the step failed: `<step>-fail.png`. Its own failure is said, and not thrown over the first. */
  async failShot(page: Page): Promise<void> {
    const name = `${this.step}-fail.png`;
    try {
      await page.screenshot({ path: outFile(this.outDir, name) });
      this.note({ fail_shot: name });
    } catch (error) {
      console.log(`[accept] ${this.title}: no ${name} could be taken: ${firstLine(error)}`);
    }
  }

  /** Writes `<step>.json`, and prints the facts without the answer's text. */
  save(): void {
    const facts = { title: this.title, ...this.facts, shots: this.taken, recorded_at: utcNow() };
    writeFacts(this.outDir, this.step, facts);
    const printed = Object.fromEntries(Object.entries(facts).filter(([name]) => name !== 'answer'));
    console.log(`[accept] ${this.title}: ${JSON.stringify(printed)}`);
  }
}

/* ---------------------------------------------------------------------------
 * How a test is declared
 * ------------------------------------------------------------------------ */

export interface StepDeclaration {
  /** The labels of the shots the test takes; the manifest lists `<step>-<label>.png` for each. */
  shots: readonly string[];
}

export type StepBody = (fixtures: { page: Page; context: BrowserContext }, rec: Recorder) => Promise<void>;

/**
 * Declares one acceptance test. Its title starts with its step's id.
 *
 * It is skipped where it is declared unless `ACCEPT=1` and `ACCEPT_ONLY` is its
 * exact title. When it runs it is handed a recorder, and whatever happens its
 * facts file is written; a failure also leaves `<step>-fail.png`.
 */
export function acceptStep(title: string, declared: StepDeclaration, body: StepBody): void {
  stepOf(title);
  if (!isSelected(process.env, title)) {
    // Declared, so a listing shows it, and skipped where it stands: no hook runs and no page is opened.
    test.skip(title, () => {});
    return;
  }
  test(title, async ({ page, context }) => {
    test.setTimeout(ACCEPT_TEST_TIMEOUT_MS);
    const rec = new Recorder(title, declared.shots, settings().outDir);
    try {
      await body({ page, context }, rec);
      rec.expectEveryShotTaken();
    } catch (error) {
      rec.note({ test_error: firstLine(error) });
      await rec.failShot(page);
      throw error;
    } finally {
      rec.save();
    }
  });
}

/* ---------------------------------------------------------------------------
 * The hooks every acceptance file registers
 * ------------------------------------------------------------------------ */

/** Aborts every sign-out request and records it: a sign-out ends every session of the owner. */
async function guardSignOut(context: BrowserContext): Promise<string[]> {
  const attempted: string[] = [];
  await context.route(SIGN_OUT, async (route) => {
    attempted.push(`${route.request().method()} ${new URL(route.request().url()).pathname}`);
    await route.abort('blockedbyclient');
  });
  return attempted;
}

/**
 * Saves the session back to the stage's state file. The site renews a session
 * as it ages, and a renewed session replaces the old one: the next test, and
 * the host's sign-out of this one session at the end, need the current one.
 * A failure here is said and does not hide the test's own result.
 */
async function keepSession(context: BrowserContext): Promise<void> {
  try {
    await context.storageState({ path: settings().statePath });
  } catch (error) {
    console.log(`[accept] the session could not be saved back: ${firstLine(error)}`);
  }
}

/**
 * Called once at the top of each acceptance spec file. Before each test: the
 * walk's own hooks (the write guard, a cold cache, the console and refused
 * responses) and the sign-out guard. After it: the session is saved back, and
 * an attempted sign-out fails the test.
 */
export function registerAcceptHooks(): void {
  registerWalkHooks();
  let signOuts: string[] = [];

  test.beforeEach(async ({ context }) => {
    signOuts = await guardSignOut(context);
  });

  test.afterEach(async ({ context }) => {
    await keepSession(context);
    expect(signOuts, 'an acceptance test tried to sign out').toEqual([]);
  });
}

/* ---------------------------------------------------------------------------
 * What an earlier step left behind
 * ------------------------------------------------------------------------ */

/** The request an earlier stage's step asked, from the carry-over. */
export function carriedRequest(step: string): number {
  return requireCarried(readCarry(process.env['ACCEPT_IN']), step, 'request_id', 'integer');
}

/**
 * The conversation a step asked into: from that step's facts when it ran in
 * this stage, else from the carry-over. Fails by name when neither holds it.
 */
export function conversationOfStep(step: string): string {
  const here = readFacts(settings().outDir, step)?.['conversation_id'];
  if (typeof here === 'string' && UUID.test(here)) return here;
  return requireCarried(readCarry(process.env['ACCEPT_IN']), step, 'conversation_id', 'uuid');
}

/** The same, or null when the step left no conversation anywhere this stage can read. */
export function conversationOfStepOrNull(step: string): string | null {
  const here = readFacts(settings().outDir, step)?.['conversation_id'];
  if (typeof here === 'string' && UUID.test(here)) return here;
  return carried(readCarry(process.env['ACCEPT_IN']), step, 'conversation_id', 'uuid');
}

/** The stage's time limit, in milliseconds since the epoch (`ACCEPT_DEADLINE`). */
export function stageDeadlineMs(): number {
  return deadlineMs(process.env);
}

/* ---------------------------------------------------------------------------
 * Reading a turn
 * ------------------------------------------------------------------------ */

/** One turn as the page shows it at one moment. */
export interface TurnReading {
  state: string | null;
  requestId: number | null;
  badge: string | null;
  used: string | null;
  line: string | null;
  /** The answer's text; empty when the turn shows none. */
  answer: string;
}

/** Reads a turn in one step in the page, so its state and its text are of the same moment. */
export async function readTurn(turn: Locator): Promise<TurnReading> {
  return turn.evaluate((item) => {
    const textOf = (selector: string): string | null => {
      const node = item.querySelector(selector);
      return node === null ? null : (node.textContent ?? '').trim();
    };
    const id = item.getAttribute('data-request-id') ?? '';
    return {
      state: item.getAttribute('data-turn'),
      requestId: /^\d+$/.test(id) ? Number(id) : null,
      badge: textOf('[data-tier]'),
      used: textOf('[data-used]'),
      line: textOf('[data-turn-line]'),
      answer: textOf('[data-answer-text]') ?? '',
    };
  });
}

/**
 * A reading as facts. The answer's text goes into the facts file and nowhere
 * else. `names_file` says whether the text holds a file's name (`.pdf`,
 * `.docx`, `.pptx`, `.xlsx`): a reading for whoever judges the step, not an
 * assertion.
 */
export function turnFacts(reading: TurnReading): Facts {
  return {
    state: reading.state,
    badge: reading.badge,
    used: reading.used,
    line: reading.line,
    names_file: FILE_NAME.test(reading.answer),
    answer_chars: Array.from(reading.answer).length,
    answer: reading.answer,
  };
}

/** The turn of one request, wherever it stands in the column. */
export function turnOfRequest(page: Page, requestId: number): Locator {
  return page.locator(`li[data-turn][data-request-id="${requestId}"]`);
}

/** Waits until the turn is closed, whatever way it ended, and returns when the page showed it. */
export async function waitClosed(turn: Locator): Promise<string> {
  await expect(turn).toHaveAttribute('data-turn', CLOSED_STATES, { timeout: TURN_TIMEOUT_MS });
  return utcNow();
}

/**
 * Waits until answer text is streaming: the request is claimed and at least
 * `STREAMING_TEXT_MIN_CHARS` of its answer are on the page. True when that was
 * seen; false when the turn closed first, which the caller reports in its own
 * words. It stops looking as soon as either is known.
 */
export async function waitStreaming(page: Page, turn: Locator): Promise<boolean> {
  const until = Date.now() + TURN_TIMEOUT_MS;
  for (;;) {
    const reading = await readTurn(turn);
    if (reading.state === 'streaming' && Array.from(reading.answer).length >= STREAMING_TEXT_MIN_CHARS) return true;
    if (reading.state !== null && CLOSED_STATES.test(reading.state)) return false;
    if (Date.now() > until) throw new Error("no answer text was streaming when the turn's time ran out");
    await page.waitForTimeout(LOOK_EVERY_MS);
  }
}

/** What `watchAnswering` saw. */
export interface AnsweringWatch {
  /** How many times the turn was seen being written, each time with the line and no text. */
  looks: number;
  /** The state the turn had when it was no longer being written. */
  endedAs: string | null;
}

/**
 * Looks at a turn of a reloaded page until it is no longer being written. At
 * every look while it is, the page must say "Answering…" and show no answer
 * text: a look that finds half-written text fails the test at once.
 */
export async function watchAnswering(page: Page, turn: Locator): Promise<AnsweringWatch> {
  const until = Date.now() + TURN_TIMEOUT_MS;
  for (let looks = 0; ; looks += 1) {
    const reading = await readTurn(turn);
    if (reading.state !== 'streaming') return { looks, endedAs: reading.state };
    expect(reading.line, 'while the answer is being written the reloaded page says so').toBe(LATE_STREAM_LINE);
    expect(reading.answer, 'and it shows no half-written text').toBe('');
    if (Date.now() > until) throw new Error("the answer was still being written when the turn's time ran out");
    await page.waitForTimeout(LOOK_EVERY_MS);
  }
}

/** A conversation is open and its rows are read, whether or not a request is open in it. */
export async function conversationShown(page: Page): Promise<void> {
  await expect(page.getByRole('heading', { name: 'Workspace', level: 1 })).toBeVisible();
  await expect(page.locator('[data-column-empty="loading"]')).toHaveCount(0);
}

/* ---------------------------------------------------------------------------
 * A question asked and recorded
 * ------------------------------------------------------------------------ */

export interface LiveQuestion {
  /** The conversation to ask into; null starts one. */
  conversation: string | null;
  question: string;
  /** The badge the answer must carry. */
  badge: string;
  /** What the "Used:" line must name; empty when the step names no tool. */
  usedTools: readonly string[];
}

/** Asks on the page as it stands, and notes the ids and the time: from here the step has a request. */
export async function askHere(page: Page, rec: Recorder, question: string): Promise<Locator> {
  await workspaceReady(page);
  const askedAt = await ask(page, question);
  const turn = lastTurn(page);
  await expect(turn).toHaveAttribute('data-request-id', /^\d+$/);
  const requestId = Number(await turn.getAttribute('data-request-id'));
  rec.note({ conversation_id: conversationOf(page), request_id: requestId, asked_at: askedAt });
  return turnOfRequest(page, requestId);
}

/** Opens the conversation (null starts one) and asks into it. */
export async function askInto(page: Page, rec: Recorder, conversation: string | null, question: string): Promise<Locator> {
  await openSettled(page, conversationPath(conversation));
  return askHere(page, rec, question);
}

/** Where the things a turn's two shots are for stood when each shot was taken. */
export interface TurnShots {
  /** The "Used:" line was inside the column's visible box in the end shot; null when the turn has none. */
  usedLineInView: boolean | null;
  /** The question was inside the column's visible box in the start shot. */
  questionInView: boolean;
  /** The badge was inside the column's visible box in the start shot; null when the turn has none. */
  badgeInView: boolean | null;
}

/**
 * The two shots of a turn. First the window as it stands (the reader stayed at
 * the end, where the "Used:" line lands); then the column scrolled, and only
 * the column, to the turn's start, with its badge. Nothing is asserted here:
 * where each thing stood is noted in the facts and returned.
 */
export async function shootTurn(page: Page, rec: Recorder, turn: Locator, question: string): Promise<TurnShots> {
  const used = turn.locator('[data-used]');
  const usedLineInView = (await used.count()) === 0 ? null : (await inColumnBox(used)).inside;
  await rec.shot(page, 'end');

  await scrollColumnToTurnStart(page, turn);
  const badge = turn.locator('[data-tier]');
  const questionInView = (await inColumnBox(turn.getByText(question, { exact: true }))).inside;
  const badgeInView = (await badge.count()) === 0 ? null : (await inColumnBox(badge)).inside;
  await rec.shot(page, 'start');

  const shots: TurnShots = { usedLineInView, questionInView, badgeInView };
  rec.note({ end_shot: { used_line_in_view: usedLineInView }, start_shot: { question_in_view: questionInView, badge_in_view: badgeInView } });
  return shots;
}

/**
 * The two shots show what they are for: the turn's start with its question and
 * badge, and its end with its "Used:" line when it has one. Called while the
 * column still stands where the start shot left it.
 */
export async function expectShotsShowTheTurn(turn: Locator, question: string, shots: TurnShots): Promise<void> {
  expect(shots.questionInView, "the question is inside the column's visible box in the start shot").toBe(true);
  expect(shots.badgeInView, "the badge is inside the column's visible box in the start shot").toBe(true);
  await expectUncovered(turn.getByText(question, { exact: true }));
  await expectUncovered(turn.locator('[data-tier]'));
  if (shots.usedLineInView !== null) {
    expect(shots.usedLineInView, 'the "Used:" line is in view for a reader who stayed at the end of the column').toBe(true);
  }
}

/** What a finished answer must show: done, its badge, text, no line under it, and the tools on its "Used:" line. */
export async function expectAnswered(turn: Locator, live: Pick<LiveQuestion, 'badge' | 'usedTools'>): Promise<void> {
  await expect(turn).toHaveAttribute('data-turn', 'done');
  await expect(turn.locator('[data-tier]')).toHaveText(live.badge);
  await expect(turn.locator('[data-answer-text]')).not.toBeEmpty();
  await expect(turn.locator('[data-turn-line]')).toHaveCount(0);
  for (const tool of live.usedTools) {
    await expect(turn.locator('[data-used]')).toContainText(/^Used: /);
    await expect(turn.locator('[data-used]')).toContainText(tool);
  }
}

/**
 * Asks one question, waits for its stored answer, records it (facts and two
 * shots) and then asserts it. The record is made first, so a step that fails
 * still leaves what the page showed. Returns the reading, for a step that
 * notes more about it.
 */
export async function askAndRecord(page: Page, rec: Recorder, live: LiveQuestion): Promise<TurnReading> {
  const turn = await askInto(page, rec, live.conversation, live.question);
  rec.note({ closed_at: await waitClosed(turn) });
  // One messages poll: the stored row has replaced the live text, and brought the "Used:" line.
  await page.waitForTimeout(STORED_SETTLE_MS);
  const reading = await readTurn(turn);
  rec.note(turnFacts(reading));
  const shots = await shootTurn(page, rec, turn, live.question);
  await expectAnswered(turn, live);
  await expectShotsShowTheTurn(turn, live.question, shots);
  return reading;
}

/* ---------------------------------------------------------------------------
 * The one table write: Archive
 * ------------------------------------------------------------------------ */

/**
 * Lets the list's own Archive write through, and nothing else: a PATCH of
 * `workspace_conversations` (the pattern of `walk21.spec.ts`). Registered after
 * the write guard, so it is asked first; every other write still reaches the
 * guard and fails the test. Returns the writes it let through.
 */
export async function allowArchive(context: BrowserContext): Promise<string[]> {
  const allowed: string[] = [];
  await context.route(ARCHIVE_WRITE, async (route) => {
    const request = route.request();
    if (request.method() !== 'PATCH') {
      await route.fallback();
      return;
    }
    allowed.push(`${request.method()} ${new URL(request.url()).pathname}`);
    await route.continue();
  });
  return allowed;
}

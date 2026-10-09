/**
 * The planner and grades feed as the prompt holds it (brief 109, The planner and grades feed): the
 * jsonb of `workspace_planner_feed` rendered as text, one line a row, no key repeated, no id.
 * `test/fixtures/contract24/feed-block.txt` is the frozen form, byte for byte.
 *
 * When the block would pass its ceiling, rows go in this order: the undated work rows, then the
 * score rows oldest first, then the work rows farthest from today. The last line says how many rows
 * of each part were left out, the function's own `work_more` and `scores_more` included.
 */

import { CEILING_BYTES, utf8Bytes } from './budget.js';
import { oneLine } from './fence.js';

const NEW_YORK = 'America/New_York';
const NONE = '-';
const VALUE_SEPARATOR = ' | ';
const VALUE_SEPARATOR_REPLACEMENT = ' / ';
const TITLE_MAX = 120;

export interface FeedWorkRow {
  readonly itemKind: string;
  readonly courseId: string | null;
  readonly title: string | null;
  readonly type: string | null;
  readonly dueAt: string | null;
  readonly dueOn: string | null;
  readonly undated: boolean;
  readonly status: string | null;
  readonly pointsPossible: number | string | null;
  readonly inWorkload: boolean | null;
}

export interface FeedScoreRow {
  readonly courseId: string | null;
  readonly name: string | null;
  readonly possible: number | string | null;
  readonly displayScore: number | string | null;
  readonly displayGrade: string | null;
  readonly gradesReleased: boolean | null;
  readonly isExempt: boolean | null;
  readonly submissionStatus: string | null;
  readonly seenAt: string | null;
}

export interface Feed {
  readonly asOf: string;
  readonly from: string;
  readonly to: string;
  readonly work: readonly FeedWorkRow[];
  readonly scores: readonly FeedScoreRow[];
  readonly workMore: number;
  readonly scoresMore: number;
}

type Json = Record<string, unknown>;

const isRecord = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value);
const textOrNull = (value: unknown): string | null => (typeof value === 'string' ? value : null);
const boolOrNull = (value: unknown): boolean | null => (typeof value === 'boolean' ? value : null);
const countOf = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0);
const numberOrText = (value: unknown): number | string | null => (typeof value === 'number' || typeof value === 'string' ? value : null);
const rowsOf = (value: unknown): Json[] => (Array.isArray(value) ? value.filter(isRecord) : []);

function workRowOf(row: Json): FeedWorkRow {
  return {
    itemKind: textOrNull(row.item_kind) ?? '',
    courseId: textOrNull(row.course_id),
    title: textOrNull(row.title),
    type: textOrNull(row.type),
    dueAt: textOrNull(row.due_at),
    dueOn: textOrNull(row.due_on),
    undated: row.undated === true,
    status: textOrNull(row.status),
    pointsPossible: numberOrText(row.points_possible),
    inWorkload: boolOrNull(row.in_workload),
  };
}

function scoreRowOf(row: Json): FeedScoreRow {
  return {
    courseId: textOrNull(row.course_id),
    name: textOrNull(row.name),
    possible: numberOrText(row.possible),
    displayScore: numberOrText(row.display_score),
    displayGrade: textOrNull(row.display_grade),
    gradesReleased: boolOrNull(row.grades_released),
    isExempt: boolOrNull(row.is_exempt),
    submissionStatus: textOrNull(row.submission_status),
    seenAt: textOrNull(row.seen_at),
  };
}

/** The feed's jsonb as a typed value; null when it is not an object with a window. */
export function parseFeed(raw: unknown): Feed | null {
  if (!isRecord(raw) || typeof raw.as_of !== 'string' || typeof raw.from !== 'string' || typeof raw.to !== 'string') return null;
  return {
    asOf: raw.as_of,
    from: raw.from,
    to: raw.to,
    work: rowsOf(raw.work).map(workRowOf),
    scores: rowsOf(raw.scores).map(scoreRowOf),
    workMore: countOf(raw.work_more),
    scoresMore: countOf(raw.scores_more),
  };
}

const NEW_YORK_FORMAT = new Intl.DateTimeFormat('en-CA', {
  timeZone: NEW_YORK,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

function newYorkParts(iso: string): Record<string, string> | null {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return null;
  return Object.fromEntries(NEW_YORK_FORMAT.formatToParts(at).map((part) => [part.type, part.value]));
}

/** `YYYY-MM-DD` of an instant on the New York wall clock; the text itself when it is not an instant. */
function newYorkDate(iso: string): string {
  const p = newYorkParts(iso);
  return p === null ? iso : `${p.year}-${p.month}-${p.day}`;
}

/** `YYYY-MM-DD HH:MM` on the New York wall clock. */
function newYorkDateTime(iso: string): string {
  const p = newYorkParts(iso);
  return p === null ? iso : `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
}

/** One value as a cell: a null is `-`, a boolean `Y` or `N`, a number as the jsonb holds it, one line, no ` | `. */
function cell(value: string | number | boolean | null, maxChars?: number): string {
  if (value === null || value === '') return NONE;
  if (typeof value === 'boolean') return value ? 'Y' : 'N';
  const text = String(value).replace(/\s+/g, ' ').trim().split(VALUE_SEPARATOR).join(VALUE_SEPARATOR_REPLACEMENT);
  return maxChars === undefined ? text : oneLine(text, maxChars);
}

function dueCell(row: FeedWorkRow): string {
  if (row.undated) return NONE;
  if (row.dueAt !== null) return newYorkDateTime(row.dueAt);
  return row.dueOn ?? NONE;
}

function workLine(row: FeedWorkRow): string {
  return [
    row.itemKind === 'reading' ? 'R' : 'A',
    cell(row.courseId),
    dueCell(row),
    cell(row.status),
    cell(row.type),
    cell(row.pointsPossible),
    cell(row.inWorkload),
    cell(row.title, TITLE_MAX),
  ].join(VALUE_SEPARATOR);
}

function scoreLine(row: FeedScoreRow): string {
  return [
    cell(row.courseId),
    cell(row.name, TITLE_MAX),
    cell(row.displayScore),
    cell(row.possible),
    cell(row.displayGrade),
    cell(row.gradesReleased),
    cell(row.isExempt),
    cell(row.submissionStatus),
    row.seenAt === null ? NONE : newYorkDate(row.seenAt),
  ].join(VALUE_SEPARATOR);
}

export interface RenderedFeed {
  readonly text: string;
  /** Rows of both parts that went in. */
  readonly rows: number;
  readonly workLeftOut: number;
  readonly scoresLeftOut: number;
}

const WORK_HEADER = 'work: kind | course | due | status | type | points | workload | title';
const SCORES_HEADER = 'scores: course | name | score | possible | grade | released | exempt | submission | seen';

interface Rows {
  readonly work: readonly FeedWorkRow[];
  readonly scores: readonly FeedScoreRow[];
}

function textOf(feed: Feed, rows: Rows, workOut: number, scoresOut: number): string {
  return [
    `Planner and grades, read ${newYorkDateTime(feed.asOf)} New York time. Work due ${feed.from} to ${feed.to}; posted scores are not limited to those dates.`,
    'The "graded so far" figure is on the Grades screen. Never work out, project or suppose a grade.',
    WORK_HEADER,
    ...rows.work.map(workLine),
    SCORES_HEADER,
    ...rows.scores.map(scoreLine),
    `left out: ${workOut} work rows, ${scoresOut} score rows`,
  ].join('\n');
}

/** Drop one row by the cut order; null when nothing is left to drop. */
function dropOne(rows: Rows): { rows: Rows; part: 'work' | 'scores' } | null {
  const lastUndated = rows.work.map((row) => row.undated).lastIndexOf(true);
  if (lastUndated !== -1) return { rows: { ...rows, work: rows.work.filter((_, at) => at !== lastUndated) }, part: 'work' };
  // Scores come newest first, so the oldest is the last.
  if (rows.scores.length > 0) return { rows: { ...rows, scores: rows.scores.slice(0, -1) }, part: 'scores' };
  // Work rows come nearest today first, so the farthest is the last.
  if (rows.work.length > 0) return { rows: { ...rows, work: rows.work.slice(0, -1) }, part: 'work' };
  return null;
}

/** The feed as the text of its block, within `maxBytes`. */
export function renderFeed(feed: Feed, maxBytes: number = CEILING_BYTES.feed): RenderedFeed {
  let rows: Rows = { work: feed.work, scores: feed.scores };
  let workCut = 0;
  let scoresCut = 0;
  const render = (): string => textOf(feed, rows, feed.workMore + workCut, feed.scoresMore + scoresCut);
  let text = render();
  while (utf8Bytes(text) > maxBytes) {
    const next = dropOne(rows);
    if (next === null) break;
    rows = next.rows;
    if (next.part === 'work') workCut += 1;
    else scoresCut += 1;
    text = render();
  }
  return { text, rows: rows.work.length + rows.scores.length, workLeftOut: feed.workMore + workCut, scoresLeftOut: feed.scoresMore + scoresCut };
}

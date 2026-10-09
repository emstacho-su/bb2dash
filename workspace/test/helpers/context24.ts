/**
 * Builders for the Phase 24a tests, made from the PM's frozen fixtures (`fixtures/contract24`).
 * All text is synthetic.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseFeed, type Feed } from '../../src/context/feed.js';
import { parseBatchAnswer, type AttachmentRead, type BatchAnswer, type Hit } from '../../src/store-types.js';
import { parseTurnContext, type TurnContext } from '../../src/turn-context.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const CONTRACT = path.resolve(HERE, '..', 'fixtures', 'contract24');

export const readContractJson = (name: string): unknown => JSON.parse(fs.readFileSync(path.join(CONTRACT, name), 'utf8'));

/** A text file of the contract folder without its one final newline, the way its README compares it. */
export const readContractText = (name: string): string => fs.readFileSync(path.join(CONTRACT, name), 'utf8').replace(/\n$/, '');

export const MARKER = '0123456789abcdef';

export function contextFixture(overrides: Partial<TurnContext> = {}): TurnContext {
  return { ...parseTurnContext(readContractJson('turn-context.json')), ...overrides };
}

export function emptyContext(overrides: Partial<TurnContext> = {}): TurnContext {
  return contextFixture({
    options: { depth: 'auto', format: 'plain', routineId: null, courseDisplayId: null, courseIds: null },
    routine: null,
    attachments: [],
    aboutMe: null,
    rollingSummary: null,
    summarisedThrough: null,
    messages: [],
    messagesLeftOut: 0,
    ...overrides,
  });
}

export function feedFixture(): Feed {
  const feed = parseFeed(readContractJson('planner-feed.json'));
  if (feed === null) throw new Error('planner-feed.json does not parse');
  return feed;
}

export function batchAnswerFixture(): BatchAnswer {
  const answer = parseBatchAnswer(JSON.stringify(readContractJson('batch-answer.json')));
  if (answer === null) throw new Error('batch-answer.json does not parse');
  return answer;
}

export function hitFixture(overrides: Partial<Hit> = {}): Hit {
  return {
    kind: 'material',
    unitId: 9001,
    fileId: 412,
    documentId: null,
    courseId: 'BIO.110',
    title: 'Week 5 slides.pptx',
    unitKind: 'slide',
    unitNo: 7,
    partNo: 1,
    similarity: 0.871,
    score: 0.0392,
    passage: 'Synthetic passage: passive transport moves a solute down its gradient.',
    hasNotes: false,
    writtenAt: null,
    ...overrides,
  };
}

export function attachmentFixture(overrides: Partial<AttachmentRead> = {}): AttachmentRead {
  const [file] = batchAnswerFixture().attachments;
  if (file === undefined) throw new Error('batch-answer.json holds no attachment');
  return { ...file, ...overrides };
}

/** Synthetic work and score rows in the feed's jsonb shape, for the counts the challenge round read on prod. */
export function bigFeedJson(workRows: number, scoreRows: number): unknown {
  const base = readContractJson('planner-feed.json') as Record<string, unknown>;
  const work = Array.from({ length: workRows }, (_, i) => ({
    item_kind: i % 4 === 0 ? 'reading' : 'assignment',
    item_id: `X${i}`,
    course_id: `CRS.${100 + (i % 5)}`,
    title: `Synthetic work item number ${i} with a title of ordinary length`,
    type: 'homework',
    due_at: `2026-10-${String(9 + (i % 20)).padStart(2, '0')}T03:59:00+00:00`,
    due_on: `2026-10-${String(8 + (i % 20)).padStart(2, '0')}`,
    undated: false,
    status: 'not_started',
    points_possible: 10,
    in_workload: true,
  }));
  const scores = Array.from({ length: scoreRows }, (_, i) => ({
    course_id: `CRS.${100 + (i % 5)}`,
    column_id: `_${i}_1`,
    name: `Synthetic graded column ${i}`,
    possible: 20,
    display_score: 17.5,
    display_grade: null,
    grades_released: true,
    is_exempt: false,
    submission_status: 'graded',
    seen_at: '2026-10-06T14:20:11+00:00',
    assignment_id: null,
  }));
  return { ...base, work, scores, work_more: 0, scores_more: 0 };
}

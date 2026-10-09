/**
 * `workspace_turn_context`'s jsonb as a typed value (brief 109, The question's path, step 3; the
 * sample is `test/fixtures/contract24/turn-context.json`). The function refuses a request the
 * caller does not hold; what it hands back is read here by type, and a missing or malformed part
 * becomes its plain default (a request with no options row is depth auto, format plain).
 */

import { isDepth, type Depth } from './depth.js';
import { isTier, type Tier } from './tiers.js';

export type AnswerFormat = 'plain' | 'rich';

export interface RequestOptions {
  readonly depth: Depth;
  readonly format: AnswerFormat;
  readonly routineId: string | null;
  readonly courseDisplayId: string | null;
  readonly courseIds: readonly string[] | null;
}

export interface Routine {
  readonly id: string;
  readonly title: string;
  readonly instructions: string;
}

export interface AttachmentRef {
  readonly ord: number;
  readonly kind: 'file' | 'upload';
  readonly id: number;
  readonly title: string;
  readonly state: string;
}

export interface StoredMessage {
  readonly id: string;
  readonly role: 'user' | 'assistant';
  readonly content: string;
  readonly createdAt: string;
  readonly errorCode: string | null;
}

export interface CourseRef {
  readonly id: string;
  readonly title: string;
  readonly displayId: string;
}

export interface TurnContext {
  readonly options: RequestOptions;
  readonly routine: Routine | null;
  readonly attachments: readonly AttachmentRef[];
  readonly aboutMe: string | null;
  readonly rollingSummary: string | null;
  readonly summarisedThrough: string | null;
  readonly messages: readonly StoredMessage[];
  readonly messagesLeftOut: number;
  readonly lastAutoTier: Tier | null;
  readonly courses: readonly CourseRef[];
  readonly today: string;
}

/** Raised when the jsonb is not an object at all: the turn then has no context to answer from. */
export class TurnContextError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TurnContextError';
  }
}

type Json = Record<string, unknown>;

const isRecord = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value);
const str = (value: unknown): string | null => (typeof value === 'string' ? value : null);
const nonEmpty = (value: unknown): string | null => (typeof value === 'string' && value.trim() !== '' ? value : null);
const int = (value: unknown): number | null => (typeof value === 'number' && Number.isInteger(value) ? value : null);
const list = (value: unknown): Json[] => (Array.isArray(value) ? value.filter(isRecord) : []);

function optionsOf(raw: unknown): RequestOptions {
  const row = isRecord(raw) ? raw : {};
  return {
    depth: isDepth(row.depth) ? row.depth : 'auto',
    format: row.format === 'rich' ? 'rich' : 'plain',
    routineId: nonEmpty(row.routine_id),
    courseDisplayId: nonEmpty(row.course_display_id),
    courseIds: Array.isArray(row.course_ids) ? row.course_ids.filter((id): id is string => typeof id === 'string' && id !== '') : null,
  };
}

function routineOf(raw: unknown): Routine | null {
  if (!isRecord(raw)) return null;
  const id = nonEmpty(raw.id);
  const instructions = str(raw.instructions);
  return id === null || instructions === null ? null : { id, title: str(raw.title) ?? id, instructions };
}

function attachmentsOf(raw: unknown): AttachmentRef[] {
  return list(raw).flatMap((row) => {
    const id = int(row.id);
    const ord = int(row.ord);
    const kind = row.kind === 'file' || row.kind === 'upload' ? row.kind : null;
    return id === null || ord === null || kind === null ? [] : [{ ord, kind, id, title: str(row.title) ?? '', state: str(row.state) ?? 'missing' }];
  });
}

function messagesOf(raw: unknown): StoredMessage[] {
  return list(raw).flatMap((row) => {
    const role = row.role === 'user' || row.role === 'assistant' ? row.role : null;
    if (role === null) return [];
    return [{ id: str(row.id) ?? '', role, content: str(row.content) ?? '', createdAt: str(row.created_at) ?? '', errorCode: nonEmpty(row.error_code) }];
  });
}

function coursesOf(raw: unknown): CourseRef[] {
  return list(raw).flatMap((row) => {
    const id = nonEmpty(row.id);
    return id === null ? [] : [{ id, title: str(row.title) ?? '', displayId: str(row.display_id) ?? id }];
  });
}

export function parseTurnContext(raw: unknown): TurnContext {
  if (!isRecord(raw)) throw new TurnContextError('workspace_turn_context returned no object');
  return {
    options: optionsOf(raw.options),
    routine: routineOf(raw.routine),
    attachments: attachmentsOf(raw.attachments),
    aboutMe: nonEmpty(raw.about_me),
    rollingSummary: nonEmpty(raw.rolling_summary),
    summarisedThrough: str(raw.summarised_through),
    messages: messagesOf(raw.messages),
    messagesLeftOut: int(raw.messages_left_out) ?? 0,
    lastAutoTier: isTier(raw.last_auto_tier) ? raw.last_auto_tier : null,
    courses: coursesOf(raw.courses),
    today: str(raw.today) ?? '',
  };
}

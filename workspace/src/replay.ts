/**
 * The replay a fresh start carries (brief 102, Contract, Continuity): the conversation's stored
 * messages in front of the new question, so a conversation whose CLI session is gone goes on from
 * what the database holds.
 *
 * Built newest first, at most HISTORY_REPLAY messages, within REPLAY_MAX_BYTES of UTF-8 with the
 * framing counted, and emitted oldest first. The first message that does not fit whole is cut to
 * what is left and marked; nothing older follows it. The question itself is not part of the
 * history (it is the prompt), so it is never repeated, and with the question's own 32000 bytes at
 * most the prompt element stays under the kernel's 131072 bytes per argument.
 */

import { HISTORY_REPLAY, REPLAY_MAX_BYTES } from './config.js';
import type { HistoryMessage } from './providers/types.js';

export const REPLAY_HEADER = 'Earlier messages in this conversation, oldest first:';
export const QUESTION_HEADER = 'The new question:';
const CUT_MARK = ' [cut]';
const BLOCK_GAP = '\n\n';
const COMMAND_PREFIX = '/';
/** A cut message is kept only when at least this much of it fits. */
const MIN_CUT_BYTES = 64;

export function utf8Bytes(text: string): number {
  return Buffer.byteLength(text, 'utf8');
}

const label = (message: HistoryMessage): string => `[${message.role}]\n`;

/** The longest prefix of `text` within `maxBytes` of UTF-8, never ending inside a character. */
function prefixWithin(text: string, maxBytes: number): string {
  if (utf8Bytes(text) <= maxBytes) return text;
  let end = Math.max(0, maxBytes);
  const bytes = Buffer.from(text, 'utf8');
  // Step back off a continuation byte so the cut lands on a character boundary.
  while (end > 0 && ((bytes[end] ?? 0) & 0xc0) === 0x80) end -= 1;
  return bytes.subarray(0, end).toString('utf8');
}

/** One message as a replay block, whole when it fits in `budget` bytes, else cut, else null. */
function blockWithin(message: HistoryMessage, budget: number): { text: string; whole: boolean } | null {
  const whole = `${label(message)}${message.content}${BLOCK_GAP}`;
  if (utf8Bytes(whole) <= budget) return { text: whole, whole: true };
  const room = budget - utf8Bytes(label(message)) - utf8Bytes(CUT_MARK) - utf8Bytes(BLOCK_GAP);
  if (room < MIN_CUT_BYTES) return null;
  return { text: `${label(message)}${prefixWithin(message.content, room)}${CUT_MARK}${BLOCK_GAP}`, whole: false };
}

/**
 * The question as the CLI must read it: as a question. The CLI reads a prompt that opens with `/`
 * as one of its own commands, so such a question goes under the question header instead.
 */
export function asQuestion(question: string): string {
  return question.trimStart().startsWith(COMMAND_PREFIX) ? `${QUESTION_HEADER}${BLOCK_GAP}${question}` : question;
}

/** The prompt element: the question alone, or the replay and then the question. */
export function buildPrompt(history: readonly HistoryMessage[], question: string): string {
  const stored = history.filter((message) => message.content !== '').slice(-HISTORY_REPLAY);
  if (stored.length === 0) return asQuestion(question);

  const head = `${REPLAY_HEADER}${BLOCK_GAP}`;
  const tail = `${QUESTION_HEADER}${BLOCK_GAP}`;
  let budget = REPLAY_MAX_BYTES - utf8Bytes(head) - utf8Bytes(tail);
  const blocks: string[] = [];
  for (const message of [...stored].reverse()) {
    const block = blockWithin(message, budget);
    if (block === null) break;
    blocks.unshift(block.text);
    budget -= utf8Bytes(block.text);
    if (!block.whole) break;
  }
  if (blocks.length === 0) return asQuestion(question);
  return `${head}${blocks.join('')}${tail}${question}`;
}

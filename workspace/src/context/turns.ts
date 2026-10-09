/**
 * The conversation's recent turns as blocks (brief 109, "Byte budget", the recent-turns block).
 * Each earlier message is its own `turn` block, so an earlier answer that quoted a document cannot
 * close its block either.
 *
 * Messages are taken newest first and handed back oldest first. No message takes more than half of
 * the block: a larger one keeps its start and its end, a quarter of the block each, with one line
 * between that gives the bytes left out. A message that does not fit whole at the block's end is
 * cut the same way when at least MIN_CUT_BYTES of it fit, else left out, and nothing older follows.
 */

import { MIN_CUT_BYTES, cutMiddle, keptEach, leftOutLine, utf8Bytes } from './budget.js';
import { makeBlock } from './fence.js';
import type { StoredMessage } from '../turn-context.js';

const BLOCK_GAP_BYTES = 2;
const NO_TEXT = '(no text)';
const STOPPED_CODE = 'cancelled';
const CREATED_AT_SHOWN_CHARS = 16;

export interface TurnBlocks {
  /** Oldest first. */
  readonly blocks: readonly string[];
  /** Bytes the blocks take, the gaps between them counted. */
  readonly bytes: number;
  /** Messages with something to show that no block holds, because the room ran out. */
  readonly leftOut: number;
}

/** The header of a turn block: the role, when, and a stopped or failed answer marked with its code. */
export function turnHeader(message: StoredMessage): string {
  const mark =
    message.errorCode === null ? '' : message.errorCode === STOPPED_CODE ? ` (stopped: ${message.errorCode})` : ` (failed: ${message.errorCode})`;
  const when = message.createdAt === '' ? '' : `, ${message.createdAt.slice(0, CREATED_AT_SHOWN_CHARS).replace('T', ' ')}`;
  return `${message.role}${when}${mark}`;
}

/** The text a message shows: its content, `(no text)` for a stopped or failed answer with none, null to skip it. */
function shownContent(message: StoredMessage): string | null {
  if (message.content !== '') return message.content;
  return message.errorCode === null ? null : NO_TEXT;
}

function blockOf(marker: string, message: StoredMessage, content: string): string {
  return makeBlock(marker, 'turn', null, turnHeader(message), content);
}

/** The message cut to fit `room` bytes of block, or null when too little of it would fit. */
function cutToRoom(marker: string, message: StoredMessage, content: string, room: number): string | null {
  const overhead = utf8Bytes(blockOf(marker, message, '')) + BLOCK_GAP_BYTES + utf8Bytes(leftOutLine(utf8Bytes(content))) + 2;
  const available = room - overhead;
  if (available < MIN_CUT_BYTES) return null;
  let each = Math.floor(available / 2);
  for (let tries = 0; tries < 4; tries += 1) {
    const block = blockOf(marker, message, cutMiddle(content, each));
    if (utf8Bytes(block) + BLOCK_GAP_BYTES <= room) return block;
    each = Math.max(1, Math.floor(each * 0.9));
  }
  return null;
}

export function buildTurnBlocks(messages: readonly StoredMessage[], marker: string, blockBytes: number): TurnBlocks {
  const taken: string[] = [];
  let remaining = blockBytes;
  let leftOut = 0;
  let stopped = false;
  for (const message of [...messages].reverse()) {
    const shown = shownContent(message);
    if (shown === null) continue;
    if (stopped) {
      leftOut += 1;
      continue;
    }
    const content = utf8Bytes(shown) > blockBytes / 2 ? cutMiddle(shown, keptEach(blockBytes)) : shown;
    const block = blockOf(marker, message, content);
    if (utf8Bytes(block) + BLOCK_GAP_BYTES <= remaining) {
      taken.unshift(block);
      remaining -= utf8Bytes(block) + BLOCK_GAP_BYTES;
      continue;
    }
    stopped = true;
    const cut = cutToRoom(marker, message, content, remaining);
    if (cut === null) {
      leftOut += 1;
      continue;
    }
    taken.unshift(cut);
    remaining -= utf8Bytes(cut) + BLOCK_GAP_BYTES;
  }
  return { blocks: taken, bytes: blockBytes - remaining, leftOut };
}

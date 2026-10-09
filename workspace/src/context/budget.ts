/**
 * The byte budget of the prompt argument (brief 109, The two turns, "Byte budget"). The argument
 * stays under the kernel's 131,072 bytes (`ARG_MAX_BYTES`); the runner assembles to 128,000.
 *
 * Six blocks have a ceiling and take only what they need. Two blocks share the spare, which is
 * 128,000 minus the real size of the six and is never under 48,000.
 */

export const PROMPT_TARGET_BYTES = 128_000;

export const CEILING_BYTES = Object.freeze({
  question: 32_000,
  passages: 28_000,
  feed: 12_000,
  summary: 3_000,
  memory: 3_000,
  framing: 2_000,
});

export const PASSAGES_MAX = 14;
export const PASSAGE_MAX_BYTES = 2_000;
export const MEMORY_ITEMS_MAX = 3;
export const MEMORY_ITEM_MAX_BYTES = 1_000;

/** The recent turns are never given less than this. */
export const RECENT_FLOOR_BYTES = 14_400;
/** With no attachment the recent turns take the whole spare, up to today's replay size. */
export const RECENT_MAX_BYTES = 96_000;
/** The attached documents are never given less than this. */
export const ATTACHED_FLOOR_BYTES = 33_600;
/** With an attachment the recent turns get this share of the spare and the documents the rest. */
const RECENT_SHARE_WITH_ATTACHMENT = 0.3;
/** A cut message is kept only when at least this much of it fits. */
export const MIN_CUT_BYTES = 64;

export function utf8Bytes(text: string): number {
  return Buffer.byteLength(text, 'utf8');
}

/** The longest start of `text` within `maxBytes` of UTF-8, never ending inside a character. */
export function prefixWithin(text: string, maxBytes: number): string {
  if (utf8Bytes(text) <= maxBytes) return text;
  const bytes = Buffer.from(text, 'utf8');
  let end = Math.max(0, maxBytes);
  while (end > 0 && ((bytes[end] ?? 0) & 0xc0) === 0x80) end -= 1;
  return bytes.subarray(0, end).toString('utf8');
}

/** The longest end of `text` within `maxBytes` of UTF-8, never starting inside a character. */
export function suffixWithin(text: string, maxBytes: number): string {
  if (utf8Bytes(text) <= maxBytes) return text;
  const bytes = Buffer.from(text, 'utf8');
  let start = Math.max(0, bytes.length - Math.max(0, maxBytes));
  while (start < bytes.length && ((bytes[start] ?? 0) & 0xc0) === 0x80) start += 1;
  return bytes.subarray(start).toString('utf8');
}

/** The spare: what the target leaves once the six ceilinged blocks are the size they really are. */
export function spareBytes(realSizes: readonly number[]): number {
  return PROMPT_TARGET_BYTES - realSizes.reduce((sum, size) => sum + size, 0);
}

/** The recent-turns block's room. */
export function recentBudget(spare: number, hasAttachment: boolean): number {
  const room = hasAttachment ? Math.floor(spare * RECENT_SHARE_WITH_ATTACHMENT) : Math.min(spare, RECENT_MAX_BYTES);
  return Math.max(RECENT_FLOOR_BYTES, room);
}

/** The attached documents' room: the rest of the spare once the recent turns took what they used. */
export function attachedBudget(spare: number, recentUsed: number, hasAttachment: boolean): number {
  if (!hasAttachment) return 0;
  return Math.max(ATTACHED_FLOOR_BYTES, spare - recentUsed);
}

export function leftOutLine(bytes: number): string {
  return `[... ${bytes} bytes left out ...]`;
}

/** The start and the end that a message larger than half of the block keeps: a quarter of the block each. */
export function keptEach(blockBytes: number): number {
  return Math.floor(blockBytes / 4);
}

/**
 * `text` cut to its start and its end with one line between that gives the bytes left out. `each`
 * is how many bytes of the start and of the end are kept. Text that fits in twice that is whole.
 */
export function cutMiddle(text: string, each: number): string {
  const total = utf8Bytes(text);
  if (total <= each * 2) return text;
  const head = prefixWithin(text, each);
  const tail = suffixWithin(text, each);
  const dropped = total - utf8Bytes(head) - utf8Bytes(tail);
  return `${head}\n${leftOutLine(dropped)}\n${tail}`;
}

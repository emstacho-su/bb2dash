/**
 * The fence (brief 109, The two turns, "The fence"): the named guard against a poisoned file.
 *
 * One 16-hex-character marker a turn. Every block opens with one line that carries the marker, the
 * block's kind and its label, and closes with one line that carries the marker and `end`. Before a
 * block is built every line of data is checked: a line that holds the marker, a line that starts
 * with the opening characters of a block line and a line that starts with a label shape each get a
 * two-character prefix, so none can stand as a block line or open with a label. The text is
 * otherwise unchanged. The exact characters of both lines are frozen in
 * `test/fixtures/contract24/fence.txt`.
 */

import { randomBytes } from 'node:crypto';

export const BLOCK_OPENING = '<<<block';
export const BLOCK_CLOSING = '>>>';
export const NO_LABEL = '-';
/** What a line of data that looks like a block line or a label gets in front of it. */
export const DATA_PREFIX = '> ';
export const MARKER_BYTES = 8;
/** A title, a file name or a citation is cut to one line of this many characters. */
export const TITLE_MAX_CHARS = 120;

export const BLOCK_KINDS = ['passage', 'memory', 'attachment', 'summary', 'feed', 'turn'] as const;
export type BlockKind = (typeof BLOCK_KINDS)[number];

/** `[M12]`, `[U3]`, `[R7]` or `[P]` at the start of a line. */
const LABEL_SHAPE = /^\[(?:[MUR][0-9]+|P)\]/;
const LINE_BREAK = /\r\n|\n/;

/** 16 random hex characters, drawn once for each turn. */
export function newMarker(): string {
  return randomBytes(MARKER_BYTES).toString('hex');
}

export function blockOpenLine(marker: string, kind: BlockKind, label: string | null): string {
  return `${BLOCK_OPENING} ${marker} ${kind} ${label ?? NO_LABEL}${BLOCK_CLOSING}`;
}

export function blockEndLine(marker: string): string {
  return `${BLOCK_OPENING} ${marker} end${BLOCK_CLOSING}`;
}

/** True when `line` could pass for a block line, or open with a label, in a reader's eyes. */
function looksStructural(line: string, marker: string): boolean {
  if (marker !== '' && line.includes(marker)) return true;
  // A bare carriage return starts a new visual line, so each piece is looked at on its own.
  return line.split('\r').some((piece) => {
    const trimmed = piece.trimStart();
    return trimmed.startsWith(BLOCK_OPENING) || LABEL_SHAPE.test(trimmed);
  });
}

/** `text` with the two-character prefix in front of every line of it that could pass for structure. */
export function guardText(text: string, marker: string): string {
  return text
    .split(LINE_BREAK)
    .map((line) => (looksStructural(line, marker) ? `${DATA_PREFIX}${line}` : line))
    .join('\n');
}

/** A title as one line of at most TITLE_MAX_CHARS characters (code points). */
export function oneLine(text: string, maxChars: number = TITLE_MAX_CHARS): string {
  return [...text.replace(/\s+/g, ' ').trim()].slice(0, maxChars).join('');
}

/** One fenced block: its opening line, the header, the data (both guarded) and its closing line. */
export function makeBlock(marker: string, kind: BlockKind, label: string | null, header: string, body: string): string {
  const lines = [blockOpenLine(marker, kind, label)];
  if (header !== '') lines.push(guardText(header, marker));
  lines.push(guardText(body, marker), blockEndLine(marker));
  return lines.join('\n');
}

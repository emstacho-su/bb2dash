/**
 * The attached documents as blocks (brief 109, "Byte budget", attached text). The files share the
 * block in the order he attached them: an equal share each, and what a short file leaves goes to the
 * next. A cut file is cut at a unit's end where one fits, and its block ends with one line: how many
 * units were read of how many. For a cut course file that line also gives the ids of up to
 * LEFT_OUT_IDS_MAX units left out, so the model can open them; for a cut upload no tool reaches the
 * rest, and the line says only that the file was read in part.
 *
 * An attached file is one block with no label (frozen in `contract24/README.md`).
 */

import { prefixWithin, utf8Bytes } from './budget.js';
import { makeBlock, oneLine } from './fence.js';
import { attachmentLine } from '../lines.js';
import type { AttachmentRef } from '../turn-context.js';
import type { AttachmentRead, AttachmentUnit } from '../store-types.js';

const BLOCK_GAP_BYTES = 2;
const LEFT_OUT_IDS_MAX = 40;
/** Room kept in a share for the closing line: 40 ids of up to 10 digits and the words around them. */
const TRAILER_RESERVE_BYTES = 520;
const NOTES_MARKER = '[notes]';
const NOTES_WARNING = "Text after a [notes] marker is the professor's speaker notes: label it as speaker notes.";

export interface AttachmentOutcome {
  readonly kind: 'file' | 'upload';
  readonly id: number;
  /** `read`, `cut`, or the state the file could not be read in. */
  readonly state: string;
  readonly title: string;
  readonly courseId: string | null;
}

export interface AttachedBlocks {
  readonly blocks: readonly string[];
  readonly bytes: number;
  readonly outcomes: readonly AttachmentOutcome[];
  /** The fixed sentences the answer's first lines may carry, one for each file that is not whole. */
  readonly lines: readonly string[];
}

const readKey = (kind: string, id: number): string => `${kind}:${id}`;

function unitText(unit: AttachmentUnit): string {
  return `-- ${unit.unitKind} ${unit.unitNo} --\n${unit.text}`;
}

function unitsWord(units: readonly AttachmentUnit[], total: number): string {
  const kinds = new Set(units.map((unit) => unit.unitKind));
  const only = kinds.size === 1 ? [...kinds][0] : undefined;
  if (only === undefined) return total === 1 ? 'unit' : 'units';
  return total === 1 ? only : `${only}s`;
}

interface Taken {
  readonly text: string;
  readonly taken: readonly AttachmentUnit[];
  readonly dropped: readonly AttachmentUnit[];
}

/** Whole units while they fit in `room` bytes; the first unit alone is cut when it is larger. */
function takeUnits(units: readonly AttachmentUnit[], room: number): Taken {
  const parts: string[] = [];
  const taken: AttachmentUnit[] = [];
  let used = 0;
  for (const unit of units) {
    const text = unitText(unit);
    const size = utf8Bytes(text) + 1;
    if (used + size > room) {
      if (taken.length === 0 && room > 0) {
        parts.push(prefixWithin(text, room));
        taken.push(unit);
      }
      break;
    }
    parts.push(text);
    taken.push(unit);
    used += size;
  }
  return { text: parts.join('\n'), taken, dropped: units.slice(taken.length) };
}

function trailerOf(read: AttachmentRead, taken: Taken): string {
  const total = Math.max(read.unitsTotal, taken.taken.length + taken.dropped.length);
  const base = `[read in part: ${taken.taken.length} of ${total} ${unitsWord(read.units, total)}`;
  if (read.kind !== 'file') return `${base}]`;
  const ids = [...taken.dropped.map((unit) => unit.unitId), ...read.leftOutUnitIds].slice(0, LEFT_OUT_IDS_MAX);
  return ids.length === 0 ? `${base}]` : `${base}; units left out, open them with get_material_text: ${ids.join(', ')}]`;
}

function headerOf(read: AttachmentRead, ref: AttachmentRef | undefined, hasNotes: boolean): string {
  const title = oneLine(read.title ?? ref?.title ?? '');
  const where = read.kind === 'file' ? 'course file' : 'upload';
  const course = read.courseId === null ? '' : ` | course ${read.courseId}`;
  const lines = [`attached ${where}: ${title}${course}`];
  if (hasNotes) lines.push(NOTES_WARNING);
  return lines.join('\n');
}

function missingLine(read: AttachmentRead | undefined, title: string): { state: string; line: string } {
  const state = read?.state ?? 'failed';
  if (state === 'not_ready') return { state, line: attachmentLine('attachment_not_ready', { title }) };
  if (state === 'missing') return { state, line: attachmentLine('attachment_missing', { title }) };
  // `failed`, `no_text`, and a file the search could not reach: the file could not be read.
  return { state, line: attachmentLine('attachment_failed', { title }) };
}

export function buildAttachedBlocks(refs: readonly AttachmentRef[], reads: readonly AttachmentRead[], marker: string, budget: number): AttachedBlocks {
  const byKey = new Map(reads.map((read) => [readKey(read.kind, read.id), read]));
  const ordered = [...refs].sort((a, b) => a.ord - b.ord);
  const readable = ordered.filter((ref) => {
    const read = byKey.get(readKey(ref.kind, ref.id));
    return read !== undefined && (read.state === 'read' || read.state === 'cut') && read.units.length > 0;
  });
  const blocks: string[] = [];
  const outcomes: AttachmentOutcome[] = [];
  const lines: string[] = [];
  let remaining = budget;
  let left = readable.length;
  for (const ref of ordered) {
    const read = byKey.get(readKey(ref.kind, ref.id));
    const title = oneLine(read?.title ?? ref.title);
    if (!readable.includes(ref) || read === undefined) {
      const { state, line } = missingLine(read, title);
      outcomes.push({ kind: ref.kind, id: ref.id, state, title, courseId: read?.courseId ?? null });
      lines.push(line);
      continue;
    }
    const share = Math.floor(remaining / left);
    left -= 1;
    const hasNotes = read.units.some((unit) => unit.text.includes(NOTES_MARKER));
    const header = headerOf(read, ref, hasNotes);
    const overhead = utf8Bytes(makeBlock(marker, 'attachment', null, header, '')) + BLOCK_GAP_BYTES;
    const taken = takeUnits(read.units, Math.max(0, share - overhead - TRAILER_RESERVE_BYTES));
    const whole = taken.dropped.length === 0 && read.state === 'read' && read.unitsRead >= read.unitsTotal;
    const body = whole ? taken.text : `${taken.text}\n${trailerOf(read, taken)}`;
    const block = makeBlock(marker, 'attachment', null, header, body);
    blocks.push(block);
    remaining -= utf8Bytes(block) + BLOCK_GAP_BYTES;
    const total = Math.max(read.unitsTotal, taken.taken.length + taken.dropped.length);
    outcomes.push({ kind: ref.kind, id: ref.id, state: whole ? 'read' : 'cut', title, courseId: read.courseId });
    if (!whole) lines.push(attachmentLine('attachment_cut', { title, read: taken.taken.length, total, units: unitsWord(read.units, total) }));
  }
  return { blocks, bytes: budget - remaining, outcomes, lines };
}

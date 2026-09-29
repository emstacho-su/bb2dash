/**
 * R3-8 — due items nested in a class block are always fully visible.
 *
 * Stack's walk (2026-09-29) found nested chips clipped: a chip was budgeted one
 * title line (`PLANNER_NESTED_CHIP_PX`) while its title wrapped to two, the
 * block's own time and room lines wrap too since R-44, and the 4× row cap
 * stopped a class with three long items well short of what they need.
 *
 * So a class block with chips is sized from its text, for the narrowest column
 * the planner supports: 1040 px with the 260 px sidebar open leaves seven
 * columns of about 95 px. A wider window only has room to spare. The estimate
 * counts characters per line conservatively, so it errs tall, never short:
 * a block with too much room shows a gap, one with too little hides a chip.
 *
 * `growRowsToFit` then lifts the rows under such a block past the cap until
 * its span is as tall as it asked. Lanes still stop at the cap; only a block's
 * own content can take a row past it.
 */

import {
  PLANNER_BLOCK_LINE_PX,
  PLANNER_BLOCK_PADDING_PX,
  PLANNER_NESTED_GAP_PX,
  spanPx,
  type RowSpan,
} from '@/lib/planner-rows';

/**
 * Characters of a chip title per line at the narrowest column: ~63 px of text
 * (95 px, less the block's and the chip's padding and the glyph) at 11 px.
 */
export const NESTED_TITLE_CHARS_PER_LINE = 10;

/** Characters of a class block's own line at the narrowest column (~85 px). */
export const MEETING_CHARS_PER_LINE = 14;

/** `.blockRoom` / `.blockTopic` clamp at two lines (PlannerWeek.module.css). */
const MEETING_LINE_CLAMP = 2;

/** The status quick-edit: one line box plus its 3 px padding and 1 px border, twice. */
const STATUS_SELECT_PX = PLANNER_BLOCK_LINE_PX + 2 * 3 + 2 * 1;

/** `.nestedChip { padding: 1px 4px; row-gap: 1px }`. */
const CHIP_PADDING_PX = 1;
const CHIP_ROW_GAP_PX = 1;

/** A shortfall smaller than this is rounding, not a missing line. */
const SHORTFALL_EPSILON_PX = 0.01;

function linesFor(text: string, charsPerLine: number): number {
  const length = text.trim().length;
  return Math.max(1, Math.ceil(length / charsPerLine));
}

/**
 * One nested chip, top to bottom: padding, the title in full (it wraps, never
 * clamps), the due time on its own line, the status control, padding — with
 * the chip's 1 px row gap between the three rows.
 */
export function nestedChipPx(title: string): number {
  const titleLines = linesFor(title, NESTED_TITLE_CHARS_PER_LINE);
  return (
    CHIP_PADDING_PX +
    titleLines * PLANNER_BLOCK_LINE_PX +
    CHIP_ROW_GAP_PX +
    PLANNER_BLOCK_LINE_PX +
    CHIP_ROW_GAP_PX +
    STATUS_SELECT_PX +
    CHIP_PADDING_PX
  );
}

/** What a class block draws above its chips. */
export interface MeetingLines {
  courseCode: string;
  timeText: string;
  room: string | null;
  topic: string | null;
}

/** The head (code and time, which wrap) and the room and topic, each clamped at two. */
function meetingLineCount(meeting: MeetingLines): number {
  const head = Math.min(
    MEETING_LINE_CLAMP,
    linesFor(`${meeting.courseCode} ${meeting.timeText}`, MEETING_CHARS_PER_LINE),
  );
  const clamped = (text: string | null) =>
    text === null || text.trim() === '' ? 0 : Math.min(MEETING_LINE_CLAMP, linesFor(text, MEETING_CHARS_PER_LINE));
  return head + clamped(meeting.room) + clamped(meeting.topic);
}

/**
 * The room a class block with nested chips needs: padding, its own lines, the
 * list's top margin, every chip, and the gaps between them.
 */
export function nestedMeetingRequiredPx(meeting: MeetingLines, titles: readonly string[]): number {
  const own = PLANNER_BLOCK_PADDING_PX + meetingLineCount(meeting) * PLANNER_BLOCK_LINE_PX;
  if (titles.length === 0) return own;
  const chips = titles.reduce((total, title) => total + nestedChipPx(title), 0);
  return own + PLANNER_NESTED_GAP_PX + chips + (titles.length - 1) * PLANNER_NESTED_GAP_PX;
}

/**
 * Rows lifted until every block's span is at least its `requiredPx`, past the
 * row cap. The shortfall is spread over the block's span in slots, so adding it
 * to each row the block overlaps grows the span by exactly the shortfall.
 * Returns a new table; `heights` is not touched.
 */
export function growRowsToFit(
  heights: readonly number[],
  blocksByDay: readonly (readonly RowSpan[])[],
): number[] {
  const next = [...heights];
  for (const day of blocksByDay) {
    for (const block of day) {
      if (block.requiredPx <= 0 || block.height <= 0) continue;
      const { heightPx } = spanPx(block.top, block.height, next);
      const shortfall = block.requiredPx - heightPx;
      // Below a hundredth of a pixel is float noise from the span arithmetic.
      if (shortfall <= SHORTFALL_EPSILON_PX) continue;
      const perRow = shortfall / block.height;
      const first = Math.max(0, Math.floor(block.top));
      const last = Math.min(next.length, Math.ceil(block.top + block.height));
      for (let slot = first; slot < last; slot += 1) next[slot] += perRow;
    }
  }
  return next;
}

// bb2dash :: shared chunking for the embedders.
//
// `findCut` and `chunk` are the SAME TEXT as in `embed-corpus/index.ts`; a test
// (`chunk_test.ts`) compares the two sources, so a part range written by
// `workspace-embed` means what one written by `embed-corpus` means. `embed-corpus`
// is not edited in this phase and does not import this file.
//
// Offsets are CODE POINTS (Postgres char_length() and substring() count code
// points, a JS string counts UTF-16 units). Chunking therefore runs over
// Array.from(text), never over the string itself.

// chunking constants
export const SINGLE_PART_MAX = 1600; // <= this many chars stays one part
export const PART_TARGET = 1400; // aim for parts of about this size
export const PART_OVERLAP = 200; // chars of overlap between consecutive parts
export const MIN_CUT = Math.floor(PART_TARGET * 0.5); // never cut earlier than this into a part

export type Part = { part_no: number; start: number; end: number };

/** The text as an array of code points — the unit part_range is measured in. */
export function codePoints(text: string): string[] {
  return Array.from(text);
}

/**
 * Find the end offset for a part starting at `start`, preferring natural boundaries.
 * `cps` is the unit's text as code points; every offset here is a code-point offset.
 */
function findCut(cps: string[], start: number): number {
  const hardEnd = Math.min(start + PART_TARGET, cps.length);
  if (hardEnd >= cps.length) return cps.length;
  const win = hardEnd - start; // window length, in code points

  // 1. paragraph boundary
  for (let i = win - 2; i >= MIN_CUT; i--) {
    if (cps[start + i] === "\n" && cps[start + i + 1] === "\n") return start + i + 2;
  }

  // 2. sentence boundary: . ! ? followed by whitespace/end
  for (let i = win - 1; i >= MIN_CUT; i--) {
    const c = cps[start + i];
    if (c === "." || c === "!" || c === "?") {
      const next = i + 1 < win ? cps[start + i + 1] : undefined;
      if (next === undefined || /\s/.test(next)) return start + i + 1;
    }
  }

  // 3. any newline
  for (let i = win - 1; i >= MIN_CUT; i--) {
    if (cps[start + i] === "\n") return start + i + 1;
  }

  // 4. any whitespace
  for (let i = win - 1; i >= MIN_CUT; i--) {
    if (cps[start + i] === " ") return start + i + 1;
  }

  // 5. hard cut
  return hardEnd;
}

function chunk(cps: string[]): Part[] {
  const len = cps.length;
  if (len === 0) return [];
  if (len <= SINGLE_PART_MAX) return [{ part_no: 1, start: 0, end: len }];

  const parts: Part[] = [];
  let start = 0;
  let partNo = 1;
  while (start < len) {
    const end = findCut(cps, start);
    parts.push({ part_no: partNo++, start, end });
    if (end >= len) break;
    const next = end - PART_OVERLAP;
    start = next > start ? next : start + 1; // guarantee forward progress
  }
  return parts;
}

export { findCut, chunk };

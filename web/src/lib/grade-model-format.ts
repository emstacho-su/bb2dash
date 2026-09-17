/**
 * bb2dash — display rounding and the few grade-model sentences `labels.ts`
 * does not carry (Phase 10b).
 *
 * Rounding happens here and only here, once, at render: percentages to one
 * decimal, points to at most two. The engine hands over unrounded numbers and
 * nothing upstream of a component rounds them.
 *
 * Phase 12b (G-1) took the solver, the agrees-with-Blackboard sentence, the
 * what-if wording and the muted-part sentences with the rest of that layer.
 * What is left is the rounding, the unlinked count and the history line, so no
 * component invents its own copy. The figure's own strings live beside the
 * component that renders them, in `GradedSoFarFigure.tsx`.
 */

import type { ComponentInput, ComponentResult, Standing } from './grade-model/types';
import { COURSE_TIME_ZONE } from './course-dimension';
import { scoreNumberText } from './queries.grades';

/** What a missing figure looks like. Never `0`. */
export const NO_FIGURE = '—';

/** 87.36 → "87.4%". A non-finite value is the dash, never "NaN%". */
export function formatPct(value: number): string {
  return Number.isFinite(value) ? `${value.toFixed(1)}%` : NO_FIGURE;
}

/** 14.8 → "14.8", 9 → "9", 3.14159 → "3.14". */
export function formatPoints(value: number): string {
  return Number.isFinite(value) ? String(Number(value.toFixed(2))) : NO_FIGURE;
}

/** "87.4% (B+)", or "87.4%" when the scale gives no letter. */
export function standingText(standing: Standing): string {
  const pct = formatPct(standing.pct);
  return standing.letter && pct !== NO_FIGURE ? `${pct} (${standing.letter})` : pct;
}

/** The facts about a component the wording needs: where it sits, and whether it is extra credit. */
export type PartComponent = Pick<ComponentInput, 'id' | 'parentId' | 'isExtraCredit'>;

/** A part the figure's explanation counts as graded. */
export const isGradedState = (result: ComponentResult): boolean =>
  result.state === 'graded' || result.state === 'partly_graded';

/** "2 scored Blackboard columns are not linked to a syllabus rule". */
export function unlinkedCountText(count: number): string {
  return count === 1
    ? '1 scored Blackboard column is not linked to a syllabus rule'
    : `${count} scored Blackboard columns are not linked to a syllabus rule`;
}

/** "14 Sep" in the course timezone. */
export function historyDayText(iso: string): string {
  const at = new Date(iso);
  if (!Number.isFinite(at.getTime())) return NO_FIGURE;
  // en-US parts, reassembled day-first: en-GB spells September "Sept".
  const parts = new Intl.DateTimeFormat('en-US', { day: 'numeric', month: 'short', timeZone: COURSE_TIME_ZONE })
    .formatToParts(at);
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${part('day')} ${part('month')}`;
}

/** One history entry as the line reads it. */
export interface HistoryPoint {
  readonly score: number | null;
  readonly seenAt: string;
}

/**
 * "— → 83.333 → 85.714 · seen 14 Sep, 16 Sep". Null is the dash, never zero.
 * Each value prints exactly as the score cell prints it (round 3, R3-4):
 * Blackboard's stored value, trailing zeros trimmed, no display rounding.
 */
export function historyText(points: readonly HistoryPoint[]): string {
  const scores = points.map((p) => (p.score === null ? NO_FIGURE : scoreNumberText(p.score)));
  const days = points.map((p) => historyDayText(p.seenAt));
  return `${scores.join(' → ')} · seen ${days.join(', ')}`;
}

/** The disclosure's own label. */
export const HISTORY_LABEL = 'history';

/**
 * Confirms an unsure link as it stands. A select cannot fire a change for the
 * option it already shows, so the preselected component needs its own control.
 */
export const CONFIRM_LINK_LABEL = 'Confirm link';

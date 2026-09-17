/**
 * bb2dash — display rounding and the few grade-model sentences `labels.ts`
 * does not carry (Phase 10b).
 *
 * Rounding happens here and only here, once, at render: percentages to one
 * decimal, points to at most two. The engine hands over unrounded numbers and
 * nothing upstream of a component rounds them.
 *
 * Every sentence the Contract fixes lives in `grade-model/labels.ts` (frozen);
 * this file holds only the wording the Contract describes without freezing —
 * the one-line explanation, the unlinked count, the history line — so no
 * component invents its own copy.
 */

import type { MutedPartArgs } from './grade-model/labels';
import type { Agreement, ComponentInput, ComponentResult, ItemInput, ModelResult, Standing } from './grade-model/types';
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

/** A fraction 0..1 as a percentage: 0.8125 → "81.3%". */
export function formatShare(fraction: number): string {
  return formatPct(fraction * 100);
}

/** "87.4% (B+)", or "87.4%" when the scale gives no letter. */
export function standingText(standing: Standing): string {
  const pct = formatPct(standing.pct);
  return standing.letter && pct !== NO_FIGURE ? `${pct} (${standing.letter})` : pct;
}

/** The letter a standing earns, or the dash when the scale gives none. */
export function letterText(standing: Standing): string {
  return standing.letter ?? NO_FIGURE;
}

/** The unit word for `differsText`. */
export function agreementUnitText(unit: Agreement['unit']): string {
  return unit === 'points' ? 'points' : 'percentage points';
}

/** The size of a difference, rounded for its unit, without a sign. */
export function agreementDeltaText(agreement: Pick<Agreement, 'delta' | 'unit'>): string {
  const size = Math.abs(agreement.delta);
  return agreement.unit === 'points' ? formatPoints(size) : size.toFixed(1);
}

/** The facts about a component the wording needs: where it sits, and whether it is extra credit. */
export type PartComponent = Pick<ComponentInput, 'id' | 'parentId' | 'isExtraCredit'>;

const isGradedState = (result: ComponentResult) => result.state === 'graded' || result.state === 'partly_graded';

/**
 * "2 of 3 parts graded: Participation, Average Quiz Grade · what-if on Exams
 * (rank-weighted)" — how the headline was computed, from the engine's
 * component results. A *part* is a top-level, non-extra-credit component
 * (round 2, R2-12): IST.323's three Final Project pieces are one part and its
 * extra-credit lab is none, so the course reads "of 7 parts", not "of 11". A
 * muted part is not counted; `mutedText` names it on its own line.
 *
 * Round 3 (R3-2): a part is *graded* only by real scores. `realResult` is
 * `projectCourse` on the same input with an empty scenario (`runModel`); a
 * part graded there is graded, and one graded only in `results` is graded by
 * what-if values alone and is named after " · what-if on". A real-only course
 * the model cannot compute (nothing graded yet) has no part graded.
 */
export function explanationText(
  results: readonly ComponentResult[],
  realResult: ModelResult | null,
  components: readonly PartComponent[],
): string {
  const byId = new Map(components.map((c) => [c.id, c]));
  const parts = results.filter((r) => {
    const component = byId.get(r.componentId);
    return component !== undefined && component.parentId === null && !component.isExtraCredit && r.state !== 'muted';
  });
  const realGraded = new Set(
    realResult?.state === 'computed' ? realResult.components.filter(isGradedState).map((r) => r.componentId) : [],
  );
  const graded = parts.filter((part) => realGraded.has(part.componentId));
  const whatIfOnly = parts.filter((part) => isGradedState(part) && !realGraded.has(part.componentId));
  const head = `${graded.length} of ${parts.length} ${parts.length === 1 ? 'part' : 'parts'} graded`;
  const real = graded.length === 0 ? head : `${head}: ${graded.map((c) => c.name).join(', ')}`;
  return whatIfOnly.length === 0 ? real : `${real} · what-if on ${whatIfOnly.map((c) => c.name).join(', ')}`;
}

/** Each muted component whose parent is not muted too. */
function mutedPartResults(
  results: readonly ComponentResult[],
  components: readonly PartComponent[],
): ComponentResult[] {
  const parentOf = new Map(components.map((c) => [c.id, c.parentId]));
  const muted = new Set(results.filter((r) => r.state === 'muted').map((r) => r.componentId));
  return results
    .filter((r) => muted.has(r.componentId))
    .filter((r) => {
      const parent = parentOf.get(r.componentId) ?? null;
      return parent === null || !muted.has(parent);
    });
}

/**
 * The muted components to name: each muted one whose parent is not muted too,
 * so a muted part is named once, not once per piece (R2-12).
 */
export function mutedPartNames(
  results: readonly ComponentResult[],
  components: readonly PartComponent[],
): string[] {
  return mutedPartResults(results, components).map((r) => r.name);
}

/** What a muted part's sentence needs to know about one model item. */
export type PartItem = Pick<ItemInput, 'key' | 'name' | 'kind' | 'componentId'>;

/** `componentId` is `ancestorId` or one of its pieces. A parent cycle ends the walk. */
function isWithin(
  componentId: number | null,
  ancestorId: number,
  parentOf: ReadonlyMap<number, number | null>,
): boolean {
  const seen = new Set<number>();
  for (let id = componentId; id !== null && !seen.has(id); id = parentOf.get(id) ?? null) {
    if (id === ancestorId) return true;
    seen.add(id);
  }
  return false;
}

/**
 * One `mutedText` entry per muted part (round 3, R3-3), named as
 * `mutedPartNames` names them. Which items are unsure is the engine's
 * `itemStates().unsureItemKeys`; this only sorts them by part: an item with a
 * Blackboard column is confirmable with the picker, and a placeholder counts
 * toward "not in Blackboard yet".
 */
export function mutedParts(
  results: readonly ComponentResult[],
  components: readonly PartComponent[],
  items: readonly PartItem[],
  unsureItemKeys: readonly string[],
): MutedPartArgs[] {
  const parentOf = new Map(components.map((c) => [c.id, c.parentId]));
  const unsureKeys = new Set(unsureItemKeys);
  const unsure = items.filter((item) => unsureKeys.has(item.key));
  return mutedPartResults(results, components).map((part) => {
    const own = unsure.filter((item) => isWithin(item.componentId, part.componentId, parentOf));
    return {
      part: part.name,
      confirmable: own.filter((item) => item.kind !== 'placeholder').map((item) => item.name),
      notInBlackboard: own.filter((item) => item.kind === 'placeholder').length,
    };
  });
}

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

/** What follows a percentage what-if field: "what if __ %" (Round 1b A1). */
export const PERCENT_SUFFIX = '%';

/** The per-row revert on a what-if value. */
export const REVERT_WHAT_IF_LABEL = 'Clear this what-if value';

/** The solver's letter picker. */
export const TARGET_LETTER_LABEL = 'Target letter';

/**
 * Confirms an unsure link as it stands. A select cannot fire a change for the
 * option it already shows, so the preselected component needs its own control.
 */
export const CONFIRM_LINK_LABEL = 'Confirm link';

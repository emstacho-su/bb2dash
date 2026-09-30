/**
 * Which Materials sections Stack has folded away (M-1 / P-materials-1).
 *
 * P-70 lifted the storage rules into `collapse-state.ts`, which serves Home as
 * well. This file keeps its exports as thin re-exports over that store, so its
 * importers compile unchanged and the stored value keeps its key and format: a
 * JSON array of `<courseId>` and `<courseId>::<bucket>` keys, open by default.
 */

import {
  MATERIALS_COLLAPSE,
  readCollapseSet,
  toggleKey,
  writeCollapseSet,
} from './collapse-state';

export const MATERIALS_COLLAPSE_KEY = MATERIALS_COLLAPSE.storageKey;

/** A section's identity: one course's one bucket. */
export function sectionKey(courseId: string, bucket: string): string {
  return `${courseId}::${bucket}`;
}

/** Read the folded set, or an empty one when there is none, it is junk, or storage throws. */
export function readCollapsed(): ReadonlySet<string> {
  return readCollapseSet(MATERIALS_COLLAPSE);
}

/** Remember the folded set. Silent no-op where storage is unavailable. */
export function writeCollapsed(collapsed: ReadonlySet<string>): void {
  writeCollapseSet(MATERIALS_COLLAPSE, collapsed);
}

/** The set with one section flipped, as a NEW set. */
export const toggleCollapsed = toggleKey;

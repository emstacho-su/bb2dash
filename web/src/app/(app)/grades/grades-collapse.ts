/**
 * Which classes Stack has folded on `/grades` (Phase 17 round 3, R3-7).
 *
 * The same store Home and Materials use (`collapse-state.ts`, P-70), under this
 * screen's own key. The keys are course display ids, and every class starts
 * open. It replaces 12b's per-course entries in `bb2dash.grades.sections`; the
 * gradebook groups inside a class still keep their own entries there.
 */

import type { CollapseSurface } from '@/lib/collapse-state';

export const GRADES_COLLAPSE_KEY = 'bb2dash.grades.collapsed';

/** `/grades`: class keys (`<displayId>`). Open by default. */
export const GRADES_COLLAPSE: CollapseSurface = Object.freeze({
  storageKey: GRADES_COLLAPSE_KEY,
  defaultCollapsed: new Set<string>(),
});

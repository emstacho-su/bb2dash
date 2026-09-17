/**
 * Which Materials sections Stack has folded away (M-1 / P-materials-1).
 *
 * Kept out of the component for the same reason `sidebar-preference.ts` is: the
 * rules about what is stored, what a bad value means and what happens when
 * storage is unavailable belong in one place with the tests, not inlined in a
 * render.
 *
 * localStorage is best-effort on purpose. A private window, blocked site data
 * or a full quota all throw, and none of those is a reason to fail the screen —
 * every section simply opens, which is a correct answer in all three. This and
 * `sidebar-preference.ts` are the only places in the app where a swallowed
 * storage error is deliberate.
 *
 * Default OPEN, not closed: the sections are collapsible, not collapsed. A
 * screen that hides its contents until you find the toggle is a worse bug than
 * the one being fixed.
 */

export const MATERIALS_COLLAPSE_KEY = 'bb2dash.materials.collapsed';

/** A section's identity: one course's one bucket. */
export function sectionKey(courseId: string, bucket: string): string {
  return `${courseId}::${bucket}`;
}

/** Read the folded set, or an empty one when there is none, it is junk, or storage throws. */
export function readCollapsed(): ReadonlySet<string> {
  try {
    const raw = globalThis.localStorage?.getItem(MATERIALS_COLLAPSE_KEY);
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((entry): entry is string => typeof entry === 'string'));
  } catch {
    return new Set();
  }
}

/** Remember the folded set. Silent no-op where storage is unavailable — see header. */
export function writeCollapsed(collapsed: ReadonlySet<string>): void {
  try {
    globalThis.localStorage?.setItem(
      MATERIALS_COLLAPSE_KEY,
      JSON.stringify([...collapsed].sort()),
    );
  } catch {
    /* storage unavailable; the choice simply does not survive the reload */
  }
}

/**
 * The set with one section flipped. Returns a NEW set — the caller holds this
 * in React state, and mutating it in place would not re-render.
 */
export function toggleCollapsed(
  collapsed: ReadonlySet<string>,
  key: string,
): ReadonlySet<string> {
  const next = new Set(collapsed);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  return next;
}

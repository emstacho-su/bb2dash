/**
 * Which Blackboard page an "Open in Blackboard" button opens (Phase 18, R-69).
 *
 * Pure: no React, no network. One rule for the three places that link out —
 * the assignment detail's footer, its staged-file link, and the planner
 * popover:
 *
 * 1. the assignment's own Ultra page (`assignments.bb_url`, composed by
 *    migration 126) when it is https and on the same origin as the course's
 *    page — scope `item`;
 * 2. otherwise the course's page (`courses.bb_url`) when it is https — scope
 *    `course`;
 * 3. otherwise nothing.
 *
 * Both values came out of a crawl, so neither is trusted as markup: anything
 * that is not an https URL (a `javascript:` value above all) is never handed to
 * an `href`. An item URL is only believed when it lives where the course does —
 * without a course origin to check it against, there is no link at all.
 */

export type BlackboardLinkScope = 'item' | 'course';

export interface BlackboardLink {
  href: string;
  scope: BlackboardLinkScope;
}

/** The hover text for each scope — says which page the button reaches. */
export const BLACKBOARD_LINK_TITLE: Readonly<Record<BlackboardLinkScope, string>> = {
  item: 'Opens this assignment’s own page in Blackboard.',
  course: 'Opens the course in Blackboard — no link to this assignment’s own page is recorded yet.',
};

/** The one scheme a Blackboard link may carry. */
const ALLOWED_PROTOCOL = 'https:';

/** A parsed https URL, or `null` for anything absent, blank, malformed or not https. */
function httpsUrl(raw: string | null | undefined): URL | null {
  const value = raw?.trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === ALLOWED_PROTOCOL ? url : null;
  } catch {
    return null;
  }
}

/**
 * The link to open for an assignment, and whether it reaches the item itself
 * or only its course. `null` when nothing safe is recorded.
 */
export function blackboardLink(
  assignment: { bb_url?: string | null } | null | undefined,
  course: { bb_url?: string | null } | null | undefined,
): BlackboardLink | null {
  const courseUrl = httpsUrl(course?.bb_url);
  if (courseUrl === null) return null;

  const itemUrl = httpsUrl(assignment?.bb_url);
  if (itemUrl !== null && itemUrl.origin === courseUrl.origin) {
    return { href: itemUrl.href, scope: 'item' };
  }
  return { href: courseUrl.href, scope: 'course' };
}

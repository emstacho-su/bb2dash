/**
 * bb2dash — course-dimension row types and pure display helpers (Phase 8).
 *
 * Split out of `queries.course.ts` so neither file outgrows the project's size
 * rule. Nothing here touches React, TanStack Query or Supabase: it is the row
 * shapes for the Phase 8 relations plus the folding/grouping the Stream and
 * Classwork panes do on them, which makes all of it directly unit-testable.
 *
 * `queries.course.ts` re-exports every symbol below, so screens keep importing
 * from `@/lib/queries.course` and never need to know about this split.
 *
 * Row types are hand-declared because the relations they describe are created
 * by migrations 026-028 in the same phase. Every column list is transcribed
 * verbatim from the frozen contract in
 * `docs/planning/61_PHASE8_course_dimension.md`.
 */

/**
 * `v_course_stream.meta` (jsonb). One of three documented shapes depending on
 * `post_kind`, so every key is optional and callers narrow by the kind:
 *   announcement                     -> { is_read }
 *   material                         -> { bucket, file_name, mime_type }
 *   assignment_posted/assignment_due -> { due_on, points_possible, type, status }
 */
export interface CourseStreamMeta {
  is_read?: boolean | null;
  bucket?: string | null;
  file_name?: string | null;
  mime_type?: string | null;
  due_on?: string | null;
  /** Postgres numeric — supabase-js may return it as a string. */
  points_possible?: number | string | null;
  type?: string | null;
  status?: string | null;
}

export type StreamPostKind = 'announcement' | 'material' | 'assignment_posted' | 'assignment_due';
export type StreamRefKind = 'announcement' | 'bb_file' | 'bb_content' | 'assignment';

/** One row of `v_course_stream` (migration 027). */
// Narrower than the generated Views<'v_course_stream'> on purpose: generated view types are
// all-nullable; this interface is the contract in 61_PHASE8 §Stream and is asserted at the call site.
export interface CourseStreamRow {
  course_id: string;
  post_kind: StreamPostKind;
  posted_at: string;
  ref_kind: StreamRefKind;
  ref_id: string;
  title: string;
  body: string | null;
  meta: CourseStreamMeta | null;
}

/** One row of `v_content_tree` (migration 027) — a node, or a node x file pair. */
// Narrower than the generated Views<'v_content_tree'> on purpose (same reason as above).
export interface ContentTreeRow {
  course_id: string;
  content_id: number;
  parent_id: number | null;
  bb_item_id: string | null;
  path: string;
  depth: number;
  title: string;
  item_kind: string | null;
  bb_type: string | null;
  /** Ultra progress: 'Started' | 'Completed' | 'None'. */
  state: string | null;
  url: string | null;
  modified_at: string | null;
  assignment_id: string | null;
  file_id: number | null;
  file_name: string | null;
  storage_path: string | null;
  bucket: string | null;
}

/**
 * Hard cap on the note — the same 280 the column's check constraint enforces
 * (migration 028). It has to be the same number: a smaller cap here would
 * quietly shorten a note the database is perfectly happy with.
 */
export const CARD_NOTE_MAX_LENGTH = 280;

/**
 * Plain text, one line. Line breaks and tabs collapse to spaces, runs of
 * whitespace collapse to one, and an empty note is NULL rather than '' so
 * "no note" has a single representation.
 *
 * No cap is applied here: normalizing and truncating are different decisions,
 * and silently returning a shorter note than it was handed made an edit-free
 * blur rewrite a stored note. Use `validateCardNote` before writing.
 */
export function normalizeCardNote(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const flat = raw
    .replace(/[\r\n\t\v\f]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return flat === '' ? null : flat;
}

/**
 * The note as it may be stored: normalized, and refused outright when it is
 * past the column's cap. Throwing (rather than slicing) is the boundary rule
 * the planner block already follows — the caller shows the message and the
 * owner decides what to cut, instead of losing the tail without being told.
 */
export function validateCardNote(raw: string | null | undefined): string | null {
  const note = normalizeCardNote(raw);
  if (note !== null && note.length > CARD_NOTE_MAX_LENGTH) {
    throw new Error(
      `The note is limited to ${CARD_NOTE_MAX_LENGTH} characters — this one is ${note.length}.`,
    );
  }
  return note;
}

/* ---------------------------------------------------------------------------
 * Phase 8 display helpers — pure functions, unit-testable, no React
 * ------------------------------------------------------------------------ */

/** The course timezone. Every date the UI groups by is a New York calendar day. */
export const COURSE_TIME_ZONE = 'America/New_York';

/**
 * A stable, order-independent cache key for a set of shells.
 *
 * A display course's `shell_ids` can arrive in either order and every query
 * keyed on them must land on one cache entry. It lives here, in the pure
 * module, because both `queries.course.ts` and `queries.grades.ts` key on the
 * same set and two copies of this rule would eventually disagree.
 */
export function shellCacheKey(shellIds: readonly string[]): string {
  return [...shellIds].sort().join('+');
}

/** A timestamptz -> the 'YYYY-MM-DD' New York day it falls on. */
export function streamDayKey(postedAt: string): string {
  // en-CA renders ISO-ordered Y-M-D.
  return new Date(postedAt).toLocaleDateString('en-CA', { timeZone: COURSE_TIME_ZONE });
}

/** Today as 'YYYY-MM-DD' in the course timezone. */
export function courseToday(now: Date = new Date()): string {
  return now.toLocaleDateString('en-CA', { timeZone: COURSE_TIME_ZONE });
}

/** Whole days between two 'YYYY-MM-DD' dates (b - a), TZ-stable. */
function dayDelta(aISO: string, bISO: string): number {
  const [ay, am, ad] = aISO.split('-').map(Number);
  const [by, bm, bd] = bISO.split('-').map(Number);
  const a = Date.UTC(ay, (am ?? 1) - 1, ad ?? 1);
  const b = Date.UTC(by, (bm ?? 1) - 1, bd ?? 1);
  return Math.round((b - a) / 86_400_000);
}

/** The feed's due-date horizon: an `assignment_due` post shows within +/-14 days. */
export const DUE_WINDOW_DAYS = 14;

/**
 * The feed rule from the contract: every post shows, except `assignment_due`
 * posts, which show only when the due date is within +/-`windowDays` of today.
 * A due post with no date at all is dropped — nothing places it on the feed.
 */
export function filterStreamRows(
  rows: CourseStreamRow[],
  todayISO: string,
  windowDays: number = DUE_WINDOW_DAYS,
): CourseStreamRow[] {
  return rows.filter((row) => {
    if (row.post_kind !== 'assignment_due') return true;
    const due = row.meta?.due_on ?? (row.posted_at ? streamDayKey(row.posted_at) : null);
    if (!due) return false;
    return Math.abs(dayDelta(todayISO, due)) <= windowDays;
  });
}

/** One day's worth of feed posts. */
export interface StreamDay {
  /** 'YYYY-MM-DD' in the course timezone. */
  day: string;
  rows: CourseStreamRow[];
}

/**
 * Group posts into New York calendar days, newest day first and newest post
 * first inside a day. Input order is not trusted.
 */
export function groupStreamByDay(rows: CourseStreamRow[]): StreamDay[] {
  const byDay = new Map<string, CourseStreamRow[]>();
  for (const row of rows) {
    const day = streamDayKey(row.posted_at);
    const bucket = byDay.get(day);
    if (bucket) bucket.push(row);
    else byDay.set(day, [row]);
  }
  return [...byDay.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : 0))
    .map(([day, dayRows]) => ({
      day,
      rows: [...dayRows].sort((a, b) =>
        a.posted_at < b.posted_at ? 1 : a.posted_at > b.posted_at ? -1 : 0,
      ),
    }));
}

/** A file hanging off a content node. */
export interface ContentFile {
  fileId: number;
  fileName: string | null;
  storagePath: string | null;
  bucket: string | null;
}

/** One Blackboard content item, with every file that joined to it. */
export interface ContentNode {
  /**
   * The shell the item lives in. A display course can span two shells (GEO 103
   * is lecture + recitation), so a node must carry its own `course_id` rather
   * than inherit the route's — a file staged against it is filed under this id.
   */
  courseId: string;
  contentId: number;
  parentId: number | null;
  path: string;
  depth: number;
  title: string;
  itemKind: string | null;
  bbType: string | null;
  state: string | null;
  url: string | null;
  modifiedAt: string | null;
  assignmentId: string | null;
  files: ContentFile[];
  /** The nodes whose `parentId` is this node's `contentId`, in sibling order. */
  children: ContentNode[];
}

/**
 * Fold `v_content_tree` rows into one node per `content_id`, collecting the
 * file rows. Duplicate file ids under one node are collapsed. No ordering and
 * no parent links yet — `buildContentTree` does that.
 */
function foldContentRows(rows: ContentTreeRow[]): Map<number, ContentNode> {
  const nodes = new Map<number, ContentNode>();
  const seenFiles = new Map<number, Set<number>>();

  for (const row of rows) {
    let node = nodes.get(row.content_id);
    if (!node) {
      node = {
        courseId: row.course_id,
        contentId: row.content_id,
        parentId: row.parent_id,
        path: row.path,
        depth: row.depth,
        title: row.title,
        itemKind: row.item_kind,
        bbType: row.bb_type,
        state: row.state,
        url: row.url,
        modifiedAt: row.modified_at,
        assignmentId: row.assignment_id,
        files: [],
        children: [],
      };
      nodes.set(row.content_id, node);
      seenFiles.set(row.content_id, new Set());
    }
    if (row.file_id != null) {
      const seen = seenFiles.get(row.content_id);
      if (seen && !seen.has(row.file_id)) {
        seen.add(row.file_id);
        node.files.push({
          fileId: row.file_id,
          fileName: row.file_name,
          storagePath: row.storage_path,
          bucket: row.bucket,
        });
      }
    }
  }

  return nodes;
}

/**
 * Sibling order: by title, the way a person reads a list of them. `numeric`
 * keeps "Unit 2" ahead of "Unit 10" — a code-point sort puts "Unit 10" first
 * because '1' < '2'. Ties fall back to `content_id` so the order is stable.
 */
function compareSiblings(a: ContentNode, b: ContentNode): number {
  const byTitle = (a.title ?? '').localeCompare(b.title ?? '', undefined, { numeric: true });
  return byTitle !== 0 ? byTitle : a.contentId - b.contentId;
}

/**
 * Build the real folder tree out of `v_content_tree` rows.
 *
 * Nesting comes from `parent_id`, which every row carries. The previous
 * ordering — a code-point sort of the ' / '-joined `path` — only *looked* like
 * a tree: it put 'Week 1 - Overview' between 'Week 1' and 'Week 1 / Slides'
 * (because '-' sorts below '/'), so Slides appeared to hang off the Overview.
 *
 * A node whose parent is not in the row set (a different shell, a filtered
 * fetch) is a root rather than a node that vanishes. If Blackboard ever hands
 * back a parent cycle, the nodes caught in it are appended as roots instead of
 * recursing for ever.
 */
export function buildContentTree(rows: ContentTreeRow[]): ContentNode[] {
  const nodes = foldContentRows(rows);

  const roots: ContentNode[] = [];
  for (const node of nodes.values()) {
    const parent = node.parentId == null ? undefined : nodes.get(node.parentId);
    if (parent && parent !== node) parent.children.push(node);
    else roots.push(node);
  }

  roots.sort(compareSiblings);
  for (const node of nodes.values()) node.children.sort(compareSiblings);

  // Anything unreachable from a root is in a cycle; surface it rather than
  // dropping it on the floor.
  const reachable = new Set<number>();
  const stack = [...roots];
  while (stack.length > 0) {
    const node = stack.pop() as ContentNode;
    if (reachable.has(node.contentId)) continue;
    reachable.add(node.contentId);
    stack.push(...node.children);
  }
  const orphaned = [...nodes.values()]
    .filter((node) => !reachable.has(node.contentId))
    .sort(compareSiblings);

  return [...roots, ...orphaned];
}

/** The tree as a depth-first list: each node immediately before its children. */
export function flattenContentTree(roots: ContentNode[]): ContentNode[] {
  const flat: ContentNode[] = [];
  const seen = new Set<number>();
  const walk = (node: ContentNode) => {
    if (seen.has(node.contentId)) return;
    seen.add(node.contentId);
    flat.push(node);
    for (const child of node.children) walk(child);
  };
  for (const root of roots) walk(root);
  return flat;
}

/**
 * The folded nodes in the order they are read: depth-first through the tree,
 * so a folder is immediately followed by what is inside it.
 */
export function groupContentTree(rows: ContentTreeRow[]): ContentNode[] {
  return flattenContentTree(buildContentTree(rows));
}

/** True when a content node is a container rather than a leaf item. */
export function isFolderNode(node: Pick<ContentNode, 'itemKind'>): boolean {
  return node.itemKind === 'folder' || node.itemKind === 'learning_module';
}

/** The Ultra progress state to show, or null when Blackboard recorded none. */
export function ultraStateLabel(state: string | null): string | null {
  if (!state || state === 'None') return null;
  return state;
}

/** The project's standard wording for a field with nothing recorded in it. */
export const NOT_RECORDED = 'not recorded';

/** Show a value, or "not recorded". Never blank — an empty cell reads as a bug. */
export function orNotRecorded(value: string | null | undefined): string {
  const text = (value ?? '').trim();
  return text === '' ? NOT_RECORDED : text;
}

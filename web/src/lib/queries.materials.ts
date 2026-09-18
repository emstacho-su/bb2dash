/**
 * bb2dash — Materials screen query layer (W-7).
 *
 * Extends the typed query layer for the per-course materials browser without
 * touching `queries.ts`. Follows the same conventions (Tables<> row types, a
 * greppable key namespace, `*Options()` returning queryOptions, throw-on-error,
 * no fabricated fallbacks) documented at the top of `queries.ts`.
 *
 * Two datasets back the screen:
 *   - `v_bb_files_current` — every non-superseded file pulled from Blackboard.
 *   - `readings`           — the assigned-reading list (richer than the files),
 *                            linked to a file (when one exists) via
 *                            `bb_files.reading_id`.
 *
 * Signed-URL open: files live in the `bb-files` Storage bucket. We mint a
 * short-lived signed URL at click time with `createSignedUrl`, which works
 * whether the bucket is public or private — so the screen is forward-compatible
 * if `bb-files` is ever locked down.
 *
 * NOTE FOR PEERS — stale generated types: `src/lib/supabase/database.types.ts`
 * predates several views, including `v_bb_files_current`, so the typed client
 * does not know that relation. The view is exactly
 * `SELECT <all bb_files columns> FROM bb_files WHERE superseded_by IS NULL`, so
 * its row type is identical to `Tables<'bb_files'>`. We read it through one
 * narrow, documented cast to an untyped client (below) rather than editing the
 * shared generated file. Regenerate the types
 * (mcp__Supabase__generate_typescript_types) and this cast can be dropped for a
 * plain `supabase.from('v_bb_files_current')`.
 */

import { queryOptions, useQuery } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseBrowserClient } from './supabase/client';
import type { Tables } from './queries';

/** A row of `v_bb_files_current` — same columns as the `bb_files` table. */
export type BbFileRow = Tables<'bb_files'>;
/** A row of the `readings` table. */
export type ReadingRow = Tables<'readings'>;
/** The `file_bucket` enum values, in the order the screen lists them. */
export type FileBucket = NonNullable<BbFileRow['bucket']>;

/* ---------------------------------------------------------------------------
 * Cache keys (local namespace; see queries.ts `queryKeys` for the pattern)
 * ------------------------------------------------------------------------ */

export const materialsKeys = {
  files: () => ['materials', 'files'] as const,
  readings: () => ['materials', 'readings'] as const,
} as const;

/* ---------------------------------------------------------------------------
 * Queries
 * ------------------------------------------------------------------------ */

/**
 * Every current (non-superseded) file, ordered so the client can group by
 * course → bucket → week without a second sort. Reads `v_bb_files_current`.
 */
export function currentFilesOptions() {
  return queryOptions({
    queryKey: materialsKeys.files(),
    queryFn: async (): Promise<BbFileRow[]> => {
      // See the "stale generated types" note above for why this is cast.
      const supabase = getSupabaseBrowserClient() as unknown as SupabaseClient;
      const { data, error } = await supabase
        .from('v_bb_files_current')
        .select('*')
        .order('course_id', { ascending: true })
        .order('bucket', { ascending: true })
        .order('week_no', { ascending: true, nullsFirst: false })
        .order('file_name', { ascending: true });
      if (error) throw error;
      return (data as BbFileRow[] | null) ?? [];
    },
    // Files move only when a Blackboard sync runs.
    staleTime: 15 * 60 * 1000,
  });
}

/**
 * Every assigned reading, ordered by course then week. Linked to a file (when
 * one exists) client-side via `reading_id`.
 */
export function readingsOptions() {
  return queryOptions({
    queryKey: materialsKeys.readings(),
    queryFn: async (): Promise<ReadingRow[]> => {
      const supabase = getSupabaseBrowserClient();
      const { data, error } = await supabase
        .from('readings')
        .select('*')
        .order('course_id', { ascending: true })
        .order('week_no', { ascending: true, nullsFirst: false })
        .order('id', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 15 * 60 * 1000,
  });
}

export function useCurrentFiles() {
  return useQuery(currentFilesOptions());
}

export function useReadings() {
  return useQuery(readingsOptions());
}

/* ---------------------------------------------------------------------------
 * Storage: signed-URL open
 * ------------------------------------------------------------------------ */

/** The Storage bucket every pulled file lives in. */
export const BB_FILES_BUCKET = 'bb-files';

/**
 * `bb_files.storage_path` is stored bucket-qualified (`bb-files/<key>`), but the
 * Storage API wants the key *within* the bucket. Strip the one leading segment.
 */
export function storageObjectKey(storagePath: string): string {
  const prefix = `${BB_FILES_BUCKET}/`;
  return storagePath.startsWith(prefix) ? storagePath.slice(prefix.length) : storagePath;
}

/**
 * Mint a short-lived signed URL for a stored file. Works on a public or private
 * bucket, so the screen keeps working if `bb-files` is ever made private.
 * Runtime-only (browser); throws if Storage refuses.
 */
export async function createSignedFileUrl(storagePath: string, expiresInSeconds = 3600): Promise<string> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.storage
    .from(BB_FILES_BUCKET)
    .createSignedUrl(storageObjectKey(storagePath), expiresInSeconds);
  if (error) throw error;
  if (!data?.signedUrl) throw new Error('Storage returned no signed URL');
  return data.signedUrl;
}

/* ---------------------------------------------------------------------------
 * Bucket presentation
 * ------------------------------------------------------------------------ */

/** The buckets the screen renders, in order (spec / assignment order). */
export const BUCKET_ORDER: FileBucket[] = [
  'syllabus_policy',
  'schedule',
  'lecture_slides',
  'readings',
  'assignment_spec',
  'lab_materials',
  'project_materials',
  // Phase 10a: what Stack submitted (pulled back out of Blackboard) and what he
  // has staged here ready to attach. Listed after the course's own materials.
  'my_submissions',
  'admin',
];

const BUCKET_LABELS: Record<string, string> = {
  syllabus_policy: 'Syllabus & policy',
  schedule: 'Schedule',
  lecture_slides: 'Lecture slides',
  readings: 'Readings',
  assignment_spec: 'Assignment specs',
  lab_materials: 'Lab materials',
  project_materials: 'Project materials',
  admin: 'Admin',
  my_submissions: 'My submissions',
  media_links: 'Media & links',
  unclassified: 'Unclassified',
};

export function bucketLabel(bucket: string | null): string {
  if (!bucket) return 'Unfiled';
  return BUCKET_LABELS[bucket] ?? bucket.replace(/_/g, ' ');
}

/* ---------------------------------------------------------------------------
 * File presentation helpers
 * ------------------------------------------------------------------------ */

/** Human file size, or an em dash when the byte count is unknown. Never faked. */
export function formatBytes(bytes: number | null): string {
  if (bytes == null) return '—';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 10 ? Math.round(value) : Math.round(value * 10) / 10} ${units[unit]}`;
}

/** A short mono chip label (PDF · DOC · PPT …) from mime type, then extension. */
export function fileTypeChip(mime: string | null, fileName: string | null): string {
  const m = (mime ?? '').toLowerCase();
  if (m.includes('pdf')) return 'PDF';
  if (m.includes('wordprocessing') || m === 'application/msword') return 'DOC';
  if (m.includes('presentation') || m === 'application/vnd.ms-powerpoint') return 'PPT';
  if (m.includes('spreadsheet') || m === 'application/vnd.ms-excel') return 'XLS';
  if (m.startsWith('image/')) return 'IMG';
  if (m.startsWith('video/')) return 'VID';
  if (m.startsWith('audio/')) return 'AUD';
  if (m.includes('zip') || m.includes('compressed')) return 'ZIP';
  if (m === 'text/html') return 'URL';
  if (m.startsWith('text/')) return 'TXT';

  const ext = fileName?.split('.').pop()?.toUpperCase();
  if (ext && ext.length <= 4 && ext !== fileName?.toUpperCase()) return ext;
  return 'FILE';
}

/**
 * Friendly title for a file. `bb_files` has no dedicated title column, so we
 * fall back to `file_name`, then to the basename of `storage_path`/`path`.
 */
export function fileTitle(row: {
  file_name: string | null;
  storage_path: string | null;
  path: string | null;
}): string {
  if (row.file_name) return row.file_name;
  const source = row.storage_path ?? row.path ?? '';
  const base = source.split('/').pop();
  return base && base.length > 0 ? base : 'Untitled file';
}

/** Where a file's bytes actually live — drives the honesty label (see below). */
export type FileLocation = 'library' | 'disk' | 'source' | 'unknown' | 'none';

/**
 * A route column the caller cannot see, as distinct from one that is recorded
 * empty. `v_content_tree` projects `storage_path` and nothing else, so the
 * Classwork tree knows whether a file is stored but knows nothing at all about
 * a source URL or a local mirror. Passing `null` for those would have the tree
 * assert "No route" over a file that may well have one; passing
 * `UNKNOWN_ROUTE` says only what the view actually carries.
 *
 * A symbol rather than the string 'unknown' so it can never collide with a
 * real path.
 */
export const UNKNOWN_ROUTE: unique symbol = Symbol('unknown-route');

/** A route column: a path, recorded-empty, or not visible from here. */
export type RouteValue = string | null | typeof UNKNOWN_ROUTE;

/**
 * The three columns that decide whether a file can be opened. Declared
 * structurally, not as a `Pick` of `bb_files`, so both a full `bb_files` row
 * and the Classwork tree's partial view can be answered by the same function.
 */
export interface FileRoutes {
  storage_path: RouteValue;
  local_path: RouteValue;
  source_url: RouteValue;
}

/** A route we can actually use: a non-empty recorded path. */
function routePath(value: RouteValue): string | null {
  return typeof value === 'string' && value !== '' ? value : null;
}

/** True when the caller could not see this column at all. */
function isUnknownRoute(value: RouteValue): boolean {
  return value === UNKNOWN_ROUTE;
}

/** The stored path, or null — the one route that opens through Storage. */
export function storedPath(row: FileRoutes): string | null {
  return routePath(row.storage_path);
}

/** The external URL, or null. */
export function sourceUrl(row: FileRoutes): string | null {
  return routePath(row.source_url);
}

export function fileLocation(row: FileRoutes): FileLocation {
  if (routePath(row.storage_path)) return 'library';
  if (routePath(row.local_path)) return 'disk';
  if (routePath(row.source_url)) return 'source';
  // Nothing usable was found — but "nothing found" is only "no route" when
  // every column was actually visible.
  if (
    isUnknownRoute(row.storage_path) ||
    isUnknownRoute(row.local_path) ||
    isUnknownRoute(row.source_url)
  ) {
    return 'unknown';
  }
  return 'none';
}

/**
 * The honest availability label for a file. Two distinctions matter here: a
 * file that is only recorded on the local disk (a `local_path`, no Storage
 * bytes) reads "recorded on disk" — NOT "on disk" — because the browser cannot
 * open it; and a row whose other route columns were never fetched reads "Not
 * stored", which claims only the absence this caller can actually see, rather
 * than "No route", which claims there is nowhere else to look.
 */
export function fileHonesty(row: FileRoutes): {
  location: FileLocation;
  label: string;
  /** True when the browser has a route to actually open it. */
  openable: boolean;
} {
  const location = fileLocation(row);
  switch (location) {
    case 'library':
      return { location, label: 'In library', openable: true };
    case 'source':
      return { location, label: 'Source link', openable: true };
    case 'disk':
      return { location, label: 'Recorded on disk', openable: false };
    case 'unknown':
      return { location, label: 'Not stored', openable: false };
    default:
      return { location, label: 'No route', openable: false };
  }
}

/* ---------------------------------------------------------------------------
 * Grouping the readings (M-1 / P-materials-3)
 *
 * The Readings bucket was one flat list per course — 38 rows for ECN 304, in
 * `week_no` then `id` order. Stack asked for them "blocked into the blocks of
 * readings assigned for a given date", which is what `readings.for_date` says.
 * ------------------------------------------------------------------------ */

/** One date's worth of readings, or one of the two undated groups. */
export interface ReadingGroup {
  /** Stable React key; also what the collapse state is stored under. */
  key: string;
  /** "Thu, Sep 24", "Case pool", "No date yet". */
  heading: string;
  /** null for the undated groups. */
  forDate: string | null;
  readings: ReadingRow[];
}

/** Stack's word for IST.466's ethics cases (answer 7). */
export const CASE_POOL_HEADING = 'Case pool';
/** Undated readings that ARE required — a real gap, not a pool. */
export const UNDATED_HEADING = 'No date yet';

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/**
 * "Thu, Sep 24" from a bare 'YYYY-MM-DD'. Parsed field by field rather than
 * through `new Date(iso)`, which reads a bare date as UTC midnight and so shows
 * the day before anywhere west of Greenwich.
 */
export function readingDateHeading(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, (m ?? 1) - 1, d ?? 1);
  if (!Number.isFinite(date.getTime())) return iso;
  return `${DOW[date.getDay()]}, ${MONTHS[date.getMonth()]} ${date.getDate()}`;
}

/**
 * Block one course's readings by the date they are assigned for.
 *
 * Dated groups come first, in date order. Then the two undated groups, in this
 * order, and both last:
 *
 *   * **Case pool** — undated AND `required = false`. This is IST.466's ten
 *     HBR cases minus the one assigned to Stack's group: a pool the course
 *     picks from, so no one date is theirs (Stack's answer 7). The rule is the
 *     data, not a hard-coded list of ids — today it selects exactly those nine
 *     and nothing else in the term.
 *   * **No date yet** — undated and required. That IS a gap, and naming it
 *     "Case pool" would hide one.
 *
 * Order inside a group is the order the caller supplied (week, then id).
 */
export function groupReadings(readings: readonly ReadingRow[]): ReadingGroup[] {
  const byDate = new Map<string, ReadingRow[]>();
  const pool: ReadingRow[] = [];
  const undated: ReadingRow[] = [];

  for (const reading of readings) {
    if (reading.for_date) {
      const list = byDate.get(reading.for_date);
      if (list) list.push(reading);
      else byDate.set(reading.for_date, [reading]);
    } else if (reading.required === false) {
      pool.push(reading);
    } else {
      undated.push(reading);
    }
  }

  const groups: ReadingGroup[] = [...byDate.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([forDate, rows]) => ({
      key: forDate,
      heading: readingDateHeading(forDate),
      forDate,
      readings: rows,
    }));

  if (pool.length > 0) {
    groups.push({ key: 'case-pool', heading: CASE_POOL_HEADING, forDate: null, readings: pool });
  }
  if (undated.length > 0) {
    groups.push({ key: 'undated', heading: UNDATED_HEADING, forDate: null, readings: undated });
  }
  return groups;
}

/* ---------------------------------------------------------------------------
 * Reading "Open ladder" — four honest states
 * ------------------------------------------------------------------------ */

export type ReadingRouteKind =
  /** (a) A stored file with bytes in Storage → signed-URL open. */
  | 'library'
  /** (b) A file/reading that only has a URL → open the external link. */
  | 'external'
  /** (c) Publisher / OIA e-book or Blackboard-only item → labeled instruction. */
  | 'instruction'
  /** (d) No route recorded → disabled, with the reason shown. */
  | 'none';

export interface ReadingRoute {
  kind: ReadingRouteKind;
  /** Short action label ("Open", "Open ↗", "How to access", "No route"). */
  action: string;
  /**
   * The tag beside the row (P-materials-2, label half).
   *
   * `kind` alone cannot carry this: 'instruction' covers two quite different
   * situations, and lumping them under one "Off-platform" tag is what Stack
   * reported. A chapter of a bought textbook is genuinely off-platform and
   * always will be. A reading that IS on Blackboard and simply has not been
   * pulled into the library yet is a gap on our side, and saying "Off-platform"
   * about it is wrong — 20 of the 41 rows so tagged were GEO.103 readings
   * sitting on Blackboard the whole time.
   */
  tag: string;
  /** Honest one-line explanation of what this route is (and isn't). */
  reason: string;
  /** For 'library': the stored file to sign at click time. */
  file?: BbFileRow;
  /** For 'external' / some 'instruction': the URL to open. */
  href?: string;
  /**
   * M-3: the course's syllabus, for an off-platform reading whose only honest
   * answer is "the syllabus says how to get this". Opened through the ordinary
   * `FileOpenAction` ladder, so it is stored bytes, a source link or an honest
   * dead end like every other file.
   */
  syllabus?: BbFileRow;
}

/** The four tags a reading row can carry. Asserted by the tests. */
export const READING_TAG = {
  library: 'In library',
  external: 'External',
  /** On Blackboard, not yet pulled into the library — a gap on our side. */
  notPulled: 'On Blackboard — not pulled yet',
  /** A bought textbook or publisher e-book. Genuinely not ours to hold. */
  offPlatform: 'Off-platform',
  none: 'No route',
} as const;

/** Heuristic: does a citation look like a course textbook / publisher e-book? */
function looksLikeEbook(citation: string | null): boolean {
  if (!citation) return false;
  return /\b(\d{1,2}e\b|\d(?:st|nd|rd|th)?\s*ed\.?|chapter\s*\d|ch\.\s*\d|\bpp?\.\s*\d)/i.test(citation);
}

/**
 * Resolve a reading to one of the four ladder states. Linkage to a file is by
 * `reading_id` (a direct FK — see queryFn callers), so it is fully determinable
 * from the schema; the only heuristic is telling a publisher e-book (c) apart
 * from a genuinely unrouted reading (d), which we base on the citation text and
 * label honestly either way.
 *
 * `file` is the reading's linked `v_bb_files_current` row, if any.
 * `blackboardUrl` is the course's Blackboard URL, offered as the access route
 * for readings that are posted on Blackboard but not yet pulled into the library.
 */
export function resolveReadingRoute(
  reading: Pick<ReadingRow, 'url' | 'on_blackboard' | 'citation'>,
  file: BbFileRow | undefined,
  blackboardUrl: string | null,
  /** M-3: the course's own syllabus file, when one has been resolved. */
  syllabus?: BbFileRow,
): ReadingRoute {
  // (a) Stored file with bytes → signed-URL open.
  if (file?.storage_path) {
    return {
      kind: 'library',
      action: 'Open',
      tag: READING_TAG.library,
      reason: 'Stored in the library — opens a signed link.',
      file,
    };
  }
  // (b) Linked file that only carries a source URL (no stored bytes).
  if (file?.source_url) {
    return {
      kind: 'external',
      action: 'Open ↗',
      tag: READING_TAG.external,
      reason: 'External source — not stored in the library.',
      href: file.source_url,
    };
  }
  // A linked file recorded only on local disk: no browser route.
  if (file?.local_path) {
    return {
      kind: 'none',
      action: 'No route',
      tag: READING_TAG.none,
      reason: 'Linked file is recorded on disk only — no online copy to open.',
    };
  }
  // (b) No file, but the reading itself is a direct link.
  if (reading.url) {
    return {
      kind: 'external',
      action: 'Open ↗',
      tag: READING_TAG.external,
      reason: reading.on_blackboard ? 'Linked from Blackboard.' : 'External link.',
      href: reading.url,
    };
  }
  // (c) Posted on Blackboard but not pulled into the library yet. NOT
  // off-platform — it is on the platform, we just have not fetched it.
  if (reading.on_blackboard) {
    return {
      kind: 'instruction',
      action: blackboardUrl ? 'In Blackboard ↗' : 'On Blackboard',
      tag: READING_TAG.notPulled,
      reason: 'Posted on Blackboard — not yet pulled into the library. Open it in Blackboard.',
      href: blackboardUrl ?? undefined,
    };
  }
  // (c) Course textbook / publisher e-book with no downloadable file. There is
  // no copy to open, so the honest action is the syllabus that says how to get
  // it (M-3) — and if we do not hold that either, we say so.
  if (looksLikeEbook(reading.citation)) {
    return {
      kind: 'instruction',
      action: 'How to access',
      tag: READING_TAG.offPlatform,
      reason: syllabus
        ? 'Course textbook / publisher e-book — no downloadable file. The syllabus says how to get it.'
        : 'Course textbook / publisher e-book — access through the publisher or SU Libraries; no downloadable file.',
      syllabus,
    };
  }
  // (d) Nothing recorded.
  return {
    kind: 'none',
    action: 'No route',
    tag: READING_TAG.none,
    reason: 'No linked file or link recorded for this reading.',
  };
}

/* ---------------------------------------------------------------------------
 * Which file IS a course's syllabus (M-3 / P-materials-4)
 * ------------------------------------------------------------------------ */

/** The columns of `courses` this resolver needs. */
export interface CourseSyllabusRow {
  id: string;
  /**
   * The shell this one hangs off, or null for a top-level course. CR-10: this
   * is the real link between a recitation and its lecture — the same column
   * migration 074 follows to resolve the scheme course — and it replaces
   * guessing the parent from the shape of the id.
   */
  parent_course_id: string | null;
  syllabus_path: string | null;
}

export const courseSyllabiKey = ['materials', 'course-syllabi'] as const;

/** `courses.syllabus_path` per course, for the syllabus resolver. */
export function courseSyllabiOptions() {
  return queryOptions({
    queryKey: courseSyllabiKey,
    queryFn: async (): Promise<CourseSyllabusRow[]> => {
      const supabase = getSupabaseBrowserClient();
      const { data, error } = await supabase
        .from('courses')
        .select('id, parent_course_id, syllabus_path')
        .order('id', { ascending: true });
      if (error) throw error;
      return (data ?? []) as CourseSyllabusRow[];
    },
    staleTime: 30 * 60 * 1000,
  });
}

export function useCourseSyllabi() {
  return useQuery(courseSyllabiOptions());
}

/** The last path segment of `syllabus_path`, which is the file's own name. */
export function syllabusBasename(path: string | null): string | null {
  if (!path) return null;
  const base = path.split('/').pop()?.trim();
  return base && base.length > 0 ? base : null;
}

/**
 * Work out which `bb_files` row is each course's syllabus.
 *
 * `courses.syllabus_path` is unreliable as a storage key — it is sometimes the
 * repo-relative path, sometimes bucket-prefixed — but its BASENAME is the
 * file's real name, and that does match `bb_files.file_name`. Three rules, in
 * order:
 *
 *   1. a `syllabus_policy` file of this course whose name is that basename.
 *      This is what picks IST 323's own syllabus over the policy appendix
 *      filed beside it, and IST 466's over its student-policy sheet;
 *   2. failing that, the PARENT shell's answer, followed up the chain — GEO
 *      103's recitation points at the lecture's syllabus, and its own
 *      `syllabus_policy` file is the discussion-section guide, which is not the
 *      same document. CR-10: the parent is `courses.parent_course_id`, not a
 *      guess from the shape of the id. The old rule assumed the parent was the
 *      same prefix with `.lecture` on the end, so a shell whose parent happens
 *      to be called anything else was cut off from its syllabus entirely;
 *   3. failing that, this course's sole `syllabus_policy` file, if it has
 *      exactly one. With two candidates and no name match we choose nothing
 *      rather than guess which is the syllabus.
 */
export function resolveSyllabusFiles(
  courses: readonly CourseSyllabusRow[],
  files: readonly BbFileRow[],
): Map<string, BbFileRow> {
  const candidates = new Map<string, BbFileRow[]>();
  for (const file of files) {
    // A file with no course cannot be a course's syllabus, and the generated
    // row type is honest that `course_id` is nullable.
    if (file.bucket !== 'syllabus_policy' || !file.course_id) continue;
    const list = candidates.get(file.course_id) ?? [];
    list.push(file);
    candidates.set(file.course_id, list);
  }

  const byName = new Map<string, BbFileRow>();
  for (const course of courses) {
    const wanted = syllabusBasename(course.syllabus_path);
    if (!wanted) continue;
    const match = (candidates.get(course.id) ?? []).find(
      (file) => fileTitle(file) === wanted,
    );
    if (match) byName.set(course.id, match);
  }

  const byId = new Map(courses.map((course) => [course.id, course]));
  const resolved = new Map(byName);

  /** The nearest ancestor with a named syllabus file, if any. */
  function inheritedFrom(course: CourseSyllabusRow): BbFileRow | undefined {
    const seen = new Set<string>([course.id]);
    let parentId = course.parent_course_id;
    while (parentId !== null && !seen.has(parentId)) {
      const match = byName.get(parentId);
      if (match) return match;
      seen.add(parentId);
      parentId = byId.get(parentId)?.parent_course_id ?? null;
    }
    // `seen` also stops a cycle in the data taking the screen down.
    return undefined;
  }

  for (const course of courses) {
    if (resolved.has(course.id)) continue;

    const inherited = inheritedFrom(course);
    if (inherited) {
      resolved.set(course.id, inherited);
      continue;
    }

    const own = candidates.get(course.id) ?? [];
    if (own.length === 1) resolved.set(course.id, own[0]);
  }
  return resolved;
}

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
export function fileTitle(row: Pick<BbFileRow, 'file_name' | 'storage_path' | 'path'>): string {
  if (row.file_name) return row.file_name;
  const source = row.storage_path ?? row.path ?? '';
  const base = source.split('/').pop();
  return base && base.length > 0 ? base : 'Untitled file';
}

/** Where a file's bytes actually live — drives the honesty label (see below). */
export type FileLocation = 'library' | 'disk' | 'source' | 'none';

export function fileLocation(row: Pick<BbFileRow, 'storage_path' | 'local_path' | 'source_url'>): FileLocation {
  if (row.storage_path) return 'library';
  if (row.local_path) return 'disk';
  if (row.source_url) return 'source';
  return 'none';
}

/**
 * The honest availability label for a file. Critically: a file that is only
 * recorded on the local disk (a `local_path`, no Storage bytes) reads
 * "recorded on disk" — NOT "on disk" — because the browser cannot open it.
 */
export function fileHonesty(row: Pick<BbFileRow, 'storage_path' | 'local_path' | 'source_url'>): {
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
    default:
      return { location, label: 'No route', openable: false };
  }
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
  /** Honest one-line explanation of what this route is (and isn't). */
  reason: string;
  /** For 'library': the stored file to sign at click time. */
  file?: BbFileRow;
  /** For 'external' / some 'instruction': the URL to open. */
  href?: string;
}

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
): ReadingRoute {
  // (a) Stored file with bytes → signed-URL open.
  if (file?.storage_path) {
    return { kind: 'library', action: 'Open', reason: 'Stored in the library — opens a signed link.', file };
  }
  // (b) Linked file that only carries a source URL (no stored bytes).
  if (file?.source_url) {
    return {
      kind: 'external',
      action: 'Open ↗',
      reason: 'External source — not stored in the library.',
      href: file.source_url,
    };
  }
  // A linked file recorded only on local disk: no browser route.
  if (file?.local_path) {
    return {
      kind: 'none',
      action: 'No route',
      reason: 'Linked file is recorded on disk only — no online copy to open.',
    };
  }
  // (b) No file, but the reading itself is a direct link.
  if (reading.url) {
    return {
      kind: 'external',
      action: 'Open ↗',
      reason: reading.on_blackboard ? 'Linked from Blackboard.' : 'External link.',
      href: reading.url,
    };
  }
  // (c) Posted on Blackboard but not pulled into the library yet.
  if (reading.on_blackboard) {
    return {
      kind: 'instruction',
      action: blackboardUrl ? 'In Blackboard ↗' : 'On Blackboard',
      reason: 'Posted on Blackboard — not yet pulled into the library. Open it in Blackboard.',
      href: blackboardUrl ?? undefined,
    };
  }
  // (c) Course textbook / publisher e-book with no downloadable file.
  if (looksLikeEbook(reading.citation)) {
    return {
      kind: 'instruction',
      action: 'How to access',
      reason: 'Course textbook / publisher e-book — access through the publisher or SU Libraries; no downloadable file.',
    };
  }
  // (d) Nothing recorded.
  return { kind: 'none', action: 'No route', reason: 'No linked file or link recorded for this reading.' };
}

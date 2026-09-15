/**
 * bb2dash — staging a submission file (Phase 10a, R-18).
 *
 * The one write in the Grades feature, split out of `queries.grades.ts` so both
 * modules stay well inside the repo's file-size rule and so the read layer can
 * be read as what it is: reads only.
 *
 * What this does NOT do is submit anything. bb2dash has no way to hand a file
 * to Blackboard; it puts a copy in the library under `my_submissions` so the
 * file is one click away when Stack opens Blackboard to attach it, and every
 * screen that lists the row says exactly that.
 *
 * Two failures are handled rather than hoped away, because both leave the
 * library and Storage disagreeing:
 *
 *   - the object uploads and the `bb_files` insert then fails. The row is what
 *     every screen reads, so an object with no row is invisible — and the
 *     collision check reads rows, so the next attempt picks the same key and
 *     409s for ever. The object is removed (best effort) before the insert
 *     error is rethrown.
 *   - the object key is already taken by something with no row (the residue of
 *     the case above, or an attempt file pulled back before its row landed).
 *     The Storage listing joins the collision set and the suffix is retried
 *     once, rather than reporting a conflict the reader cannot see.
 *
 * Nothing here touches `assignments`, `assignment_progress`, `bb_gradebook` or
 * `bb_attempts`.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { getSupabaseBrowserClient } from './supabase/client';
import { BB_FILES_BUCKET, materialsKeys } from './queries.materials';
import { gradesKeys } from './queries.grades';

/* ---------------------------------------------------------------------------
 * Validation at the boundary
 * ------------------------------------------------------------------------ */

/** One file at a time, and no bigger than this. */
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
/** `bb_files.file_name` is the Storage key's last segment; keep it sane. */
export const MAX_FILE_NAME_LENGTH = 180;

/** Split a name into stem + extension, where the extension is short and real. */
function splitExtension(fileName: string): { stem: string; ext: string } {
  const dot = fileName.lastIndexOf('.');
  if (dot <= 0 || dot === fileName.length - 1) return { stem: fileName, ext: '' };
  const ext = fileName.slice(dot);
  if (ext.length > 12) return { stem: fileName, ext: '' };
  return { stem: fileName.slice(0, dot), ext };
}

/** Cap a name at MAX_FILE_NAME_LENGTH, keeping the extension. */
function capFileName(fileName: string): string {
  if (fileName.length <= MAX_FILE_NAME_LENGTH) return fileName;
  const { stem, ext } = splitExtension(fileName);
  return `${stem.slice(0, Math.max(1, MAX_FILE_NAME_LENGTH - ext.length))}${ext}`;
}

/**
 * The name a staged file is filed under: the original, with path separators and
 * control characters replaced by `_`, capped at 180 characters.
 *
 * The name becomes the last segment of a Storage key, so a '/' or a '\' in it
 * would silently move the object into another folder. Throws rather than
 * inventing a name when nothing usable is left.
 */
export function sanitizeFileName(raw: string | null | undefined): string {
  if (typeof raw !== 'string') throw new Error('That file has no name, so it was not staged.');
  // Written as a code-point scan rather than a regex: a character class of
  // control characters puts literal control bytes in this source file.
  const cleaned = Array.from(raw)
    .map((ch) => {
      if (ch === '/' || ch === '\\') return '_';
      const code = ch.codePointAt(0) ?? 0;
      return code < 0x20 || code === 0x7f ? '_' : ch;
    })
    .join('')
    .trim();
  if (cleaned === '' || cleaned === '.' || cleaned === '..') {
    throw new Error('That file name cannot be used, so it was not staged.');
  }
  return capFileName(cleaned);
}

/**
 * ` (2)`, ` (3)` … before the extension when the name is already taken. Nothing
 * is ever overwritten (the upload is `upsert: false` as well, so a race loses
 * the upload rather than the earlier file).
 */
export function withCollisionSuffix(fileName: string, taken: readonly string[]): string {
  const used = new Set(taken.map((name) => name.toLowerCase()));
  if (!used.has(fileName.toLowerCase())) return fileName;
  const { stem, ext } = splitExtension(fileName);
  for (let n = 2; n <= 99; n += 1) {
    const candidate = capFileName(`${stem} (${n})${ext}`);
    if (!used.has(candidate.toLowerCase())) return candidate;
  }
  throw new Error(`There are already 99 files called "${fileName}" on this assignment.`);
}

/** Postgres `split_part(assignment_id, '/', 2)` — 'IST.323/lab-1' → 'lab-1'. */
export function assignmentSlug(assignmentId: string | null | undefined): string {
  if (typeof assignmentId !== 'string') return '';
  return assignmentId.split('/')[1] ?? '';
}

/** The folder a staged file lands in, without the file name. */
export function submissionFolder(
  courseId: string,
  assignmentId: string | null | undefined,
): string {
  const slug = assignmentSlug(assignmentId);
  return `${courseId}/my_submissions${slug ? `/${slug}` : ''}`;
}

/**
 * The Storage key inside the `bb-files` bucket, identical to what
 * `bb_file_relpath(id)` builds for a staged row (migration 008, as amended by
 * 052 — which adds an `attempt-<id>/` segment for *pulled-back* files only, so
 * a staged row's path is unchanged):
 * `<course>/my_submissions/<assignment-slug>/<file_name>`, or without the slug
 * segment when the column has no linked assignment.
 */
export function submissionRelPath(
  courseId: string,
  assignmentId: string | null | undefined,
  fileName: string,
): string {
  return `${submissionFolder(courseId, assignmentId)}/${fileName}`;
}

/** Validate one dropped file at the boundary. Throws with a showable message. */
export function validateUpload(files: readonly File[] | FileList | null | undefined): File {
  const list = files ? Array.from(files as ArrayLike<File>) : [];
  if (list.length === 0) throw new Error('No file was dropped.');
  if (list.length > 1) throw new Error('One file at a time, please — nothing was staged.');
  const file = list[0];
  if (file.size === 0) throw new Error('That file is empty, so it was not staged.');
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error(
      `That file is ${Math.round(file.size / (1024 * 1024))} MB; the limit is ${
        MAX_UPLOAD_BYTES / (1024 * 1024)
      } MB. Nothing was staged.`,
    );
  }
  // Throws on an unusable name before anything is uploaded.
  sanitizeFileName(file.name);
  return file;
}

/** sha256 of the file's bytes, lowercase hex — the same digest Postgres stores. */
export async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error('This browser cannot hash the file (crypto.subtle unavailable).');
  }
  const digest = await subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Did Storage refuse this key because an object already sits on it?
 *
 * `StorageApiError` carries `statusCode` as a string; the message is checked
 * too so a transport that drops the code still lands on the retry rather than
 * on an error the reader cannot act on.
 */
export function isStorageConflict(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const status = (error as { statusCode?: unknown; status?: unknown });
  if (String(status.statusCode ?? status.status ?? '') === '409') return true;
  const message = (error as { message?: unknown }).message;
  return typeof message === 'string' && /already exists|duplicate|resource exists/i.test(message);
}

/* ---------------------------------------------------------------------------
 * The write
 * ------------------------------------------------------------------------ */

export interface StageUploadInput {
  /** The shell the file is filed under (`courses.id`). */
  courseId: string;
  /** The assignment it belongs to; null files it at the course's bucket root. */
  assignmentId: string | null;
  /** Exactly one file — a FileList or array is validated down to one. */
  files: readonly File[] | FileList | null;
}

export interface StageUploadResult {
  fileName: string;
  storagePath: string;
  sha256: string;
  bytes: number;
}

/**
 * Stage a file against an assignment: one Storage object under
 * `my_submissions`, one `bb_files` row pointing at it.
 *
 * Exported as a plain async function as well as a hook, so the exact row it
 * writes and both failure paths can be asserted directly in a test.
 */
export async function stageUpload(input: StageUploadInput): Promise<StageUploadResult> {
  const { courseId, assignmentId } = input;
  if (!courseId) throw new Error('No course to stage this file against.');

  const file = validateUpload(input.files);
  const supabase = getSupabaseBrowserClient();
  const bucket = supabase.storage.from(BB_FILES_BUCKET);

  // `bb_files.bb_course_id` is the Blackboard shell id (`courses.bb_id`), and
  // it is NOT NULL — a course without one cannot carry a file row, and saying
  // so is better than writing a row under a guessed id.
  const { data: course, error: courseError } = await supabase
    .from('courses')
    .select('id, bb_id')
    .eq('id', courseId)
    .maybeSingle();
  if (courseError) throw courseError;
  if (!course) throw new Error(`No course with id ${courseId}.`);
  if (!course.bb_id) {
    throw new Error(
      `${courseId} has no Blackboard id recorded, so a submission cannot be filed against it.`,
    );
  }

  // Existing names for this assignment decide the ` (2)` suffix.
  const takenQuery = supabase
    .from('bb_files')
    .select('file_name')
    .eq('course_id', courseId)
    .eq('bucket', 'my_submissions')
    .is('superseded_by', null);
  const { data: existing, error: existingError } = await (assignmentId
    ? takenQuery.eq('assignment_id', assignmentId)
    : takenQuery.is('assignment_id', null));
  if (existingError) throw existingError;

  const baseName = sanitizeFileName(file.name);
  const taken = (existing ?? []).map((row) => row.file_name);

  let fileName = withCollisionSuffix(baseName, taken);
  let relPath = submissionRelPath(courseId, assignmentId, fileName);

  const bytes = await file.arrayBuffer();
  const sha256 = await sha256Hex(bytes);
  const upload = (key: string) =>
    bucket.upload(key, file, { upsert: false, contentType: file.type || undefined });

  let { error: uploadError } = await upload(relPath);

  if (uploadError && isStorageConflict(uploadError)) {
    // Something occupies the key that no `bb_files` row knows about. Ask
    // Storage what is actually in the folder, suffix past all of it, and try
    // once more — a second conflict is reported rather than looped on.
    const { data: listed } = await bucket.list(submissionFolder(courseId, assignmentId), {
      limit: 100,
    });
    const names = [...taken, fileName, ...(listed ?? []).map((object) => object.name)];
    fileName = withCollisionSuffix(baseName, names);
    relPath = submissionRelPath(courseId, assignmentId, fileName);
    ({ error: uploadError } = await upload(relPath));
  }
  if (uploadError) throw uploadError;

  const storagePath = `${BB_FILES_BUCKET}/${relPath}`;
  const stagedAt = new Date().toISOString();

  const { error: insertError } = await supabase.from('bb_files').insert({
    bb_course_id: course.bb_id,
    course_id: courseId,
    file_name: fileName,
    mime_type: file.type || null,
    bytes: file.size,
    sha256,
    storage_path: storagePath,
    local_path: null,
    bucket: 'my_submissions',
    classified_by: 'stack',
    classification_confidence: 1,
    assignment_id: assignmentId,
    text_status: 'na',
    downloaded_at: stagedAt,
    source_url: null,
    notes: `staged in bb2dash ${stagedAt}`,
  });

  if (insertError) {
    // The row is what every screen reads, so an object without one is both
    // invisible and in the way. Removing it is best effort: if that fails too,
    // the insert error is still what the reader needs to see.
    try {
      await bucket.remove([relPath]);
    } catch {
      // Deliberately ignored — see above.
    }
    throw insertError;
  }

  return { fileName, storagePath, sha256, bytes: file.size };
}

/** The mutation the drop zones use; invalidates every cache the row shows in. */
export function useStageUpload() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: stageUpload,

    onSuccess: (_result, variables) => {
      void queryClient.invalidateQueries({ queryKey: materialsKeys.files() });
      if (variables.assignmentId) {
        void queryClient.invalidateQueries({
          queryKey: gradesKeys.submissionFiles(variables.assignmentId),
        });
      }
    },
  });
}

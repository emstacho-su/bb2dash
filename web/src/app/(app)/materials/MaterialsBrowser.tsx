'use client';

import { useMemo, useState } from 'react';
import { courseCode, useCourses, type CourseSummary } from '@/lib/queries';
import {
  BUCKET_ORDER,
  bucketLabel,
  createSignedFileUrl,
  fileHonesty,
  fileTitle,
  fileTypeChip,
  formatBytes,
  resolveReadingRoute,
  useCurrentFiles,
  useReadings,
  type BbFileRow,
  type FileBucket,
  type ReadingRoute,
  type ReadingRow,
} from '@/lib/queries.materials';
import tokens from '@/styles/tokens.module.css';
import styles from './Materials.module.css';

/* ---------------------------------------------------------------------------
 * Open-in-new-tab button for a stored file (mints a signed URL at click time).
 * Opens the tab synchronously inside the click gesture so pop-up blockers
 * allow it, then points it at the signed URL once Storage responds.
 * ------------------------------------------------------------------------ */

function OpenStoredButton({
  storagePath,
  label = 'Open',
  className,
}: {
  storagePath: string;
  label?: string;
  className: string;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleOpen() {
    setError(null);
    setPending(true);
    const tab = window.open('about:blank', '_blank');
    try {
      const url = await createSignedFileUrl(storagePath);
      if (tab) {
        tab.location.href = url;
      } else {
        // Pop-up was blocked before we could await — try a direct open.
        window.open(url, '_blank', 'noopener,noreferrer');
      }
    } catch (err) {
      tab?.close();
      setError(err instanceof Error ? err.message : 'Could not open file');
    } finally {
      setPending(false);
    }
  }

  return (
    <span className={styles.action}>
      <button type="button" className={className} onClick={handleOpen} disabled={pending}>
        {pending ? 'Opening…' : label}
      </button>
      {error && (
        <span className={styles.rowError} role="alert">
          {error}
        </span>
      )}
    </span>
  );
}

/* ---------------------------------------------------------------------------
 * A single file row (design cue: 03-lecture / 04-assignment material popouts).
 * ------------------------------------------------------------------------ */

function FileRow({ file }: { file: BbFileRow }) {
  const honesty = fileHonesty(file);
  const title = fileTitle(file);
  const chip = fileTypeChip(file.mime_type, file.file_name);

  const meta: string[] = [];
  if (file.week_no != null) meta.push(`Week ${file.week_no}`);
  meta.push(chip);
  meta.push(formatBytes(file.bytes));

  // notes shown on hover per spec; also surfaced as a small marker so it is
  // discoverable rather than hidden.
  const hoverTitle = file.notes ?? undefined;

  return (
    <div className={styles.row}>
      <span className={styles.chip} aria-hidden="true">
        {chip}
      </span>
      <span className={styles.rowMain}>
        <span className={styles.rowTitle} title={hoverTitle}>
          {title}
          {file.notes && <span className={styles.noteMark} title={file.notes} aria-label="has a note">·note</span>}
        </span>
        <span className={styles.rowMeta}>{meta.join(' · ')}</span>
      </span>

      <span className={honestyTagClass(honesty.location)} title={honestyTitle(honesty.location)}>
        {honesty.label}
      </span>

      {honesty.location === 'library' && file.storage_path ? (
        <OpenStoredButton storagePath={file.storage_path} className={tokens.btnPrimary} />
      ) : honesty.location === 'source' && file.source_url ? (
        <span className={styles.action}>
          <a className={tokens.btnPrimary} href={file.source_url} target="_blank" rel="noreferrer">
            Open ↗
          </a>
        </span>
      ) : (
        <span className={styles.action}>
          <button type="button" className={tokens.btnSecondary} disabled title={honesty.label}>
            {honesty.location === 'disk' ? 'On disk only' : 'No route'}
          </button>
        </span>
      )}
    </div>
  );
}

function honestyTagClass(location: string): string {
  if (location === 'library') return tokens.tagAccent;
  if (location === 'source') return tokens.tagOutline;
  return tokens.tagNeutral;
}

function honestyTitle(location: string): string {
  switch (location) {
    case 'library':
      return 'Bytes stored in the bb-files bucket — opens a signed link.';
    case 'source':
      return 'No stored copy; opens the original source URL.';
    case 'disk':
      return 'Recorded in the local mirror only — no online copy to open here.';
    default:
      return 'No storage, source URL or local copy recorded.';
  }
}

/* ---------------------------------------------------------------------------
 * A reading row driven by the four-state Open ladder.
 * ------------------------------------------------------------------------ */

function readingRouteTagClass(kind: ReadingRoute['kind']): string {
  if (kind === 'library') return tokens.tagAccent;
  if (kind === 'external') return tokens.tagOutline;
  if (kind === 'instruction') return tokens.tagNeutral;
  return tokens.tagNeutral;
}

function readingRouteTagLabel(kind: ReadingRoute['kind']): string {
  switch (kind) {
    case 'library':
      return 'In library';
    case 'external':
      return 'External';
    case 'instruction':
      return 'Off-platform';
    default:
      return 'No route';
  }
}

function ReadingRowView({ reading, route }: { reading: ReadingRow; route: ReadingRoute }) {
  const meta: string[] = [];
  if (reading.week_no != null) meta.push(`Week ${reading.week_no}`);
  meta.push(reading.required ? 'Required' : 'Optional');
  if (route.file?.mime_type != null) meta.push(fileTypeChip(route.file.mime_type, route.file.file_name));

  const title = reading.citation ?? reading.topic ?? 'Untitled reading';

  return (
    <div className={styles.row}>
      <span className={tokens.glyphReading} aria-hidden="true">
        R
      </span>
      <span className={styles.rowMain}>
        <span className={styles.rowTitle} title={reading.notes ?? undefined}>
          {title}
          {reading.notes && (
            <span className={styles.noteMark} title={reading.notes} aria-label="has a note">
              ·note
            </span>
          )}
        </span>
        <span className={styles.rowMeta}>{meta.join(' · ')}</span>
        <span className={styles.rowReason} title={route.reason}>
          {route.reason}
        </span>
      </span>

      <span className={readingRouteTagClass(route.kind)} title={route.reason}>
        {readingRouteTagLabel(route.kind)}
      </span>

      {route.kind === 'library' && route.file?.storage_path ? (
        <OpenStoredButton storagePath={route.file.storage_path} label={route.action} className={tokens.btnPrimary} />
      ) : route.href ? (
        <span className={styles.action}>
          <a
            className={route.kind === 'external' ? tokens.btnPrimary : tokens.btnSecondary}
            href={route.href}
            target="_blank"
            rel="noreferrer"
          >
            {route.action}
          </a>
        </span>
      ) : (
        <span className={styles.action}>
          <button type="button" className={tokens.btnSecondary} disabled title={route.reason}>
            {route.action}
          </button>
        </span>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Per-course block: bucket sections in spec order, readings via the ladder.
 * ------------------------------------------------------------------------ */

interface CourseData {
  course: CourseSummary;
  filesByBucket: Map<string, BbFileRow[]>;
  otherFiles: BbFileRow[];
  readings: ReadingRow[];
  linkedFileByReadingId: Map<number, BbFileRow>;
  orphanReadingFiles: BbFileRow[];
  fileCount: number;
}

function BucketSection({ label, count, children }: { label: string; count: number; children: React.ReactNode }) {
  return (
    <section className={styles.bucket}>
      <div className={styles.bucketHead}>
        <span className={tokens.kicker}>{label}</span>
        <span className={styles.bucketCount}>{count}</span>
      </div>
      <div className={styles.rows}>{children}</div>
    </section>
  );
}

function ReadingsSection({ data }: { data: CourseData }) {
  const bbUrl = data.course.bb_url ?? null;
  const total = data.readings.length + data.orphanReadingFiles.length;
  if (total === 0) return null;
  return (
    <BucketSection label={bucketLabel('readings')} count={total}>
      {data.readings.map((reading) => {
        const file = data.linkedFileByReadingId.get(Number(reading.id));
        const route = resolveReadingRoute(reading, file, bbUrl);
        return <ReadingRowView key={`r-${reading.id}`} reading={reading} route={route} />;
      })}
      {data.orphanReadingFiles.map((file) => (
        <FileRow key={`f-${file.id}`} file={file} />
      ))}
    </BucketSection>
  );
}

function CourseBlock({ data }: { data: CourseData }) {
  const { course } = data;
  const readingTotal = data.readings.length + data.orphanReadingFiles.length;
  const totalItems = data.fileCount + data.readings.length;

  const sections = BUCKET_ORDER.map((bucket: FileBucket) => {
    if (bucket === 'readings') {
      return readingTotal > 0 ? <ReadingsSection key="readings" data={data} /> : null;
    }
    const files = data.filesByBucket.get(bucket);
    if (!files || files.length === 0) return null;
    return (
      <BucketSection key={bucket} label={bucketLabel(bucket)} count={files.length}>
        {files.map((file) => (
          <FileRow key={file.id} file={file} />
        ))}
      </BucketSection>
    );
  }).filter(Boolean);

  // Any files in buckets outside the spec order (my_submissions, media_links,
  // unclassified, …) — surfaced rather than silently dropped.
  if (data.otherFiles.length > 0) {
    const byBucket = new Map<string, BbFileRow[]>();
    for (const file of data.otherFiles) {
      const key = file.bucket ?? 'unfiled';
      const list = byBucket.get(key) ?? [];
      list.push(file);
      byBucket.set(key, list);
    }
    for (const [bucket, files] of byBucket) {
      sections.push(
        <BucketSection key={`other-${bucket}`} label={bucketLabel(bucket)} count={files.length}>
          {files.map((file) => (
            <FileRow key={file.id} file={file} />
          ))}
        </BucketSection>,
      );
    }
  }

  return (
    <section className={styles.course}>
      <div className={styles.courseHead}>
        <div className={styles.courseHeadText}>
          <span className={styles.courseCode}>{courseCode(course)}</span>
          <span className={styles.courseTitle}>{course.title_short ?? course.title_bb ?? course.id}</span>
        </div>
        <div className={styles.courseHeadRight}>
          <span className={styles.courseCount}>
            {totalItems} {totalItems === 1 ? 'item' : 'items'}
          </span>
          {course.bb_url && (
            <a className={styles.bbLink} href={course.bb_url} target="_blank" rel="noreferrer">
              Blackboard ↗
            </a>
          )}
        </div>
      </div>
      <hr className={tokens.rule} />
      <div className={styles.buckets}>{sections}</div>
    </section>
  );
}

/* ---------------------------------------------------------------------------
 * The browser.
 * ------------------------------------------------------------------------ */

export function MaterialsBrowser() {
  const courses = useCourses();
  const files = useCurrentFiles();
  const readings = useReadings();

  const loading = courses.isPending || files.isPending || readings.isPending;
  const failed = courses.error ?? files.error ?? readings.error;

  const perCourse = useMemo<CourseData[]>(() => {
    if (!courses.data || !files.data || !readings.data) return [];

    const bucketSet = new Set<string>(BUCKET_ORDER);

    return courses.data
      .map((course): CourseData => {
        const courseFiles = files.data!.filter((f) => f.course_id === course.id);
        const courseReadings = readings.data!.filter((r) => r.course_id === course.id);

        const linkedFileByReadingId = new Map<number, BbFileRow>();
        for (const f of courseFiles) {
          if (f.reading_id != null) linkedFileByReadingId.set(Number(f.reading_id), f);
        }

        const filesByBucket = new Map<string, BbFileRow[]>();
        const otherFiles: BbFileRow[] = [];
        const orphanReadingFiles: BbFileRow[] = [];

        for (const f of courseFiles) {
          // Reading-linked files are shown through the reading ladder, not twice.
          if (f.reading_id != null) continue;
          if (f.bucket === 'readings') {
            orphanReadingFiles.push(f);
            continue;
          }
          if (f.bucket && bucketSet.has(f.bucket)) {
            const list = filesByBucket.get(f.bucket) ?? [];
            list.push(f);
            filesByBucket.set(f.bucket, list);
          } else {
            otherFiles.push(f);
          }
        }

        return {
          course,
          filesByBucket,
          otherFiles,
          readings: courseReadings,
          linkedFileByReadingId,
          orphanReadingFiles,
          fileCount: courseFiles.length,
        };
      })
      .filter((d) => d.fileCount > 0 || d.readings.length > 0);
  }, [courses.data, files.data, readings.data]);

  if (failed) {
    return (
      <p className={styles.problem} role="alert">
        Could not load materials from Supabase: {failed.message}
      </p>
    );
  }

  if (loading) {
    return <p className={styles.loading}>Loading materials…</p>;
  }

  if (perCourse.length === 0) {
    return <p className={styles.loading}>No course materials have been pulled yet.</p>;
  }

  return (
    <div className={styles.browser}>
      {perCourse.map((data) => (
        <CourseBlock key={data.course.id} data={data} />
      ))}
    </div>
  );
}

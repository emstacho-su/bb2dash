'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { courseCode, useCourses, type CourseSummary } from '@/lib/queries';
import { FileOpenAction } from '@/components/materials/FileOpenAction';
// The reading ladder is a different ladder (resolveReadingRoute); it still
// drives the stored-file button directly.
import { OpenStoredButton } from '@/components/materials/OpenStoredButton';
import {
  BUCKET_ORDER,
  bucketLabel,
  fileHonesty,
  fileTitle,
  fileTypeChip,
  formatBytes,
  groupReadings,
  resolveReadingRoute,
  useCurrentFiles,
  useReadings,
  type BbFileRow,
  type FileBucket,
  type ReadingRoute,
  type ReadingRow,
} from '@/lib/queries.materials';
import {
  readCollapsed,
  sectionKey,
  toggleCollapsed,
  writeCollapsed,
} from '@/lib/materials-collapse';
import { STAGED_LABEL, submissionOrigin } from '@/lib/queries.grades';
import tokens from '@/styles/tokens.module.css';
import styles from './Materials.module.css';

/* ---------------------------------------------------------------------------
 * A single file row (design cue: 03-lecture / 04-assignment material popouts).
 * ------------------------------------------------------------------------ */

function FileRow({ file, blackboardUrl = null }: { file: BbFileRow; blackboardUrl?: string | null }) {
  const honesty = fileHonesty(file);
  const title = fileTitle(file);
  const chip = fileTypeChip(file.mime_type, file.file_name);
  // R-18: a file Stack staged here carries the one call to action it can
  // honestly carry — bb2dash cannot submit it, Blackboard can.
  const origin = submissionOrigin(file);

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
        {origin === 'staged' &&
          (blackboardUrl ? (
            <a
              className={styles.rowReason}
              href={blackboardUrl}
              target="_blank"
              rel="noreferrer"
              title="bb2dash cannot submit for you — open Blackboard and attach it there."
            >
              {STAGED_LABEL}
            </a>
          ) : (
            <span className={styles.rowReason}>{STAGED_LABEL}</span>
          ))}
      </span>

      {origin === 'pulled_back' && (
        <span className={tokens.tagAccent} title="Pulled back out of Blackboard by a sync.">
          submitted copy
        </span>
      )}

      <FileOpenAction routes={file} showLabel />
    </div>
  );
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

/**
 * M-1 (P-materials-1): a bucket folds away, and stays folded across reloads.
 *
 * A <button> with `aria-expanded`, not a <details>: the open/closed state is
 * owned by React so it can be persisted and restored, and a native <details>
 * would fight that on every re-render.
 */
function BucketSection({
  label,
  count,
  collapsed,
  onToggle,
  children,
}: {
  label: string;
  count: number;
  collapsed: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className={styles.bucket}>
      <button
        type="button"
        className={styles.bucketHead}
        aria-expanded={!collapsed}
        onClick={onToggle}
      >
        <span className={styles.bucketCaret} aria-hidden="true">
          {collapsed ? '▸' : '▾'}
        </span>
        <span className={tokens.kicker}>{label}</span>
        <span className={styles.bucketCount}>{count}</span>
      </button>
      {!collapsed && <div className={styles.rows}>{children}</div>}
    </section>
  );
}

/**
 * M-1 (P-materials-3): readings blocked by the date they are assigned for,
 * undated last. The grouping rule lives in `groupReadings` — this only draws it.
 */
function ReadingsSection({
  data,
  collapsed,
  onToggle,
}: {
  data: CourseData;
  collapsed: boolean;
  onToggle: () => void;
}) {
  const bbUrl = data.course.bb_url ?? null;
  const total = data.readings.length + data.orphanReadingFiles.length;
  if (total === 0) return null;

  const groups = groupReadings(data.readings);

  return (
    <BucketSection
      label={bucketLabel('readings')}
      count={total}
      collapsed={collapsed}
      onToggle={onToggle}
    >
      {groups.map((group) => (
        <div key={group.key} className={styles.readingGroup}>
          <h4 className={styles.readingGroupHead}>
            <span className={styles.readingGroupLabel}>{group.heading}</span>
            <span className={styles.bucketCount}>{group.readings.length}</span>
          </h4>
          {group.readings.map((reading) => {
            const file = data.linkedFileByReadingId.get(Number(reading.id));
            const route = resolveReadingRoute(reading, file, bbUrl);
            return <ReadingRowView key={`r-${reading.id}`} reading={reading} route={route} />;
          })}
        </div>
      ))}
      {data.orphanReadingFiles.map((file) => (
        <FileRow key={`f-${file.id}`} file={file} blackboardUrl={bbUrl} />
      ))}
    </BucketSection>
  );
}

function CourseBlock({
  data,
  collapsed,
  onToggle,
}: {
  data: CourseData;
  collapsed: ReadonlySet<string>;
  onToggle: (key: string) => void;
}) {
  const { course } = data;
  const readingTotal = data.readings.length + data.orphanReadingFiles.length;
  const totalItems = data.fileCount + data.readings.length;

  /** This course's bucket, as the collapse state names it. */
  const keyFor = (bucket: string) => sectionKey(course.id, bucket);

  const sections = BUCKET_ORDER.map((bucket: FileBucket) => {
    if (bucket === 'readings') {
      return readingTotal > 0 ? (
        <ReadingsSection
          key="readings"
          data={data}
          collapsed={collapsed.has(keyFor('readings'))}
          onToggle={() => onToggle(keyFor('readings'))}
        />
      ) : null;
    }
    const files = data.filesByBucket.get(bucket);
    if (!files || files.length === 0) return null;
    return (
      <BucketSection
        key={bucket}
        label={bucketLabel(bucket)}
        count={files.length}
        collapsed={collapsed.has(keyFor(bucket))}
        onToggle={() => onToggle(keyFor(bucket))}
      >
        {files.map((file) => (
          <FileRow key={file.id} file={file} blackboardUrl={course.bb_url ?? null} />
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
        <BucketSection
          key={`other-${bucket}`}
          label={bucketLabel(bucket)}
          count={files.length}
          collapsed={collapsed.has(keyFor(bucket))}
          onToggle={() => onToggle(keyFor(bucket))}
        >
          {files.map((file) => (
            <FileRow key={file.id} file={file} blackboardUrl={course.bb_url ?? null} />
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
          {/* R-06: the same materials, in the folder tree Blackboard put them in. */}
          <Link className={styles.bbLink} href={`/course/${course.id}/classwork`}>
            Open in Classwork →
          </Link>
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

  /**
   * M-1: which sections are folded away. Seeded empty and adopted from storage
   * in a mount effect rather than read during render — the server has no
   * localStorage, and reading it in render would make the first client render
   * disagree with the HTML it is hydrating.
   */
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set<string>());
  useEffect(() => {
    setCollapsed(readCollapsed());
  }, []);

  function handleToggle(key: string) {
    setCollapsed((current) => {
      const next = toggleCollapsed(current, key);
      writeCollapsed(next);
      return next;
    });
  }

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
        <CourseBlock
          key={data.course.id}
          data={data}
          collapsed={collapsed}
          onToggle={handleToggle}
        />
      ))}
    </div>
  );
}

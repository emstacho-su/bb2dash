'use client';

/**
 * Course Classwork (Phase 8, R-01) — Blackboard's own folder tree.
 *
 * `v_content_tree` is read in `path` order, which puts a folder ahead of its
 * children by construction, and folded to one node per `content_id` (a node
 * with several files arrives as several rows). Each node shows the Ultra
 * progress chip Blackboard recorded, and every file underneath it uses the
 * Materials screen's Open ladder — a signed-URL open when the bytes are in the
 * library, an honest label when they are not.
 *
 * The old week-rail timeline still lives at `?view=timeline`; the page routes
 * to it, and the link back to it sits in this pane's header.
 */

import Link from 'next/link';
import { useMemo } from 'react';
import {
  groupContentTree,
  isFolderNode,
  ultraStateLabel,
  useContentTree,
  useCourseDisplay,
  type ContentFile,
  type ContentNode,
} from '@/lib/queries.course';
import { fileHonesty, fileTitle, fileTypeChip } from '@/lib/queries.materials';
import { OpenStoredButton } from '@/components/files/OpenStoredButton';
import tokens from '@/styles/tokens.module.css';
import styles from './CourseClasswork.module.css';

/** Indentation stops at four levels so a deep tree stays readable. */
const MAX_INDENT_DEPTH = 4;

function indentFor(depth: number): number {
  return Math.min(Math.max(depth - 1, 0), MAX_INDENT_DEPTH);
}

/* -- a file under a content node ------------------------------------------- */

export function ClassworkFileRow({ file, nodeUrl }: { file: ContentFile; nodeUrl: string | null }) {
  const honesty = fileHonesty({
    storage_path: file.storagePath,
    local_path: null,
    source_url: null,
  });
  const title = fileTitle({
    file_name: file.fileName,
    storage_path: file.storagePath,
    path: null,
  });
  const chip = fileTypeChip(null, file.fileName);

  return (
    <div className={styles.fileRow}>
      <span className={styles.chip} aria-hidden="true">
        {chip}
      </span>
      <span className={styles.fileName}>{title}</span>
      <span className={honesty.openable ? tokens.tagAccent : tokens.tagNeutral}>{honesty.label}</span>
      {file.storagePath ? (
        <OpenStoredButton storagePath={file.storagePath} className={tokens.btnPrimary} />
      ) : nodeUrl ? (
        <a className={tokens.btnSecondary} href={nodeUrl} target="_blank" rel="noreferrer">
          In Blackboard ↗
        </a>
      ) : (
        <button type="button" className={tokens.btnSecondary} disabled title={honesty.label}>
          No route
        </button>
      )}
    </div>
  );
}

/** What a leaf item is, in words. Falls back to Blackboard's own type name. */
export function contentKindLabel(node: Pick<ContentNode, 'itemKind' | 'bbType'>): string | null {
  const raw = node.itemKind ?? node.bbType;
  if (!raw) return null;
  return raw.replace(/_/g, ' ');
}

/* -- one content node ------------------------------------------------------ */

export function ClassworkNode({ node }: { node: ContentNode }) {
  const folder = isFolderNode(node);
  const state = ultraStateLabel(node.state);
  // A folder announces itself by its heading; only leaf items need the kind said.
  const kindLabel = folder ? null : contentKindLabel(node);

  return (
    <div
      className={folder ? styles.folder : styles.item}
      style={{ marginLeft: `calc(var(--space-6) * ${indentFor(node.depth)})` }}
      data-content-id={node.contentId}
      data-folder={folder ? 'true' : 'false'}
    >
      <div className={styles.nodeHead}>
        <span className={folder ? styles.folderTitle : styles.itemTitle}>{node.title}</span>
        {kindLabel && <span className={styles.kind}>{kindLabel}</span>}
        {state && <span className={styles.stateChip}>{state}</span>}
        {node.url && (
          <a className={styles.bbLink} href={node.url} target="_blank" rel="noreferrer">
            Blackboard ↗
          </a>
        )}
      </div>

      {node.files.length > 0 && (
        <div className={styles.files}>
          {node.files.map((file) => (
            <ClassworkFileRow key={file.fileId} file={file} nodeUrl={node.url} />
          ))}
        </div>
      )}
    </div>
  );
}

/* -- the screen ------------------------------------------------------------ */

export function CourseClasswork({ courseId }: { courseId: string }) {
  const display = useCourseDisplay(courseId);
  const shellIds = useMemo(() => display.data?.shell_ids ?? [], [display.data]);
  const treeQ = useContentTree(shellIds);

  const nodes = useMemo(() => groupContentTree(treeQ.data ?? []), [treeQ.data]);

  if (display.isPending) return <p className={styles.state}>Loading course…</p>;
  if (display.isError) return <p className={styles.state}>Could not load this course.</p>;
  if (!display.data) return <p className={styles.state}>No course with id {courseId}.</p>;

  const fileCount = nodes.reduce((sum, node) => sum + node.files.length, 0);

  return (
    <div className={styles.screen}>
      <h1 className="sr-only">{display.data.code} — Classwork</h1>

      <div className={styles.head}>
        <span className={tokens.kicker}>Blackboard content</span>
        <span className={styles.sub}>
          {treeQ.isPending
            ? 'loading…'
            : `${nodes.length} item${nodes.length === 1 ? '' : 's'} · ${fileCount} file${fileCount === 1 ? '' : 's'}`}
        </span>
        <Link
          className={tokens.btnGhost}
          href={`/course/${encodeURIComponent(courseId)}/classwork?view=timeline`}
        >
          Week timeline →
        </Link>
      </div>

      {treeQ.isError && (
        <p className={styles.state} role="alert">
          Could not load the content tree: {treeQ.error.message}
        </p>
      )}
      {!treeQ.isPending && !treeQ.isError && nodes.length === 0 && (
        <p className={styles.state}>
          No Blackboard content has been pulled for this course yet.
        </p>
      )}

      <div className={styles.tree}>
        {nodes.map((node) => (
          <ClassworkNode key={node.contentId} node={node} />
        ))}
      </div>
    </div>
  );
}

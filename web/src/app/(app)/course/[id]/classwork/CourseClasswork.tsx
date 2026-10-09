'use client';

/**
 * Course Classwork (Phase 8, R-01) — Blackboard's own folder tree.
 *
 * `v_content_tree` rows are folded to one node per `content_id` (a node with
 * several files arrives as several rows) and nested on `parent_id`, then
 * rendered by recursing through the tree — not as a flat list indented by a
 * path depth, which drew the wrong nesting whenever a sibling's title extended
 * another's. Each node shows the Ultra progress chip Blackboard recorded, and
 * every file underneath it goes through the shared `FileOpenAction` ladder — a
 * signed-URL open when the bytes are in the library, the item's Blackboard page
 * when they are not, and a label that claims only what this view can see (it
 * carries `storage_path` alone, so "not stored" is honest and "no route" is
 * not).
 *
 * What Blackboard no longer lists (R-39, T-13; 111's `missing_since`): a rename
 * ghost — a vanished node whose `bb_item_id` is live in the same shell — is
 * never drawn, and a vanished node with no live twin waits behind a counted
 * toggle and is labelled when shown. A file's note is its hover title (R-40).
 *
 * The week-rail timeline is the Stream tab since round 3 (R3-4); this pane
 * keeps only Blackboard's folder tree, and `?view=timeline` redirects there.
 */

import { Mark } from '@/components/shell/icons';
import { useMemo, useState } from 'react';
import {
  buildContentTree,
  flattenContentTree,
  isFolderNode,
  splitVanishedRows,
  ultraStateLabel,
  useContentTree,
  useCourseDisplay,
  type ContentFile,
  type ContentNode,
  type ContentTreeRow,
} from '@/lib/queries.course';
import { UNKNOWN_ROUTE, fileTitle, fileTypeChip } from '@/lib/queries.materials';
import { FileOpenAction } from '@/components/materials/FileOpenAction';
import { UploadDropZone } from '@/components/grades/UploadDropZone';
import tokens from '@/styles/tokens.module.css';
import styles from './CourseClasswork.module.css';

/**
 * Indentation stops at four levels so a deep tree stays readable.
 *
 * `depth` is the 0-based recursion depth — a root is flush, its children are
 * one step in. (It used to be the row's 1-based `depth` column, which is why
 * the subtraction was here.)
 */
const MAX_INDENT_DEPTH = 4;

function indentFor(depth: number): number {
  return Math.min(Math.max(depth, 0), MAX_INDENT_DEPTH);
}

/* -- a file under a content node ------------------------------------------- */

export function ClassworkFileRow({ file, nodeUrl }: { file: ContentFile; nodeUrl: string | null }) {
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
      {/* R-40: the file's note on hover, marked as Materials marks it. */}
      <span className={styles.fileName} title={file.notes ?? undefined}>
        {title}
      </span>
      {file.notes && (
        <span className={styles.noteMark} title={file.notes} aria-label="has a note">
          ·note
        </span>
      )}
      {/* `v_content_tree` projects storage_path and nothing else, so the other
          two routes are unknown here rather than absent — see UNKNOWN_ROUTE. */}
      <FileOpenAction
        routes={{
          storage_path: file.storagePath,
          local_path: UNKNOWN_ROUTE,
          source_url: UNKNOWN_ROUTE,
        }}
        blackboardUrl={nodeUrl}
        showLabel
      />
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

/**
 * One node and everything under it.
 *
 * `depth` is the recursion depth, not the row's `depth` column: an item whose
 * parent is in another shell (or outside this fetch) renders as a root here,
 * and indenting it by its path depth would leave it floating under nothing.
 */
export function ClassworkNode({ node, depth = 0 }: { node: ContentNode; depth?: number }) {
  const folder = isFolderNode(node);
  const state = ultraStateLabel(node.state);
  // A folder announces itself by its heading; only leaf items need the kind said.
  const kindLabel = folder ? null : contentKindLabel(node);

  return (
    <>
      <div
        className={folder ? styles.folder : styles.item}
        style={{ marginLeft: `calc(var(--space-6) * ${indentFor(depth)})` }}
        data-content-id={node.contentId}
        data-depth={depth}
        data-folder={folder ? 'true' : 'false'}
      >
        <div className={styles.nodeHead}>
          <span className={folder ? styles.folderTitle : styles.itemTitle}>{node.title}</span>
          {kindLabel && <span className={styles.kind}>{kindLabel}</span>}
          {node.missingSince && <span className={styles.goneChip}>{NO_LONGER_LISTED}</span>}
          {state && <span className={styles.stateChip}>{state}</span>}
          {node.url && (
            <a className={styles.bbLink} href={node.url} target="_blank" rel="noreferrer">
              Blackboard <Mark name="arrowUpRight" />
            </a>
          )}
          {/* R-18: a node Blackboard links to an assignment can take a staged
              file. It is filed under the node's own shell, not the route's —
              a display course can span two shells. */}
          {node.assignmentId && (
            <UploadDropZone
              courseId={node.courseId}
              assignmentId={node.assignmentId}
              compact
              label="Stage a file"
            />
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

      {node.children.map((child) => (
        <ClassworkNode key={child.contentId} node={child} depth={depth + 1} />
      ))}
    </>
  );
}

/* -- the tree, with what Blackboard no longer lists ------------------------- */

/** The label on a stale node the reader chose to see (B-19). */
export const NO_LONGER_LISTED = 'No longer in Blackboard';

/** "Show 2 items Blackboard no longer lists" / "Hide 1 item …". */
export function staleToggleLabel(count: number, shown: boolean): string {
  return `${shown ? 'Hide' : 'Show'} ${count} item${count === 1 ? '' : 's'} Blackboard no longer lists`;
}

/**
 * Blackboard's tree as it lists it now (R-39, T-13). Rename ghosts are never
 * drawn; stale nodes with no live twin wait behind a toggle that counts them
 * and is not persisted. A course with none shows no toggle.
 */
export function ClassworkTree({ rows }: { rows: ContentTreeRow[] }) {
  const [showStale, setShowStale] = useState(false);
  const split = useMemo(() => splitVanishedRows(rows), [rows]);
  const roots = useMemo(
    () => buildContentTree(showStale ? [...split.live, ...split.stale] : split.live),
    [split, showStale],
  );

  return (
    <>
      {split.staleCount > 0 && (
        <button
          type="button"
          className={styles.staleToggle}
          aria-pressed={showStale}
          onClick={() => setShowStale((shown) => !shown)}
        >
          {staleToggleLabel(split.staleCount, showStale)}
        </button>
      )}
      <div className={styles.tree}>
        {roots.map((node) => (
          <ClassworkNode key={node.contentId} node={node} />
        ))}
      </div>
    </>
  );
}

/* -- the screen ------------------------------------------------------------ */

export function CourseClasswork({ courseId }: { courseId: string }) {
  const display = useCourseDisplay(courseId);
  const shellIds = useMemo(() => display.data?.shell_ids ?? [], [display.data]);
  const treeQ = useContentTree(shellIds);

  const rows = useMemo(() => treeQ.data ?? [], [treeQ.data]);
  // The header counts what Blackboard lists now, not the hidden nodes.
  const nodes = useMemo(
    () => flattenContentTree(buildContentTree(splitVanishedRows(rows).live)),
    [rows],
  );

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

      <ClassworkTree rows={rows} />
    </div>
  );
}

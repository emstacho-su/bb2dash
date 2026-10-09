/**
 * The source rows of an answer (brief 109, steps 10 and 12; shapes in `contract24/turn-put.json` and
 * its README). A row holds ids, a place and a title, never passage text. A label resolves to a row
 * by one column: `[M<n>]` by `text_id`, `[U<n>]` by `doc_text_id`, `[R<n>]` by a memory row's
 * `document_id`, `[P]` by the row of kind `feed`.
 *
 *   auto      the passages that went into the prompt, then the remembered items, then the feed;
 *   attached  one row for each attached file that was read, whole or in part, with no unit id;
 *   tool      a unit the model opened with \`get_material_text\`, taken from the call's input.
 * Nothing is parsed out of a tool result's text.
 */

import type { AttachmentOutcome } from './context/attachments.js';
import { oneLine } from './context/fence.js';
import type { SourceRow } from './db.js';
import type { StoredToolCall } from './providers/types.js';
import type { Hit } from './store-types.js';

export const FEED_SOURCE_TITLE = 'Planner and grades';
const OPEN_TOOL = 'get_material_text';
const WHOLE_NUMBER = /^[0-9]{1,15}$/;

const row = (fields: Partial<SourceRow> & Pick<SourceRow, 'kind' | 'origin'>): SourceRow => ({
  file_id: null,
  text_id: null,
  document_id: null,
  doc_text_id: null,
  course_id: null,
  unit_kind: null,
  unit_no: null,
  similarity: null,
  title: null,
  ...fields,
});

function hitRow(hit: Hit): SourceRow {
  const where = { course_id: hit.courseId, unit_kind: hit.unitKind, unit_no: hit.unitNo, similarity: hit.similarity, title: oneLine(hit.title) };
  if (hit.kind === 'material') return row({ kind: 'material', origin: 'auto', file_id: hit.fileId, text_id: hit.unitId, ...where });
  // A remembered item's label is its own document id; an upload's unit is the unit of its document.
  return row({ kind: hit.kind, origin: 'auto', document_id: hit.documentId, doc_text_id: hit.unitId, ...where });
}

function attachedRow(outcome: AttachmentOutcome): SourceRow {
  const ids = outcome.kind === 'file' ? { file_id: outcome.id } : { document_id: outcome.id };
  return row({ kind: outcome.kind === 'file' ? 'material' : 'upload', origin: 'attached', course_id: outcome.courseId, title: oneLine(outcome.title), ...ids });
}

export interface PromptSources {
  readonly passages: readonly Hit[];
  readonly memory: readonly Hit[];
  readonly feedIncluded: boolean;
  readonly attachments: readonly AttachmentOutcome[];
}

/** The rows that are known before the answering turn starts, in the order the README gives. */
export function promptSourceRows(sources: PromptSources): SourceRow[] {
  return [
    ...sources.passages.map(hitRow),
    ...sources.memory.map(hitRow),
    ...(sources.feedIncluded ? [row({ kind: 'feed', origin: 'auto', title: FEED_SOURCE_TITLE })] : []),
    ...sources.attachments.filter((outcome) => outcome.state === 'read' || outcome.state === 'cut').map(attachedRow),
  ];
}

/**
 * The rows for units the model opened by id: from the input of each `get_material_text` call that
 * answered. A unit that already stands as a passage of the prompt is not a second row. The function
 * fills the unit's file, course, place and title from its row.
 */
export function toolSourceRows(calls: readonly StoredToolCall[], known: readonly SourceRow[]): SourceRow[] {
  const seen = new Set(known.flatMap((source) => (source.kind === 'material' && source.text_id !== null ? [source.text_id] : [])));
  const rows: SourceRow[] = [];
  for (const call of calls) {
    if (call.tool !== OPEN_TOOL || !call.ok || call.scope === null || !WHOLE_NUMBER.test(call.scope)) continue;
    const textId = Number(call.scope);
    if (seen.has(textId)) continue;
    seen.add(textId);
    rows.push(row({ kind: 'material', origin: 'tool', text_id: textId }));
  }
  return rows;
}

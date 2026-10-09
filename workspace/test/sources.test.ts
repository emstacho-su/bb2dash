import { describe, expect, it } from 'vitest';

import type { AttachmentOutcome } from '../src/context/attachments.js';
import { FEED_SOURCE_TITLE, promptSourceRows, toolSourceRows } from '../src/sources.js';
import type { StoredToolCall } from '../src/providers/types.js';
import { hitFixture, readContractJson } from './helpers/context24.js';

interface FrozenSource {
  kind: string;
  origin: string;
  file_id: number | null;
  text_id: number | null;
  document_id: number | null;
  doc_text_id: number | null;
  course_id: string | null;
  unit_kind: string | null;
  unit_no: number | null;
  similarity: number | null;
  title: string | null;
}

const frozen = (readContractJson('turn-put.json') as { p_sources: FrozenSource[] }).p_sources;

const material = hitFixture();
const upload = hitFixture({ kind: 'upload', unitId: 88, fileId: null, documentId: 17, title: 'lab-notes.pdf', unitKind: 'page', unitNo: 2, similarity: 0.842 });
const memory = hitFixture({ kind: 'memory', unitId: 93, fileId: null, documentId: 21, courseId: null, title: 'Membrane transport review', unitKind: 'doc', unitNo: 1, similarity: 0.803 });
const attached: AttachmentOutcome[] = [
  { kind: 'file', id: 412, state: 'cut', title: 'Week 5 slides.pptx', courseId: 'BIO.110' },
  { kind: 'upload', id: 17, state: 'read', title: 'lab-notes.pdf', courseId: 'BIO.110' },
];

describe('the rows known before the answer', () => {
  it('are the rows of turn-put.json for the same prompt: passages, remembered items, the feed, the attached files', () => {
    const rows = promptSourceRows({ passages: [material, upload], memory: [memory], feedIncluded: true, attachments: attached });
    expect(rows).toEqual(frozen.slice(0, 6));
  });

  it('holds ids, a place and a title, and no passage text', () => {
    const rows = promptSourceRows({ passages: [material], memory: [], feedIncluded: true, attachments: attached });
    const text = JSON.stringify(rows);
    expect(text).not.toContain(material.passage);
    expect(Object.keys(rows[0] ?? {}).sort()).toEqual(Object.keys(frozen[0] ?? {}).sort());
    expect(rows.find((row) => row.kind === 'feed')?.title).toBe(FEED_SOURCE_TITLE);
  });

  it('leaves out the feed when it is not in the prompt, and an attached file that was not read', () => {
    const rows = promptSourceRows({
      passages: [],
      memory: [],
      feedIncluded: false,
      attachments: [{ kind: 'upload', id: 3, state: 'failed', title: 'x.pdf', courseId: null }, attached[0] as AttachmentOutcome],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: 'material', origin: 'attached', file_id: 412, text_id: null });
  });

  it('keeps a title to one line of at most 120 characters', () => {
    const rows = promptSourceRows({ passages: [hitFixture({ title: `${'t'.repeat(150)}\nsecond line` })], memory: [], feedIncluded: false, attachments: [] });
    expect(rows[0]?.title).toHaveLength(120);
  });

  it('resolves a label by one column: M by text_id, U by doc_text_id, R by the remembered document id', () => {
    const rows = promptSourceRows({ passages: [material, upload], memory: [memory], feedIncluded: true, attachments: [] });
    expect(rows.find((row) => row.text_id === 9001)?.kind).toBe('material');
    expect(rows.find((row) => row.doc_text_id === 88)?.kind).toBe('upload');
    expect(rows.find((row) => row.kind === 'memory')?.document_id).toBe(21);
    expect(rows.filter((row) => row.kind === 'feed')).toHaveLength(1);
  });
});

describe('the rows for units the model opened', () => {
  const call = (tool: string, scope: string | null, ok = true): StoredToolCall => ({ tool, query: null, scope, ok });
  const known = promptSourceRows({ passages: [material], memory: [], feedIncluded: false, attachments: [] });

  it('are origin tool, with the unit id from the call input and nothing else filled', () => {
    expect(toolSourceRows([call('get_material_text', '9003')], known)).toEqual([frozen[6]]);
  });

  it('count only get_material_text calls that answered, with a whole-number id', () => {
    const rows = toolSourceRows(
      [call('search_materials', '9004'), call('get_material_text', '9005', false), call('get_material_text', 'abc'), call('get_material_text', '-3'), call('get_material_text', null), call('get_material_text', '12')],
      known,
    );
    expect(rows.map((row) => row.text_id)).toEqual([12]);
  });

  it('leave out a unit that is already a passage of the prompt, and a unit opened twice', () => {
    const rows = toolSourceRows([call('get_material_text', '9001'), call('get_material_text', '5'), call('get_material_text', '5')], known);
    expect(rows.map((row) => row.text_id)).toEqual([5]);
  });

  it('are none when the model opened nothing', () => {
    expect(toolSourceRows([], known)).toEqual([]);
  });
});

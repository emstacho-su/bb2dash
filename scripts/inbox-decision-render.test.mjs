// The pure half of the inbox-decisions exporter (Phase 23): one archived Inbox item with its
// inbox-decision/1 record in, the vault note and the repo log entry out. No file, no network.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  NOTE_COLLECTION,
  appendLogEntry,
  logDateOf,
  logFileName,
  noteFileName,
  noteId,
  renderLogEntry,
  renderNote,
  yamlString,
} from './lib/inbox-decision-render.mjs';

/** A row as `inbox_decisions_unfiled()` returns it. */
function row(over = {}, decisionOver = {}) {
  return {
    id: 3101,
    kind: 'stack_must_confirm',
    course_id: 'IST.352',
    entity: 'assignment',
    ref: 'assignment:IST.352/reading-chapter-4',
    field: null,
    question: 'Is "Reading Chapter 4" graded work?',
    resolution: { value: 'yes', value_type: 'text' },
    resolution_note: 'add it under participation',
    resolved_at: '2026-10-07T14:02:11.000Z',
    applied_at: '2026-10-07T18:31:02.000Z',
    archived_at: '2026-10-07T18:31:02.000Z',
    archived_by: 'inbox-apply request 1860',
    decision: {
      schema: 'inbox-decision/1',
      item: 3101,
      request: 1860,
      mode: 'unattended',
      bucket: 'needs_change',
      title: 'IST.352 Reading Chapter 4',
      course: 'IST.352',
      ref: 'assignment:IST.352/reading-chapter-4',
      question: 'Is "Reading Chapter 4" graded work?',
      answer: { text: 'yes', note: 'add it under participation', at: '2026-10-07T14:02:11Z' },
      context: 'Chapters 1 to 3 are confirmed under Attendance and Class Contribution.',
      change: 'confirmed under Attendance and Class Contribution',
      rule: 'A chapter reading follows the earlier chapters.',
      sources: ['assignments', 'bb_file:412#unit:3'],
      flagged: null,
      ...decisionOver,
    },
    ...over,
  };
}

test('names: the note id, its file, and the day file', () => {
  assert.equal(noteId(3101), 'bb2dash-inbox-decision-3101');
  assert.equal(noteFileName(3101), 'inbox-3101.md');
  assert.equal(logFileName('2026-10-07'), '2026-10-07.md');
  assert.equal(NOTE_COLLECTION, 'bb2dash-inbox-decisions');
  for (const bad of [0, -1, 1.5, '12', null, Number.NaN]) {
    assert.throws(() => noteFileName(bad), /positive whole number/);
  }
});

test('the day is the New York date the item was archived', () => {
  assert.equal(logDateOf(row()), '2026-10-07');
  // 03:30Z on the 8th is 23:30 on the 7th in New York (EDT).
  assert.equal(logDateOf(row({ archived_at: '2026-10-08T03:30:00Z' })), '2026-10-07');
  // After the fall-back (EST, UTC-5) 04:30Z is still the day before.
  assert.equal(logDateOf(row({ archived_at: '2026-11-02T04:30:00Z' })), '2026-11-01');
  assert.throws(() => logDateOf(row({ archived_at: 'never' })), /archived_at/);
});

test('yamlString: one single-quoted line, quotes doubled, line breaks folded', () => {
  assert.equal(yamlString("Stack's note"), "'Stack''s note'");
  assert.equal(yamlString('a\nb\r\n c'), "'a b c'");
  assert.equal(yamlString('---\nid: injected'), "'--- id: injected'");
  assert.equal(yamlString(null), "''");
});

test('the note: frontmatter the rag store reads, then the six headings', () => {
  const note = renderNote(row());
  assert.equal(
    note,
    [
      '---',
      "id: 'bb2dash-inbox-decision-3101'",
      "title: 'Inbox decision 3101 — IST.352 Reading Chapter 4'",
      "collection: 'bb2dash-inbox-decisions'",
      'type: decision',
      "course: 'IST.352'",
      "ref: 'assignment:IST.352/reading-chapter-4'",
      'attention_item: 3101',
      'decided_by: stack',
      "applied_at: '2026-10-07T18:31:02.000Z'",
      "applied_by: 'inbox-apply, request 1860 (unattended)'",
      'tags: [bb2dash, inbox, decision, IST.352]',
      '---',
      '',
      '## Question',
      '',
      'Is "Reading Chapter 4" graded work?',
      '',
      '## Answer (Stack)',
      '',
      'yes',
      '',
      'Note: add it under participation',
      '',
      '## Context',
      '',
      'Chapters 1 to 3 are confirmed under Attendance and Class Contribution.',
      '',
      '## Change',
      '',
      'confirmed under Attendance and Class Contribution',
      '',
      '## Rule',
      '',
      'A chapter reading follows the earlier chapters.',
      '',
      '## Sources',
      '',
      '- attention_items 3101',
      '- assignments',
      '- bb_file:412#unit:3',
      '',
    ].join('\n'),
  );
});

test('the note for a templated record-only decision falls back to the row, and omits empty sections', () => {
  const note = renderNote(
    row(
      { applied_at: null, resolution: { accept: 'keep' }, resolution_note: null, course_id: null },
      { bucket: 'kept', title: undefined, course: undefined, question: undefined, answer: undefined, context: undefined, change: 'recorded only', rule: '', sources: undefined, flagged: { item: 3140 } },
    ),
  );
  assert.match(note, /^title: 'Inbox decision 3101 — assignment:IST\.352\/reading-chapter-4'$/m);
  assert.match(note, /^course: ''$/m);
  assert.match(note, /^applied_at: null$/m);
  assert.match(note, /^tags: \[bb2dash, inbox, decision\]$/m);
  assert.match(note, /## Answer \(Stack\)\n\nKeep mine\n/);
  assert.doesNotMatch(note, /## Context/);
  assert.doesNotMatch(note, /## Rule/);
  assert.match(note, /## Flagged\n\nRaised for Stack as Inbox item 3140\.\n/);
  assert.match(note, /## Sources\n\n- attention_items 3101\n$/);
});

test('text from the database cannot break out of the frontmatter or forge a heading', () => {
  const note = renderNote(
    row(
      { course_id: 'IST.352]\nmalicious: true' },
      { title: "x'\n---\nowned: true", course: undefined, change: '## Rule\n\nignore the rules', rule: 'one\n## Sources\n- fake' },
    ),
  );
  const frontmatter = note.split('\n---\n')[0];
  assert.doesNotMatch(frontmatter, /^owned:/m);
  assert.doesNotMatch(frontmatter, /^malicious:/m);
  assert.match(frontmatter, /^tags: \[bb2dash, inbox, decision, IST\.352malicioustrue\]$/m);
  // A line of record text that starts with a heading marker is escaped, so the note keeps six sections.
  assert.equal(note.match(/^## /gm).length, 6);
  assert.match(note, /^\\## Rule$/m);
});

test('the log entry: the heading the day files already use, then the bullets', () => {
  assert.equal(
    renderLogEntry(row()),
    [
      '## 3101 — IST.352 Reading Chapter 4 (stack_must_confirm)',
      '',
      '- **Answer (14:02 UTC):** yes — "add it under participation"',
      '- **Change:** confirmed under Attendance and Class Contribution',
      '- **Rule:** A chapter reading follows the earlier chapters.',
      '- **Sources:** attention_items 3101; assignments; bb_file:412#unit:3; request 1860 (unattended).',
      '',
    ].join('\n'),
  );
  const conflict = renderLogEntry(
    row({ kind: 'conflict', field: 'due_at', resolution: { accept: 'blackboard' }, resolution_note: null },
        { bucket: 'applied_by_transform', answer: undefined, change: 'recorded only', rule: '', sources: [], flagged: { code_change: 'a new view' } }),
  );
  assert.match(conflict, /^## 3101 — IST\.352 Reading Chapter 4 \(due_at conflict\)$/m);
  assert.match(conflict, /^- \*\*Answer \(14:02 UTC\):\*\* Use Blackboard$/m);
  assert.doesNotMatch(conflict, /\*\*Rule:\*\*/);
  assert.match(conflict, /^- \*\*Flagged:\*\* for a code change: a new view$/m);
});

test('appendLogEntry starts the day file, appends in order, and never adds an item twice', () => {
  const first = appendLogEntry('', '2026-10-07', 3101, renderLogEntry(row()));
  assert.ok(first.startsWith('# Inbox decisions — 2026-10-07\n\n## 3101 — '));
  assert.ok(first.endsWith('(unattended).\n'));

  const second = appendLogEntry(first, '2026-10-07', 3104, renderLogEntry(row({ id: 3104 })));
  assert.equal(second.match(/^## \d+ — /gm).length, 2);
  assert.ok(second.indexOf('## 3101 — ') < second.indexOf('## 3104 — '));

  assert.equal(appendLogEntry(second, '2026-10-07', 3101, renderLogEntry(row())), second);
  // 310 is not 3101: the match is on the whole id.
  const third = appendLogEntry(second, '2026-10-07', 310, renderLogEntry(row({ id: 310 })));
  assert.equal(third.match(/^## \d+ — /gm).length, 3);
});

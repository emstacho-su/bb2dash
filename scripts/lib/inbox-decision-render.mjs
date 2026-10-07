// bb2dash :: scripts/lib/inbox-decision-render.mjs
// The pure half of the inbox-decisions exporter (Phase 23, "database first, files after"): one
// archived Inbox item with its inbox-decision/1 record (a row of inbox_decisions_unfiled(),
// migration 182) in, the vault note and the repo log entry out. No file, no network, no clock.
//
// Everything rendered here came out of the database: a question Blackboard's text shaped, Stack's
// own note, a record Claude wrote. It is data. So a value never reaches the note's frontmatter
// unquoted, and a line of record text can never start a heading of its own.

/** The rag collection the notes are ingested into; the skill's context step searched it. */
export const NOTE_COLLECTION = 'bb2dash-inbox-decisions';

const LOG_ZONE = 'America/New_York';
const ACCEPT_WORDS = new Map([
  ['keep', 'Keep mine'],
  ['blackboard', 'Use Blackboard'],
]);

function assertItemId(id) {
  if (typeof id !== 'number' || !Number.isInteger(id) || id <= 0) {
    throw new Error(`an Inbox item id must be a positive whole number, got ${JSON.stringify(id)}`);
  }
  return id;
}

export function noteId(id) {
  return `bb2dash-inbox-decision-${assertItemId(id)}`;
}

export function noteFileName(id) {
  return `inbox-${assertItemId(id)}.md`;
}

export function logFileName(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date))) throw new Error(`not a YYYY-MM-DD date: ${JSON.stringify(date)}`);
  return `${date}.md`;
}

function asRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function text(value) {
  return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
}

/** One line: every run of line breaks, with the spaces around it, becomes one space. */
function oneLine(value) {
  return text(value).replace(/\s*[\r\n]+\s*/g, ' ');
}

/** A YAML single-quoted scalar on one line. */
export function yamlString(value) {
  return `'${oneLine(value).replace(/'/g, "''")}'`;
}

/** Record text as note body: a line that would start a heading or a rule is escaped. */
function bodyText(value) {
  return text(value)
    .split(/\r?\n/)
    .map((line) => (/^\s{0,3}(#|---|===)/.test(line) ? `\\${line.trimStart()}` : line))
    .join('\n');
}

function isoOrNull(value) {
  const at = new Date(value ?? Number.NaN);
  return Number.isNaN(at.getTime()) ? null : at.toISOString();
}

/** The parts both renderings share, each already chosen between the record and the row. */
function parts(row) {
  const id = assertItemId(row?.id);
  const decision = asRecord(row.decision);
  const answer = asRecord(decision.answer);
  const resolution = asRecord(row.resolution);
  const flagged = asRecord(decision.flagged);
  const sources = Array.isArray(decision.sources) ? decision.sources.map(oneLine).filter((s) => s !== '') : [];

  const answerText =
    text(answer.text) ||
    ACCEPT_WORDS.get(text(resolution.accept)) ||
    text(resolution.value) ||
    text(resolution.accept) ||
    (decision.bucket === 'dismissed' || resolution.dismissed === true ? 'dismissed' : 'answered');

  return {
    id,
    title: oneLine(decision.title) || oneLine(row.ref) || `item ${id}`,
    course: oneLine(decision.course) || oneLine(row.course_id),
    ref: oneLine(decision.ref) || oneLine(row.ref),
    kind: oneLine(row.kind),
    field: oneLine(row.field),
    question: text(decision.question) || text(row.question),
    answerText,
    answerNote: text(answer.note) || text(row.resolution_note),
    answeredAt: isoOrNull(answer.at) ?? isoOrNull(row.resolved_at),
    context: text(decision.context),
    change: text(decision.change) || 'recorded only',
    rule: text(decision.rule),
    flaggedItem: Number.isInteger(flagged.item) ? flagged.item : null,
    flaggedCode: text(flagged.code_change),
    sources,
    request: oneLine(decision.request),
    mode: oneLine(decision.mode) || 'unattended',
    appliedAt: isoOrNull(row.applied_at),
  };
}

/** The New York date the item was archived: the day file it belongs to. */
export function logDateOf(row) {
  const at = new Date(row?.archived_at ?? Number.NaN);
  if (Number.isNaN(at.getTime())) throw new Error(`item ${row?.id}: archived_at is not a time`);
  return new Intl.DateTimeFormat('en-CA', { timeZone: LOG_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);
}

function section(heading, body) {
  return [`## ${heading}`, '', body, ''];
}

/** The vault note: the frontmatter the rag store reads, then the record as headed sections. */
export function renderNote(row) {
  const p = parts(row);
  const courseTag = p.course.replace(/[^A-Za-z0-9._-]/g, '');
  const tags = ['bb2dash', 'inbox', 'decision', ...(courseTag === '' ? [] : [courseTag])];
  const flagged =
    p.flaggedItem !== null
      ? `Raised for Stack as Inbox item ${p.flaggedItem}.`
      : p.flaggedCode !== ''
        ? `For a code change: ${bodyText(p.flaggedCode)}`
        : '';

  return [
    '---',
    `id: ${yamlString(noteId(p.id))}`,
    `title: ${yamlString(`Inbox decision ${p.id} — ${p.title}`)}`,
    `collection: ${yamlString(NOTE_COLLECTION)}`,
    'type: decision',
    `course: ${yamlString(p.course)}`,
    `ref: ${yamlString(p.ref)}`,
    `attention_item: ${p.id}`,
    'decided_by: stack',
    `applied_at: ${p.appliedAt === null ? 'null' : yamlString(p.appliedAt)}`,
    `applied_by: ${yamlString(`inbox-apply, request ${p.request} (${p.mode})`)}`,
    `tags: [${tags.join(', ')}]`,
    '---',
    '',
    ...section('Question', bodyText(p.question)),
    ...section('Answer (Stack)', p.answerNote === '' ? bodyText(p.answerText) : `${bodyText(p.answerText)}\n\nNote: ${bodyText(p.answerNote)}`),
    ...(p.context === '' ? [] : section('Context', bodyText(p.context))),
    ...section('Change', bodyText(p.change)),
    ...(p.rule === '' ? [] : section('Rule', bodyText(p.rule))),
    ...(flagged === '' ? [] : section('Flagged', flagged)),
    ...section('Sources', [`- attention_items ${p.id}`, ...p.sources.map((s) => `- ${s}`)].join('\n')),
  ].join('\n');
}

/** The day file's entry, in the form docs/inbox-decisions has used since 2026-09-22. */
export function renderLogEntry(row) {
  const p = parts(row);
  const hint = p.field === '' ? p.kind : `${p.field} ${p.kind}`;
  const when = p.answeredAt === null ? '' : ` (${p.answeredAt.slice(11, 16)} UTC)`;
  const note = p.answerNote === '' ? '' : ` — "${oneLine(p.answerNote)}"`;
  const flagged =
    p.flaggedItem !== null
      ? `raised for Stack as Inbox item ${p.flaggedItem}`
      : p.flaggedCode !== ''
        ? `for a code change: ${oneLine(p.flaggedCode)}`
        : '';
  const sources = [`attention_items ${p.id}`, ...p.sources, `request ${p.request} (${p.mode})`].join('; ');

  return [
    `## ${p.id} — ${p.title} (${hint})`,
    '',
    `- **Answer${when}:** ${oneLine(p.answerText)}${note}`,
    `- **Change:** ${oneLine(p.change)}`,
    ...(p.rule === '' ? [] : [`- **Rule:** ${oneLine(p.rule)}`]),
    ...(flagged === '' ? [] : [`- **Flagged:** ${flagged}`]),
    `- **Sources:** ${sources}.`,
    '',
  ].join('\n');
}

/**
 * The day file with the entry added: started when empty, appended otherwise, and returned
 * unchanged when it already holds an entry for this item (a re-run after a crash files nothing twice).
 */
export function appendLogEntry(existing, date, id, entry) {
  const current = String(existing ?? '');
  const heading = new RegExp(`^## ${assertItemId(id)} — `, 'm');
  if (heading.test(current)) return current;
  if (current.trim() === '') return `# Inbox decisions — ${date}\n\n${entry}`;
  return `${current.replace(/\n*$/, '\n')}\n${entry}`;
}

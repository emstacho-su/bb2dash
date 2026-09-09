/**
 * Result rendering for an LLM reader.
 *
 * Two scores come back and they mean different things:
 *   - `similarity` is real cosine (gte-small). Interpretable in absolute terms:
 *     on this corpus relevant hits score 0.83–0.92, unrelated 0.75–0.77.
 *   - `score` is a raw RRF sum. It orders results and means nothing on its own,
 *     so it is shown as ordering only and never called a percentage.
 */

import type { CourseRow, MaterialHit, MaterialText, SearchResult } from './client.js';
import type { Mode } from './config.js';

const MAX_EXCERPT_CHARS = 1_500;
const MAX_TEXT_CHARS = 20_000;
const MAX_LISTED_COURSES = 20;

/** PPTX extraction inlines the professor's speaker notes behind this marker. */
const NOTES_MARKER = '[notes]';
const NOTES_WARNING =
  '⚠ contains `[notes]` — PPTX speaker notes (private instructor commentary), not slide text. Quote with care.';

export function truncate(text: string, limit: number): string {
  if (text.length <= limit) return text;
  return `${text.slice(0, limit)}\n… [truncated, ${text.length - limit} more characters]`;
}

export interface SearchContext {
  q: string;
  course: string | null;
  mode: Mode;
  limit: number;
  minSimilarity: number | null;
}

function describeScope(context: SearchContext): string {
  return context.course ? `course "${context.course}"` : 'all courses';
}

function unitLabel(hit: { unitKind: string; unitNo: number }): string {
  return `${hit.unitKind} ${hit.unitNo}`;
}

/**
 * What a sub-floor similarity means depends on how the row got here:
 *   - hybrid, floor applied server-side: the vector arm excluded it, so it is a
 *     literal keyword hit — independent evidence, labelled as such.
 *   - hybrid, floor NOT applied (v2 function): could be either a keyword hit or
 *     the nearest semantic junk; say so rather than guess.
 *   - vector mode has no keyword arm at all: it is simply a weak match.
 */
function formatSimilarity(
  similarity: number | null,
  floor: number | null,
  mode: Mode,
  floorApplied: boolean,
): string {
  if (similarity === null || !Number.isFinite(similarity)) {
    return mode === 'fts' ? 'n/a' : 'n/a (this unit has no embedding — keyword-only evidence)';
  }
  const value = similarity.toFixed(4);
  if (floor === null || similarity >= floor) return value;
  if (mode === 'vector') {
    return `${value} (below the ${floor} floor — a weak semantic match; vector mode has no keyword arm)`;
  }
  if (!floorApplied) {
    return `${value} (below the ${floor} floor — the server did not apply it, so this may be a keyword hit or merely the nearest semantic neighbour)`;
  }
  return `${value} (below the ${floor} floor — surfaced by literal keyword match, not semantic similarity)`;
}

function renderHit(hit: MaterialHit, index: number, context: SearchContext, floorApplied: boolean): string {
  const lines = [
    `### ${index + 1}. ${hit.fileName}`,
    `- course: ${hit.courseId}`,
    `- bucket: ${hit.bucket}`,
    `- unit: ${unitLabel(hit)}`,
    `- text_id: ${hit.textId}${hit.partNo !== null ? ` (part ${hit.partNo})` : ''}`,
    `- file_id: ${hit.fileId}`,
    `- similarity: ${formatSimilarity(hit.similarity, context.minSimilarity, context.mode, floorApplied)}`,
  ];
  if (hit.score !== null) lines.push(`- score: ${hit.score.toFixed(6)} (RRF, ordering only)`);
  if (hit.rank !== null) lines.push(`- rank: ${hit.rank} (ts_rank)`);
  if (hit.excerpt.includes(NOTES_MARKER)) lines.push(`- ${NOTES_WARNING}`);
  lines.push('', truncate(hit.excerpt, MAX_EXCERPT_CHARS));
  return lines.join('\n');
}

/** Render search hits. Callers handle the empty case via formatEmptyResults. */
export function formatSearchResults(context: SearchContext, result: SearchResult): string {
  const { hits } = result;
  if (hits.length === 0) return formatEmptyResults(context);

  const header = [
    `${hits.length} result${hits.length === 1 ? '' : 's'} for "${context.q}" (${describeScope(context)}, mode ${context.mode}, top ${context.limit}).`,
    context.mode === 'fts'
      ? 'Full-text search only: ranked by ts_rank over the extracted text. No semantic similarity is computed in this mode.'
      : 'Judge relevance by `similarity` — real cosine from gte-small, where on this corpus relevant material scores ~0.83–0.92 and unrelated ~0.75–0.77. `score` is a Reciprocal Rank Fusion sum: it sets the ordering and is not a percentage.',
  ];

  if (context.minSimilarity !== null && !result.floorApplied && context.mode !== 'fts') {
    header.push(
      `Note: the ${context.minSimilarity} similarity floor was not applied server-side (the deployed search function predates it), so hits below it are labelled here rather than removed.`,
    );
  }

  const blocks = hits.map((hit, index) => renderHit(hit, index, context, result.floorApplied));
  const footer = 'To read a full unit, call get_material_text with its `text_id`. Course ids are exact (e.g. IST.323).';

  return [header.join('\n'), '', blocks.join('\n\n---\n\n'), '', footer].join('\n');
}

/**
 * Message for a search that matched nothing. With the floor in play this is
 * usually the CORRECT answer — the corpus holds nothing on the topic — so the
 * wording leads with that. `courses` is passed only when a course filter was
 * used, so a mistyped id is recoverable rather than a dead end.
 */
export function formatEmptyResults(context: SearchContext, courses: readonly CourseRow[] = []): string {
  const floor = context.minSimilarity;
  const lines = [`Nothing relevant found for "${context.q}" in ${describeScope(context)} (mode ${context.mode}).`, ''];

  if (context.mode === 'fts') {
    lines.push('Full-text search matched no unit literally. Natural-language questions usually fail here; try a few bare keywords, or use hybrid mode.');
  } else if (floor === null) {
    lines.push('No unit matched, semantically or lexically, with no similarity floor in play.');
  } else {
    lines.push(
      `No unit cleared the ${floor} cosine similarity floor, and no unit matched the query terms literally. On this corpus that normally means the course materials hold nothing on this topic — it is a real answer, not a failure.`,
    );
  }

  if (context.course) {
    lines.push('', 'Course ids are matched exactly and are case-sensitive (e.g. IST.323, not IST323 or ist.323).');
    if (courses.length > 0) {
      const listed = courses
        .slice(0, MAX_LISTED_COURSES)
        .map((course) => `${course.id} — ${course.title}`)
        .join('; ');
      lines.push(`Courses that exist: ${listed}.`);
    }
  }

  lines.push('', 'If you expected a hit, try in this order:');
  lines.push(context.course ? '- Drop the course filter and search every course.' : '- Rephrase with fewer, more central terms.');
  if (floor !== null && context.mode !== 'fts') {
    lines.push('- Lower `min_similarity` (e.g. 0.6) to widen the net deliberately.');
  } else {
    lines.push('- Try a different wording or mode.');
  }

  return lines.join('\n');
}

/** Render one full text unit. */
export function formatMaterialText(unit: MaterialText): string {
  const lines = [
    `# ${unit.file.fileName}`,
    '',
    `- course: ${unit.file.courseId}`,
    `- bucket: ${unit.file.bucket}`,
    `- unit: ${unitLabel(unit)}`,
    `- text_id: ${unit.textId}`,
    `- file_id: ${unit.file.fileId}`,
  ];
  if (unit.file.path) lines.push(`- path: ${unit.file.path}`);
  lines.push(`- chars: ${unit.charCount}`);
  if (unit.text.includes(NOTES_MARKER)) lines.push(`- ${NOTES_WARNING}`);
  lines.push('', '---', '', truncate(unit.text, MAX_TEXT_CHARS));
  return lines.join('\n');
}

export function formatTextNotFound(textId: number): string {
  return [
    `No bb_file_text unit with text_id=${textId}.`,
    '',
    'This is an empty result, not an error. text_id values come from search_materials results; a unit can disappear if its file was re-harvested and re-extracted.',
  ].join('\n');
}

export function formatCourses(courses: readonly CourseRow[]): string {
  if (courses.length === 0) return 'No courses found in bb2dash. The courses table is empty.';
  const lines = [
    `${courses.length} course${courses.length === 1 ? '' : 's'}. Use the id, exactly as shown, as the \`course\` filter in search_materials.`,
    '',
    '| id | title | kind |',
    '| --- | --- | --- |',
    ...courses.map((course) => `| ${course.id} | ${course.title} | ${course.kind ?? ''} |`),
  ];
  return lines.join('\n');
}

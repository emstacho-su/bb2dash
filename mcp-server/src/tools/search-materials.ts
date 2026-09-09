/**
 * `search_materials` — the primary retrieval path over the class-materials corpus.
 *
 * The query goes to the `search` Edge Function, which embeds it with the same
 * gte-small session that embedded the corpus and fuses semantic + keyword
 * rankings with RRF. This process never embeds anything.
 */

import type { z } from 'zod';
import type { CourseRow, MaterialsClient } from '../client.js';
import type { Config } from '../config.js';
import { EMBEDDING_MODEL } from '../config.js';
import { describeError } from '../errors.js';
import { formatEmptyResults, formatSearchResults } from '../format.js';
import type { ToolResult } from './schemas.js';
import { errorResult, formatZodIssues, searchMaterialsSchema, searchMaterialsShape, textResult } from './schemas.js';

export interface ToolDeps {
  client: MaterialsClient;
  config: Config;
}

export const SEARCH_MATERIALS_DESCRIPTION = [
  'Search the bb2dash class-materials corpus (Fall 2026 Syracuse courses: syllabi, lecture slides, readings, assignment specs, rosters) harvested from Blackboard.',
  'Use it before answering anything about what a course document actually says — dates, grading rules, policies, slide content.',
  `Hybrid retrieval: the query is embedded server-side with ${EMBEDDING_MODEL} and also run through full-text search; the rankings are fused with RRF and gated by a cosine similarity floor.`,
  'Results carry a real cosine `similarity` — judge relevance by that. An empty result is a valid answer meaning the materials hold nothing on the topic.',
  'PPTX text may include the professor\'s speaker notes behind a `[notes]` marker; treat those as private commentary.',
  'Follow up with get_material_text to read a whole unit, and list_courses for exact course ids.',
].join(' ');

export function createSearchMaterialsTool(deps: ToolDeps) {
  return {
    name: 'search_materials',
    config: {
      title: 'Search class materials',
      description: SEARCH_MATERIALS_DESCRIPTION,
      inputSchema: searchMaterialsShape,
      annotations: { readOnlyHint: true, openWorldHint: false, idempotentHint: true },
    },
    handler: (rawArgs: unknown): Promise<ToolResult> => handleSearchMaterials(deps, rawArgs),
  };
}

export async function handleSearchMaterials(deps: ToolDeps, rawArgs: unknown): Promise<ToolResult> {
  const parsed = searchMaterialsSchema.safeParse(rawArgs ?? {});
  if (!parsed.success) {
    return errorResult(`Invalid arguments for search_materials:\n${formatZodIssues(parsed.error as z.ZodError)}`);
  }

  const { q, course, mode, limit, min_similarity: minSimilarityArg } = parsed.data;
  const { search: searchConfig } = deps.config;

  const context = {
    q,
    course: course ?? null,
    mode: mode ?? ('hybrid' as const),
    limit: Math.min(limit ?? searchConfig.defaultLimit, searchConfig.maxLimit),
    minSimilarity: minSimilarityArg ?? searchConfig.minSimilarity,
  };

  try {
    const result = await deps.client.search(context);

    if (result.hits.length === 0) {
      // Only when a course filter was in play: a mistyped id and a genuinely
      // empty topic look identical otherwise.
      const courses = context.course ? await listCoursesSafely(deps.client) : [];
      return textResult(formatEmptyResults(context, courses));
    }

    return textResult(formatSearchResults(context, result));
  } catch (error) {
    return errorResult(`search_materials failed.\n${describeError(error)}`);
  }
}

/**
 * The course list is a nicety on an already-empty result. If it fails, the
 * empty-result message is still correct, so the failure is dropped rather than
 * converting a valid answer into an error.
 */
async function listCoursesSafely(client: MaterialsClient): Promise<CourseRow[]> {
  try {
    return await client.listCourses();
  } catch {
    return [];
  }
}

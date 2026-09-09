/**
 * Tool input schemas. The raw shapes are handed to `McpServer.registerTool` so
 * the SDK advertises a correct JSON Schema; handlers re-parse defensively.
 */

import { z } from 'zod';
import { DEFAULT_MIN_SIMILARITY, MAX_LIMIT, MODES } from '../config.js';

export const MAX_QUERY_CHARS = 2_000;
export const MAX_COURSE_CHARS = 64;

export const searchMaterialsShape = {
  q: z
    .string()
    .trim()
    .min(1, 'q must not be empty')
    .max(MAX_QUERY_CHARS, `q must be at most ${MAX_QUERY_CHARS} characters`)
    .describe(
      'Natural-language question or topic. Embedded server-side with gte-small (the same session that embedded the corpus) and also run through Postgres full-text search; the two rankings are fused with RRF.',
    ),
  course: z
    .string()
    .trim()
    .min(1, 'course must not be empty')
    .max(MAX_COURSE_CHARS, `course must be at most ${MAX_COURSE_CHARS} characters`)
    .optional()
    .describe(
      'Restrict to one course id, exactly as in list_courses (e.g. "IST.323", "ECN.304", "GEO.103.lecture"). Case-sensitive. Omit to search every course.',
    ),
  mode: z
    .enum(MODES)
    .optional()
    .describe('"hybrid" (default: semantic + keyword, fused), "vector" (semantic only, returns full unit text), or "fts" (keyword only, fast, no similarity).'),
  limit: z
    .number()
    .int('limit must be a whole number')
    .min(1, 'limit must be at least 1')
    .max(MAX_LIMIT, `limit must be at most ${MAX_LIMIT}`)
    .optional()
    .describe(`Maximum number of text units to return. Default 10, maximum ${MAX_LIMIT}.`),
  min_similarity: z
    .number()
    .min(0, 'min_similarity must be at least 0')
    .max(1, 'min_similarity must be at most 1')
    .optional()
    .describe(
      `Cosine floor on the semantic evidence. Default ${DEFAULT_MIN_SIMILARITY}: on this corpus relevant material scores 0.83-0.92 and unrelated 0.75-0.77, so the default correctly returns nothing for an off-topic question. Lower it (e.g. 0.6) to widen the net. Literal keyword matches are never gated by it.`,
    ),
} as const;

export const searchMaterialsSchema = z.object(searchMaterialsShape);
export type SearchMaterialsInput = z.infer<typeof searchMaterialsSchema>;

export const getMaterialTextShape = {
  text_id: z
    .number()
    .int('text_id must be a whole number')
    .positive('text_id must be positive')
    .describe('The `text_id` of a unit, copied from a search_materials result.'),
} as const;

export const getMaterialTextSchema = z.object(getMaterialTextShape);

export const listCoursesShape = {} as const;
export const listCoursesSchema = z.object(listCoursesShape);

/** MCP text-content tool result. Structurally compatible with the SDK type. */
export interface ToolResult {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
  [key: string]: unknown;
}

export function textResult(text: string): ToolResult {
  return { content: [{ type: 'text', text }] };
}

export function errorResult(text: string): ToolResult {
  return { content: [{ type: 'text', text }], isError: true };
}

/** One readable line per bad field. */
export function formatZodIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join('.') : '(root)';
      return `- ${path}: ${issue.message}`;
    })
    .join('\n');
}

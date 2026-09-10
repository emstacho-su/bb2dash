/**
 * `get_material_text` — one full text unit by `text_id`.
 *
 * A point read over PostgREST, not ranking, so it does not go through the
 * search function. Ranked retrieval always does.
 */

import type { z } from 'zod';
import { describeError } from '../errors.js';
import { formatMaterialText, formatTextNotFound } from '../format.js';
import type { ToolDeps } from './search-materials.js';
import type { ToolResult } from './schemas.js';
import { errorResult, formatZodIssues, getMaterialTextSchema, getMaterialTextShape, textResult } from './schemas.js';

export const GET_MATERIAL_TEXT_DESCRIPTION = [
  'Fetch the complete extracted text of one unit (a slide, a page, a sheet, or a document) from the bb2dash class-materials corpus by its text_id.',
  'Use it after search_materials when a snippet looks relevant and you need the surrounding text.',
  'Returns the unit with its file name, course, bucket and Blackboard path.',
].join(' ');

export function createGetMaterialTextTool(deps: ToolDeps) {
  return {
    name: 'get_material_text',
    config: {
      title: 'Get full material text',
      description: GET_MATERIAL_TEXT_DESCRIPTION,
      inputSchema: getMaterialTextShape,
      annotations: { readOnlyHint: true, openWorldHint: false, idempotentHint: true },
    },
    handler: (rawArgs: unknown): Promise<ToolResult> => handleGetMaterialText(deps, rawArgs),
  };
}

export async function handleGetMaterialText(deps: ToolDeps, rawArgs: unknown): Promise<ToolResult> {
  const parsed = getMaterialTextSchema.safeParse(rawArgs ?? {});
  if (!parsed.success) {
    return errorResult(`Invalid arguments for get_material_text:\n${formatZodIssues(parsed.error as z.ZodError)}`);
  }

  const { text_id: textId } = parsed.data;

  try {
    const unit = await deps.client.getText(textId);
    if (!unit) return textResult(formatTextNotFound(textId));
    return textResult(formatMaterialText(unit));
  } catch (error) {
    return errorResult(`get_material_text failed.\n${describeError(error)}`);
  }
}

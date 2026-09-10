/**
 * `list_courses` — the exact course ids the `course` filter accepts.
 *
 * Exists because "IST323", "ist.323" and "IST.323" all look right and only one
 * of them matches; a wrong id returns an empty result that is otherwise
 * indistinguishable from an empty topic.
 */

import { describeError } from '../errors.js';
import { formatCourses } from '../format.js';
import type { ToolDeps } from './search-materials.js';
import type { ToolResult } from './schemas.js';
import { errorResult, listCoursesShape, textResult } from './schemas.js';

export const LIST_COURSES_DESCRIPTION =
  'List the courses in bb2dash with their exact ids and short titles. Use an id verbatim as the `course` filter of search_materials.';

export function createListCoursesTool(deps: ToolDeps) {
  return {
    name: 'list_courses',
    config: {
      title: 'List courses',
      description: LIST_COURSES_DESCRIPTION,
      inputSchema: listCoursesShape,
      annotations: { readOnlyHint: true, openWorldHint: false, idempotentHint: true },
    },
    handler: (rawArgs: unknown): Promise<ToolResult> => handleListCourses(deps, rawArgs),
  };
}

export async function handleListCourses(deps: ToolDeps, _rawArgs: unknown): Promise<ToolResult> {
  try {
    const courses = await deps.client.listCourses();
    return textResult(formatCourses(courses));
  } catch (error) {
    return errorResult(`list_courses failed.\n${describeError(error)}`);
  }
}

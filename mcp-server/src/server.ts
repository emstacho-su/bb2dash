/** Wires the three read-only tools onto an MCP server instance. */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createGetMaterialTextTool } from './tools/get-material-text.js';
import { createListCoursesTool } from './tools/list-courses.js';
import { createSearchMaterialsTool, type ToolDeps } from './tools/search-materials.js';

export const SERVER_NAME = 'bb2dash-materials';
export const SERVER_VERSION = '0.1.0';

export const SERVER_INSTRUCTIONS = [
  'This server is the retrieval side of the bb2dash class-materials corpus: Fall 2026 Syracuse course documents harvested from Blackboard, text-extracted, and embedded with gte-small in Supabase.',
  '',
  'Call `search_materials` whenever an answer depends on what a course document actually says. Call `get_material_text` to read a whole unit. Call `list_courses` for the exact course ids.',
  '',
  'Judge relevance by `similarity` (real cosine: ~0.83–0.92 relevant, ~0.75–0.77 unrelated on this corpus). `score` is a Reciprocal Rank Fusion sum that only sets ordering. An empty result means the materials hold nothing on the topic.',
  '',
  'This is a different store from the harness `rag` server (session history). Do not mix their ids.',
].join('\n');

export function createMaterialsServer(deps: ToolDeps): McpServer {
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { capabilities: { tools: {} }, instructions: SERVER_INSTRUCTIONS },
  );

  // Registered individually: `registerTool` infers the JSON Schema from each
  // tool's own Zod shape, and a loop would collapse the shapes into a union.
  const search = createSearchMaterialsTool(deps);
  server.registerTool(search.name, search.config, (args: unknown) => search.handler(args));

  const getText = createGetMaterialTextTool(deps);
  server.registerTool(getText.name, getText.config, (args: unknown) => getText.handler(args));

  const listCourses = createListCoursesTool(deps);
  server.registerTool(listCourses.name, listCourses.config, (args: unknown) => listCourses.handler(args));

  return server;
}

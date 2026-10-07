/**
 * The MCP config the CLI is started with (`--strict-mcp-config --mcp-config /run/apply/mcp.json`):
 * exactly two servers, by path. Never a key, a token or a DSN: the materials server reads its key
 * from the file it is given by name, and the SQL server reads the worker's DSN from its secret
 * file itself. Phase 21's shape (`workspace/src/mcp-config.ts`), with the SQL server in place of
 * the notes store.
 */

import fs from 'node:fs';

import { PATHS } from './config.js';

export const MCP_CONFIG_MODE = 0o600;
const SUPABASE_URL = 'https://goultdzqcavefcgnifdy.supabase.co';

export interface McpConfigFs {
  writeFileSync(file: string, text: string, options: { mode: number }): unknown;
  chmodSync(file: string, mode: number): unknown;
}

export function mcpConfigText(): string {
  const config = {
    mcpServers: {
      // The class materials: search_materials, get_material_text, list_courses.
      bb2dash: {
        command: 'node',
        args: [PATHS.materialsServer],
        env: { SUPABASE_URL, SUPABASE_SERVICE_ROLE_FILE: PATHS.serviceKeySecret },
      },
      // SQL as inbox_apply_runner: query (read-only) and execute_sql (the writer's batches).
      db: { command: 'node', args: [PATHS.sqlServer] },
    },
  };
  return `${JSON.stringify(config, null, 2)}\n`;
}

/** Write the config at start, readable by the worker's user only. */
export function writeMcpConfig(file: string = PATHS.mcpConfig, fileSystem: McpConfigFs = fs): void {
  fileSystem.writeFileSync(file, mcpConfigText(), { mode: MCP_CONFIG_MODE });
  // The mode given to a write applies only when it creates the file, so it is set again.
  fileSystem.chmodSync(file, MCP_CONFIG_MODE);
}

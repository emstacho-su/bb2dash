/**
 * The MCP config the CLI is started with (`--strict-mcp-config --mcp-config /run/workspace/mcp.json`):
 * exactly two servers, by path. Never a key, a token or a DSN: the materials server reads its key
 * from the file it is given by name, and the notes server's launcher reads its own secret file.
 * The paths are the seam with the image (brief 102, Contract, MCP config).
 */

import fs from 'node:fs';

import { PATHS } from './config.js';

export const MCP_CONFIG_MODE = 0o600;

export interface McpServerEntry {
  readonly command: string;
  readonly args: readonly string[];
  readonly env?: Readonly<Record<string, string>>;
}

export interface McpConfig {
  readonly mcpServers: {
    readonly bb2dash: McpServerEntry & { readonly env: Readonly<Record<string, string>> };
    readonly rag: McpServerEntry;
  };
}

const MCP_CONFIG: McpConfig = Object.freeze({
  mcpServers: Object.freeze({
    // The class materials: search_materials, get_material_text, list_courses.
    bb2dash: Object.freeze({
      command: 'node',
      args: Object.freeze(['/app/mcp-materials/dist/index.js']),
      env: Object.freeze({
        SUPABASE_URL: 'https://goultdzqcavefcgnifdy.supabase.co',
        SUPABASE_SERVICE_ROLE_FILE: '/run/secrets/bb2dash_mcp_service_key',
      }),
    }),
    // The notes store: search_context. The launcher exports the connection string to the server only.
    rag: Object.freeze({
      command: 'bash',
      args: Object.freeze(['/app/mcp-rag/mcp-rag.sh']),
    }),
  }),
});

export function buildMcpConfig(): McpConfig {
  return MCP_CONFIG;
}

export function mcpConfigText(): string {
  return `${JSON.stringify(MCP_CONFIG, null, 2)}\n`;
}

/** The two file calls the writer makes, so a test can watch them. */
export interface McpConfigFs {
  writeFileSync(file: string, text: string, options: { mode: number }): unknown;
  chmodSync(file: string, mode: number): unknown;
}

/** Write the config at start, readable by the runner's user only. */
export function writeMcpConfig(file: string = PATHS.mcpConfig, fileSystem: McpConfigFs = fs): void {
  fileSystem.writeFileSync(file, mcpConfigText(), { mode: MCP_CONFIG_MODE });
  // The mode given to a write applies only when it creates the file, so it is set again.
  fileSystem.chmodSync(file, MCP_CONFIG_MODE);
}

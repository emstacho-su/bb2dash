#!/usr/bin/env node
/**
 * stdio entry point.
 *
 * HARD RULE: stdout is the JSON-RPC channel. Every diagnostic goes to stderr.
 * Anything that writes to stdout corrupts the protocol and the client silently
 * loses the server.
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { SupabaseMaterialsClient } from './client.js';
import { loadConfig } from './config.js';
import { describeError } from './errors.js';
import { SERVER_NAME, SERVER_VERSION, createMaterialsServer } from './server.js';

function log(message: string): void {
  process.stderr.write(`[${SERVER_NAME}] ${message}\n`);
}

async function main(): Promise<void> {
  const config = loadConfig(process.env);
  const client = new SupabaseMaterialsClient({
    supabaseUrl: config.supabaseUrl,
    serviceKey: config.serviceKey,
    timeoutMs: config.timeoutMs,
  });
  const server = createMaterialsServer({ client, config });
  const transport = new StdioServerTransport();

  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    log(`received ${signal}, shutting down`);
    await Promise.allSettled([server.close()]);
    process.exit(0);
  };

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => {
      void shutdown(signal);
    });
  }

  await server.connect(transport);
  log(`v${SERVER_VERSION} ready — ${client.description}; floor ${config.search.minSimilarity ?? 'none'}`);
}

main().catch((error: unknown) => {
  process.stderr.write(`[${SERVER_NAME}] fatal startup error\n${describeError(error)}\n`);
  process.exit(1);
});

/** Full protocol round-trip over the SDK's in-memory transport. */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SERVER_NAME, createMaterialsServer } from '../src/server.js';
import { FakeMaterialsClient, makeConfig, makeHit, makeText, textOf } from './helpers.js';

describe('bb2dash-materials MCP server', () => {
  let client: Client;
  let close: () => Promise<void>;

  beforeEach(async () => {
    const server = createMaterialsServer({
      client: new FakeMaterialsClient([makeHit()], makeText()),
      config: makeConfig(),
    });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    client = new Client({ name: 'test-client', version: '0.0.0' });
    await client.connect(clientTransport);
    close = async () => {
      await client.close();
      await server.close();
    };
  });

  afterEach(async () => {
    await close();
  });

  it('identifies itself and advertises exactly three read-only tools', async () => {
    expect(SERVER_NAME).toBe('bb2dash-materials');
    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name).sort()).toEqual(['get_material_text', 'list_courses', 'search_materials']);
    for (const tool of tools) {
      expect(tool.annotations?.readOnlyHint).toBe(true);
      expect(tool.inputSchema.type).toBe('object');
    }
  });

  it('search_materials round-trips', async () => {
    const result = await client.callTool({ name: 'search_materials', arguments: { q: 'risk assessment', limit: 3 } });
    expect(result.isError).toBeFalsy();
    expect(textOf(result as { content: Array<{ type: string; text?: string }> })).toContain('text_id: 495');
  });

  it('get_material_text round-trips', async () => {
    const result = await client.callTool({ name: 'get_material_text', arguments: { text_id: 495 } });
    expect(result.isError).toBeFalsy();
    expect(textOf(result as { content: Array<{ type: string; text?: string }> })).toContain('Risk assessment');
  });

  it('list_courses round-trips', async () => {
    const result = await client.callTool({ name: 'list_courses', arguments: {} });
    expect(result.isError).toBeFalsy();
    expect(textOf(result as { content: Array<{ type: string; text?: string }> })).toContain('IST.323');
  });

  it('invalid arguments come back as a tool error, not a protocol error', async () => {
    const result = await client.callTool({ name: 'search_materials', arguments: { q: '' } });
    expect(result.isError).toBe(true);
  });
});

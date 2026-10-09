/**
 * Task 26 — limits and scope in the materials server. The Workspace runner hands the answering
 * turn's server three environment values; with none set nothing changes. A call past its limit
 * is an error RESULT (`isError`), never a thrown protocol error: the turn goes on (probe P-6).
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';
import { ConfigError } from '../src/errors.js';
import { NO_LIMITS, type Limits, readLimits } from '../src/limits.js';
import { createMaterialsServer } from '../src/server.js';
import { handleGetMaterialText } from '../src/tools/get-material-text.js';
import { handleSearchMaterials, type ToolDeps } from '../src/tools/search-materials.js';
import { FakeMaterialsClient, TEST_KEY, TEST_URL, makeConfig, makeHit, makeText, textOf } from './helpers.js';

const base = { SUPABASE_URL: TEST_URL, SUPABASE_SERVICE_ROLE: TEST_KEY };

function depsWith(limits: Partial<Limits>, client = new FakeMaterialsClient([makeHit()], makeText())): ToolDeps & {
  client: FakeMaterialsClient;
} {
  return { client, config: makeConfig({ limits: { ...NO_LIMITS, ...limits } }) };
}

describe('readLimits — the environment names', () => {
  it('with none set nothing is limited', () => {
    expect(readLimits({})).toEqual({ maxSearches: null, maxReads: null, courses: null });
    expect(loadConfig(base).limits).toEqual(NO_LIMITS);
  });

  it('reads whole numbers and a comma-separated course list', () => {
    const limits = readLimits({
      BB2DASH_MAX_SEARCHES: '3',
      BB2DASH_MAX_READS: '10',
      BB2DASH_COURSES: ' IST.323 , ECN.304,,',
    });
    expect(limits).toEqual({ maxSearches: 3, maxReads: 10, courses: ['IST.323', 'ECN.304'] });
  });

  it('treats empty values as unset', () => {
    expect(readLimits({ BB2DASH_MAX_SEARCHES: '', BB2DASH_MAX_READS: '  ', BB2DASH_COURSES: ' , ' })).toEqual(NO_LIMITS);
  });

  it('refuses a value that is not a whole number, naming the variable', () => {
    for (const bad of ['three', '-1', '1.5', '1e1x']) {
      expect(() => readLimits({ BB2DASH_MAX_SEARCHES: bad })).toThrow(ConfigError);
      expect(() => readLimits({ BB2DASH_MAX_READS: bad })).toThrow(/BB2DASH_MAX_READS/);
    }
  });
});

describe('search_materials — the search limit', () => {
  it('with no limit set nothing changes: twenty searches all run', async () => {
    const deps = depsWith({});
    for (let i = 0; i < 20; i++) expect((await handleSearchMaterials(deps, { q: 'risk' })).isError).toBeFalsy();
    expect(deps.client.searchCalls).toHaveLength(20);
  });

  it('a fourth search is an error result and sends no request', async () => {
    const deps = depsWith({ maxSearches: 3 });
    for (let i = 0; i < 3; i++) expect((await handleSearchMaterials(deps, { q: 'risk' })).isError).toBeFalsy();
    const fourth = await handleSearchMaterials(deps, { q: 'risk' });
    expect(fourth.isError).toBe(true);
    expect(textOf(fourth)).toMatch(/at most 3 searches/);
    expect(deps.client.searchCalls).toHaveLength(3);
  });

  it('a limit of zero allows no search', async () => {
    const deps = depsWith({ maxSearches: 0 });
    expect((await handleSearchMaterials(deps, { q: 'risk' })).isError).toBe(true);
    expect(deps.client.searchCalls).toHaveLength(0);
  });

  it('an invalid call does not use up a search', async () => {
    const deps = depsWith({ maxSearches: 1 });
    expect((await handleSearchMaterials(deps, { q: '' })).isError).toBe(true);
    expect((await handleSearchMaterials(deps, { q: 'risk' })).isError).toBeFalsy();
  });

  it('counts per server: another deps object starts again', async () => {
    const config = makeConfig({ limits: { ...NO_LIMITS, maxSearches: 1 } });
    const one: ToolDeps = { client: new FakeMaterialsClient([makeHit()]), config };
    const two: ToolDeps = { client: new FakeMaterialsClient([makeHit()]), config };
    await handleSearchMaterials(one, { q: 'risk' });
    expect((await handleSearchMaterials(one, { q: 'risk' })).isError).toBe(true);
    expect((await handleSearchMaterials(two, { q: 'risk' })).isError).toBeFalsy();
  });
});

describe('get_material_text — the read limit', () => {
  it('an eleventh read is an error result and reads nothing', async () => {
    const deps = depsWith({ maxReads: 10 });
    for (let i = 0; i < 10; i++) expect((await handleGetMaterialText(deps, { text_id: 495 })).isError).toBeFalsy();
    const eleventh = await handleGetMaterialText(deps, { text_id: 495 });
    expect(eleventh.isError).toBe(true);
    expect(textOf(eleventh)).toMatch(/at most 10 reads/);
    expect(deps.client.textCalls).toHaveLength(10);
  });

  it('searches and reads are counted apart', async () => {
    const deps = depsWith({ maxSearches: 1, maxReads: 1 });
    expect((await handleSearchMaterials(deps, { q: 'risk' })).isError).toBeFalsy();
    expect((await handleGetMaterialText(deps, { text_id: 495 })).isError).toBeFalsy();
    expect((await handleSearchMaterials(deps, { q: 'risk' })).isError).toBe(true);
    expect((await handleGetMaterialText(deps, { text_id: 495 })).isError).toBe(true);
  });

  it('a read by id is not scoped', async () => {
    const deps = depsWith({ courses: ['ECN.304'] }); // the unit belongs to IST.323
    const result = await handleGetMaterialText(deps, { text_id: 495 });
    expect(result.isError).toBeFalsy();
    expect(textOf(result)).toContain('Risk assessment');
  });
});

describe('search_materials — the course scope', () => {
  it('with a scope a search for another course is an error result', async () => {
    const deps = depsWith({ courses: ['IST.323', 'IST.466'] });
    const result = await handleSearchMaterials(deps, { q: 'risk', course: 'ECN.304' });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('IST.323, IST.466');
    expect(deps.client.searchCalls).toHaveLength(0);
  });

  it('with a scope a search that names no course is an error result', async () => {
    const deps = depsWith({ courses: ['IST.323'] });
    const result = await handleSearchMaterials(deps, { q: 'risk' });
    expect(result.isError).toBe(true);
    expect(deps.client.searchCalls).toHaveLength(0);
  });

  it('a course of the scope is searched as asked', async () => {
    const deps = depsWith({ courses: ['IST.323', 'IST.466'] });
    expect((await handleSearchMaterials(deps, { q: 'risk', course: 'IST.466' })).isError).toBeFalsy();
    expect(deps.client.searchCalls[0]?.course).toBe('IST.466');
  });

  it('a refused search does not use up the budget', async () => {
    const deps = depsWith({ courses: ['IST.323'], maxSearches: 1 });
    await handleSearchMaterials(deps, { q: 'risk' });
    await handleSearchMaterials(deps, { q: 'risk', course: 'ECN.304' });
    expect((await handleSearchMaterials(deps, { q: 'risk', course: 'IST.323' })).isError).toBeFalsy();
  });

  it('with no scope a search needs no course', async () => {
    const deps = depsWith({});
    expect((await handleSearchMaterials(deps, { q: 'risk' })).isError).toBeFalsy();
  });
});

describe('over the protocol', () => {
  it('a call past its limit comes back as an error result, not a protocol error', async () => {
    const server = createMaterialsServer({
      client: new FakeMaterialsClient([makeHit()], makeText()),
      config: makeConfig({ limits: { maxSearches: 1, maxReads: 0, courses: null } }),
    });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    const client = new Client({ name: 'test-client', version: '0.0.0' });
    await client.connect(clientTransport);
    try {
      expect((await client.callTool({ name: 'search_materials', arguments: { q: 'risk' } })).isError).toBeFalsy();
      const second = await client.callTool({ name: 'search_materials', arguments: { q: 'risk' } });
      expect(second.isError).toBe(true);
      const read = await client.callTool({ name: 'get_material_text', arguments: { text_id: 495 } });
      expect(read.isError).toBe(true);
      const { tools } = await client.listTools();
      expect(tools.map((t) => t.name).sort()).toEqual(['get_material_text', 'list_courses', 'search_materials']);
    } finally {
      await client.close();
      await server.close();
    }
  });
});

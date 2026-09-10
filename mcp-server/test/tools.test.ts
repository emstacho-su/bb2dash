import { describe, expect, it } from 'vitest';
import { ApiError } from '../src/errors.js';
import { handleGetMaterialText } from '../src/tools/get-material-text.js';
import { handleListCourses } from '../src/tools/list-courses.js';
import { handleSearchMaterials, type ToolDeps } from '../src/tools/search-materials.js';
import { FakeMaterialsClient, makeConfig, makeHit, makeText, textOf } from './helpers.js';

function deps(client: FakeMaterialsClient, config = makeConfig()): ToolDeps {
  return { client, config };
}

describe('search_materials — validation', () => {
  it('requires a non-empty q', async () => {
    const result = await handleSearchMaterials(deps(new FakeMaterialsClient()), { q: '   ' });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('q');
  });

  it('rejects an unknown mode and a limit out of range', async () => {
    const client = new FakeMaterialsClient();
    expect((await handleSearchMaterials(deps(client), { q: 'x', mode: 'fuzzy' })).isError).toBe(true);
    expect((await handleSearchMaterials(deps(client), { q: 'x', limit: 0 })).isError).toBe(true);
    expect((await handleSearchMaterials(deps(client), { q: 'x', limit: 51 })).isError).toBe(true);
    expect((await handleSearchMaterials(deps(client), { q: 'x', min_similarity: 2 })).isError).toBe(true);
    expect(client.searchCalls).toHaveLength(0);
  });
});

describe('search_materials — defaults and forwarding', () => {
  it('uses hybrid, the configured limit and the configured floor by default', async () => {
    const client = new FakeMaterialsClient([makeHit()]);
    await handleSearchMaterials(deps(client), { q: 'risk assessment' });
    expect(client.searchCalls[0]).toEqual({
      q: 'risk assessment',
      course: null,
      mode: 'hybrid',
      limit: 10,
      minSimilarity: 0.78,
    });
  });

  it('forwards course, mode, limit and an explicit floor, trimming strings', async () => {
    const client = new FakeMaterialsClient([makeHit()]);
    await handleSearchMaterials(deps(client), { q: ' cia triad ', course: ' IST.323 ', mode: 'vector', limit: 4, min_similarity: 0.5 });
    expect(client.searchCalls[0]).toEqual({ q: 'cia triad', course: 'IST.323', mode: 'vector', limit: 4, minSimilarity: 0.5 });
  });

  it('clamps the limit to the configured maximum', async () => {
    const client = new FakeMaterialsClient([makeHit()]);
    await handleSearchMaterials(deps(client, makeConfig({ search: { defaultLimit: 5, maxLimit: 8, minSimilarity: 0.78 } })), { q: 'x', limit: 50 });
    expect(client.searchCalls[0]!.limit).toBe(8);
  });

  it('renders hits', async () => {
    const result = await handleSearchMaterials(deps(new FakeMaterialsClient([makeHit()])), { q: 'risk' });
    expect(result.isError).toBeUndefined();
    expect(textOf(result)).toContain('text_id: 495');
  });
});

describe('search_materials — empty results', () => {
  it('is not an error, and lists courses only when a course filter was used', async () => {
    const client = new FakeMaterialsClient([]);
    const plain = await handleSearchMaterials(deps(client), { q: 'banana bread' });
    expect(plain.isError).toBeUndefined();
    expect(textOf(plain)).toContain('Nothing relevant');
    expect(client.courseCalls).toBe(0);

    const filtered = await handleSearchMaterials(deps(client), { q: 'banana bread', course: 'IST323' });
    expect(client.courseCalls).toBe(1);
    expect(textOf(filtered)).toContain('IST.323');
  });

  it('still returns the empty message when the course listing itself fails', async () => {
    const client = new FakeMaterialsClient([]);
    client.coursesFailure = new Error('boom');
    const result = await handleSearchMaterials(deps(client), { q: 'x', course: 'nope' });
    expect(result.isError).toBeUndefined();
    expect(textOf(result)).toContain('Nothing relevant');
  });
});

describe('search_materials — failures', () => {
  it('surfaces a client error with its Fix line', async () => {
    const client = new FakeMaterialsClient([], null, new ApiError('search failed: 401', 'Check SUPABASE_SERVICE_ROLE.', 401));
    const result = await handleSearchMaterials(deps(client), { q: 'x' });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('401');
    expect(textOf(result)).toContain('Fix: Check SUPABASE_SERVICE_ROLE.');
  });
});

describe('get_material_text', () => {
  it('validates text_id as a positive integer', async () => {
    const client = new FakeMaterialsClient([], makeText());
    expect((await handleGetMaterialText(deps(client), {})).isError).toBe(true);
    expect((await handleGetMaterialText(deps(client), { text_id: -1 })).isError).toBe(true);
    expect((await handleGetMaterialText(deps(client), { text_id: 1.5 })).isError).toBe(true);
    expect(client.textCalls).toHaveLength(0);
  });

  it('renders the unit', async () => {
    const client = new FakeMaterialsClient([], makeText());
    const result = await handleGetMaterialText(deps(client), { text_id: 495 });
    expect(result.isError).toBeUndefined();
    expect(textOf(result)).toContain('Risk assessment');
    expect(client.textCalls).toEqual([495]);
  });

  it('returns a non-error not-found message', async () => {
    const result = await handleGetMaterialText(deps(new FakeMaterialsClient([], null)), { text_id: 7 });
    expect(result.isError).toBeUndefined();
    expect(textOf(result)).toContain('7');
  });

  it('surfaces a client error', async () => {
    const client = new FakeMaterialsClient([], null, new ApiError('nope', 'fix it', 500));
    const result = await handleGetMaterialText(deps(client), { text_id: 1 });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('Fix: fix it');
  });
});

describe('list_courses', () => {
  it('renders the courses', async () => {
    const result = await handleListCourses(deps(new FakeMaterialsClient()), {});
    expect(result.isError).toBeUndefined();
    expect(textOf(result)).toContain('IST.323');
  });

  it('surfaces a failure', async () => {
    const client = new FakeMaterialsClient();
    client.coursesFailure = new ApiError('down', 'try later', 503);
    const result = await handleListCourses(deps(client), {});
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('Fix: try later');
  });
});

/**
 * The request half of the search layer: what goes on the wire, what comes back,
 * and how the query key and `enabled` gate behave.
 *
 * `fetch` and the Supabase browser client are both stubbed — nothing here can
 * reach the network, and no live backend is required.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SearchParams, SearchResponse } from '@/lib/queries.search';
import { jsonResponse, makeResponse, textResponse } from './factories';

const TEST_URL = 'https://goultdzqcavefcgnifdy.supabase.co';
const TEST_ANON_KEY = 'eyJ-test-anon-key';
const TEST_ACCESS_TOKEN = 'eyJ-test-user-jwt';
const SEARCH_ENDPOINT = `${TEST_URL}/functions/v1/search`;

const getSession = vi.fn();

vi.mock('@/lib/supabase/client', () => ({
  getSupabaseBrowserClient: () => ({ auth: { getSession } }),
}));

// Imported after the mock is registered (vi.mock is hoisted; the await import
// keeps the dependency order explicit for a reader).
const { searchOptions, searchQueryKeys, resolveSearchParams } = await import('@/lib/queries.search');

/** Run the query function the way TanStack Query would. */
function runQuery(params: SearchParams, signal?: AbortSignal): Promise<SearchResponse> {
  const options = searchOptions(params);
  const queryFn = options.queryFn as (context: { signal?: AbortSignal }) => Promise<SearchResponse>;
  return queryFn({ signal });
}

/** The parsed JSON body of the first fetch call made. */
function sentBody(mock: ReturnType<typeof vi.fn>): Record<string, unknown> {
  const init = mock.mock.calls[0]![1] as RequestInit;
  return JSON.parse(init.body as string) as Record<string, unknown>;
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', TEST_URL);
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', TEST_ANON_KEY);
  getSession.mockResolvedValue({ data: { session: { access_token: TEST_ACCESS_TOKEN } } });
  // A fresh Response per call: a body can only be read once, and some tests
  // make two requests.
  fetchMock = vi.fn().mockImplementation(async () => jsonResponse(200, makeResponse()));
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('the request body', () => {
  it('posts the resolved defaults to the search edge function', async () => {
    await runQuery({ q: '  risk assessment  ' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(SEARCH_ENDPOINT);
    expect(init.method).toBe('POST');
    expect(sentBody(fetchMock)).toEqual({
      q: 'risk assessment',
      course: null,
      mode: 'hybrid',
      limit: 12,
    });
  });

  it('authenticates with the user JWT and sends the anon key only as the apikey header', async () => {
    await runQuery({ q: 'risk' });

    const headers = new Headers((fetchMock.mock.calls[0]![1] as RequestInit).headers);
    expect(headers.get('authorization')).toBe(`Bearer ${TEST_ACCESS_TOKEN}`);
    expect(headers.get('apikey')).toBe(TEST_ANON_KEY);
    expect(headers.get('content-type')).toBe('application/json');
  });

  it('forwards course, mode and limit, trimming the course id', async () => {
    await runQuery({ q: 'cia triad', course: ' IST.323 ', mode: 'fts', limit: 5 });
    expect(sentBody(fetchMock)).toEqual({ q: 'cia triad', course: 'IST.323', mode: 'fts', limit: 5 });
  });

  it('treats a blank course as all courses', async () => {
    await runQuery({ q: 'cia triad', course: '   ' });
    expect(sentBody(fetchMock).course).toBeNull();
  });

  it('omits include_superseded unless it was asked for', async () => {
    await runQuery({ q: 'schedule' });
    expect(sentBody(fetchMock)).not.toHaveProperty('include_superseded');

    fetchMock.mockClear();
    await runQuery({ q: 'schedule', includeSuperseded: false });
    expect(sentBody(fetchMock)).not.toHaveProperty('include_superseded');
  });

  it('sends include_superseded: true when the caller wants the superseded history', async () => {
    await runQuery({ q: 'schedule', includeSuperseded: true });
    expect(sentBody(fetchMock)).toMatchObject({ include_superseded: true });
  });

  it('passes the abort signal through so a keystroke can cancel the request', async () => {
    const controller = new AbortController();
    await runQuery({ q: 'risk' }, controller.signal);
    expect((fetchMock.mock.calls[0]![1] as RequestInit).signal).toBe(controller.signal);
  });
});

describe('the response and its failures', () => {
  it('returns the parsed body on success', async () => {
    const body = makeResponse({ count: 1 });
    fetchMock.mockResolvedValue(jsonResponse(200, body));
    await expect(runQuery({ q: 'risk' })).resolves.toEqual(body);
  });

  it('refuses to search without a session rather than sending an anonymous request', async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    await expect(runQuery({ q: 'risk' })).rejects.toThrow(/session has expired/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('surfaces the search function own error message on a non-2xx response', async () => {
    fetchMock.mockResolvedValue(jsonResponse(400, { error: 'q must be a non-empty string' }));
    await expect(runQuery({ q: 'risk' })).rejects.toThrow('q must be a non-empty string');
  });

  it('falls back to the status code when the error body is not JSON', async () => {
    fetchMock.mockResolvedValue(textResponse(502, '<html>Bad gateway</html>'));
    await expect(runQuery({ q: 'risk' })).rejects.toThrow('Search failed (502).');
  });

  it('falls back to the status code when the JSON error body has no error field', async () => {
    fetchMock.mockResolvedValue(jsonResponse(500, { detail: 'boom' }));
    await expect(runQuery({ q: 'risk' })).rejects.toThrow('Search failed (500).');
  });

  it('treats an error field in a 200 body as a failure', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { error: 'embedding session unavailable' }));
    await expect(runQuery({ q: 'risk' })).rejects.toThrow('embedding session unavailable');
  });
});

describe('resolveSearchParams', () => {
  it('fills every default without mutating the caller object', () => {
    const params: SearchParams = { q: ' risk ' };
    expect(resolveSearchParams(params)).toEqual({
      q: 'risk',
      course: null,
      mode: 'hybrid',
      limit: 12,
      includeSuperseded: false,
    });
    expect(params).toEqual({ q: ' risk ' });
  });
});

describe('searchOptions', () => {
  it('keys on every input that changes the result set', () => {
    const key = searchOptions({ q: ' risk ', course: ' IST.323 ', mode: 'vector', limit: 5 }).queryKey;
    expect(key).toEqual(['search', 'vector', 'IST.323', 5, false, 'risk']);
    expect(key).toEqual(
      searchQueryKeys.run({ q: 'risk', course: 'IST.323', mode: 'vector', limit: 5, includeSuperseded: false }),
    );
  });

  it('gives the superseded variant its own cache entry', () => {
    const plain = searchOptions({ q: 'schedule' }).queryKey;
    const withHistory = searchOptions({ q: 'schedule', includeSuperseded: true }).queryKey;
    expect(withHistory).not.toEqual(plain);
    expect(withHistory).toContain(true);
  });

  it('stays disabled until the trimmed query is two characters', () => {
    expect(searchOptions({ q: '' }).enabled).toBe(false);
    expect(searchOptions({ q: 'r' }).enabled).toBe(false);
    expect(searchOptions({ q: '  r  ' }).enabled).toBe(false);
    expect(searchOptions({ q: 'ri' }).enabled).toBe(true);
    expect(searchOptions({ q: '  risk  ' }).enabled).toBe(true);
  });
});

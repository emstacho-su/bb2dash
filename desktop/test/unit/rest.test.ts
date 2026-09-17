/**
 * C-6 — the PostgREST GET helper. `fetch` is stubbed in every case; nothing
 * here reaches the network, and no test names a real Supabase host.
 */

import { describe, expect, it, vi } from 'vitest';

import type { FetchLike } from '../../src/core/rest';
import {
  RestError,
  RestShapeError,
  createErrorThrottle,
  createRestGet,
  restUrl,
} from '../../src/core/rest';

const SUPABASE_URL = 'http://127.0.0.1:4321';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiJ9.anon.signature';
const TOKEN = 'eyJhbGciOiJIUzI1NiJ9.access.signature';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function asRows(rows: unknown): { id: number }[] {
  if (!Array.isArray(rows)) throw new Error('expected an array');
  return rows.map((row) => {
    if (!row || typeof row !== 'object' || typeof (row as { id?: unknown }).id !== 'number') {
      throw new Error('expected { id: number }');
    }
    return { id: (row as { id: number }).id };
  });
}

describe('restUrl', () => {
  it('builds /rest/v1/<relation>?<query>', () => {
    expect(restUrl(SUPABASE_URL, 'v_sync_status', 'select=id')).toBe(
      'http://127.0.0.1:4321/rest/v1/v_sync_status?select=id',
    );
  });

  it('tolerates a trailing slash on the base URL and an empty query', () => {
    expect(restUrl('http://127.0.0.1:4321/', 'courses', '')).toBe(
      'http://127.0.0.1:4321/rest/v1/courses',
    );
  });
});

describe('createRestGet', () => {
  it('sends the anon key and the bearer token, and returns validated rows', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fetchImpl: FetchLike = async (url, init) => {
      calls.push({ url, init });
      return jsonResponse([{ id: 1 }, { id: 2 }]);
    };
    const get = createRestGet({
      supabaseUrl: SUPABASE_URL,
      anonKey: ANON_KEY,
      getAccessToken: async () => TOKEN,
      fetchImpl,
    });

    await expect(get('courses', 'select=id', asRows)).resolves.toEqual([{ id: 1 }, { id: 2 }]);
    expect(calls).toHaveLength(1);

    const call = calls[0];
    expect(call?.url).toBe('http://127.0.0.1:4321/rest/v1/courses?select=id');
    expect(call?.init.method).toBe('GET');
    const headers = call?.init.headers as Record<string, string>;
    expect(headers.apikey).toBe(ANON_KEY);
    expect(headers.authorization).toBe(`Bearer ${TOKEN}`);
    expect(call?.init.signal).toBeDefined();
  });

  it('fails without ever calling fetch when there is no session', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse([]));
    const get = createRestGet({
      supabaseUrl: SUPABASE_URL,
      anonKey: ANON_KEY,
      getAccessToken: async () => null,
      fetchImpl,
    });

    await expect(get('courses', '', asRows)).rejects.toBeInstanceOf(RestError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('turns a non-2xx into a typed RestError carrying the status', async () => {
    const get = createRestGet({
      supabaseUrl: SUPABASE_URL,
      anonKey: ANON_KEY,
      getAccessToken: async () => TOKEN,
      fetchImpl: async () => jsonResponse({ message: 'nope' }, 401),
    });

    await expect(get('v_work_items', '', asRows)).rejects.toMatchObject({
      name: 'RestError',
      status: 401,
      relation: 'v_work_items',
    });
  });

  it('turns a network failure into a RestError with a null status', async () => {
    const get = createRestGet({
      supabaseUrl: SUPABASE_URL,
      anonKey: ANON_KEY,
      getAccessToken: async () => TOKEN,
      fetchImpl: async () => {
        throw new Error('ECONNREFUSED');
      },
    });

    await expect(get('courses', '', asRows)).rejects.toMatchObject({
      name: 'RestError',
      status: null,
    });
  });

  it('rejects rows that do not validate rather than handing them on', async () => {
    const get = createRestGet({
      supabaseUrl: SUPABASE_URL,
      anonKey: ANON_KEY,
      getAccessToken: async () => TOKEN,
      fetchImpl: async () => jsonResponse([{ id: 'one' }]),
    });

    await expect(get('courses', '', asRows)).rejects.toBeInstanceOf(RestShapeError);
  });

  it('rejects a body that is not JSON', async () => {
    const get = createRestGet({
      supabaseUrl: SUPABASE_URL,
      anonKey: ANON_KEY,
      getAccessToken: async () => TOKEN,
      fetchImpl: async () => new Response('<html>gateway</html>', { status: 200 }),
    });

    await expect(get('courses', '', asRows)).rejects.toBeInstanceOf(RestShapeError);
  });

  it('logs a failing relation once per hour, not once per tick', async () => {
    const lines: string[] = [];
    let clock = 0;
    const get = createRestGet({
      supabaseUrl: SUPABASE_URL,
      anonKey: ANON_KEY,
      getAccessToken: async () => TOKEN,
      fetchImpl: async () => jsonResponse({ message: 'down' }, 500),
      now: () => clock,
      log: (line) => lines.push(line),
    });

    for (const at of [0, 60_000, 120_000]) {
      clock = at;
      await expect(get('v_sync_status', '', asRows)).rejects.toBeInstanceOf(RestError);
    }
    expect(lines).toHaveLength(1);

    clock = 60 * 60 * 1000 + 1;
    await expect(get('v_sync_status', '', asRows)).rejects.toBeInstanceOf(RestError);
    expect(lines).toHaveLength(2);
  });

  it('never writes the bearer token into a log line', async () => {
    const lines: string[] = [];
    const get = createRestGet({
      supabaseUrl: SUPABASE_URL,
      anonKey: ANON_KEY,
      getAccessToken: async () => TOKEN,
      fetchImpl: async () => jsonResponse({ message: 'down' }, 500),
      log: (line) => lines.push(line),
    });

    await expect(get('v_sync_status', '', asRows)).rejects.toBeInstanceOf(RestError);
    expect(lines.join('\n')).not.toContain(TOKEN);
    expect(lines.join('\n')).not.toContain(ANON_KEY);
  });

  it('aborts the request when the timeout elapses', async () => {
    const get = createRestGet({
      supabaseUrl: SUPABASE_URL,
      anonKey: ANON_KEY,
      getAccessToken: async () => TOKEN,
      timeoutMs: 5,
      fetchImpl: (_url, init) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    });

    await expect(get('courses', '', asRows)).rejects.toMatchObject({ name: 'RestError' });
  });
});

describe('createErrorThrottle', () => {
  it('throttles per relation independently', () => {
    const shouldLog = createErrorThrottle(1_000);
    expect(shouldLog('a', 0)).toBe(true);
    expect(shouldLog('b', 0)).toBe(true);
    expect(shouldLog('a', 500)).toBe(false);
    expect(shouldLog('a', 1_000)).toBe(true);
  });
});

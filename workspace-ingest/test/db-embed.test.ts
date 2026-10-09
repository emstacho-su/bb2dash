// The worker's database side (the four workspace_ingest_runner functions, shapes from the frozen
// fixtures) and its embed call (runEmbedLoop with the document id on every body).

import { describe, expect, it, vi } from 'vitest';

import { createIngestRpc, parseClaim } from '../src/db.js';
import { embedDocument } from '../src/embed.js';
import { fixture, RUNNER } from './helpers.js';

const claimFixture = fixture('ingest-claim.json');
const putFixture = fixture('ingest-put-text.json');
const finishFixture = fixture('ingest-finish.json');
const heartbeatFixture = fixture('ingest-heartbeat.json');
const embedFixture = fixture('embed.json');

function queryReturning(rows: Record<string, unknown>[]) {
  return vi.fn(async (_sql: string, _params?: readonly unknown[]) => ({ rows }));
}

describe('the four calls', () => {
  it('claim: the fixture row parses, null is nothing', async () => {
    const query = queryReturning([{ doc: claimFixture.returns }]);
    const rpc = createIngestRpc(query, RUNNER);
    expect(await rpc.claim()).toEqual(claimFixture.returns);
    expect(query.mock.calls[0]?.[0]).toContain('public.workspace_ingest_claim($1');
    expect(query.mock.calls[0]?.[1]).toEqual([claimFixture.args.p_runner]);
    expect(await createIngestRpc(queryReturning([{ doc: null }]), RUNNER).claim()).toBeNull();
    expect(await createIngestRpc(queryReturning([]), RUNNER).claim()).toBeNull();
  });

  it('claim: a memory item has null mime, size, hash and link', () => {
    const memory = { ...claimFixture.returns, kind: 'memory', step: 'embed', mime: null, byte_size: null, sha256: null, signed_url: null, signed_url_expires_at: null };
    expect(parseClaim(memory)).toEqual(memory);
  });

  it.each([
    ['not an object', 5],
    ['a document id that is not a positive integer', { ...claimFixture.returns, document_id: 'x' }],
    ['a kind outside upload and memory', { ...claimFixture.returns, kind: 'file' }],
    ['a step outside read and embed', { ...claimFixture.returns, step: 'now' }],
    ['attempts that are not a number', { ...claimFixture.returns, attempts: 'a' }],
  ])('claim: %s is refused', (_name, row) => {
    expect(() => parseClaim(row)).toThrow(/workspace_ingest_claim/);
  });

  it('put_text: passes the runner, the id and the units as jsonb, returns the count', async () => {
    const query = queryReturning([{ n: 2 }]);
    const rpc = createIngestRpc(query, putFixture.args.p_runner);
    expect(await rpc.putText(putFixture.args.p_document_id, putFixture.args.p_units)).toBe(putFixture.returns);
    expect(query.mock.calls[0]?.[0]).toContain('public.workspace_ingest_put_text($1');
    expect(query.mock.calls[0]?.[1]).toEqual([putFixture.args.p_runner, putFixture.args.p_document_id, JSON.stringify(putFixture.args.p_units)]);
  });

  it('finish: passes outcome and code, returns the state', async () => {
    const query = queryReturning([{ state: 'indexed' }]);
    const rpc = createIngestRpc(query, finishFixture.args.p_runner);
    expect(await rpc.finish(finishFixture.args.p_document_id, 'indexed', null)).toBe(finishFixture.returns);
    expect(query.mock.calls[0]?.[0]).toContain('public.workspace_ingest_finish($1');
    expect(query.mock.calls[0]?.[1]).toEqual([finishFixture.args.p_runner, 17, 'indexed', null]);
  });

  it('heartbeat: one call with the runner', async () => {
    const query = queryReturning([{}]);
    await createIngestRpc(query, heartbeatFixture.args.p_runner).heartbeat();
    expect(query.mock.calls[0]?.[0]).toContain('public.workspace_ingest_heartbeat($1');
    expect(query.mock.calls[0]?.[1]).toEqual([heartbeatFixture.args.p_runner]);
  });

  it('touches no table: every statement is a select of one of the four functions', async () => {
    const query = queryReturning([{ doc: null, n: 0, state: 'failed' }]);
    const rpc = createIngestRpc(query, RUNNER);
    await rpc.claim();
    await rpc.putText(1, [{ unit_kind: 'doc', unit_no: 1, text: 'x' }]);
    await rpc.finish(1, 'failed', 'bad_bytes');
    await rpc.heartbeat();
    for (const [sql] of query.mock.calls) {
      expect(sql).toMatch(/^select public\.workspace_ingest_(claim|put_text|finish|heartbeat)\(/);
    }
  });
});

describe('the embed call', () => {
  const jwt = 'eyJ.synthetic.anon';

  it('posts to workspace-embed with the legacy anon JWT and the document id on every body', async () => {
    const bodies: unknown[] = [];
    const fetchFn = vi.fn(async (_url: string, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)));
      return new Response(JSON.stringify(embedFixture.answer), { status: 200 });
    });
    const result = await embedDocument({ documentId: 17, jwt, fetch: fetchFn as unknown as typeof fetch, sleep: async () => undefined });
    expect(result.exitCode).toBe(0);
    expect(fetchFn.mock.calls[0]?.[0]).toBe('https://goultdzqcavefcgnifdy.supabase.co/functions/v1/workspace-embed');
    const headers = fetchFn.mock.calls[0]?.[1]?.headers as Record<string, string>;
    expect(headers.apikey).toBe(jwt);
    expect(headers.Authorization).toBe(`Bearer ${jwt}`);
    expect(bodies.length).toBeGreaterThan(0);
    for (const body of bodies) expect(body).toMatchObject({ document_id: 17, limit: 40, max_parts: 3 });
  });

  it('keeps the document id across the loop\'s repeats, and stops when nothing is left', async () => {
    const answers = [{ ...embedFixture.answer, remaining_parts: 2 }, { ...embedFixture.answer, remaining_parts: 0 }];
    const bodies: { document_id: number }[] = [];
    const fetchFn = vi.fn(async (_url: string, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)));
      return new Response(JSON.stringify(answers.shift()), { status: 200 });
    });
    const result = await embedDocument({ documentId: 31, jwt, fetch: fetchFn as unknown as typeof fetch, sleep: async () => undefined });
    expect(result.exitCode).toBe(0);
    expect(bodies.map((b) => b.document_id)).toEqual([31, 31]);
  });

  it('a unit that failed to embed, or a non-200 answer, is exit 1', async () => {
    const failed = { ...embedFixture.answer, failed: [{ text_id: 5, error: 'x' }] };
    for (const response of [() => new Response(JSON.stringify(failed), { status: 200 }), () => new Response('no', { status: 401 })]) {
      const fetchFn = vi.fn(async () => response());
      const result = await embedDocument({ documentId: 17, jwt, fetch: fetchFn as unknown as typeof fetch, sleep: async () => undefined });
      expect(result.exitCode).toBe(1);
    }
  });

  it('a transport failure ends in exit 1 without throwing', async () => {
    const fetchFn = vi.fn(async () => {
      throw new Error('SENTINEL-TRANSPORT');
    });
    const result = await embedDocument({ documentId: 17, jwt, fetch: fetchFn as unknown as typeof fetch, sleep: async () => undefined, budget: 2 });
    expect(result.exitCode).toBe(1);
    expect(JSON.stringify(result)).not.toContain('SENTINEL');
  });
});

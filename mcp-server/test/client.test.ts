import { describe, expect, it } from 'vitest';
import { SupabaseMaterialsClient } from '../src/client.js';
import { ApiError } from '../src/errors.js';
import { TEST_KEY, TEST_URL, scriptedFetch } from './helpers.js';

function client(
  responses: Array<{ status: number; body: unknown } | Error>,
  timeoutMs = 30_000,
) {
  const { fetchImpl, calls } = scriptedFetch(responses);
  const instance = new SupabaseMaterialsClient({
    supabaseUrl: TEST_URL,
    serviceKey: TEST_KEY,
    timeoutMs,
    fetchImpl,
  });
  return { instance, calls };
}

const hybridRow = {
  file_id: 5,
  text_id: 495,
  course_id: 'IST.323',
  bucket: 'lecture_slides',
  file_name: 'Lecture3.pptx',
  unit_kind: 'slide',
  unit_no: 28,
  score: 0.0196078431372549,
  similarity: 0.8912,
  part_no: 1,
  snippet_source: 'fts_headline',
  snippet: 'Risk assessment: identify assets…',
};

const request = {
  q: 'risk assessment',
  course: null,
  mode: 'hybrid' as const,
  limit: 3,
  minSimilarity: 0.78,
  includeSuperseded: false,
};

describe('search — the request', () => {
  it('POSTs to the search Edge Function with both auth headers and the floor', async () => {
    const { instance, calls } = client([
      { status: 200, body: { mode: 'hybrid', q: 'risk assessment', course: null, min_similarity: 0.78, count: 1, results: [hybridRow] } },
    ]);

    await instance.search(request);

    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(`${TEST_URL}/functions/v1/search`);
    expect(calls[0]!.init.method).toBe('POST');
    const headers = new Headers(calls[0]!.init.headers);
    expect(headers.get('authorization')).toBe(`Bearer ${TEST_KEY}`);
    expect(headers.get('apikey')).toBe(TEST_KEY);
    expect(headers.get('content-type')).toContain('application/json');
    expect(calls[0]!.body).toEqual({ q: 'risk assessment', course: null, mode: 'hybrid', limit: 3, min_similarity: 0.78 });
  });

  it('omits min_similarity from the body when the floor is disabled', async () => {
    const { instance, calls } = client([{ status: 200, body: { results: [] } }]);
    await instance.search({ ...request, minSimilarity: null });
    expect(calls[0]!.body).not.toHaveProperty('min_similarity');
  });

  it('omits include_superseded when it is false, because false is the server default', async () => {
    const { instance, calls } = client([{ status: 200, body: { results: [] } }]);
    await instance.search(request);
    expect(calls[0]!.body).not.toHaveProperty('include_superseded');
  });

  it('sends include_superseded: true when asked for the superseded history', async () => {
    const { instance, calls } = client([{ status: 200, body: { results: [] } }]);
    await instance.search({ ...request, includeSuperseded: true });
    expect(calls[0]!.body).toMatchObject({ include_superseded: true });
  });
});

describe('search — normalising the three result shapes', () => {
  it('maps a hybrid row (score + similarity + snippet)', async () => {
    const { instance } = client([{ status: 200, body: { min_similarity: 0.78, results: [hybridRow] } }]);
    const result = await instance.search(request);

    expect(result.floorApplied).toBe(true);
    expect(result.hits).toEqual([
      {
        fileId: 5,
        textId: 495,
        courseId: 'IST.323',
        bucket: 'lecture_slides',
        fileName: 'Lecture3.pptx',
        unitKind: 'slide',
        unitNo: 28,
        score: 0.0196078431372549,
        similarity: 0.8912,
        rank: null,
        partNo: 1,
        snippetSource: 'fts_headline',
        excerpt: 'Risk assessment: identify assets…',
      },
    ]);
  });

  it('maps a vector row (similarity + full text + part_no) and flags a missing similarity', async () => {
    const vectorRow = {
      ...hybridRow,
      score: undefined,
      snippet: undefined,
      part_no: 2,
      snippet_source: 'vector_part',
      text: 'Full slide text.',
    };
    const { instance } = client([{ status: 200, body: { results: [vectorRow] } }]);
    const result = await instance.search({ ...request, mode: 'vector' });

    expect(result.hits[0]).toMatchObject({
      partNo: 2,
      snippetSource: 'vector_part',
      excerpt: 'Full slide text.',
      score: null,
      similarity: 0.8912,
    });
  });

  it('reads part_no and snippet_source as absent when an older function omits them', async () => {
    const oldRow = { ...hybridRow, part_no: undefined, snippet_source: undefined };
    const { instance } = client([{ status: 200, body: { results: [oldRow] } }]);
    const result = await instance.search(request);
    expect(result.hits[0]).toMatchObject({ partNo: null, snippetSource: null });
  });

  it('narrows an unrecognised snippet_source to null instead of failing the whole set', async () => {
    const futureRow = { ...hybridRow, snippet_source: 'lexical_rerank_v9' };
    const { instance } = client([{ status: 200, body: { results: [futureRow] } }]);
    const result = await instance.search(request);
    expect(result.hits).toHaveLength(1);
    expect(result.hits[0]!.snippetSource).toBeNull();
  });

  it('maps an fts row (rank + headline snippet, no similarity)', async () => {
    const ftsRow = { ...hybridRow, score: undefined, similarity: undefined, rank: 0.0607927, snippet: '<b>risk</b> assessment' };
    const { instance } = client([{ status: 200, body: { results: [ftsRow] } }]);
    const result = await instance.search({ ...request, mode: 'fts' });

    expect(result.hits[0]).toMatchObject({ rank: 0.0607927, similarity: null, score: null, excerpt: '<b>risk</b> assessment' });
  });

  it('reports floorApplied=false when the server did not echo min_similarity (v2 function)', async () => {
    const { instance } = client([{ status: 200, body: { mode: 'hybrid', count: 1, results: [hybridRow] } }]);
    const result = await instance.search(request);
    expect(result.floorApplied).toBe(false);
  });

  it('rejects a malformed row instead of passing junk to the model', async () => {
    const junk = { status: 200, body: { results: [{ file_id: 'nope' }] } };
    const { instance } = client([junk, junk]);
    await expect(instance.search(request)).rejects.toThrow(ApiError);
    await expect(instance.search(request)).rejects.toThrow(/unexpected shape/i);
  });
});

describe('search — error mapping', () => {
  it('401/403 → key hint', async () => {
    const { instance } = client([{ status: 401, body: { message: 'Invalid JWT' } }]);
    const error = await instance.search(request).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(401);
    expect((error as ApiError).hint).toMatch(/SUPABASE_SERVICE_ROLE/);
  });

  it('404 → function-not-deployed hint', async () => {
    const { instance } = client([{ status: 404, body: { message: 'Function not found' } }]);
    const error = await instance.search(request).catch((e: unknown) => e);
    expect((error as ApiError).hint).toMatch(/deploy/i);
  });

  it('500 from the function carries its own message, code and hint', async () => {
    const { instance } = client([
      { status: 500, body: { error: 'function hybrid_search_file_text(...) does not exist', code: '42883', hint: 'apply migration 012' } },
    ]);
    const error = await instance.search(request).catch((e: unknown) => e);
    expect((error as ApiError).message).toContain('hybrid_search_file_text');
    expect((error as ApiError).message).toContain('42883');
    // A known Postgres code names the migration before any server-supplied hint.
    expect((error as ApiError).hint).toContain('012_hybrid_similarity');
  });

  it('a network failure becomes an ApiError with a connectivity hint', async () => {
    const { instance } = client([new TypeError('fetch failed')]);
    const error = await instance.search(request).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).hint).toMatch(/SUPABASE_URL|network/i);
  });

  it('a timeout aborts the request and says so', async () => {
    const hanging = (async (_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
      })) as typeof fetch;
    const instance = new SupabaseMaterialsClient({ supabaseUrl: TEST_URL, serviceKey: TEST_KEY, timeoutMs: 10, fetchImpl: hanging });

    const error = await instance.search(request).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).message).toMatch(/timed out/i);
    expect((error as ApiError).hint).toMatch(/BB2DASH_TIMEOUT_MS/);
  });
});

describe('getText', () => {
  const row = {
    id: 495,
    unit_kind: 'slide',
    unit_no: 28,
    text: 'Full slide text.',
    char_count: 16,
    bb_files: { id: 5, file_name: 'Lecture3.pptx', course_id: 'IST.323', bucket: 'lecture_slides', path: 'Lecture Slides' },
  };

  it('reads one unit through PostgREST with the file joined', async () => {
    const { instance, calls } = client([{ status: 200, body: [row] }]);
    const text = await instance.getText(495);

    expect(calls[0]!.url).toContain(`${TEST_URL}/rest/v1/bb_file_text?`);
    expect(calls[0]!.url).toContain('id=eq.495');
    expect(calls[0]!.url).toContain('bb_files(');
    expect(text).toEqual({
      textId: 495,
      unitKind: 'slide',
      unitNo: 28,
      charCount: 16,
      text: 'Full slide text.',
      file: { fileId: 5, fileName: 'Lecture3.pptx', courseId: 'IST.323', bucket: 'lecture_slides', path: 'Lecture Slides' },
    });
  });

  it('returns null when no row matches', async () => {
    const { instance } = client([{ status: 200, body: [] }]);
    expect(await instance.getText(999_999)).toBeNull();
  });

  it('tolerates PostgREST returning the join as a one-element array', async () => {
    const { instance } = client([{ status: 200, body: [{ ...row, bb_files: [row.bb_files] }] }]);
    const text = await instance.getText(495);
    expect(text?.file.fileName).toBe('Lecture3.pptx');
  });

  it('maps a PostgREST error with its code', async () => {
    const { instance } = client([{ status: 404, body: { code: 'PGRST205', message: "Could not find the table 'public.bb_file_text'" } }]);
    const error = await instance.getText(1).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).message).toContain('PGRST205');
  });
});

describe('listCourses', () => {
  it('maps id, title_short and kind, ordered by id', async () => {
    const { instance, calls } = client([
      { status: 200, body: [{ id: 'ECN.304', title_short: 'The Economics of Social Issues', kind: 'lecture' }] },
    ]);
    const courses = await instance.listCourses();
    expect(calls[0]!.url).toContain('/rest/v1/courses?');
    expect(calls[0]!.url).toContain('order=id');
    expect(courses).toEqual([{ id: 'ECN.304', title: 'The Economics of Social Issues', kind: 'lecture' }]);
  });
});

describe('review follow-ups', () => {
  it('a unit whose file has no course mapping is rendered as unassigned, not an error', async () => {
    const { instance } = client([{ status: 200, body: { results: [{ ...hybridRow, course_id: null }] } }]);
    const result = await instance.search(request);
    expect(result.hits[0]!.courseId).toBe('(unassigned)');
  });

  it('a body that fails mid-read is still an ApiError, not a raw TypeError', async () => {
    const brokenBody = (async () =>
      new Response(new ReadableStream({ start(controller) { controller.error(new TypeError('terminated')); } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })) as unknown as typeof fetch;
    const instance = new SupabaseMaterialsClient({ supabaseUrl: TEST_URL, serviceKey: TEST_KEY, timeoutMs: 1000, fetchImpl: brokenBody });
    const error = await instance.search(request).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).message).toContain('terminated');
  });

  it('PGRST202 names migration 021 when the request asked for include_superseded', async () => {
    const { instance } = client([
      { status: 500, body: { error: 'search failed (code PGRST202)', code: 'PGRST202', hint: 'Perhaps you meant to call public.hybrid_search_file_text(...)' } },
    ]);
    const error = await instance.search({ ...request, includeSuperseded: true }).catch((e: unknown) => e);
    expect((error as ApiError).hint).toContain('021_matched_snippets');
    expect((error as ApiError).hint).toContain('include_superseded');
  });

  it('PGRST202 names migration 012 even when PostgREST supplies its own overload hint', async () => {
    const { instance } = client([
      { status: 500, body: { error: 'search failed (code PGRST202)', code: 'PGRST202', hint: 'Perhaps you meant to call public.hybrid_search_file_text(p_course, p_limit, p_model, q, query_embedding, rrf_k)' } },
    ]);
    const error = await instance.search(request).catch((e: unknown) => e);
    expect((error as ApiError).hint).toContain('012_hybrid_similarity');
  });
});

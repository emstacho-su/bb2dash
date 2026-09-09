/**
 * HTTP client for the bb2dash retrieval surface.
 *
 * Ranked retrieval goes through the `search` Edge Function, which embeds the
 * query with the same gte-small session that embedded the corpus and calls the
 * SQL functions from migrations 010–012. Point reads (one text unit, the course
 * list) go through PostgREST on `public`, which IS exposed on this project —
 * unlike the harness `rag` schema.
 *
 * Every response row is validated before it reaches the model: a shape change
 * upstream surfaces as an error, not as silently empty fields.
 */

import { z } from 'zod';
import type { Mode } from './config.js';
import { ApiError } from './errors.js';

export type { Mode } from './config.js';

export interface SearchRequest {
  q: string;
  course: string | null;
  mode: Mode;
  limit: number;
  /** Cosine floor on vector evidence; null sends none. */
  minSimilarity: number | null;
}

/** One retrieval unit (a `bb_file_text` row), normalised across the three modes. */
export interface MaterialHit {
  fileId: number;
  textId: number;
  courseId: string;
  bucket: string;
  fileName: string;
  unitKind: string;
  unitNo: number;
  /** RRF sum (hybrid only). Ordering only — ceiling 2/(k+1) ≈ 0.039 at k=50. */
  score: number | null;
  /** Real cosine similarity (hybrid, vector). Null in fts mode. */
  similarity: number | null;
  /** ts_rank (fts only). */
  rank: number | null;
  /** Which embedded part matched (vector only). */
  partNo: number | null;
  /** Snippet (hybrid, fts) or the full unit text (vector). */
  excerpt: string;
}

export interface SearchResult {
  hits: MaterialHit[];
  /** True when the server echoed `min_similarity` — i.e. the v3 function applied the floor. */
  floorApplied: boolean;
}

export interface MaterialText {
  textId: number;
  unitKind: string;
  unitNo: number;
  charCount: number;
  text: string;
  file: {
    fileId: number;
    fileName: string;
    courseId: string;
    bucket: string;
    path: string | null;
  };
}

export interface CourseRow {
  id: string;
  title: string;
  kind: string | null;
}

export interface MaterialsClient {
  readonly description: string;
  search(request: SearchRequest): Promise<SearchResult>;
  getText(textId: number): Promise<MaterialText | null>;
  listCourses(): Promise<CourseRow[]>;
}

// ---------------------------------------------------------------- schemas

const hitRow = z.object({
  file_id: z.number(),
  text_id: z.number(),
  // bb_files.course_id is nullable (a file whose Blackboard shell never mapped
  // to a course). One such unit must not turn a whole result set into an error.
  course_id: z.string().nullable(),
  bucket: z.string(),
  file_name: z.string(),
  unit_kind: z.string(),
  unit_no: z.number(),
  score: z.number().nullish(),
  similarity: z.number().nullish(),
  rank: z.number().nullish(),
  part_no: z.number().nullish(),
  snippet: z.string().nullish(),
  text: z.string().nullish(),
});

const searchBody = z.object({
  results: z.array(z.unknown()),
  min_similarity: z.number().nullish(),
});

const fileJoin = z.object({
  id: z.number(),
  file_name: z.string(),
  course_id: z.string().nullable(),
  bucket: z.string(),
  path: z.string().nullable(),
});

const textRow = z.object({
  id: z.number(),
  unit_kind: z.string(),
  unit_no: z.number(),
  text: z.string(),
  char_count: z.number().nullable(),
  // PostgREST renders a many-to-one join as an object, but older configs and
  // ambiguous relationships yield a one-element array. Accept both.
  bb_files: z.union([fileJoin, z.array(fileJoin)]).nullable(),
});

const courseRow = z.object({
  id: z.string(),
  title_short: z.string().nullable(),
  kind: z.string().nullable(),
});

// ---------------------------------------------------------------- client

export interface SupabaseClientOptions {
  supabaseUrl: string;
  serviceKey: string;
  timeoutMs: number;
  fetchImpl?: typeof fetch;
}

const SEARCH_PATH = '/functions/v1/search';
/** Rendered course id for a file with no course mapping. */
export const UNASSIGNED_COURSE = '(unassigned)';
const TEXT_SELECT = 'id,unit_kind,unit_no,text,char_count,bb_files(id,file_name,course_id,bucket,path)';

export class SupabaseMaterialsClient implements MaterialsClient {
  readonly description: string;

  readonly #url: string;
  readonly #key: string;
  readonly #timeoutMs: number;
  readonly #fetch: typeof fetch;

  constructor(options: SupabaseClientOptions) {
    this.#url = options.supabaseUrl.replace(/\/+$/, '');
    this.#key = options.serviceKey;
    this.#timeoutMs = options.timeoutMs;
    this.#fetch = options.fetchImpl ?? globalThis.fetch;
    this.description = `bb2dash search Edge Function + PostgREST at ${this.#url}`;
  }

  async search(request: SearchRequest): Promise<SearchResult> {
    const body: Record<string, unknown> = {
      q: request.q,
      course: request.course,
      mode: request.mode,
      limit: request.limit,
    };
    if (request.minSimilarity !== null) body['min_similarity'] = request.minSimilarity;

    const raw = await this.#request(SEARCH_PATH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const parsed = searchBody.safeParse(raw);
    if (!parsed.success) {
      throw new ApiError(
        'The search function returned an unexpected shape (no `results` array).',
        'The deployed `search` Edge Function may be out of sync with supabase/functions/search/index.ts. Redeploy it.',
      );
    }

    const hits = parsed.data.results.map((row, index) => {
      const hit = hitRow.safeParse(row);
      if (!hit.success) {
        throw new ApiError(
          `Result ${index + 1} from the search function has an unexpected shape: ${hit.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; ')}.`,
          'The SQL functions (migrations 010–012) and the deployed `search` Edge Function must agree on column names. Check both.',
        );
      }
      return normaliseHit(hit.data);
    });

    return { hits, floorApplied: parsed.data.min_similarity !== undefined };
  }

  async getText(textId: number): Promise<MaterialText | null> {
    const query = `select=${TEXT_SELECT}&id=eq.${textId}&limit=1`;
    const raw = await this.#request(`/rest/v1/bb_file_text?${query}`, { method: 'GET' });

    const rows = z.array(textRow).safeParse(raw);
    if (!rows.success) {
      throw new ApiError(
        'bb_file_text returned an unexpected shape.',
        'Check that the bb_file_text → bb_files relationship still exists (migration 005) and that the select list in src/client.ts matches the columns.',
      );
    }
    const row = rows.data[0];
    if (!row) return null;

    const file = Array.isArray(row.bb_files) ? row.bb_files[0] : row.bb_files;
    if (!file) {
      throw new ApiError(
        `bb_file_text ${textId} has no parent bb_files row.`,
        'Every text unit should reference a file (bb_file_text.file_id is NOT NULL). Inspect the row directly.',
      );
    }

    return {
      textId: row.id,
      unitKind: row.unit_kind,
      unitNo: row.unit_no,
      charCount: row.char_count ?? row.text.length,
      text: row.text,
      file: {
        fileId: file.id,
        fileName: file.file_name,
        courseId: file.course_id ?? UNASSIGNED_COURSE,
        bucket: file.bucket,
        path: file.path,
      },
    };
  }

  async listCourses(): Promise<CourseRow[]> {
    const raw = await this.#request('/rest/v1/courses?select=id,title_short,kind&order=id.asc', { method: 'GET' });
    const rows = z.array(courseRow).safeParse(raw);
    if (!rows.success) {
      throw new ApiError('courses returned an unexpected shape.', 'Check the columns id, title_short, kind on public.courses.');
    }
    return rows.data.map((row) => ({ id: row.id, title: row.title_short ?? row.id, kind: row.kind }));
  }

  // -------------------------------------------------------------- transport

  async #request(path: string, init: RequestInit): Promise<unknown> {
    const url = `${this.#url}${path}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.#timeoutMs);

    // The timer stays armed until the BODY has been read: a server that sends
    // headers and then stalls the stream would otherwise hang past the timeout.
    let response: Response;
    let text: string;
    try {
      response = await this.#fetch(url, {
        ...init,
        headers: {
          Authorization: `Bearer ${this.#key}`,
          apikey: this.#key,
          Accept: 'application/json',
          ...(init.headers as Record<string, string> | undefined),
        },
        signal: controller.signal,
      });
      text = await response.text();
    } catch (cause) {
      if (isAbort(cause)) {
        throw new ApiError(
          `Request to ${path} timed out after ${this.#timeoutMs} ms.`,
          'The first search after an idle period loads gte-small inside the Edge Function (~1.5 s); anything slower is a network or project problem. Raise BB2DASH_TIMEOUT_MS if the project is merely slow.',
          null,
          { cause },
        );
      }
      throw new ApiError(
        `Request to ${path} failed: ${messageOf(cause)}`,
        'Check SUPABASE_URL and network connectivity to the Supabase project. The host must be reachable over https.',
        null,
        { cause },
      );
    } finally {
      clearTimeout(timer);
    }

    let payload: unknown = null;
    if (text.length > 0) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = { message: text.slice(0, 300) };
      }
    }

    if (!response.ok) throw errorFor(response.status, path, payload);
    return payload;
  }
}

// ---------------------------------------------------------------- helpers

function normaliseHit(row: z.infer<typeof hitRow>): MaterialHit {
  return {
    fileId: row.file_id,
    textId: row.text_id,
    courseId: row.course_id ?? UNASSIGNED_COURSE,
    bucket: row.bucket,
    fileName: row.file_name,
    unitKind: row.unit_kind,
    unitNo: row.unit_no,
    score: row.score ?? null,
    similarity: row.similarity ?? null,
    rank: row.rank ?? null,
    partNo: row.part_no ?? null,
    excerpt: row.snippet ?? row.text ?? '',
  };
}

function isAbort(cause: unknown): boolean {
  return (cause as { name?: string } | null)?.name === 'AbortError';
}

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

/** Map an HTTP failure to an ApiError whose hint names the likely fix. */
function errorFor(status: number, path: string, payload: unknown): ApiError {
  const body = (payload ?? {}) as { error?: unknown; message?: unknown; msg?: unknown; code?: unknown; hint?: unknown; details?: unknown };
  const detail = [body.error, body.message, body.msg].find((v) => typeof v === 'string' && v.length > 0) as string | undefined;
  const code = typeof body.code === 'string' && body.code.length > 0 ? body.code : null;
  const serverHint = typeof body.hint === 'string' && body.hint.length > 0 ? body.hint : null;

  const summary = `${path} returned HTTP ${status}${detail ? `: ${detail}` : ''}${code ? ` (code ${code})` : ''}`;
  const isFunction = path.startsWith('/functions/');

  let hint: string;
  if (code === 'PGRST202' || code === '42883') {
    // PostgREST's own hint ("Perhaps you meant to call ...") describes the
    // overload it found, which sends an operator to change the caller. The
    // real fix is the migration the caller was written for.
    hint =
      'No SQL function matched the call. Apply db/migrations/012_hybrid_similarity.sql (hybrid_search_file_text with p_min_similarity and a similarity column) and confirm the deployed search function matches supabase/functions/search/index.ts.';
  } else if (serverHint) {
    hint = serverHint;
  } else if (status === 401 || status === 403) {
    hint = 'The key was rejected. SUPABASE_SERVICE_ROLE must be the bb2dash sb_secret_… key (or legacy service-role JWT); the publishable key cannot read bb_file_text or call `search` behind verify_jwt.';
  } else if (status === 404) {
    hint = isFunction
      ? 'The `search` Edge Function is not deployed on this project. Deploy supabase/functions/search (e.g. `supabase functions deploy search --project-ref goultdzqcavefcgnifdy`).'
      : 'The table or relationship is missing. Apply db/migrations 005–012 to this project, and check SUPABASE_URL names bb2dash.';
  } else if (status >= 500) {
    hint = isFunction
      ? 'The search function raised. If the message names hybrid_search_file_text or a missing column, apply db/migrations/012_hybrid_similarity.sql; if it mentions the model or WORKER_RESOURCE_LIMIT, retry — the Edge Runtime was cold.'
      : 'PostgREST failed upstream. Retry once; if it persists, check the project status in the Supabase dashboard.';
  } else {
    hint = 'Inspect the response detail above; the request shape is fixed in src/client.ts.';
  }

  return new ApiError(summary, hint, status);
}

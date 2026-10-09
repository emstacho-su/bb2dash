// bb2dash :: workspace-search — the request handling, free of Deno so Node can test it.
//
// The function embeds the query with gte-small and calls the SQL function `workspace_search`
// (migration 192) with the CALLER'S OWN bearer. It holds no service key of its own, unlike
// `search`: the function's grant is `service_role` only, so an anon or signed-in caller is
// refused by the database (42501 -> 403 here), and the batch child, which calls with the
// service key, is let through. Rows are handed on exactly as the SQL function returned them,
// `kind` included.

export const EMBED_MODEL = "gte-small";
export const MAX_QUERY_CHARS = 2000;
export const KINDS = ["material", "upload", "memory"] as const;

const DEFAULT_LIMIT = 10;
const LIMIT_RANGE = [1, 50] as const;
const MAX_COURSES = 20;
const MAX_COURSE_CHARS = 64;
const REFUSED_STATUSES = [401, 403];
const PERMISSION_DENIED = "42501";

export type Kind = (typeof KINDS)[number];

export type SearchRequest = {
  q: string;
  kinds: Kind[];
  courses: string[] | null;
  limit: number;
  minSimilarity: number | null;
};

export type ParsedRequest = { ok: true; request: SearchRequest } | { ok: false; error: string };

export function parseSearchBody(raw: unknown): ParsedRequest {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: "request body must be a JSON object" };
  }
  const body = raw as Record<string, unknown>;

  const q = typeof body.q === "string" ? body.q.trim() : "";
  if (!q) return { ok: false, error: "missing required field: q (non-empty string)" };

  let kinds: Kind[] = [...KINDS];
  if (body.kinds !== undefined && body.kinds !== null) {
    if (!Array.isArray(body.kinds) || body.kinds.length === 0 || !body.kinds.every((k) => KINDS.includes(k as Kind))) {
      return { ok: false, error: `kinds must be a non-empty subset of ${KINDS.join(", ")}` };
    }
    kinds = KINDS.filter((k) => (body.kinds as unknown[]).includes(k));
  }

  let courses: string[] | null = null;
  if (body.courses !== undefined && body.courses !== null) {
    const list = body.courses;
    if (
      !Array.isArray(list) || list.length > MAX_COURSES ||
      !list.every((c) => typeof c === "string" && c.trim().length > 0 && c.length <= MAX_COURSE_CHARS)
    ) {
      return { ok: false, error: `courses must be null or a list of at most ${MAX_COURSES} course ids` };
    }
    courses = list as string[];
  }

  let limit = DEFAULT_LIMIT;
  if (body.limit !== undefined && body.limit !== null) {
    if (typeof body.limit !== "number" || !Number.isFinite(body.limit)) {
      return { ok: false, error: "limit must be a number" };
    }
    limit = Math.min(LIMIT_RANGE[1], Math.max(LIMIT_RANGE[0], Math.trunc(body.limit)));
  }

  let minSimilarity: number | null = null;
  if (body.min_similarity !== undefined && body.min_similarity !== null) {
    const floor = body.min_similarity;
    // typeof, not Number(): `true`, "" and [] would otherwise coerce to a valid floor.
    if (typeof floor !== "number" || !Number.isFinite(floor) || floor < 0 || floor > 1) {
      return { ok: false, error: "min_similarity must be a number between 0 and 1" };
    }
    minSimilarity = floor;
  }

  return { ok: true, request: { q: q.slice(0, MAX_QUERY_CHARS), kinds, courses, limit, minSimilarity } };
}

export type HandlerResult = { status: number; body: unknown };

export type HandlerDeps = {
  body: unknown;
  /** Request headers, names lower-cased. */
  headers: Record<string, string | undefined>;
  env: { supabaseUrl: string };
  embed: (q: string) => Promise<number[]>;
  fetchImpl: typeof fetch;
};

/** The caller's credentials, as the rpc call needs them. Null when there is no bearer. */
function callerHeaders(headers: HandlerDeps["headers"]): Record<string, string> | null {
  const authorization = headers["authorization"];
  if (!authorization) return null;
  const token = authorization.replace(/^Bearer\s+/i, "");
  return {
    "Content-Type": "application/json",
    Accept: "application/json",
    Authorization: authorization,
    apikey: headers["apikey"] ?? token,
  };
}

function rpcArguments(request: SearchRequest, vector: number[]): Record<string, unknown> {
  const args: Record<string, unknown> = {
    p_q: request.q,
    p_query_embedding: JSON.stringify(vector),
    p_kinds: request.kinds,
    p_courses: request.courses,
    p_limit: request.limit,
    p_model: EMBED_MODEL,
  };
  // Attached only when set: an absent floor means the SQL function's own default (none).
  if (request.minSimilarity !== null) args.p_min_similarity = request.minSimilarity;
  return args;
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return JSON.parse(await response.text());
  } catch {
    return null;
  }
}

export async function handleSearch(deps: HandlerDeps): Promise<HandlerResult> {
  const parsed = parseSearchBody(deps.body);
  if (!parsed.ok) return { status: 400, body: { error: parsed.error } };
  const credentials = callerHeaders(deps.headers);
  if (!credentials) return { status: 401, body: { error: "missing bearer token" } };
  const { request } = parsed;

  let vector: number[];
  try {
    vector = await deps.embed(request.q);
  } catch {
    return { status: 500, body: { error: "search failed", code: null } };
  }

  const response = await deps.fetchImpl(`${deps.env.supabaseUrl}/rest/v1/rpc/workspace_search`, {
    method: "POST",
    headers: credentials,
    body: JSON.stringify(rpcArguments(request, vector)),
  });
  const payload = await readJson(response);
  const code = (payload as { code?: unknown } | null)?.code;
  const sqlState = typeof code === "string" ? code : null;

  if (!response.ok) {
    if (sqlState === PERMISSION_DENIED || REFUSED_STATUSES.includes(response.status)) {
      return { status: 403, body: { error: "search refused", code: sqlState ?? PERMISSION_DENIED } };
    }
    return { status: 500, body: { error: "search failed", code: sqlState } };
  }
  if (!Array.isArray(payload)) return { status: 500, body: { error: "search failed", code: null } };

  return {
    status: 200,
    body: {
      q: request.q,
      model: EMBED_MODEL,
      min_similarity: request.minSimilarity,
      count: payload.length,
      results: payload,
    },
  };
}

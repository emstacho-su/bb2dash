// bb2dash :: edge function `calendar-push` — google.ts
// The Google half of the push: the OAuth token exchange, a four-call Calendar client built on
// `fetch`, the fixed course→colour map, and the canonical event body the content hash is taken
// over.
//
// NO SDK, ON PURPOSE. googleapis is a ~2 MB dependency that wants a Node runtime; everything
// this function needs is four HTTPS calls with a bearer token. A hand-rolled client is also the
// only way the tests can run without a network: `createGoogleCalendar` takes the fetch
// implementation as an argument, and the run algorithm in push.ts takes the whole client as an
// argument, so a fake is a ten-line object.
//
// Nothing in this file reads Deno globals or remote modules, so the same source runs under
// `node --test`.

/** Google's eleven event colours, by the id the Calendar API expects. */
export const GOOGLE_EVENT_COLOURS: Readonly<Record<string, string>> = Object.freeze({
  "1": "Lavender",
  "2": "Sage",
  "3": "Grape",
  "4": "Flamingo",
  "5": "Banana",
  "6": "Tangerine",
  "7": "Peacock",
  "8": "Graphite",
  "9": "Blueberry",
  "10": "Basil",
  "11": "Tomato",
});

// Q1: one calendar, filterable by course. The course code opens every event title so Google's
// search box filters on it, and each course also gets a fixed colour so a week is readable at a
// glance. Deliberately hand-assigned rather than hashed: a hash would recolour every event the
// day a course id changes, and two courses could collide on one colour.
export const COURSE_COLOUR_IDS: Readonly<Record<string, string>> = Object.freeze({
  "ECN.304": "5", // Banana
  "GEO.103.lecture": "10", // Basil
  "GEO.103.recitation": "2", // Sage
  "IST.323": "11", // Tomato
  "IST.352": "7", // Peacock
  "IST.466": "3", // Grape
  "IST.471": "6", // Tangerine
});

/** Anything not in the map — a course added mid-term — is Graphite rather than uncoloured. */
export const DEFAULT_COLOUR_ID = "8";

export function colourIdForCourse(courseId: string): string {
  return COURSE_COLOUR_IDS[courseId] ?? DEFAULT_COLOUR_ID;
}

/** The calendar every event is written in. Google resolves the instant from dateTime's offset. */
export const EVENT_TIME_ZONE = "America/New_York";

/**
 * Where a click on an event lands: the bb2dash popout for that assignment.
 *
 * The origin is read per run from app_settings.web_base_url (migration 066), not baked in
 * here: it is part of the canonical body and therefore part of content_hash, so the day the
 * deployment moves every event needs a patch - and with the hostname in this file that would
 * also need a code change and a redeploy first. The constant below is only the value the
 * column defaults to and the value the tests pin.
 */
export const DEFAULT_WEB_BASE_URL = "https://web-xi-ten-uy9xk6c6p0.vercel.app";

/** Trailing slashes are stripped so a link never comes out as `...//?item=`. */
export function itemLink(webBaseUrl: string, assignmentId: string): string {
  const origin = (webBaseUrl || DEFAULT_WEB_BASE_URL).replace(/\/+$/, "");
  return `${origin}/?item=assignment:${assignmentId}`;
}

export const MANAGED_NOTICE =
  "Managed by bb2dash — edits here are overwritten on the next push.";

/** The extended property every bb2dash event carries, so the whole set is recoverable. */
export const APP_PROPERTY = "bb2dash";

// ------------------------------------------------------------------------------------------
// Types
// ------------------------------------------------------------------------------------------

/** One row of v_calendar_push_items, as PostgREST returns it. */
export interface PushItem {
  assignment_id: string;
  course_id: string;
  course_code: string;
  title: string;
  type: string;
  due_at: string | null;
  due_date: string | null;
  event_at: string;
  points_possible: number | string | null;
  status: string | null;
  absent_from_blackboard: boolean;
}

export interface EventDateTime {
  dateTime: string;
  timeZone: string;
}

export interface CalendarEventBody {
  id: string;
  /**
   * R3-1. Deleting an event does not free its id: Google keeps the row in status
   * "cancelled", invisible in the UI and absent from events.list. When the same assignment
   * comes back, insert answers 409 and the fallback patches that cancelled row - and a patch
   * that says nothing about status LEAVES IT CANCELLED. The event exists, the mirror says it
   * was pushed, and Stack never sees it. Observed live: 62 mirror rows, 61 events on Google.
   *
   * Carrying status in the canonical body means every patch, whatever prompted it, restores
   * the event. It is in the hash on purpose: the alternative (adding status only on the 409
   * path) fixes the one case we thought of and leaves every other patch able to resurrect the
   * bug. Cost is a single re-patch of the whole set the first time this ships.
   */
  status: "confirmed";
  summary: string;
  description: string;
  start: EventDateTime;
  end: EventDateTime;
  colorId: string;
  extendedProperties: { private: { app: string; assignment_id: string } };
  reminders: { useDefault: boolean };
}

export interface GoogleResult {
  status: number;
  etag: string | null;
  /** Google's error message, or a transport failure. Null on success. */
  error: string | null;
}

export interface GoogleCalendar {
  insert(calendarId: string, body: CalendarEventBody): Promise<GoogleResult>;
  patch(calendarId: string, eventId: string, body: CalendarEventBody): Promise<GoogleResult>;
  remove(calendarId: string, eventId: string): Promise<GoogleResult>;
  /** Every event carrying `app=bb2dash`, used by the verification note's Google-side count. */
  list(calendarId: string): Promise<{ status: number; ids: string[]; error: string | null }>;
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

// ------------------------------------------------------------------------------------------
// Hashing and canonical JSON
// ------------------------------------------------------------------------------------------

export async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * The same id migration 060's calendar_event_id() computes, so SQL and TypeScript address the
 * same Google event. 'bb' plus 32 hex characters: hex is a subset of Google's base32hex id
 * charset, and 128 bits will not collide across a term's assignments.
 */
export async function calendarEventId(assignmentId: string): Promise<string> {
  return "bb" + (await sha256Hex(assignmentId)).slice(0, 32);
}

/** JSON with object keys sorted, so the content hash does not depend on key order. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return "[" + value.map(stableStringify).join(",") + "]";
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return "{" + entries.map(([k, v]) => JSON.stringify(k) + ":" + stableStringify(v)).join(",") +
    "}";
}

export function contentHash(body: CalendarEventBody): Promise<string> {
  return sha256Hex(stableStringify(body));
}

// ------------------------------------------------------------------------------------------
// The canonical event body
// ------------------------------------------------------------------------------------------

/**
 * RFC3339 without fractional seconds. Postgres hands back `2026-09-16T19:45:00+00:00`, a
 * re-read of the same row can hand back `...+00`, and Google accepts both — but the content
 * hash must not change just because the wire format did, so every instant is normalised here.
 */
export function toRfc3339(instant: string): string {
  const ms = Date.parse(instant);
  if (Number.isNaN(ms)) throw new Error(`event_at is not a timestamp: ${instant}`);
  return new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");
}

/** "5 points", "0.5 points", nothing at all when Blackboard never published a number. */
function pointsLine(points: number | string | null): string | null {
  if (points === null || points === undefined || points === "") return null;
  const n = typeof points === "number" ? points : Number(points);
  if (!Number.isFinite(n)) return null;
  // Trailing zeros off: 5.00 is "5 points", 2.50 is "2.5 points".
  return `Points: ${String(n)}`;
}

export function buildDescription(item: PushItem, webBaseUrl: string): string {
  const lines = [`Type: ${item.type}`];
  const points = pointsLine(item.points_possible);
  if (points) lines.push(points);
  lines.push(itemLink(webBaseUrl, item.assignment_id));
  lines.push("");
  lines.push(MANAGED_NOTICE);
  return lines.join("\n");
}

/**
 * Q2: a zero-length timed event sitting exactly at the due instant, which is what a deadline is.
 * start === end is legal in the Calendar API and renders as a marker rather than a block.
 */
export function buildEventBody(
  item: PushItem,
  eventId: string,
  webBaseUrl: string,
): CalendarEventBody {
  const at: EventDateTime = { dateTime: toRfc3339(item.event_at), timeZone: EVENT_TIME_ZONE };
  return {
    id: eventId,
    status: "confirmed",
    summary: `${item.course_code} · ${item.title}`,
    description: buildDescription(item, webBaseUrl),
    start: at,
    end: { ...at },
    colorId: colourIdForCourse(item.course_id),
    extendedProperties: { private: { app: APP_PROPERTY, assignment_id: item.assignment_id } },
    reminders: { useDefault: true },
  };
}

// ------------------------------------------------------------------------------------------
// OAuth
// ------------------------------------------------------------------------------------------

export interface TokenResult {
  accessToken: string | null;
  /** 'invalid_grant' when the refresh token was revoked or expired — the one case with a script. */
  error: string | null;
  invalidGrant: boolean;
}

export const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

export async function exchangeRefreshToken(
  clientId: string,
  clientSecret: string,
  refreshToken: string,
  fetchImpl: FetchLike = fetch,
): Promise<TokenResult> {
  const form = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });

  let response: Response;
  try {
    response = await fetchImpl(TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });
  } catch (cause) {
    return { accessToken: null, error: `token endpoint unreachable: ${cause}`, invalidGrant: false };
  }

  const payload = await readJson(response);
  if (response.ok && typeof payload?.access_token === "string") {
    return { accessToken: payload.access_token, error: null, invalidGrant: false };
  }
  const code = typeof payload?.error === "string" ? payload.error : `HTTP ${response.status}`;
  return { accessToken: null, error: code, invalidGrant: code === "invalid_grant" };
}

// ------------------------------------------------------------------------------------------
// The Calendar client
// ------------------------------------------------------------------------------------------

const CALENDAR_BASE = "https://www.googleapis.com/calendar/v3/calendars";

async function readJson(response: Response): Promise<Record<string, any> | null> {
  try {
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

/** Google's error payload is {error: {code, message, errors: [{reason}]}}; we want both. */
function errorText(status: number, payload: Record<string, any> | null): string {
  const inner = payload?.error;
  const reason = inner?.errors?.[0]?.reason;
  const message = typeof inner === "string" ? inner : inner?.message;
  const parts = [`HTTP ${status}`];
  if (reason) parts.push(String(reason));
  if (message) parts.push(String(message));
  return parts.join(": ");
}

export function createGoogleCalendar(
  accessToken: string,
  fetchImpl: FetchLike = fetch,
): GoogleCalendar {
  const headers = {
    authorization: `Bearer ${accessToken}`,
    "content-type": "application/json",
  };

  async function call(
    url: string,
    init: RequestInit,
  ): Promise<{ status: number; payload: Record<string, any> | null; error: string | null }> {
    try {
      const response = await fetchImpl(url, init);
      const payload = await readJson(response);
      return {
        status: response.status,
        payload,
        error: response.ok ? null : errorText(response.status, payload),
      };
    } catch (cause) {
      // 0 is "no HTTP answer at all" — never a rate limit, so the back-off will not retry it.
      return { status: 0, payload: null, error: `calendar request failed: ${cause}` };
    }
  }

  const events = (calendarId: string) =>
    `${CALENDAR_BASE}/${encodeURIComponent(calendarId)}/events`;

  return {
    async insert(calendarId, body) {
      const r = await call(events(calendarId), {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });
      return { status: r.status, etag: r.payload?.etag ?? null, error: r.error };
    },

    async patch(calendarId, eventId, body) {
      const r = await call(`${events(calendarId)}/${encodeURIComponent(eventId)}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify(body),
      });
      return { status: r.status, etag: r.payload?.etag ?? null, error: r.error };
    },

    async remove(calendarId, eventId) {
      const r = await call(`${events(calendarId)}/${encodeURIComponent(eventId)}`, {
        method: "DELETE",
        headers,
      });
      return { status: r.status, etag: null, error: r.error };
    },

    async list(calendarId) {
      const url = `${events(calendarId)}?privateExtendedProperty=` +
        encodeURIComponent(`app=${APP_PROPERTY}`) + "&showDeleted=false&maxResults=2500";
      const r = await call(url, { method: "GET", headers });
      const items: any[] = Array.isArray(r.payload?.items) ? r.payload!.items : [];
      return {
        status: r.status,
        ids: items.map((i) => String(i?.id ?? "")).filter(Boolean),
        error: r.error,
      };
    },
  };
}

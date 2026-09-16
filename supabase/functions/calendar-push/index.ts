// bb2dash :: edge function `calendar-push`  (v4)
// Pushes every dated assignment, and every event Stack created in the planner, onto his
// dedicated Google "bb2dash" calendar, and takes off the ones that no longer belong there. Class
// meetings are not pushed (Stack, 2026-09-14). Push-only: nothing Google says is ever read back
// into bb2dash.
//
// POST { run_id?: number }   header: x-push-secret: <Vault calendar_push_secret>
//   run_id  the calendar_push_runs row calendar_push_tick() already opened. Absent (the PM
//           invoking by hand) opens one with trigger = 'manual'.
//   -> 200 { run_id, status, counts: {scanned, inserted, patched, deleted, unchanged, failed,
//                                      and each of those six as <verb>_assignments and
//                                      <verb>_planner} }
//   -> 400 for a body that is not a JSON object, or a non-numeric run_id. No run is opened.
//   -> 401 with an empty body for anything that cannot prove the shared secret.
//
// WHY verify_jwt = false. The caller is calendar_push_tick() inside Postgres, over pg_net. It
// holds no JWT and cannot mint one; the legacy anon JWT would be a second long-lived credential
// in Vault buying nothing. Instead the function is gated on x-push-secret, compared in constant
// time against Vault's calendar_push_secret, which only the tick (SECURITY DEFINER) and this
// function (service role) can read. A wrong or missing secret gets 401 and no body — no hint
// about whether the function exists, what it wants, or how close the guess was.
//
// v2 (round 2b) changes three things about bookkeeping, not about what is pushed:
//   R2b-2  gcal_dirty is never cleared here. The tick clears it when it fires, so a change that
//          lands while this run is in flight survives; this function only raises it again when
//          the run was not clean.
//   R2b-3  the in-flight lock is released only by the run that holds it
//          (app_settings.gcal_push_run_id), so a manual run finishing mid-flight no longer frees
//          the scheduled push's lock.
//   R2b-7  the "open in bb2dash" origin comes from app_settings.web_base_url, per run.
//
// v3 changed google.ts only (R3-1, status confirmed). v4 (Phase 11b, migration 068) reads the
// widened v_calendar_push_items and keys the calendar_events mirror by (source, ref_id) instead
// of assignment_id; the assignment arm's event body and hash are unchanged, which is what lets
// the cut-over push report zero writes on that arm.
//
// v5 (Phase 11b round 2). R2-1: both sides of the diff are read page by page and a side that
// cannot be read completely aborts the run (push.ts readAndRunPush).
//
// WHAT THIS FILE OWNS, and what it does not. Here: the HTTP request, the secret, the Supabase
// client, the OAuth exchange, and writing the run's result back. The diff itself lives in
// push.ts and the Google calls in google.ts, both free of Deno globals, so the tests can drive
// the whole algorithm with a fake client and no network.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import {
  createGoogleCalendar,
  DEFAULT_WEB_BASE_URL,
  exchangeRefreshToken,
  type PushItem,
  type PushSource,
} from "./google.ts";
import {
  type MirrorRow,
  type MirrorStore,
  type PageReader,
  type PushCounts,
  readAndRunPush,
} from "./push.ts";

const JSON_HEADERS = { "Content-Type": "application/json" };

// R2b-8: the truncation limits, named where they can be compared with the columns they protect.
/** calendar_push_runs.error and app_settings.gcal_last_error are unbounded text; be sane anyway. */
const RUN_ERROR_LIMIT = 2000;
/** calendar_events.last_error — one item's failure, not a stack trace. */
const ITEM_ERROR_LIMIT = 500;
/** How many per-item failures are folded into the run's single error string. */
const MAX_REPORTED_ERRORS = 20;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });

/** 401 with no body at all: an unauthenticated caller learns nothing from us. */
const unauthorised = () => new Response(null, { status: 401 });

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

/**
 * Constant-time string comparison. A byte-by-byte `===` leaks the length of the shared prefix
 * through timing, which is enough to walk a secret out one character at a time. Length is
 * compared without an early return by folding it into the accumulator.
 */
function timingSafeEqual(a: string, b: string): boolean {
  const left = new TextEncoder().encode(a);
  const right = new TextEncoder().encode(b);
  let diff = left.length ^ right.length;
  const n = Math.max(left.length, right.length);
  for (let i = 0; i < n; i++) {
    diff |= (left[i] ?? 0) ^ (right[i] ?? 0);
  }
  return diff === 0;
}

interface Secrets {
  google_client_id?: string;
  google_client_secret?: string;
  google_refresh_token?: string;
  calendar_push_secret?: string;
}

async function loadSecrets(): Promise<Secrets> {
  const { data, error } = await supabase.rpc("calendar_secrets");
  if (error) throw new Error(`calendar_secrets: ${error.message}`);
  const out: Secrets = {};
  for (const row of (data ?? []) as { name: string; secret: string }[]) {
    (out as Record<string, string>)[row.name] = row.secret;
  }
  return out;
}

/**
 * The mirror writer. Every column calendar_events carries is set from here and nowhere else.
 * v4: every statement is scoped by the full primary key (source, ref_id), migration 068.
 */
function mirrorStore(): MirrorStore {
  return {
    async saveSuccess(row: MirrorRow) {
      const { error } = await supabase.from("calendar_events").upsert({
        ...row,
        last_error: null,
        last_pushed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: "source,ref_id" });
      if (error) throw new Error(`calendar_events upsert: ${error.message}`);
    },
    async saveFailure(source: PushSource, refId: string, message: string) {
      // update, never upsert: a failed insert means Google holds nothing, and a mirror row
      // claiming otherwise would stop the next run from retrying it.
      await supabase.from("calendar_events")
        .update({
          last_error: message.slice(0, ITEM_ERROR_LIMIT),
          updated_at: new Date().toISOString(),
        })
        .eq("source", source).eq("ref_id", refId);
    },
    async markDeleting(source: PushSource, refId: string) {
      await supabase.from("calendar_events")
        .update({ state: "deleting", updated_at: new Date().toISOString() })
        .eq("source", source).eq("ref_id", refId);
    },
    async remove(source: PushSource, refId: string) {
      const { error } = await supabase.from("calendar_events").delete()
        .eq("source", source).eq("ref_id", refId);
      if (error) throw new Error(`calendar_events delete: ${error.message}`);
    },
  };
}

/**
 * R2-1: one page of the desired set. `count: "exact"` lets readAllPages notice rows that moved
 * between pages; (source, ref_id) is unique on the view, so the order is total and stable.
 */
const readDesiredPage: PageReader<PushItem> = async (from, to) => {
  const { data, error, count } = await supabase
    .from("v_calendar_push_items").select("*", { count: "exact" })
    .order("source").order("ref_id").range(from, to);
  return { data: data as PushItem[] | null, error, count };
};

/** R2-1: one page of the mirror, ordered by its primary key. */
const readMirrorPage: PageReader<MirrorRow> = async (from, to) => {
  const { data, error, count } = await supabase
    .from("calendar_events")
    .select("source, ref_id, event_id, calendar_id, content_hash, etag, state", { count: "exact" })
    .order("source").order("ref_id").range(from, to);
  return { data: data as MirrorRow[] | null, error, count };
};

async function openRun(): Promise<number> {
  const { data, error } = await supabase.from("calendar_push_runs")
    .insert({ trigger: "manual" }).select("id").single();
  if (error) throw new Error(`calendar_push_runs insert: ${error.message}`);
  return data!.id as number;
}

/**
 * Close the run and report the outcome on app_settings.
 *
 * R2b-2: gcal_dirty is never cleared here. calendar_push_tick() cleared it in the same statement
 * that took the lock, so from that instant the flag means "something changed after this run
 * started reading" — erasing it on the way out is exactly the bug. A run that did not finish
 * cleanly raises it again so the next tick retries.
 *
 * R2b-3: the lock is released in a SECOND, narrower statement, matched on this run's id. A
 * manual run never took the lock and so never frees the scheduled push's.
 */
async function finish(
  runId: number,
  status: "ok" | "partial" | "failed",
  counts: Partial<PushCounts>,
  error: string | null,
) {
  const finishedAt = new Date().toISOString();
  const text = error === null ? null : error.slice(0, RUN_ERROR_LIMIT);

  await supabase.from("calendar_push_runs")
    .update({ status, counts, finished_at: finishedAt, error: text })
    .eq("id", runId);

  const outcome: Record<string, unknown> = {
    gcal_last_push_at: finishedAt,
    gcal_last_status: status,
    gcal_last_error: text,
  };
  if (status !== "ok") outcome.gcal_dirty = true;
  await supabase.from("app_settings").update(outcome).eq("id", true);

  await supabase.from("app_settings")
    .update({ gcal_push_request_id: null, gcal_push_run_id: null })
    .eq("id", true).eq("gcal_push_run_id", runId);
}

/** R2b-8: one place for "record the run as failed and answer the caller". */
async function abortRun(runId: number, message: string, status = 200): Promise<Response> {
  await finish(runId, "failed", {}, message);
  return json({ run_id: runId, status: "failed", error: message }, status);
}

Deno.serve(async (req: Request) => {
  // 1. The secret, before anything else and before any hint that this function exists.
  let secrets: Secrets;
  try {
    secrets = await loadSecrets();
  } catch (cause) {
    // R2b-8: without this line a database outage and a forged request look identical in the
    // logs — both are a bare 401. The message names the failure, never a secret.
    console.error("calendar-push: could not read the push secret from Vault:", String(cause));
    return unauthorised();
  }
  const presented = req.headers.get("x-push-secret") ?? "";
  const expected = secrets.calendar_push_secret ?? "";
  if (!expected || !presented || !timingSafeEqual(presented, expected)) return unauthorised();

  if (req.method !== "POST") return json({ error: "method not allowed; POST a JSON body" }, 405);

  // 2. The body. R2b-8: a malformed one is the caller's mistake and must not cost a run row —
  //    the old code swallowed the parse error and opened a 'manual' run for a bad request.
  let parsed: unknown = null;
  const raw = await req.text();
  if (raw.trim() !== "") {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return json({ error: "request body must be JSON" }, 400);
    }
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return json({ error: "request body must be a JSON object" }, 400);
    }
  }
  const given = (parsed as { run_id?: unknown } | null)?.run_id;
  if (given !== undefined && given !== null && (typeof given !== "number" || !Number.isFinite(given))) {
    return json({ error: "run_id must be a number" }, 400);
  }

  let runId: number;
  try {
    runId = typeof given === "number" ? given : await openRun();
  } catch (cause) {
    console.error("calendar-push: could not open a push run:", String(cause));
    return json({ error: `could not open a push run: ${cause}` }, 500);
  }

  try {
    // 3. Configuration. No calendar id, or the switch off, and the run stops here saying so.
    const { data: settings, error: settingsError } = await supabase
      .from("app_settings").select("gcal_enabled, gcal_calendar_id, web_base_url")
      .eq("id", true).single();
    if (settingsError) throw new Error(`app_settings: ${settingsError.message}`);

    if (!settings?.gcal_enabled) {
      return await abortRun(runId, "gcal_enabled is false; nothing was pushed");
    }
    const calendarId = String(settings.gcal_calendar_id ?? "");
    if (!calendarId || calendarId === "primary") {
      return await abortRun(
        runId,
        "app_settings.gcal_calendar_id is not set to a dedicated calendar; refusing to push",
      );
    }

    // 4. An access token. A revoked refresh token is the one failure with a fixed remedy, so it
    //    gets the remedy as its error text rather than Google's opaque code.
    const token = await exchangeRefreshToken(
      secrets.google_client_id ?? "",
      secrets.google_client_secret ?? "",
      secrets.google_refresh_token ?? "",
    );
    if (!token.accessToken) {
      return await abortRun(
        runId,
        token.invalidGrant
          ? "refresh token revoked or expired; re-run scripts/google-consent.mjs"
          : `google token exchange failed: ${token.error}`,
      );
    }

    // 5. The two sides of the diff, read page by page (R2-1); a side that cannot be read
    //    completely throws before any Google call and the run is recorded as failed below.
    const result = await readAndRunPush({
      calendarId,
      webBaseUrl: String(settings.web_base_url ?? DEFAULT_WEB_BASE_URL),
      readDesiredPage,
      readMirrorPage,
      google: createGoogleCalendar(token.accessToken),
      store: mirrorStore(),
    });

    await finish(
      runId,
      result.status,
      result.counts,
      result.errors.length ? result.errors.slice(0, MAX_REPORTED_ERRORS).join(" | ") : null,
    );
    return json({ run_id: runId, status: result.status, counts: result.counts });
  } catch (cause) {
    const message = `calendar push failed: ${cause}`;
    console.error("calendar-push:", message);
    try {
      await finish(runId, "failed", {}, message);
    } catch (second) {
      // R2b-8: if this write fails too, the run row stays 'running' until the reaper takes it,
      // and only this line explains why.
      console.error(`calendar-push: could not record run ${runId} as failed:`, String(second));
    }
    return json({ run_id: runId, status: "failed", error: message }, 500);
  }
});

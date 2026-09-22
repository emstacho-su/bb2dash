#!/usr/bin/env node
// bb2dash :: scripts/google-consent.mjs
// The one-time Google consent Stack runs on his own machine, once, by hand.
// Phase 11 (docs/planning/sprint-1-hub/briefs/69_PHASE11_planner.md, "One-time setup Stack does himself", step 4).
//
//   $env:GOOGLE_CLIENT_ID = '...'; $env:GOOGLE_CLIENT_SECRET = '...'
//   $env:GCAL_CALENDAR_ID = '...@group.calendar.google.com'
//   $env:BB2DASH_SERVICE_KEY = '<service role key>'
//   node scripts/google-consent.mjs
//
// It opens a browser, takes the consent code back on a loopback port, exchanges it for a
// refresh token, and writes four secrets into Supabase Vault through the calendar_secret_set
// RPC (migration 064) plus the calendar id into app_settings. It prints exactly one line:
//
//   stored 4 secrets
//
// Clear the four environment variables afterwards.
//
// WHY A SCRIPT AND NOT A PAGE. The refresh token must never be in a browser bundle, in the
// repo, in a chat, or in a Vercel build log. It exists for about two seconds in this process
// and then only inside Vault. The service key that writes it comes from the environment, is
// never echoed, and never reaches stdout even on failure.
//
// WHY access_type=offline AND prompt=consent. Without offline Google returns only an access
// token, good for an hour. Without prompt=consent a SECOND run against an account that has
// already granted the scope returns no refresh token at all, and the script would look like it
// worked while storing nothing usable. Both are required, every time.
//
// PKCE (S256) and a random `state`: the redirect lands on a plain HTTP loopback port that any
// other local process could also have raced for. PKCE makes a stolen code worthless without the
// verifier this process holds in memory, and `state` refuses a callback this process did not
// start.
//
// Node 22+, no dependencies. Everything above main() is pure and unit-tested by
// scripts/google-consent.test.mjs; the flow itself is never run in CI and never by an agent.

import { createServer } from "node:http";
import { createHash, randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

export const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
export const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

/**
 * The narrowest scope that can write events. Full `calendar` would also let this grant create
 * and delete calendars, which is why Stack makes the bb2dash calendar by hand in setup step 3.
 */
export const SCOPE = "https://www.googleapis.com/auth/calendar.events";

/** Exactly the four names migration 064's calendar_secret_set will accept. */
export const SECRET_NAMES = Object.freeze([
  "google_client_id",
  "google_client_secret",
  "google_refresh_token",
  "calendar_push_secret",
]);

export const DEFAULT_SUPABASE_URL = "https://goultdzqcavefcgnifdy.supabase.co";

const CONSENT_TIMEOUT_MS = 5 * 60 * 1000;

const DONE_PAGE = `<!doctype html><meta charset="utf-8">
<title>bb2dash</title>
<body style="font:16px system-ui;padding:3rem">
<p>bb2dash has the grant. You can close this tab.</p>`;

// ---------------------------------------------------------------------------------------------
// Pure parts
// ---------------------------------------------------------------------------------------------

export function base64url(buffer) {
  return Buffer.from(buffer).toString("base64")
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** A PKCE verifier and its S256 challenge. The verifier never leaves this process. */
export function pkcePair(verifier = base64url(randomBytes(32))) {
  return { verifier, challenge: base64url(createHash("sha256").update(verifier).digest()) };
}

/** The shared secret calendar_push_tick puts in x-push-secret. 256 bits, url-safe. */
export function newPushSecret() {
  return base64url(randomBytes(32));
}

export function buildAuthUrl({ clientId, redirectUri, state, codeChallenge }) {
  const url = new URL(AUTH_ENDPOINT);
  url.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPE,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "false",
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  }).toString();
  return url.toString();
}

export function buildTokenForm({ clientId, clientSecret, code, redirectUri, codeVerifier }) {
  return new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    code_verifier: codeVerifier,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });
}

/** Reads the environment and says precisely what is missing, naming no values. */
export function readEnv(env = process.env) {
  const required = [
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
    "GCAL_CALENDAR_ID",
    "BB2DASH_SERVICE_KEY",
  ];
  const missing = required.filter((name) => !String(env[name] ?? "").trim());
  if (missing.length) {
    throw new Error(`set these environment variables first: ${missing.join(", ")}`);
  }
  const calendarId = String(env.GCAL_CALENDAR_ID).trim();
  if (calendarId === "primary") {
    throw new Error("GCAL_CALENDAR_ID must be the dedicated bb2dash calendar, never 'primary'");
  }
  return {
    clientId: String(env.GOOGLE_CLIENT_ID).trim(),
    clientSecret: String(env.GOOGLE_CLIENT_SECRET).trim(),
    calendarId,
    serviceKey: String(env.BB2DASH_SERVICE_KEY).trim(),
    supabaseUrl: String(env.SUPABASE_URL ?? DEFAULT_SUPABASE_URL).trim().replace(/\/+$/, ""),
  };
}

// ---------------------------------------------------------------------------------------------
// Side-effecting parts
// ---------------------------------------------------------------------------------------------

/**
 * Best effort. The URL also goes to stderr, so a shell with no browser can finish by hand.
 * On Windows the URL is handed to explorer.exe, never to `cmd /c start`: cmd treats every `&`
 * in the query string as a command separator, so Google received only `client_id=…` and
 * answered "Required parameter is missing: response_type" (seen live, 2026-09-15).
 */
function openBrowser(url) {
  const [command, args] = process.platform === "win32"
    ? ["explorer.exe", [url]]
    : process.platform === "darwin"
    ? ["open", [url]]
    : ["xdg-open", [url]];
  try {
    spawn(command, args, { detached: true, stdio: "ignore" }).unref();
  } catch {
    /* the stderr line is the fallback */
  }
}

/**
 * Serve exactly one callback on an ephemeral loopback port and resolve with the code and the
 * redirect_uri it arrived on — the token exchange has to send back the identical URI. Google's
 * Desktop-app loopback flow accepts 127.0.0.1 on any port, so nothing has to be registered.
 */
function awaitConsent({ clientId, state, codeChallenge }) {
  return new Promise((resolve, reject) => {
    let redirectUri = null;

    const server = createServer((req, res) => {
      const url = new URL(req.url, "http://127.0.0.1");
      if (url.pathname !== "/") {
        res.writeHead(404).end();
        return;
      }
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(DONE_PAGE);
      clearTimeout(timer);
      server.close();

      if (url.searchParams.get("state") !== state) {
        reject(new Error("the consent callback did not carry this run's state; refused"));
      } else if (url.searchParams.get("error")) {
        reject(new Error(`google refused consent: ${url.searchParams.get("error")}`));
      } else if (!url.searchParams.get("code")) {
        reject(new Error("the consent callback carried no authorization code"));
      } else {
        resolve({ code: url.searchParams.get("code"), redirectUri });
      }
    });

    const timer = setTimeout(() => {
      server.close();
      reject(new Error("no consent within five minutes; nothing was stored"));
    }, CONSENT_TIMEOUT_MS);

    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      redirectUri = `http://127.0.0.1:${server.address().port}`;
      const authUrl = buildAuthUrl({ clientId, redirectUri, state, codeChallenge });
      process.stderr.write(`if the browser did not open, visit:\n${authUrl}\n`);
      openBrowser(authUrl);
    });
  });
}

async function exchangeCode({ clientId, clientSecret, code, redirectUri, codeVerifier }) {
  const response = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: buildTokenForm({ clientId, clientSecret, code, redirectUri, codeVerifier }).toString(),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`token exchange failed: ${payload.error ?? `HTTP ${response.status}`}`);
  }
  if (!payload.refresh_token) {
    throw new Error(
      "google returned no refresh token. Revoke bb2dash at " +
        "https://myaccount.google.com/permissions and run this again.",
    );
  }
  return payload.refresh_token;
}

/**
 * Both service-key formats work: a legacy JWT (`eyJ…`) is also sent as a Bearer token, a new
 * `sb_secret_…` key is not (the gateway rejects a non-JWT Bearer with 401 and the store step
 * would fail after Google had already granted consent - seen live, 2026-09-15).
 */
export function serviceHeaders(serviceKey) {
  return serviceKey.startsWith("eyJ")
    ? { apikey: serviceKey, authorization: `Bearer ${serviceKey}` }
    : { apikey: serviceKey };
}

async function postgrest(supabaseUrl, serviceKey, path, init) {
  const response = await fetch(`${supabaseUrl}${path}`, {
    ...init,
    headers: {
      ...serviceHeaders(serviceKey),
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  if (!response.ok) {
    // The response body can echo the request, so only the status and the path are reported.
    throw new Error(`${init.method} ${path} -> HTTP ${response.status}`);
  }
  return response;
}

async function storeSecrets(config, values) {
  for (const name of SECRET_NAMES) {
    await postgrest(config.supabaseUrl, config.serviceKey, "/rest/v1/rpc/calendar_secret_set", {
      method: "POST",
      body: JSON.stringify({ p_name: name, p_value: values[name] }),
    });
  }
}

async function storeCalendarId(config) {
  await postgrest(config.supabaseUrl, config.serviceKey, "/rest/v1/app_settings?id=eq.true", {
    method: "PATCH",
    headers: { prefer: "return=minimal" },
    body: JSON.stringify({ gcal_calendar_id: config.calendarId }),
  });
}

async function main() {
  const config = readEnv();
  const state = base64url(randomBytes(16));
  const { verifier, challenge } = pkcePair();

  const { code, redirectUri } = await awaitConsent({
    clientId: config.clientId,
    state,
    codeChallenge: challenge,
  });

  const refreshToken = await exchangeCode({
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    code,
    redirectUri,
    codeVerifier: verifier,
  });

  await storeSecrets(config, {
    google_client_id: config.clientId,
    google_client_secret: config.clientSecret,
    google_refresh_token: refreshToken,
    calendar_push_secret: newPushSecret(),
  });
  await storeCalendarId(config);

  process.stdout.write("stored 4 secrets\n");
}

// Only run when invoked directly; importing this file for its pure parts must start no server.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
  });
}

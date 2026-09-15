// bb2dash :: scripts/google-consent.test.mjs
//
//   node --test scripts/google-consent.test.mjs
//
// Covers the pure parts of the consent script — the two things a mistake in would not show up
// until Stack is standing in front of a Google error page: the authorisation URL (a missing
// access_type or prompt is a silent no-refresh-token) and the token-exchange payload. Importing
// the script must start no server and make no request; that is asserted by the fact that this
// suite finishes.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  AUTH_ENDPOINT,
  base64url,
  buildAuthUrl,
  buildTokenForm,
  newPushSecret,
  pkcePair,
  readEnv,
  SCOPE,
  SECRET_NAMES,
  TOKEN_ENDPOINT,
} from "./google-consent.mjs";

const CLIENT_ID = "1234.apps.googleusercontent.com";
const REDIRECT = "http://127.0.0.1:53421";

test("the authorisation URL asks for an offline grant and forces the consent screen", () => {
  const url = new URL(buildAuthUrl({
    clientId: CLIENT_ID,
    redirectUri: REDIRECT,
    state: "st4te",
    codeChallenge: "chal1enge",
  }));
  const q = url.searchParams;

  assert.equal(url.origin + url.pathname, AUTH_ENDPOINT);
  assert.equal(q.get("access_type"), "offline");
  assert.equal(q.get("prompt"), "consent");
  assert.equal(q.get("response_type"), "code");
  assert.equal(q.get("scope"), SCOPE);
  assert.equal(q.get("client_id"), CLIENT_ID);
  assert.equal(q.get("redirect_uri"), REDIRECT);
  assert.equal(q.get("state"), "st4te");
  assert.equal(q.get("code_challenge"), "chal1enge");
  assert.equal(q.get("code_challenge_method"), "S256");
});

test("the scope is calendar.events, not full calendar access", () => {
  assert.equal(SCOPE, "https://www.googleapis.com/auth/calendar.events");
  assert.equal(SCOPE.endsWith("/auth/calendar"), false);
});

test("the client secret never appears in the authorisation URL", () => {
  const url = buildAuthUrl({
    clientId: CLIENT_ID,
    redirectUri: REDIRECT,
    state: "s",
    codeChallenge: "c",
  });
  assert.equal(url.includes("client_secret"), false);
  assert.equal(url.includes("GOCSPX"), false);
});

test("the token exchange posts the code, the verifier and the identical redirect_uri", () => {
  const form = buildTokenForm({
    clientId: CLIENT_ID,
    clientSecret: "GOCSPX-fake",
    code: "4/0Afake",
    redirectUri: REDIRECT,
    codeVerifier: "verif1er",
  });
  assert.equal(form.get("grant_type"), "authorization_code");
  assert.equal(form.get("client_id"), CLIENT_ID);
  assert.equal(form.get("client_secret"), "GOCSPX-fake");
  assert.equal(form.get("code"), "4/0Afake");
  assert.equal(form.get("code_verifier"), "verif1er");
  assert.equal(form.get("redirect_uri"), REDIRECT);
  assert.equal(TOKEN_ENDPOINT, "https://oauth2.googleapis.com/token");
});

test("the PKCE challenge is the S256 digest of the verifier, url-safe", () => {
  // RFC 7636 appendix B's worked example.
  const { challenge } = pkcePair("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk");
  assert.equal(challenge, "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  assert.match(challenge, /^[A-Za-z0-9_-]+$/);
});

test("a fresh push secret is 256 random url-safe bits and never repeats", () => {
  const a = newPushSecret();
  const b = newPushSecret();
  assert.notEqual(a, b);
  assert.match(a, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(Buffer.from(a.replace(/-/g, "+").replace(/_/g, "/"), "base64").length, 32);
  assert.equal(base64url(Buffer.from([251, 255, 190])), "-_--");
});

test("the four secret names are exactly the ones migration 064 accepts", () => {
  assert.deepEqual([...SECRET_NAMES].sort(), [
    "calendar_push_secret",
    "google_client_id",
    "google_client_secret",
    "google_refresh_token",
  ]);
});

test("readEnv names every missing variable and refuses the primary calendar", () => {
  assert.throws(
    () => readEnv({}),
    /GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GCAL_CALENDAR_ID, BB2DASH_SERVICE_KEY/,
  );
  assert.throws(
    () =>
      readEnv({
        GOOGLE_CLIENT_ID: "a",
        GOOGLE_CLIENT_SECRET: "b",
        GCAL_CALENDAR_ID: "primary",
        BB2DASH_SERVICE_KEY: "d",
      }),
    /never 'primary'/,
  );

  const config = readEnv({
    GOOGLE_CLIENT_ID: " a ",
    GOOGLE_CLIENT_SECRET: "b",
    GCAL_CALENDAR_ID: "x@group.calendar.google.com",
    BB2DASH_SERVICE_KEY: "d",
    SUPABASE_URL: "https://example.supabase.co/",
  });
  assert.equal(config.clientId, "a");
  assert.equal(config.supabaseUrl, "https://example.supabase.co");
});

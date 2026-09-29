// bb2dash :: ingest/fetch_signed.test.mjs
//
//   node --test ingest/fetch_signed.test.mjs
//
// Covers the byte fetch that replaces the browser download event (Phase 18 task 2). The download
// event crashed the MCP browser on 2026-09-23 and the bytes had to be fetched by hand from the
// signed CDN link at the end of the bbcswebdav redirect chain; this module walks that chain itself.
//
// The decisions under test are the ones that, wrong, would either fetch nothing or fetch from
// somewhere it should not: the hop ceiling, the final-host allowlist, the three failure outcomes a
// caller must tell apart (an expired session, a file that is gone, a chain it refuses to follow)
// and the cross-device rename that a tmpfs download hits.
//
// Importing the module must run nothing: the suite finishing asserts that.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  BLACKBOARD_ORIGIN,
  MAX_HOPS,
  SIGNED_HOST_SUFFIX,
  downloadTo,
  isFollowable,
  isSignedHost,
  resolveSignedUrl,
  validateHops,
} from './fetch_signed.mjs';

const DURABLE = 'https://blackboard.syracuse.edu/bbcswebdav/pid-1-dt-content-rid-2_1/xid-3_1';
const SIGNED = `https://eu.content.blackboardcdn.com/abc/Report.pdf?X-Amz-Signature=deadbeef`;

/** A `get` double: a map of url -> {status, headers}. Records the order it was called in. */
function fakeGet(byUrl, calls = []) {
  return async (url) => {
    calls.push(url);
    const answer = byUrl[url];
    if (!answer) throw new Error(`unexpected get: ${url}`);
    return answer;
  };
}

const redirect = (to) => ({ status: 302, headers: { location: to } });
const ok = () => ({ status: 200, headers: {} });

test('isSignedHost accepts the CDN suffix and nothing else', () => {
  assert.equal(isSignedHost(SIGNED), true);
  assert.equal(isSignedHost('https://content.blackboardcdn.com/x'), true);
  assert.equal(isSignedHost('https://evil.com/x'), false);
  // A look-alike host that merely ends with the suffix as a substring, not a domain boundary.
  assert.equal(isSignedHost('https://notcontent.blackboardcdn.com.evil.com/x'), false);
  assert.equal(isSignedHost('not a url'), false);
});

test('SIGNED_HOST_SUFFIX and MAX_HOPS are the documented values', () => {
  assert.equal(SIGNED_HOST_SUFFIX, '.content.blackboardcdn.com');
  assert.equal(MAX_HOPS, 3);
});

test('validateHops accepts a 2-hop chain ending on the CDN', () => {
  assert.deepEqual(validateHops([DURABLE, SIGNED]), { outcome: 'ok', signedUrl: SIGNED });
});

test('validateHops accepts a 3-hop chain', () => {
  const mid = 'https://blackboard.syracuse.edu/webapps/blackboard/redirect';
  assert.deepEqual(validateHops([DURABLE, mid, SIGNED]), { outcome: 'ok', signedUrl: SIGNED });
});

test('validateHops refuses a 4th hop', () => {
  const chain = [DURABLE, 'https://a.syr.edu/1', 'https://b.syr.edu/2', SIGNED];
  const got = validateHops(chain);
  assert.equal(got.outcome, 'refused');
  assert.match(got.reason, /hop/i);
});

test('validateHops refuses a final host outside the CDN suffix', () => {
  const got = validateHops([DURABLE, 'https://files.example.com/Report.pdf']);
  assert.equal(got.outcome, 'refused');
  assert.match(got.reason, /host/i);
});

test('validateHops refuses an empty or single-hop chain', () => {
  assert.equal(validateHops([]).outcome, 'refused');
  assert.equal(validateHops([DURABLE]).outcome, 'refused');
});

test('resolveSignedUrl walks a 2-hop chain one hop at a time', async () => {
  const calls = [];
  const get = fakeGet({ [DURABLE]: redirect(SIGNED), [SIGNED]: ok() }, calls);
  const got = await resolveSignedUrl(get, DURABLE);
  assert.deepEqual(got, { outcome: 'ok', signedUrl: SIGNED, hops: [DURABLE, SIGNED] });
  // One hop at a time: the durable URL is asked for first, and the signed URL is never re-fetched
  // by the resolver (downloadTo fetches the bytes).
  assert.deepEqual(calls, [DURABLE]);
});

test('resolveSignedUrl reports session_expired on a 401 or 403 at the first hop', async () => {
  for (const status of [401, 403]) {
    const get = fakeGet({ [DURABLE]: { status, headers: {} } });
    const got = await resolveSignedUrl(get, DURABLE);
    assert.equal(got.outcome, 'session_expired', `status ${status}`);
  }
});

test('resolveSignedUrl reports gone on a 404', async () => {
  const get = fakeGet({ [DURABLE]: { status: 404, headers: {} } });
  const got = await resolveSignedUrl(get, DURABLE);
  assert.equal(got.outcome, 'gone');
});

test('resolveSignedUrl refuses a chain that never reaches the CDN', async () => {
  const a = 'https://blackboard.syracuse.edu/1';
  const b = 'https://blackboard.syracuse.edu/2';
  const c = 'https://blackboard.syracuse.edu/3';
  const get = fakeGet({ [DURABLE]: redirect(a), [a]: redirect(b), [b]: redirect(c) });
  const got = await resolveSignedUrl(get, DURABLE);
  assert.equal(got.outcome, 'refused');
});

test('resolveSignedUrl resolves a relative Location against the hop it came from', async () => {
  const rel = '/bbcswebdav/next';
  const abs = 'https://blackboard.syracuse.edu/bbcswebdav/next';
  const get = fakeGet({ [DURABLE]: redirect(rel), [abs]: redirect(SIGNED) });
  const got = await resolveSignedUrl(get, DURABLE);
  assert.equal(got.outcome, 'ok');
  assert.deepEqual(got.hops, [DURABLE, abs, SIGNED]);
});

test('resolveSignedUrl treats a 200 before the CDN as refused, not ok', async () => {
  // Blackboard answering the durable URL with an HTML login page is a 200 that is not the file.
  const get = fakeGet({ [DURABLE]: ok() });
  const got = await resolveSignedUrl(get, DURABLE);
  assert.equal(got.outcome, 'refused');
});

test('downloadTo writes through a temp file and renames into place', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bb2dash-fetch-'));
  const dest = path.join(dir, 'out.pdf');
  const body = Buffer.from('%PDF-1.7 hello');
  const fetchImpl = async () => ({ ok: true, status: 200, arrayBuffer: async () => body });
  const got = await downloadTo(fetchImpl, SIGNED, dest);
  assert.equal(got.outcome, 'ok');
  assert.equal(got.bytes, body.length);
  assert.deepEqual(fs.readFileSync(dest), body);
  // No temp file is left behind.
  assert.deepEqual(fs.readdirSync(dir), ['out.pdf']);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('downloadTo falls back to copy-then-unlink when rename raises EXDEV', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bb2dash-fetch-'));
  const dest = path.join(dir, 'out.pdf');
  const body = Buffer.from('%PDF-1.7 across devices');
  const fetchImpl = async () => ({ ok: true, status: 200, arrayBuffer: async () => body });
  const realRename = fs.renameSync;
  let raised = false;
  fs.renameSync = () => { raised = true; const e = new Error('cross-device link'); e.code = 'EXDEV'; throw e; };
  try {
    const got = await downloadTo(fetchImpl, SIGNED, dest);
    assert.equal(raised, true);
    assert.equal(got.outcome, 'ok');
    assert.deepEqual(fs.readFileSync(dest), body);
    assert.deepEqual(fs.readdirSync(dir), ['out.pdf']);
  } finally {
    fs.renameSync = realRename;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('downloadTo calls a CDN 401/403 an expired signature, not a dead session', async () => {
  // The signed URL carries no cookie, so the CDN refusing it says nothing about Blackboard. Calling
  // it session_expired would abort the whole run on a stale signature.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bb2dash-fetch-'));
  const dest = path.join(dir, 'out.pdf');
  for (const [status, outcome] of [[401, 'refused'], [403, 'refused'], [404, 'gone']]) {
    const fetchImpl = async () => ({ ok: false, status, arrayBuffer: async () => Buffer.alloc(0) });
    const got = await downloadTo(fetchImpl, SIGNED, dest);
    assert.equal(got.outcome, outcome, `status ${status}`);
  }
  assert.deepEqual(fs.readdirSync(dir), []);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('downloadTo refuses a url outside the CDN suffix without fetching', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bb2dash-fetch-'));
  const dest = path.join(dir, 'out.pdf');
  let called = false;
  const fetchImpl = async () => { called = true; throw new Error('should not be called'); };
  const got = await downloadTo(fetchImpl, 'https://evil.com/x.pdf', dest);
  assert.equal(got.outcome, 'refused');
  assert.equal(called, false);
  assert.deepEqual(fs.readdirSync(dir), []);
  fs.rmSync(dir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------------------------
// The walk is gated, not just its endpoint (security review, finding 1).
//
// Every hop is fetched by Playwright's request context, which carries the logged-in profile's
// cookies. The final-host check alone did not stop the walk from being pointed at an arbitrary
// origin: `source_url` comes from `data-bbfile` attributes in course content, and the crawler's
// durableUrl falls back to any URL string when no bbcswebdav pattern matches. So a course-content
// author could aim a credentialed GET at localhost or any internal host and read the outcome back
// as a status oracle. Nothing is fetched now unless its origin is allowed.
// ---------------------------------------------------------------------------------------------

test('isFollowable allows Blackboard and the CDN over https, and nothing else', () => {
  assert.equal(isFollowable(DURABLE), true);
  assert.equal(isFollowable(SIGNED), true);
  assert.equal(isFollowable('https://blackboard.syracuse.edu/webapps/x'), true);
  assert.equal(isFollowable('http://blackboard.syracuse.edu/webapps/x'), false, 'cleartext is refused');
  assert.equal(isFollowable('https://evil.com/x'), false);
  assert.equal(isFollowable('https://blackboard.syracuse.edu.evil.com/x'), false);
  assert.equal(isFollowable('not a url'), false);
});

test('isFollowable refuses loopback, private and link-local hosts outright', () => {
  for (const u of [
    'http://127.0.0.1:8080/admin',
    'https://127.0.0.1/admin',
    'https://localhost/admin',
    'https://10.0.0.5/x',
    'https://192.168.1.1/x',
    'https://172.16.0.1/x',
    'https://169.254.169.254/latest/meta-data/',
    'https://[::1]/x',
  ]) {
    assert.equal(isFollowable(u), false, u);
  }
});

test('BLACKBOARD_ORIGIN is the institution host the walk starts from', () => {
  assert.equal(BLACKBOARD_ORIGIN, 'blackboard.syracuse.edu');
});

test('resolveSignedUrl refuses a starting URL off Blackboard without fetching it', async () => {
  let called = false;
  const get = async () => { called = true; throw new Error('should not be called'); };
  const got = await resolveSignedUrl(get, 'http://127.0.0.1:8080/admin/shutdown');
  assert.equal(got.outcome, 'refused');
  assert.match(got.reason, /not followable|origin/i);
  assert.equal(called, false, 'no credentialed request is issued at all');
});

test('resolveSignedUrl refuses a redirect to an off-origin host and never fetches it', async () => {
  const calls = [];
  const evil = 'https://evil.com/collect';
  const get = fakeGet({ [DURABLE]: redirect(evil) }, calls);
  const got = await resolveSignedUrl(get, DURABLE);
  assert.equal(got.outcome, 'refused');
  assert.deepEqual(calls, [DURABLE], 'the off-origin hop is never requested');
});

test('resolveSignedUrl refuses a redirect to loopback', async () => {
  const calls = [];
  const get = fakeGet({ [DURABLE]: redirect('http://127.0.0.1:9000/x') }, calls);
  const got = await resolveSignedUrl(get, DURABLE);
  assert.equal(got.outcome, 'refused');
  assert.deepEqual(calls, [DURABLE]);
});

test('downloadTo refuses a cleartext CDN url', async () => {
  const fetchImpl = async () => { throw new Error('should not be called'); };
  const got = await downloadTo(fetchImpl, 'http://eu.content.blackboardcdn.com/x.pdf', '/tmp/x.pdf');
  assert.equal(got.outcome, 'refused');
});

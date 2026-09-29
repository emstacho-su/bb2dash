// bb2dash :: ingest/embed_corpus.test.mjs
//
//   node --test ingest/embed_corpus.test.mjs
//
// Covers the loop that replaces the hand-run embed calls at the end of a file pull. The edge
// function embeds a bounded number of parts per invocation (the runtime kills it around 8-9), so
// finishing a corpus has always meant calling it again and again by hand and reading
// `remaining_parts` each time. The decisions under test are the ones that, wrong, would either
// stop early and leave text unsearchable, or loop forever: the stop condition, the retry rule for
// the two transient statuses, the call budget, and the key check — `embed-corpus` runs with
// `verify_jwt` on and needs the legacy anon JWT, so a publishable key must be refused loudly
// rather than producing a wall of 401s.
//
// Importing the module must run nothing: the suite finishing asserts that.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_BUDGET,
  DEFAULT_MAX_PARTS,
  assertUsableJwt,
  runEmbedLoop,
} from './embed_corpus.mjs';

const JWT = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.body.sig';

/** A `post` double driven by a queue of answers; records every body it was sent. */
function fakePost(answers, sent = []) {
  let i = 0;
  return async (body) => {
    sent.push(body);
    const a = answers[Math.min(i, answers.length - 1)];
    i++;
    if (typeof a === 'function') return a();
    return a;
  };
}

const okAnswer = (over = {}) => ({
  status: 200,
  body: { processed_units: 1, inserted_rows: 1, failed: [], remaining_parts: 0, missing_parts_before: 0, ...over },
});

test('the documented defaults', () => {
  assert.equal(DEFAULT_MAX_PARTS, 3);
  assert.equal(DEFAULT_BUDGET, 60);
});

test('assertUsableJwt refuses a publishable key and accepts a JWT', () => {
  assert.throws(() => assertUsableJwt('sb_publishable_DCtdYptOILBVKsKv'), /publishable/i);
  assert.throws(() => assertUsableJwt(''), /not set/i);
  assert.throws(() => assertUsableJwt(undefined), /not set/i);
  assert.equal(assertUsableJwt(JWT), JWT);
});

test('runEmbedLoop stops as soon as remaining_parts reaches 0', async () => {
  const sent = [];
  const post = fakePost([
    okAnswer({ remaining_parts: 5 }),
    okAnswer({ remaining_parts: 2 }),
    okAnswer({ remaining_parts: 0 }),
    okAnswer({ remaining_parts: 0 }),
  ], sent);
  const got = await runEmbedLoop({ post });
  assert.equal(got.exitCode, 0);
  assert.equal(got.calls, 3);
  assert.equal(got.remainingParts, 0);
  assert.equal(sent.length, 3);
});

test('runEmbedLoop sends max_parts on every call and never dry_run by default', async () => {
  const sent = [];
  const post = fakePost([okAnswer()], sent);
  await runEmbedLoop({ post, maxParts: 4 });
  assert.equal(sent[0].max_parts, 4);
  assert.notEqual(sent[0].dry_run, true);
});

test('runEmbedLoop retries a 546 and a 503 and still finishes', async () => {
  const sent = [];
  const post = fakePost([
    { status: 546, body: { error: 'WORKER_RESOURCE_LIMIT' } },
    { status: 503, body: { error: 'unavailable' } },
    okAnswer({ remaining_parts: 0 }),
  ], sent);
  const got = await runEmbedLoop({ post, sleep: async () => {} });
  assert.equal(got.exitCode, 0);
  assert.equal(got.calls, 3);
  assert.equal(got.retries, 2);
});

test('runEmbedLoop gives up when the call budget is exhausted, with exit 1', async () => {
  const post = fakePost([okAnswer({ remaining_parts: 9 })]);
  const got = await runEmbedLoop({ post, budget: 4, sleep: async () => {} });
  assert.equal(got.exitCode, 1);
  assert.equal(got.calls, 4);
  assert.match(got.error, /budget/i);
});

test('runEmbedLoop exits 1 on a non-empty failed list and stops calling', async () => {
  const sent = [];
  const post = fakePost([
    okAnswer({ remaining_parts: 3, failed: [{ text_id: 12, error: 'boom' }] }),
    okAnswer({ remaining_parts: 0 }),
  ], sent);
  const got = await runEmbedLoop({ post, sleep: async () => {} });
  assert.equal(got.exitCode, 1);
  assert.equal(got.calls, 1);
  assert.match(got.error, /12/);
});

test('runEmbedLoop exits 1 on an unexpected status without retrying it', async () => {
  const post = fakePost([{ status: 401, body: { message: 'Invalid JWT' } }]);
  const got = await runEmbedLoop({ post, sleep: async () => {} });
  assert.equal(got.exitCode, 1);
  assert.equal(got.calls, 1);
  assert.match(got.error, /401/);
});

test('check mode sends dry_run, makes exactly one call, and reports the count', async () => {
  const sent = [];
  const post = fakePost([okAnswer({ missing_parts_before: 0, remaining_parts: 0 })], sent);
  const got = await runEmbedLoop({ post, check: true });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].dry_run, true);
  assert.equal(got.exitCode, 0);
  assert.equal(got.missingPartsBefore, 0);
  assert.equal(got.line, 'missing_parts_before=0');
});

test('check mode exits 1 when parts are still missing', async () => {
  const post = fakePost([okAnswer({ missing_parts_before: 7 })]);
  const got = await runEmbedLoop({ post, check: true });
  assert.equal(got.exitCode, 1);
  assert.equal(got.missingPartsBefore, 7);
  assert.equal(got.line, 'missing_parts_before=7');
});

test('runEmbedLoop makes no call at all when there is nothing to embed', async () => {
  const sent = [];
  const post = fakePost([okAnswer({ remaining_parts: 0 })], sent);
  const got = await runEmbedLoop({ post, knownRemaining: 0 });
  assert.equal(got.calls, 0);
  assert.equal(got.exitCode, 0);
  assert.equal(sent.length, 0);
});

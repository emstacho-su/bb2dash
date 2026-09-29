// node --test scripts/bb-probe.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { xsrfFromCookie, keyNames, redact, buildProbes, bbRouterClock } from './bb-probe.mjs';

test('xsrfFromCookie reads the token BbRouter embeds and returns null otherwise', () => {
  const c = 'JSESSIONID=abc; BbRouter=expires:1759200000,id:9F1,signature:zzz,site:abc,timeout:10800,user:_21025199_1,v:2,xsrf:3f2a1c0e-8b7d-4e6f-9a1b-2c3d4e5f6a7b; other=1';
  assert.equal(xsrfFromCookie(c), '3f2a1c0e-8b7d-4e6f-9a1b-2c3d4e5f6a7b');
  assert.equal(xsrfFromCookie('JSESSIONID=abc'), null);
  assert.equal(xsrfFromCookie(undefined), null);
});

test('keyNames lists top-level keys and results[0] keys, never values', () => {
  assert.deepEqual(keyNames({ results: [{ id: 1, name: 'x' }], paging: {} }), { top: ['paging', 'results'], first: ['id', 'name'] });
  assert.deepEqual(keyNames([{ b: 1, a: 2 }]), { top: ['[array]'], first: ['a', 'b'] });
  assert.deepEqual(keyNames(null), { top: [], first: [] });
});

test('redact replaces every secret occurrence and ignores short strings', () => {
  const s = 'Cookie: BbRouter=SECRETVALUE123; x=1 SECRETVALUE123';
  assert.equal(redact(s, ['SECRETVALUE123', 'ab']), 'Cookie: BbRouter=<redacted>; x=1 <redacted>');
});

test('bbRouterClock reads expires and timeout as numbers only', () => {
  const now = 1759200000 * 1000;
  const c = 'BbRouter=expires:1759203600,id:9F1,timeout:10800,user:_1_1,xsrf:abc';
  assert.deepEqual(bbRouterClock(c, now), { expiresInSec: 3600, timeoutSec: 10800 });
  assert.deepEqual(bbRouterClock('JSESSIONID=x', now), { expiresInSec: null, timeoutSec: null });
});

test('buildProbes skips rows that need ids that are missing', () => {
  const none = buildProbes({ userId: null, courseId: null }).map((r) => r.id);
  assert.deepEqual(none, ['pub-me', 'pub-courses', 'v1-session-clock', 'v1-calendars', 'v1-calendarItems']);
  const all = buildProbes({ userId: '_1_1', courseId: '_2_1' });
  assert.equal(all.length, 15);
  assert.ok(all.every((r) => !r.path.includes('null')));
});

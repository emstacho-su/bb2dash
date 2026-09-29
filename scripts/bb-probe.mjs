#!/usr/bin/env node
// bb2dash :: scripts/bb-probe.mjs
// Sprint 3 research, live probe (docs/planning/sprint-3-blackboard-mcp/107_SPRINT3_INTAKE.md §7 step 2).
// Stack runs this once on his laptop, signed in to Blackboard in Chrome:
//
//   DevTools → Network → any /learn/api/… request → Headers → copy the `Cookie` request header value
//   $env:BB_COOKIE = '<paste>'
//   node scripts/bb-probe.mjs            # optional: $env:BB_COURSE = '_571529_1' to pin a course
//   Remove-Item Env:BB_COOKIE
//
// WHAT IT ANSWERS. Whether the calls the crawler makes from inside a Blackboard tab also answer to
// the same session cookie sent from a plain Node process with no browser at all (route B in 107 §3),
// which of them need the X-Blackboard-XSRF header, and what an expired session looks like from
// outside (401, 302 to a login host, or an HTML 200). One row per call: status, content type,
// top-level key names, milliseconds.
//
// WHAT IT NEVER DOES. It stores no response body, prints no body, prints no header it sent, and
// redacts the cookie from any error message. The cookie exists only in the environment of this one
// process. Read-only: GET only, one request at a time, a bb2dash User-Agent, no retries.
//
// The pure helpers at the bottom are exported for scripts/bb-probe.test.mjs.

const BASE = (process.env.BB_BASE || 'https://blackboard.syracuse.edu').replace(/\/+$/, '');
const UA = 'bb2dash-probe/0.1 (+sprint 3 research; read-only)';

/** The xsrf token Blackboard embeds in the BbRouter cookie (`...,xsrf:<uuid>,...`), or null. */
export const xsrfFromCookie = (cookie) => {
  if (typeof cookie !== 'string') return null;
  const m = cookie.match(/(?:^|[;\s,])xsrf:([0-9a-f-]{8,})/i);
  return m ? m[1] : null;
};

/** Top-level key names of a parsed JSON body, plus the keys of results[0] when it is a list. */
export const keyNames = (json) => {
  if (json == null || typeof json !== 'object') return { top: [], first: [] };
  if (Array.isArray(json)) return { top: ['[array]'], first: json[0] && typeof json[0] === 'object' ? Object.keys(json[0]).sort() : [] };
  const top = Object.keys(json).sort();
  const first = Array.isArray(json.results) && json.results[0] && typeof json.results[0] === 'object' ? Object.keys(json.results[0]).sort() : [];
  return { top, first };
};

/** Replace every occurrence of a secret in a string with a fixed marker. */
export const redact = (text, secrets) => {
  let out = String(text ?? '');
  for (const s of secrets) { if (typeof s === 'string' && s.length >= 8) out = out.split(s).join('<redacted>'); }
  return out;
};

/** The probe list. Course-scoped rows are skipped until a course id is known. */
export const buildProbes = ({ userId, courseId }) => {
  const rows = [
    { id: 'pub-me', path: '/learn/api/public/v1/users/me', why: 'Task 0 baseline; login check' },
    { id: 'pub-courses', path: `/learn/api/public/v1/users/${userId || 'me'}/courses?limit=100`, why: 'public course list' },
    { id: 'v1-memberships', path: `/learn/api/v1/users/${userId}/memberships?expand=course.effectiveAvailability,course.permissions,courseRole&includeCount=true&limit=10000`, why: 'crawler 597', needs: 'userId' },
    { id: 'v1-calendars', path: '/learn/api/v1/calendars?limit=10000', why: 'crawler 598' },
    { id: 'v1-calendarItems', path: `/learn/api/v1/calendars/calendarItems?since=${enc(daysFromNow(-7))}&until=${enc(daysFromNow(60))}`, why: 'crawler 598, completion marker' },
    { id: 'v1-course', path: `/learn/api/v1/courses/${courseId}?expand=effectiveAvailability`, why: 'crawler 582', needs: 'courseId' },
    { id: 'v1-teachers', path: `/learn/api/v1/courses/${courseId}/memberships?expand=user,courseRole&limit=50&membershipAvailable=true&roleBucket=TEACHING`, why: 'crawler 583', needs: 'courseId' },
    { id: 'v1-announcements', path: `/learn/api/v1/courses/${courseId}/announcements?limit=100`, why: 'crawler 585', needs: 'courseId' },
    { id: 'v1-categories', path: `/learn/api/v1/courses/${courseId}/gradebook/categories?limit=100`, why: 'crawler 586', needs: 'courseId' },
    { id: 'v1-grades', path: `/learn/api/v1/courses/${courseId}/gradebook/grades?userId=${userId}&limit=100&sort=column.position(asc)&expand=lastAttempt,attemptsLeft,submissionStatus,column,column.restricted,canStudentViewGradeResults,column.isLateAttemptCreationDisallowed&includeNoGradeItems=true&skipExternalGrade=true&skipKnowledgeCheck=true`, why: 'crawler 498', needs: 'courseId' },
    { id: 'v1-children', path: `/learn/api/v1/courses/${courseId}/contents/ROOT/children?@view=Summary&expand=assignedGroups,selfEnrollmentGroups.group,gradebookCategory&includeInActivityTracking=true&limit=100`, why: 'crawler 486 (root)', needs: 'courseId' },
    { id: 'pub-contents', path: `/learn/api/public/v1/courses/${courseId}/contents?limit=100`, why: 'public equivalent of the tree', needs: 'courseId' },
    { id: 'pub-gradebook-me', path: `/learn/api/public/v1/courses/${courseId}/gradebook/users/${userId}?limit=100`, why: 'public equivalent of grades', needs: 'courseId' },
    { id: 'pub-announcements', path: `/learn/api/public/v1/courses/${courseId}/announcements?limit=100`, why: 'public equivalent', needs: 'courseId' },
  ];
  return rows.filter((r) => !(r.needs === 'userId' && !userId) && !(r.needs === 'courseId' && !courseId));
};

const enc = encodeURIComponent;
function daysFromNow(d) { return new Date(Date.now() + d * 86400000).toISOString(); }

async function probe(path, { cookie, xsrf, withXsrf }) {
  const headers = { Accept: 'application/json', 'User-Agent': UA, Cookie: cookie };
  if (withXsrf && xsrf) headers['X-Blackboard-XSRF'] = xsrf;
  const t0 = Date.now();
  const res = await fetch(BASE + path, { method: 'GET', headers, redirect: 'manual' });
  const ms = Date.now() - t0;
  const type = (res.headers.get('content-type') || '').split(';')[0];
  const location = res.headers.get('location');
  let keys = { top: [], first: [] }; let note = '';
  if (type.includes('json')) { try { keys = keyNames(await res.json()); } catch { note = 'unparseable json'; } }
  else if (location) { try { note = `→ ${new URL(location, BASE).host}`; } catch { note = '→ (relative)'; } }
  else if (type.includes('html')) note = 'html body (login page?)';
  return { status: res.status, type: type || '-', ms, keys, note };
}

async function main() {
  const cookie = process.env.BB_COOKIE;
  if (!cookie) { console.error('BB_COOKIE is not set. See the header of this file.'); process.exit(2); }
  const xsrf = process.env.BB_XSRF || xsrfFromCookie(cookie);
  const secrets = [cookie, xsrf].filter(Boolean);
  const out = [];
  const say = (s) => out.push(redact(s, secrets));

  say(`# bb-probe ${new Date().toISOString()} base=${BASE} xsrf=${xsrf ? 'present' : 'absent'}`);
  say('');
  say('| id | xsrf | status | type | ms | top keys | results[0] keys | note |');
  say('|---|---|---|---|---|---|---|---|');

  const row = (id, withXsrf, r) => say(`| ${id} | ${withXsrf ? 'yes' : 'no'} | ${r.status} | ${r.type} | ${r.ms} | ${r.keys.top.slice(0, 12).join(' ')} | ${r.keys.first.slice(0, 12).join(' ')} | ${r.note} |`);

  let userId = null; let courseId = process.env.BB_COURSE || null;
  try {
    const me = await fetch(BASE + '/learn/api/public/v1/users/me', { headers: { Accept: 'application/json', 'User-Agent': UA, Cookie: cookie }, redirect: 'manual' });
    if (me.status === 200 && (me.headers.get('content-type') || '').includes('json')) { const j = await me.json(); userId = typeof j.id === 'string' ? j.id : null; }
    say(`| pub-me (bootstrap) | no | ${me.status} | ${(me.headers.get('content-type') || '-').split(';')[0]} | - | ${userId ? 'id present' : 'no id'} | | |`);
  } catch (e) { say(`| pub-me (bootstrap) | no | ERR | - | - | | | ${redact(e.message, secrets)} |`); }

  if (userId && !courseId) {
    try {
      const r = await fetch(BASE + `/learn/api/v1/users/${userId}/memberships?expand=course&limit=100`, { headers: { Accept: 'application/json', 'User-Agent': UA, Cookie: cookie, ...(xsrf ? { 'X-Blackboard-XSRF': xsrf } : {}) }, redirect: 'manual' });
      if (r.status === 200) { const j = await r.json(); const first = (j.results || []).find((m) => m.course && m.course.id); courseId = first ? first.course.id : null; }
    } catch { /* courseId stays null; course rows are skipped */ }
  }

  for (const p of buildProbes({ userId, courseId })) {
    for (const withXsrf of p.path.startsWith('/learn/api/v1/') ? [true, false] : [false]) {
      try { row(p.id, withXsrf, await probe(p.path, { cookie, xsrf, withXsrf })); }
      catch (e) { say(`| ${p.id} | ${withXsrf ? 'yes' : 'no'} | ERR | - | - | | | ${redact(e.message, secrets)} |`); }
    }
  }
  say('');
  say(`userId: ${userId ? 'resolved' : 'not resolved'}; courseId: ${courseId ? 'resolved' : 'none (course rows skipped)'}`);
  process.stdout.write(out.join('\n') + '\n');
}

const isMain = Boolean(process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('/scripts/bb-probe.mjs'));
if (isMain) main().catch((e) => { console.error(redact(e && e.stack || String(e), [process.env.BB_COOKIE].filter(Boolean))); process.exit(1); });

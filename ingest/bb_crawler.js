/**
 * bb2dash :: bb_crawler.js
 *
 * Runs INSIDE a logged-in Blackboard Ultra tab (built-in Claude browser or devtools console).
 * Uses the same internal JSON endpoints the Ultra UI calls (/learn/api/v1/...), authorized by the
 * session cookie. Posts raw payloads to the Supabase landing table `bb_raw` with the anon key
 * (insert-only policy), so nothing round-trips through chat.
 *
 * Usage (in page context):
 *   const bb = installCrawler({ userId: '_21025199_1', supabaseUrl, anonKey });
 *   await bb.runAll();                 // crawls every current-term course + calendar, posts to bb_raw
 *   await bb.crawl('_571529_1');       // one course, returns the payload
 *
 * Notes
 *  - Relative URLs fail from the Claude browser's exec context; always use absolute.
 *  - Navigating the tab wipes window state; extract/post before navigating.
 *  - Content children come back with `contentHandler: null` for folders; the real type is the key of
 *    `contentDetail`. Containers = hasChildren || type matches folder|lesson|learningmodule.
 *  - Ultra "documents" (type null) embed files as <a data-bbfile="{json}"> in body.rawText. Assessment items hide
 *    attachments under contentDetail.<asmt>.test.assessment.instructions — embedsDeep() scans every string field.
 *  - Only durable bbcswebdav URLs (…-rid-N_1/xid-N_1) survive the session; /sessions/… URLs 403 the next day.
 *  - bbcswebdav file URLs 302 to a cross-origin CDN with no CORS; bytes cannot be fetched from
 *    page JS. Catalog them (bb_files) and download manually or via the Learn public API with a token.
 *  - Public REST (/learn/api/public/v1/...) also answers with the cookie; prefer it for anything
 *    documented, fall back to /learn/api/v1 for gradebook/grades and calendarItems.
 *  - Announcements (/learn/api/v1/courses/{C}/announcements): the INTERNAL endpoint uses
 *    `createdDate` / `modifiedDate`; the PUBLIC one uses `created` / `modified`. Do not mix them.
 *    `modifiedDate` is proven against live payloads and feeds announcements.modified_at
 *    (migration 033). The creator DISPLAY NAME key is NOT verified — see the TODO on
 *    mapAnnouncement() below; the mapper tries every candidate and records the winner in
 *    `authorSource`, so one query over bb_raw settles it after the first live crawl.
 *
 * Testability: `strip`, `announcementAuthor` and `mapAnnouncement` are module-level pure functions,
 * exported under a CommonJS guard at the bottom so web/test can cover them. The guard is inert in a
 * browser tab, where this file is still pasted and run as-is.
 */

// Blackboard hands back HTML in a {displayText, rawText} envelope (or a bare string). Flatten it to
// readable plain text, or null when nothing is left. Module-level so the mappers below stay pure.
const strip = (h) => { if (h == null) return null; if (typeof h === 'object') h = h.displayText || h.rawText || ''; h = String(h);
    return h.replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|h\d|tr)>/gi, '\n').replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
      .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim() || null; };

// A Blackboard user id looks like `_21025199_1`. Never show one of those as an author name.
const isBbUserId = (v) => typeof v === 'string' && /^_\d+_\d+$/.test(v);

// Pull a human name out of whatever a candidate field holds: a bare string, or a user object with
// givenName/familyName (Ultra's usual shape), displayName, name or fullName.
const personName = (v) => {
  if (v == null) return null;
  if (typeof v === 'string') return isBbUserId(v) || !v.trim() ? null : v.trim();
  if (typeof v !== 'object') return null;
  const u = v.user && typeof v.user === 'object' ? v.user : v;
  const parts = [u.givenName, u.familyName].filter((x) => typeof x === 'string' && x.trim());
  if (parts.length) return parts.join(' ').trim();
  for (const k of ['displayName', 'name', 'fullName', 'userName']) {
    if (typeof u[k] === 'string' && u[k].trim() && !isBbUserId(u[k])) return u[k].trim();
  }
  return null;
};

// TODO(verify on a live payload): the exact creator key of the INTERNAL announcements endpoint is
// unconfirmed. No Blackboard session was available when this was written, and the endpoint is not in
// Anthology's published REST schema (the PUBLIC schema exposes `creator` as a bare user id, not a
// name). Candidates, in the order tried below. mapAnnouncement records the winning key in
// `authorSource`, so after the first live crawl `select payload->'announcements' from bb_raw` names
// the true key and this list can be cut to it. Until then an unknown shape yields author: null —
// never a guess, and never a raw user id.
const AUTHOR_KEYS = ['creator', 'createdBy', 'author', 'createdByUser', 'creatorFullName', 'postedBy', 'userName'];

/** The creator display name of one announcement, plus which key supplied it. */
const announcementAuthor = (a) => {
  if (a == null || typeof a !== 'object') return { author: null, authorSource: null };
  for (const key of AUTHOR_KEYS) {
    const name = personName(a[key]);
    if (name) return { author: name, authorSource: key };
  }
  return { author: null, authorSource: null };
};

/**
 * One raw announcement -> the shape stage_announcements reads (migration 033). Pure: no fetch, no
 * session, no globals. `modified` feeds announcements.modified_at and `author` feeds
 * announcements.author; `isRead` keeps mirroring Blackboard's own read state.
 */
const mapAnnouncement = (a) => {
  const { author, authorSource } = announcementAuthor(a);
  return {
    id: a.id,
    title: a.title,
    created: a.createdDate,
    modified: a.modifiedDate,
    start: a.startDateRestriction,
    isRead: a.readStatus?.isRead ?? null,
    author,
    authorSource,
    body: strip(a.body)?.slice(0, 4000),
  };
};

function installCrawler({ userId, supabaseUrl, anonKey, base = 'https://blackboard.syracuse.edu' }) {
  const j = async (u) => { const r = await fetch(base + u, { credentials: 'include' }); if (!r.ok) return { __status: r.status }; return r.json(); };
  const pageAll = async (u) => { let out = [], off = 0; for (;;) { const r = await j(u + (u.includes('?') ? '&' : '?') + `offset=${off}`); if (r.__status) return { error: r.__status, results: out }; out = out.concat(r.results || []); if (!r.paging || !r.paging.nextPage || !(r.results || []).length || off > 5000) break; off += r.results.length; } return { results: out }; };
  const typeOf = (c) => c.contentHandler?.id || Object.keys(c.contentDetail || {})[0] || null;
  const isContainer = (c) => c.hasChildren || /folder|lesson|learningmodule/i.test(typeOf(c) || '');
  // Prefer durable bbcswebdav URLs (pid-…-dt-…-rid-N_1/xid-N_1). Session-scoped /sessions/<id>/... URLs 403 once the
  // session ends, so a catalog built from them is useless the next day.
  const durableUrl = (o) => { const cands = [o.resourceUrl, o.viewerUrl ? o.viewerUrl.split('?')[0] : null, o.permanentUrl, o.href].filter(Boolean);
    return cands.find(u => /bbcswebdav\/pid-.*-rid-\d+_\d+\/xid-\d+_\d+/.test(u)) || cands.find(u => !/\/sessions\//.test(u)) || cands[0] || null; };
  const parseBbfile = (html, out) => { const re = /data-bbfile="([^"]+)"/g; let m; while ((m = re.exec(html || ''))) { try { const o = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#39;/g, "'"));
      const url = durableUrl(o); if (url && !out.some(f => f.url === url)) out.push({ name: o.displayName || o.linkName || o.fileName || null, url, mime: o.mimeType || null, sessionScoped: /\/sessions\//.test(url) }); } catch (_) {} } return out; };
  const embeddedFiles = (html) => parseBbfile(html, []);
  // Deep scan: attachments to assessment items (tests, assignments) live under
  // contentDetail['resource/x-bb-asmt-test-link'].test.assessment.instructions, not body — so walk EVERY string
  // field of the full item and collect every data-bbfile embed. Lesson from the 9/8 validation (IST 471, IST 323).
  const embedsDeep = (item) => { const out = []; const seen = new Set(); const rec = (v, d) => { if (v == null || d > 12) return;
      if (typeof v === 'string') { if (v.includes('data-bbfile')) parseBbfile(v, out); return; }
      if (typeof v === 'object') { if (seen.has(v)) return; seen.add(v); for (const k of Object.keys(v)) rec(v[k], d + 1); } };
    rec(item, 0);
    // The same attachment usually appears twice (a durable embed in the instructions and a session-scoped one in the
    // rendered view). Collapse by name, keeping the durable URL.
    const byName = new Map(); for (const f of out) { const k = (f.name || f.url).toLowerCase(); const prev = byName.get(k); if (!prev || (prev.sessionScoped && !f.sessionScoped)) byName.set(k, f); }
    return [...byName.values()]; };
  const slim = (c, path) => { const t = typeOf(c); const v = (c.contentDetail || {})[t] || {}; const keep = {};
    for (const f of ['url', 'fileName', 'mimeType', 'points', 'pointsPossible', 'dueDate', 'gradingType', 'isGroupAssignment', 'attemptsAllowed', 'questionsCount', 'gradebookColumnId', 'gradeColumnId', 'fileType', 'duration', 'startDate', 'endDate']) if (v[f] !== undefined) keep[f] = v[f];
    if (v.file) keep.file = { name: v.file.name || v.file.fileName, url: v.file.permanentUrl || v.file.url };
    return { id: c.id, parentId: c.parentId, path, title: c.title, type: t, position: c.position, modified: c.modifiedDate, dueDate: c.dueDate || v.dueDate || null, state: c.state,
      visibility: c.visibility?.state || c.visibility || null, hasChildren: !!c.hasChildren, startDate: c.availability?.adaptiveRelease?.start || c.startDate || null, endDate: c.availability?.adaptiveRelease?.end || c.endDate || null,
      description: strip(c.description)?.slice(0, 2000) || null, body: strip(c.body)?.slice(0, 4000) || null, embeddedFiles: embeddedFiles(c.body?.rawText), detail: Object.keys(keep).length ? keep : null,
      gradebookCategory: c.gradebookCategory?.title || null, isGroupContent: !!c.isGroupContent }; };
  const walk = async (C) => { const items = []; const stack = [{ id: 'ROOT', path: '' }]; let guard = 0;
    while (stack.length && guard++ < 1000) { const { id, path } = stack.shift();
      const r = await pageAll(`/learn/api/v1/courses/${C}/contents/${id}/children?@view=Summary&expand=assignedGroups,selfEnrollmentGroups.group,gradebookCategory&includeInActivityTracking=true&limit=100`);
      for (const c of (r.results || [])) { const p = path ? path + ' / ' + c.title : c.title; const s = slim(c, p);
        // Fetch the full item for documents (type null) AND for anything that could carry attachments in a nested
        // instruction body (assessments/assignments). Cheap: one GET per item.
        if (s.type === null || /asmt|assignment|test|survey/i.test(s.type || '')) { const full = await j(`/learn/api/v1/courses/${C}/contents/${c.id}`); if (!full.__status) { if (s.type === null) s.body = strip(full.body)?.slice(0, 12000) || null; s.embeddedFiles = embedsDeep(full); } }
        items.push(s); if (isContainer(c)) stack.push({ id: c.id, path: p }); } }
    return items; };
  const grades = async (C) => { const g0 = await pageAll(`/learn/api/v1/courses/${C}/gradebook/grades?userId=${userId}&limit=100&sort=column.position(asc)&expand=lastAttempt,attemptsLeft,submissionStatus,column,column.restricted,canStudentViewGradeResults,column.isLateAttemptCreationDisallowed&includeNoGradeItems=true&skipExternalGrade=true&skipKnowledgeCheck=true`);
    return (g0.results || []).map(g => ({ columnId: g.columnId, name: g.column?.columnName, description: strip(g.column?.description)?.slice(0, 500) || null, contentId: g.column?.contentId || null, categoryId: g.column?.gradebookCategoryId || null,
      possible: g.column?.possible ?? null, due: g.column?.dueDate || null, calc: g.column?.calculationType || null, formula: g.column?.calculatedFormula || null, aggregation: g.column?.aggregationModel || null, isCalc: !!g.isCalculatedColumnGrade,
      visible: g.column?.visible, gradesReleased: g.column?.gradesReleased, multipleAttempts: g.column?.multipleAttempts, position: g.column?.position, effectiveScore: g.effectiveScore ?? null, manualScore: g.manualScore ?? null, score: g.score ?? null,
      displayGrade: g.displayGrade ?? null, isExempt: !!g.isExempt, feedback: strip(g.instructorFeedback)?.slice(0, 1000) || null, submissionStatus: g.submissionStatus?.status || null, attemptsLeft: g.attemptsLeft ?? null,
      lastAttempt: g.lastAttempt ? { status: g.lastAttempt.status, created: g.lastAttempt.createdDate, submitted: g.lastAttempt.submittedDate || g.lastAttempt.attemptDate || null, score: g.lastAttempt.score ?? null } : null })); };
  const crawl = async (C) => {
    const detail = await j(`/learn/api/v1/courses/${C}?expand=effectiveAvailability`);
    const teach = await j(`/learn/api/v1/courses/${C}/memberships?expand=user,courseRole&limit=50&membershipAvailable=true&roleBucket=TEACHING`);
    const sched = await j(`/learn/api/v1/courses/${C}/schedule?sort=location(desc)`);
    const ann = await pageAll(`/learn/api/v1/courses/${C}/announcements?limit=100`);
    const cats = await j(`/learn/api/v1/courses/${C}/gradebook/categories?limit=100`);
    return { course: { id: C, name: detail.name, courseId: detail.courseId, modified: detail.modifiedDate },
      teachers: (teach.results || []).map(t => ({ name: `${t.user?.givenName || ''} ${t.user?.familyName || ''}`.trim(), email: t.user?.emailAddress || null, role: t.courseRole?.identifier, userId: t.userId })),
      schedule: sched.results || [],
      announcements: (ann.results || []).map(mapAnnouncement),
      gradeCategories: (cats.results || []).map(c => ({ id: c.id, title: c.title, weight: c.weight ?? null })),
      gradebook: await grades(C), content: await walk(C) }; };
  const memberships = async () => { const m = await j(`/learn/api/v1/users/${userId}/memberships?expand=course.effectiveAvailability,course.permissions,courseRole&includeCount=true&limit=10000`); return (m.results || []).map(x => ({ id: x.course.id, name: x.course.name, courseId: x.course.courseId, termId: x.course.termId, termName: x.course.term?.name, uuid: x.course.uuid, role: x.role, membershipId: x.id, lastAccess: x.lastAccessDate })); };
  const calendar = async (since, until) => ({ calendars: (await j('/learn/api/v1/calendars?limit=10000')).results || [], items: (await j(`/learn/api/v1/calendars/calendarItems?since=${since}&until=${until}`)).results || [] });
  const post = async (run_id, kind, bb_course_id, payload) => fetch(`${supabaseUrl}/rest/v1/bb_raw`, { method: 'POST', headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify({ run_id, kind, bb_course_id, payload }) });
  const runAll = async ({ termName = null, since = '2026-08-01T04:00:00.000Z', until = '2027-01-15T04:00:00.000Z' } = {}) => {
    const run_id = crypto.randomUUID(); const mem = await memberships(); const mine = termName ? mem.filter(m => m.termName === termName) : mem;
    const log = [['memberships', (await post(run_id, 'memberships', null, { results: mem })).status]];
    for (const m of mine) { const p = await crawl(m.id); log.push([m.name, (await post(run_id, 'course', m.id, p)).status]); }
    log.push(['calendar', (await post(run_id, 'calendar', null, await calendar(since, until))).status]);
    return { run_id, log }; };
  // Fire every download from ONE call so the browser's permission prompt (if any) appears once, not per file.
  // Anchor clicks keep the page in place; files land in ~/Downloads under their Blackboard display names.
  const downloadAll = async (urls, gapMs = 1500) => { const sleep = (ms) => new Promise(r => setTimeout(r, ms)); let n = 0;
    for (const u of urls) { const a = document.createElement('a'); a.href = u.includes('?') ? u : u + '?xythos-download=true'; a.download = ''; a.style.display = 'none'; document.body.appendChild(a); a.click(); a.remove(); n++; await sleep(gapMs); }
    return n; };
  // Re-read the embedded files of Ultra documents (data-bbfile) — catalogs go stale when instructors re-upload.
  // Deep-scans the whole item (body + assessment instructions + any other string field), durable URLs only.
  const refreshEmbeds = async (C, contentIds) => { const out = {}; for (const id of contentIds) { const full = await j(`/learn/api/v1/courses/${C}/contents/${id}`);
      out[id] = full.__status ? { error: full.__status, files: [] } : { modified: full.modifiedDate, files: embedsDeep(full) }; } return out; };
  return { j, strip, pageAll, walk, grades, crawl, memberships, calendar, post, runAll, downloadAll, refreshEmbeds, embedsDeep, durableUrl, mapAnnouncement };
}

// Inert in a browser tab (no `module` there), so this file stays paste-and-run in the Ultra console.
// Under Node it exposes the pure mappers to the vitest suite in web/test.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { installCrawler, strip, personName, announcementAuthor, mapAnnouncement, AUTHOR_KEYS };
}

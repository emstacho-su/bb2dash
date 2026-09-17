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
 *   await bb.runAll({ termName: 'Fall 2026', runId });   // registered-first: the caller owns the run id
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
 * PHASE 10a (crawler version 3) — what changed and what is still unverified
 *  - Every `kind = 'course'` payload now carries `crawler: { version: 3 }`. It is the first
 *    versioned envelope; the stages read a missing key as version 2 (migration 050).
 *  - `attempts(C, gradebook)` probes the columns that look like they have a submission and posts
 *    the frozen shape migration 050 reads:
 *      attempts: [{ columnId, contentId, endpoint, status, results: [{ id, status, created,
 *                   modified, submitted, score, feedback, studentComments, studentSubmission,
 *                   exempt, receipt, files: [{ id, name, size, downloadUrl }], keys: [...] }] }]
 *    `status` is the HTTP status of the attempts call; a failed probe is recorded with an empty
 *    `results`, never thrown, and the crawl carries on.
 *
 * PHASE 12b (crawler version 4) — the attempts chain, now that it is known
 *  v3 asked `GET .../gradebook/columns/<col>/attempts?userId=<me>`. For a STUDENT that answers
 *  `200 {"results": []}` on every column — 21 of 21 in crawl 1b5e8da5 — so v3 catalogued nothing
 *  and `bb_attempts` / the `my_submissions` bucket stayed empty. Blackboard's own UI never calls
 *  that route. The PM read the requests the Ultra gradebook page actually makes
 *  (docs/planning/80f_ATTEMPTS_ENDPOINT.md); it walks THREE requests per column:
 *      1. `/gradebook/columns/<col>/grades?expand=attemptsLeft&userId=<me>`  -> the GRADE ID
 *      2. `/gradebook/columns/<col>/grades/<gradeId>/attempts`               -> the attempt rows
 *      3. `/gradebook/attempts/<attemptId>?columnId=<col>&expand=…`          -> the FILES
 *  Step 3 is the only one that carries `studentSubmissionFiles[]`, and each file's
 *  `file.permanentUrl` is an ordinary durable `bbcswebdav/xid-<n>_1` URL — the same kind bb-sync
 *  step 4 already pulls with the session cookie. v3's `downloadUrl` was BUILT, not read, and the
 *  route it built does not exist for a student.
 *  The envelope keeps v3's shape so migration 050/055 still reads it, and gains the chain:
 *      attempts: [{ columnId, contentId, endpoint, status, steps, keys: { grade, attempt, detail,
 *                   file }, grade: {…}, attempts: [{…}], detail: [{…}],
 *                   results: [{ id, status, created, modified, submitted, score, exempt, receipt,
 *                               files: [{ id, name, size, mime, uuid, downloadUrl }],
 *                               text: { studentSubmission, studentComments, instructorFeedback },
 *                               keys: [...] }] }]
 *  `results[]` is the contract the stage reads; `grade` / `attempts` / `detail` / `steps` / `keys`
 *  are the diagnosis. Bounded at the newest ATTEMPT_LIMIT (3) attempts per column, one request at
 *  a time. Every step records its own status and moves on: a failed step never throws the crawl.
 *  PROSE MOVED. Stack's typed-in submission, his comments and the instructor's feedback are now
 *  nested under `results[].text`, which the stage does not read into a column — so they live in
 *  `bb_attempts.raw` (owner-only, RLS) and nowhere else.
 *  STILL UNVERIFIED AGAINST A LIVE RUN: the key names come from one read of Blackboard's own
 *  requests, not from a crawl of our own. `keys` travels with every column so Stack's next sync
 *  settles them for good. Unknown keys yield null, never a guess.
 *  - Assessment fields (`dueDate`, `points`, `gradebookColumnId`, `attemptsAllowed`): ALSO NOT
 *    VERIFIED. `slim()` runs on the Summary view, whose `contentDetail` only ever holds `file`
 *    and `url` (migration 034's header). walk() already fetches the full item for every
 *    assessment, so `assessmentFields()` now scans that full item for the four names at any depth
 *    and records **where each was found** in `detailSource`. After the first live crawl one query
 *    over bb_raw names Ultra's real path, and the scan can be replaced by reading it directly.
 *    Until then a field Ultra does not expose stays absent rather than being invented; the
 *    gradebook column remains the source of truth for due dates and points (migration 034).
 *
 * `runAll({ runId })` — WHY THE SKILL STILL REGISTERS AFTER THE CRAWL (round-2 review, R2-1)
 *  `runAll` accepts a caller-supplied run id, and registering it BEFORE the crawl is the order the
 *  authorisation rule wants. It is not safe yet, and the reason is in the driver, not here:
 *  `transform_tick` (migration 044) folds a REGISTERED run as soon as one of its `bb_raw` rows is
 *  more than three minutes old, with no completeness check — the calendar row is only one of two
 *  triggers, not a requirement. Register first and a slow crawl (v3 adds an attempts probe and a
 *  full-item GET per assessment, so it is slower than v2) can be folded with one course row
 *  landed; `run_transform` is idempotent, so the remaining courses are then dropped for good.
 *  So `skills/bb-sync/SKILL.md` registers the id immediately AFTER `runAll` returns, and
 *  migration 039's grace window covers that gap exactly as it did before. Register-first becomes
 *  correct the moment the tick requires the `calendar` row for a registered run — a Phase 9 driver
 *  change, not this phase's. Until then `runId` is here for that change and for tests, and it is
 *  validated as a uuid so a caller can never crawl under a fabricated id.
 *
 * Testability: `strip`, `announcementAuthor`, `mapAnnouncement`, `mapAttempt`, `mapAttemptFile`,
 * `shouldProbeColumn`, `assessmentFields` and `assertRunId` are module-level pure functions,
 * exported under a CommonJS guard at the bottom so web/test can cover them. The guard is inert in
 * a browser tab, where this file is still pasted and run as-is.
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

// ================================================================================================
// Phase 10a: attempts, the assessment-field probe, and the envelope version
// ================================================================================================

/** Envelope version stamped on every course payload. Stages read a missing key as version 2. */
const CRAWLER_VERSION = 4;

/** Newest N attempts per column. A column with ten resubmissions is not worth ten round trips. */
const ATTEMPT_LIMIT = 3;

/**
 * A caller-supplied run id has to be a real uuid or nothing at all. `bb_raw.run_id` is a uuid
 * column, so a malformed one would fail every POST after the crawl had already run; and silently
 * substituting a generated id would be worse still — the caller would register one id while the
 * payloads landed under another, and the crawl would be quarantined with no sign of why. Throw,
 * before a single request goes out.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const assertRunId = (runId) => {
  if (runId === undefined || runId === null) return null;
  if (typeof runId !== 'string' || !UUID_RE.test(runId)) {
    throw new Error(
      `bb_crawler: runId must be a uuid, got ${JSON.stringify(runId)}. ` +
      'Refusing to crawl — a fabricated id would land the payloads under a run nobody registered.');
  }
  return runId;
};

/**
 * v4 (P-grades-4): the key names Blackboard's own gradebook page uses, read off its requests and
 * written down in docs/planning/80f_ATTEMPTS_ENDPOINT.md. v3's candidate lists were guesses and
 * are cut to these. Two entries per field at most, and only where BOTH are real: the attempt
 * DETAIL (step 3) carries `attemptReceipt.submissionDate`, the attempt LIST (step 2) carries only
 * `attemptDate`, and a column whose detail request failed falls back to the list row.
 *
 * A dotted candidate is a path, read one level at a time — Ultra nests the score under
 * `displayGrade` and the submission date under `attemptReceipt`.
 */
const ATTEMPT_FIELD_KEYS = {
  status:            ['status'],
  created:           ['creationDate'],
  submitted:         ['attemptReceipt.submissionDate', 'attemptDate'],
  modified:          ['modifiedDate'],
  score:             ['displayGrade.score'],
  feedback:          ['instructorFeedback.rawText', 'instructorFeedback.displayText'],
  studentComments:   ['studentComments'],
  studentSubmission: ['studentSubmission.rawText', 'studentSubmission.displayText'],
  exempt:            ['exempt'],
  receipt:           ['attemptReceipt.receiptId'],
};

/**
 * Key names for one `studentSubmissionFiles[]` entry. `file.permanentUrl` is the whole point of
 * the v4 chain: a durable `bbcswebdav/xid-<n>_1` URL that downloads with the session cookie.
 */
const ATTEMPT_FILE_KEYS = {
  id:   ['id', 'bbFileUuid'],
  name: ['name', 'file.fileName', 'linkName'],
  size: ['size'],
  mime: ['file.mimeType'],
  url:  ['file.permanentUrl'],
  uuid: ['bbFileUuid'],
};

/** Read a dotted path one level at a time. Returns undefined the moment the walk runs out. */
const atPath = (o, path) => {
  let v = o;
  for (const k of String(path).split('.')) {
    if (v == null || typeof v !== 'object') return undefined;
    v = v[k];
  }
  return v;
};

/**
 * First candidate that is present (exists and is neither null nor ''), else null. A candidate with
 * a dot in it is a path into the object; one without is a plain key, exactly as in v3.
 */
const pickKey = (o, keys) => {
  if (o == null || typeof o !== 'object') return null;
  for (const k of keys) {
    const v = k.includes('.') ? atPath(o, k) : o[k];
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return null;
};

const asString = (v) => (typeof v === 'string' && v.trim() ? v : typeof v === 'number' ? String(v) : null);
const asNumber = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const asBool   = (v) => (typeof v === 'boolean' ? v : null);

/**
 * Is this gradebook column worth an attempts call? A calculated column has no submissions, and a
 * column Blackboard says was never opened has nothing to fetch — probing all 45 columns of a term
 * would be 45 round trips for 17 answers.
 */
const PROBE_SKIP_STATUSES = new Set(['NO_STATUS', 'UNOPENED']);
const shouldProbeColumn = (g) => {
  if (g == null || typeof g !== 'object' || !g.columnId) return false;
  if (g.isCalc) return false;
  if (g.lastAttempt != null) return true;
  const s = g.submissionStatus;
  return typeof s === 'string' && s !== '' && !PROBE_SKIP_STATUSES.has(s);
};

/**
 * One `studentSubmissionFiles[]` entry -> the shape stage_attempts catalogues.
 *
 * v4 READS the download URL instead of building one. `file.permanentUrl` is Blackboard's own
 * durable link; v3 built `/gradebook/attempts/<aid>/files/<id>/download`, which is not a route a
 * student session can use, and that is the second reason v3 catalogued nothing. The built form
 * survives only as a fallback so an old payload still produces a row.
 *
 * Returns null for anything with no usable id, so a malformed entry drops out rather than
 * producing a catalog row nothing can download.
 */
const mapAttemptFile = (f, { base = 'https://blackboard.syracuse.edu', courseId = null, attemptId = null } = {}) => {
  if (f == null || typeof f !== 'object') return null;
  const id = asString(pickKey(f, ATTEMPT_FILE_KEYS.id));
  if (!id) return null;
  const url = asString(pickKey(f, ATTEMPT_FILE_KEYS.url));
  return {
    id,
    name: asString(pickKey(f, ATTEMPT_FILE_KEYS.name)),
    size: asNumber(pickKey(f, ATTEMPT_FILE_KEYS.size)),
    mime: asString(pickKey(f, ATTEMPT_FILE_KEYS.mime)),
    uuid: asString(pickKey(f, ATTEMPT_FILE_KEYS.uuid)),
    downloadUrl: url
      ?? (courseId && attemptId
        ? `${base}/learn/api/v1/courses/${courseId}/gradebook/attempts/${attemptId}/files/${id}/download`
        : null),
  };
};

/**
 * One raw attempt (step 3's detail, or step 2's list row when the detail request failed) -> the
 * shape migration 050/055 reads. Pure: no fetch, no session, no globals.
 *
 * WHERE THE PROSE WENT (v4). `studentSubmission.rawText` is what Stack typed into Blackboard and
 * `instructorFeedback` is what a professor wrote back. The stage lifts the TOP-LEVEL keys of this
 * object into columns; nesting the three prose fields under `text` keeps them out of those columns
 * and leaves them in `bb_attempts.raw` alone, which is owner-only under RLS. They are still capped
 * the way the rest of the crawler caps prose: feedback 1000, student comments 2000, submitted text
 * 4000, all flattened to plain text first.
 *
 * `includeKeys` is set for the FIRST attempt of each column only — the probe that names what this
 * row was actually built from — and repeating it on every attempt would just make the payload
 * bigger.
 */
const mapAttempt = (a, files = [], includeKeys = false) => {
  if (a == null || typeof a !== 'object') return null;
  const out = {
    id:        asString(a.id),
    status:    asString(pickKey(a, ATTEMPT_FIELD_KEYS.status)),
    created:   asString(pickKey(a, ATTEMPT_FIELD_KEYS.created)),
    modified:  asString(pickKey(a, ATTEMPT_FIELD_KEYS.modified)),
    submitted: asString(pickKey(a, ATTEMPT_FIELD_KEYS.submitted)),
    score:     asNumber(pickKey(a, ATTEMPT_FIELD_KEYS.score)),
    exempt:    asBool(pickKey(a, ATTEMPT_FIELD_KEYS.exempt)),
    receipt:   asString(pickKey(a, ATTEMPT_FIELD_KEYS.receipt)),
    files:     Array.isArray(files) ? files.filter(Boolean) : [],
    text: {
      studentSubmission:  strip(pickKey(a, ATTEMPT_FIELD_KEYS.studentSubmission))?.slice(0, 4000) || null,
      studentComments:    strip(pickKey(a, ATTEMPT_FIELD_KEYS.studentComments))?.slice(0, 2000) || null,
      instructorFeedback: strip(pickKey(a, ATTEMPT_FIELD_KEYS.feedback))?.slice(0, 1000) || null,
    },
  };
  if (includeKeys) out.keys = Object.keys(a);
  return out;
};

/**
 * Step 1's grade row, slimmed. Its `id` is the grade id the rest of the chain hangs off — the
 * course-wide gradebook list the crawler already reads does not carry it, which is why step 1 is
 * per column. Returns null when there is no id, because there is then no chain to walk.
 */
const mapGradeRow = (g) => {
  if (g == null || typeof g !== 'object') return null;
  const id = asString(g.id);
  if (!id) return null;
  return {
    id,
    status:         asString(g.status),
    attemptsLeft:   asNumber(g.attemptsLeft),
    effectiveScore: asNumber(g.effectiveScore),
    pointsPossible: asNumber(g.pointsPossible),
    displayScore:   asNumber(pickKey(g, ['displayGrade.score'])),
    isExempt:       asBool(g.isExempt),
    firstAttemptId: asString(g.firstAttemptId),
    lastAttemptId:  asString(g.lastAttemptId),
  };
};

/**
 * Step 3's detail, slimmed for diagnosis. Deliberately carries NO prose and no file bodies —
 * `hasRawText` is a boolean, not the text. The prose lives in `results[].text` and nowhere else.
 */
const mapAttemptDetail = (d) => {
  if (d == null || typeof d !== 'object') return null;
  const id = asString(d.id);
  if (!id) return null;
  const r = (d.attemptReceipt && typeof d.attemptReceipt === 'object') ? d.attemptReceipt : {};
  return {
    attemptId:           id,
    gradeId:             asString(d.gradeId),
    status:              asString(d.status),
    attemptDate:         asString(d.attemptDate),
    creationDate:        asString(d.creationDate),
    modifiedDate:        asString(d.modifiedDate),
    receiptId:           asString(r.receiptId),
    submissionDate:      asString(r.submissionDate),
    submissionType:      asString(r.submissionType),
    submissionTotalSize: asNumber(r.submissionTotalSize),
    displayScore:        asNumber(pickKey(d, ['displayGrade.score'])),
    fileCount:           Array.isArray(d.studentSubmissionFiles) ? d.studentSubmissionFiles.length : 0,
    hasRawText:          !!strip(pickKey(d, ['studentSubmission.rawText'])),
  };
};

/**
 * The newest `limit` attempts of a column, newest first. Blackboard returns them oldest-first and
 * a column can carry a resubmission chain; step 3 costs one request each, so the chain is bounded.
 * An attempt with no parsable date sorts last and ties break on the id, so the order is total and
 * a replay picks the same three.
 */
const newestAttempts = (rows, limit = ATTEMPT_LIMIT) => {
  const ts = (r) => { const d = Date.parse((r && r.attemptDate) || ''); return Number.isFinite(d) ? d : 0; };
  return (Array.isArray(rows) ? rows : [])
    .filter((r) => r != null && typeof r === 'object' && r.id !== undefined && r.id !== null && r.id !== '')
    .slice()
    .sort((a, b) => (ts(b) - ts(a)) || String(b.id).localeCompare(String(a.id)))
    .slice(0, Math.max(0, limit));
};

/**
 * The assessment fields the planner wants, found wherever Ultra actually keeps them.
 *
 * Every candidate below is a guess about Ultra's shape, so the function records the dotted PATH
 * each value came from alongside the value. After the first live crawl,
 *   select distinct jsonb_object_keys(ci->'detailSource') , ci->'detailSource'
 *     from bb_raw, lateral jsonb_array_elements(payload->'content') ci where ci ? 'detailSource';
 * names the real path and this scan can be replaced by reading it directly. A field Ultra does
 * not expose simply stays absent: the gradebook column is still the source of truth for due dates
 * and points (migration 034), and inventing one here would put a made-up date on the tracker.
 *
 * Shallow matches win (the walk checks a node's own keys before descending), and objects are
 * never taken as values, so `{dueDate: {...}}` is skipped rather than stored as a blob.
 */
const ASSESSMENT_FIELDS = {
  dueDate:           ['dueDate', 'due'],
  points:            ['points', 'pointsPossible', 'possible'],
  gradebookColumnId: ['gradebookColumnId', 'gradeColumnId'],
  attemptsAllowed:   ['attemptsAllowed', 'numberOfAttempts', 'maxAttempts'],
};

const assessmentFields = (item, maxDepth = 12) => {
  const values = {}; const paths = {}; const seen = new Set();
  const wanted = Object.keys(ASSESSMENT_FIELDS);
  const rec = (v, path, depth) => {
    if (v == null || depth > maxDepth || typeof v !== 'object') return;
    if (seen.has(v)) return;
    seen.add(v);
    if (Array.isArray(v)) { v.forEach((e, i) => rec(e, `${path}[${i}]`, depth + 1)); return; }
    for (const field of wanted) {
      if (field in values) continue;
      for (const k of ASSESSMENT_FIELDS[field]) {
        const raw = v[k];
        if (raw === undefined || raw === null || raw === '' || typeof raw === 'object') continue;
        values[field] = raw;
        paths[field] = path ? `${path}.${k}` : k;
        break;
      }
    }
    for (const k of Object.keys(v)) rec(v[k], path ? `${path}.${k}` : k, depth + 1);
  };
  rec(item, '', 0);
  return Object.keys(values).length ? { values, paths } : null;
};

function installCrawler({ userId, supabaseUrl, anonKey, base = 'https://blackboard.syracuse.edu' }) {
  const j = async (u) => { const r = await fetch(base + u, { credentials: 'include' }); if (!r.ok) return { __status: r.status }; return r.json(); };
  // Like j, but hands back the HTTP status on success too, and never throws: the attempts probe
  // has to RECORD a failure per column (status + empty results) rather than take the crawl down.
  // status 0 means the request itself failed (offline, CORS, session gone mid-crawl).
  const jx = async (u) => { try { const r = await fetch(base + u, { credentials: 'include' });
      if (!r.ok) return { status: r.status, body: null };
      return { status: r.status, body: await r.json() }; }
    catch (e) { return { status: 0, body: null, error: String((e && e.message) || e) }; } };
  const rowsOf = (b) => (Array.isArray(b) ? b : (b && Array.isArray(b.results) ? b.results : []));
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
        if (s.type === null || /asmt|assignment|test|survey/i.test(s.type || '')) { const full = await j(`/learn/api/v1/courses/${C}/contents/${c.id}`); if (!full.__status) { if (s.type === null) s.body = strip(full.body)?.slice(0, 12000) || null; s.embeddedFiles = embedsDeep(full);
          // The Summary view's contentDetail only ever holds file/url, so the assessment fields
          // are looked for in the FULL item — with the path each came from, because where Ultra
          // keeps them is unverified until a live crawl. See assessmentFields() above.
          const af = assessmentFields(full);
          if (af) { s.detail = Object.assign({}, s.detail, af.values); s.detailSource = af.paths; } } }
        items.push(s); if (isContainer(c)) stack.push({ id: c.id, path: p }); } }
    return items; };
  const grades = async (C) => { const g0 = await pageAll(`/learn/api/v1/courses/${C}/gradebook/grades?userId=${userId}&limit=100&sort=column.position(asc)&expand=lastAttempt,attemptsLeft,submissionStatus,column,column.restricted,canStudentViewGradeResults,column.isLateAttemptCreationDisallowed&includeNoGradeItems=true&skipExternalGrade=true&skipKnowledgeCheck=true`);
    return (g0.results || []).map(g => ({ columnId: g.columnId, name: g.column?.columnName, description: strip(g.column?.description)?.slice(0, 500) || null, contentId: g.column?.contentId || null, categoryId: g.column?.gradebookCategoryId || null,
      possible: g.column?.possible ?? null, due: g.column?.dueDate || null, calc: g.column?.calculationType || null, formula: g.column?.calculatedFormula || null, aggregation: g.column?.aggregationModel || null, isCalc: !!g.isCalculatedColumnGrade,
      visible: g.column?.visible, gradesReleased: g.column?.gradesReleased, multipleAttempts: g.column?.multipleAttempts, position: g.column?.position, effectiveScore: g.effectiveScore ?? null, manualScore: g.manualScore ?? null, score: g.score ?? null,
      displayGrade: g.displayGrade ?? null, isExempt: !!g.isExempt, feedback: strip(g.instructorFeedback)?.slice(0, 1000) || null, submissionStatus: g.submissionStatus?.status || null, attemptsLeft: g.attemptsLeft ?? null,
      lastAttempt: g.lastAttempt ? { status: g.lastAttempt.status, created: g.lastAttempt.createdDate, submitted: g.lastAttempt.submittedDate || g.lastAttempt.attemptDate || null, score: g.lastAttempt.score ?? null } : null })); };
  // Submission attempts for the columns that look like they have one (shouldProbeColumn).
  //
  // v4 (P-grades-4): the three-request chain Blackboard's own gradebook page walks —
  //   1. the grade row, for the GRADE ID the other two need,
  //   2. the attempts under that grade,
  //   3. each attempt's detail, which is the only response carrying studentSubmissionFiles[].
  // Bounded at the newest ATTEMPT_LIMIT attempts per column and issued one at a time, as v3 was.
  // Nothing here throws: every step records its own status under `steps`, `entry.status` keeps the
  // FIRST non-2xx of the chain (so the stage's error count still means something), and a column
  // that fails at any step is pushed with whatever it got and the crawl carries on.
  const attempts = async (C, gradebook = [], { limit = ATTEMPT_LIMIT } = {}) => {
    const ok = (s) => s >= 200 && s <= 299;
    const out = [];
    for (const g of (Array.isArray(gradebook) ? gradebook : [])) {
      if (!shouldProbeColumn(g)) continue;
      const col = g.columnId;
      const gradeUrl = `/learn/api/v1/courses/${C}/gradebook/columns/${col}/grades?expand=attemptsLeft&userId=${userId}`;
      const entry = {
        columnId: col, contentId: g.contentId ?? null,
        endpoint: gradeUrl, status: 0,
        steps: { grade: null, attempts: null, detail: [] },
        keys: {}, grade: null, attempts: [], detail: [], results: [],
      };
      // Keep the first non-2xx; a later success must not paper over an earlier failure.
      const fail = (s) => { if (ok(entry.status)) entry.status = s; };
      try {
        // 1. the grade row
        const gr = await jx(gradeUrl);
        entry.steps.grade = { url: gradeUrl, status: gr.status };
        entry.status = gr.status;
        const gRow = rowsOf(gr.body)[0] || null;
        if (gRow) entry.keys.grade = Object.keys(gRow);
        entry.grade = mapGradeRow(gRow);
        if (!entry.grade) { out.push(entry); continue; }

        // 2. the attempts under it
        const attUrl = `/learn/api/v1/courses/${C}/gradebook/columns/${col}/grades/${entry.grade.id}/attempts`;
        const ar = await jx(attUrl);
        entry.steps.attempts = { url: attUrl, status: ar.status };
        if (!ok(ar.status)) fail(ar.status);
        const rows = rowsOf(ar.body);
        if (rows[0]) entry.keys.attempt = Object.keys(rows[0]);
        const wanted = newestAttempts(rows, limit);
        entry.attempts = wanted.map((r) => ({
          id: asString(r.id), status: asString(r.status), attemptDate: asString(r.attemptDate),
          exempt: asBool(r.exempt), overrideStatus: asString(r.overrideStatus),
        }));

        // 3. each attempt's detail — the files live here and nowhere else
        for (const r of wanted) {
          const aid = String(r.id);
          const detUrl = `/learn/api/v1/courses/${C}/gradebook/attempts/${aid}?columnId=${col}&expand=toolAttemptDetail,attempts,attempts.toolAttemptDetail`;
          const dr = await jx(detUrl);
          entry.steps.detail.push({ attemptId: aid, url: detUrl, status: dr.status });
          if (!ok(dr.status)) fail(dr.status);
          const d = (dr.body && typeof dr.body === 'object' && !Array.isArray(dr.body)) ? dr.body : null;
          if (d && entry.keys.detail === undefined) entry.keys.detail = Object.keys(d);

          const rawFiles = (d && Array.isArray(d.studentSubmissionFiles)) ? d.studentSubmissionFiles : [];
          if (rawFiles[0] && entry.keys.file === undefined) entry.keys.file = Object.keys(rawFiles[0]);
          const files = rawFiles
            .map((f) => mapAttemptFile(f, { base, courseId: C, attemptId: aid }))
            .filter(Boolean);

          const det = mapAttemptDetail(d);
          if (det) entry.detail.push(det);
          // The contract row: built from the detail when we have it, from the list row when the
          // detail request failed — so a submission is still recorded, just without its files.
          const m = mapAttempt(d ?? r, files, entry.results.length === 0);
          if (m) entry.results.push(m);
        }
      } catch (e) {
        entry.error = String((e && e.message) || e);
      }
      out.push(entry);
    }
    return out; };
  const crawl = async (C) => {
    const detail = await j(`/learn/api/v1/courses/${C}?expand=effectiveAvailability`);
    const teach = await j(`/learn/api/v1/courses/${C}/memberships?expand=user,courseRole&limit=50&membershipAvailable=true&roleBucket=TEACHING`);
    const sched = await j(`/learn/api/v1/courses/${C}/schedule?sort=location(desc)`);
    const ann = await pageAll(`/learn/api/v1/courses/${C}/announcements?limit=100`);
    const cats = await j(`/learn/api/v1/courses/${C}/gradebook/categories?limit=100`);
    // The gradebook is fetched before the attempts probe because it is what decides which columns
    // are worth probing at all (shouldProbeColumn).
    const gradebook = await grades(C);
    return { crawler: { version: CRAWLER_VERSION },
      course: { id: C, name: detail.name, courseId: detail.courseId, modified: detail.modifiedDate },
      teachers: (teach.results || []).map(t => ({ name: `${t.user?.givenName || ''} ${t.user?.familyName || ''}`.trim(), email: t.user?.emailAddress || null, role: t.courseRole?.identifier, userId: t.userId })),
      schedule: sched.results || [],
      announcements: (ann.results || []).map(mapAnnouncement),
      gradeCategories: (cats.results || []).map(c => ({ id: c.id, title: c.title, weight: c.weight ?? null })),
      gradebook, attempts: await attempts(C, gradebook), content: await walk(C) }; };
  const memberships = async () => { const m = await j(`/learn/api/v1/users/${userId}/memberships?expand=course.effectiveAvailability,course.permissions,courseRole&includeCount=true&limit=10000`); return (m.results || []).map(x => ({ id: x.course.id, name: x.course.name, courseId: x.course.courseId, termId: x.course.termId, termName: x.course.term?.name, uuid: x.course.uuid, role: x.role, membershipId: x.id, lastAccess: x.lastAccessDate })); };
  const calendar = async (since, until) => ({ calendars: (await j('/learn/api/v1/calendars?limit=10000')).results || [], items: (await j(`/learn/api/v1/calendars/calendarItems?since=${since}&until=${until}`)).results || [] });
  const post = async (run_id, kind, bb_course_id, payload) => fetch(`${supabaseUrl}/rest/v1/bb_raw`, { method: 'POST', headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify({ run_id, kind, bb_course_id, payload }) });
  // `runId` lets a caller own the run id instead of learning it afterwards. It is NOT yet safe for
  // the bb-sync skill to register before crawling — see the header: transform_tick folds a
  // registered run on a three-minute idle with no completeness check, so a slow crawl would be
  // folded half-done and the rest dropped. The skill still registers immediately after this
  // returns, under migration 039's grace window. Validated first, so a bad id fails before any
  // request goes out rather than after seven courses have been crawled.
  const runAll = async ({ termName = null, runId = null, since = '2026-08-01T04:00:00.000Z', until = '2027-01-15T04:00:00.000Z' } = {}) => {
    const run_id = assertRunId(runId) || crypto.randomUUID(); const mem = await memberships(); const mine = termName ? mem.filter(m => m.termName === termName) : mem;
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
  return { j, jx, strip, pageAll, walk, grades, attempts, crawl, memberships, calendar, post, runAll, downloadAll, refreshEmbeds, embedsDeep, durableUrl, mapAnnouncement, mapAttempt, mapAttemptFile, mapGradeRow, mapAttemptDetail, newestAttempts, version: CRAWLER_VERSION };
}

// Inert in a browser tab (no `module` there), so this file stays paste-and-run in the Ultra console.
// Under Node it exposes the pure mappers to the vitest suite in web/test.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { installCrawler, strip, personName, announcementAuthor, mapAnnouncement, AUTHOR_KEYS,
    mapAttempt, mapAttemptFile, mapGradeRow, mapAttemptDetail, newestAttempts, atPath,
    shouldProbeColumn, assessmentFields, pickKey, assertRunId,
    ATTEMPT_FIELD_KEYS, ATTEMPT_FILE_KEYS, ASSESSMENT_FIELDS, CRAWLER_VERSION, ATTEMPT_LIMIT };
}

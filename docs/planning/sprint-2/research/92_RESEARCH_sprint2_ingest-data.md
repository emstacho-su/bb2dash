# 92 — Sprint 2 research: ingest-data

Date 2026-09-24 · Researcher: Sonnet (Stage B) · Scope: R-60, R-63..R-73, R-75, R-76 (§1.4 minus
the search items) and §2 P-22, P-25..P-29, §6 questions 24–31. Read-only on every repo except this
file. Web research fetched live 2026-09-24 (WebSearch/WebFetch, plus `gh search code` for public
GitHub source — flagged per-source below since it is not WebSearch/WebFetch but is the same
read-only, nothing-invented standard). Repo facts read from `docs/planning/sprint-2/`,
`project-state/`, `docs/planning/sprint-2/82_PHASE14_containers.md` and its six `82_RESEARCH_*`
files (not re-derived), and the sibling `92_RESEARCH_sprint2_sync-runner-login.md` (already on
disk) for the Phase 14 runner/login boundary this cluster's items touch but do not own.

## 0. Summary

Nothing here needs a new library or architecture; every item is either a closure (write the
DECISIONS row the record already points at), a well-worn data-hygiene pattern (dedupe-by-hash,
natural-key migration, claim/heartbeat queues, ordered-rule classifiers), or blocked on one of
Stack's own logged-in probes. One substantial correction: **R-69's Ultra per-item URL shape is not
actually unconfirmed** — a `gh search code` sweep of public course pages returned the identical
`/ultra/courses/_<courseId>_1/outline/<type>/_<itemId>_1[?courseId=...&gradeitemView=details]`
template from a dozen independently-run Blackboard Ultra tenants, keyed on exactly the two ids
bb2dash already stores. That collapses "Still missing (1)" from a discovery task gated on Stack's
tab into a two-line SQL derivation plus a type-segment map, and flips Q30's default from "wait" to
"build now, confirm live." A second reverse-engineered tenant (breitburg/python-kuleuven)
independently confirms `creatorUserId` exists on the announcements resource and resolves via
`GET /learn/api/v1/users/{id}` — the diagnosis R-70 already reached from `personName()`'s own bug,
now corroborated externally, flipping Q28's default from "probe, then likely drop" to "probe,
expect a resolvable id." The same source also confirms bb2dash's own read of the download-redirect
chain (bbcswebdav → signed S3 URL, R-60/P-22), gradebook column fields (`possible`, `dueDate` —
R-75), and that Blackboard's rich-text body field is its own dialect needing sanitization before
display, a step R-76's plan currently omits (CLAUDE.md's "Sanitized HTML" rule). **Biggest risk:**
none of these items is individually risky; the risk is sequencing — R-63, R-64, R-71 and R-75(a) all
want the same `stage_content` re-creation (row 158), and P-27's one shared probe sitting gates
R-60, R-66, R-69, R-70 and R-73 at once, so a missed sitting stalls five items together. **Total
size:** one L (R-64), four M (R-63, R-67, R-71, R-76-if-built), nine S/XS (R-60, R-65, R-66, R-68,
R-69, R-70, R-72, R-73, R-75) — no item's size changes from the record's own estimate; the research
sharpens scope and sequencing, not effort.

## 1. R-60 · Files a sync catalogues are stored, extracted and embedded before it ends

**1. Standard practice.** A downloader that must survive a crashed browser event splits into a
pure *discover* step (which rows need bytes) and a separate *fetch* step (stream the bytes),
never one script that both drives a UI and writes files; the fetch step follows the redirect chain
itself and verifies a checksum after the write, not before.

**2. Examples (fetched).**
- [breitburg/python-kuleuven `docs/DATA.md`](https://raw.githubusercontent.com/breitburg/python-kuleuven/main/docs/DATA.md) —
  documents the exact chain bb2dash already hit: `bbcswebdav` → a tenant redirect carrying
  `one_hash`/`f_hash` → `orgs/<batchUid>/READ_ONLY/content/...` → a final AWS S3 presigned URL
  (`X-Amz-Signature`, ~6h validity). Borrow: treat it as a fixed 3-hop chain (fail loud on an
  unexpected hop count) and never cache the final CDN URL past its validity window.
- [breitburg/python-kuleuven](https://github.com/breitburg/python-kuleuven) (repo overview,
  fetched) — exposes `discover_files()` / `stream_file_item()` / `download_file_item()` as three
  separate calls. Borrow: split `pull_files.mjs`'s pull into the same discover/stream seam so a
  scripted CDN-fetch mode can reuse the discovery half unchanged from the Playwright-driven path.
- [dev.to: "The Queue Was a Table"](https://dev.to/romiteld/the-queue-was-a-table-how-i-built-claimunclaim-workers-with-skip-locked-stale-recovery-and-1ojm) —
  claim/unclaim with an `attempts` column. Borrow the attempts-column shape for a per-file retry
  budget on the new fetch mode so one bad signed URL doesn't spin forever.

**3. Pitfalls.** Node's `fs.rename` throws `EXDEV` across a tmpfs/volume boundary — copy-then-unlink,
not a bare rename (also flagged independently by the sync-runner-login research for the same repo's
future Phase 14 runner, P-36; applies here too since `pull_files.mjs` writes a local mirror plus a
Storage upload). Signed CDN URLs expire (~6h); a retried fetch must re-walk the chain, not replay a
cached CDN URL. One hand `curl` run is not evidence the chain is stable under retry or across tenants.

**4. Maps onto this stack.** `ingest/pull_files.mjs` gains a `--fetch` mode (or a sibling script)
that walks the same 3-hop chain with Node's own `fetch`/redirect handling instead of a Playwright
`download` event (which already crashes the MCP browser, 2026-09-23), sharing
`filterManifest`/`bbFilesUpdateSql`/`storageKeyFor`/`bytesLookValid` with the existing script — the
same reuse the sync-runner-login research names for the future container runner. The superseding
DECISIONS row (P-22) replaces row 171's Playwright-only method with "Playwright when the tab is
open; scripted redirect-follow fetch otherwise."

**5. Size S** (P-22's own size, confirmed). **Seams:** P-27's shared probe sitting settles whether
group-attempt submissions carry files; P-28's Phase 14 brief edit (task 5 currently pulls only
submission files, :259) needs updating once course-file pull ships in the skill (Q29); P-29 closes
the stale STATUS/runbook lines this item's own "Must respect" section already names.

**6. What research changes.** Confirms the redirect-chain shape closely enough to promote the curl
workaround from a one-off hand fallback to a designed scripted mode, and gives the discover/fetch
split a name so the same discovery logic backs both the skill today and the Phase 14 runner later.
No split; sharpens "Still missing (1)" with a concrete implementation seam.

## 2. R-63 · Materials and search show one current copy of each document

**1. Standard practice.** Content identity is the hash, never the name or path; location/provenance
is metadata layered on top. Every fetched dedupe tool below groups strictly by content hash, and
Blackboard's own storage-key rule (already in DECISIONS) already follows this.

**2. Examples (fetched via search).**
- [twpayne/find-duplicates](https://github.com/twpayne/find-duplicates) — outputs
  `{hash: [filenames...]}`. Borrow the shape for a repeatable "group bb_files by sha256, list every
  live location" query — useful both for the two open provenance calls (17 vs 15, 18/19) and as the
  detection half of the new auto-supersession rule.
- [uoshvis/find-duplicate-files](https://github.com/uoshvis/find-duplicate-files) /
  [PJDude/dude](https://github.com/PJDude/dude) — both prefilter by file size before hashing.
  Borrow only if stage_files ever needs to compare bytes inline rather than trusting a Storage-key
  collision alone (it currently does not need to).
- [GitLab: deduplicate database records](https://docs.gitlab.com/development/database/deduplicate_database_records/) —
  the three-milestone shape (block new duplicates → clean existing ones, newest wins → promote to a
  real constraint) is the general pattern the new auto-supersession rule follows, applied to
  Storage keys/content ids instead of one table's primary key.

**3. Pitfalls.** Hash equality proves identity, never supersession *direction* (the record's own
finding, row 38) — a general auto-rule risks conflating "same name" with "same file," which is
exactly why the planned rule (R-63 "Still missing (2)") routes a name-only match to an Inbox
question instead of writing `superseded_by` silently.

**4. Maps onto this stack.** `stage_files`'s next re-creation (091+) gets the auto-supersession
branch: on the newest crawl carrying a different file on the same `bb_content` item, set
`superseded_by`, keeping the stack/already-superseded/newest-crawl guards; a name-only match with no
content-item match raises `attention_items` instead of writing. P-26's hand migration (2→151,
74→149) ships first and independently, provable from `bb_raw`'s per-content-item file identity.

**5. Size S** (P-26) **+ M** (the stage_files rule, matching the entry's own estimate). **Seams:**
shares one `stage_files` re-creation with R-64 (row 158); 17/19's fate depends on R-64's `bb_content`
key change (no node to hang `superseded_by` on until then).

**6. What research changes.** Corroborates hash-first/location-as-metadata as the standard shape,
and gives a concrete grouping query pattern worth adding as a repeatable check rather than the
ad hoc SQL used for the 5 hand links so far. No split; the entry's own "Still missing" list already
names the outcome.

## 3. R-64 · Classwork shows each Blackboard content item once, without rename ghosts

**1. Standard practice.** Natural-key migrations under live duplicate data sequence as
**prevent → clean → constrain**: block new violations first, collapse existing duplicates next
(children re-parented before a duplicate parent is removed), only then add the real unique
constraint — never constrain first and clean up under violation pressure.

**2. Examples (fetched).**
- [GitLab: deduplicate database records](https://docs.gitlab.com/development/database/deduplicate_database_records/) —
  a ranked-window `DELETE`, newest wins, for milestone 2. Borrow directly for the 16 ghost-pair
  collapse; its own unaddressed caveat (re-point dependent rows first) matches "Still missing (2)"'s
  own plan to carry the 3 assignment links forward before deleting.
- [breitburg/python-kuleuven `docs/DATA.md`](https://raw.githubusercontent.com/breitburg/python-kuleuven/main/docs/DATA.md) —
  its ID-mapping table documents Blackboard's own content model: a stable node `id`, a `parentId`,
  and a separate `contentHandler` (e.g. `resource/x-bb-folder`) plus an `isBbPage` flag distinguishing
  a plain folder from an Ultra Document. Independently confirms `bb_item_id` (not path) is
  Blackboard's real stable identity for a content node.
- [caioba-codes/blackboard `LMS.md`](https://github.com/caioba-codes/blackboard) (found via
  `gh search code`) — a third party's own working notes confirm content trees are walked by id +
  `parentId` via `/contents/<id>/children`, not by path, on a separate Blackboard deployment.

**3. Pitfalls.** GitLab's own doc flags collapsing duplicates before re-pointing every foreign key
as the easy mistake; R-64's "Still missing (2)" already plans to carry the 3 assignment links
forward first, which matches the caution.

**4. Maps onto this stack.** The interim `v_content_tree`/tree-builder `missing_since` filter (P-25)
lands first, cheap and reversible. `stage_content`'s frozen-signature re-creation (unique
`(course_id, bb_item_id)`, parent from payload `parentId`, missing pass on `bb_item_id`) is the
"constrain" milestone, done only after the ghost-pair data migration. `contentHandler` is already
present in every `bb_raw` payload per the confirmed external schema — worth carrying into
`bb_content` in the same migration so R-63's near-duplicate grouping and R-69's URL type-segment map
can both read it later without a second key-touching migration.

**5. Size L** (unchanged) for the full key swap; P-25's interim view filter is **S**. **Seams:**
shares the `stage_content` re-creation with R-63 and R-75(a) under row 158; C-12/C-17 land in the
same phase per that row.

**6. What research changes.** Corroborates `bb_item_id` as Blackboard's real content identity from
an independent source, and adds one concrete line item: carry `contentHandler` into `bb_content` in
the same migration (same payload, saves a second touch for R-69/R-63/R-76 later). No split.

## 4. R-65 · A sync folds only when complete and always shows its true state

**1. Standard practice.** A claim/heartbeat job queue never infers completeness from elapsed time
alone: it opens a row at claim (not at close), a server clock stamps `finished_at`, and a *separate*
reaper — never the claiming worker — reclaims a row stuck past a threshold, distinguishing "still
running" from "died mid-run."

**2. Examples (fetched via search).**
- [dev.to: "The Queue Was a Table"](https://dev.to/romiteld/the-queue-was-a-table-how-i-built-claimunclaim-workers-with-skip-locked-stale-recovery-and-1ojm) —
  claim/unclaim with an `attempts` column and a stale-claim sweep in one statement. Borrow the
  attempts-column shape for the "terminal rule for a crawl that never completes" ("Still missing
  2"), matching the same recommendation the sync-runner-login research makes for the container
  runner's own dead-letter sweep (R-83) — R-65 is the SQL-side half so `transform_tick`'s fold
  filter and the runner's sweep agree on one `sync_runs` row's state.
- [GitLab: deduplicate database records](https://docs.gitlab.com/development/database/deduplicate_database_records/) —
  its milestone-1 advisory-lock idea, repurposed as a general caution: two writers (the registered
  fold branch and the transform-request drain, 044:296-301) should never decide "complete" by two
  different rules on the same table, which is exactly today's gap.

**3. Pitfalls.** Opening a row at claim and only writing it at fold-completion means a reader
between those two moments sees absence, not "running" — a dashboard that only queries finished rows
silently shows nothing instead of "in progress," the exact Home-screen gap this entry already names.

**4. Maps onto this stack.** `transform_tick`'s next body opens `sync_runs` at claim
(`clock_timestamp()` for `started_at`); the registered-fold branch and the drain read one shared
running-row + calendar-arrival predicate; Home's `v_sync_status` gains "running"/"interrupted" read
from that row. This is the SQL-side half of what the sync-runner-login research's R-83/R-84 build
for the container side; P-28 keeps Phase 14's brief text (C-3 step 3, :122) in step with whichever
half lands first — register-first is already frozen either way.

**5. Size M** (unchanged). **Seams:** gates or is gated by R-83 (dead-letter sweep) and R-84 (RPC
signatures) from the sibling research file — whichever phase lands first defines `sync_runs`'
shape for the other; P-29 corrects STATUS :527-529/:534-536 once the running row exists.

**6. What research changes.** Confirms "open at claim, a separate reaper decides stuck" as standard
practice rather than a local invention, reinforcing the entry's own plan (3) and adding the
attempts-column detail to (2)'s terminal rule. No split.

## 5. R-66 · Each attempt records the feedback and fields Blackboard actually sends

**1. Standard practice.** Never silently default when a probable-but-unverified field is missing —
record the raw shape once (a "keys probe," already bb2dash's own pattern) and let a human or a
scheduled re-check confirm before trusting a derived value. Fuzzy/best-effort field matching trades
precision for resilience deliberately, and its own author flags the risk of a silent `None` default
hiding a real miss — precisely the failure already live here: `personName()` silently discards a
bare Blackboard user id instead of flagging it, the shared root cause behind both this item's null
feedback and R-70's null authors.

**2. Examples (fetched).**
- [dev.to: "When Your API Keeps Changing"](https://dev.to/__c1b9e06dc90a7e0a676b/when-your-api-keeps-changing-my-battle-with-dynamic-json-parsing-2ejf) —
  a `get_close_matches` fuzzy-field fallback is the wrong shape for a schema this well-understood
  (an ordered candidate list, as `ATTEMPT_FIELD_KEYS` already is, is safer); borrow only its stated
  pitfall — silent `None` on a miss hides exactly the bug already live — as the reason a probe
  should log a zero-match count, not just fall through.
- [breitburg/python-kuleuven `docs/DATA.md`](https://raw.githubusercontent.com/breitburg/python-kuleuven/main/docs/DATA.md) —
  an independently reverse-engineered Blackboard Ultra tenant's grade-record fields
  (`hasAttemptOrGradeFeedback`, `submissionStatus.status`, `attemptsLeft`) confirm a
  feedback-shaped field exists on the grade/attempt surface generally, corroborating that fix (1)
  targets the right field family.

**3. Pitfalls.** Five `ATTEMPT_FILE_KEYS` lists still carrying 2-3 candidate names each
(bb_crawler.js:208-224) is exactly the "fixture and reality drift silently" pattern the fetched
article warns about; a probe with no logged miss-count cannot tell "field renamed" from "field never
existed on this tenant."

**4. Maps onto this stack.** `ATTEMPT_FIELD_KEYS.feedback` reads `feedbackToUser` first (string or
`{rawText, displayText}`, matching the same `rawText`/`displayText` two-field shape Blackboard uses
on announcements too per the fetched source), confirmed on P-27's one shared logged-in probe sitting
alongside R-69, R-70 and R-73 in one Duo session, recorded like `80f_ATTEMPTS_ENDPOINT.md`.

**5. Size S** (unchanged). **Seams:** P-27 (the shared probe sitting) is this item's critical path;
`attempts_v4.json` and `crawler.attempts.test.ts` update in the same PR.

**6. What research changes.** Corroborates `feedbackToUser`'s `rawText`/`displayText` shape as a
general Blackboard pattern rather than a one-off, and adds a process fix — log a zero-match count on
every probe — worth folding into "Still missing (1)". No split.

## 6. R-67 · Course files are linked to their week and class session

**1. Standard practice.** Rule-based filename/path classifiers use an ordered, narrow-before-broad
matcher list with one designated fallback, and treat "matches more than one rule" as its own named
outcome (flag for review) rather than silently picking the first or last match.

**2. Examples (fetched).**
- [ElizabethSobiya/classify-filename](https://github.com/ElizabethSobiya/classify-filename) —
  first-matching-rule wins by default, ordered narrow-to-broad, a `fallback` bucket for no-match,
  and an explicit `multiMatch` mode returning every matching rule instead of one. Borrow the
  three-way outcome shape directly: "one match" / "no match → fallback" / "more than one match" —
  the last is exactly R-67's own planned Inbox-question trigger ("Still missing (3)"), now with a
  named, testable shape instead of an ad hoc note.
- [dbranno1/hopkinsyllabus](https://github.com/dbranno1/hopkinsyllabus) — per-format date/week
  detection (`Sept. 3`, `09/03/2026`, `Week 4`) with a confidence score and a mandatory
  human-confirm step before anything saves. Borrow the confidence+required-confirm shape for
  below-threshold week/session links, matching the record's own "every fact row carries source +
  confidence" rule.

**3. Pitfalls.** hopkinsyllabus's own limitation note — unusual layouts need manual fixes — maps
directly onto bb2dash's four different per-course naming conventions (GEO "Week N", IST.323
"Lecture #N - Week N", IST.352 "WKnn", IST.466 no tag); one shared regex will not cover all four
without a per-course rule table, which "Still missing (2)" already plans.

**4. Maps onto this stack.** A small classifier module (inline in `stage_files` or a new
`ingest/classify_file_session.mjs`) holds one ordered rule list per course (narrow: exact
"WKnn"/"Week N" match; broad: date-proximity fallback via `reading_id → readings.for_date`), writes
`week_no`/`session_id`/`link_confidence`, and raises one `attention_items` row per ambiguous file
(the multiMatch trigger) — run inside `stage_files` beside `link_reading_files`, the same 074/086
pattern already named.

**5. Size M** (unchanged). **Seams:** shares `stage_files` with R-64; Storage keys never rewritten
(already guarded); `CourseScreen.tsx:461`'s "no files" text needs the interim guard from "Still
missing (4)" regardless of when the classifier ships.

**6. What research changes.** Gives the ambiguous-match handling a concrete, testable shape
(multiMatch-style) instead of an ad hoc "raise a question," and adds confidence-scored confirmation
for low-certainty links. No split.

## 7. R-68 · Every reading's Materials tag says where it actually lives

**1. Standard practice.** When a stored boolean (`on_blackboard`) is contradicted by newer evidence
(syllabus text, `group_notes`), correct the field to match the best current read rather than adding
a second competing flag or leaving a stale seed-time guess in place — a single-authoritative-field
practice, not a novel one. [Strapi: what is a single source of truth](https://strapi.io/blog/what-is-single-source-of-truth) —
"centralization... consistency... zero redundancy: no conflicting copies, no silent forks."

**2. Examples.** This is a one-column, Stack-adjudicated data fix, not a build with independent OSS
precedent worth fetching; the closest parallel is R-63/R-64's own "hash/id is truth, a flag is only
a cached belief about it" shape — no separate examples fetched for this item alone.

**3. Pitfalls.** `resolveReadingRoute`'s `on_blackboard`-before-`looksLikeEbook` ordering
(`queries.materials.ts:540`/`:552`) is itself a small instance of R-67's ordered-rule pattern —
reordering it without correcting the underlying flag (the entry's alternative option) just changes
which stale value wins, not whether it is correct.

**4. Maps onto this stack.** An additive migration flips `on_blackboard=false` for the named reading
ids and sets `readings.url` for reading 45 from `bb_content` 114, gated on Stack's chapter-vs-ebook
call (Q25 — unchanged default); no code path changes if the flag itself is corrected rather than
reordered around.

**5. Size S** (unchanged). **Seams:** `readings.on_blackboard`/`url`; `resolveReadingRoute`;
`web/test/materials.syllabus.test.ts`.

**6. What research changes.** Nothing substantive; confirms "fix the field, don't reorder around
it" as the lower-risk of the two listed options. No split.

## 8. R-69 · Each Blackboard assessment links to its own Ultra page

**1. Standard practice.** LMS deep links are built from two stable ids (course id + content id)
plus a content-type path segment chosen from the item's own type/handler field — never guessed from
a title, never one fixed template for every content type.

**2. Examples (found via `gh search code`, live public GitHub results, 2026-09-24; each URL below
is a real, currently-published course page, not invented).**
- A dozen independently-run Blackboard Ultra tenants — `learn.bu.edu`, `blackboard.pxl.be`,
  `blackboard.cuhk.edu.hk`, `blackboard.wm.edu`, `learn.jcu.edu.au`, `www.ole.bris.ac.uk`,
  `lms.gvsu.edu`, `blackboard.durham.ac.uk`, `blackboard.gwu.edu` and more — all use the identical
  shape: `https://<host>/ultra/courses/_<courseId>_1/outline/file/_<contentId>_1` for files, and
  `https://<host>/ultra/courses/_<courseId>_1/outline/assessment/test/_<contentId>_1?courseId=_<courseId>_1&gradeitemView=details`
  for tests; the course-level fallback bb2dash already uses matches
  `https://<host>/ultra/courses/_<courseId>_1/cl/outline` (or `/outline`). Borrow: the exact
  template per content type, and the `?courseId=...&gradeitemView=details` query pair for
  assessments specifically (file links carry no query string).
- [breitburg/python-kuleuven `docs/DATA.md`](https://raw.githubusercontent.com/breitburg/python-kuleuven/main/docs/DATA.md) —
  documents the `contentHandler` values that pick the template (`resource/x-bb-asmt-test-link` for
  tests, `resource/x-bb-assignment` for assignments), and a worked discussion-forum case: the SPA
  URL uses `/engagement/discussion/<contentId>`, the *content* id, not the *forum* id, mapped via
  `contentDetail."resource/x-bb-forumlink".id` — a concrete warning that "one id, one template"
  breaks for at least one content-type family.
- [BlackboardFS/bbfs `bbfs-scrape/src/lib.rs`](https://github.com/BlackboardFS/bbfs) (found via
  `gh search code`) — an independent Rust scraper builds the same course-level template
  (`/ultra/courses/{}/cl/outline`) from `course.id` alone, corroborating `courses.bb_id` as the only
  course-side input needed.

**3. Pitfalls.** The template varies by content type (file / assessment-test / discussion /
assignment), so a single SQL string-concat keyed only on `bb_item_id` will mis-link non-file,
non-test items; the assessment template's query string is significant on some deployments. A stale
or absent `bb_item_id` (the 3 rows with none; a new column's insert per 084:194-202) still needs the
"stays course-level" fallback this entry already plans.

**4. Maps onto this stack.** `stage_assignments`' re-creation derives `bb_url` as
`'https://' || <host> || '/ultra/courses/_' || courses.bb_id || '_1/outline/' || <type-segment> ||
'/_' || bb_item_id || '_1' || <query-suffix-if-assessment>`, where `<type-segment>` comes from a
small case map keyed on the same `contentHandler` signal R-64's key-change migration can now carry
(§3 above). The 16 column-only rows keep the course-level fallback.

**5. Size stays S** for the SQL derivation once the type-segment map exists (now confirmed cheap);
low **M** only if `<host>`/`contentHandler` are not already on hand per course. **Seams:** P-27's
probe sitting becomes a confirmation, not a discovery gate (Q30 below); R-64's `contentHandler`
carry-through feeds the type-segment map.

**6. What research changes — this section's main finding.** "Still missing (1)" frames the URL
shape as unconfirmed, gated on Stack's tab or a live `lastAttemptUrl`. Live, independently-operated
Blackboard Ultra deployments across a dozen institutions already show the identical, unambiguous
shape, keyed on exactly the two ids bb2dash already stores. The live-confirmation step becomes a
fast sanity check, not a blocking discovery task — sharpens (1) and (2); Stack's DECISIONS sign-off
on composing the URL still stands (Q30 below).

## 9. R-70 · Each announcement shows who posted it, or the author line goes

**1. Standard practice.** Resolve a foreign id to a display value through the API's own id-keyed
lookup endpoint, cached per run, and never treat "looks like an id, not a name" as "absent" — the
opposite of the bug already live here.

**2. Examples (fetched).**
- [breitburg/python-kuleuven `docs/DATA.md`](https://raw.githubusercontent.com/breitburg/python-kuleuven/main/docs/DATA.md) —
  an independently reverse-engineered Blackboard Ultra tenant documents `creatorUserId` on the
  announcements resource verbatim (`/courses/<id>/announcements`) as the "issuer's Blackboard user
  PK (`_NNNN_1`)... not directly a q-uid; must resolve via `/learn/api/v1/users/<creatorUserId>`" —
  exactly bb2dash's own diagnosis (a bare id `personName()` discards), confirmed on a second,
  independent Blackboard Ultra installation. Borrow: the field name to add to `AUTHOR_KEYS`, and the
  confirmation that `/users/<id>` is Blackboard's documented resolution path, not a guess.
- [glama.ai: `user-resolver.ts`](https://glama.ai/mcp/servers/@iceener/linear-streamable-mcp-server/blob/ba9763a6bc1aef7ed1c61a919608e4ffe4a43348/src/utils/user-resolver.ts) —
  caches a whole users list once per session/TTL instead of one lookup per item. Borrow the shape:
  check `course_staff.bb_user_id` first (already partly mirrored), then one live `/users/<id>` call
  per unresolved id per run, cached for that run's duration only.
- [dev.to: "When Your API Keeps Changing"](https://dev.to/__c1b9e06dc90a7e0a676b/when-your-api-keeps-changing-my-battle-with-dynamic-json-parsing-2ejf) —
  its own stated pitfall (silent `None` on a fuzzy-match miss hides a real failure) is the generic
  version of `personName()`'s exact bug; borrow only the warning.

**3. Pitfalls.** Resolving via `/users/<id>` is a same-family call, not obviously "a new Blackboard
endpoint" in R-20/row-90's sense — but row 90's reversal names only the attempts endpoints by path,
so this still needs its own DECISIONS line even though the risk is lower than "Still missing (3)"
implies.

**4. Maps onto this stack.** `AUTHOR_KEYS` gains `creatorUserId` (or R-70's own envelope-v5 probe
result) ahead of the bare-id-discarding branch in `personName()`; a resolution step
(`mapAnnouncement` or `stage_announcements`) checks `course_staff.bb_user_id` first, then one
`/users/<id>` call per unresolved id per run, cached in-memory for that run.

**5. Size stays the entry's own S→M split** (S if a bare id is present, M if a genuinely new
endpoint is needed); external evidence makes "a bare id is present" the better-supported default.

**6. What research changes.** Independent, fetched confirmation that Blackboard Ultra's
announcements resource generally carries a resolvable creator id — reframes Q28 (below) and turns
"Still missing (3)"'s open-ended new-endpoint risk into "one more same-family `/users/<id>` call,"
worth naming explicitly in the DECISIONS row rather than leaving the risk unsized.

## 10. R-71 · Each sync records which materials appeared, changed or vanished

**1. Standard practice.** Two well-worn shapes for "what changed since last run": (a) SCD Type 2 /
dbt-snapshot style — append a new row per change, stamp a `valid_to`/`missing_since` on a
superseded or vanished one rather than deleting it (bb2dash's own `bb_gradebook`/`bb_attempts`
append-per-run pattern, and its existing `missing_since_run` column, already follow this); or (b) a
generic jsonb-snapshot audit trigger comparing old/new row images on every write.

**2. Examples (fetched/found via search).**
- [dbt snapshots (dbt Labs)](https://www.getdbt.com/blog/track-data-changes-with-dbt-snapshots) —
  `dbt_valid_from`/`dbt_valid_to` metadata columns: new/changed rows append, superseded rows get
  `valid_to` stamped rather than deleted. Borrow the "stamp, don't delete" shape for the "vanished"
  case in plan (c) — a missing item gets a stamp (mirroring the `missing_since_run` column already
  in use by `stage_files`/`stage_content`) rather than disappearing from the view.
- [PGHist](https://pghist.org/) — a generic Postgres history/audit extension; its existence
  corroborates that bb2dash's already-chosen hand-rolled append-table shape (not a generic trigger
  log) is the leaner fit here, since only two entity types need it and both already have a natural
  per-run key.

**3. Pitfalls.** An append-only table with no retention rule grows forever (already flagged in
"Still missing (d)"); dbt's own docs warn snapshots need an explicit unique-key strategy or
duplicate "current" rows appear on a re-run — directly relevant to the newest-crawl-guard gap this
entry already names ("Still missing (e)"; sync 17 rewrote 139 rows from an older crawl).

**4. Maps onto this stack.** Either (i) a view over registered `bb_raw` rows ordered by
`captured_at`, keyed by Blackboard item id (cheap, matches the entry's own "view over bb_raw"
option), or (ii) append-per-run rows written by `stage_content`/`stage_files` themselves, stamped
`missing_since_run` on vanish. `v_course_stream` wiring reads whichever is built; `sync_change_lines`
gets real per-item names instead of aggregate counts.

**5. Size M** (view) **or L** (new tables), unchanged. **Seams:** pairs with R-64's `stage_content`
re-creation under row 158; needs the same newest-crawl guard R-64 needs.

**6. What research changes.** Confirms "stamp, don't delete" (already bb2dash's own pattern) as
standard practice rather than a local invention, and flags the newest-crawl-guard gap as a shared
dependency with R-64, not a separate risk. No split.

## 11. R-72 · The calendar-feed job either feeds data or is retired

**1. Standard practice.** Retire a scheduled job that has never received real input (14 straight
`skipped` runs) rather than build a parser for data that may never arrive; if kept, prefer a
maintained RRULE-aware ICS library over hand-rolled recurrence expansion.

**2. Examples (found via search).** [node-ical](https://github.com/jens-maus/node-ical) —
actively maintained, RRULE/EXDATE/RECURRENCE-ID-aware, sync and async parsing from string/file/URL —
the natural library choice only if Stack reverses Q24's default, since it already handles the
DST edge cases `calendar-push`'s `America/New_York` handling elsewhere in the record also worries
about. No second example needed: a two-line library choice, not a design problem.

**3. Pitfalls.** None beyond node-ical's own documented RRULE-expansion traps; the larger risk is
scope creep — building a parser for a URL that has been blank for 14 days.

**4. Maps onto this stack.** Retire path: a migration unschedules `bb2dash-ical-poll` (optionally
drops `ical_collect()` from `transform_tick` — coordinate with R-65's driver re-creation so both
land in one migration), one DECISIONS row amends R-15's iCal clause, worktree STATUS.md:34
corrected. Keep path (only if Q24 is reversed): node-ical inside a registered `kind='calendar'`
crawl payload, fixture cut from sync 62.

**5. Size S** (unchanged) either way. **Seams:** R-65's `transform_tick` re-creation is the natural
place to drop `ical_collect()` if retiring.

**6. What research changes.** Nothing changes the default (retire); confirms node-ical as the
concrete library if Stack answers otherwise, closing an open "which library" question at build time.

## 12. R-73 · Class meeting times name their true source and follow Blackboard if published

**1. Standard practice.** Heuristic day/time/week extraction from free-form text needs a confidence
score and a required human-confirm step before overwriting a trusted value — never a silent
overwrite of a higher-confidence (syllabus-sourced) row by a lower-confidence scrape.

**2. Examples (fetched).** [dbranno1/hopkinsyllabus](https://github.com/dbranno1/hopkinsyllabus)
(shared with R-67) — its date/week detector plus confidence score and mandatory review-before-save
step is the same shape this entry's own "Must respect" rule already requires. No second example
needed: this item is gated entirely on whether Blackboard's schedule endpoint returns anything at
all (the entry's own probe, "Still missing (1)"), which no library research can answer.

**3. Pitfalls.** 42 of 56 course payloads already carry an empty `schedule` key — an empty key is
evidence of "no data here," not "not yet checked," so the probe should treat a populated key on even
one course as the signal to build a writer, not treat 42 empty keys as inconclusive.

**4. Maps onto this stack.** Unchanged from the entry's own plan: one probe in Stack's logged-in tab
settles yes/no; if yes, `stage_courses`' re-creation writes `meetings` under the source+confidence
rule already in place.

**5. Size S** (unchanged, probe-only) **/ M** if a writer is needed. **Seams:** shares P-27's probe
sitting with R-66/R-69/R-70.

**6. What research changes.** Nothing changes the default; corroborates the confidence+confirm shape
already required by the record's own "Must respect" line.

## 13. R-75 · Assessment due dates and points come from one recorded source

**1. Standard practice.** Once two derivations of the same fact agree on 100% of real data (here:
`bb_content.detail`'s scanned fields equal the gradebook column's `possible`/`due_at` on 42/42
rows), retire the more expensive path and record the simpler one as authoritative — a closure, not
a new build.

**2. Examples (fetched, shared with R-66).**
[breitburg/python-kuleuven `docs/DATA.md`](https://raw.githubusercontent.com/breitburg/python-kuleuven/main/docs/DATA.md) —
independently confirms `possible`/`dueDate`/`enforceDueDate` as real Blackboard Ultra gradebook-
column fields, not bb2dash-specific guesses, corroborating that the gradebook column — not a
depth-12 content-tree scan — is the field Blackboard itself exposes these on.

**3. Pitfalls.** None new; the entry's own risk (STATUS's stale "bb_content's detailSource" claim)
is a documentation bug, not a data bug.

**4. Maps onto this stack.** Option (b): a DECISIONS row closing R-17's `slim()` clause, crawler
header and STATUS corrected; no schema or code change.

**5. Size XS** (unchanged, per the entry's own note).

**6. What research changes.** Nothing; external confirmation of the field names only reinforces
closing the clause as-is rather than reopening it for a "direct read" rebuild (option a).

## 14. R-76 · Blackboard item descriptions show on Classwork, or their capture is closed

**1. Standard practice.** Never render a third-party rich-text field as HTML without sanitizing it
first, even from a trusted-feeling upstream — server-render foreign HTML through a DOM-based
sanitizer rather than injecting it raw.

**2. Examples (fetched).**
- [breitburg/python-kuleuven `docs/DATA.md`](https://raw.githubusercontent.com/breitburg/python-kuleuven/main/docs/DATA.md) —
  (shared with R-70) documents that Blackboard's rich-text body field (`body.rawText`) is
  "Blackboard's rich-text dialect (not plain HTML)" with embedded `<a data-bbtype="embedded-app">`
  tags carrying escaped JSON — `bb_content.body`/`detail->'description'` is unlikely to be
  plain-safe text once populated from real course data, contradicting the entry's implicit
  assumption that it is displayable as-is.
- [kkomelin/isomorphic-dompurify](https://github.com/kkomelin/isomorphic-dompurify) — the standard
  Node+browser-shared sanitizer, lazily creating a jsdom window server-side. Borrow it directly if
  descriptions are ever rendered, sanitizing once at read time (not at ingest, so a later sanitizer
  update doesn't require re-scraping `bb_content`).

**3. Pitfalls.** The entry's own "Still missing (2)" plan (stage_content copies the body, the Stream
or tree exposes it) has no sanitization step today — a real gap CLAUDE.md's "Sanitized HTML" rule
already requires closing before this could ship, not an optional hardening.

**4. Maps onto this stack.** If Stack answers Q31 yes, `stage_content` still just copies the raw
field (sanitizing at ingest risks losing content a future sanitizer version would have kept); the
web read path (`v_course_stream` or the Classwork tree) sanitizes with `isomorphic-dompurify` at
render, the same pattern any other future Blackboard rich-text surface should use.

**5. Size stays M if built** (now specifically because of the added sanitization step, not just the
Stream-contract change); **S if closed** by DECISIONS row (unchanged).

**6. What research changes.** Adds a concrete, sourced reason the "show it" branch needs a
sanitization step folded into "Still missing (2)" before it could ship — doesn't flip Q31's default
(No unless nearly free), but raises the bar for "nearly free" since Blackboard's own rich-text
dialect is now confirmed non-trivial to render safely.

## Research-added requirements

| Title | Why | Size | For |
|---|---|---|---|
| Sanitize `bb_content.body`/`detail->'description'` before any future render | Blackboard's rich-text field is its own dialect with embedded tags (breitburg `DATA.md`), not plain HTML; CLAUDE.md's "Sanitized HTML" rule already requires this and R-76's plan omits it | S | R-76 |
| Carry `contentHandler` into `bb_content` in R-64's key-change migration | R-69's URL type-segment and R-63's near-duplicate grouping both need a content-type signal already present in every `bb_raw` payload; free once `stage_content` is re-created anyway | S | R-64, R-69, R-63 |
| Build R-69's `bb_url` from the externally-confirmed template now; treat the live check as confirmation, not a gate | A dozen live Blackboard Ultra tenants (`gh search code`, 2026-09-24) show the exact shape; waiting on Stack's tab turns a two-line SQL expression into a blocked task | S | R-69 |
| Cache `creatorUserId` → display-name resolution per crawl run (`course_staff` first, one `/users/<id>` call per miss) | Avoids one HTTP round-trip per announcement per course per sync; pattern documented externally (glama.ai `user-resolver.ts`) and `course_staff.bb_user_id` already exists to seed it | S | R-70 |
| Log a zero-match count on every `ATTEMPT_FIELD_KEYS`/`AUTHOR_KEYS` probe instead of silently returning null | The exact bug already live (`personName()` discards bare ids) is the generic "silent default hides a real miss" failure mode documented externally; a visible miss-count turns a five-crawl-old blind spot into a one-sync-visible one | S | R-66, R-70 |
| Use one vanish convention (`missing_since_run`) across R-71's new history record and R-64's ghost collapse | dbt-snapshot's "stamp, never delete" is the standard shape and bb2dash already half-has it; R-64 and R-71 land in the same phase (row 158) and should not invent a second vanish column between them | S | R-71, R-64 |

## Questions for Stack

Only the two carried §6 questions whose research-grounding changes their default are repeated here;
24, 25, 26, 27, 29 and 31 are confirmed unchanged by this pass (see their R-number sections above)
and are not repeated.

28. **If Blackboard's announcement data carries no poster we can name without a new endpoint, drop
    the author from the bell and Announcements page, or keep showing 'not recorded'?** New default:
    probe first as planned, but expect a resolvable id. An independent, fetched reverse-engineering
    of a second live Blackboard Ultra tenant documents `creatorUserId` on the announcements resource
    by name, resolved via `GET /learn/api/v1/users/{id}` — matching bb2dash's own diagnosis that
    `personName()` already discards a bare id rather than the field being absent. Resolve it the
    same way the crawler already resolves other ids (`course_staff.bb_user_id` first, one
    `/users/<id>` fallback), recorded in its own DECISIONS row. Why: lowers "Still missing (3)"'s
    new-endpoint risk from open-ended to "one more same-family call," so dropping the author is now
    the less likely outcome, not a coin flip.
30. **Build each assessment's Blackboard link from the course id and item id once one real link
    confirms the URL shape?** New default: yes, build it now. A dozen independently-run Blackboard
    Ultra deployments (`gh search code`, 2026-09-24) show the identical
    `/ultra/courses/_<courseId>_1/outline/<type>/_<itemId>_1[?courseId=...&gradeitemView=details]`
    shape, keyed on exactly `courses.bb_id` and `assignments.bb_item_id`; a single live check (P-27's
    probe sitting) confirms rather than discovers the shape. Why: the original "stays null" call
    (64_W15:489-491) predates this evidence; composing it needs a type-segment map (file /
    assessment-test / discussion / assignment) fed by R-64's `contentHandler` carry-through, not a
    wait on Stack's tab.

## Sources

- [breitburg/python-kuleuven `docs/DATA.md`](https://raw.githubusercontent.com/breitburg/python-kuleuven/main/docs/DATA.md) — fetched (WebFetch) 2026-09-24
- [breitburg/python-kuleuven](https://github.com/breitburg/python-kuleuven) — fetched (WebFetch) 2026-09-24
- [dev.to: The Queue Was a Table](https://dev.to/romiteld/the-queue-was-a-table-how-i-built-claimunclaim-workers-with-skip-locked-stale-recovery-and-1ojm) — fetched 2026-09-24 (search)
- [dev.to: When Your API Keeps Changing](https://dev.to/__c1b9e06dc90a7e0a676b/when-your-api-keeps-changing-my-battle-with-dynamic-json-parsing-2ejf) — fetched (WebFetch) 2026-09-24
- [ElizabethSobiya/classify-filename](https://github.com/ElizabethSobiya/classify-filename) — fetched (WebFetch) 2026-09-24
- [dbranno1/hopkinsyllabus](https://github.com/dbranno1/hopkinsyllabus) — fetched (WebFetch) 2026-09-24
- [GitLab: deduplicate database records](https://docs.gitlab.com/development/database/deduplicate_database_records/) — fetched (WebFetch) 2026-09-24
- [twpayne/find-duplicates](https://github.com/twpayne/find-duplicates) — fetched 2026-09-24 (search)
- [uoshvis/find-duplicate-files](https://github.com/uoshvis/find-duplicate-files) — fetched 2026-09-24 (search)
- [PJDude/dude](https://github.com/PJDude/dude) — fetched 2026-09-24 (search)
- [caioba-codes/blackboard `LMS.md`](https://github.com/caioba-codes/blackboard) — found 2026-09-24 (`gh search code`)
- [BlackboardFS/bbfs](https://github.com/BlackboardFS/bbfs) — found 2026-09-24 (`gh search code`)
- A dozen live Blackboard Ultra course pages (bu.edu, pxl.be, cuhk.edu.hk, wm.edu, jcu.edu.au, ole.bris.ac.uk, gvsu.edu, durham.ac.uk, gwu.edu, and others) — found 2026-09-24 (`gh search code "ultra/courses"`, `"outline/file"`, `"assessment"`, `"content/"`)
- [glama.ai: `user-resolver.ts`](https://glama.ai/mcp/servers/@iceener/linear-streamable-mcp-server/blob/ba9763a6bc1aef7ed1c61a919608e4ffe4a43348/src/utils/user-resolver.ts) — fetched 2026-09-24 (search)
- [dbt snapshots — dbt Labs](https://www.getdbt.com/blog/track-data-changes-with-dbt-snapshots) — fetched 2026-09-24 (search)
- [PGHist](https://pghist.org/) — fetched 2026-09-24 (search)
- [node-ical](https://github.com/jens-maus/node-ical) — fetched 2026-09-24 (search)
- [kkomelin/isomorphic-dompurify](https://github.com/kkomelin/isomorphic-dompurify) — fetched 2026-09-24 (search)
- [Strapi: what is a single source of truth](https://strapi.io/blog/what-is-single-source-of-truth) — fetched 2026-09-24 (search)

Repo sources (read directly, not web): `docs/planning/sprint-2/91_REQUIREMENTS_v3.md` §1.4, §2
(P-22..P-29), §4, §6; `project-state/STATUS.md`, `project-state/ORCHESTRATOR.md`;
`docs/planning/sprint-2/82_PHASE14_containers.md`;
`docs/planning/sprint-2/research/82_RESEARCH_phase14_R5_bb2dash_inventory.md`;
`docs/planning/sprint-2/research/92_RESEARCH_sprint2_sync-runner-login.md` (cross-referenced for the
R-81..R-87/P-33..P-43 boundary this cluster's items touch but do not own).

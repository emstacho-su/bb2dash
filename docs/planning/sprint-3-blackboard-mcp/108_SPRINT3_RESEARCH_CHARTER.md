# 108 — Sprint 3 research charter

Date 2026-09-29 · Author: PM session (Fable) · For: the three Sonnet researchers of `107_` §8 and
the PM who synthesises them into `110_`. Read `107_SPRINT3_INTAKE.md` first; §A below is the facts
the repo already holds, so no stream re-derives them.

## 1. Standard

* Every claim cites a fetched source (URL) or a repo path with a line. A claim that rests only on a
  search-engine summary says so. Nothing is invented; an unverifiable claim is marked "unverified".
* **Egress from the cloud sandbox blocks `docs.anthology.com`, `help.anthology.com` and
  `docs.blackboard.com`** (checked 2026-09-29). Use WebSearch summaries for those, GitHub source
  (raw.githubusercontent.com works), Anthology's public GitHub demos (`blackboard/BBDN-*`), university
  knowledge bases and mirrors, and say which.
* Read-only: no repo file is written except the stream's own report; no live call to Blackboard
  (the live probe is Stack's, `107_` §7 step 2).
* Shape, per item: **Standard practice · Examples (fetched) · Pitfalls · Maps onto this stack ·
  Verdict**, the sprint 2 research shape (`../sprint-2/research/92_RESEARCH_sprint2_ingest-data.md`).
  Open with a §0 Summary (under 250 words) and close with "Questions for Stack" only where §6 of
  `107_` does not already ask it. Cap: about 2,500 words per report.

## 2. Streams

### S3-R1 · access-routes — `research/109_RESEARCH_sprint3_access-routes.md`

1. **Route A, official REST.** The registration rule (developer portal application → Learn admin
   registers the integration → optional End User Access for three-legged OAuth). Quote the rule. Is
   there any path for an end user alone? What does SU's Answers wiki say about integration requests
   (Online Learning Services, "at the request of campus users", courtesy integrations unsupported)?
   Draft the one-paragraph request Stack would send if he chooses to (personal, read-only, his own
   data, the scopes involved).
2. **Route B, cookie session from Node.** Which cookies carry the Blackboard session (`BbRouter`,
   `JSESSIONID`, `xsrf` inside `BbRouter`), what `X-Blackboard-XSRF` is and which calls need it, what
   happens on expiry (401? 302 to the login host? an HTML body with 200?), whether `User-Agent` or
   `Origin` matters, and how the expiry embedded in `BbRouter` is read. Evidence from open-source
   clients (campus-cli's `src/providers/blackboard/api/client.ts` and `auth/login.ts`), from
   Blackboard's own documentation of the internal API where any exists, and from tenant write-ups.
3. **The Entra side.** Which Microsoft cookies (`ESTSAUTHPERSISTENT` and kin) let a persistent
   Playwright profile re-mint a Blackboard session without Duo, for how long by default, and what
   an institution's Conditional Access can shorten (sign-in frequency, persistent browser session).
   Relate to Task 0's design (§A.1) without repeating the sprint 2 research.
4. **The mobile route.** The Blackboard app authenticates through the institution's SSO in a
   web view and then calls REST with a token: is that token obtainable and usable by a third
   program, is it documented, and is it any better than the cookie (lifetime, scope)? Verdict only
   if the evidence is strong; otherwise "not pursued, because…".
5. **Rate limits and etiquette.** Any documented or observed limit on `/learn/api/…` for a
   session-cookie client; what the Ultra UI's own request rate looks like; the sequential,
   one-request-at-a-time rule the crawler already follows.
6. **Policy.** Quote what SU's IT policies (its.syr.edu, the Computing and Electronic
   Communications Policy or successor) and Blackboard's terms say about automated access to one's
   own account. Say plainly what is stated and what is silent. No legal advice.

### S3-R2 · comparables-and-parity — `research/109_RESEARCH_sprint3_comparables-parity.md`

1. **Comparables, one section each**, minimum: `alejooroncoy/campus-cli` (the closest: MCP SDK,
   Playwright login capture, Entra SSO, public-v1-only rule, 27 tools, elicitation before mutations,
   `~/.blackboard-cli/session.json`); `sanjacob/BlackboardSync` (desktop sync of course files with
   a cookie login, multi-university); `breitburg/python-kuleuven` (already cited in sprint 2 for the
   CDN chain and `creatorUserId`); any Blackboard CLI or MCP server on GitHub or the MCP registries
   updated in 2026. For each: language, auth mechanism, session store and permissions, expiry
   detection and re-login, endpoints used (public vs internal), pagination, error surface, tests
   (recorded fixtures?), tool list and naming, what is read-only, licence. Borrow / avoid lines.
2. **Parity map.** For each of the crawler's thirteen calls (§A.2 table): the public-v1 equivalent
   if one exists, the fields it lacks against what the stages read (§A.3), and whether the internal
   call is therefore required. Name the public endpoints with their documented shapes
   (courses, contents, contents/{id}/children, gradebook/columns, gradebook/columns/{id}/users/{me},
   gradebook/users/{me}, announcements, calendars/items, attempts). Mark every fact as
   documented / observed-elsewhere / unverified.
3. **Files.** Does any comparable fetch file bytes with the cookie from Node (the `bbcswebdav` →
   signed CDN chain, `108_` §A.4)? What headers, how many hops, what breaks.
4. **What the crawler reads that nobody else does**: the attempts chain (grade → attempts →
   detail, `studentSubmissionFiles[].file.permanentUrl`), `embedsDeep` over assessment
   instructions, `@view=Summary` children. Any comparable covering these? Otherwise say "bb2dash
   is the only source; the internal call stays".

### S3-R3 · mcp-architecture — `research/109_RESEARCH_sprint3_mcp-architecture.md`

1. **Candidates** (at least three), each with a diagram in words and a trade-off table:
   (a) one TypeScript package: client library + `bb` CLI (`login`, `whoami`, `sync`, `pull`) + stdio
   MCP server, sibling to `mcp-server/`; (b) the same library, MCP server only, `bb-sync` drives it
   through Claude; (c) the library inside Phase 14's runner image with the MCP server as a second
   container command. Score against: B-43 (no LLM in the sync path; Claude away from the cookie),
   R-28/R-86 portability (Windows laptop today, container later, no OS-bound code outside thin
   adapters), the `bb_raw` envelope contract (§A.3) kept byte-compatible, cost ($0), tests without
   a live tenant, and how `/bb-sync`, B-45's scheduled request and Phase 14's `sync_*` RPCs call it.
2. **Session store.** Where it lives on Windows and in a container, permissions, exclusion from
   vault/RAG (`harness` excludes `bb-profile` already), rotation = re-login, and the rule that no
   tool result, log line or error carries a cookie value (the materials server's `Fix:` errors as
   the model). Playwright persistent profile vs `storageState` JSON vs a raw cookie header: which
   the login command should produce and why.
3. **Transport and registration.** stdio (as `mcp-server/`) vs streamable HTTP; `claude mcp add-json`
   at user scope; env vs file for configuration; how the same server would be reached from the
   Phase 21 workspace container later. Default with reasons.
4. **Tool surface for sprint 3 (read-only).** Propose names, inputs, outputs and `readOnlyHint`
   annotations; which tools return Blackboard data to the model and which only write `bb_raw` and
   return counts (the sync). Elicitation for any later mutation, as campus-cli does.
5. **Tests.** Recorded, scrubbed fixtures (brief 100 task 8 planned one for the runner); contract
   tests that the envelope the client writes is what `stage_*` reads (the SQL runner from Phase 15
   can assert it against a fixture run in `begin … rollback`); the existing `web/test/crawler.*.test.ts`
   that import the crawler's pure functions and what happens to them.
6. **Seams to sprint 2** under `107_` §5 option (ii): exactly which Phase 14 tasks (brief 100) and
   Phase 18 tasks (brief 98: 5, 18, 19) change, which migrations are unaffected (091 `sync_*`,
   124–127, 131–136), and what Phase 19's register-first tick needs from the client (the `calendar`
   row last, `runAll({ runId })`'s validated uuid).

## A. Facts already on the record (cite these, do not re-establish them)

### A.1 Login and session

* Login: NetID + Duo through Microsoft Entra SAML, done by Stack in a persistent browser profile;
  no password or Duo secret stored; bb-sync stops on any login host
  (`../sprint-2/research/82_RESEARCH_phase14_R1_blackboard_login.md` lines 10–44;
  `92_RESEARCH_sprint2_sync-runner-login.md` lines 125–143; `skills/bb-sync/SKILL.md` step 1).
* Task 0 (Phase 14 task 3): baseline `GET /learn/api/public/v1/users/me` → 200 on 2026-09-29
  15:25Z from Stack's Chrome (Claude in Chrome, read-only); idle probes self-paced; reopen at about
  +1/3/7/14 days; KMSI = yes (`../sprint-2/verification/82b_NOVNC_SPIKE.md`; DECISIONS 2026-09-29).
  Sightings before it: 22–23.5 h survivals against a 4 h death (DECISIONS 2026-09-27 B-47).
* `KEEPALIVE_MINUTES` = 0 and B-45's hour stay provisional until Task 0 ends (brief 100 task 3).
* Phase 14's login design: Playwright image + Xvfb + x11vnc + noVNC on `127.0.0.1:6080`,
  `bb-profile` volume, `novnc_password` secret; fallback = `storageState` hand-off (brief 100 lines
  120–124, 710–713; R1 §(c)).

### A.2 The crawler's calls (all `/learn/api/v1`, GET, session cookie; `ingest/bb_crawler.js`)

| Purpose | Endpoint | Line |
|---|---|---|
| course list (filtered by term name) | `users/{me}/memberships?expand=course.effectiveAvailability,course.permissions,courseRole&includeCount=true&limit=10000` | 597 |
| course detail | `courses/{C}?expand=effectiveAvailability` | 582 |
| teachers | `courses/{C}/memberships?expand=user,courseRole&limit=50&membershipAvailable=true&roleBucket=TEACHING` | 583 |
| schedule (empty at SU) | `courses/{C}/schedule?sort=location(desc)` | 584 |
| announcements (paged) | `courses/{C}/announcements?limit=100` | 585 |
| grade categories | `courses/{C}/gradebook/categories?limit=100` | 586 |
| gradebook, every column | `courses/{C}/gradebook/grades?userId={me}&limit=100&sort=column.position(asc)&expand=lastAttempt,attemptsLeft,submissionStatus,column,column.restricted,canStudentViewGradeResults,column.isLateAttemptCreationDisallowed&includeNoGradeItems=true&skipExternalGrade=true&skipKnowledgeCheck=true` | 498 |
| content tree (recursive, paged) | `courses/{C}/contents/{id}/children?@view=Summary&expand=assignedGroups,selfEnrollmentGroups.group,gradebookCategory&includeInActivityTracking=true&limit=100` | 486 |
| full item (documents, assessments) | `courses/{C}/contents/{id}` | 490, 619 |
| attempts step 1, grade id | `courses/{C}/gradebook/columns/{col}/grades?expand=attemptsLeft&userId={me}` | 520 |
| attempts step 2, rows | `courses/{C}/gradebook/columns/{col}/grades/{gradeId}/attempts` | 540 |
| attempts step 3, files | `courses/{C}/gradebook/attempts/{aid}?columnId={col}&expand=toolAttemptDetail,attempts,attempts.toolAttemptDetail` | 555 |
| calendar (posted last = crawl complete) | `calendars?limit=10000` and `calendars/calendarItems?since=&until=` | 598 |

Newest 3 attempts per column (`ATTEMPT_LIMIT`), calc/unopened columns skipped (`shouldProbeColumn`,
line 263). `crawler.version = 4`. `downloadAll` (614) is legacy. The header's own notes (lines
16–30) record the pitfalls: relative URLs fail from an exec context; `/sessions/…` URLs 403 the
next day; internal announcements use `createdDate`/`modifiedDate`, public ones `created`/`modified`.

### A.3 The `bb_raw` contract the stages read

`bb_raw(id, run_id uuid, captured_at, bb_course_id, kind, payload jsonb)`, unique on
`(run_id, kind, coalesce(bb_course_id,''))` (migrations 002, 035:63); insert with the publishable
key only. Kinds: `memberships` (unread), `course` (one per course), `calendar` (the completion
marker); `ical` is written by the database itself (035:471). A registered run folds on its
`calendar` row or after 3 idle minutes; an unregistered run is quarantined (044).

| Stage (migration) | Reads from `payload` |
|---|---|
| `stage_courses` (034:170–296) | `course.name`, `teachers[name,email,role,userId]`, `schedule` (count only) |
| `stage_content` (026:93–200) | `content[] {id,title,type,path,state,modified,body,description,detail{url,file.url,…}}` |
| `stage_assignments` (084) | `gradebook[] {columnId,name,possible,due,contentId,submissionStatus,isCalc}`, `content[] {id,url,detail.url,detail.file.url}` |
| `stage_gradebook` (087) | about 25 keys per `gradebook[]` entry incl. `feedback`, `lastAttempt`; never `gradeCategories`, `schedule`, `groups` |
| `stage_attempts` (085) | `attempts[] {columnId,status,results[] {id,status,created,submitted,modified,score,exempt,receipt,files[] {id,name,mime,downloadUrl}}}`; `results[].text` lands only in `bb_attempts.raw` |
| `stage_announcements` (034:700–771) | `announcements[] {id,title,body,created,modified,isRead,author|creator|createdBy}` |
| `stage_files` (074) | `content[].embeddedFiles[] {name,url,mime}`, `detail.file` |
| `stage_gaps` (054) | typed tables only |

Phase 18 (brief 98 tasks 5, 18, 19) will bump this to v5 (`crawler.probe`, `authorUserId`,
`feedbackToUser` first) and re-create `stage_files` (124); Phase 19 re-creates `stage_content` (131)
and the driver (135–136, register-first, 30-minute terminal rule).

### A.4 Files

`bbcswebdav` URLs 302 to a cross-origin CDN with no CORS; page JS cannot read the bytes
(`PHASE2_FINDINGS.md`). Since 2026-09-29 `ingest/fetch_signed.mjs` walks the chain one hop at a time
(`maxRedirects: 0`, at most 3 hops, final host on `.content.blackboardcdn.com`) inside the page, and
`pull_files.mjs --fetch` downloads the signed URL from Node without a cookie. Outcomes: `ok`,
`session_expired` (401/403 on hop 1), `gone` (404), `refused` (DECISIONS 2026-09-29). The public API
"with a token" was noted for bytes and never pursued.

### A.5 The materials MCP server (the template)

`mcp-server/`: stdio only, `McpServer` from `@modelcontextprotocol/sdk` (`src/server.ts:21–38`),
tools as factories `{name, config{title, description, zod shape, annotations}, handler}` with
`readOnlyHint`, bad input as a tool error; `SUPABASE_SERVICE_ROLE` + `SUPABASE_URL` from env, refuses
the harness-memory project; fetch client with zod row validation; typed errors carrying a `Fix:`
hint; vitest with fetch mocked plus a live `scripts/smoke.mjs`; registered with
`claude mcp add-json bb2dash … -s user` (`README.md:82–100`).

### A.6 Decisions that bind (full rows in `project-state/DECISIONS.md`)

2026-09-03 publishable key, insert-only · 2026-09-10 D-3 no scheduled crawl (partly reversed by
B-45) · 2026-09-10 fold registered runs only · Requirements v2 §5 "no new Blackboard endpoints"
(reversed for attempts and creator) · 2026-09-27 B-43 no LLM in the sync path, Claude away from the
SU cookie · B-44 `/inbox-apply` out of the container sync · B-45 07:00 New York scheduled request,
off until cut-over · B-47 Task 0 · brief 100 frozen #4 noVNC login · 2026-09-14 Playwright MCP over
the built-in browser and the Chrome extension.

### A.7 Prior art found on 2026-09-29 (starting points, not conclusions)

* `alejooroncoy/campus-cli` (GitHub; TypeScript; MCP SDK + Playwright + axios; README and
  `src/providers/blackboard/{auth/login.ts, api/client.ts, mcp-tools.ts}`): persistent profile at
  `~/.blackboard-cli/browser-profile`, waits for `JSESSIONID` or `BbRouter` on `/ultra`, validates
  with `/learn/api/public/v1/users/me`, expiry parsed from `BbRouter` and from Entra's
  `ESTSAUTHPERSISTENT`, 3 h fallback TTL, `silentRelogin` from the profile, `X-Blackboard-XSRF`
  when a token exists, 401 → `SESSION_EXPIRED`, `assertPublicApiUrl` refuses internal paths.
* Three-legged OAuth doc (help.blackboard.com, via search summary): an administrator must register
  the integration and enable End User Access before any student consent flow exists.
* SU Answers wiki "Blackboard Integrations" (answers.atlassian.syr.edu, blackboard01 space, page
  154387055): integrations installed by Online Learning Services with Academic Applications and
  Platforms, some "at the request of campus users", courtesy integrations unsupported; help@syr.edu.

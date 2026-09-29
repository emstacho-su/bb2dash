# 107 — Sprint 3 intake: a Blackboard MCP server in place of the crawler

Date 2026-09-29 · Author: PM session (Fable) · Product manager: Stack · Status: **PROVISIONAL —
research phase opened; every product call below is a default until Stack answers §6.**
Method: the sprint 2 one (`../sprint-2/90_SPRINT2_INTAKE.md`): Stack's goal → what the record
already knows → researchers → ONE question batch with a default each → synthesis → briefs → workers.
Numbering continues the repo-wide sequence (`../README.md`): this file is 107, the research charter
is 108, the research reports are `research/109_*`, the synthesis will be 110, briefs 111 and up.
Migrations: sprint 2's blocks end at 149, so sprint 3 starts at **150** (reserved 150–159; recorded
in DECISIONS when the first build brief freezes). Nothing in this sprint is built until the
research phase closes with Stack's go.

## 0. Stack's goal (his words, 2026-09-29)

> "a new sprint, Sprint 3. This sprint will be pretty narrowly scoped, with the only goal being to
> create an explicit MCP for blackboard. The purpose of this MCP is to replace the crawler feature
> of my app. The first phase of this project is to begin research, both on how to implement this
> as well as on the feasibility of creating an MCP for a web application that I am a user for
> (no admin or developer permission)."

The PM's reading, to be confirmed in §6 Q2: "the crawler feature" is everything that today can
only run inside a logged-in Blackboard tab — the crawl itself (`bb-sync` step 3), the login probe
(step 1's `location.href` read) and the redirect walk of the file pull (step 4b's browser half).
A Model Context Protocol (MCP) server is a process that exposes named tools to Claude Code over
stdio; the materials server in `mcp-server/` is the one bb2dash already runs. "Replace the
crawler with an MCP" therefore means: a Node process that talks to Blackboard itself, with a
credential it holds, and exposes what it reads as tools — instead of a 631-line script pasted
into a browser tab by a Claude session.

## 1. What is being replaced (the inventory, from the repo at `main` de7c644)

* `ingest/bb_crawler.js` v4 (631 lines): thirteen GET endpoints, all `/learn/api/v1` (Blackboard's
  internal JSON, the one the Ultra UI itself calls), all authorised by the tab's session cookie;
  it POSTs three `bb_raw` kinds (`memberships`, `course` ×7, `calendar`) with the publishable key
  under an insert-only policy. The `calendar` row is the crawl-complete marker the tick reads.
* The `bb_raw` → typed-table contract: eight SQL stages (`stage_courses` 034, `stage_content` 026,
  `stage_files` 074, `stage_assignments` 084, `stage_gradebook` 087, `stage_attempts` 085,
  `stage_announcements` 034, `stage_gaps` 054) driven by `run_transform` (051) and `transform_tick`
  (044, pg_cron every 2 min). The keys each stage reads are listed in `108_` §A.2. **The stages
  are not being replaced**; whatever feeds `bb_raw` must keep feeding it in the same shape, or the
  sprint grows to a transform rewrite (§6 Q3).
* `skills/bb-sync/SKILL.md`: the browser is required for step 1 (login probe), step 3 (the crawl)
  and the redirect walk in 4b (`ingest/fetch_signed.mjs` runs its hops in the page); everything
  else is SQL or plain Node (`pull_files.mjs --fetch`, `embed_corpus.mjs`).
* Stale skill docs that describe the old crawl: `ingest/AGENT_BRIEF.md` (anchor-click downloads),
  `skills/bb-course-map` (refreshes via an unregistered `bb.crawl`, which the tick quarantines),
  `skills/bb-course-pull` step 3 and step 6.

## 2. What the record already established (do not re-derive; sources in `108_` §A)

**Login and session.** SU signs in through Microsoft Entra SAML plus Duo; the login is a human
step, done in a persistent browser profile, and no password or Duo secret is stored anywhere. The
bb-sync skill stops on any login host and never fills credentials. Session lifetime is unknown:
sightings disagree (22–23.5 h survivals against a 4 h death) and Stack's own experience is that
"stay signed in never works" at SU — read by research as an Entra Conditional Access or KMSI
override that a non-admin cannot see. **Task 0** (Phase 14 task 3) is measuring it now: baseline
`GET /learn/api/public/v1/users/me` → 200 at 2026-09-29 15:25Z, idle probes self-paced, reopen
probes at about +1/3/7/14 days, KMSI = yes. Its numbers matter to this sprint exactly as much as
to Phase 14: **no MCP changes how long an SU session lives.**

**REST access from a student account.** Both `/learn/api/v1` (internal) and
`/learn/api/public/v1` (documented) answer to the session cookie. No developer key, OAuth app
registration or admin route was ever considered; the one trace is "needs the public REST API with
a token" for file bytes, which the signed-CDN fetch later solved without one. No rate limit or
429 was ever seen (the crawler is sequential). Known refusals: the v3 attempts route returns an
empty list for a student, discussions return 403/404 on v1, `courses/{C}/schedule` is empty at SU,
`/sessions/…` file URLs die overnight, and `fetch` from Playwright's `evaluate` failed where the
page's own requests worked.

**Decisions that constrain a Blackboard MCP** (each needs a new DECISIONS row to reverse):

| Row | What it fixed | How it bears on this sprint |
|---|---|---|
| 2026-09-03 | The crawler holds only the publishable key; `bb_raw` is insert-only | An MCP server on the laptop could hold more; default: it holds no more (§6 Q6) |
| 2026-09-10 (D-3) | Stack triggers; no scheduled crawl (Duo) | Partly reversed by B-45 (a 07:00 New York container sync once the login lives) |
| 2026-09-10 | Fold only crawls registered on an owner-claimed `agent_requests` row | Unchanged: the MCP's sync registers exactly as the skill does |
| Requirements v2 §5 | "No new Blackboard endpoints" (reversed only for attempts and creator) | Public-v1 equivalents of the crawler's calls are new endpoints (§6 Q8) |
| 2026-09-27 B-43 | The container sync is deterministic Node + Playwright, **no LLM in the path**, which "keeps any Claude process away from the SU cookie" | The sharpest tension: an MCP server *is* a Claude-driven surface. Resolution proposed in §4 |
| 2026-09-27 B-44 | `/inbox-apply` stays out of the container sync for the same reason | Unchanged |
| Brief 100 frozen #4 | A browser in a container with a noVNC login is Phase 14's login design | An MCP whose client runs outside a browser makes noVNC unnecessary for the *sync*; the login capture still needs a browser somewhere (§5) |
| 2026-09-14 (R1) | The Playwright MCP was chosen because its profile persists; built-in browser and Chrome extension judged unreliable | Task 0 now runs on Claude in Chrome; the MCP's login capture would use its own Playwright profile |

## 3. Feasibility, as far as a desk read can take it (2026-09-29, before the research streams)

Three routes exist for a program to read Blackboard as Stack, without admin or developer rights
on the SU tenant:

| Route | What it needs | Verdict today |
|---|---|---|
| **A. Official REST with an application key** (Anthology developer portal + three-legged OAuth so the app acts as Stack) | A **Learn administrator must register the integration** in the SU tenant before any credential exists, and must enable End User Access for the consent flow. SU's own Answers page says integrations are installed by Online Learning Services "at the request of campus users" and that courtesy integrations are unsupported. | **Not available without an ask to SU ITS**, and the ask may be refused. It cannot be the sprint's plan; it can be a parallel request if Stack wants one (§6 Q4). |
| **B. Cookie-session REST from Node, outside any browser** | One human login in a Playwright-launched window; capture `BbRouter`/`JSESSIONID`; send them as `Cookie` with `X-Blackboard-XSRF`; read `BbRouter`'s embedded expiry; 401 = session dead; re-login by hand (or silently from the persistent profile while Entra's own cookies live) | **Proven elsewhere on a Microsoft-SSO tenant**: `campus-cli` (alejooroncoy, TypeScript, MCP SDK, 27 tools, public v1 only, updated 2026-09-01) does exactly this for UPC's Blackboard Ultra behind Entra. This is the route the sprint researches in depth. What it does not prove: that SU's `/learn/api/v1` calls (gradebook `grades?expand=…`, `calendarItems`, the attempts chain) work with the same headers from outside the page, and how long the cookie lives at SU. |
| **C. Keep the browser as the transport** (status quo; Phase 14's noVNC container) | What exists | The baseline the MCP is measured against; Phase 14's sync half is this route containerised. |

**Where the risk really sits.** The MCP part is ordinary engineering (the materials server is the
template; campus-cli is the comparable). The hard part is unchanged by this sprint: an SU session
that dies on Entra's schedule, re-lit only by a human with Duo. What route B changes is *who needs
the browser and when*: only the login needs it, on the laptop where Stack is; the sync and the
tools do not. That is the whole case for the sprint, and it is also why Task 0's numbers decide
how useful the result is.

**Stack's concern, 2026-09-29, before any planning goes further:** "consider the feasibility of doing this given
the 2fa barrier and failure of keep me signed in... These are what forced me to use a crawler initially and I am
unsure of any workarounds." The PM's answer, on the record: no MCP server and no client-side design gets around
Duo or Entra; every legitimate client lives inside the session one human approval creates, the tab crawler
included. Two clocks bound that session (Blackboard's inactivity `timeout` in `BbRouter`; Entra's sign-in
frequency and persistent-session policy, which "stay signed in" failing at SU suggests is narrowed). The only
route that takes Duo out of the loop is route A (official REST with three-legged OAuth and refresh tokens),
which needs an SU administrator. So the research phase is **reordered: the two lifetime numbers come first**
(Task 0 for the Entra clock; `scripts/bb-probe.mjs` for Blackboard's clock, one run), and the design decision
is made from them: a login that lasts about a day makes a cookie client plus one Duo tap each morning a real
improvement; a login that lasts hours leaves the ITS request or "sync only while signed in" as the honest
options, and shrinks the MCP's value to "no browser in the sync" plus interactive tools. §6 Q1's default stands
as (iii). The one input only Stack can give: what "keep me signed in" failing looks like in practice (Duo on
every Chrome launch, once a day, or after some idle hours).

## 4. The B-43 tension, and the shape the PM proposes (a default, §6 Q2)

B-43 keeps Claude away from the SU cookie and keeps an LLM out of the sync path. A Blackboard MCP
server does not have to reverse either:

* **One client library, two front-ends.** A Node package holds the Blackboard client (session
  store, HTTP client, endpoint functions, the `bb_raw` envelope writer). The **sync** is a CLI
  command over that library — deterministic, no LLM, the same registered-run contract — and is
  what `bb-sync`, Phase 14's runner and B-45's scheduled request would call. The **MCP server** is
  a second front-end over the same library: tools for questions and one-off reads
  (`whoami`, `list_courses`, `course_stream`, `my_grades`, `pull_course`…).
* **The model never sees the cookie.** The server process holds the session file; tool results
  carry Blackboard data, never headers or cookie values; a tool that would print them does not
  exist. This is the same posture the materials server has with the service key.
* **Read-only in sprint 3.** No submit, upload or post tools (§6 Q7).

Under that shape B-43 and B-44 stand unchanged, and the "Claude drives the tab" model goes.

## 5. Where this sits against sprint 2 (Stack's call, §6 Q1)

Sprint 2's plan (`../sprint-2/94_SPRINT2_PHASES.md`) has three phases that touch the crawler:

* **Phase 18** tasks 5, 18, 19 (W-50) make `bb_crawler.js` v5: `CRAWLER_VERSION = 5`, `crawler.probe`,
  `authorUserId` and `feedbackToUser` first, author resolution via `GET /users/{id}`, key lists cut
  to verified names. Its migrations 124–127 change `stage_files`, `assignments.bb_url`, the iCal poll.
* **Phase 19** re-creates `stage_content` (131), adds `bb_material_history` (132–134), and makes the
  tick register-first (135–136), then rewrites bb-sync steps 2–4 (task 17).
* **Phase 14**'s sync half (W-55, W-56; R-81..R-87, R-89, R-93, R-94): a Playwright + Xvfb + noVNC
  container that injects `bb_crawler.js` v5 and calls `runAll`; `sync_register_run` and the ten other
  `sync_*` RPCs (migration 091); Task 0 and the noVNC spike (R-82).

Route B replaces the injected crawler and removes the need for a display in the sync container.
It does not touch the transform, the register-first tick, `sync_*` RPCs, the harness jobs, the dev
container or the images. So the options are:

| Option | What happens | Cost |
|---|---|---|
| **(i)** Sprint 3 after sprint 2, as planned | Phase 14 ships the noVNC runner with crawler v5; sprint 3 then replaces the runner's crawl step | The noVNC spike, Xvfb/noVNC image and crawler v5 are built and then retired |
| **(ii)** Sprint 3's build pre-empts Phase 14's sync half | Phase 14 keeps its container, secrets, harness-jobs and dev-container halves (W-57, W-58) and its RPC migration; W-55/W-56 are rewritten against the library's `sync` command; Phase 18's three crawler tasks are written against the library's endpoint functions instead of the pasted script; Phase 19 unchanged | The Phase 14 and 18 briefs are amended (one DECISIONS row each); Task 0 continues as is |
| **(iii)** Research only now; place the build after the synthesis | Nothing in sprint 2 moves until `110_` says what the build is | None yet |

**Default: (iii) for this phase**, with the PM's recommendation on the record now: if the live
probe (§7 step 2) shows the crawler's endpoint set works from Node with the cookie, take (ii).
Under every option Task 0 keeps running, the Phase 14 login numbers are this sprint's numbers,
and Phases 15–17, 20–22 are untouched.

## 6. The question batch (answer in one message; a default is taken where you say nothing)

| # | Question | Default the PM takes |
|---|---|---|
| Q1 | Placement against sprint 2: (i), (ii) or (iii) in §5? | (iii) now; (ii) recommended at the synthesis if the probe passes |
| Q2 | What is the MCP for: the sync only, an interactive tool surface for Claude only, or both? | Both, as one library with two front-ends (§4); the sync path stays LLM-free (B-43 stands) |
| Q3 | Does the new client keep writing `bb_raw` in the crawler's envelope (v5's shape, so every stage and Phases 18/19 stay as they are), or write typed tables directly? | Keep the `bb_raw` envelope, byte-for-byte compatible with what `stage_*` read; the transform is out of scope |
| Q4 | Ask SU ITS (help@syr.edu / Online Learning Services) to register a personal REST integration in parallel? It costs an email; the sprint cannot depend on it. | No ask from the PM; Stack sends one himself if he wants route A explored; the research writes the request text either way |
| Q5 | Where the login is captured: a Playwright-launched window on the laptop (campus-cli's pattern, persistent profile, `login` command), an export from his Chrome profile, or Phase 14's noVNC container? | Playwright persistent profile on the laptop, `bb login`; the container receives the profile or a `storageState` file (research R1's option c, which brief 100 already names as its fallback) |
| Q6 | Credential handling: the session file's location, permissions, exclusion from vault and RAG, what a tool may return | Outside every checkout (`%LOCALAPPDATA%\bb2dash\session.json` or the container's secret mount), owner-only, listed in the vault/RAG exclusions, never in a tool result, never printed; rotate = log in again |
| Q7 | Read-only in sprint 3? (no submit, upload, post, or mark-read tools) | Yes; file staging stays in bb2dash; a later sprint may add mutations behind elicitation |
| Q8 | Endpoint policy: public v1 only (documented, what campus-cli allows), or internal v1 where the crawler needs it (gradebook `grades?expand`, `calendarItems`, the attempts chain, content `children?@view=Summary`)? | Public where it covers the same fields; internal v1 where it does not, each such call listed with the evidence that it works from Node; Requirements v2 §5's "no new endpoints" row is amended by one DECISIONS row naming the list |
| Q9 | Package and runtime: a sibling package to `mcp-server/` (TypeScript, MCP SDK, stdio, vitest, `claude mcp add-json` registration), or something else? | Sibling package `blackboard-mcp/` (name open), same conventions as `mcp-server/` |
| Q10 | Acceptable use: does Stack accept personal, read-only automation of his own account as within SU's IT policies, once the research has quoted what those policies say? | The research quotes the policy; Stack decides; the client never fetches more than the Ultra UI itself loads, one request at a time, with a bb2dash `User-Agent` |
| Q11 | Sync cadence: unchanged from B-45 (one queued request at 07:00 New York while the login lives; off until cut-over)? | Unchanged |
| Q12 | The Windows `/bb-sync` skill after the build: a thin caller of the CLI `sync` (no LLM) or a Claude session calling MCP tools? | The CLI; the MCP is for questions and one-off pulls; the skill's report step stays templated |
| Q13 | Research-phase definition of done | A go/no-go memo (`110_`) with: the probe table (status per endpoint from Node with his cookie), the endpoint parity map (crawler v1 call → public-v1 equivalent or "internal only"), the policy quote, one recommended architecture with its seams to Phases 14/18/19, and a build-phase brief outline. Nothing built. |
| Q14 | Do the stale skill docs (§1 last bullet) get retired in this sprint's build phase? | Yes, in the build phase, not now |
| Q15 | Task 0 stays the lifetime measurement for this sprint; later the MCP's `whoami` tool becomes the probe? | Yes |
| Q16 | Will Stack run the live probe (`scripts/bb-probe.mjs`, §7 step 2) from his laptop with a cookie header copied from Chrome DevTools? It stores no bodies, prints status codes and top-level key names only, and never prints the cookie. | Yes, at his next sitting; the script rides this PR |
| Q17 | Anything else the MCP must do that the crawler never did (discussions, messages, rubric feedback, course files listing by folder, Ultra "Course Content" ordering)? | Nothing new in sprint 3; parity first |

## 7. Stack's steps for the research phase

1. Answer §6 in one message (or say "defaults" — every row then stands as written and goes to DECISIONS).
2. Run the live probe once, signed in to Blackboard in Chrome (about 10 minutes): open DevTools →
   Network → any `/learn/api/…` request → copy the `Cookie` request header value; then in PowerShell
   `$env:BB_COOKIE = '<paste>'; node scripts/bb-probe.mjs` from the repo root, and paste the output
   table back. The script's header says exactly what it sends and what it prints. Clear `$env:BB_COOKIE`
   afterwards. Optional second run an hour later with the same value, to see whether the cookie alone
   (without the browser) still answers.
3. Nothing else until `110_` is on the branch.

## 8. Research streams (owners: Sonnet researchers; charter `108_`)

| Stream | Question it answers | Output |
|---|---|---|
| S3-R1 access-routes | Routes A/B/C in §3 with evidence: the admin-registration rule, SU's integration process, the mobile-app auth route, cookie-from-Node mechanics (XSRF, `BbRouter` expiry, user-agent, 401 vs 302), rate limits, SU's IT policy text | `research/109_RESEARCH_sprint3_access-routes.md` |
| S3-R2 comparables-and-parity | campus-cli and the other open-source Blackboard clients (sanjacob/BlackboardSync, breitburg/python-kuleuven, bb-cli and kin): auth, session store, expiry handling, tool lists, mutation safety; then the parity map from the crawler's thirteen v1 calls to public-v1 equivalents | `research/109_RESEARCH_sprint3_comparables-parity.md` |
| S3-R3 mcp-architecture | Candidate architectures for bb2dash (library + CLI + MCP; transport; where it runs; the `bb_raw` envelope writer; recorded-fixture tests; registration; portability under R-28; seams to Phases 14/18/19), each with a trade-off table, and one default | `research/109_RESEARCH_sprint3_mcp-architecture.md` |

Then `110_SPRINT3_RESEARCH_SYNTHESIS.md`: what changed, the probe table, a second, shorter question
batch only if the research raises something §6 does not cover, and the go/no-go.

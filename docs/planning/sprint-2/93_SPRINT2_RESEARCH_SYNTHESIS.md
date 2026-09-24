# 93 — Sprint 2 research synthesis

Date: 2026-09-24. Author: PM session (Fable), Stage B of the sprint 2 planning prompt. Product
manager: Stack. Inputs: `91_REQUIREMENTS_v3.md` (§1 R-29..R-109, §2 P-1..P-65, §3 S2-*, §6) and the
ten research notes `research/92_RESEARCH_sprint2_<area>.md`, one Sonnet researcher per conceptual
area, written in parallel on 2026-09-24 (the containers-infra note was re-verified by a second pass
that corrected one dead citation). Where a note and this synthesis disagree, this synthesis is the
PM's call and says why.

How this file is used: §1 is read next to each entry of `91_` §1; §2's rows are appended to `91_` §2
as *research-added* steps P-66..P-113 in this order; §3 corrects the record; §4 lists risks the
requirements did not name; **§5 is the ONE question batch Stack answers**; §6 says what Stage C
takes as the default for anything he does not answer (DECISIONS 2026-09-23).

## 1. What the research changes, by requirement

Sizes are the researcher's, checked by the PM.

### 1.1 grades-validation (R-29..R-36, P-1..P-6)

| id | size | what the research changes |
|---|---|---|
| R-29 | S | Nothing structural: attention_items + apply_resolutions() is the standard reconciliation shape. The dates stay a batch item (B-9). |
| R-30 | M | P-1 widens: the GEO/ECN "0.0 %" figure is an engine gap, not two rows. `manual.ts` cannot tell "Blackboard posted a zero" from "nothing posted yet"; fix the distinction in the engine, then the rows. |
| R-31 | L | Confirmed against Great Expectations, dbt reconciliation PRs and accounting preparer/reviewer practice. Research 75's YAML `recheck` field is inert until something reads it (P-67). |
| R-32 | M (L if a view or column changes) | Invariants use **exact equality**, not a tolerance (exact numerics; D-14 keeps `numeric(9,3)`). P-2's two breaking lines in `db/tests/phase10b_grade_model.sql` (171–172, 251–255) are pinpointed. |
| R-33 | S | Keep the notes / `source_ref` default; one citation syntax everywhere, `bb_file:<id>#unit:<n>`, in verdict files and in `assignments.source_ref`. |
| R-34 | M | Two live defects in `scripts/validate-grading.ps1` beyond the known JSON crash: it passes `--restricted` and `--tools`, which the current Claude Code CLI does not have, and its `Write(...)` path rule is accepted but never consulted (only Read/Edit path rules are), so the "confined" session would have an unscoped Write tool. Claude Code's OS sandbox does not run on native Windows: confinement is permission rules only until the session runs in Phase 14's Linux dev container. |
| R-35 | S | Commit the export's generating SQL as a tracked file beside the dated markdown; the 2026-09-14 export drifted because only its output was versioned. |
| R-36 | S (rule line) | The sentence names the weights in **ranked order** (highest / median / lowest), which is how `rank-weighted.ts` applies them, not by exam number. Ships on its own, independent of Phase 13. |

### 1.2 web-polish (R-37..R-45, R-47..R-49, R-51, R-52, R-54..R-58, S2-home-1, S2-home-2, S2-materials-1, S2-bugs-1)

Nothing needs a new dependency or architecture; every item applies a pattern the repo already
proved once (the `/planner` `useHydrated` hook, `bb_gradebook`'s append-per-run shape,
`materials-collapse.ts`) to a second place.

| id | size | what the research changes |
|---|---|---|
| R-37 | M | Sequencing: the `v_course_stream` migration lands before the link and status UI, not with it. |
| R-38 | L | The history is an **append-per-run table shaped like `bb_gradebook`**, not a raw `bb_raw` diff; add a retention and index line. Gated on the same table as R-71 and on B-18. |
| R-39 | M (L merged with R-64) | Hide-by-default confirmed; the partial-unique-constraint pitfall becomes a Contract line. |
| R-40 | S | Cheapest, lowest-risk item in the cluster; an early win. |
| R-41 | L | The single 10-minute threshold becomes a **two-stage late / missing heartbeat** (late at one missed tick, missing at five); the same dead-man's-switch shape serves R-52 (P-71). |
| R-42 | S | Second instance of the Sync button's proven idempotent-trigger shape; no migration. |
| R-43 | S | Exactly the existing `use-hydrated.ts` pattern, called from `ItemPopout` only; `AssignmentDetailBody` must **not** be gated (shared with the un-Suspended assignment page). Three OSS repos use the identical hook. |
| R-44 | S | One CSS property; the proof walk batches with R-47 and R-55 in one sitting. |
| R-45 | S (M with a panel) | The caption removal ships now; the panel waits on B-22. |
| R-47, R-49, R-55 | S | Proof or gated items; scoped correctly. A live open DST bug in a recurrence library (rrule-temporal #141) shows the R-55 walk catches a real class of bug. |
| R-48 | S | Alert-fatigue literature strengthens closing the web half once the toasts are confirmed (B-26). |
| R-51 | M | fast-check's own docs confirm the unseeded `fcParams()` is a real defect; widen `coverage.include` before any threshold. |
| R-52 | M | The failure notice fires after **N consecutive failed ticks** (three, about six minutes), clearing on the next ok run; shares R-41's heartbeat design. |
| R-54 | S | `AFTER DELETE … REFERENCING OLD TABLE` confirmed against two production codebases; the trigger must tolerate zero-row matches because 083/088 already delete emptied series themselves; a new test file, not an append. |
| R-56 | M | Add a **flap guard**: a gap key that auto-closes twice within about a day is surfaced once, not closed silently again. |
| R-57 | S | Retiring `v_inbox_feedback` is technically right: the decisions store has an author field the view cannot add. |
| R-58 | S | The steady-state exclusion (conflicts_settled, shared_columns) becomes a written convention (P-72). |
| S2-home-1 | S | Root cause found: `UpcomingTracker.module.css` has `overflow-x: auto` with no wheel or pointer-drag handler, so a plain mouse gets neither (trackpad and touch already work). Fix once as a shared hook (P-69); watch the click-vs-drag regression. |
| S2-home-2 | S | Two shippable pieces: collapse (reuse `materials-collapse.ts` lifted to a shared module, P-70) and reorder (above NeedsAttention, which 12b made the page's last word). Default-open vs collapsed is B-2. |
| S2-materials-1 | M | A new nesting level of collapse state plus an accessible whole-header `<button>` with `aria-expanded` (MaterialsBrowser's own pattern, not `<details>`). |
| S2-bugs-1 | M scoped / L as a fresh intake | Two priced options from 80c's real worker/task shape: run steps 3–9 of the 12b method over the bugs already in §1 (about one worker-week), or a fresh page-by-page intake (about a phase). Default: scoped (B-7). |

### 1.3 styling (R-53, R-46, R-50, R-36 screen side, S2-styling-1, P-15..P-17)

| id | size | what the research changes |
|---|---|---|
| R-53 | L | The token audit and contrast checks stay **hand-rolled vitest scripts** (D-19 forbids new dependencies; web/ has no stylelint, postcss or css-tree). The theme boot script reuses the sidebar's inline-boot pattern (`html[data-theme]`), not next-themes. The toggle is **three-state Auto / Light / Dark**, default Auto, persisted only on an explicit pick; `color-scheme` follows the same attribute (globals.css:164 hard-codes dark). P-17's parser is keyed on (selector, name) and resolves one level of `color-mix()`. |
| R-46 | M (M+ with P-7's harness in the same PR) | Fold the nav at the **existing 720 px step** (where Search already disappears with nothing to reach it) instead of adding a ~640 px one. The 390 px check also asserts every nav item stays reachable (focus, `aria-expanded`, keyboard). PlannerWeek's `min-width` moves off the `overflow-x` element. |
| R-50 | S | A literal `favicon.ico` file (Next's docs: favicon cannot be code-generated); `apple-icon.png` in the same PR for free. |
| R-36 (screen) | S | Filed under styling only by the 2026-09-16 happenstance; ships on its own. |
| S2-styling-1 | folded into R-53 | The brief's "design canvas" is the **style-tiles** method: exactly three concepts, fragments not full comps, built as Artifact pages with a live toggle that already use the real token names. |

### 1.4 ingest-data (R-60, R-63..R-73, R-75, R-76, P-22, P-25..P-29)

Every item is a closure, a well-worn data-hygiene pattern or blocked on one of Stack's logged-in
probes. The substantial finding: **R-69's per-item URL shape is a known public template** (a `gh
search code` sweep of a dozen live Blackboard Ultra tenants, 2026-09-24) keyed on exactly the two ids
bb2dash stores, so it collapses from a discovery task into a two-line SQL derivation (B-39). A second
reverse-engineered tenant (breitburg/python-kuleuven) independently confirms R-70's `creatorUserId`
+ `GET /users/{id}`, R-60's three-hop download redirect, R-75's gradebook field names, and that
R-76's rich-text body needs sanitising before any render.

| id | size | what the research changes |
|---|---|---|
| R-60 | S | The curl workaround is promoted to a designed `--fetch` mode of `pull_files.mjs` (P-22), with discover and fetch as separate seams the Phase 14 runner reuses. |
| R-63 | S (P-26) / M (the rule) | Hash-first, location-as-metadata is the standard shape; a repeatable group-by-hash query. |
| R-64 | L (P-25 interim S) | `bb_item_id` is Blackboard's real content identity (independently confirmed); carry `contentHandler` into `bb_content` in the same migration for R-63, R-69 and R-76 (P-95). |
| R-65 | M | Open-at-claim plus a separate reaper is standard job-queue practice; add an attempts column to the terminal rule. |
| R-66 | S | `feedbackToUser`'s `{rawText, displayText}` shape is general; log a zero-match count on every key probe instead of a silent null (P-97). |
| R-67 | M | Ambiguous matches get a concrete multi-match shape (several candidates → one Inbox question) with confidence-scored confirmation. |
| R-68 | S | Fix the field, do not reorder the route resolver around it. |
| R-69 | S | Build `bb_url` now from the confirmed template plus a type-segment map; the live check confirms, it does not gate. |
| R-70 | S (M only if a new endpoint is needed) | Expect a resolvable `creatorUserId`; resolve against `course_staff.bb_user_id` first, one `/users/{id}` call per miss, cached per run (P-96). |
| R-71 | M as a view over `bb_raw` / L as tables | "Stamp, never delete" (dbt snapshot, SCD type 2) is the pattern bb2dash already half-has; one vanish convention (`missing_since_run`) shared with R-64 (P-98). |
| R-72 | S | Retire stays the default; `node-ical` is the library if Stack reverses B-33. |
| R-73 | S (probe) | Nothing changes; the confidence-and-confirm shape is already required. |
| R-75 | S (XS) | Close the clause as written. |
| R-76 | M built / S closed | If ever rendered, `bb_content.body` / `description` is Blackboard's own rich-text dialect and must be sanitised (CLAUDE.md's rule); the plan omitted it (P-94). |
| P-27 | S | The one probe sitting confirms rather than discovers two of its five targets (R-69, R-70). |

### 1.5 db-hygiene-tests (R-78, R-79, R-80, R-54, P-2, P-8, P-30, P-31)

| id | size | what the research changes |
|---|---|---|
| R-78 | S | `search_path = public, pg_temp` (082's convention), applied with 038's bulk do-loop shape. Live 2026-09-24 read: 7 / 2 / 1 as recorded; the org plan is **Free**, so leaked-password protection is a recorded acceptance (B-42). |
| R-79 | M | **Do not adopt pgTAP or `supabase test db`**: pgTAP would expose about fifty more functions on this project's public PostgREST surface and wants the declined local stack. Extend the repo's own `do $$ raise exception 'FAIL…' $$` convention with a small node-postgres runner over a **direct or session-pooler** connection (five files `set role` mid-transaction, which the transaction pooler breaks), one `pg.Client`, non-zero exit on any FAIL (P-99), a dedicated `db_test_runner` role (P-100). |
| R-80 | S | Unused indexes are **4, not 5** (`grade_column_links_component_idx` now has scans); write the DECISIONS row from today's count. |
| R-54 | S | Confirmed; idempotent zero-row match; a new test file. |
| P-30 | S | The vitest drift guard must become timestamp-agnostic once `captured_at` is `now()`-relative (P-101). |
| P-31 | S | `BB2DASH_TEST_DB_URL` in a gitignored `.env.local`; direct or session pooler, never port 6543. |

### 1.6 sync-runner-login (R-81..R-87, R-108, P-33..P-43)

| id | size | what the research changes |
|---|---|---|
| R-81 | L | Name the `fs.rename` EXDEV pitfall in P-36 (copy-then-unlink across the course-files volume). |
| R-82 | L | Chromium sandbox = **non-root + Playwright's shipped `seccomp_profile.json`**, not `--no-sandbox` (settles P-39; add to the /security-review list). VNC stack = **x11vnc + noVNC/websockify** (settles that half of P-38). R1's session-lifetime write-up was framed for Shibboleth; SU signs in through **Microsoft Entra SAML**, so Task 0's probes stay but the justification is Conditional Access sign-in frequency + KMSI. |
| R-83 | M | An **attempts counter** beside the dead-letter time threshold. |
| R-84 | M | Migration 091's grants name the queue read and the raise path explicitly; `ALTER DEFAULT PRIVILEGES`; connection logging. |
| R-85, R-86 | M | No change; P-40 / P-41 stay housekeeping inside task 14. |
| R-87 | S | 07:00 New York daily stays the placeholder; the hour is provisional until Task 0's numbers. |
| R-108 | S | The Action Center no-click case is a documented Electron/Windows limitation; holding the toast is right. Add: the Start Menu shortcut carries the AUMID. |

### 1.7 containers-infra (R-88..R-96, P-38, P-39, P-44..P-51)

| id | size | what the research changes |
|---|---|---|
| R-88 | M | `project_directory` on `include:` is best practice, not a bug workaround: docker/compose#11577 has been closed since 2024-03-05; the live pitfall is **docker/compose#13945** (include-level `env_file` is interpolation-only and never reaches a build arg or service env). `just` defaults to `sh` on Windows: pin `[windows] set shell := ["powershell.exe", …]` (P-105). |
| R-89 | M | The harness's `mcp-server/src/env-file.ts` is a ready pattern for the `*_FILE` shim. Neither gitleaks nor trufflehog is on PATH; `scoop install gitleaks`. |
| R-90 | L | No off-the-shelf scheduler does real missed-run catch-up: Ofelia (PR #833 merged 2026-09-10) still does not, and **node-cron's `missedExecutionTolerance` is drift tolerance, not catch-up** (P-106). Base-image manifest checks and per-image arm64 builds stay separate claims: `docker buildx build --load` cannot produce a local multi-platform image (P-109). |
| R-91 | S | Add a grep for stray `console.log` to the DoD: one breaks every MCP stdio call (P-107). |
| R-92 | L | Fork Anthropic's reference devcontainer with the base bumped to `node:22-bookworm` (upstream is still `node:20`) and `statsig.anthropic.com` dropped from the firewall allowlist (no public DNS; documented fatal failure, claude-code #55623) (P-108). |
| R-93, R-94, R-95, R-96 | S / S / M / M | No change; R-95's two live drifts ("After Phase 13", migration 090/091) are confirmed. |
| P-49 | S | The stale claude.ai-synced `bb-course-map` / `bb-course-pull` copies (updatedAt 2026-09-03) confirmed live; port `install-checkpoint.mjs`'s hash-verified copy pattern so the bare skill name resolves to one version. |
| P-51 | S | One line in harness `docs/portable.md` step 7 naming the container scheduler beside Task Scheduler, cron and launchd (the work VM keeps host schedulers). |

PM resolution of the one cross-note conflict: the containers note kept `--no-sandbox` for a
single-user, non-internet-facing browser; the sync-runner note found Playwright's docs never
recommend it and ship a seccomp profile. **The seccomp profile is the default; `--no-sandbox` is
the documented fallback only if the profile fails in the R-82 spike.**

### 1.8 workspace-chatbot (S2-workspace-1)

Size **L**. A whole subsystem, not a screen; split into six research-added parts (P-83..P-88).
What the research settles:

* **Backend = the unmodified `claude` CLI (`claude -p`, non-bare) shelled out from a container job.**
  The Agent SDK library and `--bare` mode both require API-key billing (Anthropic's current
  legal-and-compliance page), which would break "use my subscription".
* **Not an edge function.** Supabase Edge Functions cap at 2 s CPU / 150–400 s wall clock (confirmed
  live 2026-09-24). Streaming rides **Supabase Realtime Broadcast** sent server-side by the container
  (first Realtime use in this app), not `postgres_changes` or an edge relay.
* **Router = a hand-written heuristic**, with a one-turn Haiku classifier as a fast-follow only if it
  misroutes; three tiers (haiku / sonnet / opus). Trained routers are the wrong scale for one user.
* **Provider seam = one typed interface with `claude-cli.ts` implemented and `ollama.ts` /
  `frontier-api.ts` as typed stubs**, which makes "build the functionality" checkable without wiring
  either.
* **Storage** reuses the owner-scoped RLS pattern and `agent_requests`' queue shape
  (`workspace_conversations` / `workspace_messages` / `workspace_requests`); LibreChat's fetched schema
  is the starting shape.
* **The container's Supabase access is its own least-privilege role** (R-84's pattern), never the
  materials-MCP service key (D-4) and never a user JWT; read-only tools only in v1.
* **Sequencing:** it reuses Phase 14's container, secrets, OAuth token and MCP image so heavily that
  building it first would duplicate and discard work; it lands as a fourth C-2 service or right after
  Phase 14 merges.
* **Reverses v3 §4 D-1**; the DECISIONS row is an acceptance step.

### 1.9 harness-v2-vault (R-97..R-107, P-52..P-61)

| id | size | what the research changes |
|---|---|---|
| R-97 | S | The guard prints what it resolved (doctor.mjs's pattern). R-97 and R-103 are one bug in two files: one shared config-resolution helper (P-110). |
| R-98 | S | Reuse `redact.mjs`'s 16-rule table as a payload file pinned by a test; the **hand-written no-node fallback** in the skill can still put a secret into git history (B-58). |
| R-99 | S | Bookkeeping plus one SQL walk on harness-memory; number the verification note now. |
| R-100 | M (calendar-gated) | The commit → merge-pull → push-with-lock design beats obsidian-git's rebase-first default on the failure that matters. |
| R-101 | M | The regex (read directly) matches no lettered phase and no multi-phase session; **P-52's spelling decision comes first**; the worker-note-inherits-parent-phase rule is required (62 worker notes vs 5 PM notes). |
| R-102 | S | A `hook_tags` provenance field so `mergeTags` replaces its own prior output; repair the six over-cap notes after the fix ships. |
| R-103 | S | Wire the existing tool to a cadence; add a count-based early trigger (P-111). |
| R-104, R-105, R-107 | S / M / S | Docs; correctly outside bb2dash briefs; `smoke.ps1` also asserts the old OneDrive path got no new writes. |
| R-106 | S | Two-layer redaction matches Presidio / scrubadub; the loader runs through the 18 MB budget fixture (P-112). |

### 1.10 rag-coverage-eval (S2-rag-1, R-61, R-62, R-74, R-77, P-23, P-24)

| id | size | what the research changes |
|---|---|---|
| S2-rag-1 | M (sum of parts) | Every ask has a precedent in the repo (`v_embedding_status`, embed-corpus's `dry_run`, the pg_cron tick shape, 19 db/tests files): wiring, not invention. Part-level coverage read from embed-corpus's own `dry_run` (never a SQL re-chunk); every check scoped to current files; the 512-token gte-small ceiling checked against the 1,600 / 1,400-character proxy; the eval re-run from a committed runner. |
| R-61 | S | The sha256 twin (file 17) counts as covered by proxy; part truth comes from `dry_run`. |
| R-62 | M | The check joins P-24's shared db/tests file at the post-embed moment. |
| R-74 | S | Docs only; `EVAL_EMBEDDING_POC.md`'s "known issue" paragraph gets one line. |
| R-77 | S | Measure first (2026-09-10 stands); if ever needed, a **generated column**, not a trigger. |
| P-23 / P-37 | S | Decided once: **the skill/script call after a pull**, no new cron job (a drain would need its own Vault-held anon JWT because embed-corpus keeps `verify_jwt` on). |
| P-24 | S | One db/tests file with three assertions: current-file coverage via `dry_run`, the na / sha-twin carve-out, R-62's live-defect cases as a regression. |

## 2. Research-added requirements (appended to `91_` §2 as *research-added* P-66..P-113)

| P | size | for | what | why |
|---|---|---|---|---|
| P-66 | S | R-30, P-1 | `manual.ts` distinguishes "no score posted" from "posted a zero" | the GEO/ECN 0.0 % figure recurs on any future unlinked 0/100 column |
| P-67 | S | R-31, R-33 | A script that extracts and runs each verdict file's YAML `recheck` SQL | research 75's field is inert until something reads it |
| P-68 | S | R-34 | Launcher fix: drop `--restricted` / `--tools`; scope writes with `Edit(...)` rules | both are live defects against the current CLI |
| P-69 | S | S2-home-1 | A shared wheel/drag horizontal-scroll hook | the same gap recurs on any horizontal strip |
| P-70 | S | S2-home-2, S2-materials-1 | Lift `materials-collapse.ts` into a shared two-level collapse-state module | three near-identical implementations otherwise |
| P-71 | M | R-41, R-52 | One shared heartbeat/freshness view for the transform tick and the calendar-push tick | the same dead-man's switch twice |
| P-72 | S | R-58 | A written steady-state exclusion convention for sync-summary counts | cluster C's future counts re-derive it otherwise |
| P-73 | S | R-43 | A reusable hydration-test harness extracted from `PlannerWeek.hydration.test.tsx` | second component needing the same scaffold |
| P-74 | S | R-35 | Commit the export-generating `.sql` beside the dated export | only the output was versioned last time |
| P-75 | S | R-33 | One citation syntax, `bb_file:<id>#unit:<n>`, in verdict files and `assignments.source_ref` | two dialects from six sittings would defeat the recheck |
| P-76 | S | R-53 | Reuse the sidebar's inline boot script for `html[data-theme]` | one FOUC mechanism, already proven |
| P-77 | S | R-53 | Three-state Auto / Light / Dark toggle, default Auto, persist only on an explicit pick | "prefers-color-scheme and a toggle" needs a "not chosen" state |
| P-78 | S | R-53 | `color-scheme` driven off `data-theme` | wrong native controls under a static dark value |
| P-79 | S | R-46 | The 390 px check asserts every nav item stays reachable (focus, `aria-expanded`, keyboard) | a folded nav can pass a width check while dropping a link |
| P-80 | S | R-50 | `apple-icon.png` beside `favicon.ico` | free in the same PR |
| P-81 | S | R-61, S2-rag-1 | Token-budget check on embed-corpus's chunker against gte-small's 512-token ceiling | a character proxy with no margin and no check |
| P-82 | S | R-61, P-24 | Part-level coverage read from embed-corpus's `dry_run` | the only correct copy of the chunk boundaries |
| P-83 | S | S2-workspace-1 | Router: heuristic + optional Haiku classifier, tier → model map | no decision procedure exists |
| P-84 | S | S2-workspace-1 | Provider seam: `claude-cli.ts` implemented, `ollama.ts` / `frontier-api.ts` typed stubs | makes the local/frontier ask checkable |
| P-85 | M | S2-workspace-1, R-84, R-91, R-92 | Container service + `claude -p` invocation, dead-letter sweep, `workspace_reader` / `workspace_runner` roles and RPCs | the load-bearing piece, on Phase 14's seams |
| P-86 | M | S2-workspace-1 | `workspace_conversations` / `workspace_messages` / `workspace_requests` + owner RLS + query layer | no storage contract exists |
| P-87 | M | S2-workspace-1 | Streaming over Realtime Broadcast (private channel) + a hook + an RLS spike before the transport is frozen | first Realtime use in the app |
| P-88 | S | S2-workspace-1, R-84 | Tool allowlist and safety: read-only MCP tools only, zero write RPCs, egress allowlist, non-root | named in scope, not specced |
| P-89 | S | R-61, P-24, S2-rag-1 | Every coverage and eval query scoped to current files | superseded rows would report false gaps |
| P-90 | S | S2-rag-1 | A reproducible retrieval-eval runner over the golden set | nothing replays the ten queries today |
| P-91 | S | S2-rag-1 | Re-validate the golden set's ground truth before each run | renumbered files would read as regressions |
| P-92 | S | P-23, P-37 | "Who embeds pulled files" decided once: the skill/script call, no new cron job | asked twice from the same evidence |
| P-93 | S | R-82 | Re-ground the session-lifetime write-up in Entra Conditional Access + KMSI | SU authenticates through Entra SAML |
| P-94 | S | R-76 | Sanitise `bb_content.body` / `description` before any render | Blackboard's rich-text dialect; CLAUDE.md's rule |
| P-95 | S | R-64, R-69, R-63 | Carry `contentHandler` into `bb_content` in R-64's migration | free once `stage_content` is re-created; three consumers |
| P-96 | S | R-70 | Cache `creatorUserId` → display name per run (`course_staff` first, one `/users/{id}` per miss) | one round trip per announcement otherwise |
| P-97 | S | R-66, R-70 | Log a zero-match count on every key probe instead of a silent null | the live bug is a silent default |
| P-98 | S | R-71, R-64 | One vanish convention (`missing_since_run`) across the history record and the ghost collapse | do not invent a second column in one phase |
| P-99 | S | R-79 | Runner exit-code contract: non-zero on any FAIL | what makes "one command" scriptable |
| P-100 | S | R-79, P-31 | A dedicated `db_test_runner` role granted exactly what the 18 files need | least privilege, matching `sync_runner` |
| P-101 | S | R-79, P-30 | Timestamp-agnostic drift guard for `fixtures.phase10a.test.ts` | P-30 breaks the byte-for-byte guard otherwise |
| P-102 | S | R-82 | Chromium sandbox = non-root + Playwright's `seccomp_profile.json`; on the /security-review list | settles P-39 to current practice |
| P-103 | S | R-82 | VNC stack = x11vnc + noVNC/websockify | settles the open half of P-38 |
| P-104 | S | R-83, R-84, R-81 | Dead-letter sweep pairs the time threshold with an attempts counter; 091's grants enumerate the queue read and raise path; copy-then-unlink across the volume boundary | least privilege and EXDEV |
| P-105 | S | R-88 | `[windows] set shell := ["powershell.exe", …]` in the umbrella justfile | `just` defaults to `sh` on Windows |
| P-106 | S | R-90 | State that node-cron's `missedExecutionTolerance` is drift tolerance, not catch-up | a worker would substitute the wrong mechanism |
| P-107 | S | R-91 | Grep for stray `console.log` in the materials server's DoD | one breaks every MCP stdio call |
| P-108 | S | R-92 | Fork the reference devcontainer at `node:22-bookworm`; drop `statsig.anthropic.com` from the allowlist | upstream is `node:20`; the hostname has no public DNS |
| P-109 | S | R-90, R-94 | Keep base-image manifest checks and real per-image arm64 builds separate in note 82a | a manifest proves nothing about native bindings |
| P-110 | S | R-97, R-103 | Shared config-resolution helper for `HARNESS_VAULT` / `HARNESS_MACHINE_ENV` | one bug, two files, a third likely |
| P-111 | S | R-103 | Count-based early trigger beside the weekly cadence | 228 + 114 unclassified already |
| P-112 | S | R-106 | The extra-rules loader runs through the 18 MB budget fixture | a slow custom regex would ship invisibly |
| P-113 | S | R-98 | A behavioural fixture proving the checkpoint's rule table equals `redact.mjs`'s | a byte pin catches drift, not a shared bug |

## 3. Corrections to the record

* `scripts/validate-grading.ps1` passes `--restricted` and `--tools`, which the current CLI does not
  document; its `Write(...)` path rule is accepted but never consulted.
* Claude Code's OS-level sandbox runs on macOS, Linux and WSL2 only; on native Windows, confinement is
  permission rules.
* SU signs in through Microsoft Entra SAML, not Shibboleth; research R1's lifetime ceilings do not apply.
* Supabase Edge Functions: 2 s CPU / 150–400 s wall clock. No chat backend there.
* Playwright's docs do not recommend `--no-sandbox`; the shipped seccomp profile is the current shape.
* The harness phase regex rejects lettered phases (10a, 10b, 11b, 12b) and multi-phase sessions.
* Unused indexes on prod are 4, not 5 (`grade_column_links_component_idx` now has scans).
* docker/compose#11577 is closed (2024-03-05); the live include-level `env_file` pitfall is #13945.
* Anthropic's reference devcontainer still pins `node:20` and allowlists a hostname with no DNS record.
* The Ultra per-item URL is a public template, not an unknown; Blackboard's announcements resource
  generally carries a resolvable `creatorUserId`.
* The org plan is Free (`get_organization`, 2026-09-24), so leaked-password protection cannot be
  switched on without paying.

## 4. Risks the requirements did not name

* **Subscription metering.** Anthropic announced (2026-05-14) then paused (2026-06-16) a plan to
  meter `claude -p` / Agent SDK usage out of the subscription pool into separate dollar credits; still
  paused and "being revised" as of 2026-09-24. If it lands, S2-workspace-1's "no API credits" framing
  and Phase 14's `claude -p` uses gain a cost. Recorded as a risk, not a blocker.
* **Google refresh token.** A Testing-state consent screen revokes the token after 7 days; the
  2026-09-24 re-mint dies again about 2026-10-01 17:03Z unless the screen is In production (R-52, P-14).
* **Chunker margin.** Character-based chunking against a 512-token model; nothing checks a part's real
  token count (P-81).
* **Two clones of one realm.** Phase 14's jobs container and the Windows checkouts of the vault must
  not both prune; the bind-mount test in B-52 decides.
* **Sequencing debt.** R-63, R-64, R-71 and R-75 all want the same `stage_content` re-creation (row
  158), and P-27's one probe sitting gates five items; both are planned as one phase and one sitting.

## 5. The question batch

One numbered list. Every line carries the default the PM takes if Stack says nothing; answering
"defaults, except …" is enough. Sources: `91_` §3's blank fields, `91_` §6 (Q-numbers), and the
research questions.

**A. Stack's list (his fields, filled with proposed defaults)**

1. **S2-home-1 upcoming work scrollable.** Diagnosis: a plain mouse gets neither wheel nor drag on the strip (trackpad and touch work). Default: must; fix as one shared hook; acceptance "I can wheel-scroll and drag the strip on Home and the course page, and ◂ ▸ still work"; must not change what the strip shows.
2. **S2-home-2 Undated collapsed, at the bottom.** Default: must; two pieces, collapse and move; placed just above the needs-attention row (12b made that the page's last word); **collapsed on first visit** as you asked (the app's other sections default open; say if you want the same here), remembered after; nothing leaves Undated.
3. **S2-materials-1 whole section collapses.** Default: must; the whole course header row is one accessible button (the text included); buckets keep their own toggles; no change to file rows.
4. **S2-containers-1 (Phase 14).** Default: must; runs as the sprint's long pole in parallel with the grades and web phases; the noVNC spike gates its sync half; $0 and the Windows path until acceptance.
5. **S2-workspace-1 chatbot.** Default: **should**, built after Phase 14's container, token and MCP-image seams exist (it reuses them); v1 is **read-only** (zero write tools on every tier); backend is the `claude` CLI with your subscription token; router is a hand-written heuristic, Haiku classifier only if it misroutes; a soft $1-per-turn cap that fails the turn plainly; harness store scoped to an allowlist of bb2dash collections; the paused metering plan (§4) accepted as a risk. Acceptance: "on a Workspace page I ask a question; simple lookups answer from the two stores, harder ones go to a stronger model; every answer names the tier; nothing costs API credits."
6. **S2-styling-1.** Default: should, last in the sprint; three style-tile directions as live Artifact pages; three-state Auto/Light/Dark toggle in the top-nav menu (a named exception); the token audit lands early as a test-only ratchet; C-1 stays with it.
7. **S2-bugs-1.** Default: a scoped pass (steps 3–9 of the 12b method) over the bugs already in §1 plus your three quick fixes, not a fresh page-by-page intake (about a worker-week vs about a phase).
8. **S2-rag-1.** Default: must; a background check the PM runs after each corpus change (no UI surface this sprint); embedding runs as a step of the pull (no new cron job); a committed eval runner with the golden set re-validated first.

**B. Grades and V-1**

9. Presentation dates (Q1). Default: keep SITN on 11/4 as recorded, individual presentation undated and tentative, major-project-1 back to tentative to match #2. The first individual slot is 2026-09-30.
10. GEO.103 "Absences" / "Attendance" 0/100 read as graded (Q2). Default: "Not graded" via the picker until the GEO sitting; plus the engine fix so a posted zero and no score are distinct.
11. Un-stub V-1 (Q3). Default: yes, inside the grades phase; sitting 1 (IST.323) after the launcher is fixed (dead flags dropped, Edit-scoped writes) and the export regenerated from a committed query.
12. IST.323 "Proposal and Appendices" 13 pts (Q4). Default: re-cut components to 13 / 1 in the reconciliation migration, decided in the IST.323 sitting before 2026-12-03.
13. IST.466's three attendance/participation columns (Q5). Default: leave today's links; unscored columns are named under the figure until linked.
14. How V-1 marks a checked row (Q6). Default: notes for schemes and components, `source_ref` for assignments, one syntax `bb_file:<id>#unit:<n>` everywhere; from-memory answers `STACK_OVERRIDE` + confirmed with your why; the invariants filed in `db/tests` (rerun by the suite, not wired into the sync).
15. C-2 rank weights (Q7). Default: the rule line only, in ranked order, shipped in the grades phase now; per-exam weights stay parked.
16. V-1's migration number. Default: a sprint-2 number in the grades phase's range; 059 stays unused (a 059 applied after 090 would replay out of order).

**C. Web**

17. Stream "unread" (Q8). Default: follows the bell (`read_at` null and not `is_read`).
18. Stream material diffs (Q9). Default: one post per file or content item new or changed in a registered crawl, from an append-per-run history table, full history kept; built in the ingest phase with R-71.
19. Stale Classwork nodes (Q10). Default: hidden, with a toggle for the three really gone; nothing deleted.
20. Freshness and heartbeat (Q11). Default: Phase 9's thresholds; a two-stage heartbeat, late at one missed tick, missing at five (about 10 min), one shared design for the transform and calendar ticks.
21. "Apply answers now" control (Q12). Default: build it (S, no migration), labelled apart from the existing button.
22. Info groups (Q13). Default: remove the false caption now; no panel this sprint.
23. Phase 13 carry-ins (Q14). Default, a change from `91_` §6: **C-2's rule line and C-3's favicon ship early** as small items (the eclipse-ring icon, plus `apple-icon.png`); C-1 stays with the styling phase because it needs the nav redesign. Say no if all three should wait.
24. Phone-width nav (Q15). Default: fold links and Search into one menu at the existing 720 px step (replacing it), reachable by keyboard.
25. R-18 proof rows on production (Q16). Default: stage your byte-identical originals (their rows stay); the "differs" draft is removed by SQL and Storage delete in the same sitting.
26. R-26's web half (Q17). Default: close it with a DECISIONS row once you confirm the desktop toasts.
27. IST.466 attendance marker (Q18). Default: mark the starred sessions with the schedule's own words, answered with 13.
28. Failing calendar push (Q19). Default: a Home needs-attention line after three consecutive failed pushes, clearing on the next ok run. **And a manual step for you:** read the OAuth consent screen's publishing status; if it is still Testing, publish it and re-run the consent, or the token dies again about 2026-10-01.
29. Machine-closed Inbox gaps (Q20). Default: yes for `stage_gaps`' four conditions, archived with a "closed itself" record; a gap that reopens twice in a day is surfaced once instead.
30. New Activity lines (Q21). Default: add auto_graded, reading_links (linked) and missing_cleared when above 0; leave out the two steady-state counts, under a written convention.
31. Planner kind colours (Q22). Default: keep; DECISIONS row closes the "pending nod".

**D. Ingest and data**

32. iCal feed job (Q24). Default: retire it (unschedule; amend R-15's clause).
33. GEO.103 textbook chapters (Q25). Default: ebooks behind Orange Instant Access → Off-platform; the phys.org link recorded; Huber stays tagged until you find it.
34. Two live copies of one file; the three IST.352 decks (Q26). Default: keep both copies current; link decks 31 / 47 / 32 to sessions 129 / 130 / 131.
35. Week and session links for files (Q27). Default: yes, its own ingest item outside V-1, per-course rules, an Inbox question when a file fits several sessions.
36. Announcement author (Q28). Default: probe on the next sync; a resolvable `creatorUserId` is expected (resolve via `course_staff`, then `/users/{id}` cached per run); drop the author segment only if nothing is there.
37. Course files pulled inside the sync (Q29). Default: in the skill now with the scripted signed-CDN fetch; the Phase 14 runner inherits it.
38. Per-item Blackboard links (Q30). Default, a change from `91_` §6: **build `bb_url` now** from the confirmed public template (`/ultra/courses/_<courseId>_1/outline/<type>/_<itemId>_1`); your tab confirms, it does not gate.
39. Item descriptions on Classwork (Q31). Default: no; close with a DECISIONS row; if ever shown, sanitised first.
40. One logged-in probe sitting (P-27). Default: with your next sync, five facts in one sitting (announcement shape, per-item URL, meeting times, `feedbackToUser`, group-attempt files).

**E. Database**

41. Leaked-password protection (Q32). Default: the org is on the Free plan; record it as accepted, stay on Free.
42. A database credential for the test runner (Q33). Default: yes; a direct or session-pooler connection string (never the transaction pooler) in a gitignored `.env.local` as `BB2DASH_TEST_DB_URL`, for a dedicated `db_test_runner` role; pgTAP is not adopted.

**F. Phase 14, the sync half**

43. Sync without an LLM (Q34). Default: yes, the deterministic runner with a templated report; the skill stays the Windows fallback.
44. `/inbox-apply` step 0 in the container sync (Q35). Default: skipped; your answers apply from the Inbox button.
45. Scheduled morning sync (Q36). Default: **stays declined until you adopt it in writing**; if yes, 07:00 New York daily as a provisional hour, off until cut-over.
46. Login death (Q37). Default: Inbox item only; a toast is post-MVP.
47. Task 0 probes (Q38). Default: start now (the Duo window takes 14 days), written up as an Entra Conditional Access / KMSI measurement, not Shibboleth.

**G. Phase 14, the infrastructure half**

48. Dev container vs the harness's "the VM replaces it" (Q39). Default: keep it, in `bb2dash-stack` only, built last in the phase.
49. Container scheduler vs Task Scheduler (Q40). Default: the container replaces the two jobs on home-pc only; the `.ps1` scripts stay as fallback and for the work VM; the curator stays a host task.
50. Vault access for the jobs container (Q41). Default: bind-mount the Windows realm checkouts as home-pc after a lock and `safe.directory` test; separate clones only if it fails.
51. `bb2dash-stack`, `just`, one PR per repo (Q42). Default: yes to all three, each a DECISIONS row at the freeze.

**H. Harness and V-2**

52. V-2's four research defaults (Q43). Default: adopt all four in one row, the tag cap noted as policy pending R-102's fix.
53. The Phase 7 acceptance query (Q44). Default: re-run on the first sprint-2 phase after the phase-spelling decision and R-101 ship.
54. `machine: home-pc` on older notes (Q45). Default: fill only where the transcript is on this PC.
55. gitleaks gate (Q46). Default: drop the recurring gate; run one `gitleaks detect` over each realm's history before Phase 14.
56. `/checkpoint`'s hand-written no-node fallback. Default: remove it (the skill requires node), since it can commit a secret with no redaction.

**I. Shell proofs and C-7 wording**

57. Toasts (Q47). Default: you report the three sightings and one click each from a banner and from the Action Center; if a click does nothing, the toast is held until expiry under the frozen C-7 rule.
58. Two C-7 outputs (Q48). Default: fix "1 grades posted" with no score and "1 / 0" on zero-point columns under a row amending rule 2; Attendance keeps toasting.

**J. Decisions**

59. `/inbox-apply` writing `assignment_progress` (Q49). Default: sanctioned narrowly in one row: only rows named in an Inbox item you answered yourself, status only when your words say so, scores as Blackboard shows them, every write in that day's log; `reading_progress` untouched; D-2 and CLAUDE.md corrected to match.

## 6. Defaults Stage C takes if Stack says nothing

Every "Default:" in §5, plus these PM calls that need no answer:

* Chromium sandbox: non-root + Playwright's seccomp profile; `--no-sandbox` only as the spike's fallback.
* Migration numbers: Phase 14 keeps 091–099 (091 role and RPCs, 092 scheduled sync if adopted); every
  other sprint-2 phase takes a block from 100 upward, assigned in `94_SPRINT2_PHASES.md`; 059 and
  070–072 stay unused.
* Test transport: node-postgres over a direct or session-pooler connection; no pgTAP.
* R-77 stays measure-first; R-96 stays a deferred list with no phase; R-105 and R-106 stay harness-owned.
* The state-doc refresh steps (P-5, P-13, P-20, P-29, P-32, P-41, P-62) and the DECISIONS rows
  (P-3, P-4, P-34, P-64, P-65, R-109) are done on this branch in Stage D, not as phase tasks.
* Every product call made here is provisional until Stack answers and is written to DECISIONS with
  the date he answers, not the date it was drafted.

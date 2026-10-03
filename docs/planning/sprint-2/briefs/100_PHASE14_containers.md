# Phase 14 — Containers (R-28): sync-runner, Blackboard login in a container, images, secrets, dev container, harness jobs, acceptance

Date 2026-09-24 · PM: the Fable session · Product manager: Stack · Requirements: R-81, R-82, R-83, R-84,
R-85, R-86, R-87 (conditional on B-45), R-88, R-89, R-90, R-91, R-92, R-93, R-94, R-95, R-96 (the deferred
list: task 30 records it in STATUS, nothing is built); S2-containers-1 · PM-added steps: P-33, P-34, P-35,
P-38, P-39, P-40, P-42, P-43, P-44, P-45, P-46, P-47, P-48, P-49, P-50, P-51, P-59, P-60, P-93, P-102,
P-103, P-104, P-105, P-106, P-107, P-108, P-109 · Branch `feat/containers-14` in bb2dash, `feat/containers`
in agentic-harness, `feat/containers-14-stack` in the new `bb2dash-stack` · Worktree
`bb2dash-wt-containers-14` · Migration range **091–099** (091 role and RPCs; 092 struck 2026-10-03, the morning
sync follows the login) · **One PR per repo, not per phase** (**PROVISIONAL, B-51**), plus one early
`syncLauncher` PR in bb2dash (P-43): the exception is written as a DECISIONS row at the freeze (task 1,
B-51), amending the 2026-09-09 SOP row for this phase only ·
Depends on: the noVNC spike gate (task 4) before any sync-side task; Phases 15 (runner, test role), 18
(fetch and embed step) and 19 (register-first) on `main` before W-55 and W-56 are cut · Status:
**FROZEN 2026-10-02** (task 1; the "Frozen 2026-10-02" block below and the eleven `Phase 14 freeze:`
DECISIONS rows of that date). Until then it read "PROVISIONAL until Stack answers 93 §5 (B-4, B-43, B-44,
B-45, B-46, B-47, B-48, B-49, B-50, B-51) and approves `94_SPRINT2_PHASES.md`"; its live SQL checks rest on
Phase 15's B-42, answered at its default (the `db_test_runner` role, migration 100, on prod since 2026-09-29).

This brief supersedes the Contract of `../82_PHASE14_containers.md` (C-1..C-8, its task table and its
workers). 82 stays the record of Stack's sixteen decisions (quoted below), the MVP he confirmed and the six
`../research/82_RESEARCH_phase14_R*` files. `../research/92_RESEARCH_sprint2_sync-runner-login.md` and
`../research/92_RESEARCH_sprint2_containers-infra.md` sharpen them; where they disagree, the PM resolution
that closes 93 §1.7 decides (Playwright's seccomp profile by default, `--no-sandbox` only as the spike's
fallback).

**Answered by delegation 2026-09-27.** Stack delegated the 93 §5 answers and the plan approval to the PM; the DECISIONS rows of 2026-09-27 hold them. Of this brief's B-numbers (B-4, B-42, B-43, B-44, B-45, B-46, B-47, B-48, B-49, B-50, B-51), changed: B-45 (Reversal adopted (Requirements v2 §5 row "scheduled or in-Electron crawls (Duo)", in part), following Stack's decision #6 and the MVP he confirmed on 2026-09-16. pg_cron queues one container `sync` request each morning when none is open: daily at 07:00 New York for now, re-set from Task 0's numbers, and off (null) until the cut-over. A login_required item is a failure report, not a nag. In-Electron crawls stay declined.); the rest resolved to their defaults. The phase's PM strikes PROVISIONAL where a row says default and rewrites the B-table row where it says changed, at the session's start (ORCHESTRATOR §6).

**Frozen 2026-10-02 (task 1).** The PM put open items 1–6 to Stack at the phase's start, with one conflict
this brief predates; his answers are the eleven `Phase 14 freeze:` DECISIONS rows of 2026-10-02 and the two
rows beside them. Every **PROVISIONAL** marker below is resolved to the default written beside it, unless
this block says otherwise; the markers stay only to show which B-number a line rests on.

* **B-4, B-43, B-44, B-46, B-47, B-48, B-49, B-50, B-51, and B-42 through Phase 15:** the default
  (DECISIONS 2026-09-27).
* **B-45 and open item 1:** ~~adopted, so 092 is built (task 13) with the hour null~~ — **superseded on
  2026-10-03 by the amendment below**: the morning sync follows Stack's morning login, not a clock, and 092
  is never written.
* **Open items 2, 3, 4 and 5:** the defaults (item 2 changed on 2026-10-03, below). **Open item 6:** yes, 094 is written (eleven freeze rows).
* **The container has its own Blackboard login.** The 2026-10-01 row "The sync runs only in Stack's
  logged-in Chrome … never open a second browser or ask for a separate login" is scoped to the Windows
  `/bb-sync` skill path (Stack, 2026-10-02). The runner's file step is `fetch_signed.mjs`'s hop walk in its
  own logged-in Playwright context; the skill's Chrome download-and-collect (`ingest/collect_download.mjs`,
  2026-10-01) is not the runner's.
* **Machine name.** The laptop the containers run on is `stack-laptop` (`HARNESS_MACHINE` since
  2026-09-29); where this brief says `home-pc` for that machine, read `stack-laptop`. The harness's
  `docs/portable.md` keeps `home-pc` as its example name, so task 23's grep string is unchanged.
* **Gate state on 2026-10-02.** Phases 15 and 18 are on `main`; Phase 19 started the same day in another
  PM session (`feat/content-history-19`) and is not merged. W-55 and W-56 wait for the spike's PASS and for
  19 on `main`. W-57 is cut from agentic-harness `main` 429d25f; W-58 waits for
  Stack to create `emstacho-su/bb2dash-stack`.
* **Sibling-phase calls this brief rests on** (105 §3's c9 note). The file and embed steps rest on Phase
  18's B-37, answered at its default and merged (the pull runs inside the sync). The 30-minute release rests
  on Phase 19's B-20, a PM pick Stack said yes to at 30 minutes on 2026-10-02 (Phase 19's PR writes the
  row): a different constant would re-set `DEAD_LETTER_MINUTES` below it, and without the rule a stale
  `sync` claim would be flagged by 091's sweep and never released. 114's `closed_itself` shape rests on Phase 17's B-29, merged.

**Amended 2026-10-03 (Stack): a manual Duo login every morning is the plan.** Stack, after the spike's
login: "we need to plan on a manual login (at the very least 2fa) on at very least the first start up of the
day", and his own note that "stay signed in" "tends to not work". He then chose two things, each written in
the Contract below and as its own DECISIONS row of 2026-10-03:

* **The morning sync runs right after the morning login.** The runner watches the login. The first time each
  New York day that it sees the login alive, it queues one sync through `sync_enqueue('login')`, which
  queues nothing when a sync already finished `done` that day or one is open. The 07:00 clock is dropped:
  092 (the column, the two functions and the cron job) is never written, task 13 is re-cut to the login
  trigger's tests inside 091, the trigger `'scheduled'` leaves `sync_enqueue`, and R-87 is delivered by the
  login trigger. A5 is walked (task 29 counts 9).
* **The desktop app opens the login page when the login is dead.** The runner checks the login when it
  starts and on a timer, not only when a sync is queued, and raises the `sync-login-required` Inbox item
  through a twelfth function, `sync_login_required()`. When the desktop shell (under `syncLauncher =
  queue-only`) first sees an open item with that ref, it opens the login page once in the default browser,
  already unlocked with the noVNC password read from its file, so Stack only does NetID and Duo. It rides
  the early launcher PR (task 18), merged before A1.
* **Open item 2 changes:** `KEEPALIVE_MINUTES` becomes the login check while the login is alive, default 60
  (each check is a request from the browser's session, so it also touches it); `LOGIN_WATCH_MS = 60000` is
  the check while it is dead, so the morning login is seen within a minute.

## Why

R-28 says the local pieces move into containers once development is done, so the whole thing can be
rebuilt on a clean machine. Stack's decisions of 2026-09-16 and the MVP he confirmed ("matches") set the
shape. Sprint 1 built none of it. There is no runner, no image, no compose file, no `sync_runner` role and
no umbrella repo (R-81..R-85, R-87, R-88, R-90..R-94: not built; R-86 and R-89: partly built). Every sync
today is a Claude session following `skills/bb-sync` prose in a Windows browser profile (last crawl: request
39 → `sync_runs` 62, 2026-09-23). Two Task Scheduler jobs run the harness only while Stack is logged on,
and the service key sits in two places.

Sprint 2 is the time because the phase needs calendar time before it needs code. Task 0's Duo window is 14
days, the spike is a gate, and the acceptance runs across at least one night. It is the sprint's long pole
(94 §2 rule 4; B-4, **PROVISIONAL**). The ground has moved since 82 was written. The vault is now two git
realms, and the 2026-09-24 row supersedes C-4. Migration 090 is taken, so the role is 091 (P-33). Phase 13
was skipped. SU signs in through Entra SAML, not Shibboleth (P-93). Playwright ships a seccomp profile, so
`--no-sandbox` is only a fallback (P-102). Phases 18 and 19 now own the scripted fetch, the embed step and
register-first, so the runner inherits them instead of rebuilding them. This brief restates 82's Contract
against that ground and freezes it (R-95).

It delivers a deterministic `sync-runner` that holds Stack's Blackboard login in a container, a
least-privilege database role, the harness jobs on an in-container scheduler that catches up, the materials
MCP server as an image that reads its key from a file, an umbrella repo with one command and a doctor, and a
dev container for PM sessions. Each of those rests on its B-number's **PROVISIONAL** default (the runner
B-43, the scheduler B-49, the umbrella and `just` B-51, the dev container B-48). The Windows path keeps
working until Stack's acceptance sitting (R-93); the cut-over runs inside that sitting, in the order
§Definition of done gives (82's C-8, amended). It does not change a web screen, containerize the Electron
GUI, or move Supabase or Vercel.

## Stack's calls this brief rests on

Every row was **PROVISIONAL** until Stack answered. Answered 2026-09-27 by delegation and frozen
2026-10-02 (the block above): every row stands at its default except B-45, which is adopted.

| B | Question (93 §5) | Default taken | Tasks that change if he answers otherwise |
|---|---|---|---|
| B-4 | S2-containers-1: must or should, and where it runs | Must; the long pole beside Phases 16–19; the spike gates only the sync half; $0; the Windows path until acceptance | "Should" or "later": only task 1 runs, and Phase 21 waits too (it reuses this phase's container, token and MCP image) |
| B-43 | Sync without an LLM (Q34) | Yes: the deterministic runner with a templated report; `skills/bb-sync` stays the Windows fallback | No: tasks 9–12 become a `claude -p "/bb-sync <id>"` wrapper, `claude_oauth_token` becomes a `sync` secret, and R-81 grows |
| B-44 | `/inbox-apply` (bb-sync step 0) in the container sync (Q35) | Skipped; answers apply from the Inbox button | Run it: task 9 adds a `claude -p "/inbox-apply"` branch before the login check, and the sync image gains Claude Code and `claude_oauth_token` |
| B-45 | Scheduled morning sync (Q36) | **Adopted, login-triggered** (2026-09-27 by delegation; 2026-10-03 Stack: "Right after my morning login"). One sync each New York day, queued by the runner the first time it sees the login alive (`sync_enqueue('login')`); no clock, no 092. The default had been: declined until he adopts it in writing | Adopted: task 13 builds 092, acceptance step A5 is walked, and task 1 writes the reversal row. Declined: 092 is never written, R-87 stays declined, and A5 is struck |
| B-46 | Login death: Inbox only, or a toast too (Q37) | Inbox item only; the toast stays on R-96's deferred list | Toast too: R-96's first item becomes a desktop task after task 18 (a new poller source and a click-only toast) |
| B-47 | Task 0 probes (Q38) | Start now, read as an Entra Conditional Access / KMSI measurement | Not run: task 3 is struck; `KEEPALIVE_MINUTES` stays 0 and B-45's hour, if adopted, stays the provisional 07:00 (open item 1); the spike still gates |
| B-48 | The dev container vs the harness's "the VM replaces it" (Q39) | Keep it, in `bb2dash-stack` only, built last | Dropped: task 26 and step A7 are struck; four secret names leave the list (11 → 7) and `claude-home` leaves the volumes (5 → 4); tasks 24, 27 and 29 each count fewer (secrets 11 → 7 and services 4 → 3 in task 24; images 4 → 3 and base manifests 5 → 4 in task 27; one fewer tick in task 29); the `dev` verb goes (verbs 8 → 7, so task 24's `just --summary` → `doctor down ingest-now login logs sync-now up`, and under B-51's npm branch the `node -e` list drops `dev`); task 25's Claude token-age row goes with `claude_oauth_token` |
| B-49 | Container scheduler vs Task Scheduler (Q40) | The container replaces the two jobs on home-pc only; the `.ps1` scripts stay as fallback and for the work VM; the weekly curator stays a host task | "Everywhere": task 23's `portable.md` line replaces the host schedulers instead of adding one. "No": tasks 20–22 and steps A6 and A8 are struck, and R-90 is declined; `harness-jobs` goes: task 24 counts services 4 → 3 and drops `ingest-now` (verbs 8 → 7, so `just --summary` → `dev doctor down login logs sync-now up`), or, if Stack keeps the verb, re-points it to the harness's host script `scripts/nightly-ingest.ps1` (the script `AgenticHarness-NightlyIngest` runs, registered by `scripts/register-nightly-ingest.ps1`) and the eight verbs stay; task 27 counts images 4 → 3 and base manifests 5 → 3; `fastembed-cache` and `job-state` leave the volumes (5 → 3); B-50's binds are struck with task 22; `vault_realm_pat`, which only the jobs container's realm pushes use (R-89), leaves the secrets (11 → 10) with open item 4's PAT step; task 23's container-scheduler line and its `missedExecutionTolerance` note (P-106, which describes only the container scheduler) are not written, so its `On home-pc (containers):` and `missedExecutionTolerance` greps both expect 0; task 29's `Get-ScheduledTask` count expects 2, not 0; the DoD's harness `hooks/tests` count expects no fewer than the base's count (+0, not +3), and R-86's DoD line keeps task 16 only |
| B-50 | Vault access for the jobs container (Q41) | Bind-mount the Windows realm checkouts (`C:/Users/stack/vault`) as `home-pc`, after a lock and `safe.directory` test | Test fails or he prefers clones: the realms are cloned into a volume under their own machine name, and task 22's check becomes a clone-and-push check |
| B-51 | `bb2dash-stack`, `just`, one PR per repo (Q42) | Yes to all three, each in the freeze row | npm scripts instead of `just`: the `justfile` becomes `package.json` scripts with the same eight verbs; tasks 24–26 and steps A2, A3, A6 and A7 run `npm run <verb>`, task 24's `just --summary` check becomes `node -e "console.log(Object.keys(require('./package.json').scripts).sort().join(' '))"` → `dev doctor down ingest-now login logs sync-now up`, and its `set windows-shell` grep is struck. A different repo name changes paths only. One PR per phase: task 30 expects the bb2dash PR only, and the harness and stack branches merge in the order he names |

### Stack's decisions of 2026-09-16 (82 §Stack's decisions, kept verbatim)

The wording is 82's record of his answers in that session's question rounds; the column on the right is
the PM's reading for today, not his words.

| # | Decision | Standing in this brief |
|---|---|---|
| 1 | "Goal = portability: clone + `.env` + `docker compose up` on a new machine. First host: this laptop (Docker Desktop, WSL2). MacBook / VPS later, so the stack must stay migratable" | in force (A1–A2) |
| 2 | "Supabase cloud and Vercel stay managed. No local Supabase" | in force (D-20) |
| 3 | "In scope: bb2dash sync + scripts, the materials MCP server, agentic-harness jobs, and Claude Code itself (unattended runs **and** a dev container for PM / worker sessions)" | in force; the dev container is B-48 (**PROVISIONAL**) |
| 4 | "Blackboard login: a browser in a container, Stack logs in through a web view — *if research confirms* (it did, R1)" | in force; task 4 confirms it |
| 5 | "Claude auth in containers: research decides → subscription token (R2, R3)" | in force (`claude_oauth_token`, dev only under B-43/B-44's defaults, **PROVISIONAL, B-43, B-44**) |
| 6 | "Sync trigger: the app's button queues a request, a watcher runs it; plus a scheduled sync. SU's "stay signed in" never works for him — a session survives only on a machine that stays on" | button half in force; the scheduled half is B-45 |
| 7 | "The Obsidian vault leaves OneDrive for a private git repo" | **met and superseded** by the 2026-09-24 realms row (two realm repos) |
| 8 | "Secrets: one gitignored `.env` / secrets folder + Docker secrets at runtime. Never in an image" | in force (C-6 as amended: the Secrets row of §Routes and screens) |
| 9 | "A scheduler in a container replaces the two Task Scheduler jobs" | in force on home-pc (B-49, **PROVISIONAL**) |
| 10 | "Each repo owns its Dockerfile + compose piece; one umbrella includes both and holds the dev container and the `.env` template" | in force |
| 11 | "Acceptance = fresh rebuild on this laptop (script below). The MacBook is not a gate" | in force (A1–A9) |
| 12 | "After acceptance the Electron Sync button only queues; the terminal launch retires" | in force (`syncLauncher`; deletion on R-96's list) |
| 13 | "`course context/` becomes a disposable volume (Storage is the source of truth)" | in force (`course-files`) |
| 14 | "PowerShell scripts are rewritten cross-platform" | in force for what a container runs (R-86); the `.ps1` twins stay (B-49, **PROVISIONAL**) |
| 15 | "Image build / registry: research decides → build locally, no registry, no CI (R4)" | in force; "CI" narrowed to image-build CI (P-50) |
| 16 | "Guardrails: **$0**; today's non-Docker Windows path keeps working until acceptance; service key never in an image; "build it so that it is migratable later"" | in force |

## Contract (frozen when Stack approves the phase plan)

### Routes and screens

No web route and no renderer change (82 §Out of scope: "any renderer change"). The phase shows up through
reads the screens already make:

* **Activity** reads the container sync's `sync_runs` row. The runner's report lines are appended to
  `sync_runs.summary->'changes'`, the text array Activity already renders.
* **Inbox** gets two fixed items, both raised with `raise_attention()` as kind `stack_must_confirm`:
  * ref `sync-login-required`: "Blackboard login needed — open http://127.0.0.1:6080/vnc.html and sign in
    with Duo" (the frozen login page below). It is plain text, because the Inbox cannot link a course-less
    row. The item alone, with no toast, is B-46's default (**PROVISIONAL**).
  * ref `agent_request:<id>`: a claim stuck for 20 minutes, or a request claimed 3 times. Phase 19's
    30-minute terminal rule raises the same ref, so the two collapse through `attention_items_open_dedupe_idx`.
* **Home** shows Phase 19's "sync running" from the running row its trigger opens at registration.
* **Electron** gets the config key `syncLauncher` (`terminal`, the default, or `queue-only`) and the env
  `BB2DASH_SYNC_LAUNCHER`. `queue-only` skips `attachSyncWatcher` (`desktop/src/main/index.ts:155`).
* **Electron login prompt** (2026-10-03). Under `queue-only` only, the shell reads the open
  `stack_must_confirm` item with ref `sync-login-required` on each poller tick (owner session, RLS as today:
  `GET /rest/v1/attention_items?select=id&ref=eq.sync-login-required&state=eq.open`). The first time it sees
  an item id, it opens the login page once with `shell.openExternal` and records the id, so a login death
  opens one browser tab, never one per tick or per window. The URL is `LOGIN_PAGE_URL` plus
  `?autoconnect=true&resize=scale&password=<the noVNC password, URL-encoded>`; the password is read from the
  file the config key `novncPasswordFile` (env `BB2DASH_NOVNC_PASSWORD_FILE`) names, default
  `<home>/projects/bb2dash-stack/secrets/novnc_password`, BOM, CR and LF stripped. A missing or unreadable
  file opens the page without the password and logs one line with the path, never a value. The pure part is
  `desktop/src/core/login-prompt.ts` (`LOGIN_PAGE_URL = 'http://127.0.0.1:6080/vnc.html'`,
  `loginPageUrl(password | null)`, `newLoginItems(openIds, promptedIds)`); the wiring is
  `desktop/src/main/login-prompt.ts`. The navigation policy allows `http://127.0.0.1:6080/` for
  `openExternal` only.

Local surfaces (names frozen; C-1, C-2, C-6 and C-7 as amended):

| Surface | Frozen names | Rule |
|---|---|---|
| Login page | `http://127.0.0.1:6080/vnc.html` | published `127.0.0.1:6080:6080` only; `x11vnc -localhost` behind noVNC/websockify on an Xvfb display (P-103); password from `novnc_password` |
| Services | `sync` (bb2dash), `bb2dash-mcp` (bb2dash, profile `mcp`, image only), `harness-jobs` (agentic-harness; **PROVISIONAL, B-49**), `dev` (bb2dash-stack, profile `dev`; **PROVISIONAL, B-48**) | non-root; `restart: unless-stopped` (not `dev`); `json-file` logs, `max-size: 10m`, `max-file: 3`; healthchecks on `sync` (runner heartbeat) and `harness-jobs` (`ingest --health`, `start_period` 30m) |
| Volumes | `bb-profile` (a credential: never in the vault, RAG or an unencrypted backup), `course-files` (disposable, mounted at `/app/course context` so `local_path` stays `course context/<relpath>`), `fastembed-cache`, `job-state`, `claude-home` | named volumes; the only host binds are B-50's. `fastembed-cache` and `job-state` serve `harness-jobs` (B-49) and `claude-home` serves `dev` (B-48), both **PROVISIONAL** |
| B-50 binds (**PROVISIONAL, B-50**) | `VAULT_DIR` → `/vault`; `CLAUDE_PROJECTS_DIR` → the jobs user's `~/.claude/projects`, read-only | set in the umbrella's gitignored `.env`, which is interpolation-only (docker/compose#13945) and never holds a secret |
| Secrets | `sync_runner_db_url`, `supabase_publishable_key`, `supabase_anon_jwt`, `novnc_password`, `harness_database_url`, `bb2dash_mcp_service_key`, `claude_oauth_token`, `gh_token`, `supabase_access_token`, `vercel_token`, `vault_realm_pat` | 11 files in `bb2dash-stack/secrets/`; `secrets.example/` holds the same names, empty; compose `secrets:` → `/run/secrets/<name>`; an entrypoint shim exports `X` from `X_FILE`; nothing secret in `environment:`, a build arg or a layer. C-6's `vault_deploy_key` is dropped for a fine-grained PAT on the two realm repos (harness R-B4). The service key lives only in `bb2dash_mcp_service_key`. Env names the shims export: `supabase_anon_jwt` → `SB_ANON_JWT` and `supabase_publishable_key` → `SB_ANON_KEY` (Phase 18's names, 98 §Scripts, environment and payload contracts), `bb2dash_mcp_service_key` → `SUPABASE_SERVICE_ROLE_FILE` (read by the server itself), `harness_database_url` → `DATABASE_URL`, `claude_oauth_token` → `CLAUDE_CODE_OAUTH_TOKEN`. `claude_oauth_token`, `gh_token`, `supabase_access_token` and `vercel_token` serve only `dev` (**PROVISIONAL, B-48**; under B-43/B-44's defaults no sync path uses Claude) |
| `just` verbs (**PROVISIONAL, B-51**) | `up · down · logs <svc> · dev [cmd…] · sync-now · ingest-now · login · doctor` | `set windows-shell := ["powershell.exe", "-NoLogo", "-Command"]` (P-105); on Windows each recipe forwards into WSL; `dev *cmd` = `docker compose --profile dev run --rm dev {{cmd}}` (a shell when empty); `sync-now` = `docker compose exec sync node sync/dist/enqueue.js` (the image's working directory is the repo root, `/app`) → `sync_enqueue('just')`, never a second open row; `ingest-now` = `docker compose exec harness-jobs node hooks/scheduler.mjs --run-now nightly`; `login` opens the noVNC page; `doctor` = `node doctor/doctor.mjs --strict` |
| Runner entry points | `sync/dist/main.js` (the loop), `sync/dist/probe.js`, `sync/dist/enqueue.js` | `probe.js` prints `users/me <status> <iso time>` from the runner's state file, exit 0 on 200 and 3 otherwise; the healthcheck reads only the heartbeat, so `login_required` stays healthy (auth state is the doctor's row) |
| Scheduler (**PROVISIONAL, B-49**) | `node hooks/scheduler.mjs` and `--run-now nightly\|collect` | `nightly` 03:00 and `collect` 12:00 and 18:00, America/New_York; state in `/state/scheduler.json` on `job-state`; no cron library; node-cron's `missedExecutionTolerance` is drift tolerance, not catch-up (P-106) |

**The runner, one pass** (B-43, B-44: no LLM and no step 0; **PROVISIONAL** until Stack answers both):

1. `sync_sweep_stale()`.
2. `sync_next()`. If nothing is queued, sleep `POLL_INTERVAL_MS`.
3. Login probe: `location.origin + '/learn/api/public/v1/users/me'`. It is absolute because Ultra's
   `<base href>` points at the CDN.
   * A 401 or 403, or a page on one of the `LOGIN_HOSTS`, calls `sync_close(id, 'failed', {error:
     'login_required', …})` (queued → failed). The login page stays on the noVNC display and nothing retries.
   * A 200 calls `sync_login_ok()`.
4. `sync_claim(id)`. If it returns false, the next pass takes over.
5. Mint a `run_id`, then `sync_register_run(id, run_id)` (register-first, Phase 19).
6. `addScriptTag` with `ingest/bb_crawler.js` (crawler v5 as Phase 18 leaves it; v4's `installCrawler` is
   at :446 today), then `installCrawler({ userId: '_21025199_1', … })` (the id `skills/bb-sync/SKILL.md`
   §Inputs names), then `runAll({ termName: 'Fall 2026', runId })` (the call the crawler header documents).
7. Poll `sync_run_outcome(run_id)` until `status <> 'running'`, for at most `FOLD_WAIT_MS`. A timeout
   leaves the row claimed, and Phase 19's 30-minute rule closes it.
8. Files: `sync_file_worklist()`, then per file:
   * Walk the hops with `page.context().request.get(u, { maxRedirects: 0 })` through Phase 18's
     `resolveSignedUrl` and download with its `downloadTo`, both from `ingest/fetch_signed.mjs` (new in
     Phase 18); take the sha256.
   * Storage POST (publishable key as `SB_ANON_KEY`, no `x-upsert`; a 409 is never done). Keys and checks
     come from `ingest/pull_files.mjs`'s exported pure helpers (`storageKeyFor`, `mimeFor`,
     `bytesLookValid`, `parseExtractOutput`, `textRows`); the runner never runs that script's `main`,
     whose update SQL is the owner's.
   * Locked `extract_text.py` (task 14's project), then the `bb_file_text` POST, then `sync_file_stored(…)`.
   * `fetch_signed.mjs`'s outcome `session_expired` (401/403) stops the step; `gone` (404), `refused` and a
     Storage 409 are reported in the report's `not_pulled`.
   * The download lands on tmpfs and reaches `course-files` by copy-then-unlink, never a bare `fs.rename`
     (EXDEV, P-104; `downloadTo` already falls back this way, and `files.test.ts` pins it for the runner).
9. Run `node ingest/embed_corpus.mjs` (new in Phase 18), which loops `embed-corpus` until
   `remaining_parts = 0`. It reads `SB_ANON_JWT` from `supabase_anon_jwt`, because `verify_jwt` is on, and
   refuses an `sb_publishable_` value.
10. `sync_close(id, 'done' | 'failed', report)`.

**The login watch** (2026-10-03), beside the passes, in `sync/src/login.ts`. The runner keeps one login state
(`unknown`, `alive`, `dead`) and runs the same `users/me` probe on start, then every `LOGIN_WATCH_MS` while
the state is `dead` or `unknown` and every `KEEPALIVE_MINUTES` while it is `alive` (a pass's own probe in
step 3 also updates the state):
* entering `dead` calls `sync_login_required()`, once per entry;
* entering `alive` calls `sync_login_ok()`, then `sync_enqueue('login')`, which queues the day's sync only if
  none finished `done` on that New York day and none is open (so a container restart at noon after a morning
  sync queues nothing);
* the watch never claims, crawls or retries a sync itself; it only probes, raises, closes and enqueues.

On start, the runner calls `sync_requeue_orphans()` once. It launches Chromium with
`launchPersistentContext(<bb-profile>, { headless: false, chromiumSandbox: true })`, headful on Xvfb, as
`pwuser` under Playwright's `seccomp_profile.json` (P-102). `chromiumSandbox` is set explicitly because
Playwright defaults it to false and then passes `--no-sandbox` to Chromium itself (playwright-core 1.63.0).
`--no-sandbox` is allowed only as the fallback 82b records if the profile fails in the spike.

Named constants, each tested:
* `POLL_INTERVAL_MS = 25000`
* `FOLD_WAIT_MS = 600000`
* `MAX_CLAIM_ATTEMPTS = 3`, the same in SQL and TS
* `DEAD_LETTER_MINUTES = 20`, in SQL
* `KEEPALIVE_MINUTES`, an env value, default 60 (2026-10-03): the login check while the login is alive;
  each check is a request from the browser's session and so also touches it. 0 turns that check off
* `LOGIN_WATCH_MS = 60000`: the login check while the login is dead or unknown, so the morning login is seen
  within a minute
* `LOGIN_HOSTS`: `login.microsoftonline.com` (the one host `skills/bb-sync/SKILL.md` step 1 spells out),
  plus the hosts the spike's Duo login passed through, copied from 82b's single `LOGIN_HOSTS:` line (task
  4). SKILL.md names "NetID" and "any Blackboard login page" without a host, so none is guessed here; the
  `users/me` 401/403 probe catches a Blackboard-side login whatever its host

The report comes from the pure `sync/src/report.ts`:
`{ lines: text[], error: text | null, files: { pulled: int, not_pulled: [{ id, reason }] }, claim_attempts: int }`.
Its lines carry failed stages, errors and the pulled / not-pulled files. The fold's own change lines stay
`sync_change_lines`'s.

### RPC signatures

Migration 091. Every function is `language plpgsql security definer set search_path = public, pg_temp`,
owned by `postgres`, with `revoke all on function … from public, anon, authenticated, service_role` and
`grant execute on function … to sync_runner`.

The role is `create role sync_runner login noinherit nobypassrls`, with no password in the file. Stack
sets the password out of band, so the repo file stays byte-identical to prod. It gets
`grant usage on schema public to sync_runner` and no table, view or sequence grant. It connects through
the session pooler (port 5432, user `sync_runner.goultdzqcavefcgnifdy`, Phase 15's pattern for
`db_test_runner`), never the transaction pooler on 6543. Prod has the pooler's `pgbouncer.get_auth(text)`
lookup, but nothing proves the custom role through 5432 until task 7's `--ping`. On 2026-09-24 no SECURITY
DEFINER function in `public` is executable by PUBLIC (the seven PUBLIC-executable functions are all
invokers; re-read on 2026-09-27: 0 DEFINER, 7 invokers), so the twelve below (eleven until 2026-10-03,
when `sync_login_required` was added) are the whole of what the role can run with the owner's rights; the
helper `sync_login_sync_due` is executable by no role but its owner. Task 7's precondition re-reads it after Phases 15–19.

| Signature | Does | Refuses / notes |
|---|---|---|
| `sync_next() returns table (id bigint, created_at timestamptz, params jsonb)` | the oldest `kind = 'sync'`, `state = 'queued'` row, at most one | the queue read R-84 lacked |
| `sync_claim(p_id bigint) returns boolean` | `queued → claimed`, `claimed_at = now()`, `claimed_by = 'sync-runner'`, `claim_attempts + 1` | false when lost or not a sync row |
| `sync_requeue_orphans() returns integer` | on runner start: rows `claimed_by = 'sync-runner'` with `run_id is null` and `claim_attempts < 3` go back to `queued` | a registered row is never requeued |
| `sync_register_run(p_id bigint, p_run_id uuid) returns boolean` | sets `run_id` on this runner's claimed sync row; Phase 19's trigger `agent_requests_open_sync_run` opens the running row | not sync, not claimed, another claimant, already registered, a run id on another request; a quarantined run raises 42501 from 19's trigger |
| `sync_run_outcome(p_run_id uuid) returns table (sync_run_id bigint, status text, summary jsonb)` | the run's real `sync_runs` row (`scope` not `unregistered`); `status` is one of `running`, `ok`, `partial`, `failed` | the wait read (`v_sync_status` is `security_invoker`) |
| `sync_file_worklist() returns table (id bigint, file_name text, relpath text, mime text, source_url text, bucket text, attempt_id text)` | `ingest/pull_files.mjs`'s manifest query: `storage_path is null and superseded_by is null`, `relpath = bb_file_relpath(id)` | — |
| `sync_file_stored(p_id bigint, p_key text, p_relpath text, p_sha256 text, p_bytes integer, p_mime text, p_text_status text) returns boolean` | writes what `bbFilesUpdateSql` writes: `storage_path = 'bb-files/' \|\| p_key`, `local_path = 'course context/' \|\| p_relpath`, `mime_type` coalesced for `my_submissions`, `downloaded_at = now()`, notes `\| bytes pulled <date> by sync-runner` | `where id = p_id and storage_path is null`; the path prefixes are the function's, not the caller's |
| `sync_close(p_id bigint, p_state text, p_report jsonb) returns void` | own `claimed → done/failed`; `queued → failed`; sets `finished_at`, `result = p_report`, `sync_run_id`; appends `p_report->'lines'` to that run's `summary->'changes'`; `error = 'login_required'` → `raise_attention(null, 'stack_must_confirm', null, 'agent_request', 'sync-login-required', null, null, null, <question>, null)` | any other transition; a report that is not an object with an array `lines` |
| `sync_sweep_stale() returns integer` | kinds `sync` and `inbox_feedback`, `state = 'claimed'`, `claimed_at` older than 20 minutes or `claim_attempts >= 3`, not yet flagged → `raise_attention(null, 'stack_must_confirm', null, 'agent_request', 'agent_request:<id>', null, null, null, <question>, null)`, the exact call shape Phase 19's terminal rule uses (99 §RPC signatures, `transform_tick` item 3, the terminal rule); sets `result.dead_lettered_at` | never changes `state`; never retries. The release for a `sync` row is Phase 19's 30-minute terminal rule (136), which fails the request; an `inbox_feedback` row is only flagged (no release in this phase; R-96's list, §Out of scope) |
| `sync_enqueue(p_trigger text) returns bigint` | `p_trigger in ('just', 'login')` (2026-10-03: `'scheduled'` dropped with 092); under `pg_advisory_xact_lock`, returns the open sync's id if one is `queued` or `claimed`; else, for `'login'` only, returns null and inserts nothing unless `sync_login_sync_due(now())`; else inserts one with `params = {"trigger": p_trigger}` | never a second open sync; `'login'` never a second sync on a New York day that already has a `done` one |
| `sync_login_required() returns bigint` (2026-10-03) | the login watch's raise: the same `raise_attention(null, 'stack_must_confirm', null, 'agent_request', 'sync-login-required', null, null, null, <question>, null)` call `sync_close` makes for `login_required`, one shared body; returns the open item's id | an item already open is returned, not duplicated (`attention_items_open_dedupe_idx`) |
| helper `sync_login_sync_due(p_now timestamptz) returns boolean` (2026-10-03) | `stable`, `language plpgsql`, the house `search_path`; true when no `kind = 'sync'` row has `state = 'done'` and a `finished_at` on the New York date of `p_now` | executable by its owner only (no grant to `sync_runner`); called inside `sync_enqueue` |
| `sync_login_ok() returns integer` | archives the open `stack_must_confirm` item with ref `sync-login-required`: `state = 'archived'`, `archived_at = now()`, `archived_by = 'sync-runner'`, `decision = {"closed_itself": true, "rule": "login check passed", "sync_run_id": null, "trigger": "sync_login_ok"}` (114's four keys); returns the rows closed (0 or 1) | touches no other ref. Phase 17's `close_cleared_gaps(bigint, text)` (114) closes only `suggested->>'source' = 'stage_gaps'` rows, so it cannot serve here; this is its own body writing 114's `closed_itself` record shape, one shape and one DECISIONS row shared with R-56 (task 1). `archive_attention_item()` refuses open rows, so it is not used. `raise_attention` consults `attention_answered` only for `missing` / `data_gap`, so the next login death raises a fresh item |

~~092, only if B-45 adopts the reversal: `sync_schedule_due`, `sync_schedule_tick`.~~ Struck 2026-10-03: the
morning sync follows the login (the login watch and `sync_enqueue('login')` above), so 092 is never written.

### Tables and migrations

Additive only. Every file is dry-run in `begin; … rollback;`, then applied with `apply_migration` under the
file's name, byte-identical to the repo. A file that re-creates a live object opens with a
`HOW THIS WAS BUILT` header citing the `pg_get_functiondef` it started from.

| # | File | Creates |
|---|---|---|
| 091 | `db/migrations/091_sync_runner_role.sql` | role `sync_runner`; `agent_requests.claim_attempts smallint not null default 0` (no web or desktop code reads it); the twelve functions and their grants, and the helper `sync_login_sync_due` with no grant; `comment on` each |
| 092 | — | **struck 2026-10-03:** never written (the morning sync follows the login; no column, no cron job). The number stays unused |
| 093 | `db/migrations/093_sync_runner_review_fixes.sql` | reserved for `/code-review` findings: `create or replace` of 091's functions only, 091 byte-frozen (088's precedent); never written if no finding needs SQL |
| 094 | `db/migrations/094_sync_runner_test_membership.sql` | **PROVISIONAL (open item 6):** `grant sync_runner to db_test_runner with inherit false`, so a test unit can `set local role sync_runner` and inherits nothing, plus exactly the table writes the two `phase14_*` units make that Phase 15's 100 does not grant, enumerated by name; a guard block raises if `db_test_runner` is absent. The same PR extends the expected membership list in Phase 15's `db/tests/phase15_100_db_test_runner_role.sql` with `sync_runner` (inherit false), as 95 §Seams requires (task 7a) |
| 095–099 | — | unused slack (94 §2 rule 6) |

**Replay order.** 091–094 are applied after Phases 15–19 (100–139) but replay before them by name (95
§Seams). So no 091–093 body may reference `db_test_runner` or Phase 15's 102 trigger, and every 091
function is `plpgsql`, whose body is checked only when called (so `sync_register_run` relies on 19's trigger
at run time, not at create time). 094 is the one exception: it names `db_test_runner`, so a rebuild replays
it after 100. That is a repo-order rule, not drift, as the 2026-09-13 merge-order row was for 036; task 1
writes it as a DECISIONS row. On 2026-09-27 prod's last numbered migration is `090_attention_archive`, and
none of the Phase 15–19 objects this brief names exists yet (`db_test_runner`, `close_cleared_gaps`,
`sync_request_open_run`, trigger `agent_requests_open_sync_run`, `v_sync_status.notes` and `interrupted`).
Task 7's precondition checks the four Phase 15 and 19 migrations this phase rests on at run time (100 for
the test role, 135–137 for register-first, the terminal rule and the run state); 102 and 114 are named here
only as shapes this brief must not reference or must match, so they are not preconditions.

Phase 15's runner `node scripts/db-test.mjs` runs the tests as `db_test_runner` (B-42's default,
**PROVISIONAL**; "If B-42 goes otherwise" below), one unit per transaction, each beginning `begin;` and
ending `rollback;` (95's runner command contract under its §RPC signatures, functions, the role, and the
runner's command contract; 94 §3). A single file runs with
`node scripts/db-test.mjs --only <file.sql>` and prints `db-test: passed <p>, failed <f>, units <n>`. The
recorded crawl is loaded by a generated loader, `db/tests/phase14_load_crawl_v4.sql`, shaped like
`db/tests/phase12b_load_fixture.sql` (it opens the transaction). The runner's frozen loader map gains one
entry, that loader before `phase14_091_sync_runner.sql`: one line in `scripts/db-test.mjs`, W-55's.

**If B-42 goes otherwise (PROVISIONAL, B-42, through Phase 15; 95 §Stack's calls, row B-42).** Every live
SQL check in this brief rests on B-42's default: a `BB2DASH_TEST_DB_URL` credential and migration 100's
`db_test_runner`. Under either other answer ("no credential", or an owner-level DSN instead of the role)
migration 100 is never written, so open item 6's "If he says no" branch applies in full: 094 is never
written, task 7a and task 1's row (11) are struck (task 1 counts 10), task 7's precondition expects 3 (the
135–137 names only), and R-84's line drops task 7a's membership row and its `phase15_100` runner line. Under
"no credential", each `node scripts/db-test.mjs --only <file>` check (tasks 6, 11 and 13) and the DoD's
whole-suite gate become one `execute_sql` paste per unit (the loader and its test file together), each
expecting its `: PASS` row (task 6's RED line expects its `FAIL …` exception instead); task 7's `--ping` line
has no paste form and drops, as Phase 15's own `--ping` step does, and with it R-84's `--ping` line, so the
role's first login through 5432 shows only as the runner's per-connect log line in task 28's container run.
Under an owner-level DSN the `--only` commands stay as written and run as `postgres`. `--list` and
`node --test scripts/db-test.test.mjs` connect to nothing and stay under every answer.

`db/tests/phase14_091_sync_runner.sql` asserts:
* (setup, not an assertion) it first sets any open (`queued` or `claimed`) sync row to `cancelled` inside its
  own transaction, so `sync_next()` and `sync_enqueue` see only the unit's rows whatever prod holds (none
  was open on 2026-09-27); the rollback restores them;
* each refusal in the table above, plus claim → register → close and a lost claim;
* the 42501 on a quarantined run id;
* the fixture's nine `bb_raw` rows loaded twice under one run id insert 0 rows the second time;
* `sync_close` appends its lines;
* two `login_required` closes leave one open item; `sync_login_ok()` returns 1 and leaves it
  `archived` with `archived_by = 'sync-runner'` and `decision->>'closed_itself' = 'true'`; a third
  `login_required` close then opens exactly one new item;
* the sweep flags a 21-minute claim once and a third-claim row at once, and a second sweep flags nothing;
* requeue skips registered rows and rows at 3 claims;
* `sync_enqueue` twice returns one id;
* the login trigger (2026-10-03): `sync_enqueue('login')` with no sync `done` today returns a new id whose
  `params->>'trigger'` is `login`; with one open returns that id; with one `done` today (New York) returns
  null and inserts nothing; `sync_enqueue('scheduled')` is refused. `sync_login_sync_due` reads the New York
  date, not UTC: a `done` sync finished `2026-10-31 03:30Z` (23:30 the day before in New York) leaves
  `2026-10-31 12:00Z` due, one finished `2026-10-31 13:00Z` does not, and the same across the
  `2026-11-01` fall-back (`2026-11-02 04:30Z` is 23:30 on the 1st, `2026-11-02 05:30Z` is 00:30 on the 2nd);
* `sync_login_required()` twice returns the same item id, and `sync_close(…, 'login_required')` after it
  opens no second item;
* under `set local role sync_runner` (094), reading `agent_requests`, `bb_files` or `attention_items`
  raises 42501, and `has_table_privilege('sync_runner', …, 'select')` is false for all three; executing
  `sync_login_sync_due` raises 42501;
* `anon` and `authenticated` execute none of the twelve, nor the helper;
* no `pg_default_acl` row names `sync_runner`;
* the unit's last row reads `phase14_091: PASS` (Phase 15's pass rule).

~~`db/tests/phase14_092_scheduled_sync.sql`~~ struck 2026-10-03 with 092; its New York date cases moved
into the 091 unit's login-trigger bullet above.

### Files

**bb2dash, new:**
* W-55:
  * `db/migrations/091_sync_runner_role.sql`, `db/migrations/093_sync_runner_review_fixes.sql` (reserved),
    `db/migrations/094_sync_runner_test_membership.sql` (092 struck 2026-10-03)
  * `db/tests/phase14_091_sync_runner.sql`, `db/tests/phase14_load_crawl_v4.sql` (generated; never
    hand-edited)
  * `db/fixtures/phase14/crawl_v4_scrubbed.json`, `db/fixtures/phase14/scrub_crawl.mjs` (exports
    `SCRUB_FIELDS`; writes `db/tests/phase14_load_crawl_v4.sql`, as `db/fixtures/phase12b/build_load_sql.js`
    does), `db/fixtures/phase14/README.md`
  * `docs/planning/sprint-2/verification/100_W55_VERIFICATION.md`
  * `sync/package.json`, `sync/package-lock.json`, `sync/tsconfig.json` (includes
    `../desktop/src/core/sync-id.ts`), `sync/vitest.config.ts` (80% line threshold)
  * `sync/src/main.ts`, `sync/src/loop.ts`, `sync/src/login.ts`, `sync/src/db.ts`, `sync/src/crawl.ts`,
    `sync/src/files.ts`, `sync/src/report.ts`, `sync/src/secrets.ts`, `sync/src/probe.ts`,
    `sync/src/enqueue.ts`
  * `sync/test/login.test.ts`, `sync/test/loop.test.ts`, `sync/test/files.test.ts`,
    `sync/test/report.test.ts`, `sync/test/secrets.test.ts`, `sync/test/fixture-scrub.test.ts`,
    `sync/test/integration.test.ts`
* W-56:
  * `docker/grep-clean.test.mjs`
  * `.dockerignore`, `.gitattributes` (`* text=auto eol=lf`)
  * `mcp-server/Dockerfile` (`node:22-slim`, multi-stage, stdio only), `mcp-server/.dockerignore`,
    `mcp-server/src/env-file.ts` (reads `SUPABASE_SERVICE_ROLE_FILE`, ported from the harness's
    `mcp-server/src/env-file.ts`), `mcp-server/test/env-file.test.ts`
  * `ingest/pyproject.toml`, `ingest/uv.lock` (python-docx, python-pptx, openpyxl),
    `ingest/extract_text.test.mjs`, and in `ingest/fixtures/extract/` the synthetic `sample.pdf`,
    `sample.docx`, `sample.pptx`, `sample.xlsx` and their `expected.json`
  * `scripts/install-skills.mjs` (the hash-checked copy of the harness's `hooks/install-checkpoint.mjs`;
    `--check` mode), `scripts/install-skills.test.mjs`
  * `docs/planning/sprint-2/verification/100_W56_VERIFICATION.md` (with the refreshed R5 OS-bound table, P-44)
  * launcher branch: `desktop/test/unit/sync-launcher.test.ts`; and (2026-10-03) the login prompt:
    `desktop/src/core/login-prompt.ts`, `desktop/src/main/login-prompt.ts`,
    `desktop/test/unit/login-prompt.test.ts`
* PM:
  * `desktop/src/core/sync-id.ts` (`SYNC_ID_PATTERN`, `isValidSyncId`, `InvalidSyncIdError`) and
    `desktop/test/unit/sync-id.test.ts`, committed before any worker branch is cut
  * the spike: the first `docker/sync/Dockerfile`, `docker/sync/seccomp_profile.json`,
    `docker/sync/entrypoint.sh`, `docker/sync/spike/session-age.mjs` (deleted in task 15) and a minimal
    `compose.yaml`, all handed to W-56
  * In `docs/planning/sprint-2/verification/`: `82a_parity_queries.sql`, `82a_PHASE14_PARITY_AND_IMAGES.md`,
    `82b_NOVNC_SPIKE.md`, and the committed copies of `100_W57_VERIFICATION.md` and
    `100_W58_VERIFICATION.md` (the other two repos' workers hand theirs over). The folder
    `docs/planning/sprint-2/verification/` does not exist yet (P-38); the PM creates it with its first file
    (task 2's `82a_parity_queries.sql` or task 3's first probe row in 82b, whichever lands first)
  * In `docs/planning/sprint-2/walks/walk-14/` (new, with the folder `walks/`): `01-novnc-duo-login.png` and
    `02-after-restart.png` (task 4), `03-activity-report.png` and `04-inbox-login-needed.png` (task 28)

**bb2dash, changed:**
* PM:
  * `desktop/src/core/sync-command.ts`: imports the id check from `sync-id.ts` and re-exports it
  * `project-state/STATUS.md`, `DECISIONS.md`, `ORCHESTRATOR.md`, `CLAUDE.md` (the no-Docker sentence)
  * `docs/planning/sprint-2/82_PHASE14_containers.md`: one superseded-by line under its title
* W-55:
  * `skills/bb-sync/SKILL.md`, step 1 only. The login item takes ref `sync-login-required`, and the
    "migration 031" citation (SKILL.md:58) becomes 041.
  * `scripts/db-test.mjs` (Phase 15's; shared under the named-hunk rule, see §Workers): one entry in its
    frozen loader map, `phase14_load_crawl_v4.sql` before `phase14_091_sync_runner.sql`; nothing else in the file.
  * `db/tests/phase15_100_db_test_runner_role.sql` (Phase 15's; shared under the named-hunk rule): its
    expected membership list gains `sync_runner`, inherit false (task 7a; **PROVISIONAL, open item 6**); nothing else in the file.
* W-56:
  * the PM's spike files from task 4, made production-ready in task 15: `docker/sync/Dockerfile` (FROM
    `mcr.microsoft.com/playwright:v1.63.0-noble`, matching desktop's `@playwright/test` 1.63.0),
    `docker/sync/entrypoint.sh`, `docker/sync/seccomp_profile.json` and `compose.yaml`
  * `mcp-server/src/config.ts`, `mcp-server/test/config.test.ts`, `mcp-server/README.md` (the
    registration recipe: `docker run -i --rm` with a read-only bind of `bb2dash_mcp_service_key`),
    `mcp-server/scripts/smoke.mjs` (a `--docker` mode; the `C:/` default at :33 goes)
  * `ingest/pull_files.mjs`: `extractUnits` (:187 today) runs the locked project instead of `--with`;
    nothing else
  * `.gitignore`: `local_cache/`, `secrets/`
  * the one blob `git add --renormalize .` rewrites under the new `.gitattributes`:
    `fall2026 courses + context.txt`, the only `i/crlf` file `git ls-files --eol` shows at a5042fa
  * `docker/sync/spike/`: deleted in task 15, once 82b holds the overnight log
  * launcher branch: `desktop/src/core/config.ts`, `desktop/src/main/index.ts`,
    `desktop/test/unit/config.test.ts`

**agentic-harness (W-57; PROVISIONAL, B-49: a "No" strikes tasks 20–22, leaving only task 23's
`hooks/doctor.mjs`, `hooks/tests/doctor.test.mjs`, `docs/portable.md` and `.github/workflows/test.yml`):**
* New: `docker/jobs/Dockerfile` (uv multi-stage over `ghcr.io/astral-sh/uv:python3.12-bookworm-slim` and
  `python:3.12-slim-bookworm`, plus Node 22, git and tini; non-root; the `certs/` CA copied in),
  `compose.yaml`, `.dockerignore`, `scripts/jobs-entrypoint.sh` (the `*_FILE` shim and the git credential
  for `vault_realm_pat`), `hooks/scheduler.mjs`, `hooks/lib/schedule.mjs`, `hooks/tests/schedule.test.mjs`,
  `hooks/tests/scheduler.test.mjs`, `hooks/tests/grep-clean.test.mjs`.
* Changed: `hooks/doctor.mjs` (`--strict`, per-realm clean and pushed rows, the `ingest --health` age),
  `hooks/tests/doctor.test.mjs`, `hooks/lib/constants.mjs` (`DEFAULT_VAULT_SEGMENTS` stops naming OneDrive),
  `docs/portable.md` (step 7), `.github/workflows/test.yml` (the ubuntu legs become required).

**bb2dash-stack, all new (W-58; PROVISIONAL, B-51; `.devcontainer/*`, `scripts/seed-claude-home.sh`,
`scripts/dev-smoke.sh` PROVISIONAL, B-48):** `compose.yaml` (`include:` each repo with `project_directory`),
`justfile`, `.gitignore`, `.env.example`, `secrets.example/` (11 empty files), `machine.env.example`
(P-59), `doctor/doctor.mjs`, `doctor/doctor.test.mjs`, `README.md` (the only document a new machine needs,
both realms included), `.devcontainer/Dockerfile` (the Anthropic reference, rebased on
`node:22-bookworm`, P-108), `.devcontainer/devcontainer.json`, `.devcontainer/init-firewall.sh` (allowlist
widened for Supabase, Vercel, GitHub, npm, PyPI and astral.sh; `statsig.anthropic.com` dropped),
`scripts/seed-claude-home.sh` (seeds without `~/.claude.json`; hook and plugin paths rewritten),
`scripts/dev-smoke.sh`.

### Seams

* **Phase 15.**
  * `node scripts/db-test.mjs` and the `db_test_runner` role run the `phase14_*` test files (092's only
    when written), the 091 file behind its loader; `--only` runs one.
  * 95 §Seams, its Phase 14 row: "Its privilege reads need no membership. Its behaviour tests use
    `set local role sync_runner`, which brief 100's `094_sync_runner_test_membership.sql`
    (**PROVISIONAL**, its open item 6) grants to `db_test_runner` with inherit false." Its memberships
    row: `db/tests/phase15_100_db_test_runner_role.sql` asserts `db_test_runner`'s memberships as exactly
    the roles granted so far, and "every later migration that grants it a further membership (094 in
    brief 100 / Phase 14, `sync_runner`; …) extends that expected list in the same PR". So task 7a adds
    `sync_runner` (inherit false) to that file's expected list in W-55's PR, and task 1's row (11) records
    094's replay after 100.
  * Its frozen loader map gains one entry (`phase14_load_crawl_v4.sql`), W-55's one-line change.
  * Its suite keeps re-asserting the `sync_runner` privilege counts, so a later grant fails a test.
  * `search_path` pinning is the house rule every 091 function follows (101's guard shape).
* **Phase 17.** R-56's gap self-close is `close_cleared_gaps(bigint, text)` in 114, and it closes only
  `stage_gaps` rows. `sync_login_ok()` is 091's own body writing the same `decision.closed_itself` record,
  so the two share one record shape and one DECISIONS row (task 1), not one function. The heartbeat view
  `v_scheduler_heartbeat` (P-71) is not touched here. The SyncButton copy text is not changed here either.
* **Phase 18** (98 §Seams "18 → 14").
  * The runner imports `ingest/fetch_signed.mjs` (the signed-CDN route: `resolveSignedUrl`, `downloadTo`)
    with Playwright's request context, and runs `ingest/embed_corpus.mjs` after its pull. Both are new in
    Phase 18; the runner does not rebuild them. It injects crawler v5.
  * `bb_crawler.js` v5's key names, `stage_files`, `pull_files.mjs --fetch` and `skills/bb-sync` step 4b
    stay 18's.
  * The sync image needs `uv` plus `extract_text.py`'s three libraries, and not antiword or tokenizers
    (both PM-run in Phase 18). `SB_ANON_JWT` and `SB_ANON_KEY` are 18's env names.
* **Phase 19 (brief 99 §Seams, its "Phase 14" item).**
  * Registration is setting `agent_requests.run_id` while the request is claimed; trigger
    `agent_requests_open_sync_run` (function `sync_request_open_run()`, migration 135) opens the running
    row and refuses a quarantined run (42501).
  * A registered run folds only on its calendar row.
  * The terminal rule closes stale claims at 30 minutes with ref `agent_request:<id>`, which 091's sweep
    reuses. `v_sync_status` gains `notes` and `interrupted` (137).
  * The attempts counter (P-104) is 14's.
  * The 2026-09-15 register-after row is superseded by 19's row, not here.
* **Phase 16.** The V-1 launcher's MCP registration accepts the docker registration from task 17. The
  `validate-grading` Node twin (82 task 13) is 16's.
* **Phase 20.**
  * R-97 (`/inbox-apply`'s vault path) and R-98 (checkpoint redaction) are 20's.
  * If 20's P-110 helper merges first, task 22 changes that helper's default instead of `constants.mjs`.
  * The container-writer line of R-100 is proven here, in acceptance step A6.
  * The harness's live realm nights (Phase C) and the R-B4 PAT test pass before any container writes to a
    realm.
* **Phase 21** (94 §3) reuses the umbrella, `secrets/`, the subscription-token pattern and the
  `bb2dash-mcp` image, and puts a `workspace_runner` role on `sync_runner`'s shape.
* **Sprint 1 objects.**
  * The queue and its trigger path: `agent_requests` (032, kind check 077), `transform_tick` (044 → 19's
    136), `v_sync_status` (035 → 137), `sync_change_lines` (051) and `sync_runs.summary`.
  * The Inbox: `attention_items`, `raise_attention` and `attention_items_open_dedupe_idx` (041), and the
    archive state (090).
  * Files: `bb_file_relpath()` (052), the `public.bb_files` policy `bb_files_anon_insert` (003, narrowed by
    049; the Storage policy of the same name stays as 003 made it), `bb_file_text` (anon insert, 007),
    Storage `bb-files` (publishable key, no `x-upsert`).
  * Crawler and embedding: `ingest/bb_crawler.js` v4 (`installCrawler` :446, `runAll` :606) and the
    `embed-corpus` edge function (legacy anon JWT, about 8–9 parts per call).
  * The Phase 12 shell: `desktop/src/main/sync-terminal.ts`, `desktop/src/main/wt.ts` and
    `desktop/src/core/sync-command.ts`, all kept until R-96's deletion.
  * The desktop audits: `desktop/test/unit/audit.test.ts`'s env list (`BB2DASH_*` already allowed) and
    `desktop/test/unit/core-portability.test.ts`.

### Must respect (DECISIONS.md, verbatim)

* 2026-09-03 — "Crawler holds only the publishable key; insert-only RLS"
* 2026-09-09 — "Docker: skipped" (narrowed by the 2026-09-16 Direction row, whose Why reads "Narrows the 2026-09-09 no-Docker decision to development time only"; task 1's first row records the build)
* 2026-09-09 — "Workflow SOP: dev on branches, push per completed task, **one PR per phase**, merge only on Stack's word" (the per-repo exception is task 1's row)
* 2026-09-09 — "`embed-corpus` persists per-part, not per-unit"
* 2026-09-10 — "The transform folds **only crawls registered on an owner-claimed `agent_requests` row** (`agent_requests.run_id`, migration 039); unregistered `bb_raw` runs are quarantined once, never folded; `bb_raw` unique on `(run_id, kind, bb_course_id)`" (task 1 amends "owner-claimed" to admit `sync_runner`, a second principal that can authorise a fold)
* 2026-09-10 — "RLS hardened to owner-scoped (migration 020): 21 `using(true)` authenticated policies → `auth.uid() = public.app_owner()`" (091 adds no policy; `sync_runner` reaches rows only through its twelve DEFINER functions)
* 2026-09-10 — "**All 15 public views are `security_invoker`** with anon revoked (migration 036, guard block refuses a future non-invoker view)"
* 2026-09-10 — "Sync cadence: **Stack triggers**, the app does the rest; no scheduled crawl, no reminders" (amended 2026-10-03: Stack's morning login triggers the day's sync, and the app opens the login page when the login is dead)
* 2026-09-11 — "SECURITY DEFINER transform functions are not callable by `authenticated` (038); the app's only path to a transform is an `agent_requests` row"
* 2026-09-14 — "`attention_items` dedupes only while `state = 'open'` (041); a "Keep mine" answer stands until Blackboard's value changes (042); `applied_at` is set only when a fact was written, otherwise the row stays "answered, applies on next sync" (042)"
* 2026-09-14 — "**Definition of done for every remaining phase = SOP gates + Stack's acceptance script** walked on the Vercel preview; sign-off once per phase, at the PR"
* 2026-09-14 — "**Every task carries an executable check** (test, SQL assertion, curl, screenshot diff) the worker runs itself, plus one demo line for the acceptance script; a task without a check is not a task"
* 2026-09-15 — "One open `sync` request at a time: while a `queued`/`claimed` sync exists, the Sync button re-copies its command instead of inserting another row"
* 2026-09-15 — "`bb_files` anon INSERT is tightened to refuse `bucket = 'my_submissions'` and any `classified_by` of `stack` or `blackboard`; the Storage `bb_files_anon_insert` policy (bytes only) is **left as is**"
* 2026-09-15 — "A pulled-back submission file's Storage key carries an **`attempt-<id>/` segment** (`bb_file_relpath`, 052); a staged file keeps `<course>/my_submissions/<slug>/<file>`; step 4b never treats a Storage 409 as done"
* 2026-09-15 — "Parallel PM sessions never branch or commit in the shared checkout `C:/Users/stack/projects/bb2dash`; each phase branch is its **own worktree** (`bb2dash-wt-<phase>`) and the brief is edited there"
* 2026-09-16 — "**Direction: after development, bb2dash migrates from this laptop into containers (R-28).** Phase 12's OneDrive file mirror is **dropped**; `desktop/src/core/` is plain Node with no `electron` import behind `Notifier` / `Launcher` / `WatermarkStore` adapters, so the poller and the sync launcher port as-is"
* 2026-09-16 — "**Phase 14 = R-28 containers, planned** (`82_PHASE14_containers.md`): portability first on this laptop; Supabase and Vercel stay managed, no local Supabase; scope = bb2dash sync + scripts, materials MCP, harness jobs, a Claude Code dev container; vault leaves OneDrive for a private git repo; `.env`-style secrets folder + Docker secrets; scheduler in a container; per-repo compose + umbrella repo; Electron Sync button only queues after acceptance; $0 and the Windows path stays as fallback until acceptance"
* 2026-09-16 — "Phase 14 research calls, proposed (frozen when its PM session runs): the sync becomes a **deterministic Node + Playwright `sync-runner`**, no LLM in the common path; browser and driver share one container with noVNC for the Duo login; the scheduler is an internal-timer process with missed-run catch-up, not Ofelia/cron; the scheduled sync is a pg_cron-queued `agent_requests` row; images build locally, no registry or CI; Claude in containers uses the subscription token from `claude setup-token`" (frozen by task 1)
* 2026-09-17 — "Config gains **`syncDryRun`** (`BB2DASH_SYNC_DRY_RUN=1`): the sync terminal prints the command instead of running it. The sync-terminal dedupe is an **in-process set**, not `firedKeys`. …" (kept until R-96's deletion)
* 2026-09-22 — "**An answered Inbox row is processed once and archived: `attention_items.state = 'archived'` (090) with `archived_at`, `archived_by` and a `decision` record; `archive_attention_item()` is the only way in; `v_inbox_queue` is the worker's queue.** A state, not a second table" (task 1's row (10) records `sync_login_ok()` as a third way in, after Phase 17's gap self-close)
* 2026-09-22 — "… It flags feature changes and merges, raises new questions through `raise_attention()`, and never resolves an open row. Runs as `bb-sync` step 0 and from the Inbox's "Apply answers" button" (task 1 amends step 0 for the container, B-44)
* 2026-09-22 — "**The file pull lives in the repo: `ingest/pull_files.mjs` (+ `node --test ingest/pull_files.test.mjs`)**, replacing the session scratchpad script. The browser half stays a Playwright snippet in its header; the script never writes `bb_files` itself and hands the owner one `update` per file" (task 1 restates it: the runner applies each update through `sync_file_stored`)
* 2026-09-22 — "**Sprint 2 planning follows the Phase 12b method** (list → ids → triage → researchers → one question batch → briefs); migration numbering continues from 091"
* 2026-09-24 — "… The vault's move out of OneDrive into git realms (harness PRs #8–#15, 2026-09-23/24: `C:/Users/stack/vault`, realms `projects` and `classes` with private remotes, machine file, commit → merge-pull → push, never rebase) **supersedes Phase 14's C-4** vault plan"
* 2026-09-24 — "No product call in them is adopted here: each gets its own row, dated the day Stack answers, and a brief may not cite a default as decided before then" (why every B-number here is PROVISIONAL)

## MVP (in Stack's words)

What Stack wrote himself for this sprint is one word, in 91 §3 (S2-containers-1, "what (Stack's
words)"): "containerization". Its why, must/should, acceptance and must-not are "_to confirm_" there,
and B-4 carries the PM's default. The paragraph below is 82 §MVP, written in his voice by the 80c method
(the PM session drafts, Stack confirms) and confirmed by him on 2026-09-16 with one word, "matches". It is
quoted from 82 as the MVP he confirmed:

> "On a clean copy of three repos I fill in one secrets folder and run one command. A page on my laptop
> shows a browser where I log in to Blackboard with Duo. After that the app's Sync button just works — no
> terminal — and a sync also runs by itself each morning while that login is alive; when it dies the
> Inbox tells me to log in again. The nightly vault ingest and the checkpoint collection run on their own,
> and catch up if the laptop was asleep. My vault is a private git repo. I can open a dev container and run
> a Claude PM session with both MCP servers, my skills and my memory in it. The Windows Task Scheduler jobs
> are gone. Nothing costs money."

*PM's reading of it for today (PM wording, not Stack's; each line rests on a PROVISIONAL B-number):*
* "a sync also runs by itself each morning while that login is alive" is read, since 2026-10-03, as: the
  morning sync runs right after Stack's morning Duo login, which the desktop app prompts by opening the
  login page.
* "My vault is a private git repo" is already met by the two realm repos (2026-09-24). The jobs container
  writes to them as `home-pc` (B-50).
* "when it dies the Inbox tells me" is the button-press path, with no toast (B-46).
* "The Windows Task Scheduler jobs are gone" means the two `AgenticHarness-*` jobs on home-pc (B-49).

## Definition of done

SOP gates, each on its own PR:
- [ ] bb2dash: `cd sync && npm run typecheck && npm run build && npx vitest run --coverage` (exit 0);
      `cd desktop && npm run typecheck && npm test`; `cd mcp-server && npm run typecheck && npm run build && npm test`;
      `node --test ingest/pull_files.test.mjs ingest/extract_text.test.mjs ingest/fetch_signed.test.mjs ingest/embed_corpus.test.mjs docker/grep-clean.test.mjs scripts/install-skills.test.mjs scripts/db-test.test.mjs`;
      `node scripts/db-test.mjs` exits 0 over the whole `db/tests` suite (last line `db-test: passed <n>, failed 0, units <n>`);
      `cd web && npx vitest run` exits 0 and its `Test Files` line shows the same passed count as the same
      command on `main`, both recorded in `100_W56_VERIFICATION.md` (the `.gitattributes` renormalize must not move it).
- [ ] Migrations: each applied file is recorded under its name and byte-identical:
      `select md5(statements[1]) from supabase_migrations.schema_migrations where name = '<name>'` equals
      `git show HEAD:db/migrations/<file> | md5sum` (LF form, the method of brief 99 §Task list's "Migrations recorded; advisors clean" task, 26) for 091 and 094 (and
      092, 093 when written); `ls db/migrations | grep -c "^09[1-9]_"` prints the same number as
      `select count(*) from supabase_migrations.schema_migrations where name ~ '^09[1-9]_'`.
- [ ] agentic-harness: `cd hooks && npm test`, `cd ingest && uv run pytest`, `cd mcp-server && npm test`
      each exit 0 on Windows, and the branch's last CI run on the ubuntu legs is green:
      `gh run list --repo emstacho-su/agentic-harness --branch feat/containers --limit 1 --json conclusion --jq '.[0].conclusion'`
      → `success`. Test files, against the base (the harness `main` SHA recorded in DECISIONS at task 1, which
      W-57 is cut from): `ls hooks/tests/*.test.mjs | wc -l` no fewer than the base's count + 3 (task 20);
      `ls ingest/tests/test_*.py | wc -l` and `ls mcp-server/test/*.test.ts | wc -l` no fewer than the base's
      counts (`git ls-tree --name-only <sha> ingest/tests/ | grep -c "/test_[^/]*\.py$"` and
      `git ls-tree --name-only <sha> mcp-server/test/ | grep -c "\.test\.ts$"`). The SHA and each pair of
      counts are recorded in `100_W57_VERIFICATION.md`.
- [ ] bb2dash-stack: `node --test doctor/doctor.test.mjs` → `# fail 0`.
- [ ] `/code-review main high` on each PR: CRITICAL and HIGH cleared. A SQL fix goes to 093; 091 stays
      byte-frozen.
- [ ] `/security-review` on each PR: noVNC exposure, the `bb-profile` volume, `sync_runner` and its twelve
      RPCs (a second principal that can authorise a fold), 094's membership (the test credential can act as
      `sync_runner` inside a rolled-back unit), the Chromium sandbox choice (seccomp profile, non-root; any
      `--no-sandbox` fallback named), secrets handling and the `*_FILE` shims, the MCP key file,
      `vault_realm_pat`, and the dev container's firewall allowlist. `log_connections` is off on the
      project, and prod on 2026-09-27 says the platform will refuse `alter role sync_runner set
      log_connections = on`: the setting's context is `superuser-backend`, `postgres` is not a superuser,
      `has_parameter_privilege('postgres', 'log_connections', 'SET')` is false, and
      `supautils.privileged_role_allowed_configs` does not list it. So the runner's own per-connect log
      line stands; the dry run still tries the `alter role` once, pastes the refusal into
      `100_W55_VERIFICATION.md`, and DECISIONS records it.
- [ ] STATUS, DECISIONS and ORCHESTRATOR are updated in the bb2dash PR. `CLAUDE.md`'s "There is no Docker
      during development" is corrected. STATUS carries R-96's deferred list under "Phase 14 deferred (R-96)".
- [ ] SOP: work on branches only, commit and push per completed task (`feat(14-T<n>): …`), never on `main`.
      The PRs are open (bb2dash phase, agentic-harness, bb2dash-stack: one per repo under B-51,
      PROVISIONAL), and the early launcher PR is merged on Stack's word before A1. Nothing merges to `main`
      without his word in that conversation. Nothing in `web/` changes, so no Vercel preview is owed; the
      visual proofs are `walks/walk-14/`, shown to Stack before any merge.

**Stack's acceptance script** (a fresh rebuild on this laptop, across at least one night; each step ticks
`- [x] A<n>` in 82a with its evidence, and a struck step is written `- [~] A<n> struck (B-<n>)`):

1. **A1.** In WSL, clone bb2dash, agentic-harness and bb2dash-stack into `~/dev`. Copy `secrets.example/` to
   `secrets/` and fill the 11 files; copy `.env.example` and `machine.env.example`. The realms are the
   Windows checkouts at `C:/Users/stack/vault` (B-50, **PROVISIONAL**).
2. **A2.** `just up`: every service is healthy. `just doctor` exits 0 and lists both realms clean and pushed.
3. **A3.** `just login`: log in to Blackboard with Duo in the noVNC page.
4. **A4.** With `syncLauncher` set to `queue-only`, press Sync in the app. No terminal opens. The sync
   lands, Activity shows the runner's lines, and new files are in Storage.
5. **A5** (login-triggered, 2026-10-03). The next morning the desktop app opens the login page by itself,
   already unlocked; after NetID and Duo, a sync runs without pressing Sync, and the Inbox's login item is
   archived.
6. **A6** (struck if B-49 is answered "no"). `just ingest-now`, then a `rag` search finds a note written
   that day. After a night asleep, the 03:00 job ran on wake, and the jobs container pushed its notes to the
   realms.
7. **A7** (struck if B-48 drops the dev container). `just dev`, then `claude`, then `/bb2dash-pm` loads. Both
   MCP servers answer, memory is there, a worktree is created and a test suite runs.
8. **A8** (struck if B-49 is answered "no"). Task Scheduler shows neither `AgenticHarness-NightlyIngest` nor
   `AgenticHarness-CheckpointCollect`.
9. **A9.** Stop Docker: `claude "/bb-sync <id>"` on Windows still works.

**Cut-over order (C-8 amended, R-85):**
1. The containers are proven (A1–A4).
2. `syncLauncher` goes to `queue-only`. This is reversible and is already set for A4, so the skill and the
   runner never race a claim.
3. Both Task Scheduler jobs are *disabled* before the container scheduler's first night (B-49,
   **PROVISIONAL**).
4. Nights pass (A6), then A7.
5. On acceptance, both jobs are unregistered (A8) and A9 is walked.
6. DECISIONS records the cut-over.

One line per requirement in scope:
* **R-81:** task 12 green, plus task 28's container run (`claimed_by = 'sync-runner'`, `done`, files pulled).
* **R-82:** 82b "Verdict: PASS", `walk-14/01` and `/02`, and task 15's checks.
* **R-83:** `phase14_091` PASS, `report.test.ts` green, `walk-14/03` and `/04`, and the login item archived
  after re-login.
* **R-84:** task 7's precondition and its three post-apply SQL checks (the twelve names, 0, 0), its
  `--ping` line, task 7a's membership row and its `phase15_100` runner line, and the `/security-review` pass.
* **R-85:** task 28's parity assertions, task 18 merged, and task 29's cut-over ticks.
* **R-86:** the two grep-clean tests green (tasks 16, 22).
* **R-87:** login-triggered (2026-10-03): task 13's cases in `phase14_091` PASS, task 9's login-watch cases
  green, A5 ticked, and no `092_` file exists.
* **R-88:** tasks 24–25 and A2.
* **R-89:** 11 secret names; gitleaks clean on 4 of 4 images, filesystem and history (task 27); `sb_secret_` absent from `~/.claude.json` and
  `bb2dash/.env` (task 17's Stack step).
* **R-90:** tasks 20–23, A6 and A8.
* **R-91:** task 17.
* **R-92:** task 26 (`SMOKE PASS 7/7`) and A7.
* **R-93 and S2-containers-1:** task 29 (9 ticks; one fewer for each step B-48 or B-49 strikes).
* **R-94:** 82a's five base-manifest rows and a clean `docker compose build`.
* **R-95:** this brief and task 1's freeze row.
* **R-96:** the deferred list in STATUS (task 30), with no build.

## Task list

Commands run from the named repo's root unless a `cd` is shown. W-55 and W-56 are cut only after task 4's
PASS, with Phases 15, 18 and 19 on `main`. W-57 and W-58 may be cut after task 1; W-57 from the harness `main` SHA task 1's row (1) records.

| # | task | covers | owner | deterministic check | demo line for Stack |
|---|---|---|---|---|---|
| 1 | **Freeze.** Record Stack's B answers here; re-cut every task the "Stack's calls" table names where an answer differs. Write eleven DECISIONS rows, each beginning `**Phase 14 freeze:`: (1) "Contract frozen" — brief 100 supersedes 82's Contract; the 2026-09-16 research calls adopted (deterministic runner, B-43; x11vnc + noVNC, P-103; seccomp, not `--no-sandbox`, P-102; internal-timer scheduler; local builds; subscription token); the build narrows 2026-09-09 "Docker: skipped" as the Direction row did; B-4, B-46, B-47 (Entra CA / KMSI, P-93); and the agentic-harness `main` SHA W-57 is cut from, written `agentic-harness main <sha>` (the base of task 20's and the DoD's harness test-file counts); (2) "owner-claimed" amended for `sync_runner`; (3) step 0 amended (B-44); (4) the file-pull row restated for `sync_file_stored`; (5) one PR per repo plus the launcher PR, `bb2dash-stack` and `just` (B-51); (6) D-20 narrowed to image registry and image-build CI, the harness pgvector store allowed (P-50); (7) B-48; (8) B-49; (9) B-50; (10) the login item's self-close, a third way into `archived` with 114's `closed_itself` shape, shared with R-56 and stated as the exception to SKILL.md's "Never resolve an `attention_items` row" rule; (11) 094 replays after 100 (only while open item 6 keeps 094). Separately, and only if B-45 adopts it, the R-87 reversal row in the "Reversal adopted (Requirements v2 §5 …)" form, naming v2 §5's still-declined "scheduled or in-Electron crawls (Duo)"; it does not begin `**Phase 14 freeze:`. Put the superseded-by line under 82's title (P-33, P-60) | R-95, P-33, P-34, P-39, P-50, P-60, P-93, P-102, P-103 | PM | (d) `grep -c "Phase 14 freeze:" project-state/DECISIONS.md` → 11 (10 if open item 6 is answered no, or if B-42's answer leaves migration 100 unwritten: **PROVISIONAL, B-42**); `grep -cE "Phase 14 freeze: Contract frozen.*agentic-harness main [0-9a-f]{7,40}" project-state/DECISIONS.md` → 1; `git diff main -- project-state/DECISIONS.md \| grep -c "^+.*Reversal adopted (Requirements v2 §5.*scheduled or in-Electron crawls (Duo)"` → 1 if B-45 adopts, 0 otherwise; `grep -c "briefs/100_PHASE14_containers.md" docs/planning/sprint-2/82_PHASE14_containers.md` → 1 | — |
| 2 | Freeze the parity query set before W-55 is cut. Q1: current totals of `assignments`, `readings`, `bb_content`, `announcements`, `bb_files`, `bb_attempts`. Q2: `bb_raw` rows per kind for a run. Q3: `bb_attempts` per run. Q4: `bb_gradebook` per run. Q5: the two runs' `summary` seen counters. Q6: each run's status and stages. The baseline is run 62 (26 attempts, 58 gradebook rows, 9 `bb_raw`; re-read on prod 2026-09-27: request 39 → `sync_runs` 62, run `3b5174b8`, started 2026-09-23, still the last sync request) | R-85, P-40 | PM | (d) `grep -c "^-- Q[1-6] " docs/planning/sprint-2/verification/82a_parity_queries.sql` → 6 | — |
| 3 | **Task 0** (B-47: started 2026-09-29 15:25Z, DECISIONS of that date). Once a login is confirmed, idle probes are spawned periodically, self-paced, for as long as the login lives (Stack, 2026-09-29: not an hourly clock); the same profile reopened at about +1/3/7/14 days (Duo remember-me). Each probe is written as a row with its elapsed time, read as an unknown Entra Conditional Access / KMSI policy, not Shibboleth ceilings | R-82, P-93 | Stack + PM | (d) `grep -c "^| reopen-" docs/planning/sprint-2/verification/82b_NOVNC_SPIKE.md` → 4; `grep -c "^| probe-" …` → ≥ 5; `grep -c "^Idle lifetime: " …` → 1 || probe-" docs/planning/sprint-2/verification/82b_NOVNC_SPIKE.md` → 8 | "I measured how long my Blackboard login lives" |
| 4 | **Spike (gate).** Build the pinned Playwright image with Xvfb, x11vnc and noVNC under `docker/sync/seccomp_profile.json`, the `bb-profile` volume, `127.0.0.1:6080` and `novnc_password`. `session-age.mjs` launches Chromium with the Contract's call, `launchPersistentContext(<bb-profile>, { headless: false, chromiumSandbox: true })`. Stack logs in with Duo; then `docker compose restart sync`; then `session-age.mjs` logs overnight. **Sandbox rule (P-102):** if Chromium starts under the profile and the `/proc` scan below counts 0 `--no-sandbox` while `session-age.mjs` runs, 82b gets the line `Sandbox: seccomp`; if the launch fails under the profile (the `launchPersistentContext` promise rejects, or the renderer crashes before Blackboard's page loads), its first error line goes into 82b, the spike relaunches with `chromiumSandbox: false`, and 82b gets `Sandbox: --no-sandbox fallback`. The verdict line, the `Sandbox:` line and the `LOGIN_HOSTS:` line are all written in `docs/planning/sprint-2/verification/82b_NOVNC_SPIKE.md`. The verdict and a DECISIONS row follow: PASS, or re-plan on the `storageState` fallback | R-82, P-38, P-102, P-103 | PM + Stack | (c) `docs/planning/sprint-2/walks/walk-14/01-novnc-duo-login.png`: the address bar reading `127.0.0.1:6080/vnc.html` and, inside the noVNC view, Blackboard Ultra's page heading "Courses" after Duo; `02-after-restart.png`: the same address and the same "Courses" heading after `docker compose restart sync`, with no sign-in form in view. (d) `docker compose port sync 6080` → `127.0.0.1:6080`; `grep -c "^Verdict: PASS$" docs/planning/sprint-2/verification/82b_NOVNC_SPIKE.md` → 1; in the same file `grep -c "^LOGIN_HOSTS: .*login\.microsoftonline\.com" …` → 1 (the one line listing the hosts the Duo login passed through) and `grep -cE "^Sandbox: (seccomp\|--no-sandbox fallback)$" …` → 1; `grep -c "chromiumSandbox: true" docker/sync/spike/session-age.mjs` → 1 when 82b reads `Sandbox: seccomp` (0 under the fallback); while `session-age.mjs` runs, `docker compose exec sync sh -c 'for f in /proc/[0-9]*/cmdline; do tr "\0" " " < "$f"; echo; done' \| grep -c -- "--no-sandbox"` → 0 before `Sandbox: seccomp` is written, the count pasted into 82b under that line (≥ 1 under the fallback) | "I logged in to Blackboard inside a container" |
| 5 | Split the id check out of `sync-command.ts` into `desktop/src/core/sync-id.ts`, before any worker is cut | P-42, R-86 | PM | (a) `cd desktop && npx vitest run test/unit/sync-id.test.ts test/unit/sync-command.test.ts test/unit/core-portability.test.ts` → 0 failures; (d) `grep -ci "powershell" desktop/src/core/sync-id.ts` → 0 | — |
| 6 | Write `db/tests/phase14_091_sync_runner.sql` first, with the assertion list in §Tables and migrations, and add the loader-map entry to `scripts/db-test.mjs` | R-84, R-83, P-104 | W-55 | (a) `node scripts/db-test.mjs --list \| grep -c "phase14_load_crawl_v4.sql + phase14_091_sync_runner.sql"` → 1; `node --test scripts/db-test.test.mjs` → 0 failures; after task 8 has generated the loader and before 091, `node scripts/db-test.mjs --only phase14_091_sync_runner.sql` → `db-test: passed 0, failed 1, units 1`, exit 1, the line copied into `100_W55_VERIFICATION.md`; after tasks 7 and 7a → `db-test: passed 1, failed 0, units 1`, exit 0 | — |
| 7 | 091: role, `claim_attempts`, the twelve functions and the helper. Dry run in `begin; … rollback;`, apply with `apply_migration` as `091_sync_runner_role`, then Stack sets the password (never in a file) | R-84, P-104 | W-55 | (b) precondition, before the dry run: `select count(*) from supabase_migrations.schema_migrations where name in ('100_db_test_runner_role', '135_sync_run_open_at_claim', '136_transform_tick_register_first', '137_sync_status_run_state')` → 4 (0 on 2026-09-27; 3 if B-42's answer leaves migration 100 unwritten, **PROVISIONAL, B-42**) and `select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.prosecdef and has_function_privilege('public', p.oid, 'execute')` → 0 (0 on 2026-09-27; the twelve-name check below relies on it). After the apply: `select string_agg(p.proname, ',' order by p.proname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.prosecdef and has_function_privilege('sync_runner', p.oid, 'execute')` → `sync_claim,sync_close,sync_enqueue,sync_file_stored,sync_file_worklist,sync_login_ok,sync_login_required,sync_next,sync_register_run,sync_requeue_orphans,sync_run_outcome,sync_sweep_stale`; `select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind in ('r','v','m','p') and has_table_privilege('sync_runner', c.oid, 'select,insert,update,delete')` → 0; `select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = any (array['sync_next','sync_claim','sync_requeue_orphans','sync_register_run','sync_run_outcome','sync_file_worklist','sync_file_stored','sync_close','sync_sweep_stale','sync_enqueue','sync_login_ok','sync_login_required','sync_login_sync_due']) and (has_function_privilege('authenticated', p.oid, 'execute') or has_function_privilege('anon', p.oid, 'execute'))` → 0 (a `like 'sync\_%'` filter would also catch `sync_change_lines`, which 051 grants to `authenticated`); the md5 of the recorded statement equals the repo file's (DoD method). (d) After Stack sets the password, one command with the session-pooler DSN (user `sync_runner.goultdzqcavefcgnifdy`, port 5432) as `BB2DASH_TEST_DB_URL`: `node scripts/db-test.mjs --ping` → `db-test: connected as sync_runner`, exit 0; Stack runs it and the line goes into `100_W55_VERIFICATION.md` | — |
| 7a | 094 (PROVISIONAL, open item 6): the test role's membership and the enumerated writes, and, in the same PR, the expected membership list in Phase 15's `db/tests/phase15_100_db_test_runner_role.sql` gains `sync_runner` (inherit false), nothing else in that file (95 §Seams). Dry run, apply as `094_sync_runner_test_membership` after Phase 15's 100 is on prod | R-84 | W-55 | (b) `select count(*) from pg_auth_members m where m.roleid = 'sync_runner'::regrole and m.member = 'db_test_runner'::regrole and not m.inherit_option` → 1; `select rolbypassrls from pg_roles where rolname = 'sync_runner'` → false. (a) With the list amended and before 094 is applied, `node scripts/db-test.mjs --only phase15_100_db_test_runner_role.sql` → `db-test: passed 0, failed 1, units 1`, exit 1; after the apply → `db-test: passed 1, failed 0, units 1`, exit 0; both lines in `100_W55_VERIFICATION.md` | — |
| 8 | Build the scrubbed recorded-crawl fixture from a live v4 run: 9 `bb_raw` rows, with Stack's submitted text removed. Default source: run `3b5174b8` (`sync_runs` 62, the parity baseline). Prod on 2026-09-27: it holds 1 `calendar`, 7 `course` and 1 `memberships` row (run `9080daeb` has the same shape), with 6 non-null `studentSubmission` values in 2 of them; all of `bb_raw` holds 12 such values in 4 rows (P-35's "on 12 rows" counts values, not rows) | P-35 | W-55 | (a) `cd sync && npx vitest run test/fixture-scrub.test.ts` → 0 failures: 9 rows; kinds `calendar` 1, `course` 7, `memberships` 1; `SCRUB_FIELDS` includes `studentSubmission`; no field in `SCRUB_FIELDS` non-empty | — |
| 9 | Runner core: login rule, probe, claim, register-first, crawl, fold wait, close, startup requeue, and (2026-10-03) the login watch | R-81, R-83, R-87 | W-55 | (a) `cd sync && npx vitest run test/login.test.ts test/loop.test.ts` → 0 failures. Named cases: each `LOGIN_HOSTS` entry; `users/me` 401 and 403 close `queued → failed`; claim lost; register refused; fold timeout leaves the row claimed; crawl throws → failed; done. Login watch, on a fake clock: a dead start calls `sync_login_required` once and probes every `LOGIN_WATCH_MS`; dead → alive calls `sync_login_ok` then `sync_enqueue('login')` once; alive probes every `KEEPALIVE_MINUTES`; alive → dead raises again; `KEEPALIVE_MINUTES=0` stops the alive check | "I pressed Sync and no terminal opened" |
| 10 | Files and embed on Phase 18's `ingest/fetch_signed.mjs` and `ingest/embed_corpus.mjs` (P-36 is Phase 18's; this task only calls them) | R-81, P-104 | W-55 | (a) `cd sync && npx vitest run test/files.test.ts` → 0 failures: sha256 recorded; `session_expired` (401/403) stops the step; `gone` (404), `refused` and a Storage 409 reported in `not_pulled`, never passed to `sync_file_stored`; an `EXDEV` from the move takes copy-then-unlink; `embed_corpus.mjs` is spawned once after ≥ 1 unit and never on 0; (d) `grep -c "fetch_signed.mjs" sync/src/files.ts` → 1 (its one import; `files.ts` has no copy of the fetch) | "my submission file came back" |
| 11 | Report template, the dead-letter sweep with its attempts cap, the login item and its self-close, and `skills/bb-sync` step 1's ref | R-83, P-104 | W-55 | (a) `cd sync && npx vitest run test/report.test.ts` → 0 failures; `node scripts/db-test.mjs --only phase14_091_sync_runner.sql` → `db-test: passed 1, failed 0, units 1`; (d) `grep -c "'sync-login-required'" skills/bb-sync/SKILL.md` → 1 (the quoted ref in step 1's insert) and `grep -c "migration 031" skills/bb-sync/SKILL.md` → 0 | "the Inbox told me to log in again" |
| 12 | Integration and coverage: the fixture replayed twice through a fake page and a fake RPC client | R-81, P-35 | W-55 | (a) `cd sync && npx vitest run --coverage` → 0 failures, exit 0 under the 80% line threshold. `integration.test.ts` asserts the call order `claim, register, crawl, wait, files, embed, close`, and that a second pass on a done request calls nothing after `sync_next()` | — |
| 13 | **The login trigger** (re-cut 2026-10-03; was 092): `sync_enqueue('login')`, `sync_login_sync_due` and `sync_login_required` inside 091, with the 091 unit's login-trigger and `sync_login_required` cases | R-87 | W-55 | (a) `node scripts/db-test.mjs --only phase14_091_sync_runner.sql` → `db-test: passed 1, failed 0, units 1` with the New York date cases in it; (d) `ls db/migrations \| grep -c "^092_"` → 0; (b) after 091's apply, `select count(*) from cron.job where jobname like '%scheduled-sync%'` → 0 | "a sync ran by itself right after my morning login" |
| 13a | **Integrate:** merge W-55's `feat/containers-14-sync` into `feat/containers-14` after task 12 (after task 13 when B-45 adopts it); W-56 merges `feat/containers-14` into `feat/containers-14-images` before running the task 14–15 checks | R-81, R-82 | PM + W-56 | (d) run once, at integration: after `git fetch`, `git rev-parse origin/feat/containers-14-sync` gives the SHA compared, then `git merge-base --is-ancestor <that SHA> origin/feat/containers-14-images; echo $?` → 0; the SHA and the 0 are recorded in `100_W56_VERIFICATION.md`. The check is point-in-time: a later W-55 push (a 093 fix, say) does not re-open it; before a task 14–15 check is re-run after such a push, the PM and W-56 repeat both merges and record the new SHA the same way | — |
| 14 | Lock the Python set; `extractUnits` uses it; check Xpdf vs poppler parity on the fixtures | R-81 | W-56 | (a) on the integrated branch (task 13a): `node --test ingest/extract_text.test.mjs ingest/pull_files.test.mjs` → `# fail 0` on the host (Xpdf 4.00); `docker compose run --rm sync node --test ingest/extract_text.test.mjs` → `# fail 0` in the image (poppler), both against the same `ingest/fixtures/extract/expected.json` | — |
| 15 | The sync image and bb2dash's `compose.yaml`: non-root, seccomp, `shm_size`, heartbeat healthcheck, `course-files` at `/app/course context`, `.dockerignore` (excludes `.env`, `course context/`, `local_cache/`); `docker/sync/spike/` deleted | R-82, R-89, R-94, P-102 | W-56 | (d) on the integrated branch (task 13a): `docker compose ps --format "{{.Service}} {{.Health}}" \| grep -c "^sync healthy$"` → 1; `docker compose exec sync whoami` → `pwuser`; `grep -rl "no-sandbox" docker/sync sync/src \| wc -l` → 0 under either verdict (under the fallback the launch passes `chromiumSandbox: false` and Playwright adds the flag itself); `grep -rc "chromiumSandbox: true" sync/src \| grep -vc ":0$"` → 1 when 82b reads `Sandbox: seccomp`, 0 under the fallback (the launch then passes `chromiumSandbox: false`); `docker compose exec sync sh -c 'for f in /proc/[0-9]*/cmdline; do tr "\0" " " < "$f"; echo; done' \| grep -c -- "--no-sandbox"` → 0 when 82b reads `Sandbox: seccomp` (≥ 1 under the fallback); `ls docker/sync/spike 2>/dev/null \| wc -l` → 0; (e) `curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:6080/vnc.html` → 200 | — |
| 16 | Refresh the R5 OS-bound inventory (P-44), then grep-clean over what the bb2dash images copy | R-86, P-44 | W-56 | (d) `grep -c "^\| os-bound " docs/planning/sprint-2/verification/100_W56_VERIFICATION.md` → 7, one row per bb2dash offender 91 R-86 lists at a5042fa (`desktop/src/core/config.ts:27`, `sync-command.ts:59`, `scripts/validate-grading.ps1`, `skills/inbox-apply/SKILL.md:31`, `skills/bb-course-pull` :60-62, `skills/bb-course-map` :56, `mcp-server/scripts/smoke.mjs:33`), each with its disposition (fixed here, Phase 16, Phase 20, or not copied into an image); (a) `node --test docker/grep-clean.test.mjs` → `# fail 0`. It reads the COPY sources of `docker/sync/Dockerfile` and `mcp-server/Dockerfile`, with ≥ 1 file scanned per Dockerfile. Patterns: `C:/`, `C:\`, `.ps1`, `powershell` as a program, `Move-Item`, `OneDrive`; comments stripped | — |
| 17 | Materials MCP image; the key read from a file; the registration recipe; the smoke `--docker` mode | R-91, R-89, P-45, P-107 | W-56 | (a) `cd mcp-server && npx vitest run test/env-file.test.ts test/config.test.ts` → 0 failures; (d) `grep -rn "console.log" mcp-server/src \| wc -l` → 0. After Stack re-registers and moves the key out of `bb2dash/.env` into `bb2dash-stack/secrets/bb2dash_mcp_service_key` (`scripts/google-consent.mjs` stays a host run, fed `BB2DASH_SERVICE_KEY` from that file for its one command): `grep -c "sb_secret_" C:/Users/stack/.claude.json` → 0, `grep -c "sb_secret_" C:/Users/stack/projects/bb2dash/.env` → 0 and `claude mcp list \| grep -c "^bb2dash: .*Connected"` → 1 | "materials search still answers, and no key sits in my Claude config" |
| 18 | `syncLauncher` (`terminal` or `queue-only`) and (2026-10-03) the login prompt, on their own branch and PR, merged before A1 | R-85, P-43 | W-56 | (a) `cd desktop && npx vitest run test/unit/config.test.ts test/unit/sync-launcher.test.ts test/unit/login-prompt.test.ts test/unit/audit.test.ts test/unit/navigation-policy.test.ts` → 0 failures. `login-prompt.test.ts` names: an open item id opens the page once, a second tick with the same id opens nothing, a new id opens again; `terminal` never opens it; the URL carries the URL-encoded password with a BOM, CR and LF stripped; a missing file opens the bare page and logs the path, never a value; (d) `gh pr list --repo emstacho-su/bb2dash --head feat/containers-14-launcher --state merged --json number --jq length` → 1 (a merged PR survives the branch's deletion; a merge-base check against `origin/feat/…` would not) | — |
| 19 | Repo hygiene and one source for the four repo skills. Stack removes the stale claude.ai-synced `bb-course-*` copies, and the PM sets `FASTEMBED_CACHE_DIR` in the machine file | R-92, P-47, P-49 | W-56 + Stack + PM | (d) `git ls-files --eol \| grep -c "i/crlf"` → 0 (1 at a5042fa); `git check-ignore local_cache/probe secrets/novnc_password \| wc -l` → 2 (a path inside each folder; a bare folder name does not match a `dir/` pattern while the folder is absent); (a) `node --test scripts/install-skills.test.mjs` → `# fail 0`; (d) `find C:/Users/stack/.claude/skills/synced -maxdepth 2 -type d -name "bb-course-*" \| wc -l` → 0; `grep -c "^FASTEMBED_CACHE_DIR=" C:/Users/stack/.harness/machine.env` → 1 | — |
| 20 | Scheduler (**PROVISIONAL, B-49**; struck if he answers "no"): per-window catch-up, atomic `last_run_at`, no overlap, DST | R-90, P-106 | W-57 | (a) `cd hooks && node --test tests/schedule.test.mjs tests/scheduler.test.mjs` → `# fail 0`, with these cases. 03:00 New York is 07:00Z on 2026-10-31, 08:00Z on 2026-11-01 and 2027-03-13, and 07:00Z on 2027-03-14. A missed window runs once at start, and two missed windows also run once. Temp-file-and-rename write; a restart mid-run never runs it twice; `nightly` and `collect` never overlap. (d) `ls hooks/tests/*.test.mjs \| wc -l` → no fewer than the base count + 3 after task 22 (`schedule`, `scheduler`, `grep-clean`), the base count being `git ls-tree --name-only <sha> hooks/tests/ \| grep -c "\.test\.mjs$"` at the harness `main` SHA recorded in DECISIONS at task 1 (the SHA W-57 is cut from); the SHA and both counts are recorded in `100_W57_VERIFICATION.md` | "the 3 AM job ran when I opened the lid" |
| 21 | Jobs image (**PROVISIONAL, B-49**; struck if he answers "no"), compose piece, `*_FILE` shim (`DATABASE_URL` exported before psycopg starts), `HARNESS_NIGHTLY_LOG=/dev/stdout`, `HARNESS_UV` and `HARNESS_UV_BIN` set to one path | R-90, R-89, R-94 | W-57 | (d) `docker compose run --rm harness-jobs uv run --directory ingest ingest embed-check; echo $?` → last line 0; `docker compose ps --format "{{.Service}} {{.Health}}" \| grep -c "^harness-jobs healthy$"` → 1; `docker compose exec harness-jobs whoami \| grep -c "^root$"` → 0 | — |
| 22 | Vault bind (**PROVISIONAL, B-50**: its lock and safe.directory test), the default vault off OneDrive, harness grep-clean | R-86, R-90, P-44 | W-57 | (a) `cd hooks && node --test tests/grep-clean.test.mjs` → `# fail 0`; (d) safe.directory: `docker compose run --rm harness-jobs git -C /vault/projects rev-parse --is-inside-work-tree` → `true`, the same for `/vault/classes` (a "dubious ownership" refusal prints nothing on stdout, so a porcelain line count alone would pass falsely); with Windows idle, `docker compose run --rm harness-jobs node hooks/sync-realms.mjs --pull --vault /vault --dry-run; echo $?` → one line starting `projects: ` and one starting `classes: `, neither containing `skip` (a realm the container cannot see prints `skip` and still exits 0), and last line 0. Lock: with a fresh lock taken on Windows by `acquireRealmLock('C:/Users/stack/vault/projects', { owner: 'b50-test' })` from `hooks/lib/realm-lock.mjs`, the same dry run → last line 2 and a `projects:` line containing `locked`; after `C:/Users/stack/vault/projects/.git/harness-sync.lock` is removed → 0 | — |
| 23 | Harness doctor `--strict` with realm rows; `portable.md` step 7 (its container-scheduler line: **PROVISIONAL, B-49**); CI ubuntu legs required | P-48, P-51, P-106, R-88, R-90 | W-57 | (a) `cd hooks && node --test tests/doctor.test.mjs` → `# fail 0`: `--strict` exits 1 on a realm with an uncommitted entry or one ahead of its remote, and 0 when clean. (d) `grep -c "continue-on-error" .github/workflows/test.yml` → 0; `grep -c "On home-pc (containers):" docs/portable.md` → 1; `grep -c "missedExecutionTolerance" docs/portable.md` → 1 | — |
| 24 | Umbrella (**PROVISIONAL, B-51**: repo name and `just`): `include:` with `project_directory`, `secrets.example/`, `machine.env.example`, `.env.example`, `justfile` | R-88, R-89, P-59, P-105 | W-58 | (d) `ls secrets.example \| wc -l` → 11; `just --summary` → `dev doctor down ingest-now login logs sync-now up`; `grep -c "^set windows-shell" justfile` → 1; `git check-ignore secrets/novnc_password machine.env .env \| wc -l` → 3; `docker compose --profile mcp --profile dev config --services \| wc -l` → 4 | — |
| 25 | Umbrella doctor: C-7's nine rows plus the Claude token age, built on the harness `--strict` | R-88 | W-58 | (a) `node --test doctor/doctor.test.mjs` → `# fail 0`: a missing or empty secret, 45 s of clock skew against an HTTP `Date`, a port on `0.0.0.0` or a failing harness row each exit 1, and the all-green fixture exits 0. (d) `just doctor; echo $?` → last line 0 on the laptop | "one command brings it all up and says it is healthy" |
| 26 | Dev container (**PROVISIONAL, B-48**; struck if dropped): reference fork on `node:22-bookworm`, widened firewall, `claude-home` seed, memory read-only until acceptance, both MCP servers by secret file | R-92, P-108, P-49 | W-58 | (d) `just dev bash scripts/dev-smoke.sh \| tail -1` → `SMOKE PASS 7/7` (`claude -p` answers; both MCP servers connected; `MEMORY.md` readable; `/bb2dash-pm` resolves to the repo copy; `git worktree add`; `npx vitest run` in `web/`; `npm run verify:embedder` in the harness `mcp-server`); `grep -c "statsig.anthropic.com" .devcontainer/init-firewall.sh` → 0; `grep -c "^FROM node:22-bookworm" .devcontainer/Dockerfile` → 1 | "I ran a PM session inside the container" |
| 27 | Image proofs: gitleaks installed; every image's exported filesystem and `docker history --no-trunc` scanned; base-image manifests recorded apart from per-image arm64 builds | R-89, R-94, P-46, P-109 | PM | (d) `gitleaks version \| wc -l` → 1; `gitleaks dir <exported fs>; echo $?` → last line 0 for `sync`, `bb2dash-mcp`, `harness-jobs`, `dev` (4 of 4 in 82a); `docker history --no-trunc <image> \| gitleaks stdin; echo $?` → last line 0 for each of the four (4 of 4 in 82a); `grep -c "^\| manifest \| " docs/planning/sprint-2/verification/82a_PHASE14_PARITY_AND_IMAGES.md` → 5, one row per base image (`mcr.microsoft.com/playwright:v1.63.0-noble`, `node:22-slim`, `ghcr.io/astral-sh/uv:python3.12-bookworm-slim`, `python:3.12-slim-bookworm`, `node:22-bookworm`), each naming `linux/arm64`; `grep -c "^## Per-image arm64 builds (post-MVP)$"` (same file) → 1; `docker compose --profile mcp --profile dev build; echo $?` → last line 0 | — |
| 28 | Live proofs, both needing Stack. First, the same-day pair: the skill path with `sync` stopped, then the container path under `queue-only` (run ids `<A>`, `<B>` in 82a). Second, the login path: Stack signs out in noVNC, presses Sync, then signs in again | R-81, R-83, R-85 | Stack + PM | (b) `select count(*) \|\| ' ' \|\| count(distinct n) from (select run_id, count(*) n from bb_gradebook where run_id in ('<A>','<B>') group by run_id) s` → `2 1` (both runs present, equal counts), and the same over `bb_attempts` → `2 1` and `bb_raw` → `2 1`; `select count(*) \|\| ' ' \|\| count(distinct status) from sync_runs where run_id in ('<A>','<B>')` → `2 1`; `select count(*) from agent_requests where run_id = '<B>' and claimed_by = 'sync-runner' and state = 'done'` → 1. (c) `walk-14/03-activity-report.png`: Activity's row for `<B>` showing the runner's files line, whose exact text `report.test.ts` pins and 82a quotes beside the screenshot; `walk-14/04-inbox-login-needed.png`: the Inbox item "Blackboard login needed — open http://127.0.0.1:6080/vnc.html and sign in with Duo". (b) After re-login and one pass: `select count(*) from attention_items where ref = 'sync-login-required' and state = 'open'` → 0 | "the container's sync matched the skill's" |
| 29 | **Stack's acceptance sitting and the cut-over**, in the order under §Definition of done | R-93, R-85, R-87, S2-containers-1 | Stack | (d) `grep -c "^- \[x\] A[1-9] " docs/planning/sprint-2/verification/82a_PHASE14_PARITY_AND_IMAGES.md` → 9 (A5 login-triggered since 2026-10-03), one fewer for each step B-48 or B-49 strikes; `grep -c "^- \[[x~]\] A[1-9] " …` (same file) → 9; PowerShell `(Get-ScheduledTask -TaskName 'AgenticHarness-NightlyIngest','AgenticHarness-CheckpointCollect' -ErrorAction SilentlyContinue \| Measure-Object).Count` → 0 | the nine steps |
| 30 | Gates and docs on every PR: STATUS (with "Phase 14 deferred (R-96)"), DECISIONS, ORCHESTRATOR, `CLAUDE.md`; `spike/` confirmed gone (W-56 deleted it in task 15) | R-95, R-96, R-93 | PM | (d) `gh pr list --repo emstacho-su/bb2dash --head feat/containers-14 --json number --jq length` → 1, the same for `emstacho-su/agentic-harness --head feat/containers` → 1 and `emstacho-su/bb2dash-stack --head feat/containers-14-stack` → 1 (one PR per repo: **PROVISIONAL, B-51**); `grep -c "There is no Docker during development" CLAUDE.md` → 0; `grep -c "Phase 14 deferred (R-96)" project-state/STATUS.md` → 1; `ls docker/sync/spike 2>/dev/null \| wc -l` → 0 | — |

## Workers

The file sets are disjoint within this phase (W-55's two Phase 15 files are shared with Phase 15 under the
named-hunk rule, not with another worker here). Workers commit and push per task (`feat(14-T9): …`) and never touch
`project-state/`. Each writes RED and GREEN lines and command outputs to
`docs/planning/sprint-2/verification/100_W5N_VERIFICATION.md`; W-57 and W-58 hand theirs to the PM to
commit. Seams frozen before any branch is cut: the 11 secret names, the 5 volume names, the 8 `just` verbs,
the 12 RPC signatures (11 until 2026-10-03), the three runner entry points and `desktop/src/core/sync-id.ts`.

| Worker | Stream | Branch | Worktree | Owns | Tasks |
|---|---|---|---|---|---|
| W-55 | sync runner and database | `feat/containers-14-sync` (bb2dash) | `bb2dash-wt-containers-14-sync` | `db/migrations/091_sync_runner_role.sql`, `093_sync_runner_review_fixes.sql`, `094_sync_runner_test_membership.sql`; `db/tests/phase14_*.sql` (the loader included); `db/fixtures/phase14/`; `sync/` (all of it); `skills/bb-sync/SKILL.md` (step 1 only); shared with Phase 15 under the named-hunk rule (this phase edits only the named hunk, and the second phase to merge rebases): `db/tests/phase15_100_db_test_runner_role.sql` (the expected membership list only, task 7a) and `scripts/db-test.mjs` (the one loader-map entry only, task 6); `verification/100_W55_VERIFICATION.md` | 6–13 (7a included) |
| W-56 | images, MCP, desktop, repo hygiene | `feat/containers-14-images` and `feat/containers-14-launcher` (bb2dash) | `bb2dash-wt-containers-14-images`, `bb2dash-wt-containers-14-launcher` | `docker/` (after the PM's spike commit, including deleting `docker/sync/spike/`), `compose.yaml`, `.dockerignore`, `.gitattributes` and the one renormalized blob, `.gitignore`; `verification/100_W56_VERIFICATION.md`; `mcp-server/Dockerfile`, `.dockerignore`, `src/env-file.ts`, `src/config.ts`, `test/env-file.test.ts`, `test/config.test.ts`, `README.md`, `scripts/smoke.mjs`; `ingest/pyproject.toml`, `uv.lock`, `extract_text.test.mjs`, `fixtures/extract/`, `pull_files.mjs` (`extractUnits` only); `scripts/install-skills.mjs`, `scripts/install-skills.test.mjs`; launcher branch only: `desktop/src/core/config.ts`, `desktop/src/main/index.ts`, `desktop/test/unit/config.test.ts`, `desktop/test/unit/sync-launcher.test.ts` | 13a (merge half), 14–19 |
| W-57 | harness jobs (**PROVISIONAL, B-49**: a "No" leaves task 23 only) | `feat/containers` (agentic-harness) | `C:/Users/stack/agentic-harness-wt-containers` | `docker/jobs/Dockerfile`, `compose.yaml`, `.dockerignore`, `scripts/jobs-entrypoint.sh`, `hooks/scheduler.mjs`, `hooks/lib/schedule.mjs`, `hooks/lib/constants.mjs` (`DEFAULT_VAULT_SEGMENTS` only), `hooks/doctor.mjs`, `hooks/tests/{schedule,scheduler,grep-clean,doctor}.test.mjs`, `docs/portable.md`, `.github/workflows/test.yml` | 20–23 |
| W-58 | umbrella and dev container (**PROVISIONAL, B-51**; the dev container **PROVISIONAL, B-48**) | `feat/containers-14-stack` (bb2dash-stack) | `C:/Users/stack/projects/bb2dash-stack-wt-containers` | everything in `bb2dash-stack` | 24–26 |

The PM owns: this brief, 82's header line, `desktop/src/core/sync-id.ts`, `desktop/src/core/sync-command.ts`,
`desktop/test/unit/sync-id.test.ts`, the spike files (task 4), `verification/82a*`, `82b*`, the committed
copies of `verification/100_W57_VERIFICATION.md` and `100_W58_VERIFICATION.md`, `walks/walk-14/`,
`project-state/*` and `CLAUDE.md`. Stack creates `emstacho-su/bb2dash-stack` (private) with one README
commit on `main` before W-58 is cut (**PROVISIONAL, B-51**).

Worker ids follow the sprint-wide table: this phase holds W-55..W-58; Phase 19 ends at W-54 and Phase 20
starts at W-59. No id here belongs to another phase.

## Out of scope

* Any web renderer change, including the SyncButton's copy text after cut-over and linking the login item
  in the Inbox. These go on R-96's list for the next web PR.
* The terminal launcher's deletion (`desktop/src/main/sync-terminal.ts`, `desktop/src/main/wt.ts`, the
  terminal half of `desktop/src/core/sync-command.ts`, `syncDryRun`), the "Blackboard login needed" toast
  (B-46, **PROVISIONAL**), the MacBook bring-up (its trigger: the `@anush008/tokenizers` linux-arm64 gap
  closes), an optional `claude -p` sync summary, VPS notes, and a release for a dead-lettered `inbox_feedback` claim
  (091's sweep only flags it; such a claim never blocks Sync). All are R-96, deferred after acceptance.
* Local or self-hosted Supabase, self-hosting the web app, an image registry or image-build CI, a secrets
  manager, Kubernetes, and containerizing the Electron GUI (D-20, as narrowed by task 1).
* The `validate-grading` Node twin and the V-1 launcher (Phase 16).
* The heartbeat view P-71 and the R-56 mechanism itself (Phase 17).
* The signed-CDN fetch, the embed step, `bb_crawler.js` v5 and `stage_files` (Phase 18).
* `stage_content`, the transform driver and the running-row trigger (Phase 19).
* R-97, R-98, the phase-tag spelling and P-110 (Phase 20).
* The Workspace service and its roles (Phase 21), and tokens and styling (Phase 22).
* The harness weekly curator task (a host task, B-49, **PROVISIONAL**) and the work VM's Task Scheduler jobs
  (harness Phase E).

## Open items for Stack

**Answered by Stack, 2026-10-02:** item 1, build 092 and decide the hour after the spike (hour null until
its overnight log shows the login alive in the morning); items 2, 3, 4 and 5, the defaults; item 6, yes.
**Re-answered 2026-10-03:** item 1, no hour at all, the morning sync follows the morning login; item 2,
`KEEPALIVE_MINUTES` defaults to 60 as the alive-login check, with `LOGIN_WATCH_MS` while it is dead (the
amendment at the top).

What the B-numbers leave open (1–5), plus one PM design call the brief rests on (6). Each carries the
default the PM takes:

1. **The scheduled-sync hour (B-45, if adopted).** Default: 07:00 New York daily, re-set once 82b holds
   Task 0's numbers. It stays null until the cut-over.
2. **`KEEPALIVE_MINUTES` (B-47).** Default: 0 (off). The PM sets it from 82b's overnight log only if the
   log shows a touched tab lives longer than an idle one.
3. **The dead-letter threshold (R-83 note).** Default: 20 minutes, about 5× the longest past claim. The PM
   re-measures once task 28's container run includes the file step and records it in 82a.
4. **Machine steps only he can do.** Defaults are named:
   * Docker Desktop AutoStart on.
   * `.wslconfig` with a `memory=` value he picks; the doctor checks only that it is set.
   * `claude setup-token` into `claude_oauth_token`.
   * The `vault_realm_pat` fine-grained PAT on the two realm repos, with an expiry.
   * The `sync_runner` password, set in the SQL editor and never in a file.
5. **If the spike fails (task 4).** Default: stop the sync half and re-plan on R1's `storageState` hand-off
   (design c) in a revised brief. The infrastructure half continues: tasks 20–26, and task 27 over the two
   images that exist without W-56 (`harness-jobs`, `dev`) and their three base manifests. W-56 is not cut (it waits on the PASS), so its non-sync tasks (17–19)
   are re-cut in the revised brief.
6. **094, the test role acting as `sync_runner` (PROVISIONAL; 95 §Seams names it for the behaviour tests
   only, the privilege reads needing no membership).** Default: `grant sync_runner to db_test_runner with
   inherit false`, so a rolled-back unit can `set local role sync_runner` and call the twelve functions,
   plus exactly the fixture writes Phase 15's 100 does not grant, and `sync_runner` added to the expected
   membership list in `db/tests/phase15_100_db_test_runner_role.sql`; `/security-review` covers it, and
   task 1's row (11) records its replay after 100. If he says no: 094 is never written, task 7a and row
   (11) are struck, that expected list stays as Phase 15 leaves it, `phase14_091_sync_runner.sql` keeps only the
   privilege reads (`has_function_privilege`, `has_table_privilege`, `pg_default_acl`), and the behaviour
   cases run in task 7's dry run as `postgres` inside `begin; … rollback;`, their output pasted into
   `100_W55_VERIFICATION.md`.

## Round 2 — W-57 (agentic-harness `feat/containers`), from `/code-review main high` on 56cba3e, 2026-10-02

Confirmed findings, each fixed test-first and pushed as `fix(14-R2-<n>): …`. Files beyond W-57's list are
allowed only where an item names them. The spike's own findings (the PM's files) were fixed in c3d3f9c.

1. **`docker compose exec` has no secrets and no git setup.** `DATABASE_URL`, `GIT_CONFIG_GLOBAL`, `safe.directory`
   and the PAT helper exist only in the entrypoint's process tree, so the frozen `ingest-now` verb
   (`docker compose exec harness-jobs node hooks/scheduler.mjs --run-now nightly`) runs without them. Fix so an
   exec'd `scheduler.mjs --run-now` and `doctor.mjs` get the same environment (for example, the entrypoint
   writes the git config at a fixed path the image sets as `GIT_CONFIG_GLOBAL`, and the scheduler or a small
   wrapper applies the `*_FILE` shim itself). Check: in a throwaway container, an exec'd `--run-now nightly`
   against the scratch vault and store exits 0.
2. **The container never sweeps transcripts or host state (PM call).** With only `~/.claude/projects` mounted,
   `routeSession` misfiles Windows sessions and git metadata is lost, and the first `up` would do that to the
   live vault. In the container the nightly skips the transcript sweep and the `state` step and logs one line
   saying so; the host's SessionEnd hook stays the capture path. `CLAUDE_PROJECTS_DIR` leaves `compose.yaml`.
   `scripts/nightly-ingest.sh` may be edited for this switch only. `docs/portable.md` says it. Check: a test
   that the container nightly's step list has no sweep and no state step, and a nightly run against a scratch
   vault adds no note.
3. **A stop between jobs starts the next job.** `tick()` checks `shouldStop` before each job, and the sleep
   wakes on stop. Check: a test where SIGTERM lands during job 1 of 2 and job 2 never starts.
4. **A stop reaches only the top-level bash.** Spawn each job in its own process group and signal the group,
   so git, node and uv get the signal; set `stop_grace_period` to cover a realm push. Check: a test with a
   child that spawns a grandchild, both gone after stop.
5. **The run lock trusts a pid that repeats in a container.** Follow `lib/realm-lock.mjs` (no pid liveness;
   age and owner), and report a failed put-back as contended. Check: a test where a stale lock names the
   current pid and `--run-now` still runs.
6. **`realm <name> clean` counts paths the sync never stages.** Use `realm-status.mjs`'s `parsePorcelainZ` and
   `splitBySyncPath`: only sync-path entries make the row fail; others are listed as a note. Check: a test
   with a `.canvas` file where `--strict` exits 0.
7. **`pushedRow` blames a missing upstream for every git failure.** Separate no-upstream from other exit-128
   causes. Check: a test for a detached HEAD.
8. **The checkpoint settings reach only `collect`.** The nightly's checkpoints step reads the same
   `HARNESS_CHECKPOINT_REPOS` and `HARNESS_CHECKPOINT_AUTHORS` (`scripts/nightly-ingest.sh`, that step only),
   and with neither set in the container both skip with one line and exit 0 instead of failing on a
   missing default path. Check: tests for both jobs, set and unset.
9. **Secrets written by PowerShell carry a BOM.** `read_secret` and the PAT helper strip a UTF-8 BOM as well
   as CR and LF. Check: a test with a BOM-prefixed file.
10. **The Windows scripts still default to the OneDrive vault.** `scripts/nightly-ingest.ps1` and the
   `scripts/register-*.ps1` defaults move to `~/vault` (those default lines only), so hooks and the nightly
   agree. The `vaultAvailable()` behaviour with `~/vault` is accepted: `~/vault` is the documented default.
   Check: grep-clean covers those lines.

# 82a — Phase 14: the same-day parity pair, the image proofs and the acceptance ticks

> Record for brief `100_PHASE14_containers.md` tasks 27 (image proofs), 28 (live proofs) and 29 (Stack's
> acceptance sitting). The parity queries are frozen in `82a_parity_queries.sql` (task 2).

## Task 28 — the same-day pair (2026-10-03)

**Run A, the skill path.** Stack pressed Sync in the desktop app (`syncLauncher = terminal`); the
`/bb-sync` skill ran in his Chrome. Request 1277, claimed by `bb-sync session`, run
`f4b390dd-34dc-4268-80e0-05adbca18ff6`, `sync_runs` 1006, status `ok`, 22:45:24Z → 22:48:00Z. The spike
container stayed up, keeping its own login alive and syncing nothing.

**The cut-over to the runner's image.** `docker compose build sync`, then `docker compose up -d sync` from
`feat/containers-14` (project `bb2dash`, `SECRETS_DIR=C:/Users/stack/.bb2dash-secrets`) at 22:52:27Z. The
container was recreated on `bb2dash-sync:local` with the same `bb2dash_bb-profile` volume, so the login Stack
made at 16:50Z carried over. The runner's first lines:

```
db: connected as sync_runner 2026-10-03T22:52:30.282Z
sync-runner: requeued 0 orphaned claim(s)
login: users/me 200 2026-10-03T22:52:32.886Z watch -> alive
login: unknown -> alive
login: sync_enqueue('login') -> nothing queued (already synced today)
```

The last line is the morning-sync rule seeing run A's `done` on the same New York day.

**Run B, the container path.** `docker compose exec sync node sync/dist/enqueue.js` at 22:53:36Z →
`sync_enqueue('just') -> request 1279`. The runner:

```
login: users/me 200 2026-10-03T22:53:48.110Z pass -> alive
pass: request 1279 claimed and registered as run e953e139-7150-4dfd-9bf4-1e5f271b9ed8
crawl: run e953e139-7150-4dfd-9bf4-1e5f271b9ed8 posted 9 rows
files: 0 pulled, 0 not pulled, 0 units posted
pass: request 1279 closed done
```

No terminal opened. The embed step did not run, because no unit was posted (task 10's rule).

**Task 28's checks** (`<A>` = `f4b390dd…`, `<B>` = `e953e139…`):

| check | expected | got |
|---|---|---|
| `bb_gradebook` runs and distinct counts | `2 1` | `2 1` (66 and 66) |
| `bb_attempts` | `2 1` | `2 1` (34 and 34) |
| `bb_raw` | `2 1` | `2 1` (9 and 9; calendar 1, course 7, memberships 1 in each) |
| `sync_runs` rows and distinct status | `2 1` | `2 1` (both `ok`, 0 errors; 1006 and 1007) |
| request for `<B>` claimed by `sync-runner`, `done` | `1` | `1` |

`sync_runs` 1007's `summary->'changes'`, as Activity shows it: `2 staff name disagreement(s) need your call`,
`Files: nothing new to pull`.

`walk-14/03-activity-report.png` (Stack's capture, 23:23Z): Activity's two newest lines, 27 minutes old, are run B's: "2 staff name disagreement(s) need your call" and the runner's own files line "Files: nothing new to pull", the text `sync/test/report.test.ts` pins; run A's line is the one below them, 35 minutes old.

## Task 28 — the login path (2026-10-03)

Stack signed out of Blackboard inside the noVNC page at about 23:00Z. Then
`docker compose exec sync node sync/dist/enqueue.js` → `request 1280`:

```
login: users/me 401 2026-10-03T23:00:22.339Z pass -> dead
login: users/me 401 2026-10-03T23:00:37.794Z pass after-reauth -> dead
login: alive -> dead
pass: request 1280 failed: login_required (the Inbox asks Stack to log in)
login: users/me 401 2026-10-03T23:01:37.936Z watch -> dead      (then one check a minute, no navigation)
```

The silent re-login was tried once and failed: Blackboard's Sign Out also ended the Microsoft sign-in.
Request 1280: `failed`, `result->>'error'` = `login_required`, never claimed, no run. Inbox item 3074:
`stack_must_confirm`, entity `agent_request`, ref `sync-login-required`, open, "Blackboard login needed — open
http://127.0.0.1:6080/vnc.html and sign in with Duo" (`walk-14/04-inbox-login-needed.png`, Stack's capture).

Stack signed in again through noVNC with NetID and Duo:

```
login: users/me 200 2026-10-03T23:17:38.900Z watch -> alive
login: dead -> alive
login: sync_enqueue('login') -> nothing queued (already synced today)
```

Item 3074 → `archived`, `archived_by = 'sync-runner'`, `decision = {"rule": "login check passed",
"trigger": "sync_login_ok", "sync_run_id": null, "closed_itself": true}`.
`select count(*) from attention_items where ref = 'sync-login-required' and state = 'open'` → `0`.

For R-96's next web PR: the Inbox labels this item "Raised by the transform"; it was raised by the
container's runner.

## Task 27 — image proofs (2026-10-03)

`gitleaks version` → `8.30.1` (host), scans run with `ghcr.io/gitleaks/gitleaks:v8.30.1`. Each image's
filesystem was exported (`docker create` + `docker export`, unpacked into a volume by `alpine:3.20`) and
scanned with `gitleaks dir /fs`; its build history with `docker history --no-trunc <image> | gitleaks stdin`.
`harness-jobs:local` and `bb2dash-dev:local` were rebuilt from their branch heads first (agentic-harness
`feat/containers` 0d998fa, bb2dash-stack `feat/containers-14-stack` 97b0426).

**First run, default rules:** every history clean except `harness-jobs`; every filesystem had hits. Triage, by
hand: all 35 filesystem hits are the `generic-api-key` rule inside base-image vendor trees, none in a path
this project copies:

| image | hits | where |
|---|---|---|
| `bb2dash-sync:local` | 15 | `/ms-playwright/…/reading_mode_gdocs_helper_manifest.json`, `/usr/include/node/v8-internal.h`, `/usr/lib/python3/dist-packages/{dns,cryptography,numpy/…/tests,setuptools}`, `/usr/lib/…/perl/5.38.2/CORE/cop.h` |
| `bb2dash-mcp:local` | 1 | `/usr/local/include/node/v8-internal.h` |
| `harness-jobs:local` | 1 | `/usr/lib/…/perl/5.36.0/CORE/cop.h` |
| `bb2dash-dev:local` | 18 | C headers under `/usr/include`, `/usr/lib/python3/dist-packages/mercurial`, perl `cop.h`, `/usr/local/include/node`, six Vim keymaps under `/usr/share/vim`, the Playwright manifest |

The `harness-jobs` history hit is `ENV GPG_KEY=<40 hex>` from the official `python:3.12-slim-bookworm` image:
the public fingerprint of the CPython release-signing key.

**The allowlist:** `docker/gitleaks-images.toml` keeps the default rules and allows only
`/usr/{include,lib,share}/`, `/usr/local/include/`, `/ms-playwright/` and the line `ENV GPG_KEY=[0-9A-F]{40}`.

**Second run, with that config:**

| image (id) | `gitleaks dir` exit | history exit |
|---|---|---|
| `bb2dash-sync:local` (85ac77b9776e) | 0 | 0 |
| `bb2dash-mcp:local` (bf212746abf1) | 0 | 0 |
| `harness-jobs:local` (a2d6404ed021) | 0 | 0 |
| `bb2dash-dev:local` (c0632969b871) | 0 | 0 |

4 of 4 filesystems and 4 of 4 histories clean. After W-55's round 2 the sync image was rebuilt from `feat/containers-14` ff369a4 (`bb2dash-sync:local` 385c75962dea) and rescanned the same way: `gitleaks dir` exit 0, history exit 0 (2026-10-04 00:04Z). That image is the one the live container runs since 00:01Z. After W-58's round 3 the dev image was rebuilt from bb2dash-stack 46237a4 (`bb2dash-dev:local` ce722216c359) and rescanned: `gitleaks dir` exit 0, history exit 0 (2026-10-04 01:27Z).

### Base-image manifests (2026-10-03, `docker buildx imagetools inspect`)

Six bases, one more than the brief's five: the sync image also copies the `uv` binary from
`ghcr.io/astral-sh/uv:0.12.19` (W-56, task 15).

| row | image | index digest | platforms checked |
|---|---|---|---|
| manifest | `mcr.microsoft.com/playwright:v1.63.0-noble` | `sha256:eff16c30e6f3f4af0a03fa4b706120d5e9b0891c344a27d64559aff5900a4a27` | linux/amd64, linux/arm64 |
| manifest | `ghcr.io/astral-sh/uv:0.12.19` | `sha256:04d046b13e60d6bcec73cbc5e1cad25d680dea90c8573340950a0ac2d1aef424` | linux/amd64, linux/arm64 |
| manifest | `ghcr.io/astral-sh/uv:python3.12-bookworm-slim` | `sha256:e5b65587bce7de595f299855d7385fe7fca39b8a74baa261ba1b7147afa78e58` | linux/amd64, linux/arm64 |
| manifest | `python:3.12-slim-bookworm` | `sha256:54c85f3c47607a77f32adec749d3c81d1348bf25833671f512b26a9b6d778cb3` | linux/amd64, linux/arm64 |
| manifest | `node:22-slim` | `sha256:43ac6c60b8f89723f746e8a92ce91abd5017e627ce1ddfe4238355d3a30b772c` | linux/amd64, linux/arm64 |
| manifest | `node:22-bookworm` | `sha256:363e1587494626837fa7f9a23bdb453d13b0ff3c67c705c2805cfc69c2d2fad7` | linux/amd64, linux/arm64 |

## Per-image arm64 builds (post-MVP)

Not built. Every base has a linux/arm64 variant, so an arm64 build of each image is a `--platform` flag away;
the MacBook bring-up (R-96) waits on the `@anush008/tokenizers` linux-arm64 gap in the harness, not on a base.

## Acceptance A1–A9 (brief 100 §Definition of done; 2026-10-04 evening → 2026-10-05, local times unless Z)

Walked on `main` after the merge (DECISIONS 2026-10-04, "Phase 14 is merged before its acceptance sitting"). A1 is
walked as the three existing side-by-side checkouts, not fresh clones (the A2 row of 2026-10-04: a second bb2dash
checkout would make two folders own one compose project).

- [x] A1 `bb2dash`, `agentic-harness` and `bb2dash-stack` side by side at `C:/Users/stack/projects/`; `.env` and `machine.env` filled; `just doctor` reads `secrets 11 of 11 present and non-empty (C:/Users/stack/.bb2dash-secrets)`.
- [x] A2 `just up` exit 0 at 2026-10-04 21:10 (images rebuilt from `main`, `bb2dash-sync-1` recreated and healthy in 39 s, the Blackboard login intact: `login: users/me 200 … watch -> alive`). `just doctor` on 2026-10-05 20:19Z: every row the containers own is green (docker, autostart, clock, secrets 11/11, ports, Supabase, Blackboard alive, `job nightly` exit 0, `job collect` exit 0, all realms pushed); its exit 1 came from two reporting artefacts of the cut-over, recorded in DECISIONS 2026-10-05: the harness doctor's `nightly ingest` row reads the host's retired state file (follow-up W-74), and the strict `vault … clean` rows count session notes and class files written since the last nightly (they commit at 07:00Z). **Passed on Stack's word, 2026-10-05 ("passed").**
- [x] A3 Stack signed in with NetID and Duo at `http://127.0.0.1:6080/vnc.html` at 2026-10-05 01:02Z; `just login` prints and opens the page (exit 0). The runner: `login: dead -> alive`, item 3424 archived by `sync-runner` at 01:02:47Z, `sync_enqueue('login') -> 1854`, request 1854 claimed and registered as run 2e2300a8, 9 rows, 1 file pulled, `closed done` at 01:06:39Z.
- [x] A4 `syncLauncher = queue-only` in `%APPDATA%\bb2dash\config.json` since 2026-10-04 21:18 (old file kept as `config.json.bak-2026-10-04`); the app logged `syncLauncher is queue-only: the Sync button only queues; the container runs the sync`. Sync pressed at 01:49:36Z: no terminal opened (0 WindowsTerminal processes), request 1855 claimed by `sync-runner` at 01:50:00Z (run f97d53d9), 9 rows, `files: 1 pulled, 0 not pulled, 19 units posted`, `closed done` at 01:52:29Z.
- [ ] A5 The archive-and-enqueue half was seen at 01:02Z (A3). The app-opens-the-login-page half needs a dead login under queue-only; the keep-alive held the login through 2026-10-04/05, which also showed the daily sync fired only on a transition (0 enqueues on 2026-10-05 until Stack pressed Sync): fixed by PR #73 (the first alive check at or after 06:00 New York asks), in the sync image since 2026-10-05 22:06Z. The first morning after it proves "a sync runs without pressing Sync"; the next dead login proves the page opening.
- [x] A6 `REALM_SYNC=apply` was already set in the umbrella `.env` and the container (its 00:16Z nightly had pushed `projects: clean -> pulled -> pushed`). `just ingest-now` at 01:59:35Z: `realms-pull | projects: committed -> pulled`, `ingest | chunks written: 91`, `verify | realm projects: 896 notes, 896 rows`, `realms-push | projects: clean -> pulled -> pushed`, `scheduler: nightly: exit 0 after 330 s`; the vault `projects` realm clean at `harness: sync from stack-laptop 2026-10-05T01:59:49Z`; a `rag` search for the update-helper work found that day's session notes. Catch-up (Stack's hands, 2026-10-05): first attempt 16:51Z the scheduler's own tick saw the back-dated state before the restart and the restart killed that run (`exit 143 after 5 s`; the restarted scheduler ran nothing because the start was stamped: "never twice" held); second attempt with the edit and the restart in one command: `18:06:39.033Z scheduler: started`, `18:06:39.046Z scheduler: nightly: starting for the window 2026-10-05T07:00:00.000Z`, `realms-pull | classes: lock: taken over from sync --pull, pid 8221, since 16:51:06Z (76 min old)`, `nightly reconcile finished (… all 0)`, `exit 0 after 296 s`, both realms pushed.
- [ ] A7 `just dev` → `claude` → `/bb2dash-pm`; both MCP servers; memory; a worktree; a suite. Not walked yet.
- [~] A8 partial, by agreement 2026-10-05: `AgenticHarness-NightlyIngest` unregistered by Stack in PowerShell (verified: not registered); `AgenticHarness-CheckpointCollect` stays until the jobs container collects checkpoints itself (`HARNESS_CHECKPOINT_REPOS` empty; `collect-checkpoints.mjs` needs repo checkouts the container does not mount; `scheduler: collect: skipped in the jobs container`). On Phase 14's deferred list.
- [ ] A9 Docker stopped, `claude "/bb-sync <id>"` on Windows still works. Not walked yet.

Cut-over state on 2026-10-05 22:06Z: `queue-only` on the desktop; the jobs container in apply mode; the host nightly task gone, the checkpoint task kept; the sync image rebuilt from `main` 2e39199 (PRs #71, #73, #75 merged) and `bb2dash-sync-1` recreated with the login intact (`login: unknown -> alive`, `sync_enqueue('login') -> nothing queued (already synced today)`); the desktop build `f37723a` (PR #71's update helper) built at 18:05 local and waiting for a tray Quit.

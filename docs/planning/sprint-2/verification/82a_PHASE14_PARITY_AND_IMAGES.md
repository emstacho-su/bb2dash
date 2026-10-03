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

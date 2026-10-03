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

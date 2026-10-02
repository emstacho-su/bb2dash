# 100 — W-57 verification (Phase 14, harness jobs)

Worker W-57 · repo `emstacho-su/agentic-harness` · branch `feat/containers` · worktree
`C:/Users/stack/agentic-harness-wt-containers` · tasks 20, 21, 22, 23 of brief
`100_PHASE14_containers.md` · run on stack-laptop (Windows 11, Docker Desktop 29.8.1 on WSL2,
Docker Compose v5.5.1, Node v24.19.0 on the host), 2026-10-02.

## Base

| | |
|---|---|
| Base SHA (agentic-harness `main`, the SHA W-57 is cut from) | `429d25fec9ac8b8a19d0a5a9366106d89c5debeb` |
| `git ls-tree --name-only <sha> hooks/tests/ \| grep -c "\.test\.mjs$"` | 72 |
| `git ls-tree --name-only <sha> ingest/tests/ \| grep -c "/test_[^/]*\.py$"` | 54 |
| `git ls-tree --name-only <sha> mcp-server/test/ \| grep -c "\.test\.ts$"` | 11 |
| `cd hooks && node --test "tests/**/*.test.mjs"` at the base | `tests 1106`, `pass 1106`, `fail 0` |
| Last CI run on `main` at the base (run 36762523160) | `success`; all six legs `success`, the three `ubuntu-latest` ones included |

## Task 20 — scheduler

Files: `hooks/lib/schedule.mjs` (rules, no I/O), `hooks/scheduler.mjs` (state file, run lock, loop, CLI),
`hooks/tests/schedule.test.mjs`, `hooks/tests/scheduler.test.mjs`. No dependency added: the time zone
arithmetic is `Intl.DateTimeFormat`.

RED (tests written first, neither module exists):

```
$ cd hooks && node --test tests/schedule.test.mjs tests/scheduler.test.mjs
  code: 'ERR_MODULE_NOT_FOUND',
  url: 'file:///C:/Users/stack/agentic-harness-wt-containers/hooks/lib/schedule.mjs'
ℹ tests 2
ℹ pass 0
ℹ fail 2
```

GREEN (the task's check (a)):

```
$ cd hooks && node --test tests/schedule.test.mjs tests/scheduler.test.mjs
ℹ tests 30
ℹ pass 30
ℹ fail 0
$ cd hooks && node --test --test-reporter=tap tests/schedule.test.mjs tests/scheduler.test.mjs | grep -E "^# (tests|pass|fail)"
# tests 30
# pass 30
# fail 0
```

The cases the brief names, by test title:

| Brief case | Test |
|---|---|
| 03:00 New York is 07:00Z on 2026-10-31, 08:00Z on 2026-11-01 and 2027-03-13, 07:00Z on 2027-03-14 | `03:00 New York is 07:00Z in daylight time and 08:00Z in standard time` |
| A missed window runs once at start | `a missed window runs once at start` (both files) |
| Two missed windows also run once | `a missed window runs once at start, and two missed windows also run once`; `two missed windows also run once, and the next tick runs nothing` |
| Temp-file-and-rename write | `the state is written to a temporary file and renamed into place`; `a write that cannot be renamed leaves the old state whole and no temporary file` |
| A restart mid-run never runs it twice | `last_run_at is on disk before the job starts`; `a restart mid-run never runs it twice` |
| `nightly` and `collect` never overlap | `nightly and collect never overlap: the second starts after the first has ended` (the loop runs them in turn; a second process gets exit 75 from the run lock) |
| Catch-up after sleep | `the loop catches up after a sleep: the clock jumps past 03:00 and nightly runs once` |

CLI smoke on the host (no job started):

```
$ node hooks/scheduler.mjs --run-now weekly; echo "exit $?"
error: --run-now takes nightly|collect, not 'weekly'
usage: node hooks/scheduler.mjs [--run-now nightly|collect] [--state <file>]
exit 64
```

Check (d), the test-file count, is recorded under task 22 (it is read after `grep-clean` exists).

Commit: `f45620f feat(14-T20): container scheduler with per-window catch-up`.

## Task 23 — doctor `--strict` realm rows, `portable.md` step 7, CI

Files: `hooks/doctor.mjs`, `hooks/tests/doctor.test.mjs`, `docs/portable.md`, `.github/workflows/test.yml`.

`--strict` itself was already on `main` (`hooks/doctor.mjs:335` at the base). What this task adds: per
realm checkout a `realm <name> clean` row (`git --no-optional-locks status --porcelain=v1`) and a
`realm <name> pushed` row (`git rev-list --count @{upstream}..HEAD`, no fetch), and a `nightly ingest`
row (the age of `last_success` in the ingest state file, stale past 36 h, the figure `ingest --health`
judges). A `local` realm is not expected to be pushed. No state file yet is informational, so the
bootstrap's last step still passes on a new machine.

RED (six tests added to `doctor.test.mjs` first):

```
$ cd hooks && node --test tests/doctor.test.mjs
✖ --strict exits 1 on a realm with an uncommitted entry or one ahead of its remote, and 0 when clean
✖ clean and pushed rows: counts, a local realm, no upstream, and only for real checkouts
✖ clean and pushed rows: a realm no list names is held to the push rule
✖ clean and pushed rows: when git does not answer they say so, count as problems, and ask nothing more
✖ nightly ingest row: none yet, the age of the last success, stale past 36 hours, unreadable
✖ the nightly ingest row follows ingest project, and its defaults are the ones the ingest package uses
ℹ tests 29
ℹ pass 23
ℹ fail 6
```

GREEN (check (a)):

```
$ cd hooks && node --test tests/doctor.test.mjs
ℹ tests 29
ℹ pass 29
ℹ fail 0
```

The brief's case, "`--strict` exits 1 on a realm with an uncommitted entry or one ahead of its remote,
and 0 when clean", is the first test above. It uses real git: a realm pushed to a bare `file://` remote
is exit 0; an untracked note is exit 1 with `problem: realm projects clean`; the note committed and not
pushed is exit 1 with `problem: realm projects pushed`; after the push, exit 0.

Checks (d):

```
$ grep -c "continue-on-error" .github/workflows/test.yml
0
$ grep -c "On home-pc (containers):" docs/portable.md
1
$ grep -c "missedExecutionTolerance" docs/portable.md
1
```

The doctor on this machine, read-only, 2026-10-02 02:00 local (realm and ingest rows only):

```
realm classes          git checkout, origin https://github.com/emstacho-su/vault-classes.git, 3 commits
realm classes clean    yes
realm classes pushed   yes
realm harness          git checkout, origin https://github.com/emstacho-su/vault-harness.git, 6 commits
realm harness clean    yes
realm harness pushed   yes
realm projects         git checkout, origin https://github.com/emstacho-su/vault-projects.git, 12 commits
realm projects clean   no: 26 uncommitted entries
realm projects pushed  no: 1 commit ahead of its upstream
nightly ingest         C:\Users\stack\.claude\hooks\ingest-state.json, last success 35h ago
```

So `node hooks/doctor.mjs --strict` exits 1 on stack-laptop today, on `projects` alone. That is the rule
the brief asks for, and it will stay 1 between a session's note being written and the next sync that
commits and pushes it (the Windows nightly here is registered with `-RealmSync DryRun`).

Commit: `956c0b9 feat(14-T23): doctor realm clean and pushed rows; ubuntu CI legs required`.

## Task 21 — jobs image, compose piece, `*_FILE` shim

Files: `docker/jobs/Dockerfile`, `compose.yaml`, `.dockerignore`, `scripts/jobs-entrypoint.sh`
(and the first-start paragraph of `docs/portable.md` step 7).

Image: `harness-jobs:local`, 877 MB as Docker Desktop reports it. Bases:
`ghcr.io/astral-sh/uv:python3.12-bookworm-slim` (lends `uv`), `node:22-slim` (lends `node`, v22.23.3),
`python:3.12-slim-bookworm` (builds the virtualenv and runs). The virtualenv is built on the runtime image,
not on the uv image: the uv image's Python was 3.12.12 and the runtime's 3.12.15, and a virtualenv built on
the first made every `uv run` print `Using incompatible environment (.venv) due to --no-sync`. Image
environment: `HARNESS_NIGHTLY_LOG=/dev/stdout`, `HARNESS_UV=/usr/local/bin/uv`,
`HARNESS_UV_BIN=/usr/local/bin/uv`, `HARNESS_SCHEDULER_STATE=/state/scheduler.json`,
`HARNESS_INGEST_STATE_FILE=/state/ingest-state.json`, `FASTEMBED_CACHE_DIR=/cache/fastembed`.

Names the umbrella's `.env` supplies (interpolation only): `VAULT_DIR` and `CLAUDE_PROJECTS_DIR` (frozen,
both required), `SECRETS_DIR` (default `./secrets`, relative to this repo), `HARNESS_MACHINE`,
`HARNESS_GIT_EMAIL`, `HARNESS_REALMS`, `REALM_SYNC` (default `dryrun` in this compose file), and optionally
`HARNESS_CHECKPOINT_REPOS`, `HARNESS_CHECKPOINT_AUTHORS`, `HARNESS_DATABASE_SSL`.

RED (before any of the files exist):

```
$ docker compose run --rm harness-jobs uv run --directory ingest ingest embed-check; echo $?
no configuration file provided: not found
1
```

How the checks were run. Two local, gitignored setups inside the worktree (`git check-ignore -v` printed
`.gitignore:6:.env.*` for each path), both deleted afterwards:

* **live**: `.env.w57` with `VAULT_DIR=C:/Users/stack/vault`, `CLAUDE_PROJECTS_DIR=C:/Users/stack/.claude/projects`,
  `REALM_SYNC=dryrun`, and `.env.secrets/harness_database_url` copied by a script from `DATABASE_URL` in
  `C:/Users/stack/agentic-harness/.env` without printing it; `vault_realm_pat` an empty file (no token was
  obtainable). Used only with `docker compose run --rm … <explicit command>`, never `up`, so no scheduler ever
  ran with the live store or the live vault.
* **scratch**: `.env.w57scratch` with a three-note scratch vault (one `projects` realm, local policy, no
  remote), an empty transcripts folder, and `harness_database_url` pointing at a throwaway
  `pgvector/pgvector:0.8.6-pg17` container (`w57-scratch-store`, port 5544, schema applied with
  `uv run ingest db migrate` from the worktree). Used for `up`, because `healthy` needs a complete ingest
  and the PM's rule forbids a real nightly against the live store.

Check 1, live setup, final image:

```
$ docker compose --env-file .env.w57 run --rm harness-jobs uv run --directory ingest ingest embed-check; echo $?
INFO ingest.embed_check: references from machine home-pc (fastembed 0.8.0, onnxruntime 1.29.0, 2026-09-24T04:41:09+00:00)
INFO ingest.embedding: Loading BAAI/bge-small-en-v1.5 (first run downloads the model, then it is offline)
  1.000000  Session outcome: moved the nightly reconcile to 02:30 and a…
  … (ten texts, each 1.000000)
embed-check: pass (worst 1.00000 on "The café's naïve résumé parser — written in a hurry — broke…")
0
```

The first run downloaded the model into `fastembed-cache` from inside the container (about 6 minutes on
this link); the run above is the second, from the volume.

Checks 2 and 3, scratch setup (`up -d` at 02:22:48 local; the scheduler found no state, ran the nightly at
once in 13 s, and the first health probe after it passed):

```
$ docker compose --env-file .env.w57scratch ps --format "{{.Service}} {{.Health}}" | grep -c "^harness-jobs healthy$"
1
$ docker compose --env-file .env.w57scratch exec harness-jobs whoami
harness
$ docker compose --env-file .env.w57scratch exec harness-jobs whoami | grep -c "^root$"
0
$ docker compose --env-file .env.w57scratch exec harness-jobs uv run --directory /app/ingest ingest --health
Nightly reconcile health: OK
  state file: /state/ingest-state.json
  Last full ingest was 0.0 h ago, within the 36 h threshold.
  documents: 3, chunks written: 3
```

The container's own log of that first start (`HARNESS_NIGHTLY_LOG=/dev/stdout` working as a non-root user):

```
scheduler: started; state /state/scheduler.json; next windows: nightly 2026-10-02T07:00:00.000Z, collect 2026-10-02T16:00:00.000Z
scheduler: nightly: starting for the window 2026-10-01T07:00:00.000Z
=== nightly reconcile finished (realms-pull 0, transcripts 0, state 0, checkpoints 1, sweep 0, ingest 0, verify 0, eval 0, realms-push 0) ===
scheduler: nightly: exit 0 after 13 s
scheduler: collect: starting for the window 2026-10-01T22:00:00.000Z
repo /home/harness/agentic-harness: missing
repo /home/harness/projects/bb2dash: missing
scheduler: collect: exit 1 after 0 s
```

Beyond the brief's checks, on the same scratch container:

| What | Result |
|---|---|
| `docker compose restart harness-jobs` | `scheduler: stopped`, then `scheduler: started`, and no job started again; the restart took 1.1 s (tini passes SIGTERM on) |
| `last_run_at` of `nightly` set back to 2026-09-29 (three windows missed) | the next tick started the nightly once (`exit 0 after 12 s`); the tick after it started nothing |
| `exec harness-jobs node hooks/scheduler.mjs --run-now collect` while that nightly ran | `busy: nightly running since 2026-10-02T06:24:13.869Z (pid 7); collect not started`, exit 75 |
| `/state` after a night | `scheduler.json`, `ingest-state.json`, `eval-history.jsonl`, all owned by `harness` |
| scratch vault after two nightlies | `git status --porcelain` empty |

The entrypoint, each with a dummy value (never the real one):

| Case | Result |
|---|---|
| secret file ending in CRLF | `DATABASE_URL` is 21 characters for a 21-character string: the CR and LF are gone |
| `DATABASE_URL_FILE` names a missing file | `jobs-entrypoint: DATABASE_URL_FILE names /run/secrets/absent, which is not a readable file`, exit 78 |
| the file is empty | `… which is empty`, exit 78 |
| `DATABASE_URL` and `DATABASE_URL_FILE` both set | `… are both set; set only DATABASE_URL_FILE`, exit 78 |
| `vault_realm_pat` holding a dummy token | `git credential fill` for `https://github.com` returns `username=x-access-token` and the file's content; the token appears 0 times in the git config and 0 times in the environment |
| `vault_realm_pat` empty | `jobs-entrypoint: no realm token (…); realm pushes will fail closed`, and the container starts |

Commit: `b44557f feat(14-T21): harness-jobs image, compose service and secrets-from-file entrypoint`.

## Task 22 — vault bind (B-50), default vault off OneDrive, grep-clean

Files: `hooks/lib/constants.mjs` (`DEFAULT_VAULT_SEGMENTS` only), `hooks/tests/grep-clean.test.mjs`.

Where the default lives. Phase 20's P-110 helper, `resolveHarnessConfig`, is on `main`
(`hooks/lib/machine-env.mjs:199` at the base) but it has no default vault at all: an unset vault is `''`.
The OneDrive default was still `hooks/lib/constants.mjs:173`, read by eleven entry points, so that is the
line changed: `['OneDrive - Syracuse University', 'vault']` → `['vault']`, i.e. `~/vault`, the default
`scripts/nightly-ingest.sh:35` and `docs/portable.md` already name.

RED (test written first; the Dockerfile and `.dockerignore` of task 21 present, the constant unchanged):

```
$ cd hooks && node --test tests/grep-clean.test.mjs
✖ nothing the jobs image copies is bound to Windows
    hooks/lib/constants.mjs:173: OneDrive: OneDrive
✖ the default vault is ~/vault, not the OneDrive folder
✖ no secret, test or Windows script is copied
    'ingest/.env.example'
ℹ tests 9
ℹ pass 6
ℹ fail 3
```

The third failure was a real finding: Docker anchors `.env.*` at the context root, so `ingest/.env*` would
have been copied. `.dockerignore` now says `**/.env` and `**/.env.*`.

GREEN (check (a)):

```
$ cd hooks && node --test tests/grep-clean.test.mjs
ℹ tests 9
ℹ pass 9
ℹ fail 0
$ cd hooks && node --test --test-reporter=tap tests/grep-clean.test.mjs | grep -E "^# (tests|pass|fail)"
# tests 9
# pass 9
# fail 0
```

What the test reads: the COPY sources of `docker/jobs/Dockerfile` (`certs/prod-ca.crt`, `hooks/`,
`scripts/`, `ingest/`) minus `.dockerignore`; it scans `.mjs`, `.sh`, `.py` and the Dockerfile with
comments and Python docstrings stripped, for a drive path (`C:/`, `C:\`), `.ps1`, `powershell`/`pwsh` as a
word, `Move-Item` and `OneDrive`. A drive path ending in `...` is help text showing a shape and passes
(`"vault directory (C:/Users/... on Windows)"`). Two lines are listed in the test as known prose, each a
`--help` line that still says "the OneDrive vault" in a file outside W-57's list:
`hooks/collect-checkpoints.mjs:40` and `hooks/sweep-transcripts.mjs:51`. Three one-time repair tools that
name Windows homes by design are kept out of the image by `.dockerignore` (`hooks/migrate-sessions.mjs`,
`hooks/backfill-fields.mjs`, `hooks/lib/backfill-fields.mjs`); a second test proves every module the jobs
import is still in the image.

Checks (d), live setup, final image, Windows idle (02:25 local, 35 minutes before the 03:00 task):

```
$ docker compose --env-file .env.w57 run --rm harness-jobs git -C /vault/projects rev-parse --is-inside-work-tree
true
$ docker compose --env-file .env.w57 run --rm harness-jobs git -C /vault/classes rev-parse --is-inside-work-tree
true
$ docker compose --env-file .env.w57 run --rm harness-jobs node hooks/sync-realms.mjs --pull --vault /vault --dry-run; echo $?
projects: would-commit -> would-pull
classes: clean -> would-pull
harness: clean -> would-pull
0
```

`/vault` is owned by root as the container sees it (`drwxrwxrwx 1 root root`) and the jobs user is uid 1000,
so the `true` rests on the entrypoint's `safe.directory` lines. The same command with the entrypoint
bypassed (`--entrypoint git`) prints no `true`, only git's advice to run
`git config --global --add safe.directory /vault/projects`.

Lock (taken on Windows with `acquireRealmLock('C:/Users/stack/vault/projects', { owner: 'b50-test' })` from
`hooks/lib/realm-lock.mjs`, released with `releaseRealmLock` and the token it returned, so only that lock
could be removed; no lock existed before):

```
take: ok C:\Users\stack\vault\projects\.git\harness-sync.lock owner=b50-test takenOver=no
$ docker compose --env-file .env.w57 run --rm harness-jobs node hooks/sync-realms.mjs --pull --vault /vault --dry-run; echo $?
projects: locked (held by b50-test, pid 15184, since 2026-10-02T06:25:46.982Z)
classes: clean -> would-pull
harness: clean -> would-pull
2
release: ok; lock file exists now: false; held: false
$ ls C:/Users/stack/vault/projects/.git/harness-sync.lock
ls: cannot access 'C:/Users/stack/vault/projects/.git/harness-sync.lock': No such file or directory
$ docker compose --env-file .env.w57 run --rm harness-jobs node hooks/sync-realms.mjs --pull --vault /vault --dry-run; echo $?
projects: would-commit -> would-pull
classes: clean -> would-pull
harness: clean -> would-pull
0
```

B-50's default holds: both tests pass on the bind mount, so the clone-into-a-volume fallback is not needed.
The realms were not changed by any of this: `projects` showed 26 uncommitted entries before the first
container run and 27 after, the extra one a worker note the SubagentStop hook wrote at 02:12:39; its
upstream count stayed 1 ahead, and `classes` stayed clean.

Check (d) of task 20, the test-file counts against the base:

| | Base (`429d25f`) | Now (`56cba3e`) | Rule |
|---|---|---|---|
| `ls hooks/tests/*.test.mjs \| wc -l` | 72 | 75 | no fewer than base + 3 (`schedule`, `scheduler`, `grep-clean`) |
| `ls ingest/tests/test_*.py \| wc -l` | 54 | 54 | no fewer than base |
| `ls mcp-server/test/*.test.ts \| wc -l` | 11 | 11 | no fewer than base |

Commit: `56cba3e feat(14-T22): default vault off OneDrive; grep-clean over the jobs image`.

## Suites (DoD line for agentic-harness)

On Windows, in the worktree, at `56cba3e`:

```
$ cd hooks && npm test            →  tests 1152, pass 1152, fail 0
$ cd ingest && uv run pytest      →  1709 passed in 45.63s
$ cd mcp-server && npm run typecheck && npm test  →  Test Files 11 passed (11), Tests 196 passed (196)
$ bash scripts/tests/bootstrap.tests.sh           →  All cases passed.
```

On Linux (the jobs image: Debian bookworm, Node v22.23.3, git 2.39.5), `git archive HEAD` unpacked and
committed into a fresh repository, since CI has not run:

```
$ cd hooks && node --test --test-reporter=spec 'tests/**/*.test.mjs'
ℹ tests 1152
ℹ pass 1151
ℹ fail 0
ℹ skipped 1
```

One observation from an earlier Linux run, made while the model download and two image builds were using
the machine: `a long chain of lookalike assignments is bounded: fast, and the real secret stays redacted`
(`hooks/tests/redact-pat.test.mjs`, on `main`, not this branch's) failed once at 402 ms. Run alone three
times afterwards it passed three times. It is a timing bound, and the ubuntu legs are now required.

## CI

```
$ gh run list --repo emstacho-su/agentic-harness --branch feat/containers --limit 1 --json conclusion,status
[]
```

No run exists. `.github/workflows/test.yml` runs on `push` to `main` and on `pull_request` only, so a push
to `feat/containers` starts nothing; the first run will be the one the PR starts.

## For the PM to decide

* **The collector has no repositories in the container.** Its defaults are `~/agentic-harness` and
  `~/projects/bb2dash` (`hooks/lib/constants.mjs:215` at the base), and the Contract allows only the two
  B-50 binds, so in the container `collect` ends `repo … missing`, exit 1, and the nightly's `checkpoints`
  step is 1 (never fatal). `HARNESS_CHECKPOINT_REPOS` and `HARNESS_CHECKPOINT_AUTHORS` (comma-separated)
  are wired through compose to the scheduler for whichever answer is chosen: a third bind, or clones kept on
  `job-state` (both repositories are public, so a clone needs no token).
* **The first `up` runs a full nightly at once**, by design: the healthcheck needs a complete ingest inside
  its 30-minute start period. With the live binds that means the transcript sweep writes notes into the
  vault and the ingest writes to the store the moment the service starts, before the two Windows tasks are
  disabled. The realm commit and push are held back by `REALM_SYNC`, which this compose file defaults to
  `dryrun`; the cut-over sets `REALM_SYNC=apply` in the umbrella's `.env`.
* **`doctor --strict` is 1 on this laptop today** (the `projects` rows above). W-58's doctor is built on it
  and A2 expects exit 0, and bootstrap step 9 runs it too.
* **Two `--help` lines** outside W-57's files still say "the OneDrive vault"
  (`hooks/collect-checkpoints.mjs:40`, `hooks/sweep-transcripts.mjs:51`). They are listed as known prose in
  `grep-clean.test.mjs`; rewording them means deleting those two entries, which the test then asks for.
* **`SECRETS_DIR`** is this compose file's name for the secrets folder; W-58's `.env` has to set it.

## Not verified

* A realm push from the container with a real `vault_realm_pat`: no token exists yet (open item 4). Only the
  credential helper's answer to `git credential fill` was checked, with a dummy value.
* The nightly inside the container against the live vault, the live store and the real transcripts folder.
  Not run, by the PM's rule. In particular the transcript sweep reading transcripts whose working
  directories are Windows paths has not been seen from Linux.
* `healthy` in the live setup: it follows from a complete ingest, which was only run against scratch.
* The ubuntu CI legs on this branch (no run, above).

## Left behind

Nothing running. Removed: the `w57-scratch-store` container, the two test volumes and the network of the
compose project `agentic-harness-wt-containers`, the worktree's `.env.secrets/`, `.env.scratch/`, `.env.w57`
and `.env.w57scratch`. Kept: the image `harness-jobs:local`; `ingest/.venv` and `mcp-server/node_modules`
in the worktree (both gitignored). The scheduled tasks `AgenticHarness-NightlyIngest` and
`AgenticHarness-CheckpointCollect` were read once (`Ready`, `Ready`) and not touched.

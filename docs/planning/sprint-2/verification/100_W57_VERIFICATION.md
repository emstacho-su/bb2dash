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

---

# Round 2 — W-57 (ten `/code-review` findings on `56cba3e`)

## Incident first: one of my test runs started the real nightly on this laptop

**What happened.** At 2026-10-02 03:11 local (07:11:48Z), while writing item 1 test-first, I ran
`node --test tests/scheduler.test.mjs` with a pass-through stub in place of `envWithSecretFiles`. Two new
tests called `main(['--run-now', 'nightly', …])` and handed it a fake `spawn`; `main` did not yet take a
`spawn` parameter and fell back to its default runner, which starts the real job. So the test process ran
`bash scripts/nightly-ingest.sh` (the worktree's copy) on the host, twice:

1. 07:11:48Z, with `HARNESS_VAULT=/vault` in its environment: `FATAL vault not found: /vault`, exit 2,
   three lines in the live log. Nothing else.
2. 07:11:50Z to 07:15:00Z, with no vault in its environment: the script read
   `C:/Users/stack/.harness/machine.env` and ran **a full nightly reconcile against the live vault and the
   live store, with `REALM_SYNC` at its default `apply`**, using the shared checkout's hooks and ingest
   (`C:/Users/stack/agentic-harness`, the script's defaults).

This is the thing the PM's rules forbid ("a nightly against the live vault or store", "real realm commits
or pushes"). It was not intended and it was not a deliberate check.

**What it did**, from `C:/Users/stack/.claude/hooks/nightly-ingest.log` lines 662–772 and from the realms
afterwards (all read-only looks):

| Step | Result |
|---|---|
| realms-pull (apply) | `projects: clean -> pulled`, `classes: clean -> pulled`, `harness: clean -> pulled`. No commit. |
| transcripts | `transcripts=22 noted=19 active=2 candidates=1 selected=1 written=0 skipped=1`. No note written. |
| state | `swept 0, kept 22`. |
| checkpoints | `found=2 created=0 merged=0 unchanged=2`. Both `noop`. |
| sweep-concluded (apply) | `scanned 1158`, `1158 left-alone`. |
| ingest `--prune` | `Loaded 1085 documents`, `1085 unchanged`, `chunks written: 0`, orphan sweep `nothing stale` in all three realms. |
| verify | exit 0 (read-only). |
| eval `--history` | exit 0. |
| realms-push (apply) | `clean -> pulled -> up-to-date` for all three. No commit, nothing pushed. |

It changed nothing in the vault or the store because Stack's own scheduled nightly had finished eight
minutes earlier (07:00:03Z to 07:03:09Z) and had already committed and pushed everything. Checked
afterwards: no `harness-sync.lock` in any realm; `git reflog --since=2026-10-02T07:11:00Z` is empty in all
three realms (no commit, no merge moved HEAD); each realm has 0 status entries and is 0 ahead of its
upstream; `projects` HEAD is still `8dd45e6`, the 03:00 scheduled run's commit.

**What it did write**, and I have left as it is:

* about 110 lines in `C:/Users/stack/.claude/hooks/nightly-ingest.log` (lines 662–772);
* `last_success` in `C:/Users/stack/.claude/hooks/ingest-state.json`, moved from the scheduled run's time
  to `2026-10-02T07:13:48Z`;
* one line appended to `C:/Users/stack/agentic-harness/ingest/eval/history.jsonl` (gitignored), `at`
  `2026-10-02T07:14:50Z`, a duplicate of the scheduled run's 07:03:01Z scores;
* a `git fetch` and a no-op merge-pull in each realm.

I did not edit, trim or revert any of those: they are in the shared checkout and in Stack's home, outside
my worktree, and removing lines from his log would be tidying evidence.

**Why it could happen, and the fix (in `65fd6a0`, item 1).** `main()` had a default runner that spawned the
real job, so any caller that omitted a runner got a real nightly. `main()` now starts jobs only through a
`runner` or a `spawn` it is handed; with neither it prints
`error: no runner and no spawn were given, so no job can be started` and exits 70, and `spawnRunner`
throws without a `spawn`. The process entry point is the only caller that passes node's `spawn`. A test,
`main starts a real job only when it is handed spawn`, pins it. I wrote that guard before its test, on
purpose: the RED run of such a test is itself a real nightly. After the guard, the same test file ran with
the live log's last line unchanged (`07:15:00Z === nightly reconcile finished`).

Stack's scheduled tasks were not touched (`Ready`, `Ready`). Later, at 2026-10-03 16:46:10Z, the laptop
woke and Task Scheduler ran both of them as catch-up runs (`LastRunTime 10/3/2026 12:46:10 PM`); the
log's lines from 16:46Z to 16:50:55Z are theirs (the PowerShell job's `realms-pull : node sync-realms.mjs`
format), not mine. None of my later checks touched the live vault, and that run was left alone.

One more thing I ran without checking it first: `bash scripts/tests/nightly-ingest.tests.sh` (the repo's
own shell test). I read it afterwards: it works in a `mktemp -d` scratch with
`HARNESS_MACHINE_ENV="$SCRATCH/absent.env"`, and the live log's last line was unchanged after it.

## Round 2 items

Each item was written test-first. RED is the run of the new tests before the fix, GREEN the run after.
Where the first RED was only "export not found", a stub was added and the tests were run again to get a
RED on behaviour; both are recorded. Linux runs are in the `harness-jobs:local` image (Debian bookworm,
Node v22.23.3, `docker run --init`), on a copy of the working tree committed into a fresh repository.

| # | Commit | RED | GREEN |
|---|---|---|---|
| 6 | `691ac46` | `doctor.test.mjs`: tests 31, pass 26, fail 5 | tests 31, pass 31, fail 0 |
| 7 | `000e486` | `doctor.test.mjs`: tests 33, pass 29, fail 4 | tests 33, pass 33, fail 0 |
| 5 | `085baa9` | `scheduler.test.mjs`: `does not provide an export named 'OWNER_LOOP'`, tests 1, fail 1 | tests 21, pass 21, fail 0 |
| 3 | `e7c6332` | module RED, then on behaviour: tests 26, pass 22, fail 4 (`the loop did not finish within 5000 ms`, `a sleep after the stop did not finish within 2000 ms`) | tests 26, pass 26, fail 0 |
| 4 | `6451735` | Linux, on behaviour: tests 28, pass 26, fail 2, `the grandchild outlived the stop`; then the grace-period test alone: tests 29, fail 1 | Windows tests 29, pass 28, skipped 1 (process groups are POSIX); Linux tests 28, pass 28 |
| 1 | `65fd6a0` | module RED; then with a pass-through stub: tests 35, pass 28, fail 6 (**the run that started the real nightly, above**); after the guard: tests 36, pass 33, fail 2; doctor 34, pass 33, fail 1 | scheduler + grep-clean tests 45, pass 44, skipped 1; doctor 34/34 |
| 8 | `dcd6896` | schedule + scheduler: tests 54, pass 49, fail 4 | tests 63, pass 62, skipped 1 |
| 2 | `c705205` | tests 2, pass 0, fail 2 | my four test files: tests 99, pass 98, skipped 1 |
| 9 | `eca4ee5` | entrypoint and helper: tests 2, fail 2; `envWithSecretFiles`: tests 1, fail 1 | Windows 5/5 of the matching tests; Linux `scheduler.test.mjs` tests 45, pass 45 |
| 10 | `0d998fa` | `grep-clean.test.mjs`: tests 10, pass 9, fail 1 | tests 10, pass 10, fail 0 |

What each fix is:

1. The image sets `GIT_CONFIG_GLOBAL=/home/harness/.gitconfig-jobs`; the entrypoint writes that file
   (safe.directory and the helper, no token). `scheduler.mjs` reads `DATABASE_URL_FILE` itself
   (`envWithSecretFiles`: the entrypoint's list and its three refusals, exit 78) and hands the result to the
   jobs it starts; doctor's `DATABASE_URL` row resolves the same way. `main()` starts jobs only through a
   `runner` or `spawn` it is handed (exit 70 otherwise).
2. The image sets `HARNESS_JOBS_CONTAINER=1`; `nightly-ingest.sh` skips the transcript sweep and the state
   step there with one line: `transcripts and state: skipped in the jobs container (sessions are captured
   by the host's SessionEnd hook)`. `CLAUDE_PROJECTS_DIR` and its bind are gone from `compose.yaml` (the
   vault is the only host bind); `docs/portable.md` step 7 says so.
3. `tick()` asks `shouldStop` before each job; the loop leaves before its sleep after a stop; a sleep begun
   after a stop returns at once (`createStopper`).
4. Jobs start `detached` (their own process group) on POSIX and a stop signals the group (`signalJob`,
   negative pid); `stop_grace_period: 150s`, tested against `SYNC_FETCH_TIMEOUT_MS` (120 s).
5. The run lock is judged by age only (no pid liveness, as `lib/realm-lock.mjs`); `pid` and `owner`
   (`scheduler loop` or `--run-now`) are for the message; a put-back that fails is `lock contended`.
6. `realm <name> clean` reads `git status --porcelain=v1 -z --untracked-files=all` through
   `parsePorcelainZ` and `splitBySyncPath(isSyncPath)`; only sync-path entries fail it; the rest are a note,
   e.g. `yes (the sync never stages 1 entry: board.canvas)`.
7. `realm <name> pushed` asks `symbolic-ref --quiet --short HEAD` (exit 1: `no: HEAD is detached (not on a
   branch)`), then `config --get branch.<b>.merge` (exit 1: `no: no upstream branch (git push -u origin <b>
   once)`), then the count; any other failure is `unknown (…)`.
8. The nightly's checkpoints step passes `HARNESS_CHECKPOINT_REPOS`/`_AUTHORS` as `--repo`/`--author`; in
   the container with no repository listed, it and the scheduler's `collect` both log
   `skipped in the jobs container (HARNESS_CHECKPOINT_REPOS is not set)` and count as exit 0.
9. `read_secret`, the git credential helper (sh, `sed '1s/^\xEF\xBB\xBF//'`) and `envWithSecretFiles` drop
   a leading UTF-8 BOM as well as CR and LF.
10. The `HARNESS_VAULT` default line of `nightly-ingest.ps1`, `register-checkpoint-collect.ps1`,
   `register-nightly-ingest.ps1` and `register-weekly-curate.ps1` (that one line in each) is now
   `"$($env:USERPROFILE -replace '\\', '/')/vault"`, which evaluates to `C:/Users/stack/vault` here (the
   expression alone was evaluated; no script was run). `scripts/weekly-curate.ps1:101` has the same old
   default; item 10 does not name it, so it is unchanged.

### Container checks (a scratch vault and a throwaway store, never the live ones)

Rebuilt image `3886a980a864`. Scratch setup as in round 1: a two-note scratch realm (`projects:local`, no
remote) as `VAULT_DIR`, `harness_database_url` pointing at a throwaway `pgvector/pgvector:0.8.6-pg17`
container on port 5545, `REALM_SYNC=dryrun`. `docker compose config` was read before `up` and named only
scratch paths. All of it was removed afterwards.

First start (2026-10-03 16:54Z):

```
scheduler: nightly: starting for the window 2026-10-03T07:00:00.000Z
transcripts and state: skipped in the jobs container (sessions are captured by the host's SessionEnd hook)
checkpoints: skipped in the jobs container (HARNESS_CHECKPOINT_REPOS is not set)
=== nightly reconcile finished (realms-pull 0, transcripts 0, state 0, checkpoints 0, sweep 0, ingest 0, verify 0, eval 0, realms-push 0) ===
scheduler: nightly: exit 0 after 104 s
scheduler: collect: skipped in the jobs container (HARNESS_CHECKPOINT_REPOS is not set)
scheduler: collect: exit 0 after 0 s
```

Item 1's check, the exec'd verb:

```
$ docker compose exec harness-jobs node hooks/scheduler.mjs --run-now nightly; echo $?
… ingest | Loaded 2 documents. … ingest : exit 0 …
scheduler: nightly: exit 0 after 12 s
0
```

What that exec had: `DATABASE_URL` unset and `DATABASE_URL_FILE=/run/secrets/harness_database_url` (the
scheduler read the file), `GIT_CONFIG_GLOBAL=/home/harness/.gitconfig-jobs`,
`git config --global --get-all safe.directory` → `/vault/projects`,
`git -C /vault/projects rev-parse --is-inside-work-tree` → `true`; the exec'd doctor printed
`DATABASE_URL           set (read from DATABASE_URL_FILE)`.

Item 2's check: the scratch vault held 3 files before and 3 after two nightlies; `git status --porcelain`
printed nothing; still 1 commit. `docker compose ps` → `harness-jobs healthy`; `exec whoami` → `harness`.

Items 3 and 4 in the container: with `last_run_at` set back, the loop started a nightly, and
`docker compose stop` was sent while `uv run ingest` ran. The stop returned within a second, and the log
read `scheduler: nightly: exit 143 after 4 s`, then `scheduler: stopped`: the whole job had the signal,
`collect` was not started, and the restarted container (`scheduler: started …`) did not run the
interrupted nightly again.

### Re-recorded at the end (`0d998fa`)

```
$ ls hooks/tests/*.test.mjs | wc -l
75
$ cd hooks && npm test            (Windows, Node v24.19.0)
ℹ tests 1187
ℹ pass 1186
ℹ fail 0
ℹ skipped 1
```

The skip on Windows is the process-group test (POSIX only). The same suite on Linux: tests 1187, pass 1185,
skipped 1, fail 1. The failure is again `a long chain of lookalike assignments is bounded: fast`
(`hooks/tests/redact-pat.test.mjs:78`, a 300 ms bound, on `main`), at 317 ms in a full parallel run in the
container; run alone it passed twice. It is a timing bound, and the ubuntu legs are now required. Round 1
greps unchanged: `continue-on-error` 0, `On home-pc (containers):` 1, `missedExecutionTolerance` 1.

CI: `gh run list --repo emstacho-su/agentic-harness --branch feat/containers --limit 3` → `[]` (no PR yet).

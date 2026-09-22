# R6 — agentic-harness containerization + Obsidian vault → git

Researcher R6, Phase 14. Read-only on all repos; no secret values printed below, only
variable names and where they live.

---

## Part A — inventory of `C:/Users/estac/agentic-harness`

### Shape of the repo (from README.md / CONTEXT.md)

Two systems in one repo:
1. **Ingestion**: Python (`uv`) pipeline, `ingest/`, loads the Obsidian vault +
   the retired claude-mem export into Postgres/pgvector.
2. **Retrieval**: Node/TS stdio MCP server, `mcp-server/`, registered with
   Claude Code as `rag` (`mcp__rag__search_context`, `mcp__rag__get_document`).

Both talk to a **dedicated Supabase project, `harness-memory`** (ref
`hqkytnyiiuxovnnyixye`, region `us-east-1`, Postgres 17, pgvector 0.8.2, schema
`rag`) — **never** the bb2dash project (`goultdzqcavefcgnifdy`). Both stores are
384-dim (bge-small vs gte-small), so crossing them raises no error, only
silently-wrong rankings. Both the ingest config (`ingest/src/ingest/config.py`)
and the MCP server (`mcp-server/src/config.ts:181-186`) hard-refuse a
`DATABASE_URL` containing the bb2dash ref as a guard.

Embedding model: `BAAI/bge-small-en-v1.5`, 384 dims, local via `fastembed` —
**no API key, no network cost, nothing leaves the machine** once the ~130 MB
ONNX weights are cached. This matters a lot for containerization: it's the one
piece of the harness that needs a real model-cache volume, not just code.

### Process-by-process inventory

#### 1. `ingest` (Python/uv package, `ingest/`)

- **Starts today**: by hand (`uv run ingest --source obsidian --path <vault>`),
  from the SessionEnd hook's detached spawn (`--only <note>`), and from
  `scripts/nightly-ingest.ps1` (full walk) via Task Scheduler.
- **Runtime**: `uv`-managed Python 3.12 (`ingest/.python-version`,
  `requires-python = ">=3.12,<3.14"`). Deps: `fastembed`, `psycopg[binary]`,
  `python-frontmatter`, `PyYAML` (`ingest/pyproject.toml`). It is a **batch
  job, not a service** — runs, reconciles, exits.
- **Windows/OneDrive assumptions**:
  - `docs/ingestion.md:14-16` and every script default the vault path to
    `C:/Users/$env:USERNAME/OneDrive - Syracuse University/vault` — but this
    is always passed as an explicit `--path` CLI argument, **never hardcoded
    inside the Python package itself**. `ingest/src/ingest/cli.py:50-54`
    requires `--path`; there is no OneDrive default in code, only in the
    wrapper `.ps1` scripts and docs. Grepping for `OneDrive` across
    `ingest/src` turns up only comments (`hashing.py:20`, `prune.py:14`,
    `config.py:51`, `materials/cli.py:4`, `loaders/obsidian.py:210`) — no
    hardcoded path.
  - `ingest/src/ingest/config.py:44-58` — `FASTEMBED_CACHE_DIR` defaults to
    `Path.home() / ".cache" / "fastembed"` if unset; comment explicitly says
    it "must stay OUT of OneDrive" (binary index + OneDrive sync caused
    file-lock failures before). In a container this is moot (there's no
    OneDrive inside it) but the **named volume for the model cache must
    persist across container recreation**, or every run re-downloads 130 MB.
  - `docs/ingestion.md:731-744` — the Windows `/c/...` vs `C:/...` gotcha is
    purely a Windows-native-binary problem; irrelevant inside a Linux
    container, but relevant to any script that still generates paths to hand
    to it from the host.
- **Secrets/config** (`ingest/src/ingest/config.py:114-128`, `.env.example`):
  `DATABASE_URL` (direct Postgres, session pooler, port 5432 — the only write
  path), `DATABASE_CA_CERT` / `PGSSLROOTCERT` (path to `certs/prod-ca.crt`,
  **not secret**, Supabase's public root CA, valid to 2031), `DATABASE_SSL`
  (only `disable`, for local Postgres — no downgrade-but-verify option),
  `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE` (carried for `--check-env` /shared
  `.env` convenience only, **never sent anywhere** by this package — PostgREST
  is deliberately rejected). Loaded via `ingest/src/ingest/envfile.py`, which
  walks up from the package looking for `.env` (repo root) unless
  `--env-file` is passed; **an exported process env var always wins over the
  file**. `--check-env` reports presence only, never values.
- **Disk I/O**: reads the vault tree (`--path`) and the claude-mem export
  directory (one-time, historical, `~/.claude-archive/...` — not needed again
  post-migration); writes nothing to disk itself except the fastembed cache
  and `HARNESS_INGEST_STATE_FILE` (`~/.claude/hooks/ingest-state.json` by
  default) — the nightly health timestamp. All real writes go to Postgres.
- **Container verdict**: **straightforward batch job image.**
  `python:3.12-slim` + `uv`, `COPY ingest/`, `uv sync --frozen`. Needs:
  volume/bind-mount for the vault (read+write — it doesn't write vault files,
  but shares the mount with whatever does), a named volume for
  `FASTEMBED_CACHE_DIR`, env for `DATABASE_URL`/`DATABASE_CA_CERT` (mount
  `certs/prod-ca.crt` read-only, it's public so it can also just live baked
  into the image), and a bind-mount or named volume for the state file if
  health-checking across container restarts matters. No code changes needed
  — it already takes every path as an argument/env var.

#### 2. `mcp-server` (Node/TS, `mcp-server/`) — the `rag` stdio server

- **Starts today**: spawned by the Claude Code process itself as a stdio
  child, registered user-scope in `~/.claude.json` (not `settings.json`) via
  `claude mcp add-json rag <json> -s user`. Command:
  `"C:/Program Files/nodejs/node.exe" "C:/Users/estac/agentic-harness/mcp-server/dist/index.js"`.
- **Runtime**: Node ≥20.11 (dev'd on 24.13.0). `@modelcontextprotocol/sdk`,
  `fastembed` (npm, 2.1.0 — a **different** package from the Python one, but
  verified bit-parity, see CONTEXT.md:163-175), `pg`, `zod`.
- **Windows/OneDrive assumptions**: none at the code level — `mcp-server/src/config.ts`
  reads everything from env. The README's setup snippet
  (`README.md:214-219`, `mcp-server/README.md:174-184`) hardcodes
  `C:/Program Files/nodejs/node.exe` and a `C:/Users/estac/...` path only
  because that's how a **stdio** MCP server is registered — the client
  (Claude Code) must be told an absolute command + args to exec. This is the
  one place containerizing changes the *registration mechanism*, not the
  server's code (see Part C).
- **Secrets/config** (`mcp-server/src/config.ts`, `.env.example`): same
  `DATABASE_URL` / `DATABASE_CA_CERT` / `DATABASE_SSL` as ingest, plus
  `FASTEMBED_CACHE_DIR` (separate cache from the Python side —
  `mcp-server/.fastembed-cache/` in the repo today, gitignored), and tuning
  knobs (`RAG_VECTOR_TYPE`, `RAG_DEFAULT_MATCH_COUNT`, `RAG_MAX_MATCH_COUNT`,
  `RAG_MAX_PER_DOCUMENT`, `RAG_MIN_SIMILARITY`, `RAG_RRF_K`,
  `RAG_QUERY_PREFIX`). The **MCP client passes the env block** — the server
  does not read a `.env` file itself in production; `.env.example` exists for
  documentation and local `node --env-file` runs.
- **stdout is sacred**: it's the JSON-RPC wire. All logging is stderr,
  fastembed's progress bar is disabled. This is a hard constraint for
  containerizing: if this ever runs as `docker exec` or `docker compose run`
  with stdio attached, nothing in the container's entrypoint script may print
  to stdout before Node starts.
- **Disk I/O**: reads/writes only its `FASTEMBED_CACHE_DIR` (model weights,
  ~130 MB, first-call download); everything else is the Postgres connection.
- **Container verdict**: **cannot be a normal long-running network service
  the way an HTTP MCP server would be** — it's stdio, so its "container" is
  really just "the environment the process runs in." Two workable shapes:
  (a) bundle it (built `dist/`) **inside the dev-container image** that runs
  Claude Code, registered there exactly as today but pointing at an in-image
  path; or (b) run it in its own container and have the dev container invoke
  it via `docker compose run --rm -i rag-mcp node dist/index.js` as the
  registered "command" (Docker itself proxies stdio fine with `-i`, no `-t`).
  (a) is simpler and is what R6 recommends for the dev-container acceptance
  criterion; (b) is more isolated if the ingest/mcp-server images should stay
  strictly separate. Either way, the fastembed cache needs a named volume so
  the 130 MB download survives a container rebuild.

#### 3. `scripts/nightly-ingest.ps1` — step-by-step

Runs once nightly (03:00 default), in this exact order, and **the task's exit
code is the final ingest's**, nothing else:

0. `node hooks/sweep-transcripts.mjs --vault <vault> --min-idle-hours 6
   [--dry-run]` — walks `~/.claude/projects/**/*.jsonl`, finds any transcript
   idle 6h+ with no vault note, and runs it through the **same** capture code
   the SessionEnd hook uses, writing `captured_by: sweep` notes. Catches SDK
   review workers, killed sessions, and teleported cloud sessions.
0b. `node hooks/collect-checkpoints.mjs --vault <vault> [--repo <path>]...
   [--dry-run]` — **this is the step that does a git pull of `.harness/sessions/`
   checkpoint notes from tracked repos.** Default repos: `~/agentic-harness`
   and `~/projects/bb2dash` (`hooks/lib/constants.mjs:
   DEFAULT_CHECKPOINT_REPO_SEGMENTS`). For each repo it `git fetch`es (unless
   `--no-fetch`), reads every `.harness/sessions/*.md` off **every branch**,
   validates (`type: session`, `captured_by: skill`, a session-id-shaped
   filename, `id == session-<session_id>`, non-empty collection), redacts the
   body (`hooks/lib/checkpoints.mjs:161`, via `redact.mjs`), and files it into
   the vault under the collection it names. First copy of an id wins; a
   duplicate or a collision with an existing hook/sweep note is refused.
   `register-checkpoint-collect.ps1` runs this same script again at 12:00 and
   18:00 with `--ingest`, so a noon checkpoint is searchable that afternoon.
1. `uv run ingest sweep-concluded --path <vault> --stale-after-hours 24
   [--apply|--dry-run]` — flips `status: active` → `concluded` on session
   notes whose `ended_at` is >24h old (R-27.2). Line-wise edit, atomic
   write-then-rename, never touches a note it can't parse.
2. `uv run ingest --source obsidian --path <vault>` — full walk, picks up
   everything the two sweeps above just wrote/edited, in the same night.

A failing sweep does **not** abort the run; only the final ingest's exit code
counts. Logs: `~/.claude/hooks/nightly-ingest.log` (rotates at 1 MB, keeps
last 2000 lines), `~/.claude/hooks/transcript-sweep.log`,
`~/.claude/hooks/collect-checkpoints.log`.

`scripts/register-nightly-ingest.ps1` registers Windows Task Scheduler task
`AgenticHarness-NightlyIngest` (daily 03:00, `-StartWhenAvailable` because the
laptop is usually asleep then, `LogonType Interactive`/`RunLevel Limited`,
2h execution limit, 2 retries). Every path (`uv`, `node`, PowerShell, the
project, the vault) is resolved to an absolute value at registration time,
because a scheduled task inherits almost none of a login shell's environment.

`scripts/register-checkpoint-collect.ps1` registers
`AgenticHarness-CheckpointCollect` (12:00 + 18:00 by default,
`-Times`/`-Repos`/`-Authors` overridable). `-Authors` restricts which commits'
notes are trusted — the trust boundary is "anyone who can push to the tracked
repos," narrowed by author email if set (cloud sessions commit as
`noreply@anthropic.com`).

**Container verdict**: all three `.ps1` scripts are pure orchestration —
resolve paths, call `node`/`uv`, log, exit-code passthrough. None of the
underlying `.mjs`/Python logic is Windows-specific. This is exactly what
Part C's cross-platform scheduler replacement targets (see below); the
"conclude stale sessions," "collect checkpoints," "sweep transcripts," and
"full ingest" steps become one script or one small ordered pipeline invocable
identically from a Linux scheduler container, PowerShell, or a `Makefile`.

#### 4. `hooks/` and the live copies under `~/.claude/hooks/`

- **Deployed, byte-identical**: `hooks/install.mjs` copies the whole
  `hooks/` tree (script + `lib/`) to `~/.claude/hooks/`, verifies every file
  by SHA-256, and does a read-merge-write on `~/.claude/settings.json` to
  register `SessionEnd` and `SubagentStop` → `session-capture.mjs`. Verified
  live: `diff .claude/hooks/session-capture.mjs agentic-harness/hooks/session-capture.mjs`
  → no diff; `~/.claude/settings.json` `hooks` block registers both events
  pointing at `"C:/Program Files/nodejs/node.exe"` + the deployed path,
  20s timeout each.
- **`session-capture.mjs`: where it writes, how it derives the vault path and
  the collection/folder.**
  - **Vault path**: `hooks/lib/constants.mjs`:
    `VAULT_ENV_VAR = 'HARNESS_VAULT'`, default
    `DEFAULT_VAULT_SEGMENTS = ['OneDrive - Syracuse University', 'vault']`
    joined onto `os.homedir()`. **This is the single point of configuration**
    for the hook, the transcript sweep, and the checkpoint collector — set
    `HARNESS_VAULT` and all three follow it. It is **not** hardcoded as a
    literal path string anywhere in the `.mjs` source; it's a segments array
    combined with `homedir()`, overridable by env var (tests already rely on
    this).
  - **Collection derivation** (`hooks/lib/collection.mjs`, R-27.1): (1) a path
    segment matching an existing `vault/classes/<slug>` folder →
    `classes/<slug>`; (2) else the git remote's `owner/repo` slug, resolved
    through a worktree to its main repo, → `projects/<slug>`,
    `collection_source: git`; (3) else the folder name (preferring an
    ancestor that already owns a vault folder, so e.g. `agentic-harness/ingest`
    still resolves to `agentic-harness`) → `collection_source: folder`,
    falling back to `misc`. This closes the exact gap described in the
    (now-stale) memory file `session-capture-collection-gap.md` — that memory
    predates the merged R-27/V-2 work; the collection-by-git-remote fix it
    describes as needed is **already live** (verified against
    `hooks/lib/collection.mjs` and README's "Status" table showing R-27
    merged 2026-09-16 via PRs referenced in `docs/planning/sprint-1-hub/briefs/66_SESSION_ARCHIVAL_RAG.md`).
  - **Writes**: one note per session,
    `vault/<projects|classes>/<collection>/sessions/<session_id>.md`
    (rewritten/merged on every `SessionEnd`), plus one per subagent at
    `sessions/<session_id>--<agent_id>.md` on `SubagentStop`. Frontmatter
    schema v2 — the **frozen field list** is in `hooks/README.md` (Identity,
    Location, Lifecycle, Git, Context, Work, Volume, Provenance groups) and
    matches the R-27 contract in `docs/planning/sprint-1-hub/briefs/66_SESSION_ARCHIVAL_RAG.md`
    verbatim (see below — this is the "frozen field names" the vault move
    must not break).
  - **Redaction**: every prompt and tool-input string passes through
    `hooks/lib/redact.mjs` before it's written — named-secret assignments,
    connection-string passwords, JWTs, and ~13 vendor key-format regexes
    (Supabase `sb*_`, GitHub `gh[pousr]_`/`github_pat_`, OpenAI `sk-`, Stripe,
    Google `AIza`, GitLab, npm, AWS `AKIA`, Slack `xox*`, PEM private keys,
    Bearer/Basic auth headers). Raw tool *output* is never copied at all
    (two narrow exceptions with one capture group each: a PR number, an
    artifact URL).
  - **Never blocks, never fails loudly**: 1,200 ms internal budget inside
    SessionEnd's ~1.5s window; every path exits 0; failures go only to
    `~/.claude/hooks/session-capture.log`.
  - **Ingest-on-capture**: after a successful write, the hook spawns a
    **detached** `uv --directory <HARNESS_INGEST_PROJECT> run ingest --source
    obsidian --path <vault> --only <note> [...]` and returns — it does not
    await it. Env: `HARNESS_INGEST_ON_CAPTURE` (kill switch),
    `HARNESS_INGEST_PROJECT` (default `~/agentic-harness/ingest` — **the main
    checkout, never a worktree**), `HARNESS_UV_BIN` (always resolved to an
    absolute path, never a bare name — Windows resolves bare commands against
    cwd before PATH), `HARNESS_INGEST_LOG`. On Windows the child is spawned
    as `pythonw -c "from ingest.cli import main; ..."` specifically to avoid
    popping a console window (`hooks/lib/enqueue-ingest.mjs:52-65`) — **this
    Windows-only branch is dead code in a Linux container** and should use
    the POSIX `['ingest']` entry unconditionally there (the code already
    branches on `platform`, so no change needed, just confirm the container
    reports `process.platform !== 'win32'`).
- **Container verdict**: `session-capture.mjs` is fundamentally **tied to
  wherever Claude Code itself is running** — it's a hook the Claude Code CLI
  invokes in-process at session end, not a standalone service. It only makes
  sense containerized in the sense that the **dev container** (where Claude
  Code PM/worker sessions will run per the Phase 14 plan) needs: (1) the hook
  installed via the same `install.mjs`, (2) `HARNESS_VAULT` pointed at the
  container's mounted vault path, (3) `uv`/the ingest project reachable at
  `HARNESS_INGEST_PROJECT` inside that same container image (or a documented
  fallback path) so `enqueueIngest`'s subprocess spawn keeps working
  unmodified. No hook code changes are required — every path is already
  env-driven; only the deployment target changes.

#### 5. `certs/` — what it is

`certs/prod-ca.crt` is **Supabase's public root CA** ("Supabase Root 2021 CA",
valid 2021-04-28 → 2031-04-26), pinned so TLS verification (`sslmode=verify-full`)
succeeds against the pooler host, which presents a certificate no default OS
trust store carries. **Not a secret** — it's committed to the repo
(`.gitattributes` forces `*.crt text eol=lf`) and covers every project in the
Supabase org, not just `harness-memory`. **In a container**: this is one of
the easier pieces — bake it into the image (`COPY certs/prod-ca.crt`) or mount
it read-only; either works since it's public. The only requirement is that
whatever path `DATABASE_CA_CERT` points to inside the container actually
resolves (no Windows `/c/...` vs `C:/...` issue on Linux, but a bind-mount
path still has to exist inside the container's mount namespace).

#### 6. `db/` — migrations mirror

`db/migrations/*.sql` mirrors what's applied to `harness-memory` via the
Supabase MCP `apply_migration` tool (not psql from a local machine in normal
operation — the README's `for f in db/migrations/*.sql; do psql ...; done`
is the reproduce-elsewhere fallback). No container implication beyond: if a
container ever needs to apply/verify schema (e.g., a fresh Supabase project
for a new environment), it needs `psql` or `psycopg` and the same
`DATABASE_URL`/CA cert — already covered by the ingest image's deps
(`psycopg[binary]`).

### Where the vault path is configured / hardcoded — the complete list

| Location | What | Overridable? |
| --- | --- | --- |
| `hooks/lib/constants.mjs` `DEFAULT_VAULT_SEGMENTS` | `['OneDrive - Syracuse University', 'vault']` joined onto `homedir()` | yes, `HARNESS_VAULT` env var — used by `session-capture.mjs`, `sweep-transcripts.mjs`, `collect-checkpoints.mjs`, `untagged-sessions.mjs` |
| `scripts/nightly-ingest.ps1` `$VaultPath` param default | `"C:/Users/$env:USERNAME/OneDrive - Syracuse University/vault"` | yes, `-VaultPath` |
| `scripts/register-nightly-ingest.ps1` `$VaultPath` param default | same | yes, `-VaultPath` |
| `scripts/register-checkpoint-collect.ps1` `$VaultPath` param default | same | yes, `-VaultPath` |
| `ingest/src/ingest/cli.py` `--path` | **no default at all** — required argument | always explicit |
| `ingest/src/ingest/materials/cli.py` docstring example | `"C:/Users/you/OneDrive - Syracuse University/vault"` | comment only, `--vault` is a real required flag |
| `README.md`, `CONTEXT.md`, `docs/*.md` | prose/examples only | n/a |

**Net finding**: the vault path is genuinely centralized behind one env var
(`HARNESS_VAULT`) for the Node side and one required CLI flag for the Python
side. Migrating the vault means: (1) update `HARNESS_VAULT` (or accept the
new default if the new location is still `~/OneDrive - Syracuse
University/vault` — it won't be, so set it explicitly), (2) update the three
`.ps1` script defaults or their container-env equivalents, (3) nothing to
change in `ingest/` itself.

### Frozen fields the move must not break (`docs/planning/sprint-1-hub/briefs/66_SESSION_ARCHIVAL_RAG.md`)

The R-27 contract freezes the session-note frontmatter schema (schema v2) —
`id`, `collection`/`collection_source`, `status`/`concluded_at`/`supersedes`/
`resumed_from`, `repo`/`branch`/`worktree`/`repos_touched`/`commits`/`prs`,
`phase`/`tags`, `parent_session`/`child_sessions`, `memory_files`/`plan_file`/
`docs_touched`/`artifacts`/`files_modified`, and the volume/provenance fields
(`captured_by: hook|sweep|skill|migration`, `origin`). **None of these are
affected by moving the storage medium from OneDrive-synced-folder to a git
working copy** — they're YAML frontmatter inside the same markdown files, and
`ingest`'s reconciliation key is `(source, external_id)` where `external_id`
is the **vault-relative path** (or frontmatter `id:` when present, which
session notes always have: `id: session-<session_id>`). As long as the
migration copies files byte-identically and vault-relative paths don't
change, `content_hash` (computed over the body, CRLF-normalized already —
`ingest/src/ingest/hashing.py:20`) will match and **nothing gets needlessly
re-embedded**. The one thing that *would* break the contract: renaming or
restructuring folders during the move (a rename is indistinguishable from
delete+create for anything keyed on path rather than frontmatter `id:` — but
every session/index note already carries a stable `id:`, so only materials
notes without one would be at risk, and those are `ingest: false` anyway).

---

## Part B — moving the vault from OneDrive into a private git repo

### Who writes to the vault today, and what changes

| Writer | Where it runs | Frequency | File pattern |
| --- | --- | --- | --- |
| Stack, by hand, in Obsidian | host, interactive | continuous | any file |
| `session-capture.mjs` (SessionEnd/SubagentStop hook) | host today; dev container later | every session end | `<session_id>.md`, `<session_id>--<agent>.md` — one file per session, never shared |
| `sweep-transcripts.mjs` (nightly + on-demand) | host today; scheduler container later | nightly (+ manual) | same note files the hook would have written, for sessions the hook missed |
| `sweep-concluded` (ingest subcommand) | host/scheduler | nightly | 2-key frontmatter edit, line-wise, on **existing** session notes |
| `collect-checkpoints.mjs` | host/scheduler | 12:00, 18:00, +nightly | `cp-*.md` under the project/class it names — new files, id-collision-refused |

**The structural fact that makes this tractable**: every automated writer
produces or edits **one uniquely-named file per session/checkpoint**
(`<session_id>.md`, never a shared file), and the one writer that edits an
*existing* file (`sweep-concluded`) touches exactly two frontmatter keys via a
line-wise patch, never a full rewrite. Two processes racing to write the
*same* file essentially cannot happen except: (a) a resumed session's
`SessionEnd` firing from two machines/dev-containers at once (not a realistic
scenario for a single user), or (b) Stack hand-editing a note's frontmatter
at the exact moment the nightly sweep concludes it. Git turns (b) into a
visible three-way merge or conflict instead of OneDrive's silent
last-writer-wins — strictly safer, not riskier.

**Recommendation: no single "vault-sync" owns commits; each writer commits
its own work, but every writer follows the same three rules:**

1. **Append-only, one-file-per-session** — already true, don't change it.
2. **`git pull --rebase --autostash` immediately before every commit+push.**
   Since writers touch disjoint files, a rebase almost never has real content
   to merge — it just replays commits. This is the single policy change that
   prevents divergent-history push failures.
3. **Never force-push, ever, from an automated writer.** On a rebase
   conflict (which given rule 1 should mean "Stack was mid-edit of the exact
   note the sweep also touched"), the automated writer aborts the rebase,
   leaves its own commit sitting locally uncommitted-to-remote, logs it, and
   waits for the next cycle. A human (Stack) resolves it once, by hand, next
   time he's in the vault.

This is simpler than a dedicated "vault-sync owns all commits" model (which
would require every other writer to go through an API/queue instead of just
`git commit && git push`), matches the project's $0/simplicity constraint,
and matches how Obsidian Git's own "auto commit-and-sync on a timer" already
behaves for Stack's interactive edits.

If Stack finds conflicts annoying in practice, the fallback is to have
container jobs **write into the working copy but let one scheduled
`vault-sync` container do all the committing/pushing** on its own short
interval (e.g. every 5–10 min) — strictly more centralized, trades
simplicity for one more moving part. R6's read: start with the
per-writer-commits model; only add a dedicated sync owner if conflicts
actually happen (they're structurally unlikely given the file-naming
convention already in place).

### Desktop: Obsidian Git plugin

[Obsidian Git](https://github.com/Vinzent03/obsidian-git) (community plugin,
Vinzent03) supports "automatic commit-and-sync (commit, pull, and push) on a
schedule" from inside Obsidian — this is what covers Stack's own interactive
edits without him ever touching a terminal. Configure: auto-backup interval
(e.g. 10 min), pull-before-push, and — since the harness's own automated
writers will also be pushing — make sure its interval doesn't fight the
scheduler container's cadence (stagger them, e.g. Obsidian every 10 min,
scheduler container jobs on their existing 03:00/12:00/18:00 cadence, so they
rarely overlap).

**Mobile caveat, if it's ever relevant**: Obsidian Git's mobile build runs on
`isomorphic-git` (pure JS), which the plugin's own maintainers say they "do
not recommend... for mobile" — no SSH auth (HTTPS + PAT only), no rebase
strategy, no submodules, and repo size is capped by the app's RAM. A newer
"Hybrid Git Sync" plugin instead talks to the GitHub REST API directly on
mobile to work around this. Given Stack's stated environment is a Windows
laptop (and later a Mac mini/VPS), mobile is not in scope for Phase 14 — note
it only because "a future MacBook" is in the goal and if that MacBook is ever
a laptop Stack edits from directly (not just a headless host), Obsidian Git
desktop-mode (native git, full feature set) applies there unchanged; only an
iOS/Android use case would hit these limits.
[Sources: github.com/Vinzent03/obsidian-git; stephanmiller.com/obsidian-git-sync-mobile]

### Private GitHub repo size limits, and attachments

**Measured today: the live vault is 2.6 MB, 318 markdown files, 7 JSON files
under `.obsidian/`, and zero images/PDFs/binaries anywhere in it.** This
changes the whole calculus: there is currently nothing to put in LFS.

GitHub's official limits (docs.github.com/repository-limits, fetched
2026-09-16): hard cap **10 GB for the `.git` folder**, single objects capped
at 100 MB (recommended to stay under 1 MB), 2 GB per push. Community guidance
(GitHub Support articles) additionally recommends staying **under 1 GB** and
warns that repos over 5 GB may get a support outreach to slim down. None of
this is close to relevant at 2.6 MB, and won't be for a very long time even
with years of session notes (they're small markdown files — the 1,324
existing documents' worth of history in Postgres is a few MB of text total).

**Recommendation: keep attachments out of the git vault entirely**, as a
policy, not a technical workaround — there simply are none today. If/when
Stack starts pasting screenshots or PDFs into notes, the cheapest options in
order: (1) keep them in the OneDrive folder Obsidian still has open as a
*secondary*, non-git-tracked "attachments" subfolder Obsidian is told to save
new attachments into (Obsidian supports a configurable attachment folder
independent of the vault-git-root), so images never enter git history at all;
(2) if attachments must live alongside the notes in git, Git LFS's free tier
is generous for this use case — **10 GB storage + 10 GB bandwidth/month** for
GitHub Free (verified 2026-09-16, up from the old 1 GB/1 GB quota) — more
than enough for a personal note vault's images/PDFs. R6 recommends option
(1) now (zero new tooling) and revisiting LFS only if attachments actually
start appearing.
[Sources: docs.github.com/en/repositories/creating-and-managing-repositories/repository-limits;
docs.github.com/billing/managing-billing-for-git-large-file-storage/about-billing-for-git-large-file-storage]

### Secrets hygiene: what exists today, what a pre-commit gitleaks scan adds

**What already scrubs vault content, verified against source:**
- `hooks/lib/redact.mjs` — every prompt and tool-input string the
  SessionEnd/SubagentStop hook writes goes through this before the note ever
  touches disk (13 rule families: named-secret assignments, connection-string
  passwords, JWTs, ~10 vendor key formats, PEM keys, Bearer/Basic headers).
  Covers the hook and the transcript sweep (same capture code).
- `hooks/lib/checkpoints.mjs:161` — the checkpoint collector runs `redact()`
  on the body **before filing it into the vault**. So every path that lands
  in the vault today is already redacted once.

**A real gap this exposes, worth flagging even though it's outside the
vault's own boundary**: `skills/checkpoint/build-note.mjs` — which runs
*inside the cloud sandbox* and commits `.harness/sessions/<id>.md` straight
into the **source repo's** git history (bb2dash or agentic-harness) — does
**not** call `redact()` (confirmed by grep: it only imports the frontmatter
serializer, not `redact.mjs`). Redaction happens later, only when
`collect-checkpoints.mjs` reads that note back out of git and files it into
the vault. That means: **an unredacted secret pasted into a cloud session's
checkpoint body is already permanently in the source project's git history
before the vault (or gitleaks on the vault repo) ever sees it.** A pre-commit
gitleaks hook on the *vault* repo does not close this — it would need to run
inside the cloud sandbox's own `git commit` in `skills/checkpoint/SKILL.md`
step 3, or `build-note.mjs` would need its own `redact()` pass. This is a
gap in the *checkpoint* mechanism, not something the vault migration
introduces or can fix by itself — flagging for whichever phase/PR owns
`skills/checkpoint/`.

**What a pre-commit gitleaks scan adds specifically to the vault repo**:
defense-in-depth against `redact.mjs`'s regexes being incomplete (they're
greedy but enumerated, not exhaustive — a new vendor key format or an
unusually-shaped secret could slip through), and — the property OneDrive
never had — **prevents a leaked secret from ever entering permanent git
history** in the first place. Today, if a bad note got written to OneDrive,
overwriting the file made it gone. In git, a bad commit lives in history
forever unless someone rewrites it (`git filter-repo`, force-push, and tells
every other clone to re-fetch — painful). A pre-commit hook that blocks the
commit outright, rather than a post-commit scan, is the right shape here.

Recommended setup: `gitleaks protect --staged` as a git `pre-commit` hook in
the vault repo (via the `pre-commit` framework, `.pre-commit-config.yml`
pointing at `gitleaks/gitleaks`) — covers Stack's interactive Obsidian Git
commits (Obsidian Git shells out to the real `git` binary on desktop, so
native git hooks fire normally) and any container writer's `git commit`
(install gitleaks in the scheduler/vault-writing container images and run
`gitleaks protect --staged` before `git commit`, refusing the commit rather
than auto-editing the note — never silently mangle Stack's text). A CI-side
`gitleaks detect` job (or GitHub Action) as a second net catches anything a
local hook was skipped for (`--no-verify`, a writer that didn't have the hook
installed yet).
[Sources: github.com/gitleaks/gitleaks; d4b.dev/blog/2026-02-01-gitleaks-pre-commit-hook]

### How the ingest container reads the vault: two modes

- **Workstation mode (this laptop, Obsidian open)**: **bind-mount the host's
  vault working copy** into the ingest/hooks containers
  (`-v C:/Users/estac/vault:/vault`, or the WSL2-integrated path Docker
  Desktop uses). Obsidian is a native Windows app and needs direct filesystem
  access to the real working copy — it cannot open a vault "inside" a
  container — so the working copy has to live on the host filesystem
  regardless, and every container that touches it just bind-mounts that same
  path. This is simplest, has zero replication lag, and matches "clone +
  .env + docker compose up" portability (no extra clone step on first run —
  the host vault is already there once cloned once, by hand or by an init
  script).
- **Server mode (a future headless Mac mini or VPS with no Obsidian
  running)**: **clone into a named Docker volume**, and have whichever
  container writes to it (`sweep-transcripts`, `collect-checkpoints`,
  `sweep-concluded`) `git pull --rebase` at the start of its run and
  `git push` at the end (per the per-writer-commits model above). `ingest`
  itself only reads, so it just needs the same volume mounted, no git
  operations of its own.

Both modes are the same container images; only the compose file's volume
definition differs (`bind` vs a named `volume` + a one-time `git clone` init
container). This is worth stating explicitly in the compose files as two
profiles (`workstation` / `server`) so the "later maybe an always-on ARM
MacBook" and "later maybe a cloud VPS" goals in the Phase 14 context don't
require re-deriving this.

### Migration steps (history-free first commit) and rollback

1. **Stop every writer first**: `./scripts/register-nightly-ingest.ps1 -Unregister`,
   `./scripts/register-checkpoint-collect.ps1 -Unregister`, close Obsidian.
2. **Copy, don't move**, `C:/Users/estac/OneDrive - Syracuse University/vault`
   → a new location **outside OneDrive** (matching the existing convention
   for `agentic-harness` itself and both fastembed caches, all explicitly
   kept off OneDrive for the same git/OneDrive-corrupts-each-other reason) —
   e.g. `C:/Users/estac/vault`. Keeping the original in place until cleanup
   is the rollback: nothing is destroyed until step 9.
3. **One-time gitleaks audit of the copy** before it ever becomes a commit —
   these files have never been through a secret scanner, only through
   `redact.mjs` at write time; worth confirming `gitleaks detect` on the
   working tree comes back clean before it enters git history at all.
4. `git init`, add `.gitattributes` (`* text=auto eol=lf`, matching
   `agentic-harness`'s own convention — `ingest`'s hashing already normalizes
   CRLF↔LF before hashing, so this is belt-and-suspenders, not load-bearing,
   but keeps `git diff` sane), a `.gitignore` (exclude
   `.obsidian/workspace*.json` and any plugin `data.json` that might carry a
   token — check `.obsidian/plugins/*/data.json` by hand before the first
   commit since some community plugins do store credentials there), install
   the `pre-commit` + `gitleaks` hook from the section above, then **one
   commit**: `chore: import vault (history-free)`. No value in preserving
   OneDrive's non-existent version history.
5. Create the private GitHub repo (e.g. `emstacho-su/obsidian-vault`), push.
6. Point Obsidian at the new folder (Obsidian doesn't "move" a vault in
   place cleanly — open the new folder as a vault; `.obsidian/` came along in
   the copy so plugin config, Daily Notes/Templates settings, etc. persist).
   Remove the old vault from Obsidian's recent-vaults list once confirmed
   working, but don't delete the folder yet.
7. Install/configure the Obsidian Git plugin (auto-backup interval,
   pull-rebase) per the section above.
8. Update `HARNESS_VAULT` (new default, or an explicit env var everywhere
   it's consumed) and the vault-path defaults in the container
   env-equivalents of the three `.ps1` scripts (Part C). Nothing to change in
   `ingest/`'s own code — it takes `--path` explicitly.
9. **Verify before declaring done**: run `uv run ingest --source obsidian
   --path <new path>` by hand once; confirm the document/chunk counts match
   what's already in `harness-memory` (∼1,324/2,360 at last count) and that
   **most notes report `unchanged`**, not full re-embeds — that proves the
   copy was byte-identical from `content_hash`'s point of view (accounting
   for the CRLF normalization already built into hashing).
10. Re-point/re-register the scheduler (Part C) at the new path, confirm one
    full cycle (checkpoint collect → sweep → ingest) runs clean.
11. **Rollback path, any time before step 12**: flip `HARNESS_VAULT` and the
    scheduler's vault path back to the OneDrive folder — nothing was deleted,
    so this is a config revert, zero data loss.
12. After a burn-in period (R6 suggests 1–2 weeks of both scheduled cycles
    running clean, and Stack confirming Obsidian Git's push/pull hasn't
    surprised him), stop OneDrive from syncing the old vault folder and
    archive it (zip, don't delete outright) rather than deleting immediately.

---

## Part C — proposed container services

All images share one convention already used throughout the harness: **no
path is ever hardcoded — everything is an env var or a mounted volume**, so
the same image runs on this laptop, a future Mac mini, or a VPS.

### `harness-ingest` (Python/uv — batch job, not a daemon)

- **Base**: `python:3.12-slim` (matches `ingest/.python-version` /
  `requires-python`), `uv` installed via its official install script.
- **Build**: `COPY ingest/pyproject.toml ingest/uv.lock ingest/src ./`, `uv sync --frozen --no-dev`.
- **Entrypoint**: no fixed entrypoint — this image's whole point is that it's
  invoked with different arg sets for different jobs:
  - `uv run ingest --source obsidian --path /vault` (full nightly reconcile)
  - `uv run ingest sweep-concluded --path /vault --apply` (the 24h sweep)
  - `uv run ingest --source obsidian --path /vault --only <note>` (per-session,
    invoked from inside the dev container, not this image, per Part A)
  - `uv run ingest --health` (health check, can back a Docker `HEALTHCHECK`)
- **Volumes**:
  - `/vault` — bind mount (workstation) or named volume (server mode).
  - `harness-fastembed-cache:/root/.cache/fastembed` (or wherever
    `FASTEMBED_CACHE_DIR` points) — **must** be a named volume that survives
    container recreation, or every run re-downloads the 130 MB ONNX model.
  - `/certs/prod-ca.crt` — bake it in (`COPY certs/prod-ca.crt`), it's public.
- **Env**: `DATABASE_URL` (secret, from a Docker secret or an untracked
  `.env` per the project's existing "one gitignored `.env` + Docker secrets"
  rule), `DATABASE_CA_CERT=/certs/prod-ca.crt`, `FASTEMBED_CACHE_DIR`,
  `HARNESS_INGEST_STATE_FILE` (point at a small named volume so `--health`
  survives restarts).
- **Multi-arch**: pure Python + ONNX runtime via `fastembed` — `onnxruntime`
  ships manylinux wheels for both amd64 and arm64, so a
  `docker buildx build --platform linux/amd64,linux/arm64` should work
  unmodified; worth a smoke test on first Mac-mini build since this is the
  one dependency (ONNX) most likely to have arch-specific quirks.

### `harness-hooks` (Node — batch jobs: transcript sweep + checkpoint collect)

- **Base**: `node:22-slim` (or whatever LTS matches `engines.node >=20.11`
  across `hooks/` and `mcp-server/` — pin one version for both).
- **Build**: `COPY hooks/ ./hooks` (no npm deps beyond dev/test tooling —
  `hooks/README.md` says both suites run "no dependencies"; confirm
  `hooks/package.json` has no runtime deps before skipping `npm ci`).
- **Entrypoint**: same pattern as ingest — invoked with different args:
  - `node hooks/sweep-transcripts.mjs --vault /vault --min-idle-hours 6`
  - `node hooks/collect-checkpoints.mjs --vault /vault --repo /repos/agentic-harness --repo /repos/bb2dash --ingest`
    (needs those two repos checked out somewhere the container can `git
    fetch` from — either bind-mounted host checkouts, or the container clones
    its own shallow copies on a schedule; bind-mount is simpler on this
    laptop, matches the "clone once" portability goal less well for a
    headless server — worth deciding per-mode like the vault itself).
- **Volumes**: `/vault` (same mount as `harness-ingest`, read-write), the two
  tracked source repos (read-only is enough — collector only fetches/reads).
- **Env**: `HARNESS_VAULT=/vault`, `HARNESS_CHECKPOINT_LOG`,
  `HARNESS_TRANSCRIPT_SWEEP_LOG` (or redirect container stdout/stderr to the
  scheduler's own log aggregation instead of files — simpler in a container
  context than the Windows rotate-at-1MB file convention).
- This image needs `git` installed (`apt-get install -y git`) since
  `collect-checkpoints.mjs` shells out to it via `hooks/lib/spawn.mjs`.

### `vault-sync` (optional, per the per-writer-commits recommendation)

Only needed if Stack later wants a single centralized committer instead of
each writer committing its own work (see Part B). If added: a thin
shell/Node script — `git -C /vault pull --rebase --autostash && git -C /vault
add -A && git -C /vault commit -m "chore(vault): sync" --allow-empty=false &&
git -C /vault push` — run by the scheduler on its own short interval,
**after** the write jobs (`harness-hooks`, `harness-ingest`'s
`sweep-concluded`) have run against the same mounted `/vault`, with the
gitleaks pre-commit hook installed in this image too. R6's recommendation
(Part B) is to **not** build this initially — start with per-writer commits,
promote to this only if conflicts show up in practice.

### `harness-rag-mcp` — the `rag` MCP server for the dev container

As established in Part A, this is not a good fit for "long-running network
service" — it's a stdio child process the Claude Code CLI spawns directly.
**Recommendation: bundle the built `mcp-server/dist/` inside the dev
container image itself** (the same image that runs Claude Code for PM/worker
sessions), and register it there with `claude mcp add-json rag <json> -s user`
pointing at the in-image `node` and `dist/index.js` paths — functionally
identical to today's host setup, just inside the container. Needs the same
`harness-fastembed-cache` named volume (a **second** cache directory,
separate from the Python side's — `mcp-server/.fastembed-cache` today — since
the two `fastembed` packages are different implementations even though they
converge on the same weights) mounted into the dev container, and
`DATABASE_URL`/`DATABASE_CA_CERT` env set in the dev container's own env
block (not the MCP registration's `env`, or either — the code reads from
whatever env the process sees, per `mcp-server/src/config.ts`).

If strict isolation is wanted instead (server truly in its own container,
dev container never runs Node/fastembed itself): register the MCP command as
`docker compose run --rm -i rag-mcp node dist/index.js` — Docker proxies
stdio fine with `-i` (no `-t`), and the stdout-is-JSON-RPC constraint just
needs Docker itself to add nothing to stdout, which `-i` alone satisfies.
R6's default recommendation is the bundled-in-the-dev-container approach
(simpler, no cross-container stdio proxying to debug) unless another
researcher's dev-container design has a strong reason to keep it external.

### Cross-platform replacement for the two `.ps1` jobs

Both `.ps1` scripts are pure orchestration over already-cross-platform
`.mjs`/Python calls; nothing about their *logic* is Windows-only. Replace
them with **one script, in whatever language the scheduler container's image
already needs** (a small POSIX shell script or a Node script both work; Node
keeps the "one runtime, less to install" property since `harness-hooks`
already needs Node) that runs the exact same ordered steps
`nightly-ingest.ps1` already documents:

```
0.  node hooks/sweep-transcripts.mjs   --vault $VAULT --min-idle-hours 6
0b. node hooks/collect-checkpoints.mjs --vault $VAULT --ingest
1.  uv run ingest sweep-concluded      --path  $VAULT --apply
2.  uv run ingest --source obsidian    --path  $VAULT
```

run from the scheduler container on the same 03:00 cadence (full run) plus a
lighter 12:00/18:00 cadence that's just steps 0b (checkpoint collect with
`--ingest`, matching `register-checkpoint-collect.ps1` today). The scheduler
container itself (owned by whichever researcher is designing "a scheduler
container replaces the two Windows Task Scheduler jobs" — Phase 14 context
item 9) just needs cron (or a tiny Node/`node-cron` loop, given the theme of
avoiding a second language) invoking `docker compose run --rm harness-ingest
...` / `docker compose run --rm harness-hooks ...` on that schedule — same
step order, same "sweep failures don't abort the ingest, only the final
ingest's exit code is reported" logic, ported as a one-page script instead of
PowerShell's `Write-Log`/`Invoke-Ingest` helper functions. No behavior change
intended; this is a language port, not a redesign.

---

## Summary of what changes vs. what doesn't

**Doesn't change**: `ingest/` code (already fully env/arg-driven, no OneDrive
default anywhere in `.py`), `mcp-server/` code (already fully env-driven),
`hooks/*.mjs` code (vault path already centralized behind `HARNESS_VAULT`,
Windows-only branches already gated on `process.platform`), the frozen
session-note frontmatter schema, the redaction rules, the R-27 collection
logic.

**Does change**: the vault's storage medium (OneDrive folder → git working
copy, workstation bind-mount or server-mode clone), how the three `.ps1`
scripts' logic is invoked (container/scheduler instead of Task Scheduler),
where `mcp-server`'s stdio process and `ingest`'s Python process physically
run (inside container images instead of directly on the host), and — new,
not a replacement of anything — a gitleaks pre-commit gate on the vault repo
and (flagged as a related gap, not this repo's to fix) ideally on the
`skills/checkpoint/` commit path in the source repos too.

# Phase 20 — Harness closure: V-2 on record, note quality, checkpoint redaction, vault writers

Date 2026-09-24 · PM: the Fable session · Product manager: Stack · Requirements: R-97, R-98, R-99,
R-100 (the home-pc half), R-101, R-102, R-103, R-104, R-106 · PM-added steps: P-52, P-53, P-54, P-55,
P-56, P-57, P-58, P-61, P-110, P-111, P-112, P-113 · Branch: agentic-harness `feat/v2-closure` (+
bb2dash `docs/harness-closure-20` for the docs, and `fix/inbox-apply-vault-20` for R-97) · Worktrees
`C:/Users/stack/agentic-harness-wt-v2-closure`, `bb2dash-wt-harness-closure-20`,
`bb2dash-wt-inbox-vault-20` · Migration range: **none in bb2dash** (a harness-memory migration, if one
proves necessary, lives in the harness repo and is applied under the file's name, byte-identical; none
is planned) · **Three PRs, an exception to one PR per phase** (DECISIONS 2026-09-09): PR-A (bb2dash,
R-97, opened on day 1 because the bug is live), PR-B (agentic-harness), PR-C (bb2dash docs and
re-installed skills); the exception needs its own DECISIONS row at the freeze, proposed on the same
shape as Phase 14's one PR per repo (B-51, itself a **PROVISIONAL** default); the three PRs are a PM
default, **PROVISIONAL** until Stack approves the phase plan · Size M · Depends on: nothing to start;
its live steps wait until three consecutive nightly runs each log `committed -> pulled -> pushed` (or
up-to-date) for both realms, the harness live-lane prerequisite; none had by 2026-09-27 · Status: **PROVISIONAL
until Stack answers 93 §5 (B-52, B-53, B-54, B-55, B-56)** and approves `94_SPRINT2_PHASES.md`.

**Answered by delegation 2026-09-27.** Stack delegated the 93 §5 answers and the plan approval to the PM; the DECISIONS rows of 2026-09-27 hold them. Of this brief's B-numbers (B-51, B-52, B-53, B-54, B-55, B-56), every one resolved to its default. The phase's PM strikes PROVISIONAL where a row says default and rewrites the B-table row where it says changed, at the session's start (ORCHESTRATOR §6).

## Why

V-2 (R-27) was built in `~/agentic-harness` on 2026-09-16 and recorded as built on 2026-09-24; bb2dash
carries only the acceptance walk of `66_SESSION_ARCHIVAL_RAG.md` and the doc closure (R-99). Nobody
has walked it: there is no verification note, the live resume chain has never run, the GIN `EXPLAIN`
was last taken on 2026-09-16 (before harness PR #7 re-created `rag.search` twice), DoD 1's check fails
as written (360 files against 188 session ids, because workers share the parent's id) and DoD 2's SQL
counts nulls but not `''`. The data the acceptance query needs is not there either: 5 of 373 bb2dash
notes carry a `phase`, two of them wrong, and `repo` is `''` on 156 (R-101, counted 2026-09-24); the
5-tag cap holds per render only and six subagent notes carry six (R-102); 228 of 363 bb2dash notes and
114 of 199 harness notes are `unclassified`, with no cadence that shows them to the PM and a list tool
that falls back to the empty OneDrive folder (R-103).

Two holes are live. **R-97:** `/inbox-apply` still writes its decision notes to
`C:/Users/stack/vault/projects/bb2dash/decisions/`, a stub since the
realm cutover of 2026-09-23. `v_inbox_queue` holds four answered rows (541–544, re-checked
2026-09-24 and again on 2026-09-27: all four in the view, `archived_at` null) and `bb-sync` step 0 runs `/inbox-apply` first, so the next sync writes outside every
realm; it is fixed first, in its own PR on day 1, and until PR-A merges the PM asks Stack to hold
Apply answers and `/bb-sync` (a run before it writes into the stub; the PM then copies those notes into
the realm, never deleting from the stub). **R-98:** `/checkpoint` commits a note into a repo's
git history with no redaction (the collector redacts only after the push), and a secret in git history
needs rotation, not a later fix. bb2dash's installed copy is also behind the harness: at `a5042fa`,
`.claude/skills/checkpoint/build-note.mjs` hashes `b2de9598…` against harness `main`'s `097ca139…`
(it lacks the `up`, `related` and `machine` fields; `install-checkpoint.mjs --dry-run` reports
`update` for both files, 2026-09-24).

Why now: the vault's move into git realms (harness PRs #8–#15) superseded Phase 14's C-4, so the realm
writers (R-100) and the harness docs (R-104) are closed here on home-pc before Phase 14 puts the same
code in a container; the per-machine redaction layer (R-106) is built on home-pc before the VM exists.
R-105 (the VM, harness Phase E) and R-107 (smoke test and deletion, Phase F) stay harness-owned and
unscheduled; this phase only saves the eval baseline R-107's smoke test compares against (P-61). The
harness's own memory sprint (`docs/memory-sprint-requirements.md` and `…-orchestration.md`, proposed
2026-09-24) edits some of the same files and owns the same live lane; every overlap is named under
§Seams.

## Stack's calls this brief rests on

All five are **PROVISIONAL**: the defaults of 93 §5, taken under DECISIONS 2026-09-23 until he answers.

| B | Question (93 §5) | Default taken | Tasks that change if he answers otherwise |
|---|---|---|---|
| B-52 | V-2's four research defaults (Q43): ≤ 5 hook-applied tags per note (hand tags uncapped); class sessions carry the same fields, filed under `classes/<course slug>`; a multi-repo session stays one note listing `repos_touched`; a resume after the 24 h sweep starts a new note | Adopt all four in one DECISIONS row (93 §5 item 52). *PM sub-default under B-52:* the cap holds **per note** through the `hook_tags` provenance field (H-3) | 7, 14, 18, 19: a "per render" answer drops `hook_tags`, P-55 and P-56, and a DECISIONS row restates 66 DoD 5 per render. Any other answer to the other three is a new harness requirement, not a task here |
| B-53 | The Phase 7 acceptance query (Q44) | Re-run it on the first sprint-2 phase after the phase spelling and R-101 ship (93 §5 item 53). *PM sub-defaults under B-53:* that phase is the first bb2dash phase whose PM session starts after the reinstalled hook (task 17), and Phase 7 keeps what the back-fill can derive | 18, 26, 27: "keep Phase 7" would need `phase-7` on PM note `ac1f5264`, which ran from Phase 7 into Phase 10 planning, against H-1's one-phase rule; the PM brings a spelling amendment first |
| B-54 | `machine: home-pc` on older notes (Q45) | Fill it only where the note's transcript is on this PC ("derived from the transcript's location", 91 Q45's default); the 2 cloud notes stay `''` | 14, 18: "leave empty" removes the `machine` fill and the DECISIONS row restates the contract as "every field present from 2026-09-22 on" |
| B-55 | The gitleaks gate brief 82 asked for (Q46) | Drop the recurring gate; run one `gitleaks` scan over each realm's history before Phase 14 | 20: keeping the gate adds a pre-commit scan to `sync-realms.mjs` (a new harness task, and gitleaks becomes a harness dependency) |
| B-56 | `/checkpoint`'s hand-written no-node fallback | Remove it: the skill requires `node` and stops without it | 13: keeping it means a DECISIONS row accepting the residual risk (a hand-written note is committed unredacted); 12's tests do not change |

Where a default here goes beyond 93 §5's wording, the extra is marked *PM sub-default under B-n*: it is
the PM's call, **PROVISIONAL** with that B-number, and Stack can veto it on its own without changing
93 §5's default.

93 §1.9's R-98 row cites "(B-58)" for the no-node fallback; the question is item **56** of §5 (item 58
is the C-7 toast wording). This brief uses B-56.

Three other §5 items touch this phase only at its seams; none is adopted here:

* **B-44** (Phase 14: the container sync skips `/inbox-apply`) and **B-51** (Phase 14: one PR per
  repo) are cited as Phase 14's defaults and are **PROVISIONAL** like every §5 default.
* **B-59** (`/inbox-apply` writing `assignment_progress`) stays open and is not touched: H-9 changes
  only where `/inbox-apply` files its notes and how it calls ingest, never what it writes to the
  database (Stage D owns the row, as brief 96 records).

## Contract (frozen when Stack approves the phase plan)

### Routes and screens

None. No bb2dash route, component, view or style changes: PR-A and PR-C change skill markdown, the
installed `/checkpoint` payload and docs only (check: `git diff --stat main...<branch> -- web
mcp-server desktop db ingest` prints nothing for both). What Stack sees is terminal output
(`/inbox-apply`'s resolved-vault line, `/bb2dash-pm`'s untagged-review line) and Obsidian notes. No
Vercel walk; no screenshots.

### RPC signatures

No RPC is added or changed in bb2dash or in harness-memory. Read unchanged by this phase's checks:
bb2dash `v_inbox_queue`; `archive_attention_item(p_id bigint, p_decision jsonb, p_by text default 'inbox-apply')`
(security invoker); `apply_resolutions()` (security definer); harness-memory `rag.search(query_embedding
extensions.vector(384), query_text text, match_count int, filter_source text, filter_collection text,
rrf_k int, max_per_document int, min_similarity double precision, filter_metadata jsonb,
include_superseded boolean)` through the `rag` MCP `search_context` tool.

**Harness interfaces this Contract freezes** (they stand in for RPCs; workers build to them):

* **H-1 Phase spelling (P-52).** A phase tag is `phase-<n>` or `phase-<n><l>`: `n` 1–99, `l` one
  lowercase letter (`phase-10a`, `phase-12b`). A planning path is one under `docs/planning/` (the anchor
  `PHASE_IN_PLANNING_PATH` in `tags.mjs` carries today, kept). `vocabulary.mjs` `PHASE_TAG_PATTERN` becomes
  `/^phase-([1-9][0-9]?)([a-z]?)$/`; `phaseTag(number, letter = '')`; `docs/tags.md`'s phase section
  changes in the same commit (`vocabulary.test.mjs` keeps them equal). `derivePhase({ branch,
  docsTouched, prTitles, repo })` keeps its source order (branch → PR titles, back-fill only →
  planning paths). Within one source, every distinct phase is collected: **one** → that phase;
  **two or more** → `''` and no later source is read (a session spanning phases carries no phase);
  **none** → the next source. Rules for every repo: `phase[-_ ]?(\d{1,2}[a-z]?)(?![a-z0-9])`,
  case-insensitive and lowercased, in the branch, PR title or planning path (letters now allowed).
  For bb2dash notes the PR-title source is not read: 91 R-101 found that the titles of #7, #18 and
  #25 give wrong phases, and the alias table below covers the slug branches that needed a PR. Rules
  only when `repo` is `emstacho-su/bb2dash`:
  (i) a hyphen-delimited segment of the branch's name after its `feat/`, `fix/`, `chore/` or `docs/`
  prefix that is exactly 1–2 digits plus an optional lowercase letter (`grades-v1-16` → `16`; `v1` is
  not a segment of digits); (ii) the alias table `hooks/lib/phase-aliases.mjs` (new), three rows, each citing
  its PR: `retrieval-polish` → `phase-7` (#6), `course-dimension` → `phase-8` (#8), `sync-loop` →
  `phase-9` (#10), matched as a prefix of the name so worker branches `<alias>-<stream>` inherit.
  `tags.mjs` imports `phase-aliases.mjs` at runtime, so `hooks/install.mjs` `PAYLOAD` gains
  `lib/phase-aliases.mjs` (`install.test.mjs` fails when the payload and the hook's import graph
  differ; the PM adds the entry at integration, task 16).
  Worker branches are `<phase branch>-<stream word>`; the stream is never a bare number. A subagent
  note whose own phase is `''` takes its parent's phase at capture when the parent transcript's branch
  yields one (`subagent.mjs`); the back-fill applies the same rule from the parent note. In the same
  way, a subagent note whose own `cwd` yields no `repo` takes the one `resolveRepo` gives for the
  parent transcript's `cwd` at capture (`subagent.mjs`), and the back-fill takes it from the parent
  note (H-8).
* **H-2 P-53 fixtures (expected values, frozen).** `hooks/tests/phase-aliases.test.mjs` (new) and
  `hooks/tests/tags.test.mjs` hold these rows (bb2dash repo unless named); they fail before H-1 is
  built.

| Branch (docs touched) | Expected `phase` | Source |
|---|---|---|
| `feat/retrieval-polish`, `feat/retrieval-polish-db` | `phase-7` | alias, PR #6; worker shape of DECISIONS 2026-09-10 |
| `feat/course-dimension` / `feat/sync-loop` | `phase-8` / `phase-9` | alias, PRs #8 / #10 |
| `feat/grades-10a` / `feat/grades-10b` | `phase-10a` / `phase-10b` | segment, PRs #13 / #15 |
| `feat/planner-11` / `feat/planner-events-11b` | `phase-11` / `phase-11b` | segment, PRs #12 / #14 |
| `feat/electron-12` | `phase-12` | segment, PR #19 |
| `fix/page-pass-12b`, `fix/page-pass-12b-tail`, `fix/page-pass-12b-db` | `phase-12b` | segment, PRs #20 / #22; worker branch of 80c §Workers |
| `docs/phase6-signoff` / `docs/phase12b-merged` | `phase-6` / `phase-12b` | phase rule, PRs #7 / #21 |
| `docs/phase12b-14-briefs` | `''` | two phases (12b, 14), PR #18 |
| `feat/retrieval-mcp` / `docs/mvp-dod` / `feat/inbox-apply` | `''` | no token, PRs #5 / #11 / #23 (#5 is the `0e3b3d00` session tagged `phase-7` today) |
| `chore/sprint1-closeout` with PR title "chore: sprint 1 close-out — planning docs by sprint, Phase 13 skipped, sprint 2 intake" | `''` | no token; PR titles are not read for bb2dash (#25) |
| `feat/db-hygiene-15` / `feat/grades-v1-16` / `feat/web-polish-17` / `feat/ingest-corpus-18` / `feat/content-history-19` / `feat/containers-14` | `phase-15` / `phase-16` / `phase-17` / `phase-18` / `phase-19` / `phase-14` | segment; the branch each phase brief's header names (95–99, 100) |
| `docs/harness-closure-20` / `fix/inbox-apply-vault-20` | `phase-20` | segment, this brief |
| `docs/sprint2-planning`, `main` | `''` | no token |
| `main` (docs: `docs/planning/sprint-1-hub/briefs/80c_PHASE12B_page_pass.md`) | `phase-12b` | planning path |
| `main` (docs: `docs/planning/sprint-1-hub/briefs/80c_PHASE12B_page_pass.md` and `docs/planning/sprint-2/82_PHASE14_containers.md`) | `''` | two phases |
| agentic-harness `feat/containers` / `feat/v2-closure` | `''` | bb2dash rules are repo-scoped |

* **H-3 `hook_tags` (R-102; the per-note cap is PROVISIONAL, a PM sub-default under B-52).** `frontmatter.mjs` `FIELD_SPEC`
  appends `['hook_tags', LIST]` after `machine` (add-only; if harness unit P's `retrievals` /
  `retrieved` merge first, after those); the copy in `skills/checkpoint/build-note.mjs` carries the
  same entry (pinned by `checkpoint-build.test.mjs`); `GENERATOR_VERSION` takes a minor bump.
  `note.mjs` `buildFields` writes `hook_tags` = the classifier's output for that render (≤
  `MAX_HOOK_TAGS`). `mergeFields`: `hook_tags` = the new render's set when it has one, else the old;
  `tags` = (old `tags` − old `hook_tags`) ∪ new `hook_tags`, then the existing `unclassified` rule
  (worker notes are re-merged at every `SubagentStop`, so this is where the old union grew). Hand tags
  (in `tags`, not in `hook_tags`) are never removed or capped. A note without `hook_tags` treats every
  tag as hand, so no hand tag can be lost. `/checkpoint` notes write `hook_tags: []`.
* **H-4 `hooks/resolve-config.mjs` (new; P-110).** `node hooks/resolve-config.mjs [--json]
  [--require-realm <name>]` prints `{ machineFile, machine, vault, ingestProject, realms, realmCheck }`
  from `resolveHarnessConfig({ env, home, report })`, a new export of `machine-env.mjs` built on
  `loadMachineEnv` (shell wins, then `$HARNESS_MACHINE_ENV` or `~/.harness/machine.env`). Exit 0 when
  the vault exists and, with `--require-realm`, `<vault>/<name>/.realm` reads `<name>`; exit 2
  otherwise, with the path it resolved in the message. No OneDrive fallback; no other key printed.
* **H-5 `hooks/untagged-sessions.mjs` (R-103, P-111).** Flags `[--vault <p>] [--json] [--since
  <date>] [--include-sdk] [--due] [--threshold <n>] [--mark-reviewed] [--state <file>]`. The vault
  comes from `resolveHarnessConfig`; `DEFAULT_VAULT_SEGMENTS` is no longer imported. Notes whose
  `origin` starts with `sdk-` are left out unless `--include-sdk`. State file default
  `~/.harness/state/untagged-review.json` = `{ "reviewed_at": "<ISO>" }` (the `state/` folder does not
  exist on home-pc today; `--mark-reviewed` creates it); `--since` defaults to it;
  `--mark-reviewed` writes it; `--due` exits **3** when it is missing, 7 or more days old, or when the
  count since it is ≥ the threshold (`UNTAGGED_EARLY_TRIGGER = 25`, new, exported from the same file, so
  `constants.mjs` stays W-60's), else 0.
* **H-6 Extra redaction rules (R-106, P-112).** `HARNESS_REDACT_EXTRA` (shell or machine file) names a
  JSON file `{ "rules": [{ "name": "<id>", "pattern": "<regex>", "flags": "i", "to": "[REDACTED:<id>]"
  }] }`. `hooks/lib/redact-extra.mjs` (new) `loadExtraRules(env, report)` validates and compiles it
  (flags limited to `imsu`, `g` always added); a missing file, malformed JSON or a bad pattern is
  reported once and skipped, never thrown. `redact.mjs` gains `installExtraRules(rules)`;
  `redact(text)` keeps its signature and applies the installed rules after `SECRET_RULES`.
  `redact.mjs` keeps **zero imports** (it has none today and ships as a `/checkpoint` payload file,
  H-7); the loading and validation live in `redact-extra.mjs`. Entry points that install them:
  `session-capture.mjs`, `sweep-transcripts.mjs`, `collect-checkpoints.mjs`, `backfill-fields.mjs`.
  `session-capture.mjs` imports `redact-extra.mjs`, so `hooks/install.mjs` `PAYLOAD` gains
  `lib/redact-extra.mjs` (task 16, with H-1's entry). `/checkpoint` never loads extras (a cloud
  session has no machine file); the VM's own rules file is R-105's.
* **H-7 `/checkpoint` payload (R-98, P-57, P-113; the fallback's removal is PROVISIONAL, B-56).**
  `install-checkpoint.mjs` `PAYLOAD = ['SKILL.md', 'build-note.mjs', 'redact.mjs']`;
  `skills/checkpoint/redact.mjs` (new) is a byte copy of `hooks/lib/redact.mjs`. `build-note.mjs`
  passes the body and every git-derived string through `redact()` before writing; its JSON line gains
  `redactions: <n>`. `SKILL.md` loses the "If `node` is not available" section (today lines 51–103:
  the hand-built note template, whose `generator` line reads `checkpoint 1.0.0 (hand-built)`) and
  carries this sentence in its place, verbatim: "This skill requires `node`; without it, stop and
  report that no checkpoint was written."
* **H-8 `hooks/backfill-fields.mjs` (new; P-54, P-56; the `machine` fill is PROVISIONAL, B-54;
  the over-cap repair is PROVISIONAL, B-52, since it rests on the per-note cap, a PM sub-default under
  B-52).**
  `node hooks/backfill-fields.mjs --vault <dir> --backup <dir> [--dry-run] [--report] [--json] [--repo
  bb2dash=<path>] [--no-network] [--relocate <session-prefix>=<realm>/<collection>]`. Scope: every
  session note filed under `projects/bb2dash/sessions/`, and every session note filed elsewhere whose
  `repo` is `emstacho-su/bb2dash` or whose `cwd` is `C:/Users/stack/projects/bb2dash`, a path below
  it, or a path starting `C:/Users/stack/projects/bb2dash-wt-` (the worktrees); it never moves a note
  except through `--relocate` (re-filing is R-H3's). It fills, where derivable and never guessed:
  `phase` (H-1, clearing wrong values), `repo` (a `bb2dash-wt-*` cwd resolves to the main checkout's
  origin; a workflow-subagent note, whose `cwd` is under
  `C:/Users/stack/.claude/projects/C--Users-stack-projects-bb2dash*/`, takes the `repo` of the parent
  note named in its `parent_session` (while that note is not yet written, the `repo` that
  `resolveRepo` gives for the parent transcript's `cwd`, as `subagent.mjs` `parentPlacement` reads
  it); a note whose `cwd` is the pre-move OneDrive checkout
  `C:/Users/stack/OneDrive - Syracuse University/.fall2026/.projects2026/bb2dash` gets
  `emstacho-su/bb2dash`), `commits` and `prs` (the main checkout's history and `gh`, as `hooks/lib/backfill.mjs`
  does), `captured_by` and `origin` (from the transcript), `files_modified` (made repo-relative),
  `machine` (B-54), `hook_tags` (the classifier replayed where the transcript exists, else `[]`); on
  notes with more than five vocabulary tags it drops those outside the replayed `hook_tags` (P-56).
  The body's Session facts rows (Repo, Phase, Tags) are re-rendered with the frontmatter. `--dry-run`
  prints one line per change, `<session_id> <field>: <from> -> <to> (<source>)`, and writes nothing;
  `--backup` copies every original first; a second run makes no change; every derived string goes
  through `redact()`; it never runs `ingest`. `--report --json` prints `{ bb2dash_notes,
  top_level_notes, distinct_top_level_session_ids, phase_set, phase_underivable,
  phase_underivable_indexed, branch_empty, phase_body_mismatch, repo_empty, repo_empty_underivable,
  absolute_files_modified, machine_empty, machine_empty_underivable, hook_tags_over_cap,
  unknown_hook_tags, changes }`. Worker notes share the parent's `session_id` (file
  `<parent id>--<agent id>.md`), so "top-level" means a file named `<session_id>.md`.
  `phase_underivable_indexed` counts the `phase_underivable` notes filed under
  `projects/bb2dash/sessions/` that the ingest loads (not `origin: sdk-*`, not `ingest: false`, per
  `ingest/src/ingest/loaders/obsidian.py`), the set task 19's SQL reads (`collection = 'bb2dash'`).
  `branch_empty` counts the notes in that same indexed set whose `branch` is `''` (H-8 does not fill
  `branch`). The two class
  notes, `projects/bb2dash/sessions/ca25962a-1466-….md` and
  `projects/estac/sessions/22581e0d-35e4-….md`, move with `--relocate <prefix>=classes/ist466`: the
  note is written to `classes/ist466/sessions/` with `collection: 'ist466'` and `collection_source:
  'folder'` (what the class notes already filed there carry), and the original is **moved** into the
  `--backup` folder under `C:/Users/stack/.claude-archive/<date>/`, never deleted (the harness
  standing rule: never `rm` in the vault); the next `sync-realms.mjs --push` commits both realms'
  changes. A target that already exists is refused.
* **H-9 `/inbox-apply` Step 0 (R-97).** A new first step that runs in every mode, `--dry-run`
  included: resolve the vault and the ingest project (PR-A: read `$HARNESS_MACHINE_ENV` or
  `~/.harness/machine.env`, the shell winning; PR-C: `node
  C:/Users/stack/agentic-harness/hooks/resolve-config.mjs --json --require-realm projects`), print
  `vault=<…> ingest=<…> realm=projects ok`, and stop before any claim or write unless
  `<vault>/projects/.realm` reads `projects`. Notes go to
  `<vault>/projects/bb2dash/decisions/inbox-<id>.md`; ingest runs from `HARNESS_INGEST_PROJECT` with
  `uv run ingest --source obsidian --path "<vault>" --only projects/bb2dash/decisions/<file>.md`; the
  repo log is `docs/inbox-decisions/YYYY-MM-DD.md` in the bb2dash checkout. Every resolved path is
  quoted in commands. Lines 31–34 change together. The installed copy
  `C:/Users/stack/.claude/skills/inbox-apply/SKILL.md` is what runs, so it is a live file: no worker
  writes it; the PM writes the merged blob over it
  (`git show origin/main:skills/inbox-apply/SKILL.md > C:/Users/stack/.claude/skills/inbox-apply/SKILL.md`;
  a `cp` from the checkout would carry CRLF endings, since `core.autocrlf` is `true`) only after PR-A
  merges (task 2) and again after PR-C merges (task 29), and `cmp` against the blob then returns 0.
  Until PR-A merges, Stack holds Apply answers and `/bb-sync` (§Why).
* **H-10 Writers and the realm lock (R-100).** `sweep-transcripts.mjs` takes the realm lock per realm
  (`acquireRealmLock`) and, when it is held, leaves that realm's notes for the next run, as the
  collector does. The hook never waits for the lock (it must not block session exit):
  `notes-io.mjs` writes each note to a temporary file in the same folder and renames it into place,
  so a concurrent stage sees the old note or the new one, never half of one.
* **H-11 `/bb2dash-pm` cadence line (R-103).** Step 2 of `.claude/skills/bb2dash-pm/SKILL.md` runs
  `node C:/Users/stack/agentic-harness/hooks/untagged-sessions.mjs --due`; on exit 3 the PM lists the
  notes (`--json`), tags each or leaves it on purpose, then runs `--mark-reviewed`, before other work.

### Tables and migrations

| # | File | Creates / changes |
|---|---|---|
| — | none | No bb2dash migration and no harness-memory schema object: `hook_tags`, `phase` and `repo` live in `rag.documents.metadata`, which holds each note's frontmatter verbatim (`ingest/src/ingest/loaders/obsidian.py`). If one proves necessary it is a new 14-digit timestamped file under `C:/Users/stack/agentic-harness/db/migrations/`, applied through `uv run ingest db migrate` under the file's name (a `--dry-run` first, the live apply a live-lane step: harness SC-5), never by editing an applied file |

### Files

Harness paths are relative to `C:/Users/stack/agentic-harness` (the worker's worktree); bb2dash paths
to `C:/Users/stack/projects/bb2dash`. Worker owners are disjoint; the PM resolves the two sequenced
shares at integration (task 16): the goldens (W-60 regenerates them for H-3; the PM regenerates once
more after merging all four streams) and `hooks/install.mjs` `PAYLOAD` (two entries, one from W-59's
new module and one from W-61's, added by the PM so no worker edits it). The checkpoint `redact.mjs`
copy is W-60's file made from W-61's after task 10.

| Path | New / changed | Owner | What |
|---|---|---|---|
| `hooks/lib/tags.mjs`, `hooks/lib/vocabulary.mjs`, `hooks/lib/analyse.mjs` (passes `repo` to `classify`) | changed | W-59 | H-1 |
| `hooks/lib/phase-aliases.mjs` | new | W-59 | H-1 alias table |
| `hooks/lib/subagent.mjs` | changed | W-59 | parent-phase and parent-repo inheritance |
| `hooks/backfill-fields.mjs`, `hooks/lib/backfill-fields.mjs` | new | W-59 | H-8 |
| `docs/tags.md` | changed | W-59 | phase section (H-1); line 126's invocation drops the OneDrive path |
| `hooks/tests/tags.test.mjs`, `vocabulary.test.mjs`, `subagent.test.mjs` | changed | W-59 | H-2 rows, inheritance cases |
| `hooks/tests/phase-aliases.test.mjs`, `hooks/tests/backfill-fields.test.mjs` | new | W-59 | H-2, H-8 on a fixture vault |
| `hooks/lib/merge.mjs`, `hooks/lib/frontmatter.mjs`, `hooks/lib/note.mjs` (`buildFields` only), `hooks/lib/constants.mjs` (`GENERATOR_VERSION` only) | changed | W-60 | H-3 |
| `skills/checkpoint/SKILL.md`, `skills/checkpoint/build-note.mjs`, `hooks/install-checkpoint.mjs` | changed | W-60 | H-3 copy, H-7 |
| `skills/checkpoint/redact.mjs` | new | W-60 | H-7 byte copy (made after task 10) |
| `hooks/tests/merge.test.mjs`, `frontmatter.test.mjs` (its literal `FIELD_ORDER` list, line 202, gains `hook_tags`), `checkpoint-build.test.mjs`, `install-checkpoint.test.mjs`, `golden.test.mjs`, `hooks/tests/fixtures/golden/` (regenerated by `node hooks/tests/update-goldens.mjs`, never hand-edited) | changed | W-60 | H-3, H-7; the PM regenerates goldens once more at task 16, W-59 never does |
| `hooks/tests/hook-tags.test.mjs`, `hooks/tests/checkpoint-redact.test.mjs` | new | W-60 | P-55; P-57 byte pin + P-113 same-fixture behaviour |
| `hooks/lib/machine-env.mjs`, `hooks/untagged-sessions.mjs` | changed | W-61 | H-4 helper, H-5 |
| `hooks/resolve-config.mjs`, `hooks/lib/redact-extra.mjs` | new | W-61 | H-4, H-6 |
| `hooks/lib/redact.mjs`, `hooks/session-capture.mjs`, `hooks/sweep-transcripts.mjs`, `hooks/lib/sweep.mjs` (`runSweep`, where the per-realm write happens), `hooks/collect-checkpoints.mjs`, `hooks/lib/notes-io.mjs` (`persist`) | changed | W-61 | H-6 install points, H-10 |
| `hooks/tests/machine-env.test.mjs`, `untagged.test.mjs`, `redaction.test.mjs`, `budget.test.mjs`, `sweep.test.mjs`, `hook-process.test.mjs`, `ensure-index.test.mjs` | changed | W-61 | H-4..H-6; budget with extras (P-112); sweep, hook-process and ensure-index only where H-10 changes a case |
| `hooks/install.mjs` (`PAYLOAD` only: `lib/phase-aliases.mjs`, `lib/redact-extra.mjs`) | changed | PM | task 16; `hooks/tests/install.test.mjs` unchanged and green |
| `hooks/tests/resolve-config.test.mjs`, `hooks/tests/redact-extra.test.mjs`, `hooks/tests/writer-lock.test.mjs` | new | W-61 | H-4, H-6, H-10 |
| `README.md`, `CONTEXT.md`, `docs/ingestion.md`, `db/README.md`, `hooks/README.md`, `docs/vault-migration-requirements.md` | changed | W-62 | R-104; R-100's R-B1 wording and record |
| `hooks/tests/readme-fields.test.mjs` | new | W-62 | `hooks/README.md`'s field table equals `FIELD_ORDER` |
| `ingest/eval/baseline-pre-phase20.json` | new | PM | P-61 (`uv run ingest eval --json` output, task 3); ships in PR-B. The post baseline (task 19) is taken after PR-B merges, is written to `<B>/baseline-post-phase20.json` and pasted into `101a` (PR-C); it is never committed to the harness |
| bb2dash `skills/inbox-apply/SKILL.md` (PR-A, then PR-C) | changed | W-62 | H-9 |
| bb2dash `.claude/skills/checkpoint/SKILL.md`, `build-note.mjs`; `.claude/skills/checkpoint/redact.mjs` (new) | changed / new | W-62 | written only by `install-checkpoint.mjs --repo` (PR-C) |
| bb2dash `.claude/skills/bb2dash-pm/SKILL.md` | changed | W-62 | H-11 |
| `C:/Users/stack/.claude/skills/inbox-apply/SKILL.md` (installed copy, outside both repos; a live file) | changed | PM | the merged blob written over it (H-9), only after PR-A merges (task 2) and after PR-C merges (task 29) |
| bb2dash `docs/planning/sprint-2/verification/101a_V2_VERIFICATION.md` (folder new) | new | PM | P-58: the walk (§DoD table) |
| bb2dash `project-state/STATUS.md`, `DECISIONS.md`, `ORCHESTRATOR.md`, `docs/planning/sprint-2/90_SPRINT2_INTAKE.md`, `docs/planning/sprint-1-hub/briefs/66_SESSION_ARCHIVAL_RAG.md` (a dated amendment line only) | changed | PM | PR-C |

### Seams

| With | Seam |
|---|---|
| Phase 14 (`briefs/100_PHASE14_containers.md`) | R-100's container-writer line, the `machine.env` template (P-59) and `vault_realm_pat` (brief 100's frozen name for the realm-push secret; there is no `vault_deploy_key`) are Phase 14's; this phase builds the sweep lock and the redaction extras once, and the harness-jobs image runs the same code. Task 20 needs `gitleaks` on PATH (absent on home-pc on 2026-09-27), which is Phase 14's P-46; task 20 runs on day 1 and at the latest before Phase 14's first realm write, so if it comes first Stack runs the same install and P-46 finds it present. Phase 14's P-49 (one source for the repo skills) later replaces the installed-copy refresh of tasks 2 and 29. The container sync skips `/inbox-apply` (B-44, **PROVISIONAL**: if Stack answers "run it", Phase 14 needs H-9's resolver in the sync image, which is `resolve-config.mjs` plus a machine file, P-59), so H-9 needs no container form now. Its harness branch `feat/containers` merges `main` after PR-B (`session-capture.mjs`, `sweep-transcripts.mjs`) |
| Phase 16 (`briefs/96_PHASE16_grades_v1.md`) | Its task 2 edits the same `skills/inbox-apply/SKILL.md`, in Step 3's heading 5 (the `bb_file:<id>#unit:<n>` form) and Step 4 (the `source_ref` citation rule); H-9 edits the Inputs lines 31–34, a new Step 0 and Step 5. Different hunks; whichever PR merges second merges `main` into its branch and resolves (never a rebase of a pushed branch). After either merges, the installed copy is refreshed from the merged file and `cmp` returns 0 (tasks 2, 29 here; brief 96's own step there) |
| Phases 15–19 | B-53's query (**PROVISIONAL**; the "after task 17" timing is a PM sub-default under B-53) runs on the first of them whose PM session starts after task 17; their branch names already match H-1 (`feat/<slug>-<NN>`, workers `<branch>-<word>`) and H-2 pins all five |
| Phase 21 | Reads rag metadata verbatim; it gains `hook_tags` and meaningful `phase` / `repo` filters |
| Harness memory sprint, unit N | `constants.mjs`, `notes-io.mjs` (`ensureIndex`), `analyse.mjs` and `note.mjs` (its shared-file table names N and P there), the subagent link code, `docs/ingestion.md`, `CONTEXT.md` |
| Harness unit P | `note.mjs`, `analyse.mjs` and `FIELD_SPEC` (SC-1 adds `retrievals`, `retrieved`); the checkpoint copy must carry every field, in merge order |
| Harness unit H-a | R-H3 re-files the ~72 misfiled bb2dash notes; H-8 never moves them (it fills their fields where they are, so the order of L3 and L20-b does not matter). `AREAS` in `constants.mjs` |
| Harness units H-b, H-a, Q-a, C | This phase touches `install.mjs` only in its `PAYLOAD` array (two added entries, task 16); the memory sprint's shared-file table gives `install.mjs` and `doctor.mjs` to H-b (SessionStart registration, `--config`) and H-a (realm row), so whoever merges second merges `main` and resolves. It does not touch `doctor.mjs` or `scripts/nightly-ingest.ps1`. The weekly curator (Phase C) may later absorb H-11's cadence |
| Harness live lane | L20-a (hook reinstall) and L20-b (back-fill + repair + relocation) join the lane after three consecutive nightly runs each log `committed -> pulled -> pushed` (or up-to-date) for both realms, the harness live-lane prerequisite (none had by 2026-09-27; Stack waived it for unit P's L4 alone, per harness `968f8ff`'s record, a waiver that does not cover L20-a/b): one live step at a time, only on Stack's "go L20-a/b", never 02:45–04:30, `uv run ingest eval` before and after. Merge rule: whoever merges second merges `main` and resolves; never rebase a pushed branch |
| Sprint-1 objects | `v_inbox_queue`, `archive_attention_item`, `apply_resolutions()`, `agent_requests` kind `inbox_feedback` and `bb-sync` step 0 are unchanged; `docs/inbox-decisions/` keeps its per-day files; brief 66 gains only a dated amendment line (R-27.3 lists `machine`) |
| Planning branch | PR-C is cut from `main` after the Stage D planning PR (carrying `8e9ba24`'s STATUS and ORCHESTRATOR edits) merges; open PR #26 (`docs/sprint2-prompt`) also edits ORCHESTRATOR and the intake: merge around it, never touch its hunks |

### Must respect

**From `project-state/DECISIONS.md`** (each quoted verbatim from its row; "…" marks an elision inside
one row):

* [2026-09-09] "Workflow SOP: dev on branches, push per completed task, **one PR per phase**, merge only on Stack's word"
* [2026-09-10] "Phase 7 workers run on their own branches (`feat/<phase>-db`, `feat/<phase>-clients`) in separate worktrees, cut from the phase branch; the PM merges them back"
* [2026-09-14] "**Definition of done for every remaining phase = SOP gates + Stack's acceptance script** walked on the Vercel preview; sign-off once per phase, at the PR" (this phase has nothing visual, so its script is walked in the terminal and the vault; §DoD says so)
* [2026-09-14] "**Every task carries an executable check** (test, SQL assertion, curl, screenshot diff) the worker runs itself, plus one demo line for the acceptance script; a task without a check is not a task"
* [2026-09-14] "V-2: hook auto-tags with manual additions allowed (hook merges frontmatter), existing notes moved and back-filled from git, a session is concluded after 24 h without a resume; DoD = the brief's acceptance list, PM-verified"
* [2026-09-15] "Parallel PM sessions never branch or commit in the shared checkout `C:/Users/stack/projects/bb2dash`; each phase branch is its **own worktree** (`bb2dash-wt-<phase>`) and the brief is edited there"
* [2026-09-16] "**Direction: after development, bb2dash migrates from this laptop into containers (R-28).**"
* [2026-09-22] "**`/inbox-apply` is the worker 077 left a queue for** (`skills/inbox-apply/SKILL.md`, request kind `inbox_feedback`) … Runs as `bb-sync` step 0 and from the Inbox's "Apply answers" button"
* [2026-09-22] "**Decisions are stored twice, on purpose:** one vault note per item under `projects/bb2dash/decisions/` with `collection: bb2dash-inbox-decisions` (its own section of the rag store, queried with `search_context({collection})`), and a per-day repo log `docs/inbox-decisions/YYYY-MM-DD.md`"
* [2026-09-22] "**Planning documents live in one folder per sprint** (`docs/planning/sprint-N-<name>/` with `briefs / research / verification / evidence / walks / parked`); file names and numbers never change, only their folder"
* [2026-09-23] "**Sprint 2 planning proceeds stage to stage without a stop**; the PM stops only where Stack's input is required (his §3 fields, the question batch, the phase-plan approval) and otherwise proceeds on stated defaults, each recorded here when adopted"
* [2026-09-23] "Fan-out subagents run on **Opus** (verifiers, reviewers, mergers, builders) or **Sonnet** (researchers); Fable is the PM session only"
* [2026-09-24] "**V-2 (R-27) is recorded as built** in `~/agentic-harness` (its PRs #1–#4, 2026-09-16); bb2dash carries only the acceptance walk of `66_SESSION_ARCHIVAL_RAG.md` and the doc closure. The vault's move out of OneDrive into git realms (harness PRs #8–#15, 2026-09-23/24: `C:/Users/stack/vault`, realms `projects` and `classes` with private remotes, machine file, commit → merge-pull → push, never rebase) **supersedes Phase 14's C-4** vault plan"

**Frozen text in other files** (not DECISIONS rows; each quoted verbatim from the file named, checked
on 2026-09-24 against bb2dash `a5042fa` and harness `main` `b7f3df8`):

* [66 §Definition of done, frozen 2026-09-14] "No note exceeds 5 hook-applied tags (manual tags uncapped). Check: array-length SQL." · "Back-fill: the moved notes carry git-derived `branch` / `commits` / `prs` where derivable; underivable fields empty, not guessed." · "Hook stays in budget on the largest fixture (< 1,200 ms; the log records ms) and never writes a credential"
* [66 §R-27.4, frozen 2026-09-14; the PM's wording of Stack's answer] "Anything it cannot classify gets `tags: [unclassified]` and lands in a weekly "untagged sessions" list the PM reviews. **Stack may append tags by hand in the note**; the hook never removes a manual tag on rewrite and ingest keeps them (Stack, 2026-09-14)."
* [harness `hooks/README.md`, frozen schema v2] "Every field is present on every note; a field that could not be derived is the **empty string or an empty list**, never absent and never guessed."
* [harness `hooks/lib/tags.mjs`, design rule above `derivePhase`] "A wrong phase is worse than no phase: the empty field is honest and a filter on it returns nothing, where a wrong one returns the wrong sessions and reads as an answer."
* [harness `docs/portable.md`, frozen contract] "**Redaction** happens at write time on every machine; a `local` realm never leaves it; the VM's machine file never carries the Supabase URL."
* [harness `docs/vault-migration-requirements.md` R-B1, R-B3, R-B4] "`sync-realms.mjs` runs, per realm: stage → commit → `git pull --no-rebase --ff --no-autostash --no-edit` → push. A merge that conflicts is `git merge --abort`ed and reported (exit 2); the local commit stays; nothing is forced." · "`sync-realms.mjs` takes a lock file (`.git/harness-sync.lock` with the PID and a timestamp; stale after 30 min) and exits 2 if it is held" · "fails closed (exit 2, logged) when a push needs a credential it cannot get."
* [harness `docs/vault-migration-requirements.md` R-E3] "`HARNESS_REDACT_EXTRA` names a per-machine JSON file of extra patterns; the hook loads it, applies it after the built-in rules, and the redaction tests cover it. The file is listed in the VM's machine file and never committed."
* [harness `docs/vault-migration-requirements.md`, decision 7, 2026-09-24] "Obsidian Sync is not used: the realms do that job, and two syncers on one folder is the OneDrive problem again."
* [harness `README.md` §A note on honesty] "If a document here describes something in the present tense, it should be verifiable against the live database or the filesystem."
* [harness `docs/memory-sprint-orchestration.md`, standing rules] "never `rm` in the vault (move to `~/.claude-archive/<date>/`); never write `settings.json`, `machine.env` or scheduled tasks yourself — give Stack the `!` command; never print a secret or `claude mcp get` output; never force-push, rebase a pushed branch, or retry a denied command in another form"

## MVP (in Stack's words)

Stack wrote no §3 item for this phase (91 §3 holds none for the harness), and no 80c answer covers it.
His own words on V-2 are one line in DECISIONS; a second row records his answers in the PM's wording:

* "update the documents to ensure they reflect the truth (i.e. change v-2 from planned to built etc)"
  (DECISIONS 2026-09-24, the V-2 row's Why column, quoted there as Stack's).
* "hook auto-tags with manual additions allowed (hook merges frontmatter), existing notes moved and
  back-filled from git, a session is concluded after 24 h without a resume; DoD = the brief's
  acceptance list, PM-verified" (DECISIONS 2026-09-14, the PM's summary of Stack's answers and
  research; its Why column reads "Stack's answers; research: …"; not a quote of Stack).

Brief 66 §R-27.4 (frozen 2026-09-14) records one more answer in the PM's wording, not a quote of
Stack: "**Stack may append tags by hand in the note**; the hook never removes a manual tag on rewrite
and ingest keeps them (Stack, 2026-09-14)."

*PM wording, not Stack's, built from the B-52..B-56 defaults (all PROVISIONAL):* when he presses Apply
answers, the decision notes land in `C:/Users/stack/vault/projects/bb2dash/decisions/` and reach GitHub
on the next nightly push, and nothing is written to OneDrive; a `/checkpoint` note never carries a key
into a repo's history, and the skill no longer has a hand-written path around that; searching by repo
and phase returns a phase's PM session and its workers, and a note never carries a phase it cannot
prove; no note holds more than five tags the hook put there, while his own tags stay; the untagged list
reaches the PM every week, or sooner when it passes 25; the harness docs describe the realm vault; and a
dated verification note walks every line of brief 66 on live data, so V-2 reads "closed" on record.

## Definition of done

- [ ] PR-B: in `hooks/`, `npm test` exits 0 with `fail 0`; in `ingest/`, `uv run pytest` exits 0 with
      the passed count not below `main`'s; in `mcp-server/`, `npm run typecheck && npm test` exit 0.
      bb2dash `web/`, `mcp-server/`, `desktop/` are untouched, so their suites are not re-run (the
      `git diff --stat` check of §Routes prints nothing).
- [ ] PR-B's integration commit (task 16): `node --test hooks/tests/install.test.mjs
      hooks/tests/golden.test.mjs` → 0 failures after the PM adds the two `PAYLOAD` entries and
      regenerates the goldens.
- [ ] `/code-review` at high on each PR (PR-B with the explicit range `origin/main...feat/v2-closure`
      from inside its worktree, per the harness contract; PR-A and PR-C `/code-review main high`);
      every CRITICAL and HIGH fixed.
- [ ] `/security-review` on PR-B (redaction, git-history writes, a CLI that reads the machine file, the
      credential test), on PR-A (the skill builds shell commands from configured paths) and on PR-C
      (the re-installed `/checkpoint` payload commits notes into bb2dash's history; the skills run
      shell commands).
- [ ] Commits: conventional (`fix:`, `feat:`, `test:`, `docs:`), one per completed task, pushed to the
      worker's branch as it lands; no commit on `main` in either repo; no `--no-verify`.
- [ ] STATUS (its two V-2 lines, 420 and 462 on the planning branch today: V-2 closed), DECISIONS (the
      11 rows listed under task 28) and ORCHESTRATOR (Phase 20 row) updated in PR-C;
      `90_SPRINT2_INTAKE.md` S2-carry-3 corrected (C-28's `grep -c "262 of 267"` → 0).
- [ ] All three PRs open; none merged without Stack's word. No Vercel walk: nothing visual changes, so
      Stack's acceptance script (below) is walked in the terminal and the vault, the one departure from
      the 2026-09-14 DoD row's "walked on the Vercel preview", recorded in the three-PRs DECISIONS row.
- [ ] Every row of §Task list passes its check; the evidence is in `101a_V2_VERIFICATION.md`. Task 2
      runs after PR-A merges on Stack's word and is recorded in `101a`; task 29 runs after PR-C (which
      carries `101a`) merges, so its C-29 output is reported to Stack in that session instead.

**Stack's acceptance script**

1. After PR-A merges and the PM has refreshed the installed skill (task 2's first step): press Apply
   answers in the Inbox (or run the next sync). The terminal prints
   `vault=C:/Users/stack/vault … realm=projects ok` before anything else; notes `inbox-541` … `inbox-544`
   appear in `C:/Users/stack/vault/projects/bb2dash/decisions/`; the Inbox shows the four archived.
2. The next morning, `git -C C:/Users/stack/vault/projects log -1 --stat` lists those notes.
3. After PR-B merges and three consecutive nightly runs have each logged `committed -> pulled -> pushed`
   (or up-to-date) for both realms (the harness live-lane prerequisite; none had by 2026-09-27): run `! node C:/Users/stack/agentic-harness/hooks/install.mjs`
   (it edits `settings.json`, so it is yours to run).
4. Read the back-fill dry-run file `<B>/backfill-dry-run.txt` (one line per change) and say "go L20-b".
5. Remove GitHub's stored credential from Windows Credential Manager (the PM gives you the exact
   `!` command), then run `! node C:/Users/stack/agentic-harness/hooks/sync-realms.mjs --push --vault
   C:/Users/stack/vault` inside `Measure-Command`: it exits 2 in under 30 s. Restore the credential;
   the next nightly pushes again (task 22).
6. Open `claude` in `C:/Users/stack/projects/bb2dash`, send one prompt that carries the token the PM
   gives you (`v2resume` plus the day's date, e.g. `v2resume20261001`), `/exit`; `claude --resume <id>`,
   one prompt, `/exit`. The PM shows you both notes' frontmatter: the first `superseded`, the second
   naming it under `supersedes`.
7. From a claude.ai/code session on `docs/harness-closure-20`, run `/checkpoint`: the note is written,
   its JSON line shows `redactions`, and the 12:00 collector files it.
8. Start `/bb2dash-pm`: when the review is due it shows the untagged list first.
9. Read `101a_V2_VERIFICATION.md` and say whether V-2 is closed; the PM records your word.

**What proves each requirement**

* R-97 — task 1's check, then task 2: the installed copy equal to the merged file, four decision notes in the projects realm, 541–544 archived, 0 notes in the OneDrive stub (or, if a pre-merge run wrote into the stub, the number of notes the PM copied, each also present in `<V>/projects/bb2dash/decisions/`, pasted in 101a), the store returns `bb2dash-inbox-decision-541` by `get_document`; after PR-C, task 29's `cmp` returns 0 again.
* R-98 — tasks 12 and 13 green, and task 21's three blob hashes equal the harness payload.
* R-99 — task 27: 101a holds 21 rows (A1–A6, D1–D15), none blank, and the DECISIONS row carries Stack's word.
* R-100 — task 11 green, and task 22: C-22 prints twelve `1`s over three consecutive nights, and the credential test exits 2 under 30 s.
* R-101 — tasks 4–6 green (every H-2 row, including each one that must read `''`), task 18's re-run report (`changes: 0`, `phase_body_mismatch: 0`, `repo_empty_underivable: 0`) and its two `phase: ''` lines for the notes that carry a wrong phase today, and task 26's family SQL (`matched` = `family`).
* R-102 — task 7 green and task 19's first SQL (`hook_tags` longer than 5) returns 0.
* R-103 — task 9 green, the H-11 line present, and task 25's exit codes (3, then 0).
* R-104 — task 15: the path grep prints 0 lines and `readme-fields.test.mjs` is green.
* R-106 — task 10 green, the budget case included.

**The 21 lines of brief 66 and what closes each** (the frame of `101a`, which gives each line its own
row, `A1`–`A6` and `D1`–`D15`, with its state and pasted evidence)

| Line | State on 2026-09-24 (91 R-99) | Closed by |
|---|---|---|
| A1 one note per session, fields populated | fails as worded (5 of 373 carry `phase`) | task 18, restated per B-53 (**PROVISIONAL**; "fields where derivable" is a PM sub-default under B-53; re-filing is R-H3's) |
| A2 the acceptance query | returns nothing | task 26 (B-53, **PROVISIONAL**) |
| A3 end → resume → end | never run live | task 23 |
| A4, A5, A6 ingest within a minute; nightly registered; docs | met on record | cited; A6 re-checked by task 15 |
| D1 file count = distinct `session_id` | fails as written | restated to top-level notes; task 18 |
| D2 no nulls in the five fields | SQL tests null only | restated (`''` counted; `phase` `''` and `branch` `''` allowed where underivable); task 19 |
| D3 collection from the remote | met on record | cited |
| D4 tags in the vocabulary; manual tags survive | no live set-difference | task 18 (`unknown_hook_tags: 0`), task 7 |
| D5 ≤ 5 hook-applied tags | 6 notes over | tasks 7, 18, 19 (per note, a PM sub-default under B-52, **PROVISIONAL**) |
| D6 resume fixture | met (fixture) | cited; live by task 23 |
| D7 budget and redaction | met on record | cited; task 10 re-runs budget with extras |
| D8, D9 rag within a minute; `--only` zero embeddings | met on record | cited |
| D10 `filter_metadata` on repo + phase | unproven | task 26 |
| D11 `include_superseded` | met on record (default) | task 23's two counts |
| D12 GIN index used | last run 2026-09-16 | task 24 |
| D13 back-fill git-derived fields | met on record | cited; task 18 extends it |
| D14 nightly < 36 h, docs, pytest ≥ 261 | met on record | task 16's pytest count |
| D15 reviews; migration byte-identical | PR #1 only | task 24 (N migration files, N read at `<H>`: a `rag_meta` version row for each file and an md5 pair for each row `supabase_migrations` holds); PR-B's review gates in §DoD |

## Task list

Harness commands run from the phase worktree `C:/Users/stack/agentic-harness-wt-v2-closure` unless a
worker's worktree is named; `<V>` is `C:/Users/stack/vault`. SQL marked *hm* runs read-only on
harness-memory (`hqkytnyiiuxovnnyixye`), never on the bb2dash project. Tasks 17–19 and 21–26 wait
for PR-B's merge and until three consecutive nightly runs each log `committed -> pulled -> pushed` (or
up-to-date) for both realms, the harness live-lane prerequisite; none had by 2026-09-27 (task 22's own
three consecutive nights are separate and counted after that); task 2 waits for PR-A's merge and task 29 for PR-C's, each on Stack's
word. Task 20 waits for neither: it needs only `gitleaks` and the two realm checkouts (§Workers, order).

`<H>` is harness `origin/main`'s short SHA, recorded by the PM at task 1 (C-H). Harness `main` moves
under Stack's other sessions, so every count or label this brief takes from it (task 3's eval case
count, task 15's nightly step labels, task 24's migration file count N) is re-read at `<H>` by C-H,
pasted into 101a, and that reading is what the check expects; the figures quoted in the rows are the
planning readings at `1c917f7` (2026-09-27), informational only. When C-H's labels figure is `0`, the
PM rewrites C-15's expected line from `<H>`'s `scripts/nightly-ingest.ps1` before W-62 starts task 15.

| # | task | covers | owner | deterministic check | demo line for Stack |
|---|---|---|---|---|---|
| 1 | `/inbox-apply` Step 0 per H-9 (PR-A form: reads the machine file), lines 31–34 and step 5 rewritten (the installed copy is task 2's, never the worker's); PR-A opened the same day; the same day the PM records `<H>` and re-reads the harness figures at it (C-H) | R-97 | W-62 + PM | (d) C-1 prints `0`, then two numbers each ≥ `1`; (d) C-H prints four lines, `<H>` (7 hex characters), the eval case count, N and the labels figure, all four pasted into 101a (at `1c917f7`: `67`, `7`, `1`; a labels figure of `0` means the PM rewrites C-15's expected line from `<H>` before task 15) | "Apply answers now says which vault it writes to, first." |
| 2 | After PR-A merges on Stack's word: the PM writes the merged blob over the installed copy (H-9), then the first real run (Stack's Apply answers or the next sync) | R-97 | PM | (b) bb2dash: `select count(*) from attention_items where id between 541 and 544 and archived_at is not null` → 4; (d) C-2 prints `0` (the `cmp` exit code), then `4`, then `0`, or, if a pre-merge run wrote into the stub, the number of notes the PM copied (each also present in `<V>/projects/bb2dash/decisions/`, pasted in 101a); `get_document(source="obsidian", external_id="bb2dash-inbox-decision-541")` returns the note with `collection: bb2dash-inbox-decisions` (a `search_context` query is not used: on 2026-09-27 "Inbox decision 540" in that collection did not rank `bb2dash-inbox-decision-540` in its top 10, though `get_document` returns it) | "Your four answers are notes in the vault, not in OneDrive." |
| 3 | P-61 baseline before any change: `uv run ingest eval --json > eval/baseline-pre-phase20.json` (in `ingest/`); the PM also runs task 19's four *hm* counts now and keeps their values for 101a as the before figures (task 19's expected values do not depend on them) | P-61 | PM | (d) `node -p "require('./ingest/eval/baseline-pre-phase20.json').cases.length"` equals `grep -c "^  - id:" ingest/eval/golden.yaml`, which equals C-H's eval case count at `<H>` (67 at `1c917f7`; 25 on 2026-09-24, before unit Q-a's golden coverage) | "Search quality is measured before anything moves." |
| 4 | H-2 fixture rows, failing first (RED commit) | P-52, P-53 | W-59 | (a) in `-wt-v2-phase`: at the RED commit `node --test hooks/tests/phase-aliases.test.mjs` exits 1; at task 5's commit it exits 0 | — |
| 5 | H-1: `derivePhase`, `PHASE_TAG_PATTERN`, `phaseTag`, `phase-aliases.mjs`, `analyse.mjs` passes `repo`; `docs/tags.md` phase section and line 126 | R-101, P-52 | W-59 | (a) `node --test hooks/tests/tags.test.mjs hooks/tests/phase-aliases.test.mjs hooks/tests/vocabulary.test.mjs` → 0 failures | "`fix/page-pass-12b` now reads as Phase 12b." |
| 6 | Worker notes inherit the parent's phase and, when their own `cwd` yields none, its repo (H-1, `subagent.mjs`) | R-101 | W-59 | (a) `node --test hooks/tests/subagent.test.mjs` → 0 failures, with three new cases: a worker on `main` under a `fix/page-pass-12b` parent gets `phase-12b`; a worker on `feat/db-hygiene-15-runner` keeps `phase-15`; a workflow worker whose `cwd` is `C:/Users/stack/.claude/projects/C--Users-stack-projects-bb2dash/<sid>/subagents/workflows/<wf>` under a parent transcript whose `cwd` is the bb2dash checkout gets `repo: 'emstacho-su/bb2dash'` | "Workers file under their PM's phase and repo." |
| 7 | H-3 (**PROVISIONAL, B-52**: the per-note cap, a PM sub-default under B-52): `hook_tags` field, `mergeFields` replace-not-union, `buildFields`, checkpoint `FIELD_SPEC` copy, `GENERATOR_VERSION` bump, goldens regenerated; P-55 test failing first; `merge.test.mjs`'s 9-tag union reframed as hand tags | R-102, P-55, B-52 | W-60 | (a) in `-wt-v2-cap`: at the test-only commit `node --test hooks/tests/hook-tags.test.mjs` exits 1; then `node --test hooks/tests/hook-tags.test.mjs hooks/tests/merge.test.mjs hooks/tests/golden.test.mjs hooks/tests/checkpoint-build.test.mjs hooks/tests/frontmatter.test.mjs` → 0 failures | "A worker re-captured nine times still carries at most five hook tags." |
| 8 | H-4: `resolveHarnessConfig` and `hooks/resolve-config.mjs` | P-110, R-97 | W-61 | (a) in `-wt-v2-config`: `node --test hooks/tests/resolve-config.test.mjs hooks/tests/machine-env.test.mjs` → 0 failures, including: shell beats the machine file; `--require-realm projects` on a folder whose `.realm` reads `classes` exits 2 and names the path | — |
| 9 | H-5: untagged list on the helper, SDK excluded, `--due` / `--mark-reviewed` / `--state`, early trigger 25 | R-103, P-111, P-110 | W-61 | (a) `node --test hooks/tests/untagged.test.mjs` → 0 failures (`--due` exit 3 on no state, a 7-day-old state, and 25 notes since; 0 otherwise); (d) `grep -c DEFAULT_VAULT_SEGMENTS hooks/untagged-sessions.mjs` → 0 | "The untagged list reads the real vault, not OneDrive." |
| 10 | H-6: `redact-extra.mjs`, `installExtraRules`, the four install points; budget case with a 20-rule extras file over the 18 MB fixture | R-106, P-112 | W-61 | (a) `node --test hooks/tests/redact-extra.test.mjs hooks/tests/redaction.test.mjs hooks/tests/budget.test.mjs` → 0 failures (extras applied after the built-ins in a prompt, a command and the Outcome section; missing file, bad JSON and bad pattern each logged and skipped; budget < 1,200 ms with extras) | "A machine can add its own words to scrub; a bad rule never breaks capture." |
| 11 | H-10: sweep takes the realm lock; notes written by temp file and rename | R-100 | W-61 | (a) `node --test hooks/tests/writer-lock.test.mjs hooks/tests/sweep.test.mjs hooks/tests/hook-process.test.mjs` → 0 failures (a held lock defers the sweep's realm and it exits as the collector does; the hook writes while the lock is held; no partial file is ever observable at the note path) | — |
| 12 | H-7: `skills/checkpoint/redact.mjs` copied after task 10; `build-note.mjs` redacts body and git strings and reports `redactions`; `PAYLOAD` of three; seeded fixture (JWT, `sb_` key, connection string); P-57 byte pin; P-113 same fixture through both modules | R-98, P-57, P-113 | W-60 | (a) `node --test hooks/tests/checkpoint-redact.test.mjs hooks/tests/checkpoint-build.test.mjs hooks/tests/install-checkpoint.test.mjs` → 0 failures; (d) `cmp skills/checkpoint/redact.mjs hooks/lib/redact.mjs` exits 0 | "A pasted key in a checkpoint note comes out `[REDACTED]` before git sees it." |
| 13 | (**PROVISIONAL, B-56**) Remove the no-node fallback from `skills/checkpoint/SKILL.md` and put H-7's sentence in its place | B-56, R-98 | W-60 | (d) `grep -c "is not available" skills/checkpoint/SKILL.md` → 0; `grep -c "hand-built" skills/checkpoint/SKILL.md` → 0; `grep -c "without it, stop and report that no checkpoint was written" skills/checkpoint/SKILL.md` → 1 | — |
| 14 | H-8 back-fill tool (after 5, 6, 7, 10), P-56 repair and `--relocate` included (**PROVISIONAL, B-54**: the `machine` fill; **B-52**: the repair) | P-54, P-56, R-101, R-102, B-52, B-54 | W-59 | (a) `node --test hooks/tests/backfill-fields.test.mjs` → 0 failures on a fixture vault: `--dry-run` leaves every file hash unchanged; apply then a second run reports `changes: 0`; a `feat/retrieval-mcp` note tagged `phase-7` ends `phase: ''`; an underivable field stays `''`; the backup holds every changed original; a six-tag note ends with ≤ 5 `hook_tags` and its hand tag kept; a workflow-subagent note (`cwd` under `C:/Users/stack/.claude/projects/C--Users-stack-projects-bb2dash/<sid>/subagents/workflows/`, `repo: ''`) ends with its parent note's `repo`; a note whose `cwd` is `C:/Users/stack/OneDrive - Syracuse University/.fall2026/.projects2026/bb2dash` ends `repo: 'emstacho-su/bb2dash'`; Session facts rows equal the frontmatter | "One pass fills phase, repo and the rest, and shows you every line first." |
| 15 | Harness docs (after 5 and 7): realm vault, Docker as the optional local store, status rows with test counts from an executed run, README layout, the nightly's nine steps (the section carries the line `realms-pull → transcripts → state → checkpoints → sweep → ingest → verify → eval → realms-push` verbatim, the step labels of `scripts/nightly-ingest.ps1`'s closing log line as it reads at `<H>`, C-H's labels figure), `db/README.md` local store, `hooks/README.md` field table (every field, `machine` and `hook_tags` included); R-B1 "pushed or up-to-date"; the lock follow-up struck; the Obsidian Git plugin declined | R-104, R-100 | W-62 | (a) in `-wt-v2-docs`: `node --test hooks/tests/readme-fields.test.mjs` → 0 failures; (d) C-15 (after merging task 5) prints `0`, a number ≥ `1` (`0` on harness `main` at `1c917f7`, before this task), then `1` | "The harness docs say where the vault really is." |
| 16 | Integrate the four worker branches on `feat/v2-closure`, gates, PR-B | all harness rows | PM | (d) the three suite commands of §DoD exit 0; after the two `PAYLOAD` entries and the golden regeneration, `node --test hooks/tests/install.test.mjs hooks/tests/golden.test.mjs` → 0 failures; `gh pr view <PR-B> --json state -q .state` prints `OPEN` | — |
| 17 | L20-a: Stack reinstalls the hook | R-101, R-102, R-106 | Stack + PM | (d) C-17 prints `same` six times | "The new capture code is live." |
| 18 | L20-b (**PROVISIONAL, B-52, B-53, B-54**): back-fill dry-run saved to `<B>/backfill-dry-run.txt` → Stack reads → apply with `--relocate ca25962a=classes/ist466 --relocate 22581e0d=classes/ist466` → `node hooks/sync-realms.mjs --push` → `uv run ingest --source obsidian --path "<V>"` | P-54, P-56, R-101, R-102, B-52, B-53, B-54 | PM | (d) C-18's re-run report shows `changes: 0`, `hook_tags_over_cap: 0`, `unknown_hook_tags: 0`, `absolute_files_modified: 0`, `phase_body_mismatch: 0`, `repo_empty_underivable: 0` and `top_level_notes` = `distinct_top_level_session_ids`; then `phase: ''` twice (today `0e3b3d00` reads `phase-7` and `ac1f5264` reads `phase-10`); then `2` and `0` | "Every bb2dash note now says its phase and repo, or honestly says none." |
| 19 | (**PROVISIONAL, B-52**: the hook_tags SQL) Store checks after the ingest; P-61 post baseline (`uv run ingest eval --json > "<B>/baseline-post-phase20.json"`, in `C:/Users/stack/agentic-harness/ingest` on merged `main`; not committed, its JSON pasted into 101a) | R-102, R-99, P-61, B-52 | PM | (b) *hm* `select count(*) from rag.documents where source = 'obsidian' and jsonb_array_length(coalesce(metadata->'hook_tags', '[]'::jsonb)) > 5` → 0; *hm* `select count(*) from rag.documents where source = 'obsidian' and collection = 'bb2dash' and metadata->>'type' = 'session' and (coalesce(metadata->>'repo','') = '' or coalesce(metadata->>'status','') = '' or coalesce(metadata->>'schema_version','') = '')` → 0 (task 18's `repo_empty_underivable` is 0); *hm* `select count(*) from rag.documents where source = 'obsidian' and collection = 'bb2dash' and metadata->>'type' = 'session' and coalesce(metadata->>'phase','') = ''` → equals task 18's `phase_underivable_indexed`; *hm* `select count(*) from rag.documents where source = 'obsidian' and collection = 'bb2dash' and metadata->>'type' = 'session' and coalesce(metadata->>'branch','') = ''` → equals task 18's `branch_empty`; (d) from `C:/Users/stack/agentic-harness`, `node -p "require('<B>/baseline-post-phase20.json').hit_rate >= require('./ingest/eval/baseline-pre-phase20.json').hit_rate"` prints `true` | "Search is no worse after the back-fill." |
| 20 | (**PROVISIONAL, B-55**) One `gitleaks` scan over each realm's history (`gitleaks git <V>/projects`, `gitleaks git <V>/classes`, or `gitleaks detect --source …` on a pre-8.19 build); on day 1 beside task 3, outside the PR-B and live-lane wait, and at the latest before Phase 14's first realm write | B-55 | PM | (d) exit code 0 for each of the 2 realms, report "no leaks found"; a hit stops the phase (security protocol: rotate first) | "Both realms' histories are clean." |
| 21 | PR-C skills (after PR-A and PR-B merge): `node C:/Users/stack/agentic-harness/hooks/install-checkpoint.mjs --repo C:/Users/stack/projects/bb2dash-wt-harness-closure-20-skills`; H-9 swapped to `resolve-config.mjs` (on top of PR-A's Step 0; the installed copy is task 29's); H-11 line | R-98, R-97, P-110, R-103 | W-62 | (d) C-21 prints `equal` three times, then a number ≥ `1` (the resolver call in `skills/inbox-apply/SKILL.md`), then `1` | "Cloud checkpoints in bb2dash run the redacting build." |
| 22 | R-100 live: three consecutive Apply nights; R-B4 credential test run by Stack | R-100 | Stack + PM | (d) C-22 prints `1` four times for each of three consecutive nights (12 lines); the credential test exits `2` in under 30 s (`Measure-Command` output pasted) | "Three nights pushed on their own; a missing credential fails fast." |
| 23 | Live resume chain (66 A3, D6) and `include_superseded` (D11) | R-99 | Stack + PM | (d) C-23 prints `1`, then `  - 'session-<S>'` (the second note's `supersedes` names the first note's `id`); (d) `search_context(query="<T>", repo="emstacho-su/bb2dash", limit=50, include_superseded=true)` lists `session-<S>`, and the same call with `include_superseded=false` does not list it (`<T>` is the one-word token acceptance step 6's first prompt carries, so the text arm matches the first note exactly; both result lists pasted into 101a) | "Resume a session and the old note steps aside." |
| 24 | Store proofs: GIN index and the migration ledger (66 D12, D15) | R-99 | PM | (b) *hm*, `enable_seqscan` left on: `explain (analyze)` the `vec` arm's select (lines 81–93) and then the `txt` arm's select (lines 96–119) of `rag.search`, each exactly as written in `C:/Users/stack/agentic-harness/db/migrations/20260921223612_rag_search_strict_matches_first.sql`, its parameters and locals bound as literals: `filter_metadata` = `'{"repo":"emstacho-su/bb2dash","phase":"phase-<NN>"}'` (`<NN>` is task 26's phase), `query_embedding` = `<E>`, `query_text` = `'phase'` (one lexeme, so the function's `begin` block sets `strict_query` = `websearch_to_tsquery('english', 'phase')` and leaves `loose_query` and `lexemes_needed` null), `match_count` 5, `min_similarity` 0.70 (`keyword_floor` 0.62), `filter_source` and `filter_collection` null, `keep_superseded` true → each plan contains `Bitmap Index Scan on documents_metadata_idx` as the driving node on `documents`, with the chunk scan nested inside it (harness `db/README.md`, "Verifying a filter is index-served, not scanned"); (b) *hm* `select count(*) from rag.search(query_embedding => <E>, query_text => 'phase', match_count => 5, min_similarity => null, filter_metadata => '{"repo":"emstacho-su/bb2dash","phase":"phase-<NN>"}')` → 5 (`min_similarity => null`, so the relevance floor cannot be what cuts the count), run where *hm* `select count(*) from rag.documents where source = 'obsidian' and metadata @> '{"repo":"emstacho-su/bb2dash","phase":"phase-<NN>"}'` ≥ 5; `<E>` is `(select c.embedding from rag.chunks c join rag.documents d on d.id = c.document_id where d.external_id = 'session-<PM id>' order by c.id limit 1)`, task 26's PM note; (d) C-24 prints `N already applied, 0 pending`, then `N`, then the N 14-digit versions and the N `md5sum` lines, where N is C-H's migration file count at `<H>` (7 at `1c917f7`: unit P's L4 applied `20260924201225_rag_retrieval_events` on 2026-09-27, per harness `968f8ff`'s record; a migration that reaches harness `main` after `<H>` is applied by its own live step before this task, otherwise C-24 prints `1 pending`, and N is then re-read at that SHA, both SHAs pasted into 101a); (b) *hm* `select version from rag_meta.schema_migrations order by version` → N rows, the same versions in the same order as C-24's version lines (the ledger `uv run ingest db migrate` writes, `ingest/src/ingest/migrations.py`); (b) *hm* `select version, name, md5(statements[1]) from supabase_migrations.schema_migrations order by version` → one row per file applied through `apply_migration` (6 at `1c917f7`, `20260909175037` through `20260921223612`), each `md5` equal to C-24's `md5sum` of `<version>_<name>.sql`, the pairs pasted into 101a (the harness's own byte-identity check, `db/README.md` §Verifying the mirror; the harness stores and checks out LF, per its `.gitattributes`, so the working file's hash is the blob's); a file applied by `uv run ingest db migrate` (`20260924201225` at `1c917f7`) has no stored statement there and is proved by its `rag_meta` row alone, listed in 101a as such | — |
| 25 | First untagged review, then mark it | R-103 | PM | (d) `node hooks/untagged-sessions.mjs --due` exits 3 before the review; after tagging or keeping each listed note and `--mark-reviewed`, `--due` exits 0 and `--json` lists 0 notes | "The PM saw every untagged note since the last review." |
| 26 | (**PROVISIONAL, B-53**) acceptance query on the first sprint-2 bb2dash phase after task 17 (that choice of phase is a PM sub-default under B-53) | R-101, R-99 | PM | (b) *hm*, the proof, on the store's own rows (the notes the ingest wrote after H-8's replay): `select count(*) as family, count(*) filter (where metadata @> '{"repo":"emstacho-su/bb2dash","phase":"phase-<NN>"}') as matched from rag.documents where source = 'obsidian' and (external_id = 'session-<PM id>' or metadata->>'parent_session' = '<PM id>')` → `family` ≥ 1 and `matched` = `family` (missing = 0; the expected count comes from the same query; the containment is the one `rag.search` applies inside both arms, `d.metadata @> filter_metadata`; children whose `repo` was `''` carry the parent's after H-8 and `subagent.mjs`, tasks 6, 14 and 18), the family's `external_id` list pasted into 101a; (d) smoke only: `search_context(query="<that phase's brief title>", repo="emstacho-su/bb2dash", phase="phase-<NN>", limit=50, min_similarity=0, include_superseded=true)` returns ≥ 1 result and every returned id is in *hm* `select external_id from rag.documents where source = 'obsidian' and metadata @> '{"repo":"emstacho-su/bb2dash","phase":"phase-<NN>"}'` (outside = 0); it proves no completeness, since the `rag` MCP passes `max_per_document` 3 and caps `limit` at 50 (harness `mcp-server/src/config.ts`), so one call is guaranteed to reach only 17 distinct notes, fewer than a long PM session's children (34 notes name `ac1f5264`, the Phase 7–10 PM, as `parent_session` in the vault on 2026-09-27) | "Ask for a phase and you get its PM and its workers." |
| 27 | (**PROVISIONAL, B-53**: rows A1, A2) `101a_V2_VERIFICATION.md`: the 21 lines of the table above, each with state and evidence (the pasted commands and outputs of tasks 2, 17–26) | P-58, R-99 | PM | (d) C-27 prints `21` then `0` (no row with an empty cell) | "V-2's list, walked on live data, in one note." |
| 28 | PR-C docs: the 11 DECISIONS rows (three PRs; P-52 spelling; B-52; B-53; B-54; B-55 with the scan result; B-56 and "/checkpoint applies base rules only", each B row recording Stack's answer with the date he gave it, or the default marked **PROVISIONAL** if he has not answered; 66 DoD restatements with the narrowed Temp exclusion; the untagged cadence and SDK exclusion; the Obsidian Git plugin declined with R-B1's wording; V-2 closed on Stack's word), STATUS, ORCHESTRATOR, intake, 66 amendment; PR-C opened | R-99, P-58 | PM | (d) C-28 prints `11`, then `0`, then nothing | "The record says V-2 is closed, and why." |
| 29 | After PR-C merges on Stack's word: the PM writes the merged `skills/inbox-apply/SKILL.md` blob over the installed copy (H-9), so the skill that runs calls `resolve-config.mjs` | R-97 | PM | (d) C-29 prints `0` (the `cmp` exit code), then a number ≥ `1` | "The skill you run is the one on `main`." |

**Check commands** (Git Bash; the ones with a pipe live here so the table stays readable). `<D>` is a
night's UTC date prefix, e.g. `2026-09-28T`; `<B>` is a backup folder under
`C:/Users/stack/.claude-archive/<date>/`; `<S>` is the session id of acceptance step 6 and `<T>` the
one-word token its first prompt carries (`v2resume<YYYYMMDD>`); `<H>` is the harness SHA C-H records.

```bash
# C-1  (C:/Users/stack/projects/bb2dash-wt-inbox-vault-20)
git grep -c OneDrive -- skills/inbox-apply/SKILL.md || echo 0
grep -c "projects/.realm" skills/inbox-apply/SKILL.md
grep -c "realm=projects ok" skills/inbox-apply/SKILL.md

# C-H  (PM, the day of task 1: prints <H>, then the three figures read at <H>)
HR=C:/Users/stack/agentic-harness
git -C $HR fetch -q origin && git -C $HR rev-parse --short origin/main
git -C $HR show <H>:ingest/eval/golden.yaml | grep -c "^  - id:"
git -C $HR ls-tree --name-only <H> db/migrations/ | grep -c '\.sql$'
git -C $HR show <H>:scripts/nightly-ingest.ps1 | grep -cF '(realms-pull $pullCode, transcripts $transcriptCode, state $stateCode, checkpoints $checkpointCode, sweep $sweepCode, ingest $ingestCode, verify $verifyCode, eval $evalCode, realms-push $pushCode)'

# C-2  (C:/Users/stack/projects/bb2dash-wt-inbox-vault-20, after PR-A merges and `git fetch origin`)
git show origin/main:skills/inbox-apply/SKILL.md | cmp - C:/Users/stack/.claude/skills/inbox-apply/SKILL.md; echo $?
ls C:/Users/stack/vault/projects/bb2dash/decisions/inbox-54[1-4].md | wc -l
find "C:/Users/stack/OneDrive - Syracuse University/vault" -name "*.md" | wc -l

# C-15 (C:/Users/stack/agentic-harness-wt-v2-docs)
git grep -nE 'OneDrive - Syracuse University[/\]vault' -- README.md CONTEXT.md docs/ingestion.md docs/tags.md hooks/README.md db/README.md | wc -l
grep -c "realms-pull" docs/ingestion.md
grep -cF "realms-pull → transcripts → state → checkpoints → sweep → ingest → verify → eval → realms-push" docs/ingestion.md

# C-17
for f in tags phase-aliases merge redact redact-extra frontmatter; do
  cmp -s C:/Users/stack/agentic-harness/hooks/lib/$f.mjs C:/Users/stack/.claude/hooks/lib/$f.mjs && echo same
done

# C-18 (C:/Users/stack/agentic-harness, after the apply, the sync and the ingest)
node hooks/backfill-fields.mjs --vault C:/Users/stack/vault --backup "<B>" --dry-run --report --json
grep -h "^phase:" C:/Users/stack/vault/projects/bb2dash/sessions/0e3b3d00-157a-4323-ae9e-c481e5042e88.md
grep -h "^phase:" C:/Users/stack/vault/projects/bb2dash/sessions/ac1f5264-046d-4f8f-83be-682428b248d4.md
ls C:/Users/stack/vault/classes/ist466/sessions | grep -cE "^(ca25962a-1466|22581e0d-35e4)"
find C:/Users/stack/vault/projects -name "ca25962a-1466*" -o -name "22581e0d-35e4*" | wc -l

# C-21 (C:/Users/stack/projects/bb2dash-wt-harness-closure-20-skills)
for f in SKILL.md build-note.mjs redact.mjs; do
  a=$(git show HEAD:.claude/skills/checkpoint/$f | sha256sum | cut -d' ' -f1)
  b=$(git -C C:/Users/stack/agentic-harness show origin/main:skills/checkpoint/$f | sha256sum | cut -d' ' -f1)
  [ "$a" = "$b" ] && echo equal || echo DIFFERENT
done
git show HEAD:skills/inbox-apply/SKILL.md | grep -c "resolve-config.mjs --json --require-realm projects"
grep -c "untagged-sessions.mjs --due" .claude/skills/bb2dash-pm/SKILL.md

# C-22 (run once per night D1, D2, D3; each line prints 1)
LOG=C:/Users/stack/.claude/hooks/nightly-ingest.log
grep "^<D>" "$LOG" | grep -c "realms-push : node sync-realms.mjs --push --vault C:/Users/stack/vault$"
grep "^<D>" "$LOG" | grep -cE "realms-push . projects: .* -> (pushed|up-to-date)$"
grep "^<D>" "$LOG" | grep -cE "realms-push . classes: .* -> (pushed|up-to-date)$"
grep "^<D>" "$LOG" | grep -c "realms-push 0) ===$"

# C-23 (after acceptance step 6)
F=C:/Users/stack/vault/projects/bb2dash/sessions
grep -c "^status: 'superseded'$" "$F/<S>.md"
grep -A1 "^supersedes:$" "$F/<S>-r2.md" | tail -1

# C-24 (C:/Users/stack/agentic-harness/ingest)
uv run ingest db migrate --dry-run
ls ../db/migrations/*.sql | wc -l
ls ../db/migrations/*.sql | sed -E 's#.*/([0-9]{14})_.*#\1#'
md5sum ../db/migrations/*.sql

# C-27 (bb2dash-wt-harness-closure-20)
N=docs/planning/sprint-2/verification/101a_V2_VERIFICATION.md
grep -cE "^\| [AD][0-9]{1,2} \|" "$N"
grep -E "^\| [AD][0-9]{1,2} \|" "$N" | grep -cE "\|[[:space:]]*\|"

# C-28 (bb2dash-wt-harness-closure-20)
git diff main...docs/harness-closure-20 -- project-state/DECISIONS.md | grep -c "^+| 20"
grep -c "262 of 267" docs/planning/sprint-2/90_SPRINT2_INTAKE.md
git diff --stat main...docs/harness-closure-20 -- web mcp-server desktop db ingest

# C-29 (bb2dash-wt-harness-closure-20, after PR-C merges and `git fetch origin`)
git show origin/main:skills/inbox-apply/SKILL.md | cmp - C:/Users/stack/.claude/skills/inbox-apply/SKILL.md; echo $?
grep -c "resolve-config.mjs --json --require-realm projects" C:/Users/stack/.claude/skills/inbox-apply/SKILL.md
```

## Workers

Opus workers (DECISIONS 2026-09-23), each in its own worktree cut from its phase branch; they commit
and push per task with conventional messages, never touch `project-state/`, never run a live step, and
never write to the vault or the store.

| Worker | Stream | Branch · worktree | Owns (disjoint) | Tasks |
|---|---|---|---|---|
| W-59 | phase and back-fill | agentic-harness `feat/v2-closure-phase` · `C:/Users/stack/agentic-harness-wt-v2-phase` | `hooks/lib/tags.mjs`, `vocabulary.mjs`, `analyse.mjs` (one argument), `subagent.mjs`, `phase-aliases.mjs`, `backfill-fields.mjs` (lib and CLI), `docs/tags.md`, tests `tags`, `vocabulary`, `subagent`, `phase-aliases`, `backfill-fields`; never the goldens (W-60's, then the PM's at task 16) | 4, 5, 6, 14 |
| W-60 | tag cap and checkpoint | agentic-harness `feat/v2-closure-cap` · `C:/Users/stack/agentic-harness-wt-v2-cap` | `hooks/lib/merge.mjs`, `frontmatter.mjs`, `note.mjs` (`buildFields`), `constants.mjs` (`GENERATOR_VERSION`), `skills/checkpoint/*`, `hooks/install-checkpoint.mjs`, tests `merge`, `frontmatter`, `hook-tags`, `checkpoint-build`, `checkpoint-redact`, `install-checkpoint`, `golden` and `hooks/tests/fixtures/golden/` | 7, 12, 13 |
| W-61 | config, cadence, redaction extras, writers | agentic-harness `feat/v2-closure-config` · `C:/Users/stack/agentic-harness-wt-v2-config` | `hooks/lib/machine-env.mjs`, `resolve-config.mjs`, `untagged-sessions.mjs`, `hooks/lib/redact.mjs`, `redact-extra.mjs`, `session-capture.mjs`, `sweep-transcripts.mjs`, `hooks/lib/sweep.mjs`, `collect-checkpoints.mjs`, `hooks/lib/notes-io.mjs`, tests `machine-env`, `resolve-config`, `untagged`, `redaction`, `redact-extra`, `budget`, `writer-lock`, `sweep`, `hook-process`, `ensure-index` | 8, 9, 10, 11 |
| W-62 | docs and bb2dash skills | agentic-harness `feat/v2-closure-docs` · `C:/Users/stack/agentic-harness-wt-v2-docs`; bb2dash `fix/inbox-apply-vault-20` · `bb2dash-wt-inbox-vault-20` (PR-A); bb2dash `docs/harness-closure-20-skills` · `bb2dash-wt-harness-closure-20-skills` | harness `README.md`, `CONTEXT.md`, `docs/ingestion.md`, `db/README.md`, `hooks/README.md`, `docs/vault-migration-requirements.md`, `hooks/tests/readme-fields.test.mjs`; bb2dash `skills/inbox-apply/SKILL.md`, `.claude/skills/checkpoint/*` (by the installer only), `.claude/skills/bb2dash-pm/SKILL.md`; never the installed copy `~/.claude/skills/inbox-apply/SKILL.md` (the PM's, tasks 2 and 29) | 1, 15, 21 |

Order inside the phase: task 1 first (PR-A, day 1, with C-H); tasks 3, 4, 7, 8 start together; task
20 runs on day 1 beside task 3 once Stack has installed `gitleaks` (it needs only that and the two realm
checkouts, §Seams Phase 14 row), and at the latest before Phase 14's first realm write; task 12 waits for
task 10 (the byte copy), task 14 for tasks 5, 6, 7 and 10, task 15's path check for task 5 and its field-table
test for task 7 (W-62 merges `feat/v2-closure-cap` into `feat/v2-closure-docs` before running
`readme-fields.test.mjs`); task 21 waits for PR-A's and PR-B's merges (it edits PR-A's Step 0 and installs PR-B's payload); tasks 2 and 29 follow
PR-A's and PR-C's merges. The PM owns the verification note, the eval baselines, `project-state/`, the
installed `/inbox-apply` copy, the integration and every live step.

## Out of scope

* R-105 (the internship VM, its `work-vm` realm, the VM's own extras file): harness Phase E.
* R-107 (`scripts/smoke.ps1`, deleting the OneDrive folder and the archive): harness Phase F; only its
  baseline (P-61) is taken here.
* R-100's container-writer line, `vault_realm_pat` (brief 100's name), the `machine.env` template (P-59), installing
  gitleaks (P-46), the four repo skills' single source (P-49), `doctor.mjs` strict exit (P-48): Phase 14.
* Re-filing the ~72 misfiled bb2dash notes and the `harness` realm (R-H1..R-H3); hub renames (unit N);
  the SessionStart brief and `claude-config` (unit H-b, whose R-H5 may reuse H-7's scanner); retrieval
  events (unit P); `verify` and `eval` in the nightly (unit Q-a); the curator (unit C): the harness
  memory sprint.
* Any change to `rag.search`, the chunker, the embedding model or `scripts/nightly-ingest.ps1`.
* The Obsidian Git plugin (declined as a build; hand edits ride the nightly push) and a recurring
  gitleaks gate (B-55, **PROVISIONAL**).
* Everything in bb2dash `web/`, `db/`, `ingest/`, `mcp-server/`, `desktop/`: Phases 15–19, 21, 22.

## Open items for Stack

Only what the B-numbers leave open; the PM proceeds on each default meanwhile.

* **B-52** — the cap counts hook-applied tags only (`hook_tags`), so a note may carry more than five
  tags in total when you have added your own. PROVISIONAL default: yes (hand tags uncapped is 93 §5
  item 52's; counting them through `hook_tags`, per note, is a PM sub-default under B-52).
* **B-53** — which phase is "first after task 17" is decided by the calendar. PROVISIONAL default:
  whichever bb2dash PM session starts first after the reinstall, named in `101a` (a PM sub-default
  under B-53, the PM's default, not 93 §5's).
* **B-54** — notes whose transcript was deleted from this PC stay `machine: ''`. PROVISIONAL default:
  yes (93 §5 item 54, 91 Q45).
* **B-55** — if the one scan finds a secret, rotation comes first and rewriting realm history is your
  call. PROVISIONAL default: rotate, do not rewrite (a PM sub-default under B-55, the PM's default,
  not 93 §5's; §5 item 55 says only: drop the gate, run one scan).
* **B-56** — with the fallback gone, a cloud sandbox without `node` cannot checkpoint at all.
  PROVISIONAL default: accept (a PM sub-default under B-56: it follows from 93 §5 item 56's removal;
  claude.ai/code sandboxes carry `node`).

PM defaults under the 2026-09-23 row that need no answer but can be vetoed at plan approval: the phase
spelling of H-1, the untagged cadence and its threshold of 25 (H-5, H-11), and the three PRs.

## Session prompt

ORCHESTRATOR §6 "Session A — Phase 20" (Session D until 2026-09-29) is the prompt. In short (the PM's summary, not its text): fix R-97 first on a bb2dash branch and
open its PR the same day; then the harness work on `feat/v2-closure`; walk the V-2 acceptance list live
and write the verification note under `docs/planning/sprint-2/verification/`; one PR per repo; do not
merge. This brief adds the third PR (PR-C, bb2dash docs) and the live-lane rule of §Seams.

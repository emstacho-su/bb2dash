# V-2 — Session archival, context tagging, and the RAG hand-off (R-27)

Date: 2026-09-14. PM: the Fable session. Product manager: Stack. Runs as a **parallel stream in
the Phase 10 / 11 sprint**, beside V-1. The code lives in `~/agentic-harness` (the session
capture hook, the vault, the `ingest` pipeline, the `rag` MCP server); this brief is the
requirement and contract, kept here because bb2dash is the project whose sessions are the first
test case.

Stack's ask (2026-09-14): a phase or requirement that ensures the proper context tags are
applied, archived / concluded sessions are identified, tagged with the proper relational context
and info, saved in the proper locations, and the RAG pipeline then runs from there.

## What exists today (verified 2026-09-14)

* A `SessionEnd` hook (`~/.claude/hooks/session-capture.mjs` 1.0.0) writes each finished session
  to `vault/projects/<collection>/sessions/<date>-<id8>.md` as redacted markdown with YAML
  frontmatter: `id`, `title`, `type: session`, `collection`, `session_id`, `date`, `started_at`,
  `ended_at`, `duration_minutes`, `cwd`, `end_reason`, `prompt_count`, `command_count`,
  `agent`, `generator`, `files_modified`.
* `ingest --source obsidian` walks the vault, takes `collection` from frontmatter or the second
  path segment, stores the frontmatter verbatim in `rag.documents.metadata`, and skips unchanged
  notes by `content_hash`. It is run by hand.
* `rag.search()` filters by `collection` and `source` only.

## The gaps, each with the evidence

| # | Gap | Evidence |
|---|---|---|
| G1 | **Collection is the cwd folder name**, so one project's sessions scatter across its worktrees | `projects/bb2dash-retrieval/`, and the Phase 7–9 worktrees `bb2dash-wt-db`, `-clients`, `-cd-*`, `-sl-*` would each become a "project". There is no `projects/bb2dash/` at all. |
| G2 | **No "concluded" identity.** A session resumed with `--resume` fires `SessionEnd` again; each firing writes a note keyed by the same `session_id` but a new date, or overwrites. `end_reason: other` says nothing. | sample note `2026-09-10-0e3b3d00.md`: 1,229 minutes, `end_reason: 'other'`, 4 prompts. |
| G3 | **No relational context.** Frontmatter has no git remote, branch, PR, phase, worktree, parent/child agent session, memory files touched, or plan file. Search cannot answer "sessions on `feat/retrieval-polish`" or "the workers spawned by session X". | frontmatter list above; `files_modified` is the only link and it is dominated by scratchpad paths. |
| G4 | **Wrong or noisy location for cross-project sessions.** A session started in one checkout that edits another repo files under the cwd's collection. | the sample above: `cwd` = bb2dash-retrieval, `files_modified` = agentic-harness docs. |
| G5 | **Ingest does not run from the capture.** Notes wait in the vault until someone runs `uv run ingest`; `rag` answers are stale by however long that is. | `docs/ingestion.md`: "runs as a batch job … you point it at a source". |

## Contract (R-27)

### R-27.1 Canonical collection and location

* `collection` = the **repository identity**, not the folder: the git remote's `owner/repo`
  slug (`emstacho-su/bb2dash` → `bb2dash`) resolved from `cwd`; if `cwd` is a worktree, from the
  worktree's main repository. Fallback: the folder name, flagged `collection_source: folder`.
* Class sessions (cwd under the OneDrive class folders) resolve to `classes/<course_id>` using
  the same course ids as bb2dash (`IST.323`, …).
* Location: `vault/projects/<collection>/sessions/<session_id>.md` — **one note per session**,
  named by the full id, rewritten on every `SessionEnd` (the hook already de-duplicates by
  hash on the ingest side; the note is the single source).
* A one-time migration moves the existing `bb2dash-retrieval` notes under `bb2dash` and
  rewrites their `collection`.

### R-27.2 Concluded-session identity

Frontmatter gains:

```
status: active | concluded | superseded
concluded_at: <iso>            # set when status = concluded
supersedes: [<session_id>]     # a --resume or --continue chain: the note that carried on
resumed_from: <session_id>
end_reason: clear | logout | prompt_input_exit | other   # already present; keep
```

A session is **concluded** when its `SessionEnd` fires with a reason other than a resume, or
when no resume has followed within 24 h (a nightly sweep sets it). Resume chains link both
ways so search can walk them. Nothing is deleted; `superseded` notes stay ingested with lower
rank (metadata filter in `rag.search`, R-27.5).

### R-27.3 Relational context tags

Frontmatter gains, all derived by the hook at `SessionEnd` from `cwd`, git, and the transcript:

```
repo: emstacho-su/bb2dash
branch: feat/retrieval-polish
worktree: bb2dash-wt-db | null
commits: [<sha>, …]                 # commits made during the session (git log --since started_at --author)
prs: [6]                            # from `gh pr create/merge` output or commit trailers
phase: phase-7                      # from the branch/PR title or docs/planning brief touched
tags: [retrieval, migrations, review-gates]   # curated vocabulary, see R-27.4
parent_session: <id> | null         # for subagent transcripts, the spawning session
child_sessions: [<id>, …]
memory_files: [pm-worker-arrangement, bb2dash-phase7-retrieval-polish]   # auto-memory files written
plan_file: abundant-gathering-wirth | null
docs_touched: [docs/planning/50_PHASE7_retrieval_polish.md, …]           # repo-relative, scratchpad and temp paths dropped
artifacts: [<artifact url>, …]
```

`files_modified` becomes repo-relative and excludes `AppData/Local/Temp`, `.claude/projects/…`
transcripts, and `node_modules`.

### R-27.4 Tag vocabulary

A small controlled list kept in `~/agentic-harness/docs/tags.md` (and mirrored in the vault
under `templates/`): area tags (`ingest`, `db`, `retrieval`, `gui`, `mcp`, `harness`, `docs`,
`review`, `planning`), activity tags (`phase-brief`, `integration`, `pr`, `hotfix`,
`validation`), and the phase tag. The hook applies area tags from the paths touched and the
activity tags from transcript signals (a `gh pr create`, an `apply_migration`, a `/code-review`
invocation). Anything it cannot classify gets `tags: [unclassified]` and lands in a weekly
"untagged sessions" list the PM reviews; Stack never has to tag by hand.

### R-27.5 The pipeline runs from there

* The hook, after writing the note, enqueues an ingest run: `uv run ingest --source obsidian
  --path <vault> --only <note path>` (new flag; a single-note run is one hash probe + one
  embed). Runs detached so `SessionEnd` never blocks on the model. Failures log to
  `session-capture.log` and leave the note for the next full run.
* A nightly full `ingest --source obsidian` (Windows Task Scheduler, same command the docs
  already give) reconciles anything the per-note run missed and sets `concluded` on stale
  `active` notes (R-27.2 sweep).
* `rag.search()` gains `filter_metadata jsonb` (contains-match on frontmatter: `{"repo":
  "emstacho-su/bb2dash"}`, `{"phase": "phase-7"}`, `{"tags": ["review"]}`) and an option to
  exclude `status: superseded`. The `rag` MCP `search_context` tool exposes `repo`, `phase`,
  `tags`, and `include_superseded`.

### Acceptance

- [ ] Every Phase 7–9 session (main checkout **and** worktrees) is under
      `vault/projects/bb2dash/sessions/`, one note per session id, with `repo`, `branch`,
      `phase`, `prs`, `status` populated; the `bb2dash-retrieval` folder is gone.
- [ ] `search_context(query="matched-passage snippets", repo="emstacho-su/bb2dash",
      phase="phase-7")` returns the Phase 7 PM session and its two worker sessions, and the
      workers carry `parent_session` = the PM session.
- [ ] A session ended, then resumed, then ended again yields one `concluded` note whose
      `supersedes` chain is intact; the earlier note is `superseded`.
- [ ] Ending a session updates `rag` within a minute without any manual step; the log shows
      the per-note ingest.
- [ ] Nightly run is registered and its last run time is visible in the log.
- [ ] `docs/ingestion.md` and `docs/retrieval.md` in agentic-harness describe the new fields,
      the tag vocabulary, and the scheduler; `ingest` tests cover the new frontmatter and
      the `--only` flag (the suite is at 261 today; it must not drop).

## Workers and PRs

Two PRs in `~/agentic-harness`, one worker each, same PM/worker arrangement:

* **W-H1 hook + vault** (`feat/session-context`): R-27.1–27.4, the one-time migration of
  existing notes, `docs/tags.md`, hook tests (there are none today; add a fixture transcript).
* **W-H2 pipeline + retrieval** (`feat/ingest-on-capture`): R-27.5 — `--only`, the scheduler
  registration script, `rag.search` `filter_metadata` (new migration in that repo's
  `db/migrations`, applied to `harness-memory`, byte-identical), `rag` MCP tool inputs, docs.

Seam: the frontmatter field names above are frozen; W-H2 builds against them with fixtures.

## Out of scope

Hermes Agent (harness Phase 7), any change to the bb2dash materials store (a different vector
space; the two stores never cross), tagging by hand, and re-ingesting the claude-mem history
with new tags (it predates git context; leave it as `source='claude-mem'`).

# 92 — Sprint 2 research: harness-v2-vault

Date 2026-09-24 · Researcher: Sonnet (Stage B) · Scope: R-97..R-107 (§1.8) and §2 P-52..P-61, §6 questions 43–46

## 0. Summary

Every item here is either a small, mechanical fix to code that already runs (R-97, R-98, R-101,
R-102, R-103) or a status the harness has already closed and bb2dash only needs to record (R-99,
R-100, R-104–R-107). None needs new infrastructure: no queue, no scheduler, no new service.
Standard practice for every piece — pre-commit secret scanning, env-driven config, dead-letter
triage cadence, branch-derived release metadata, per-tenant redaction rules, migration cutover
smoke tests — is decades old and well-tooled in OSS (gitleaks, detect-secrets, Presidio,
semantic-release, obsidian-git); research below borrows patterns, not packages, since the
harness's own redact.mjs/tags.mjs/realm-sync.mjs already do the job and a new dependency would
violate its "no dependencies" test posture. The **biggest risk** is R-98: a secret can reach a
repo's git history through `/checkpoint`'s hand-written no-node fallback path, which no test and
no redaction pass covers, and unlike every other item here a leaked secret cannot be un-leaked by
a later fix — it needs rotation. The **second risk** is R-101's phase regex:
`PHASE_IN_BRANCH = /phase[-_ ]?(\d{1,2})\b/i` (confirmed in `hooks/lib/tags.mjs:48`) matches no
lettered phase (10a/10b/11b/12b) and no multi-phase session, so the spelling decision (P-52) must
come before code changes, not after. **Total size**: R-98/R-102/R-103 are genuinely S; R-97 and
R-106 are S-to-M once the config-loading pattern is shared; R-101 is the only true M (regex
redesign + backfill + re-embed across ~373 notes); R-99/R-104/R-105/R-107 are process/docs work
already largely done, correctly sized S in the record. Nothing here should grow past what §2's
P-52..P-61 already budget.

## 1. R-97 — /inbox-apply writes decision notes into the live vault's projects realm

**1. Standard practice.** Twelve-Factor's config principle is exactly this bug's shape: "store
config in the environment... unlike config files, there is little chance of them being checked
into the repo accidentally," and config should be validated and the process should fail fast
rather than write to a stale path silently (12factor.net/config; a practitioner's caution on the
same page: config validated at startup, not caught on first faulty write). SKILL.md hardcoding a
vault path is the anti-pattern the principle exists to prevent.

**2. OSS examples.** (a) `dotenv`-style loaders (the pattern discussed at
dev.to/hugo__df/12-factor-nodejs-application-configuration-management) read one file at process
start and populate `process.env`, never re-resolving per call — borrow the "resolve once, pass
down" shape rather than re-reading `machine.env` on every write. (b) The harness's own
`hooks/lib/constants.mjs` already does this for `HARNESS_VAULT`/`VAULT_ENV_VAR` with a
`DEFAULT_VAULT_SEGMENTS` fallback (confirmed: `VAULT_ENV_VAR = 'HARNESS_VAULT'`,
`DEFAULT_VAULT_SEGMENTS = ['OneDrive - Syracuse University', 'vault']` — the fallback itself is
now the R-103 stale-path bug, a cautionary example of what happens when a fallback is never
revisited after the primary source changes). (c) `hooks/doctor.mjs`'s pattern of printing what
every tier resolved to, so a misconfigured consumer is visible before it writes, is the right
shape for SKILL.md's new "checks `<vault>/projects/.realm` reads `projects`" guard.

**3. Known pitfalls.** A loader that falls back silently to a stale default (as
`DEFAULT_VAULT_SEGMENTS` does today) turns a missing-env-var bug into a wrong-path bug instead of
a loud failure — the 12-factor validate-at-startup discipline is what R-97's "stops otherwise"
guard is for. A second pitfall specific to this fix: `ingest --only` requires `--path`
explicitly (state-today note), so a loader that reads `HARNESS_VAULT` but forgets to thread it
into the `uv run ingest --only` argv reproduces the same class of bug one call downstream.

**4. Maps onto this stack.** `skills/inbox-apply/SKILL.md` (repo, lines 31-34) and the identical
installed copy `~/.claude/skills/inbox-apply/SKILL.md` both need the same three-line change:
read `HARNESS_VAULT`/`HARNESS_INGEST_PROJECT` from `~/.harness/machine.env` (or
`$HARNESS_MACHINE_ENV`, the harness's own override variable per `docs/portable.md` §Machine
file), write `<vault>/projects/bb2dash/decisions/inbox-<id>.md`, and pass `--path <vault>` to
`uv run ingest --only`. No bb2dash migration, table or RPC is touched — this is a skill-file
change plus a doc line, and it must land before the next `/inbox-apply` or `/bb-sync` run
(bb-sync step 0 runs it).

**5. Size S**, for R-101 tag `P-59`'s dependency (a container running `/inbox-apply` needs the
same machine-file pattern, generalized). Seams: `bb-sync` step 0; realm `projects`'s push
policy (G-4's nightly sync is what actually gets the notes to GitHub); Phase 14's W-28 container
if it runs `/inbox-apply` (P-59).

**6. Changes to the requirement as written.** Sharpens only: the requirement text already names
the exact fix; research adds that the guard-and-fail-fast shape should mirror `doctor.mjs`'s
"print what resolved" pattern rather than a bare early-return, so a future stale-path bug is
loud in the skill's own transcript, not silent until an /inbox-apply run's target is checked by
hand.

## 2. R-98 — /checkpoint notes are redacted before they enter a repo's git history

**1. Standard practice.** Redaction belongs at the write boundary, before a commit, not
downstream at read time: pre-commit secret scanners (gitleaks, detect-secrets) exist because "a
secret in git history requires history rewriting to remove"
(github.com/gitleaks/gitleaks .pre-commit-hooks.yaml notes; Microsoft's own Engineering
Fundamentals Playbook on detect-secrets makes the same point). The accepted pattern is: scan
staged content before the commit is recorded, block or redact on a hit, and treat any change to
the allow/baseline list as a reviewed change in its own right (detect-secrets' baseline-as-code
governance, per its docs and multiple 2026 write-ups).

**2. OSS examples.** (a) `gitleaks/.pre-commit-hooks.yaml` (fetched 2026-09-24): the canonical
hook line is `gitleaks git --pre-commit --redact --staged --verbose` — `--staged` scans exactly
what is about to be committed and `--redact` keeps a caught secret out of the hook's own console
output; the entry-point shape (one command, no network, exits nonzero on a hit) is the one to
borrow for a `build-note.mjs` pre-write pass. (b) `detect-secrets`'s baseline model (audit new
hits interactively, commit the baseline as a reviewed change — Yelp's tool, appsecsanta.com and
the Medium best-practices piece) is the wrong shape for a one-shot note-writer (no interactive
audit step exists at session end), but its "scan only the staged diff, in seconds" performance
argument applies directly to a `< 1,200 ms` sibling budget for `/checkpoint`. (c) The harness's
own `hooks/lib/redact.mjs` (16 rules, JWT/`sb_`/connection-string/PEM/bearer coverage, called
from `note.mjs`, `transcript.mjs`, `subagent.mjs` and the checkpoint *collector*) is the correct
rule table to reuse — the gap is only that `skills/checkpoint/build-note.mjs` never calls it,
confirmed by `git grep -i redact` returning nothing under `skills/`.

**3. Known pitfalls.** Downstream-only redaction (scan after the fact, as the collector does
today) leaves the secret in cleartext in git history for however long the note existed unmerged —
gitleaks' own pre-commit rationale exists specifically because a committed secret needs history
rewriting to actually remove. A second pitfall the harness's own design doc already names:
`redact()`'s rules are keyed on *shape* (JWT structure, `sb_` prefix, connection-string syntax) —
a secret repeated in prose with no such shape is uncatchable by this class of tool, which is why
`hooks/README.md`'s rule 3 keeps its tool-output exceptions to "one capture group each" rather
than broad scanning.

**4. Maps onto this stack.** `skills/checkpoint/build-note.mjs` (currently "imports only node
built-ins," no `redact` reference) gains a body-and-git-string redaction pass; `redact.mjs`'s
16-rule table is the source of truth, shipped as a third payload file in
`hooks/install-checkpoint.mjs` (today `PAYLOAD = ['SKILL.md', 'build-note.mjs']`, SHA-256 checked
on install) so bb2dash's installed `.claude/skills/checkpoint/` copy stays byte-identical without
a runtime import of `hooks/lib` (the skill cannot import it at runtime). The hand-written no-node
fallback (SKILL.md:51-103, for a sandbox with no `node`) is the one path a payload-file fix
cannot reach — Stack's call is whether it is retired, given an inline copy of the rule table, or
accepted as the residual risk R-98's "Notes" line already names.

**5. Size S** for the payload-file + test change; the no-node-fallback decision is a Stack call,
not extra engineering. Seams: `hooks/tests/checkpoint-build.test.mjs` (P-57's pin test lives
here — byte identity or a rule-table diff, the way the serializer copy is already pinned per
that file's line 76-77); the harness's own memory-sprint spec R-H5 plans the identical guard for
`~/.claude` commits, so one scanner module can serve both call sites if built as a shared export
rather than copy-pasted twice.

**6. Changes to the requirement as written.** Sharpens: research confirms the fix is a shared
payload/import problem, not a missing-feature problem (the rule table already exists and is
proven in tests elsewhere), which argues for reuse over a rewrite; and it surfaces the no-node
fallback as a real, separate decision point the requirement's "Still missing" list already
lists but should carry into §6 explicitly if Stack has not weighed in (it has not, per the
requirement's own "No DECISIONS row does yet").

## 3. R-99 — V-2 closed on record: acceptance walked on live data, docs corrected

**1. Standard practice.** A definition-of-done that is "PM-verified... with the evidence pasted"
is an acceptance-testing discipline, not a novel one: the accepted shape is a dated verification
note with reproducible commands and their output, checked in beside the artifact it verifies —
the same shape ADRs (architecture decision records) use for "status: accepted, evidence: ...".
Nothing here needs new tooling; it needs the walk actually run and written down.

**2. OSS examples.** Not applicable in the "borrow code" sense — a process/docs requirement, not
a build. The closest useful pattern is the ADR convention (a numbered, dated, append-only
decision log with a status field), which `project-state/DECISIONS.md` and the proposed
`docs/planning/sprint-2/verification/` folder already follow.

**3. Known pitfalls.** Running the acceptance walk on stale intake numbers is the concrete
pitfall already caught in-record: intake `S2-carry-3` still says "262 of 267 bb2dash session
notes carry an empty phase," an OneDrive-era count, while the live figure is "5 of 373" — a
verification note against the wrong baseline would under-report progress and mislead the
phase-derivation work (R-101) it is supposed to gate.

**4. Maps onto this stack.** `docs/planning/sprint-2/verification/` (new folder, numbered per
`docs/planning/README.md:48-50` convention, e.g. `92a` or a fresh number after Stage B); the
walk itself runs against `~/agentic-harness`'s `harness-memory` Supabase project
(`hqkytnyiiuxovnnyixye`), never the bb2dash project — `list_migrations` and one
`EXPLAIN ANALYZE` there, not here. `project-state/STATUS.md`, `ORCHESTRATOR.md`,
`docs/planning/sprint-2/90_SPRINT2_INTAKE.md` all get the correction in the same PR as the
verification note, per the existing "Stage D corrects from this table" convention already used
for the "Closed at Stage A" table (§5 of the requirements doc itself).

**5. Size S.** Blocked on G-5/G-6 (R-101/R-102) for two of the six DoD lines, so it cannot fully
close until those land, but the walkable two-thirds can run now. Seams: open PR #26 also edits
`ORCHESTRATOR.md`/intake — merge around it, do not touch its hunks.

**6. Changes to the requirement as written.** No change to scope; research confirms the fix is
entirely bb2dash-repo bookkeeping plus one harness-project SQL walk, with no code to write.
Recommends explicitly numbering the verification note before the Stage B batch closes, since
"the folder does not exist yet" is otherwise a stall point at integration time.

## 4. R-100 — Every automated vault writer syncs its realm live, without conflict

**1. Standard practice.** "Commit, then merge-pull, then push — never rebase, never autostash
unattended" is exactly the pattern the harness's own `docs/portable.md` documents and the
requirement text quotes; it matches the community consensus for automated git sync tools.
git's own docs warn that `--autostash` "should be used with care" because "the final stash
application after a successful rebase might result in non-trivial conflicts"
(git-scm.com/docs/git-rebase, already cited in the harness's own R-B1) — an unattended job
cannot resolve a non-trivial conflict, so it must never be in a position to create one.

**2. OSS examples.** (a) **obsidian-git** (the community plugin most directly comparable to this
job — same tool, same "sync a folder of markdown by git on a timer" shape): its documented flow
is "stage → commit (timestamped) → `git pull --rebase` → push," yet multiple 2026 guides
recommend `merge` over `rebase`/`reset` as "the safest default for a shared vault" precisely
because an unattended rebase can silently rewrite history a second machine already based work on
(community.obsidian.md; ahmorris.org/posts/obsidian-git). Its own conflict UI ("keep local / keep
remote / edit merged") is *interactive*, unavailable to a nightly job — which confirms the
harness's choice (`--no-rebase --ff --no-autostash`, `git merge --abort` + exit 2 on conflict) is
the correct unattended analogue, stricter than obsidian-git's default on the one failure mode
that matters when nobody is watching. (b) `git-dirsync` (github.com/deweysasser/git-dirsync,
already cited in R-B3) is the direct precedent for "a lock file plus a stale-lock takeover" as
the fix for two scheduled jobs interleaving stage/commit — the harness's `harness-sync.lock`
(PID + timestamp, 30-minute staleness) is that pattern implemented.

**3. Known pitfalls.** `workspace.json` (Obsidian's per-device UI state file) is "the top source
of spurious conflicts" in every obsidian-git guide surveyed — the harness's decision to keep
`.obsidian` entirely untracked, outside every realm (2026-09-23 decision) sidesteps this class of
pitfall entirely rather than fighting it with `.gitignore` rules the way obsidian-git users are
advised to. A second pitfall: a credential that silently prompts (`GCM_INTERACTIVE` unset) hangs
a scheduled task forever instead of failing — R-B4's fix (fail closed in under 30s) is correct
but unproven per R-100's "Still missing" line (no unregister-credential live test recorded yet).

**4. Maps onto this stack.** Entirely harness-owned code (`hooks/lib/realm-steps.mjs`,
`realm-sync.mjs`, `realm-lock.mjs`, `hooks/sync-realms.mjs`,
`scripts/nightly-ingest.ps1 -RealmSync Apply`); bb2dash contributes only the **container-writer**
line for Phase 14 — any container that writes the vault (the harness-jobs image, or a bb2dash
container running `/inbox-apply`) must call `sync-realms.mjs` under the same lock, with its own
`HARNESS_MACHINE` name and a credential that fails closed the same way R-B4 specifies. No bb2dash
migration or table.

**5. Size M** (matches the record's own "partly built" sizing) — code is merged and unit-tested,
but the three-consecutive-Apply-nights proof (earliest 2026-09-27 per the state-today note) and
R-B4's live credential test are outstanding, and both are calendar-gated, not effort-gated.
Seams: G-1 (R-97)'s decision notes reach GitHub only through this sync; G-9 (R-105)'s VM gate;
Phase 14's harness-jobs image and machine.env template (P-59).

**6. Changes to the requirement as written.** No scope change. Research confirms the design
(commit-merge-pull-push, lock, fail-closed credentials) already matches best practice for
unattended git sync of a shared folder, better than the nearest off-the-shelf tool
(obsidian-git's own rebase-first default) on the specific failure mode that matters here
(non-trivial unattended-rebase conflicts). The only addition: log the "why merge over rebase"
choice against obsidian-git's own documented pitfall the next time `docs/portable.md` gets a
docs pass (feeds R-104), since the current text states the choice but not the comparison.

## 5. R-101 — bb2dash session notes carry derivable phase and repo; phase retrieval works

**1. Standard practice.** Deriving structured metadata (a version, a phase, a ticket id) from a
branch or PR name is exactly what release-automation tooling does, and the accepted practice is
a small number of well-defined name shapes rather than an open regex: semantic-release resolves
branch type "based on naming convention and/or properties" against a **configured** branch list
(main/next/beta/alpha/maintenance ranges N.N.x), and treats anything outside that list as simply
not a release branch, rather than guessing
(semantic-release.gitbook.io/semantic-release/usage/workflow-configuration). The same "a
recognized shape wins, everything else is 'no answer'" discipline is what R-101 and its
"a wrong phase is worse than no phase" design rule (already frozen in `hooks/lib/tags.mjs:62-64`
per the requirement) already commit to — the gap is only that the *set* of recognized shapes
(`phase-N` only) is smaller than bb2dash's real branch vocabulary.

**2. OSS examples.** (a) semantic-release's maintenance-branch matching
(`N.N.x` / `N.x.x` / `N.x`, github.com/semantic-release/semantic-release discussion #2457 and
the GitBook workflow-configuration page) is the direct template for "a small table of named
shapes, each with its own regex, tried in order" — bb2dash's `10a`/`10b`/`11b`/`12b` naming is
structurally the same problem as a maintenance-range suffix and wants the same fix: extend
`PHASE_IN_BRANCH` to `/phase[-_ ]?(\d{1,2})([a-z]?)\b/i` (or a small explicit alias table) rather
than a fully open-ended parser. (b) Conventional-commit issue-linking regexes such as
`/[A-Z]+\-[0-9]+/` for Jira keys (the Conventional Commit Regex gist) confirm the general shape
even though bb2dash has no ticket system to copy directly: derive from a **fixed anchor string**
plus a **bounded suffix**, never a bare free-text search. (c) `hooks/tests/tags.test.mjs`'s own
golden-fixture-set approach (formalized as P-53) is the right test shape here, the same one
semantic-release's own suite uses for branch resolution (name → expected result, one row per
case, failing first).

**3. Known pitfalls.** The requirement's own "State today" already names the concrete failure:
`0e3b3d00` is tagged Phase 7 but is really the PR #5 session; PR titles are "a weak source: 11 of
373 notes carry a PR number, and #7, #18 and #25 would give wrong phases" — the same pitfall
semantic-release's config-over-inference design avoids: a string that *looks* like a match but
is not is worse than no signal, which is why the harness's own rule treats a wrong phase as
strictly worse than an empty one. Second: worker notes inherit `main` today because
`analyse.mjs:95-104` passes no PR titles to the hook path — a regex fix alone does not close
this; the parent-session inheritance (P-52) has to ship alongside it or the fix only reaches PM
notes, not the workers that outnumber them 62:5.

**4. Maps onto this stack.** `hooks/lib/tags.mjs` `derivePhase` (the regex and source order:
branch → PR titles → planning path); `hooks/lib/vocabulary.mjs`
`PHASE_TAG_PATTERN = /^phase-([1-9][0-9]?)$/` (confirmed by direct read — needs to widen if the
tag grows a letter, e.g. `phase-10a`, with `docs/tags.md`'s phase section changed in the same
commit since `vocabulary.test.mjs` keeps the two equal); `hooks/lib/backfill.mjs` and
`hooks/migrate-sessions.mjs` for the one-off pass (P-54); `note.mjs`'s `factRows` (a re-render
re-embeds one chunk per note, which P-54 already budgets for). No bb2dash migration — this is
vault/store metadata only.

**5. Size M** (matches record). This is the one item in-scope whose fix genuinely spans a regex
redesign, a fixture-first test (P-53), a spelling decision that has to come first (P-52), a
one-off backfill across ~373 bb2dash notes plus re-embedding the changed chunks (P-54), and a
re-filing of ~72 misfiled notes under `memory/`/`projects/`/`agentic-harness/`. Seams: shares a
harness PR with G-6 (R-102) per the requirement's own note; feeds R-99's acceptance-query DoD
lines 1-2/10.

**6. Changes to the requirement as written.** Splits cleanly into the sequence §2 already
encodes (P-52 spelling decision → P-53 fixture tests → code change → P-54 backfill), which
research confirms is the right order (semantic-release's own practice is config-then-code, never
code-then-config). Adds one sharpening: the worker-note-inherits-parent-phase fix is not
optional plumbing, it is required for the fix to reach the majority of notes, and should be
named as its own checkable line in whichever brief carries this rather than folded silently into
"backfill."

## 6. R-102 — No session note carries more than five hook-applied tags

**1. Standard practice.** A capped, provenance-tagged merge — new automated output replaces the
*previous automated* output rather than unioning onto it forever, while hand additions are
kept — is the standard shape for any idempotent-merge writer (the same shape a Kubernetes
controller's server-side-apply field-manager model uses: each writer owns its own field set and
a later write from the same writer replaces, not appends, its own prior contribution). The
harness's own `mergeFields`/`mergeTags` (confirmed by direct read of `hooks/lib/merge.mjs:124-166`)
already does this correctly for every other list field via `LIST_CAPS`, but `tags` is explicitly
carved out ("`tags` is not in `LIST_CAPS`: manual tags are uncapped, and `mergeTags` owns the
union... outright") and `mergeTags` itself calls `uniqueCapped([...], null)` — a `null` cap,
i.e. no cap at all, confirmed by direct read.

**2. OSS examples.** (a) The field-manager pattern above (conceptually — no single canonical OSS
repo to point at for a markdown-frontmatter equivalent) is the right mental model: "this
writer's five slots" vs "the note's tag list" are different collections that need to be merged
separately, not unioned once and capped after. (b) `hooks/tests/merge.test.mjs:120-123`
(already read via the requirement) is itself the right *test* shape — "a 9-tag union survives" —
and needs reframing (not deletion, per the requirement's own note) once hook-applied tags carry
their own field. (c) `hooks/tests/tags.test.mjs:45-55`'s golden-fixture approach, the same
pattern R-101 borrows, is the right shape for P-55's "re-render test that asserts at most five
hook tags on a re-captured subagent note."

**3. Known pitfalls.** The general pitfall this class of bug produces — an uncapped union that
looks capped in every *single* render — is exactly what a 2026-09-24 vault scan already caught:
"6 session notes with 6 vocabulary tags... replaying today's classifier gives at most 5, so the
sixth came from renders under an older classifier or another branch context." This is the
textbook failure mode of a per-render cap with no provenance field: the cap is enforced at
generation time but not at merge time, so repeated re-renders (which `SubagentStop` fires "at
*every* stop point of a multi-turn worker... nine firings for one worker is normal," per
`hooks/README.md`) can each contribute up to 5 *new* hook tags that never get pruned against each
other.

**4. Maps onto this stack.** `hooks/lib/merge.mjs` `mergeFields`/`mergeTags`; `hooks/lib/
tags.mjs` (the classifier, unchanged); `hooks/lib/constants.mjs` `LIST_CAPS` (a `hook_tags` entry
if a provenance field is added, additive to `FIELD_SPEC` per the "add-only" rule
`hooks/lib/frontmatter.mjs` already enforces); `hooks/lib/subagent.mjs:185-191` and
`hooks/lib/sweep.mjs:232-239` (the two re-merge call sites that need the same fix). No bb2dash
code or schema touches this — it is entirely a harness vault-note field.

**5. Size S** (matches record). Seams: shares a harness PR with G-5 (R-101) per the requirement's
cross-reference; the DoD's array-length SQL (`select ... where array_length(tags,1) > 5`,
implied by the requirement) is the check that closes R-99's DoD bullet 5, so this has to land
before that walk.

**6. Changes to the requirement as written.** No scope change; research confirms the fix (a
`hook_tags` provenance field so `mergeTags` can replace-not-union its own prior output) is the
standard shape for this bug class and that the harness's own test suite already has the right
skeleton (`merge.test.mjs`, `tags.test.mjs`) to extend rather than replace. Recommends the P-56
one-off repair run explicitly re-check the same 6 notes after the fix ships, since a repair that
runs before the merge fix lands would just regrow to 6 on the next `SubagentStop`.

## 7. R-103 — Unclassified session notes reach the PM on a fixed cadence

**1. Standard practice.** This is structurally a dead-letter-queue triage problem: "a named
owner... responsible for triaging on a schedule" plus "define what happens after a message
remains untriaged for a day, a week, or a month" (DLQ-triage write-ups surveyed, e.g.
dev.to/gabrielanhaia's 5-category taxonomy and the DLQ pattern literature broadly) — the
consensus failure mode named across every source is identical: "without ownership, classification,
and replay rules, the [queue] becomes a hidden-loss buffer rather than a controlled recovery
mechanism." `tags: [unclassified]` is exactly such a dead letter, and R-103's gap — the review
tool exists, nothing schedules it — is precisely "a DLQ with no named cadence."

**2. OSS examples.** (a) GitHub's own `actions/stale` pattern (cron-scheduled, walks a
collection, acts past a threshold) is the closest packaged analogue but the wrong tool here:
bb2dash/harness run on Windows Task Scheduler, and GitHub's own scheduled-workflow caveats
(recognition delay 15 min–1 hr; auto-disabled after 60 days of repo inactivity, confirmed by
search) are the class of "silent no-show" failure Task Scheduler with a logged run already
avoids — cited as a reason *not* to move this to GH Actions. (b) The DLQ-triage literature's
"alert when depth crosses a threshold" maps onto a possible sharpening: today's plan is purely
time-based, but a count-based early trigger is a known refinement (flagged as research-added,
not required). (c) `hooks/untagged-sessions.mjs` itself (existing, tested, 5 tests, a clean CLI)
is the correct implementation to schedule, not rebuild — confirmed by direct read, its default
vault path (`VAULT_ENV_VAR` → `DEFAULT_VAULT_SEGMENTS`) falls back to the **OneDrive** path
(`['OneDrive - Syracuse University', 'vault']`, `constants.mjs:150-151`), so even a manual run
today silently reads the wrong, now-empty folder unless `--vault`/`HARNESS_VAULT` is passed.

**3. Known pitfalls.** The concrete pitfall already measured: "228 of 363 bb2dash notes and 114
of 199 harness notes are unclassified" — a backlog this size run through a *weekly* cadence for
the first time will dump ~230 rows on the PM in one sitting, which the DLQ literature's "some
messages should escalate as they age" principle suggests handling as a one-time bulk pass
(perhaps batched, or explicitly scoped to "since the last review" as the requirement's default
already proposes) rather than presenting the whole backlog as this week's list. The stale
default-path bug above (`DEFAULT_VAULT_SEGMENTS`) is itself a pitfall instance of "a tool that
looks configured but silently reads stale state" — the same class of bug R-97 fixes for
`/inbox-apply`.

**4. Maps onto this stack.** `hooks/untagged-sessions.mjs` (no code change needed, just a caller);
`hooks/lib/constants.mjs` `DEFAULT_VAULT_SEGMENTS` (should resolve through the machine file, the
same fix R-97 needs, rather than a hardcoded OneDrive fallback — worth doing once, shared);
`scripts/nightly-ingest.ps1` (a new weekly step) or `.claude/skills/bb2dash-pm/SKILL.md` (a
session-start checklist line) as the two candidate homes the requirement already names; the
harness memory-sprint spec's Phase C "weekly read-only curator" (decision 6) is a third possible
home — worth a one-line question if it is not already decided, since building the cadence twice
(nightly script step and curator task) would be redundant.

**5. Size S** (matches record). Seams: `hooks/lib/constants.mjs`'s stale fallback overlaps R-97's
fix; the doc-path fix (docs/tags.md:126, docs/ingestion.md:503 both point at the OneDrive stub)
overlaps R-104.

**6. Changes to the requirement as written.** No scope change; confirms "wire the existing tool
to a cadence" is correct and small. Adds one research-backed refinement worth offering to Stack
as an option, not a requirement: a count-based early trigger (e.g., unclassified count above a
threshold) alongside the weekly time-based one, since the DLQ literature treats a pure time
cadence as the minimum viable version, not the ideal one — sized separately below
(research-added).

## 8. R-104 — Harness docs describe the realm vault and local store truthfully

**1. Standard practice.** Docs-as-code with an explicit self-check is the relevant practice, and
the harness already states it as a first-class rule: "if a document here describes something in
the present tense, it should be verifiable against the live database or the filesystem"
(`README.md:282-287`, unchanged at `ae46b10`). This is the same discipline behind "executable
documentation" broadly (docs whose claims are checked, not just written) — the requirement is a
docs-pass to bring the text back into compliance with a rule the repo already holds itself to.

**2. OSS examples.** Not a code-borrowing item — no external repo's doc-truthfulness tooling
applies here better than the rule the harness already states. The transferable idea is a doc
"status table" pattern — README/CONTEXT rows refreshed from an executed run rather than a static
grep, which is what the requirement's own line already asks for.

**3. Known pitfalls.** Stale docs that describe a superseded design (OneDrive paths, "the script
does three things" describing a script that now runs six steps) are worse than no docs because a
reader — including a future PM session reading `docs/portable.md`/`vault-migration-
requirements.md` per `ORCHESTRATOR.md`'s own review list — will act on the stale claim. This is
the same failure class the harness's own present-tense rule exists to prevent, and it is already
visible in-repo: `README.md:139-140` and `:184` still name the OneDrive path after the realm
move.

**4. Maps onto this stack.** Entirely `agentic-harness` repo docs (`README.md`,
`docs/ingestion.md`, `docs/tags.md`); no bb2dash file. `hooks/README.md`'s field table is the one
piece with a concrete, checkable gap (omits `machine` and seven other fields the hook writes,
confirmed by the requirement's own reading) — this is the most valuable line item since it is a
contract other tools (search filters) read against.

**5. Size S** (matches record). Seams: can ride Phase 14's W-28 docs task if that worker stream
exists; cross-referenced from R-99's verification note.

**6. Changes to the requirement as written.** No scope change; a pure documentation task with no
research-driven addition beyond noting that the field-table gap (`hooks/README.md`) is the
highest-value single line to fix first, since it is the one other requirements (R-99's DoD, a
future `search_context` caller) actually read as a contract rather than prose.

## 9. R-105 — Internship VM runs the harness; its work-vm realm round-trips home

**1. Standard practice.** A written runbook, followed literally on the second machine with every
deviation captured as a doc fix in the same PR, is standard day-2-operations practice for
bringing up any new environment from an existing one — the value is specifically in the
"deviation recorded" discipline, since an unrecorded workaround on machine two silently forks
the runbook from machine three onward. `docs/portable.md`'s "second machine" section already
states this as R-E1's requirement verbatim.

**2. OSS examples.** Not applicable — infrastructure bring-up on a machine outside this
research's reach (an internship VM), governed entirely by harness-owned scripts
(`hooks/init-realm.mjs`, `hooks/doctor.mjs`, `db/docker-compose.yml` pinned to
`pgvector/pgvector:0.8.6-pg17`) already built and used once (home-pc's own migration). No
external tool improves on "run the same runbook a second time."

**3. Known pitfalls.** The access-model pitfall the harness has already caught and fixed once
(decision 7, PR #17): a fine-grained PAT "reaches only the repositories its own account owns," so
an `emstacho-su`-account token cannot read a work-account-owned repo — the fix (a separate work
GitHub account owning `vault-work-vm`, `emstacho-su` added only as a read collaborator) is the
correct shape and should not be re-litigated; the earlier text (a supervisor-gated `projects`
clone on the VM) is explicitly stale per the requirement.

**4. Maps onto this stack.** No bb2dash file, table or migration. This is entirely harness-side
(`docs/portable.md:185-253`, `hooks/init-realm.mjs`, `db/docker-compose.yml`) and gates the
harness's own R-F1/R-F2. Listed here, per the requirement's own framing, purely so bb2dash
planning does not accidentally schedule it as bb2dash work.

**5. Size M** (matches record — it is a full second-machine bring-up, not a code change), but
**zero bb2dash size**: no bb2dash brief, phase or migration depends on it.

**6. Changes to the requirement as written.** No scope change; confirms this is correctly
excluded from any bb2dash phase brief and should not appear in Phase 14's Contract beyond the
container-writer line R-100 already owns.

## 10. R-106 — Per-machine extra redaction patterns scrub employer names before notes leave

**1. Standard practice.** Layered redaction — a fixed, tested base rule set plus a
per-deployment/per-tenant custom pattern list applied after it — is exactly how production PII
tooling is built: Microsoft Presidio's own architecture separates "predefined recognizers" from
"custom recognizers... based on configuration file fields," loaded via a
`RecognizerRegistry.add_recognizers_from_yaml(...)` call or a `RecognizerRegistryProvider` that
reads a config file at startup (microsoft.github.io/presidio/analyzer/recognizer_registry_provider,
github.com/microsoft/presidio docs, both confirmed by search); the base rules never change per
deployment, only the additive layer does.

**2. OSS examples.** (a) Presidio's YAML recognizer-config pattern (above) is the direct template
for `HARNESS_REDACT_EXTRA`: a named config file, loaded once at process start, validated, applied
*after* the built-in rules — exactly the "predefined + custom, custom from a config list" shape
Presidio's own docs describe. (b) **scrubadub** (Python, lighter-weight "rule-based cleaners,"
per the comparison piece surveyed) is the better structural match for `redact.mjs` than Presidio
(NLP/NER-backed, far heavier than a 1,200 ms hook budget allows) — its plug-in "detector" model
(each pattern an independent, composable unit) is already how `SECRET_RULES` is structured
(`{name, re, to}` objects in a frozen array), the right shape to extend for a loaded-from-JSON
rule too. (c) Both tools' "malformed input is logged and skipped, never a hard crash" convention
is the correct failure mode for a hook that must never block session exit (rule 1 of
`hooks/README.md`'s four rules).

**3. Known pitfalls.** A regex-based extra-rules loader that is not itself budget-tested can blow
the hook's 1,200 ms envelope on a large transcript, the same pitfall `tests/budget.test.mjs`
already guards for the built-in rule set (confirmed: "< 1,200 ms over 18 MB, with the real
`git log`") — any new loader needs the same fixture run through it, not a smaller one. Second, from
the Presidio/scrubadub literature broadly: a badly-written custom pattern (over-broad, matching
common words) produces false positives that erode trust in the whole pass — "validates and
compiles each pattern" (does the regex compile) is not the same check as precision (does it
over-match), and only a real fixture test catches the second.

**4. Maps onto this stack.** `hooks/lib/redact.mjs` (an optional loaded rule set appended after
`SECRET_RULES`, applied by the same `redact(text)` function so all five callers —
`note.mjs`, `transcript.mjs`, `subagent.mjs`, the checkpoint collector — get it for free);
`~/.harness/machine.env`'s `HARNESS_REDACT_EXTRA` variable (named in
`vault-migration-requirements.md` today but not yet read by any code, confirmed by `git grep`).
No bb2dash code touches this — harness-only, listed here only because R-106 is in-scope.

**5. Size S** (matches record; "can be built on home-pc before the VM exists," per the
requirement). Seams: `redact.mjs` callers do not currently load the machine file into
`process.env`, so the loader needs its own explicit read, not an assumption that
`process.env.HARNESS_REDACT_EXTRA` is already populated by the time `redact()` runs; the dev
container and harness-jobs image (Phase 14) run the same code path, so this should be built once
and shared, not duplicated per runtime.

**6. Changes to the requirement as written.** Sharpens: research confirms the Presidio/scrubadub
prior art validates the two-layer design already specified (built-in + per-machine extra,
applied in that order), and adds one concrete test requirement the current text does not name
explicitly: the extra-rules loader must be exercised by the *same* budget fixture as the built-in
rules, not a new smaller one, since the failure mode (a slow custom regex on a large transcript)
is only visible at that fixture's scale.

## 11. R-107 — Vault move closes: smoke test passes, both old copies deleted

**1. Standard practice.** A scripted before/after smoke test, checked into the migration PR, with
a fixed rollback window before the old copy is deleted, is standard cutover discipline for any
data migration: "define your rollback threshold before go-live... a hard stop time... a data
error threshold," and "after cutover, the source stays available but untouched for an agreed
period" (cutover-checklist literature surveyed, e.g. Concentrus's cutover-plan piece and the
CI/CD cutover-phase guide) — precisely R-C1/R-C4/R-F1/R-F2's shape (copy → verify → archive →
cutover → timed deletion) as already built.

**2. OSS examples.** Not a code-borrowing item — no external tool does "verify an
Obsidian-vault-to-git-realm cutover." The transferable pattern is the **two-gate** structure: a
technical smoke test (counts, checksums, a handful of representative queries returning the same
top results before/after) gated before the announcement, and a separate, later, calendar-gated
deletion — exactly R-F1 vs R-F2 already, matching the surveyed guidance that "the rollback
decision belongs before the outage window is exhausted," i.e. before, not after, day 21.

**3. Known pitfalls.** The concrete pitfall already caught in-record: "the OneDrive stub picked
up 5 `.obsidian` files on 2026-09-24 because Obsidian still registers the old path" — a migration
that leaves the old application registration pointed at the old folder keeps writing to it even
after "cutover," the general pitfall of "freeze writes on the source" not being enforceable for a
GUI app a script cannot force-close or re-point. R-F1 has to check for this class of leak (new
files in the old location since cutover), not just that the new location is correct.

**4. Maps onto this stack.** `scripts/smoke.ps1` (does not exist yet, per the requirement — this
is the one concrete missing artifact); `scripts/verify-copy.ps1` (already built and proven twice,
769-file SHA-256 match); `hooks/doctor.mjs`; `uv run ingest eval --json` (needs a fresh baseline
file per P-61, since the OneDrive-era baseline "can no longer be taken" — the requirement already
names this). No bb2dash code.

**5. Size S** (matches record). Seams: gated behind harness Phase E (R-105, the VM); no bb2dash
code touches it, listed so bb2dash planning does not schedule it, per the requirement's own note.

**6. Changes to the requirement as written.** Sharpens one check: `smoke.ps1` should explicitly
re-verify that the old OneDrive path has received no new files since the archive was taken (the
`.obsidian`-stub leak already observed), not only that the new realms are internally consistent —
the six step-codes and three `search_context` queries the requirement already specifies do not
by themselves catch a write continuing to leak into the old, supposedly-frozen location.

## Research-added requirements

- **RA-1 · Shared config-resolution helper for `HARNESS_VAULT`/`HARNESS_MACHINE_ENV`, used by
  SKILL.md (R-97), `untagged-sessions.mjs`'s default (R-103), and any future skill or script that
  needs the vault path.** Why: R-97 and R-103 are the same bug (a stale hardcoded/fallback path)
  in two different files; fixing them with two independent one-off edits risks a third instance
  appearing later. Size S, for R-97 and R-103.
- **RA-2 · Count-based early trigger alongside R-103's weekly cadence** (e.g., surface the
  unclassified list mid-week if its count crosses a threshold, on top of the fixed weekly run).
  Why: standard DLQ-triage practice pairs a time-based cadence with a depth/growth-rate alert;
  purely time-based review lets a fast-growing backlog (228+114 already observed) wait a full
  week even when it is clearly spiking. Size S, for R-103. Optional — offer, do not require.
- **RA-3 · Extend `tests/budget.test.mjs`'s fixture to also exercise a loaded `HARNESS_REDACT_EXTRA`
  file, not just the built-in `SECRET_RULES`.** Why: R-106's own text notes the budget constraint
  but the existing budget test (confirmed 18 MB / <1,200 ms) does not yet cover a code path that
  does not exist; without this, a slow custom regex ships invisibly until it is felt live on the
  VM. Size S, for R-106.
- **RA-4 · A fixture test asserting the redaction rule table shipped inside
  `skills/checkpoint/build-note.mjs` (the P-57 payload copy) stays behaviorally equal to
  `hooks/lib/redact.mjs`, not just byte-identical to a snapshot.** Why: a byte-identity check
  (P-57 as written) catches drift but not a rule-table bug present in both copies at the moment
  they were pinned; a small shared fixture (the same JWT/`sb_`/connection-string seed
  `redaction.test.mjs` already uses) run against both modules closes that gap cheaply. Size S,
  for R-98.

## Questions for Stack

Only the §6 questions in this scope, included because research changes their default or adds a
reason worth naming; Stage B's synthesis carries the rest verbatim.

1. **Q43 (V-2 research defaults — tag cap, class-session fields, multi-repo notes, resumed-note
   behavior).** Record's default: yes to all four in one DECISIONS row. Research does not change
   the default but sharpens the tag-cap answer: it must be paired with R-102's code fix (G-6),
   since confirming "at most 5" as policy without fixing `mergeTags`'s `null` cap (confirmed by
   direct read) would assert something the code does not yet do. Recommend the row note it is
   "policy, pending G-6's merge fix."
2. **Q44 (Phase 7 acceptance-query check moves to the first sprint-2 phase, Phase 7 back-filled
   best-effort).** Record's default: yes. No change from research beyond noting (per R-101 above)
   that the backfill's quality depends on P-52's phase-spelling decision landing first, so "first
   sprint-2 phase built" should read as "after P-52 through the R-101 code ships."
3. **Q45 (fill `machine: home-pc` on the 411 older notes whose transcript is on this PC vs.
   leave empty and restate the contract as "every field present from 2026-09-22 on").** Record's
   default: fill from transcript location. Research adds one point: per the harness's own rule
   ("a field that could not be derived is the empty string... never absent and never guessed"),
   "the transcript is on this machine" is a real, verifiable derivation as long as the fill only
   touches notes whose transcript file is confirmed present on this PC — consistent with the
   harness's existing standard, so the default is defensible as derived, not guessed. No change
   to the default; worth citing this reasoning in the DECISIONS row.
4. **Q46 (drop the gitleaks pre-first-push gate; write-time redaction plus realm guards stand
   in; keep 82 C-6's built-image scan).** Record's default: drop it. Research complicates this
   slightly: pre-commit scanning and write-time redaction are **complementary, not
   substitutes** — redaction only catches the harness's own 16 rule shapes, while gitleaks ships
   hundreds of provider-specific detectors and catches secrets the redaction table has no rule
   for. Given the realm is still small (762 files, 8.9 MB) and both baselines already pushed
   unscanned, revised default: drop the *recurring* pre-commit gate as proposed (redundant with
   write-time redaction for known patterns), but run one `gitleaks detect --source <realm>` scan
   of each realm's existing history before Phase 14, cheap insurance against an unknown-pattern
   secret that predates redaction.

## Sources

All fetched or returned verbatim by search 2026-09-24 unless noted.

- Config/redaction: [12factor.net — Store config in the environment](https://12factor.net/config); [12-factor Node.js config](https://dev.to/hugo__df/12-factor-nodejs-application-configuration-management-without-the-config-npm-package-4kmj); [gitleaks/.pre-commit-hooks.yaml](https://github.com/gitleaks/gitleaks/blob/master/.pre-commit-hooks.yaml) (fetched directly); [detect-secrets best practices (Medium)](https://medium.com/@mabhijit1998/pre-commit-and-detect-secrets-best-practises-6223877f39e4); [detect-secrets overview](https://appsecsanta.com/detect-secrets); [MS Engineering Playbook — detect-secrets](https://microsoft.github.io/code-with-engineering-playbook/CI-CD/dev-sec-ops/secrets-management/recipes/detect-secrets/).
- Sync/git: [git-rebase docs (--autostash caution)](https://git-scm.com/docs/git-rebase); [Obsidian community Git-sync plugin pages](https://community.obsidian.md/plugins/direct-git-sync); [Simple guide to git sync in Obsidian](https://ahmorris.org/posts/obsidian-git/); [git-dirsync design](https://github.com/deweysasser/git-dirsync).
- Branch/phase parsing: [semantic-release — Workflow configuration](https://semantic-release.gitbook.io/semantic-release/usage/workflow-configuration); [semantic-release discussion #2457](https://github.com/semantic-release/semantic-release/discussions/2457); [Conventional Commit Regex gist](https://gist.github.com/marcojahn/482410b728c31b221b70ea6d2c433f0c).
- PII/redaction config: [Presidio — recognizer registry from file](https://microsoft.github.io/presidio/analyzer/recognizer_registry_provider/); [Presidio GitHub — recognizer_registry.py](https://github.com/microsoft/presidio/blob/main/presidio-analyzer/presidio_analyzer/recognizer_registry/recognizer_registry.py); [Presidio vs Scrubadub comparison](https://techhorizonconsulting.com/blog/detecting-and-redacting-pii--microsoft-presidio---scrubadub).
- Cutover/DLQ: [Data migration cutover plan (Concentrus)](https://concentrus.com/data-migration-cutover-plan/); [Database Migration Cutover (CI/CD Delivery Guide)](https://cicd.ariefw.com/articles/21-5-when-your-database-migration-needs-a-clean-break-the-cutover-phase/); [DLQ Triage: 5 Categories (dev.to)](https://dev.to/gabrielanhaia/dead-letter-queue-triage-the-5-categories-that-cover-95-of-failures-4p9g); [DLQ Patterns (Codelit.io)](https://codelit.io/blog/dead-letter-queue-patterns); [GitHub Actions scheduled-workflow reliability](https://github.com/orgs/community/discussions/185024) (cited only as a reason not to move R-103 to GH Actions).
- Internal, read directly: `agentic-harness/docs/portable.md`, `docs/vault-migration-requirements.md`, `hooks/README.md`, `hooks/lib/{tags,redact,merge,vocabulary,constants}.mjs`, `hooks/untagged-sessions.mjs`; `91_REQUIREMENTS_v3.md` §1.8, §2 (P-52..P-61), §4, §6.

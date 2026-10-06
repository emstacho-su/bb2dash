# 102a — Phase 21 (Workspace): verification record

> Record for brief `docs/planning/sprint-2/briefs/102_PHASE21_workspace.md`. The PM writes this file;
> each worker's red and green runs are in its own file beside it (`102_W63_VERIFICATION.md`,
> `102_W64_VERIFICATION.md`, `102_W65_VERIFICATION.md`, `102_W66_VERIFICATION.md`). Machine:
> stack-laptop, Windows 11. No secret was printed, written to a file or committed.

## The cut (2026-10-05)

`feat/workspace-21` was cut on 2026-10-05 as worktree `C:/Users/stack/projects/bb2dash-wt-21` from a
fresh fetch of `origin/main` at **06e046b** (PR #76). In bb2dash-stack, `feat/workspace-21` was cut as
worktree `C:/Users/stack/projects/bb2dash-stack-wt-21` from `origin/main` at **eb71e8b**. Harness
`main` was e7997f3.

Values read in the worktree at the cut's commit. Every "at the cut" comparison in the brief reads
against these.

| what | command | value at the cut |
|---|---|---|
| web tests | `cd web; npm ci; npx vitest run` | `Tests 2427 passed (2427)` |
| SQL runner | `node scripts/db-test.mjs --ping` | `db-test: connected as db_test_runner` |
| DECISIONS lines naming B-5 or an O id | `grep -cE "(B-5\|O-[1-5])([^0-9]\|$)" project-state/DECISIONS.md` | 1 |
| distinct O ids in DECISIONS | `grep -oE "(^\|[^A-Za-z0-9-])O-[1-5]([^0-9]\|$)" project-state/DECISIONS.md \| grep -oE "O-[1-5]" \| sort -u \| wc -l` | 0 |
| D-1 reversal row | `grep -c "Reversal adopted (Requirements v3 §4 D-1)" project-state/DECISIONS.md` | 0 |
| `workspace_runner` in DECISIONS | `grep -c "workspace_runner" project-state/DECISIONS.md` | 1 |
| `Phase 21` in STATUS | `grep -c "Phase 21" project-state/STATUS.md` | 1 |
| `Phase 21` in ORCHESTRATOR | `grep -c "Phase 21" project-state/ORCHESTRATOR.md` | 5 |
| `Workspace` in root CLAUDE.md | `grep -c "Workspace" CLAUDE.md` | 0 |
| `workspace_messages` in DATA_SYNTAX | `grep -c "workspace_messages" DATA_SYNTAX.md` | 0 |

## Task 1 — the seam gate (2026-10-05, PASS)

| check | expected | read |
|---|---|---|
| bb2dash: `git ls-files compose.yaml mcp-server/Dockerfile mcp-server/src/env-file.ts \| wc -l` | 3 | 3 |
| bb2dash-stack: `git ls-files secrets.example/claude_oauth_token secrets.example/bb2dash_mcp_service_key secrets.example/harness_database_url doctor/doctor.mjs justfile \| wc -l` | 5 | 5 |
| prod: `select count(*) from pg_roles where rolname in ('sync_runner', 'db_test_runner')` | 2 | 2 |
| `node scripts/db-test.mjs --ping` | `db-test: connected as db_test_runner` | as expected |

Prod the same day, before any Phase 21 change: no `workspace_%` relation, no `workspace_runner`
role, no migration named `14x`, `realtime.messages` with RLS on, 0 policies and 0 partitions,
`db_test_runner` a member of `anon`, `authenticated` and `sync_runner` (each inherit false, set
true), Postgres 17.6.

## Task loop 1 — Stack's answers and the freeze (2026-10-05)

The PM put five questions to Stack in one message: O-1; O-2 to O-5 as one "keep the defaults?";
the B-5 (h) re-read with the Usage credits question; the acceptance order; the two credentials in
the container. His answer, in full: **"defaults, usage credits is off"**. Fifteen DECISIONS rows
dated 2026-10-05 record the answers and the PM's freeze calls (commit 426b5ef). After them:
distinct O ids in DECISIONS → 5.

DECISIONS row titles the later checks grep for (task 24): "Reversal adopted (Requirements v3 §4
D-1)"; "Phase 21 · Realtime Broadcast is the Workspace transport"; "Phase 21 · `workspace_runner`
is a third least-privilege database login"; "Phase 21 · answers render as text"; "Phase 21 · the
port PR"; "Phase 21: preview walk"; "**Phase 21 accepted". The first is the brief's fixed
wording; the others are the titles the PM gives the rows when they are written.

## The kickoff audit (2026-10-05)

Brief 102 was written on 2026-09-24 and verified on 2026-09-27, before Phase 14 was built. Before
the freeze the PM ran a read-only audit of it against `main`, prod, Phase 14 as built (bb2dash,
bb2dash-stack, agentic-harness) and the installed Claude Code CLI:

* Seven auditors, one lens each (Phase 14 container seams, the notes store and the tool gate, the
  CLI argv, subscription billing and terms, the database Contract and Realtime, the web screen and
  the desktop shell, planning-document consistency), each followed by a verifier that re-derived
  every finding, and a completeness critic. 97 findings: 37 confirmed, 42 confirmed with
  corrections, 18 notes, none refuted; 28 additions from the verifiers; 12 gaps and 26 places
  where two proposed fixes disagreed, from the critic.
* The PM ruled on each of the 26 seams and on what the re-reads left open (two sets of rulings),
  and the brief was rewritten to them: eight section editors, an assembler, four verifiers (69
  problems, 65 fixed, 4 declined and ruled by the PM), then two fresh re-reads, the last with
  verdict pass and no must-fix. The frozen brief is d563c02 plus 228fdd5 (six small rulings from
  the last re-read).
* What the audit changed is in the brief itself; the DECISIONS rows of 2026-10-05 carry the calls.
  The agents' full returns (each finding with its evidence) are in the PM session's workflow
  journals, which are session files and not repo files; this section is the durable summary, as
  `105_BRIEF_VERIFICATION_2026-09-27.md` §4 is for the first verification.

Three notes that `105_BRIEF_VERIFICATION_2026-09-27.md` §3 left for this phase are closed by the
rewrite: task 9's pass form under O-2's default; who stores the runner's DSN before task 12 (and
where: `SECRETS_DIR`, not `bb2dash-stack/secrets/`); unit 141 on a day with no Realtime partition
(two labelled forms).

## Task loop 2 — worktrees (2026-10-05)

`git worktree list | grep -c "feat/workspace-21"` → **5** in bb2dash (`bb2dash-wt-21`, `-db`,
`-runner`, `-container`, `-web`, the four worker branches cut from 228fdd5) and **1** in
bb2dash-stack (`bb2dash-stack-wt-21`).

## The live sync container: the guard value

Read before any docker step of this phase, 2026-10-05:
`docker inspect -f '{{.Id}} {{.State.StartedAt}}' bb2dash-sync-1` →
`bd4d4ae8bb716c53141fcae699d3872dd72c44622674209ed496d04d28305f02 2026-10-05T22:06:22.89107…Z`
(the container another session recreated at 22:06Z after PR #75). Every docker step of tasks 12,
13 and 19–22 pastes the same read before and after it below; a changed id or start time made by
this phase is a stop.

## Docker lines (tasks 12, 13, 19–22)

To be filled by W-65 and the PM before each line is run: one paste-ready Git Bash line per step,
project `bb2dash-wt21`, the service named in every command.

## Recording lines (task 9)

To be filled from W-64's verification file: one paste-ready line per fixture, and the CLI version
each was recorded on.

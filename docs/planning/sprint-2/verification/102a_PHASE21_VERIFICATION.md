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

## Wave 1 (2026-10-05 → 2026-10-06)

Four workers built in their own worktrees, each followed by an independent check that re-ran the
task rows and read the diff against the Contract. All four passed (W-64 after one fix round).
Their red and green runs are in their own files.

| stream | tasks in this wave | result | head |
|---|---|---|---|
| W-63 database | 2, 3, 6 written and dry-run proven; nothing applied | pass | `feat/workspace-21-db` |
| W-64 runner | 7, 10, 8, 9, 11 | pass (542 tests, 94.55% line coverage) | merged into the phase branch, ad19814 |
| W-65 container | files of 12 and 13, task 14 done; no docker state change | pass | `feat/workspace-21-container`; bb2dash-stack `feat/workspace-21` e371752 |
| W-66 web | 4, 15 | pass (2586 tests against 2427 at the cut) | merged into the phase branch, 60f2b82 |

**The argv gate is closed (task 9).** The lookup recording on CLI 2.1.289 showed every element of
the frozen argv behaving as the Contract says; both tool calls were gated by the hook (exit 0);
`--system-prompt-snapshot off` was accepted, and a one-turn stream cannot show it either way.
**O-2's conditional branch is closed:** with `--max-budget-usd 0.01` the turn ended
`error_max_budget_usd` after one model call (cost estimate $0.021355), so `BUDGET_CAP_HOLDS`
stays true. Two turns were spent on Stack's plan (the lookup and the budget stop); the
resume-missing and sign-in-expired recordings spent none. The CLI reports `apiKeySource: none`
for the sign-in token: no API key is in use.

**The apply was refused.** The apply stage's `apply_migration` call for `140_workspace_tables`
was refused by the session's permission layer as a production deploy. Nothing reached the
database; the worker did not retry. 140, 141 and 142 wait for Stack's explicit approval.

**Three units that are not this phase's fail on prod's data** from any checkout (whole suite on
2026-10-06 16:03 UTC, nothing applied: passed 61, failed 7, units 68; the other four are this
phase's units and the phase15_100 literal, which wait for the applies):
`grading_invariants.sql` (GEO.103.lecture/exam-1 and IST.352/project-assignment-8 have no
component), `phase18_122_supersede_rule.sql` (run 5485df45 wrote 4 supersede links),
`phase18_golden_truth.sql` (Q7: file 149 not current, 2509 not in the truth).

**The port PR (task 6a)** is open: [PR #77](https://github.com/emstacho-su/bb2dash/pull/77),
one line, not to be merged before 142 is on prod.

**Plan usage.** The lookup recording's rate-limit event read the weekly window at 73% used at
03:29 UTC on 2026-10-06, `overageStatus` rejected (`out_of_credits`: Usage credits are off).

## PM rulings after wave 1 (2026-10-06)

The workers and their checks raised questions the brief did not settle. The rulings below add to
the freeze; the brief is patched to them before wave 2.

### T1. W-65, the firewall and the image

* (a) Every A record of the one answer is allowed and pinned. Kept.
* (b) An answer that is loopback, private, CGNAT or link-local is refused. Kept.
* (c) A port rule is added: tcp/443 only to the addresses of `api.anthropic.com` and
  `goultdzqcavefcgnifdy.supabase.co`, tcp/5432 only to the pooler addresses; nothing else leaves.
* (d) When ip6tables cannot set its rules, the start fails on any IPv6 address off loopback. Kept.
* The refusal probes of task 12 (e) also use literal addresses, so they prove the address rule and
  not a failed lookup: one public address that is not allowed on 443 → `blocked`, and one allowed
  address on a port that is not allowed → `blocked`. The by-name probes stay beside them.
* The pin cannot move by itself: the service sets `DISABLE_AUTOUPDATER=1`, and after the CLI is
  installed its folder is root's (`chown -R root:root /usr/local/share/npm-global`), unless the
  token smoke shows the CLI must write there (then say so and keep it node's).
* A restart must re-raise the firewall: task 12 adds
  `docker compose -p bb2dash-wt21 --profile workspace restart workspace` → healthy again, the
  marker in `/dev/shm` gone with the restart and the pins rewritten.
* Small fixes from the check: the `pgrep` line must not pick PID 1 (`docker-init`); `HARNESS_DIR`
  and `SECRETS_DIR` are set inside each paste-ready line, never by a separate `export`; the IPv6
  read does not pipe under `pipefail` (no early-exit reader); the image does not install
  `iproute2` (or the comment and the report agree on why it does).
* The doctor's Workspace row: with the profile off in the umbrella's `.env` it reads off and is
  not a problem; with the profile on it is a problem unless the container is running and healthy
  and the secret is non-empty. One more test case.
* bb2dash-stack's README says the secrets live in the repo's `secrets/` folder: W-65 corrects that
  wording to `SECRETS_DIR` in this PR.
* grep-clean 11 of 11 is owed after the runner merge, as the row says. W-64's package has
  `build: tsc -p tsconfig.json` (rootDir `src`, outDir `dist`), so the Dockerfile's runner stage
  stands.
* For the `/security-review` request: the allowlist is by address and both hosts serve other
  tenants; Docker's healthcheck runs `node` as root every 30 s; the two credentials; the pg_net
  reach.

### T2. W-66, the skeleton

* `workspace-labels.ts` existing early with three strings is fine.
* The three skeleton strings are accepted as PM wording: the kicker "Assistant", the fallback
  "Loading the Workspace…", the problem line "Could not load this conversation: <message>".
* The check of the hook over the real supabase-js Realtime client is committed as a sixth test
  file, `web/test/use-workspace-stream.realtime.test.tsx` (added to the Files table).
* One query over all of a conversation's requests (not a one-row lookup) is fine.
* A gap: text past a missing seq is never shown; at `done` the stored row takes over. That is the
  reading of "held back until the missing seq arrives or `done`"; the brief says so in those words.
* Task 16 also carries, from the check: `useNow(30_000)` wired into the offline line; a committed
  case for a request id past 2^53; a committed case for a queued request that turns cancelled with
  no broadcast; a failed `removeChannel` is logged, never swallowed; the two test files over 800
  lines are split into named siblings (the Files table lists them); the stream hook's effect is
  split so no function is over about 50 lines.
* Verification files are named without a hyphen (`102_W64_VERIFICATION.md`,
  `102_W66_VERIFICATION.md`); the two workers `git mv` theirs in wave 2.
* Not this phase's: `test/hydration-harness.tsx` prints React's act warning (noted in STATUS
  "Known issues").

### T3. W-63 and W-64, from wave 1's reports and checks (2026-10-06)

Database (W-63), before anything is applied (140 and 142 freeze on apply):
* 140, policy `workspace_requests_owner_insert`: the with check also requires that the request's
  user message is a `user` message of the SAME conversation
  (`exists (select 1 from public.workspace_messages m where m.id = user_message_id and
  m.conversation_id = workspace_requests.conversation_id and m.role = 'user')`).
* 140, policy `workspace_requests_owner_cancel`: the with check is
  `state = 'cancelled' and error_code = 'cancelled'` (an owner's hand-made cancel cannot carry
  another code). `workspace_cancel` also writes `finished_at`; `authenticated` holds
  `update (state, error_code, finished_at)` on `workspace_requests`. Accepted.
* 142, `workspace_claim`: the conversation is joined by the request's own `conversation_id`
  (`on c.id = v_conv`), never through the message.
* `workspace_finish` stamps the session id it is given (null included); the runner hands back the
  stored id when the stream reported none (as built, `workspace/src/turn.ts`). No change.
* `workspace_begin` is called once per request, before the provider; the resume retry is inside
  the provider (as built).
* Unit 140 is split so no file is over 800 lines: `phase21_140_workspace_tables.sql` and
  `phase21_140b_workspace_writes.sql` (the Files table gains the fourth unit); the stranger-cancel
  assertion is pointed at an open request; each of the three changes above gets a case.
* `workspace_messages.role` and `workspace_requests.state` are NOT NULL; the extra 22023 refusals
  W-63 listed stand; a conversation id that does not exist raises 23503 from the foreign key.
* The DoD's SQL gate: the whole suite ends with no failing unit except units that fail from any
  checkout on `main` the same day because of prod's data; those are named in 102a with their
  messages. On 2026-10-06: `grading_invariants.sql`, `phase18_122_supersede_rule.sql`,
  `phase18_golden_truth.sql` (none reads a Workspace object). They go to STATUS "Known issues"
  and to Stack; they are not this phase's to fix.
* Verification files are named without a hyphen (`102_W63_VERIFICATION.md`).

Runner (W-64):
* A question whose first character after white space is `/` is passed framed (the line
  `The new question:`, an empty line, the question), so the CLI cannot read it as one of its own
  commands. Kept: a Contract sentence in the Argv bullet and a DECISIONS row.
* A missing or empty `claude_oauth_token` file at turn time is stored as `sign_in_expired` and no
  CLI is started. Kept: a Contract sentence in the Error codes bullet.
* The fail-closed hook rule is applied when a tool result arrives (a tool that ran with no gate
  response is `cli_error`); a `tool_use` the CLI cut off before running is not a violation.
* The credential source field is `apiKeySource`, value `none` for the OAuth token; 102a and
  acceptance step 10 say "the CLI reports `apiKeySource: none`: no API key is in use".
* `BUDGET_CAP_HOLDS` stays true: the budget recording stopped with `error_max_budget_usd` (O-2's
  conditional branch is closed; say so in the brief's O-2 text and strike its PROVISIONAL).
* Task 21's cap turn uses acceptance step 7's question (Opus), so a warm prompt cache cannot hide
  the stop; one follow-up question in the same chat afterwards records what a budget-stopped
  session does on resume.
* `--system-prompt-snapshot off` stays; a one-turn stream cannot show it either way (recorded as
  accepted, not proven).
* The CLI creates an empty auto-memory folder under the config dir; nothing loads from it and the
  model has no tool that writes there. Named in the `/security-review` request.
* Files under `workspace/` beyond the Files table (W-64 owns the folder): `tsconfig.test.json`,
  `src/alive.ts`, `src/replay.ts`, `src/turn.ts`, `src/hooks/gate-rules.ts`,
  `test/global-setup.ts`, `test/helpers/fakes.ts`, `test/scrub-recording.mjs`,
  `test/fixtures/recordings.json`, four `test/runner/*.suite.ts`. Listed in the Files table.
* Wave 2 small fixes: `db.ts` drops only the connection a failed call ran on; the byte-order mark
  is written as an escape; `stream-json.test.ts` is split under 800 lines; the verification file
  is renamed.
* The raw recordings (they hold syllabus text) were moved by the PM from `C:/Users/Public/` to
  `C:/Users/stack/.bb2dash-w64-rec-out` on 2026-10-06 and are deleted after the merge, with
  `C:/Users/Public/bb2dash-w64-rec/` and the three transcripts under
  `~/.claude/projects/C--Users-Public-bb2dash-w64-rec-cwd/`.
* For the walks: the weekly plan window read 73% used at 03:29 UTC on 2026-10-06
  (`overageStatus` rejected, `out_of_credits`: consistent with Usage credits off).

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

## Task 19, first half — the runner's password and DSN (2026-10-06)

Stack's approval for the three migrations, 2026-10-06: "apply 140, 141, 142."

The hand-over is in two parts, because the `alter role` line needs the role 142 creates.

* **Part A, done 2026-10-06 16:19Z (Stack, in his own PowerShell window).** One line from the
  clipboard made a 32-character password on the laptop and stored the session-pooler DSN as
  `workspace_runner_db_url` in `SECRETS_DIR` (host and port taken from `sync_runner_db_url`,
  `?uselibpqcompat=true&sslmode=require`). Its output, as he reported it:
  `sync_runner_db_url uses a pooler host on port 5432: True`,
  `harness_database_url uses a pooler host on port 5432: True`,
  `stored workspace_runner_db_url (169 bytes)`. The two True lines are what the firewall's
  `.pooler.supabase.com` rule rests on. The PM tested the line first against a throwaway folder of
  fake secrets, and added `'workspace_runner_db_url'` to `$allowed` in
  `SECRETS_DIR/set-secret.ps1` (a name; that file is in no repo). The password was never printed
  and never passed through a chat.
* **Part B, owed after 142 is on prod.** A second line reads the stored secret and puts
  `alter role workspace_runner with password '…';` on his clipboard for an unsaved Supabase SQL
  editor tab.

## Migrations 140, 141, 142 applied (2026-10-06)

A pre-freeze round first tightened three things an independent check had found, while nothing
was applied: 140's request insert policy requires a `user` message of the same conversation;
140's cancel policy pins `error_code = 'cancelled'`; 142's `workspace_claim` joins the
conversation by the request's own id. Unit 140 was split in two (608 and 419 lines). A second
independent check dry-ran the final text with break-it probes and called it ready to apply.

On Stack's word ("apply 140, 141, 142.") the PM applied them from the main session with
`apply_migration`, each under its file's name, the query being the file's exact text:

| migration | prod `schema_migrations` | `md5(statements[1])` on prod | `git show HEAD:<file> \| md5sum` | bytes |
|---|---|---|---|---|
| `140_workspace_tables` | version 20261006171547 | `64692ea53ee1c60c96e974d928b41a29` | `64692ea53ee1c60c96e974d928b41a29` | 24459 |
| `141_workspace_realtime_policy` | applied 2026-10-06 | `d3dcc40e4865b1a62a7d7b4e55df6a72` | `d3dcc40e4865b1a62a7d7b4e55df6a72` | 2817 |
| `142_workspace_runner_role` | applied 2026-10-06 | `28786bc625723f8d2317293d936b9254` | `28786bc625723f8d2317293d936b9254` | 24086 |

Read on prod after the third apply: four `workspace_*` tables with row security, nine policies
on them, one policy on `realtime.messages`, role `workspace_runner` present, five SECURITY
DEFINER functions it can execute, `db_test_runner` a member of `anon`, `authenticated`,
`sync_runner`, `workspace_runner`.

Through the Runner against prod, from `bb2dash-wt-21-db` (each `node scripts/db-test.mjs --only
<unit>` → `PASS`, `db-test: passed 1, failed 0, units 1`): `phase21_140_workspace_tables.sql`,
`phase21_140b_workspace_writes.sql`, `phase21_141_workspace_realtime.sql`,
`phase21_142_workspace_runner.sql`, `phase15_100_db_test_runner_role.sql` (the branch's
four-name literal), `phase12b_076_rls_initplan_and_truncate.sql`,
`phase15_101_search_path_pin.sql`.

**Unit 141 ran its send-and-receive form (tasks 3 (a) and 17 (a)).** The unit's standalone
partition test, run through `execute_sql` at 2026-10-06 17:17:45 UTC → `partition_covers_now`
**true**, and the Runner on the unit right after it → `PASS`. Realtime made the partitions when
Stack opened the preview's `/workspace` that afternoon (the page joins `workspace:lobby`):
`messages_2026_10_05` … `messages_2026_10_09`, each
`FOR VALUES FROM ('<day> 00:00:00') TO ('<next day> 00:00:00')`, so the unit's predicate (the
bound parsed from `pg_get_expr(relpartbound)`) and task 5's name form agree. The same read showed
two `supabase_realtime%` publications and one replication slot. Unit 142's empty-delta half ran
in the same window.

**Still red on `main` until PR #77 merges:** `phase15_100_db_test_runner_role.sql` from the main
checkout (three names expected, four on prod). Stack's merge word for #77 is owed.

## Task 19, first half, finished — Part B (2026-10-06)

Stack ran Part B after 142 was on prod and pasted the `alter role workspace_runner with password
'…';` line into an unsaved Supabase SQL editor tab ("1 and 2 complete"). Proof that both parts
took, from a script that reads the stored secret, prints no part of it, and connects with it:
`connected as workspace_runner | statement_timeout 15s`; `assignment_progress -> refused 42501`;
`reading_progress -> refused 42501`; `workspace_messages -> refused 42501`;
`may call workspace_claim: true`.

## Task 5 — the Realtime spike (2026-10-06, PASS: the transport is Realtime Broadcast)

Run in a tab of Stack's own Chrome, which he signed in to on the branch preview
(`web-git-feat-workspace-21-emstacho-sus-projects.vercel.app`, phase branch at ad19814, W-66's
task 4 skeleton). The PM drove the tab and the database; Stack typed his own sign-in.

1. The conversation, as the owner, in one call (committed):
   `begin; select set_config('request.jwt.claims', json_build_object('sub', public.app_owner(),
   'role', 'authenticated')::text, true); set local role authenticated;
   select public.workspace_ask(null, 'spike'); commit;` → conversation
   `4afc277e-1601-47d3-abde-739884dc522d`, request 24, `queued` (no runner is up).
2. The page, `/workspace?c=4afc277e-…`, before the send: the stream area carried
   `data-topic="workspace:4afc277e-…"`, `data-channel="joined"`, `data-request-id="24"` and no
   text.
3. (b0) immediately before the send: a partition named for today (`messages_2026_10_06`) → 1;
   active replication slots → 1; the request still `queued`.
4. The send, at 18:07:47.99 UTC by the database's clock:
   `select realtime.send(jsonb_build_object('request_id', 24, 'seq', 1, 'delta', 'spike-ok 1'),
   'delta', 'workspace:4afc277e-1601-47d3-abde-739884dc522d', true)`.
5. (b) after it: `select count(*) from realtime.messages where topic = 'workspace:4afc277e-…'`
   → **1** (event `delta`, private true, extension `broadcast`, payload
   `{"seq": 1, "delta": "spike-ok 1", "request_id": 24}` plus the `id` key `realtime.send` adds).
6. (c) the page: the stream area read **`spike-ok 1`**, first seen at 18:07:49.29 UTC by the
   laptop's clock, about 1.3 s after the send. No document was requested after the send: the
   page's navigation-entry count stayed 1, a MutationObserver armed before the send was still
   alive after it, and the tab's network log held no request. Screenshot:
   `docs/planning/sprint-2/walks/walk-21/01-realtime-spike.png`.
7. Only then the cancel, as the owner: `select public.workspace_cancel(24)` → true. The 'spike'
   conversation stays until acceptance step 15 archives it.

Readings for the builders:
* The page had been joined for about 15 s when the send was made, and the project's Realtime had
  been warm since Stack opened the preview that afternoon, so this is a warm delivery time. A
  cold-start reading was not taken; the page's lobby channel (it joins on load, with or without
  `?c=`) is what keeps the first answer of a sitting from starting cold.
* The tab was in the background (`visibilityState` hidden) during the test: the broadcast still
  arrived. After the cancel the area kept its text for 15 s, because the 5-second refetch does
  not run in a hidden tab; task 16 must take the end of a stream from the `done` broadcast and
  from a refetch on focus, never from the interval alone.
* Partitions seen: `messages_2026_10_05` … `messages_2026_10_09`, daily bounds.

## Task 6a — the port PR (2026-10-06, done)

[PR #77](https://github.com/emstacho-su/bb2dash/pull/77) merged on Stack's word ("merge 77") as
e89aff5, about an hour after 142 was applied. The file on `main` is the phase branch's, blob for
blob (acaa281). From the main checkout, fast-forwarded to e89aff5:
`node scripts/db-test.mjs --only phase15_100_db_test_runner_role.sql` → `PASS`,
`db-test: passed 1, failed 0, units 1`. The port branch and its worktree are removed.

## Wave 2a (2026-10-06)

Four pieces of work, none changing docker state (the guard read the same before and after):

| stream | work | result | head |
|---|---|---|---|
| W-66 web | task 16: the Workspace screen and the nav link; ruling T2's list | pass after one fix round (2728 tests against 2427 at the cut; typecheck, eslint, build and coverage exit 0) | merged into the phase branch, 9413a09 |
| W-64 runner | three small fixes, each red first | done (its own gates green) | merged into the phase branch, 7f7cc9d |
| W-65 container | ruling T1: the port rule, the pinned CLI that cannot update itself, the doctor row, the paste-ready list for tasks 12 and 13 | pass | `feat/workspace-21-container` 124c630; bb2dash-stack `feat/workspace-21` 6255923 |
| PM | the brief patched to rulings T1–T3 (43 items) | committed, 449bc32 | phase branch |

The screen has not been seen in a browser yet; layout and both themes wait for the PM's walk.
While extending its firewall tests W-65 found that wave 1's script could leave IPv6 open when
`ip6tables` was unavailable and the address list was long (a pipe under `pipefail`); fixed with a
red test, and named in the `/security-review` request. The image has never been built and the
firewall has never met a kernel: task 12 is their first real test.

## PM rulings after wave 2a (2026-10-06)

### U1. Web (W-66)

* The "New conversation" link at the top of the list stays (PM wording: "New conversation").
* A claimed request with no text yet shows "Answering…". Confirmed.
* After Stop, the partial text stays under "You stopped this answer." until the stored row
  replaces it. It is not cleared.
* A `?c=` uuid that has no rows: the message column says "This conversation was not found."
  (PM wording) with the "New conversation" link; the composer does not ask into it. The database's
  own foreign-key sentence is never shown: a 23503 from `workspace_ask` shows the same line.
* The empty message column has three states with their own lines (PM wording): no conversation
  selected: "Ask a question to start a conversation."; rows still being read: "Loading the
  conversation…"; an unknown id: "This conversation was not found.". The text box has a visible
  placeholder: "Ask about your courses or your decisions" (PM wording).
* While a request is open, Enter does not send (the button reads Stop); the database's refusal
  (23505) stays as the backstop and keeps its test.
* The offline line beside a streaming answer: the status is re-read at once when a request in
  view becomes `claimed` and when its first delta arrives, so "The Workspace service is offline."
  cannot sit beside text that is arriving.
* After Stop on a claimed request the page re-reads the messages about 3 s and about 10 s after
  the press, so the stored partial answer shows even when its `done` broadcast is missed.
* The screen-reader label before a status line with no answer text is "Status", not "The
  assistant answered".
* The ten strings W-66 listed as its own (section 6 of its verification file) are accepted as PM
  wording. A failed leave is logged; nothing more is asked of it.
* W-66's files beyond the brief's table are accepted: `web/src/components/workspace/thread.ts`,
  `web/src/components/workspace/route.ts`, `web/test/workspace-harness.tsx`,
  `web/test/queries.workspace.hooks.test.tsx`, `web/test/use-workspace-stream.screen.test.tsx`,
  `web/test/Workspace.thread.test.ts`, `web/test/Workspace.failures.test.tsx`,
  `web/test/use-workspace-stream.realtime.test.tsx`.

### U2. Container (W-65)

* `docker/workspace/init-firewall.test.mjs` stays (one more file in W-65's list).
* The CLI installed in a stage of its own and copied into the runtime stage, root-owned: accepted.
* A DSN whose port is not 5432 is refused at the start, fail-closed, with a fixed sentence that
  prints no part of the value (the runner's own config already refuses 6543).
* The firewall script's header says exactly what it prints: the fixed host names and each
  validated pooler host name, never a user, password, URL or address.
* bb2dash-stack wording that still says the secrets live in the repo's `secrets/` folder is
  corrected to `SECRETS_DIR` where it is a comment or a message in a file W-65 already edits
  (`compose.yaml` lines near the header and the secrets block, `.env.example`, the doctor's
  message in `doctor/lib/checks-host.mjs`, the README). The `justfile`'s fallback behaviour is not
  changed in this phase; its comment may say where the secrets really live.
* The doctor's `secrets` row keeps asking for all 12 files whatever the profile; with the profile
  off the Workspace row reads off without asking Docker. Accepted for v1.
* The paste-ready list: `docker history` is read with `--no-trunc` where a step greps it; the
  note about the scan container's labels says what is true (it carries the compose labels of the
  image and is never started); the host's noVNC port gets a literal-address probe beside the
  by-name one; the 6543 claim is either probed in the list or dropped.

### U3. Runner (W-64)

* `workspace/test/stream-json/gate.suite.ts` and `workspace/test/helpers/stream-lines.ts` are
  accepted, and the standing size audit in `workspace/test/config.test.ts` stays.

### U4. The docker step (tasks 12 and 13), now

* Run in `C:/Users/stack/projects/bb2dash-wt-21-container` after it has merged the phase branch
  (step 2 of W-65's list must print `runner merged: 0`), as project `bb2dash-wt21`, the service
  named in every command. The guard is read before the first step and after every step that
  changes docker state: `docker inspect -f '{{.Id}} {{.State.StartedAt}}' bb2dash-sync-1` must
  still read `bd4d4ae8bb716c53141fcae699d3872dd72c44622674209ed496d04d28305f02
  2026-10-05T22:06:22…`. A changed value is a stop.
* If the session refuses a docker command, do not rephrase it to get it through: stop at that
  step and report the exact line, so the PM or Stack runs it.
* The token smoke spends one small Haiku turn on Stack's plan; it is allowed (2026-10-05).
* The laptop was critically low on memory on 2026-10-06: build with `docker compose ... build
  workspace` only (never `--parallel`, never another build beside it), and if the build is killed
  or the daemon reports out of memory, stop and report rather than retrying in a loop.
* A firewall that fails its end check leaves the container with deny-all; read the script's own
  output with `docker compose -p bb2dash-wt21 --profile workspace logs --tail 80 workspace`
  before changing anything, and fix the script with a failing test first.

## Task 18 — advisors (2026-10-06 20:39 UTC, after 140–142)

`get_advisors`, security: two lints, neither naming a `workspace_*` object or `realtime.messages`
(`authenticated_security_definer_function_executable` for `app_owner()` and
`calendar_push_now()`, the two on record; `auth_leaked_password_protection`). **0 on the
Workspace.**
`get_advisors`, performance: **0 `auth_rls_initplan`**; `unindexed_foreign_keys` 16 findings,
**none on the four workspace tables**. One INFO lint does name two of this phase's indexes as
unused (`workspace_messages_parent_idx`, `workspace_requests_user_message_idx`): the tables are a
day old and hold one conversation; both indexes back foreign keys and stay.

## Task 17, first part — types (2026-10-06)

`web/src/lib/supabase/database.types.ts` regenerated from prod (f60a7e9): 298 lines added, none
removed. It carries this phase's four tables, `v_workspace_status` and eight functions, and what
`main`'s file still lacked from merged migrations 091, 093, 094 and 095 (fifteen `sync_*`
functions and `bb_file_storage_key`). `npm run typecheck` in `web/` → exit 0. The full suites are
run once the last worker branches are merged.

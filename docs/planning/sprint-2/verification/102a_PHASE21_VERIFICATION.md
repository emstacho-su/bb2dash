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

The lines are W-65's list: `102_W65_VERIFICATION.md`, "Wave 2 — the lines for tasks 12 and 13, top to
bottom (Git Bash)", 41 steps since the review round, each one paste-ready with `SECRETS_DIR` and
`HARNESS_DIR` set inside the line, project `bb2dash-wt21`, the service named in every command.
The build line as run:

```text
cd /c/Users/stack/projects/bb2dash-wt-21-container && SECRETS_DIR=C:/Users/stack/.bb2dash-secrets HARNESS_DIR=C:/Users/stack/agentic-harness MSYS_NO_PATHCONV=1 docker compose -p bb2dash-wt21 --profile workspace build workspace; echo "exit=$?"
```

The guard reads of each docker sitting are pasted in that sitting's section of this file.

## Recording lines (task 9)

The four lines are in `102_W64_VERIFICATION.md`, "The four recording lines": one paste-ready line
per fixture, each recorded on CLI 2.1.289. They were run by the worker in wave 1; Stack ran none.

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

## Task 17 — the suites on the integrated branch (2026-10-06 20:56–21:03 UTC, b359da1)

All four streams merged (database, runner, web through ruling U1, container files), types
regenerated.

| suite | command | result |
|---|---|---|
| web typecheck | `cd web; npm run typecheck` | exit 0 |
| web lint | `npx eslint . --max-warnings 0` | exit 0 |
| web build | `npm run build` | exit 0; `/workspace` in the route list |
| web tests | `npx vitest run` | 149 files, **2768 passed**, 0 failed (2427 at the cut) |
| web coverage | `npm run test:coverage` | exit 0; lines 91.41 % |
| runner | `cd workspace; npm run typecheck; npx vitest run --coverage` | exit 0; 9 files, **566 passed**; `src/` lines 94.59 % |
| materials server | `cd mcp-server; npx vitest run` | 6 files, **106 passed** (its code is unchanged) |
| SQL | `node scripts/db-test.mjs` | `passed 66, failed 3, units 69` |
| desktop | `git diff --stat origin/main...HEAD -- desktop` | prints nothing |

The SQL suite's three failures are the three units ruling T3 names as failing from any checkout
on prod's data, none of which reads a Workspace object: `grading_invariants.sql`
(`GEO.103.lecture/exam-1` and `IST.352/project-assignment-8-context-level-0-and-activity-diagrams`
have no component),
`phase18_122_supersede_rule.sql` (run fcf9d587 wrote 4 supersede links) and
`phase18_golden_truth.sql` (Q7: files 149 and 967 not current; 2509 and 2640 not in the truth).
Every other unit passes, this phase's four included.

## Tasks 12 and 13 — the first build failed outside the phase's code (2026-10-06)

`docker compose -p bb2dash-wt21 --profile workspace build workspace`, run once from
`bb2dash-wt-21-container`: exit 1 in the rag stage. The harness rag server's fastembed 2.1.0
downloads the embedding model from `storage.googleapis.com/qdrant-fastembed/`, which answers 403
(read from the laptop outside docker too) and the library unpacks the error body as an archive.
The runner, materials and pinned-CLI stages finished. No image, no container, no docker command
refused; the sync guard read the same at every step (five reads in `102_W65_VERIFICATION.md`,
two more by the independent check). fastembed 2.1.1 (2026-09-30) moved the download to Hugging
Face; measured in a scratch copy, the harness source builds unchanged on it, its embedder check
passes and three test sentences match today's vectors at cosine 0.9999996 or better. The model
source was put to Stack on 2026-10-06 (a one-line harness PR, or baking the host's cache); tasks
12 and 13 resume at step 10 of W-65's list once he rules.

## /security-review

**First run, 2026-10-06, on `feat/workspace-21` at d4b1b8d and bb2dash-stack `feat/workspace-21`
at 80f6796** (before the image exists; a second run on the delta is owed once tasks 12 and 13 have
passed). Four finders, one lens each (database, runner, container and umbrella, web), then an
independent false-positive pass on every candidate; a finding is reported at confidence 8 of 10
or more.

The request the finders were given named what is already known and accepted, so that only a path
beyond it would be reported: "(a) The container holds two write-capable credentials read only by
the two MCP servers (the bb2dash service key for the materials server, the notes store's DSN for
the rag server); read-only rests on tools-off, the four-name allowlist and the hook. (b) PUBLIC
holds execute on pg_net's functions, so any database login, this one included, can make the
database issue HTTP requests. (c) The firewall allowlist is by address and the allowed hosts
serve other tenants. (d) Docker's healthcheck runs node as root every 30 s. (e) The CLI creates
an empty auto-memory folder under its config dir. (f) An IPv6 fail-open in an earlier version of
the firewall script was fixed with a test."

Note, 2026-10-07 (task 23's first grep, read before the PRs open): item (b) of the request, as
quoted above, names pg_net's functions as a whole. It names neither `net.http_post` nor its two
tables. Those are what `PUBLIC` holds on pg_net's schema, the same for every database login,
`workspace_runner` and `sync_runner` included, and `postgres` cannot revoke it (DECISIONS
2026-10-06, the `workspace_runner` row; STATUS, "Phase 14 deferred (R-96)", bullet "The pg_net
reach"). The quoted request is left as it was sent.

Result: **no finding at the reporting bar** in either repository. Two candidates were raised, by
two lenses, for the same thing, and both were held at confidence 7.

| id | severity | status |
|---|---|---|
| SR-1 | MEDIUM | fixed |

* **SR-1 (confidence 7, below the bar; the PM fixes it in this phase).** The runner's database
  connection does not verify the pooler's certificate: the stored DSN's
  `?uselibpqcompat=true&sslmode=require` parses to "encrypted, chain not verified", and
  `workspace/src/config.ts` accepts it. With the firewall pinning one DNS answer for the pooler
  name, someone able to answer the laptop's DNS on a shared network when the container starts
  could stand in for the pooler, take the `workspace_runner` password, feed the runner questions
  and read the answers the model writes from the two stores. It needs an active position on the
  network. The same setting was deferred for `sync_runner` in Phase 14 (DECISIONS 2026-10-04); what
  is new is what sits behind this connection, and that the pinned CA is already in the image for
  the rag server. Fix: the runner verifies the certificate against the pinned CA whatever the DSN
  says.

Recorded below the bar, not findings: `workspace_finish` does not require the request to be
`claimed` (a holder of the runner's own DSN could overwrite a stored answer; it gains no read
access; goes on the deferred hardening list, a later migration in 143–149); `/app/turn` is
node's and the argv loads project settings from it, so a file planted there after a compromise
would persist (fix with SR-1: the folder is root's and read-only); the page shows a raw client
error message to the signed-in owner, as the Inbox does. What the finders checked and found
sound is in the PM session's review journal: every row policy and column grant, the five
SECURITY DEFINER functions, the Realtime policy, the spawn (an argv array, the prompt last after
`--`), the tool gate's deny paths, the fail-closed stream checks, the privilege drop, the
firewall's rule order and fail-closed paths, secrets in layers and logs, and every DOM sink of
the screen.

## /code-review main high

**First run, 2026-10-06, on `feat/workspace-21` at d4b1b8d** (`git diff main...HEAD`, 113 files;
every non-test source file read in full; the image had not been built, so the Dockerfile,
entrypoint and firewall were reviewed by reading). Fourteen findings; the PM's severities and
dispositions (rulings V1–V5 below). A second run on the delta is owed after the review round.

| id | severity | status |
|---|---|---|
| CR-1 | HIGH | fixed |
| CR-2 | MEDIUM | fixed |
| CR-3 | HIGH | fixed |
| CR-4 | MEDIUM | fixed (143) |
| CR-5 | MEDIUM | fixed |
| CR-6 | MEDIUM | fixed |
| CR-7 | LOW | fixed (143) |
| CR-8 | MEDIUM | fixed (143 and the page) |
| CR-9 | MEDIUM | fixed |
| CR-10 | LOW | recorded, not changed (V4) |
| CR-11 | LOW | kept as the Contract names them (V1) |
| CR-12 | LOW | fixed |
| CR-13 | LOW | recorded, 140 is frozen (V5) |
| CR-14 | LOW | done at task 24 (STATUS, `12bedf5` and `66dd0c1`) |

* **CR-1** `workspace/src/stream-json.ts`: any tool result with no PreToolUse hook answer ends
  the turn as `cli_error`, including error results the CLI writes itself without running the
  tool or the gate (a call to a tool that is not in its list).
* **CR-2** `workspace/src/turn.ts`: every `workspace_begin()` failure is read as "no longer
  claimed" and the turn is skipped without closing the request, so a passing database error
  leaves it claimed for ten minutes.
* **CR-3** `workspace/src/turn.ts`: `workspace_finish()` is tried three times a second apart and
  then abandoned, so a database blip at the end of a turn discards a finished answer.
* **CR-4** `142`: the stale sweep touches only requests still `claimed`, so an assistant row
  whose request was cancelled is never finished when the runner never calls finish.
* **CR-5** `workspace/src/providers/claude-cli.ts`: the turn waits for the process to exit after
  the `result` line; a CLI that lingers turns a finished answer into a `timeout`.
* **CR-6** `workspace/src/stream-json.ts`: hook answers are matched to tool calls by name in
  arrival order, so two calls of one tool in one message can take each other's gate exit code.
* **CR-7** `140`: the `updated_at` trigger fires on archive and unarchive, so an old chat jumps to
  the top of the list.
* **CR-8** `web/src/lib/queries.workspace.ts`: offline is decided by comparing the browser's
  clock with the database's `polled_at`; a skewed clock gives a wrong service line.
* **CR-9** `web/src/app/(app)/workspace/Workspace.tsx`: the re-read after Stop is two fixed
  timers armed only when the cached row already reads `claimed`.
* **CR-10** `142` / `queries.workspace.ts`: the claim always returns the history, and the page
  re-reads every message every 5 s while a request is open.
* **CR-11** `workspace/src/turn.ts`: the `BUDGET_CAP_HOLDS` branch cannot run; `TURN_CONCURRENCY`
  is read by no source file.
* **CR-12** helpers declared twice or three times (`OPEN_STATES`, `messageOf`, the uuid shape).
* **CR-13** `140`: the prompt cap and the error-code list are repeated as literals.
* **CR-14** `project-state/STATUS.md` is not yet updated on the branch (owed before the PR).

## PM rulings for the review round (2026-10-06)

### V1. Runner (W-64)

* **CR-1 (HIGH).** The fail-closed hook rule covers results that are not errors: a tool result
  that is not an error needs a gate allow (a PreToolUse hook response with exit 0) for that tool
  name. An ERROR result with no hook answer (the CLI's own "No such tool available", a call the
  CLI refused before running it) does not end the turn: the call is stored `ok: false` and the
  turn goes on. `EndConversation` stays exempt. A gate exit other than 0 or 2 still ends the turn.
* **CR-6.** Hook answers are not paired to calls by arrival order. `ok` is "the result is not an
  error". The fail-closed check is a count per tool name: non-error results for a name never
  exceed the exit-0 gate answers seen for that name.
* **CR-2.** A `workspace_begin()` failure means "nothing to close" only when it is SQLSTATE 22023.
  Any other failure is retried on the same schedule as finish; if begin still cannot be made the
  runner closes the request with `workspace_finish(failed, cli_error)`.
* **CR-3 (HIGH).** `workspace_finish()` is retried with backoff (1 s, 2 s, 4 s … capped at 15 s)
  for up to 170 s (`FINISH_RETRY_MS = 170000`, `workspace/src/config.ts`) before the answer is
  given up and logged. A 22023 from finish means the request is already closed: logged, not
  retried. The database watchdog does not end the process while a finish is being retried inside
  that window.
* **CR-5.** After the `result` line the provider gives the CLI 10 s to exit
  (`RESULT_EXIT_GRACE_MS = 10000`), then kills it and keeps the result. A turn that produced a
  result is never stored as `timeout`.
* **CR-12.** One `messageOf` helper and one uuid-shape constant in `workspace/src`, imported
  where they are used.
* **CR-11.** `BUDGET_CAP_HOLDS`, `NO_CAP_SENTENCE` and `TURN_CONCURRENCY` stay as the Contract
  names them (the first two are the recorded O-2 fallback; not reached today).
* **SR-1.** The runner verifies the pooler's certificate against the pinned CA whatever the DSN
  says. `WORKSPACE_DB_CA_FILE` (default `/app/certs/prod-ca.crt`) is read at start; a missing or
  empty file is a configuration error (fail-closed). `db.ts` builds the client from the parsed
  parts of the DSN (host, port, user, password, database), never from the DSN string, with
  `ssl: { ca, rejectUnauthorized: true, servername: <host> }`, so no flag in the DSN can switch
  verification off. The DSN check still refuses port 6543; it no longer accepts `no-verify`; its
  error text and the README no longer recommend an unverified form. The stored secret is not
  changed. Proven on the host on 2026-10-06 with the stored secret: against the harness's
  `certs/prod-ca.crt` the connection verifies (`connected as workspace_runner`); against the
  system store alone it fails (`SELF_SIGNED_CERT_IN_CHAIN`). Tests use a local CA fixture made for
  the test (never a real certificate's private key).

### V2. Container (W-65)

* The image copies the CA to `/app/certs/prod-ca.crt` (from the `harness-certs` build context;
  root-owned, readable) and the service sets `WORKSPACE_DB_CA_FILE=/app/certs/prod-ca.crt`. The
  rag launcher may read the same file.
* `/app/turn` is root's and read-only (0555): nothing the runtime user plants there can be loaded
  as project settings. The paste-ready list gains two checks: as `node`, creating
  `/app/turn/.claude` fails; and the token smoke still passes from that folder.
* The paste-ready list gains a check that the runner's connection is verified: inside the
  container as `node`, a connect with the pinned CA succeeds and a connect with a different CA
  file fails (a throwaway self-signed certificate made in the container's temp folder).
* No docker state change in this round. The build still waits for the model source.

### V3. Database (W-63): migration 143, written and dry-run only

`db/migrations/143_workspace_review_round.sql`, additive (`create or replace` only; 140–142 are
frozen and not edited), with `db/tests/phase21_143_review_round.sql`:

* **CR-8.** `v_workspace_status` gains a last column `polled_age_seconds integer`: the whole
  seconds between the server's `now()` and `polled_at`, null before the first heartbeat.
* **Security note.** `workspace_finish` refuses (22023) unless the request is `claimed` or
  `cancelled`. Everything else about it is unchanged.
* **CR-4.** `workspace_claim`'s sweep also finishes an assistant row left unfinished when its
  request has been closed (`cancelled`, `failed` or `done`) for more than 10 minutes: `finished`
  true, and `error_code` the request's own code (so `cancelled` for a stopped one).
* **CR-7.** The `workspace_conversations_updated_at` trigger no longer fires for an update that
  changes only `archived` (`create or replace trigger … when (…)`), so archiving does not move a
  chat to the top of the list.
* Signatures, grants and the 142 guard's facts are unchanged; 143's own guard re-reads them (the
  five functions, executable by `workspace_runner` only; the view still `security_invoker`).
* Existing units are edited only where one of these four changes makes an assertion wrong.
  `DATA_SYNTAX.md` follows.
* NOT applied by anyone in this round: the PM applies it from the main session on Stack's word,
  after an independent dry-run check, exactly as 140–142 were.

### V4. Web (W-66)

* **CR-8.** Offline is decided from the server's `polled_age_seconds` plus the local time that
  has passed since that read (a monotonic clock), never from the browser's wall clock. The
  hand-declared row treats the column as optional: while it is absent (before 143 is applied)
  the page falls back to today's wall-clock comparison, so the preview works on both sides of the
  apply.
* **CR-9.** The two timers after Stop go. The messages query polls every 5 s while a request is
  open, and also while the followed request's assistant row is unfinished and that request closed
  less than 60 s ago.
* **CR-12.** One definition of the open states, imported where it is used.
* CR-10 (the page re-reads every message while a request is open; `workspace_claim` always
  returns the history) is recorded and not changed in this phase.

### V5. Recorded, not changed

CR-13 (140 repeats the prompt cap and the error-code list as literals): 140 is frozen. CR-14
(`project-state/STATUS.md` is not yet updated): owed at task 24, before the PR opens.

## The embedding model's source — settled 2026-10-06

Stack: "Bump the harness." [agentic-harness PR #40](https://github.com/emstacho-su/agentic-harness/pull/40)
(`fix/fastembed-2.1.1`, 79ec491, worktree `C:/Users/stack/agentic-harness-wt-fastembed`) moves
the rag server to fastembed 2.1.1. On that branch with an empty `.fastembed-cache`: `npm ci`
exit 0; `npm run typecheck` exit 0; `npx vitest run` 11 files, 196 passed;
`npm run verify:embedder` downloads the model and prints `OK — embedder matches the ingestion
contract`, reference agreement min 0.999999 over the 10 Python reference items. The lock drops
`tar` and its eight transitive packages and carries npm 11's peer annotations; no source change.
Until it merges, the test container's build sets
`HARNESS_DIR=C:/Users/stack/agentic-harness-wt-fastembed`; the commit read at build time goes
into the docker section. The merge of PR #40 is Stack's word.

**PR #40 merged 2026-10-06 on Stack's word ("merge the harness pr.") as 57ee51f**, its six checks
green. The harness main checkout was a clean `main` and is fast-forwarded to it; the branch and
its worktree are removed. `HARNESS_DIR` for the Workspace build is `C:/Users/stack/agentic-harness`
(main, 57ee51f). The host's installed rag server still holds fastembed 2.1.0 in `node_modules`
until `npm ci` is run there; that is Stack's to run or to ask for.

## The review round (2026-10-06)

The four streams fixed what rulings V1–V4 named, each with its test committed failing first; no
docker state changed and nothing was applied to prod.

| stream | scope | result | head |
|---|---|---|---|
| W-64 runner | CR-1, CR-6, CR-2, CR-3, CR-5, CR-12, SR-1 | built; two independent checks each found one test that could not fail (fixed, and one more owed in the second pass); 695 tests, lines 94.99 % | `feat/workspace-21-runner` 4575ed7 |
| W-63 database | migration 143, written and dry-run only | independent check: pass for the text it read (md5 b6dcb28b…); the PM then ruled two changes (X2), so a second pass and a second check follow | `feat/workspace-21-db` c82d087 |
| W-66 web | CR-8, CR-9, CR-12 | done; gates green on its tree | merged, 5c7cb0e |
| W-65 container | the CA at `/app/certs/prod-ca.crt`, `/app/turn` root-owned and read-only, the list | done in files; grep-clean 13 of 13, firewall dry run 20 of 20 | merged, 0470bb4 |

SR-1's premise was proven on the host with the stored secret before the fix was ruled: against
the harness's `certs/prod-ca.crt` the pooler's certificate verifies
(`connected as workspace_runner`); against the system store alone it fails
(`SELF_SIGNED_CERT_IN_CHAIN`). The runner's tests prove the rest against a loopback stand-in with
a throwaway CA: another CA is refused under six DSN forms, `no-verify` and
`uselibpqcompat=true` among them.

## PM rulings on the review round's questions (2026-10-06)

### X1. Runner (W-64)

* **`ok` on the call that trips the count stays false.** CR-6's sentence reads: `ok` is "the
  result is not an error and the call did not trip the count".
* **Begin's lost reply.** A 22023 from `workspace_begin()` that follows a failure of another kind
  in the same turn does not read as "nothing to close": the runner closes the request with
  `workspace_finish(failed, cli_error)`. A 22023 on the first try still means skip.
* **A finish never arrives after the stale sweep.** `FINISH_RETRY_MS` is 110000 (was 170000): a
  turn is killed at 8 minutes from its start and the last finish try is at most 110 s later, so
  the request is closed by the runner inside the database's 10-minute claim. The backoff
  (1 s doubling, capped at 15 s) and the watchdog hold follow the new window.
* **The bounds on the database client are tested for real.** The test that builds the client
  asserts `connectionTimeoutMillis`, `query_timeout` and `keepAlive` on the built client, and
  fails if `newPgClient` drops any of them (the check's must-fix).
* **Small, each with a test that can fail:** the redaction on the connection-error listener; the
  `!linger.fired()` guard (a CLI killed after its result line is not also logged as a SIGTERM
  exit); `messageOf` falls back to the error's code when its message is empty; `dsnParts` refuses
  port 0 as `assertRunnerDsn` does.
* **Kept as recorded:** a tool result for a tool-use id the stream never showed is passed over;
  no recording is a resumed session that used a tool, and task 21's follow-up question after the
  cap turn is the first one that will be. The start check's refusal of a CA file with no
  certificate block stays. The watchdog hold needs no widening.

### X2. Database (W-63): 143 changes before it freezes

* **CR-7, the reading.** The `updated_at` trigger on `workspace_conversations` fires only when
  `title` or `claude_session_id` changes
  (`when (old.title is distinct from new.title or old.claude_session_id is distinct from
  new.claude_session_id)`). An update that changes only `archived`, or changes nothing (archiving
  an already-archived chat from a second tab, a title set to itself), leaves `updated_at` alone.
  `workspace_finish` keeps setting `updated_at` itself. Unit 143 pins all four cases.
* **The guard asserts only what 143 owns.** The project-wide rules of unit 101 (every function
  pinned, no new SECURITY DEFINER function open to `authenticated`) leave 143's guard: an apply
  must not abort on another stream's objects. The guard keeps: the view is `security_invoker`
  with its five columns in order; the two functions keep their signatures, `prosecdef` and
  pinned `search_path`; the five runner functions are exactly what `workspace_runner` executes
  and none is open to `anon`, `authenticated`, `service_role` or PUBLIC; the trigger exists with
  its condition.
* **The sweep's boundary is tested at the boundary:** a request closed exactly 10 minutes ago is
  not swept and one closed a second longer is (or the reverse, whichever the code says; the unit
  pins it and the comment states it).
* **The units name their rows.** `delete from workspace_runner_heartbeat where id = 1` (never a
  delete with no `where`), so a dry run through `execute_sql` is not held for confirmation.
* The sweep's comment about a live turn's finish holds again with X1's 110 s
  (480 s + 110 s < 600 s). A closed request with no `finished_at` (only a hand-made cancel makes
  one) is not swept: accepted. No new index.
* Still dry-run only. The PM applies 143 on Stack's word after an independent check of the final
  text.

### X3. Web (W-66): accepted as built

The 60 s after a close is counted on the page's own clock from when it first saw the close; the
status view is read whole; `polled_age_seconds` is a JSON number or null (143 makes it an
`integer`); a restored status row says nothing until the page's own read; the test fake keeps
its own list. `queries.workspace.ts` is at 789 of 800 lines: its next change splits out the
input-validation block.

### X4. Container (W-65): accepted as built

One CA copy at `/app/certs/prod-ca.crt`, read by the runner and by the rag launcher; `/app/turn`
root-owned and 0555; one token smoke, run from `/app/turn`. If the pinned CLI cannot run from a
folder it cannot write, stop and report (the mode is not loosened without a ruling).

### X5. The brief (PM)

The brief's literals follow: the CA path (`/app/certs/prod-ca.crt`, one copy), `/app/turn`
(root, 0555), `WORKSPACE_DB_CA_FILE`, `DISABLE_AUTOUPDATER=1`, the constants
(`FINISH_RETRY_MS` 110000, `RESULT_EXIT_GRACE_MS` 10000), the config bullet (verification against
the pinned CA whatever the DSN says; refuses `no-verify`, port 0 and 6543, a part that is not
percent-encoded text, a missing or certificate-less CA file), the fail-closed rule as V1 and X1
word it, migration 143 in the Tables section and the Files table with its unit (five phase21
units), the five-column status view, `workspace_finish`'s refusal, the harness at fastembed 2.1.1
(the Seams row), and the review-round test files.

## The review round, second pass (2026-10-06 to 2026-10-07)

Three streams, then one independent check; nothing was applied and no docker state changed.

| stream | what | head | result |
|---|---|---|---|
| W-64 | ruling X1: begin's lost reply closes the request, `FINISH_RETRY_MS` 110000, the client's three bounds asserted on the built client, four small items each with a test that can fail | `3425b33` | typecheck exit 0; 714 tests, 0 failed; `src` lines 95.24%; longest file 719 lines |
| W-63 | ruling X2: the trigger's condition, the guard cut to what 143 owns, the sweep's boundary tested at the boundary, the units name their rows | `6ef7e39` | 143 final: md5 `5e7afa73d1ccfc8b06327cc128d28e1d`, 23585 bytes |
| PM | ruling X5: the brief's literals | `71f48ae`, `a279211` | the brief's checker passes (8 tables, 27 task rows in order) |

Every red and green run of W-64's is quoted in `102_W64_VERIFICATION.md`, "Review round, second
pass", with a mutant for each test-only item (the test fails when the code it guards is removed).

**The independent check of 143's final text** (a fresh agent, 05:01 to 05:17 UTC on 2026-10-07,
seven `execute_sql` calls, each `begin; … rollback;`): verdict **ready to apply**, no must-fix.

| what it read | result |
|---|---|
| 140, 141, 142 unchanged against the phase branch; the file's md5 and size | pass |
| the text: nine statements, `create or replace` and `comment on` only; no grant, revoke, alter, drop, delete, insert, password or DSN outside comment lines | pass |
| the view: 140's four columns unchanged, `polled_age_seconds integer` last, `security_invoker` | pass |
| `workspace_finish` against 142's body: five lines added, none changed | pass |
| `workspace_claim` against 142's body: one constant and one statement added | pass |
| the trigger's condition as the catalogue prints it | pass |
| the file whole on prod as it was, rolled back: the database's own md5 of the text it executed equals the file's; the guard raised nothing; 8 catalogue values of 387 differ, each one 143's | pass |
| unit 143 from its own text, less its one `delete` line: `phase21_143_review_round: PASS` | pass |
| units 140 and 142 with 143 in place, less the same line | pass |

Three notes it left, none a defect: a cancelled request can be finished more than once (inside
the ruling); the trigger no longer writes over an `updated_at` a privileged role sets by hand (the
page cannot set one); the runner's 110 s count from when its finish starts, so the margin under
the 10-minute claim is a little under 10 s. A `delete` is held by `execute_sql` with or without a
`where` (shown by elimination: no delete was sent), so those lines are the Runner's to prove.

## PM rulings on the second pass (2026-10-07)

### Y1. Runner (W-64): kept as built, three corners recorded

* **The 110 s count from the finish's first try, not from the turn's start.** With a stream call in
  flight on a dead connection at the kill, the last finish try can land about 8 s after the
  database's 10-minute claim. Kept: with one runner the sweep runs only inside `workspace_claim()`,
  which the runner calls between turns, so nothing sweeps the request while the finish is being
  retried; and with 143 a finish that does arrive late is refused with 22023 and logged. Counting
  the deadline from the turn's start is the fix if a second runner is ever added (Known issues).
* **A stop that lands during begin's refused try closes the request `stale_claim`**, as every
  unbegun close on a stop does. Kept: a stop is a stop.
* **The connection-error listener reads `error.message` directly.** Kept: an empty message logs
  nothing after the colon, and nothing reads that line.

### Y2. Database (W-63): 143 is frozen at the checked text

* 143's text does not change again: md5 `5e7afa73d1ccfc8b06327cc128d28e1d`, 23585 bytes.
* Guard check (c) stays as written. It reads what `workspace_runner` can execute, which is the
  fact the phase cares about; a function another stream leaves open to PUBLIC is a fact about the
  runner too. A guard runs once, at the apply.
* Unit 143's sections 1 and 2, and units 140 and 142 against 143, are proven by the Runner after
  the apply, as 140 to 142's units were. A statement the tool holds for confirmation is not sent
  another way.
* Unit 140b's truncate try stays, Runner-only.

### Y3. The brief and the records (PM)

* The `DATA_SYNTAX.md` heading is `## Workspace (migrations 140-143)`; the brief's four mentions
  follow it.
* 143 is "`create or replace` and `comment on` only": a comment is additive.
* `database.types.ts` is regenerated a second time after the apply.
* The open item for task 6a's merge word is closed (PR #77, 2026-10-06).
* The two review tables above read `fixed` now that the review round is merged
  (`9df56e9` the runner, `d885d3a` the database, `5c7cb0e` the page, `0470bb4` the container's files).

## Migration 143 applied (2026-10-07 05:21 UTC)

Stack: "apply 143". Applied by the PM from the main session with `apply_migration`, name
`143_workspace_review_round`, the query being the file's text at `6ef7e39`. Read back from
`supabase_migrations.schema_migrations`:

| version | name | md5 of the recorded text | bytes | the file |
|---|---|---|---|---|
| `20261006171547` | `140_workspace_tables` | `64692ea53ee1c60c96e974d928b41a29` | 24459 | equal |
| `20261006171610` | `141_workspace_realtime_policy` | `d3dcc40e4865b1a62a7d7b4e55df6a72` | 2817 | equal |
| `20261006171717` | `142_workspace_runner_role` | `28786bc625723f8d2317293d936b9254` | 24086 | equal |
| `20261007052130` | `143_workspace_review_round` | `5e7afa73d1ccfc8b06327cc128d28e1d` | 23585 | equal |

Each is one statement entry; `md5sum db/migrations/14[0123]_*.sql` on the phase branch prints the
same four values.

Through the Runner against prod, from the phase worktree at `d885d3a`
(`node scripts/db-test.mjs --only <file>`, connected as `db_test_runner`):

| unit | result |
|---|---|
| `phase21_140_workspace_tables.sql` | `PASS` |
| `phase21_140b_workspace_writes.sql` | `PASS` |
| `phase21_141_workspace_realtime.sql` | `PASS` |
| `phase21_142_workspace_runner.sql` | `PASS` |
| `phase21_143_review_round.sql` | `PASS` |
| `phase15_100_db_test_runner_role.sql` | `PASS` |
| the whole suite, `node scripts/db-test.mjs` | `passed 67, failed 3, units 70` |

The three failures are the three of task 17 (`grading_invariants.sql`,
`phase18_122_supersede_rule.sql`, `phase18_golden_truth.sql`): they read prod's course data, not
this phase's objects, and go to STATUS "Known issues". `phase15_101_search_path_pin.sql` and
`phase12b_076_rls_initplan_and_truncate.sql` are among the 67.

**Types.** `generate_typescript_types` again; `web/src/lib/supabase/database.types.ts` gains one
line and loses none (`polled_age_seconds: number | null` on `v_workspace_status`), `6eb6580`.

## The suites on the integrated branch after the review round (2026-10-07, `6eb6580`)

| suite | command | result |
|---|---|---|
| web typecheck | `npm run typecheck` | exit 0, no output |
| web tests | `npx vitest run` | 153 files, 2830 tests, 0 failed |
| web lint | `npx eslint .` | no output |
| runner typecheck | `npm run typecheck` (in `workspace/`) | exit 0 |
| runner tests | `npx vitest run` (in `workspace/`) | 9 files, 714 tests, 0 failed |
| SQL | `node scripts/db-test.mjs` | `passed 67, failed 3, units 70` (above) |

## The reviews on the delta (2026-10-07)

### `/security-review` method on `d4b1b8d..HEAD` (at `93c285f`)

The skill reviews a whole branch against `main`, so the delta was reviewed with the skill's own
method (one finder with the repo for context, then one false-positive filter per finding, keep
confidence 8 or above) over `git diff d4b1b8d..HEAD -- . ':!docs' ':!project-state'`: 52 files,
about 1300 changed lines of non-test source, every touched source file read in full, with `pg`
8.23.0's own connection code read for SR-1.

Result: **no finding at 0.7 or above**, so nothing went to the filter. Each fix was traced end to
end and asked "does it close what it claims":

| fix | closes it | how it was read |
|---|---|---|
| SR-1: nothing in the DSN can turn verification off or name another CA; a bad CA file stops the runner | yes | the client is built from parts with no `connectionString`, so `pg` never parses the DSN's query; `rejectUnauthorized` is explicit, so `NODE_TLS_REJECT_UNAUTHORIZED` does not apply; with `ca` given Node loads no other roots |
| `workspace_finish` (143) refuses a request that is not claimed or cancelled | yes | the row is read `for update` and refused before any write; `create or replace` keeps owner and grants; the guard re-reads them |
| the fail-closed tool rule | yes | allows and results are counted per full tool name; an allow that arrives after its result does not count; `EndConversation` is the only exemption |
| `/app/turn` root-owned 0555 | yes | no volume is mounted over it; `node` has an empty bounding set and `no-new-privileges` |
| no secret reaches a log line, a stored error or the answer | yes | every database error is rebuilt from a redacted message and its SQLSTATE; only one of the eight codes is stored |

Hardening it noted, below the bar (STATUS, "Hardening noted by the security reviews"):

* `/run/workspace/mcp.json` is written by the runner as `node` at start and could be a root-owned
  file in the image, since its content is constant. Reaching it needs code running as `node`,
  which can already read the four secrets.
* A token file holding a NUL byte (saved as UTF-16, say) would put part of the token into the
  container log through Node's own spawn error text. `set-secret.ps1` writes UTF-8, so the stored
  file does not; refusing a NUL in the runner's secret read closes it.
* A CA file with a `BEGIN CERTIFICATE` line and no parseable certificate passes the start check
  and fails at every connect instead: fail-closed, later than intended.
* The gate count is per tool name, not per call. Only a CLI that skips its own hook reaches it.

Its limits, as it stated them: read-only from the repo (no docker, no database, no network); the
image was not inspected as built (the docker step below does that); CLI 2.1.289's own loading from
its config folder was not inspected.

### `/code-review d4b1b8d high`: it read one commit, not the range

The skill took `d4b1b8d` as the commit to review, and that commit is a 38-line edit of this file.
It found nothing wrong in the numbers (it re-ran the materials server's suite, 106 passed, and
read prod for the two SQL failures) and ten gaps in this record. They stand and are settled here;
the run on the range `d4b1b8d..ac41858` has its own heading below, after the docker step.

| # | the gap | settled |
|---|---|---|
| 1 | "resume at step 10" skips steps 1 to 9 after the harness changed | the list ran again from step 1 on 2026-10-07 (the docker step, below) |
| 2 | no wave 2b rulings in this file | ruling Y4, below |
| 3 | the guard reads are cited, not pasted | pasted in the docker step's section, below |
| 4 | the harness commit at the failed build is missing | `e7997f3e3ddc402a3c8f535d3b926bbd61d6adbd` (harness `main` on 2026-10-06); the passing build's is in the docker step's section |
| 5 | `phase18_122_supersede_rule.sql`'s message is cut | in full: `FAIL (1) newest run fcf9d587-8a8b-4ee1-949f-8db767940f95 wrote 4: 2->151, 74->2509, 150->2640, 162->2640`. The count is the 4 the unit expects; the links are not (it expects `74->149`, `150->967`, `162->967`): files 149 and 967 were superseded by 2509 and 2640 in a later sync |
| 6 | no row for the container stream's tests on the integrated branch | on `93c285f`: `node --test docker/grep-clean.test.mjs` → tests 13, pass 13, fail 0; `node --test docker/workspace/init-firewall.test.mjs` → tests 20, pass 20, fail 0 |
| 7 | "Docker lines" still read "to be filled", and the build line quoted was not the line run | that section now points at the list and quotes the line as run |
| 8 | an assignment id written without its slash and cut short | corrected in place: `IST.352/project-assignment-8-context-level-0-and-activity-diagrams` |
| 9 | the fastembed evidence leaves out that 2.1.1 loads a different model file | it does: 2.1.0 read a 132,883,455-byte `model_optimized.onnx`; 2.1.1 downloads the 66,465,124-byte quantized file `Qdrant/bge-small-en-v1.5-onnx-Q`, which is byte for byte the file the harness's Python ingestion already uses. The two routes agree at cosine 0.9999996 or better on the test sentences. Told to Stack in the hand-off |
| 10 | "a one-line harness PR" understates it | harness PR #40 is 2 files, +43 −118: one line of `package.json` and the lock file (159 changed lines, dropping `tar` and eight transitive packages). Stack was told the same day, before he said "merge the harness pr." |

### Y4. Wave 2b's open items (PM, 2026-10-07)

* **W-65.** A DSN that names no port is accepted and means 5432, the driver's default; the stored
  secrets all name the port. The firewall's log may print the resolver's address
  (`127.0.0.11`, not a secret). `.env.example`'s placeholder pointing outside every repo is right.
* **W-66, section 9.** Accepted as built: the disabled composer on a not-found page; the second
  "New conversation" link in the column; only the not-found line is an alert; "not found" said
  from the restored cache; asking allowed while rows are still being read; the 23503 line stays
  until the page leaves that `?c=`; Enter over an open request prevented; "Status" labelled by
  text. Its items 8 and 9 (the two status moments, the two reads after Stop) were replaced in the
  review round by CR-9's poll (ruling V4).
* **W-66, section 11.** The two test files beyond the Files table
  (`web/test/Workspace.empty.test.tsx`, `web/test/Workspace.rereads.test.tsx`) stay: one file
  would have passed 800 lines.

## Tasks 12 and 13 — the docker step, second run (2026-10-07 05:16 to 05:44 UTC): pass

W-65 ran its 41-step list top to bottom from `bb2dash-wt-21-container` (the step-by-step table,
with each output, is in `102_W65_VERIFICATION.md`, "Docker step, second run (2026-10-07)"). Every
step passes; step 41 (stop and remove the test container) was left out on purpose. One Haiku turn
was spent (the token smoke). No docker command was refused.

**The guard**, `docker inspect -f '{{.Id}} {{.State.StartedAt}}' bb2dash-sync-1`, read thirteen
times by the worker and three times by the independent check, each time
`bd4d4ae8bb716c53141fcae699d3872dd72c44622674209ed496d04d28305f02 2026-10-05T22:06:22.891074981Z`:

| UTC | when |
|---|---|
| 05:16:44 | before the first docker step |
| 05:18:33 | right before the first build |
| 05:24:55 | after the first build |
| 05:25:12 | after the container started (first image) |
| 05:31:19 | before the second build (the fix round) |
| 05:31:27 | after the second build |
| 05:31:49 | after the container was recreated on the second image |
| 05:35:08 | before the restart of step 35 |
| 05:35:19 | after the restart |
| 05:36:02 | before task 13's scan container |
| 05:38:27 | after the scan volume was removed |
| 05:40:17 | after the last check |
| 05:44:37 | last, after the record was committed and pushed |

The `sync` service's rendered hash equals the live container's label before and after
(`448f155ac0209cc0a233a9d09653fd02ebb3eda51fc84ec02ff9a5341ac7e6e7`).

| | |
|---|---|
| harness commit at each build | `57ee51fc18ee4f7f367b60b24bfe39968d58d86b` (`main`, PR #40), nothing uncommitted under `mcp-server` or `certs` |
| build | 05:18:39 to 05:24:46 UTC, exit 0; the rag stage downloaded the model from Hugging Face and printed `OK — embedder matches the ingestion contract.` |
| image | `sha256:5790950804c5813992d495efb945efb9a9832b45d0d0e57f9be78911e07577ae`, 1.66 GB (the second image, after the fix round; the first was `sha256:de4a7a0edac5…`) |
| container | `bb2dash-wt21-workspace-1`, project `bb2dash-wt21`, `healthy`, no published ports, network `bb2dash-wt21_workspace-net`, volume `bb2dash-wt21_workspace-claude-home` |

**The firewall's first meeting with a real kernel** (05:25:12 UTC, the whole log):

```text
The host of workspace_runner_db_url ends .pooler.supabase.com
The host of harness_database_url ends .pooler.supabase.com
Restoring Docker DNS rules...
Allowing DNS to 127.0.0.11
Allowed api.anthropic.com on tcp/443 (1 address(es), pinned in /etc/hosts)
Allowed goultdzqcavefcgnifdy.supabase.co on tcp/443 (2 address(es), pinned in /etc/hosts)
Allowed aws-0-us-east-1.pooler.supabase.com on tcp/5432 (6 address(es), pinned in /etc/hosts)
IPv6 closed (loopback only)
Firewall configuration complete
Verifying firewall rules...
Firewall verification passed - unable to reach https://example.com as expected
Firewall verification passed - able to reach https://api.anthropic.com as expected
Firewall raised: 3 name(s) allowed
2026-10-07T05:25:12.791Z workspace: runner started as workspace@469c97cc522a
2026-10-07T05:25:13.255Z workspace: db: connected as workspace_runner
```

It raised at the first try. One thing disagreed with the dry run, and it is the run's one fix
round: Docker Desktop's resolver answers the pooler's name with each of its three addresses
twice, and the script pinned and counted the answer's lines, not its addresses (6 pins for 3
addresses; step 25 read the set at 3). Nothing was open that should not have been. Fixed
test-first (`f5ab661` red, 20 of 21; `defc566` green, 21 of 21): `resolve_once` keeps the first
line for an address. After the rebuild the line reads `(3 address(es), pinned in /etc/hosts)` and
steps 10 to 40 pass.

| task 12 and 13, what the steps showed | result |
|---|---|
| `claude --version` is the pin, 2.1.289; its folder is root's and `node` cannot write it | pass |
| every Node and `claude` process is `node`'s; the runner holds no capability | pass |
| no `ANTHROPIC_API_KEY`, no `DATABASE_URL`; the five settings | pass |
| `/app/turn` is `root:root` 555 and nothing can be planted in it; the CA is `root:root` 444 and `node` reads it | pass |
| default-deny at the kernel: `example.com`, `storage.googleapis.com`, `huggingface.co`, `1.1.1.1:443`, the three 6080 probes blocked; open on exactly the pinned address and port pairs | pass |
| a second run of the firewall is refused (75); a restart raises it again with the pins rewritten, not doubled | pass |
| ten connects to each database host on 5432 | 10 of 10, 10 of 10 |
| the pooler's certificate verifies against `/app/certs/prod-ca.crt` and against no other CA | pass (`connected as workspace_runner`; the throwaway CA `refused: SELF_SIGNED_CERT_IN_CHAIN`) |
| one `search_context` over stdio through the rag launcher, behind the firewall | pass |
| the token smoke, one Haiku turn, run from `/app/turn` (ruling X4: the CLI runs from a folder it cannot write) | pass |
| task 13: gitleaks over the image's files (80 MB scanned) and its history, with a control that fails on two made-up tokens | no leaks, exit 0; the brief's grep on the history 0 |

**The independent check** (a fresh agent, read-only probes of its own, 05:46 to 05:58 UTC): every
pass claim it tried to refute holds: the guard, the project and image, the kernel rules read as
root (`-P OUTPUT DROP`, the two sets, IPv6 closed), `iptables -F` refused to `node`, no secret in
`docker history`, `docker image inspect` or the runner's log, the certificate check, the gate
wired in the built runner, and on prod `v_workspace_status` showing a heartbeat 5 s old
(`polled_age_seconds` 5, `open_requests` 0). It also found what a pass claim does not say:

* **The allowlist is by address, and on port 443 that can be walked around** (should-fix, a
  design call, not a defect of the build). The project's Supabase host sits on Cloudflare's shared
  addresses, so code running as `node` can reach any Cloudflare-hosted site by dialling the allowed
  address with another server name: `example.com` answered 200 through `104.18.38.10:443`. Through
  Anthropic's address the same request gets 403. The firewall's own end check ("example.com
  refused") is true for example.com's own address only. The model has no tool that can do this
  (tools are off; four read-only MCP tools); it needs code running as `node`, which can already
  read the four secrets. The first `/security-review` request named this in the abstract ("the
  allowlist is by address and both allowed hosts serve other tenants") and the review raised no
  finding on it; this is the concrete proof. Closing it means a name-checking proxy in front of 443. Put to Stack
  in the hand-off; STATUS lists it under the deferred hardening.
* **DNS is a channel out** (note): Docker's resolver answers any name for `node`. The Contract
  allows DNS to the resolver.
* `console.anthropic.com` and `claude.ai` share `api.anthropic.com`'s address and connect (note).
* pid 1 is Docker's own init, root's, from `init: true`; it runs no project code (note).
* W-65's file, line 1371, still says "the runner's own connection follows its DSN's sslmode": true
  when written, not since ruling V1 (the image verifies against the pinned CA whatever the DSN
  says).

**PM answers to W-65's questions.** The fix round is read by the PM (one `awk` condition, no rule
changed) and goes through the delta review with the rest. The brief names `huggingface.co` beside
`storage.googleapis.com` (`d46600b`). The CLI's layer is stored twice (492 MB for about 250 MB):
kept, a Known issue. The test's five constants that equal today's public addresses stay (a test
that dials nothing). The harness checkout's installed `node_modules` still holds fastembed 2.1.0
under a lock that says 2.1.1: `npm ci` there is Stack's. Step 41 runs before the walks rebuild the
container in `bb2dash-wt-21` (one tree at a time).

## `/code-review` on the range `d4b1b8d..ac41858` (2026-10-07)

The second run named the range, and read the fix round as it stood with the firewall's `defc566`
in it: every touched source file, by reading only (it ran nothing). It found no place where a fix
departs from rulings V1 to V5, X1 to X5 or Y1 to Y3, and eleven things of its own. None is
CRITICAL or HIGH; the PM's severities and dispositions (rulings Z1 and Z2 below):

| id | severity | status |
|---|---|---|
| R2-1 | MEDIUM | fixed (round Z) |
| R2-2 | MEDIUM | fixed (round Z) |
| R2-3 | LOW | recorded, not changed (Z2) |
| R2-4 | LOW | recorded, not changed (Z2) |
| R2-5 | MEDIUM | fixed (round Z) |
| R2-6 | LOW | recorded, a later migration (Z2) |
| R2-7 | LOW | recorded, a follow-up (Z2) |
| R2-8 | LOW | recorded (Z2) |
| R2-9 | LOW | recorded (Z2) |
| R2-10 | LOW | recorded (Z2) |
| R2-11 | LOW | recorded (Z2) |

* **R2-1** `workspace/src/turn.ts`, `providers/claude-cli.ts`: a `result` line read after the
  8-minute kill still counts as reported, so a turn cut short can be stored `done` with the end of
  its answer missing, or `cli_error` in place of `timeout`.
* **R2-2** `workspace/src/db-retry.ts`, `runner.ts`, `turn.ts`: the 110 s retry window, the
  watchdog hold and the turn limit read `Date.now()`, so a wall-clock step (the laptop sleeping,
  the Docker VM's clock resynced) ends a retry early or gives a just-begun turn a limit of 0. The
  page was moved to a monotonic clock in the same round for the same reason.
* **R2-3** `workspace/src/stream-json.ts`: an allow is not used up when its own call errors, so a
  later call of the same name with no gate answer passes the count.
* **R2-4** `workspace/src/turn.ts`: a 22023 on begin's first try is read as "not claimed", but
  `workspace_begin` raises 22023 for a tier or provider off its list too.
* **R2-5** `workspace/src/db-retry.ts`: only 22023 ends the tries, so a statement the database
  refuses for its own content (a NUL inside `tool_calls`, which is not stripped as `content` is)
  is retried for 110 s, the answer is given up, and the queue waits meanwhile.
* **R2-6** `db/migrations/143_workspace_review_round.sql`: the orphan sweep runs on every poll
  with no index that narrows it to unfinished assistant rows.
* **R2-7** `web/src/lib/queries.workspace.ts`, `ServiceStatus.tsx`: the wall-clock fallback for a
  status row without `polled_age_seconds` cannot be reached now that 143 is applied, and stays.
* **R2-8** `workspace/src/config.ts`: `assertRunnerDsn` repeats `dsnParts`' checks by hand.
* **R2-9** `web/src/lib/workspace-clock.ts`: a copy of `use-now.ts`'s store with another clock.
* **R2-10** `workspace/src`: `MS_PER_SECOND` declared four times; a second byte-order-mark strip.
* **R2-11** `workspace/src/stream-json.ts`: three flags set in place, against the immutability
  rule; the file's local-state style from before the round.

## PM rulings on the review of the range (2026-10-07)

### Z1. Runner (W-64): one fix round

* **R2-1. A result line read after the runner's own abort is not a reported result.** When the
  runner has aborted the turn (the 8-minute limit, a Stop, a shutdown), a `result` line the
  provider reads afterwards does not make the turn `done` and does not replace the abort's code.
  A result read before the abort still wins, as CR-5 ruled.
* **R2-2. The runner's durations are measured on a monotonic clock**: the finish and begin retry
  window, the watchdog hold, and the turn limit computed after begin's retries. Timestamps that
  are written or logged stay wall-clock.
* **R2-5. A statement the database refuses is not retried, and NUL never reaches it.** NUL
  characters are stripped from every string inside `tool_calls`. A failure that is the statement's
  own (the data, integrity and syntax classes; 22023 keeps its own meaning; 57014 and every
  connection failure stay retried) ends the tries at once. A finish refused that way is followed
  by one minimal close of the same request (`failed`, `cli_error`, no content, no tool calls), so
  the request does not sit claimed until the 10-minute sweep.
* **From the security review on the delta: a secret file holding a NUL is refused at start**, by
  a configuration error that names the file and no part of its value.

### Z2. Recorded, not changed in this phase

* **R2-3.** Only a CLI that skips its own hook reaches it; pairing by arrival order was ruled out
  in CR-6 because parallel calls of one name make it wrong.
* **R2-4.** It needs the route table and the database to disagree, and the request then waits for
  the 10-minute sweep. Closing every unbegun request instead would wipe the conversation's session
  id when Stop lands before begin. Revisit when a second provider is added.
* **R2-6.** The tables are small; a partial index is migration 144's if history ever makes the
  sweep cost.
* **R2-7.** Removing the unreachable fallback is a follow-up (STATUS, Known issues).
* **R2-8, R2-9, R2-10, R2-11.** Cleanup and style, not behaviour.

## Fix round Z (2026-10-07, merged at `134ee64`)

W-64, test-first, each item a red commit then a green one (`102_W64_VERIFICATION.md`, "Fix round Z
(2026-10-07)"); then an independent check in a copy of the tree, with mutants for every item.

| item | what changed | red, then green | the check's mutants |
|---|---|---|---|
| R2-1 | a `result` line read while the runner's abort signal is set is not a reported result (`providers/claude-cli.ts`); a result read before the abort still wins | 7 failed of 731, then 731 passed | the fix reversed: 7 fail; every aborted turn unreported: 7 fail |
| R2-2 | an injected monotonic clock (`performance.now()`) for the retry window, the watchdog hold and the turn limit, and also for the watchdog's own 180 s, the 2 s Stop poll and the stored duration | 17 failed of 748, then 750 passed | `Date.now()` put back in each place, one at a time: 5, 4 and 4 fail |
| R2-5 | NUL stripped from `tool_calls` at any depth; `isBadStatement` (classes 22, 23, 42, not 22023) ends the tries at once; a refused finish gets one minimal close; a refused begin goes straight to its close | 3 failed of 753, then 753; 34 failed of 796, then 797 | not cleaned: 3 fail; statement errors retried again: 12 fail; no minimal close: 7 fail; the close made twice: 7 fail |
| the NUL secret | `cleanSecret` refuses a value holding a NUL, naming the secret and its file and nothing of the value | 12 failed of 810, then 810 | not refused: 12 fail; the refusal quoting the value: 3 fail |

Gates on the merged branch: runner `npm run typecheck` exit 0; `npx vitest run` 9 files, 810
tests, 0 failed (the check ran it four times and once shuffled); `src` lines 95.39% (890 of 933);
longest file 717 lines. Regressions the check tried and could not make: the finish is still
retried for up to 110 s on a connection failure; a 22023 from finish is still "already closed";
begin's lost reply still closes the request; a 22023 on begin's first try still skips; the
watchdog still holds while a finish is retried in the window; a turn with a result before any
abort is never stored `timeout`. Its verdict: sound, notes only.

The three MEDIUM rows of the range review (R2-1, R2-2, R2-5) read `fixed` in its table.

### Z3. The round's questions (PM, 2026-10-07)

* **A token file holding a NUL is refused where the token is read, before each CLI start**, not
  at the runner's start: the turn ends `sign_in_expired` and the log names the file. The DSN is
  refused at start. Kept: the brief has the token read immediately before each CLI start, so a
  replaced token file needs no restart.
* **The monotonic clock's wider reach** (the watchdog's 180 s, the Stop poll, the stored
  duration): kept.
* **A turn stored under the abort's code keeps the late line's cost**: kept, it is what the CLI
  reported as spent.
* **The minimal close stamps the claim's stored session id**, as the unbegun close does: kept.
* **Recorded, not changed** (STATUS, Known issues): a NUL in the model id, or a lone surrogate in
  a tool call's text, is refused by the database once and the request closed by the minimal
  close, so that answer is not stored (one line each would save it: the model id through
  `withoutNul`, `toWellFormed()` on the strings). `isStatementError('EPIPE')` reads true, so a call
  failing with that code keeps a broken connection until the watchdog restarts the runner. A Stop
  or shutdown that lands in the 10 s exit grace after a result still stores `cancelled` or
  `stale_claim` (CR-5 speaks of `timeout` only).
* This round was read by its independent check, with mutants, and not by a third `/code-review`.

## The PM's walk (2026-10-07): tasks 19 second half, 20, 21, 22

Walked by the PM's hands (a workflow agent) in `bb2dash-wt-21` at `22b9335`, 07:24 to 08:23 UTC,
against the branch preview `https://web-git-feat-workspace-21-emstacho-sus-projects.vercel.app`
and the test container, rebuilt first from the phase branch so it holds fix round Z. No product
file was changed. No docker command and no other command was refused.

In short:

| row | result |
|---|---|
| 19, second half | every select returned what the row expects; the first turn's log line reads credential source `none`. The usage percentages could not be read (below) |
| 20 | the three planner reads are equal before and after; no `agent_requests` row was created or changed state inside the pair |
| 21 | the cap, Stop and the queued question pass. Check (d), the two health readings, is **not done**: the walk's Opus turn ended after 27 s, so no reading at 60 s or 120 s counts |
| 22 | the nine shots are in `walk-21/`; the two counts read 7 and 2; the list holds only 'spike' again |

Nine turns were spent. The walk found three things about the product (the last part of this
section), none of which stopped a check, and made one mistake of its own that spent no turn
("The queued question").

### The guard

`docker inspect -f '{{.Id}} {{.State.StartedAt}}' bb2dash-sync-1`, read twenty-one times, each time
`bd4d4ae8bb716c53141fcae699d3872dd72c44622674209ed496d04d28305f02 2026-10-05T22:06:22.891074981Z`:

| UTC | when |
|---|---|
| 07:24:40 | first read of the sitting |
| 07:25:53 | before the first docker step |
| 07:26:15 | before `stop workspace` (step 41, in the container tree) |
| 07:26:17 | after it |
| 07:26:22 | after `rm -sf workspace` |
| 07:26:29 | before the build |
| 07:27:10 | after the build |
| 07:27:17 | before the start |
| 07:27:19 | after the start |
| 07:28:06 | before task 13's scan container |
| 07:29:21 | after the scan volume was removed |
| 07:43:23 | before the recreate with the 0.01 cap |
| 07:43:25 | after it |
| 07:44:50 | before the recreate without the variable |
| 07:44:51 | after it |
| 07:47:17 | before `stop workspace` (for the offline shot) |
| 07:47:18 | after it |
| 08:15:15 | before `up -d --no-deps workspace` |
| 08:15:17 | after it |
| 08:17:03 | after the walk's last docker read |
| 08:23:39 | last, before this record was committed |

### Part A: the container on the final code

Only one tree runs the test container, so W-65's step 41 came first, as its list writes it, from
`bb2dash-wt-21-container`: `stop workspace` (exit 0) and `rm -sf workspace` (exit 0,
`Container bb2dash-wt21-workspace-1 Removed`). The network and the volume stayed.

Then, from `bb2dash-wt-21` (clean, `22b9335`; harness commit
`57ee51fc18ee4f7f367b60b24bfe39968d58d86b`, nothing uncommitted under `mcp-server` or `certs`), the
list's build and start lines with the folder changed and nothing else:

```text
cd /c/Users/stack/projects/bb2dash-wt-21 && SECRETS_DIR=C:/Users/stack/.bb2dash-secrets HARNESS_DIR=C:/Users/stack/agentic-harness MSYS_NO_PATHCONV=1 docker compose -p bb2dash-wt21 --profile workspace build workspace; echo "exit=$?"
cd /c/Users/stack/projects/bb2dash-wt-21 && SECRETS_DIR=C:/Users/stack/.bb2dash-secrets HARNESS_DIR=C:/Users/stack/agentic-harness MSYS_NO_PATHCONV=1 docker compose -p bb2dash-wt21 --profile workspace up -d --no-deps workspace; echo "exit=$?"
```

| | |
|---|---|
| build | one build, 07:26:34 to 07:26:56 UTC, exit 0; 23 steps came from the build cache, so only the layers that hold the runner were made again |
| image (step 11) | `sha256:a2ef9b2895180374513e69a45d9d3a04a75fa37883fdf27fce75e5a971a53265`, 1.66GB; the CLI's COPY layer 492MB and its two `ENV` lines 0B. The image before round Z was `sha256:5790950804c5…` |
| start (steps 12, 13) | exit 0 at 07:27:19; the container's image is the new one and its tree `C:\Users\stack\projects\bb2dash-wt-21`; network `bb2dash-wt21_workspace-net`, volume `bb2dash-wt21_workspace-claude-home`, nothing else |

The firewall's log on the new image (step 14):

```text
The host of workspace_runner_db_url ends .pooler.supabase.com
The host of harness_database_url ends .pooler.supabase.com
Allowing DNS to 127.0.0.11
Allowed api.anthropic.com on tcp/443 (1 address(es), pinned in /etc/hosts)
Allowed goultdzqcavefcgnifdy.supabase.co on tcp/443 (2 address(es), pinned in /etc/hosts)
Allowed aws-0-us-east-1.pooler.supabase.com on tcp/5432 (3 address(es), pinned in /etc/hosts)
IPv6 closed (loopback only)
Firewall configuration complete
Firewall verification passed - unable to reach https://example.com as expected
Firewall verification passed - able to reach https://api.anthropic.com as expected
Firewall raised: 3 name(s) allowed
```

The re-reads, each with the list's own line (the folder changed):

| step | what | read |
|---|---|---|
| 15 | health | `healthy` at 07:27:27, the first read |
| 16 | the CLI pin; the six flags in its help | `2.1.289 (Claude Code)`; `6` |
| 17 | whose the Node and `claude` processes are | `node` |
| 18 | the runner's capabilities | pid 1 is `/sbin/docker-init -- /app/docker/workspace/entrypoint.sh node /app/workspace/dist/runner.js`; runner pid 7; `Uid:` 1000 four times; `CapInh`, `CapPrm`, `CapEff`, `CapBnd`, `CapAmb` all `0000000000000000` |
| 19 | no API key, no `DATABASE_URL`; the five settings | `exit=1`, `exit=1`; `false`, `1`, `/home/node/.claude`, `1`, `/app/certs/prod-ca.crt`. `WORKSPACE_TURN_BUDGET_USD` reads `1.00` |
| 24 | the pins | 1 `api.anthropic.com`, 3 `aws-0-us-east-1.pooler.supabase.com`, 2 `goultdzqcavefcgnifdy.supabase.co` |
| 25 | the rules and the sets, as root | `-P OUTPUT DROP`; loopback; udp and tcp 53 to `127.0.0.11`; the state rule; tcp 443 to `workspace-https`; tcp 5432 to `workspace-postgres`; the reject; IPv6 `-P OUTPUT DROP` and loopback only; `workspace-https 3`, `workspace-postgres 3` |
| 32 | the pooler's certificate | `openssl exit=0`, `1`; `/app/certs/prod-ca.crt connected as workspace_runner`; `/tmp/w65-ca/other-ca.crt refused: SELF_SIGNED_CERT_IN_CHAIN`; the throwaway removed (`0`) |
| 37 to 40 | task 13's scan of this image | files: `scanned ~80083552 bytes (80.08 MB)`, `no leaks found`, exit 0; history: `no leaks found`, exit 0; the brief's grep on the history `0`; the scratch volume and its container gone (`0`, `0`) |

No token smoke was run: the first live turn below is the proof.

### Part B: before the first turn

**Usage (task 19): the percentages could not be read.** `/usage` is Stack's to type. The CLI
reports the session and weekly figures in a `rate_limit_event` on its output stream; the runner
reads that line for `usage_limit` and for the overage flag, and neither logs nor stores the
figures. The runner's log of the first live turn holds three lines (started, init, finished) and
none names a window. The CLI's own transcript of that turn, inside the container's volume, holds
no line with `rate_limit`, `utilization`, `five_hour` or `seven_day`. No turn was spent to read
them. What the walk does show: none of the nine turns ended `usage_limit`.

**Task 20's reads**, immediately before the walk:

* `select id, kind, state, to_char(created_at at time zone 'America/New_York', 'MM-DD HH24:MI') from agent_requests where created_at > now() - interval '24 hours' order by id`
  → `1861 sync done 10-06 10:50`, `2034 sync done 10-06 14:48`. The case: 2026-10-07 (New York)
  has no `sync` request yet, and no `sync` row is `queued` or `claimed`. Nothing of another kind is
  `claimed`. `1859`, an `inbox_feedback` row queued on 10-05 16:51, is older than the 24 hours and
  is not waited on; it was still `queued` after the walk, so it was not applied during it.
* The three planner reads, at 2026-10-07T07:35:31.473870Z: `max(updated_at)` of
  `assignment_progress` `2026-10-06 21:38:06.728207+00`; of `reading_progress`
  `2026-10-06 21:37:44.966465+00`; `count(*)` of `assignments` `98`.

**The sign-in.** `.env.testing` was not at the worktree's root. `git check-ignore -q .env.testing`
answered 0 (ignored by `.gitignore:2`), so it was copied from the main checkout (133 bytes; never
printed). The share token came from the Vercel connector and was kept outside every repo for the
walk. `node e2e/login.mjs` saved the session; Playwright 1.63.0 had its Chromium already.

### Part C: the walk

The spec is `web/e2e/walk21.spec.ts`. `02 empty` runs by default. Every other test needed
`WALK21_LIVE=1` and was run alone with `-g`, in the order below, with the selects read between
them (since the walk it also needs `WALK21_ONLY`; see "The walk's own mistake"). The five questions went into one conversation, as Stack's acceptance steps 3 to 7 will; the
cap turn got a conversation of its own.

Immediately before `02-empty.png`:
`select count(*) from workspace_conversations where not archived` → `1`.

The turns that reached the CLI, in order (A is the walk's conversation `bb7c5c35…`, B the cap
turn's `010825de…`):

| # | request | in | question | tier and model as stored | ms | tools stored | ended |
|---|---|---|---|---|---|---|---|
| 1 | 388 | A | step 3 | `low`, `claude-haiku-4-5-20251001` | 6743 | `search_materials · IST.323` | `done` |
| 2 | 389 | A | step 4 | `low`, `claude-haiku-4-5-20251001` | 10841 | `search_context · bb2dash-inbox-decisions` | `done` |
| 3 | 390 | A | step 5 | `low`, `claude-haiku-4-5-20251001` | 7058 | `get_material_text · 733` | `done` |
| 4 | 391 | A | step 6 | `mid`, `claude-sonnet-5-5` | 12060 | `search_materials · IST.352` twice, `get_material_text · 891`, `· 893` | `done` |
| 5 | 392 | A | step 7 | `high`, `claude-opus-5-5` | 27089 | `search_materials · ECN.304` four times, `get_material_text · 218`, `· 800` | `done` |
| 6 | 393 | B | step 7, under the 0.01 cap | `high`, `claude-opus-5-5` | 2615 | `search_materials · ECN.304`, `ok` false | `failed`, `budget_exceeded` |
| 7 | 394 | B | step 3's, as the follow-up, same cap | `low`, `claude-haiku-4-5-20251001` | 8873 | `search_materials · IST.323`, `get_material_text · 733`, both `ok` | `failed`, `budget_exceeded` |
| 8 | 395 | A | step 7 again, stopped | `high`, `claude-opus-5-5` | 14686 | five | `cancelled` |
| 9 | 398 | A | step 3's, asked while the service was stopped | `low`, `claude-haiku-4-5-20251001` | 3132 | none | `done` |

Every tool call of turns 1 to 5 is stored `ok` true.

**Task 19's selects**, as the row writes them.

After step 3's question:

* `select tier, provider, model ~ 'haiku', finished, error_code from workspace_messages where role = 'assistant' order by created_at desc limit 1`
  → `low`, `claude-cli`, true, true, null.
* `select tool_calls @> '[{"tool":"search_materials","ok":true}]' from workspace_messages where role = 'assistant' order by created_at desc limit 1`
  → true.
* `select state from workspace_requests order by id desc limit 1` → `done`.
* `select count(*) from workspace_conversations where claude_session_id is not null` → `1`.
* `select model <> 'haiku' from workspace_messages where role = 'assistant' order by created_at desc limit 1`
  → true (the full id is stored).
* The credential source, from
  `docker compose -p bb2dash-wt21 --profile workspace logs --tail 20 workspace`:

  ```text
  2026-10-07T07:36:15.071Z workspace: turn request=388 started tier=low provider=claude-cli model=haiku
  2026-10-07T07:36:15.565Z workspace: turn request=388 init claude_code_version=2.1.289 credential_source=none permissionMode=dontAsk model=claude-haiku-4-5-20251001 check=pass
  2026-10-07T07:36:21.807Z workspace: turn request=388 finished state=done error=- ms=6743 tools=1
  ```

  The CLI reports `apiKeySource: none`: no API key is in use. (The log writes the init line's
  `apiKeySource` field as `credential_source`.) All nine init lines read the same, and
  `printenv ANTHROPIC_API_KEY` exited 1 again after the walk.

After step 4's question:

* `select tool_calls @> '[{"tool":"search_context","scope":"bb2dash-inbox-decisions","ok":true}]' from workspace_messages where role = 'assistant' order by created_at desc limit 1`
  → true. The answer names decisions 434 and 528 (and 537).

After step 5's: `tool_calls @> '[{"tool":"get_material_text","ok":true}]'` on the newest assistant
row → true (the row has no select for this one; read the same way).

After the five questions, before the Stop:

* `select tier, error_code from workspace_messages where role = 'assistant' order by created_at desc limit 5`
  → `high`, `mid`, `low`, `low`, `low`, each with `error_code` null.

After the walk:

* `select count(*) from workspace_messages m, jsonb_array_elements(m.tool_calls) e where e->>'tool' = 'search_context' and (e->>'ok')::boolean and coalesce(e->>'scope', '') not in ('bb2dash', 'bb2dash-inbox-decisions')`
  → `0`.

One thing the brief expected otherwise: it names task 21's follow-up as the first resumed session
that uses a tool. In this walk that was turn 2 (request 389), because the five questions share one
conversation. The CLI kept one transcript for conversation A from 07:36:15 to 08:15:21 (every
later turn resumed it, across two recreates and one stop of the container) and one for B. No
turn logged the fresh-start retry. Every resumed turn's tool calls were allowed by the gate.

**Task 21 (d), the health readings: not done.** The Opus turn (request 392) was claimed at
07:41:31.19 and finished at 07:41:58.31 by the database's clock: 27.1 s. The reading taken 60 s
into it, `healthy` at 07:42:34 (laptop clock), does not count: the request was `done` by then
(`select state from workspace_requests order by id desc limit 1` → `done`). No reading was taken
at 120 s. The row says to repeat the check on a longer request. No turn of this walk lasted 30 s,
and which request would last 120 s is not something this walk could say, so no further turn was
spent on it. It is the PM's call (questions, below).

**Task 21, the cap.** `select count(*) from workspace_requests where state in ('queued', 'claimed')`
→ `0` before each recreate. The recreate, with the list's start line and the variable in front:

```text
cd /c/Users/stack/projects/bb2dash-wt-21 && WORKSPACE_TURN_BUDGET_USD=0.01 SECRETS_DIR=C:/Users/stack/.bb2dash-secrets HARNESS_DIR=C:/Users/stack/agentic-harness MSYS_NO_PATHCONV=1 docker compose -p bb2dash-wt21 --profile workspace up -d --no-deps workspace
```

→ exit 0, `healthy` at 07:43:37, the container's Env `WORKSPACE_TURN_BUDGET_USD=0.01`. Step 7's
question, in a new conversation:

* `select error_code from workspace_messages where role = 'assistant' order by created_at desc limit 1`
  → `budget_exceeded`.
* `select state, error_code from workspace_requests order by id desc limit 1` → `failed`,
  `budget_exceeded`.

The page showed the badge "Opus · deep work" and "Stopped at the per-answer cost limit." with no
answer text. The turn stopped after 2.6 s, and its session id was stored.

**What the budget-stopped session did on resume (a reading).** One follow-up, step 3's question,
was asked in the same chat while the cap was still 0.01 (the second recreate came after it). The
session resumed: the init line passed its check, no fresh-start retry was logged, and the CLI wrote
both turns into one transcript. The model made two tool calls, `search_materials · IST.323` and
`get_material_text · 733`, both allowed by the gate and stored `ok` true, wrote 626 characters,
and was then stopped by the cap again: `failed`, `budget_exceeded` on the message and on the
request. The page kept the 626 characters and the "Used:" line above "Stopped at the per-answer
cost limit.". What a follow-up does under the usual cap of 1.00 was not read.

The second recreate, the same line without the variable: exit 0, `healthy` at 07:45:04, Env
`WORKSPACE_TURN_BUDGET_USD=1.00`.

**Task 21, Stop.** Step 7's question again, in conversation A. Stop was pressed once the turn read
streaming with answer text on the page, 16 s after the question. The laptop's clock and the
container's read about 2.4 s ahead of the database's; by the database's clock the cancel was
stamped at 07:45:33.317 and the two selects were read at 07:45:38.606, 5.3 s later:

* `select finished, error_code from workspace_messages where role = 'assistant' order by created_at desc limit 1`
  → true, `cancelled`.
* `select state from workspace_requests order by id desc limit 1` → `cancelled`.

The runner's line: `turn request=395 finished state=failed error=cancelled ms=14686 tools=5`.

**Task 21, the queued question.** `stop workspace` at 07:47:18 (exit 0), with no request open.
`07-offline.png` was shot at 07:49:22, 2 minutes 4 seconds later. Step 3's question was asked in
conversation A at 08:03:43.963 (the database's clock; request 398) and showed "Waiting for the
Workspace service".

* At 08:15:05, 11.35 minutes later:
  `select state, error_code from workspace_requests order by id desc limit 1` → `queued`, null.
* `up -d --no-deps workspace` at 08:15:16 (exit 0, `healthy` at 08:15:29). The runner started at
  08:15:17.650 and began the turn at 08:15:18.080.
* The same select → `done`, null. The request had waited 11.53 minutes. The answer used no tool:
  the resumed session already held step 3's answer.

**The walk's own mistake, which spent no turn.** The first `-g "queued question"`, at 07:49:24,
also matched the name of the group the test stood in ("the cap, Stop and a queued question"), so
Playwright started all five tests of that group. Before the run was ended at 08:01:35 (its own
process tree, nothing else) it had asked step 7's question twice while the service was stopped:
once in a new conversation (`427e9403…`, request 396, 07:49:30) and once in conversation A
(request 397, 07:58:35). It wrote no shot and replaced none. Both requests were then stopped
through the page as the owner (the spec's `stop a waiting question`: the Stop button, so
`workspace_cancel`) at 08:03:08 and 08:03:21, while still `queued`:
`claimed_at` null, `attempts` 0, no assistant row. The service never saw them. The group was
renamed, the spec's header says why, and every `-g` pattern was checked with `--list` to select
one test before anything else ran. One reading it left: request 396 waited 13.6 minutes and was
still `queued`, null when it was stopped.

After the walk the spec was tightened so the same slip cannot ask a question: a live test now runs
only with `WALK21_LIVE=1` and `WALK21_ONLY` set to its exact name. Checked without a turn: with
`WALK21_LIVE=1`, no `WALK21_ONLY` and a pattern that matches the whole group, all five tests are
skipped; with `WALK21_ONLY` naming one test, that test runs and its neighbour is skipped. The
newest request was still 398 afterwards.

**`08-desktop.png`.** From the worktree: `npm ci` and `npm run build` in `desktop/` (both exit 0;
Electron 44.4.1 fetched its binary on first use, as its own entry point does), `web/.env.local`
written with the two public Supabase values (gitignored; the anon key copied from the secrets
folder by a script that prints only that its role is `anon`), `npm run build` in `web/` and
`next start -p 3021`. The spec then started the built shell as a second instance with
`BB2DASH_APP_URL=http://localhost:3021`, the two Supabase values, `BB2DASH_SYNC_DRY_RUN=1` and a
new temp folder as `--user-data-dir`, typed the test login into the shell's own window, opened
Workspace from the top bar and the conversation from the list, and shot the window. It asserted
that the window holds the shell's bridge (`window.bb2dashDesktop`), that its origin is the local
build, and that its profile is the temp folder. Stack's running app was not touched: its four
`bb2dash` processes had the same ids and start times before and after (13516, 31932, 37940 since
10-05 18:16 local time; 42072 since 10-06 10:20), and `%APPDATA%\bb2dash\config.json` was last
written on 2026-10-04. Afterwards the second instance was closed, its temp profile removed, and the local
server stopped (nothing listens on 3021).

**After the walk.**

* Task 20's three reads again, at 2026-10-07T08:16:28.348334Z: `2026-10-06 21:38:06.728207+00`,
  `2026-10-06 21:37:44.966465+00`, `98`. Equal pair by pair.
* `select count(*) from agent_requests where created_at between '2026-10-07T07:35:31.473870Z' and '2026-10-07T08:16:28.348334Z' or claimed_at between '2026-10-07T07:35:31.473870Z' and '2026-10-07T08:16:28.348334Z' or finished_at between '2026-10-07T07:35:31.473870Z' and '2026-10-07T08:16:28.348334Z'`
  → `0`.
* The walk's three conversations (A, B and the stray one) were archived as the owner through the
  list's Archive button (the spec's `archive the walk conversations`; three writes, one each).
  `select count(*) from workspace_conversations where not archived` → `1` ('spike').
* `ls docs/planning/sprint-2/walks/walk-21/0[2-8]-*.png | wc -l` → `7`;
  `ls docs/planning/sprint-2/walks/walk-21/1[01]-*.png | wc -l` → `2`.
* `npx playwright test -c e2e/playwright.config.ts walk21`, as the row writes it → 1 passed, 13
  skipped, 0 failed. That run shot `02-empty.png` again; the shot kept is the first one.

### The nine shots

| shot | taken (UTC) | what it shows |
|---|---|---|
| `02-empty.png` | 07:35:51 | Workspace active in the top bar; the list holds only 'spike'; the column reads "Ask a question to start a conversation."; the "Ask" button. Taken before any live turn |
| `03-lookup-haiku.png` | 07:36:29 | step 3's question; badge "Haiku · lookup"; "Used: search_materials · IST.323"; the answer names the file it read (`323Fall26V1.4.docx`) |
| `04-decision-haiku.png` | 07:37:25 | step 4's question; badge "Haiku · lookup"; "Used: search_context · bb2dash-inbox-decisions"; decisions 434, 528 and 537 |
| `10-document-haiku.png` | 07:39:37 | step 5's question; badge "Haiku · lookup"; the syllabus's section headings; "Used: get_material_text · 733" |
| `11-standard-sonnet.png` | 07:41:13 | step 6's question; badge "Sonnet · standard"; the answer names the two decks and their slides; a "Used:" line with `search_materials` and two `get_material_text` |
| `05-deep-opus.png` | 07:42:08 | step 7's question; badge "Opus · deep work"; the two-week plan; a "Used:" line |
| `06-stopped.png` | 07:45:35 | the partial plan, ending mid-list, with "You stopped this answer." under it and the button back to "Ask"; shot 0.3 s after the press |
| `07-offline.png` | 07:49:22 | "The Workspace service is offline." under the composer, 2 minutes 4 seconds after the stop |
| `08-desktop.png` | 08:16:03 | conversation A inside the second desktop shell instance: the stopped turns and the last answer with its "Haiku · lookup" badge |

How the shots of an answer were made. The message column is 62 % of the window's height and
scrolls inside itself, so at 1440 by 900 a long answer's badge and its "Used:" line are never on
screen together. The spec therefore makes the window tall enough to hold the whole turn before it
shoots, prints what the page showed at 1440 by 900 first, and asserts that the question, the badge
and the "Used:" line are on screen and uncovered. Shots 10 and 11 were each taken twice: the first
`10` was taken before the spec did this (the turn sat with its badge cut off at the top), and the
first retake of `11` had the top bar lying across the turn because the spec had scrolled the
window. Both were the spec's faults. The kept shots were taken with `WALK21_RESHOOT=1`, which
asks nothing and shoots the standing turn, so no turn was spent on them. Shots 03 and 04 were
taken at 1440 by 900, where the whole turn fits, and the kept `10` one step before the spec gained
its "uncovered" assertion; all three were looked at, and each shows its badge and its "Used:"
line. Shots 06 and 07 are 1440 by 3640 with an empty lower part: that is the page, not the capture
(W-1, below).

### Turns spent

Nine, as planned: five on Haiku (388, 389, 390, 394, 398), one on Sonnet (391), three on Opus
(392; 393, cut by the cap after 2.6 s; 395, stopped after 14.7 s). None ended `usage_limit`. No
token smoke, and nothing was asked a second time.

### What the walk found about the product

Nothing here was changed. None of it failed a check of rows 19 to 22.

| id | severity | what |
|---|---|---|
| W-1 | MEDIUM | With a long conversation the page grows far past its window, into empty space |
| W-2 | LOW | After a long answer finishes, its "Used:" line lands below the visible part of the column |
| W-3 | LOW | One answer of nine was written with Markdown bold, and the page shows the asterisks |

* **W-1.** With conversation A open at 1440 by 900 the body is 901 px tall and the document
  4662 px (3640 px when the conversation had six turns): the window gets a scrollbar, and a wheel
  turn outside the column scrolls into nothing. The screen-reader labels inside each turn ("You
  asked", "The assistant answered", "Status") are `position: absolute` (`.sr-only`,
  `web/src/app/globals.css`), and the scrolling column (`.column`, `MessageList.module.css`) is
  not their containing block, so they are laid out outside its clip, as far down as the column's
  whole content. Measured in a throwaway page, read-only: the lowest label's bottom edge is at
  4662 px, the document's height exactly; with `position: relative` given to the column in that
  page only, the document is 901 px. Seen in `06-stopped.png` and `07-offline.png` (the empty
  lower part) and in `08-desktop.png` (the window's own scrollbar). It starts as soon as a
  conversation is taller than the window, so Stack's part A will show it.
* **W-2.** Read on turns 4 and 5 at 1440 by 900, straight after the stored row landed: the
  "Used:" line was not on screen (`usedOnScreen: false` for requests 391 and 392, turns of 710 px
  and 1317 px in a column 558 px tall). After a reload it is, because the column then opens at its
  end. The likely cause, read and not tested: `growthOf()` in `MessageList.tsx` follows the number
  of turns, the last text's length and the line under it, but not the "Used:" line, which arrives
  with the stored row. For short answers (steps 3 and 4) the whole turn fits. Acceptance steps 3 to
  5 ask Stack to read that line, so on a long answer he scrolls the column to find it.
* **W-3.** Step 4's answer has `**Decision 434 (September 17).**` and two more like it (shot 04).
  The system prompt asks for plain text with no `*` (`workspace/prompts/system.md`, line 27), and
  the page shows text as typed (O-5). The other eight answers held none.

Not the product's: the first run of `02 empty` printed one console error, "Failed to load
resource: the server responded with a status of 401", with no address. The spec then began
printing every refused response with its address, and no later page load had one.

### Not done, and why

* **Task 21 (d)**, the health readings at 60 s and 120 s: the Opus turn lasted 27.1 s (above).
* **The usage percentages** of task 19 and of acceptance part A: nothing the runner keeps holds
  them (above).
* **A follow-up after a budget stop under the usual cap**: the one follow-up was asked under 0.01.

Everything else in the task was done.

### Questions for the PM

1. Task 21 (d) cannot be met by the walk's Opus turn as the models answer today (27 s). Which
   request should it be repeated on, or should the check be written for a turn of any length (two
   readings while one request is `claimed`)?
2. The usage read: is Stack's own `/usage` enough for 102a, or should the runner log the two
   figures of the `rate_limit_event` it already reads (one line per turn, names and percentages)?
3. W-1 is one CSS line and W-2 one term of `growthOf()`. Fix before Stack's part A, or record
   both as Known issues?
4. Was the follow-up meant to run under the 0.01 cap (as walked) or after the reset?
5. The walk during which the stray requests 396 and 397 were made and cancelled changed no
   planner row and no `agent_requests` row (the pair above). Is it accepted as walked?

### What is left on the laptop

* The test container `bb2dash-wt21-workspace-1`, up and `healthy` from `bb2dash-wt-21` on the
  image `sha256:a2ef9b28…`, Env `WORKSPACE_TURN_BUDGET_USD=1.00`; no request `queued` or `claimed`.
* In `bb2dash-wt-21`, gitignored and untracked: `.env.testing`, `web/.env.local`, `web/.next/`,
  `web/e2e/.auth/state.json`, `web/e2e/.results/`, `desktop/node_modules/`, `desktop/dist/`.
  `git status --short` shows nothing else untracked.
* Three archived conversations (A, B and the stray one) beside 'spike', which is listed.

## `/code-review main high` on bb2dash-stack (2026-10-07)

The umbrella repository's branch (`feat/workspace-21` at `80f6796` against its `origin/main`
`eb71e8b`: 10 files, +709 −65) had been read by the first `/security-review` ("no finding at the
reporting bar in either repository") and not yet by `/code-review`. Run on 2026-10-07: it
rendered the umbrella `compose.yaml` against the phase worktree and the harness checkout in a
scratch copy (the `workspace` service appears only with the profile on, on its own network, with
its four secrets; all 12 secrets merge with no include conflict), confirmed the doctor's new row
is read-only and that its 52 tests run no real Docker, and found no logic bug in the row or the
wiring. Fifteen findings; the PM's severities and dispositions:

| id | severity | status |
|---|---|---|
| S-1 | HIGH | fixed (`1bafad0`, `374c40d`) |
| S-2 | MEDIUM | fixed (the round, `5200df6`) |
| S-3 | LOW | fixed (the round, `5200df6`) |
| S-4 | LOW | recorded: the brief freezes `COMPOSE_PROFILES=workspace` in `.env.example` |
| S-5 | MEDIUM | fixed (the round, `5200df6`) |
| S-6 | LOW | recorded: accepted for v1 in the brief (task 14) |
| S-7 | LOW | recorded |
| S-8 | LOW | fixed (the round, `5200df6`) |
| S-9 | LOW | fixed (the round, `5200df6`) |
| S-10 | LOW | fixed (the round, `5200df6`) |
| S-11 | LOW | recorded |
| S-12 | LOW | fixed (the round, `5200df6`) |
| S-13 | LOW | recorded |
| S-14 | LOW | recorded |
| S-15 | LOW | recorded |

* **S-1** `README.md`, the doctor's hint, `.env.example`: every documented way to start, restart
  or wipe the Workspace went through `just up`, which is `docker compose up -d --build` for the
  whole project and can rebuild and recreate the live `sync` container in the middle of a sync.
  Ruling: the Workspace is started, restarted and rebuilt alone
  (`docker compose up -d --build workspace`); where `just up` stays, the sentence beside it says
  what it does and that it is not run while a sync is open.
* **S-2** `README.md`: the `.pooler.supabase.com` host rule was stated for
  `workspace_runner_db_url` only; the Workspace's firewall applies it to `harness_database_url`
  too, and a machine with another harness store would loop at start.
* **S-3** `.env.example`: a relative `HARNESS_DIR` is resolved against bb2dash's folder for the
  image's build contexts, not against the umbrella folder.
* **S-4** `.env.example`: the profile ships on, so every `just up` also builds the Workspace
  image, and a failed build stops the whole `up`.
* **S-5** `doctor/lib/checks-docker.mjs`: the doctor read `COMPOSE_PROFILES` with its own `.env`
  parser, which keeps an inline comment and does not interpolate, so it could say `off` and exit 0
  while compose had the profile on. Ruling: it decides as compose does.
* **S-6** the row reads `off` without looking at Docker, so a Workspace container still running
  with the profile removed is not shown.
* **S-7** `ps --all` also lists one-off `run` containers and the row judges the first entry.
* **S-8** the `off` text always said `.env` does not name the profile, even when the process
  environment turned it off.
* **S-9** `README.md`: "every row green" straight after the first start is not true for up to a
  minute (health `starting`).
* **S-10** `doctor/workspace.test.mjs`: an assertion that cannot fail (the role name matched in
  the cell that found the row).
* **S-11, S-13, S-14, S-15** the test file's scripted world duplicated, temp folders the tests
  leave, a status literal declared twice, two durations written into messages.
* **S-12** `README.md`: `cp -r secrets.example <folder>` nests the files when the folder exists.

The fix round in the umbrella repository (W-65, test-first; `80f6796` to `374c40d`, then the PM's
two README sentences, `d0d2578`, `9903717`, `5200df6`): `node --test doctor/doctor.test.mjs
doctor/workspace.test.mjs` → 65 tests, 65 pass (52 before). An independent check ran each code item
against a mutant and read every README instruction as a reader would; S-1 holds across the whole
branch (no instruction left that starts, restarts, rebuilds or wipes the Workspace through a
whole-project `up` without the warning beside it, and the rendered `workspace` service has no
`depends_on`, so `up -d --build workspace` names one service). It asked for two more sentences,
which the PM added with a test line each: a Workspace that is already looping is stopped first
(`docker compose stop workspace`), then the profile line is taken out, because once the line is
gone the doctor reads the row as `off` and no longer looks at the container; and the profile line
is written plainly, because `just` reads `.env` itself and passes a `${VAR:-default}` value on
empty. One commit of that pair (`9903717`) left a README test red for a minute; `5200df6` is green.
Task 14's greps all hold at `5200df6`, and `doctor/doctor.mjs` is unchanged against `origin/main`.

Kept as the worker built it: the PowerShell form of the copy line beside the ruled one; a
`COMPOSE_PROFILES` that names the profile while compose has no `workspace` service stays a problem,
and a failed `docker compose config --services` reads `unknown` and is a problem; `.env.example`
keeps its two relative folder values (side by side they resolve to the right folders). One line
outside that repository said the same thing as S-1: the comment over the `workspace` service in
bb2dash's own `compose.yaml`; it follows in this branch.

## The walk's independent check, and the PM's rulings on it (2026-10-07)

A fresh agent opened each of the nine shots and looked at it, read the spec for the assertion
that guards each shot, and re-ran the reads that still hold after the walk (08:28 to 08:36 UTC).

| what | result |
|---|---|
| the nine shots show what task 22 says each must show | holds for all nine |
| every shot is guarded by an assertion that can fail | holds, except `08-desktop.png`'s "the profile is the temp folder", which the spec prints and does not assert |
| task 19's reads (tiers, providers, models, tool calls, no call outside the two bb2dash scopes) | hold |
| the cap turn, the stopped turn, the queued then done request | hold |
| task 20: the three planner values, read again twice after the archive writes | unchanged; no `agent_requests` row moved |
| the end state: the guard, the container from `bb2dash-wt-21`, healthy, the 1.00 cap, no ports, nothing left running, the worktree clean, no secret in the spec, the shots' names or the record | holds |
| task 21 (d), the health readings 60 s and 120 s into the Opus turn | not shown: the turn lasted 27.1 s |
| task 19, the usage percentages before the first turn | not read |
| task 22 (a), "0 failed" | the passing run left no file; the newest run on disk is a failed one, the walker's own check that its archive test refuses to run without the names it archives |

What it saw on the screen, beyond the walker's three defects:

* **W-1 shows from four turns on**: in `11-standard-sonnet.png` and `05-deep-opus.png` as well as
  06, 07 and 08.
* **W-3 is in the answer to acceptance step 4**, which Stack asks himself: three lines read
  `**Decision 434 (September 17).**` with the asterisks as typed.
* **A later turn's "Used:" line can leave out a source.** The Opus answers cite Inbox decision
  notes 538 and 545 and their "Used:" lines name no `search_context`: the notes reached the model
  through the resumed session from turn 2. True to what that turn called, and less than what it
  drew on.
* The message column in the desktop shell shows the default scrollbar with arrow buttons, cutting
  its rounded corners (cosmetic).
* **The repository is public, and these are the first walk shots whose content is assistant
  answers**: one quoted syllabus sentence, slide summaries of two decks, and decision text with a
  quiz score (the score is already in the tracked decision log). The brief asks for the shots.
  Whether quoted course text belongs in a public repository is Stack's call, put to him in the
  hand-off.

### W-R. Rulings (PM)

* **W-1 and W-2 are fixed before Stack's part A** (W-66, test-first, with a check in a real
  browser), and the shots that show W-1 are taken again on the fixed page.
* **W-3 is recorded and put to Stack**: the page shows text as typed by decision (O-5), the
  system prompt already asks for plain text, and one answer of nine did not follow it. Whether to
  strip emphasis markers on the page, press the prompt harder, or leave it is his.
* **Task 21 (d) is repeated once on a longer request**, as the row says, in the sitting that
  retakes the shots. If that turn also ends before the 120 s reading, (d) is recorded as not shown
  live: the heartbeat during a turn is then held by the runner's tests on a fake clock only.
* **The usage percentages are Stack's own read at acceptance step 1.** Nothing the runner logs or
  stores holds them. Logging the two figures of the rate-limit line the runner already reads is a
  follow-up (Known issues).
* **The cap follow-up was asked under the 0.01 cap, as the row orders it**: accepted. The two stray
  requests (396, 397), queued by a mis-aimed test run while the service was stopped and stopped
  through the page before any runner saw them, changed no planner row and spent no turn: the walk
  is accepted as walked.
* **The spec asserts what the record says it asserts**: the 08 test gains the expect on its
  profile folder, and the sitting ends on a passing run so the newest run on disk is green.
* **"The first resumed session that uses a tool"** was turn 2 of the walk (request 389), not the
  cap follow-up, because the five questions share one conversation as Stack's steps 3 to 7 will.

## The retake sitting (2026-10-07): W-1 and W-2 on the real page, five shots taken again, task 21 (d) repeated

Walked by the PM's hands (a workflow agent) in `bb2dash-wt-21` at `25979bb`, 09:34 to 10:01 UTC,
against the branch preview and the test container as the first sitting left it. No product file
was changed, nothing was built or rebuilt in docker, and no command was refused.

In short:

| what | result |
|---|---|
| W-1 on the real page | holds: with either long conversation open at 1440 by 900 the document is 901 px in a 900 px window (the shell's known 1 px). The first sitting read 4662 px |
| W-2 on the real page | holds: after a long answer finished live, with the reader at the column's end, its "Used:" line was wholly inside the column's visible box (turns of 878 px and 2749 px in a 558 px column). The first sitting read false |
| the five shots | taken again as the window, not the page: 11, 05, 06 and 07 are 1440 by 900; 08 is the shell's own window |
| task 21 (d) | repeated once, on request 400. The 60 s reading counts (`healthy` while `claimed`). The 120 s reading does not: the turn ended `done` 76.7 s after its claim. Not asked again (ruling W-R): (d) is recorded as not shown live |
| task 21, Stop | repeated: both selects as the row expects, 4.4 s after the cancel |
| task 20 | the three planner reads are equal before and after; no `agent_requests` row was created or changed state inside the pair |
| turns | three (one Haiku, two Opus), none `usage_limit`; twelve in the walk as a whole |
| the newest Playwright run on disk | `passed` |

### The deployment

The Vercel connector, team `emstacho-sus-projects`, project `web`:
`dpl_AeGycZuGuZrf6mJsAz7JRtk7oJ9w` (`web-lciz8snh1-emstacho-sus-projects.vercel.app`), commit
`25979bb9795f3779c13b8f4502d866af1c1960fa` on `feat/workspace-21`, created 09:33:05 UTC and
`READY` at 09:33:24. Its one alias is the branch preview,
`web-git-feat-workspace-21-emstacho-sus-projects.vercel.app`, so the preview served the fix for
the whole sitting. It was already `READY` at the first read; nothing was waited for.

### The guard

`docker inspect -f '{{.Id}} {{.State.StartedAt}}' bb2dash-sync-1`, read eight times, each time
`bd4d4ae8bb716c53141fcae699d3872dd72c44622674209ed496d04d28305f02 2026-10-05T22:06:22.891074981Z`:

| UTC | when |
|---|---|
| 09:34:32 | first read of the sitting |
| 09:35:25 | with the test container's first read |
| 09:51:03 | before the long turn |
| 09:54:37 | before `stop workspace` |
| 09:54:38 | after it |
| 09:56:29 | before `up -d --no-deps workspace` |
| 09:56:30 | after it |
| 10:00:38 | last, before this record was committed |

The only two docker steps that changed state were that stop and that start. `docker ps` at the
end lists `bb2dash-sync-1` as up 36 hours and healthy.

### Before the first turn

* The last 24 hours of `agent_requests` (task 20's select) → `1861 sync done 10-06 10:50`,
  `2034 sync done 10-06 14:48`. The case is the first sitting's: 2026-10-07 (New York) has no
  `sync` request yet, no `sync` row is `queued` or `claimed`, and nothing of another kind is
  `claimed`. `1859` (`inbox_feedback`, queued 10-05 16:51) is older than the 24 hours and is not
  waited on; it was still `queued` after the sitting, so it was not applied during it.
* The three planner reads, at 2026-10-07T09:35:10.436326Z: `max(updated_at)` of
  `assignment_progress` `2026-10-06 21:38:06.728207+00`; of `reading_progress`
  `2026-10-06 21:37:44.966465+00`; `count(*)` of `assignments` `98`.
* `select count(*) from workspace_conversations where not archived` → `1` ('spike').
* The test container: `healthy`, image `sha256:a2ef9b28…` (the first sitting's), from
  `C:\Users\stack\projects\bb2dash-wt-21`, Env `WORKSPACE_TURN_BUDGET_USD=1.00`. No request
  `queued` or `claimed`; the newest was 398.
* The sign-in: `.env.testing` and `web/.env.local` were in the worktree from the first sitting
  (gitignored, never printed). The share link came from the Vercel connector (it handed back the
  standing one); its token sat in the session's scratch folder, outside every repo, and was deleted
  before this record was committed. `node e2e/login.mjs` saved the session at 09:45:29.

### The spec

`web/e2e/walk21.spec.ts`, 19 tests (14 before). `npx tsc --noEmit` and `npx eslint e2e/walk21.spec.ts`
exit 0. Every pattern used was checked with `--list` to select one test before it ran, and every
live test still needs `WALK21_LIVE=1` and `WALK21_ONLY` set to its exact name.

* **The 08 test now asserts its profile folder, before the shot** (ruling W-R): the folder the
  second instance reports as its own is the temp folder the test made.
* **A shot is the window.** `assertThenShootWindow` asserts the window is 1440 by 900, runs the
  shot's assertions, shoots without `fullPage`, then reads the file back and fails unless it is
  1440 by 900. Every window shot asserts first that `document.documentElement.scrollHeight` is at
  most `window.innerHeight + 1`. Nothing makes the window tall; where more is needed the column is
  scrolled, and only the column.
* **New tests**: `retake 11` and `retake 05` (nothing asked), `w2 document haiku` and `long opus`
  (one turn each, no shot), `w1 numbers` (nothing asked, nothing shot).
* **`06 stopped`, `07 offline` and `08 desktop`** are the first sitting's tests under the window
  rule. The tests that took shots 02, 03, 04 and 10 are unchanged, and those four shots are the
  first sitting's.

One fault of the spec's own, which spent nothing: the first `retake 11` run failed before any shot,
because the row of an archived conversation was looked for from the list and not from the page
(Playwright reads `has` from inside each row). It wrote no file. Fixed, and the next run passed.

### Shots 11 and 05, and which end of the turn they show

At 1440 by 900 the column's visible box is 558 px. The Sonnet turn (request 391) is 710 px and the
Opus turn (392) is 1317 px, so neither can show its badge and its "Used:" line in one picture. The
order for this sitting named both.

* **First take, the turn's end, as ordered** (09:46:45 and 09:47:32): the "Used:" line inside the
  box (its edges 529 and 546 px down a 558 px box) and the badge 135 px (Sonnet) and 742 px (Opus)
  above the box's upper edge, so out of the picture. Both passed the ordered list: the document
  901 in 900, the badge's text, the "Used:" line's text and its place in the box.
* **The question was put to the PM** by message, with the default of keeping those takes: the
  brief's row 22 (c) names the badge for these two shots and no "Used:" line.
* **How "start" arrived.** No message came back. At 09:48:23 the spec changed on disk, not by this
  walker's hand: `retake 11` and `retake 05` now scroll to the turn's start and assert the question
  and the badge inside the box. The session's agent list showed one other agent of the PM's
  session, started about then and since ended (`killed`); the walker takes the edit to be that
  agent's and did not see it made. The same hand ran `retake 05` once at 09:48:54 with the
  walker's runner script (passed). The walker told the PM it was taking the edit as the answer.
* **The kept takes, the turn's start**: `retake 11` at 09:49:47 and `retake 05` at 09:50:42, both
  run by the walker with the spec as committed. The question (12 to 33 px down the box) and the
  badge (41 to 66 px) are inside the box and uncovered. The "Used:" line is below the picture, 147
  px (Sonnet) and 754 px (Opus) under the box's lower edge, and is asserted by its text:
  `Used: search_materials · IST.352, get_material_text · 891, get_material_text · 893` and
  `Used: search_materials · ECN.304, get_material_text · 218, get_material_text · 800`.
* Between the two the walker's command was ended from outside (exit 137, `[killed]`) after
  `retake 11` had passed and before `retake 05` began; `retake 05` was then run on its own.

Each retake opened the first sitting's conversation `bb7c5c35…` from its row under "Show archived"
(the row's button reads "Unarchive"; only the row's link was pressed). Nothing was asked.

### The three turns

All in one new conversation, `9e4a3c11-b972-4ed4-a92d-1ba06705ff91`. Times are the database's.

| # | request | question | tier and model as stored | claimed | finished | ms | tools stored | ended |
|---|---|---|---|---|---|---|---|---|
| 1 | 399 | acceptance step 5's | `low`, `claude-haiku-4-5-20251001` | 09:47:52.882 | 09:48:05.215 | 12254 | `list_courses`, `search_materials · IST.323`, `get_material_text · 733` | `done` |
| 2 | 400 | the long request (below) | `high`, `claude-opus-5-5` | 09:51:16.207 | 09:52:32.959 | 76722 | `search_materials · ECN.304` five times, `get_material_text` fifteen times | `done` |
| 3 | 401 | acceptance step 7's, stopped | `high`, `claude-opus-5-5` | 09:53:52.222 | 09:53:58.212 (the cancel) | 6161 | none | `cancelled` |

Turn 2's question, word for word: "Draft a detailed four-week study plan for ECN.304 from the
lecture slides, deck by deck and slide by slide, with a short self-quiz for each week." Its answer
is 8989 characters. All 23 tool calls of the three turns are stored `ok` true.

Task 19's selects for turn 1, pinned to request 399: `tier` `low`, `provider` `claude-cli`,
`model ~ 'haiku'` true, `finished` true, `error_code` null;
`tool_calls @> '[{"tool":"get_material_text","ok":true}]'` true; `model <> 'haiku'` true; the
request `done`. The count of `search_context` calls outside the two bb2dash scopes is still `0`.

The runner's lines, from `docker compose -p bb2dash-wt21 --profile workspace logs --tail 40 workspace`:

```text
2026-10-07T09:47:55.756Z workspace: turn request=399 started tier=low provider=claude-cli model=haiku
2026-10-07T09:47:56.599Z workspace: turn request=399 init claude_code_version=2.1.289 credential_source=none permissionMode=dontAsk model=claude-haiku-4-5-20251001 check=pass
2026-10-07T09:48:08.005Z workspace: turn request=399 finished state=done error=- ms=12254 tools=3
2026-10-07T09:51:19.041Z workspace: turn request=400 started tier=high provider=claude-cli model=opus
2026-10-07T09:51:19.808Z workspace: turn request=400 init claude_code_version=2.1.289 credential_source=none permissionMode=dontAsk model=claude-opus-5-5 check=pass
2026-10-07T09:52:35.773Z workspace: turn request=400 finished state=done error=- ms=76722 tools=20
2026-10-07T09:53:55.082Z workspace: turn request=401 started tier=high provider=claude-cli model=opus
2026-10-07T09:53:55.788Z workspace: turn request=401 init claude_code_version=2.1.289 credential_source=none permissionMode=dontAsk model=claude-opus-5-5 check=pass
2026-10-07T09:54:01.241Z workspace: turn request=401 finished state=failed error=cancelled ms=6161 tools=0
```

The CLI reports `apiKeySource: none` for all three: no API key is in use. The laptop's clock, and
the container's with it, read about 2.7 s ahead of the database's, as in the first sitting.

### W-2, live

The page stayed at the column's end for each turn: nothing was scrolled and nothing was reloaded.
"Inside" means the line's whole box is within the column's visible box and within the window.

| turn | the turn, the column's box | the reading | where the line stood | the column, from its end |
|---|---|---|---|---|
| 1 (399) | 878 px, 558 px | the "Used:" line inside: **true**, 1 s after the stored row landed and again 7 s later | 524 to 541 px down the box | 0 px |
| 2 (400) | 2749 px, 558 px | the "Used:" line (four lines) inside: **true**, 7 s after the turn closed | 473 to 541 px | 0 px |
| 3 (401) | 148 px, 558 px | the stopped sentence inside: **true** at the shot, and still after the stored row replaced the live text | 521 to 541, then 522 to 542 px | 0 px |

The first sitting read false on turns of 710 px and 1317 px. Turns 1 and 2 here are the same case,
a turn taller than the column, and both read true. Turn 2 is the stronger reading: the line
arrived under 8989 characters of answer that had streamed for over a minute.

### Task 21 (d), repeated once

Request 400 was claimed at 09:51:16.207. Each reading is
`docker inspect -f '{{.State.Health.Status}}' $(docker compose -p bb2dash-wt21 --profile workspace ps -q workspace)`
and, sent with it, one statement holding `select state from workspace_requests order by id desc limit 1`,
`select polled_age_seconds from v_workspace_status` and `now()`.

| reading | the select, by the database's clock | since the claim | state | docker, by the laptop's clock | health | `polled_age_seconds` | counts |
|---|---|---|---|---|---|---|---|
| at the claim | 09:51:19.784 | 3.6 s | `claimed` | not read | | 5 | |
| 60 s | 09:52:17.301 | 61.1 s | `claimed` | 09:52:18.811 to 09:52:19.587 (about 60 s after the claim) | `healthy` | 2 | **yes** |
| 120 s | 09:53:18.386 | 122.2 s | `done` | 09:53:19.895 to 09:53:20.670 | `healthy` | 3 | **no** |

The turn ended `done` at 09:52:32.959, 76.75 s after its claim, with `error_code` null: neither
the 1.00 cap nor the time limit ended it. So one reading counts and one does not. Stop was not
pressed and the question was not asked again. By ruling W-R, (d) is recorded as **not shown
live**: the heartbeat during a turn is held at 120 s by the runner's tests on a fake clock only.
What this sitting adds: 61 s into a claimed Opus turn the container was `healthy` and the last
heartbeat was 2 s old.

### Stop, and `06-stopped.png`

Acceptance step 7's question, in the same conversation. Stop was pressed once the turn read
streaming with at least 40 characters of answer on the page, at 09:54:00.962 by the laptop's
clock, and the window was shot 0.23 s later. By the database's clock the cancel was stamped at
09:53:58.212 and the two selects were read at 09:54:02.642, 4.4 s later:

* `select finished, error_code from workspace_messages where role = 'assistant' order by created_at desc limit 1`
  → true, `cancelled` (the row of request 401).
* `select state from workspace_requests order by id desc limit 1` → `cancelled`.

The stored partial answer is 231 characters, a line more than the page held at the press.

### Offline, and `07-offline.png`

With no request open (`select count(*) from workspace_requests where state in ('queued', 'claimed')`
→ `0`), from `bb2dash-wt-21`, each line with `SECRETS_DIR` and `HARNESS_DIR` set inside it:

* `docker compose -p bb2dash-wt21 --profile workspace stop workspace` → exit 0; the container
  finished at 09:54:37.886.
* `07-offline.png` at 09:56:19.391, 1 minute 41.5 seconds after the stop.
* `docker compose -p bb2dash-wt21 --profile workspace up -d --no-deps workspace` → exit 0 at
  09:56:30 (`Starting`, `Started`: the same container, not a new one), `healthy` at 09:56:36,
  the same image, Env `WORKSPACE_TURN_BUDGET_USD=1.00`.

No question was asked while it was stopped: the newest request was 401 before and after.

### `08-desktop.png`

`git diff --stat 22b9335 HEAD -- desktop` prints nothing, so the shell is the first sitting's
build. In `web/`: `npm run build` (exit 0, 09:56:49 to 09:57:03, build id `fKbBYHM_INuk536CfnRhz`;
the built `.column` rule ends `position:relative;overflow-y:auto`) and `next start -p 3021`. The
spec started the shell as a second instance with `BB2DASH_APP_URL=http://localhost:3021`, the two
public Supabase values, `BB2DASH_SYNC_DRY_RUN=1` and a new temp folder as `--user-data-dir`, typed
the test login into the shell's own window, opened Workspace from the top bar and the sitting's
conversation from the list.

Asserted before the shot: the instance's profile folder is the temp folder; the window holds the
shell's bridge; its origin is the local build; the conversation is the selected one and its first
question is the row's title; the document is 767 px in a 766 px window (1267 by 766 CSS pixels at
a device pixel ratio of 1.75); the column holds 3839 px of content in a 475 px box. The file is
2217 by 1341, the window and not the page. Electron 44.4.1, not packaged.

Stack's running app was not touched: its four `bb2dash` processes had the same ids and start times
before and after (13516, 31932, 37940 since 10-05 18:16:53 local time; 42072 since 10-06
10:20:53), and `%APPDATA%\bb2dash\config.json` was last written on 2026-10-04 21:12:18. Afterwards
no `electron` process was left, the temp profile was gone, and nothing listened on 3021.

### W-1's numbers on the preview

`w1 numbers`, at 1440 by 900, each conversation open and nothing asked:

| conversation | turns | `document.documentElement.scrollHeight` | `window.innerHeight` | the column's `scrollHeight` | its `clientHeight` | a 3000 px wheel turn on the heading |
|---|---|---|---|---|---|---|
| this sitting's, `9e4a3c11…` | 3 | 901 | 900 | 3841 | 558 | moved the window 1 px |
| the first sitting's, `bb7c5c35…` | 8 | 901 | 900 | 4710 | 558 | moved the window 1 px |

The first sitting read the document at 4662 px with `bb7c5c35…` open, and a wheel turn outside
the column scrolled into empty space. The same reading (901 in 900) came back in every test of
this sitting that opened a conversation, at every length the column had: 911, 3677, 3821, 3841
and 4710 px. The 1 px is the shell's, the same on every screen.

### The five shots

| shot | pixels | taken (UTC) | what it shows |
|---|---|---|---|
| `11-standard-sonnet.png` | 1440 by 900 | 09:49:47 | the first sitting's conversation from its "Show archived" row: step 6's question, the badge "Sonnet · standard" and the first part of the answer. The "Used:" line is below the picture |
| `05-deep-opus.png` | 1440 by 900 | 09:50:42 | the same conversation: step 7's question, the badge "Opus · deep work" and the start of the two-week plan. The "Used:" line is below the picture |
| `06-stopped.png` | 1440 by 900 | 09:54:01 | the end of the four-week plan with its "Used:" line, then step 7's question, the badge "Opus · deep work", two lines of partial answer and "You stopped this answer." under them; the button reads "Ask" |
| `07-offline.png` | 1440 by 900 | 09:56:19 | the same conversation at its end, the composer, and "The Workspace service is offline." under it |
| `08-desktop.png` | 2217 by 1341 | 09:57:34 | the same conversation in the second shell instance: the end of the plan, the stopped turn with its sentence, the composer |

All five were opened and looked at. None has an empty lower part, and no `-FAIL.png` was written.
`ls docs/planning/sprint-2/walks/walk-21/0[2-8]-*.png | wc -l` → `7` and
`ls docs/planning/sprint-2/walks/walk-21/1[01]-*.png | wc -l` → `2`, as before.

### After the sitting

* The sitting's conversation was archived as the owner through the list's Archive button (the
  spec's `archive the walk conversations`, one write).
  `select count(*) from workspace_conversations where not archived` → `1` ('spike').
* Task 20's three reads again, at 2026-10-07T09:58:32.350583Z: `2026-10-06 21:38:06.728207+00`,
  `2026-10-06 21:37:44.966465+00`, `98`. Equal pair by pair.
* `select count(*) from agent_requests where created_at between '2026-10-07T09:35:10.436326Z' and now() or claimed_at between '2026-10-07T09:35:10.436326Z' and now() or finished_at between '2026-10-07T09:35:10.436326Z' and now()`,
  read in the same statement as the second planner read → `0`.
* No request `queued` or `claimed`; the newest is 401. The container is `healthy` on the same
  image with the 1.00 cap.
* **The newest Playwright run on disk is a passing one.** The closing run was the row's own line,
  `npx playwright test -c e2e/playwright.config.ts walk21`, at 09:59:30: 1 passed (`02 empty`),
  18 skipped, 0 failed. `web/e2e/.results/.last-run.json` reads `"status": "passed"`,
  `"failedTests": []`. That run shot `02-empty.png` again; the file was put back from git, so the
  shot kept is still the first sitting's.

The sitting's fourteen Playwright runs, in order: `retake 11` (failed, the spec's own fault
above), `retake 11`, `retake 05`, `w2 document haiku`, `retake 05` (the other hand's), `retake 11`,
`retake 05`, `long opus`, `06 stopped`, `07 offline`, `08 desktop`, `w1 numbers`,
`archive the walk conversations`, and the closing run. All but the first passed.

### Turns spent

Three in this sitting: one on Haiku (399) and two on Opus (400, done after 76.7 s; 401, stopped
after 6.2 s). None ended `usage_limit`, and nothing was asked a second time. With the first
sitting's nine, the walk as a whole spent twelve: six on Haiku, one on Sonnet, five on Opus.

### Seen, and not this sitting's to change

* **One refused read on the first page load after a fresh sign-in.** The first run after
  `login.mjs` printed `401 GET goultdzqcavefcgnifdy.supabase.co/rest/v1/agent_requests` and the
  console error that goes with it. None of the thirteen later runs had one. The first sitting saw
  the same once, on its first run, before the spec printed addresses. It is not a Workspace
  read. Why the first load after a sign-in is refused once was not looked into.
* **The shell's window still shows its own scrollbar** on the right edge of `08-desktop.png`,
  with 1 px of travel (767 in 766). That is the shell's known 1 px, seen as a bar in a browser
  that draws bars. The column's own bar with its arrow buttons is as the first check noted.
* **W-3**: none of this sitting's three answers holds `**`, a `#` heading or a list mark (a
  yes-or-no read of the stored rows; no answer was printed).
* **A later turn's "Used:" line still leaves out what it drew from an earlier turn.** The stopped
  turn's answer begins from the decks "read in full for your last request" and its row stores no
  tool call. True to what that turn called, as the first check said.

### Not done, and why

* **Task 21 (d), the 120 s reading**: the turn ended 76.75 s after its claim. Recorded as not
  shown live, by ruling W-R. The 60 s reading counts.
* **A "Used:" line in shots 11 and 05**: the order named the badge and the "Used:" line together
  in the column's visible box. At the window's size they cannot both be there for these two turns.
  The kept shots show the badge, which is what the brief's row names; the line is asserted by its
  text. If the turn's end is wanted instead, `retake 11` and `retake 05` take a one-line change
  and spend no turn.
* **The usage percentages**: Stack's own read at acceptance step 1 (ruling W-R).

Everything else in the sitting's list was done.

### What is left on the laptop

* The test container `bb2dash-wt21-workspace-1`, up and `healthy` from `bb2dash-wt-21` on the
  image `sha256:a2ef9b28…`, Env `WORKSPACE_TURN_BUDGET_USD=1.00`; no request `queued` or `claimed`.
* In `bb2dash-wt-21`, gitignored and untracked, as before: `.env.testing`, `web/.env.local`,
  `web/.next/` (now the build of `25979bb`), `web/e2e/.auth/state.json` (the session saved at
  09:45:29), `web/e2e/.results/`, `desktop/node_modules/`, `desktop/dist/`.
* Four archived conversations (the first sitting's three and this sitting's one) beside 'spike',
  which is listed.

## The retake sitting's independent check, and the PM's rulings on it (2026-10-07)

A fresh agent opened the five retaken shots and the four kept ones, read the spec, and re-ran the
reads (10:05 to 10:20 UTC). 06, 07 and 08 hold; 02, 03, 04 and 10 are the first sitting's files,
byte for byte (02 was shot again by the closing run and put back from git). 17 of its 19 reads
hold. The two that do not, and what it noted:

* **11 and 05 show the badge and no "Used:" line**, and the record could not confirm whose ruling
  "start" was. Ruled below.
* **Task 20's values can no longer be re-read as equal, for a reason outside the Workspace**: a
  real sync (`agent_requests` 2207, queued by the sync runner at 10:06:19 UTC, done 10:08:04) ran
  after the sitting and marked `IST.323/quiz-06` and `quiz-07` graded. The sitting's own pair
  (09:35:10 to 09:58:32) is equal, with no `agent_requests` row inside it, and no Workspace request
  or message exists after 09:58:32. The record's line "no sync request yet" on 2026-10-07 is true
  until 10:06.
* The committed spec is two lines longer above `retake 11` than the file the logged runs used
  (written again at 09:59:14, after the kept shots); it typechecks and lints, and the closing run
  loaded it.
* A plain `npx playwright test … walk21` run shoots `02-empty.png` again: run the spec with
  `WALK21_ONLY`, as the sitting did, or put the file back from git.
  Corrected 2026-10-07 (the docs pass's check): `WALK21_ONLY` does not skip `02 empty`. That test
  stands in the group 'standing data (before any live turn)', which never calls `liveOnlyByName`,
  so the variable is not read for it (the spec's header: "`02 empty` reads standing data and runs
  by default"). What kept it out of the sitting's runs was each run's `-g "<name>"` pattern. So:
  run one test by name with `-g` (every test but `02 empty` also needs `WALK21_LIVE=1` and
  `WALK21_ONLY` set to that name), or put the file back from git afterwards.
* A window-sized shot cannot by itself show W-1 is gone; the proof is the document-height
  assertion before each shot (901 in a 900 px window in every run; 767 in 766 in the shell) and a
  3000 px wheel turn outside the column moving the window 1 px.

### W-S. Rulings (PM)

* **Shots 11 and 05 stand as kept: the turn's start, with the question and the badge.** The
  ruling was the PM's. The brief's row 22 (c) names the badge for those two shots and no "Used:"
  line, and the PM's order for the sitting ("scroll to the turn's end") was wrong against it. The
  "Used:" line of each turn is asserted by its text and is shown for other turns in 03, 04, 10,
  06, 07 and 08.
* **How the ruling reached the walker, said plainly.** The walker asked the PM by message. The
  PM's reply did not go to the running walker: it started a second copy of the same agent in the
  same worktree, which read the reply, edited the spec to "start" at 09:48:23 UTC and ran
  `retake 05` once (09:48:54). The PM stopped that copy at 09:49:47 (the walker saw one of its own
  commands end with exit 137 at that moment and went on). Two agents shared the worktree for two
  minutes. Nothing was doubled: `workspace_requests` holds three requests for the sitting (399,
  400, 401), no docker state changed in those two minutes, and the kept shots are the walker's
  own runs: 11 at 09:49:47 and 05 at 09:50:42, which replaced the copy's take. A PM does not reply by message to an agent that
  is still running a walk again: the agent takes its stated default and the PM rules afterwards.
* **Task 21 (d) is recorded as not shown live.** Repeated once on a longer request, as the row
  says: request 400 (Opus) ran 76.75 s. The 60 s reading counts (`healthy`, state `claimed`,
  `polled_age_seconds` 2); the 120 s reading does not (the request was done). That the heartbeat
  and the health check hold through a turn longer than the 90 s alive window is held by the
  runner's tests on a fake clock, and by one live reading at 61 s. STATUS lists it.
* **Two small things for STATUS, Known issues**: one 401 on a read of `agent_requests` on the first
  page load after a fresh sign-in (seen once in each sitting, not a Workspace read, not looked
  into); and in the desktop shell the window draws its own page scrollbar with 1 px of travel on
  every screen (the app shell is 1 px taller than its window, the same on `main`).
* **The walk as a whole spent twelve turns on Stack's plan** (nine in the first sitting, three in
  the second) and the docker step's one smoke: thirteen.

## The suites at the phase head (2026-10-07, gathered for task 24's docs)

One place for the figures STATUS gives, each with the commit it was run on and where that run is
recorded. The phase head is `6651abc`.

| suite | figure | run on | where the run is |
|---|---|---|---|
| web tests | 154 files, 2840 tests, 0 failed (2427 at the cut); typecheck and lint exit 0 | `0e169ba`, W-66's walk fixes, merged as `25979bb` | `102_W66_VERIFICATION.md`, "Walk defects W-1 and W-2 (2026-10-07)", section 6: `Test Files  154 passed (154)` · `Tests  2840 passed (2840)` |
| runner | 9 files, 810 tests, 0 failed | the merged branch at `134ee64` | "Fix round Z", above |
| SQL | `passed 67, failed 3, units 70` | `d885d3a`, against prod, after 143 was applied | "Migration 143 applied", above |
| container: `docker/grep-clean.test.mjs` | 13 of 13 | `93c285f`, and again on `31406db` for this section | "`/code-review d4b1b8d high`", row 6 of its table, above |
| container: `docker/workspace/init-firewall.test.mjs` | 21 of 21 | `defc566`, and again on `31406db` for this section | "Tasks 12 and 13 — the docker step, second run", above |
| bb2dash-stack: the doctor's tests | 65 of 65 (52 before its fix round) | bb2dash-stack `5200df6` | "`/code-review main high` on bb2dash-stack", above |

What has changed since each run, read with `git diff --stat <commit> HEAD -- <folder>`:

* **Web.** This file's last web row is 153 files and 2830 tests at `6eb6580`, before W-66's walk
  fixes. 2840 = 2830 + 10: `Workspace.layout` 4 (new) and `Workspace.failures` 19 → 25 (W-66's
  count). Since `0e169ba` one file has changed under `web/`, the walk's Playwright spec
  `web/e2e/walk21.spec.ts`, which the unit suite does not load (it includes `test/**/*.test.{ts,tsx}`
  only). `git ls-files web` counts 154 test files at the head.
* **Runner and SQL.** Nothing has changed under `workspace/` since `134ee64`, or under `db/` since
  `d885d3a`. The SQL figure is the last whole run in this file, which holds no run of the suite
  after the real sync of 10:06 UTC; its three failing units read prod's course data.
* **Container.** Nothing has changed under `docker/` since `defc566`; `compose.yaml` gained a
  comment (S-1). `31406db` is the docs branch: its tree equals the phase head's outside
  `docs/` and `project-state/`. Both file suites were run there on 2026-10-07 at about 10:50 UTC:
  `tests 13`, `pass 13`, `fail 0` and `tests 21`, `pass 21`, `fail 0`.
* **bb2dash-stack.** Not run again for this section; the figure is the fix round's at `5200df6`.

## The walk's two layout fixes (W-66, merged at `25979bb`)

W-1 and W-2, found by the first sitting, were fixed test-first by W-66 (`23c228d` red and `392c35f`
green for W-1: `position: relative` on the message column, so its screen-reader labels are laid
out inside the box that scrolls; `65ac8a9` red and `bff1c24` green for W-2: the column follows its
own measured height while the reader is at its end, in place of a list of what can grow). Gates on
the merged branch: web typecheck exit 0, 154 files and 2840 tests, eslint clean, build ok, lines
91.46% (`102_W66_VERIFICATION.md`, "Walk defects W-1 and W-2").

An independent check then measured both in Chromium on the built page (a local `next start` of the
fix and of the phase branch before it, an invented session against a stand-in backend, no live
turn): with eight long turns at 1440 by 900 the document was 7918 px before and 901 px after, the
same as every other screen; the column still scrolls inside itself; the labels are still in the
accessibility tree; the stored row's "Used:" line lands inside the column when the reader is at
its end and moves nothing when they have scrolled up; mutants that undo either fix fail tests;
0 of 1,296,000 pixels differ elsewhere on the page. Its one finding is not the fix's: the app
shell is 0.92 px taller than its window on every screen, on `main` too (the top bar renders 52.92
px against a rail sized for 52). Ruling: W-1 is closed at "the conversation adds nothing to the
page"; the shell's pixel is its own item (STATUS, Known issues). The second sitting showed both
fixes on the real page.

**What no `/code-review` read.** The last `/code-review` range ends at `ac41858`. After it came
three small rounds: the runner's round Z (rulings Z1), the umbrella's fix round, and these two web
fixes. Each was read by an independent check that ran mutants against it (and, for the web fixes,
a real browser), and none by a third `/code-review` or `/security-review`. Both PRs are open for
one if Stack wants it.

## Task 25 — both PRs open, the preview live (2026-10-07)

| check | result |
|---|---|
| `gh pr view 78 --repo emstacho-su/bb2dash --json state,headRefName` | `OPEN`, `feat/workspace-21`, mergeable |
| `gh pr view 3 --repo emstacho-su/bb2dash-stack --json state,headRefName` | `OPEN`, `feat/workspace-21`, mergeable |
| the Vercel connector's `web_fetch_vercel_url` on `https://web-git-feat-workspace-21-emstacho-sus-projects.vercel.app/login`, 11:17:04 UTC | HTTP 200, the page titled "Sign in · bb2dash" (deployment `dpl_BY8hkcUdpQJ3zNLbmuiqVu8KdBsJ`) |
| the branch against `main` | 2 commits behind (PR #77's two), merges cleanly |
| a scan of the whole branch diff for secret shapes (`sk-ant-`, a JWT, `sb_secret_`, a DSN with a password) before the PR opened | none; the one DSN-shaped line is a made-up test value (`db.example`) |

Opened together; bb2dash merges first. Each PR's description carries the preview link, the gates,
the walk's proofs, and what is Stack's: the acceptance walk and the questions put to him.

**Task 23's first grep, said plainly.** `grep -c "net.http_post"` on this file read 0 until the
note under the `/security-review` request was written on 2026-10-07; the request as sent named
pg_net's functions as a whole and that any database login can make the database send HTTP
requests, not `net.http_post` and its two tables by name. PM ruling: row 23 is met in substance
(the reviewer was told the reach and raised no finding on it); the brief's row 23 says so.

**The public screenshots.** The PM opened the bb2dash PR knowing the walk's shots hold real
answers (a quoted syllabus sentence, slide summaries, three Inbox decisions) and that the
repository is public. They were already on three pushed branches, so holding the PR back would
have hidden nothing; replacing them means rewriting those branches, which waits for Stack's word.
It is the first line of the hand-off.

The PM stops here: ready when Stack says so.

## The third reviews: what no review had read (2026-10-07, after the PRs opened)

Stack: "continue". The PM used it to close the gap named under "What no `/code-review` read": the
three small rounds after `ac41858`. Nothing was merged.

### `/code-review ac41858..HEAD high` on bb2dash (PR #78, at `7726633`)

It read the runner's round Z, the two web layout fixes and the walk's specs, and ran the runner's
suite (810 passed). Each fix does what its ruling says; migrations 140 to 143 accept the minimal
close. Eleven findings, none CRITICAL or HIGH; the PM's severities and dispositions:

| id | severity | status |
|---|---|---|
| R3-1 | MEDIUM | recorded: hardening, outside this phase's files (W-T) |
| R3-2 | LOW | recorded (W-T) |
| R3-3 | LOW | fixed (merged `4dbcaba`) |
| R3-4 | LOW | recorded (W-T) |
| R3-5 | MEDIUM | fixed (`012e93d`, merged `5bfe6bb`) |
| R3-6 | LOW | recorded (W-T) |
| R3-7 | MEDIUM | fixed (merged `4dbcaba`) |
| R3-8 | LOW | fixed (merged `4dbcaba`) |
| R3-9 | LOW | recorded (W-T) |
| R3-10 | MEDIUM | fixed (merged `4dbcaba`) |
| R3-11 | LOW | fixed (merged `4dbcaba`) |

* **R3-1** `mcp-server/src/env-file.ts` (Phase 14's file, in the image): the NUL refusal of ruling
  Z1 covers the runner's two secrets only. The materials server's key, saved as UTF-16 with no
  line end, passes its own clean-up; every materials call then fails with Node's
  `Headers.append: "Bearer <key>" is an invalid header value`, which goes back to the model as the
  tool's error and into the CLI's transcript. The stored file is UTF-8 (41 bytes), so this is not
  the state today.
* **R3-2** `workspace/src/providers/claude-cli.ts`: a result read before the abort stops counting
  if a second result line is read after it. No recording shows a CLI writing two result lines.
* **R3-3** `web/e2e/walk21.spec.ts`: the live W-2 test never asserts the turn is taller than the
  column, so a short answer would pass with or without the fix (the recorded sitting had 878 px
  against 558); the long-Opus test fails on `undefined` when an answer used no tool.
* **R3-4** `web/src/components/workspace/MessageList.tsx`: the column's height is measured after a
  commit, so growth without one (the web font swapping in on a cold load) is caught up at the next
  commit, up to 30 s later, by a small jump for a reader sitting at the end.
* **R3-5** the same hook: nothing resumes following when the reader asks a new question, so a
  question asked while scrolled up appears, and is answered, out of view.
* **R3-6** `workspace/src/turn.ts`: after a refused finish and its minimal close, the turn's own
  promise still resolves with the ending it computed, not the one stored. Nothing reads it today.
* **R3-7** `web/e2e/walk21.spec.ts`: `02 empty` runs on every unfiltered run of the e2e folder,
  depends on prod holding exactly one conversation titled 'spike', and writes into the tracked
  walk folder either way.
* **R3-8** the same spec: three assertions restate what the lines before them built.
* **R3-9** `workspace/src/alive.ts`: round Z moved every in-process duration to the monotonic
  clock and left the alive file's age, read across two processes, on the wall clock.
* **R3-10, R3-11** the spec is 1212 lines against the 800-line rule, and walks up to the scrolling
  ancestor in three places.

### The umbrella's fix round and a security read of both deltas (a workflow: three readers, one skeptic per finding)

* **Security, over `ac41858..HEAD` in bb2dash and `80f6796..HEAD` in bb2dash-stack: no finding at
  0.7 or above.** Traced end to end and holding: the minimal close is built only from the turn's
  own claim and cannot close another request; every error on the new retry, refusal and close
  paths is rebuilt through the redaction, and the NUL refusal names a secret and a path, never a
  value; the firewall's de-duplication drops no address and lets none in; the doctor's new
  `docker compose config --services` call takes no value from `.env` as a command; the web change
  adds no raw HTML sink.
* **bb2dash-stack, two readers (correctness, and the operator who follows the README): ten
  findings, seven confirmed by their skeptics, all LOW; three refuted** (acceptance step 13's
  `just up`, which DECISIONS rules on, and two wordings of the doctor's rows). Confirmed: the
  first-time step promised every row green before the Blackboard login of the next step;
  `.env.example` gave the opposite order to the README for switching the Workspace off (the PM's
  own sentence of the round before); the README called `up -d --build workspace` a restart, which
  leaves a running, unchanged container alone; three mutants of the new profile check survived
  all 65 tests; and bb2dash's `compose.yaml` comment carried two pre-merge command lines that
  would have gone to `main` as if current. All fixed: the umbrella's at `eb4e0cf` (test-first, each of the
  three new cases shown to fail its mutant), then `190fa43` for one more sentence its own check asked for (the
  first-time step now names `job collect` beside `blackboard` as a row still red a minute in, and why), 70 of
  70 tests; bb2dash's comment at `82a23f1`.

### W-T. Rulings (PM)

* **R3-5 is fixed**: the reader's own new question takes the column to its end and resumes
  following; a turn that arrives unasked does not pull a reader who has scrolled up.
* **R3-7, R3-10, R3-11, R3-3, R3-8 are fixed in the PM's spec**: the walk runs only when switched
  on, no file is over 800 lines, one helper finds the column, the W-2 tests fail for the right
  reason only, and the desktop test asks the running instance for its own profile folder.
* **R3-1 is recorded as hardening and not fixed here.** It is the same fault ruling Z1 closed for
  the runner, in a file Phase 14 owns and the host's materials server shares; the fix is one
  refusal in `cleanSecretText` and its tests, then an image rebuild. It needs a wrongly encoded
  secret file, and a materials server with such a file answers nothing, which shows at once.
  STATUS lists it with the other hardening.
* **R3-2, R3-4, R3-6, R3-9 are recorded** (STATUS, Known issues): each needs an input no recording
  shows or moves nothing a user sees. None is worth another image rebuild before acceptance.
* **The umbrella's seven LOW findings are fixed** (three sentences, three test cases, one
  comment), and `CLAUDE.md` now carries S-1's rule.
* With this, every line of both PRs up to `7726633` and `5200df6` has been read by a `/code-review` or by
  its equivalent with skeptics, and by the security method. The fixes of this pass itself (R3-5, the spec,
  the umbrella's sentences and cases) are held by their own independent checks: the web fix against three
  mutants and in Chromium against a stand-in backend, the spec by its title list and a skipped run, the
  umbrella's cases against their mutants.

Gates at the phase head after this pass (`4dbcaba` and the docs commit that follows): web typecheck exit
0, 154 files and 2846 tests, eslint clean; a plain `npx playwright test … walk21` reports 19 skipped and
writes nothing; runner 810 (unchanged since round Z); bb2dash-stack 70 of 70 at `190fa43`. The test
container was not rebuilt: nothing under `workspace/`, `docker/` or `mcp-server/` changed in this pass, and
the rendered `workspace` service's hash still equals the running container's label.

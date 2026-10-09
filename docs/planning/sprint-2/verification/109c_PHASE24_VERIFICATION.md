# 109c: Phase 24a verification

The PM's record for brief `109_PHASE24_workspace_assistant.md`. Each probe has its one pass or fail
line at the place the task list gives it. Worker records are beside this file
(`109_W76_VERIFICATION.md` to `109_W79_VERIFICATION.md`, `109_W85_VERIFICATION.md`).

## The session's start, 2026-10-08

* Worktree `bb2dash-wt-24` clean at `origin/feat/workspace-24`, e365153, 10 commits ahead of `main`
  (a58be34). `origin/main` had not moved. bb2dash-stack `origin/main` c4a54f8.
* Open PRs: #84 (Phase 21's step 1, waits for Stack's word) and #59. No acceptance run open
  (`C:/Users/stack/.bb2dash-accept/` holds no `accept.lock`, no `bb2dash-accept-` container).
* The untagged-session check was not due (`untagged-sessions.mjs --due`: last review 3.0 days ago).
* Stack's line with the start prompt: workers run on Sonnet 5.5, not on Opus as the brief says.
* 109a's item 23 had no answer line. It was put to Stack in the first report with the planning
  session's timings, and the probes started without it. The freeze waits for it.

## The live images and containers, before the first probe and after the last

Read 2026-10-08 23:27Z and 2026-10-09 00:09Z. The two readings agree, line for line.

| tag | id |
|---|---|
| `bb2dash-sync:local` | `sha256:084b9ede6aadb40a0c1389f10e8f841802355beafd21558da215a0bce975f10f` |
| `bb2dash-mcp:local` | `sha256:bf212746abf172b8d8f1a9f880afda84540b27c919fa057937f4fd50ee845d05` |
| `bb2dash-apply:local` | `sha256:3315bf7c18e2b14615a0e226f9ed8144c0a3f0ad7de0a9b50435c98d48340873` |
| `bb2dash-workspace:local` | `sha256:42c552c05ad6caf7565095b6c882643e022352d0357364024cdfc4cab7e5f2f4` |

| container | id | started |
|---|---|---|
| `bb2dash-sync-1` | `6d007fa6448e…ff64ded3` | 2026-10-08T15:15:32Z |
| `bb2dash-apply-1` | `cf35fbd0e3d5…0d68df97` | 2026-10-08T04:02:55Z |
| `bb2dash-workspace-1` | `9a02c3ccd37b…c9b8c845` | 2026-10-08T16:34:35Z |
| `bb2dash-harness-jobs-1` | `222ae50dbaae…f9060843` | 2026-10-08T04:02:55Z |

The `bb2dash-mcp` containers that Claude sessions start and stop are left out (rules file, Session 3).

## How a probe was run

No image was built, nothing was started with `up`, and nothing ran by `exec` in a live container.
Each probe ran one command in a throwaway compose project on the image as it stands:

```text
cd C:/Users/stack/projects/bb2dash-wt-24 && SECRETS_DIR=C:/Users/stack/.bb2dash-secrets HARNESS_DIR=C:/Users/stack/agentic-harness MSYS_NO_PATHCONV=1 docker compose -p bb2dash-p24 -f compose.yaml -f <scratch>/probe.compose.yaml --profile workspace run --rm --no-deps --pull never -T workspace <command>
```

The second compose file, in the session's scratch folder, adds two bind mounts: the probe scripts
(read-only) and a folder for raw output. The form check, with no model call: the entrypoint raised
the firewall (three names allowed), dropped to `node` (uid 1000) and ran the command; no runner loop
started; `claude --version` gave `2.1.289 (Claude Code)`; `/run/workspace` was `700 node`.

Each turn was started as the runner starts one (`claude-cli.ts`, `childEnv` and `spawnClaude`): the
argv of the brief's table, working directory `/app/turn`, the token read from its secret file. Raw
output stayed in the scratch folder. Prompts and questions were synthetic. P-10 used a compose file
of its own (project `bb2dash-p24x`) with dummy secret files and no real secret.

Afterwards the two projects' volumes and networks were removed by name
(`bb2dash-p24_workspace-claude-home`, `bb2dash-p24_workspace-net`, `bb2dash-p24x_ingest-exchange`,
`bb2dash-p24x_p10-net`); `docker volume ls` and `docker network ls` show nothing of either.

**Walk boxes beside the probes.** Phase 22 started walk boxes from 23:34Z on. A timed probe waited
for a moment with none running and was repeated if one started meanwhile; the untimed ones ran
beside them. The first P-4 run overlapped one and is not the run that counts.

## The probes before the freeze

| probe | line |
|---|---|
| P-1 | **PASS.** A Haiku turn with `--mcp-config /run/workspace/mcp-none.json` (`{"mcpServers": {}}`) and no `--allowedTools`: the init line holds 0 servers and 0 tools, `apiKeySource` is `none`, the result is `success`. Recording `probes/p1-no-mcp-server.jsonl`; `cd workspace && npx vitest run test/probe24-fixtures.test.ts` passes (25 tests) |
| P-2 | **PASS.** `claude --help` in the image lists `--no-session-persistence` (count 1). With the config folder on tmpfs (`/home/node/.claude`, mount type `tmpfs`) and the flag in the argv, a turn started and ended `success`, and the file count under `/home/node/.claude/projects` after it is 0 (5 files elsewhere in the folder, none a transcript). The same turn without the flag, on the volume, left one more file under `projects` (21 before, 22 after). So the flag goes into the argv and the service takes a tmpfs in place of the volume |
| P-3 | **PASS.** Ten fresh Opus turns, each its own session with a prompt of 128,000 bytes rebuilt from the earlier turns, at `--max-budget-usd 0.95` (the answering turn's share of the 1.00 cap): 10 `success`, 0 `error_max_budget_usd`. Costs 0.3686, 0.3521, 0.3522, 0.3523, 0.3525, 0.3526, 0.3527, 0.3528, 0.3530, 0.3531: each its own turn's, none a running total, all under 0.95 and so under 1.00. Turn 10 answered with the code word given only in turn 1 |
| P-4 | **FAIL as written; PASS under two PM rulings (below).** As the brief's table has the turn: 20 of 20 answers were the right object inside a Markdown code fence, so 0 pass a check for the object alone and 20 pass once the fence is taken off; median 8.99 s against the bar of 8 s (a walk box ran beside the second half); every cost under 0.05 (largest 0.0101). The time is thinking: P-1's turn spent 846 of its 897 output tokens on it. `--json-schema`, tried next as the task says: 0 of 10, because the CLI then calls a tool of its own, `StructuredOutput`, and the image's gate denies it. With `MAX_THINKING_TOKENS=0` in the child's environment, the committed draft of `plan.md`, and one code fence accepted (clean run 2026-10-09 00:06:32Z to 00:07:09Z, no walk box beside it): **20 of 20 valid, median 1.47 s, slowest 2.19 s, largest cost 0.0140** |
| P-5 | **PASS.** One prompt argument of 128,000 bytes (argv 128,508 bytes in all): the CLI started and a result line was read (`success`) |
| P-6 | **PASS.** A per-request config `/run/workspace/mcp-<uuid>.json` (mode 0600, removed after the turn) named one server with three values in its `env`. The throwaway server's first result held `BB2DASH_MAX_SEARCHES=3` and `BB2DASH_COURSES=BIO.110,CSE.130`; its fourth call answered with an error result; the turn's result is `success`. The gate allowed all four calls (4 hook answers, exit 0). The answering turn keeps its own tools |
| P-10 | **(a) FAIL, (b) PASS, (c) PASS. By the task's rule the parser moves to the service `workspace-extract` (ruling below).** (a) Compose says "secrets `uid`, `gid` and `mode` are not supported, they will be ignored": the dummy secret was mode 777, owner 0, on a `v9fs` mount, and a second user (uid 1001) read it. (b) The image's firewall rose, `iptables -I OUTPUT 1 -m owner --uid-owner 1001 -j DROP` loaded, the worker's user reached `https://api.anthropic.com` (HTTP 404) and the second user did not (curl exit 28; the rule counted 18 packets). (c) The root script started one `sleep` as each user; after 15 s both were up, uid 1000 and uid 1001, each with `CapEff` and `CapBnd` 0; the worker's user could not start a process as the second; a file went through a shared tmpfs folder and back |

## What the probes showed beside their lines

* **P-10, three more readings**, taken because nobody answers a worker after the freeze.
  1. With a read-only root the image's firewall script fails: "/etc/hosts cannot be written, so no
     name can be pinned". A service that raises this firewall cannot have a read-only root.
  2. The fallback's own form works on this Docker: two services of today's image shared one named
     volume backed by tmpfs (`driver_opts: type tmpfs, device tmpfs, o size=96m,mode=1777`). The
     reader ran as uid 1001 with `network_mode: none` (only `lo`), no secret, a read-only root and
     `cap_drop: ALL`; it read the writer's file and the writer read its answer.
  3. In a folder of mode 1777 the writer could not remove the file the reader made (the sticky
     bit). The exchange folder needs a mode that lets the worker clear it.
  4. Seen and not taken: with the secrets folder itself given to the worker's user at mode 0500 by
     the root script, the second user was refused. It would keep one service, and it rests on a
     `chmod` at every start.
* **P-3, a floor to know.** A full-size prompt costs about 0.35 on Opus by the CLI's own estimate
  before a word is answered. Three searches, ten opened units and a long answer come on top, inside
  0.95. The walk watches a Deep question's stored cost.
* **P-4, what the plans look like.** With thinking off the model narrows `kinds` more than the
  prompt asks: "what did we talk about last time" was planned as course material alone in one of two
  runs. The check is on a plan's shape, so this is not a fail. W-77 owns `plan.md`'s wording; the
  walk asks one question that only a remembered item can answer once memory is on (24b).
* **The plan's usage figures.** Each recording carried one `rate_limit_event` line with the plan's
  five-hour and seven-day figures (0.15 and 0.50 at 23:32Z). The line is taken out of the committed
  recordings.

## PM rulings before the freeze, from the probes

* **F-1. The planning, summary and rolling turns run with thinking off.** `MAX_THINKING_TOKENS=0`
  is added to the child's environment for those three kinds of turn, on top of what `childEnv`
  returns; the argv table is unchanged and `childEnv` keeps its signature (apply imports it). The
  answering turn is not touched.
* **F-2. A plan is the object alone, or the object inside one Markdown code fence.** Anything else
  is the fallback plan, as before. `--json-schema` is not used.
* **F-3. The parser moves to its own service, `workspace-extract`**, as the brief's task 10 rules
  for a fail of any part. One image, two services. `workspace-extract`: no network
  (`network_mode: none`), no secret, a read-only root, every capability dropped, its own user, the
  memory and process limits, and one mount, the exchange volume. `workspace-ingest`: the worker
  alone, on `ingest-net` behind its firewall, the two secrets, the same limits, the same one mount,
  and a root that is not read-only, because its firewall pins names in `/etc/hosts` as the
  Workspace's does. The exchange volume is `ingest-exchange`, backed by tmpfs, 96 MB, mounted by
  those two services and no other; it holds the one file being read and its units, and the worker
  clears it after each document. The firewall's owner rule and the secret's mode are no longer
  part of the design. Written into the brief as "Freeze amendments".
* **F-4. `--no-session-persistence` is in the argv and the Workspace service takes a tmpfs** at
  `/home/node/.claude` in place of the named volume (P-2 passed). `cleanupPeriodDays` is not
  changed.

## Task 12, the freeze

Prepared: the nineteen JSON files, the three text files, the routine wording
(`workspace/test/fixtures/contract24/`, its `README.md` with every SQL signature) and the PM's test.
**Frozen 2026-10-08** on Stack's answer to item 23, "a", given in the terminal after the probes'
report: `grep -c "^    \*\*His answer to item 23" docs/planning/sprint-2/briefs/109a_PHASE24_open_questions.md`
gives 1; `ls workspace/test/fixtures/contract24/*.json | wc -l` gives 19 and each parses (the PM's
test, 25 of 25); the worktree count is under "Worker branches" below.

**The facts re-read at the cut** (one read-only SELECT on prod, 2026-10-09 00:13Z; `git fetch` at
00:15Z). `origin/main` is a58be34, unmoved; bb2dash-stack `origin/main` is c4a54f8, so the
follow-ups have not merged and W-85 is not cut. No migration named 187 to 199 is on prod; the newest
is `186_inbox_apply_notices`. One vector column. A sync has run since the brief was written: 1,005
units and 2,039 vectors (the brief read 982 and 2,011), none without a vector. The four policies on
the two course text tables are as the brief lists them. `workspace_runner` executes the five. One
bucket, `bb-files`. No role `workspace_ingest_runner`. 41 requests, none open; 11 conversations.
The counts the challenge round cited (work rows, score rows, byte sizes) were not read again:
check 21 holds them on synthetic rows.

## Worker branches

Cut from the freeze commit 40cf386 and pushed, 2026-10-09 00:2xZ:
`git worktree list | grep -c "feat/workspace-24"` gives 5.

| worker | worktree | branch | started | this run |
|---|---|---|---|---|
| W-76, db | `bb2dash-wt-24-db` | `feat/workspace-24-db` | at the freeze | tasks 13 to 20, 49, 50 and task 22's lines |
| W-77, runner | `bb2dash-wt-24-runner` | `feat/workspace-24-runner` | at the freeze | tasks 28 to 35 |
| W-78, search and embed | `bb2dash-wt-24-search` | `feat/workspace-24-search` | at the freeze | tasks 23 to 26 |
| W-79, ingest, sync and containers | `bb2dash-wt-24-ingest` | `feat/workspace-24-ingest` | at the freeze | tasks 36 and 39; 37 and 38 wait for W-77's task 32 and W-78's task 25 on the phase branch |
| W-85, umbrella | not cut | | waits for the follow-ups' bb2dash-stack PR on that `origin/main` | task 40 |

All four are Sonnet 5.5. The SQL runner answers `--ping` in `bb2dash-wt-24` and in
`bb2dash-wt-24-db` ("connected as db_test_runner").

**How a migration is proved.** The test login cannot run DDL, and no worker reaches the database
by any other way. W-76 hands back each migration with its unit and the unit's red run. The PM runs
`begin; <migration>; <unit>; rollback;` as the dry run of task 21 before a migration goes to Stack
for his word, and the unit's green run through the runner follows the apply.

## The workers' first hand-backs, 2026-10-08 evening

| worker | merged into the phase branch | gates read by the PM on the merged branch |
|---|---|---|
| W-78, tasks 23 to 26 | 4eab863 | `mcp-server`: typecheck clean, 141 tests, build clean; `node --test` on the function tests, 32 pass; the PM's fixture test 25 of 25. No file outside its list; `package.json`, the lock file, `src/server.ts`, `search/` and `embed-corpus/` untouched |
| W-79, tasks 36 and 39 | 31984a8 | `sync`: 166 tests. `workspace-ingest`: typecheck clean, 97 tests (98.36 % lines by its own run). No file outside its list |
| W-76, tasks 13 to 20, 22, 49, 50 | fe233e8 | nine migrations and eleven units, none applied; each unit's red run is in `109_W76_VERIFICATION.md`. No file outside its list |

**Findings that go back to a worker or change the plan**

* **A test of the ingest worker depends on wall-clock time.** `workspace-ingest/test/exchange.test.ts`,
  "an answer for another document does not satisfy the wait": timed out at 5 s twice on the merged
  branch while other suites ran beside it, then passed three times in a row. It goes back to W-79
  with tasks 37 and 38.
* **A fourth standing unit pins a fact the applies move** (W-76's finding).
  `db/tests/phase15_101_search_path_pin.sql`, part (c), lists the SECURITY DEFINER functions
  `authenticated` may execute as exactly `app_owner()` and `calendar_push_now()`. 190 adds three
  and 194 one, each owner-guarded as its first statement. The file is no worker's; the PM edited it
  on the phase branch (a384f45), and it joins the three name lists in the port PR. So a unit on
  `main` turns red at the first of those applies, not only at 193 and 196.
* **197 needs 193** (W-76's finding): the status view reads the ingest heartbeat table. The order is
  numeric, and 198 stands alone.
* **So the applies are one sitting, not two groups.** The brief's task 21 had seven "as they pass"
  and 193 with 196 on one day. With units on `main` red from 190 on, all nine go on in one sitting,
  in numeric order, each after its own dry run, and the port PR (four test files) merges the same
  sitting on Stack's word.
* **The test login cannot read `storage.buckets`**, so `phase24_191_bucket.sql` checks the bucket's
  row only for a login that can; the migration's own guard asserts the row at the apply.

## Task 21: the dry runs before Stack's word

Each is `begin; <migration>; <unit>; rollback;` through `execute_sql`, with a read afterwards that
shows nothing was left. Comment lines were left out of the text sent; every statement ran as the
file holds it. A dry run of a later migration needs the earlier ones on prod, so only three can run
before the first apply; each of the rest is dry-run in its turn, after the one before it is on.

| migration | dry run | read afterwards |
|---|---|---|
| 198 | **clean** (PM, 2026-10-09 01:4xZ): the policy drops, the guard passes, the unit's anon insert is refused with 42501, three policies are left on the two course tables | 2 policies on `bb_text_embeddings`: rolled back |
| 191 | **clean** (PM): the bucket row, the four owner policies, the guard, the unit's checks (a) to (c) | 0 bucket rows, 0 policies: rolled back |
| 190 | **clean** (a helper agent on the PM's exact procedure; the whole migration and the whole unit in one call) | `workspace_documents` absent, 0 of the three functions: rolled back |

After the three, one read of prod: no relation and no function of the phase exists, no bucket
`workspace-uploads`, no role `workspace_ingest_runner`, and no migration named 190 to 199.

## Task 21: the nine applies, 2026-10-08 night (2026-10-09 01:5xZ to 02:5xZ)

Stack's word, in the terminal, after the three dry runs above: "apply and merge" (the nine in numeric
order, each after its own clean dry run, a stop at the first that is not; and the port PR's merge).
He did not say "not 198".

Each apply was `apply_migration` under the file's name with the file's whole text, then
`md5(statements[1])` and its length read back from `supabase_migrations.schema_migrations` and held
against `git show HEAD:<file> | md5sum`, then the unit through the runner. 191 and 198 by the PM; the
others by one helper agent a migration on the PM's written procedure (dry run, apply, compare, unit).

| migration | dry run | md5 on prod = md5 of the file | bytes | unit after the apply |
|---|---|---|---|---|
| `190_workspace_store` | clean | `b122452916886e563deebb567c1ba7d3` | 35270 | `phase24_190_store` PASS; `phase21_140_workspace_tables` PASS, unedited |
| `191_workspace_uploads_bucket` | clean | `e88010819381ba9c72eb119dec70e9e4` | 6655 | `phase24_191_bucket` PASS |
| `192_workspace_search` | clean on the second (below) | `c5f159d17b73e001b0c3ba6baff40a50` | 21602 | `phase24_192_search` PASS |
| `193_workspace_ingest_role` | clean on the second (below) | `032665f142d0e84bb2307c18bcf888f7` | 25911 | `phase24_193_ingest_role` PASS; `phase24_190_store` still PASS |
| `194_workspace_ask_options` | clean | `146fa6df504fd0021b9eb261e9ffab9f` | 24735 | `phase24_194_ask_options` PASS |
| `195_workspace_turn_state` | clean | `7bf979014d3177d9015ea38dd7f9f45b` (the file was brought to this, below) | 15629 | `phase24_195_turn_state` PASS; `phase21_140` PASS |
| `196_workspace_runner_v2` | clean, once with each of its two units | `b9c67b9da012a0f958fd0dc979d4b93f` | 50158 | `phase24_196_runner_v2`, `phase24_196b_feed_jobs`, `phase21_142`, `phase21_143`, `phase21_140` PASS |
| `197_workspace_index_status` | clean on the second (below) | `dd7812a5eac490fc2b3102250272bfc9` | 7185 | `phase24_197_index_status` PASS; `phase15_100` PASS |
| `198_text_embeddings_anon_insert_drop` | clean (before the first apply) | `858722294304c42cc649401fee4033c1` | 2820 | `phase24_198_anon_insert_drop` PASS |

`select name from supabase_migrations.schema_migrations where name ~ '^19[0-8]_'` lists the nine
names, one statement each. **After the ninth, `node scripts/db-test.mjs --only phase24_store_proof.sql`
prints PASS against prod** (task 49, proofs 1 to 7 and 7b).

**What stopped a dry run, and what was done. Nothing was applied by a stopped run, and each was read
back as rolled back.**

* **192, the unit.** The migration and its guard ran; the unit raised on the function's argument
  list, which Postgres prints as `vector` when `extensions` is on the session's path and as
  `extensions.vector` when it is not. The unit now takes the prefix off before it compares (3bcedec).
  The other units were read for the same comparison: none.
* **193 and 197, the harness.** A pasted dry run runs as `postgres`, which cannot `set role` into a
  login role it is not a member of with the set option. 193's unit and the two of 196 say so in
  their headers and name the one line a dry run adds inside its own transaction
  (`grant <role> to postgres with inherit false, set true;`); 197's header lacked the note and has
  it now (0be7aa4). The line was in dry runs only, never in an apply; the count of such memberships
  read 0 before and after each.
* **192, a shape.** Before 192 went on, the frozen search row gained a last column, `written_at`
  (W-77's finding: the row had nowhere to carry the date the prompt shows beside a remembered item).
  W-76 added it to 192 and its unit, W-78 widened the row it checks, the PM changed the fixtures
  (2c474f4). 192 as applied carries it.

**One apply did not match its file, and the file was changed, not prod.** 195 went on with every
statement exact and one header comment broken a word early ("A source's title / is" where the file
had "title is /"): the same length, another md5. The rule is that the repo file is byte-identical
to what was applied, so the file took prod's line break (04fbdfb). Prod was not touched. The
helper's instructions for 196 and 197 then said to copy every line as it stands and never re-wrap a
comment; both matched at the first try.

**Advisors after the ninth apply (security).** Three kinds of line.

* `authenticated_security_definer_function_executable` (WARN) lists the browser's four,
  `workspace_ask_with`, `workspace_document_delete`, `workspace_upload_register` and
  `workspace_upload_retry`, beside the two it listed before. The brief said to expect it: each is
  definer because the tables behind it give the browser select only, and each refuses anyone but
  the owner as its first statement (the units prove it). Recorded here and not counted as a new
  finding. The same lint names `inbox_accept_question`, which is the follow-ups'.
* `rls_enabled_no_policy` (INFO) names `workspace_text_embeddings`. That is the design: row
  security on and no policy, so only the service role, which bypasses it, reaches a vector. The
  same lint names `inbox_apply_holds`, the follow-ups'.
* `auth_leaked_password_protection` (WARN) is older than this phase.

**The units on `main`, and the port PR.** PR #86 (`test/phase24-port`, four files) is open; from that
branch `phase15_100`, `phase21_142` and `phase21_143` PASS against prod. `phase15_101` reads red there
and on `main` for one function that is not this phase's, `inbox_accept_question()` (the follow-ups'
187, on prod since 2026-10-09): it was red on `main` before this phase's first apply. The merge of
#86 is Stack's hand: the session's merge command was refused by its permission check.

**`main` moved during the sitting.** The follow-ups merged (#85, 696d35e; bb2dash-stack #6, 0fd659f).
`origin/main` was merged into the phase branch (eb9fd0e): two files conflicted, `DATA_SYNTAX.md` and
`project-state/DECISIONS.md`, each side having added rows, and both sets are kept. Re-done after it:
`node docker/apply/fork-firewall.mjs --write` and `--check` (exit 0, and `git diff --exit-code
docker/apply` prints nothing); `cd apply && npm run typecheck && npm run build && npx vitest run`
(136 tests); the five container test files (63 tests); `docker compose config` resolves. The
resolved `sync` and `apply` services are identical to `main`'s.

## The workers' second hand-backs

| worker | merged | read by the PM on the merged branch |
|---|---|---|
| W-77, tasks 28 to 35 | f3a376b | `workspace`: typecheck clean, 982 tests (97.39 % lines of `src/` by its own run); `apply` typecheck and 123 tests from the same tree; no `--resume` and no `mcp__rag__` in `src/`. One test failed once beside other suites and passed on every rerun: not yet named |
| W-78 round 2 | 6839087 | `mcp-server` 143 tests; the row with `written_at` |
| W-76 round 2 | deae4a9 | 192 and its unit only; no applied file touched |
| W-79, tasks 37 and 38 and the test fix | 9e58951 | the five container suites pass; `grep -c harness_database_url compose.yaml` gives 0; the Workspace block: three secrets, no volume, a tmpfs at `/home/node/.claude`, no hostname, `WORKSPACE_MEMORY_JOBS` off; `workspace-ingest` and `workspace-extract` as F-3 has them; the exchange volume tmpfs, `gid=1100,mode=0770` |

**The ingest image is not built, and that is blocked, not failed.** Its build stops in `apt-get
update`: on the network the laptop was on that night, `http://deb.debian.org` answers from
158.115.141.246 on port 443 with a certificate nothing trusts. The same happens in the bare
`node:22-bookworm-slim` image with no file of ours (the PM's run). The Workspace and apply test
images built because their package layers were cached (`bb2dash-workspace:wt24` 93c654c69d62,
1.17 GB; `bb2dash-apply:wt24` 0fd2a1a825df). The four live tags' ids were the same before and after
W-79's builds. P-7, P-11 and the upload half of the walk wait for a build on another network. W-79
also reports one build that began a few seconds after a `bb2dash-walk22-` container appeared (a
cached build of 12 s).

## Tasks 22 and 27, and probes P-8 and P-9, 2026-10-08 night (2026-10-09 03:1xZ to 03:5xZ)

Stack's words: "merge 86. Deploy the edge function and their probes."

**Task 22, the port PR.** #86 merged as d78f576, with no acceptance run and no walk box open. On
`main` after the merge, through the runner against prod: `phase15_100_db_test_runner_role.sql`,
`phase21_142_workspace_runner.sql` and `phase21_143_review_round.sql` each PASS. `phase15_101` is
red there for the follow-ups' `inbox_accept_question()` alone, as before this phase.

**Task 27, the deploys.** `list_edge_functions` after them:

| function | version | status | `verify_jwt` |
|---|---|---|---|
| `workspace-search` | 1 | ACTIVE | true |
| `workspace-embed` | 2 | ACTIVE | true |
| `embed-corpus` 5, `search` 6, `calendar-push` 5 | unchanged | ACTIVE | as before (`calendar-push` false) |

Deployed by a helper agent on the PM's written procedure, the files as they stand
(`workspace-search`: `index.ts`, `search.ts`; `workspace-embed`: `index.ts` with
`../_shared/chunk.ts` and `../_shared/embed-plan.ts`), then read back and compared with the source.
**`workspace-embed` version 1 did not match its source**: one expression in `embed-plan.ts` was
mistyped in the upload. The helper found it in its own read-back before anything had called the
function; version 2 is the source, all three files compared line by line with no difference.
`workspace-search` matched at the first deploy.

**The probe rows.** One synthetic upload document with one unit (4,224 characters of one made-up
sentence), written by SQL with state `text_ready`; no object was put in the bucket, because P-7,
the probe that needs one, waits for the ingest image. Counts before the rows: 0 documents, 0 units,
0 vectors, 0 objects in `workspace-uploads`. Document id 137, unit id 2064. Removed in the same
sitting by one `delete` of the document (the units and vectors go with it). Counts after: 0, 0, 0, 0.

| probe | line |
|---|---|
| P-8 | **PASS.** One call of `workspace-embed` with the probe document's id and `max_parts` 3, with the public anon JWT as the worker will hold it: 200, `inserted_rows` 3, `failed` empty, `remaining_parts` 1 of 4. A second call stored the last part; the same call again stored 0 and failed nothing. Read on prod: 4 vector rows for the unit, every one under `gte-small`, the unit's `embedded_at` set. The answer's keys are `embed.json`'s. So a second edge function opens a `gte-small` session at 3 parts a call |
| P-9 | **PASS.** With the service key, through the batch child as the runner will start it: the query `ok`, 11 hits, each naming its kind: 1 `upload` (the probe document, similarity 0.919), 10 `material`, 0 `memory` (none exists). The row's keys are `search-row.json`'s, `written_at` among them. The probe document read as an attachment came back `cut` at 2,000 characters. With the public anon JWT: HTTP 403, `code` 42501, zero rows. Nothing but counts, kinds and statuses was printed or kept |

`v_workspace_index_status` read with the probe document in place: `uploads_waiting` 1 and every
other upload and memory count 0, `course_units_indexed` 1005, `course_units_waiting` 0,
`ingest_polled_age_seconds` null (no ingest worker has run).

## Task 41: the retrieval eval, no model

The nine cases of `ingest/eval/golden_set.json` through the batch entry on the host with the key
file (one query a case, the case's course as its scope, course materials, floor 0.78, ten hits;
the script is in the session's scratch folder and prints qids and counts only):

`in passages: 8 of 9; missed qids: 7`, exit 1. **Not the 9 the task asks for, and the miss is the
golden set's, not the search's.** Case 7's truth names files 149 and 967. Both have been replaced
since it was written (read on prod: 149 is superseded by 2509; 967 by 2640, and 2640 by 2773), and
the search hides a replaced file. Among case 7's ten hits are 2509 and 2773, the current version
of each. It is the stale truth STATUS already lists under known issues
(`phase18_golden_truth.sql`, Q7). `ingest/` is no worker's in this phase, so the file is not
edited here; against the files that are current the eval reads 9 of 9.

## W-85, task 40 (bb2dash-stack)

Branch `feat/workspace-24` in bb2dash-stack, cut from that `origin/main` at 0fd659f once the
follow-ups' PR (#6) was on it; three commits (a94a495, c509b62, feca81c). The secret name
`workspace_ingest_db_url` is declared, with its empty example file; the names are fourteen;
the doctor's Workspace text no longer names `harness_database_url`. Three host actions:
`ingest.start`, `ingest.startNoBuild` (each starts `workspace-extract`, then `workspace-ingest`,
by name with `--no-deps`) and `db.proofUntil` (a proof read up to 10 times, 10 s apart). They are
in `acceptance/manifest.schema.json`'s list in this repository now. W-85's run of the umbrella's
whole suite: 359 pass, 0 fail.

## Task 48, prepared

The snippet is `C:/Users/stack/.bb2dash-wt24/make-ingest-login.ps1`, outside every repository: it
makes the password on the laptop, stores `workspace_ingest_db_url` in `SECRETS_DIR`, and puts the
one `alter role` line on Stack's clipboard for an unsaved SQL editor tab. Tested by the PM against
a throwaway folder of fake secrets (the stored string's shape, no byte-order mark, a refusal to
replace a file without `-Force`), which was then deleted. The name `workspace_ingest_db_url` was
added to the allow-list of `set-secret.ps1` in `SECRETS_DIR` (a name). Handed to Stack on
2026-10-08 night; his step is done when `just doctor` shows no missing secret.

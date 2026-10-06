# 102 · W-63 verification (database stream), wave 1

Phase 21, brief `docs/planning/sprint-2/briefs/102_PHASE21_workspace.md`. Worker W-63, branch
`feat/workspace-21-db`, worktree `bb2dash-wt-21-db`. Tasks 2, 3 and 6, as far as they go without
applying anything. Written 2026-10-06 (UTC); the work ran 2026-10-05 evening to 2026-10-06.

**Nothing was applied to prod.** `apply_migration` was not called. Every DDL and DML statement ran
inside `begin; … rollback;` through `execute_sql`. Read after the last dry run (2026-10-06 14:57
UTC): no `workspace_*` table or function, 0 policies on `realtime.messages`, no role
`workspace_runner`, 0 rows for 140–142 in `supabase_migrations.schema_migrations`,
`db_test_runner`'s memberships still the three names, 0 partitions of `realtime.messages`.

## What is on the branch

| commit | what |
|---|---|
| `bf8d01b` | test(P-86): `db/tests/phase21_140_workspace_tables.sql`, red |
| `b22e0f5` | feat(P-86): `db/migrations/140_workspace_tables.sql` (and the unit's one-cast fix) |
| `e74690f` | test(P-87): `db/tests/phase21_141_workspace_realtime.sql`, red |
| `e3e25d3` | feat(P-87): `db/migrations/141_workspace_realtime_policy.sql` |
| `7963dc7` | test(P-85): `db/tests/phase21_142_workspace_runner.sql` and the four-name literal in `db/tests/phase15_100_db_test_runner_role.sql`, red |
| `9543f36` | feat(P-85): `db/migrations/142_workspace_runner_role.sql` |
| `43d9852` | docs(21): `DATA_SYNTAX.md`, `## Workspace (migrations 140-142)` |

File fingerprints, for the byte-identical rule at apply (`md5` of the file as committed, LF only):

| file | bytes | md5 |
|---|---|---|
| `db/migrations/140_workspace_tables.sql` | 24010 | `877a72c1ee2ed9f03a1e8563c748e1e0` |
| `db/migrations/141_workspace_realtime_policy.sql` | 2817 | `d3dcc40e4865b1a62a7d7b4e55df6a72` |
| `db/migrations/142_workspace_runner_role.sql` | 24098 | `0b36fbdf3663385d6fad7f203c57ab4e` |

**Superseded for 140 and 142 on 2026-10-06.** Both files changed in the pre-freeze round; the
fingerprints to apply against are in the last section, "Pre-freeze round (2026-10-06)". 141 is
unchanged.

## How the dry runs were made, and what that proves

`execute_sql` takes its SQL as text, so a dry run is the file's text sent again by hand, not read
from disk. Three things keep that honest.

1. One call is one transaction, and it rolls back. Probed first: a `do` block inside
   `begin … rollback` saw the same `txid_current()` as the statement before it, and a temp table
   made inside was gone after the `rollback`.
2. `execute_sql` returns the rows of the last statement that returned any, so a unit sent whole
   (its PASS `select`, then `rollback;`) shows its own PASS row.
3. Function bodies are checked byte for byte. `md5(pg_proc.prosrc)` read inside the dry-run
   transaction equals `md5` of the text between `as $$` and `$$;` in the file, for all eight:

   | function | md5 of the body, file = dry run |
   |---|---|
   | `workspace_prompt_max` | `7ea526f90e6dd154616ebddd7baf7538` |
   | `workspace_ask` | `0ff0f01cc79b62a2bd27624e201ce82c` |
   | `workspace_cancel` | `299cd00999003be3eabed6ddfd951477` |
   | `workspace_claim` | `9cbd6ccc130d3689839135cc6d08c72b` |
   | `workspace_begin` | `e3f1ee8195bd124f1b9fee358c8fc28f` |
   | `workspace_stream` | `9462400271d444f2f998fc037a1fe538` |
   | `workspace_finish` | `7bf98a41d08f7a359e9f09fa7bcb3845` |
   | `workspace_heartbeat` | `4b0da78969f45fed8bd99a2c7517a76b` |

What the dry runs do not prove, said plainly:

* The text outside function bodies (tables, policies, grants, guards, and the units) was retyped.
  The units assert that shape column by column, so a slip there would have failed a unit; it is
  still not a byte comparison. The apply stage's Runner runs read the files from disk.
* Where a later call needed an earlier migration only as scaffolding, it was sent without its
  comment lines, its `comment on table/column/view` statements and its guard block (each of which
  had run in that file's own full dry run). Each call below says which form it carried.
* The dry runs ran as `postgres`, the Runner runs as `db_test_runner`. The units assert the test
  role's own privileges with `has_table_privilege` (`select` on the five relations, `insert, update,
  delete` on the four tables) and call no function as the session role except `app_owner()` (granted
  by 100). Today's red runs already ran each unit's first statements as `db_test_runner`, the
  partition test among them.
* A payload of about 63 KB failed twice with `Invalid or expired requestState` and never reached
  the database (prod read clean after each). Payloads up to 55 KB went through, so the 142 unit was
  proven in two calls instead of one.

Lint, on the three units (the Runner's own `lintUnitText`, plus the pass-row and partition-text
checks):

```
ok   phase21_140_workspace_tables.sql: lint=clean; crlf=false; statement before rollback is a select=true; PASS labels=["phase21_140_workspace_tables: PASS"]; partition test=n/a
ok   phase21_141_workspace_realtime.sql: lint=clean; crlf=false; statement before rollback is a select=true; PASS labels=["phase21_141 send and receive: PASS","phase21_141 policy only (no partition today): PASS"]; partition test=same text (1 code copy)
ok   phase21_142_workspace_runner.sql: lint=clean; crlf=false; statement before rollback is a select=true; PASS labels=["phase21_142_workspace_runner: PASS"]; partition test=same text (1 code copy)
141 and 142 carry the same partition test: true
```

## Task 2 · migration 140, its unit, the DATA_SYNTAX section (P-86)

**Red** (unit committed first, `bf8d01b`; prod as it stands):

```
$ node scripts/db-test.mjs --only phase21_140_workspace_tables.sql
FAIL  phase21_140_workspace_tables.sql  FAIL phase21_140: migration 140 is not applied (public.workspace_conversations is missing)
db-test: passed 0, failed 1, units 1
exit=1
```

**Dry run of the file as written** (`begin;` + the whole of `140_workspace_tables.sql` + one
`select` + `rollback;`). Its guard block passed, and the `select` returned task 2's (b) values:

```
dry_run: 140 dry run: applied inside the transaction, guard passed
rls_tables 4 · msg_idx 2 · req_idx 2 · fks 5
prosrc_md5: workspace_ask=0ff0f01c…, workspace_cancel=299cd009…, workspace_prompt_max=7ea526f9…
acls: workspace_conversations={postgres=arwdDxtm/postgres,service_role=arwdDxtm/postgres,db_test_runner=arwd/postgres,authenticated=r/postgres}
      v_workspace_status={postgres=arwdDxtm/postgres,service_role=arwdDxtm/postgres,db_test_runner=r/postgres,authenticated=r/postgres}
      workspace_requests_id_seq={postgres=rwU/postgres,service_role=rwU/postgres}
```

**Green** (`begin;` + 140 without its comment lines and guard + the unit without its comment lines
+ `rollback;`, one call):

```
result: phase21_140_workspace_tables: PASS · tables_with_rls 4 · policies 9 · foreign_keys 5 · status_rows 1
```

The first attempt at this call stopped on the unit, not on the migration: `text || "char"` has no
unique operator (`k.confdeltype` in the foreign-key line). Fixed with `::text` in `b22e0f5`; the
error aborted the transaction, and prod read clean afterwards.

**DATA_SYNTAX** (task 2 (d)), before and after `43d9852`:

```
$ grep -c "workspace_messages" DATA_SYNTAX.md                          0  ->  1
$ grep -c "^## Workspace (migrations 140-142)$" DATA_SYNTAX.md         0  ->  1
$ grep -n -E "^## (Workspace \(migrations 140-142\)|Seed state)" DATA_SYNTAX.md
279:## Workspace (migrations 140-142)
390:## Seed state (2026-09-02)
```

**Left for the apply stage:** apply `140_workspace_tables` with `apply_migration`, byte-identical;
Runner on `phase21_140_workspace_tables.sql` → PASS; the three standing units; task 2's four (b)
counts read on prod (the dry run read 4, 2, 2, 5).

## Task 3 · migration 141 and its unit (P-87)

**Red** (unit committed first, `e74690f`):

```
$ node scripts/db-test.mjs --only phase21_141_workspace_realtime.sql
FAIL  phase21_141_workspace_realtime.sql  FAIL phase21_141: migration 141 is not applied (realtime.messages has no policy)
db-test: passed 0, failed 1, units 1
exit=1
```

**Green** (`begin;` + the whole of `141_workspace_realtime_policy.sql` + the unit from its `begin;`
on + `rollback;`, one call). `postgres` could create the policy on a table it does not own, and the
file's guard passed:

```
result: phase21_141 policy only (no partition today): PASS · partition_covers_now false · realtime_policies 1
```

**The partition test.** It is the one `select` in the unit's header, the same text section 0
stores and section 2 branches on (the lint above compares the two). It reads `pg_inherits`,
`pg_class` and `pg_namespace` by name and compares `localtimestamp` with the bound it parses out of
`pg_get_expr(relpartbound)`; a `DEFAULT` partition counts. Checked on prod's Postgres 17.6 against
a temp partitioned table inside a rolled-back transaction:

```
partition_test: [{"only an old partition": false}, {"with today's partition": true}]
bounds_as_deparsed: _w63_today FOR VALUES FROM ('2026-10-06 00:00:00') TO ('2026-10-07 00:00:00')
realtime_messages_partition_covers_now: false
```

It was written before any real partition existed. It rests on Realtime making daily range
partitions whose bounds deparse in that form; the name (`messages_YYYY_MM_DD`) is not used. Task 5
writes the first real partition's name and bound into 102a, and the predicate is checked against
that before the in-window run.

**Not proven, and it cannot be in this wave:** the send-and-receive half. With no partition no
send stores a row, and `postgres` cannot make a partition. That half is written and has never run:
a stream call as `workspace_runner` read back by the owner with `realtime.topic` set; 0 rows for a
stranger uid, for topic `other:x` and for `anon`; a send made as `authenticated` stores 0 rows;
and one check beyond the brief's list, that `workspace_finish` stores a `done` row carrying
`request_id`, `message_id` and `state`. Its first run is the PM's in-window run.

**Left for the apply stage:** apply `141_workspace_realtime_policy`; `select count(*) from
pg_policies where schemaname = 'realtime' and tablename = 'messages'` → 1; the three standing
units; Runner on the unit → PASS (policy-only form, made before anyone opens the preview's
`/workspace`). After the spike and after 142: the header's `select` → true, then the Runner → PASS,
both pasted into 102a.

## Task 6 · migration 142, its unit, and phase15_100's four names (P-85, P-88)

**Red** (unit and literal committed first, `7963dc7`):

```
$ node scripts/db-test.mjs --only phase21_142_workspace_runner.sql
FAIL  phase21_142_workspace_runner.sql  FAIL phase21_142: migration 142 is not applied (no role workspace_runner)
db-test: passed 0, failed 1, units 1
exit=1
$ node scripts/db-test.mjs --only phase15_100_db_test_runner_role.sql
FAIL  phase15_100_db_test_runner_role.sql  FAIL db_test_runner memberships are anon(inherit=f,set=t), authenticated(inherit=f,set=t), sync_runner(inherit=f,set=t), expected anon(inherit=f,set=t), authenticated(inherit=f,set=t), sync_runner(inherit=f,set=t), workspace_runner(inherit=f,set=t)
db-test: passed 0, failed 1, units 1
exit=1
```

The second is expected and stays red on this branch until 142 is applied: the branch expects four
names and prod has three. `git diff 06e046b -- db/tests/phase15_100_db_test_runner_role.sql`
changes one line, the literal.

**Dry run of 142 in order** (`begin;` + 140 and 141 as scaffolding + `142_workspace_runner_role.sql`
without its comment lines, with its real `comment on` statements and its guard block + one `select`
+ `rollback;`). The guard passed, and the `select` returned task 6's (b) values:

```
dry_run: 142 dry run: applied inside the transaction after 140 and 141, guard passed
runner_table_privileges 0 · runner_definer_functions 5
authenticated_can_claim false · service_role_can_claim false
db_test_runner_memberships: anon(inherit=f,set=t), authenticated(inherit=f,set=t), sync_runner(inherit=f,set=t), workspace_runner(inherit=f,set=t)
workspace_runner_members: db_test_runner(admin=false,inherit=false,set=true); postgres(admin=true,inherit=false,set=false)
authenticated_definer_functions: app_owner, calendar_push_now
prosrc_md5: all eight as in the table above
```

`db_test_runner_memberships` is, character for character, the literal the branch's phase15_100 now
expects. `authenticated_definer_functions` is what phase15_101's guard (c) demands.

**Green** (`begin;` + the same scaffolding + 142's role, functions and grants + `grant
workspace_runner to postgres with inherit false, set true;` + the unit without its comment lines +
`rollback;`, one call):

```
result: phase21_142_workspace_runner: PASS · runner_definer_functions 5 · runner_table_privileges 0
partition_covers_now false · empty_delta_stores_nothing: not read
```

`not read` is the unit saying that, with no partition, the half "an empty delta stores no row in
`realtime.messages`" proved nothing and was skipped. That half is read in the PM's in-window run
(task 17), as the brief says.

Probed separately, each inside `begin … rollback`: `create role` in a `do` block, `alter role …
set`, `comment on role`, the two membership grants and `set local role` all work as `postgres`. The
creator's row is `postgres(admin=true,inherit=false,set=false,grantor=supabase_admin)`; the dry-run
grant adds a second row, `postgres(admin=false,inherit=false,set=true,grantor=postgres)`, which is
why the unit allows `postgres` as a member and the migration's guard, which runs before that grant,
does not need to.

**Left for the apply stage:** apply `142_workspace_runner_role` only when the PM says the port PR
(task 6a) is ready; Runner on `phase21_142_workspace_runner.sql` → PASS; Runner on
`phase15_100_db_test_runner_role.sql` → PASS with the four names; the other two standing units;
task 6's four (b) reads (the dry run read 0, 5, false, false); then Stack's password line (task 19).

## The standing units, and the suite as it stands

```
$ node scripts/db-test.mjs --only phase12b_076_rls_initplan_and_truncate.sql     PASS
$ node scripts/db-test.mjs --only phase15_101_search_path_pin.sql                PASS
$ node scripts/db-test.mjs --only phase15_100_db_test_runner_role.sql            FAIL (three names on prod; expected until 142)
$ node scripts/db-test.mjs                                                       (2026-10-06, about 15:00 UTC)
db-test: passed 61, failed 7, units 68
```

Four of the seven are this branch's and are expected before the apply: the three `phase21_*` units
and phase15_100. **The other three are not this stream's and read no Workspace object:**

```
FAIL  grading_invariants.sql  FAIL D point-bearing assignments with no component, not excluded, not excepted: GEO.103.lecture/exam-1, IST.352/project-assignment-8-context-level-0-and-activity-diagrams
FAIL  phase18_122_supersede_rule.sql  FAIL (1) newest run 5485df45-56c2-40c7-a260-2080eed0ad8c wrote 4: 2->151, 74->2509, 150->967, 162->967
FAIL  phase18_golden_truth.sql  FAIL Q7 file not current: 149; Q7 current file carries the phrase but is not in the truth: 2509
```

They follow prod's data, so they fail from any checkout, `main` included. The DoD's "whole suite
ends `failed 0`" cannot be met while they stand.

After the apply the three standing units were not dry-run whole (two are files of other phases and
phase15_100 refuses to run as `postgres`). What they read is covered piece by piece: every new
function pins `search_path` (units 140 and 142); the view is `security_invoker` (unit 140);
`authenticated` executes exactly `app_owner` and `calendar_push_now` among DEFINER functions (read
in the 142 dry run); the ten new policies are written `(select auth.uid())`, which deparses as the
form 076 accepts (asserted on the Realtime policy by unit 141); neither browser role holds TRUNCATE
(unit 140).

## Choices the brief left open, as built

Each is a place where the Contract names a behaviour and not every detail. None changes a name, a
signature, a SQLSTATE or a string.

| # | choice | why |
|---|---|---|
| 1 | `workspace_messages.role` and `workspace_requests.state` are `not null` | the brief's column list gives neither a nullability; a null in either would slip past its own check constraint, the one-open index and the claim |
| 2 | `workspace_cancel` also stamps `finished_at` on the request row, so `authenticated` holds `update (state, error_code, finished_at)` | a request cancelled while still queued would otherwise never carry a finish time; the column grant follows what the function writes |
| 3 | `workspace_ask` stores the question trimmed, and raises 22023 for the text's length only; a conversation id that does not exist raises 23503 from the foreign key | the page shows its question-length sentence for every 22023, so nothing else may use that code |
| 4 | `workspace_begin` refuses a second call for one request, and a tier or provider off its list (22023) | the page joins a request to its answer by `request_id` and expects one |
| 5 | `workspace_stream` refuses a `seq` below 1 for a non-empty delta (22023) | "seq starts at 1" |
| 6 | `workspace_finish` refuses a `p_tool_calls` that is not an array, and a request id that does not exist (22023); a null `p_tool_calls` is stored as `[]`; with no assistant row it closes the request and writes no message | a longer array is cut and never refused, as the brief says; a non-array is a caller's bug |
| 7 | `workspace_finish` stamps `claude_session_id` on every call, so a null or mis-shaped id clears a stored one | the brief's words: "null when `p_claude_session_id` is not uuid-shaped"; the next turn then starts fresh and replays |
| 8 | the stale sweep also sets `finished = true` on the swept request's answer | that row will never be finished by a runner |
| 9 | "the messages that come before this request's user message" is `created_at <=` the question's, the question itself left out, newest 20 by `(created_at, id)` | on prod each call is its own transaction, so `created_at` orders the conversation; inside one transaction `now()` does not move, which is why the 142 unit sets `created_at` itself |
| 10 | `workspace_messages` is indexed on `(conversation_id, created_at)` | serves the foreign key and the list order; task 2's two index counts are unaffected (2 and 2 in the dry run) |
| 11 | the grants on `workspace_requests_id_seq` are revoked from `anon` and `authenticated` | "anon revoked everywhere"; an identity column advances without a USAGE check, and the unit's `workspace_ask` as `authenticated` shows it |
| 12 | 142 opens with an order guard (140's table and 100's role must exist) | 094's precedent |

## Open, for the PM

1. `db/tests/phase21_140_workspace_tables.sql` is 872 lines. Stack's standing rule is 800 at most
   per file. The brief's Files table names exactly three units, so it was not split, and no
   assertion was dropped to shorten it.
2. The three failing units above that are not this stream's.
3. The send-and-receive half of unit 141, the empty-delta half of unit 142 and the partition
   predicate itself have never met a real partition.

## Apply stage (2026-10-06, 15:58 to 16:10 UTC): stopped at the apply, nothing applied

**140 and 141 are not on prod.** The dry run passed and the text sent was proven byte-identical to
the two files, but the `apply_migration` call for 140 was refused by this session's permission
layer before it reached the database. It was not retried and not attempted any other way; 141 was
not attempted (same kind of action, and it follows 140). 142 was never in scope. The apply waits
for Stack to allow it.

### 1. Tree

```
$ git status --porcelain | wc -l                         0
$ git rev-parse HEAD origin/feat/workspace-21-db
e2782e15f70918abf360bbc4342bc28b571a7220
e2782e15f70918abf360bbc4342bc28b571a7220
$ git show HEAD:db/migrations/140_workspace_tables.sql | md5sum            877a72c1ee2ed9f03a1e8563c748e1e0   (24010 bytes)
$ git show HEAD:db/migrations/141_workspace_realtime_policy.sql | md5sum   d3dcc40e4865b1a62a7d7b4e55df6a72   (2817 bytes)
$ git ls-files --eol db/migrations/14[012]_*.sql          i/lf w/lf on all three
```

Both files are plain ASCII with no tab and no trailing space, and each ends in one newline.

### 2. Prod before anything (SELECT only, 15:58:59 UTC)

```
migrations named 14%            0     (newest row: 20261005202612:095_bb_file_storage_key)
workspace_* relations           0
workspace_* functions           0
policies on realtime.messages   0
role workspace_runner           0
partitions of realtime.messages 0
```

### 3. Dry run of 140 then 141, one `begin; … rollback;`

Wave 1's dry runs could not show that the retyped text equalled the file. This one does. The text
of each file went in as a dollar-quoted literal into a temp table, the database fingerprinted that
literal, and a `do` block ran exactly that literal with `execute`, 140 first:

```
begin;
create temp table _w63_files (ord int, name text, body text) on commit drop;
insert into _w63_files values (1, '140_workspace_tables',          $w63f$<the whole file>$w63f$);
insert into _w63_files values (2, '141_workspace_realtime_policy', $w63f$<the whole file>$w63f$);
do $w63d$ declare r record; begin
  for r in select * from _w63_files order by ord loop execute r.body; end loop;
end $w63d$;
select … md5(body), octet_length(body), the per-line fingerprint, task 2 (b)'s counts, the policy count …;
rollback;
```

Result (one row):

```
dry_run: 140 then 141 executed from the text fingerprinted here, guards passed
sent_text: 140_workspace_tables bytes=24010 md5=877a72c1ee2ed9f03a1e8563c748e1e0 crlf=false
           141_workspace_realtime_policy bytes=2817 md5=d3dcc40e4865b1a62a7d7b4e55df6a72 crlf=false
per_line_fingerprint: 140 fp_md5=2f25209721ef55c83fa7079e14ccee37 · 141 fp_md5=5e515170c6184526ca1f982a71d52aa7
rls_tables 4 · msg_idx 2 · req_idx 2 · fks 5 · public_policies 9 · realtime_policies 1
prosrc_md5: workspace_ask=0ff0f01cc79b62a2bd27624e201ce82c, workspace_cancel=299cd00999003be3eabed6ddfd951477,
            workspace_prompt_max=7ea526f90e6dd154616ebddd7baf7538
```

Both md5 values equal the files' (section 1), and both per-line fingerprints equal the ones
computed from the files on disk (the first four hex digits of each line's md5, joined, then md5).
The three function bodies match wave 1's table. Both guard blocks ran inside the `execute` and
raised nothing. What differs from a real apply: the statements ran inside `execute` in a `do`
block, not at top level (wave 1 ran both files whole at top level).

Read after the rollback (16:01:38 UTC): migrations named 14% 0, `workspace_*` relations 0,
functions 0, policies on `realtime.messages` 0, role `workspace_runner` 0, `_w63_files` gone.
`agent_requests` open at that moment: one row, id 1859, `inbox_feedback`, `queued` since
2026-10-05 20:51 UTC; no `sync` row `queued` or `claimed`.

### 4. The apply: refused, not made

`mcp__claude_ai_Supabase__apply_migration`, project `goultdzqcavefcgnifdy`, name
`140_workspace_tables`, query = the file's text. The call's answer, whole:

```
Permission for this action was denied by the Claude Code auto mode classifier. Reason: [Production Deploy].
```

The refusal came from the session, not from Postgres, so nothing ran. Read straight after
(16:03:22 UTC):

```
migrations named 14%            0     (newest row still 20261005202612:095_bb_file_storage_key)
workspace_* relations           0
workspace_* functions           0
policies on realtime.messages   0
role workspace_runner           0
partitions of realtime.messages 0
```

So there is nothing to compare for the byte-identical rule yet (step 4 of the stage), and no
md5 of a stored `statements[1]` to quote.

### 5. The Runner, as prod stands (nothing applied)

```
$ node scripts/db-test.mjs --only phase21_140_workspace_tables.sql
FAIL  phase21_140_workspace_tables.sql  FAIL phase21_140: migration 140 is not applied (public.workspace_conversations is missing)
db-test: passed 0, failed 1, units 1
$ node scripts/db-test.mjs --only phase12b_076_rls_initplan_and_truncate.sql
PASS  phase12b_076_rls_initplan_and_truncate.sql
db-test: passed 1, failed 0, units 1
$ node scripts/db-test.mjs --only phase15_101_search_path_pin.sql
PASS  phase15_101_search_path_pin.sql
db-test: passed 1, failed 0, units 1
$ node scripts/db-test.mjs --only phase15_100_db_test_runner_role.sql
FAIL  phase15_100_db_test_runner_role.sql  FAIL db_test_runner memberships are anon(inherit=f,set=t), authenticated(inherit=f,set=t), sync_runner(inherit=f,set=t), expected anon(inherit=f,set=t), authenticated(inherit=f,set=t), sync_runner(inherit=f,set=t), workspace_runner(inherit=f,set=t)
db-test: passed 0, failed 1, units 1

$ node scripts/db-test.mjs                                       (16:03 UTC; node's own exit code 1)
FAIL  grading_invariants.sql  FAIL D point-bearing assignments with no component, not excluded, not excepted: GEO.103.lecture/exam-1, IST.352/project-assignment-8-context-level-0-and-activity-diagrams
FAIL  phase15_100_db_test_runner_role.sql  (as above)
FAIL  phase18_122_supersede_rule.sql  FAIL (1) newest run 5485df45-56c2-40c7-a260-2080eed0ad8c wrote 4: 2->151, 74->2509, 150->967, 162->967
FAIL  phase18_golden_truth.sql  FAIL Q7 file not current: 149; Q7 current file carries the phrase but is not in the truth: 2509
FAIL  phase21_140_workspace_tables.sql  FAIL phase21_140: migration 140 is not applied (public.workspace_conversations is missing)
FAIL  phase21_141_workspace_realtime.sql  FAIL phase21_141: migration 141 is not applied (realtime.messages has no policy)
FAIL  phase21_142_workspace_runner.sql  FAIL phase21_142: migration 142 is not applied (no role workspace_runner)
db-test: passed 61, failed 7, units 68
```

The same seven as wave 1, for the same reasons: the three `phase21_*` units and the branch's
phase15_100 literal wait for the applies, and the other three follow prod's data and read no
Workspace object.

### 6. Still owed, in order

1. Apply `140_workspace_tables`, then `141_workspace_realtime_policy`, each with the file's text.
2. For both: `select name, md5(statements[1]) from supabase_migrations.schema_migrations where name
   in ('140_workspace_tables', '141_workspace_realtime_policy')` against the two md5 values in
   section 1. Earlier phases found `apply_migration` sometimes stores the text without its last
   newline (69a) and sometimes with it (69c), so the comparison also reads
   `md5(statements[1] || chr(10))`; the file's md5 without its last newline is
   `a16a5dfc561b8b20fd3a4ee87ed5428a` (140) and `bd4d4de90c796a2d61777a413bcc856b` (141).
3. Runner on `phase21_140_workspace_tables.sql` → PASS; task 2 (b)'s four counts (4, 2, 2, 5 in
   the dry run); task 3 (b)'s policy count → 1; Runner on phase12b_076 and phase15_101 → PASS;
   Runner on `phase21_141_workspace_realtime.sql` → PASS in its policy-only form, before anyone
   opens the preview's `/workspace`; the whole suite once.
4. 142 stays as it was: only when the PM says the port PR (task 6a) is ready.

## Pre-freeze round (2026-10-06)

Three small tightenings the PM ruled before anything is applied (`rulings-3.md`, T3, "Database
(W-63)"), since 140 and 142 freeze on apply. **Nothing was applied to prod in this round either.**
`apply_migration` was not called; every statement that wrote ran inside `begin; … rollback;`
through `execute_sql`. This file was `102_W-63_VERIFICATION.md` until this round (`git mv`, T3's
naming rule).

### What changed

| commit | what |
|---|---|
| `0779ff9` | test(P-86): unit 140 split in two; section 4b's five tries; the stranger's cancel aimed at an open request; the tables half pins both with checks |
| `0784841` | fix(P-86): 140, `workspace_requests_owner_insert` also requires a `user` message of the same conversation |
| `6d70e9b` | fix(P-86): 140, `workspace_requests_owner_cancel`'s with check is `state = 'cancelled' and error_code = 'cancelled'` |
| `61ce059` | test(P-85): unit 142, case 2e |
| `76859e1` | fix(P-85): 142, `workspace_claim` joins the conversation `on c.id = v_conv` |
| `0813e3d` | docs(21): `DATA_SYNTAX.md`, the Access line of the Workspace section |

The tests were committed before the migration edits, as in wave 1. No migration header comment
was made wrong by the edits, so none changed; each edited policy has one comment line above it.
`workspace_claim`'s `comment on function` does not describe the join and is unchanged, and
`workspace_cancel` is unchanged (it still writes `state`, `error_code` and `finished_at`; the
column grant stays).

**The fingerprints to apply against** (`git show HEAD:<file> | md5sum`, LF only, `i/lf w/lf`):

| file | bytes | md5 | md5 without the last newline |
|---|---|---|---|
| `db/migrations/140_workspace_tables.sql` | 24459 | `64692ea53ee1c60c96e974d928b41a29` | `907602e5a8a6ea04c3053b5d52fd0a2a` |
| `db/migrations/141_workspace_realtime_policy.sql` (unchanged) | 2817 | `d3dcc40e4865b1a62a7d7b4e55df6a72` | `bd4d4de90c796a2d61777a413bcc856b` |
| `db/migrations/142_workspace_runner_role.sql` | 24086 | `28786bc625723f8d2317293d936b9254` | `d5e8b8b49bdc5d311a61aa0dfcf4aea8` |

The four units, none over 800 lines: `phase21_140_workspace_tables.sql` 608,
`phase21_140b_workspace_writes.sql` 419 (new), `phase21_141_workspace_realtime.sql` 279
(untouched), `phase21_142_workspace_runner.sql` 665. Sections 2, 3 and 4 moved to 140b unchanged
(`diff` of the moved lines against `481b690` shows only the new declarations, the unit's name in
one message and the added cases). The tables half now makes its own setup rows as the session
role. `phase15_100`'s membership line was not touched.

### How this round's dry runs were made

The same rules as above (one call is one transaction, it rolls back), with the apply stage's
fingerprint method used for every text, so nothing rests on retyping:

* Each text went in as a dollar-quoted literal into a temp table, the database fingerprinted the
  literal, and a `do` block ran exactly that literal with `execute`.
* **140 and 142 as edited went in whole**, and the database's `md5` of the literal equals the
  file's (the table above). Their guard blocks ran inside the `execute`.
* **Scaffolding and units went in minified**: full-line comments, blank lines, trailing comments
  and runs of spaces outside quotes removed; for a migration used as scaffolding also its
  `comment on` statements and its guard; for a unit its own `begin;` and `rollback;` lines. The
  database's `md5` of each literal with all white space removed equals the same figure computed
  from the file by `scratchpad/w63/r3.mjs` and `nows.mjs`. So what ran is the file's text, white
  space and comments aside. Scaffold sizes: 140 9654 bytes, 141 224, 142 9245.
* The **red** runs are the same call's first phase: inside a subtransaction the old text is put
  back (`alter policy … with check (…)` with wave 1's expression, or `workspace_claim` re-created
  from `pg_get_functiondef` with the join line replaced), the unit or probe runs, and the
  subtransaction is rolled back. They are not runs of the old files. For the claim the body's md5
  after the replace is `9cbd6ccc130d3689839135cc6d08c72b`, wave 1's own, so the edit is that one
  line and the red ran wave 1's function.

What that does not prove, said plainly:

* A unit run through `execute` returns no row, so the unit's own `: PASS` row was not read.
  "No assertion raised" below is the harness's word: every statement of the unit ran and none
  raised. The Runner has run these files only as far as their first block (prod has no 140).
* Unit 142 again went in two calls (through section 0; then sections 1 to 7 with the unit's
  opening `select`), because of the payload limit.
* The dry runs ran as `postgres`, the Runner runs as `db_test_runner`. Read on prod:
  `db_test_runner` has `bypassrls = true`, which the session-role setup rows rely on.
* One call failed and was repeated: the first run of the tables half used a scaffold with every
  `comment on` dropped, and the unit's shape check rightly raised `workspace_prompt_max has no
  comment; workspace_ask has no comment; workspace_cancel has no comment`. The error aborted the
  transaction. The repeat added 140's three `comment on function` statements (1148 bytes,
  fingerprinted the same way); the 142 run through section 0 carries 142's five (2968 bytes).

### 1. Does the qualified reference resolve to the new row? (Postgres 17.6)

`pg_policies.with_check` of the two policies, read inside the dry run of 140 as edited:

```
workspace_requests_owner_insert:
((( SELECT auth.uid() AS uid) = ( SELECT app_owner() AS app_owner)) AND (state = 'queued'::text) AND (EXISTS ( SELECT 1
   FROM workspace_messages m
  WHERE ((m.id = workspace_requests.user_message_id) AND (m.conversation_id = workspace_requests.conversation_id) AND (m.role = 'user'::text)))))
workspace_requests_owner_cancel:
((( SELECT auth.uid() AS uid) = ( SELECT app_owner() AS app_owner)) AND (state = 'cancelled'::text) AND (error_code = 'cancelled'::text))
```

Both `user_message_id` (written unqualified, as ruled) and `workspace_requests.conversation_id`
bind to the policy's own table, which in a with check is the new row. The behaviour agrees: the
same conversation is refused with another conversation's question and accepted with its own
(probes below).

### 2. 140 as edited, whole, with its guard, and the two probes (between 16:20 and 16:32 UTC)

`begin;` + the whole file as a literal + `execute` + the probes + one `select` + `rollback;`.
This call read no clock; it ran after the 16:20:08 read of prod and before section 3's call.

```
dry_run: 140 as edited, executed from the text fingerprinted here; its guard passed
sent_text: 24459 bytes, md5 64692ea53ee1c60c96e974d928b41a29, crlf false   (equal to the file)
prosrc_md5: workspace_ask=0ff0f01cc79b62a2bd27624e201ce82c, workspace_cancel=299cd00999003be3eabed6ddfd951477,
            workspace_prompt_max=7ea526f90e6dd154616ebddd7baf7538          (the three bodies, unchanged from wave 1)
rls_tables 4 · msg_idx 2 · req_idx 2 · fks 5 · policies 9
```

The probes, each tried as the owner under `set local role authenticated` and undone afterwards.
A has an open request; B has none, a question and an answer. `ok:1` = accepted, one row.

| try | **green**: 140 as edited | **red**: wave 1's with checks put back |
|---|---|---|
| insert a request: B with A's question | `42501` | `ok:1` |
| insert a request: B with its own answer | `42501` | `ok:1` |
| insert a request: B with its own question | `ok:1` | `ok:1` |
| cancel A's request by hand, `error_code = 'timeout'` | `42501` | `ok:1` |
| cancel by hand, no `error_code` | `42501` | `ok:1` |
| cancel by hand, `error_code = 'cancelled'` | `ok:1` | `ok:1` |
| `workspace_cancel(<A's request>)` | `true`, `{"state":"cancelled","error_code":"cancelled","finished_at_set":true}` | the same |

### 3. Unit 140, the tables half, with 140 (16:32:12 UTC)

Scaffold 140 + its three function comments + the unit, one call:

```
red   (wave 1's with checks put back):
      P0001 FAIL phase21_140 (shape): workspace_requests_owner_insert does not require state = queued and a
      user message of the same conversation; workspace_requests_owner_cancel is not queued/claimed ->
      cancelled with the code cancelled
green (140 as edited): every statement ran, no assertion raised
sent_text: c140 1148 bytes · s140 9654 bytes · u140 23948 bytes, each equal to the file's text, white space aside
policies 9 · foreign_keys 5
```

### 4. Unit 140b, the writes half, with 140 (16:33:38 UTC)

Scaffold 140 + the unit, one call, three phases:

```
red 1 (both of wave 1's with checks put back):
      P0001 FAIL 4b (pair the second conversation with the first one's question): got ok:1, expected 42501
red 2 (the insert check as edited, wave 1's cancel check put back):
      P0001 FAIL 4b (cancel by hand with another code): got ok:1, expected 42501
green (140 as edited): every statement ran, no assertion raised
sent_text: s140 9654 bytes · u140b 14996 bytes, each equal to the file's text, white space aside
request_policies 3
```

Green covers section 7 as rewritten: the stranger's `workspace_cancel` on an **open** request
returns false and the request is still `queued`, with no code and no finish time, afterwards.

### 5. 140 + 141 + 142 as edited, with 142's guard, and the claim probe (16:36:26 UTC)

Scaffold 140 + scaffold 141 + the whole of 142 as a literal, then `grant workspace_runner to
postgres with inherit false, set true` for the probe (after the guard had run):

```
dry_run: 140 (scaffold), 141 (scaffold), then 142 as edited executed from the text fingerprinted here; 142's guard passed
sent_142: 24086 bytes, md5 28786bc625723f8d2317293d936b9254, crlf false   (equal to the file, byte for byte)
runner_table_privileges 0 · runner_definer_functions 5 · authenticated_can_claim false · service_role_can_claim false
realtime_policies 1
db_test_runner_memberships: anon(inherit=f,set=t), authenticated(inherit=f,set=t), sync_runner(inherit=f,set=t), workspace_runner(inherit=f,set=t)
workspace_runner_members: db_test_runner(admin=false,inherit=false,set=true), postgres(admin=true,inherit=false,set=false)
prosrc_md5: workspace_claim=b1af44954817ca89356601a648d8b57f (new)
            workspace_begin=e3f1ee8195bd124f1b9fee358c8fc28f, workspace_stream=9462400271d444f2f998fc037a1fe538,
            workspace_finish=7bf98a41d08f7a359e9f09fa7bcb3845, workspace_heartbeat=4b0da78969f45fed8bd99a2c7517a76b
            (the four, unchanged from wave 1)
```

The memberships line is, character for character, the literal phase15_100 expects on this branch.

The probe: conversation E (session `…e063`) holds a queued request whose `user_message_id` is
conversation A's question (A's session is `…a063`), written by the session role. One claim as
`workspace_runner`, then undone:

```
green (142 as edited):
      request is E's true, conversation is E true, prompt question A,
      claude_session_id 0a1b2c3d-0000-4000-8000-00000000e063 (E's), history [], prior_tier null
red   (the join put back through the message; md5 of the body then 9cbd6ccc130d3689839135cc6d08c72b):
      request is E's true, conversation is E true, prompt question A,
      claude_session_id 0a1b2c3d-0000-4000-8000-00000000a063 (A's), history [], prior_tier null
```

### 6. Unit 142, with its in-transaction grant (16:38:18 and 16:45:01 UTC)

Both calls: scaffolds 140, 141 and 142, then the grant to `postgres`, then the unit's text.

```
call 1, through section 0 (with 142's five function comments):
      every statement ran, no assertion raised
      sent_text: c142 2968 · s140 9654 · s141 224 · s142 9245 · u142p1 7111 bytes, each equal to the file's text, white space aside
      partition_covers_now false · workspace_definer_functions 5

call 2, the opening select and sections 1 to 7 (the two row uuids are shortened here):
red   (the join put back through the message):
      P0001 FAIL 2e: the claim of a request in conversation E returned {"request_id":3,"conversation_id":"fbf85af9-…",
      "user_message_id":"e77c32e5-…","prompt":"question A","claude_session_id":"0a1b2c3d-0000-4000-8000-00000000a142",
      "prior_tier":null,"history":[]} (expected session 0a1b2c3d-0000-4000-8000-00000000e142, its own conversation's)
green (142 as edited): every statement ran, no assertion raised
      sent_text: s140 9654 · s141 224 · s142 9245 · u142p2 18319 bytes, each equal to the file's text, white space aside
      runner_definer_functions 5 · runner_table_privileges 0 · partition_covers_now false · empty_delta_stores_nothing: not read
```

`not read` is as in wave 1: with no partition of `realtime.messages` the empty-delta half proves
nothing and is skipped. It is still owed to the PM's in-window run.

### 7. The Runner and the lint, as prod stands (nothing applied)

```
$ node scripts/db-test.mjs --only phase21_140_workspace_tables.sql
FAIL  phase21_140_workspace_tables.sql  FAIL phase21_140: migration 140 is not applied (public.workspace_conversations is missing)
$ node scripts/db-test.mjs --only phase21_140b_workspace_writes.sql
FAIL  phase21_140b_workspace_writes.sql  FAIL phase21_140b: migration 140 is not applied (public.workspace_requests is missing)
$ node scripts/db-test.mjs --only phase21_142_workspace_runner.sql
FAIL  phase21_142_workspace_runner.sql  FAIL phase21_142: migration 142 is not applied (no role workspace_runner)
$ node --test scripts/db-test.test.mjs                     tests 59 · pass 59 · fail 0

ok   phase21_140_workspace_tables.sql: lint=clean; crlf=false; statement before rollback is a select=true; PASS labels=["phase21_140_workspace_tables: PASS"]; partition test=n/a
ok   phase21_140b_workspace_writes.sql: lint=clean; crlf=false; statement before rollback is a select=true; PASS labels=["phase21_140b_workspace_writes: PASS"]; partition test=n/a
ok   phase21_141_workspace_realtime.sql: lint=clean; crlf=false; statement before rollback is a select=true; PASS labels=["phase21_141 send and receive: PASS","phase21_141 policy only (no partition today): PASS"]; partition test=same text (1 code copy)
ok   phase21_142_workspace_runner.sql: lint=clean; crlf=false; statement before rollback is a select=true; PASS labels=["phase21_142_workspace_runner: PASS"]; partition test=same text (1 code copy)
```

Each of the four opens with `begin;`, ends with `rollback;`, has no top-level `commit`, makes its
own setup rows and ends on a row whose first column ends `: PASS`. `--list` now plans 69 units
(68 in wave 1); the new one, unit 66, is red for the same reason as its siblings until 140 is
applied. The whole suite was not run in this round.

### 8. Prod after the last dry run (SELECT only, 16:45:12 UTC)

```
workspace_* relations (v_workspace_status included)   0
workspace_* functions                                 0
role workspace_runner                                 0
migrations named 14%                                  0     (newest row: 20261005202612:095_bb_file_storage_key)
policies on realtime.messages                         0
partitions of realtime.messages                       0
db_test_runner's memberships                          anon, authenticated, sync_runner
_w63* leftovers                                       0
```

The same read before the round's first dry run (16:20:08 UTC) gave the same zeros.

### 9. Beyond the letter of the ruling, and what is still owed

* Section 4b tries five statements where the ruling names two: it also refuses a request that
  names the conversation's own **answer** (the policy's `m.role = 'user'`) and a cancel by hand
  with **no** code (null fails the with check), and it accepts the conversation's own question as
  the control. The tables half pins both with checks by their deparsed text.
* "Open, for the PM" item 1 above (872 lines) is closed by the split. The brief's Files table
  names three units; the fourth is the PM's to add (T3).
* Owed at apply, in place of the figures in "Apply stage", section 6: the md5 values of this
  section's table; the Runner on all four `phase21_*` units; the three standing units; the whole
  suite once.
* Still never met a real partition: the send-and-receive half of unit 141, the empty-delta half
  of unit 142 and the partition predicate (unchanged from wave 1).

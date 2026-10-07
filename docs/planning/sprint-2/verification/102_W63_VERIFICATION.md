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

## Review round (2026-10-06, 21:37 to 23:50 UTC): migration 143, written and dry-run only

Ruling V3 (`rulings-5.md`; 102a, "PM rulings for the review round"). **Nothing was applied to
prod.** `apply_migration` was not called; every statement that wrote ran inside `begin; …
rollback;` through `execute_sql`. 140, 141 and 142 are on prod and were read, never edited.

### What is on the branch

| commit | what |
|---|---|
| `0218055` | test(21): `db/tests/phase21_143_review_round.sql`, red |
| `b93356b` | feat(21): `db/migrations/143_workspace_review_round.sql` |
| `c555d65` | docs(21): `DATA_SYNTAX.md`, `## Workspace (migrations 140-143)` |
| `2101817` | test(21): unit 140, the status view's column list accepts 140's four alone or followed by 143's one |
| `0e78128` | test(21): unit 143 split into one block per change, each with its own setup (no assertion changed) |

**The fingerprint to apply against** (`git show HEAD:db/migrations/143_workspace_review_round.sql | md5sum`,
LF only, `i/lf w/lf`): 25400 bytes, md5 `b6dcb28b0b8c4332490a753bb23382fa`. The two bodies as
`pg_proc.prosrc` holds them: `workspace_finish` `1bcc855d63956911b8285628236707fb` (142's:
`7bf98a41…`), `workspace_claim` `00eb625572c6f7d398d84adef786f050` (142's: `b1af4495…`).

Both bodies are 142's plus the lines marked `143` and nothing else (`diff` of the text between
`as $$` and `$$;`, 142 against 143): `workspace_finish` `35a36,40`, five lines added (the comment
and the refusal); `workspace_claim` `3a4` and `25a27,40`, fifteen lines added (one constant, the
orphan sweep with its comment). No line of 142 was changed or removed.

### The four changes, as built

* **CR-8.** `v_workspace_status` keeps its four columns and gains `polled_age_seconds integer`
  last: `greatest(0, floor(extract(epoch from (now() - polled_at))))::integer` inside a `case`,
  because `greatest` skips a null and would have turned "no heartbeat yet" into 0. The view states
  `with (security_invoker = true)` again: `create or replace view` replaces a view's options.
* **Security note.** `workspace_finish` raises 22023 `workspace_finish: request % is not claimed or
  cancelled (it is %)` right after the request row is read and locked.
* **CR-4.** A second statement in `workspace_claim`, after the stale sweep: `finished = true,
  error_code = <the request's>` on unfinished assistant rows whose request is `cancelled`, `failed`
  or `done` with `finished_at` more than 10 minutes old (its own constant, `c_orphan_after`).
* **CR-7.** `create or replace trigger … when (…)`: the trigger fires unless `archived` is the only
  value that differs between the old and the new row.
* **Guard.** The view (invoker, five columns, grants), the five SECURITY DEFINER functions
  (`workspace_runner` only, plpgsql, `search_path` pinned; none for anon, authenticated,
  service_role or PUBLIC), no table privilege for `workspace_runner`, the trigger, and
  phase15_101's three catalogue rules across `public`.
* Three `comment on` statements replace the texts of 140 and 142 that this file made wrong.

### How the dry runs were made

As in the pre-freeze round: a text goes in as a dollar-quoted literal, the database fingerprints
the literal, and a `do` block runs exactly that literal with `execute`. Two things are new.

* **143 went in whole once** (call A), byte for byte. Every later call rebuilt 143's four objects
  with a short scaffold instead of the 25 KB file: the view and the trigger typed, the two bodies
  made from prod's own `prosrc` with `replace()`. The scaffold refuses to go on unless the four
  fingerprints equal the ones read when the file itself ran: both `prosrc` md5s above,
  `md5(pg_get_viewdef)` `5bfbef6b7072bdb9e7c996ab0388f2bd`, `md5(pg_get_triggerdef)`
  `5e142a58ba10030c4a2e36e3c035d0ae`, options `{security_invoker=true}`.
* **Unit texts went in block by block**, minified (comments, blank lines and runs of spaces out),
  each refused unless its white-space-blind md5 equals the file's (`scratchpad/w63r5/build.mjs`).

### 1. Red, through the Runner, prod as it stands (140 to 142 applied)

```
$ node scripts/db-test.mjs --only phase21_143_review_round.sql
FAIL  phase21_143_review_round.sql  FAIL phase21_143: migration 143 is not applied (v_workspace_status has no column polled_age_seconds)
```

Expected until the PM applies 143. It is the same line before and after the unit's split.

### 2. Call A: 143 whole, its guard, and the direct probes, red then green

One rolled-back transaction: the probes against prod as it is, undone; then the file from its
literal; then the same probes again.

```
sent text: 25400 bytes, md5 b6dcb28b0b8c4332490a753bb23382fa, crlf false      (= the file, byte for byte)
143 executed from that text; its guard passed
view columns: polled_at timestamp with time zone, runner text, open_requests integer, oldest_open_at timestamp with time zone, polled_age_seconds integer
view options {security_invoker=true}
view acl {postgres=arwdDxtm/postgres,service_role=arwdDxtm/postgres,db_test_runner=r/postgres,authenticated=r/postgres}
claim acl = finish acl = {postgres=X/postgres,workspace_runner=X/postgres}
trigger: … FOR EACH ROW WHEN (((NOT (new.archived IS DISTINCT FROM old.archived)) OR (new.title IS DISTINCT FROM old.title)
         OR (new.claude_session_id IS DISTINCT FROM old.claude_session_id) OR (new.updated_at IS DISTINCT FROM old.updated_at)
         OR (new.created_at IS DISTINCT FROM old.created_at) OR (new.id IS DISTINCT FROM old.id))) EXECUTE FUNCTION set_updated_at()
prosrc md5: the two above; the other six workspace_* functions unchanged from prod
```

| probe | **red**: prod as it is | **green**: with 143 |
|---|---|---|
| `polled_age_seconds`, no heartbeat row | `42703 column "polled_age_seconds" does not exist` | `null` |
| right after a heartbeat | | `0` |
| heartbeat 47.8 s old | | `47 integer` |
| finish on a `done` request | `accepted`; its stored answer afterwards: `written over` | `22023 workspace_finish: request 47 is not claimed or cancelled (it is done)`; stored answer afterwards: `first answer` |
| finish on a `claimed` request | `failed / timeout` | `failed / timeout` |
| finish on a `cancelled` request | `cancelled, answer: partial, code cancelled, finished true` | the same |
| answer of a request stopped 11 minutes ago, after one poll | `finished false, code null` | `finished true, code cancelled` |
| answer of a request stopped 9 minutes ago, after one poll | `finished false, code null` | `finished false, code null` |
| `updated_at` after an archive-only update | `moved to now(), archived true` | `still a day old, archived true` |
| `updated_at` after a title update | `moved to now()` | `moved to now()` |

### 3. Unit 143 with 143, from its own text, block by block

| block | bytes sent | result |
|---|---|---|
| section 0, shape (22:55:55 UTC; with 143's three comments, md5-equal to the file's) | 6195 | text = file, every statement ran, no assertion raised |
| sections 1 and 2, CR-8 | | **not run: held** (section 6 below) |
| section 3, the finish refusal (23:45:49) | 6001 | text = file, every statement ran, no assertion raised |
| section 4, CR-4 (23:46:30) | 6532 | text = file, every statement ran, no assertion raised |
| section 5, CR-7 (23:45:49) | 3223 | text = file, every statement ran, no assertion raised |

The unit's own `: PASS` row was not read: it is the last statement of a whole run, and the unit
never ran whole. Sections 3 to 5 ran as the split file has them (`0e78128`); section 0 is the
same text before and after the split.

### 4. Unit 140, the one existing assertion 143 makes wrong

Section 0 from its own text (10880 bytes), with 143, both forms in one call (23:44:02 UTC). The
"before" text is the edited one with the three new lines put back by `replace()`; its md5 equals
the committed file's before `2101817`.

```
red   (as committed before the edit): P0001 FAIL phase21_140 (shape): v_workspace_status columns are [polled_at
      timestamp with time zone, runner text, open_requests integer, oldest_open_at timestamp with time zone,
      polled_age_seconds integer]
green (as edited): every statement ran, no assertion raised
```

No other existing assertion is made wrong by 143, so no other unit was edited: unit 140 checks
only that a `set_updated_at()` trigger exists, unit 141 finishes a claimed request, unit 142
finishes a cancelled and two claimed ones, and none of them archives a chat and reads `updated_at`.

### 5. The Runner, prod as it stands (23:44 UTC, nothing applied)

```
PASS  phase21_140_workspace_tables.sql          (as edited)
PASS  phase21_140b_workspace_writes.sql
PASS  phase21_141_workspace_realtime.sql
PASS  phase21_142_workspace_runner.sql
FAIL  phase21_143_review_round.sql  FAIL phase21_143: migration 143 is not applied (v_workspace_status has no column polled_age_seconds)
PASS  phase15_101_search_path_pin.sql
PASS  phase12b_076_rls_initplan_and_truncate.sql
PASS  phase15_100_db_test_runner_role.sql
```

`--list` plans 70 units; the new one is unit 69. Unit lengths: 613, 419, 279, 665, 660 lines.

### 6. What was NOT proven, and why

**Five `execute_sql` calls were held and came back `Invalid or expired requestState`** after about
15 to 20 minutes each; none reached the database (read after: four view columns, no `when` on the
trigger, 142's two bodies, no `postgres` membership in `workspace_runner`, no transaction left
open). It is not the size: a 39.5 KB call went through and a 13.7 KB one was held. Every held
call carried a unit block that has a `DELETE` with no `WHERE` (`delete from
workspace_runner_heartbeat;`, the one-row table) or unit 076's two `truncate` tries; every call
without one went through at once. The tool says of itself that destructive statements may need
the user's confirmation, and this session has nobody to give it. That is the reading the evidence
supports; it was not proven. **The statement was not reworded to get it past the hold.**

So these are still owed, with 143, in a session where Stack can confirm:

* unit 143, sections 1 and 2 (what they assert was seen in call A's probes: null, 0, 47, integer;
  not from the unit's own text);
* unit 142's sections 1 to 7 (section 1 has the same `delete`; section 0 ran, section 9 below);
  unit 140's sections 1, 5, 6 and 7 (section 6 has it); unit 076 (the `truncate` tries);
* units 140b and 141: no such statement, so they should go through; they were not sent for lack
  of room in this session. (Unit 101 ran whole, section 9 below.)

Ready-made texts, built from the files by `scratchpad/w63r5/gen-calls.mjs` (nothing typed by
hand, each `begin; … rollback;`, each unit in its own subtransaction with its PASS row carried
out): `scratchpad/w63r5/calls/c1.sql` (143 + unit 143, 42.8 KB), `c2.sql` (+ unit 140, 41.6 KB),
`c3.sql` (+ unit 142, 43.1 KB), `c4.sql` (+ 140b and 141, 40.0 KB), `c5.sql` (+ 101 and 076,
26.3 KB). They carry 143 minified with its guard (15844 bytes). They were generated, not run.

Also not proven: nothing here ran as `db_test_runner` with 143 in place (the dry runs are
`postgres`); the Runner on unit 143 is owed after the apply.

### 7. Choices beyond the letter of the ruling

* `polled_age_seconds` is never negative (`greatest(0, …)`): a reader whose transaction began just
  before the heartbeat's would otherwise read -1.
* "An update that changes only `archived`" is read by value: the trigger stays silent when
  `archived` is the only value that differs. An update that changes nothing at all (archiving a
  chat that is already archived, or a title set to itself) still fires, as it did before 143.
  Asked of the PM.
* The orphan sweep reads "closed for more than 10 minutes" from `finished_at` alone. A closed
  request with no `finished_at` (only a hand-made write makes one; `workspace_cancel`,
  `workspace_finish` and the stale sweep all stamp it) is left alone.
* The orphan sweep has no index of its own and runs on every poll (every 2 s). The ruling is
  `create or replace` only, so none was added; on today's tables it reads a handful of rows.
* The three `comment on` statements, and the trigger's when clause naming every column of the
  table (unit 143 fails when a column is missing from it).

### 8. A side effect every dry run has

`workspace_requests.id` is an identity column and a sequence does not roll back, so each dry run
and each Runner pass moves it on (the probe above met request 47 on a table that holds one row).
Nothing reads the ids as a count.

### 9. Two more runs with 143, and prod afterwards

One call, the scaffold then both texts (23:49:42 UTC):

```
unit 142, its opening select and section 0 (7109 bytes): text = file, every statement ran, no assertion raised
      (the five signatures, SECURITY DEFINER, plpgsql, search_path, owner, comments, who executes them,
       no table privilege, the role's attributes and members, all as before 143); partition_covers_now true
unit phase15_101, whole (5237 bytes), in a subtransaction undone afterwards: text = file, every statement ran;
      its PASS select returned {"result": "phase15_101_search_path_pin: PASS", "public_functions": 87,
      "default_search_path": "\"$user\", public, extensions", "relpath_checked": "IST.323/syllabus_policy/323Fall26V1.3.1.docx"}
```

Where each of the task's seven units stands, with 143:

| unit | from its own text, with 143 |
|---|---|
| `phase21_143_review_round` | sections 0, 3, 4, 5 ran clean; sections 1 and 2 held; PASS row not read |
| `phase21_140_workspace_tables` | section 0 red then green; sections 1, 5, 6, 7 not sent (6 would be held) |
| `phase21_140b_workspace_writes` | not sent |
| `phase21_141_workspace_realtime` | not sent |
| `phase21_142_workspace_runner` | section 0 ran clean; sections 1 to 7 held |
| `phase15_101_search_path_pin` | whole, PASS row read |
| `phase12b_076_rls_initplan_and_truncate` | held (sent once, together with unit 143) |

Prod after the last dry run (SELECT only, 23:50:00 UTC), the same as at 21:37:44 before the first:

```
v_workspace_status columns   polled_at, runner, open_requests, oldest_open_at      options {security_invoker=true}
its comment                  140's ("The Workspace service line (migration 140): …")
trigger has a when clause    false
prosrc md5 (first 8)         workspace_claim b1af4495, workspace_finish 7bf98a41, the other six unchanged
migrations named 14%         140, 141, 142 (newest 20261006171717)
workspace_runner's members   postgres (the creator's row), db_test_runner
rows                         1 conversation, 1 message, requests cancelled:1, 0 heartbeat rows
_w63* leftovers              0          idle in transaction   0
```

## Review round, second pass (2026-10-07, 04:05 to 04:40 UTC): ruling X2

Ruling X2 (`rulings-6.md`). **Nothing was applied to prod.** `apply_migration` was not called;
every statement that wrote ran inside `begin; … rollback;` through `execute_sql`. 140, 141 and 142
were read, never edited. **Two things the task asked for were not done, and section 6 says why:**
unit 143 did not run whole and its PASS row was not read; units 140, 140b, 142 and 076 were not
dry-run with 143 in this pass.

### What is on the branch

| commit | what |
|---|---|
| `53d055b` | test(21): units 140, 140b and 142 name the heartbeat row they delete or update |
| `d359a2d` | test(21): unit 143 for ruling X2, committed red, before the migration |
| `33704e7` | feat(21): migration 143 follows ruling X2 (trigger, guard, the sweep's boundary) |
| `49071ea` | docs(21): `DATA_SYNTAX.md` follows 143 as ruled in X2 |

**The fingerprint to apply against** (`git show HEAD:db/migrations/143_workspace_review_round.sql | md5sum`,
LF only): **23585 bytes, md5 `5e7afa73d1ccfc8b06327cc128d28e1d`**. The first pass's text
(`c82d087`) was 25400 bytes, `b6dcb28b…`. `pg_proc.prosrc` with 143: `workspace_finish`
`1bcc855d63956911b8285628236707fb` (unchanged from the first pass), `workspace_claim`
`8123369c3e6f8fbb88927fbe574423f6` (a comment inside the body changed; no statement did).
`diff` of the two bodies, 142 against 143: `workspace_finish` `35a36,40`; `workspace_claim` `3a4`
and `25a27,41`. Lines added, none of 142's changed or removed.

### What changed in 143

1. **The trigger** fires only `when (old.title is distinct from new.title or
   old.claude_session_id is distinct from new.claude_session_id)`.
2. **The guard** keeps: (a) the view is `security_invoker` with its five columns in order; (b) the
   two replaced functions' signatures, `prosecdef` and pinned `search_path`; (c) the five are
   exactly the SECURITY DEFINER functions `workspace_runner` executes; (d) none of the five is open
   to `anon`, `authenticated`, `service_role` or PUBLIC; (e) the trigger exists, enabled, with its
   condition. Gone: the view's grants, `workspace_runner`'s table privileges, "the table's one
   trigger", plpgsql, and unit 101's three project-wide rules.
3. **The boundary** is stated in the file's header comment, in the body's comment and in
   `DATA_SYNTAX.md`: `finished_at < now() - interval '10 minutes'`, strictly. Exactly 10 minutes
   is left; any longer is swept. The statement itself did not change.
4. **The live-turn comment** reads for 480 s + 110 s < 600 s, and adds that a finish arriving
   later still stores its text on a cancelled request (unit 143, 4b).

### How the dry runs were made

As before: each text goes in as a dollar-quoted literal with the white-space-blind md5 of its
file, and a `do` block runs exactly that literal with `execute`. New in this pass: a text that
differs is reported as a row instead of raised, so the result rows and the `rollback` always run;
no call reported one. Generators: `scratchpad/w63r7/` (`h.mjs`, `gen-ab.mjs`, `gen-b2.mjs`,
`gen-e.mjs`, `gen-f.mjs`); the texts sent: `scratchpad/w63r7/calls/`.

| call | bytes | carried | result |
|---|---|---|---|
| A | 39214 | 143 whole, byte for byte, with its guard; the scaffold; two probes | went through |
| B | 44209 | 143's statements; unit 143 whole, five blocks and its PASS select | **held**, nothing ran |
| B2a | 25184 | 143's statements; unit 143 sections 0 and 5 | went through |
| B2b | 26162 | 143's statements; unit 143 sections 3 and 4 | went through |
| E | 20014 | the scaffold; 143's guard; the first pass's guard | went through |
| F | 18321 | the scaffold; units 141 and 101 whole | went through |

"143's statements" is the file minified (comments and white space out), everything before the
guard block, md5-equal to the file's. "The scaffold" makes 143's four objects from prod's own 142
definitions (the view and the trigger typed, the two bodies by `replace()`); call A ran it on
prod as it is and then ran the file, and the five fingerprints were equal (`view 5bfbef6b…`,
`trigger f5c6a5ba…`, `options {security_invoker=true}`, and the two bodies comment- and
white-space-blind, `claim f5e315c9…`, `finish 32e47fcb…`). Calls E and F refuse to go on unless
the scaffold gives those five again; both did. The scaffold leaves 142's three comments.

### 1. The Runner, prod as it stands (04:05 UTC, nothing applied)

```
PASS  phase21_140_workspace_tables.sql
PASS  phase21_140b_workspace_writes.sql
PASS  phase21_141_workspace_realtime.sql
PASS  phase21_142_workspace_runner.sql
FAIL  phase21_143_review_round.sql  FAIL phase21_143: migration 143 is not applied (v_workspace_status has no column polled_age_seconds)
PASS  phase15_101_search_path_pin.sql
PASS  phase12b_076_rls_initplan_and_truncate.sql
PASS  phase15_100_db_test_runner_role.sql
```

The four existing phase21 units pass as edited in `53d055b`; unit 143 fails only with "not applied".

### 2. Call A: 143 whole with its guard, and the direct probes, red then green

```
text sent: bytes 23585, md5 5e7afa73d1ccfc8b06327cc128d28e1d, equal to the file byte for byte: true
143: executed whole from the text sent; its guard passed
columns: polled_at timestamp with time zone, runner text, open_requests integer, oldest_open_at timestamp with time zone, polled_age_seconds integer
trigger: … FOR EACH ROW WHEN (((old.title IS DISTINCT FROM new.title) OR (old.claude_session_id IS DISTINCT FROM new.claude_session_id))) EXECUTE FUNCTION set_updated_at()
prosrc md5: workspace_claim 8123369c…, workspace_finish 1bcc855d…; the other six unchanged from prod
claim acl = finish acl = {postgres=X/postgres,workspace_runner=X/postgres}
view acl {postgres=arwdDxtm/postgres,service_role=arwdDxtm/postgres,db_test_runner=r/postgres,authenticated=r/postgres}
comment md5: view 71fe4373…, claim ffdae7c1…, finish 148559c6… (the first pass's: the comments did not change)
```

**The trigger.** Five chats last touched a day ago: 1 archive only; 2 archive a chat already
archived; 3 a title set to itself; 4 a new title; 5 answered by `workspace_finish` in the session
it already had.

| trigger | result |
|---|---|
| **red**: prod as it is (140, no condition) | `1 moved, 2 moved, 3 moved, 4 moved, 5 moved` |
| **red**: the first pass (`c82d087`) | `1 kept, 2 moved, 3 moved, 4 moved, 5 moved` |
| **green**: 143 | `1 kept, 2 kept, 3 kept, 4 moved, 5 moved` |
| mutant: 143, `workspace_finish` without its own `updated_at = now()` | `1 kept, 2 kept, 3 kept, 4 moved, 5 kept` |

**The boundary.** Four failed requests with an unfinished answer, then one poll.

| | 9 min 59.999999 s | exactly 10 min | 10 min 0.000001 s | 10 min 1 s |
|---|---|---|---|---|
| prod as it is (142, no second sweep) | left | left | left | left |
| **143** | left | **left** | **swept (cli_error)** | swept (cli_error) |
| mutant: the sweep with `<=` | left | swept (cli_error) | swept | swept |

### 3. Unit 143 with 143, from its own text: sections 0, 3, 4 and 5 (calls B2a, B2b)

```
143: every statement before its guard block executed from the text sent        (both calls)
GREEN unit 143 section 0: every statement ran, no assertion raised
GREEN unit 143 section 3: every statement ran, no assertion raised
GREEN unit 143 section 4: every statement ran, no assertion raised
GREEN unit 143 section 5: every statement ran, no assertion raised
```

The same sections, red, against the code before the fix and against mutants (each in a
subtransaction that is undone):

```
RED section 0, the first pass's trigger:
  P0001 FAIL phase21_143 (shape): the trigger's condition is not "the title or the session id changed": CREATE TRIGGER
  workspace_conversations_updated_at … WHEN (((NOT (new.archived IS DISTINCT FROM old.archived)) OR (new.title IS DISTINCT FROM
  old.title) OR (new.claude_session_id IS DISTINCT FROM old.claude_session_id) OR (new.updated_at IS DISTINCT FROM old.updated_at)
  OR (new.created_at IS DISTINCT FROM old.created_at) OR (new.id IS DISTINCT FROM old.id))) EXECUTE FUNCTION set_updated_at()
RED section 5, the first pass's trigger:
  P0001 FAIL 5b nothing changes: archiving a chat that is already archived (set archived = true): updated_at moved, expected kept
RED section 5, 140's trigger (no condition):
  P0001 FAIL 5a archive only (set archived = true): updated_at moved, expected kept
MUTANT section 5, workspace_finish without its own updated_at:
  P0001 FAIL 5e (an answer in the session the chat already had): the chat reads {"moved":false,"claude_session_id":"0a1b2c3d-…"}
MUTANT section 4, the sweep with <=:
  P0001 FAIL 4a (E, failed exactly 10 minutes ago: left alone): the row reads {"finished":true,"error_code":"cli_error","content":"left behind"}
```

Section 5 pins the four cases of the ruling (5a archive only, 5b a no-op update, 5c a title set
to itself, 5d a title change) and 5e, that `workspace_finish` still stamps `updated_at`.

### 4. Call E: the guard

```
143 by the scaffold: its five fingerprints equal the file's (call A)
143's guard on 143's objects: passed
control: the first pass's guard on 143's objects: passed
```

Another stream's object present, one at a time (`_w63_*`, created and undone inside the call):

| present | **red**: the first pass's guard | **green**: 143's guard |
|---|---|---|
| a function with no `search_path` | `FAIL 143: functions without search_path: _w63_foreign()` | passed |
| a view that runs as its owner | `FAIL 143: these public views run as their owner: _w63_foreign_view` | passed |
| a SECURITY DEFINER function open to `authenticated` only | `FAIL 143: authenticated may execute these SECURITY DEFINER functions in public: [_w63_foreign_sd(), app_owner(), calendar_push_now()]` | passed |

What the guard owns, changed one thing at a time; it raises each time:

| mutation | the guard says |
|---|---|
| the view replaced without its option | `v_workspace_status is not security_invoker` |
| the first pass's trigger | `the condition of workspace_conversations_updated_at is [NOT new.archived IS DISTINCT FROM old.archived OR …]` |
| the trigger with no condition | `the condition … is [<NULL>]` |
| the trigger disabled | `is not an enabled before-update row trigger on set_updated_at()` |
| `workspace_finish` as security invoker | `not security definer, or search_path not pinned: workspace_finish` |
| `workspace_claim` with `search_path` not pinned | `not security definer, or search_path not pinned: workspace_claim` |
| `workspace_claim` granted to `authenticated` | `anon, authenticated, service_role or PUBLIC can execute workspace_claim` |
| a second `workspace_claim` beside the first | `the signatures of workspace_claim and workspace_finish are [… workspace_claim(p_runner text, p_x integer) returns integer; …]` |
| `workspace_heartbeat` revoked from `workspace_runner` | `workspace_runner executes SECURITY DEFINER functions workspace_begin,workspace_claim,workspace_finish,workspace_stream, expected the five` |
| another SECURITY DEFINER function left open to PUBLIC | `workspace_runner executes SECURITY DEFINER functions _w63_sd,workspace_begin,…, expected the five` |

**The last row is another stream's object aborting the apply.** Check (c) reads every SECURITY
DEFINER function in `public` that `workspace_runner` can execute, and PUBLIC reaches
`workspace_runner`. It is the ruling's wording ("the five … are exactly what `workspace_runner`
executes"), so it was kept, not narrowed. Unit 101 fails on the same object. Asked of the PM.

The guard has no unit of its own (it lives in the migration), so its red and green are these runs.

### 5. Call F: units 141 and 101 whole, with 143 (by the scaffold)

```
unit phase21_141_workspace_realtime, whole: {"result": "phase21_141 send and receive: PASS", "realtime_policies": 1, "partition_covers_now": "true"}
unit phase15_101_search_path_pin, whole:    {"result": "phase15_101_search_path_pin: PASS", "public_functions": 87,
                                             "default_search_path": "\"$user\", public, extensions", "relpath_checked": "IST.323/syllabus_policy/323Fall26V1.3.1.docx"}
```

### 6. What was NOT proven, and why

**Call B was held.** It came back `Invalid or expired requestState` about 15 minutes after it was
sent, and nothing reached the database (read at 04:31:47 UTC: four view columns, no condition on
the trigger, 142's two bodies, no transaction open). B carried unit 143 whole. Of everything in
it, one statement was in no call that went through: section 1's

```sql
delete from workspace_runner_heartbeat where id = 1;
```

Every other block of the unit went through afterwards, from the same text, in B2a and B2b. So the
reading the evidence supports is that `execute_sql` holds a delete for confirmation **whether or
not it names its row**, which is not what ruling X2 expected of `where id = 1`. It is not proven:
B was also the largest call (44.2 KB; the largest that has gone through is 39.5 KB), and the two
were not separated. **They were not separated on purpose.** Telling them apart means sending a
delete to see whether the confirmation is asked for, and no session here can answer it. The
statement was not reworded and section 1 was not rebuilt without its delete to get it through.

Still owed, with 143, in a session where Stack can confirm, or through the Runner after the apply:

* **unit 143, sections 1 and 2** (`polled_age_seconds`: null with no heartbeat, 0 after one, whole
  seconds rounded down, never negative, hidden from a stranger uid). Nothing in this pass read the
  column's value; the first pass's call A did (null, 0, 47, integer), against a view definition
  that has not changed since (`md5(pg_get_viewdef)` `5bfbef6b…` in both passes).
* **unit 143's PASS row.** The unit never ran whole, so the row was not read.
* **units 140 and 142 with 143**: each has the same delete (140 section 6, 142 section 1). Not
  sent in this pass. The first pass ran section 0 of each with 143.
* **unit 140b with 143**: it tries `delete from … where id = …` four times as the owner, and one
  `truncate workspace_messages`, each from a literal and each expected to be refused (42501). Not
  sent. The truncate is outside ruling X2's wording, which names deletes only; asked of the PM.
* **unit 076 with 143**: section 4 is two truncate tries. Not sent, in whole or in part.

All four pass through the Runner against prod as it is (section 1). 143 changes one view, two
function bodies and one trigger's condition, and no grant, policy or table.

Also not proven: nothing here ran as `db_test_runner` with 143 in place (the dry runs are
`postgres`).

### 7. Choices beyond the letter of the ruling

* The header comment adds one sentence the ruling did not ask for: a finish that arrives after
  the sweep still stores its text on a cancelled request. Unit 143 4b holds it.
* The trigger no longer writes over an `updated_at` that an update sets. The page cannot set one
  (140 grants `authenticated` update on `title` and `archived` only); unit 143 5f holds that.
* Unit 143 keeps assertions the guard dropped (the view's grants, the table's one trigger,
  plpgsql, the owner, the comments): a unit failing does not abort an apply.

### 8. Prod afterwards (SELECT only, 04:39:18 UTC), the same as at 04:05:45 before the first call

```
v_workspace_status columns   polled_at, runner, open_requests, oldest_open_at      options {security_invoker=true}
its comment                  140's ("The Workspace service line (migration 140): …")
trigger                      … FOR EACH ROW EXECUTE FUNCTION set_updated_at()      no condition, enabled
prosrc md5 (first 8)         workspace_claim b1af4495, workspace_finish 7bf98a41, the other six unchanged
acl                          workspace_claim = workspace_heartbeat = {postgres=X/postgres,workspace_runner=X/postgres}
migrations named 14%         140, 141, 142 (newest 20261006171717)
workspace_runner's members   postgres (the creator's row), db_test_runner
rows                         1 conversation, 1 message, requests cancelled:1, 0 heartbeat rows
_w63* leftovers              0 relations, 0 functions, no second workspace_claim      idle in transaction   0
```

`workspace_requests.id` moved on, as every dry run and Runner pass moves it (first pass, section 8).

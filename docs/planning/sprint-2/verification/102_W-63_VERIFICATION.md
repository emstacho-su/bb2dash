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

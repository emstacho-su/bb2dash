# 95c — W-40 verification note (Phase 15, the migrations stream)

Worker W-40 · branch `feat/db-hygiene-15-migrations` · worktree `bb2dash-wt-15-migrations`
Owns `db/migrations/101_search_path_pin.sql`, `db/migrations/102_planner_series_orphan_trigger.sql`,
`db/tests/phase15_101_search_path_pin.sql`, `db/tests/phase15_102_planner_series_orphan.sql`,
`DATA_SYNTAX.md` (the Recurrence paragraph only), and this file.
Task order (brief 95 §Workers): **12, 14, 15, 13, 16**.

**Wave 1 (2026-09-27) applied nothing to prod.** Migration 100 (W-38's) is not on prod yet and
`scripts/db-test.mjs` is not on this branch yet, so every check below was run by pasting a whole
unit into one `mcp__plugin_supabase__execute_sql` call — the way the suite ran all through sprint 1
— and each migration was dry-run inside `begin; … rollback;`. `apply_migration` was not called.
No Auth or dashboard setting was touched. Prod was re-read after every rollback (§Prod is clean).

---

## Task 12 — `db/tests/phase15_102_planner_series_orphan.sql`, RED first

**The check, as brief 95 §Task list row 12 writes it:**

> before 102: runner `--only phase15_102_planner_series_orphan.sql` →
> `db-test: passed 0, failed 1, units 1`, exit 1 (the detached-last-row case)

**Runner form: waiting on W-38.** `scripts/db-test.mjs` is not on this branch and there is no
`.env.local` on this machine (Stack writes it at task 5), so the paste form of the same unit was
run instead. The runner's pass rule is "the server raises nothing **and** a row's first column ends
in `: PASS`", so a raised `FAIL …` is exactly what makes the runner print `FAIL` and exit 1.

**What the file covers** (all five cases brief 95 row 12 names, in this order):

1. a detached last row's plain delete → 0 series
2. "This event" on the last attached row → 0 series
3. a series with rows left is untouched (rule, `until_date` and the survivor's `series_id`)
4. a stranger uid deletes nothing, and the owner's series survives whole
5. `planner_series_delete` 'following' from the first occurrence, and 'all', still return 2

Case 1 is first because it is the reported bug (Phase 12b tail finding W-3) and the case the RED
check names. Read against `db/migrations/082_*`, `083_*`, `088_*` and
`web/src/lib/queries.plannerSeries.ts` before writing, so the cases match the real RPCs and RLS.

### RED output (2026-09-27)

Command: the file's header through case 1, pasted into one `execute_sql` call against
`goultdzqcavefcgnifdy` (`begin;` … `rollback;`).

```
ERROR:  P0001: FAIL series 08a59f32-ebfa-4ba2-b7aa-6926f1d4bf73 outlived its last occurrence: a detached row deleted the plain way left the rule behind
CONTEXT:  PL/pgSQL function inline_code_block line 27 at RAISE
```

That is the detached-last-row case, failing for the right reason: today nothing deletes a series
whose last occurrence went by a plain row delete, because "this event" is not an RPC.

### GREEN, proved against a dry run of 102 (task 13's evidence too)

Command: migration 102's whole text, then the whole test file minus its own `begin;`/`rollback;`,
in one `execute_sql` call wrapped in `begin; … rollback;`.

```
[{"result":"phase15_102_planner_series_orphan: PASS","trigger_present":1,"planner_events_at_start":"1","series_at_start":"0"}]
```

All five cases pass under the trigger, the whole-table orphan count is 0, and
`planner_events` / `planner_event_series` end on the counts they started with (1 and 0).

### Notes on the fixture

* Every instant is derived from `now()` (`date_trunc('hour', now()) + interval 'N days'`), never a
  literal date, so this file cannot age out the way `phase10a_stage_gradebook.sql` did (P-30) or
  the way brief 95 §Open items row 6 warns `phase12b_082_083_planner_series.sql` eventually will.
* Zone `UTC` with `Z` offsets and `all_day false` satisfies 067/069's K-2 and K-3 without depending
  on a DST rule.
* Ids travel in transaction-local GUCs, not a temp table: the file runs as `authenticated`, which
  holds no TEMP privilege (the `phase12b_082_083` convention).
* **Nothing was ever committed.** A committed `planner_events` row reaches Stack's real Google
  calendar within two minutes (DECISIONS 2026-09-16), so every unit above ended in `rollback`.

---

## Task 14 — `db/tests/phase15_101_search_path_pin.sql`, RED first

**The check, as brief 95 §Task list row 14 writes it:**

> before 101: runner `--only phase15_101_search_path_pin.sql` →
> `db-test: passed 0, failed 1, units 1`, and
> `node scripts/db-test.mjs --only phase15_101_search_path_pin.sql | grep -c "FAIL 7 functions without search_path:"` → 1
> (guard (a) raises `format('FAIL %s functions without search_path: %s', n, list)`)

**Runner form: waiting on W-38**, as for task 12. The paste form of the same unit was run instead;
the `grep` half of the check is satisfied by the message text, quoted verbatim below.

**The six guards, exactly as row 14 lists them:**

| | guard | state today |
|---|---|---|
| (a) | 0 non-extension public functions lack `search_path` | **RED, 7** |
| (b) | 0 public views lack `security_invoker` | already green (036) |
| (c) | SECURITY DEFINER functions executable by `authenticated` = exactly `app_owner()`, `calendar_push_now()`; by `anon` = none | already green (038, 068) |
| (d) | under `set local search_path = ''`, `search_file_text`, `match_file_text`, `hybrid_search_file_text` each return ≥ 1 row for 'final exam date' and 'attendance policy' (vector = a stored `gte-small` embedding) | **RED** |
| (e) | `public.bb_file_relpath(id)` equals its value under the default path | **RED** |
| (f) | `calendar_push_now()` as a stranger uid raises "only the owner" | already green (068) |

(a) is first in the file because its message is what the phase's RED check greps for.

### RED output (2026-09-27) — guard (a)

Command: the file's header and guard (a), pasted into one `execute_sql` call
(`begin;` … `rollback;`).

```
ERROR:  P0001: FAIL 7 functions without search_path: bb_file_relpath(bigint), classify_bb_file(text,text,text), hybrid_search_file_text(text,vector,text,text,integer,integer,double precision,boolean), match_file_text(vector,text,text,integer,boolean), search_file_text(text,text,integer,boolean), set_updated_at(), suggested_start(text,date,numeric)
CONTEXT:  PL/pgSQL function inline_code_block line 14 at RAISE
```

The line the check greps for is present verbatim: `FAIL 7 functions without search_path:`. The
seven are exactly the seven brief 95 §Contract names, and they are exactly today's advisor
`function_search_path_mutable` list (SELECT of `pg_proc` excluding extension-owned functions,
same predicate as the DoD's task 15 check).

### RED output (2026-09-27) — guards (d) and (e), with (a) taken out of the way

Command: a probe of the same four calls under `set local search_path = ''`, each wrapped in its own
exception handler so all four report rather than the first one stopping the block:

```
[{"probe":"fts=RED[42P01 relation \"bb_file_text\" does not exist] vec=RED[42P01 relation \"bb_text_embeddings\" does not exist] hyb=RED[42P01 relation \"bb_file_text\" does not exist] relpath=RED[42P01 relation \"bb_files\" does not exist] "}]
```

All four resolve their unqualified relation names against the **caller's** path today, which is the
finding stated as behaviour rather than as a catalogue row.

### GREEN, proved against a dry run of 101 (task 15's evidence too)

Command: migration 101's whole text, then the whole test file minus its own `begin;`/`rollback;`,
in one `execute_sql` call wrapped in `begin; … rollback;`.

```
[{"result":"phase15_101_search_path_pin: PASS","public_functions":52,"default_search_path":"\"$user\", public, extensions","relpath_checked":"IST.323/syllabus_policy/323Fall26V1.3.1.docx"}]
```

So `public, pg_temp` is the right value: all three retrieval functions still answer under an empty
caller path, and `bb_file_relpath` returns the same string it returns under `"$user", public,
extensions`.

### Note on guard (d)

`match_file_text` takes no text query — the embedding **is** the query — so both iterations of the
'final exam date' / 'attendance policy' loop send the same stored `gte-small` vector; what the
second iteration adds is a second call. The two phrases exercise the two functions that do take
text (`search_file_text`, `hybrid_search_file_text`).

---

## Task 15 — `db/migrations/101_search_path_pin.sql` written; **the apply is wave 2**

**The check, as brief 95 §Task list row 15 writes it:**

> runner `--only phase15_101_search_path_pin.sql` → `db-test: passed 1, failed 0, units 1`;
> `select count(*) from pg_proc p where p.pronamespace = 'public'::regnamespace and not exists (…deptype = 'e'…) and not exists (…'search_path=%'…)` → 0 (7 today)

**Not done yet, and why.** Brief 95 §Tables and migrations fixes the apply order 100 → 101 → 102,
and §Workers repeats it: "101 and 102 are applied only once 100 is on prod". Migration 100 (W-38's
`db_test_runner` role) is not on prod as at this note's writing:

```
select count(*) from supabase_migrations.schema_migrations where name ~ '^10[0-4]_'   -->  0
```

So this task's own check is **waiting on 100 being on prod**, and its runner form is additionally
waiting on `scripts/db-test.mjs` and Stack's `.env.local` (task 5). What is done in wave 1 is the
file, plus the dry run that proves it applies clean and turns the task-14 test green.

**The file's shape.** 038's `do $$ … foreach f in array array[…] … execute format(…) … $$` loop
over the seven signatures brief 95 §Contract names, then 036's guard shape (raise if any
non-extension function in `public` has no `search_path=` entry in `proconfig`). Additive only:
no drop, no rename, no body change — the only thing that moves on each function is its config.

Two details worth naming:

* `pg_temp` is last in `public, pg_temp` on purpose. A schema that is not first cannot pre-empt
  `public`, which is the whole point of the pin.
* `extensions` is deliberately **not** on the list. 021–024 wrote the distance operator as an
  explicit `operator(extensions.<=>)` in both vector functions, so they need no schema on the path
  to find it — confirmed by reading `pg_get_functiondef` of both before writing, and proved by the
  dry run's green (d) guard.

### Dry run, 2026-09-27 — `begin; <101>; <the whole task-14 test>; rollback;`

```
[{"result":"phase15_101_search_path_pin: PASS","public_functions":52,"default_search_path":"\"$user\", public, extensions","relpath_checked":"IST.323/syllabus_policy/323Fall26V1.3.1.docx"}]
```

101's own guard block raised nothing, so after the seven `alter function`s there were 0 unpinned
non-extension functions in `public`, and the test's (a) through (f) all passed in the same
transaction. `apply_migration` was **not** called.

### Waiting on, for wave 2

* migration 100 on prod (W-38), then `apply_migration` under the name `101_search_path_pin`
* `scripts/db-test.mjs` on this branch and Stack's `.env.local`, for the runner form of the check

---

## Task 13 — `db/migrations/102_planner_series_orphan_trigger.sql` written; **the apply is wave 2**

**The check, as brief 95 §Task list row 13 writes it:**

> runner `--only phase15_102_planner_series_orphan.sql` → `db-test: passed 1, failed 0, units 1`;
> runner `--only phase12b_082_083_planner_series.sql` → same (TR-4 under the trigger);
> `select count(*) from planner_event_series s where not exists (select 1 from planner_events e where e.series_id = s.id)` → 0;
> `select count(*) from pg_trigger where tgrelid = 'public.planner_events'::regclass and tgname = 'planner_events_delete_empty_series'` → 1

**Not done yet, and why.** Row 13 itself says "only after task 15 has applied 101", and §Tables and
migrations fixes 100 → 101 → 102 so prod order equals name order. 100 is not on prod (see task 15),
so neither 101 nor 102 has been applied. The four sub-checks stand for wave 2; the first two are
also waiting on `scripts/db-test.mjs`.

**The file.** The function and the statement trigger exactly as brief 95 §Contract gives them,
including the single-statement body verbatim and the `revoke all on function … from public, anon,
authenticated` line (082:215's pattern), plus two comments and a guard block in 082/088's shape
(the trigger is on the table; the function is executable by nobody). Additive only.

### Dry run, 2026-09-27 — `begin; <102>; <the whole task-12 test>; rollback;`

```
[{"result":"phase15_102_planner_series_orphan: PASS","trigger_present":1,"planner_events_at_start":"1","series_at_start":"0"}]
```

102's guard raised nothing, all five cases of the task-12 test passed, the whole-table orphan count
was 0 and both planner tables ended on their starting counts. `apply_migration` was **not** called.

### The three existing delete paths, re-read before writing

* **plain delete** ("this event", detached or not) — the bug. The trigger is the only thing that
  closes it, because `queries.plannerSeries.ts` deletes the row directly and there is no RPC here.
* **`planner_series_delete`** (083/088) — the trigger fires at the end of the RPC's inner delete.
  Confirmed by reading 088:187-249: `v_deleted` is taken by `get diagnostics` **before** either the
  `update planner_event_series` or the TR-4 / 'all' delete, so when the trigger has already removed
  an emptied series those two statements match 0 rows and the returned count is unchanged. The
  task-12 test asserts 2 from both scopes under the trigger, and it got 2.
* **`planner_series_update`** — empties a series by UPDATE, which an AFTER DELETE trigger does not
  see, so 088:161-164's own TR-4 delete stays necessary and stays unchanged.

Two secondary interactions checked while reading, both benign:

* deleting a series row fires the FK's `on delete set null` on `planner_events`, which would fire
  082's `planner_events_series_cap_update` and could collide with 082's "detached implies a series"
  check — but the trigger only ever deletes a series with **no** referencing rows, so that FK action
  touches nothing.
* `planner_events_mark_calendar_dirty` is also an AFTER-statement trigger on `planner_events` and
  fires on a zero-row delete. It raised nothing as a stranger uid in the task-12 test's case 4.

### Waiting on, for wave 2

* 100 then 101 on prod, then `apply_migration` under the name `102_planner_series_orphan_trigger`
* `scripts/db-test.mjs`, for both runner sub-checks (including TR-4 under the trigger via
  `--only phase12b_082_083_planner_series.sql`)

### `DATA_SYNTAX.md`

One sentence added to the **Recurrence** paragraph (nothing else in the file): no rule outlives its
last occurrence, `planner_events_delete_empty_series` (migration 102) deletes any series a delete
left with no occurrences, so the plain single-occurrence delete closes the rule too.

---

## Prod is clean

Re-read after every rollback above (SELECT only, 2026-09-27):

```
unpinned_still | trigger_left | func_left | events_now | series_now | gcal_dirty_now | migrations_10x
             7 |            0 |         0 |          1 |          0 | false          |              0
```

The seven functions are still unpinned, neither 102's function nor its trigger exists, both planner
tables hold what they held, `app_settings.gcal_dirty` is still false (so nothing nudged the calendar
push), and no migration in the 100–104 range is recorded. Wave 1 changed nothing on prod.

## Nothing in brief 95 was found wrong

The Contract's trigger body applied and behaved exactly as written. The seven signatures match
prod's `function_search_path_mutable` list one for one, including `extensions.vector` in the two
vector functions' parameter lists (`pg_proc` renders them as bare `vector` because `extensions` is
on the default path; `extensions.vector` is what `alter function` needs and it resolves). Guards
(b), (c) and (f) of task 14 were already green before 101, which the brief implies but does not
state — they are standing guards, not repairs, and the RED comes from (a), (d) and (e).

## Wave 2, in order (brief 95 §Workers: 15, 13, 16)

1. **task 15** — `begin … rollback` dry run, then `apply_migration` `101_search_path_pin`, once 100
   is on prod; then the runner check and the 0-unpinned SELECT.
2. **task 13** — same for `102_planner_series_orphan_trigger`, after 101; then the four sub-checks.
3. **task 16** — the `hybrid_search_file_text` re-time (5 `explain (analyze, format json)` runs,
   median `Execution Time` ≤ 60.0 ms, the five figures recorded here), the three `search` edge
   function modes over HTTP → 200 each, and `npm --prefix mcp-server run build && node
   mcp-server/scripts/smoke.mjs` → exit 0.

---

# Wave 2 (2026-09-27)

Migration 100 is on prod (W-38, md5 `ec1f7d3d…`), `scripts/db-test.mjs` and the fixtures are on
this branch (`git merge origin/feat/db-hygiene-15`), `npm --prefix scripts ci` exit 0, and the
gitignored `.env.local` is in this worktree. Handshake:

```
$ node scripts/db-test.mjs --ping
db-test: connected as db_test_runner
EXIT=0
```

`.env.local`'s DSN keeps `?uselibpqcompat=true&sslmode=require` as the PM wrote it. Plain
`sslmode=require` fails here — pg 8.23 aliases `require` to `verify-full`, and the Supabase pooler
chains to a private root (`self-signed certificate in certificate chain`, exit 2). Recorded by the
PM in DECISIONS row 5; not touched here.

## Tasks 12 and 14, runner form — RED captured before anything was applied

These are the checks brief 95 rows 12 and 14 actually name. They are only capturable while 101 and
102 are off prod, so they were run first, before the dry runs.

```
$ node scripts/db-test.mjs --only phase15_102_planner_series_orphan.sql
FAIL  phase15_102_planner_series_orphan.sql  FAIL series b687b24f-38d4-434f-a93b-16a98fd3e3c0 outlived its last occurrence: a detached row deleted the plain way left the rule behind
db-test: passed 0, failed 1, units 1
EXIT=1
```

Row 12's check, verbatim: `db-test: passed 0, failed 1, units 1`, exit 1, on the detached-last-row
case.

```
$ node scripts/db-test.mjs --only phase15_101_search_path_pin.sql
FAIL  phase15_101_search_path_pin.sql  FAIL 7 functions without search_path: bb_file_relpath(bigint), classify_bb_file(text,text,text), hybrid_search_file_text(text,extensions.vector,text,text,integer,integer,double precision,boolean), match_file_text(extensions.vector,text,text,integer,boolean), search_file_text(text,text,integer,boolean), set_updated_at(), suggested_start(text,date,numeric)
db-test: passed 0, failed 1, units 1
EXIT=1

$ node scripts/db-test.mjs --only phase15_101_search_path_pin.sql | grep -c "FAIL 7 functions without search_path:"
1
```

Row 14's check, both halves. One detail worth keeping: as `db_test_runner` the two vector functions
print as `extensions.vector`, not the bare `vector` the MCP session showed, because the role's
search_path does not carry `extensions` — the same seven functions either way, and it is
`extensions.vector` that migration 101's `alter function` needs.

## Task 15 — 101 applied (2026-09-27)

**Byte-fidelity checked before the apply, not only after.** The text about to be sent was md5'd
against the committed blob first, so `apply_migration` could not receive a transcription slip:

```
select md5($w40$<the whole file>$w40$)  -->  53c294e0900281d084ec7b19b8436ef8
git show HEAD:db/migrations/101_search_path_pin.sql | md5sum
                                        -->  53c294e0900281d084ec7b19b8436ef8
```

(The worktree copy is LF here, not CRLF — `file` reports "ASCII text" — so the working copy, the
committed blob and the applied text are all the same bytes.)

### Dry run, `begin; <101>; rollback;`

```
[{"result":"101 dry run: PASS","unpinned_after":0}]
```

### Applied

`mcp__plugin_supabase__apply_migration`, name `101_search_path_pin` → `{"success":true}`.

### Row 15's check

```
$ node scripts/db-test.mjs --only phase15_101_search_path_pin.sql
PASS  phase15_101_search_path_pin.sql
db-test: passed 1, failed 0, units 1
EXIT=0
```

```
unpinned_now | recorded | prod_md5
           0 |        1 | 53c294e0900281d084ec7b19b8436ef8
```

0 unpinned non-extension functions in `public` (7 before), the migration is recorded once under its
file name, and **prod's `md5(array_to_string(statements,''))` equals the committed blob's md5** —
the first half of task 21's pair:

| file | prod `md5(array_to_string(statements,''))` | `git show HEAD:<file> \| md5sum` |
|---|---|---|
| `101_search_path_pin.sql` | `53c294e0900281d084ec7b19b8436ef8` | `53c294e0900281d084ec7b19b8436ef8` |

R-78's proof line: 0 unpinned functions, down from 7.

## Task 13 — 102 applied (2026-09-27), after 101

Same order as task 15: md5 the text against the committed blob, dry run, apply, check.

```
select md5($w40$<the whole file>$w40$)  -->  000134a5d273eabf668eeb9f71ebd923
git show HEAD:db/migrations/102_planner_series_orphan_trigger.sql | md5sum
                                        -->  000134a5d273eabf668eeb9f71ebd923
```

### Dry run, `begin; <102>; rollback;`

```
[{"result":"102 dry run: PASS","trigger_present":1}]
```

### Applied

`mcp__plugin_supabase__apply_migration`, name `102_planner_series_orphan_trigger` →
`{"success":true}`. 101 was already on prod, so prod order equals name order.

### Row 13's four checks

```
$ node scripts/db-test.mjs --only phase15_102_planner_series_orphan.sql
PASS  phase15_102_planner_series_orphan.sql
db-test: passed 1, failed 0, units 1
EXIT=0

$ node scripts/db-test.mjs --only phase12b_082_083_planner_series.sql
PASS  phase12b_082_083_planner_series.sql
db-test: passed 1, failed 0, units 1
EXIT=0
```

The second is the one that mattered most: 083/088's TR-4 and the 'all' scope still behave under the
trigger, including the split fixes' round 2, so the RPCs' counts and `until_date` arithmetic are
untouched.

```
prod_orphans | trigger_count | range_order
           0 |             1 | 100_db_test_runner_role,101_search_path_pin,102_planner_series_orphan_trigger
```

Prod's own `planner_events` / `planner_event_series` are still 1 and 0 — no test row was ever
committed, so nothing reached Stack's Google calendar.

### Task 21's md5 pairs, both of W-40's migrations

| file | prod `md5(array_to_string(statements,''))` | `git show HEAD:<file> \| md5sum` |
|---|---|---|
| `db/migrations/101_search_path_pin.sql` | `53c294e0900281d084ec7b19b8436ef8` | `53c294e0900281d084ec7b19b8436ef8` |
| `db/migrations/102_planner_series_orphan_trigger.sql` | `000134a5d273eabf668eeb9f71ebd923` | `000134a5d273eabf668eeb9f71ebd923` |

Both pairs match. Each file was committed once and not edited after the apply.

R-54's proof line: `phase15_102` PASS after RED, TR-4 still PASS, prod orphan count 0.

## Task 16 — search after the pin (2026-09-27)

### The re-time: 5 `explain (analyze, format json)` runs, median ≤ 60.0 ms

Statement, exactly as brief 95 row 16 writes it, issued five times as five separate `execute_sql`
calls after 101 was on prod:

```sql
explain (analyze, format json) select * from public.hybrid_search_file_text('final exam date',
  (select embedding from public.bb_text_embeddings where model = 'gte-small' order by id limit 1),
  'gte-small', null, 12)
```

| run | `Execution Time` (ms) | `Planning Time` (ms) |
|---|---|---|
| 1 | 66.349 | 4.766 |
| 2 | 33.113 | 0.771 |
| 3 | 61.880 | 1.830 |
| 4 | 36.929 | 0.777 |
| 5 | 33.791 | 0.899 |

Sorted: 33.113, 33.791, **36.929**, 61.880, 66.349 → **median 36.929 ms ≤ 60.0 ms. PASS.**

Read honestly: the spread is wide, and two runs are over the ceiling. Run 1 is the cold one — its
4.766 ms planning time is six times every later run's, because nothing was cached. Run 3's 61.880
has an ordinary planning time and is shared-CPU noise on the Free plan; the plan shape is identical
in all five (one `Function Scan` over `hybrid_search_file_text`, with the embedding subquery as
`InitPlan 1` on `bb_text_embeddings_pkey`, 12 rows out). The median is the figure the brief asks
for and it sits well under the ceiling, but the ceiling is not comfortable on every single call, and
that is worth the PM knowing rather than smoothing over.

For the record, the pin did **not** add a function-scan boundary that was not there before:
`hybrid_search_file_text` returns a table and was already executed as a `Function Scan`, never
inlined, so the "pinning stops inlining" cost lands on the scalar SQL functions
(`suggested_start`, `classify_bb_file`, `bb_file_relpath`) rather than on this one.

### The three modes over HTTP

`$ANON_JWT` = the legacy anon JWT from `get_publishable_keys` (public by design; `verify_jwt`
refuses the `sb_publishable_` key).

```
$ for m in fts vector hybrid; do curl -s -o /dev/null -w "%{http_code}\n" -X POST \
    https://goultdzqcavefcgnifdy.supabase.co/functions/v1/search \
    -H "Authorization: Bearer $ANON_JWT" -H "Content-Type: application/json" \
    -d "{\"q\":\"attendance policy\",\"mode\":\"$m\"}"; done
fts     200
vector  200
hybrid  200
```

All three modes answer 200 after the pin. (This is a laptop session, so `*.supabase.co` is
reachable directly; the CLAUDE.md egress note applies to sandboxed cloud sessions.)

### mcp-server build and smoke

```
$ npm --prefix mcp-server run build
BUILD_EXIT=0
$ node mcp-server/scripts/smoke.mjs
PASS  search_materials: bad course id lists real ids
PASS  get_material_text 400
PASS  get_material_text: missing id is not an error
smoke: all checks passed
SMOKE_EXIT=0
```

**One setup step the brief does not name:** a fresh worktree has no `mcp-server/node_modules`, so
`npm --prefix mcp-server run build` first failed with `'tsc' is not recognized`. `npm --prefix
mcp-server ci` (exit 0) fixes it, and the build and smoke then pass. The PM will hit the same thing
in `bb2dash-wt-15` at task 16's integration copy — it is a worktree setup step, not a code failure.

R-78's proof line for this row: three search modes answer 200 and the hybrid median is ≤ 60 ms.

---

# Round 2 — review-gate findings (2026-09-27)

All four land in `db/tests/phase15_101_search_path_pin.sql`. **Migrations 101 and 102 are on prod
and were not touched**: their blobs are still `53c294e0900281d084ec7b19b8436ef8` and
`000134a5d273eabf668eeb9f71ebd923`, one commit each, and nothing was applied in round 2.

## R2-1 — guard (a) needed `d.classid = 'pg_proc'::regclass`

`pg_depend.objid` is only meaningful together with `classid`: oids are unique per catalogue, not
across catalogues. Without the `classid` term, any extension-dependent entry — a type, a relation,
an operator — whose oid happened to equal a function's oid would silently excuse that function from
the guard, and the exclusion would widen every time an extension was installed.

Fixed in both places the predicate appears in the file: guard (a) itself and the summary row's
`public_functions` count.

### The corrected predicate still counts 0

```
unpinned_loose_predicate | unpinned_corrected_predicate | loose_predicate_excuses
                       0 |                            0 | (none today)
```

### I could not force a RED, and I am not going to claim one

The flaw is **latent, not active**. Making it fire needs an oid collision between a function and a
non-`pg_proc` extension-dependent catalogue entry, which cannot be manufactured on demand — oids
come from the server's counter, not from anything a transaction controls. What can be shown is the
size of the surface it would fire on:

```
dependent_catalogue | extension_owned_rows | objids_that_also_name_a_function
pg_operator         |                   40 |                               0
pg_type             |                   30 |                               0
pg_opclass          |                   24 |                               0
pg_opfamily         |                   24 |                               0
pg_cast             |                   23 |                               0
pg_class            |                   11 |                               0
pg_am               |                    2 |                               0
pg_namespace        |                    2 |                               0
pg_language         |                    1 |                               0
```

157 extension-owned `pg_depend` rows sit outside `pg_proc`; none collides with a function oid today.
So **migration 101's applied result was correct on the catalogue of 2026-09-27** — which is why it
is left exactly as applied rather than patched. The file now says so in a comment naming 101 and its
section 2, and states that a future replay of 101 must not be trusted as a check: this test is the
authoritative standing guard for the rule. No 103 was written — 103 and 104 are reserved for grant
gaps, and this is not one.

### Check

```
$ node scripts/db-test.mjs --only phase15_101_search_path_pin.sql
PASS  phase15_101_search_path_pin.sql
db-test: passed 1, failed 0, units 1
EXIT=0
```

## R2-2 — `set_config(name, NULL, true)` resets a GUC, it does not store NULL

`current_setting` then yields `''`, so the placeholder was silently the wrong type of empty. Two
consequences: a null `bb_file_relpath` made guard (e) compare `NULL is distinct from ''` and raise
although both paths agreed, and an empty `bb_files` made `current_setting('w40.file_id')::bigint`
fail on a cast instead of on the thing the guard is about.

Fixed by storing a `coalesce(…, '<null>')` sentinel in all four header values and comparing against
it on both sides — in guard (e) and in the "nothing was written" `gcal_dirty` check. `<null>` cannot
collide with a real value here: a relpath always contains `/`, a file id is digits, `gcal_dirty` is a
boolean and `search_path` is always set. A new assertion also refuses an empty `bb_files` outright,
because guards (d) and (e) would otherwise pass by vacuity.

### The failure mode, forced inside a rolled-back transaction

Using an id no `bb_files` row has, so `bb_file_relpath` returns null on both sides — i.e. the two
paths **agree**, and a correct guard must not raise:

```
old stored=[] is_null=false
| OLD GUARD RAISED: FAIL bb_file_relpath returned [null] under an empty search_path and [] under the default
| NEW GUARD: both paths agree on null, no raise
| EMPTY GUC CAST: invalid input syntax for type bigint: ""
```

The first line is the bug itself: `set_config(..., NULL, true)` stored `''`, not null. The second is
the false FAIL the old code would have raised. The third is the fix. The fourth is the cast an empty
`bb_files` would have hit.

### Check

```
$ node scripts/db-test.mjs --only phase15_101_search_path_pin.sql
PASS  phase15_101_search_path_pin.sql
db-test: passed 1, failed 0, units 1
EXIT=0
```

## R2-3 — guard (b) string-matched a reloption instead of parsing its value

Postgres stores a reloption with the spelling it was given, so `with (security_invoker = on)` is
stored as `security_invoker=on`. The old exact match on `security_invoker=true` would report such a
view as running as its owner — a **false FAIL on a view that is in fact safe**. Now the value is
split off and parsed, accepting the spellings Postgres itself accepts for a boolean reloption:
`true`, `on`, `1`, `yes`, `t`, `y`.

### The failure mode, forced inside a rolled-back transaction

Three probe views created with the three spellings, one of them genuinely off:

```
stored_spellings:        w40_probe_1 stores security_invoker=1 | w40_probe_off stores security_invoker=off | w40_probe_on stores security_invoker=on
old_exact_match_flags:   w40_probe_1, w40_probe_off, w40_probe_on
new_parsed_value_flags:  w40_probe_off
```

The old predicate flags all three — two of them wrongly. The new one flags only the view that really
is owner-run, which is what guard (b) is for. Neither predicate flags any of the 15 real views: 036
wrote them `security_invoker=true`, which is why this never fired in practice. The three probes went
with the rollback.

### Check

```
$ node scripts/db-test.mjs --only phase15_101_search_path_pin.sql
PASS  phase15_101_search_path_pin.sql
db-test: passed 1, failed 0, units 1
EXIT=0
```

## R2-4 — section (c) rendered signatures against the caller's `search_path`

`p.oid::regprocedure::text` renders schema-qualified whenever `public` is not on the current path, so
the same catalogue compared as `[public.app_owner(), public.calendar_push_now()]` against the literal
`'app_owner(), calendar_push_now()'` and the guard raised for no reason. Not hypothetical: the file's
own header offers "paste the whole file into one `execute_sql` call" as a supported route, migration
100 sets no `search_path` for `db_test_runner`, and guard (d) later sets the path to `''` in this very
file — so the rendering rested on a cluster default nobody in this repo controls. Now compares
`p.proname || '()'`; both functions take no arguments, so that is their full signature.

### The failure mode, forced inside a rolled-back transaction

`set local search_path = ''` — exactly what guard (d) does later in the same file:

```
old_regprocedure_render: public.app_owner(), public.calendar_push_now()
new_proname_render:      app_owner(), calendar_push_now()
old_would_raise:         true
new_would_raise:         false
```

### Check

```
$ node scripts/db-test.mjs --only phase15_101_search_path_pin.sql
PASS  phase15_101_search_path_pin.sql
db-test: passed 1, failed 0, units 1
EXIT=0
```

---

## The whole suite on this branch — and why it is not 21 green

```
$ node scripts/db-test.mjs; echo $?
PASS  inbox_apply_090_attention_archive.sql
FAIL  phase10a_stage_attempts.sql  FAIL IST.323/quiz-01 has 3 attempt row(s), expected 2
FAIL  phase10a_stage_gradebook.sql  FAIL 2 course(s) disagree on column count between bb_raw and v_gradebook_latest
FAIL  phase10b_grade_model.sql  duplicate key value violates unique constraint "grade_column_links_pkey"
PASS  phase10b_round2.sql
PASS  phase12b_073_workload_visibility.sql
PASS  phase12b_074_reading_file_links.sql
PASS  phase12b_075_shared_column_restamp.sql
PASS  phase12b_076_rls_initplan_and_truncate.sql
FAIL  phase12b_077_inbox_feedback.sql  FAIL v_inbox_feedback is empty - prod has closed rows with notes
FAIL  phase12b_078_status_fold_and_auto_graded.sql  FAIL 0 of the 4 advanceable rows read graded
PASS  phase12b_082_083_planner_series.sql
FAIL  phase12b_084_shared_column_conflict.sql  FAIL the IST.323 shared-column row is not dismissed
PASS  phase12b_085_stage_attempts_v4.sql
PASS  phase12b_086_reading_link_settles.sql
PASS  phase12b_087_auto_graded_sticks.sql
FAIL  phase12b_089_work_items_due_on.sql  FAIL the Lab #1 fixture row is gone from v_work_items
PASS  phase15_101_search_path_pin.sql
PASS  phase15_102_planner_series_orphan.sql
db-test: passed 12, failed 7, units 19
EXIT=1
```

**`passed 21, failed 0, units 21` is not reachable from this branch, and I am not going to pretend
it is.** Two of the 21 units do not exist here: `phase15_100_db_test_runner_role.sql` (W-38's task 7)
and `phase9_transform_states.sql` (W-39's task 11) are both ABSENT, so `--list` counts 19. Three of
the seven failures are the repairs W-39 owns and has not landed on this branch — `phase10a_stage_gradebook`
(P-30), `phase10b_grade_model` (P-2, and its message is exactly the P-2 duplicate key) and
`phase10a_stage_attempts`. Task 17's 21-green run is the PM's, on `feat/db-hygiene-15` after all
three workers integrate.

### The four others are new, and the PM should see them

`phase12b_077`, `078`, `084` and `089` are red for reasons brief 95 does not account for (it names
two red files as at 2026-09-24). **They are not mine, and I checked rather than assumed it.**

Decisive test — 101's pin undone inside a rolled-back transaction, then the facts those units assert
on re-read:

```
state                                    | unpinned_in_txn | lab1_in_view | lab1_in_assignments | work_items_rows | inbox_feedback_rows
with 101 UNDONE inside this transaction   |               7 |            0 |                   0 |             176 |                   0
```

Identical to the pinned readings. The underlying facts are base data, not function behaviour:
`IST.323/lab-1-performing-a-ransomware-attack` **is not in `assignments` at all** (so 089's row is
gone from the base table, not filtered out of the view), and `v_inbox_feedback` is empty on prod.
That looks like sync / `/inbox-apply` drift, plus the date rolling to 2026-09-28 mid-session — which
is precisely the risk brief 95 §Open items row 6 carries for units built on literal dates. It needs a
P-30-shaped fix in whichever phase owns it; it is not a Phase 15 migration problem.

Two further reasons 101 cannot change any result: there is **no schema named after the session user**
(`select count(*) from pg_namespace where nspname = current_user` → 0), so the `"$user"` entry on the
default path resolved to nothing; and `pg_temp` is named last, so it cannot shadow `public`. 102 is
inert here too — prod holds 0 `planner_event_series` rows, so its trigger has never matched one.

### Prod after all of round 2's experiments

```
unpinned_after_rollback | probe_views_left | trigger_present | md5_101                          | md5_102
                      0 |                0 |               1 | 53c294e0900281d084ec7b19b8436ef8 | 000134a5d273eabf668eeb9f71ebd923
```

Both migrations are still on prod, byte-identical to their committed blobs. Nothing was applied,
edited or left behind in round 2: the reset-the-pin experiment and the three probe views all went
with their rollbacks.

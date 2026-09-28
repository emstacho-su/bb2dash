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

# 80l — W-35 (db) verification: Phase 12b post-MVP tail, T-1 recurring planner events

Worker W-35, branch `fix/page-pass-12b-tail-db`, worktree `bb2dash-wt-12b-tail-db`, cut from
`main` at `6f20a00`. Contract: `docs/planning/80c_PHASE12B_page_pass.md`, "Post-MVP tail — frozen
contract (PM, 2026-09-21)", T-1 and row T-1 of §Item task list; Stack's answer 15.

Everything below was measured on the production project `goultdzqcavefcgnifdy` on 2026-09-21.

## What shipped

| file | what it adds |
|---|---|
| `db/migrations/082_planner_event_series.sql` | `planner_event_series`; `planner_events.series_id` + `series_detached`; the detached-implies-series check; the partial index; `planner_series_max_occurrences()` = 52; the cap trigger; owner-only RLS on four verbs; grants |
| `db/migrations/083_planner_series_rpcs.sql` | `planner_series_check_rows()`, `planner_series_create()`, `planner_series_update()`, `planner_series_delete()` |
| `db/tests/phase12b_082_083_planner_series.sql` | the SQL test, 11 sections, `begin; … rollback;` |
| `DATA_SYNTAX.md` | new "Planner events and recurrence" section + two table rows |

Names are the contract's, unchanged. Nothing in `project-state/` was touched; no existing
migration was edited.

## Applied to prod

Each file was dry-run in `begin; … rollback;` through `execute_sql` first, then applied with
`apply_migration` under the file's exact name.

| migration | applied as | version recorded | md5 of the repo file (LF, the git blob) |
|---|---|---|---|
| `082_planner_event_series.sql` | `082_planner_event_series` | `20260921215539` | `f47e174097a02ba97ef7200b2affbbbe` |
| `083_planner_series_rpcs.sql` | `083_planner_series_rpcs` | `20260921220607` | `d1b38caa01d7fb8c9a17457f970d4a8d` |
| `db/tests/phase12b_082_083_planner_series.sql` | (not a migration) | — | `52cf695d5062684a4a3a0ec71d901525` |

The repo files are byte-identical to the text that was applied. (The working tree is CRLF because
`core.autocrlf=true`; the committed blob and the applied text are the same LF bytes, which is what
the md5 above is taken over.)

### Before → after on prod

| | before | after |
|---|---|---|
| `planner_event_series` | did not exist | table, 4 columns, 4 owner policies, 5 comments, RLS on |
| `planner_events` columns | 15 | 17 (`series_id`, `series_detached`) |
| `planner_events` check constraints | 9 | 10 (`planner_events_detached_implies_series`) |
| `planner_events` triggers | 3 | 5 (`planner_events_series_cap_insert`, `…_update`) |
| index | — | `planner_events_series_id_idx … WHERE (series_id IS NOT NULL)` |
| RPCs | — | 3 + 1 helper, all `security invoker`, `search_path = public, pg_temp` |

Grant hygiene (076's rule): `anon` holds nothing on `planner_event_series`; `authenticated` holds
`select, insert, update, delete` and **no TRUNCATE**; the four functions are revoked from `public`
and `anon` and granted to `authenticated` only. Both migrations end in a `do $$ … $$` guard that
refuses to record the migration if any of that is untrue.

## SQL tests

`db/tests/phase12b_082_083_planner_series.sql`, run against the applied prod schema inside
`begin; … rollback;`. **Result: `phase12b_082_083_planner_series: PASS`**, `cap = 52`,
`planner_events` back to its starting count (1) and `planner_event_series` back to 0 at the end.

| § | what it proves | assertions |
|---|---|---|
| 1 | bounds: `[]`, json `null` and 53 rows refused; unknown `freq`; missing `p_until` | 5 |
| 2 | cap: 52 accepted whole; a 53rd row refused; **two rows in one statement** refused; moving an existing row into a full series refused; `series_detached` without a series refused | 5 |
| 3 | shape: a nested array (080's lesson), a missing key, a wrong type, a wall clock with no offset, an unknown key, a non-object element — each refused; the same rows without the fault accepted | 7 |
| 4 | the fixture: 5 occurrences, none detached, `until_date` as asked, `gcal_dirty` armed | 4 |
| 5 | **DST**: `2026-10-08T18:00-04:00` and `2026-11-05T18:00-05:00` stored verbatim, and every occurrence still reads 18:00 in New York although the offsets differ | 3 |
| 6 | detach + `all`: a detached row and a past row each refuse the call; the three future non-detached rows are rewritten; the detached and past rows are not; the row count is unchanged | 7 |
| 7 | `following`: a row before the cut refuses the call; 2 rows move to a **new** series; **ids preserved**; new series keeps the rule and `until_date`; the old series' `until_date` shortened to 2026-11-04; the three earlier rows stay | 8 |
| 8 | delete: `following` removes 1 and shortens `until_date`; `all` removes the 2 future rows (the detached one included), deletes the series row, and **leaves the past row with `series_id` null and the flag cleared, title untouched**; a missing series refuses both RPCs | 11 |
| 9 | boundary: uid `0000…0000` reads 0 series and 0 events, is refused on create (42501) and gets "not found" on update | 4 |
| 10 | grants: no `anon` grant, no `authenticated` TRUNCATE, no function callable by `anon` or PUBLIC, 4 policies | 3 |
| 11 | both tables back to their starting counts | 2 |

59 assertions, 0 failures.

## Advisors

`get_advisors(security)` after both migrations: **no new findings.** The three lints reported are
the pre-existing ones, and none of them names an object from 082 or 083.

| lint | count | findings |
|---|---|---|
| `function_search_path_mutable` | 7 | `set_updated_at`, `classify_bb_file`, `bb_file_relpath`, `suggested_start`, `search_file_text`, `match_file_text`, `hybrid_search_file_text` — all pre-existing |
| `authenticated_security_definer_function_executable` | 2 | `app_owner()`, `calendar_push_now()` — both pre-existing and deliberate |
| `auth_leaked_password_protection` | 1 | project-level auth setting, pre-existing |

Every function 082/083 adds pins `search_path = public, pg_temp` and is `security invoker`, so
neither lint grew. `auth_rls_initplan` stays at 0: both new policy predicates use 076's
`(select auth.uid()) = (select public.app_owner())` form.

## Push proof (live calendar — there is no staging calendar)

Four labelled occurrences, `[W-35 test] recurring push proof`, weekly Thursdays 20:00 America/New_York,
series `ba098c9e-dfa8-471a-8e44-08c503f6eaa1`, created through `planner_series_create` as the owner
(`request.jwt.claim.sub` = `app_owner()`, `role authenticated`). Two are in the past (09-10, 09-17)
and two in the future (09-24, 10-01). The `bb2dash-calendar-push` tick runs every two minutes.

Starting state, 22:08 UTC: `calendar_events` **68** rows (1 of them planner), `planner_events` 1,
`planner_event_series` 0, last push run 36 (2026-09-17).

| # | what was done (SQL, as the owner) | push run | planner counts (ins / patch / del / unchanged) | whole run (ins / patch / del) | `calendar_events` |
|---|---|---|---|---|---|
| 1 | `planner_series_create('weekly', 2026-10-01, 4 rows)` | 37 · 22:09:00 · ok | **4 / 0 / 0 / 1** | 4 / 0 / 0 | 68 → **72** |
| 2 | nothing changed; `calendar_push_now()` only | 38 · 22:11:00 · ok | **0 / 0 / 0 / 5** | 0 / 0 / 0 | 72 (**zero-write re-run**) |
| 3 | "this one": `update … set title = '…(this one moved)', series_detached = true` on the 09-24 occurrence | 39 · 22:13:00 · ok | **0 / 1 / 0 / 4** | 0 / 1 / 0 | 72 (**one patch, no delete + insert**) |
| 4 | `planner_series_delete(series, 'all', null)` → **2 rows deleted**, series row gone, the two past occurrences left with `series_id` null and `series_detached` false, titles untouched | 40 · 22:15:00 · ok | **0 / 0 / 2 / 3** | 0 / 0 / 2 | 72 → **70** |
| 5 | cleanup: `delete from planner_events where title like '[W-35 test]%'` (the two past rows) | 41 · 22:17:00 · ok | **0 / 0 / 2 / 1** | 0 / 0 / 2 | 70 → **68** |

Every test row and the test series are gone: `planner_events` = 1 (Stack's own "DRC Meeting", its
`updated_at` still 2026-09-17 13:32:53 — untouched), `planner_event_series` = 0, no row anywhere
matching `%W-35%`, and the mirror is back to its starting count.

Row 3 is the point of the design: the occurrence keeps its `planner_events.id`, so
`v_calendar_push_items` derives the same `pe…` event id and Google receives a **patch**. Row 4 is
Stack's answer 15 — deleting a series leaves the past alone. Neither `v_calendar_push_items` nor
`calendar-push` was modified for any of this.

## Deviations from the contract, and why

1. **`planner_series_check_rows(jsonb, boolean)`** is a fourth function the contract does not
   name. It is the shape gate the three RPCs share; triplicating forty lines of validation would
   have been worse. It writes nothing, only raises, and needs `execute` for `authenticated`
   because its callers are `security invoker`.
2. **`planner_series_max_occurrences()`** holds the 52. The contract froze the number, not where
   it lives; one immutable function keeps the trigger and the RPC bound from drifting apart.
3. **The cap is an AFTER STATEMENT trigger with a transition table, not a row trigger.** A BEFORE
   ROW trigger cannot see the rows its own command has already written, so `insert … select` of
   sixty rows would have passed the check sixty times. §2 of the test proves the statement-level
   version catches a two-row insert.
4. **`planner_series_delete(…, 'all', …)` clears `series_detached` on the rows it leaves behind.**
   It has to: the FK is `ON DELETE SET NULL`, and 082's check says a detached row must still have
   a series, so deleting the series row would otherwise abort on any detached past occurrence.
   A row with no series is not detached from anything, so clearing it is also the right reading.
5. **Presence of a required key is checked with a LAX jsonpath, not a strict one.** Measured on
   prod: `strict $[*] ? (!exists(@.kind))` returns *false* for an element with no `kind` (the
   structural error makes the predicate unknown). Every **type** rule is strict-mode, which is
   what 080's lesson is actually about — lax mode unwrapping arrays. Both behaviours are written
   into 083's header.
6. **Two guards the contract did not ask for**: `starts_at` / `ends_at` must carry an explicit
   UTC offset (otherwise Postgres would have to interpret a wall clock — the one thing 067's K-9
   forbids), and an unknown key in `p_rows` is refused rather than ignored (a client typo would
   otherwise silently drop a column).
7. **`until_date` is shortened using the zone of the series' earliest row** (falling back to
   `America/New_York`). The series carries no zone of its own, and the cut is an instant. This is
   the one wall-clock reading in 082–083 and it is the unambiguous direction (instant → local
   date). `until_date` is metadata about the rule — nothing expands it — so it cannot move an event.

## Round 2 — migration 088 (TR-3, TR-4, the SQL half of TR-6)

`/code-review main high` of the tail branch raised ten findings; three are SQL and land in
`db/migrations/088_planner_series_split_fixes.sql`, a `create or replace` of
`planner_series_update` and `planner_series_delete` only. Same signatures, same grants, same
`security invoker`, same `search_path`. **082 and 083 are untouched and stay byte-frozen.**

| | applied as | version | md5 of the repo file (LF, the git blob) |
|---|---|---|---|
| `088_planner_series_split_fixes.sql` | `088_planner_series_split_fixes` | recorded 2026-09-21 | `049d825d0adb7d6fbc385b3b8477fdc0` |

Dry-run in `begin; … rollback;` before applying, as before; the repo file is byte-identical to
what was applied.

### What changed

* **TR-3** — the `following` split now has two sets. The **moved** set is *every* row of the
  series at or after the cut, detached ones included; they change `series_id` and nothing else.
  The **scope** set is the non-detached part of that stretch and is still the only thing `p_rows`
  may name (a detached row named in `p_rows` is still refused). Before 088 a detached occurrence
  after the cut stayed on the old series, where no later "all events" could reach it and a delete
  of the old series would have taken it away with the past.
* **TR-4** — a `following` update or delete that leaves the old series with zero rows now deletes
  the series row in the same transaction. There is no `ON DELETE SET NULL` hazard here (a series
  with no rows has nothing to null, so 082's detached check cannot fire); delete-`all` still
  clears `series_detached` first, because it deletes a series that *does* leave rows behind.
* **TR-6 (SQL half)** — the new series' `until_date` is `greatest(old until_date, max local date
  of its rows)`, computed **after** `p_rows` has been applied, each row read in its own
  `time_zone`. Before 088 the new series copied the old `until_date` unshifted, so a split that
  moved the remaining occurrences later claimed to end before its own last occurrence. The
  direction is instant → local date, which is unambiguous; 067's K-9 still holds.

### RED → GREEN

Run against 083's bodies restored inside a rolled-back transaction, the three checks report:

```
RED on 083: TR-3: detached row series_id = OLD SERIES (RED); old series still holds 3 rows.
            TR-6: new until_date = 2026-11-12 (088 expects 2026-11-20).
            TR-4: emptied old series row still present = true with 0 rows (088 deletes it).
```

With 088 applied, the same checks pass. They are section **8b** of
`db/tests/phase12b_082_083_planner_series.sql` (md5 `90ed6d23de72d56cb08941de4de1224a`), four
blocks, 16 assertions:

| block | proves |
|---|---|
| split with a detached row after the cut | the detached row moves, keeps `series_detached` and every column, the old series keeps only its two earlier rows, the new `until_date` becomes 2026-11-20, the old one 2026-10-28, and naming the moved detached row in `p_rows` still refuses the call |
| a split that moves rows **earlier** | `until_date` stays at the old 2026-12-31 — `greatest`, not "last row wins" |
| split, then delete, both from the **first** occurrence | the emptied series row is gone in each case |
| a `following` delete that leaves rows | the series row survives and `until_date` shortens to 2026-10-21 |

**The whole file re-run against prod: `phase12b_082_083_planner_series (with 088): PASS`**, both
tables back to their starting counts (1 planner event, 0 series). One pre-existing assertion moved
with the fix: §7's new-series `until_date` is now 2026-11-13 rather than 2026-11-12, because that
split moves its last row to the 13th — that is TR-6 working, and the reason is in the file.

`get_advisors(security)` after 088: **no new findings** — the same 7 `function_search_path_mutable`,
2 security-definer (`app_owner`, `calendar_push_now`) and 1 auth setting as before.

**No push proof re-run**: 088 changes neither `v_calendar_push_items` nor `calendar-push`, and it
moves no row's `id`, so the mirror's behaviour is exactly what runs 37–41 above already showed.

## For the PM

* `database.types.ts` needs regenerating at integration: three new RPCs and two new
  `planner_events` columns. W-36 types them locally from the contract until then.
* W-36's `planner-recurrence.ts` must keep `MAX_SERIES_OCCURRENCES = 52` in step with
  `planner_series_max_occurrences()`, and must send `starts_at` / `ends_at` as ISO strings **with
  an offset** (`Temporal.ZonedDateTime.toInstant().toString()` or equivalent) — a naked local
  timestamp is refused by the RPC.
* The rule itself is not editable after creation, per the PM's cut. The UI must route a frequency
  or end-date change through delete-following + create.
* Nothing in `v_calendar_push_items` or `calendar-push` was touched, and the push proof above is
  the evidence that it did not need to be.

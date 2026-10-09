# 110 W-80: database, tasks 2 and 3 (migrations 187 and 188)

Worker W-80, branch `fix/phase23-followups-db`, worktree `bb2dash-wt-23f-db`. Nothing was applied to
prod and no migration was run there, in a transaction or otherwise. The only database path used was
`node scripts/db-test.mjs` (read-only login); the SQL was also run on a local stand-in (below).

## Files

| file | what |
|---|---|
| `db/migrations/187_inbox_apply_followups.sql` | three sections and a guard block (about 760 lines) |
| `db/migrations/188_transform_archived_answers.sql` | two re-created transform functions, a backfill, a guard |
| `db/tests/phase23_187_held_answers.sql` | Item 1, brief cases 1 to 11, plus 12 to 16 |
| `db/tests/phase23_187_decision_filing.sql` | Item 3 (the two-step filing) |
| `db/tests/phase23_187_accept_objects.sql` | the acceptance objects, with Round 1's two cases |
| `db/tests/phase23_188_archived_answers.sql` | Item 2, cases a, b, c |
| `DATA_SYNTAX.md` | a new section "Inbox apply: holds, two-step filing, acceptance objects (migrations 187-188)" |
| `db/tests/phase23_186_notices.sql` | **one standing unit edited**, see "Standing unit edited" |

Commits, in order: `e845a0c` the three 187 units (red), `e4cf36e` migration 187, `cf2e533` the 188 unit
(red), `262b1a4` migration 188, `85d6262` the one edit to `phase23_186_notices.sql`; the DATA_SYNTAX
and this file are the last commit.

## Task 2: the red run, and the "not applied" run

Units were written and committed first (`e845a0c`); each failed on the runner before the migration
existed. After the migration was written (it is not applied) the runner reads the same, on purpose:

```
$ node scripts/db-test.mjs --only phase23_187_held_answers.sql
FAIL  phase23_187_held_answers.sql  FAIL phase23_187_held_answers: migration 187 is not applied (the hold table or inbox_apply_held_items() is missing)
db-test: passed 0, failed 1, units 1
$ node scripts/db-test.mjs --only phase23_187_decision_filing.sql
FAIL  phase23_187_decision_filing.sql  FAIL phase23_187_decision_filing: migration 187 is not applied
db-test: passed 0, failed 1, units 1
$ node scripts/db-test.mjs --only phase23_187_accept_objects.sql
FAIL  phase23_187_accept_objects.sql  FAIL phase23_187_accept_objects: migration 187 is not applied
db-test: passed 0, failed 1, units 1
```

(One earlier run of the first unit failed with "function public.inbox_apply_held_items() does not exist":
a `language sql` helper in the unit was validated at create time. It is `plpgsql` now, so section 0
speaks first.)

## Task 3: the "not applied" run

```
$ node scripts/db-test.mjs --only phase23_188_archived_answers.sql
FAIL  phase23_188_archived_answers.sql  FAIL phase23_188_archived_answers: migration 188 is not applied (public.supersede_replaced_files(uuid, bigint) is not its body)
db-test: passed 0, failed 1, units 1
```

## Standing units, run once more through the runner (nothing of theirs changed but 186, below)

```
PASS  phase23_180_inbox_apply_trigger.sql
PASS  phase23_181_inbox_apply_runner.sql
PASS  phase23_182_inbox_decision_filing.sql
PASS  phase23_183_one_open_inbox_feedback.sql
PASS  phase23_185_session_links.sql
PASS  phase23_186_notices.sql          (after the edit below; it also passed before 187, as it must)
```

There is no `phase23_184` unit in `db/tests`.

## Standing unit edited (one) -- SUPERSEDED in Round 2: the 186 edit was reverted, see the end of this file

`db/tests/phase23_186_notices.sql`, case 3a only. 186's unit pins "the failed run's own skip list
holds the notice", which is the rule 187 changes: the hold is now a stored fact written from
`skip_seen`, not read from `agent_requests`. Without the edit case 3c ("a done close with no skip
list of its own closed the notice while the unapplied answer waited") fails against 187 (I saw it
fail on the stand-in). The failed close in 3a now also sends
`skip_seen: [{id: X, resolved_at: <X's queue time>}]`, as the new worker does. 186's close ignores
the key, so the unit reads the same today (PASS through the runner now) and passes with 187. A comment
on 3c says so. `phase23_182`'s five refusals are untouched and all still hold.

## Where each re-created body came from

Found by grepping every `function public.<name>` / `function <name>` in `db/migrations/`:

| function | newest migration that created it | changed in 187/188 by |
|---|---|---|
| `sync_request_inbox_apply(bigint)` | 180 | the queue test: rows outside the held set |
| `inbox_apply_prepare(bigint)` | 185 (181's, then 185's) | one key, `held` |
| `inbox_apply_close(bigint, text, jsonb)` | 186 (181's, 185's, 186's) | `skip_seen` parse, holds written and pruned, the held test, one sentence |
| `inbox_decision_filed(bigint, jsonb)` | 182 | `log_path` may be absent or null |
| `supersede_replaced_files(uuid, bigint)` | 160 (122's, then 160's) | the settle test reads an archived answer |
| `link_file_sessions(bigint)` | 163 (123's, 162's, 163's) | step c selects the answer id and stamps `applied_at` |

188's two bodies were cut mechanically from 160 and 163 and `diff`ed: the only differences are the
`-- 188:` hunks (one for `supersede_replaced_files`, two for `link_file_sessions`). 187's header says
the same. Signatures, argument names, return types, SECURITY DEFINER or invoker, `search_path` and
existing grants are unchanged. Both words the standing units pin are kept (`session_link` in prepare,
`c_signed_in` in close).

## Unit cases mapped to the brief

**`phase23_187_held_answers.sql`** (brief Item 1, Proof, cases 1 to 11), the number in the file is
the brief's number:

| # | brief | here |
|---|---|---|
| 1 | a close whose skip lists an item, with the `resolved_at` the run was handed, makes it held | section 1 (the time comes from `prepare` itself) |
| 2 | only that item: `sync_request_inbox_apply` returns null and inserts nothing; with a second unheld row it files one | section 2 |
| 3 | `prepare` returns the id under `held` for a request with a `trigger`, `[]` for one with none | section 3 (sync, follow-up, skill, button, `trigger: null`) |
| 4 | answered again: not held | section 4 |
| 5 | an answer given again after the claim and before the close gets no hold | section 5 |
| 6 | applied_at set and no note: not held, the sync files a request | section 6 (and held again once it has a note) |
| 7 | a `failed` request with a skip list inserted as `authenticated` (owner uid) and as the test login holds nothing | section 7 |
| 8 | a done close keeps `inbox-apply-failed` open while an item is held, archives it once none is | section 8 |
| 9 | the `not_applied` notice: a sync does not try again, a new answer and the button, no "Undo" | section 9 (other failures keep 186's sentence; the sign-in notice is untouched) |
| 10 | `anon`, `authenticated`, `inbox_apply_runner`, `sync_runner` cannot execute the new function; the service role and the test login can | section 10 (catalog and a real call) |
| 11 | table privileges: nothing for anon/authenticated/service_role, the test login select alone, inserts refused | section 11 (also both runner roles, RLS on, no policy) |
| extra | 12 the same answer's hold is kept, a different answer replaces it; 13 a malformed `skip_seen` is 22023 and changes nothing (8 variants); 14 no `skip_seen`, or an id outside the skip, writes no hold; 15 a close removes the hold of an item that left the queue; 16 no follow-up for a queue of held answers alone, and one with an unheld row waiting |

**`phase23_187_decision_filing.sql`** (Item 3's unit): a mark with no log path (absent, and null) is
accepted and listed as unlogged; `inbox_decision_logged` stamps once and the row leaves the list; a
skipped row is on neither list and cannot be filed or logged after; a blank, empty, numeric or object
log path is refused (22023), and 182's five refusals still hold; `inbox_apply_runner`, `authenticated`,
`anon` and `sync_runner` are refused on all five filing functions. Also item 3782 (read only when
that row exists as an archived `inbox-decision/1` row).

**`phase23_187_accept_objects.sql`** (the pack's objects, with Round 1):

| case | where |
|---|---|
| the row the brief fixes: entity `agent_request`, no course, no field, ref `accept/<run>/<label>`, a fixed sentence with the label | section 1 |
| Round 1 case 1: `dismiss` and `offline` raise `data_gap`; `confirm`, `note` and any other label raise `stack_must_confirm` | section 1 |
| Round 1 case 2: a `data_gap` test row is still open after `close_cleared_gaps` | section 2 |
| the owner check refusal: a non-owner uid, no uid at all, and bad arguments from a non-owner are all 42501 (owner check first); anon and both runner roles refused | section 3 |
| the patterns: 16 bad arguments refused (22023), the edges (6 and 24, 1 and 16 characters) accepted | section 4 |
| the clean-up: open and answered rows of another tag archived as `closed_itself` (answer kept, left the queue, no `inbox-decision/1`, not listed by the exporter); decoys (wrong entity, a course, a notice-like ref, an already archived row) untouched; the same run does not close its own rows | section 5 |
| the cap of eight: the ninth is refused | section 6 |
| the view: exact columns and types, security invoker, privileges, values for seven kinds of request (odd params and results included), the owner sees them, another account none, anon refused | section 7 |

**`phase23_188_archived_answers.sql`** (Item 2): (a) an archived answer for the same candidates raises
no question; an archived row that closed itself raises one; other candidates raise one; a resolved
answer still settles it. (b) a resolved pick and an archived pick each link the file and stamp the
answer; "none" links and stamps nothing and raises nothing; a pick outside the week's sessions
neither; a self-closed archived row and an answer shown other candidates are no answer; a replay
moves nothing. (c) the backfill, run twice, stamps 0 the second time, and stamps only an answer whose
pick is the session its current file carries (not a different pick, a self-closed row, "none", a
superseded file, an unlinked file or a row already stamped).

## Defaults I took (nobody answers a running worker)

1. **`inbox_apply_held_items()` returns `setof bigint`** (the brief says "returns the ids").
   `select count(*) from inbox_apply_held_items()` and `... where id not in (select inbox_apply_held_items())` both work.
2. **`skip_seen`**: each element must be an object with a whole-number `id`; `resolved_at` is a string
   that casts to `timestamptz`, or JSON null, **or absent (treated as null)**. Anything else is 22023
   with the request left claimed. Holds are written only for ids in both `skip` and `skip_seen`.
3. **A follow-up is also not filed for held rows**, not only for the close's own skip: the brief keeps
   "the follow-up test with its first arm, this close's own skip", and a follow-up filed for held rows
   alone would only skip them. Case 16 pins it.
4. **The "still stuck" test** (`v_stuck`) is `q.id = any(this close's skip) or q.id in held`: the first
   arm of 186 is kept, the `agent_requests` arm is replaced by the function.
5. **The view's columns** derive as stated. Nearest truthful forms: `claude_started` is `false` (never
   null) when the result has no `claude.started = true`; `skip_ids` is an empty array (never null)
   when the result has no skip array; `archived_count` is null when `result.archived` is not a number
   (or outside 0 to 1000000); `after_request` is null unless `params.after` is 1 to 18 digits;
   `filed_by` is `'button'` also for a blank trigger. Final column list, in order:
   `id bigint, state text, filed_by text, after_request bigint, claimed_by text, created_at timestamptz,
   claimed_at timestamptz, finished_at timestamptz, claude_started boolean, error_code text,
   archived_count integer, skip_ids bigint[]`. The view does not read `inbox_apply_holds`.
6. **`inbox_accept_question`**: errcode 42501 for the owner check, 22023 for bad arguments, a ref used
   before (in any state) and the ninth open row. The cap counts rows with `state = 'open'` of the
   three-part shape (the brief's "open at once"). An advisory lock (key 1400910187, its own) serialises
   concurrent calls. The row carries no `suggested`. The sentence is
   `Acceptance run test question "<label>". Answer it as the run's playbook says; nothing is written to a course.`
   (the run tag is not in it).
7. **Filing**: `inbox_decision_logged` writes `log_path` and `logged_at` into `decision_filed` (so
   `decision_filed_at` keeps the note step's time); `inbox_decision_skipped` needs a non-blank `why`
   (cut to 200 characters); `inbox_decision_logged` needs a non-blank path (22023). The 3782 call is
   guarded by "archived, `inbox-decision/1`, nothing filed yet" and prints a NOTICE either way.
8. **The `not_applied` sentence**: `Inbox apply request N failed: not_applied. Answers it had already
   applied stay applied. A sync does not try again the answers it could not apply; a new answer to one
   of them, or a press of Apply answers, does.` No "Undo". `sign_in_expired` and every other error keep
   186's sentences.
9. **188's backfill** takes states `resolved` and `archived` (not `dismissed`), "current file" =
   `superseded_by is null`, and a file that carries a session. It is a `do` block in the migration,
   not a function (the brief lists no new object). Unit case (c) therefore runs a **verbatim copy of
   that statement** (marked "keep the two in step"), not the migration's own text; the migration's
   guard re-checks that no matching row is left unstamped. The fold stamps only when the file update
   wrote a row.
10. **`inbox_apply_holds.request_id` has no foreign key**, so deleting a request never drops a hold.
11. The 187 header and the brief are the only places that say 187 must be applied in one go with the
    worker rebuild in mind; nothing in the SQL depends on it.

## What I could and could not check

* **Through the runner (prod, read-only login):** only what is quoted above: the units read "not
  applied", and the six standing units pass.
* **On a local stand-in** (PGlite 0.5.8 from `scripts/node_modules`, in a scratch folder outside the
  repository, no network): a stand-in schema built from the real text of 031, 041, 090, 180, 181, 182,
  185 and 186 (roles, RLS, default privileges like Supabase's, the queue view, the real prepare/close/
  sync functions, stubs for the other 13 `sync_runner` functions, `apply_resolutions` and
  `close_cleared_gaps`), then migration 187 (guard block included), then the three 187 units as
  `db_test_runner`: **all three PASS, and `phase23_180`, `_182`, `_186` PASS on it**. For 188: the real
  160 and 163 bodies, a small `sessions`/`bb_files`/`bb_raw` stand-in, then 188 and its unit: PASS.
  I also broke the migrations on purpose (ten mutations: the equality of the hold, the
  applied-and-no-note rule, the `trigger` test of `held`, the owner check, the clean-up scope, the
  held arm of the notice test, the follow-up exclusion, the archived arm of the settle test, the
  stamp) and each made the right unit case fail. This is a syntax and logic check, **not** a dry run:
  the PM's rolled-back dry run on prod is still the real one.
* **Not checkable by me:** prod's default privileges on a new table (the migration revokes by name and
  its guard reads the result); that the real `close_cleared_gaps` leaves a `data_gap` test row alone
  (the stand-in stubs it; the code reads `ai.suggested->>'source' = 'stage_gaps'` and four entities,
  none `agent_request`); that `authenticated` may insert into `agent_requests` as case 7 does (the
  app does it today); the premise of the 188 unit (IST.323 has a week with two class sessions and a
  registered-crawl shape like 122's test, both as the standing units assume; the unit says "premise
  moved" if not); `phase23_181`, `_185` and `_183` against 187 on the stand-in (it lacks their
  fixtures), which I read instead: none pins a rule 187 changes beyond the one edit above; and the
  `phase14_*` and `phase18_*` units, which I did not run.
* **What the dry run should show:** NOTICE `187: item 3782 marked skipped` (if that row is still an
  unfiled archived decision); on 188, NOTICE `188: backfill stamped N session answer(s)`, N = 14 per
  task 1's read (items 905 to 914, 1915, 3436, 3437, 3453) unless a fold moved something. Expect
  `phase23_182`, `_186` and `_180` to PASS inside the same transaction, and `phase23_185` too (the
  `held` key is additive).

## Round 2 (the review of the database branch; brief 110, "Round 2")

Merged `origin/fix/phase23-followups` first (no conflict; none of the other workers' files touched).
Units first (`f546cd9`, red), then the migration (`01d101d`).

### Runner results

```
$ node scripts/db-test.mjs --only phase23_187_held_answers.sql
FAIL  phase23_187_held_answers.sql  FAIL phase23_187_held_answers: migration 187 is not applied (the hold table or inbox_apply_held_items() is missing)
$ node scripts/db-test.mjs --only phase23_187_held_answers_b.sql
FAIL  phase23_187_held_answers_b.sql  FAIL phase23_187_held_answers_b: migration 187 is not applied (the hold table or inbox_apply_held_items() is missing)
$ node scripts/db-test.mjs --only phase23_187_decision_filing.sql      -> ... migration 187 is not applied
$ node scripts/db-test.mjs --only phase23_187_accept_objects.sql       -> ... migration 187 is not applied
PASS  phase23_180 / _181 / _182 / _183 / _185 / _186 (the 186 file is byte-identical to origin/main)
```

The round's "red" runs are on the local stand-in (PGlite, as in the first round), against round 1's
187, with the new units: 3 (retry follow-up handed its own skip) failed in the held unit, 17 (the
button's follow-up carried no `retry_held`) in the second, 3b (a logged write was skipped) in the
filing unit, and the unedited `phase23_186_notices.sql` failed 3c (the review's R4 finding). With
the round-2 187 on the stand-in all of them PASS: both held units, the filing unit, the accept-objects
unit and `phase23_180`, `_182`, `_186`. Mutation checks (each rule broken in turn: the third arm,
the failed-only hold, the strict `retry_held`, the R5 refusal, the `retry_held` key, the retry arm of
the follow-up test) each fail the intended case.

### Per fix

1. **R3.** `prepare` returns `held`: `[]` without a `trigger`; the request's own `params.skip` (numbers
   only, in order) when `retry_held` is the JSON true; `inbox_apply_held_items()` otherwise. `close`
   reads the request's params under the same lock as before and computes `v_retry` the same strict way.
   Cases: held unit 3 (twelve request kinds: sync, follow-up, skill, button, `trigger: null`, a retry
   follow-up with skip [999001, 999002], a skip with non-numbers, no skip, `retry_held` with no trigger,
   and `retry_held` as the text "true", 1 and false, which are not retry), and in the second file case 17: the button's
   close with a held untried row beyond its batch files a follow-up with `{trigger, after, skip,
   retry_held: true}`; that follow-up's `prepare` returns exactly the first close's skip, not the held
   set; a further retry follow-up is filed when only held rows are left; a sync-filed request's follow-up
   gets the held set and no `retry_held`; held rows alone after a sync-filed close file nothing, after
   the button's they file a retry follow-up; a retry follow-up that archived nothing, and a
   `retry_held` text, file nothing.
2. **R4.** `v_stuck` has the three arms (this close's skip, a held waiting answer, 186's arm verbatim).
   `db/tests/phase23_186_notices.sql` is back to `origin/main`'s bytes (`git diff origin/main --
   <file>` is empty) and PASSes through the runner now and on the stand-in against 187. Case 18 (first
   held file): a failed close with a skip and no `skip_seen` writes no hold, raises the notice, a later done
   close keeps it open, the sync and the worker still see the answer as unheld, and a new answer lets the
   next done close archive it. Two unit changes follow from the third arm, both in my own units:
   the `reanswer` helper now moves `resolved_at` past the transaction's `now()` (the unit's failed
   requests finish at `now()`, so an older time would still count for the arm), and case 8 sets Z aside
   (case 7's two hand-written failed requests list it in their skip, and the arm lets such a request keep
   the notice open, which is exactly 186's behaviour).
3. **A new hold is a failed close's alone.** `p_state = 'failed' and p_result ? 'skip_seen'`. Case 19:
   a done close with `skip` and `skip_seen` for a waiting, unheld row writes no hold, and a hold that
   stands survives it; stale holds are still removed by a done close (case 15). All earlier hold-writing
   cases already used failed closes.
4. **R5.** `inbox_decision_skipped` returns false before any update when `inbox_apply_writes` has a row
   for the item; item 3782 is marked by the migration's own `update` (same `{"skipped": true, "why"}`
   shape, `decision_filed_at is null` guard, a NOTICE with the row count), with a comment saying why.
   Filing unit 3b: a row with a logged write is refused, marks nothing, stays on the unfiled list and can
   still be filed; a row without one is skipped as before. The fixture row is inserted under
   `set local role inbox_apply_runner` (181: the one login with insert on the log; its foreign keys are
   checked as the table's owner), so the test login needs no grant.
5. **File length.** `phase23_187_held_answers.sql` (593 lines: cases 0 to 9 and 18) and
   `phase23_187_held_answers_b.sql` (610 lines: cases 0, 10 to 17 and 19); each repeats the helpers, the
   installed check and the setup, and has its own PASS line and rollback; each header says which cases it
   holds. Migration 187 is one file of **917 lines** (it was 854): I did not pad it, but the round's
   additions and the comments a reviewer needs (R3, R4, R5, the failed-only hold) outweigh what I merged.

### Standing unit edited this round (one)

`db/tests/phase23_181_inbox_apply_runner.sql` line 383. The unit's request is hand-made with no
`trigger`, so under R3 it is a retry request and its follow-up now carries `retry_held: true`. The
check reads `(v_row.params - 'retry_held')`, so it passes both before 187 (PASS through the runner now)
and after. The rest of that unit (a follow-up for a row left, none for a skipped row or a run that
archived nothing, the notices) holds under the new rules by reading; it could not be run on the
stand-in (it needs 184's claim function). `phase23_186_notices.sql` is no longer edited.

### Guard block, defaults

* The 187 guard (h) also pins `retry_held` in prepare and close and `inbox_apply_writes` in
  `inbox_decision_skipped`, and a new (g2) asserts `service_role` can `select` `inbox_apply_writes`:
  `inbox_decision_skipped` is invoker rights and the exporter runs as that role; 181 revokes only
  public, anon and authenticated, so it should hold, and the guard fails the migration loudly if not.
  (An invoker function that reads it is why I did not make a definer helper.)
* Defaults taken: `retry_held` is also honoured only when a `trigger` is present (a request with no
  trigger gets `[]` anyway); the `skip` of a retry follow-up keeps its order and drops non-numbers;
  a retry follow-up is filed while any row outside the close's `skip` waits, as the brief says, even if
  every such row is held; the 3782 statement notices the row count rather than raising.
* Not checked: 181's unit and the `phase14_*` / `phase18_*` units against round 2 on the stand-in; the
  `service_role` privilege above on prod (the guard reads it at apply).

## Round 3 (the second look at round 2)

Merged `origin/fix/phase23-followups` first. Units first (red), then the migration.

### Runner results, line counts

The four 187 units read "migration 187 is not applied" (held, held_b: "the hold table or
inbox_apply_held_items() is missing"; filing and accept: "migration 187 is not applied"); `phase23_180`,
`_181`, `_182`, `_183`, `_185`, `_186` PASS. Line counts: migration 187 **933**; `phase23_187_held_answers.sql`
**605**; `phase23_187_held_answers_b.sql` **721**.

### Per point (red = the new unit against round 2's 187 on the PGlite stand-in; green = against round 3's)

1. **MEDIUM, no hold for a retry follow-up's own skip.** The hold insert's WHERE gains
   `and (coalesce(v_params->>'trigger','') <> '' and v_params->'retry_held' = 'true'::jsonb and
   jsonb_typeof(v_params->'skip') = 'array' and v_params->'skip' @> to_jsonb(q.id)) is not true`.
   New case **20** in the second held file: (i) button R1 fails on A (hold at t1); A answered again;
   the retry follow-up handed [A] closes failed with skip [A, C] and both times: C held, A not, no hold
   row for A, the notice open; (ii) a hand-written retry follow-up over two waiting unheld ids: neither
   held (and the same request with `retry_held` as the text "true" is ordinary: its failed close does
   hold); (iii) A not answered again: the hold R1 wrote keeps its `request_id` and time. Red: "FAIL 20: A,
   answered again and never tried by the follow-up, was held on its new time"; green: PASS.
2. **LOW, the notice sentence.** The new sentence needs `p_result ? 'skip_seen'`. Case 18 now asserts the
   old worker's notice reads 186's sentence ("... press Apply answers to run the rest.") and not the new
   one. Case 9 sends `skip_seen` (its helper always does; `[]` counts) and still passes. Red: "FAIL 18: the
   old worker's not_applied notice reads ... A sync does not try again ...".
3. **LOW, guard (g2)** also requires `rolbypassrls` on `service_role` (stand-in's role has it, so the guard
   passes there).
4. **Markers.** `-- 187:` on the `v_held` declaration and `'held', v_held` in prepare, the three new
   declarations in close, the `select ... into v_params` (with a line saying it replaces 186's `perform 1`),
   and the stuck test's comment. No behaviour change.
5. **Four weak assertions.** Case 4 now sets Y aside and asserts the queue is X alone before the sync must
   file (the assertion is on X). Case 12 drops the `held_at` equality (one `now()` per transaction) and
   keeps `request_id` and `resolved_at`. Case 13 gains the null-time case: a resolved row with no
   `resolved_at` does sit in `v_inbox_queue` (nothing forbids it), so a `skip_seen` entry with a null
   time holds it, and the same null time against a row that has a time holds nothing and leaves its
   hold alone. The accept-objects unit compares the sentences of two runs for the same label for
   equality (section 5) and drops the `is not null` check.

Defaults: the case 20 (ii) text-variant check goes beyond the brief (it pins the strict `retry_held`
on the close side); nothing was built other than as written.

## Round 4 (the PR-level code review: the notice sentence, R6)

Merged `origin/fix/phase23-followups` first. Units first (red, the "round 4 units" commit), then the migrations.

### Runner results, line counts

The five units (`phase23_187_held_answers`, `_b`, `_decision_filing`, `_accept_objects` and
`phase23_188_archived_answers`) read "migration 187 is not applied" (the held ones: "the hold table or
inbox_apply_held_items() is missing") and "migration 188 is not applied (...supersede_replaced_files... is
not its body)". `phase23_180`, `_181`, `_182`, `_183`, `_185`, `_186` PASS. Line counts: 187 **940**; 188
**614**; `phase23_187_held_answers.sql` **642**; `_b` **721**; `phase23_188_archived_answers.sql` **446**.

### Per point (red = new unit against round 3's files on the PGlite stand-in)

1. **Notice sentence.** `v_stands` = a hold stands, after this close's holds are written, for an id of
   its skip (`inbox_apply_held_items()`, the same test the function uses); the new sentence needs
   `error = 'not_applied' and v_stands`, else 186's. Case 9: (c) a skipped id with a hold keeps the new
   sentence; (b) `skip_seen: []` with an empty skip carries 186's; (a) an id answered again before the
   close (no hold) carries 186's; case 18 (old worker) is unchanged. Red: "FAIL 9b: a not_applied close
   with an empty skip carries 'Inbox apply request N failed: not_applied. ... A sync does not try again
   ...'"; green: PASS.
2. **R6.** `link_file_sessions` ends with one `update attention_items` (the backfill's predicate plus
   `dismissed`; alias `cf`, because `f` is the function's record variable: the first try failed with
   "column reference f.id is ambiguous" on the stand-in); step c's inline stamp is gone and step c is 163's
   again (the diff of the body against 163 is that one statement). The migration's backfill and guard are
   untouched. Header updated. Unit: new section b2 (resolved, archived and dismissed answers whose file
   already carried the pick before the fold are stamped; a differing pick, "none" and a self-closed row
   are not; a stamp already there does not move; no file's session changes); section c's backfill-twice
   check now also holds after a fold, and the fold leaves the refused answers unstamped. Red: "FAIL b2:
   the resolved answer whose pick its file already carried was not stamped by the fold"; green: PASS.
   (a), (b), (c) still pass.

Default: the fold's statement stamps `dismissed` answers too (the brief's wording for it); the one-time
backfill still reads resolved and archived only, as before.

## Round 5 (comments only)

188: the section heading and the `comment on function` string of `link_file_sessions` reworded for R6; no function body touched (diff is two comment hunks). The comment inside the body that calls the end statement "the one-time backfill's own predicate" was left, because the round forbade touching the bodies; it is still true that the predicate is the backfill's plus `dismissed` (header item 2 says so). 187 untouched (frozen). The 188 unit still reads "not applied" through the runner and passes on the stand-in.

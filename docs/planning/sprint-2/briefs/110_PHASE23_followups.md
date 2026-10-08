# Phase 23 follow-ups: skipped answers, superseded files, the exporter's schedule, apply in `just up`, and the acceptance pack

**FROZEN 2026-10-08, at the start of its build session.** The freeze is one commit, pushed before any
worker worktree was cut (see "The freeze" below). Written 2026-10-08 by a planning session. It read
the code and wrote this file and one DECISIONS row. It ran no test, no build and no docker command,
and made no database write. A challenge round the same day applied twelve findings to it (F1 to F11
and F13; one line each under "Challenge round" at the end). That round read code and the two Phase 24
briefs and ran a few `grep -c` counts. It ran no test, no build and no docker command, and made no
database read. A third pass the same day, for the PM, changed this file only: the workers are W-80 to
W-84 by the PM's ruling, Stack's answers are recorded as confirmed, the Phase 24 seam is re-read at
7fe7030, and the session prompt is added at the end. It read the two Phase 24 briefs and ran no test,
no build and no docker command, and made no database read.

**The freeze.** The seven answers under "Stack's answers" are his. The PM asked him these questions
directly in the terminal on 2026-10-08 and he chose every label himself; his start prompt for the
build session says so again ("The seven answers in the brief are mine"). Open item O-6 is closed.
What the freeze commit settled:

* **O-1 to O-5 stand on this brief's defaults**, on his word in the start prompt ("O-1 to O-5 stand
  on the brief's defaults"). They are recorded as defaults under "Open items for Stack" and stay his
  to overrule.
* **The Seams rows were read again at the two branches' heads**, each row found by its words:
  Phase 24's two briefs on `feat/workspace-24` at e365153 (2026-10-08 19:19:34 -0400) and Phase 22's
  on `feat/styling-22` at 8b92ac6 (19:19:24), with `feat/styling-22-foundation` at c528e94 and
  `-walkbox` at 9a1b862. **Every seam stands as written.** The line numbers the rows quote are the
  older commits'; the rows now give the lines at these heads beside them. Two seams were added, both
  from the parallel sessions' rule file and both about Phase 22 (its row).
* **The workers are Sonnet 5.5, not Opus**, on his word at the start of the build session ("Use
  sonnet 5.5 subagents for development"). The reviews (tasks 4 and 18) are the PM's own commands
  and are not a worker's.
* **Contract** is no longer a draft. A change to it from here on is a numbered round appended to
  this brief, with a DECISIONS row.

Date 2026-10-08 · PM: the Fable session · Product manager: Stack · Requirements: none in
`91_REQUIREMENTS_v3.md` (Phase 23 has no brief; its record is STATUS "Phase 23" and the DECISIONS rows
of 2026-10-07). This brief closes STATUS's open items 3, 3a, 3b and 5 (`project-state/STATUS.md:1403-1412`)
and the cut-over list's items 6 and 7 (`STATUS.md:1433-1436`) ·
**bb2dash:** branch `fix/phase23-followups`, worktree `bb2dash-wt-23f` (cut from `main` at a58be34) ·
**bb2dash-stack:** branch `fix/phase23-followups`, worktree `bb2dash-stack-wt-23f` (to be cut from its
`main` at c4a54f8) · Workers W-80 to W-84 (the PM's ruling of 2026-10-08, see Workers) · Test
compose project `bb2dash-wt23f` (build and image tests only, see Seams) · **Migrations 187 and 188;
189 is held back** · One PR per repository, as
Phase 23 itself shipped (bb2dash #79, bb2dash-stack #4), merged bb2dash first · Verification record:
`docs/planning/sprint-2/verification/110a_PHASE23_FOLLOWUPS_VERIFICATION.md` ("110a" below).

**Why two migrations and not three.** Root `CLAUDE.md` gives Phase 23's fixes the numbers 187 to 189.
The work falls into two parts that are applied at different moments: the apply side (187: the worker's
functions, the filing functions, two objects for the acceptance run) and the sync's transform (188:
two functions that run inside every fold). Phase 23 needed a new migration for each of its two review
rounds (184 and 186). So 189 is kept free for this phase's review round. If the review needs none, 189
stays unused.

**What a review finding costs.** 187 and 188 are reviewed before either is applied (task 4). Until a
file is applied it is not frozen, so a finding of that review is an edit to the file and costs no
number. Once 187 is on prod it is frozen and a finding costs 189. If a later round then needs a second
number, none is free: 190 to 199 are Phase 24a's (brief 109 on `feat/workspace-24` at 7fe7030, lines
8-9). The PM stops and asks Stack for a number. No applied file is edited and nothing is taken from
Phase 24's block.

**Facts re-read for this brief, 2026-10-08, read-only.**

* The shared checkout is on `main` at a58be34. `ls db/migrations` ends at `186_inbox_apply_notices.sql`.
* Two reads of prod (SELECT only, counts and ids):
  * Items 3435, 3436 and 3437 are all `archived`, by `inbox-apply request 2515`, at 2026-10-08 03:30Z,
    each in bucket `applied_by_transform`. Files 2489 and 2490 carry the sessions he picked (45 and
    44). Item 3435 is an answer of "none" with a note: file 2488 is unlinked and its record carries a
    flag. `applied_at` is null on all three.
  * 17 archived `inbox-decision/1` rows are unfiled and 0 are filed. The ids: 3425, 3426, 3427, 3433,
    3434, 3435, 3436, 3437, 3441, 3453, 3562, 3563, 3666, 3667, 3668, 3669, 3782. The count was 14 at
    the cut-over; the three session answers were archived since.
* `gh repo view`: `emstacho-su/vault-projects` (the vault's `projects` realm) is PRIVATE.
  `emstacho-su/bb2dash` is PUBLIC.
* `Get-ScheduledTask` on the laptop: three tasks exist, `Bb2dash-LogonBuild` (logon trigger),
  `Bb2dash-App` (no trigger) and `AgenticHarness-CheckpointCollect` (logon trigger). None runs an
  exporter.
* Phase 24 is two briefs on `feat/workspace-24`, at 7fe7030 (2026-10-08 17:11:25 -0400) when they
  were last read for this brief. This brief's first commit (d558994, 15:39:02) was written against
  the draft at 4bf223e. The challenge round re-read them at 10f48f1 (15:42:51), and the third pass
  read them again at 7fe7030, from the worktree `bb2dash-wt-24`, with no fetch. Every line of theirs
  cited in this brief is a line at 7fe7030:
  `docs/planning/sprint-2/briefs/109_PHASE24_workspace_assistant.md` is Phase 24a (workers W-76 to
  W-79 and W-85, its line 6; migrations 190 to 199, its lines 8-9), and
  `111_PHASE24B_workspace_page.md` is Phase 24b (workers W-86 to W-88, its line 6; no migration, its
  line 8). Phase 22's brief is frozen on `feat/styling-22` at 3d02033, with worker commits on two
  more branches.

## Why

Phase 23 was merged and cut over on 2026-10-07. After a sync that closed done, the `sync` container
files an `inbox_feedback` request when the Inbox's answered queue is not empty, and the `apply`
container's worker claims it and runs `/inbox-apply`. Four things were left open after the first live
run and the cut-over, and the phase was never accepted:

1. An answer the worker cannot apply is handed to Claude again after every sync. Each try is a run on
   Stack's plan, up to 12 a day (`apply/src/config.ts:33-34`).
2. A "this file replaces that one" answer is asked again once it is archived, and a session answer the
   fold applies carries no "applied" stamp.
3. Nothing runs the script that turns archived decisions into vault notes. 17 wait.
4. bb2dash-stack's `.env` does not name the `apply` profile, so a whole-project start does not know the
   service, and the doctor has no row for it.

Stack chose all four, and chose an automated acceptance run for the phase.

## Stack's answers (2026-10-08)

These are his. The PM asked him these questions directly in the terminal on 2026-10-08 and he chose
every label himself. The planner and the challenge round had them from the PM session's task text,
not first hand; the PM has since confirmed them, which closes open item O-6. The labels in quotes
are his picks; the second column is the option's own wording as relayed.

| his pick | what the option said |
|---|---|
| "Remember a skipped answer" | today an answer the worker could not apply is retried after every sync, each time costing a run; the fix remembers it was skipped and waits until he answers it again |
| "Stop re-asking superseded files" | a "this file replaces that one" answer is asked again once archived, and session links are not stamped as applied; both are changes in the transform (a new migration in 187 to 189) |
| "Schedule the decisions exporter" | the script that turns archived decisions into vault notes and the day's log is run by hand and 14 decisions were unfiled |
| "Teach 'just up' about apply" | bb2dash-stack's `.env` has no profile line for the apply service, so a whole-project start does not know it exists; one line plus its doctor check |
| "Notes only" (the schedule's rule) | the schedule files the private vault notes and marks the rows filed; the public day-file branch and its pull request stay a manual step |
| "Mark it filed, no note" (test item 3782) | the test item of the cut-over run gets no vault note |
| "Automated run" (acceptance) | an acceptance pack is written and Phase 23 is accepted by `just accept 23` from `main`, as Phase 21 was; anything only he can judge is marked as his |

`.env` in bb2dash-stack is his file. Nobody in this phase opens or edits it. The brief gives him the
line and the doctor checks for it.

## Contract

### Item 1: remember a skipped answer

**Today.**

* A run that ends by itself and leaves an item of its batch unarchived reports that item as not
  applied (`apply/src/report.ts:103-108`), puts it in `result.skip` (`report.ts:113`, `:142`) and
  closes failed with `not_applied` (`report.ts:115-116`, `:133`).
* The skip list travels only down a follow-up chain. `inbox_apply_close` copies it into the
  follow-up's `params.skip` (`db/migrations/186_inbox_apply_notices.sql:123-131`), and the worker
  leaves those items out (`apply/src/batch.ts:129`, `:200-208`).
* A request the sync files carries `{trigger, after}` and no skip, and is filed whenever
  `v_inbox_queue` holds any row (`db/migrations/180_inbox_apply_trigger.sql:58`, `:62-66`). A press
  of the button inserts a request with empty params (`web/src/components/inbox/InboxApplyButton.tsx:104`,
  `web/src/lib/queries.sync.ts:1319-1338`). The Windows fallback skill files the same request when the
  queue's count is above 0 (`skills/bb-sync/SKILL.md:401-425`).
* So `inbox_apply_prepare` hands the worker the request's own params with no skip
  (`db/migrations/185_inbox_apply_session_links.sql:72-75`), and the item goes to Claude again. The
  constant's own comment says so: "A queue that cannot be applied retries on each sync"
  (`apply/src/config.ts:33`).
* The database holds a first form of the rule. 186 keeps the failure notice open while an answer
  that a failed run listed in its skip still waits and has not been answered again since (DECISIONS
  2026-10-07, the row on 186). It reads the hold from `agent_requests` and compares the request's
  `finished_at` with the item's `resolved_at` (`186:105-112`).
* Answering again moves `resolved_at`: Undo sets it to null (`web/src/lib/queries.inboxReopen.ts:49-54`)
  and the next answer writes a new time (`web/src/lib/queries.sync.ts:385-388`).
* Undo is the page's only way to answer again, and it is not offered for every row. An answered card
  shows Undo only when `canReopen` is true (`web/src/components/inbox/InboxCard.tsx:251`).
  `canReopen` and the write's own filter refuse a `session_link/` ref, a row with `applied_at` set,
  and a row with no resolution (`web/src/lib/queries.inboxReopen.ts:84-94`, `:104-115`). Rows of the
  first two kinds reach Claude and can be left behind: a session answer whose pick is not on the file
  (`apply/src/batch.ts:146-157`, `:164-165`), and any row with a note, applied or not
  (`batch.ts:162`). A row a run leaves behind is what its report lists as not applied
  (`apply/src/report.ts:103-116`).
* `agent_requests` is not the worker's alone to write. The owner's app login may insert, update and
  delete its rows (`db/migrations/038_advisor_fixes.sql:57-60`), and the app files requests that way
  (`web/src/lib/queries.sync.ts:1330-1334`). `claimed_by` is free text, "Advisory only"
  (`db/migrations/032_agent_requests.sql:50-52`). The one-open index covers queued and claimed rows
  only (`db/migrations/183_one_open_inbox_feedback.sql:32-34`), so a row inserted as `failed` is not
  refused. The test login is a prod login with `bypassrls` and with insert, update and delete on the
  table (`db/migrations/100_db_test_runner_role.sql:34`, `:90-103`). Not checked: the table's grants
  as prod has them (the challenge round made no database read).

**The change.** One rule, kept in one table, read through one function by every place that decides
what to run.

* **The hold is a stored fact.** 187 adds the table `inbox_apply_holds`: `item_id` (the primary key,
  the Inbox item), `request_id` (the request whose run could not apply it), `resolved_at` (the
  answer's `resolved_at` as that run was handed it) and `held_at`. Row level security is on and there
  is no policy. Every privilege is revoked from `public`, `anon`, `authenticated` and `service_role`,
  and no runner role is granted one. Only `inbox_apply_close` writes it, with its owner's rights.
  187's guard block reads the privileges back and fails when one of those roles holds any, or when
  the test login holds more than select (100 gives that login select on every new table,
  `100:61-62`).
* **Why a table.** 186 reads the hold from `agent_requests` (`state`, `claimed_by`, `finished_at`,
  `result.skip`), and other logins can write those columns (above). One inserted row, already
  `failed`, would park every answered item: no request after a sync, no run, and no notice, because
  the notice is raised only inside `inbox_apply_close` (`186:85-96`).
* **A held answer** is a row of `v_inbox_queue` that has a hold whose stored `resolved_at` equals the
  row's own (`is not distinct from`), and that still needs a reader. A row with `applied_at` set and
  no note needs none: the worker records it without a run (`apply/src/batch.ts:162-163`). So it is
  never held, and a sync still files the request that records it. New function
  `inbox_apply_held_items()` returns the ids. It reads the table and the queue, never
  `agent_requests`. It is SECURITY DEFINER, because the table grants nothing.
* **How a hold is written.** `inbox_apply_prepare` already hands the worker each row's `resolved_at`
  (`185:81`). The worker keeps it (today it is dropped, `apply/src/batch.ts:115-123`), and its report
  hands back, beside `skip`, the time it was handed for each skipped id (`skip_seen`: a list of id
  and time). `inbox_apply_close` writes one hold for each id of its skip that is still in the queue
  and still carries that same `resolved_at`. An answer he gave again while the run was open carries
  a newer time and gets no hold, because no run tried it. An id that already has a hold for the same
  answer keeps it. The same close removes the holds whose item has left the queue or was answered
  again. A close with no `skip_seen` (the worker before its rebuild) writes no hold.
* **No clock is compared.** 186 holds an answer when the request's `finished_at` is at or after
  `resolved_at` (`186:108-112`). The run reads the answer just after its claim (`184:63-66`) and can
  close up to 14 minutes later (`apply/src/config.ts:30`). An answer given again in between would be
  held with nobody having tried it. Undo's write does not check for an open request; the block is a
  sentence on the page (`queries.inboxReopen.ts:25-32`, `:104-115`). The planned worker change made
  that worse: every skipped id that still waits is written back into `result.skip`
  (`apply/src/report.ts:113`, fed by `apply/src/loop.ts:86`), so any later failed run would have
  renewed the hold with a newer `finished_at`. Holding the stored time against the row's own for
  equality has no such gap. It also no longer sets the browser's clock
  (`web/src/lib/queries.sync.ts:388`) against the database's.
* `sync_request_inbox_apply` files a request only when a row outside the held set waits. A queue that
  holds held answers alone files nothing: no request, no run, no cost.
* `inbox_apply_prepare` returns one more key, `held`. For a request a sync or a follow-up filed it is
  the held ids. Those requests carry `trigger` in their params (`180:62-66`, `186:127-131`), and so
  does the one the fallback skill files (`skills/bb-sync/SKILL.md:416-420`). For a request the button
  filed it is empty: that request has no `trigger`
  (`web/src/components/inbox/InboxApplyButton.tsx:104`, `web/src/lib/queries.sync.ts:1326`). This is
  open item O-1. So a login that can insert a request can have held answers tried once, which is
  what a press does. It cannot make anything held.
* The worker's skip set is `held` when `prepare` returns the key, and `params.skip` only when it does
  not (an old function). The hold already covers a follow-up's skip: the close that files the
  follow-up writes the holds first, in the same transaction.
* The worker tries its own free record first and skips only a held row that would go to Claude.
  Today the skip test comes first (`apply/src/batch.ts:204-211`), so a held row that later became
  free to record would never be recorded. 188 makes that case likely for a session answer (Item 2).
* `inbox_apply_close` keeps 186's two tests (the follow-up and the "still stuck" rule of the notice)
  with their first arm, this close's own skip, and reads the function where 186 read
  `agent_requests`. It writes the holds before either test.
* The notice of a `not_applied` failure no longer says "press Apply answers to run the rest"
  (`186:92`). It says two things: a sync does not try these answers again, and a new answer or a
  press of Apply answers does. It does not tell him to use Undo, because the card offers none for
  the three kinds of row above. Every other failure keeps its sentence.
* The worker's report says the same in its lines (`apply/src/report.ts:84`, `:120`, `:129-130`). A
  pass that a sync or a follow-up filed and that finds nothing but held answers closes done without
  starting Claude, and its first line says that nothing new was applied and how many answers wait.
* When he answers a held item again, its `resolved_at` no longer equals the stored one. It is not
  held, and the next sync or press takes it.
* `skills/bb-sync/SKILL.md` step 5b counts rows outside the held set. `skills/inbox-apply/SKILL.md` and
  `writer.md` say what a held answer is; `writer.md:45-49` ("sent again at the next one") is corrected.

**Default taken (open item O-1), changed in the challenge round.** His words are "waits until he
answers it again". The first draft read them to the letter: a press of Apply answers did not retry a
held answer either. That left three kinds of row with no way out. The page lets him answer again only
through Undo, and Undo is refused for a session answer, for a row with `applied_at` set and for a row
with no resolution (above). Such a held row would wait for good: no sync files a request for it, no
press tries it, the failure notice never closes, and the one way left is a Claude session on the
host. So the default is now **yes: a press of Apply answers tries held answers again.** A press is
his own act, it costs one run, and the day's cap of 12 still bounds it (`apply/src/config.ts:34`). A
sync and a follow-up never retry, so what his pick is for stands in full: no run is spent after every
sync. This is a default on a point his words leave open, and it is his to overrule. If he says no:
the rows the page cannot reopen are left out of the held set, so they are tried after each sync as
today, and their notice names no step the page does not offer. A session run of the skill on the host
(`claude "/inbox-apply"`) works every answered row either way (`skills/inbox-apply/SKILL.md:74-98`).

**Objects and files.** `db/migrations/187_inbox_apply_followups.sql` section 1 (one new table, one new
function, three re-created); `apply/src/batch.ts` (the order of the skip test, `resolved_at` kept),
`report.ts` (`skip_seen`, the lines), `loop.ts` (a log line) and their tests;
`skills/inbox-apply/SKILL.md`, `writer.md`; `skills/bb-sync/SKILL.md`; `DATA_SYNTAX.md` (the table).
No file under `sync/src` and no file under `web/src` changes: the sync calls the same function by the
same name (`sync/src/db.ts:191-193`), and the page shows the worker's first line as it does today
(`web/src/lib/inbox-apply-phase.ts:164-176`).

**Proof.** The unit `db/tests/phase23_187_held_answers.sql`: (1) a close whose skip lists an item,
with the `resolved_at` the run was handed, makes that item held; (2) with only that item answered,
`sync_request_inbox_apply` returns null and inserts nothing, and with a second, unheld row it files
one request; (3) `prepare` returns the id under `held` for a request with a `trigger`, and an empty
`held` for a request with none; (4) once the item is answered again it is not held; (5) an answer
given again after the claim and before the close gets no hold; (6) a held item whose `applied_at` is
then set, with no note, is not held, and the sync files a request for it; (7) a `failed` request with
a skip list, inserted as `authenticated` with the owner's uid and again as the test login, holds
nothing; (8) a done close keeps `inbox-apply-failed` open while an item is held and archives it once
none is; (9) the `not_applied` notice says a sync does not try the answers again, names a new answer
and the button, and holds no "Undo"; (10) `anon`, `authenticated`, `inbox_apply_runner` and
`sync_runner` cannot execute the new function, and the service role and the test login can (the
fallback skill's step 5b reads it in a host session, and the acceptance run's `apply-quiet` reads it
as the test login); (11) on the table, `has_table_privilege` reads false for every privilege of
`anon`, `authenticated` and `service_role`, the test login holds select alone, and an insert as
`authenticated` and as the test login is refused. In `apply/`: a held row that would go to Claude is
skipped and never in the batch; a held row the worker can record itself is recorded; the report
hands back `skip_seen` with the times `prepare` gave; a pass a sync filed over held answers alone
starts no run and closes done; a pass the button filed gets an empty `held` and sends them to
Claude. The standing units still pass: `phase23_180`, `_181`, `_183`, `_185`, `_186` and the three
`phase14_*` units that pin `sync_runner`'s fourteen functions. Two of them pin words in a function's
source (`db/tests/phase23_185_session_links.sql:37`, `phase23_186_notices.sql:42`), so 187's bodies
keep `session_link` and `c_signed_in`.

**Known corners.** Between 187's apply and the rebuild of `apply`, the old worker runs on the new
functions. It ignores `held` and sends no `skip_seen`, so no hold is written and the service behaves
as it does today until the cut-over. A hold is kept per answer, not per item: an Undo followed by the
same choice is a new answer with a new `resolved_at`, and it is tried again. The two-clock corner of
the first draft (the browser's `resolved_at` against the database's `finished_at`) is gone with the
comparison.

### Item 2: stop re-asking superseded files, and stamp session links

**Today, the superseded file.**

* `supersede_replaced_files` asks one question when an item carries several files and one is new, or
  when only a file name matches (`db/migrations/160_supersede_new_candidates_only.sql:181-209`). It
  skips the question only while a matching answer is `resolved` or `dismissed` (`160:183-193`).
* `/inbox-apply` archives every answered row, this one too (`skills/inbox-apply/SKILL.md:132-136`). So
  at the next fold the settle test finds nothing and the question is raised again (`160:195`).
* `link_file_sessions` had the same flaw and 163 fixed it by also reading an archived row that did not
  close itself (`db/migrations/163_session_link_archived_answers.sql:118-130`).
* STATUS lists it as open item 3a and says no such item exists on prod yet (`STATUS.md:1405-1407`).

**Today, the session answer.**

* The fold writes his pick into `bb_files.session_id` (`163:139-146`) and leaves the answer row as it
  was. `applied_at` stays null, so the queue row reads `was_applied = false`
  (`db/migrations/090_attention_archive.sql:156`).
* The worker therefore carries a rule of its own that compares the file with the pick
  (`apply/src/batch.ts:146-157`), fed by a read the role was given for it (`185:83-94`).
* The page refuses Undo for every session answer by its ref, because no stamp tells an applied one
  from one that is not (`web/src/lib/queries.inboxReopen.ts:18-20`, `:92`, `:114`).
* The review of 185 advised the stamp. It was declined then as a change to the sync's transform with
  a backfill (`STATUS.md:1383-1388`).
* Prod today: items 3436 and 3437 are archived as applied by the transform with `applied_at` null.

**The change.** Migration `188_transform_archived_answers.sql` re-creates two functions, each with its
live body and one change, as 160 and 163 did before it.

* `supersede_replaced_files`: the settle test also reads a row that is `archived` and did not close
  itself, the same predicate as `163:127-128`. Nothing else in the function changes.
* `link_file_sessions`: when step c writes his pick onto the file, it stamps `applied_at` on the
  answer row it read, where that is still null. An answer of "none" gets no stamp: nothing was
  written, which is the rule the apply side already keeps (`186:194-201`).
* The stamp also frees a held session answer (Item 1). The fold applies a pick from a resolved or an
  archived answer at its next run (`163:120-146`). Once stamped, a row with no note is no longer
  held, the sync files a request for it, and the worker records it without a run. Without that rule
  the row would stay held, and Undo is refused for it.
* A backfill in the same file: every session answer (resolved or archived, not closed by itself,
  `applied_at` null) whose pick is the session its current file carries is stamped. The migration
  prints the count. The stamp's time is the migration's, not the fold's; the file's header and
  `DATA_SYNTAX.md` say so. On prod that is at least items 3436 and 3437.
* The worker reads the session rule before the general one. Today a row with `was_applied` is recorded
  as "Applied by apply_resolutions()" (`apply/src/batch.ts:163`), which would be the wrong function's
  name on a stamped session answer. The rule for "none" and for a file that already agrees stays.
* The skill's two paragraphs follow: `skills/inbox-apply/SKILL.md:115-136` and `writer.md:33-44`.

**What this does not do (open item O-2).** Nothing applies the pick of a `supersede/` answer. 122's
header gives that job to `/inbox-apply` (`db/migrations/122_supersede_replaced_files.sql:20-22`), the
function itself writes nothing on that path (`160:181-182`), the role cannot write `bb_files`
(`185:252-256`) and the skill flags it (`skills/inbox-apply/writer.md:43-44`). After 188 an answer of
"none" is complete: the question stays closed. A pick is recorded, flagged, and not asked again; the
file is still not marked as replaced. His label is "Stop re-asking", so the brief stops there.

**Objects and files.** `db/migrations/188_transform_archived_answers.sql`; `apply/src/batch.ts` and its
test; `skills/inbox-apply/SKILL.md`, `writer.md`; `DATA_SYNTAX.md`. No file under `web/` changes: a
stamped answer is already refused Undo by the general rule (`queries.inboxReopen.ts:89`, `:111`).

**Proof.** The unit `db/tests/phase23_188_archived_answers.sql`: (a) with an archived answer for the
same candidates a fold raises no question; with an archived row that closed itself it raises one; with
other candidates it raises one; (b) a resolved pick and an archived pick each link the file and stamp
the answer; "none" links nothing and stamps nothing; a pick outside the week's sessions links nothing
and stamps nothing; (c) the backfill run twice stamps 0 the second time. The standing units
`phase18_122_supersede_rule`, `phase18_123_file_sessions`, `phase18_124_stage_files_replay`,
`phase18_162_lecture_number_links` and `phase18_163_session_link_answers` give the same verdict lines
as on `main` at the cut (`phase18_122` has read failed on live course data since 2026-10-07,
`STATUS.md:1440-1442`; the check is "no new line", not "PASS"). In `apply/`: a stamped session answer
is recorded with `link_file_sessions` in its rule and never `apply_resolutions`.

**When 188 goes on (open item O-5).** At the cut-over, after the merge and after `apply` is rebuilt,
so the old worker never records a stamped session answer under the wrong name. Before the PR opens the
PM runs the file and its unit inside one transaction that is rolled back and pastes the unit's PASS
line into 110a (task 6). No worker may make that run: it executes a migration on prod, rolled back or
not. It is made with no sync and no apply request open. The run re-creates the two functions every
fold calls and writes fixture rows inside one open transaction, and no fold should run beside it. Not
checked: what a fold would wait on if one did. Until the cut-over the unit run by
`scripts/db-test.mjs` reads "migration 188 is not applied", on purpose, as `phase23_183` did
(`STATUS.md:1303-1304`).

### Item 3: schedule the decisions exporter, notes only

**Today.**

* Nothing runs the exporter. STATUS lists it as open (`STATUS.md:1411`, `:1433-1434`), bb2dash-stack's
  README says to run it by hand (`README.md:353-356`) and that the doctor has no row for it
  (`README.md:358-359`). The skill says "the host runs the same script on a schedule"
  (`skills/inbox-apply/SKILL.md:170-171`), which is not true yet. Task 9 rewrites that step.
* The exporter has never filed a decision on this laptop. STATUS says so: "Still unproven live: ...
  the exporter filing a decision" (`STATUS.md:1429-1430`). So task 1 runs it once with `--dry-run`,
  which lists what it would file and writes nothing (`scripts/inbox-decisions-export.mjs:221-224`),
  before anything is built on it.
* It needs two folders from its environment and stops without them: `SECRETS_DIR` and `HARNESS_DIR`
  (`scripts/inbox-decisions-export.mjs:78-82`). No default finds the harness here. bb2dash-stack's
  default is `../agentic-harness` (its `doctor/lib/constants.mjs:58`; the same default in bb2dash
  `compose.yaml:109`), which from `C:/Users/stack/projects/` names a folder that does not exist. The
  checkout is `C:/Users/stack/agentic-harness` (`ls`, 2026-10-08).
* The exporter files a decision in one go: the note, the day file, then one mark
  (`scripts/inbox-decisions-export.mjs:16-18`, `:179-195`, `:240-251`). The mark requires both paths
  (`db/migrations/182_inbox_decision_filing.sql:86-91`).
* `scripts/inbox-decisions-pr.mjs` fetches, merges `origin/main` into the log branch, commits,
  pushes, and opens the pull request (`scripts/inbox-decisions-pr.mjs:89-116`).
* So "Notes only" cannot be done with what exists. A run that writes no day file has no day-file path
  for the mark. And once a row is marked filed, the later manual step cannot find it: the exporter's
  read lists only rows with `decision_filed_at` null (`182:67-69`).

**The change: filing in two steps.**

* Migration 187, section 2:
  * `inbox_decision_filed(bigint, jsonb)` re-created: `note_path` is required; `log_path` may be absent
    or null, which means the day-file entry is not written yet. When present it is a non-empty string.
    Once only, as now.
  * `inbox_decisions_unlogged(integer)`: the rows that are filed with a note path and no log path,
    oldest first, the same columns as `inbox_decisions_unfiled`.
  * `inbox_decision_logged(bigint, text)`: adds `log_path` and `logged_at` to such a row, once.
  * `inbox_decision_skipped(bigint, text)`: marks an archived `inbox-decision/1` row filed with
    `{"skipped": true, "why": ...}` and no path, once. Such a row is never listed by either read.
  * All four are the service role's alone, invoker rights, as 182's are (`182:109-123`, `:132-144`).
  * **Test item 3782** is marked by this migration with one guarded call of `inbox_decision_skipped`.
    No note is written for it and no day-file entry. On a database without that row the call does
    nothing.
* `scripts/inbox-decisions-export.mjs`:
  * `--notes-only`: for each unfiled row, the note, the ingest (best effort, as today), then the mark
    with the note path alone. It writes no day file and refuses `--log-dir`.
  * The default mode stays what a session and the manual step use: unfiled rows in full, then the
    unlogged rows: the day-file entry (the renderer already skips an item the file holds,
    `scripts/lib/inbox-decision-render.mjs:185-187`) and `inbox_decision_logged`.
  * **In both modes** the decision of a test question of an acceptance run (below) is marked skipped
    and gets no note and no day-file entry. A row is a test question only when all three hold: its
    ref starts `accept/`, its entity is `agent_request` and its course is null. The read returns all
    three (`182:56-60`). A ref alone proves nothing: the worker's role may raise a question under any
    ref (`db/migrations/181_inbox_apply_runner_role.sql:597-600`). The rule must hold in the default
    mode too, because the manual step runs that mode (`scripts/inbox-decisions-pr.mjs:127`) and its
    day file is public.
* `scripts/inbox-decisions-pr.mjs` does what it does today and is the manual step. Its header comment
  (`:15-16`) is corrected: no scheduled task calls it.

**The schedule.**

| | |
|---|---|
| Mechanism | A Windows scheduled task on the laptop, registered by a script of the same shape as `desktop/launch/register-logon-task.ps1:1-22` |
| Why this one | It is what Phase 23's approved plan named (a scheduled task on the host; `STATUS.md:1433`). The exporter needs the vault folder, the harness checkout's resolver and the service-key file together, and only the host has all three (`scripts/inbox-decisions-export.mjs:10-14`, `:113-131`). The harness-jobs container has the vault and a scheduler with two fixed jobs (agentic-harness `compose.yaml:38-71`, `hooks/lib/schedule.mjs:26-36`), but it holds the realm's push token and lives in a third repository; the bb2dash service key does not belong beside that token. A new compose service would be a new mechanism |
| Task | `Bb2dash-Exports`, two triggers: at logon plus 5 minutes, and every 6 hours. Hidden, below-normal priority, a 15-minute limit, started when a missed time comes round, allowed on battery, never two at once |
| Registration | `scripts/register-exports.ps1 -SecretsDir <folder> -HarnessDir <folder>`. Both are required and neither has a default (none works here, see "Today"). The script checks that each folder exists, and that the harness one holds `hooks/resolve-config.mjs`, before it registers anything. It opens no file in the secrets folder. It writes the two paths into the task's action, as `desktop/launch/register-logon-task.ps1:41-52` takes its own paths as parameters. `.env` is not read: it is his file |
| What runs | `node scripts/exports-run.mjs --secrets-dir <folder> --harness-dir <folder>` from the bb2dash checkout. The runner hands the two folders to the exporter as `SECRETS_DIR` and `HARNESS_DIR` and runs it with `--notes-only` |
| It may | read the unfiled rows as the service role (the key is read from its file at run time and never printed); write note files under the vault's `projects/bb2dash/decisions/`; run the harness ingest for those notes; mark each row; write its own state file and log |
| It may not | start `git` or `gh`, so it touches no repository (no fetch, no worktree, no commit, no push) and opens no pull request; write a day file; write anything under a bb2dash checkout; call any database function but the filing ones; start Docker. This is held by a test, not by prose: the runner's test asserts the full list of commands the runner may start (the exporter, and nothing else), and the exporter's `--notes-only` test asserts its own full list (the harness resolver and the ingest) |
| Guard | the runner stops with exit 2, filing nothing, when the checkout it runs from is not on `main`. It reads `.git/HEAD` as a file and wants `ref: refs/heads/main`. A `.git` that is itself a file (a worktree) is exit 2. It starts no `git` for this |
| State | `~/.bb2dash-exports/state.json` and a log that rolls, both outside every repository. The file is written at the end of every run, exit 2 included. Its keys are fixed here, because one worker writes the file and another reads it from a different repository: `schema` (1), `started_at`, `ended_at` (ISO times), `exit_code` (0, 1 or 2), `reason` (null, or one of `not_main`, `config`, `error`), and `exporters`, an object with one key today, `inbox-decisions`, holding `exit_code`, `filed`, `skipped` and `not_filed` (counts). No path, no text of a decision and no error message is stored |
| A failure is seen | **only on the doctor.** bb2dash-stack's new `exports` row is a problem when there is no state file, the last run ended non-zero, a decision was not filed, or the last run is older than 36 hours (the limit the harness jobs already use, `doctor/lib/constants.mjs:34-35`). Nothing raises an Inbox item, a toast or a message. A schedule that fails shows when someone runs `just doctor`, and not before. The log and the task's last result are there for whoever looks after that |

Phase 24's first draft (4bf223e) proposed the same task and script for two exporters. Brief 24a has
left the exporter out since 10f48f1 and still does at 7fe7030 (its lines 1842, 2056 and 2070). So
this phase owns the task, the runner and the registration script alone (see Seams).

Where the notes go: the vault's `projects` realm, whose remote is private (checked today). The
harness's nightly job ingests the vault again and syncs the realm (agentic-harness
`scripts/nightly-ingest.sh:134`, `:156-162`). The day files go to a public repository, which is why
they stay his step.

**The manual step.** A tenth `just` verb in bb2dash-stack, `file-decisions`, runs
`scripts/inbox-decisions-pr.mjs` from the bb2dash checkout with the two folders from `.env`, which
`just` loads by itself (bb2dash-stack `justfile:13-14`). The name is the Phase 23 plan's. He runs it
when he wants the day files and their pull request (open item O-4). Not checked: whether his `.env`
sets `HARNESS_DIR`. If it does not, the verb stops with the exporter's own message
(`scripts/inbox-decisions-export.mjs:82`) and files nothing.

**After the first scheduled run** the 16 real decisions that wait today have notes (17 less item
3782), with any archived since, and `inbox_decisions_unlogged` lists them until he runs the manual
step.

**Objects and files.** 187 section 2; `scripts/inbox-decisions-export.mjs` and its test;
`scripts/inbox-decisions-pr.mjs` (comment) and its test; new `scripts/exports-run.mjs`, its test, and
`scripts/register-exports.ps1`; `skills/inbox-apply/SKILL.md` step 5 (lines 156-171: what the
scheduled run files, what the manual step is, and no more "the host runs the same script on a
schedule"), which W-81 rewrites with the rest of the skill text (task 9); bb2dash-stack:
`doctor/lib/*`, `justfile`, `README.md`. The standing
unit `db/tests/phase23_182_inbox_decision_filing.sql` is not edited: its five refusals (lines 134-141:
null, an array, no note path, a blank log path, a numeric path) all still hold under the new rule.

**Proof.** The unit `db/tests/phase23_187_decision_filing.sql`: a mark with no log path is accepted
and the row is then listed as unlogged; `inbox_decision_logged` stamps once and the row leaves the
list; a skipped row is on neither list; a blank log path is still refused; `inbox_apply_runner` and
`authenticated` can execute none of the four. `node --test scripts/inbox-decisions-export.test.mjs`:
`--notes-only` writes under the notes folder only, starts the resolver and the ingest and no other
command, and marks without a log path; a later default run writes the entry and stamps the log once;
a test question (an `accept/` ref, entity `agent_request`, no course) is skipped in both modes and no
file is written; a row with an `accept/` ref and a course is filed like any other; `--notes-only`
with `--log-dir` exits 2. `node --test scripts/exports-run.test.mjs`: the state file is written with
exactly the keys above on success, on a failure, on a thrown error and on exit 2; a `.git/HEAD` that
is not `main`'s exits 2, and so does a `.git` that is a file; the list of commands the runner starts
is the exporter alone, with no `git` and no `gh`. The registration script is PowerShell and has no
unit: at the cut-over the PM first runs it with a folder that does not exist, and it must exit
non-zero and register nothing. After the cut-over, one read: 0 unfiled, at least 16 rows with a note
path, 3782 skipped.

### Item 4: teach `just up` about apply

**Today.**

* `just up` is `docker compose up -d --build` (bb2dash-stack `justfile:17-18`). `apply` sits behind
  `profiles: [apply]` (bb2dash `compose.yaml:102-103`), so compose builds and starts it only when
  `COMPOSE_PROFILES` names it.
* bb2dash-stack's `.env` holds `COMPOSE_PROFILES=workspace` since the Phase 21 acceptance run added
  that line (DECISIONS 2026-10-08, the "Phase 21 accepted" row), and `apply` was started at the
  cut-over with the profile named on the command (`STATUS.md:1335-1337`). Not checked: the file
  itself. It is his and was not opened.
* `.env.example` already tells him the line (`.env.example:61-65`), and so does the README
  (`README.md:341-351`).
* The doctor has no row for the service. `diagnose` lists the Workspace's row and none for apply
  (`doctor/lib/diagnose.mjs:36-49`); `APPLY_PROFILE` is used for the ports check only
  (`doctor/lib/constants.mjs:76-83`). bb2dash-stack's compose file lists neither the service, its
  volume nor its network in its header (bb2dash-stack `compose.yaml:11-23`).

**The change.**

* **His one line.** In bb2dash-stack's `.env`, `COMPOSE_PROFILES=workspace` becomes
  `COMPOSE_PROFILES=workspace,apply`. Nobody else edits the file. The acceptance run's profile helper
  never changes a line that is already there (`scripts/lib/accept-profile.mjs:7-10`), so the run
  cannot do it for him either.
* **The doctor's `apply` row.** The Workspace's row function (`doctor/lib/checks-docker.mjs:240-250`)
  becomes one function for a service behind a profile, and both rows use it. For apply: profile on,
  the row is a problem unless the container is running and healthy and `inbox_apply_db_url` is
  non-empty. Profile off and no container: `off`, no problem. **Profile off and a container of the
  service exists: a problem**, with the line to add in its text. That last case is the laptop today.
  The Workspace's row keeps its present behaviour, and `doctor/workspace.test.mjs` is not edited.
* `just up` itself does not change. With the line it builds and starts `apply` with the rest. The
  rule of 2026-10-07 stands: `apply` is started, restarted and rebuilt alone, and `just up` is never
  run while a sync is open.
* The README's "Apply" section, `.env.example` and the compose header are brought level.

**Objects and files.** bb2dash-stack only: `doctor/lib/checks-docker.mjs`, `constants.mjs`,
`diagnose.mjs`, new `doctor/apply.test.mjs`, `compose.yaml` (comment), `README.md`, `.env.example`.

**Proof.** `node --test doctor/` passes with the new file's four cases, and
`git diff --stat origin/main...HEAD -- doctor/workspace.test.mjs` prints nothing. After his line:
`docker compose config --services` from bb2dash-stack lists `apply` (it reads files and starts
nothing), and `just doctor` shows the row `running, healthy`. The acceptance run reads the same row.

## The acceptance pack for Phase 23

The pack is `acceptance/23/` (`manifest.json`, `playbook.md`, `proofs.json`) and
`web/e2e/accept23.spec.ts`, in the form `acceptance/README.md:64-104` fixes. The script it walks is the
Phase 23 plan's seven steps, with two more for these follow-ups.

**Test questions.** The run cannot answer Stack's own Inbox questions for him. So step 1 raises four
questions of its own through the owner's session, by a new function. Its contract is fixed here,
because one worker writes it (W-80) and another calls it (W-84).

* `inbox_accept_question(p_run text, p_label text)` returns the new item's id. It is SECURITY DEFINER
  and executable by `authenticated` alone. **Its first act is the owner check:** it refuses unless
  `auth.uid()` is `app_owner()`. Row level security does not apply inside a definer function, so
  without that line any signed-in account could raise Inbox rows. The owner policies write the same
  check out, one per policy (`db/migrations/140_workspace_tables.sql:203-212`).
* `p_run` is a run tag and must match `^[a-z0-9]{6,24}$`. `p_label` says which question it is and
  must match `^[a-z][a-z0-9-]{0,15}$`. Anything else is refused. The pack uses four labels:
  `confirm`, `dismiss`, `note` and `offline`. The browser test makes the tag once, in step 1. No
  later step needs it: a test finds its card by the label, and the host's proofs take the item ids.
* The row: kind `stack_must_confirm` (**amended by Round 1 at the end of this brief: the labels
  `dismiss` and `offline` raise kind `data_gap`**), entity `agent_request`, no course, ref `accept/<run>/<label>`.
  Its text is the function's own fixed sentence with the label in it, so a browser test tells the
  four cards apart by a word the function wrote. No argument is free text.
* **It cleans up first.** Before it raises, it archives every row of this shape that carries another
  run tag and is not archived yet, open or answered. It uses the `closed_itself` record that 114
  gave a question nobody settled (`db/migrations/114_gap_self_close.sql:98`; `186:113-116` writes the
  same shape). So a run that stopped after step 1 leaves the next run no open test card in his Inbox
  and no answered test row in the queue. A row archived this way carries no `inbox-decision/1`
  record, so the exporter never lists it.
* At most eight rows of the shape may be open at once, and the ninth is refused. With the clean-up
  this is a second lock.

A question of that shape names no course row: confirmed or dismissed with no note, the worker records
it without starting Claude (`apply/src/batch.ts:162-170`); with a note it goes to Claude. The four
stay in the Archived tab afterwards as the run's record, and the exporter marks their decisions
skipped in both of its modes (Item 3). The shape narrows; it does not prove where a row came from,
because the worker's role may raise any ref through `raise_attention` (`181:597-600`). No real
question has the shape today. The notices are the only other rows with entity `agent_request`, and
none of their refs starts `accept/` (`db/migrations/091_sync_runner_role.sql:268`, `:376`;
`136_transform_tick_register_first.sql:162`, `:179`; `186:87-88`).

**The steps.**

| id | kind | stage | what it does | host proof |
|---|---|---|---|---|
| 0 | host | `ready` | Nothing is open: no sync and no Inbox apply request waits or runs, no answer of Stack's waits, held or not, and no `sync-login-required` item is open (the Blackboard login is alive). A held answer counts because steps 6 and 7a press `Apply answers`, and a press tries held answers (O-1). A test question an earlier run left does not count: step 1 closes it. Otherwise the run is blocked, before anything is raised | `apply-quiet` |
| 8 | host | `ready` | The doctor's `apply` row reads `running, healthy` with the profile on, and the `exports` row is green | actions `apply.doctorRow`, `exports.doctorRow` |
| 1 | auto | `walk` | Raises the four test questions (the function first closes any that an earlier run left); in the Inbox confirms the first and dismisses the second | `questions-raised` |
| 2 | auto | `walk` | Presses Sync in the top bar; the sync container takes the request | `sync-taken` |
| 3 | auto | `walk` | Watches the Inbox until the request the sync filed has closed: a result line beside `Apply answers`, and nothing was pasted. The playbook names one second run when the sync was still running after nine minutes | `recorded-after-sync` |
| 4 | auto | `walk` | Both questions are under Archived and gone from Answered, not applied | `nothing-written` |
| 6 | auto | `walk` | Confirms the third question with a note and presses `Apply answers`: the request runs by itself, through one Claude run, and closes done | `applied-from-button` |
| 9 | host | `walk-proofs` | After this run's fold: no session answer whose pick is on its file lacks the stamp, and no `supersede/` question is open beside an archived answer for the same file and candidates. The proof returns the counts it judged. A count of zero is written "not exercised" in the record, never "passed" | `transform-answers` |
| 9-supersede | waived | none | The supersede half of step 9. No `supersede/` item exists on prod (`STATUS.md:1405-1407`), so the live check passes on zero rows and says nothing about 188's first function | stands on `db/tests/phase23_188_archived_answers.sql` |
| 7a | auto | `offline` | With `apply` stopped by the host: dismisses the fourth question and presses `Apply answers`; after the 75 s grace the button reads `waiting on the worker…` and a second press shows the paste command | `request-waiting` |
| 7b | auto | `back` | With `apply` started again: the waiting request is taken and closes | `request-taken-after` (at least 75 s) |
| 5 | host | `file` | The scheduled export is started now and ends with exit 0; the run's four test decisions are marked skipped with no note; no decision is left unfiled; 3782 is skipped | action `exports.runNow`; `test-decisions-skipped`, `decisions-filed` |
| 1-real | human | none | One answer of his own that needs a change is applied after a sync, and the row reads right in the app | his |
| 5-note | human | none | One decision note in the vault reads right to him | his |
| 5-log | human | none | The day files and their pull request: `just file-decisions`, when he chooses | his |
| 10-held | waived | none | Item 1. A held answer cannot be staged on the live site without making a real run fail. It stands on the unit and the worker's tests (110a) | stands on `db/tests/phase23_187_held_answers.sql` |

Step ids fit the manifest's pattern, `^[0-9]{1,2}[a-z]?(-[a-z0-9]+)?$`
(`acceptance/manifest.schema.json:29-33`). A bare word such as `held` does not, and
`acceptance.test.mjs` would fail on it.

The stages in order: `prepare`, `ready` (host), `walk` (sandbox), `walk-proofs` (host), `stop` (host:
the proof `apply-idle`, then `apply.stop`), `offline` (sandbox), `start` (host: `apply.startNoBuild`),
`back` (sandbox), `file` (host).

**The stop is checked first.** On a stop the worker kills the CLI and closes its request failed
(`compose.yaml:114-115`), and a failed close raises a notice in his Inbox (`186:85-96`). Step 6's close
can also file a follow-up when another answer of his arrived meanwhile (`186:123-131`). So the first
action of stage `stop` is the proof `apply-idle`: no `inbox_feedback` request is queued or claimed.
If one is, the run is blocked and `apply.stop` does not run.

**Time limits.** The browser tests' shared limit is 90 s a test (`web/e2e/accept.config.ts:50`). Steps
3, 6 and 7a need more: a watch of nine minutes, a Claude run that may take up to 14
(`apply/src/config.ts:30`), and a 75 s grace with a second press. `accept23.spec.ts` sets its own
limit on each of those tests. The shared config is not edited: pack 21 runs under it.

**What each proof reads.** Every proof that takes an id from the sandbox also takes
`carry:run.started_at` and holds the row to this run (`acceptance/README.md:190-196`).

* `apply-quiet`: counts of open requests, of queue rows that are not test questions, and of open
  `sync-login-required` items; blocked when any is above 0. It also returns how many of the waiting
  rows are held, read from `inbox_apply_held_items()` as the test login, so the record says why the
  run was blocked.
* `apply-idle`: the count of `inbox_feedback` requests that are queued or claimed; blocked when it
  is above 0. Stage `stop` reads it before it stops the service.
* `questions-raised`: the four rows exist, were raised in this run, carry `accept/` refs, and the
  first two are answered as the step says.
* `sync-taken`: the request is a sync of this run, claimed by `sync-runner`; blocked when it closed
  `login_required`.
* `recorded-after-sync`: that sync is done; one apply request names it, was filed by the sync, was
  taken by the worker and is done; both questions are archived by that request, one in bucket
  `recorded_elsewhere` and one in `dismissed`. Blocked, not failed, when the request's error code is
  `daily_cap` or `usage_limit`.
* `nothing-written`: the write log holds no row for the two questions.
* `applied-from-button`: the third question is archived by a later request of this run that was filed
  from the button, started Claude and closed done; the write log holds no row for it. Blocked, not
  failed, when the request's error code is `daily_cap` or `usage_limit`: the worker starts at most
  12 runs a New York day (`apply/src/config.ts:34`) and closes a capped request with that code
  (`apply/src/report.ts:83`, `:116`).
* `request-waiting` and `request-taken-after`: the Phase 21 pair for a stopped service
  (`acceptance/21/proofs.json:37-55`), on `agent_requests`.
* `test-decisions-skipped`, `decisions-filed`: counts over `attention_items`.
* `transform-answers`: counts over `attention_items` and `bb_files`, and the counts are in its
  detail: how many session answers have their pick on the file, how many of those lack the stamp,
  how many were stamped since the run started, and how many `supersede/` items it looked at. It
  fails when a stamp is missing or a re-asked question is found. It passes on zero rows, which is
  why the record must say which counts were zero.

**One view for the proofs.** A proof may not name `params` or `result`
(`scripts/lib/accept-proofs-lint.mjs:100-104`, `scripts/lib/accept-proofs-shapes.mjs:34`), and who
filed a request and whether it started Claude are held there. So 187 adds the view
`v_inbox_apply_runs`: one row per `inbox_feedback` request with typed columns only (`id`, `state`,
`filed_by`, `after_request`, `claimed_by`, the three times, `claude_started`, `error_code`,
`archived_count`, `skip_ids`). `skip_ids` is what the request's own close listed. The view does not
read `inbox_apply_holds`, so no login needs a grant on that table to read the view. The lint is not
loosened. The proofs run as the test login (`scripts/accept-proofs.mjs:15`).

**New host actions** (bb2dash-stack `scripts/lib/accept-actions.mjs:290-311`, repeated in bb2dash
`acceptance/manifest.schema.json:57-67`): `apply.doctorRow`, `apply.stop`, `apply.startNoBuild`,
`exports.doctorRow`, `exports.runNow`. The three `apply` actions name that one service. No action
names the `sync` container: the run reaches a sync only through the app's own Sync button, and reads a
dead Blackboard login from the database. `exports.runNow` starts the registered task and waits, at
most five minutes, for the state file's end time to move. **On Windows it fails when the task
`Bb2dash-Exports` is not registered.** It does not fall back to running the runner itself there: the
doctor's row reads only the state file, so with a fallback a green run would not show that anything
is scheduled. On another system, where no task can exist, it runs the runner itself.

**What a green run means.** Every `auto` step has the operator's `pass`, a passed browser test, its
evidence files and its host proofs, and every `host` step passed. From `main` it counts as the
acceptance of Phase 23 (ORCHESTRATOR section 3 step 9): the PM writes the `**Phase 23 accepted` row
and merges that docs-only PR without asking again. It does not cover the three `human` rows and the
two waived rows, and the record names them.

**What a green run does not prove, and the accepted record must say so.**

* Item 1 (held answers) is not exercised live. It rests on `db/tests/phase23_187_held_answers.sql`
  and the worker's tests (row `10-held`).
* The supersede half of item 2 is not exercised live. It rests on
  `db/tests/phase23_188_archived_answers.sql` (row `9-supersede`).
* The session-stamp half of item 2 is exercised only as far as step 9's counts show. The backfill
  stamps the known answers before the run, so "stamped since the run started" may be zero. The
  record copies the counts and writes "not exercised" beside each zero.
* That the schedule fires by itself. Step 5 shows that the task is registered and that one run
  started by hand ends well.

**What a run costs and leaves.** Three operator sessions and one apply run on his plan; one real
Blackboard sync (open item O-3); four archived test questions; no row written to any course table.

**Blocked, not red:** the plan's limit; the worker's own daily cap of 12 runs; a dead Blackboard
login; a sync, an apply request or any answer of his, held or not, waiting at the start; an apply
request queued or claimed when stage `stop` begins; a sync still running after the second watch.

**What rests on the sandbox alone:** what the page showed (the status line, the button's label, the
paste command). The host proves what happened in the database.

## Database objects

| migration | objects | applied |
|---|---|---|
| `187_inbox_apply_followups.sql` | Section 1: new table `inbox_apply_holds` (`item_id`, `request_id`, `resolved_at`, `held_at`; row level security on, no policy, every privilege revoked from `public`, `anon`, `authenticated` and `service_role`); new `inbox_apply_held_items()` (SECURITY DEFINER, stable, executable by the service role and the test login only); re-created `inbox_apply_prepare(bigint)` (185's body plus `held`, empty for a request with no `trigger`), `sync_request_inbox_apply(bigint)` (180's body, the held test; same name, argument and return), `inbox_apply_close(bigint, text, jsonb)` (186's body, the holds written from `skip` and `skip_seen`, the held test, one sentence). Section 2: re-created `inbox_decision_filed(bigint, jsonb)`; new `inbox_decisions_unlogged(integer)`, `inbox_decision_logged(bigint, text)`, `inbox_decision_skipped(bigint, text)`; the mark on item 3782. Section 3: view `v_inbox_apply_runs` (security invoker, `anon` revoked); `inbox_accept_question(text, text)`, SECURITY DEFINER, for `authenticated` only, refuses unless `auth.uid()` is `app_owner()`, both arguments held to a pattern, closes an earlier run's unarchived test rows, at most eight open at once. A guard block that reads back the privileges on the table and on each function | after the database branch's own review (task 4), on Stack's word, with no sync and no apply request open (task 5). The running worker ignores `held` and sends no `skip_seen` until it is rebuilt, so no hold is written before the cut-over |
| `188_transform_archived_answers.sql` | re-created `supersede_replaced_files(uuid, bigint)` and `link_file_sessions(bigint)`; the backfill of `applied_at`; a guard block | at the cut-over, after `apply` is rebuilt. Reviewed in task 4 and again with the PRs in task 18, so it is never applied unreviewed |
| 189 | held for the review round | |

Additive in effect: no drop, no rename, no grant taken from a role that holds it. One new table, which
no login can write: only `inbox_apply_close` does, with its owner's rights. 180 to 186 are not edited.
`sync_runner` still executes fourteen functions and `inbox_apply_runner` gains none. Not checked: the
default privileges prod gives a new table in `public` (no database read). 187 revokes by name and its
guard reads the result, so the file does not rest on them.

**Why 187 is reviewed before it goes on.** 187 replaces three SECURITY DEFINER functions of two
runner roles, adds one that the app's own login can call, and adds the table that decides what the
worker runs. The first draft applied it during the build and reviewed it only at the PRs. A finding
would then have met a frozen file, with one spare number (189) and Phase 24a's block straight after
it. So the database worker's branch gets `/code-review` and `/security-review` first (task 4), and
187 is applied after that.

## Files by owner

* **W-80, database:** `db/migrations/187_*.sql`, `188_*.sql`; `db/tests/phase23_187_held_answers.sql`,
  `phase23_187_decision_filing.sql`, `phase23_187_accept_objects.sql`, `phase23_188_archived_answers.sql`;
  `DATA_SYNTAX.md`. A standing unit is edited only where it pins a sentence or a rule that 187
  changes, and each such edit is named in 110a (none is expected: the planner read `phase23_182`'s
  refusals and the two source pins, not every case of every unit).
* **W-81, the worker and the skills:** `apply/src/batch.ts`, `report.ts`, `loop.ts`; `apply/test/*`;
  `skills/inbox-apply/SKILL.md` (the held answer, the two transform paragraphs, and step 5 at lines
  156-171), `writer.md`; `skills/bb-sync/SKILL.md` (step 5b).
* **W-82, the exporter and its schedule:** `scripts/inbox-decisions-export.mjs`,
  `scripts/inbox-decisions-pr.mjs`, their tests; new `scripts/exports-run.mjs`,
  `scripts/exports-run.test.mjs`, `scripts/register-exports.ps1`.
* **W-83, bb2dash-stack:** `doctor/`, `justfile`, `README.md`, `.env.example`, `compose.yaml`
  (comments), `scripts/lib/accept-actions.mjs` and the files beside it that track a service. Phase
  24a's W-85 edits several of these too (see Seams).
* **W-84, the pack:** `acceptance/23/` (three files), `web/e2e/accept23.spec.ts`,
  `acceptance/manifest.schema.json` (the action list), `acceptance/pack-check.mjs` and
  `acceptance/OPERATOR.md` only where they name the Workspace alone (`pack-check.mjs:47`), a case per
  new proof in `scripts/accept-proofs-db.test.mjs`, and `scripts/accept-proofs-kit.mjs`. The kit
  loads pack 21 by name (its line 9) and knows a table's columns from `create table` blocks only (its
  lines 24-29), so it cannot hold a proof to the columns of the view `v_inbox_apply_runs` as it
  stands. W-84 adds pack 23 beside pack 21 and teaches `columnsOf` the view. Pack 21's cases are not
  changed.
* **PM:** `web/src/lib/supabase/database.types.ts` (regenerated at integration), `project-state/`,
  root `CLAUDE.md`, 110a, both PRs, the reviews, every prod apply and every rolled-back dry run, the
  cut-over.
* **Nobody:** `db/migrations/180` to `186`; `sync/src`; `web/src` but for the generated types;
  `web/test`; `web/e2e/accept.config.ts` and `web/e2e/accept.lib.ts` (pack 21 runs on both);
  `workspace/`; `mcp-server/`; `desktop/`; `docker/apply/` (this phase changes none of the image's
  files and rebuilds the image; Phase 24a edits three of them and adds a fourth, see Seams);
  bb2dash-stack's `.env`, `machine.env` and anything under a secrets folder.

## Seams

**Read again at the freeze, 2026-10-08, read-only, each row found by its words.** Brief 109 and brief
111 on `feat/workspace-24` at e365153; brief 103 on `feat/styling-22` at 8b92ac6. No rule in the
table changed. Where a row says "its line", the line at the head read at the freeze is:

| the row cites | at the older commit | at the head read at the freeze |
|---|---|---|
| brief 109, its workers and its migration numbers | 6, 8-9 | 6, 8-9 (190 to 198 written, 199 slack) |
| brief 109, W-76's part of `DATA_SYNTAX.md` | 1309-1310 | 1458-1459 |
| brief 109, W-77's `workspace/` files | 1312-1322 | 1461-1471 |
| brief 109, W-78's `mcp-server/` files | 1323-1326 | 1472-1475 |
| brief 109, W-79's four `docker/apply/` files | 1331-1333 | 1480-1482 (the same line now names `docker/grep-clean.test.mjs` as W-79's too; this phase runs that test and does not edit it) |
| brief 109, W-79's three `sync/src` files | 1335-1336 | 1484-1485 |
| brief 109, W-85's bb2dash-stack files | 1337-1343 | 1486-1492 |
| brief 109, the PM's `acceptance/manifest.schema.json` | 1344-1346 | 1493-1496 |
| brief 109, the secrets helper's allow-list | 1348-1350 | 1496-1499 |
| brief 109, the owner list as a whole | 1305-1357 | 1456-1506 |
| brief 109, its row on this phase ("The follow-ups merge first") | 1823 | 2181 |
| brief 109, pack 21 is never removed | 1825 | 2183 |
| brief 109, `sync` rebuilt once, at its cut-over | 1828 | 2186 |
| brief 109, its bb2dash-stack row (this phase's PR there merges first) | 1829 | 2187 |
| brief 109, the exporter is not in 24a | 1842, 2056, 2070 | 2200, 2439, 2453 |
| brief 111, its gate, workers and "no migration" | 5, 6, 8 | 5, 6-7, 8-9 |
| brief 111, the `web/e2e` and `acceptance/README.md` lines it edits | 307-311, 333-346 | 317-319, 344-358 |
| brief 111, its row on this phase (edits neither `pack-check.mjs` nor `OPERATOR.md`) | 467 | 476 |
| brief 103, the files by owner | 744-773 | 1483-1532 |
| brief 103, a sync or an Inbox apply inside a walk window is "blocked" | 1065 | 2026-2029 |

| with | seam | rule here |
|---|---|---|
| **Phase 24a** (brief 109 on `feat/workspace-24` at 7fe7030, read again at the freeze at e365153; W-76 to W-79 and W-85; "ready to freeze", so it may still move, and the PM reads these rows once more before the PRs open). Every "its line" in these rows is a line of that brief at 7fe7030; the table above gives the line at e365153 | **The apply image.** Its bundle copies `apply/src` and `workspace/src` (`docker/apply/Dockerfile:39`) and the skill folder (`:108`). 24a changes `workspace/` (its W-77, lines 1312-1322) and `mcp-server/` (its W-78, lines 1323-1326), which the image copies, and four files under `docker/apply/`: `fork-firewall.mjs`, the generated `init-firewall.sh`, `image.test.mjs` and a new `gate-built.test.mjs` (its W-79, lines 1331-1333). This phase changes `apply/src` and the skill, and no file under `docker/apply/` | **This phase merges first.** 24a's own row says the same (its line 1823). 24a then merges `origin/main` and re-does its list: `node docker/apply/fork-firewall.mjs --write` and `--check`; `cd apply && npm run typecheck && npm run build && npx vitest run`; `node --test docker/apply/image.test.mjs docker/apply/gate-built.test.mjs`; the apply image build; the types file. If 24a merges first, this branch merges `main` and re-does the same list before its PR; 24a's row names the first step: `--write`, then `git diff --exit-code docker/apply`, which must print nothing (this brief's own `docker/` gate). Either way `apply` is rebuilt alone at the second cut-over, with no apply request open |
| Phase 24a | **Migration numbers.** This phase: 187, 188, with 189 held. 24a: 190 to 199 (its lines 8-9; 190 to 198 are written there since its review round of 2026-10-08, and 199 is slack). 24b: none (brief 111, line 8) | no overlap. Neither re-creates a function of the other's. No number is borrowed (see "What a review finding costs") |
| Phase 24a | **The scheduled task.** The first draft (4bf223e) registered `Bb2dash-Exports` for two exporters. Brief 24a left the exporter out: "Scheduling the Inbox exporter (Phase 23's open item, untouched)" (its line 1842; also 2056 and 2070) | this phase owns `scripts/register-exports.ps1`, `scripts/exports-run.mjs` and the task alone. The runner's list holds one exporter, and nothing in Phase 24 adds to it |
| Phase 24a | **bb2dash-stack.** 24a's W-85 edits `compose.yaml`, a new empty file `secrets.example/workspace_ingest_db_url`, `doctor/lib/constants.mjs`, `doctor/doctor.mjs`, the doctor tests, `README.md`, `.env.example`, and `scripts/lib/accept-actions.mjs` with its test (its lines 1337-1343). The secrets helper's allow-list is no longer that worker's: it is 24a's PM's, outside every repository (its lines 1348-1350). This phase's W-83 edits `doctor/lib/*`, a new doctor test, `justfile`, `README.md`, `.env.example`, `compose.yaml` (comments) and `scripts/lib/accept-actions.mjs` | each phase adds, and removes nothing of the other's. The second to merge merges bb2dash-stack's `origin/main`, keeps both sets of doctor rows, README sections, `.env.example` lines and host actions, and runs `node --test doctor/ scripts/` again. 24a's own row has this phase's PR there merge first, and W-85 then merges that `main` (its line 1829) |
| Phase 24a and 24b | **Shared files in bb2dash:** `acceptance/manifest.schema.json` (the action list; the PM's file in 24a, its lines 1344-1346), `DATA_SYNTAX.md` (this phase adds the hold table; 24a's W-76 has the Workspace section and one pointer line, its lines 1309-1310) and the generated types. 24a's own row names the same three, and with them `acceptance/pack-check.mjs` and `acceptance/OPERATOR.md`, which this phase edits only where they name the Workspace alone and which no 24a owner lists (its line 1823, and its lines 1305-1357). Pack 21 is no longer retired: 24a edits none of it, and 24b stops running it and keeps its files in the tree (brief 109, line 1825; brief 111, lines 335-342). `scripts/accept-proofs-kit.mjs` loads pack 21 by name (the kit's line 9) | each phase adds its action names and its own part of `DATA_SYNTAX.md`; the second to merge keeps both sets and regenerates the types. W-84 adds pack 23 to the kit beside pack 21 and keeps pack 23's cases free of pack 21's data, so nothing 24b does to pack 21 touches pack 23's |
| Phase 24a | **Who merges first** | this phase: it is small, waits for nothing and fixes a live service. Order of merging: bb2dash `fix/phase23-followups`, then bb2dash-stack's, then 24a merges `origin/main` in both repositories. 24b is cut only after Phase 22 and 24a are on `main` (brief 111, line 5) |
| Phase 24a | **The sync.** 24a's W-79 changes `sync/src/files.ts`, `report.ts` and `loop.ts` (its lines 1335-1336) and rebuilds `sync` once, at its own cut-over (its line 1828). `loop.ts` is the caller of a function 187 re-creates (`sync/src/loop.ts:93`, `:102-107`, through `sync/src/db.ts:191-193`) | this phase changes nothing under `sync/src` and rebuilds nothing but `apply`. 187 keeps the name, the argument and the return of `sync_request_inbox_apply(bigint)`: an id, or null when nothing was filed. Null becomes more frequent, because held answers alone file nothing. 24a's `loop.ts` must go on reading null as "nothing to apply", as `main`'s does |
| **Phase 24b** (brief 111 at 7fe7030, read again at the freeze at e365153; W-86 to W-88; not cut) | the page's files under `web/`, and beside them one `compose.yaml` value, one line of `acceptance/README.md`, pack 24, and the lines of `web/e2e/accept.lib.ts`, `walk21.lib.ts` and `walk21.window.ts` that read two changed attributes (its lines 307-311 and 333-346). Cut after Phase 22 and 24a are on `main` (its line 5) | no file is edited by both phases: 24b's own row says it edits neither `acceptance/pack-check.mjs` nor `OPERATOR.md` (its line 467), and `web/e2e/accept.lib.ts` is in this phase's "Nobody" list. One reading seam: `accept23.spec.ts` runs on `accept.lib.ts`, which 24b edits. 24b's row gives its side: if pack 23 reads a Workspace string 24b removes, the pack check says so at 24b's integration and its PM keeps the string or edits the sentence (its line 467). Its workers are W-86 to W-88, above this phase's W-80 to W-84 |
| **Phase 22 (executing)** | Checked: `git diff --stat main...<branch>` for `feat/styling-22`, `-foundation` and `-walkbox` shows docs, `web/test/token-audit.*`, `web/test/walk22-lib.test.ts`, `web/e2e/walk22.lib.ts`, `scripts/walk-box*`, `scripts/lib/walk-box-*` and `docker/walk/`. Its brief plans styles and components under `web/src`, two new specs under `web/e2e`, and one desktop file (brief 103 on `feat/styling-22`, lines 744-773). **Read again at the freeze** at 8b92ac6 (`-foundation` at c528e94, `-walkbox` at 9a1b862): the same paths, and with them `design-system/bb2dash/` and one line of `scripts/package.json` | **One file seam, found at the freeze: the test line of `scripts/package.json`.** Phase 22's walk box adds its test name there and this phase's W-82 adds `exports-run.test.mjs`; the second to merge keeps both names (the parallel sessions' rule file, "Session 2 only"). **One test seam, Phase 22's to carry:** its `web/test/walk22-lib.test.ts` fails on a browser spec it does not know, and `web/e2e/accept23.spec.ts` is new. That test is not on `main`. If this phase merges first, Phase 22 adds the spec to its list in its own merge of `main`. If Phase 22 merges first, this branch's merge of `main` brings the test with it, and the PM stops and puts the one-line edit to Stack, because `web/test` is in this phase's "Nobody" list. Beyond those two, this phase touches none of those paths; under `web/` it adds one new spec and regenerates the types. One reading seam: W-69 restyles the Inbox that `accept23.spec.ts` reads, so the spec finds things by role and visible text, and the PM re-runs `just accept 23 --check` after Phase 22 merges. An acceptance run of this phase is not started inside a Phase 22 walk window: that walk treats a sync or an Inbox apply inside its window as blocked (brief 103, line 1065) |
| The live `apply` | One worker on the queue at a time: two containers on the role's login fail each other's run (DECISIONS 2026-10-07, review round 1, on 184) | the test project `bb2dash-wt23f` is built and its image tests run. No container of it is started against the queue. The new image's first live run is at the cut-over |
| The `sync` container | it holds the Blackboard login | not rebuilt, not restarted. `sync_request_inbox_apply` changes in SQL only. Every `apply` command names the one service and runs with no sync open |
| The harness | the vault, the resolver, the nightly ingest | consumer only. No harness file changes and there is no harness PR |
| Code freeze | Nov 30 to Dec 13 (ORCHESTRATOR section 2) | the merge and the applies land before or after |

## Must respect

* B-43 stands: the sync holds no model. A Claude process shares no network and no volume with the
  Blackboard login (`docker/apply/image.test.mjs`).
* Planner state: `inbox_apply_runner` gains no write and no read. `reading_progress` stays out of
  reach.
* 180 to 186 are frozen. A change is a new body in 187 or 188, never an edit.
* Repo and prod never drift: each migration is applied under its file name, byte-identical, after
  its review and after a dry run in a transaction that is rolled back. The PM makes every apply and
  every dry run. No worker does.
* The service key stays in its one file. The scheduled run reads it at run time, as the exporter does
  today, and prints it nowhere.
* This repository is public. The pack, the playbook and every test hold no course text. A test
  question's text is the function's own sentence.
* Anything visual goes in front of Stack before a merge. This phase changes no screen: the Inbox shows
  the worker's own line, as now.

## Definition of done

**SOP gates**

- [ ] `apply/`: `npm run typecheck`; `npx vitest run` gives 0 failures; line coverage of `src/` at
      least 80 % (94.78 % at the session-answer fix).
- [ ] `scripts/`: `node --test` over the exporter's, the runner's and the three `accept-proofs` test
      files gives 0 failures.
- [ ] `sync/`: its suite is run and unchanged (no file under `sync/` is in the diff).
- [ ] `web/`: `npm run typecheck` and `npx eslint . --max-warnings 0` exit 0; `npx vitest run` is not
      below `main`'s count; `npx playwright test -c e2e/accept.config.ts --list` lists the new titles
      as skipped.
- [ ] `docker/`: `node --test docker/apply/image.test.mjs docker/grep-clean.test.mjs` passes;
      `node docker/apply/fork-firewall.mjs --write` then `git diff --exit-code docker/apply` exits 0;
      the image builds in the test project `bb2dash-wt23f` under the tag `bb2dash-apply:wt23f`, and
      the id behind the live tag `bb2dash-apply:local` is the same before and after (task 17).
- [ ] SQL: `node scripts/db-test.mjs --only <file>` prints PASS for the three `phase23_187_*` units
      and for `phase23_180` to `_186` once 187 is on prod (task 5, the PM's run); `phase23_188_*`
      prints PASS in the rolled-back dry run before the PR (task 6) and through the runner after the
      cut-over.
- [ ] `node --test acceptance/acceptance.test.mjs` gives 0 failures with the new pack.
- [ ] bb2dash-stack: `node --test doctor/ scripts/` gives 0 failures; `just accept 23 --check` passes.
- [ ] Supabase advisors: no new security finding on the new objects.
- [ ] **The database branch is reviewed before anything is applied (task 4):** `/code-review` and
      `/security-review` on `fix/phase23-followups-db`. Findings are fixed in 187 and 188 themselves,
      which are not frozen until applied.
- [ ] **`/code-review main high` and `/security-review` on both PRs (task 18). Required:** the apply
      worker writes with its own role, 187 replaces two of that role's SECURITY DEFINER functions
      and one of `sync_runner`'s, adds one that the app's own login can call and a table that
      decides what the worker runs, and a host script that holds the service key runs unattended.
      CRITICAL and HIGH are fixed test-first. Phase 23's two fix rounds were not reviewed again
      (`STATUS.md:1287-1288`, `:1389-1390`); here the fix round gets a second review or an
      independent check, recorded in 110a. A fix to 187 after task 5 is migration 189.

**Contract**

- [ ] Each of the four items has its unit or test named above, and each is green.
- [ ] `git diff --name-only origin/main...HEAD -- sync/src web/src web/test workspace mcp-server desktop docker`
      prints one line, `web/src/lib/supabase/database.types.ts`.

**Live, after his merge word**

- [ ] The cut-over (task 20) is done in its order, and the doctor's `apply` and `exports` rows are
      green.
- [ ] `just accept 23` from `main` is green, and the accepted record names what the run did not
      exercise (items 1 and 2, see "What a green run does not prove").

**Docs, same PR**

- [ ] STATUS, DECISIONS (one row per answered open item, one for the migration block), ORCHESTRATOR's
      row 23, root `CLAUDE.md`'s two Phase 23 paragraphs (187 and 188 join the frozen list; 189 is
      what is left; the hold table and the scheduled export are named), `DATA_SYNTAX.md`;
      bb2dash-stack's README.

## Task list

Paths are from the bb2dash root unless the row says bb2dash-stack. "Runner on `<file>`" means
`node scripts/db-test.mjs --only <file>` and its PASS line. There are 21 tasks. Order: 1 first. Then
the workers side by side: W-80's 2 and 3, W-81's 7 to 9, W-82's 10 and 11, W-83's 12 to 14. The PM's
4, 5 and 6 follow tasks 2 and 3, in that order. Task 15 starts once task 2's file is written and
takes the view's final columns after task 4. Then 16 to 21.

**A worker's check never needs prod to change.** Tasks 2 and 3 end at the unit's own "not applied"
line. The applies, the rolled-back dry runs and the PASS lines that need them are the PM's (tasks 5
and 6).

| # | task | owner | deterministic check |
|---|---|---|---|
| 1 | Reads at the cut, read-only, written into 110a: how many `supersede/` items exist; how many session answers the backfill would stamp; the durations of the last five container syncs; the controls the Inbox card shows for a `stack_must_confirm` on `agent_request`; whether a standing `phase18_*` unit pins the source of either transform function. And one run of `node scripts/inbox-decisions-export.mjs --dry-run`, with `SECRETS_DIR` and `HARNESS_DIR` set on the command: it writes nothing (`scripts/inbox-decisions-export.mjs:221-224`) | PM | `grep -c "^## Reads at the cut$" docs/planning/sprint-2/verification/110a_PHASE23_FOLLOWUPS_VERIFICATION.md` gives 1, with six answered lines under it; the sixth holds the dry run's exit code and how many rows it would file. An exit code other than 0 stops Item 3's build until it is understood |
| 2 | Migration 187 and its three units, units first | W-80 | Runner on each `phase23_187_*.sql` fails with "migration 187 is not applied". That is the worker's whole check. The file and the units are pushed |
| 3 | Migration 188 and its unit, unit first | W-80 | Runner on `phase23_188_archived_answers.sql` reads "migration 188 is not applied". The file and the unit are pushed |
| 4 | Review of the database branch, before anything is applied: `/code-review` and `/security-review` on `fix/phase23-followups-db` | PM | both commands' findings are in 110a; each CRITICAL and HIGH is fixed in 187 or 188 itself, unit first; no migration number is spent |
| 5 | 187 on prod, on Stack's word, with no sync and no apply request open, after its rolled-back dry run. Then its units through the runner | PM | the dry run's output and the file's md5 against the recorded migration are in 110a; Runner gives PASS on the three `phase23_187_*` units and on `phase23_180`, `_181`, `_182`, `_183`, `_185`, `_186`, `phase14_091_queue`, `phase14_093_review_fixes`, `phase14_095_storage_key`; one read shows 3782 marked `skipped` and absent from the unfiled ids |
| 6 | 188's rolled-back dry run, with no sync and no apply request open | PM | the migration and its unit in one rolled-back transaction print PASS (pasted in 110a); the five `phase18_*` units in that transaction print the lines they print on `main`; Runner on `phase23_188_archived_answers.sql` still reads "migration 188 is not applied" until task 20 |
| 7 | The worker holds: `held` as the skip set, its own free record tried first, `skip_seen` handed back, the report's lines | W-81 | `cd apply && npx vitest run` gives 0 failures and holds the five cases named under Item 1's proof (a held row for Claude is never in the batch; a held row the worker can record is recorded; `skip_seen` carries the times `prepare` gave; held answers alone start no run and close done; an empty `held` sends them to Claude) |
| 8 | The worker records a stamped session answer under the right function | W-81 | the same run holds the case: a session answer with `was_applied` true has `link_file_sessions` in its rule and no `apply_resolutions` |
| 9 | Skill text: held answers, the two transform paragraphs, step 5 of `skills/inbox-apply/SKILL.md` (the exporter and its schedule, lines 156-171), bb-sync step 5b | W-81 | `grep -c "sent again at the next one" skills/inbox-apply/writer.md` gives 0; `grep -c "has a known gap" skills/inbox-apply/SKILL.md` gives 0 (1 on `main`); `grep -c "runs the same script on a schedule" skills/inbox-apply/SKILL.md` gives 0 (1 on `main`); `grep -c "inbox_apply_held_items" skills/bb-sync/SKILL.md` gives 1; `node --test scripts/install-skills.test.mjs docker/apply/image.test.mjs docker/grep-clean.test.mjs` passes |
| 10 | The exporter: `--notes-only`, the unlogged pass, the test-question rule in both modes | W-82 | `node --test scripts/inbox-decisions-export.test.mjs scripts/inbox-decisions-pr.test.mjs scripts/inbox-decision-render.test.mjs` gives 0 failures with the cases named under Item 3's proof |
| 11 | The runner and the registration script | W-82 | `node --test scripts/exports-run.test.mjs` gives 0 failures with the cases named under Item 3's proof (the fixed keys, exit 2, the list of commands); after task 20, `(Get-ScheduledTask -TaskName 'Bb2dash-Exports').Triggers.Count` gives 2 |
| 12 | bb2dash-stack: the doctor's `apply` and `exports` rows | W-83 | `node --test doctor/` gives 0 failures; `git diff --stat origin/main...HEAD -- doctor/workspace.test.mjs` prints nothing |
| 13 | bb2dash-stack: the verb `file-decisions`, the README, `.env.example`, the compose header | W-83 | `just --list` holds `file-decisions`; `grep -c "Not in the doctor yet" README.md` gives 0 (1 on `main`) |
| 14 | bb2dash-stack: the five host actions, and the bookkeeping that puts a stopped service back, for a named service | W-83 | `node --test scripts/` gives 0 failures, with a case that `exports.runNow` fails on Windows when no task is registered; the action names equal the enum of bb2dash's `acceptance/manifest.schema.json` (the test that compares them is named in 110a) |
| 15 | The pack, its browser test, and the proofs kit | W-84 | `node --test acceptance/acceptance.test.mjs` gives 0 failures (every step id fits the schema's pattern); `node --test scripts/accept-proofs.test.mjs scripts/accept-proofs-cli.test.mjs scripts/accept-proofs-db.test.mjs` gives 0 failures with one case per new proof, twelve in all, and pack 21's cases unchanged; `cd web && npx playwright test -c e2e/accept.config.ts --list` lists seven new titles |
| 16 | Integrate: worker branches merged, types regenerated, the SOP gates | PM | every box under "SOP gates" but the reviews |
| 17 | The image, as a test project, never against the queue | PM | run in `C:/Users/stack/projects/bb2dash-wt-23f` with `HARNESS_DIR` set to `C:/Users/stack/agentic-harness` (the build takes the pinned CA from there, `compose.yaml:109`, and the default finds no folder), and with `SECRETS_DIR=C:/Users/stack/.bb2dash-secrets` and `MSYS_NO_PATHCONV=1` in front of the command as well, as Phase 21's build line had them (`docs/planning/sprint-2/verification/102a_PHASE21_VERIFICATION.md`, line 109): `compose.yaml:110` names the live tag `bb2dash-apply:local`, so a plain build in the test project would move that tag onto the test build, and the next `up` of `apply` from bb2dash-stack could start it. So the build passes a second compose file, kept outside every repository, whose whole content is `services: {apply: {image: "bb2dash-apply:wt23f"}}`: first `docker image inspect -f '{{.Id}}' bb2dash-apply:local` and note the id; then `docker compose -p bb2dash-wt23f -f compose.yaml -f <that file> --profile apply build apply` exits 0; `docker image inspect -f '{{.Id}}' bb2dash-apply:local` prints the id noted, and `docker image inspect -f '{{.Id}}' bb2dash-apply:wt23f` prints another; `docker ps --filter name=bb2dash-wt23f -q` prints nothing. The live tag moves only at the cut-over, built from `main` |
| 18 | Reviews, both repositories, and the fix round's second look | PM | both commands run on both PRs; findings, fixes and the second look are in 110a |
| 19 | Docs and both PRs. Stop at "ready when you say so" | PM | `gh pr view --json state -q .state` prints `OPEN` in each repository |
| 20 | Cut-over, after his "merge" (bb2dash first), in this order, with no sync and no apply request open: install the skills; his `.env` line; `docker compose up -d --build apply` from bb2dash-stack; 188 on prod; his word, then `scripts/register-exports.ps1` (first with a folder that does not exist, which must register nothing; then with the two real folders); the first export | PM, with Stack's line and his two words | `just doctor` shows `apply` as `running, healthy` and `exports` with exit 0; Runner on `phase23_188_archived_answers.sql` gives PASS; one read gives 0 unfiled, at least 16 rows with a note path, and 3782 skipped |
| 21 | `just accept 23 --check`, then `just accept 23` from `main`; on green the accepted record, with the counts of step 9 and what the run did not exercise | PM | the run's `verdict.json` reads green; `grep -c "Phase 23 accepted" project-state/DECISIONS.md` gives 1; `grep -c "not exercised" docs/planning/sprint-2/verification/110a_PHASE23_FOLLOWUPS_VERIFICATION.md` is above 0 |

## Workers

Workers are Sonnet 5.5 (Stack's word at the start of the build session; the planning draft said
Opus), commit and push per task, never touch `project-state/`, and hand the PM a
verification section that quotes each task's red run and green run. A worker that meets an unclear
point states its default and takes it. Nobody answers a running worker by message. No worker applies
anything to prod, none runs a migration there inside a rolled-back transaction either, none runs
`docker compose`, and none registers a scheduled task.

| worker | stream | branch | worktree | tasks |
|---|---|---|---|---|
| W-80 | database | `fix/phase23-followups-db` | `bb2dash-wt-23f-db` | 2, 3 |
| W-81 | worker and skills | `fix/phase23-followups-apply` | `bb2dash-wt-23f-apply` | 7, 8, 9 |
| W-82 | exporter and schedule | `fix/phase23-followups-exports` | `bb2dash-wt-23f-exports` | 10, 11 |
| W-83 | bb2dash-stack | `fix/phase23-followups` in bb2dash-stack | `bb2dash-stack-wt-23f` | 12, 13, 14 |
| W-84 | acceptance pack | `fix/phase23-followups-accept` | `bb2dash-wt-23f-accept` | 15 |
| PM | integration | `fix/phase23-followups` | `bb2dash-wt-23f` | 1, 4 to 6, 16 to 21 |

The names are W-80 to W-84 by the PM's ruling of 2026-10-08. Two planning runs numbered their workers
the same afternoon and met at W-80. The ruling: this phase has W-80 to W-84; Phase 24a has W-76 to
W-79 and W-85, the last being its bb2dash-stack worker (brief 109 at 7fe7030, line 6); Phase 24b has
W-86 to W-88 (brief 111 at 7fe7030, line 6). W-67 to W-70 and W-75 are Phase 22's and W-71 to W-74
are used. The first draft of this brief used W-80 to W-84 and the challenge round moved them up; the
ruling put them back, and both Phase 24 briefs already name this phase's five by these numbers. W-84
starts once W-80's 187 is written (its proofs read the view), takes the view's final columns after
task 4, and reads W-83's action names from its branch. W-84's proof tests run on a Postgres inside
the test process (`scripts/accept-proofs-db.test.mjs:2-4`), so they do not wait for 187 on prod.

## Out of scope

* Applying the pick of a `supersede/` answer (open item O-2).
* A question the writer has for Stack ending in an archived record with no Inbox item (STATUS open
  item 4, `STATUS.md:1410`). He did not choose it.
* Any change to a screen. A held answer is not marked on its card.
* Relaxing Undo for session answers now that a stamp exists.
* A second worker, a schedule inside a container, or the exporter inside harness-jobs.
* A scheduled pull request for the day files.
* The `net.http_post` exposure, the firewall's address list, and the shared helpers between `apply/`
  and `workspace/` (STATUS "Known, and said plainly"; DECISIONS 2026-10-07).
* Deleting the archived test questions an acceptance run leaves. Closing the unarchived ones of an
  earlier run is in scope: `inbox_accept_question` does it before it raises.
* An Inbox item or a toast when the scheduled export fails. The doctor is where it shows.
* A Linux form of the registration script. `scripts/exports-run.mjs` is plain Node, so a cron line can
  call it; none is written.

## Open items for Stack

Six, none open at the freeze. **O-1 to O-5 stand on the defaults in the table**, on Stack's word in
the build session's start prompt (2026-10-08: "O-1 to O-5 stand on the brief's defaults"); each is
his to overrule later, and what the other answer would change is in its row. O-6 is closed.

| # | question | default taken |
|---|---|---|
| O-1 | Should a press of Apply answers try a held answer again? | **Yes. Changed in the challenge round.** A sync and a follow-up never retry, so no run is spent after a sync, which is what his pick is for. A press is his own act and costs one run. With No, a held session answer, a held row with `applied_at` set and a held row with no resolution could never leave the hold from the page, because Undo is refused for all three (`web/src/lib/queries.inboxReopen.ts:84-94`). If he says No: those rows are left out of the held set and are tried after each sync as today, and their notice names no step the page does not offer |
| O-2 | Should the fold also apply the pick of a "this file replaces that one" answer? Today nothing does | No: the brief only stops the re-ask. Yes adds about 25 lines to 188's first function and one unit case |
| O-3 | May the acceptance run press Sync, which is one real Blackboard sync per run? | Yes. Otherwise steps 2 and 3 become his |
| O-4 | A tenth `just` verb, `file-decisions`, for the day files and their pull request? | Yes, with the Phase 23 plan's name |
| O-5 | 187 goes on prod during the build, after the database branch's own review, and 188 at the cut-over, each on his word? | Yes. The other way: 187 waits for the cut-over too, proved before by a rolled-back dry run as 188 is. That keeps prod untouched until his merge word, and costs the green runs of 187's units through the runner until then |
| O-6 | Are the seven labels under "Stack's answers" his? | **Closed, 2026-10-08. Yes, they are his.** The PM asked him these questions directly in the terminal that day and he chose every label himself. The planner and the challenge round had them only from the PM session's task text, which is why the item was raised; it is closed on the PM's confirmation. The brief is ready to freeze when its build session starts |

## What stays Stack's

From this brief:

* The one line in bb2dash-stack's `.env`: `COMPOSE_PROFILES=workspace,apply`.
* His word for each prod apply (187, 188), the two merges, and the registration of the task.
* The three `human` rows of the pack: one real answer of his applied, one note read, and the day
  files' pull request when he wants it.
* The five items above, O-1 to O-5, which stand on their defaults and are his to overrule. O-6 is
  closed: the seven labels are his.
* `just doctor`, now and then: it is the only place a failed scheduled export shows.

Not part of this brief, still open:

* His check of the two grading components (30 and 33) the writer set on four items of one course
  (3433, 3434, 3668, 3669; `STATUS.md:1344-1350`).
* The question written into archived item 3425's record and never raised as an item: whether two exam
  rows of one course are the same row (`STATUS.md:1351-1354`).
* The three session answers. Read today: 3436 and 3437 are applied (their files carry his picks) and
  archived. 3435 was "none" with a note; it is archived, its file is unlinked, and what its note asks
  is flagged in the record, not done. That flag is his to read.

## Not checked

* bb2dash-stack's `.env` and `machine.env`, and anything under a secrets folder: never opened.
* Whether a `supersede/` item exists on prod now (STATUS says none; the two reads were spent on the
  session answers and the unfiled count), and how many rows the backfill would stamp beyond two.
* How long a container sync takes. Step 3's nine-minute watch and its one second run rest on task 1.
* The function that raises `sync-login-required`, beyond the one line that names the ref
  (`db/migrations/091_sync_runner_role.sql:268`, found in the challenge round). W-84 reads the
  function before `apply-quiet` relies on it.
* The Inbox card's controls for a test question, and whether `authenticated` can insert into
  `attention_items` directly (the brief does not rely on it: the function is the path).
* 042's scan in full (`apply_resolutions`), whether a `phase18_*` unit pins the source text of the
  two transform functions, and the cases of the standing `phase23_*` units beyond `phase23_182`'s
  refusals and the two source pins.
* What compose does with a running container whose profile is off under `just up` and `just logs`.
  Task 12 confirms with `docker compose config --services`, which starts nothing.
* Whether the host's `uv run ingest` works on this laptop. The exporter treats a failed ingest as "the
  nightly takes it" (`scripts/inbox-decisions-export.mjs:197-208`).
* bb2dash-stack's `scripts/lib/accept-*.mjs` beyond the action list, the profile helper and the carry
  rule: how much of the stop-and-put-back bookkeeping is written for the Workspace alone.
* Phase 24's two briefs beyond the lines this brief cites. They were read at 10f48f1 in the challenge
  round and again at 7fe7030 in the third pass, from the worktree `bb2dash-wt-24`, with no fetch; the
  cited lines are 7fe7030's. Brief 109 is "ready to freeze" and brief 111 is a draft, so both may
  move again; the PM re-reads the Seams rows against them at this brief's freeze.
* Anything in the database for the challenge round: it made no read. So prod's grants and default
  privileges on a new table, and whether a row with no resolution can sit in `v_inbox_queue` today,
  are not checked. 187 revokes by name and its guard reads the result.
* Whether a fold would wait on anything while 188's rolled-back dry run is open. The rule is no sync
  open during it.
* Whether `acceptStep()` in `web/e2e/accept.lib.ts` lets a test set its own time limit. If it does
  not, W-84 says so and the PM decides before that shared file is edited.
* How the sandbox's facts carry a question's item id to the host (which field names cross). W-84
  reads bb2dash-stack's carry rule first.
* Whether Stack's `.env` sets `HARNESS_DIR` (the manual verb needs it). The file was not opened.
* The registration script has no unit. Its refusal is tried once by hand at the cut-over.
* No test, build or docker command was run for this brief.

## Challenge round, 2026-10-08

Twelve findings were handed over (F1 to F11 and F13; no F12). Each was checked against the code and
the brief, and all twelve were applied. Stack's answers were not changed by any of them. One default
on a point his words leave open was changed and is put to him (O-1).

| id | what was wrong | what changed |
|---|---|---|
| F1 | A held answer waited for a new answer, and for three kinds of row the page gives no way to answer again | `prepare` returns an empty `held` for a request the button filed. O-1's default is now Yes, with the reason and what No would mean. The notice names no Undo. Unit case 3 and one worker case. Step 0 of the pack now blocks on any waiting answer, held or not, because a press tries held ones |
| F2 | The hold was read from `agent_requests`, which other logins can write | The hold is the table `inbox_apply_holds`, written by `inbox_apply_close` alone. Unit cases 7, 10 and 11, and 187's guard |
| F3 | The hold compared the request's `finished_at` with the answer's `resolved_at`, so an answer given again during a run was held untried | The hold stores the `resolved_at` the run was handed and is compared for equality. Unit case 5. The two-clock corner is gone |
| F4 | The worker dropped a held row before it tried its own free record | The free record is tried first. A row with `applied_at` and no note is never held. Unit case 6 and one worker case |
| F5 | The brief was written against Phase 24's draft at 4bf223e, which moved to 10f48f1 four minutes later | The workers were renumbered in that round to start above Phase 24's. The PM's ruling of the same day undid that: this phase is W-80 to W-84, Phase 24a W-76 to W-79 and W-85, Phase 24b W-86 to W-88 (see Workers). The Phase 24 seam rows were rewritten: the `docker/apply/` files (three at 10f48f1, four at 7fe7030), bb2dash-stack's shared files, `sync/src/loop.ts`, the exporter that left 24a, and the redo list from 24a's own row. The third pass read those rows again at 7fe7030 and corrected their line numbers |
| F6 | 187 went on prod before any review, with one spare number | Task 4 reviews the database branch first. What a later finding costs is stated. O-5 carries the other option |
| F7 | `inbox_accept_question` had no owner check, no fixed arguments and no clean-up, and the `accept/` skip held for one exporter mode only | The contract is written out: the owner check, two patterned arguments, the ref and the label, the clean-up, the three-part rule in both modes, the refusal case. Step 0 does not count an earlier run's test rows, because step 1 closes them only afterwards |
| F8 | A green run would not have proved three things | Step 9 returns its counts and a zero reads "not exercised". Rows `9-supersede` and `10-held` are waived, each with its unit. `exports.runNow` fails on Windows with no registered task. The accepted record names what was not exercised |
| F9 | The stop could kill a real run, and a capped run read red | Stage `stop` starts with the proof `apply-idle`. `daily_cap` and `usage_limit` are blocked in the proofs of steps 3 and 6 |
| F10 | The schedule did not say where its two folders come from, rested on an exporter never run here, and left its limits to prose | The registration takes both folders and has no default. Task 1 has the dry run. The guard reads `.git/HEAD`, and the tests hold the lists of commands. The state file's keys are fixed and it is written on exit 2. The doctor is named as the only place a failure shows |
| F11 | Six checks or file sets did not work as written | `10-held`; the grep is `has a known gap`; tasks 2 and 3 end at "not applied" and the PM has tasks 5 and 6; the kit joins W-84 (the pack's worker) and the spec sets its own limits; SKILL.md step 5 joins task 9; task 17 names the worktree and `HARNESS_DIR` |
| F13 | The DECISIONS row said "all four are built" and named workers Phase 24 held at the time | The row reads "to be built", names the workers by that round's numbers, lists the defaults as they now stand, and says it waits for his word. The row is history and the third pass did not edit it. Two things in it no longer hold and this brief is what holds: the workers are W-80 to W-84 (the PM's ruling, see Workers), and the answers are confirmed as his (O-6, closed) |

One reason in a finding was not taken over as written. F11 says 188's dry run "locks the two
transform functions". That was not checked, so the brief gives the rule (no sync open) and marks the
mechanism as not checked.

## Round 1, 2026-10-08: the PM's ruling R1 after task 1's reads (the kind of a test question)

Task 1 read the Inbox card (110a, "Reads at the cut", line 4). A `stack_must_confirm` card has an
Answer box, a "why (optional)" field and Save. It has no Dismiss and no Confirm button; Dismiss is
offered for the kinds `deadline` and `data_gap` alone (`web/src/components/inbox/InboxCard.tsx:159`,
`:391-405`). So the pack's steps 1 and 7a, which dismiss a test question, cannot be walked on the
row the Contract fixed. No screen changes for this (Out of scope). The Contract changes in one place,
and W-80 and W-84 build to this section where it differs from the text above.

* **`inbox_accept_question` fixes the row's kind from the label.** The labels `dismiss` and `offline`
  raise kind `data_gap`. Every other label, `confirm` and `note` among them, raises
  `stack_must_confirm`. Entity `agent_request`, no course, no `field`, and the ref
  `accept/<run>/<label>` are as before, and so are the owner check, the two patterns, the clean-up,
  the cap of eight open rows and the fixed sentence. The clean-up and the cap count rows by the
  three-part shape (ref, entity, no course), not by kind.
* **Why `data_gap`.** Its card offers Save and Dismiss together. Nothing closes such a row by
  itself: `close_cleared_gaps` acts on a `data_gap` only for the entities `reading` and `bb_file`
  (`db/migrations/161_outside_links.sql:87-96`), and no gap key of `stage_gaps` has the entity
  `agent_request`. `deadline` was the other kind with a Dismiss and was not taken: its card has no
  answer box at all, and the `dismiss` label would then be the only thing its card could do.
* **What the steps do on the page.** "Confirms" means: types the pack's fixed word into the Answer
  box and presses Save, with "why" left empty (step 1, the label `confirm`). "Confirms with a note"
  means the same with the pack's fixed sentence in "why" (step 6, the label `note`). "Dismisses"
  means the Dismiss button with "why" left empty (step 1 for `dismiss`, step 7a for `offline`). The
  fixed word and sentence are the pack's own and hold no course text.
* **What the worker does with each, unchanged code.** A saved answer with no note is recorded as
  `recorded_elsewhere` (the entity is `agent_request`, `apply/src/batch.ts:170`). A dismissed row
  with no note is recorded as `dismissed` (`batch.ts:167`). A row with a note goes to Claude
  (`batch.ts:162`). So the proofs' buckets stand as the step table gives them.
* **The exporter's rule and the proofs do not change.** A test question is still told by its ref,
  its entity and its missing course, in both exporter modes.
* **The unit `phase23_187_accept_objects.sql` gains two cases:** the label `dismiss` raises a
  `data_gap` and the label `confirm` a `stack_must_confirm`; and a `data_gap` test row is still open
  after `close_cleared_gaps` runs.

## Session prompt

> `/bb2dash-pm` Start the Phase 23 follow-ups. `main`'s STATUS and ORCHESTRATOR do not know this work and still call the session-answer fix unmerged (it merged as #81): the brief is the truth, and it is newer than the memories too. The worktree `C:/Users/stack/projects/bb2dash-wt-23f` and its branch `fix/phase23-followups` exist and are yours; the planning session has ended and writes nothing more there. If the worktree is not clean at `origin/fix/phase23-followups`, stop and tell me. Work there by full paths (a relative path from where you start lands in the shared checkout, which stays on `main`), and cut no new phase branch. Read `docs/planning/sprint-2/briefs/110_PHASE23_followups.md` there in full (it is not on `main`), then the two follow-ups rows at the end of that worktree's `project-state/DECISIONS.md` (not on `main`; the second corrects the first), then memories `phase23-state` and `phase24-state`. Then read `C:/Users/stack/projects/PARALLEL-SESSIONS-bb2dash-2026-10-08.md` in full: the rules the three sessions share and the ones that are yours alone. Follow them as mine, and pass on to each worker the ones that touch it. This replaces the skill's "skip nothing" rule: of ORCHESTRATOR read sections 0 to 5 (section 6 is old prompts); of STATUS read the first sentences of its header (the header is one very long line: do not read it whole) and the sections "Where the product is", "Acceptance run", "Phase 23", "What's next" and "Known issues"; take 91, 93, 94, 105 and 106 by their headings only. If the skill's untagged-session check is due, say so in your report and leave it: Session 1 does that review. The brief is the approved plan: give me the triage line and the short report, do not enter plan mode, and go on without waiting for an answer. I am not limiting plan usage right now. The seven answers in the brief are mine, given in the terminal on 2026-10-08, and O-1 to O-5 stand on the brief's defaults. First re-read its Seams against Phase 24's briefs at their branch's head (`C:/Users/stack/projects/bb2dash-wt-24`, read-only) and its Phase 22 row against `C:/Users/stack/projects/bb2dash-wt-22`: the line numbers the brief quotes are an older commit's, so find each row by its words. Then freeze: one commit on the branch, pushed before any worktree is cut, that takes out the "draft" and "not frozen" lines, records O-1 to O-5 as defaults, names the commits you read in the Seams rows and adds a DECISIONS row. Then follow the brief's task order: task 1's reads and the exporter's dry run first; then cut `bb2dash-stack-wt-23f` and the worker worktrees and spawn W-80 to W-83 (Opus) on their disjoint files, and W-84 once migration 187 is written and merged into `fix/phase23-followups` (cut its worktree then). Before W-80 starts, make the SQL runner answer `--ping` in its worktree and in yours: copy the root `.env.local` there from the shared checkout without opening it and run `npm --prefix scripts ci`; a fresh worktree has no `node_modules`, so each worker installs what its own tests need. Migrations stay inside 187 to 189. 187 goes on prod during the build only after the database branch's two reviews and my word: run its rolled-back dry run first, with no sync and no apply request open, then stop and ask me with the dry run's result. Phase 24a and Phase 22's visual build run beside you in their own sessions; 24a also changes what the `apply` image is built from: follow the brief's seams and write nothing on either branch. Build the test image under its own tag, as task 17 says, so that the live tag `bb2dash-apply:local` does not move before the cut-over; never rebuild or restart `sync`; never a whole-project `up`. Run `/code-review` and `/security-review` at both points the brief names, each from inside the worktree of the branch under review (from the shared checkout both would read `main`), with `/code-review main high` on the PRs and the second look at the fix round; point the Definition of done's `just accept 23 --check` at your worktrees, because pack 23 is not on `main` yet; update every document the brief lists, merge `origin/main` into the branch before opening the PRs, open both (bb2dash first) and stop at "ready when you say so". After my "merge" (bb2dash first), bring the shared checkout and bb2dash-stack's main checkout up to the merge commits with a fast-forward pull, with no sync open: `apply` is rebuilt from them. Then one more word from me covers all of task 20 in its order and stands for the brief's separate words for 188 and for the registration: the skills installed, the `.env` line, which I change myself (`COMPOSE_PROFILES=workspace,apply`; give it to me as one line with the "ready" message), `apply` rebuilt alone from `main`, 188 on prod, the scheduled task registered and the first export. Before `just accept 23 --check` and `just accept 23` from bb2dash-stack's `main`, look at `docker ps` for a Phase 22 walk box (`bb2dash-walk22-...`) and wait until none is running; a green run counts.

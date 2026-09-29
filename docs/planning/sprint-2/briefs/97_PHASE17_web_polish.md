# Phase 17 — Web polish: Stack's quick fixes, carried screen bugs, Inbox and planner leftovers, live proofs

Date 2026-09-24 · PM: the Fable session · Product manager: Stack
Requirements: R-37, R-39 (the interim hide only), R-40, R-42, R-43, R-44, R-45, R-47, R-48, R-49, R-50, R-51, R-52,
R-55, R-56, R-57, R-58, R-59, R-108; S2-home-1, S2-home-2, S2-materials-1, S2-bugs-1
PM-added steps: P-7, P-9, P-10, P-11, P-12, P-14, P-19, P-69, P-70, P-71, P-72, P-73, P-80; P-63 rides this phase's
desktop touch (94 §1)
Branch `feat/web-polish-17` · Worktree `bb2dash-wt-17` · Migration range **110–119** (110–117 used, 118–119 slack;
110–116 used and 117–119 slack if B-42's answer leaves no `db_test_runner` role, see the B-42 row)
One PR per phase. No exception of this phase's own. Brief 103's provisional B-6 exception lets Phase 22's test-only
tasks 1–2 (P-15, P-16) ride this PR as 22's commits (see Seams)
Status: ~~PROVISIONAL until Stack answers 93 §5~~ **Frozen 2026-09-29** at the phase start (every B-row default by
the 2026-09-27 delegation; B-7 answered by Stack himself on 2026-09-29: "Nothing else"; B-42 kept the `db_test_runner`
role, so 117 is written)

**Recorded at the phase start (PM, 2026-09-29).** Every "PROVISIONAL" below now reads as the adopted default. Four
reconciliations with the DECISIONS rows and 105 §3, made here before workers were cut:

1. **B-21's label** is the DECISIONS row's: the control reads **"Apply answers now"** (not "Apply dates and points
   now"); its help still names the four fields `apply_resolutions()` writes, which keeps it apart from "Apply answers".
2. **B-27's marker** carries the syllabus's every-class rule beside the schedule's words, so an unstarred class never
   reads as free: the marker "Attendance and participation count" plus the line "Every class earns attendance points
   (syllabus)", worded from IST.466's syllabus by W-45 (quote it; invent nothing).
3. **T-26's CR-1 and CR-5 screenshots** are the planner view of the week that holds IST.323's Monday block with
   Quiz #5 nested, reached with the week navigation whenever T-26 runs; no week is a target for the sitting.
4. **T-29's count** of 13 holds under all defaults; a B alternative voiced at the walk moves it by one per row, and
   brief 103's B-6 row, if written in this PR, is counted separately (it is Phase 22's).

**Answered by delegation 2026-09-27.** Stack delegated the 93 §5 answers and the plan approval to the PM; the DECISIONS rows of 2026-09-27 hold them. Of this brief's B-numbers (B-1, B-2, B-3, B-6, B-7, B-17, B-19, B-20, B-21, B-22, B-23, B-25, B-26, B-27, B-28, B-29, B-30, B-31, B-42, B-57, B-58), every one resolved to its default. The phase's PM strikes PROVISIONAL where a row says default and rewrites the B-table row where it says changed, at the session's start (ORCHESTRATOR §6).

## Why

Stack's list for sprint 2 opens with three quick fixes and one line, "bug fixing" (S2-home-1, S2-home-2,
S2-materials-1, S2-bugs-1). The research found a cause for each. The Home strip has `overflow-x: auto` but no wheel
or drag handler, so a plain mouse cannot move it (UpcomingTracker.module.css:64; no `onWheel` in the component). The
Undated tray is still section 2 of Home. Materials folds only per bucket. Sprint 1 also left bugs on the screens.
Stream posts do not link or edit (R-37), and 11 posts say "unread" while the bell says 0. Classwork lists 21 nodes
Blackboard no longer carries, 16 of them rename ghosts, and it has no provenance hover (R-39, R-40). `?item=` URLs
throw React #418 (R-43). The Info tab carries a caption that has been false since 2026-09-22 (R-45). A Friday planner
range clips at about 90 px (R-44). The Inbox cannot apply an answer without a crawl or a Claude session (R-42). Gaps
never close themselves (R-56). `v_inbox_feedback` drains to nothing and its test fails on prod (R-57). The sync
summary drops five counts (R-58). The web tests measure 17 modules and lint carries 27 warnings (R-51).

Several finished features have never been proven live. The staging drop zone and its sha256 chip have never run
(R-47). Recurrence and the planner popover have not been walked on the real grid (R-55), and the 12b round-3 fixes
have not been seen on production (R-44). No toast has been clicked (R-108). Google Calendar push failed silently
633 times, every 2 minutes, between 2026-09-23 19:57Z and the re-mint at 2026-09-24 17:02:50Z (R-52). If the consent
screen is still in Testing, the new token dies about 2026-10-01 17:03Z (P-14). The kind colours still read "pending
Stack's nod" (R-59). The IST.466 attendance marker, the web half of R-26 and the favicon are small items that have
waited since sprint 1 (R-49, R-48, R-50).

This phase runs the scoped pass that 93 §5 item 7 prices at about a worker-week. It follows the 12b method with
disjoint-file workers, one PM walk and one Stack walk. It depends only on Phase 15's runner. It runs beside 16 and 18
and lands before 19, because 19 builds its history arm on this phase's two view migrations (P-9, P-10) and shares
P-71's heartbeat seam: 19 leaves `v_scheduler_heartbeat` as this phase ships it.

## Stack's calls this brief rests on

Every row is **PROVISIONAL** until Stack answers 93 §5. "Defaults, except …" is enough.

| B | question | default taken | tasks that change if he answers otherwise |
|---|---|---|---|
| B-1 | S2-home-1: what "scrollable" means | A plain mouse gets wheel and drag on the strip. One shared hook. The strip's content does not change | "It's a trackpad regression": T-16 becomes a reproduce-first task in T-28's walk before any code |
| B-2 | S2-home-2: where Undated goes, and whether it starts collapsed | Just above Needs attention. **Collapsed on first visit**, then remembered. Nothing leaves Undated | "Default open": one constant in T-17. "Below Needs attention": T-17's order assertion flips, and 12b's P-home-5 order gets a DECISIONS row |
| B-3 | S2-materials-1: what folds | The whole course header row, text included, is one accessible button. Buckets keep their own toggles. File rows do not change | "Fold only when the chevron is clicked": T-17's button wraps the icon only |
| B-7 | S2-bugs-1: scoped pass or a fresh intake | Scoped: the known bugs in `91_` §1 plus the three quick fixes. The PM asks "anything else?" once, before the freeze | "Fresh intake": a new ledger intake before T-03, about a phase of added work, and T-28's ledger grows |
| B-17 | Stream "unread" (Q8) | Follows the bell: `read_at is null and is_read is distinct from true` (063). An announcement post links to `/announcements` (PM's call) | "Keep Blackboard's is_read": T-03 drops `is_unread`, T-12 keeps its test on `is_read` |
| B-19 | Stale Classwork nodes (Q10) | Hidden. Rename ghosts (16 today, a live node shares their `bb_item_id`) are never shown. A toggle reveals the stale nodes with no live twin: 5 today. 93's default says "the three really gone" (GEO.103.lecture 99, 106; IST.323 1203). The other 2 are IST.352's WK04 "Project Prioritization Scoring Criteria" rows 1095 and 1096, which Blackboard re-created in WK05 under new ids (1630, 1631). Putting them behind the toggle, not hiding them for good, is **the PM's reading of B-19 and PROVISIONAL**. Nothing is deleted | "Mark instead of hide": T-13 renders a "No longer in Blackboard" badge and drops the toggle. "Only the three": T-13 also hides a stale node whose title is live elsewhere in the same course, so IST.352 shows no toggle and acceptance step 3's toggle line moves to IST.323 ("Show 1 item") |
| B-20 | Freshness and heartbeat (Q11) | Phase 9's freshness thresholds stand. Two-stage heartbeat: `late` after 240 s, `missing` after 600 s. Home says nothing at `late` | Other numbers: one constant each in 113 (T-06) and its fixture table |
| B-21 | An "apply answers now" control (Q12) | Build it. No migration. Labelled apart from "Apply answers" | "Strike the clause": T-18 becomes a DECISIONS row plus a rewrite of `INBOX_APPLY_HELP` (`queries.sync.ts` then joins W-46's set) |
| B-22 | Info groups (Q13) | Remove the false caption now. No group panel this sprint | "Build a panel": a new data-source task, M, outside this phase |
| B-23 | Phase 13 carry-ins (Q14) | C-3 (favicon) ships here early; C-2's rule line ships in Phase 16; C-1 stays with Phase 22 | "All wait for 22": T-20 moves to Phase 22 |
| B-25 | R-18 proof rows (Q16) | Stage the byte-identical originals and keep their rows. The "differs" draft is removed by SQL and Storage delete in the same sitting | "Delete all": T-26 adds two deletes and expects 0 staged rows |
| B-26 | R-26's web half (Q17) | Close it with a DECISIONS row once the desktop toasts are confirmed (T-24) | "Build web notices": a new query file and Activity rows, S to M |
| B-27 | IST.466 attendance marker (Q18) | Mark the 8 starred sessions in the schedule's own words (IST.466 only). Answered together with B-13 | "Every class": the marker becomes a course-level Info line. "Strike": T-15 becomes a DECISIONS row |
| B-28 | Failing calendar push (Q19) | A Home line after 3 consecutive failed pushes, cleared by the next ok run. **Manual step for Stack**: read the consent screen's publishing status (P-14) | Another surface or count: one constant in 113, the copy in T-19 |
| B-29 | Machine-closed Inbox gaps (Q20) | Yes, for `stage_gaps`' four conditions, archived with a "closed itself" record. A key that closes itself twice within 24 h stays open once, flagged. R-56 also asks whether a self-closed row counts in `attention_answered`. The PM reads B-29's "surfaced once" as "a hole that reopens is asked again", so a self-closed row does **not** count (114's carve-out; **PROVISIONAL**) | "No": T-07 and the R-56 half of T-18 drop out; R-56 closes by a DECISIONS row. "A reopened hole is not asked again": 114 keeps 041's `attention_answered` body and T-07's re-raise case flips |
| B-30 | New Activity lines (Q21) | Add `auto_graded`, `reading_links.linked` and `missing_cleared` when above 0. Leave out the two steady-state counts, under a written convention (P-72) | "Include the steady-state counts": two extra sentences in 115 (T-08) |
| B-31 | Planner kind colours (Q22) | Keep. A DECISIONS row closes the pending nod | "Change kind X": one constant in `google.ts`, calendar-push v6 redeployed, 1 event re-patched (appointment_slot) |
| B-42 | A database credential for the test runner (Q33); Phase 15's call, which this phase inherits | 93's default: a session-pooler or direct connection string in a gitignored `.env.local` as `BB2DASH_TEST_DB_URL`, for a dedicated `db_test_runner` role. This phase's files run through `scripts/db-test.mjs`, and 117 grants the role what they call. **PROVISIONAL B-42** | **PROVISIONAL B-42.** This row is the one place that lists what changes. "No credential": 117 is not written, so the header reads 110–116 used and 117–119 slack, §Files and the DoD's migrations line name seven, and the PM applies 110–116 only (§Workers). Every "`<file>` PASS" check (T-03 … T-09), T-08's full runner run and the DoD's `node scripts/db-test.mjs` line become MCP `execute_sql` pastes, one per unit the runner would run (a loader and its test file together, as brief 95's B-42 row sets), each ending in its `: PASS` row; a W-44 task's (a) check then runs once 116 is applied. T-10 counts 7 migrations (110–116) and its md5 table is 7 of 7; its two `db_test_runner` checks and its `--list` count drop. "An owner-level DSN instead of the role": 117 is not written, the header, §Files, the DoD and §Workers read 110–116 as above, T-10 counts 7 (md5 7 of 7) and drops its two `db_test_runner` checks, and every runner line, the `--list` count included, stands, run as the owner |
| B-57 | Toasts (Q47) | Stack reports the three sightings, one banner click and one Action Center click. If the Action Center click does nothing, the toast is held until expiry | "Clicks work": T-25 skips the `notify.ts` change |
| B-58 | Two C-7 outputs (Q48) | Fix "1 grades posted" (no score) and "1 / 0" on zero-point columns, under a row amending C-7 rule 2. Attendance keeps toasting | "Leave C-7 as frozen": T-25 keeps only P-63 |

## Contract (PROVISIONAL until the B-table above is answered; frozen when Stack approves the phase plan)

### Routes and screens

No new route and no new page. What changes, screen by screen:

* **Home `/`.** The Upcoming strip gets `useHorizontalScroll`. A vertical wheel with no horizontal delta
  scrolls the strip sideways, and a native horizontal delta is left alone. A pointer drag past **5 px**
  scrolls and swallows the click that follows it; a shorter press still opens the item. ◂ ▸ and the strip's
  content are unchanged. The Undated section moves to sit **immediately above** `NeedsAttentionRow`. Its
  header is a `<button aria-expanded>` reading "Undated (N)"; it starts collapsed (B-2) and is remembered
  under `bb2dash.home.collapsed` (new key). NeedsAttention gains the heartbeat lines (below).
* **Collapse state (P-70, PM's design).** `web/src/lib/collapse-state.ts` (new) serves both screens. Each surface
  has its own storage key and its own default: Materials is open, Undated is collapsed. A missing or unreadable
  key means the surface's default; a stored JSON array of keys is Stack's last choice. Storage is read through
  `useSyncExternalStore`, with the default as the server snapshot (the DECISIONS 2026-09-16 hydration pattern), so
  neither screen adopts it in a set-state effect (T-23). `materials-collapse.ts` keeps its exports as thin
  re-exports, so its current importers compile unchanged.
* **Course Stream `/course/[id]/stream`.**
  * Links per `ref_kind`:
    * `assignment` → `?item=assignment:<id>` on the current route
    * `bb_file` → `FileOpenAction`, routes `{storage_path, source_url, local_path: unknown}`
    * `bb_content` → `meta.url` when present, otherwise no link (4 of 10 rows today)
    * `announcement` → `/announcements` (PM's call under B-17, PROVISIONAL)
  * A `StatusSelect` on `assignment_posted` and `assignment_due` rows writes through `useSetItemStatus` on `ref_id`.
    `StatusSelect` already renders in `Today.tsx`, `UpcomingTracker.tsx` and `PlannerItem.tsx`, and its module's
    `StatusOptions` export is imported by `PlannerItemPopover.tsx` and `AssignmentPlannerBlock.tsx`. So its props
    change additively, or the Stream row uses an adapter: every existing import and call compiles unchanged, and no
    other worker edits a caller.
  * `progress-cache.ts` invalidates and patches `['course-stream']`.
  * The "unread" tag reads `meta.is_unread`.
  * My-submission files and items Blackboard no longer lists leave the feed (migration 110).
  * The same strip change as Home applies here, because this page mounts `UpcomingTracker` too.
* **Classwork `/course/[id]/classwork`.**
  * A node with `missing_since` set is a **ghost** when a live node in the same course shares its `bb_item_id`.
    Ghosts are never rendered; Phase 19 deletes them.
  * A stale node with no live twin is hidden by default. A toggle, "Show N items Blackboard no longer lists",
    reveals it with a "No longer in Blackboard" label. N is per course: on 2026-09-24 it is 2 on GEO.103.lecture
    (99, 106), 1 on IST.323 (1203), 2 on IST.352 (1095, 1096) and 0 elsewhere, 5 in all (B-19, PROVISIONAL). A
    course with N = 0 shows no toggle. The toggle is not persisted.
  * A file row with non-empty `notes` gets `title` = the note and a `·note` marker, as `MaterialsBrowser.tsx`
    does.
  * The IST.466 timeline (`CourseScreen.tsx` `SessionRow` / `SessionPanel`) marks every session with
    `counts_attendance` true.
* **Info `/course/[id]/info`.** `GROUPS_CAPTION` goes. `group_notes` still renders verbatim.
* **`?item=` popout.** `ItemPopout` calls `useHydrated()` before its early return (`if (!target) return null`).
  Until hydrated it renders the same placeholder on server and client. `AssignmentDetailBody` is **not** gated,
  because it is shared with the un-Suspended assignment page. `SessionPopout` shows the attendance marker.
* **Attendance marker wording** (PM's, from the schedule's "attendance and participation counts"): the text is
  "Attendance and participation count" with the title "IST 466 schedule; this course only". It shows only where
  `sessions.counts_attendance` is true, which is 8 IST.466 rows today.
* **Materials `/materials`.**
  * Each course header row (text included) is one `<button aria-expanded aria-controls>`. Folding it hides every
    bucket of that course.
  * The course key `<courseId>` joins the same stored set, `bb2dash.materials.collapsed`. The format stays a JSON
    array of keys, and a value stored before this phase reads back unchanged.
  * Bucket toggles keep their own `<courseId>::<bucket>` keys.
* **Inbox `/inbox`.**
  * `ApplyNowButton` sits beside `InboxApplyButton`. Its label is "Apply answers now" (B-21's DECISIONS row). Its
    help names the four fields `apply_resolutions()` writes (`due_at`, `due_date`, `points_possible`, `bb_url`).
  * It inserts `agent_requests (kind = 'transform')` only when no transform request is queued or claimed.
    Otherwise it shows that request's state.
  * The Inbox refreshes when the request settles (`useRefreshInboxOnSettled`).
  * A row whose `suggested->>'reopened_within_24h'` is `true` shows "Closed itself earlier today and came back"
    (PM's wording).
* **Home heartbeat lines** (PM's wording; one line per job whose stage calls for it, and nothing at `ok` or `late`):
  * transform `missing`: "The sync scheduler has not run since <relative>; new crawls will not fold until it does."
  * transform `failing`: "The sync scheduler has failed <n> times since <relative>: <last_error>".
  * calendar push `failing`: "Google Calendar push has failed <n> times since <relative>: <last_error>".
    `last_error` already names the fix ("re-run scripts/google-consent.mjs").
  * calendar push `missing`: "Google Calendar push has not run since <relative>."
  * `off`: "<Scheduler | Calendar push> is switched off."
* **`/planner`.** `.blockTime` in `PlannerWeek.module.css` becomes `white-space: normal`, so a range wraps
  instead of clipping. No layout change otherwise.
* **Static assets.** `web/src/app/favicon.ico` is a byte copy of `desktop/build/icon.ico`. `web/src/app/apple-icon.png`
  is a byte copy of `desktop/build/icon.png` (120×120). Next injects the tags itself; `proxy.ts:20` already exempts
  `.ico` and `.png`.
* **Desktop (C-7 rule 2, amended by B-58).**
  * A per-course group of one row renders the detail toast, not "1 grades posted".
  * A row with `possible = 0` renders the score alone, without "/ 0".
  * `notify.ts` changes only if T-24 shows an Action Center click with no `navigated to` line. It then holds the
    toast until `click`, `failed` or quit, instead of releasing it on `close`.

### RPC signatures

```sql
-- 113 · new schema, outside the PostgREST-exposed set, so no definer function is reachable at /rest/v1/rpc
create schema private;                                     -- revoke all from public; usage to authenticated, service_role
create function private.heartbeat_stage(p_last_tick_at timestamptz, p_now timestamptz,
                                        p_consecutive_failures integer, p_active boolean)
  returns text language sql immutable set search_path = public, pg_temp;
  -- 'off' if not p_active; 'failing' if p_consecutive_failures >= 3; 'missing' if p_last_tick_at is null
  -- or age > 600 s; 'late' if age > 240 s; else 'ok'. Execute: authenticated, service_role.
create function private.scheduler_heartbeat()
  returns table (job text, cron_jobname text, tick_seconds integer, last_tick_at timestamptz,
                 last_ok_at timestamptz, consecutive_failures integer, last_error text, stage text)
  language sql stable security definer set search_path = public, pg_temp;
  -- two rows: 'transform' (cron job bb2dash-transform-tick) and 'calendar_push' (bb2dash-calendar-push).
  -- last_tick_at: start_time of the newest cron.job_run_details row per jobid, read by runid desc (pkey) limit 1.
  -- last_ok_at: transform = the newest such row with status 'succeeded'; calendar_push = started_at of the newest
  -- calendar_push_runs row with status 'ok' (the cron row says 'succeeded' even when the push failed: 633 failed
  -- pushes on 2026-09-23/24 all sat under 'succeeded' cron rows).
  -- calendar_push: consecutive_failures = failed calendar_push_runs rows after the newest 'ok' row;
  -- last_error = the newest failed row's error; active = cron.job.active and app_settings.gcal_enabled.
  -- transform: consecutive_failures = cron.job_run_details rows with status 'failed' newer (by runid) than the
  -- newest 'succeeded' row; last_error = that newest failed row's return_message; active = cron.job.active.
  -- (Prod on 2026-09-27: 12,095 transform-tick rows, all 'succeeded', so the transform reads 0 failures today.)
  -- Returns rows only when (select auth.uid()) = public.app_owner(). Revoke all from public, anon;
  -- execute to authenticated, service_role.
create view public.v_scheduler_heartbeat with (security_invoker = true) as
  select * from private.scheduler_heartbeat();              -- revoke all from anon; select to authenticated, service_role

-- 114 · gap self-close (B-29)
create function public.close_cleared_gaps(p_sync_run_id bigint, p_trigger text) returns jsonb
  language plpgsql security definer set search_path = public, pg_temp;
  -- For each OPEN attention_items row with suggested->>'source' = 'stage_gaps' whose condition no longer holds
  -- (grading_schemes row exists | assignment has due_at, due_date or event_start | reading has for_date |
  -- bb_files row has storage_path or is superseded): if an archived row with the same (kind, course_id, ref,
  -- field) and decision->>'closed_itself' = 'true' has archived_at > now() - interval '24 hours', leave it open
  -- and set suggested = suggested || '{"reopened_within_24h": true}'; otherwise set state 'archived',
  -- archived_at now(), archived_by 'stage_gaps', decision {closed_itself: true, rule, sync_run_id, trigger}.
  -- Returns {"closed": n, "flagged": m}. Revoke all from public, anon, authenticated; execute to service_role.
create function public.bb_files_close_cleared_gaps() returns trigger
  language plpgsql security definer set search_path = public, pg_temp;   -- calls close_cleared_gaps(null, 'bb_files_update')
create trigger bb_files_close_cleared_gaps_trg after update on public.bb_files
  for each statement execute function public.bb_files_close_cleared_gaps();
  -- trigger function revoked from public, anon, authenticated (firing needs no EXECUTE grant)
create or replace function public.stage_gaps(p_run_id uuid, p_sync_run_id bigint) returns jsonb
  -- 054's live body byte for byte, plus one call close_cleared_gaps(p_sync_run_id, 'fold') before the raises,
  -- and counts key 'gaps_closed'. security definer; grants re-asserted exactly as 054 (service_role only).
create or replace function public.attention_answered(p_kind text, p_course_id text, p_ref text, p_field text)
  returns boolean
  -- 041's body plus: and not (ai.state = 'archived' and ai.decision->>'closed_itself' = 'true'),
  -- so a hole that reopens is asked again (the PM's reading of B-29, PROVISIONAL). Invoker, language sql stable,
  -- search_path public, pg_temp; browser roles revoked as 041 (execute to service_role only).

-- 115 · Activity lines (B-30, P-72)
create or replace function public.sync_change_lines(p_stages jsonb) returns jsonb
  -- 051's live body plus three sentences; immutable, invoker, search_path public, pg_temp;
  -- grants re-asserted from 051:262-263 (execute to authenticated, service_role).
```

The three new sentences (PM's wording) are:

* `gradebook.auto_graded` > 0: "%s assignment(s) marked graded because Blackboard posted a score"
* `files.reading_links->>'linked'` > 0: "%s reading(s) linked to their file". The value is read as jsonb, never
  cast whole.
* `files.missing_cleared` > 0: "%s file(s) are back in Blackboard"

`assignments.conflicts_settled` and `assignments.shared_columns` get **no** sentence. The function comment carries
the convention (P-72): *a count that repeats the same value on every fold is steady state and is not a change line.*
051's closing rule stays: when no sentence fires, the function returns `["Nothing changed"]`, which
`phase10a_stage_gradebook.sql:301` asserts for an older-run replay.

```sql
-- 117 · written only under B-42's default (the db_test_runner role exists; see the B-42 row).
-- db_test_runner grants for this phase's test files (the rule brief 95's Phase 16 seam row sets with 107:
-- grants beyond 100 go in the phase's own range, never through service_role membership). Exactly what the seven
-- phase17_*.sql files call or write as the session role and 100 does not already hold, by identity signature:
-- usage on schema private; execute on private.heartbeat_stage(timestamptz,timestamptz,integer,boolean),
-- private.scheduler_heartbeat(), public.close_cleared_gaps(bigint,text), public.stage_gaps(uuid,bigint); insert,
-- update, delete on the tables their fixtures write (attention_items, bb_files, agent_requests, and any other the
-- worker's dry run names), plus usage on their sequences. attention_answered(text,text,text,text),
-- archive_attention_item(bigint,jsonb,text) and sync_change_lines(jsonb) are not re-granted: today's suite
-- already calls them (inbox_apply_090_attention_archive, phase10a_stage_gradebook), and brief 95 derives 100's
-- list from that suite. Applied after 116, because it grants on 113's and 114's functions. A guard block raises
-- if db_test_runner is a member of service_role or postgres afterwards.
```

### Tables and migrations

Additive only. No table is created or altered. Each file is dry-run inside `begin; … rollback;` and applied with
`apply_migration` under the file's own name. The repo file stays byte-identical to what was applied. 027, 041, 051,
054 and 077 stay byte-frozen, and every change to their objects is a `create or replace` in a new file.

| # | file | creates / changes | test (Phase 15's runner) |
|---|---|---|---|
| 110 | `db/migrations/110_course_stream_unread_filters.sql` | `create or replace view v_course_stream` from 027's body (identical on prod), **same 8 columns, same order**. Announcement `meta` gains `is_unread = (a.read_at is null and a.is_read is distinct from true)` and keeps `is_read`. File arm `meta` gains `storage_path`, `source_url`, and drops rows where `f.bucket = 'my_submissions'` or `coalesce(f.notes,'') like '%missing_since_run=%'`. Content arm drops rows where `b.detail->>'missing_since' is not null`. `security_invoker` kept, anon revoked, select to authenticated and service_role re-asserted, comment updated (P-9) | `db/tests/phase17_110_course_stream.sql` |
| 111 | `db/migrations/111_content_tree_missing_notes.sql` | `create or replace view v_content_tree` from 027's body with two columns appended last: `missing_since uuid` = `(b.detail->>'missing_since')::uuid` and `notes text` = `f.notes`. Order by is unchanged. It is a **view projection of the P-98 vanish convention, not a stored column**. The migration's guard block aborts if any `detail->>'missing_since'` does not cast (21 of 21 cast today). Invoker, anon revoked, grants re-asserted (P-10) | `db/tests/phase17_111_content_tree.sql` |
| 112 | `db/migrations/112_knowledge_check_link_rehome.sql` | **Data.** Moves `assignment_id` from stale `bb_content` rows 58, 59, 60 to their live twins 1602, 1603, 1604 (IST.352, same `bb_item_id`; stamps the live rows first, then nulls the stale ones). The guard aborts unless exactly these three pairs match and the live rows' `assignment_id` is null. `stage_content` never writes the column (026:10), so the move holds (P-11) | `db/tests/phase17_112_knowledge_check_rehome.sql` |
| 113 | `db/migrations/113_scheduler_heartbeat.sql` | Schema `private`, `private.heartbeat_stage`, `private.scheduler_heartbeat`, view `public.v_scheduler_heartbeat` (P-12, P-71). It redefines no `transform_tick` and no `calendar_push_tick` (DECISIONS 2026-09-15) | `db/tests/phase17_113_scheduler_heartbeat.sql` |
| 114 | `db/migrations/114_gap_self_close.sql` | `close_cleared_gaps`, the `bb_files` statement trigger and its function, `stage_gaps` re-created (054 + the call), `attention_answered` re-created (041 + the carve-out) (R-56) | `db/tests/phase17_114_close_cleared_gaps.sql` |
| 115 | `db/migrations/115_sync_change_lines_counts.sql` | `sync_change_lines` re-created (051 + three sentences + the P-72 comment) (R-58) | `db/tests/phase17_115_sync_change_lines.sql` |
| 116 | `db/migrations/116_retire_inbox_feedback.sql` | `drop view v_inbox_feedback`. The `agent_requests.kind = 'inbox_feedback'` value stays, because it is /inbox-apply's kind (R-57, PM's default: retire). `db/tests/phase12b_077_inbox_feedback.sql` is deleted and its kind assertion moves to the new test | `db/tests/phase17_116_retire_inbox_feedback.sql` |
| 117 | `db/migrations/117_db_test_runner_grants_phase17.sql` (new) | The `db_test_runner` grants above, enumerated by signature, with the guard block. Applied after 116 and **before** the seven `phase17_*.sql` files first run through the runner. Not written if B-42's answer leaves no `db_test_runner` role ("no credential" or an owner-level DSN; the B-42 row) | checked by T-10's SQL |
| 118–119 | — | slack; a need past 119 takes the next free block of ten and records it in DECISIONS (94 §2 rule 6) | — |

Every `phase17_*.sql` follows brief 95's rules. `begin;` is its first statement and `rollback;` its last, with no
top-level `commit` or `end`. Its last result row's first column ends in `: PASS`. Otherwise the runner refuses it
(exit 2) or counts it FAIL.

### Files

New files:

* `db/migrations/110_course_stream_unread_filters.sql` … `117_db_test_runner_grants_phase17.sql` (the eight above; seven when
  B-42 drops 117)
* `db/tests/phase17_110_course_stream.sql`, `phase17_111_content_tree.sql`, `phase17_112_knowledge_check_rehome.sql`,
  `phase17_113_scheduler_heartbeat.sql`, `phase17_114_close_cleared_gaps.sql`, `phase17_115_sync_change_lines.sql`,
  `phase17_116_retire_inbox_feedback.sql`
* `web/src/lib/use-horizontal-scroll.ts` (P-69), `web/src/lib/collapse-state.ts` (P-70), `web/src/lib/queries.heartbeat.ts`
  (`heartbeatOptions`, `useSchedulerHeartbeat`, `heartbeatLines`), `web/src/lib/queries.applyNow.ts` (`useApplyNow`, built
  on `queries.sync.ts`'s `useCreateAgentRequest`, `openRequestOptions('transform')` and `useRefreshInboxOnSettled`; that
  1,313-line file is not edited)
* `web/src/components/inbox/ApplyNowButton.tsx` + `ApplyNowButton.module.css`
* `web/src/app/favicon.ico`, `web/src/app/apple-icon.png` (R-50, P-80)
* `web/e2e/playwright.config.ts` (run as `cd web; npx playwright test -c e2e/playwright.config.ts <spec>`, the form
  brief 103 uses; it writes screenshots to `walk-17/`, and brief 103 does not edit it), `web/e2e/login.mjs`,
  `web/e2e/harness.spec.ts`, `web/e2e/item-popout.spec.ts`, `web/e2e/walk17.spec.ts` (P-7). `login.mjs` and the config
  read `WALK_BASE_URL` (default `http://localhost:3000`, the local `next dev` server), so the PM and Phase 22 point them
  at a preview host (T-01). `walk17.spec.ts`'s `staged link` test also reads `WALK_STAGED_HREF` (new; T-26 sets
  it). `harness.spec.ts` holds two tests with frozen titles, `signed in` (T-01, `01-harness-home.png`) and `no 404`
  (T-20). `item-popout.spec.ts`
  takes `02-popout-pasted.png` (T-11). `walk17.spec.ts` holds every other screenshot (03–21), the test titled
  `staged link` (T-26) and the forced-failed-read case the task list names. The session is saved to
  `web/e2e/.auth/state.json`. `web/.gitignore` ignores it, and it is deleted at phase end.
* `web/test/hydration-harness.tsx` (P-73), `web/test/ItemPopout.hydration.test.tsx`, `web/test/attendance-marker.test.tsx`,
  `web/test/use-horizontal-scroll.test.tsx`, `web/test/collapse-state.test.ts`, `web/test/ApplyNowButton.test.tsx`,
  `web/test/NeedsAttention.heartbeat.test.tsx`, `web/test/fc-params.seed.test.ts`
* `docs/planning/sprint-2/walks/walk-17/97w_PHASE17_WALK.md` (the S2-bugs-1 ledger and walk evidence) and its screenshots

Changed and deleted files are listed by owner. The four worker sets are **disjoint**. `database.types.ts` and
`project-state/` belong to the PM, and so does the Contract.

| owner | may touch (paths under the repo root) |
|---|---|
| W-44 db | `db/migrations/110–117_*.sql`, `db/tests/phase17_*.sql`, delete `db/tests/phase12b_077_inbox_feedback.sql`, `DATA_SYNTAX.md` (view and heartbeat entries) |
| W-45 course | `web/src/app/(app)/course/[id]/stream/CourseStream.tsx` (+ `.module.css`), `…/classwork/CourseClasswork.tsx` (+ css), `…/classwork/CourseScreen.tsx` (+ css), `…/info/CourseInfo.tsx` (+ css), `web/src/components/popout/ItemPopout.tsx`, `SessionPopout.tsx`, `web/src/components/tracker/StatusSelect.tsx`, `web/src/lib/course-dimension.ts`, `queries.course.ts`, `queries.today.ts`, `progress-cache.ts`; tests `course-stream.test.tsx`, `progress-cache.test.tsx`, `StatusSelect.test.tsx`, `course-classwork.test.ts`, `CourseClasswork.test.tsx`, `CourseInfo.test.tsx`, `course-info.test.tsx`, `SessionPopout.test.tsx`, `ItemPopout.test.tsx`, `PlannerWeek.hydration.test.tsx` (refactor onto the harness only), `factories.course.ts`; new `web/test/hydration-harness.tsx`, `ItemPopout.hydration.test.tsx`, `attendance-marker.test.tsx` |
| W-46 home | `web/src/app/(app)/Today.tsx` (+ `Today.module.css`), `NeedsAttention.tsx` (+ css), `web/src/components/tracker/UpcomingTracker.tsx` (+ css), `web/src/app/(app)/materials/MaterialsBrowser.tsx` (+ `Materials.module.css`), `web/src/lib/materials-collapse.ts`, `web/src/app/(app)/inbox/Inbox.tsx` (+ css), the new home, inbox and heartbeat files above; tests `TodayLayout.test.tsx`, `UpcomingTracker.test.tsx`, `UpcomingTracker.scroll.test.tsx`, `MaterialsCollapse.test.tsx`, `NeedsAttention.test.tsx`, `Inbox.test.tsx`; new `use-horizontal-scroll.test.tsx`, `collapse-state.test.ts`, `ApplyNowButton.test.tsx`, `NeedsAttention.heartbeat.test.tsx` |
| W-47 shell | `web/src/components/shell/usePopover.ts`, `Bell.tsx`, `TopNav.tsx`, `ActivityMenu.tsx`, `SidebarProvider.tsx`, `CommandPalette.tsx`, `web/src/lib/queries.announcements.ts`, `web/eslint.config.mjs`, `web/vitest.config.mts`, `web/package.json` + `package-lock.json` (`@playwright/test` 1.63.0 exact, desktop's pin), `web/test/grade-model/fc-params.ts`, `web/src/components/planner/PlannerWeek.module.css`, `web/test/planner-css.test.ts`, `Bell.test.tsx`, `CommandPalette.test.tsx`, `CourseSidebar.test.tsx`, new `fc-params.seed.test.ts`, `web/.gitignore` (not the root file, which Phase 14 edits), `web/e2e/**` (the config included; `login.mjs` and the config read `WALK_BASE_URL`, default the local dev server), the favicon files, `desktop/src/core/poller/reducer.ts`, `desktop/src/main/notify.ts`, `desktop/test/unit/reducer.test.ts`, `notify.test.ts`, `audit.test.ts` |

No path appears in two rows. Tasks cross a row only by running another owner's file: W-45's T-11 runs W-47's
`e2e/item-popout.spec.ts`; W-46's T-18 runs the unchanged `InboxApplyButton.test.tsx`; and the (c) screenshots 03–08
of T-12, T-13, T-15, T-17 and T-19 are taken by W-47's `walk17.spec.ts`, which fulfils `v_scheduler_heartbeat` for 08
from the `failing` fixture in `web/test/NeedsAttention.heartbeat.test.tsx` (the row is copied into the spec, not
imported, so neither worker edits the other's file). T-23's lint fix is split by site, and each worker edits only
the sites in its own row.

### Seams

* **Phase 15 (before).**
  * Every `db/tests/phase17_*.sql` runs through Phase 15's runner, `scripts/db-test.mjs` (**new in Phase 15**; if
    brief 95 freezes another name, every check below reads that name). The runner exits non-zero on any FAIL
    (P-99) and runs as the `db_test_runner` role over `BB2DASH_TEST_DB_URL`.
    The role and the DSN are B-42's default (**PROVISIONAL B-42**, brief 95's B-42 row). What changes if Stack
    answers "no credential" or an owner-level DSN (117 not written, the MCP pastes, T-10's counts and checks, the
    DoD lines) is listed once, in this brief's B-42 row.
  * New functions pin `search_path = public, pg_temp`, so the advisor count 15 leaves does not grow.
  * `db_test_runner` (100) holds execute only on the functions today's suite calls. What this phase's files need
    beyond that is granted in 117, inside this phase's range, on the rule brief 95's Phase 16 seam row sets with
    107: never through `service_role` membership.
  * R-54's trigger is 15's. Its browser proof, both last-row deletes, is walked here in T-26.
  * 116 deletes `phase12b_077_inbox_feedback.sql` and this phase adds seven `phase17_*` files. After the merge
    the runner's unit count is Phase 15's final count − 1 + 7. `node scripts/db-test.mjs --only <file>` (brief 95)
    is how each task below runs one file.
* **Phase 16 (parallel).** This phase touches no grades file: `web/src/lib/grade-model/**`, `queries.grade*.ts`,
  `grade-model-view.ts`, `grades-sections.ts`, `web/src/components/grades/**`, `app/(app)/grades/**` and
  `course/[id]/grades/**` are all out. R-36's rule line (16) and R-50's favicon (here) are B-23's two early
  Phase 13 carry-ins. `test/grade-model/fc-params.ts` is W-47's; 16 does not edit it. R-51's optional dead-code
  removal (`gradeHistoryOptions`, `historyByColumn`) is left for that reason.
* **Phase 18 (parallel).**
  * 18 owns `stage_files`, the search RPCs, `ingest/` and `skills/bb-sync`, and 17 touches none of them.
  * 18's scripted fetch writes `storage_path` with an UPDATE, which fires 114's `bb_files` trigger and closes that
    file's gap. 18 keeps those writes as UPDATEs.
  * 18's new `stage_files` counts get Activity sentences only under P-72's convention.
  * `CourseScreen.tsx` is touched by both phases, named hunks only, and the second to merge rebases. This phase
    does not edit `AssignmentDetailBody.tsx` or `PlannerItemPopover.tsx`.
  * 18's task 23 (R-69) repoints `SubmissionBlock`'s staged link to the item URL. Whether Phase 18 is merged to
    `main` at T-26's production sitting decides that link's href. T-26 names the probe (`git ls-tree` on
    `origin/main` for `web/src/lib/blackboard-link.ts`) and the expected value under each order, and passes the one
    in force as `WALK_STAGED_HREF`.
  * Brief 98's W-51 may touch `web/src/lib/queries.announcements.ts`, `web/src/components/shell/Bell.tsx` and the
    not-recorded cases of `web/test/Bell.test.tsx` as a fallback (its task 18). All three are W-47's here (T-23). If 18 uses the fallback, the same named-hunk rule
    applies, and the second phase to merge re-runs `npx eslint . --max-warnings 0` after its rebase.
  * `DATA_SYNTAX.md` gets entries from both phases, in different sections. `database.types.ts` is regenerated
    by each PM from prod. The second phase to merge regenerates it again after both phases' migrations are
    applied, rather than hand-merging it.
* **Phase 19 (after, 94 §3 "17 → 19").**
  * 19's 133 re-creates `v_course_stream` from **110's** live body and keeps the 8 columns.
  * 19's 131 only re-comments `v_content_tree`, whose 19-column list is this phase's. `missing_since` here is the
    P-98 run id surfaced in a view, and 19 adds no stored column.
  * 19's 130 re-checks P-11's three moves (idempotent).
  * 19 leaves `v_scheduler_heartbeat` untouched and adds the run-state word through `freshnessLine` and 137's
    `v_sync_status` (R-41's other half).
  * R-41 is 19's in the phase map. Brief 99 names "the per-class thresholds" as 17's. Here they are B-20's
    default, "Phase 9's thresholds", so this phase builds no threshold change. R-41's per-stream
    `{stream, last_seen_at, state}` read with "never synced" is scheduled in Phase 19, in its
    `db/migrations/137_sync_status_run_state.sql` (brief 99; the PM's seam decision). This brief points there and
    does not schedule it. R-41's run-state half stays with 19 as well.
  * 19's 134 re-creates `sync_change_lines` from **115's** body and keeps P-72.
  * `stage_content`, the `bb_item_id` key, the partial-unique-constraint pitfall and the ghost delete (P-25) are all
    19's. This phase changes no key or constraint.
* **Phase 22 (last).**
  * R-46's 390 px check and 22's theme walk run as `web/e2e/phone-width.spec.ts` and `web/e2e/theme-walk.spec.ts`
    inside this phase's P-7 harness (`web/e2e/`, the folder brief 103 assumes). They use its saved session, its
    `WALK_BASE_URL` and its forced failed read. The config sits at `web/e2e/playwright.config.ts`, so 103's harness
    runs (`cd web && npx playwright test -c e2e/playwright.config.ts <spec>`) work as written. 103's specs write
    their screenshots into `walk-22/` by explicit path, and 103 edits neither the config nor `login.mjs`.
  * 22 reuses the reshaped `usePopover` (R-51) as is; the three menus are reshaped once, here.
  * The token audit (P-15 … P-17) stays 22's. Under brief 103's provisional B-6 exception, its test-only tasks 1–2
    may ride this PR as 22's own commits. They touch no file listed in §Files and are not part of this phase's DoD.
  * C-1 stays 22's. C-3 leaves Phase 13's parked list by B-23's DECISIONS row.
* **Phase 14 / 20.**
  * The heartbeat view is what a container scheduler's `last_run_at` feeds later (`82_PHASE14_containers.md`,
    §"What the research changed", item 3); nothing here waits on 14.
  * C-13's Notifier swap is 14's.
  * /inbox-apply's vault path (R-97) is 20's. R-57's documented home for why-notes is the decisions store, and this
    phase edits no skill.
* **Sprint-1 objects.** 027 (both views), 063's unread predicate, 041 `attention_answered`, 054 `stage_gaps`, 051
  `sync_change_lines`, 077 `v_inbox_feedback`, 090's archive semantics, `archive_attention_item()` (it still refuses
  open rows) and C-7 rule 2 in `80_PHASE12_electron.md`.

### Must respect (verbatim, DECISIONS.md)

* [2026-09-10] "Post-Phase 7 scope is `docs/planning/sprint-1-hub/60_REQUIREMENTS_v2.md`; course page is **Google Classroom-style** (Stream landing, Classwork by Blackboard folder, Grades, Info), timeline kept as a sub-view"
* [2026-09-10] "Popouts are route-driven (`?item=assignment:<id>` / `session:<id>`), mounted once in the app layout"
* [2026-09-21] "Every other screen keeps the `?item=` popout."
* [2026-09-16] "A client screen that hydrates inside a Suspense boundary and reads the persisted query cache or the clock renders a placeholder until hydrated (`useHydrated`, `useSyncExternalStore` with a false server snapshot); `/planner` is the first"
* [2026-09-10] "**All 15 public views are `security_invoker`** with anon revoked (migration 036, guard block refuses a future non-invoker view)"
* [2026-09-10] "Hand-narrowed row interfaces kept for `v_course_stream` / `v_content_tree` / `v_course_display` after regenerating `database.types.ts`"
* [2026-09-10] "Parallel phases get **non-overlapping migration ranges** (Phase 8 = 026–029, Phase 9 = 030–039) allocated in the briefs"
* [2026-09-13] "One `FileOpenAction` component owns the file Open ladder on every screen; `fileHonesty` answers `unknown` ("Not stored") for fields a source does not carry rather than asserting there is no route"
* [2026-09-15] "The bell's seen mark is 033's `announcements.read_at`; unread = `read_at is null and not is_read`; the dropdown **and** `/announcements` clear it"
* [2026-09-14] "Bell: **opening the dropdown marks its items seen** (badge clears); no per-item read tracking in the MVP"
* [2026-09-17] "**The one sanctioned sync write to planner state:** `stage_gradebook` sets `assignment_progress.status = 'graded'` when Blackboard posts a score, forward-only from not opened / in progress / submitted, never from excused or DNF, and (087) only when the score is new or changed in that run, so a deliberate revert by Stack sticks. Everything else in `assignment_progress` / `reading_progress` is still never written by a sync" (115's `auto_graded` sentence reports this write and adds none)
* [2026-09-17] "**One status vocabulary, six offered values:** not opened · in progress · submitted · graded · excused · DNF, held in `web/src/lib/progress-status.ts`."
* [2026-09-10] "IST.466's duplicate content paths left as first-wins (5 rows counted, none invented)"
* [2026-09-17] "**Deferred: `bb_content` key change** for IST.466's duplicate folder paths (P-data-1) to the next phase that touches `stage_content`"
* [2026-09-10] "`bb-files` Storage bucket **private** (migration 030); reads go through signed URLs only"
* [2026-09-15] "a staged file whose sha256 matches a pulled-back copy **stays listed** with a "matches" chip"
* [2026-09-15] "`bb_files.source_url` becomes nullable with a check that only `classified_by = 'stack'` rows may lack one"
* [2026-09-15] "`my_submissions` rows are **exempt from `stage_files`' missing marker (053) and from `stage_gaps`' "bytes never stored" gap when they carry an `attempt_id` (054)**; step 4b reports files it could not pull in its own summary"
* [2026-09-11] "SECURITY DEFINER transform functions are not callable by `authenticated` (038); the app's only path to a transform is an `agent_requests` row"
* [2026-09-15] "One open `sync` request at a time: while a `queued`/`claimed` sync exists, the Sync button re-copies its command instead of inserting another row"
* [2026-09-10] "Inbox resolutions carry a free-text `resolution_note` ("why") and are applied by the next transform, never directly"
* [2026-09-14] "`attention_items` dedupes only while `state = 'open'` (041); a "Keep mine" answer stands until Blackboard's value changes (042); `applied_at` is set only when a fact was written, otherwise the row stays "answered, applies on next sync" (042)"
* [2026-09-22] "**An answered Inbox row is processed once and archived: `attention_items.state = 'archived'` (090) with `archived_at`, `archived_by` and a `decision` record; `archive_attention_item()` is the only way in; `v_inbox_queue` is the worker's queue.** A state, not a second table" (114 adds a second, machine-only way in, under B-29's DECISIONS row)
* [2026-09-17] "**Inbox why-notes are positioned as feedback for a later agent:** view `v_inbox_feedback` + `agent_requests.kind = 'inbox_feedback'` (ignored by `transform_tick`); no agent built. Buttons on kinds `apply_resolutions` never applies say "recorded only"" (116 retires the view under R-57's DECISIONS row; the kind stays)
* [2026-09-22] "**Decisions are stored twice, on purpose:** one vault note per item under `projects/bb2dash/decisions/` with `collection: bb2dash-inbox-decisions` (its own section of the rag store, queried with `search_context({collection})`), and a per-day repo log `docs/inbox-decisions/YYYY-MM-DD.md`"
* [2026-09-10] "Transform runs as SQL functions on **pg_cron inside Postgres** (`transform_tick` every 2 min), not as an edge function or a local hub"
* [2026-09-15] "The calendar push has **its own pg_cron job** (`bb2dash-calendar-push`, `1-59/2`) and its own `calendar_push_runs` table; a statement trigger on `assignments` marks `app_settings.gcal_dirty`; Phase 9's `run_transform` / `transform_tick` are not redefined"
* [2026-09-15] "The Cloud project is owned by Stack's personal Gmail; the `bb2dash` calendar and the consent grant are the SU Workspace account's (`emstacho@g.syr.edu`); consent screen External, published to Production" (T-27's row records whether the screen really was)
* [2026-09-15] "Google OAuth secrets live in **Supabase Vault** behind two service_role-only RPCs (`calendar_secret_set`, `calendar_secrets`); `calendar-push` runs with `verify_jwt = false` and authenticates the tick's `x-push-secret` header (from Vault, constant-time compare); the refresh token is minted once by `scripts/google-consent.mjs` on Stack's machine (loopback, PKCE) and never passes through chat, the repo or a browser bundle"
* [2026-09-22] "**`/inbox-apply` is the worker 077 left a queue for** (`skills/inbox-apply/SKILL.md`, request kind `inbox_feedback`): Sonnet agents gather context (syllabus rule, course precedent, Blackboard facts, prior decisions), one Opus agent writes under rules, the session records and archives. It flags feature changes and merges, raises new questions through `raise_attention()`, and never resolves an open row."
* [2026-09-10] "Sync cadence: **Stack triggers**, the app does the rest; no scheduled crawl, no reminders"
* [2026-09-15] "Score-change counts (`scores_new`, `scores_changed`) are computed **only when the folded run is the newest registered crawl** (056, reusing 043's predicate); older runs report 0 with `older_run: true`"
* [2026-09-17] "**A gradebook column shared on purpose is not a conflict** (084): when every assignment matched to a column already carries that `bb_column_id`, `stage_assignments` restamps them all (075) and raises nothing"
* [2026-09-16] "Kind colours in Google: Event 9 Blueberry, Task 1 Lavender, Out of office 4 Flamingo, Focus time 8 Graphite, Working location 2 Sage, Appointment slot 5 Banana (three are also course colours)"
* [2026-09-16] "The planner-event live proof ran on Stack's real `bb2dash` calendar with SQL-inserted `bb2dash test · …` rows, all deleted and pushed away in the same sitting (Google 64 = mirror 64 at the end); web workers never write `planner_events` on prod"
* [2026-09-21] "**A series rule (frequency, end date) is not editable after creation; Repeats is offered on create only.**"
* [2026-09-16] "A planner event stores **instants plus its own IANA zone**; the web converts a wall clock to an instant once, with Temporal's `compatible` rule (a repeated fall-back time takes the earlier instant, a skipped spring-forward time moves forward), and SQL never re-derives an instant from a wall clock."
* [2026-09-10] "Tracker fetches 56 days, shows 14 with ◂ ▸ paging; the Home course card's "Next due" stays bounded to 14 days"
* [2026-09-22] "**IST.466: Stack is Ethics Team 3 and Major Case Group 2** (Synchrony 10/20, SU IT 11/17). `courses.group_notes` and the two major-project rows (`group_key`, descriptions) corrected to match; the 9/17 row above was already right"
* [2026-09-15] "An attendance column renders **among the item rows only when its linked assignment has a `component_id`** (`v_gradebook_latest.counts_toward_grade`)"
* [2026-09-16] "**three carried to Phase 13** as named exceptions to its no-layout-change rule (phone-width overflow, per-exam rank weights, favicon)"
* [2026-09-22] "**Sprint 1 closed; Phase 13 (styling, R-21) skipped, not cancelled.** More development phases come first; C-1..C-3 stay parked in `docs/planning/sprint-2/parked/81_PHASE13_styling.md`"
* [2026-09-09] "Renderer: CSS Modules + custom properties, **no Tailwind**"
* [2026-09-10] "`web/` test harness is vitest + Testing Library (jsdom), versions pinned exact; coverage `include` scoped to `queries.search.ts` until screens gain tests"
* [2026-09-14] "Sidebar open/closed lives in `html[data-sidebar]`, stamped by an inline boot script before first paint and owned by React after mount"
* [2026-09-14] "Electron MVP = shell (own window, taskbar icon, single instance) + desktop notifications for all three R-26 triggers + Sync button"
* [2026-09-16] "**Phase 12 started; Contract C-1..C-13 frozen in `80_PHASE12_electron.md`.**" (B-58 amends C-7 rule 2 by its own row)
* [2026-09-17] "**Phase 12 built: Electron pinned to 44.4.1** (exact, not ranged); unpacked `electron-builder --dir` build with `asar: false`; the AppUserModelID `su.stack.bb2dash` is written on both the Desktop and the Start Menu shortcut"
* [2026-09-16] "Phase 12's OneDrive file mirror is **dropped**"
* [2026-09-14] "**Definition of done for every remaining phase = SOP gates + Stack's acceptance script** walked on the Vercel preview; sign-off once per phase, at the PR"
* [2026-09-14] "**Every task carries an executable check** (test, SQL assertion, curl, screenshot diff) the worker runs itself, plus one demo line for the acceptance script; a task without a check is not a task"
* [2026-09-15] "Parallel PM sessions never branch or commit in the shared checkout `C:/Users/stack/projects/bb2dash`; each phase branch is its **own worktree** (`bb2dash-wt-<phase>`) and the brief is edited there"
* [2026-09-23] "**Sprint 2 planning proceeds stage to stage without a stop**; the PM stops only where Stack's input is required (his §3 fields, the question batch, the phase-plan approval) and otherwise proceeds on stated defaults, each recorded here when adopted"
* [2026-09-24] "STATUS's known-issue rows that sprint 1 fixed are struck through with the fixing migration named, not deleted"

## MVP (in Stack's words)

Stack wrote four lines for this phase (`91_` §3): "upcoming work scrollable"; "collapse undated and move to bottom of
page"; "entire materials section collapse to just header upon clicking the header and text"; and "bug fixing".
Everything else in this paragraph is **the PM's wording** of the 93 §5 acceptance defaults, and Stack has not yet
confirmed it. *He can wheel and drag the Upcoming strip with a plain mouse on Home and on a course page, and ◂ ▸
still work. Undated sits folded just above Needs attention. Clicking a course's name on Materials folds its whole
section. Every post on a course Stream opens what it is about, an assignment's status changes from the Stream, and
"unread" agrees with the bell. Classwork shows Blackboard's tree once, with a note on hover. No popout link throws
an error. Nothing on Info says something false. An answer in the Inbox can be applied without a sync. A dead
calendar push or a stopped scheduler says so on Home. The things built in sprint 1 but never used (staging a file,
recurring events, the popover, the toasts) have been used once, on production, and worked.*

## Definition of done

### SOP gates

- [ ] `cd web; npm run typecheck; npm run build; npx vitest run` passes, and the test count is not below `main`'s.
- [ ] `cd web; npx eslint . --max-warnings 0` exits 0.
- [ ] `cd desktop; npm run typecheck; npx vitest run` passes. mcp-server is untouched, so its suite is not run.
- [ ] `node scripts/db-test.mjs` prints `failed 0` and exits 0, with every `phase17_*.sql` PASS. Every file rolls
      back. (B-42 "no credential": every unit is pasted through MCP `execute_sql` instead and ends in its `: PASS`
      row, as the B-42 row sets; **PROVISIONAL B-42**.)
- [ ] Migrations 110–117 (110–116 when B-42 drops 117) are applied under their file names, byte-identical to the repo. `database.types.ts` is
      regenerated with only this phase's objects (DECISIONS 2026-09-16).
- [ ] `web/e2e/.auth/state.json` is deleted and was never committed (`git log --all --oneline -- web/e2e/.auth` prints
      nothing).
- [ ] `/code-review main high`: CRITICAL and HIGH findings cleared.
- [ ] `/security-review` is required here, because the phase adds a definer function in a new schema, a definer
      trigger, a view drop, a new `agent_requests` insert path, and a harness that stores a session on disk.
- [ ] STATUS, DECISIONS (T-29's rows) and ORCHESTRATOR are updated in this PR. The PR is open, a Vercel preview is
      linked, and nothing is merged until Stack says so.
- [ ] Every row of the task list passes its check, and its evidence is in `97w_PHASE17_WALK.md`.

### Stack's acceptance script (on the preview, then the named production sittings)

1. **Home.**
   * Over Upcoming, wheel with a plain mouse: the strip moves.
   * Drag it: it moves, and releasing does not open a card.
   * Click a card: its popout opens. ◂ ▸ page as before.
   * Undated is folded just above Needs attention. Open it and reload: it stays open.
2. **Course stream.** Open IST.352 → Stream.
   * Click an assignment post: its popout opens.
   * Change its status in the Stream: Home's tracker shows the same status.
   * Your submission file (Role_of_Systems_Analyst.docx) is not posted as Material (105 §3; the IST.471 PDF is on
     IST.471's Stream, where the same rule holds).
   * No announcement says unread once the bell is opened.
3. **Classwork.** Open IST.352 → Classwork.
   * "WK01 - The Systems Development Environment" appears once, with no old "WK01 - Chapter 1" folder beside it,
     and its three Knowledge Checks carry the drop zone.
   * "Show 2 items Blackboard no longer lists" reveals two labelled rows (B-19, PROVISIONAL: the PM's reading).
   * Hovering a file shows its note.
4. **Info and timeline.**
   * IST.466 → Info: no "Blackboard disagrees" caption.
   * IST.466's timeline marks the starred sessions, for example 9/29 and 10/1.
5. **Materials.** Click a course's name: the whole course folds, and reload remembers it. The bucket toggles still work.
6. **Popout link.** Paste `/course/IST.471/classwork?item=assignment:IST.471/a1-proposal` into a new tab. The PM shows
   the console: no #418.
7. **Inbox.**
   * Press "Apply answers now": one request is filed.
   * Press it again while it runs: nothing new is filed.
   * The Inbox refreshes when it settles.
8. **Planner sitting, with the PM, on production.**
   * Create a daily series from Nov 9 to Nov 13: five rows.
   * Create a monthly series from Oct 31 to Dec 31: two rows, November skipped.
   * The form refuses 53 occurrences, and nothing is saved.
   * A Los Angeles 09:00 weekly series from Oct 26 to Nov 9 (across Nov 1) stays at 12:00 on the grid.
   * A due-item popover near the bottom opens above its card, and one in the Sunday column clamps right.
   * Deleting the last row of each series leaves 0 series.
   * Everything is deleted and pushed away in the same sitting.
   * Keep or change the kind colours (B-31).
9. **Staging, on production.**
   * Stage your original *Internship Proposal Agreement v2* on IST.471's A1 popout: it reads "matches".
   * Stage *Role_of_Systems_Analyst.docx* from its IST.352 Classwork row: it reads "matches".
   * Stage an earlier draft: it reads "differs", and is removed in the same sitting.
   * Materials → IST.471 lists the staged original under My submissions.
   * The popout's "Staged in bb2dash — attach in Blackboard ↗" link opens IST.471 in Blackboard: the course outline,
     or A1's own page if Phase 18 is on production by then (T-26). No control reads "Submit".
10. **Desktop shell.**
    * Report the grade, due-tomorrow and sync-landed toasts.
    * Click one banner and one older Action Center entry: each opens the right screen.
    * A second Sync press says "command copied".
    * One Blackboard link opens in your browser.
11. **Google consent screen (P-14).** Read the publishing status. If it says Testing, publish it and re-run
    `scripts/google-consent.mjs`, before 2026-10-01 17:03Z.
12. **Favicon.** The browser tab shows the eclipse-ring icon.

### What proves each requirement

* **R-37:** T-03's view test and T-12's stream tests, plus acceptance step 2.
* **R-39 (interim):** T-03, T-04, T-05 and T-13, plus step 3. The ghost delete is Phase 19's.
* **R-40:** T-04 and T-13 (`·note` and title), plus step 3.
* **R-42:** T-18's test and SQL, plus step 7.
* **R-43:** T-11's hydration test and harness spec, plus step 6.
* **R-44:** T-21's CSS test and screenshots, the CR-1, CR-5 and CR-7 screenshots in T-26, and T-24's X-2 log line.
* **R-45:** T-14's grep count of 0, plus step 4.
* **R-47:** T-26's SQL counts (the rows, their `assignment_id`, sha256 and Storage key), its chip and My submissions
  screenshots, the staged link's `href` assertion and `audits.test.ts`'s no-"Submit" block, plus step 9.
* **R-48:** T-29's DECISIONS row closing the web half, after T-24.
* **R-49:** T-15's test and screenshot, plus step 4.
* **R-50:** T-20's `cmp` and HTTP 200s, plus step 12.
* **R-51:** T-22's coverage run, recorded figure and seed test, T-23's `--max-warnings 0`, and T-29's STATUS coverage
  line.
* **R-52:** T-06's stage fixtures, T-19's Home-line test, and T-27's post-2026-10-01 SQL.
* **R-55:** T-26's before and after counts, its daily, monthly and Los Angeles series SQL, the 53-occurrence refusal
  and its screenshots, plus step 8.
* **R-56:** T-07's fixture test and T-18's reopened-row line.
* **R-57:** T-09's `to_regclass` null and the file count, and T-29's repointed STATUS rows, its R-57 DECISIONS row and
  the `decided_by` count over the vault's decision notes.
* **R-58:** T-08's sentence test, with `phase10a_stage_gradebook.sql` still PASS.
* **R-59:** T-29's DECISIONS row and the struck STATUS lines.
* **R-108:** T-24's log counts and T-25's reducer tests.
* **S2-home-1:** T-16, plus step 1.
* **S2-home-2 and S2-materials-1:** T-17, plus steps 1 and 5.
* **S2-bugs-1:** T-28's ledger with no open row.

## Task list

Checks run from the repo root unless they start with `cd`. Check forms: (a) a named test or spec with its exact
command and result; (b) SQL with its expected value; (c) a screenshot path and exactly what must be visible in it;
(d) a count or exit code with its exact command; (e) an HTTP status for a URL. Inside the table, `\|` is Markdown's
escaped pipe: the shell command or SQL has a plain `|`. A W-44 task's (b) checks run once the PM has applied its migration;
its (a) runner check runs once 117 is applied (T-10), or once 116 is when B-42 drops 117. "`<file>` PASS" means
`node scripts/db-test.mjs --only <file>` (Phase 15's runner, brief 95) prints `PASS  <file>` and
`db-test: passed 1, failed 0, units 1`, then exits 0 (under B-42 "no credential", the MCP paste the B-42 row
describes). Screenshots go under `docs/planning/sprint-2/walks/walk-17/`. Harness runs set `WALK_BASE_URL` to the phase preview (or production where
the row says so) and use a session `login.mjs` saved against that same host (T-01).

| # | task | covers | owner | deterministic check | demo line for Stack |
|---|---|---|---|---|---|
| T-01 | Logged-in walk harness. `login.mjs` reads `WALK_BASE_URL` (default `http://localhost:3000`, the local `next dev` server), so the PM and Phase 22 can point it at a preview host. It opens headed Chromium at that host's `/login`, waits for Stack or the PM to sign in, and saves `web/e2e/.auth/state.json` (gitignored). The saved session is host-only, so a run against another host re-runs `login.mjs` with that `WALK_BASE_URL` first. The config takes its base URL from the same variable and default. The specs only read, never write. The config writes screenshots to `walk-17/`. W-47 also writes `item-popout.spec.ts` (run by T-11) and `walk17.spec.ts` (the screenshot rows and the forced failed read) | P-7 | W-47 | (a) `cd web; npx playwright test -c e2e/playwright.config.ts e2e/harness.spec.ts -g "signed in"` → 1 passed; (c) `01-harness-home.png` shows Home signed in, with the Sync button and the "Undated" heading visible; (d) `git check-ignore web/e2e/.auth/state.json` → exit 0; (d) `grep -l "WALK_BASE_URL" web/e2e/login.mjs web/e2e/playwright.config.ts \| wc -l` → 2 and `grep -l "localhost:3000" web/e2e/login.mjs web/e2e/playwright.config.ts \| wc -l` → 2 | "Every screenshot in this walk re-runs with one command." |
| T-02 | Extract the warm-cache / `renderToString` / `hydrateRoot` scaffold into `web/test/hydration-harness.tsx`; `PlannerWeek.hydration.test.tsx` uses it | P-73 | W-45 | (a) `cd web; npx vitest run test/PlannerWeek.hydration.test.tsx` → 0 failures; (d) `grep -c "hydration-harness" web/test/PlannerWeek.hydration.test.tsx` → ≥ 1 (0 today) | — (test seam) |
| T-03 | Migration 110: `v_course_stream` unread flag, file routes, the my-submissions and missing filters | P-9, R-37, R-39 | W-44 | (a) `phase17_110_course_stream.sql` PASS, asserting (b) `select count(*) from v_course_stream s join bb_files f on s.ref_kind = 'bb_file' and f.id = s.ref_id::bigint where f.bucket = 'my_submissions' or coalesce(f.notes,'') like '%missing_since_run=%'` → 0; `select count(*) from v_course_stream s join bb_content b on s.ref_kind = 'bb_content' and b.id = s.ref_id::bigint where b.detail->>'missing_since' is not null` → 0; `select (select count(*) from v_course_stream where post_kind = 'announcement' and (meta->>'is_unread')::boolean) = (select count(*) from v_announcements_unread)` → true; `select count(*) from information_schema.columns where table_name = 'v_course_stream'` → 8; `select has_table_privilege('anon','public.v_course_stream','select')` → false | "Your submissions and vanished items are off the Stream." |
| T-04 | Migration 111: `v_content_tree` + `missing_since`, `notes` | P-10, R-39, R-40 | W-44 | (a) `phase17_111_content_tree.sql` PASS, asserting (b) `select count(*) from information_schema.columns where table_name = 'v_content_tree'` → 19; `select string_agg(column_name, ',' order by ordinal_position) from information_schema.columns where table_name = 'v_content_tree' and ordinal_position > 17` → `missing_since,notes`; `select (select count(distinct content_id) from v_content_tree where missing_since is not null) = (select count(*) from bb_content where detail->>'missing_since' is not null)` → true | — (seam for T-13) |
| T-05 | Migration 112: the three Knowledge Check links move to the live rows | P-11, R-39 | W-44 | (a) `phase17_112_knowledge_check_rehome.sql` PASS; after apply (b) `select count(*) from bb_content where assignment_id is not null and detail->>'missing_since' is not null` → 0; `select count(*) from bb_content where id in (1602,1603,1604) and assignment_id is not null` → 3; `select count(*) from bb_content where assignment_id is not null` → 21 | "The Knowledge Check drop zones are on the rows Classwork shows." |
| T-06 | Migration 113: `private` schema, `heartbeat_stage`, `scheduler_heartbeat`, `v_scheduler_heartbeat` | P-12, P-71 | W-44 | (a) `phase17_113_scheduler_heartbeat.sql` PASS, asserting `private.heartbeat_stage` on fixed inputs (age 200 s → ok, 300 s → late, 700 s → missing, null → missing, 3 failures → failing, 2 failures → ok, inactive → off), a non-owner JWT → 0 rows, and anon denied; (b) after apply, `begin; select set_config('request.jwt.claims', json_build_object('sub', public.app_owner(), 'role', 'authenticated')::text, true); set local role authenticated; select count(*) from v_scheduler_heartbeat; rollback;` → 2; (d) `get_advisors` (type `security`, Supabase MCP) findings naming `scheduler_heartbeat`, `heartbeat_stage` or `v_scheduler_heartbeat` → 0 | — (seam for T-19) |
| T-07 | Migration 114: gap self-close | R-56 | W-44 | (a) `phase17_114_close_cleared_gaps.sql` PASS, with fixture cases: an open storage_path gap whose file gets a `storage_path` by an owner UPDATE → `state = 'archived'`, `archived_by = 'stage_gaps'`, `decision->>'closed_itself' = 'true'`; `attention_answered` for that key → false; a second self-close within 24 h → the row stays open with `suggested->>'reopened_within_24h' = 'true'`; a Stack-dismissed key → `attention_answered` true, and no re-raise; `archive_attention_item` on an open row still raises; each of the other three conditions closes on `stage_gaps`; `has_function_privilege('authenticated','public.close_cleared_gaps(bigint,text)','execute')` → false | "A gap closes itself when the file lands; one that keeps coming back stays for you once." |
| T-08 | Migration 115: `sync_change_lines` + three sentences + the P-72 comment | R-58, P-72 | W-44 | (a) `phase17_115_sync_change_lines.sql` PASS, asserting (b) `select jsonb_array_length(sync_change_lines('{"gradebook":{"auto_graded":2},"files":{"reading_links":{"linked":2},"missing_cleared":1},"assignments":{"conflicts_settled":6,"shared_columns":1}}'::jsonb))` → 3; `select sync_change_lines('{"assignments":{"conflicts_settled":6,"shared_columns":1}}'::jsonb) = '["Nothing changed"]'::jsonb` → true (051:110-112's closing rule: the steady counts add no sentence); (a) the full runner run keeps `phase10a_stage_gradebook.sql` PASS | "Activity names auto-graded items, linked readings and returned files, and stops repeating the steady counts." |
| T-09 | Migration 116: retire `v_inbox_feedback`; delete its 077 test | R-57 | W-44 | (a) `phase17_116_retire_inbox_feedback.sql` PASS, asserting (b) `select to_regclass('public.v_inbox_feedback')` → null, an `agent_requests` insert of kind `inbox_feedback` accepted in-transaction, and `v_inbox_queue` selectable by the owner; (d) `ls db/tests \| grep -c phase12b_077` → 0 | — (why-notes live in the decisions store) |
| T-10 | PM integration: apply 110–117 to prod under their names, in number order, as W-44 hands each over (117 last, once W-44's dry run of the seven `phase17_*.sql` files has named every grant they need; 110–116 only when B-42 drops 117); regenerate `database.types.ts`; merge the worker branches | P-9, P-10, P-12 | PM | (b) `select count(*) from supabase_migrations.schema_migrations where name ~ '^11[0-7]_'` → 8 (7 when B-42 drops 117); (b) for each of the eight (seven), `select md5(statements[1]) from supabase_migrations.schema_migrations where name = '<name>'` equals `git show HEAD:db/migrations/<file> \| md5sum` (the LF form, as `80k_W34_VERIFICATION.md` recorded it; prod's `statements[1]` held the whole file for 085, 088 and 090 on 2026-09-27): 8 of 8 equal (7 of 7 when B-42 drops 117), table in `97w_PHASE17_WALK.md`; B-42's default only: (b) `select has_function_privilege('db_test_runner', 'private.scheduler_heartbeat()', 'execute') and has_function_privilege('db_test_runner', 'public.close_cleared_gaps(bigint,text)', 'execute') and has_function_privilege('db_test_runner', 'public.stage_gaps(uuid,bigint)', 'execute')` → true; `select count(*) from pg_auth_members m join pg_roles g on g.oid = m.roleid join pg_roles u on u.oid = m.member where u.rolname = 'db_test_runner' and g.rolname in ('service_role', 'postgres')` → 0; unless B-42 is "no credential": (d) `node scripts/db-test.mjs --list \| grep -c "phase17_"` → 7; always: (d) `grep -c "v_inbox_feedback" web/src/lib/supabase/database.types.ts` → 0 and `grep -c "v_scheduler_heartbeat" web/src/lib/supabase/database.types.ts` → ≥ 1 | — |
| T-11 | `ItemPopout` hydration gate; one hydration test per `?item=` kind | R-43, P-73 | W-45 | (a) `cd web; npx vitest run test/ItemPopout.hydration.test.tsx test/ItemPopout.test.tsx` → 0 failures (assignment and session, warm cache, `onRecoverableError` called 0 times); (d) `grep -c "useHydrated" web/src/components/popout/AssignmentDetailBody.tsx` → 0; (c) `02-popout-pasted.png` shows the IST.471 A1 assignment popout open over IST.471 Classwork after a cold load of the pasted URL; (a) `cd web; npx playwright test -c e2e/playwright.config.ts e2e/item-popout.spec.ts` → exit 0, 0 failed (0 console messages matching `/418/` on `/course/IST.471/classwork?item=assignment:IST.471/a1-proposal`, one `?item=session:` URL taken from IST.466's timeline, and `/course/IST.471/assignment/IST.471/a1-proposal`, each loaded with the cache warm and then cleared) | "Paste any popout link: it opens clean." |
| T-12 | Stream: links per `ref_kind`, `StatusSelect` on assignment rows, the `course-stream` cache branch, the unread tag from `is_unread` | R-37 | W-45 | (a) `cd web; npx vitest run test/course-stream.test.tsx test/progress-cache.test.tsx test/StatusSelect.test.tsx` → 0 failures; (c) `03-stream-ist352.png` shows an assignment post with its status select and a file post with its Open action | "Every Stream post opens its thing; status changes right there." |
| T-13 | Classwork: ghosts never rendered, stale-with-no-twin behind the toggle, file note as title + `·note` | R-39, R-40, P-11 | W-45 | (a) `cd web; npx vitest run test/course-classwork.test.ts test/CourseClasswork.test.tsx` → 0 failures; (c) `04-classwork-ist352.png` shows one "WK01 - The Systems Development Environment" folder and no "WK01 - Chapter 1" folder (its ghost, `bb_content` 50), the three Knowledge Check rows with the drop zone, and the toggle "Show 2 items Blackboard no longer lists" (B-19, PROVISIONAL: the PM's reading) | "Classwork shows Blackboard's tree once; hover a file for its note." |
| T-14 | Info: drop `GROUPS_CAPTION`; `group_notes` still verbatim | R-45 | W-45 | (d) `grep -rl "Blackboard disagrees" web/src \| wc -l` → 0 (1 today, `CourseInfo.tsx:41`); (a) `cd web; npx vitest run test/CourseInfo.test.tsx test/course-info.test.tsx` → 0 failures | "Info no longer says your groups are unresolved." |
| T-15 | IST.466 attendance marker on `SessionRow`, `SessionPanel` and `SessionPopout`, worded from the schedule | R-49 | W-45 | (a) `cd web; npx vitest run test/attendance-marker.test.tsx test/SessionPopout.test.tsx` → 0 failures (a marker shows for `counts_attendance` true only, and never for a non-IST.466 course); (c) `05-ist466-timeline.png` shows the marker on 9/29 and 10/1 and on no unstarred session | "Starred IST.466 days say attendance counts." |
| T-16 | `useHorizontalScroll` (wheel `deltaY` → `scrollLeft` when `deltaX` ≈ 0; drag past 5 px scrolls and swallows the click) on `UpcomingTracker` | S2-home-1, P-69 | W-46 | (a) `cd web; npx vitest run test/use-horizontal-scroll.test.tsx test/UpcomingTracker.scroll.test.tsx test/UpcomingTracker.test.tsx` → 0 failures (cases: wheel moves; horizontal delta untouched; a 3 px press still opens the item; a 20 px drag does not; ◂ ▸ still page 14 days) | "Wheel or drag the strip with a mouse." |
| T-17 | `collapse-state.ts` lift; Undated folded above Needs attention; Materials course header as one button | S2-home-2, S2-materials-1, P-70 | W-46 | (a) `cd web; npx vitest run test/collapse-state.test.ts test/TodayLayout.test.tsx test/MaterialsCollapse.test.tsx` → 0 failures (Undated is the section right before `NeedsAttentionRow` and starts collapsed; a pre-phase `bb2dash.materials.collapsed` value reads back unchanged; the course header is a `button` with `aria-expanded` whose accessible name contains the course name); (c) `06-home-undated.png` shows "Undated (N)" folded directly above Needs attention; `07-materials-folded.png` shows one course folded to its header | "Undated waits folded at the bottom; click a course name to fold Materials." |
| T-18 | `ApplyNowButton` (one open `transform` request at a time); Inbox line for a reopened gap | R-42, R-56 | W-46 | (a) `cd web; npx vitest run test/ApplyNowButton.test.tsx test/Inbox.test.tsx test/InboxApplyButton.test.tsx` → 0 failures (one insert of kind `transform`; a second press while queued makes 0 inserts; attention items invalidated on settle; the reopened line renders); (b) after Stack's press on the preview: `select state from agent_requests where kind = 'transform' order by id desc limit 1` → `done` | "Apply dates and points without a sync." |
| T-19 | `queries.heartbeat.ts` + the NeedsAttention lines | P-12, P-71, R-52 | W-46 | (a) `cd web; npx vitest run test/NeedsAttention.heartbeat.test.tsx test/NeedsAttention.test.tsx` → 0 failures (fixtures: transform `missing` → 1 line; `late` → 0; transform `failing` with 3 → 1 line containing its `last_error`; calendar push `failing` with 3 → a line containing `re-run scripts/google-consent.mjs`; all `ok` → 0); (c) `08-home-push-failing.png`, taken by the harness with `v_scheduler_heartbeat` fulfilled from the fixture, shows the failing-push line | "A dead calendar push or a stopped scheduler says so on Home." |
| T-20 | Favicon + apple icon | R-50, P-80 | W-47 | (d) `cmp web/src/app/favicon.ico desktop/build/icon.ico` → exit 0 and `cmp web/src/app/apple-icon.png desktop/build/icon.png` → exit 0; (e) `curl -s -o /dev/null -w "%{http_code} %{content_type}" <preview>/favicon.ico` → `200 image/x-icon` and `<preview>/apple-icon.png` → `200 image/png` (through `vercel curl` when deployment protection answers 401; same expected status and type); (a) `cd web; npx playwright test -c e2e/playwright.config.ts e2e/harness.spec.ts -g "no 404"` → 1 passed (0 console messages and 0 responses with status 404 on `/`, `/login` and `/course/IST.352/stream`) | "The tab shows the eclipse ring." |
| T-21 | `.blockTime` wraps | R-44 | W-47 | (a) `cd web; npx vitest run test/planner-css.test.ts` → 0 failures, with a new case asserting `.blockTime` has `white-space: normal` and no `nowrap`; (c) `09-planner-1440.png` at 1440 px shows Friday's GEO.103.recitation block with "11:40 AM – 12:35 PM" whole; `10-planner-1040.png` at 1040 px with the sidebar open shows the same block with the range whole, on two lines | "Planner times wrap instead of clipping." |
| T-22 | `coverage.include` widened to every suite-driven module; the measured figure recorded; a floor threshold; `fcParams()` defaults to a fixed seed with an `FC_SEED=random` opt-in | R-51 | W-47 | (a) `cd web; npx vitest run --coverage` → exit 0 with `coverage.thresholds` at the recorded figure rounded down; (d) `grep -c "^T-22 coverage lines " docs/planning/sprint-2/walks/walk-17/97w_PHASE17_WALK.md` → 1 (the measured line %, recorded by the PM), and `grep -c "lines: <that figure rounded down>" web/vitest.config.mts` → 1; (d) `grep -c "thresholds" web/vitest.config.mts` → 1 (0 today); (a) `cd web; npx vitest run test/fc-params.seed.test.ts` → 0 failures (`fcParams().seed` equals the fixed seed when `FC_SEED` is unset) | — (test hygiene) |
| T-23 | `usePopover` reshaped for `Bell`, `TopNav` and `ActivityMenu`; the 7 set-state-in-effect sites (W-45: `CourseInfo`; W-46: `MaterialsBrowser`, `UpcomingTracker`; W-47: `SidebarProvider`, `ActivityMenu`, `CommandPalette`, `queries.announcements.ts`) and 2 exhaustive-deps (W-45: `CourseScreen.tsx`) fixed; both React Compiler rules at `error` | R-51 | W-47 (+ W-45, W-46 at their sites) | (a) `cd web; npx eslint . --max-warnings 0` → exit 0 (27 warnings on `main` a5042fa: refs 18, set-state-in-effect 7, exhaustive-deps 2); (d) `grep -c "'warn'" web/eslint.config.mjs` → 0 (2 today); (a) `cd web; npx vitest run test/Bell.test.tsx test/CommandPalette.test.tsx test/CourseSidebar.test.tsx` → 0 failures | — (menus behave as before) |
| T-24 | Stack's desktop sitting on the unpacked build: three toasts seen, one banner and one Action Center click, a second Sync press, one Blackboard link (X-2) | R-108, R-44 | Stack + PM | (d) `cat "$APPDATA/bb2dash/logs/main.log"* \| grep -c "navigated to"` → ≥ 2 (0 on 2026-09-24); `cat "$APPDATA/bb2dash/logs/main.log"* \| grep "blackboard.syracuse.edu handed to the default browser" \| awk '$1 > "2026-09-22T20:40"' \| wc -l` → ≥ 1 (0 on 2026-09-24); (d) `grep -c "^T-24 Stack 2026-" docs/planning/sprint-2/walks/walk-17/97w_PHASE17_WALK.md` → 1 (one line, `T-24 Stack <date>: …`, naming the three toasts he saw, the screen each click opened and what the second Sync press said) | "The toasts open the right screens." |
| T-25 | C-7 rule 2 outputs (B-58); `notify.ts` hold only if T-24 shows no Action Center navigation; audit patterns for `blackboard.syracuse.edu`, `<webview`/`webviewTag: true`, `setLoginItemSettings` and `OneDrive` | R-108, P-63 | W-47 | (a) `cd desktop; npx vitest run test/unit/reducer.test.ts test/unit/audit.test.ts test/unit/notify.test.ts` → 0 failures (a coalesced group of one → the detail toast; `possible = 0` → a body with no "/ 0"; `audit.test.ts` flags a planted `blackboard.syracuse.edu` string); (d) `grep -c "syracuse" desktop/test/unit/audit.test.ts` → ≥ 1 (0 today; line 81 matches `blackboard.syr.edu`) | "One grade reads as one grade; a zero-point column shows no '/ 0'." |
| T-26 | Production sitting (PM + Stack): planner recurrence and popover walk with the cleanup SQL ready (P-19); both last-row deletes under Phase 15's series trigger; the R-47 staging; the R-44 round-3 screenshots (CR-1, CR-5 in the planner week holding IST.323's Monday Quiz #5 block, reached with the week navigation, CR-7 through the harness's forced failed read) | R-55, P-19, R-47, R-44 | PM + Stack | (b) `select count(*) from calendar_events where source = 'planner'` equal before and after (1 on 2026-09-24 and on 2026-09-27); `select count(*) from planner_event_series` → 0 at the end; `select count(*) from bb_files where bucket = 'my_submissions' and classified_by = 'stack' and source_url is null and assignment_id = 'IST.471/a1-proposal' and sha256 = (select sha256 from bb_files where id = 141)` → 1 and the same with `assignment_id = 'IST.352/role-of-systems-analyst'` and `id = 140` → 1 (140 and 141 are the pulled-back `Role_of_Systems_Analyst.docx` and `Internship Proposal Agreement v2 (1).pdf`, read 2026-09-27); `select count(*) from bb_files where bucket = 'my_submissions' and classified_by = 'stack'` → 2 at the end (the "differs" draft removed, B-25; 0 on 2026-09-27); the Storage key: `select count(*) from bb_files f join storage.objects o on o.bucket_id = 'bb-files' and o.name = substr(f.storage_path, length('bb-files/') + 1) where f.bucket = 'my_submissions' and f.classified_by = 'stack' and o.name = f.course_id \|\| '/my_submissions/' \|\| split_part(f.assignment_id, '/', 2) \|\| '/' \|\| f.file_name` → 2 at the end (`<course>/my_submissions/<slug>/<file>`, no `attempt-` segment); `select count(*) from storage.objects where bucket_id = 'bb-files' and name like '%/my_submissions/%' and name not like '%/attempt-%'` → 2 at the end (0 on 2026-09-27; the draft's object is deleted too); the sitting names its rows `bb2dash test · <case>`; while the daily series (Nov 9 to Nov 13, 2026) exists, `select count(*) from planner_events e join planner_event_series s on s.id = e.series_id where e.title like 'bb2dash test · daily%' and s.freq = 'daily'` → 5; while the monthly series exists, `select count(*) from planner_events where title like 'bb2dash test · monthly%' and series_id is not null` → 2; the 53-occurrence refusal (daily, Nov 9 to Dec 31, 2026): `select count(*) from planner_event_series` equal right before and right after the refused save; while the Los Angeles series (weekly, 09:00 America/Los_Angeles, Oct 26 to Nov 9, 2026) exists, `select count(*), count(*) filter (where (starts_at at time zone 'America/Los_Angeles')::time = '09:00' and (starts_at at time zone 'America/New_York')::time = '12:00') from planner_events where title like 'bb2dash test · la-weekly%' and time_zone = 'America/Los_Angeles' and series_id is not null` → 3 and 3 (Oct 26, Nov 2, Nov 9: both sides of Nov 1, every row at 09:00 Los Angeles and 12:00 New York); (c) `11-monthly-oct31.png`: `/planner` for the week of 2026-10-26 with the `bb2dash test · monthly` event on Saturday Oct 31; `12-popover-above.png`: a due-item popover opened on a card in the grid's lower half, drawn above its card (`walk17.spec.ts` asserts `data-placement="above"` before the shot); `13-popover-right-clamp.png`: a due-item popover opened in the Sunday column of `?week=2026-09-21`, its right edge inside the grid; `14-chip-matches.png`: IST.471's A1 popout with the staged original, the chip "matches" and the link "Staged in bb2dash — attach in Blackboard ↗"; `15-chip-differs.png`: the staged earlier draft with the chip "differs", taken before it is removed; `16-cr1-return-today.png`: Home's Upcoming strip after a free scroll and one ◂ press, with today's card first in view; `17-cr5-ist323.png`: IST.323 Monday 3:45–5:05 PM with Quiz #5 nested, in whichever planner week holds it (week navigation); `18-cr7-could-not-load.png`: a Home course card reading "could not be loaded" under Blackboard and "could not be worked out" under Graded so far, both reads aborted by the harness; `19-refuse-53.png`: the new-event form with Repeats daily from Nov 9 to Dec 31, 2026 and the message "A repeating event is limited to 52 occurrences — choose an earlier end date." (`web/src/lib/planner-recurrence.ts:118`); `20-la-weekly-nov2.png`: `/planner?week=2026-11-02` with `bb2dash test · la-weekly` at 12:00 on Monday Nov 2; `21-materials-my-submissions.png`: `/materials` with IST.471's "My submissions" group listing the staged original; (a) with `WALK_BASE_URL` on production and `WALK_STAGED_HREF` set to the value for the merge order in force, `cd web; npx playwright test -c e2e/playwright.config.ts e2e/walk17.spec.ts -g "staged link"` → 1 passed (on IST.471's A1 popout the link named "Staged in bb2dash — attach in Blackboard ↗" has `href` equal to `WALK_STAGED_HREF`, and 0 buttons or links have a name matching `/\bSubmit\b/`). Phase 18's merge decides the href, not this phase (R-69, brief 98 task 23). The probe, run at the sitting: `git fetch origin; git ls-tree --name-only origin/main web/src/lib/blackboard-link.ts`. It prints nothing (Phase 18 not on production; `SubmissionBlock` gets `course?.bb_url`, `AssignmentDetailBody.tsx:213`) → `https://blackboard.syracuse.edu/ultra/courses/_570161_1/outline` (IST.471's `courses.bb_url`, read 2026-09-27; this holds even if 18's 126 is already applied). It prints the path (Phase 18 merged, so `blackboardLink` prefers the item URL) → `select coalesce(a.bb_url, c.bb_url) from assignments a join courses c on c.id = a.course_id where a.id = 'IST.471/a1-proposal'`, which is `https://blackboard.syracuse.edu/ultra/courses/_570161_1/outline/assessment/test/_13156730_1?courseId=_570161_1&gradeitemView=details` under brief 98's 126 template (§Contract, RPC signatures, the "bb_url (126)" bullet; A1's one `bb_content` row is a `resource/x-bb-asmt-test-link` with `bb_item_id` `_13156730_1`, and `assignments.bb_url` is null, both read 2026-09-27). The walk file records the probe's output and the value set; (a) `cd web; npx vitest run test/audits.test.ts` → 0 failures (its `no control anywhere reads "Submit"` block scans all of `web/src`) | "Built in sprint 1, used once on production, and it works." |
| T-27 | P-14: Stack reads the consent screen's publishing status; if Testing, publishes and re-mints; the DECISIONS row records it | P-14, R-52 | Stack | (b) after 2026-10-01 17:03Z: `select count(*) from calendar_push_runs where status = 'ok' and started_at > '2026-10-01 17:03:00+00'` → ≥ 1 and `select count(*) from calendar_push_runs where error like 'refresh token revoked%' and started_at > '2026-10-01 17:03:00+00'` → 0 (a push row is written only when `app_settings.gcal_dirty` is set: on 2026-09-27 the newest `calendar_push_runs` row was still 2026-09-24 17:03Z, so both counts are read after the first change past 2026-10-01 17:03Z that sets it: an assignment change from a sync, or a planner event edit, 061 and 067) | "The calendar push outlives seven days." |
| T-28 | S2-bugs-1 ledger: every id in this brief plus anything Stack adds at the freeze ends fixed, deferred (with its phase) or declined (with his word). PM walk of every touched screen on the preview | S2-bugs-1 | PM | (d) `grep -c "\| open \|" docs/planning/sprint-2/walks/walk-17/97w_PHASE17_WALK.md` → 0 (a literal `open` state cell); (d) `ls docs/planning/sprint-2/walks/walk-17/{01..21}-*.png \| wc -l` → 21 (one file for each number the task list names); (d) `test -e web/e2e/.auth/state.json` → exit 1 (session file deleted) | "Your list and mine, every line closed." |
| T-29 | Docs: STATUS, ORCHESTRATOR and 13 DECISIONS rows (R-45 caption; 027 column list widened (P-10); C-3 early (B-23); the web half of v2's in-app notices closed (B-26); gap self-close as a second way into `archived` (B-29); `v_inbox_feedback` retired (R-57); the P-72 convention; kind colours kept (B-31); the consent status (P-14); C-7 rule 2 amended (B-58); `@playwright/test` in `web/`; schema `private` for definer reads; toasts confirmed (R-108)). The R-57 row names the decisions store as the why-notes' home and each vault note's `decided_by` field as the record of who wrote it (Stack, or a session on his authority). STATUS gains the line `web coverage (T-22): <n> % lines` (R-51); row 14's `v_inbox_feedback` lines name 116, and the "Inbox feedback loop, automation half" table row points its counts at `/inbox-apply`, `v_inbox_queue` and the decisions store (R-57) | R-48, R-51, R-57, R-59, R-108, P-72 | PM | (d) `git diff main -- project-state/DECISIONS.md \| grep -c "^+\| 2026-"` → 13 (new table rows; 13 under all B defaults, moved by one per B alternative voiced at the walk; a brief-103 B-6 row written in this PR is Phase 22's and counted apart); `grep -n "pending Stack.s nod" project-state/STATUS.md \| grep -vc "~~"` → 0; (d) `grep -c "web coverage (T-22): " project-state/STATUS.md` → 1 (0 today); `grep -n "v_inbox_feedback" project-state/STATUS.md \| grep -Evc "116\|~~"` → 0 (2 today, STATUS:295-296); `grep "^\| — \| Inbox feedback loop" project-state/STATUS.md \| grep -c "bb2dash-inbox-decisions"` → 1 (0 today); `git diff main -- project-state/DECISIONS.md \| grep "^+\| 2026-" \| grep -c "decided_by"` → ≥ 1; `grep -L "^decided_by:" C:/Users/stack/vault/projects/bb2dash/decisions/*.md \| wc -l` → 0 (138 notes, every one carrying it, on 2026-09-27) | — |

## Workers

Workers commit and push per task id (`fix(T-13): …`), never touch `project-state/`, and dry-run every migration
inside `begin; … rollback;` before handing it to the PM, who applies it: 110–116 in number order as each is handed
over, then 117 (T-10; not written when B-42 leaves no `db_test_runner` role). Front-end checks are run by the PM
against the phase preview. `database.types.ts` is the PM's at T-10; until then workers type the new view columns
locally from this Contract. Worker ids W-44..W-47 are the next
free after Phase 16's W-41..W-43 in the sprint-wide table (Phase 18 starts at W-48; the W-51 in §Seams is Phase 18's).

| worker | stream | branch | worktree | owns (disjoint; full list in Contract §Files) | tasks |
|---|---|---|---|---|---|
| W-44 | db | `feat/web-polish-17-db` | `bb2dash-wt-17-db` | `db/migrations/110–117`, `db/tests/phase17_*`, the 077 test deletion, `DATA_SYNTAX.md` | T-03 … T-09 |
| W-45 | course pages + popout | `feat/web-polish-17-course` | `bb2dash-wt-17-course` | Stream, Classwork, `CourseScreen`, Info, `ItemPopout`, `SessionPopout`, `StatusSelect`, `course-dimension.ts`, `queries.course.ts`, `queries.today.ts`, `progress-cache.ts`, the hydration harness | T-02, T-11 … T-15, its T-23 sites |
| W-46 | home + materials + inbox | `feat/web-polish-17-home` | `bb2dash-wt-17-home` | `Today`, `NeedsAttention`, `UpcomingTracker`, `MaterialsBrowser`, `materials-collapse.ts`, `Inbox`, the new hook, collapse, heartbeat and apply-now files | T-16 … T-19, its T-23 sites |
| W-47 | shell + harness + planner CSS + desktop | `feat/web-polish-17-shell` | `bb2dash-wt-17-shell` | the three menus, `usePopover`, `SidebarProvider`, `CommandPalette`, `queries.announcements.ts`, lint, vitest and package config, `fc-params.ts`, `PlannerWeek.module.css`, `web/e2e/**`, the favicon files, `desktop/` reducer, notify and audit | T-01, T-20 … T-23, T-25 |

The PM owns T-10, T-28 and T-29 and integration; T-24 and T-26 are PM + Stack sittings, and T-27 is Stack's manual step.

## Out of scope

* **Phase 19:**
  * R-38 (Stream material diffs and the history table)
  * R-41's run states, per-stream "never synced" and the Inbox-header freshness
  * The ghost delete and `bb_item_id` key (R-64, P-25)
  * `stage_content`
* **Phase 22:** R-46 (390 px nav fold), R-53 and S2-styling-1, and P-15 … P-17 (token audit, contrast parser).
  Nothing here changes a colour token or a breakpoint.
* **Phase 15:** R-54's trigger itself (walked here, built there).
* **Phase 16:**
  * R-36's rule line and every grades file
  * R-51's optional grade-history dead-code removal, deferred with the files
* **Phase 18:** `stage_files`, the search RPCs, `ingest/`, `skills/bb-sync` and the in-sync pull.
* **Declined for this sprint by the B-number defaults:**
  * the IST.466 group panel (B-22)
  * web grade-posted and due-tomorrow notices (B-26)
* **Not built, the PM's call (no B-number covers it; PROVISIONAL, put to Stack with B-28):** pausing the push tick
  on `invalid_grant` (R-52's optional clause).
* **Phase 14:** containers, the scheduled sync and the Notifier swap.

## Open items for Stack

* **B-7:** before the freeze, anything on your list not already here? Default: nothing added.
* **B-2:** Undated starts collapsed, as you wrote "collapse". Default: collapsed on first visit, then remembered.
* **B-17:** once the Stream follows the bell, the "unread" tag will rarely show, because opening the bell stamps
  every row. An announcement post links to `/announcements`. Default: accept both.
* **B-25:** keep the two staged originals as real rows. Default: keep them, and remove the draft in the sitting.
* **B-28 / P-14:** read the OAuth consent screen's publishing status before **2026-10-01 17:03Z**. Default: if it
  still says Testing, publish it and re-run `scripts/google-consent.mjs`. The PM also leaves out R-52's optional
  pause of the push tick on `invalid_grant` (the PM's call, not a B default); say if you want it.
* **B-31:** keep the six kind colours. Default: keep.
* **B-57:** after the toast sitting, say whether the Action Center click opened the screen. Default: if it did
  not, the toast is held until expiry.
* **B-58:** the zero-point body. Default: show the score alone (for example "1"), with no "/ 0".

## Session prompt (Stage D finalises it in ORCHESTRATOR)

> `/bb2dash-pm` Start Phase 17 (web polish). Read `docs/planning/sprint-2/briefs/97_PHASE17_web_polish.md`. Confirm
> Phase 15's runner is on `main` and migrations 100–102 (and 103, if Phase 15 needed it; 100 only if B-42 kept the
> `db_test_runner` role) are applied, and record my 93 §5 answers against the B-table. Ask me the B-7 "anything
> else?" question once. Then cut `feat/web-polish-17` in `bb2dash-wt-17`, spawn W-44 … W-47 on their disjoint files,
> and run the task list in order. Stop at "ready when you say so" with the preview link.

## Round 3 — Stack's preview-walk notes (2026-09-29)

Stack walked the preview and wrote nine notes. His three calls on 2026-09-29: the AI Policy goes as a feature
**and** from the search corpus; the Stream **becomes** the week timeline, and Classwork keeps only Blackboard's
folder tree; the grades notes are built here, disjoint from Phase 16. The Inbox follows his stated lean: "Apply
answers" is the one explicit trigger, and the sync keeps applying decisions on its own (it already runs
`/inbox-apply` as step 0, and every fold runs `apply_resolutions()`). Every task keeps §Workers' rules: TDD, commit
and push per task, disjoint files, no `project-state/`. Each worker merges `origin/feat/web-polish-17` into its
branch first. Visual tasks end with a screenshot the PM retakes on the preview.

Rows reversed or amended (T-29 writes one DECISIONS row each, beside the 13): B-21 ("Apply answers now" removed);
B-1 / T-16 (the wheel is claimed only after a click or a 1.5 s hover); the 2026-09-10 Stream landing and "timeline
kept as a sub-view" (the Stream is the timeline); the 2026-09-10 tracker window (it reaches back to the term's
start); the AI Policy feature and its corpus passages removed.

| # | task | owner | files (beyond the worker's §Files row) | deterministic check |
|---|---|---|---|---|
| R3-1 | **Upcoming strip.** A visible horizontal scrollbar (the "slider") along the strip's bottom edge. The strip opens anchored on today and can scroll back to the term's first week (the fetch starts at the term start, not today; ◂ ▸ and "today first in view" keep working). The wheel is **not** captured until the strip is clicked or the pointer has hovered over it for 1.5 s; until then a vertical wheel scrolls the page. Leaving the strip releases the capture. The drag rule (5 px) stays. Home and the course Stream both | W-46 | `queries.today.ts` | vitest: a wheel before arming leaves `scrollLeft` unchanged and is not `preventDefault`ed; after a 1.5 s hover (fake timers) or a click it scrolls; leaving disarms; the first render has today's card in view; the fetch window starts at the term start; (c) `22-home-strip-slider.png` shows the scrollbar and a past day reachable |
| R3-2 | **Inbox: one trigger.** `ApplyNowButton`, `queries.applyNow.ts` and their tests are removed; `InboxApplyButton` ("Apply answers") is the only apply control, and the text under it goes. Its states read plainly ("Apply answers" · "queued" · "running" · "done"). No migration: `kind = 'transform'` stays a valid kind the fold uses | W-46 | — | `git grep -c ApplyNowButton -- web/src` → no output, exit 1; vitest `Inbox.test.tsx` and `InboxApplyButton.test.tsx` 0 failures; nothing renders under the apply button besides the button and its state |
| R3-3 | **Inbox redesign**, taking its cues from agentic review UIs (PR review threads, triage queues): each item is a card with the question as its title, context chips (course, kind, source, when raised), Blackboard's value and any suggestion side by side, and the answer controls inline (accept the suggestion · type an answer in a full-width, auto-growing text box with a visible label · dismiss). Filter tabs across the top (Needs you · Answered, not applied · Archived), with counts. A sticky footer shows "N answered" and the "Apply answers" button. `j`/`k` move between cards and `Enter` focuses the answer box. CSS Modules and the existing tokens only; no new colours (Phase 22 owns tokens); no fabricated values | W-46 | `Inbox.tsx` (+ css) may split into `web/src/components/inbox/*` | vitest: tabs filter and count; keyboard moves focus; accepting a suggestion writes the same resolution the current control writes (same mutation, same payload); an answered data gap still reads "Recorded for /inbox-apply to act on"; (c) `23-inbox.png` |
| R3-4 | **Stream = timeline.** The Stream tab renders the week-divided two-lane timeline that Classwork's `?view=timeline` shows today, extracted into one shared component (`web/src/components/course/CourseTimeline.tsx`). **Left lane:** each class session under its week/date divider, its lecture materials listed underneath it, and each announcement on the day it was posted, marked with a bell icon so it reads apart from classes and materials. **Right lane:** assignments on their due dates, each with its materials (files linked to it) listed with it, and the `StatusSelect` kept (R-37). Clicking an assignment opens its `?item=` popout; a file opens through `FileOpenAction`; an announcement links to `/announcements`. Classwork drops its "Week timeline" toggle, and `?view=timeline` redirects to the Stream. The IST.466 attendance marker (T-15) moves with the session rows | W-45 | `web/src/components/course/**` (new); `queries.announcements.ts` read only | vitest: sessions render under their week divider in the left lane with their files below; an announcement renders on its posted date with the bell icon and `aria-label` "Announcement"; an assignment renders in the right lane on its due date with its linked files; `?view=timeline` redirects; Classwork has no timeline toggle; (c) `24-stream-timeline-ist352.png` |
| R3-5 | **AI Policy gone from the app.** The AI Policy card on the course page, the Info tab's AI policy line, the popout's AI policy block, `isZeroToleranceAiPolicy`, the scheme query's ai_policy preference and their CSS and tests are removed. `AssignmentDetailBody.tsx` in a named hunk only (Phase 18 edits its link hunk) | W-45 | `AssignmentDetailBody.tsx` (hunk), `queries.popout.ts` | `git grep -i -c "ai.policy" -- web/src ':!web/src/lib/supabase/database.types.ts'` → no output, exit 1; full vitest 0 failures |
| R3-6 | **AI Policy gone from the corpus.** Migration **119** (`119_strip_ai_policy_passages.sql`, the phase's last slot): for every current `bb_file_text` unit that holds a course's AI-use policy section, remove that section (from its heading to the next heading of the same level) and delete that unit's `bb_text_embeddings` rows; set `grading_schemes.ai_policy` to null. Passages are located by short heading markers and `strpos`, never by pasting their text into SQL; a guard names the exact `(text_id, removed char count)` list the dry run found and aborts on any difference. The stored bytes in Storage and `course context/` are **not** touched (the documents stay the professors'). After apply the PM runs `ingest/embed_corpus.mjs` until `--check` reads 0. Test `phase17_119_no_ai_policy.sql` asserts no current unit's text matches the section headings, so a re-pulled syllabus that brings one back fails the suite. **Seam:** Phase 18's golden set drops Q10 (its answer is the AI-tools rule), a Phase 18 round item for W-49 | W-44 | `db/migrations/119_*.sql`, `db/tests/phase17_119_*.sql` | the test PASS; `select count(*) from grading_schemes where ai_policy is not null` → 0; `node ingest/embed_corpus.mjs --check` → `missing_parts_before=0` (PM); the removed-units table in `97w` |
| R3-7 | **Grades headers and report card.** On `/grades`, each class's header is one `<button aria-expanded>` (outlined on hover and focus, as Materials' course headers are) that folds that class; the explicit Hide button goes; the fold state uses `collapse-state.ts` under a new key `bb2dash.grades.collapsed`. Directly under the nav bar, above the classes, a horizontal report-card strip holds one card per class: course code and name, the letter grade and the points scored / points possible, all read from the figure the page already shows (Phase 12b's graded-so-far output). A class with no figure shows what the page shows for it today (for example "graded qualitatively" or "—"), never a made-up number. `GradedSoFarFigure.tsx` and `graded-so-far.ts` are Phase 16's and are not edited | W-44 | `web/src/app/(app)/grades/**`, `web/src/components/grades/CourseGradeCard.*`, new `web/src/components/grades/ReportCardStrip.*`, their tests | vitest: the header toggles and is remembered; no "Hide" control remains; the strip renders one card per course with the figure's letter and points, and a no-figure course shows no number; `git diff origin/main -- web/src/components/grades/GradedSoFarFigure.tsx web/src/lib/graded-so-far.ts` → empty; (c) `25-grades-report-card.png` |
| R3-8 | **Planner: nested items never clip.** Where due items sit inside a class block (the y-axis expansion), every item is fully visible: the block and its hour rows grow to fit the items, titles wrap, and nothing overflows the block or the day column, at 1440 px and at 1040 px with the sidebar open | W-47 | `PlannerWeek.tsx`, `PlannerBoard.tsx`, `PlannerSlots.tsx`, `PlannerItem.tsx` (+ css) | vitest: a class block with 3 nested items renders each item unclipped and at a height ≥ the sum of its items; (c) `26-planner-nested.png` (IST.323 Monday with Quiz #5) with every title whole |
| R3-9 | **Planner: "+" event wizard.** A "+" button at the planner header's top right opens a step-by-step dialog in the Google Calendar manner: (1) kind (the six kinds), (2) title, date and time (all-day toggle, time zone), (3) repeats (create only, the 52-occurrence limit kept), (4) location, notes and course, (5) review and save. It reuses `PlannerEventFormFields`, `usePlannerEventEditor` and `planner-event-form-state.ts`, so validation and the save path are the existing ones. Back and Next keep entered values; Escape closes after a confirm only if something was entered. Click-to-add on the grid stays | W-47 | `PlannerWeekHeader.tsx`, new `web/src/components/planner/PlannerEventWizard.*` | vitest: each step's Next is disabled until its fields are valid; the save sends the same insert payload the grid form sends for the same input; the 53-occurrence refusal shows on step 3; (c) `27-planner-wizard.png` |

The PM retakes 22–27 on the preview after the merge and adds them to T-28's count (27 files, 01–27). R3-6's apply
and the re-embed are PM steps. `/code-review` and `/security-review` re-run on the round-3 diff before the PR.

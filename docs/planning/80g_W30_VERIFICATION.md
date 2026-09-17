# Phase 12b — W-30 (db + shell) verification

Worker W-30, branch `fix/page-pass-12b-db`, worktree `bb2dash-wt-12b-db`. 2026-09-17.
Rows owned: **H-4, M-2, X-3, I-1, S-1 (database half), X-1, X-2**. All seven are done; none is
blocked. G-7a was not touched — it waits on the PM's endpoint discovery.

Every migration was written test-first, dry-run inside `begin; … rollback;` against prod through
the Supabase MCP, then applied with `apply_migration` under the file's own name. Every SQL test
opens its own transaction and ends in `rollback`.

## Repo ↔ prod: no drift

`supabase_migrations.schema_migrations` stores each migration as one statement. Its md5 equals the
md5 of the repo file, byte for byte, for all six:

| migration | md5 (repo file = applied statement) | bytes |
|---|---|---|
| `db/migrations/073_workload_visibility.sql` | `8a775c939225923a4b4a01a7b8323f54` | 11 267 |
| `db/migrations/074_reading_file_links.sql` | `0b453497e20418967f5594626d92b298` | 23 049 |
| `db/migrations/075_shared_column_restamp.sql` | `11d6e27c3a465b43a6c335748c9d42f9` | 23 692 |
| `db/migrations/076_rls_initplan_and_truncate.sql` | `a7969f0f701bc6d2eaf3991589f3e644` | 9 186 |
| `db/migrations/077_inbox_feedback.sql` | `407be2bd69be75d03ed069917e08ac5d` | 6 569 |
| `db/migrations/078_status_fold_and_auto_graded.sql` | `9a50f9febd50006f44718f50d410acbb` | 20 174 |

SQL tests: `phase12b_073…` `5d1f2a68b4a167713978258c01550b04` · `phase12b_074…`
`08488b08eaaa4a24579491d6333aa1bc` · `phase12b_075…` `44fec100dc396c330c260edb363dc5b4` ·
`phase12b_076…` `d6114698895eae2ca77d9a92847b89c0` · `phase12b_077…`
`2c8f0e9a69588eb9632213693fb0d865` · `phase12b_078…` `c0c4be3152d4334b7fee983e6ead1b16`.

Migrations 075 and 078 restate a frozen function body (045's `stage_assignments`, 056's
`stage_gradebook`). Each was assembled from the frozen file by script and then **diffed** against
the text that was applied: `diff` reported IDENTICAL and both md5s matched before the apply.

## H-4 — P-home-6, P-home-7 · migration 073

**RED.** `assignments.hidden_from_workload does not exist` (the test raises at section 1). The
supporting probe: 26 reading rows where `in_workload <> (required is not false)`; `readings` 89
`for_date = null, required = false`; the assignment row titled "Ethics Team 2 presentation",
`group_key` "Ethics Group #2"; **13** rows undated *and* counted that this migration hides (10 HBR
cases + 3 series placeholders).

**Dry run** (`begin; … rollback;`): columns unchanged, `anon` still cannot read `v_work_items`,
036's owner-run guard passed, ethics row read back as `Ethics Team 3 presentation | Ethics Group
#3`, `readings` 89 read back as `2026-09-24 required=true`.

**GREEN.** `phase12b_073_workload_visibility: PASS`.

| count | before | after |
|---|---|---|
| assignments with `in_workload` | 75 | 72 |
| readings with `in_workload` | 86 | 61 |
| the 13 hidden rows, undated **and** counted | 13 | 0 |
| `v_work_items` rows | 169 | 169 |
| undated rows in `v_work_items` | 24 | 23 |
| undated **and** counted, all kinds | 18 | 5 |

The 25 readings that leave the workload are the 16 dated ECN.304 optional readings (Stack's
answer 8: "`required = false` readings leave Undated and workload in every course") and the nine
other-team IST.466 cases. All 86 stay in `readings` and in Materials. The 5 undated rows that
still count are real work with no date: `IST.323/assignment-1`,
`IST.323/individual-presentation`, `IST.352/term-project`, `IST.466/ai-team-assignment`,
`IST.471/a7-final-reflection`.

**Rows of Stack's data changed by 073** (facts, not planner state):

* `assignments.hidden_from_workload = true` on `ECN.304/quiz-series`,
  `GEO.103/reading-quiz-series`, `GEO.103/discussion-questions`.
* `readings` 89 "HBR: Apple vs. The FBI": `for_date` null → `2026-09-24`, `required` false → true,
  a sentence appended to `notes`. `required` is set because reading 89 is Stack's own Team 3 case,
  and the DoD wants **nine** case-pool readings out of the workload, not ten.
* `assignments IST.466/ethics-team-2-presentation`: `title` → "Ethics Team 3 presentation",
  `group_key` → "Ethics Group #3", `description` rewritten to name the assigned case and drop the
  old "case list order suggests Team 2 = Ethics Across Cultures" guess, `source_ref` extended.
  **The id, due_date (2026-09-24), points (100) and `bb_column_id` (_3562497_1) are untouched**
  — the id is what `stage_assignments` and `apply_resolutions` bind to.

**Evidence for the relabel**, inspected before writing it: `sessions` 2026-09-22 = "Ethics Team 3 &
4 practice", 2026-09-24 = "Ethics Team 2 & 3 Presentation"; Blackboard's own gradebook columns are
generically named "Ethics Case Practice" and "Ethics Case Presentation", so nothing on Blackboard
ever said Team 2 — the seed guessed.

**Consumers of `in_workload` — proof that every one already filters** (the brief asked the db
worker to show this):

* `v_calendar_push_items` (068:160) `where w.in_workload`, and its assignment arm reads
  `item_kind = 'assignment'` with a date, so none of the twelve newly hidden rows was ever pushed.
* `desktop/src/core/poller/sources.ts:127` `&in_workload=is.true`.
* `web/src/lib/queries.today.ts:146,168` `.eq('in_workload', true)`.
* `web/src/app/(app)/course/[id]/stream/CourseStream.tsx:154` `item.in_workload !== false`.

**Open item for the PM / Stack.** `IST.466/ethics-team-2-practice` is the *same* mislabelling one
row over: it is titled "Ethics Team 2 practice presentation (30 min)", `group_key` "Ethics Group
#2", dated **2026-09-08** (Teams 1 & 2), and it is bound to gradebook column `_3562491_1` "Ethics
Case Practice" — which is Stack's own practice grade. Stack's answer 7 gives his practice as
**9/22**. I did not touch it: the brief sanctioned correcting the *presentation* row only, and a
due-date change is more than a relabel. The fix, if Stack wants it:

```sql
update assignments
   set title     = 'Ethics Team 3 practice presentation (30 min)',
       group_key = 'Ethics Group #3',
       due_date  = date '2026-09-22'
 where id = 'IST.466/ethics-team-2-practice';
```

As it stands his planner shows no 9/22 practice.

## M-2 — P-materials-2 · migration 074

**RED.** `reading_match_tokens(text) does not exist`; 6 `readings`-bucket files unlinked; 20
on-Blackboard readings with no file.

**Dry run.** The rule produced exactly two candidate pairs across the whole corpus and linked both:
`bb_files` 67 → `readings` 47 (Roberts / Vox, token coverage 0.90), `bb_files` 69 → `readings` 48
(Robbins, Political Economy, 0.60). `stage_files` was replaced in a second rolled-back transaction
and read back with `link_reading_files` in its body and `reading_links` in its counts.

**GREEN.** `phase12b_074_reading_file_links: PASS`, including a synthetic two-candidate file that
links nothing and raises one `stack_must_confirm` Inbox row, a synthetic one-candidate file that
links, and two consecutive replays that write 0 links and raise 0 rows.

| count | before | after |
|---|---|---|
| `readings`-bucket files | 19 | 19 |
| …unlinked | 6 | 4 |
| `bb_files` with a `reading_id` | 13 | 15 |
| on-Blackboard readings with no file | 20 | 18 |
| open `attention_items` | 92 | 92 |

The four that stay unlinked are right: two GEO.103 reading-**question** worksheets (prep, not the
reading) and two IST.352 chapter decks.

### What `bb_content` holds for the 18 unmatched GEO.103 readings

Asked for by the brief. The crawled content tree for `GEO.103.lecture` is **37 nodes**, and it
covers **Weeks 1–5 only** (learning modules for Weeks I, 2, 3, 4, 5; nothing after
`_12904303_1` "Week 5 - Fast Fashion, E-Waste | First Exam"). Named reading nodes in it:
McNeill "The First Hundred Thousand Years", Kristof "China's Worst Policy Mistake", Gideon "The End
of Children", Roberts "Don't be rich", Robbins "Political Economy" — **all five already have a
`bb_files` row, and after 074 all five are linked.**

Of the 18 that remain off-platform:

* **17 have no `bb_content` node at all.** A token probe against every node in the course returns
  only 1-token noise matches ("climate", "population"). The textbook chapters (Murphy, Johnson,
  Goodell, Robbins et al.) are behind the **Orange Instant Access ebook LTI placement**,
  `bb_content` `_12920094_1`, `item_kind = 'lti'` — an ebook reader, not a file.
* **1 has a node and it is not a file**: `readings` 45 (Institute of Physics 2017) ↔ `bb_content`
  `_12904333_1`, `item_kind = 'link'`, `bb_type = resource/x-bb-externallink`. There is nothing to
  harvest; it is a URL.

So the 18 are not a link-rule failure. Either the crawl has never walked past Week 5 of that
course, or those readings genuinely are not Blackboard files. **A GEO.103 file pull (bb-sync step
4 / `bb-course-pull`) before M-2's front-end check is the next lever**, exactly as the Sync gate
predicted; if it brings files, `stage_files` step 6 links them on the following fold with no code
change.

## X-3 — P-data-2 · migration 075

**RED.** `stage_assignments` had no restamp step; `v_calendar_push_items` reported
`absent_from_blackboard = true` for **both** `IST.323/fp-proposal` and `IST.323/fp-log-final`, and
`push.ts:264` (`desired.filter((item) => !item.absent_from_blackboard)`) drops every absent item —
so neither final-project deadline has ever reached the Google calendar.

Root cause, located: `stage_assignments` (045:69–84) `continue`s out of the column loop for an
ambiguous column *before* the step that mirrors Blackboard's bookkeeping, so `bb_last_seen` stayed
at 2026-09-02 through every crawl since. Exactly one column on prod is shared: `IST.323`
`_3569973_1`, by those two rows.

**Dry run.** Both rows read back `bb_last_seen = 2026-09-17 15:35:27.262659+00` (the newest
crawl's `captured_at` for IST.323) with `bb_item_id` unchanged at `_12983388_1`.

**GREEN.** `phase12b_075_shared_column_restamp: PASS` — including a section that winds
`bb_last_seen` back to 2026-09-02, confirms the bug reproduces (2 of 2 absent), re-folds the
newest crawl through the *new* `stage_assignments`, and finds both restamped and 0 absent, with
`ambiguous_columns ≥ 1` so the "which assignment does this column mean?" Inbox question is still
being asked.

| count | before | after |
|---|---|---|
| `bb_last_seen` on the two IST.323 rows | 2026-09-02 20:32:02 | 2026-09-17 15:35:27 |
| shared-column rows reported absent | 2 | 0 |
| assignment rows in `v_calendar_push_items` | 67 | 67 |

`assignments_mark_calendar_dirty` (061) is a statement-level trigger, so the UPDATE armed
`app_settings.gcal_dirty`; it reads `true` now, with `gcal_enabled = true` and a calendar id set,
so the next scheduled push sends both events. Values (`due_at`, `points_possible`,
`bb_submission_status`) are still applied to neither row — that is Stack's to settle.

## X-3 — P-db-1, P-db-2 · migration 076

**RED.** 22 policies with a bare `auth.uid()` (21 in `public`, matching the advisor's
`auth_rls_initplan` WARN × 21, plus `storage.objects bb_files_auth_all` which the advisor cannot
see); **79** TRUNCATE grants to `anon` / `authenticated` across `public`; the `postgres` default
privileges granting `D` to both roles on every new table.

P-db-1 was logged as "the `calendar_events` TRUNCATE grant". Measured, it is every table **and
view** in `public`: Supabase's default privileges hand `arwdDxtm` to `anon` and `authenticated`.
TRUNCATE is not subject to RLS, so the one write the owner policies cannot defend was held by the
role the browser carries. `planner_events` (067) was the only table that had already fixed it.

**Dry run.** 0 bare policies, 0 TRUNCATE grants, 0 default-privilege grants of `D`, and
`authenticated` still holds 56 SELECT grants (nothing else was revoked).

**GREEN.** `phase12b_076_rls_initplan_and_truncate: PASS`, which also proves the boundary is
unchanged: with `request.jwt.claim.sub` set to `app_owner()` and the role set to `authenticated`,
`assignments`, `readings` and `v_work_items` all return rows; with the sub set to
`00000000-0000-0000-0000-000000000000` all three return **0**; and `truncate calendar_events` and
`truncate assignments cascade` both raise `insufficient_privilege`.

**Advisor diff.**

| lint | before | after |
|---|---|---|
| performance · `auth_rls_initplan` (WARN) | 21 | **the lint no longer appears** |
| performance · `unindexed_foreign_keys` (INFO) | 15 | 15 |
| performance · `unused_index` (INFO) | 5 | 5 |
| security · `function_search_path_mutable` (WARN) | 7 | 7 |
| security · `authenticated_security_definer_function_executable` (WARN) | 2 | 2 |
| security · `auth_leaked_password_protection` (WARN) | 1 | 1 |

Nothing new was introduced. `reading_match_tokens` and `link_reading_files` (074) both set
`search_path`, so neither joins the 7.

## I-1 — P-inbox-1, P-home-4 · migration 077

**RED.** `v_inbox_feedback does not exist`; `agent_requests.kind` allowed `sync` and `transform`
only.

**Dry run.** 25 rows, the documented column list, `anon` cannot read it, the 036 guard passed.

**GREEN.** `phase12b_077_inbox_feedback: PASS` — 25 feedback rows (15 resolved, 10 dismissed), no
open row leaks in, no row with an empty note, every row's `feedback` / `accept` / `was_applied`
agrees with the underlying `attention_items` row, `inbox_feedback` is accepted while
`_077_unknown` is still refused, and **a real `transform_tick()` leaves the queued
`inbox_feedback` row at `queued`**.

**Seam for other workers — `v_inbox_feedback` columns, in order:**

```
id, kind, course_id, entity, ref, field, question, from_value, to_value, suggested,
state, resolution, accept, feedback, raised_at, raised_by_sync_run, resolved_at,
applied_at, was_applied
```

`feedback` is `attention_items.resolution_note`; `accept` is `resolution->>'accept'`;
`was_applied` is `applied_at is not null` — false for every kind and field `apply_resolutions()`
does not apply, which is most of them (2 of the 25 on prod are applied). The filter is
`state in ('resolved','dismissed') and the note is not empty`.

## S-1 (database half) — P-grades-7 · migration 078

**RED.** 2 rows at `not_applicable`; `stage_gradebook` had no `auto_graded`.

**Dry run.** Printed every affected row before rolling back — 2 folded, 14 auto-graded (3 inserts,
11 updates), and the guard that compares against a pre-migration snapshot found no `excused` /
`missed` row moved and no unexpected transition.

**GREEN.** `phase12b_078_status_fold_and_auto_graded: PASS`. The behaviour section sets seven real
rows to `not_started / planned / in_progress / submitted / excused / missed / graded`, folds the
newest crawl, and asserts: the four AUTO_GRADED_FROM values moved to `graded` and
`auto_graded = 4`; `excused` and `missed` are unchanged; **no column of those rows other than
`status` changed** (compared against a snapshot — several carry scores, notes and `graded_at` from
Stack's own editing); a second fold writes `auto_graded = 0`; and folding the *older* registered
crawl reports `older_run = true`, `auto_graded = 0` and moves nothing.

**`assignment_progress` before → after on prod:**

| status | before | after |
|---|---|---|
| `not_started` | 50 | 45 |
| `in_progress` | 1 | 0 |
| `submitted` | 8 | 3 |
| `graded` | 5 | **19** |
| `missed` | 3 | 3 |
| `excused` | 0 | **2** |
| `not_applicable` | 2 | **0** |
| `planned` / `waived` | 0 | 0 |
| **rows** | 69 | **72** |

`reading_progress` had nothing to fold (74 `not_started`, 1 `submitted`). The enum still has its
nine values.

The 2 folded rows are `IST.323/fp-packet` and `IST.466/major-case-2-kickoff`
(`not_applicable` → `excused`; both are "anchor event, not a deliverable"). The 14 auto-graded are
3 new rows (`ECN.304/quiz-2`, `IST.352/knowledge-check-09-09-2026`, `IST.352/reading-chapter-3`),
1 from `in_progress`, 5 from `not_started`, 5 from `submitted`.

**A call I made, flagged for the PM.** The brief specifies the auto-graded step "at the end of
`stage_gradebook`". 078 *also* runs the identical statement once, so the app is right today rather
than after another sync — `run_transform` is idempotent, so a queued `transform` request would not
have re-folded an already-folded crawl and the front-end check ("after the sync a newly scored item
reads Graded without a click") would have had nothing to look at. It is the sanctioned write, it is
forward-only, and it touched no `excused` or `missed` row. Revert by hand if Stack disagrees.

## X-1 — P-shell-1 · `web/src/lib/supabase/proxy-session.ts`

`createServerClient`'s `setAll` writes the rotated Supabase token onto the pass-through response.
Both redirect exits returned a fresh `NextResponse.redirect(...)`, which carries none of it.

**RED.** `web/test/proxy-session.test.ts`: 2 failed, 3 passed — exactly the two redirect branches,
`expected undefined to be 'rotated-access-token'`.
**GREEN.** 5/5. `carryCookies(from, to)` moves `from.cookies.getAll()` onto the redirect.
`npm run typecheck` clean; the full web suite **88 files / 1347 tests passed**.

## X-2 — P-shell-2 · `desktop/src/main/navigation.ts`

`will-navigate` fires for the main frame and never again for a redirect, so two routes out of the
window reached no rule: a server-side redirect, and any subframe.

**RED.** `desktop/test/unit/navigation-wiring.test.ts`: **11 of 12 failed**, "no handler is
registered for will-redirect / will-frame-navigate".
**GREEN.** 12/12. All three events go through one `guard()` over the **unchanged**
`decideNavigation`. What differs by event is only what an `external` verdict does: the main frame
is Stack following a link and goes to his default browser; a **subframe** is the page moving
itself, so it is prevented, logged and recorded as `navigation-blocked` — handing a frame's target
to Chrome would make any embedded frame a pop-up. `will-frame-navigate` returns early on the main
frame, which `will-navigate` already owns, so nothing is handled twice (and the existing
"outside link" e2e still sees exactly one `open-external`).

**e2e.** Two new specs in `test/e2e/shell.spec.ts`, against a fixture server that now serves
`/redirect-out` (302 → `https://example.com/redirected`) and `/frame`, with an `<iframe>` and two
buttons on the fixture page:

* *stops a same-origin link that redirects off the allowlist* — one `open-external` for
  `https://example.com/redirected`, the page stays on the fixture root, still one window.
* *stops a subframe navigating off the allowlist, without opening the browser* — one
  `navigation-blocked` event with `source: 'will-frame-navigate'`, **no** new `open-external`, and
  no frame at `https://example.com/embedded`.

Both are driven with `page.evaluate` (the navigation is prevented by design, so awaiting it would
hang) and **neither opens a dialog**. Playwright **21/21**. Desktop unit suite **28 files / 549
tests passed**; `npm run typecheck` (including tests) clean.

## Suites, all green

| suite | result |
|---|---|
| `web` vitest | 88 files, 1347 tests passed |
| `web` typecheck | clean |
| `desktop` vitest | 28 files, 549 tests passed |
| `desktop` typecheck (`tsconfig.test.json`) | clean |
| `desktop` Playwright e2e | 21 passed |
| SQL tests 073–078 | 6 PASS, each rolled back clean |

## For the PM

* **Regenerate `web/src/lib/supabase/database.types.ts` at integration.** I did not touch it.
  Three things changed the schema: `assignments.hidden_from_workload` (073), the view
  `v_inbox_feedback` (077), and `agent_requests.kind` gaining `inbox_feedback` (077).
* **Seam names, confirmed:** column `assignments.hidden_from_workload`; view column
  `v_work_items.in_workload` (unchanged name, new rule); view `v_inbox_feedback` with the 19
  columns listed above.
* `stage_files` counts gain `reading_links: {files_examined, linked, ambiguous, attention_raised}`;
  `stage_gradebook` counts gain `auto_graded`. Both are additive — no existing key moved.
* Nothing under `web/src/components`, `web/src/app`, `project-state/` or `progress-status.ts` was
  touched.

## Open risks

1. **`IST.466/ethics-team-2-practice` is still labelled and dated for Team 2** (see H-4). Stack has
   no 9/22 practice on his planner. One statement, above, fixes it if he wants it.
2. **The GEO.103 file pull has not run.** 18 readings stay "Off-platform" and M-2's front-end check
   cannot show "In library" for them until it does. The link step is in place and will pick them up
   on the next fold.
3. **078 wrote 14 rows of planner state outside a sync** (the sanctioned write, applied once). If
   Stack expected to see it happen *on* a sync instead, the rows are the same ones either way.
4. **The `supabase_admin` default-privilege row still grants TRUNCATE** on tables created by that
   role. Nothing in this repo creates a table as `supabase_admin`, and `postgres` (which every
   migration runs as) no longer does — but a table created through Supabase's own tooling could
   reintroduce it. 076's guard catches it on the next migration that runs it.
5. **`reading_match_tokens` is deliberately conservative.** It would not have matched the ten
   IST.466 HBR files to their readings (their names are `HBR3- Apple vs. The FBI (3).pdf`); those
   were linked by an agent earlier and are untouched. A file the rule cannot place raises nothing
   unless *several* readings fit — a near-miss is silent by design.

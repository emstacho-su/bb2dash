# Phase 17 walk and evidence (97w)

Branch `feat/web-polish-17`. Brief `docs/planning/sprint-2/briefs/97_PHASE17_web_polish.md` (frozen 2026-09-29).
Preview: `https://web-git-feat-web-polish-17-emstacho-sus-projects.vercel.app` (Vercel SSO).

## T-10 — migrations 110–117 applied by the PM, 2026-09-29

Applied in number order with `apply_migration` under each file's name. `md5(statements[1])` on prod against
`git show HEAD:<file> | md5sum` (LF form):

| migration | prod md5 | repo md5 | equal |
|---|---|---|---|
| 110_course_stream_unread_filters | edbe8db3c19bd1f2ae0cd71aded8d6b4 | edbe8db3c19bd1f2ae0cd71aded8d6b4 | yes |
| 111_content_tree_missing_notes | 442792a60285328c3c9ca7498d97a300 | 442792a60285328c3c9ca7498d97a300 | yes |
| 112_knowledge_check_link_rehome | e075c4d274f106f7553e8836e4b8d277 | e075c4d274f106f7553e8836e4b8d277 | yes |
| 113_scheduler_heartbeat | fc74701372295aaeee9aeaa61503abf4 | fc74701372295aaeee9aeaa61503abf4 | yes |
| 114_gap_self_close | a2e8be7220661d950eb4f53ff55f01d3 | a2e8be7220661d950eb4f53ff55f01d3 | yes |
| 115_sync_change_lines_counts | 6c51b1d8df59729398746a41d348f571 | 6c51b1d8df59729398746a41d348f571 | yes |
| 116_retire_inbox_feedback | d7eb42b5fd7c6b605ef6db037643bbc6 | d7eb42b5fd7c6b605ef6db037643bbc6 | yes |
| 117_db_test_runner_grants_phase17 | 2ff6cbe7bfa99ebae370b44d025e4d75 | 2ff6cbe7bfa99ebae370b44d025e4d75 | yes |

8 of 8 equal. `node scripts/db-test.mjs` → `passed 27, failed 0, units 27`; `--list | grep -c phase17_` → 7.
`phase15_100_db_test_runner_role.sql` was updated in this PR to expect USAGE on `extensions, private, public`
(117 adds `private`); before that edit it failed exactly on that line. `database.types.ts` regenerated: 0
`v_inbox_feedback`, 1 `v_scheduler_heartbeat`; Phase 18's 120–123 functions left out.
Security advisors after 113–117: the three accepted WARNs only (`app_owner`, `calendar_push_now`, leaked-password
protection); none names `scheduler_heartbeat`, `heartbeat_stage` or `v_scheduler_heartbeat`.

W-44's deviations, accepted by the PM: 114's carve-out is `is not distinct from 'true'` (the literal `=` form
dropped every /inbox-apply answer, whose decision has no `closed_itself`); a row flagged `reopened_within_24h` is
never machine-closed later; 113's `last_error` is null when no failure follows the last success. Drift: 634 failed
push rows on prod (the brief read 633).

## Integrated gates (a671e32)

- `cd web; npm ci` → 0 (W-47's lock carries the `@emnapi` entries `main`'s lock lacked).
- `npm run typecheck` → clean. `npx eslint . --max-warnings 0` → exit 0.
- `npx vitest run --coverage` → 114 files, 1994 passed, 0 failed; all files lines 85.22 %.
- `npm run build` → ok. `cd desktop; npm run typecheck` → clean; `npx vitest run` → 28 files, 564 passed.

T-22 coverage lines 83 (W-47's measured 83.11 % at T-22; threshold `lines: 83`; 85.22 % after integration)

## T-20 — favicon on the preview (2026-09-29)

`cmp` checks exit 0 on the branch. Through a Vercel share cookie: `/favicon.ico` → `200 image/vnd.microsoft.icon`,
`/apple-icon.png` → `200 image/png`, `/login` → `200`. The brief expected `image/x-icon`; Next serves the
registered name of the same ICO type, so the check reads as passed with that note.

## Ledger (S2-bugs-1; B-7 answered "Nothing else" by Stack, 2026-09-29)

| id | item | state |
|---|---|---|
| L-1 | ⌘K palette: Keyword mode reads `score`, which `fts` does not return; Semantic mode reads `snippet`, which `vector` does not return (found by Phase 18's W-51, R-74) | fixed, 91f78d2: Keyword shows its headline with a "keyword match" badge and no number; Semantic shows a scrubbed passage from `text` and its similarity; hybrid unchanged |

## T-01 / T-11 / preview screenshots (2026-09-29, preview at 1d99f67 and later)

Stack signed in on the preview through `login.mjs` (18:09Z). Harness fixes made at the walk, all in `web/e2e/`:
`login.mjs` waits for the app host and takes a Vercel share token; every spec waits for `load` plus 2 s, because
the app polls and `networkidle` never fires; Undated is found by its button; the planner's ◂ ▸ are links; the
session popout URL is built from IST.466 session 105 (the timeline rows open a panel, not a link); the
right-clamp card is the rightmost *visible* card. A mid-run push redeployed the preview and moved the branch alias
off the share cookie's deployment (the bounce was Vercel's `/login`, not the app's; Supabase auth logs show no
sign-out or 4xx): walk runs happen with no push in flight.

- `harness.spec.ts`: `signed in` 1 passed (01), `no 404` 1 passed (T-20's no-404 half).
- `item-popout.spec.ts`: 3 passed (assignment popout 02, session 105 popout, assignment page), 0 lines matching
  `/418/` warm or cold (T-11).
- `walk17.spec.ts` outside the production sitting: 03–10, 12, 13, 16, 17, 18 taken, each test passed.
- PM read of the shots: 04 shows one "WK01 - The Systems Development Environment", no "WK01 - Chapter 1", the three
  Knowledge Checks with "Stage a file", and "Show 2 items Blackboard no longer lists"; 06 shows "Undated (5)" folded
  directly above Needs attention; 08 shows "Google Calendar push has failed 3 times since 6 hrs ago: refresh token
  revoked (invalid_grant): re-run scripts/google-consent.mjs".
- Left for T-26 on production: 11, 14, 15, 19, 20, 21 and `staged link`.

## R3-6 removed units

W-44, 2026-09-29. The survey behind migration 119 (read-only SQL on prod). Every current
(`superseded_by is null`) `bb_file_text` unit holding a course's AI-use policy section, with the
marker that opens the cut and the marker that ends it. A start marker's match is widened back to the
start of its line; the cut ends at the start of the end marker's line, or at the end of the unit.
The PM reviews this table before applying 119; 119's guard aborts unless it finds exactly these
`(text_id, chars removed)` pairs.

| text_id | file_id | course | file_name | start marker | end marker | chars removed | embeddings deleted |
|---|---|---|---|---|---|---|---|
| 214 | 23 | ECN.304 | ECN 304 F26 Syllabus_M001.pdf (page 3) | first "artificial intelligence" (case-insensitive; the section has no heading) | `Disability-Related Accommodations` | 589 of 3,578 | 4 |
| 277 | 42 | GEO.103.lecture | GEO 103 (2026) - syllabus - FINAL.pdf (page 10) | `Limited and Specified Artificial Intelligence Use` | end of unit | 707 of 2,850 | 3 |
| 374 | 8 | IST.323 | CourseIntro-Fall2026-BA.pptx (slide 13) | `AI Use` (the slide's title) | end of unit: the whole slide, so the unit is deleted | 670 of 670 | 1 |
| 522 | 3 | IST.323 | Student Policies and Services - syllabus appendix August 2026 .docx | `Artificial Intelligence Language:` | `Disability-Related Accommodations` | 692 of 8,310 | 8 |
| 733 | 151 | IST.323 | 323Fall26V1.4.docx (syllabus) | `On the use of AI:` (Final Project paragraph) | `Submission format.` | 257 of 16,297 | 16 |
| 1 | 27 | IST.352 | IST 352 Syllabus Fall 2026.docx | `Zero tolerance for artificial intelligence use` | `Syracuse University values diversity` (next paragraph) | 530 of 17,419 | 16 |
| 89 | 33 | IST.466 | Student Policies and Services - Syllabus appendix August 2026 .docx | `Artificial Intelligence Language:` | `Disability-Related Accommodations` | 1,678 of 6,971 | 7 |
| 350 | 26 | IST.471 | IST 471 Syllabus.pdf (page 6) | `Artificial Intelligence Language:` | end of unit | 777 of 2,508 | 3 |

Totals: 8 units in 6 courses (GEO.103.recitation shares the lecture's syllabus), 5,900 characters,
58 embedding rows. `grading_schemes.ai_policy` is nulled on 6 courses. IST.466's own syllabus (text
101) names an "AI Team Assignment" but has no policy section.

Left in, for the PM to decide: IST.323's "Appendix B: AI Use Statement" deliverable (text 515, 516,
file 13), the Final Project packet's line naming that appendix (519) and the deliverables slide
(383). They are a Final Project hand-in spec rather than a course policy, although 515 opens "You
may use AI on this assignment". The IST.323 syllabus schedule row "AI and Security" (a lecture topic)
and the AI subject matter in lecture slides, readings and news decks stay.

Dry run (119 + `phase17_119_no_ai_policy.sql` in one begin…rollback): `phase17_119_no_ai_policy:
PASS`, 772 current units, 1,492 embeddings left.

## R3-6b removed units

W-44, 2026-09-29, after Stack's "remove IST 323 appendix b as well". Migration 150 (the first of the
next free block of ten; 110–119 are full). Re-survey of every current IST.323 unit for "Appendix B",
"AI use statement", "use of AI" and "disclose": four hits name the appendix. The fifth hit, text 532
(Week2SecInNews.pptx, "WhatsApp disclosed…"), is unrelated and stays. The syllabus (text 733) says
"all three appendices" without naming B, and stays. Nothing was added beyond the four units named in
the brief. 150's guard aborts unless it finds exactly these `(text_id, chars removed)` pairs:
`383:23,515:2983,516:1963,519:280`.

| text_id | file | marker | end marker | chars removed | embeddings deleted |
|---|---|---|---|---|---|
| 515 | 13 · IST323_Appendix_B_AI_Use_Statement.pdf (page 1) | whole unit | whole unit (the unit is deleted) | 2,983 of 2,983 | 4 |
| 516 | 13 · IST323_Appendix_B_AI_Use_Statement.pdf (page 2) | whole unit | whole unit (the unit is deleted) | 1,963 of 1,963 | 2 |
| 519 | 10 · IST323_Packet_A_Meridian_Pharmacy.docx | line start of `Appendix B: AI use statement.` | line start of `Appendix C: Your running log.` (that one line only) | 280 of 24,865 | 22 |
| 383 | 8 · CourseIntro-Fall2026-BA.pptx (slide 22) | `B: AI use statement.` (inline) | `C: Your running log.` (A and C stay on the line) | 23 of 817 | 1 |

Totals: 4 units (2 deleted, 2 trimmed), 5,249 characters, 29 embedding rows. bb_files row 13 and the
stored bytes are not touched. Dry run (150 plus `phase17_150_no_appendix_b.sql` in one
begin…rollback): `phase17_150_no_appendix_b: PASS`, with 244 current IST.323 units. Slide 22 then
reads "A: Ranked risk summary.   C: Your running log.".

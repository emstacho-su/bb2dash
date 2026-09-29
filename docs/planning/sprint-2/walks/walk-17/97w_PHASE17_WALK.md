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
| L-1 | ⌘K palette: Keyword mode reads `score`, which `fts` does not return; Semantic mode reads `snippet`, which `vector` does not return (found by Phase 18's W-51, R-74) | fixed, 91f78d2: Keyword shows its headline with a "keyword match" badge and no number; Semantic shows a scrubbed passage from  and its similarity; hybrid unchanged |

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

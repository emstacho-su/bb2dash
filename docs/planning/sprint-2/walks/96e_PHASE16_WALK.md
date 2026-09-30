# 96e — Phase 16 walk

Screenshots in `walk-16/`. Taken by the PM through Claude in Chrome in Stack's signed-in session on
2026-09-30, after migrations 105 and 106 were applied to prod.

| # | file | where | what is visible | state |
|---|---|---|---|---|
| 01–04 | — | the V-1 launcher (task 16) | `/mcp`, `/permissions`, `.env` refused, write outside refused | **not captured.** Stack launched the six sittings himself on 2026-09-29 and no screenshots were taken. The launcher's confinement is covered by `scripts/validate-grading.test.mjs` (argv, rules, cwd). Since round 2 the session runs from `docs/planning`. |
| 05 | `05-grades-geo-nothing-graded.png` | production `/grades`, GEO 103 block | "Graded so far" and "Nothing that counts toward the grade has been graded yet."; no "0.0%" | done. Precondition `select count(*) from v_grade_model_items where scheme_course_id = 'GEO.103.lecture' and score is not null and not excluded` → 0 |
| 06 | `06-grades-ecn-rank-rule.png` | preview `/grades` (`web-git-feat-grades-v1-16-…`), ECN 304 block | "Exams (rank-weighted): weighted 30 / 25 / 20 from highest score to lowest once all 3 are graded; until then the graded ones are averaged." under 81.0% B- | done. Home's ECN 304 card on the same preview shows "81.0% B-" and no rule line (acceptance step 7) |
| 07 | `07-planner-sitn-2026-11-04.png` | production `/planner?week=2026-11-02` | "Security in the News" at 3:45 PM inside Wed 11/4's IST 323 class block | done |
| 08 | — | preview `/grades`, ECN 304 | Exams counted after Exam 1 posts; the rule line still says averaged | **pending:** ECN.304 Exam 1 is on 2026-10-01; task 27 |

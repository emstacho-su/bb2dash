# bb2dash: App-phase planning: brief for research, direction and planning agents

Date: 2026-09-08. Owner: Stack (Evan Stachowiak), senior at Syracuse iSchool, 7 Blackboard course shells this term. Single user. He builds through Claude Code CLI + skills; default stack Supabase / React.

## Where the project stands

Phases 1-3 are done: syllabi seeded into a typed Supabase schema, Blackboard Ultra crawled through its internal `/learn/api/v1` JSON into `bb_raw`, SQL transforms into typed tables, and every course file (64) harvested into Supabase Storage + a local OneDrive mirror with text extracted (534 text units). A validate → diff → bridge runbook (`ingest/CADENCE_RUNBOOK.md`) exists and will become a scheduled Claude task. Read `NOTES.md`, `DATA_SYNTAX.md`, `PHASE2_FINDINGS.md`, `ingest/AGENT_BRIEF.md`, `ingest/FILE_HARVEST_SPEC.md`, `ingest/VALIDATION_RUN_2026-09-08.md`, `db/migrations/*.sql`, `db/seed/*.sql`, `maps/*.v2.json`, `skills/*/SKILL.md`.

Live DB snapshot for this planning round (do not re-query unless you need something specific; the Supabase MCP `execute_sql` on project `goultdzqcavefcgnifdy` is available if you do, read-only please):
- `docs/planning/DB_PROFILE_2026-09-08.json`: per-table coverage/quality profile (which columns are actually populated, per course and type).
- `docs/planning/DB_VIEWS_2026-09-08.sql`: live views + row counts. Note `v_course_grade` does NOT exist yet.

## The GUI research preview

`gui research context/gui/` holds Claude Design artboards (`.dc.html`, open as text; each is a self-contained HTML page whose markup IS the spec; `support.js` holds shared components/sample data). Read `gui research context/gui/README.md` first: it lists the current files (00 plan sheet, 13 Home v2, 14 Course v2, 03 lecture popout, 04 assignment popout, 12 options canvas), the decisions already made (top nav, horizontal effort tracker, effort score T-15, course cards, bell announcements, needs-attention row, week rail), and the data bindings the GUI expects. `gui research context/_ds/` is a placeholder skin (Nocturne); ignore styling entirely. Layout, hierarchy, interactions and bindings are the spec.

## Decisions Stack made 2026-09-08 (treat as fixed)

1. Runtime: the end product is a desktop shell (Tauri or Electron; agents should recommend which and why). Not a hosted web app.
2. Agent layer for v1: Claude Code + skills running beside the app (the CLI is the agent; the GUI is the read/plan surface). No in-app chat assistant in v1.
3. Scope: school only (7 courses). The professional side (Styberg / ITS internship) is a stub phase that names integration points, not a design.
4. Outputs: markdown under `docs/planning/` on a feat branch.

## Hard constraints and gotchas (from the ingest work; do not re-derive)

- Blackboard ingest only works inside a logged-in Blackboard tab (NetID + Duo, sessions expire overnight). Stack logs in; Claude never enters credentials. File bytes cannot be fetched from page JS (cross-origin, no CORS); downloads go through the browser. Only durable `bbcswebdav` rid/xid URLs survive; session URLs 403 the next day.
- The crawler holds only the publishable key; insert-only policies on `bb_raw`, `bb_files`, `bb_file_text`, storage `bb-files`. RLS is on with a permissive `authenticated` policy elsewhere; the service key never reaches a browser. Any client that reads typed tables needs an auth story.
- Facts live in `assignments`; Stack's planner state lives in `assignment_progress` (and `reading_progress`) and is never overwritten by syncs. Reconciliation: Blackboard overwrites only `tentative`/`inferred` rows or null fields; conflicts with `confirmed` rows land in `sync_runs.summary`.
- `bb_raw` → typed transforms for gradebook and announcements are still hand-written SQL. Grades are not computed anywhere. Attempts endpoint: `/gradebook/columns/<id>/attempts?userId=`; groups: `/courses/<id>/groups`.
- Grading models are confirmed for all courses: ECN.304 weighted (exams rank-weighted 30/25/20, quizzes 15 drop lowest, participation 10); GEO.103 weighted (5/15/10/20/20/30); IST.323 points 104/100; IST.352 weighted (research 5, project deliverables 60, final 10, peer 10, attendance 15; late -20%/day); IST.466 points/1020 (two major cases rank-scored); IST.471 qualitative 70/30.
- Local mirror of all files: OneDrive `.fall2026/.projects2026/bb2dash/course context/<course>/<bucket>/<assignment-slug|week-NN>/<file>` (gitignored). ~22 GEO readings are OIA ebooks with no bytes.
- Stack's working preferences: exhaustive questions up front rather than iteration; short status lines; flag non-obvious design decisions; push back when something is missing; no hedge theater. Redirect open questions to him rather than guessing (collect them in an "Open questions for Stack" section).

## Output rules for every agent

- Write your deliverable to the file named in your task, in plain markdown, prose-first; tables only where a matrix is the honest shape. No em dashes. No mid-paragraph bold.
- Cite files and columns precisely (`assignments.bb_column_id`, `13-home-v2.dc.html` section id, `support.js` function name) so the next agent can verify.
- Separate what is true today (verified in code/DB) from what you infer. Mark inferences.
- End with "Open questions for Stack" (numbered) and "Handoff notes" (what the next stage should not miss).

# bb2dash — Working Notes

## Scope (updated 2026-09-02)
Ingest everything from Blackboard Ultra (course shells, content tree, assignments/tests,
gradebook, announcements, calendar, discussions, files) on a cadence, appending to the one
central Supabase DB (`bb2dash`, ref `goultdzqcavefcgnifdy`). The app built on top is the
central hub for all schoolwork. Professional-side data comes later.

## Phases
1. DONE — identify classes, build data syntax, seed from syllabi (Supabase `bb2dash`).
2. DONE (initial pass) — Blackboard capture via built-in browser + internal JSON API → `bb_raw` → typed tables. See `PHASE2_FINDINGS.md`.
3. NEXT — read the remaining syllabi (IST 352, IST 466, GEO recitation), finish grading models, and make the crawl repeatable on a cadence (weekly + before each class day), diffing `bb_raw` runs into the typed tables.
4. NEXT — stage this codebase as a public GitHub repo. Dev workflow rule: develop on branches, test visually on a local port, push to prod only when Stack explicitly asks (saved in project memory as `feedback_dev_workflow.md`).
5. LATER — the app on top: dashboard + planner + agentic hub; professional-side data.

## Open caveats (keep visible)
1. IST.352 and IST.466 have no syllabus on file. Grading method = `unknown`, meeting times null.
   First thing to fill from Blackboard.
2. ECN.304 meeting time/room not in its syllabus. Fill from Blackboard.
3. GEO.103 recitation M003 is *assumed* to be syllabus "Sec. 3" (Fri 11:40-12:35, Maxwell 108).
   Confirm.
4. IST.466 schedule doc (v. Aug 31) has date typos: "9/27" is a Sunday (probably Tue 9/29) and
   "12/5" is a Saturday (probably Tue 12/8). Rows flagged `tentative`.
5. IST.352 instructor bio PDF is image-only; nothing extracted.
6. Reconciliation rule: Blackboard overwrites only `tentative`/`inferred` seed rows or null
   fields. Conflicts with `confirmed` rows go to `sync_runs.summary` and get surfaced. IST 323 is
   already on syllabus v1.3.1 after a due-date move, so expect drift.
7. RLS is on with a permissive policy for `authenticated`; service-role key bypasses. Never ship
   the service key to a browser client. Add Supabase Auth or a deliberate anon policy before the
   dashboard goes to a browser.
8. Blackboard file bytes (`bbcswebdav`) can't be fetched from page JS (cross-origin redirect, no CORS) and
   scripted downloads need explicit permission. Files are catalogued in `bb_files`; download by hand.
9. Ingestion secret hygiene: the crawler only ever holds the publishable key (insert-only policies on
   `bb_raw`, `bb_files`, storage `bb-files`). Never put the service key in the browser.
10. Do not `git init` inside the OneDrive-synced folder; OneDrive corrupts `.git`. Keep the repo under
    `~/projects/` and treat the OneDrive `course context/` folder as an input.
11. Claude never enters credentials. Stack logs into Blackboard (NetID + Duo) in the built-in
   browser; site access for blackboard.syracuse.edu is granted persistently.

## Recurring export path
Blackboard Ultra calendar iCal feed = all due dates, no browser needed. Capture URL during a
browser pass; keep it in `.env` / `sync_runs.notes`, never in the repo.

## Files
- `DATA_SYNTAX.md` — data dictionary, enums, ID conventions, phase-2 capture checklist
- `db/migrations/001_schema.sql` — schema
- `db/seed/002..004_*.sql` — syllabus seeds (reproducible)

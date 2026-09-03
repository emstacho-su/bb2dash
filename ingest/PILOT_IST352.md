# Pilot: bb-course-map + bb-course-pull on IST 352 (2026-09-03)

Result: 7 files (was 6 catalogued) downloaded via the built-in browser, sorted into
`course context/IST.352/<bucket>/`, uploaded to Storage `bb-files/IST.352/...`, 68 text units in
`bb_file_text`, grading model + team resolved, map bumped to v2.

What the pilot changed in the skills
1. Manifest refresh is mandatory before download: 1 of 6 URLs was already stale (instructor
   re-uploaded the team sheet the evening after the crawl; old rid 404s) and 1 file was missing
   (embed carried only a `viewerUrl`).
2. Built-in browser downloads land in `~/Downloads`; a successful download reports as
   "navigation denied or failed". A real failure renders Blackboard's Not Found page.
3. Storage upload with the publishable key: no `x-upsert` header (RLS: insert only).
4. Local moves via PowerShell; the Linux device shell cannot delete from mounted folders.
5. Text units POST to `/rest/v1/bb_file_text` (insert-only anon policy, migration 007).

Open for Stack: OIA textbook access; meeting days (syllabus says Mon only, Blackboard has Wed
knowledge checks); the three unopened items (Project Teams & Option 9/1, KC 08/31, KC 09/02).

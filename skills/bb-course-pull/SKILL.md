---
name: bb-course-pull
description: Execute a course map — download every file in a Blackboard Ultra course, classify it into the course's buckets, store bytes in Supabase Storage with a local mirror, extract text, and update the typed tables. Use when Stack says "pull <course>", "run the pull", "harvest <course>", or after bb-course-map has produced a map. Requires his explicit download approval for the batch.
---

# bb-course-pull

Executes `course_maps` (latest version) for one course. Idempotent: re-running only touches rows
whose bytes changed. Never runs without a map; if none exists, invoke bb-course-map first.

## Preconditions
1. Latest map: `select map from course_maps where course_id=$1 order by version desc limit 1`.
2. Stack has approved this batch in chat (file count, course, largest size). One approval per run.
3. A browser is logged into Blackboard: built-in browser (`Claude_Browser__*`) preferred; Claude in
   Chrome as fallback. Check with a page-context probe (`location.href` not on the login page).
4. Downloads folder and the course-context folder are connected on the device.

## Step 0 — Refresh the manifest against Blackboard (mandatory; catalogs go stale within a day)
For every owning content item in the manifest, re-fetch `/learn/api/v1/courses/<bb_id>/contents/<content_id>`
from the logged-in tab and re-parse `body.rawText` for `<a data-bbfile="{json}">`. Use `resourceUrl`,
and when it is absent fall back to `viewerUrl` stripped of its query string. Diff against the manifest:
replace changed URLs (instructors re-upload; the old rid 404s), add files the catalog lacks, and
insert/patch `bb_files` before downloading. Lesson from the pilot: 1 of 6 URLs was stale and 1 file
was missing entirely.

## Step 1 — Download the whole course in ONE call (no per-file prompts)
- Build the URL list from the refreshed manifest (`source_url` + `?xythos-download=true`).
- In the logged-in tab run `bb.downloadAll(urls)` (from `ingest/bb_crawler.js`): hidden anchor clicks
  ~1.5 s apart. The page stays put; files land in `~/Downloads` under their Blackboard display names
  (collisions get `(1)` appended). Any browser permission prompt appears once for the batch, never per
  file. Do NOT navigate the tab per file.
- Verify by listing `~/Downloads` (names + sizes), not by tool messages. Re-fire only the missing ones.
- Files only: never click test, survey, discussion, or attempt controls.
- Per file: sha256, bytes, mime. If a `bb_files` row with the same sha already has `storage_path`,
  mark duplicate and skip upload/extraction.

## Step 2 — Classify
- Start from the map's bucket for the file. If the map says `unclassified` or confidence < 0.8,
  open the extracted text (Step 4) and decide; write a one-line rationale to `bb_files.notes`.
- Never change a row where `classified_by = 'stack'`.

## Step 3 — Store (the end product: class → bucket → assignment folder → files)
- Link every file to its assignment first (`bb_files.assignment_id`; readings/slides get `week_no`).
  The canonical relative path is `bb_file_relpath(id)` (migration 008):
  `<course>/<bucket>/<assignment-slug>/<file>` when linked to an assignment,
  `<course>/<bucket>/week-NN/<file>` for lecture_slides/readings with a week, else `<course>/<bucket>/<file>`.
  `v_file_layout` shows the target path per row and `needs_move` for drift.
- Local mirror: PowerShell `Move-Item` from Downloads to `course context/<relpath>` (create dirs;
  rename `(1)` collisions back). Move hand-placed copies into the layout too. The Linux device shell
  cannot delete from mounted folders, so use PowerShell for moves.
- Canonical: `device_stage_files` the mirrored files, then `POST /storage/v1/object/bb-files/<relpath>`
  with the publishable key, correct Content-Type, NO `x-upsert` header (anon is insert-only; a changed
  file gets a new key; old keys need an authenticated Storage delete). Never use the service key in a browser.
- Update `bb_files` via the Supabase MCP: `storage_path='bb-files/'||bb_file_relpath(id)`,
  `local_path='course context/'||bb_file_relpath(id)`, sha256, bytes, mime_type, downloaded_at, bucket,
  week_no, links, classified_by, classification_confidence, text_status.
- Acceptance: `select count(*) from v_file_layout where course_id=$1 and needs_move` = 0 and the
  local tree matches (`Get-ChildItem -Recurse`).

## Step 4 — Extract text
- Stage files to the cloud workspace; run `ingest/extract_text.py` (pdftotext per page, python-docx
  whole doc, python-pptx per slide incl. notes, openpyxl per sheet). Insert into `bb_file_text`.
  Set `text_status = extracted | failed | na` (na for images/media).

## Step 5 — Apply what the documents say
- If the pulled set includes a syllabus or schedule: run the bb-course-map "frame the course" step
  again against the new text and update `grading_schemes`, `grade_components`, `assignments`,
  `sessions`, `readings` (respecting the seed's confirmed/tentative rules). Bump the map version.

## Step 6 — Report
- `insert into sync_runs (source, scope, summary)` with counts: downloaded, duplicates, uploaded,
  extracted, failed, reclassified, gaps closed.
- Tell Stack: per-bucket counts (`v_course_corpus`), anything that failed, and any
  `stack_must_confirm` fields still open.

## Failure handling
- Download lands nowhere (viewer opened instead): retry with `?xythos-download=true`; if it still
  renders, screenshot and ask Stack once; do not loop.
- A 403/redirect to login: the session expired; stop, ask Stack to log in, resume from the manifest
  (rows without `downloaded_at`).

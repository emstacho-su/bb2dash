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

## Step 1 — Download (per `file_manifest`, priority order)
- `direct_url`: navigate the browser tab to `source_url` + `?xythos-download=true`. In the built-in
  browser a successful download surfaces as a "navigation denied or failed" result; a real failure
  shows a Blackboard "Not Found" page instead, so check `~/Downloads` (newest file) rather than the
  tool's message. Files save with their Blackboard display name; collisions get `(1)` appended
  (Electron style, no space).
- `open_parent_and_click`: navigate to the parent content page
  (`/ultra/courses/<bb_id>/outline/edit/document/<content_id>` or the folder), read the page, click
  the attachment link, then record as above.
- Never click test/survey/discussion/attempt controls. Files only.
- After each file: `sha256`, `bytes`, mime sniff; if a `bb_files` row with the same sha already has
  `storage_path`, mark this row as duplicate-of and skip upload/extraction.

## Step 2 — Classify
- Start from the map's bucket for the file. If the map says `unclassified` or confidence < 0.8,
  open the extracted text (Step 4) and decide; write a one-line rationale to `bb_files.notes`.
- Never change a row where `classified_by = 'stack'`.

## Step 3 — Store
- Local mirror: move from Downloads to `course context/<course_id>/<bucket>/<file_name>` (create
  dirs; if a hand-placed copy already exists there with the same sha, keep one).
- Canonical: upload to Supabase Storage `bb-files/<course_id>/<bucket>/<file_name>` (browser page
  context with the publishable key cannot read local files, so upload from the cloud workspace or the
  device shell via the Storage REST API with the publishable key: `POST /storage/v1/object/bb-files/<key>`).
- Update `bb_files`: `storage_path, local_path, sha256, bytes, mime_type, downloaded_at, bucket,
  week_no, session_id, assignment_id, reading_id, classified_by, classification_confidence`.

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

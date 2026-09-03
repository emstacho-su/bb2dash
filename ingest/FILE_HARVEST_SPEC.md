# bb2dash — File Harvest Spec (data request requirements for browser agents)

Purpose: get **every file and its metadata** out of each Blackboard Ultra course shell, classify it
into a per-class bucket using that class's syllabus and schedule, and land it in the canonical store
(Supabase Storage + `bb_files` + `bb_file_text`) with a local mirror. This corpus is the base truth
the class hub is built on.

## 1. Inputs the agent is handed

| Input | Source | Why |
|---|---|---|
| Course roster | `courses` (id, bb_id, title_short) | one job per shell; GEO has two shells |
| File manifest | `bb_files` rows where `storage_path is null` | what to download; `source_url` is the bbcswebdav link |
| Content tree | `bb_content` (path, bb_type, parent) | where the file sits in Blackboard = strongest bucket signal |
| Syllabus + schedule text | `bb_file_text` for that course's `syllabus_policy` and `schedule` files (bootstrap from `course context/` extracts) | to map files to weeks, sessions, assignments |
| Sessions / assignments / readings | typed tables | targets for `session_id`, `assignment_id`, `reading_id` links |

Run manifest = `bb_files` filtered to the course, ordered by `path`. The agent never invents URLs; it
only opens `source_url`s from the manifest (or new ones a fresh crawl adds).

## 2. Download protocol (Claude in Chrome)

1. Chrome is already logged into Blackboard. Open a new tab.
2. Ask Stack once per run for download permission, listing file names, course, and count.
3. Refresh every embedded-file URL from the owning document first (`bb.refreshEmbeds`); catalogs go
   stale within a day when instructors re-upload.
4. Fire the whole course's downloads from ONE page-context call (`bb.downloadAll(urls)`): hidden
   anchor clicks with `?xythos-download=true`, ~1.5 s apart. The page stays put, files land in
   `~/Downloads` under their Blackboard display names, and any browser permission prompt appears once
   for the batch rather than per file. Verify by listing Downloads, not by tool messages.
5. Never open a file URL that isn't in the manifest; never click anything that submits, opens an
   attempt, or changes course state (test links, surveys, discussion posts are NOT files).
6. After the batch, hand off to the sorter (section 4) with `[(bb_files.id, landed_filename)]`.

Rate: one file at a time, small pause between navigations; Blackboard tolerates this fine.

## 3. Bucket taxonomy (per class)

| bucket | What goes here | Primary signal |
|---|---|---|
| `syllabus_policy` | syllabus, university policy appendix, grading criteria docs | filename/title contains syllabus/policy/criteria; content path "Syllabus" |
| `schedule` | class schedule docs, week calendars | title contains schedule |
| `lecture_slides` | lecture decks, in-class handouts (`*_HO`) | path "Lecture Slides", "Content / <topic>", pptx in weekly modules |
| `readings` | assigned articles, chapters, reading-question sheets | path under week modules, matches a `readings` row, pdf of an article |
| `assignment_spec` | instructions, packets, rubrics, sample appendices, price sheets | path under "Assignments" or an assignment folder; matches an `assignments` row |
| `lab_materials` | lab access instructions, lab manuals | path "Labs", title contains lab |
| `project_materials` | case packets (Synchrony, Meridian), team rosters, project templates | title contains case/project/packet/team |
| `my_submissions` | files Stack uploaded (attempts) | from attempt endpoints, not content tree |
| `admin` | rosters, tool help (Qwickly), login guides, logistics | title contains roster/help/logon/access |
| `media_links` | Kaltura/YouTube/LTI links — link-only, no bytes | `bb_content.item_kind in (lti, link)` with media host |

Every file additionally gets: `week_no`, `session_id` (class date it supports), `assignment_id`,
`reading_id` when a match exists, plus `classified_by` (`rule` | `agent` | `stack`) and
`classification_confidence`.

## 4. Classification method (syllabus + schedule first)

1. **Read the class's syllabus and schedule text** (`bb_file_text`). Build the week map:
   week_no → dates → topics → listed readings/assignments. This is the reference frame.
2. **Rule pass** (deterministic, see `ingest/classify_rules.sql`): content path + filename + mime →
   bucket. Path beats filename; filename beats mime. Attach `week_no` when the path or title carries a
   week/date ("WK01", "Week 2", "08/26/26", "Lecture #3 - Week 3").
3. **Link pass**: match to `sessions` by date/topic, to `assignments` by `bb_item_id`/title, to
   `readings` by citation similarity. A file that matches an `assignments` row is `assignment_spec`
   unless it's a packet/case (→ `project_materials`).
4. **Agent pass** for whatever the rules left `unclassified` or low-confidence: the agent reads the
   extracted text and the week map and decides, recording a one-line rationale in `notes`.
5. **Stack override** wins over everything; syncs never change a row where `classified_by='stack'`.

## 5. Storage layout

One relative path per file, computed by `bb_file_relpath(id)` (migration 008) and used for BOTH the
Storage key (`bb-files/<relpath>`) and the local mirror (`course context/<relpath>`):

    <course>/<bucket>/<assignment-slug>/<file>   linked to an assignment  (e.g. IST.323/project_materials/fp-packet/...)
    <course>/<bucket>/week-NN/<file>              lecture_slides / readings with a known week
    <course>/<bucket>/<file>                      everything else (syllabus_policy, schedule, admin)

So a class folder reads: course → bucket → the assignment (or week) the material belongs to → files.
`v_file_layout.needs_move` flags rows whose stored path drifted from the canonical one (e.g. after
an assignment link is added); the pull skill re-lays them. Existing hand-placed files get moved
into this layout too. The mirror lives under the OneDrive bb2dash folder (gitignored; professors' IP).

`bb_files` row per file: `sha256` (dedupe across shells; the two IST 466 "Ethics Criteria.pptx" are
the same bytes), `bytes`, `mime_type`, `storage_path`, `local_path`, `downloaded_at`, `bucket`,
links, classification fields, `text_status` (`pending|extracted|failed|na`).

## 6. Text layer

`bb_file_text`: one row per file per unit (page for PDF, slide for PPTX, whole doc for DOCX, sheet
for XLSX) with `unit_no`, `text`, `char_count`. Extraction runs in the cloud workspace (pdftotext,
python-docx, python-pptx, openpyxl). Embeddings are a later migration (pgvector on this table).

## 7. Cadence and idempotency

Weekly re-crawl (`bb_crawler.js`) refreshes `bb_files` from the content tree. New rows (no
`storage_path`) are the next download batch. Existing rows are re-downloaded only if Blackboard's
`modifiedDate` on the owning content item moved past `downloaded_at`. Hash equality short-circuits
re-upload and re-extraction. Every run writes a `sync_runs` row with counts and the list of new files.

## 8. Acceptance for a course = "harvested"

All manifest rows have `storage_path`, `sha256`, `bucket != 'unclassified'`, `text_status in
(extracted, na)`, and the local mirror matches by hash. `v_course_corpus` shows the per-bucket count.

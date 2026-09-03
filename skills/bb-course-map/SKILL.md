---
name: bb-course-map
description: 'Map one Blackboard Ultra course before pulling it. Reads the syllabus, schedule, content tree, gradebook and announcements, decides which fields this course needs, and writes a versioned course map that bb-course-pull executes. Use when Stack says map a course, build the course map, or before the first pull of any course.'
---

# bb-course-map

You are producing a **course map**: the per-course contract that says what to collect, from where,
into which bucket, and which course-specific fields matter. The map is the artifact; nothing is
downloaded here. Output = one JSON document, validated, stored, and summarized to Stack.

## Inputs (all already in Supabase `bb2dash`, ref goultdzqcavefcgnifdy)
- `courses` row (id, bb_id, title_short, syllabus_status)
- `bb_content` for the course (path, bb_type, item_kind, body, detail)
- `bb_files` for the course (file manifest with rule-pass buckets)
- gradebook columns from the latest `bb_raw` run (`payload->'gradebook'`)
- `announcements`, `sessions`, `assignments`, `grade_components`, `readings` for the course
- syllabus + schedule text: `bb_file_text` if extracted, else the local extract from `course context/`

If the latest crawl is older than 7 days or `bb_content` is empty for the course, run
`ingest/bb_crawler.js` (`bb.crawl(bb_id)` → post to `bb_raw`) first; never map from stale data.

## Method (do these in order, write findings as you go)
1. **Frame the course from its own documents.** Read syllabus + schedule. Extract: grading method
   and components with weights/points and rules (drops, rank-weighting, normalization, extra
   credit); assignment families (exam, quiz, lab, project, presentation, discussion, attendance,
   reading check); recurring vs one-off; cadence (weekly module? topic folders?); group structure
   (teams, ethics groups); submission channels and formats; late/AI policies; meeting pattern.
2. **Walk the content tree and name its organizing principle.** Weekly modules (IST 352), topic
   folders (ECN 304), functional folders (IST 323: Syllabus / Lecture Slides / Assignments / Quizzes),
   learning modules per week with embedded readings (GEO 103). Record it as `tree_shape` with the
   path patterns that identify each bucket in THIS course.
3. **Enumerate sources.** For each source kind, the exact locator: content paths, gradebook column
   ids, announcement stream, calendar, discussion boards, groups, attempts (my submissions). Note
   which are file-bearing, which are structural only, which are link-only (LTI/Kaltura/OIA).
4. **Decide the course-specific fields.** Beyond the common schema, list fields this course needs
   and where they come from, e.g. IST 323: `sitn_group`, `sitn_date`, `presentation_date`,
   `fp_organization`, `lab_access_code_status`; IST 466: `ethics_group`, `major_case_group`,
   `attendance_counted_dates`; GEO 103: `section_no`, `qwickly_absences`; IST 352: `project_team`,
   `project_option`, `knowledge_check_series`. Each field: name, source locator, current value if
   visible, confidence, `stack_must_confirm` flag.
5. **Build the file manifest.** Every `bb_files` row for the course + any file the tree walk found
   that the catalog lacks. For Ultra documents (content items with `bb_type` null), re-fetch the item
   and parse every `data-bbfile` embed: take `resourceUrl`, else `viewerUrl` minus its query string;
   embeds that only carry a viewer URL are real files the summary crawl misses. For each: target bucket, week_no, linked session/assignment/reading,
   `download_method` (`direct_url` | `open_parent_and_click` when `source_url` is missing/`undefined`),
   priority (syllabus/schedule first), and `expected_mime`.
6. **List gaps and conflicts.** Anything the syllabus says that Blackboard contradicts (dates,
   points), anything unknown (grading for a course with no syllabus), stale artifacts (rolled-over
   gradebook columns). Each gap gets an owner: `blackboard_pull`, `stack`, or `wait`.
7. **Write the map** (schema below), validate, store:
   - `insert into course_maps (course_id, version, map, notes)`; version = previous + 1
   - write `course context/<course_id>/course_map.json` in the OneDrive folder
   - summarize to Stack in prose: tree shape, buckets with counts, course-specific fields, gaps,
     and the `stack_must_confirm` items as questions.

## Map schema (JSON)
```
{
  "course_id": "IST.352", "bb_id": "_570144_1", "version": 1, "mapped_at": "...",
  "meeting": {"days": [...], "start": "12:45", "end": "14:05", "room": "...", "source": "..."},
  "grading": {"method": "...", "components": [...], "rules": [...], "source": "...", "confidence": "..."},
  "tree_shape": {"principle": "weekly_modules", "bucket_paths": {"lecture_slides": ["Weekly Modules / WK*"], ...}},
  "sources": [{"kind": "content_tree|gradebook|announcements|calendar|groups|attempts|discussions", "locator": "...", "file_bearing": true}],
  "course_fields": [{"name": "...", "source": "...", "value": null, "confidence": "...", "stack_must_confirm": false}],
  "file_manifest": [{"bb_file_id": 27, "file_name": "...", "source_url": "...", "download_method": "direct_url", "bucket": "syllabus_policy", "week_no": null, "assignment_id": null, "reading_id": null, "priority": 1}],
  "gaps": [{"what": "...", "owner": "stack|blackboard_pull|wait"}]
}
```

## Rules
- Never guess a field value; leave it null with `stack_must_confirm: true`.
- Path patterns beat filename heuristics; write the pattern that would classify a NEW file next week.
- Keep the map minimal enough to read in one screen per course; detail lives in the DB rows it points at.
- The map is versioned; never overwrite a prior version's row.

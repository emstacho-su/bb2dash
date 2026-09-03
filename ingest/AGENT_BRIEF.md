# Agent brief: harvest ONE Blackboard course for bb2dash

You are one of several agents running IN PARALLEL, each on a different course. Read this whole file,
then read the two skills and follow them literally:
`/home/claude/bb2dash/skills/bb-course-map/SKILL.md` then `/home/claude/bb2dash/skills/bb-course-pull/SKILL.md`
(also saved as user skills `bb-course-map` / `bb-course-pull`; invoking them via the Skill tool is fine).
Pilot notes: `/home/claude/bb2dash/ingest/PILOT_IST352.md`. Spec: `/home/claude/bb2dash/ingest/FILE_HARVEST_SPEC.md`.

## Hard rules
- Never ask the user anything. Stack has already approved downloading every catalogued file for every
  course. State assumptions in your final report instead.
- Do NOT run git. Do NOT apply migrations. Do NOT touch rows of other courses. Do NOT modify the skills.
- Only your own browser tab (see Browser). Only your own course's files in Downloads (see Downloads).
- If Blackboard shows a login page (NetID / microsoftonline), stop and report "SESSION EXPIRED".
- Your final message is the only thing the orchestrator sees. Make it the report defined at the end.

## Supabase (project bb2dash, ref goultdzqcavefcgnifdy)
- Reads/updates: Supabase MCP tool `mcp__Supabase__execute_sql` (load with ToolSearch `select:mcp__Supabase__execute_sql`).
- REST/Storage from cloud Bash: URL https://goultdzqcavefcgnifdy.supabase.co, publishable key
  sb_publishable_DCtdYptOILBVKsKv-aHNAg_ruNCH_fe. Anon is INSERT-ONLY on bb_raw, bb_files, bb_file_text and
  the storage bucket bb-files. Storage upload = `POST /storage/v1/object/bb-files/<relpath>` with headers
  apikey + Authorization Bearer + Content-Type, NO x-upsert. Text units = `POST /rest/v1/bb_file_text` JSON array
  of {file_id, unit_kind, unit_no, text} with Prefer: return=minimal.
- Tables you will touch: bb_files (your course rows only), bb_file_text, course_maps, grading_schemes,
  grade_components, assignments, sessions, readings, meetings, course_staff, sync_runs. Views: v_file_layout
  (relpath, needs_move), v_course_map_latest, v_course_corpus. Function: bb_file_relpath(bb_files.id).
- Layout (the deliverable): `<course>/<bucket>/<assignment-slug>/<file>` when bb_files.assignment_id is set
  (slug = part after the '/'), `<course>/<bucket>/week-NN/<file>` for lecture_slides/readings with week_no,
  else `<course>/<bucket>/<file>`. Set assignment_id / week_no FIRST, then use bb_file_relpath(id) for both the
  Storage key and the local path. Finish with `select count(*) from v_file_layout where course_id=$1 and needs_move` = 0.

## Browser (built-in Claude browser; tools mcp__remote-devices__Claude_Browser__*)
- Load with ToolSearch: `select:mcp__remote-devices__Claude_Browser__preview_start,mcp__remote-devices__Claude_Browser__javascript_tool,mcp__remote-devices__Claude_Browser__tabs_context`.
- FIRST call `preview_start` with url `https://blackboard.syracuse.edu/ultra/courses/<bb_id>/outline` and keep
  the returned tabId; pass `tabId` on EVERY browser call. Never act on tab 'seed' or another agent's tab.
- In javascript_exec use ABSOLUTE URLs. Session cookie authorizes /learn/api/v1/... JSON.
- Refresh embeds (mandatory before download): for each owning content id, fetch
  `https://blackboard.syracuse.edu/learn/api/v1/courses/<bb_id>/contents/<content_id>` and parse every
  `data-bbfile="..."` attribute in `body.rawText` (HTML-unescape &quot; and &amp;, JSON.parse): use
  `resourceUrl`, else `viewerUrl` with its query string removed. Compare with bb_files.source_url; patch stale
  URLs and insert rows for files the catalog lacks (via execute_sql).
- Downloads may land as `<uuid>.tmp` (never renamed) under concurrency: claim by size + magic bytes + text signature, then rename on move.
- Sanitize file_name for Storage keys: no `#`, no curly quotes.
- Refresh embeds on EVERY content item incl. test links (attachments hide in assessment instruction bodies).
- Download the whole course in ONE javascript_exec: for each url, create a hidden `<a href=url+'?xythos-download=true' download>`,
  click it, remove it, wait ~1500 ms. Do not navigate the tab per file.

## Downloads folder (SHARED with the other agents; be careful)
- C:\Users\estac\Downloads == `$HOME/mnt/Downloads` in `mcp__remote-devices__device_bash`.
- Before firing: `ls -la --time-style=+%s $HOME/mnt/Downloads` and remember the names you expect (from your
  manifest). After firing, wait ~5 s, list again; claim ONLY new files whose base name matches your manifest
  (a `(1)`/`(2)` suffix may appear if another course has the same filename; treat `<name>(1).ext` as yours only
  if `<name>.ext` was already present before your batch or belongs to another course's manifest). Verify size > 0.
- Move IMMEDIATELY with `mcp__remote-devices__Windows-MCP__PowerShell` (`Move-Item -Force`) into
  `C:\Users\estac\OneDrive - Syracuse University\.fall2026\.projects2026\bb2dash\course context\<relpath-without-course-prefix>`
  under your course folder, renaming `(1)` suffixes back to the manifest name. Also move any hand-placed copies
  already sitting in your course folder into the layout (same name → keep the newer/identical one).
- device_bash cannot delete inside mounts; PowerShell can.

## Cloud side
- Stage the mirrored files with `mcp__remote-devices__device_stage_files` (absolute Windows paths under the
  course context folder) → they appear under `/mnt/user-data/uploads/bb2dash/course context/...`.
- Hash: `sha256sum`. Extract: `python3 /home/claude/bb2dash/ingest/extract_text.py <files...>` (JSON on stdout).
- Dedupe: if two of YOUR rows share a sha256, store one object, set the other row's storage_path to the same key
  and notes='duplicate of bb_files.id N'.

## Reading the syllabus/schedule (Step 5 of the pull skill)
- Update grading_schemes (method, letter_scale jsonb [{"letter","min"}], late_policy, ai_policy, notes,
  source='blackboard', confidence='confirmed'), grade_components (weights or points; keep codes stable; insert
  new codes with `on conflict (course_id, code) do nothing`, then update), assignments (points, due dates only
  where seed confidence is tentative/inferred or null), sessions (only where different), meetings (fill nulls),
  course_staff (fill nulls), courses.syllabus_status='complete', courses.group_notes.
- Then write map v2 (course_maps version 2) with resolved course_fields and remaining gaps.

## Files to write
- `/home/claude/bb2dash/maps/<course_id>.course_map.v1.json` and `.v2.json` (cloud), and commit v2 to
  `...\bb2dash\course context\<course_id>\course_map.json` via SendUserFile + device_commit_files.
- `insert into sync_runs (source, scope, summary, notes)` with counts at the end.

## Final report format (plain text, this exact structure)
COURSE: <id>
RESULT: PASS | PARTIAL | FAIL  (PASS = all catalogued files stored+mirrored+text, needs_move=0, map v2 written, grading confirmed if a syllabus was in the batch)
COUNTS: downloaded=, new_files_found=, stale_urls_fixed=, uploaded=, text_units=, duplicates=, failed=
FOLDER TREE: (relative paths under course context\<course>\)
GRADING: <method + components or "unchanged">
STACK_MUST_CONFIRM: <list or none>
BROKE: <list or none>

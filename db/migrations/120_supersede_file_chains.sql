-- bb2dash :: 120_supersede_file_chains.sql
-- Phase 18 (brief 98, Contract row 120; task 6; P-26, R-63). Worker W-48.
--
-- Two documents were re-uploaded on Blackboard under the same content item, and the older copy
-- still reads as current, so /materials and search return both:
--
--   * IST.323 syllabus: bb_files 2 (323Fall26V1.3.1.docx) -> 151 (323Fall26V1.4.docx).
--     Content item _12928159_1 carries only 323Fall26V1.4.docx in bb_raw run 3b5174b8 (and in
--     every registered crawl since).
--   * IST.466 schedule: bb_files 74 (IST466M3 Schedule Fall2026-Wk3.docx) -> 149
--     (IST466M3 Schedule Fall2026-Wk4xyz.docx). Content item _12939631_1 carries only the
--     Wk4xyz file in the same run.
--
-- DECISIONS 2026-09-22 row 171: a re-upload of an already-stored file gets its own key and
-- supersedes the older row. This migration writes those two links by hand; migration 122's
-- supersede_replaced_files makes the rule automatic for the next re-upload.
--
-- File 151 also moves to the syllabus bucket. It is `unclassified` today, so IST.323's syllabus
-- bucket would hold only file 3 (the Student Policies appendix), and resolveSyllabusFiles
-- (web/src/lib/queries.materials.ts) would pick that appendix as the syllabus. A bucket moved by
-- hand must not claim the rule classifier put it there, so 151 takes classified_by = 'agent' and
-- file 2's own classification_confidence (brief 105 §3).
--
-- courses.syllabus_path for IST.323 follows to the V1.4 key.
--
-- Guard (P-26): exactly 3 bb_files rows and 1 courses row change, or the migration raises and
-- nothing is written.

do $$
declare
  NOTE_2   constant text := 'superseded by bb_file 151 (323Fall26V1.4.docx): bb_raw run 3b5174b8 '
                            'shows content item _12928159_1 carrying only V1.4; DECISIONS 2026-09-22 '
                            'row 171; migration 120';
  NOTE_74  constant text := 'superseded by bb_file 149 (Wk4xyz): bb_raw run 3b5174b8 shows content '
                            'item _12939631_1 carrying only the Wk4xyz file; DECISIONS 2026-09-22 '
                            'row 171; migration 120';
  NOTE_151 constant text := 'bucket set to syllabus_policy by migration 120 (the current IST.323 '
                            'syllabus, V1.4, replacing bb_file 2)';
  V14_SYLLABUS_KEY constant text := 'IST.323/323Fall26V1.4.docx';
  v_files   int := 0;
  v_courses int := 0;
  v_n       int;
begin
  update bb_files
     set superseded_by = 151,
         notes = btrim(coalesce(notes || ' | ', '') || NOTE_2)
   where id = 2 and superseded_by is null and course_id = 'IST.323'
     and file_name = '323Fall26V1.3.1.docx';
  get diagnostics v_n = row_count;
  v_files := v_files + v_n;

  update bb_files
     set superseded_by = 149,
         notes = btrim(coalesce(notes || ' | ', '') || NOTE_74)
   where id = 74 and superseded_by is null and course_id = 'IST.466'
     and file_name = 'IST466M3 Schedule Fall2026-Wk3.docx';
  get diagnostics v_n = row_count;
  v_files := v_files + v_n;

  update bb_files f
     set bucket = 'syllabus_policy',
         classified_by = 'agent',
         classification_confidence = (select g.classification_confidence from bb_files g where g.id = 2),
         notes = btrim(coalesce(f.notes || ' | ', '') || NOTE_151)
   where f.id = 151 and f.superseded_by is null and f.course_id = 'IST.323'
     and f.file_name = '323Fall26V1.4.docx';
  get diagnostics v_n = row_count;
  v_files := v_files + v_n;

  update courses
     set syllabus_path = V14_SYLLABUS_KEY
   where id = 'IST.323' and syllabus_path is distinct from V14_SYLLABUS_KEY;
  get diagnostics v_courses = row_count;

  if v_files <> 3 or v_courses <> 1 then
    raise exception '120: expected 3 bb_files rows and 1 courses row to change, got % and %',
      v_files, v_courses;
  end if;
end $$;

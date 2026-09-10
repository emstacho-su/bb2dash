-- Live view definitions in Supabase project bb2dash (goultdzqcavefcgnifdy), captured 2026-09-08.
-- Tables (public, row counts 2026-09-08): terms 1, courses 7, course_staff 12, meetings 11, sessions 145,
-- grading_schemes 6, grade_components 35, assignments 66, assignment_progress 65, readings 86,
-- reading_progress 75, announcements 11, bb_content 139, sync_runs 12, bb_raw 24, bb_files 64,
-- bb_file_text 534, course_maps 15. Full column lists live in db/migrations/001..009 (all applied).

CREATE VIEW v_course_corpus AS
 SELECT c.id AS course_id, c.title_short, f.bucket, count(*) AS files,
        count(*) FILTER (WHERE f.storage_path IS NOT NULL) AS stored,
        count(*) FILTER (WHERE f.text_status = 'extracted') AS with_text
   FROM courses c JOIN bb_files f ON f.course_id = c.id
  GROUP BY c.id, c.title_short, f.bucket ORDER BY c.id, f.bucket;

CREATE VIEW v_course_map_latest AS
 SELECT DISTINCT ON (course_id) course_id, version, mapped_at, map
   FROM course_maps ORDER BY course_id, version DESC;

CREATE VIEW v_file_layout AS
 SELECT id, course_id, bucket, assignment_id, week_no, file_name,
        bb_file_relpath(id) AS relpath,
        'bb-files/' || bb_file_relpath(id) AS storage_key,
        'course context/' || bb_file_relpath(id) AS local_relpath,
        storage_path, local_path,
        (storage_path IS DISTINCT FROM ('bb-files/' || bb_file_relpath(id))) AS needs_move
   FROM bb_files f;

CREATE VIEW v_overdue AS
 SELECT a.id, a.course_id, c.title_short, a.title, a.type, a.due_at, a.due_date,
        COALESCE(p.status, 'not_started') AS status
   FROM assignments a JOIN courses c ON c.id = a.course_id
   LEFT JOIN assignment_progress p ON p.assignment_id = a.id
  WHERE COALESCE(a.due_at::date, a.due_date) < CURRENT_DATE
    AND COALESCE(p.status, 'not_started') IN ('not_started','planned','in_progress');

CREATE VIEW v_upcoming AS
 SELECT a.id, a.course_id, c.title_short, a.title, a.type, a.due_at, a.due_date, a.due_rule,
        a.points_possible, a.confidence, COALESCE(p.status, 'not_started') AS status, p.priority
   FROM assignments a JOIN courses c ON c.id = a.course_id
   LEFT JOIN assignment_progress p ON p.assignment_id = a.id
  WHERE COALESCE(a.due_at::date, a.due_date) >= CURRENT_DATE
    AND COALESCE(p.status, 'not_started') NOT IN ('submitted','graded','excused','not_applicable','waived','missed')
  ORDER BY COALESCE(a.due_at, a.due_date::timestamptz);

-- NOT present today (GUI README references it): v_course_grade. Grade computation does not exist yet.

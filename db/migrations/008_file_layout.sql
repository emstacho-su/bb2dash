-- bb2dash :: 008_file_layout.sql
-- Canonical relative path for a harvested file. Used for BOTH the Storage key (bb-files/<path>)
-- and the local mirror (course context/<path>).
--   <course>/<bucket>/<assignment-slug>/<file>   when linked to an assignment
--   <course>/<bucket>/week-NN/<file>              when lecture_slides/readings with a week
--   <course>/<bucket>/<file>                      otherwise
create or replace function bb_file_relpath(p_file_id bigint) returns text language sql stable as $$
  select f.course_id || '/' || f.bucket::text || '/' ||
         case when f.assignment_id is not null then split_part(f.assignment_id, '/', 2) || '/'
              when f.bucket in ('lecture_slides','readings') and f.week_no is not null then 'week-' || lpad(f.week_no::text, 2, '0') || '/'
              else '' end || f.file_name
  from bb_files f where f.id = p_file_id
$$;
create view v_file_layout as
select f.id, f.course_id, f.bucket, f.assignment_id, f.week_no, f.file_name,
       bb_file_relpath(f.id) as relpath, 'bb-files/' || bb_file_relpath(f.id) as storage_key,
       'course context/' || bb_file_relpath(f.id) as local_relpath, f.storage_path, f.local_path,
       (f.storage_path is distinct from 'bb-files/' || bb_file_relpath(f.id)) as needs_move
from bb_files f;

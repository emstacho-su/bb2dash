-- bb2dash :: 005_file_corpus.sql
-- Per-class file corpus: classification buckets, links, hashes, local mirror, extracted text.

create type file_bucket as enum (
  'syllabus_policy','schedule','lecture_slides','readings','assignment_spec','lab_materials',
  'project_materials','my_submissions','admin','media_links','unclassified'
);
create type classifier as enum ('rule','agent','stack');
create type text_status as enum ('pending','extracted','failed','na');

alter table bb_files
  add column course_id      text references courses(id),
  add column bucket         file_bucket not null default 'unclassified',
  add column week_no        smallint,
  add column session_id     bigint references sessions(id),
  add column assignment_id  text references assignments(id),
  add column reading_id     bigint references readings(id),
  add column classified_by  classifier,
  add column classification_confidence numeric(3,2),
  add column sha256         text,
  add column local_path     text,
  add column downloaded_at  timestamptz,
  add column bb_modified_at timestamptz,
  add column text_status    text_status not null default 'pending',
  add column notes          text;
create index bb_files_course_bucket_idx on bb_files (course_id, bucket);
create index bb_files_sha_idx on bb_files (sha256);

update bb_files f set course_id = c.id from courses c where c.bb_id = f.bb_course_id;
update bb_files f set bb_modified_at = b.modified_at from bb_content b where b.course_id = f.course_id and b.bb_item_id = f.content_id;

create table bb_file_text (
  id          bigint generated always as identity primary key,
  file_id     bigint not null references bb_files(id) on delete cascade,
  unit_kind   text not null,              -- page | slide | sheet | doc
  unit_no     integer not null default 1,
  text        text not null,
  char_count  integer generated always as (length(text)) stored,
  extracted_at timestamptz not null default now(),
  unique (file_id, unit_kind, unit_no)
);
alter table bb_file_text enable row level security;
create policy bb_file_text_owner_all on bb_file_text for all to authenticated using (true) with check (true);

-- Deterministic first-pass classification from Blackboard path + filename + mime. Agents refine.
create or replace function classify_bb_file(p_path text, p_name text, p_mime text) returns file_bucket language sql immutable as $$
  select case
    when p_name ~* 'syllabus|policies and services|policy|criteria|rubric' then 'syllabus_policy'::file_bucket
    when p_name ~* 'schedule' then 'schedule'
    when p_name ~* 'roster|qwickly|logon|login|access to the|help' then 'admin'
    when p_path ~* '(^|/ )labs?( /|$)' or p_name ~* '\blab\b' then 'lab_materials'
    when p_name ~* 'packet|price sheet|appendix|case|project teams|capstone' then 'project_materials'
    when p_path ~* 'assignments' then 'assignment_spec'
    when p_path ~* 'lecture slides|lecture' or p_name ~* 'lecture|_HO\.pptx$|intro(duction)? to' or (p_mime ~* 'presentation' and p_path !~* 'week') then 'lecture_slides'
    when p_path ~* 'week|wk\d|reading' or p_name ~* 'reading|chapter|\.pdf$' then 'readings'
    else 'unclassified' end
$$;

update bb_files set bucket = classify_bb_file(path, file_name, mime_type), classified_by = 'rule', classification_confidence = 0.6 where classified_by is null;
-- rubric/criteria decks are syllabus_policy by rule but semantically assignment_spec for IST 466; leave for agent pass.
update bb_files set week_no = (regexp_match(coalesce(path,'')||' '||file_name, 'W(?:ee)?K\s?(\d{1,2})', 'i'))[1]::smallint where week_no is null and (coalesce(path,'')||' '||file_name) ~* 'W(?:ee)?K\s?\d{1,2}';

create view v_course_corpus as
select c.id as course_id, c.title_short, f.bucket, count(*) as files,
       count(*) filter (where f.storage_path is not null) as stored,
       count(*) filter (where f.text_status = 'extracted') as with_text
from courses c join bb_files f on f.course_id = c.id
group by 1,2,3 order by 1,3;

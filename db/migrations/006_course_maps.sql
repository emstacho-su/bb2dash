-- bb2dash :: 006_course_maps.sql  (versioned per-course maps produced by the bb-course-map skill)
create table course_maps (
  id         bigint generated always as identity primary key,
  course_id  text not null references courses(id) on delete cascade,
  version    integer not null,
  mapped_at  timestamptz not null default now(),
  map        jsonb not null,
  notes      text,
  unique (course_id, version)
);
alter table course_maps enable row level security;
create policy course_maps_owner_all on course_maps for all to authenticated using (true) with check (true);
create view v_course_map_latest as
select distinct on (course_id) course_id, version, mapped_at, map from course_maps order by course_id, version desc;

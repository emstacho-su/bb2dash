-- bb2dash :: 003_bb_files_bucket.sql
insert into storage.buckets (id, name, public, file_size_limit) values ('bb-files','bb-files', true, 52428800) on conflict (id) do nothing;
create policy "bb_files_anon_insert" on storage.objects for insert to anon with check (bucket_id = 'bb-files');
create policy "bb_files_auth_all" on storage.objects for all to authenticated using (bucket_id = 'bb-files') with check (bucket_id = 'bb-files');
-- Catalog of files referenced in Blackboard (content file items + files embedded in Ultra documents)
create table bb_files (
  id           bigint generated always as identity primary key,
  run_id       uuid,
  bb_course_id text not null,
  content_id   text,
  path         text,
  file_name    text not null,
  mime_type    text,
  source_url   text not null,        -- bbcswebdav URL (302s to a CDN; not fetchable from page JS)
  storage_path text,                 -- bb-files/<course>/<file> once uploaded
  bytes        integer,
  captured_at  timestamptz not null default now(),
  unique (bb_course_id, source_url)
);
alter table bb_files enable row level security;
create policy bb_files_owner_all on bb_files for all to authenticated using (true) with check (true);
create policy bb_files_anon_insert on bb_files for insert to anon with check (true);

-- bb2dash :: db/migrations/191_workspace_uploads_bucket.sql
-- Phase 24a (docs/planning/sprint-2/briefs/109_PHASE24_workspace_assistant.md), task 14. Worker W-76.
--
-- WHY. A file from his device (a PDF, a Word, PowerPoint or Excel file, plain text or Markdown) is
-- put in a private bucket by the owner's own session, signed for seven days, and read by the ingest
-- worker through that link (migration 193, `workspace_upload_register` in 190). 003_bb_files_bucket
-- made the course files' bucket in a migration; this does the same for the uploads' bucket.
--
-- WHAT
--   1. the bucket `workspace-uploads`: private, 20,971,520 bytes (20 MiB) a file, six types
--      (pdf, docx, pptx, xlsx, plain text, Markdown)
--   2. four owner policies on storage.objects, one for each command, in 020's form with 076's
--      initplan (`(select auth.uid())`, `(select public.app_owner())`). Nobody else, anon included,
--      has a policy on this bucket, and the bucket is private, so an object is read only through a
--      signed link or by the owner's session.
--   3. a guard block
--
-- THE KEY. An object is put under `u/` followed by the SHA-256 of its bytes (lower-case hex), never
-- under the file's own name. The insert and update policies hold the same shape, so the browser
-- cannot put an object where `workspace_documents.storage_key` (a CHECK in 190) would never point.
--
-- SQL cannot remove an object (`protect_objects_delete` guards storage.objects), so a delete is two
-- steps: the first call of `workspace_document_delete` cuts retrieval and returns the key, the
-- browser removes the object under the delete policy below, and the second call drops the row.
--
-- Additive only: one bucket row and four new policies. No existing policy, bucket or object moves.
-- If the bucket row already exists (a probe made it), its settings are brought to these.

do $$
begin
  if to_regclass('storage.buckets') is null or to_regclass('storage.objects') is null then
    raise exception '191: storage.buckets or storage.objects does not exist';
  end if;
  if to_regprocedure('public.app_owner()') is null then
    raise exception '191: app_owner() does not exist; apply 020_rls_owner_scoped first';
  end if;
end $$;

-- =============================================================================================
-- 1. The bucket
-- =============================================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('workspace-uploads', 'workspace-uploads', false, 20971520,
        array['application/pdf',
              'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
              'application/vnd.openxmlformats-officedocument.presentationml.presentation',
              'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
              'text/plain', 'text/markdown'])
on conflict (id) do update
   set public = false,
       file_size_limit = 20971520,
       allowed_mime_types = excluded.allowed_mime_types;

-- =============================================================================================
-- 2. Four owner policies
-- =============================================================================================
create policy workspace_uploads_owner_select on storage.objects
  for select to authenticated
  using (bucket_id = 'workspace-uploads'
         and (select auth.uid()) = (select public.app_owner()));

create policy workspace_uploads_owner_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'workspace-uploads'
              and name ~ '^u/[0-9a-f]{64}$'
              and (select auth.uid()) = (select public.app_owner()));

create policy workspace_uploads_owner_update on storage.objects
  for update to authenticated
  using (bucket_id = 'workspace-uploads'
         and (select auth.uid()) = (select public.app_owner()))
  with check (bucket_id = 'workspace-uploads'
              and name ~ '^u/[0-9a-f]{64}$'
              and (select auth.uid()) = (select public.app_owner()));

create policy workspace_uploads_owner_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'workspace-uploads'
         and (select auth.uid()) = (select public.app_owner()));

-- =============================================================================================
-- 3. Guard
-- =============================================================================================
do $$
declare
  v_got text;
begin
  -- (a) The bucket: private, 20 MiB, exactly the six types.
  if not exists (select 1 from storage.buckets b
                  where b.id = 'workspace-uploads' and b.name = 'workspace-uploads'
                    and b.public is false and b.file_size_limit = 20971520
                    and cardinality(b.allowed_mime_types) = 6
                    and b.allowed_mime_types @> array['application/pdf', 'text/plain', 'text/markdown',
                          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                          'application/vnd.openxmlformats-officedocument.presentationml.presentation',
                          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']) then
    raise exception 'FAIL 191: the bucket workspace-uploads is not private, 20971520 bytes and the six types';
  end if;

  -- (b) The four policies, one for each command, for authenticated only, each naming the bucket
  --     and the owner.
  select string_agg(p.policyname || ':' || p.cmd || ':' || array_to_string(p.roles, '+'), ', '
                    order by p.policyname) into v_got
    from pg_policies p
   where p.schemaname = 'storage' and p.tablename = 'objects'
     and coalesce(p.qual, '') || ' ' || coalesce(p.with_check, '') like '%workspace-uploads%';
  if v_got is distinct from
     'workspace_uploads_owner_delete:DELETE:authenticated, workspace_uploads_owner_insert:INSERT:authenticated, '
     'workspace_uploads_owner_select:SELECT:authenticated, workspace_uploads_owner_update:UPDATE:authenticated' then
    raise exception 'FAIL 191: the policies that name the bucket are [%]', v_got;
  end if;
  select string_agg(p.policyname, ', ' order by p.policyname) into v_got
    from pg_policies p
   where p.schemaname = 'storage' and p.tablename = 'objects'
     and p.policyname like 'workspace\_uploads\_owner\_%'
     and coalesce(p.qual, '') || ' ' || coalesce(p.with_check, '') not like '%app_owner()%';
  if v_got is not null then
    raise exception 'FAIL 191: these policies do not name app_owner(): %', v_got;
  end if;
end $$;

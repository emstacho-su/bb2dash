-- bb2dash :: db/tests/phase24_191_bucket.sql
-- Phase 24a (docs/planning/sprint-2/briefs/109_PHASE24_workspace_assistant.md), task 14. Worker W-76.
-- Tests migration 191: the private bucket `workspace-uploads` (20,971,520 bytes a file, six types)
-- and its four owner policies on storage.objects.
--
--   a. four policies name the bucket, one for each command, all for `authenticated`, all owner-scoped
--      in the initplan form (phase12b_076 holds the form itself over every policy)
--   b. none of them is for anon or PUBLIC, and no policy of the bucket's is permissive beyond the owner
--   c. the insert and update policies hold the key's shape, `u/` + 64 lower-case hex characters
--   d. the bucket row is private, 20971520 bytes, with the six types
--
-- (d) reads storage.buckets, which the test login cannot reach (db_test_runner holds no usage on
-- schema storage; phase15_100 pins that). So (d) runs only for a login that can read it, such as
-- the SQL editor's owner in a dry run. Under the test login it is skipped with a notice, and the
-- migration's own guard block (section 3 of 191) is what asserts the row on every apply.
--
-- Read-only; nothing is committed.
-- RUN IT: `node scripts/db-test.mjs --only phase24_191_bucket.sql`.

begin;

do $$
declare
  v_got  text;
  v_bad  text;
  r      record;
  c_six  constant text[] := array['application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain', 'text/markdown'];
begin
  -- (a) the four policies that name the bucket.
  select string_agg(p.policyname || ':' || p.cmd || ':' || array_to_string(p.roles, '+') || ':' || p.permissive,
                    ', ' order by p.policyname collate "C") into v_got
    from pg_policies p
   where p.schemaname = 'storage' and p.tablename = 'objects'
     and coalesce(p.qual, '') || ' ' || coalesce(p.with_check, '') like '%workspace-uploads%';
  if v_got is null then
    raise exception 'FAIL phase24_191: migration 191 is not applied (no policy on storage.objects names the bucket)';
  end if;
  if v_got is distinct from
     'workspace_uploads_owner_delete:DELETE:authenticated:PERMISSIVE, '
     'workspace_uploads_owner_insert:INSERT:authenticated:PERMISSIVE, '
     'workspace_uploads_owner_select:SELECT:authenticated:PERMISSIVE, '
     'workspace_uploads_owner_update:UPDATE:authenticated:PERMISSIVE' then
    raise exception 'FAIL 191 (a): the policies that name the bucket are [%]', v_got;
  end if;

  -- Every one is the owner's, in 076's initplan form, and each says which bucket it is for.
  for r in
    select p.policyname, coalesce(p.qual, '') || ' ' || coalesce(p.with_check, '') as expr
      from pg_policies p
     where p.schemaname = 'storage' and p.tablename = 'objects'
       and p.policyname like 'workspace\_uploads\_owner\_%'
  loop
    if r.expr not like '%app_owner()%' then
      raise exception 'FAIL 191 (a): % does not name app_owner()', r.policyname;
    end if;
    if r.expr not like '%bucket_id = ''workspace-uploads''%' then
      raise exception 'FAIL 191 (a): % does not pin bucket_id to workspace-uploads', r.policyname;
    end if;
    if replace(replace(r.expr, '( SELECT auth.uid() AS uid)', ''), '(select auth.uid())', '')
       like '%auth.uid()%' then
      raise exception 'FAIL 191 (a): % calls auth.uid() per row (076''s initplan form)', r.policyname;
    end if;
  end loop;

  -- (b) nothing for anon or PUBLIC mentions the bucket.
  select string_agg(p.policyname, ', ' order by p.policyname) into v_bad
    from pg_policies p
   where p.schemaname = 'storage' and p.tablename = 'objects'
     and coalesce(p.qual, '') || ' ' || coalesce(p.with_check, '') like '%workspace-uploads%'
     and (p.roles && array['anon', 'public']::name[] or p.permissive <> 'PERMISSIVE');
  if v_bad is not null then
    raise exception 'FAIL 191 (b): these policies on the bucket are for anon or PUBLIC: %', v_bad;
  end if;

  -- (c) the key's shape is held on the two commands that write an object's name.
  for r in
    select p.policyname, p.cmd, coalesce(p.with_check, '') as wc
      from pg_policies p
     where p.schemaname = 'storage' and p.tablename = 'objects'
       and p.policyname in ('workspace_uploads_owner_insert', 'workspace_uploads_owner_update')
  loop
    if r.wc not like '%^u/[0-9a-f]{64}$%' then
      raise exception 'FAIL 191 (c): % does not hold the key shape u/<64 hex>', r.policyname;
    end if;
  end loop;

  -- (d) the bucket row, for a login that can read it.
  if has_schema_privilege(current_user, 'storage', 'usage')
     and has_table_privilege(current_user, 'storage.buckets', 'select') then
    if not exists (select 1 from storage.buckets b
                    where b.id = 'workspace-uploads' and b.name = 'workspace-uploads'
                      and b.public is false and b.file_size_limit = 20971520
                      and cardinality(b.allowed_mime_types) = 6 and b.allowed_mime_types @> c_six) then
      raise exception 'FAIL 191 (d): the bucket workspace-uploads is not private, 20971520 bytes and the six types';
    end if;
  else
    raise notice 'phase24_191: (d) skipped, % cannot read storage.buckets; the migration''s guard asserts the row', current_user;
  end if;
end $$;

select 'phase24_191_bucket: PASS' as result,
       (select count(*) from pg_policies p
         where p.schemaname = 'storage' and p.tablename = 'objects'
           and p.policyname like 'workspace\_uploads\_owner\_%') as bucket_policies;

rollback;

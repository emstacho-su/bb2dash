-- bb2dash :: db/migrations/197_workspace_index_status.sql
-- Phase 24a (docs/planning/sprint-2/briefs/109_PHASE24_workspace_assistant.md), task 20, and the
-- pgvector store scoped to bb2dash (answer 17, point 4). Worker W-76.
--
-- WHY. Stack asked for one status he can read: how much of each kind of content is in the store, how
-- much waits, how much failed ("added, waiting, failed"). `v_embedding_status` (010) covers course
-- units only. This view is one row for all three kinds. The line on the page is 24b's.
--
-- WHAT. v_workspace_index_status, one row, security invoker (so the owner's select policies decide and
-- anyone else reads zeros), 13 columns:
--   course files   course_units_indexed    units with at least one vector (summed from v_embedding_status)
--                  course_units_waiting    units with none (a course unit has no failed state: one that
--                                          could not be embedded still waits and is tried at the next sync)
--                  course_last_embedded    the newest vector's time
--                  course_files_text_pending   files whose text is not extracted yet (bb_files.text_status)
--   uploads        uploads_indexed, uploads_waiting (stored, reading, text_ready), uploads_failed,
--                  upload_links_expired (waiting uploads whose signed link ran out),
--                  uploads_deleting (rows left in `deleting`, each a file whose removal did not finish)
--   memory         memory_indexed, memory_waiting, memory_failed
--   the worker     ingest_polled_age_seconds (null before the first heartbeat)
--
-- It reads NO table of the `storage` schema: the first draft's orphan count read the bucket and hung on
-- a probe. A row in `deleting` says the same thing and holds the key to retry with.
--
-- Additive only: one view. No password, key or DSN is in this file.

do $$
begin
  if to_regclass('public.workspace_documents') is null or to_regclass('public.workspace_ingest_heartbeat') is null then
    raise exception '197: apply 190_workspace_store and 193_workspace_ingest_role first';
  end if;
  if to_regclass('public.v_embedding_status') is null then
    raise exception '197: view v_embedding_status does not exist (010_search_layer)';
  end if;
end $$;

create view public.v_workspace_index_status
  with (security_invoker = true) as
select c.course_units_indexed,
       c.course_units_waiting,
       c.course_last_embedded,
       p.course_files_text_pending,
       u.uploads_indexed,
       u.uploads_waiting,
       u.uploads_failed,
       u.upload_links_expired,
       u.uploads_deleting,
       u.memory_indexed,
       u.memory_waiting,
       u.memory_failed,
       h.ingest_polled_age_seconds
  from (select coalesce(sum(s.units_embedded), 0)::bigint                  as course_units_indexed,
               coalesce(sum(s.text_units - s.units_embedded), 0)::bigint   as course_units_waiting,
               max(s.last_embedded)                                        as course_last_embedded
          from public.v_embedding_status s) c
 cross join (select count(*)::bigint as course_files_text_pending
               from public.bb_files f
              where f.text_status = 'pending') p
 cross join (select
         (count(*) filter (where d.kind = 'upload' and d.state = 'indexed'))::bigint  as uploads_indexed,
         (count(*) filter (where d.kind = 'upload'
                             and d.state in ('stored', 'reading', 'text_ready')))::bigint as uploads_waiting,
         (count(*) filter (where d.kind = 'upload' and d.state = 'failed'))::bigint   as uploads_failed,
         (count(*) filter (where d.kind = 'upload' and d.state in ('stored', 'reading')
                             and d.signed_url_expires_at is not null
                             and d.signed_url_expires_at < now()))::bigint            as upload_links_expired,
         (count(*) filter (where d.kind = 'upload' and d.state = 'deleting'))::bigint as uploads_deleting,
         (count(*) filter (where d.kind = 'memory' and d.state = 'indexed'))::bigint  as memory_indexed,
         (count(*) filter (where d.kind = 'memory'
                             and d.state in ('stored', 'reading', 'text_ready')))::bigint as memory_waiting,
         (count(*) filter (where d.kind = 'memory' and d.state = 'failed'))::bigint   as memory_failed
          from public.workspace_documents d) u
 cross join (select case when max(g.polled_at) is not null
                         then greatest(0, floor(extract(epoch from (now() - max(g.polled_at)))))::integer
                    end as ingest_polled_age_seconds
               from public.workspace_ingest_heartbeat g) h;

comment on view public.v_workspace_index_status is
  'The store''s one status row (migration 197): for each kind, how much is in, how much waits and how '
  'much failed. Course files: course_units_indexed / course_units_waiting (summed from '
  'v_embedding_status), course_last_embedded, course_files_text_pending. Uploads: uploads_indexed, '
  'uploads_waiting (stored, reading, text_ready), uploads_failed, upload_links_expired, '
  'uploads_deleting. Memory: memory_indexed, memory_waiting, memory_failed. The worker: '
  'ingest_polled_age_seconds (null before the first heartbeat). Reads no storage table. '
  'security_invoker with anon revoked, as 036 requires: a caller who is not the owner reads zeros.';

revoke all on public.v_workspace_index_status from public, anon, authenticated;
grant select on public.v_workspace_index_status to authenticated;
grant select on public.v_workspace_index_status to service_role;

do $$
declare
  v_got text;
begin
  if coalesce((select lower(split_part(o, '=', 2)) in ('true', 'on', '1', 'yes', 't', 'y')
                 from pg_class c, unnest(c.reloptions) o
                where c.oid = 'public.v_workspace_index_status'::regclass
                  and split_part(o, '=', 1) = 'security_invoker'), false) is false then
    raise exception 'FAIL 197: v_workspace_index_status is not security_invoker';
  end if;
  if pg_get_viewdef('public.v_workspace_index_status'::regclass) ~* 'storage\.' then
    raise exception 'FAIL 197: v_workspace_index_status names a table of the storage schema';
  end if;
  select string_agg(a.attname, ',' order by a.attnum) into v_got
    from pg_attribute a
   where a.attrelid = 'public.v_workspace_index_status'::regclass and a.attnum > 0 and not a.attisdropped;
  if v_got is distinct from
     'course_units_indexed,course_units_waiting,course_last_embedded,course_files_text_pending,'
     'uploads_indexed,uploads_waiting,uploads_failed,upload_links_expired,uploads_deleting,'
     'memory_indexed,memory_waiting,memory_failed,ingest_polled_age_seconds' then
    raise exception 'FAIL 197: the columns are [%]', v_got;
  end if;
  if has_table_privilege('anon', 'public.v_workspace_index_status', 'select, insert, update, delete')
     or has_any_column_privilege('anon', 'public.v_workspace_index_status', 'select')
     or not has_table_privilege('authenticated', 'public.v_workspace_index_status', 'select') then
    raise exception 'FAIL 197: the view is not select for authenticated alone';
  end if;
end $$;

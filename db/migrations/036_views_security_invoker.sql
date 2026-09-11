-- bb2dash :: 036_views_security_invoker.sql
-- Phase 9, added mid-phase after the Phase 8 security review found it. Not in the original
-- brief; the PM asked for it in the 030-039 range.
--
-- THE HOLE. A Postgres view runs as its OWNER unless it is created with security_invoker. Every
-- view in migrations 001-025 was created by postgres and left at the default, and Supabase's
-- default grants give `anon` SELECT on new relations in public. So although migration 020 scoped
-- every TABLE to the owner, the views over those tables handed the same rows to anybody holding
-- the publishable key. Measured on prod before this migration, as anon:
--
--     v_work_items            159 rows        v_file_layout            64 rows
--     v_assignment_effort      73             v_bb_files_current       60
--     v_upcoming               38             v_course_corpus          26
--     v_overdue                 8             v_embedding_status        7
--     v_course_map_latest       7             v_course_points_median    7
--     v_data_freshness          6
--
-- That is the whole planner, the whole file catalog and every course map, readable by a key that
-- ships in the browser bundle. RLS was never the boundary for these; nothing was.
--
-- THE FIX, two independent layers, neither of which touches a view body:
--   1. security_invoker = true, so the querying role's RLS decides what the view returns. An
--      owner sees everything; any other authenticated uid sees nothing, exactly as the tables
--      already behave.
--   2. revoke all from anon. anon is insert-only by design (bb_raw, bb_files, bb_file_text,
--      bb_text_embeddings and the Storage upload path), and it has no legitimate use for any of
--      these views. Belt and braces: layer 1 alone would already return zero rows.
--
-- NOT AFFECTED: the retrieval path. search_file_text, match_file_text and hybrid_search_file_text
-- reference no view at all (checked with pg_get_functiondef against every one of them), so the
-- `search` edge function and the MCP server are untouched. The five anon INSERT policies are
-- untouched. Nothing is dropped or recreated - only a reloption and a grant change - so no view
-- body, column list or dependency moves.
--
-- Phase 8's own three views (v_course_stream, v_content_tree, and v_course_display as recreated
-- in 028) were already created with security_invoker = true and are left alone, as is
-- v_sync_status from migration 035.

alter view v_assignment_effort    set (security_invoker = true);
alter view v_bb_files_current     set (security_invoker = true);
alter view v_course_corpus        set (security_invoker = true);
alter view v_course_map_latest    set (security_invoker = true);
alter view v_course_points_median set (security_invoker = true);
alter view v_data_freshness       set (security_invoker = true);
alter view v_embedding_status     set (security_invoker = true);
alter view v_file_layout          set (security_invoker = true);
alter view v_overdue              set (security_invoker = true);
alter view v_upcoming             set (security_invoker = true);
alter view v_work_items           set (security_invoker = true);

revoke all on v_assignment_effort    from anon;
revoke all on v_bb_files_current     from anon;
revoke all on v_course_corpus        from anon;
revoke all on v_course_map_latest    from anon;
revoke all on v_course_points_median from anon;
revoke all on v_data_freshness       from anon;
revoke all on v_embedding_status     from anon;
revoke all on v_file_layout          from anon;
revoke all on v_overdue              from anon;
revoke all on v_upcoming             from anon;
revoke all on v_work_items           from anon;

-- The app reads every one of these as the owner, so the authenticated grant stays.
grant select on v_assignment_effort, v_bb_files_current, v_course_corpus, v_course_map_latest,
                v_course_points_median, v_data_freshness, v_embedding_status, v_file_layout,
                v_overdue, v_upcoming, v_work_items
  to authenticated, service_role;

-- Guard: refuse to record this migration if any view in public is still owner-run. A view added
-- later without security_invoker is the same hole reopened, and this is where it gets caught.
do $$
declare v text;
begin
  select string_agg(c.relname, ', ' order by c.relname) into v
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'v'
     and coalesce((select o = 'security_invoker=true'
                     from unnest(c.reloptions) o where o like 'security_invoker=%'), false) is false;
  if v is not null then
    raise exception 'these public views still run as their owner and bypass RLS: %', v;
  end if;
end $$;

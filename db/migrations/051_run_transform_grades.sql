-- bb2dash :: 051_run_transform_grades.sql
-- Phase 10a (docs/planning/67_PHASE10A_grades.md, Contract section "051 - driver").
--
-- Registers the two new stages with the Phase 9 driver, so a sync folds grades and submissions
-- without anybody calling anything by hand.
--
-- HOW THIS WAS BUILT. `run_transform` and `sync_change_lines` are re-created from their LIVE
-- definitions, read out of prod with
--     select pg_get_functiondef('public.run_transform(uuid,text)'::regprocedure);
--     select pg_get_functiondef('public.sync_change_lines(jsonb)'::regprocedure);
-- on 2026-09-15 before a line was written. Both were byte-for-byte migration 035's bodies -
-- 037, 039, 042, 043, 044 and 045 all call them but none re-creates them - so the only
-- differences below are the ones this phase adds. Re-creating from the live definition rather
-- than from the repo is the rule that stops the repo/prod drift the AUDIT doc records.
--
-- WHAT CHANGES
--   1. run_transform gains two calls, `stage_gradebook` then `stage_attempts`, placed AFTER
--      stage_assignments and BEFORE stage_announcements. The order matters: stage_assignments is
--      what creates and re-points `assignments.bb_column_id`, and stage_attempts uses that link
--      to decide which assignment a pulled-back submission file belongs to. Running attempts
--      first would file this run's new columns' files under no assignment at all.
--   2. stage_gradebook runs before stage_attempts for the same reason in miniature: the
--      gradebook row is what a later phase reads to know how many attempts a column allows.
--   3. The function comment now names eight stages.
--   4. sync_change_lines gains three sentences, from the counts the two stages report:
--        gradebook.scores_new      -> 'N new grade(s) posted'
--        gradebook.scores_changed  -> 'N score(s) changed'
--        attempts.files_catalogued -> 'N submission file(s) catalogued'
--      They sit between the assignment lines and the announcement lines, which is the order the
--      stages run in, so the Activity feed reads as a narrative of the sync.
--
-- WHAT DOES NOT CHANGE
--   * transform_tick is not touched. It calls run_transform and knows nothing about stages.
--   * Neither function's signature, language, volatility, security setting or search_path moves,
--     so `create or replace` keeps every existing grant. The grants are re-asserted at the foot
--     of this file anyway, exactly as prod holds them today (038 for run_transform: service_role
--     only; 035 for sync_change_lines: authenticated and service_role - it is immutable, reads
--     nothing, and the Activity feed renders its output).
--   * A stage that fails still only makes the run `partial`: each stage catches its own errors
--     and writes its own sync_stage_runs row, so a gradebook failure cannot cost Stack his
--     announcements.

-- =============================================================================================
-- 1. sync_change_lines - three new sentences
-- =============================================================================================
create or replace function sync_change_lines(p_stages jsonb) returns jsonb
  language plpgsql immutable set search_path = public, pg_temp as $$
declare
  v jsonb := '[]'::jsonb;
  n int;
begin
  n := coalesce((p_stages->'courses'->>'courses_updated')::int, 0);
  if n > 0 then v := v || to_jsonb(format('Course details changed for %s course(s)', n)); end if;
  n := coalesce((p_stages->'courses'->>'staff_inserted')::int, 0);
  if n > 0 then v := v || to_jsonb(format('%s new staff member(s) from Blackboard', n)); end if;
  n := coalesce((p_stages->'courses'->>'staff_conflicts')::int, 0);
  if n > 0 then v := v || to_jsonb(format('%s staff name disagreement(s) need your call', n)); end if;
  n := coalesce((p_stages->'courses'->>'courses_unresolved')::int, 0);
  if n > 0 then v := v || to_jsonb(format('%s Blackboard shell(s) match no course here', n)); end if;

  n := coalesce((p_stages->'content'->>'inserted')::int, 0);
  if n > 0 then v := v || to_jsonb(format('%s new item(s) in the course content tree', n)); end if;
  n := coalesce((p_stages->'content'->>'missing')::int, 0);
  if n > 0 then v := v || to_jsonb(format('%s content item(s) are no longer in Blackboard', n)); end if;

  n := coalesce((p_stages->'assignments'->>'inserted')::int, 0);
  if n > 0 then v := v || to_jsonb(format('%s new gradebook column(s) added as tentative assignments', n)); end if;
  n := coalesce((p_stages->'assignments'->>'fields_filled')::int, 0);
  if n > 0 then v := v || to_jsonb(format('%s missing due date or point value filled in from Blackboard', n)); end if;
  n := coalesce((p_stages->'assignments'->>'fields_overwritten')::int, 0);
  if n > 0 then v := v || to_jsonb(format('%s tentative value(s) replaced by Blackboard''s', n)); end if;
  n := coalesce((p_stages->'assignments'->>'repointed')::int, 0);
  if n > 0 then v := v || to_jsonb(format('%s assignment(s) re-pointed at a re-created Blackboard item', n)); end if;
  n := coalesce((p_stages->'assignments'->>'conflicts')::int, 0);
  if n > 0 then v := v || to_jsonb(format('%s disagreement(s) with Blackboard left for you to settle', n)); end if;
  n := coalesce((p_stages->'assignments'->>'out_of_term_dates')::int, 0);
  if n > 0 then v := v || to_jsonb(format('%s Blackboard due date(s) fall outside the term and were not applied', n)); end if;
  n := coalesce((p_stages->'assignments'->>'resolutions_applied_blackboard')::int, 0)
     + coalesce((p_stages->'assignments'->>'resolutions_applied_keep')::int, 0)
     + coalesce((p_stages->'assignments'->>'resolutions_applied_value')::int, 0);
  if n > 0 then v := v || to_jsonb(format('%s of your Inbox answers applied', n)); end if;

  -- Phase 10a. Blackboard's numbers, said in Stack's words. Nothing here is computed by bb2dash:
  -- scores_new and scores_changed count gradebook ITEM columns whose effectiveScore moved since
  -- the previous crawl, and files_catalogued counts submission files now in the catalog.
  n := coalesce((p_stages->'gradebook'->>'scores_new')::int, 0);
  if n > 0 then v := v || to_jsonb(format('%s new grade(s) posted', n)); end if;
  n := coalesce((p_stages->'gradebook'->>'scores_changed')::int, 0);
  if n > 0 then v := v || to_jsonb(format('%s score(s) changed', n)); end if;
  n := coalesce((p_stages->'attempts'->>'files_catalogued')::int, 0);
  if n > 0 then v := v || to_jsonb(format('%s submission file(s) catalogued', n)); end if;

  n := coalesce((p_stages->'announcements'->>'inserted')::int, 0);
  if n > 0 then v := v || to_jsonb(format('%s new announcement(s)', n)); end if;
  n := coalesce((p_stages->'announcements'->>'updated')::int, 0);
  if n > 0 then v := v || to_jsonb(format('%s announcement(s) changed', n)); end if;

  n := coalesce((p_stages->'files'->>'inserted')::int, 0);
  if n > 0 then v := v || to_jsonb(format('%s new file(s) catalogued', n)); end if;
  n := coalesce((p_stages->'files'->>'source_url_updated')::int, 0);
  if n > 0 then v := v || to_jsonb(format('%s file(s) were re-uploaded in Blackboard; the stored copy may be stale', n)); end if;
  n := coalesce((p_stages->'files'->>'marked_missing')::int, 0);
  if n > 0 then v := v || to_jsonb(format('%s file(s) are no longer in Blackboard', n)); end if;
  n := coalesce((p_stages->'files'->>'session_scoped_skipped')::int, 0);
  if n > 0 then v := v || to_jsonb(format('%s file(s) had no durable link and were skipped', n)); end if;

  n := coalesce((p_stages->'gaps'->>'attention_raised')::int, 0);
  if n > 0 then v := v || to_jsonb(format('%s gap(s) added to the Inbox', n)); end if;

  if jsonb_array_length(v) = 0 then
    v := v || to_jsonb('Nothing changed'::text);
  end if;
  return v;
end $$;

-- =============================================================================================
-- 2. run_transform - eight stages
-- =============================================================================================
create or replace function run_transform(p_run_id uuid, p_trigger text default 'manual')
  returns bigint
  language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_id bigint;
  v_prev record;
  v_stages  jsonb := '{}'::jsonb;   -- {stage: counts}
  v_errors  jsonb := '[]'::jsonb;
  v_r       jsonb;
  v_cc      jsonb;
  v_started timestamptz;
  v_before  bigint;
  v_after   bigint;
  v_failed  int := 0;
  v_status  text;
begin
  -- Idempotent. A run that already has a real sync_runs row is never folded twice: a finished
  -- row is returned as-is, and a row still marked running means another tick is mid-flight (the
  -- reaper in transform_tick releases one that really did die). A quarantine row is not a fold,
  -- so it is skipped here - registering a run later still lets it through.
  select id, status into v_prev
    from sync_runs
   where run_id = p_run_id and scope is distinct from 'unregistered'
   order by id desc limit 1;
  if found then
    return v_prev.id;
  end if;

  -- The guard. bb_raw accepts anon inserts, so "this run exists in bb_raw" proves nothing.
  if not exists (select 1 from agent_requests a
                  where a.kind = 'sync' and a.run_id = p_run_id) then
    raise exception
      'run % is not registered by an owner-authenticated sync request; refusing to fold it', p_run_id
      using hint = 'Insert or update an agent_requests row (kind = sync) with this run_id from an authenticated session first.';
  end if;

  insert into sync_runs (run_id, status, started_at, trigger, source, scope)
  values (p_run_id, 'running', now(),
          case when p_trigger in ('manual','scheduled','app_request') then p_trigger else 'manual' end,
          'blackboard', 'all')
  returning id into v_id;

  begin
    select count(*) into v_before from attention_items;

    v_r := stage_courses(p_run_id, v_id);
    v_stages := v_stages || jsonb_build_object('courses', v_r->'counts');
    if v_r->>'error' is not null then v_errors := v_errors || to_jsonb(v_r->>'error'); end if;

    -- stage_content belongs to Phase 8. Call it if it is installed; record an honest skipped
    -- row if it is not, rather than failing a whole sync over a function someone else owns.
    v_started := clock_timestamp();
    if to_regprocedure('public.stage_content(uuid)') is null then
      insert into sync_stage_runs (sync_run_id, stage, status, counts, started_at, finished_at, error)
      values (v_id, 'content', 'skipped', '{}'::jsonb, v_started, clock_timestamp(),
              'stage_content not installed');
      v_stages := v_stages || jsonb_build_object('content', '{}'::jsonb);
      v_errors := v_errors || to_jsonb('stage_content not installed'::text);
    else
      begin
        execute 'select public.stage_content($1)' into v_cc using p_run_id;
        v_cc := coalesce(v_cc, '{}'::jsonb);
        insert into sync_stage_runs (sync_run_id, stage, status, counts, started_at, finished_at, error)
        values (v_id, 'content', 'ok', v_cc, v_started, clock_timestamp(), null);
        v_stages := v_stages || jsonb_build_object('content', v_cc);
      exception when others then
        insert into sync_stage_runs (sync_run_id, stage, status, counts, started_at, finished_at, error)
        values (v_id, 'content', 'failed', '{}'::jsonb, v_started, clock_timestamp(),
                left(sqlstate || ' ' || sqlerrm, 1000));
        v_stages := v_stages || jsonb_build_object('content', '{}'::jsonb);
        v_errors := v_errors || to_jsonb(left('stage_content: ' || sqlerrm, 1000));
      end;
    end if;

    v_r := stage_assignments(p_run_id, v_id);
    v_stages := v_stages || jsonb_build_object('assignments', v_r->'counts');
    if v_r->>'error' is not null then v_errors := v_errors || to_jsonb(v_r->>'error'); end if;

    -- Phase 10a. Gradebook AFTER assignments, because stage_assignments is what creates and
    -- re-points assignments.bb_column_id, and attempts AFTER gradebook, because the file
    -- catalogue reads that link to decide which assignment a submission file belongs to.
    v_r := stage_gradebook(p_run_id, v_id);
    v_stages := v_stages || jsonb_build_object('gradebook', v_r->'counts');
    if v_r->>'error' is not null then v_errors := v_errors || to_jsonb(v_r->>'error'); end if;

    v_r := stage_attempts(p_run_id, v_id);
    v_stages := v_stages || jsonb_build_object('attempts', v_r->'counts');
    if v_r->>'error' is not null then v_errors := v_errors || to_jsonb(v_r->>'error'); end if;

    v_r := stage_announcements(p_run_id, v_id);
    v_stages := v_stages || jsonb_build_object('announcements', v_r->'counts');
    if v_r->>'error' is not null then v_errors := v_errors || to_jsonb(v_r->>'error'); end if;

    v_r := stage_files(p_run_id, v_id);
    v_stages := v_stages || jsonb_build_object('files', v_r->'counts');
    if v_r->>'error' is not null then v_errors := v_errors || to_jsonb(v_r->>'error'); end if;

    v_r := stage_gaps(p_run_id, v_id);
    v_stages := v_stages || jsonb_build_object('gaps', v_r->'counts');
    if v_r->>'error' is not null then v_errors := v_errors || to_jsonb(v_r->>'error'); end if;

    select count(*) into v_after from attention_items;

    select count(*) into v_failed from sync_stage_runs
     where sync_run_id = v_id and status = 'failed';
    v_status := case when v_failed > 0 then 'partial' else 'ok' end;

    update sync_runs
       set status      = v_status,
           finished_at = now(),
           summary     = jsonb_build_object(
                           'stages',           v_stages,
                           'changes',          sync_change_lines(v_stages),
                           'attention_raised', greatest(v_after - v_before, 0),
                           'errors',           v_errors)
     where id = v_id;

  exception when others then
    -- Belt and braces: the stages catch their own errors, so reaching here means something
    -- outside them broke. Record it on the run rather than leaving a row stuck at running.
    update sync_runs
       set status = 'failed', finished_at = now(),
           notes  = btrim(coalesce(notes || ' | ', '') || left('driver: ' || sqlerrm, 500))
     where id = v_id;
  end;

  return v_id;
end $$;

comment on function run_transform(uuid, text) is
  'Fold one crawl into the typed tables. Refuses any run_id that no agent_requests row of kind '
  'sync has registered, because bb_raw takes anon inserts. Otherwise inserts the sync_runs row, '
  'calls the eight stages in order (courses, content, assignments, gradebook, attempts, '
  'announcements, files, gaps), and writes summary = {stages, changes, attention_raised, '
  'errors}. Idempotent: a run that already has a real sync_runs row returns that id and does '
  'nothing.';

-- =============================================================================================
-- 3. Privileges, re-asserted exactly as prod holds them today
-- =============================================================================================
revoke all on function public.run_transform(uuid,text) from public, anon, authenticated;
grant execute on function public.run_transform(uuid,text) to service_role;

revoke all on function public.sync_change_lines(jsonb) from public, anon;
grant execute on function public.sync_change_lines(jsonb) to authenticated, service_role;

-- bb2dash :: 126_assignment_bb_url.sql
-- Phase 18 (brief 98, Contract row 126 and rule "bb_url (126)"; task 13; R-69, B-38).
-- Worker W-48.
--
-- Every assignment's bb_url is null, so "Open in Blackboard" opens the course outline. Blackboard
-- fills a content item's url only for files, links and LTI tools; test items carry none. B-38's
-- default builds the per-item Ultra URL now from the public template (research 92 §8, R-69),
-- and the logged-in tab confirms it later rather than gating it:
--
--   <origin of courses.bb_url>/ultra/courses/<courses.bb_id>/outline/assessment/test/<bb_item_id>
--     ?courseId=<courses.bb_id>&gradeitemView=details
--
-- assignment_bb_url(course_id, item_id) returns it only when a bb_content row for
-- (course_id, item_id) has bb_type 'resource/x-bb-asmt-test-link', and null otherwise (the survey
-- link, items with no content row, column-only rows) until the probe sitting (98a §2) shows
-- another segment. The match is an EXISTS test, never a join: three test items carry two
-- bb_content rows each (rename ghosts, Phase 19), and a join would count them twice.
--
-- stage_assignments is re-created from its live body (084) with two changes only:
--   * a new column's insert carries bb_item_id = the column's contentId (it was left null until
--     the next fold);
--   * step 2b, after the content-item url step: bb_url is composed where it is still null. A
--     value already there (a content item's own url, or one Stack confirmed in the Inbox) is
--     never overwritten. counts gains `urls_composed`.
-- Then the backfill, with a guard on its count.

create or replace function public.assignment_bb_url(p_course_id text, p_item_id text)
returns text
language sql
stable
set search_path = public, pg_temp
as $function$
  select format('%s/ultra/courses/%s/outline/assessment/test/%s?courseId=%s&gradeitemView=details',
                substring(c.bb_url from '^(https://[^/]+)'), c.bb_id, p_item_id, c.bb_id)
    from courses c
   where c.id = p_course_id
     and p_item_id is not null
     and c.bb_id is not null
     and c.bb_url ~ '^https://[^/]+/'
     and exists (select 1
                   from bb_content b
                  where b.course_id = p_course_id
                    and b.bb_item_id = p_item_id
                    and b.bb_type = 'resource/x-bb-asmt-test-link')
$function$;

revoke all on function public.assignment_bb_url(text, text) from public, anon;
grant execute on function public.assignment_bb_url(text, text) to authenticated, service_role;

create or replace function public.stage_assignments(p_run_id uuid, p_sync_run_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_started timestamptz := clock_timestamp();
  v_status text := 'ok';
  v_error  text;
  v_counts jsonb := '{}'::jsonb;
  v_cols int := 0; v_skipped int := 0; v_ambiguous int := 0; v_linked int := 0;
  v_inserted int := 0; v_repointed int := 0; v_filled int := 0; v_overwritten int := 0;
  v_conflicts int := 0; v_out_of_term int := 0; v_mirror int := 0; v_url_set int := 0;
  v_settled int := 0; v_raised int := 0; v_shared int := 0; v_url_composed int := 0;
  v_res jsonb := '{}'::jsonb;              -- apply_resolutions()'s counts, merged into ours
  v_n int; v_aid text; v_old_col text; v_new_id text;
  c record; a assignments%rowtype;
begin
  begin
    -- ---------------------------------------------------------------------------------------
    -- 0. Apply the answers Stack has already given. The body of this lives in
    --    apply_resolutions() so that a queued agent_requests row of kind 'transform' can apply
    --    answers without a crawl to fold (finding F8); the counts are merged into ours
    --    unchanged, so sync_change_lines() still reads them from the assignments stage.
    -- ---------------------------------------------------------------------------------------
    v_res := apply_resolutions();

    drop table if exists pg_temp._bb_cols;
    create temp table _bb_cols on commit drop as
      select cr.id                                  as course_id,
             g->>'columnId'                         as column_id,
             btrim(g->>'name')                      as name,
             nullif(g->>'possible','')::numeric     as possible,
             nullif(g->>'due','')::timestamptz      as due_at,
             nullif(g->>'contentId','')             as content_id,
             nullif(g->>'submissionStatus','')      as sub_status,
             coalesce((g->>'isCalc')::boolean, false) as is_calc,
             b.captured_at
        from bb_raw b
        join courses cr on cr.id = bb_resolve_course(b.bb_course_id),
             lateral jsonb_array_elements(bb_jarray(b.payload->'gradebook')) g
       where b.run_id = p_run_id and b.kind = 'course'
         and coalesce(g->>'columnId','') <> '';

    for c in select * from _bb_cols order by course_id, column_id loop
      v_cols := v_cols + 1;

      -- Blackboard's own computed columns are not deliverables. Inserting "Total Score" as an
      -- assignment would put a number nobody has to hand in on the tracker.
      if c.is_calc or c.name ~* '^(total|total score|overall|weighted total|running total|final letter grade|final grade|letter grade)$' then
        v_skipped := v_skipped + 1;
        continue;
      end if;

      select count(*) into v_n from assignments
       where course_id = c.course_id and bb_column_id = c.column_id;

      if v_n > 1 then
        v_ambiguous := v_ambiguous + 1;
        v_shared := v_shared + 1;
        -- Phase 12b F-5 (084): this branch was reached BECAUSE every one of these rows already
        -- carries this column's id. That is a deliberate binding - Blackboard collects a whole
        -- packet of deliverables under one column - and since 075 the transform knows exactly
        -- what to do with it: restamp the liveness of every bound row and apply none of the
        -- column's values. Nothing is left for Stack to decide, so nothing is asked; the
        -- question below re-raised itself on every fold and was never answerable. The "which one
        -- does Blackboard mean?" question stays for the case it was written for - a column
        -- matched to several assignments by TITLE, none of which carries its id - and now lives
        -- in the fallback branch further down.
        -- Phase 12b X-3: shared column liveness restamp. Blackboard reported this column in this
        -- crawl, so every assignment bound to it was seen - whatever the values turn out to mean.
        -- Without this both rows keep a stale bb_last_seen, 065 calls them absent from Blackboard
        -- and the calendar push filters them out. The values stay untouched: which of the rows
        -- Blackboard's due date and points describe is still unknown, and 084 stopped asking
        -- because a deliberate shared column gives Stack nothing to answer.
        update assignments
           set bb_item_id   = coalesce(bb_item_id, c.content_id),
               bb_last_seen = greatest(coalesce(bb_last_seen, c.captured_at), c.captured_at)
         where course_id = c.course_id and bb_column_id = c.column_id
           and (bb_item_id   is distinct from coalesce(bb_item_id, c.content_id)
             or bb_last_seen is distinct from greatest(coalesce(bb_last_seen, c.captured_at), c.captured_at));
        get diagnostics v_n = row_count;
        v_mirror := v_mirror + v_n;

        continue;
      end if;

      v_aid := null; v_old_col := null;
      if v_n = 1 then
        select id into v_aid from assignments
         where course_id = c.course_id and bb_column_id = c.column_id;
      else
        -- No column match. Fall back to (course_id, title): an unbound row first, then a row
        -- whose stored column id is no longer in this run - that is a re-created Blackboard item.
        -- Phase 12b F-5 (084): if the title fits MORE THAN ONE such row, and none of them
        -- carries this column's id, the transform genuinely cannot tell which assignment
        -- Blackboard means. Binding one of them by `limit 1` would be a guess with a 1-in-N
        -- chance of being right, so ask instead - and, as in the shared-column branch, apply
        -- none of the column's values and bind nothing.
        select count(*) into v_n
          from assignments a2
         where a2.course_id = c.course_id
           and lower(a2.title) = lower(c.name)
           and (a2.bb_column_id is null
                or not exists (select 1 from _bb_cols k
                                where k.course_id = a2.course_id and k.column_id = a2.bb_column_id));

        if v_n > 1 then
          v_ambiguous := v_ambiguous + 1;
          if attention_keep_stands(c.course_id, 'column:' || c.column_id, 'bb_column_id',
               to_jsonb(c.name)) then
            v_settled := v_settled + 1;
          elsif raise_attention(p_sync_run_id, 'conflict', c.course_id, 'assignment',
               'column:' || c.column_id, 'bb_column_id',
               to_jsonb((select string_agg(a2.id, ', ' order by a2.id) from assignments a2
                          where a2.course_id = c.course_id
                            and lower(a2.title) = lower(c.name)
                            and (a2.bb_column_id is null
                                 or not exists (select 1 from _bb_cols k
                                                 where k.course_id = a2.course_id
                                                   and k.column_id = a2.bb_column_id)))),
               to_jsonb(c.name),
               format('%s: gradebook column "%s" is attached to more than one assignment, so the transform cannot tell which one Blackboard means. Which is it?',
                      c.course_id, c.name),
               jsonb_build_object('column_id', c.column_id, 'possible', c.possible, 'due', c.due_at))
          then v_raised := v_raised + 1; end if;
          continue;
        end if;

        select id, bb_column_id into v_aid, v_old_col
          from assignments a2
         where a2.course_id = c.course_id
           and lower(a2.title) = lower(c.name)
           and (a2.bb_column_id is null
                or not exists (select 1 from _bb_cols k
                                where k.course_id = a2.course_id and k.column_id = a2.bb_column_id))
         order by (a2.bb_column_id is not null), a2.id
         limit 1;

        if v_aid is not null then
          update assignments
             set bb_column_id = c.column_id,
                 source_ref   = case when v_old_col is null then source_ref
                                     else btrim(coalesce(source_ref || ' | ', '') ||
                                          'bb column re-created ' || v_old_col || ' -> ' || c.column_id) end
           where id = v_aid;
          if v_old_col is null then v_linked := v_linked + 1; else v_repointed := v_repointed + 1; end if;
        end if;
      end if;

      -- ------------------------------------------------------------------------------------
      -- New column, nothing to match: record it as a tentative Blackboard fact and ask.
      -- Phase 18 (126): the insert carries the column's contentId as bb_item_id, so step 2b
      -- can link it to its own Ultra page on this fold instead of the next.
      -- ------------------------------------------------------------------------------------
      if v_aid is null then
        v_new_id := c.course_id || '/' || nullif(bb_slug(c.name), '');
        if v_new_id is null or exists (select 1 from assignments where id = v_new_id) then
          v_new_id := c.course_id || '/' || coalesce(nullif(bb_slug(c.name), ''), 'column')
                      || '-' || regexp_replace(c.column_id, '\D', '', 'g');
        end if;

        insert into assignments (id, course_id, title, type, due_at, points_possible,
                                 bb_column_id, bb_item_id, bb_submission_status, bb_last_seen,
                                 source, source_ref, confidence)
        values (v_new_id, c.course_id, c.name, bb_assignment_type(c.name),
                case when bb_date_in_term(c.due_at) then c.due_at end,
                c.possible, c.column_id, c.content_id, c.sub_status, c.captured_at,
                'blackboard',
                'Phase 9 transform, gradebook column ' || c.column_id || ' (type inferred from the column name)',
                'tentative')
        on conflict (id) do nothing;
        get diagnostics v_n = row_count;
        if v_n = 0 then
          v_skipped := v_skipped + 1;
          continue;
        end if;
        v_inserted := v_inserted + 1;

        if raise_attention(p_sync_run_id, 'stack_must_confirm', c.course_id, 'assignment',
             v_new_id, null, null, to_jsonb(c.name),
             format('%s: Blackboard has a gradebook column "%s" that bb2dash had no assignment for. It was added as a %s worth %s points; is that right, and does it belong on the tracker?',
                    c.course_id, c.name, bb_assignment_type(c.name),
                    coalesce(c.possible::text, 'an unrecorded number of')),
             jsonb_build_object('column_id', c.column_id, 'due', c.due_at,
                                'possible', c.possible, 'type_guess', bb_assignment_type(c.name),
                                'source', 'stage_assignments'))
        then v_raised := v_raised + 1; end if;

        if c.due_at is not null and not bb_date_in_term(c.due_at) then
          if attention_keep_stands(c.course_id, v_new_id, 'due_at', to_jsonb(c.due_at)) then
            v_settled := v_settled + 1;
          else
            v_out_of_term := v_out_of_term + 1;
            if raise_attention(p_sync_run_id, 'conflict', c.course_id, 'assignment',
                 v_new_id, 'due_at', null, to_jsonb(c.due_at),
                 format('%s: Blackboard gives "%s" a due date of %s, which is outside the term. It was left with no date rather than put on the tracker in the wrong year.',
                        c.course_id, c.name, to_char(c.due_at at time zone 'America/New_York', 'YYYY-MM-DD')),
                 jsonb_build_object('column_id', c.column_id, 'source', 'stage_assignments'))
            then v_raised := v_raised + 1; end if;
          end if;
        end if;
        continue;
      end if;

      select * into a from assignments where id = v_aid;

      -- ------------------------------------------------------------------------------------
      -- due_at
      -- ------------------------------------------------------------------------------------
      if c.due_at is not null then
        if not bb_date_in_term(c.due_at) then
          if a.due_at is distinct from c.due_at then
            if attention_keep_stands(c.course_id, a.id, 'due_at', to_jsonb(c.due_at)) then
              v_settled := v_settled + 1;
            else
              v_out_of_term := v_out_of_term + 1; v_conflicts := v_conflicts + 1;
              if raise_attention(p_sync_run_id, 'conflict', c.course_id, 'assignment', a.id, 'due_at',
                   to_jsonb(coalesce(a.due_at::text, a.due_date::text)), to_jsonb(c.due_at),
                   format('%s: Blackboard says "%s" is due %s, which is outside the term - the shell still carries a column from a previous year. bb2dash kept %s. Which is right?',
                          c.course_id, a.title,
                          to_char(c.due_at at time zone 'America/New_York', 'YYYY-MM-DD'),
                          coalesce(to_char(a.due_at at time zone 'America/New_York', 'YYYY-MM-DD'), to_char(a.due_date, 'YYYY-MM-DD'), 'no date')),
                   jsonb_build_object('column_id', c.column_id, 'out_of_term', true, 'source', 'stage_assignments'))
              then v_raised := v_raised + 1; end if;
            end if;
          end if;

        elsif a.due_at is null and a.due_date is null then
          update assignments set due_at = c.due_at where id = a.id;
          v_filled := v_filled + 1;

        elsif a.due_at is null then
          -- Only the day was known. Same day means Blackboard is adding the clock time, which
          -- contradicts nothing; a different day is a real disagreement.
          if (c.due_at at time zone 'America/New_York')::date = a.due_date then
            update assignments set due_at = c.due_at where id = a.id;
            v_filled := v_filled + 1;
          elsif a.confidence in ('tentative','inferred') then
            update assignments
               set due_at = c.due_at,
                   due_date = (c.due_at at time zone 'America/New_York')::date
             where id = a.id;
            v_overwritten := v_overwritten + 1;
          elsif attention_keep_stands(c.course_id, a.id, 'due_at', to_jsonb(c.due_at)) then
            v_settled := v_settled + 1;
          else
            v_conflicts := v_conflicts + 1;
            if raise_attention(p_sync_run_id, 'conflict', c.course_id, 'assignment', a.id, 'due_at',
                 to_jsonb(a.due_date::text), to_jsonb(c.due_at),
                 format('%s: bb2dash has "%s" due %s; Blackboard says %s.',
                        c.course_id, a.title, a.due_date,
                        to_char(c.due_at at time zone 'America/New_York', 'YYYY-MM-DD HH24:MI')),
                 jsonb_build_object('column_id', c.column_id, 'source', 'stage_assignments'))
            then v_raised := v_raised + 1; end if;
          end if;

        elsif a.due_at is distinct from c.due_at then
          if a.confidence in ('tentative','inferred') then
            update assignments set due_at = c.due_at where id = a.id;
            v_overwritten := v_overwritten + 1;
          elsif attention_keep_stands(c.course_id, a.id, 'due_at', to_jsonb(c.due_at)) then
            v_settled := v_settled + 1;
          else
            v_conflicts := v_conflicts + 1;
            if raise_attention(p_sync_run_id, 'conflict', c.course_id, 'assignment', a.id, 'due_at',
                 to_jsonb(a.due_at), to_jsonb(c.due_at),
                 format('%s: bb2dash has "%s" due %s; Blackboard says %s.',
                        c.course_id, a.title,
                        to_char(a.due_at at time zone 'America/New_York', 'YYYY-MM-DD HH24:MI'),
                        to_char(c.due_at at time zone 'America/New_York', 'YYYY-MM-DD HH24:MI')),
                 jsonb_build_object('column_id', c.column_id, 'source', 'stage_assignments'))
            then v_raised := v_raised + 1; end if;
          end if;
        end if;
      end if;

      -- ------------------------------------------------------------------------------------
      -- points_possible
      -- ------------------------------------------------------------------------------------
      if c.possible is not null then
        if a.points_possible is null then
          update assignments set points_possible = c.possible where id = a.id;
          v_filled := v_filled + 1;
        elsif a.points_possible <> c.possible then
          if a.confidence in ('tentative','inferred') then
            update assignments set points_possible = c.possible where id = a.id;
            v_overwritten := v_overwritten + 1;
          elsif attention_keep_stands(c.course_id, a.id, 'points_possible',
                                      to_jsonb(c.possible)) then
            v_settled := v_settled + 1;
          else
            v_conflicts := v_conflicts + 1;
            if raise_attention(p_sync_run_id, 'conflict', c.course_id, 'assignment', a.id,
                 'points_possible', to_jsonb(a.points_possible), to_jsonb(c.possible),
                 format('%s: bb2dash has "%s" worth %s points; Blackboard says %s.',
                        c.course_id, a.title, a.points_possible, c.possible),
                 jsonb_build_object('column_id', c.column_id, 'source', 'stage_assignments'))
            then v_raised := v_raised + 1; end if;
          end if;
        end if;
      end if;

      -- ------------------------------------------------------------------------------------
      -- Blackboard's own bookkeeping. No syllabus ever claimed these, so they simply mirror.
      -- ------------------------------------------------------------------------------------
      update assignments
         set bb_submission_status = coalesce(c.sub_status, bb_submission_status),
             bb_item_id           = coalesce(bb_item_id, c.content_id),
             bb_last_seen         = greatest(coalesce(bb_last_seen, c.captured_at), c.captured_at)
       where id = a.id
         and (bb_submission_status is distinct from coalesce(c.sub_status, bb_submission_status)
           or bb_item_id           is distinct from coalesce(bb_item_id, c.content_id)
           or bb_last_seen         is distinct from greatest(coalesce(bb_last_seen, c.captured_at), c.captured_at));
      get diagnostics v_n = row_count;
      v_mirror := v_mirror + v_n;
    end loop;

    -- ---------------------------------------------------------------------------------------
    -- 2. Content items only ever add a link we do not already have.
    -- ---------------------------------------------------------------------------------------
    update assignments asg
       set bb_url = ci.url
      from (select * from (
              select cr.id as course_id, ci->>'id' as item_id,
                     bb_abs_url(coalesce(ci->>'url',
                                         ci->'detail'->>'url',
                                         ci->'detail'->'file'->>'url')) as url
                from bb_raw b
                join courses cr on cr.id = bb_resolve_course(b.bb_course_id),
                     lateral jsonb_array_elements(bb_jarray(b.payload->'content')) ci
               where b.run_id = p_run_id and b.kind = 'course') q
             where q.url is not null) ci
     where asg.course_id = ci.course_id and asg.bb_item_id = ci.item_id and asg.bb_url is null;
    get diagnostics v_n = row_count;
    v_url_set := v_n;

    -- ---------------------------------------------------------------------------------------
    -- 2b. Phase 18 (126): a test item's own Ultra page, composed where bb_url is still null.
    --     Never over a value already there (a content item's url, or one Stack confirmed).
    -- ---------------------------------------------------------------------------------------
    update assignments asg
       set bb_url = assignment_bb_url(asg.course_id, asg.bb_item_id)
     where asg.bb_url is null
       and asg.bb_item_id is not null
       and assignment_bb_url(asg.course_id, asg.bb_item_id) is not null;
    get diagnostics v_n = row_count;
    v_url_composed := v_n;

    v_counts := jsonb_build_object(
      'columns_seen',        v_cols,
      'columns_skipped',     v_skipped,
      'ambiguous_columns',   v_ambiguous,
      'shared_columns',      v_shared,
      'linked_by_title',     v_linked,
      'repointed',           v_repointed,
      'inserted',            v_inserted,
      'fields_filled',       v_filled,
      'fields_overwritten',  v_overwritten,
      'conflicts',           v_conflicts,
      'conflicts_settled',   v_settled,
      'out_of_term_dates',   v_out_of_term,
      'mirror_updates',      v_mirror,
      'urls_set',            v_url_set,
      'urls_composed',       v_url_composed,
      'resolutions_applied_blackboard', coalesce((v_res->>'applied_blackboard')::int, 0),
      'resolutions_applied_keep',       coalesce((v_res->>'applied_keep')::int, 0),
      'resolutions_applied_value',      coalesce((v_res->>'applied_value')::int, 0),
      'resolutions_unapplicable',       coalesce((v_res->>'unapplicable')::int, 0),
      'resolutions_unapplied',          coalesce((v_res->>'unapplied')::int, 0),
      'attention_raised',    v_raised);
  exception when others then
    v_status := 'failed';
    v_error  := left(sqlstate || ' ' || sqlerrm, 1000);
    v_counts := '{}'::jsonb;
  end;

  insert into sync_stage_runs (sync_run_id, stage, status, counts, started_at, finished_at, error)
  values (p_sync_run_id, 'assignments', v_status, v_counts, v_started, clock_timestamp(), v_error);

  return jsonb_build_object('stage','assignments','status',v_status,'counts',v_counts,'error',v_error);
end
$function$;

-- The backfill: every test item that has no bb_url yet. Guard: the count the dry run read on
-- 2026-09-29 (40; the brief's 37 was read on 2026-09-24, when assignments held 88 rows, not 93).
do $$
declare
  EXPECTED_BACKFILL constant int := 40;
  v_n int;
begin
  update assignments asg
     set bb_url = assignment_bb_url(asg.course_id, asg.bb_item_id)
   where asg.bb_url is null
     and asg.bb_item_id is not null
     and assignment_bb_url(asg.course_id, asg.bb_item_id) is not null;
  get diagnostics v_n = row_count;
  if v_n <> EXPECTED_BACKFILL then
    raise exception '126: expected % bb_url values composed, got %', EXPECTED_BACKFILL, v_n;
  end if;
end $$;

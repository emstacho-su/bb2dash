-- bb2dash :: 042_apply_resolutions.sql
-- Phase 9, round 2 (code-review findings F2, F3-apply, F6, F8). 001-041 are applied and byte-
-- frozen, so everything here is a `create or replace` of a function.
--
-- ---------------------------------------------------------------------------------------------
-- F8. A queued 'transform' request could never apply an answer
-- ---------------------------------------------------------------------------------------------
-- The Inbox's only route from "answered" to "applied" was the next fold, because applying
-- resolutions was step 0 INSIDE stage_assignments. The drain in transform_tick calls
-- run_transform(newest_run), and run_transform is idempotent: a run that already has a sync_runs
-- row returns that id and does nothing - no stages, no step 0. So the request was marked done,
-- with the OLD run's summary as its result, and not one answer was applied. The only thing that
-- ever applied answers was a brand-new crawl.
--
-- Fix: the step-0 body moves out into apply_resolutions(), which stands on its own.
-- stage_assignments calls it (so a fold behaves exactly as before) and the drain calls it too
-- (migration 044), reporting its counts in agent_requests.result. Answering an item and pressing
-- Sync now applies it within one tick, with or without a crawl.
--
-- ---------------------------------------------------------------------------------------------
-- F3 (apply side). applied_at was stamped on answers nothing had applied
-- ---------------------------------------------------------------------------------------------
-- Step 0 stamped applied_at on every resolved row it looked at, including the ones it could not
-- act on at all: a course-map question (ref 'course_field:...' / 'map_gap:...'), a
-- grading_scheme 'missing' item, a course_staff conflict, an ambiguous-column conflict whose ref
-- is 'column:<id>' and not an assignment id. Nothing was written, yet the Inbox chip flipped
-- from "answered, applies on next sync" to "applied". That is the app telling Stack his answer
-- landed somewhere when it landed nowhere.
--
-- THE ANSWER KINDS NOTHING CURRENTLY APPLIES - they stay resolved, with applied_at null, and the
-- chip keeps saying "answered, applies on next sync", which is the truth:
--   * stack_must_confirm on entity 'course'      - the course_map seeds (course_field:, map_gap:)
--   * missing        on entity 'course'          - field 'grading_scheme' (needs grading_schemes)
--   * conflict       on entity 'course_staff'    - a staff name disagreement (stage_courses)
--   * conflict       on ref 'column:<column_id>' - which assignment a gradebook column means
--   * data_gap       on entity 'bb_file'/'reading' - not read here at all; dismissal is the answer
--   * any resolution whose 'accept' is neither 'keep' nor 'blackboard', or which names a field
--     outside {due_at, due_date, points_possible, bb_url}
-- Each becomes a real writer in a later phase (grading schemes, staff, files). Until then the
-- answer is preserved in `resolution` / `resolution_note` and the row stays visible.
--
-- ---------------------------------------------------------------------------------------------
-- F2. "Keep mine" was re-asked on every sync
-- ---------------------------------------------------------------------------------------------
-- Answering a due_at or points_possible conflict with "Keep mine" sets confidence = 'confirmed'
-- and writes nothing - which is right - but Blackboard still says what it said, so the next fold
-- walked into the same branch and raised the same question again. Migration 041 added
-- attention_keep_stands() and taught raise_attention() to refuse those; this migration asks the
-- question one level earlier, at each conflict site, so the stage's own counts are honest too:
-- `conflicts` counts live disagreements, and the new `conflicts_settled` counts the ones Stack
-- has already settled with "Keep mine" while Blackboard's value has not moved. If Blackboard's
-- value DOES move, to_value differs, attention_keep_stands is false, and the question is raised
-- again - which is the whole point.
--
-- ---------------------------------------------------------------------------------------------
-- F6. assignments.bb_url was never populated
-- ---------------------------------------------------------------------------------------------
-- Step 2 read `ci->>'url'`. The crawler (ingest/bb_crawler.js, slim()) copies the content
-- detail's link into `detail.url`, and a document's attachment into `detail.file.url`; it never
-- writes a top-level `url`. Verified against both registered crawls: 286 content items, 0 with a
-- top-level url, 8 with detail.url, 50 with detail.file.url. Now it reads all three, in that
-- order, through bb_abs_url so a relative bbcswebdav href becomes absolute.
--
-- ---------------------------------------------------------------------------------------------
-- 1. apply_resolutions - step 0, standing on its own
-- ---------------------------------------------------------------------------------------------
create or replace function apply_resolutions() returns jsonb
  language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_scanned int := 0; v_applied_bb int := 0; v_applied_keep int := 0; v_applied_value int := 0;
  v_unapplicable int := 0; v_unapplied int := 0;
  v_n int; v_val text; v_vtype text;
  it record;
begin
  for it in
    select id, kind, entity, ref, field, to_value, resolution
      from attention_items
     where state = 'resolved' and applied_at is null
       and kind in ('conflict','stack_must_confirm','missing')
     order by id
  loop
    v_scanned := v_scanned + 1;
    begin
      v_val := null; v_vtype := 'text';

      if it.kind = 'conflict' then
        if it.resolution->>'accept' = 'keep' then
          -- Stack's value stands. Nothing is written except the confidence that says so - and
          -- that confidence is what keeps the next fold from overwriting him.
          if it.entity = 'assignment' and it.ref is not null then
            update assignments set confidence = 'confirmed' where id = it.ref;
            get diagnostics v_n = row_count;
          else
            v_n := 0;
          end if;
          if v_n > 0 then
            update attention_items set applied_at = now() where id = it.id;
            v_applied_keep := v_applied_keep + 1;
          else
            v_unapplicable := v_unapplicable + 1;   -- not an assignment row; nothing to confirm
          end if;
          continue;
        elsif it.resolution->>'accept' = 'blackboard' then
          v_val := nullif(it.to_value #>> '{}', '');
        else
          -- An answer we do not understand is still an answer. It stays on the row, unapplied.
          v_unapplicable := v_unapplicable + 1;
          continue;
        end if;
      else
        -- stack_must_confirm / missing: the Inbox writes {value, value_type}.
        v_val   := nullif(it.resolution->>'value', '');
        v_vtype := coalesce(nullif(it.resolution->>'value_type', ''), 'text');
      end if;

      -- Nothing here can write it (a course-map question, a staff conflict, a gap with no
      -- field). Leave applied_at null: "answered, applies on next sync" is the honest chip.
      if v_val is null or it.entity is distinct from 'assignment'
         or it.ref is null or it.field is null then
        v_unapplicable := v_unapplicable + 1;
        continue;
      end if;

      if    it.field = 'due_at' and v_vtype = 'date' then
        -- A day, not a moment. Writing it into due_at would invent a clock time.
        update assignments set due_date = v_val::date, confidence = 'confirmed' where id = it.ref;
      elsif it.field = 'due_at' then
        update assignments set due_at = v_val::timestamptz, confidence = 'confirmed' where id = it.ref;
      elsif it.field = 'due_date' then
        update assignments set due_date = v_val::date, confidence = 'confirmed' where id = it.ref;
      elsif it.field = 'points_possible' then
        update assignments set points_possible = v_val::numeric, confidence = 'confirmed' where id = it.ref;
      elsif it.field = 'bb_url' then
        update assignments set bb_url = v_val, confidence = 'confirmed' where id = it.ref;
      else
        v_unapplicable := v_unapplicable + 1;
        continue;
      end if;

      get diagnostics v_n = row_count;
      if v_n > 0 then
        update attention_items set applied_at = now() where id = it.id;
        if it.kind = 'conflict' then v_applied_bb    := v_applied_bb + 1;
                                else v_applied_value := v_applied_value + 1; end if;
      else
        -- The field exists but the row does not (a deleted or re-pointed assignment).
        v_unapplied := v_unapplied + 1;
      end if;
    exception when others then
      -- A malformed resolution must not take the caller down; leave it unapplied and visible.
      v_unapplied := v_unapplied + 1;
    end;
  end loop;

  return jsonb_build_object(
    'scanned',            v_scanned,
    'applied_blackboard', v_applied_bb,
    'applied_keep',       v_applied_keep,
    'applied_value',      v_applied_value,
    'unapplicable',       v_unapplicable,
    'unapplied',          v_unapplied);
end $$;

comment on function apply_resolutions() is
  'Write every answered attention_items row that this phase knows how to write: a conflict '
  'accepted as Blackboard''s (to_value -> the field), a conflict kept as Stack''s (confidence = '
  'confirmed, nothing else), and a stack_must_confirm / missing answer carrying {value, '
  'value_type} for an assignment''s due_at, due_date, points_possible or bb_url. Only a row it '
  'actually wrote gets applied_at stamped; everything else stays resolved with applied_at null '
  'and keeps the Inbox chip honest. The kinds nothing applies today, and why, are listed in the '
  'header of migration 042. Called by stage_assignments on every fold and by transform_tick''s '
  'drain for a queued agent_requests row of kind transform, which is the path that exists so an '
  'answer can be applied without waiting for the next crawl.';

-- ---------------------------------------------------------------------------------------------
-- 2. stage_assignments - 034's body, with step 0 delegated, F2's guard, and F6's url
-- ---------------------------------------------------------------------------------------------
create or replace function stage_assignments(p_run_id uuid, p_sync_run_id bigint) returns jsonb
  language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_started timestamptz := clock_timestamp();
  v_status text := 'ok';
  v_error  text;
  v_counts jsonb := '{}'::jsonb;
  v_cols int := 0; v_skipped int := 0; v_ambiguous int := 0; v_linked int := 0;
  v_inserted int := 0; v_repointed int := 0; v_filled int := 0; v_overwritten int := 0;
  v_conflicts int := 0; v_out_of_term int := 0; v_mirror int := 0; v_url_set int := 0;
  v_settled int := 0; v_raised int := 0;
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
        if attention_keep_stands(c.course_id, 'column:' || c.column_id, 'bb_column_id',
             to_jsonb(c.name)) then
          v_settled := v_settled + 1;
        elsif raise_attention(p_sync_run_id, 'conflict', c.course_id, 'assignment',
             'column:' || c.column_id, 'bb_column_id',
             to_jsonb((select string_agg(id, ', ' order by id) from assignments
                        where course_id = c.course_id and bb_column_id = c.column_id)),
             to_jsonb(c.name),
             format('%s: gradebook column "%s" is attached to more than one assignment, so the transform cannot tell which one Blackboard means. Which is it?',
                    c.course_id, c.name),
             jsonb_build_object('column_id', c.column_id, 'possible', c.possible, 'due', c.due_at))
        then v_raised := v_raised + 1; end if;
        continue;
      end if;

      v_aid := null; v_old_col := null;
      if v_n = 1 then
        select id into v_aid from assignments
         where course_id = c.course_id and bb_column_id = c.column_id;
      else
        -- No column match. Fall back to (course_id, title): an unbound row first, then a row
        -- whose stored column id is no longer in this run - that is a re-created Blackboard item.
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
      -- ------------------------------------------------------------------------------------
      if v_aid is null then
        v_new_id := c.course_id || '/' || nullif(bb_slug(c.name), '');
        if v_new_id is null or exists (select 1 from assignments where id = v_new_id) then
          v_new_id := c.course_id || '/' || coalesce(nullif(bb_slug(c.name), ''), 'column')
                      || '-' || regexp_replace(c.column_id, '\D', '', 'g');
        end if;

        insert into assignments (id, course_id, title, type, due_at, points_possible,
                                 bb_column_id, bb_submission_status, bb_last_seen,
                                 source, source_ref, confidence)
        values (v_new_id, c.course_id, c.name, bb_assignment_type(c.name),
                case when bb_date_in_term(c.due_at) then c.due_at end,
                c.possible, c.column_id, c.sub_status, c.captured_at,
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
                          coalesce(to_char(coalesce(a.due_at, a.due_date::timestamptz) at time zone 'America/New_York', 'YYYY-MM-DD'), 'no date')),
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

    v_counts := jsonb_build_object(
      'columns_seen',        v_cols,
      'columns_skipped',     v_skipped,
      'ambiguous_columns',   v_ambiguous,
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
end $$;

comment on function stage_assignments(uuid,bigint) is
  'Folds one crawl''s gradebook columns and content links into assignments, and starts by '
  'calling apply_resolutions() so Stack''s answers land before Blackboard''s values are read. '
  'A disagreement with a confirmed row is raised as an attention_items conflict and the row is '
  'left alone - unless Stack already settled that exact disagreement with "Keep mine" and '
  'Blackboard has not changed its answer since, which is counted as conflicts_settled and not '
  're-asked. assignment_progress is never touched.';

-- ---------------------------------------------------------------------------------------------
-- 3. Privileges. Same rule as 038: nothing here is callable from a browser. create or replace
--    keeps stage_assignments'' existing ACL; apply_resolutions is new and has none yet.
-- ---------------------------------------------------------------------------------------------
do $$
declare f text;
begin
  foreach f in array array[
    'apply_resolutions()',
    'stage_assignments(uuid,bigint)']
  loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;

-- bb2dash :: 034_transform_stages.sql
-- Phase 9 (docs/planning/62_PHASE9_sync_loop.md, "Migration 034 - transform stages").
--
-- The runbook's step 3 ("diff live vs catalog"), done by hand on 2026-09-08, expressed as SQL.
-- One function per stage, each `stage_<name>(p_run_id uuid, p_sync_run_id bigint) returns jsonb`,
-- security definer, idempotent on run_id, writing exactly one sync_stage_runs row and NEVER
-- raising: every stage catches its own errors, records status = 'failed' with the message, and
-- returns. The driver in 035 calls them in order.
--
-- stage_content is NOT defined here. Phase 8 (migration 026) owns it; 035's driver calls it.
--
-- HARD RULES honoured throughout:
--   * assignment_progress and reading_progress are never written. Not once.
--   * bb_files rows with classified_by = 'stack' or a non-null superseded_by are never touched.
--   * Blackboard overwrites only tentative/inferred rows or genuinely empty fields; a differing
--     value on a confirmed row raises an attention_items conflict and leaves the row alone.
--   * Nothing is ever deleted. "Gone from Blackboard" is a note, not a DELETE.
--
-- WHAT THE REAL PAYLOADS FORCED (verified against every bb_raw row, 2026-09-10):
--   * The crawl that produced the 2026-09-08 runs used a different crawler build from the one in
--     ingest/bb_crawler.js: its course payloads carry `groups` and carry NO `teachers`,
--     `schedule` or `gradeCategories` keys at all. Every stage therefore treats a missing key as
--     an empty array (bb_jarray) instead of assuming the documented shape.
--   * `schedule` is an empty array in every payload that has the key (the 2026-09-02 run, all 7
--     courses). No sample anywhere shows what a meeting entry looks like, so stage_courses does
--     NOT write meetings: writing against an unseen shape would be guessing at Stack's timetable.
--     It counts the entries it sees and raises a data_gap the first time a non-empty schedule
--     appears, so the gap is visible rather than silent. See docs/planning/64_W15_VERIFICATION.md.
--   * Gradebook columns are the only source of due dates and points in these payloads: the
--     content items carry no dueDate, no points and no gradebookColumnId (the crawler's `detail`
--     only ever holds `file` and `url`).
--   * IST.466's shell still carries gradebook columns with 2021 and 2022 due dates. Writing those
--     into the planner would be worse than having no date at all, so a due date outside the term
--     window is never written, whatever the row's confidence - it raises a conflict instead.
--
--   * bb_raw.bb_course_id holds Blackboard's INTERNAL shell id (_569316_1), which is
--     courses.bb_id - not courses.bb_course_id (IST.323.M002.FALL26). Resolving by
--     bb_course_id, as the phase briefs say, matches 0 of 7 shells. bb_resolve_course() tries
--     bb_id first and falls back to bb_course_id, and stage_courses counts the shells it cannot
--     resolve instead of quietly dropping them. Same rule in every stage (agreed with W-12).
--
-- DEVIATIONS from the contract table, deliberate, each because real data demanded it:
--   * assignments has no `notes` column (checked: 001 + 004 + 014 never added one). Provenance
--     for a re-pointed or transform-created row goes in `source_ref`.
--   * bb_files is keyed `unique (bb_course_id, source_url)`, not by (course, content_id,
--     file_name). stage_files therefore matches on the URL first and on the contract's identity
--     second; matching identity-first would hit the unique constraint on the four rows whose
--     file_name drifted (a stripped '#', a curly apostrophe) while the URL stayed put.
--   * course_staff: when Blackboard reports a teacher the course already has under a different
--     name in the same role with no bb_user_id ("Bob Wilson" vs "Robert Wilson" on GEO.103), the
--     stage raises a conflict and inserts NOTHING. A blind upsert-on-bb_user_id would put two
--     instructors on the Info tab and call it a sync.

-- =============================================================================================
-- Helpers
-- =============================================================================================

-- Treat a missing or non-array json value as an empty array. Payload shape varies per crawler
-- build, and a stage that dies on a missing key is a stage that never runs.
create or replace function bb_jarray(p jsonb) returns jsonb
  language sql immutable set search_path = public, pg_temp as $$
  select case when jsonb_typeof(p) = 'array' then p else '[]'::jsonb end
$$;

create or replace function bb_slug(p_text text) returns text
  language sql immutable set search_path = public, pg_temp as $$
  select btrim(regexp_replace(lower(coalesce(p_text, '')), '[^a-z0-9]+', '-', 'g'), '-')
$$;

-- Absolute-ise the relative bbcswebdav hrefs the crawler sometimes captures, so the same file is
-- not catalogued twice under two spellings of one URL.
create or replace function bb_abs_url(p_url text) returns text
  language sql immutable set search_path = public, pg_temp as $$
  select case
    when p_url is null or btrim(p_url) = '' then null
    when left(p_url, 1) = '/' then 'https://blackboard.syracuse.edu' || p_url
    else p_url end
$$;

-- bb_raw.bb_course_id is Blackboard's internal shell id, which lives in courses.bb_id; the
-- briefs say courses.bb_course_id, which matches nothing. Try the real one, fall back to the
-- documented one, and let the caller notice a null rather than silently skipping a course.
create or replace function bb_resolve_course(p_bb_course_id text) returns text
  language sql stable set search_path = public, pg_temp as $$
  select coalesce(
    (select c.id from courses c where c.bb_id        = p_bb_course_id limit 1),
    (select c.id from courses c where c.bb_course_id = p_bb_course_id limit 1))
$$;

-- Type of a gradebook column, guessed from its name. Every row created with a guessed type is
-- written confidence = 'tentative' and raises a stack_must_confirm, so the guess is never
-- presented as a fact.
create or replace function bb_assignment_type(p_name text) returns assignment_type
  language sql immutable set search_path = public, pg_temp as $$
  select case
    when p_name ~* 'attendance|absence'            then 'attendance'
    when p_name ~* 'participation'                 then 'participation'
    when p_name ~* 'final exam'                    then 'final_exam'
    when p_name ~* 'quiz|knowledge check'          then 'quiz'
    when p_name ~* '\mexams?\M|midterm'            then 'exam'
    when p_name ~* '\mlabs?\M'                     then 'lab'
    when p_name ~* '\mreading\M|\mread\M|chapter'  then 'reading'
    when p_name ~* 'discussion'                    then 'discussion_post'
    when p_name ~* 'group presentation'            then 'group_presentation'
    when p_name ~* 'presentation'                  then 'presentation'
    when p_name ~* 'evaluation'                    then 'evaluation'
    when p_name ~* 'survey|selection|sign[- ]?up'  then 'form'
    when p_name ~* 'project|\mcase\M'              then 'project'
    when p_name ~* 'paper|essay|report'            then 'paper'
    when p_name ~* 'assignment|homework'           then 'homework'
    else 'other' end::assignment_type
$$;

-- Blackboard course-role identifier -> staff_role. NULL means "not recognised", and the caller
-- must ask rather than file the person under a role they may not hold. The live payloads only
-- ever show 'P'.
create or replace function bb_staff_role(p_identifier text) returns staff_role
  language sql immutable set search_path = public, pg_temp as $$
  select case
    when p_identifier is null then null
    when upper(p_identifier) in ('P','INSTRUCTOR','PRIMARY','COURSEINSTRUCTOR') then 'instructor'
    when upper(p_identifier) in ('T','TA','TEACHINGASSISTANT','G','GRADER')     then 'ta'
    when upper(p_identifier) in ('B','COURSEBUILDER')                           then 'coordinator'
    when upper(p_identifier) in ('GU','GUEST')                                  then 'guest'
    else null end::staff_role
$$;

-- Is this timestamp plausibly inside the term? Blackboard shells carry template columns from
-- previous years; a 2021 due date on a Fall 2026 assignment is not a fact, it is debris.
create or replace function bb_date_in_term(p_ts timestamptz) returns boolean
  language sql stable set search_path = public, pg_temp as $$
  select p_ts is null
      or not exists (select 1 from terms)
      or exists (select 1 from terms t
                  where p_ts >= (t.start_date - interval '14 days')
                    and p_ts <  (t.end_date   + interval '31 days'))
$$;

-- Raise (or refresh) one attention item. Returns true only when the row is NEW, so a stage can
-- report how many questions it actually added rather than how many it re-stated.
create or replace function raise_attention(
  p_sync_run_id bigint, p_kind text, p_course_id text, p_entity text, p_ref text,
  p_field text, p_from jsonb, p_to jsonb, p_question text, p_suggested jsonb
) returns boolean
  language plpgsql security definer set search_path = public, pg_temp as $$
declare v_new boolean;
begin
  insert into attention_items
    (raised_by, kind, course_id, entity, ref, field, from_value, to_value, question, suggested)
  values
    (p_sync_run_id, p_kind, p_course_id, p_entity, p_ref, p_field, p_from, p_to, p_question, p_suggested)
  on conflict (kind, (coalesce(course_id,'')), (coalesce(ref,'')), (coalesce(field,'')), state)
  do update set from_value = excluded.from_value,
                to_value   = excluded.to_value,
                question   = excluded.question,
                suggested  = excluded.suggested,
                raised_by  = excluded.raised_by
  returning (xmax = 0) into v_new;
  return coalesce(v_new, false);
end $$;

comment on function raise_attention(bigint,text,text,text,text,text,jsonb,jsonb,text,jsonb) is
  'Insert-or-refresh one attention_items row against the dedupe index. Returns true only for a '
  'genuinely new question, which is what sync_runs.summary.attention_raised counts. Only the '
  'open row can be hit: state is part of the key and every insert here is state = open.';

-- =============================================================================================
-- stage_courses
-- =============================================================================================
create or replace function stage_courses(p_run_id uuid, p_sync_run_id bigint) returns jsonb
  language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_started timestamptz := clock_timestamp();
  v_status  text := 'ok';
  v_error   text;
  v_counts  jsonb := '{}'::jsonb;
  v_seen int := 0; v_courses_updated int := 0;
  v_staff_ins int := 0; v_staff_linked int := 0; v_staff_updated int := 0;
  v_staff_conflict int := 0; v_role_unknown int := 0;
  v_sched int := 0; v_raised int := 0; v_n int; v_unresolved int := 0;
  r record; t record; v_role staff_role; v_title text; v_url text; v_existing text;
begin
  begin
    -- A shell in the crawl that matches no courses row would otherwise vanish from every stage.
    for r in
      select b.bb_course_id
        from bb_raw b
       where b.run_id = p_run_id and b.kind = 'course'
         and bb_resolve_course(b.bb_course_id) is null
    loop
      v_unresolved := v_unresolved + 1;
      if raise_attention(p_sync_run_id, 'stack_must_confirm', null, 'course',
           'shell:' || r.bb_course_id, null, null, to_jsonb(r.bb_course_id),
           format('The crawl returned Blackboard shell %s, which matches no course in bb2dash (neither bb_id nor bb_course_id). Which course is it, or should it be ignored?',
                  r.bb_course_id),
           jsonb_build_object('source', 'stage_courses', 'run_id', p_run_id))
      then v_raised := v_raised + 1; end if;
    end loop;

    for r in
      select b.bb_course_id, b.payload, b.captured_at,
             c.id as course_id, c.bb_course_id as bb_code
      from bb_raw b
      join courses c on c.id = bb_resolve_course(b.bb_course_id)
      where b.run_id = p_run_id and b.kind = 'course'
      order by c.id
    loop
      v_seen := v_seen + 1;

      -- Blackboard names a shell "<bb_course_id>.<title>"; the bare title is what title_bb holds.
      v_title := r.payload->'course'->>'name';
      if v_title is not null and v_title like r.bb_code || '.%' then
        v_title := substr(v_title, length(r.bb_code) + 2);
      end if;
      v_title := nullif(btrim(coalesce(v_title, '')), '');
      v_url   := 'https://blackboard.syracuse.edu/ultra/courses/' || r.bb_course_id || '/outline';

      update courses c
         set title_bb = coalesce(v_title, c.title_bb),
             bb_id    = r.bb_course_id,
             bb_url   = v_url
       where c.id = r.course_id
         and (c.title_bb is distinct from coalesce(v_title, c.title_bb)
           or c.bb_id   is distinct from r.bb_course_id
           or c.bb_url  is distinct from v_url);
      get diagnostics v_n = row_count;
      v_courses_updated := v_courses_updated + v_n;

      -- Teaching staff. Upsert on bb_user_id, link by name where the seed row has no id yet,
      -- and never invent a second instructor for one course.
      for t in
        select e->>'name' as name, e->>'email' as email, e->>'role' as role, e->>'userId' as user_id
        from jsonb_array_elements(bb_jarray(r.payload->'teachers')) e
      loop
        continue when t.user_id is null or coalesce(btrim(t.name), '') = '';

        v_role := bb_staff_role(t.role);
        if v_role is null then
          v_role_unknown := v_role_unknown + 1;
          if raise_attention(p_sync_run_id, 'stack_must_confirm', r.course_id, 'course_staff',
               'staff:' || t.user_id, 'role', null, to_jsonb(t.role),
               format('%s: Blackboard lists %s with role identifier "%s", which bb2dash does not recognise. What role is that?',
                      r.course_id, t.name, t.role),
               jsonb_build_object('name', t.name, 'email', t.email, 'bb_user_id', t.user_id))
          then v_raised := v_raised + 1; end if;
          continue;
        end if;

        if exists (select 1 from course_staff s
                    where s.course_id = r.course_id and s.bb_user_id = t.user_id) then
          update course_staff s set email = t.email
           where s.course_id = r.course_id and s.bb_user_id = t.user_id
             and s.email is null and t.email is not null;
          get diagnostics v_n = row_count;
          v_staff_updated := v_staff_updated + v_n;
          continue;
        end if;

        update course_staff s
           set bb_user_id = t.user_id,
               email      = coalesce(s.email, t.email)
         where s.course_id = r.course_id and s.bb_user_id is null
           and lower(s.name) = lower(t.name);
        get diagnostics v_n = row_count;
        if v_n > 0 then
          v_staff_linked := v_staff_linked + v_n;
          continue;
        end if;

        select string_agg(s.name, ', ' order by s.name) into v_existing
          from course_staff s
         where s.course_id = r.course_id and s.role = v_role and s.bb_user_id is null;

        if v_existing is not null then
          v_staff_conflict := v_staff_conflict + 1;
          if raise_attention(p_sync_run_id, 'conflict', r.course_id, 'course_staff',
               'staff:' || t.user_id, 'name', to_jsonb(v_existing), to_jsonb(t.name),
               format('%s already records %s as %s; Blackboard''s shell lists %s. Same person under another name, or an extra one?',
                      r.course_id, v_existing, v_role, t.name),
               jsonb_build_object('bb_user_id', t.user_id, 'email', t.email, 'role', v_role))
          then v_raised := v_raised + 1; end if;
          continue;
        end if;

        insert into course_staff (course_id, name, role, email, bb_user_id, source)
        values (r.course_id, btrim(t.name), v_role, t.email, t.user_id, 'blackboard');
        v_staff_ins := v_staff_ins + 1;
      end loop;

      -- Meetings: deliberately not written. See the header.
      v_n := jsonb_array_length(bb_jarray(r.payload->'schedule'));
      v_sched := v_sched + v_n;
      if v_n > 0 then
        if raise_attention(p_sync_run_id, 'data_gap', r.course_id, 'course',
             'schedule', 'meetings', null, to_jsonb(v_n),
             format('%s: Blackboard''s schedule endpoint returned %s entries. bb2dash has never seen a non-empty schedule payload, so the transform does not write meetings from it yet - the shape has to be read from a real payload first.',
                    r.course_id, v_n),
             jsonb_build_object('source', 'stage_courses', 'run_id', p_run_id))
        then v_raised := v_raised + 1; end if;
      end if;
    end loop;

    v_counts := jsonb_build_object(
      'courses_seen',     v_seen,
      'courses_unresolved', v_unresolved,
      'courses_updated',  v_courses_updated,
      'staff_inserted',   v_staff_ins,
      'staff_linked',     v_staff_linked,
      'staff_updated',    v_staff_updated,
      'staff_conflicts',  v_staff_conflict,
      'staff_role_unknown', v_role_unknown,
      'schedule_entries', v_sched,
      'meetings_written', 0,
      'attention_raised', v_raised);
  exception when others then
    v_status := 'failed';
    v_error  := left(sqlstate || ' ' || sqlerrm, 1000);
    v_counts := '{}'::jsonb;
  end;

  insert into sync_stage_runs (sync_run_id, stage, status, counts, started_at, finished_at, error)
  values (p_sync_run_id, 'courses', v_status, v_counts, v_started, clock_timestamp(), v_error);

  return jsonb_build_object('stage','courses','status',v_status,'counts',v_counts,'error',v_error);
end $$;

-- =============================================================================================
-- stage_assignments
-- =============================================================================================
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
  v_applied_bb int := 0; v_applied_keep int := 0; v_applied_value int := 0;
  v_noted int := 0; v_unapplied int := 0; v_raised int := 0;
  v_n int; v_aid text; v_old_col text; v_new_id text; v_val text; v_vtype text;
  c record; a assignments%rowtype; it record;
begin
  begin
    -- ---------------------------------------------------------------------------------------
    -- 0. Apply resolutions Stack has already given. Anything this cannot apply stays unapplied
    --    and visible: applied_at is what the Inbox's "applies on next sync" chip waits for.
    -- ---------------------------------------------------------------------------------------
    for it in
      select id, kind, entity, ref, field, to_value, resolution
        from attention_items
       where state = 'resolved' and applied_at is null
         and kind in ('conflict','stack_must_confirm','missing')
       order by id
    loop
      begin
        v_val := null; v_vtype := 'text';

        if it.kind = 'conflict' then
          if it.resolution->>'accept' = 'keep' then
            -- Stack's value stands. Nothing is written except the confidence that says so.
            if it.entity = 'assignment' and it.ref is not null then
              update assignments set confidence = 'confirmed' where id = it.ref;
              get diagnostics v_n = row_count;
            else
              v_n := 0;
            end if;
            update attention_items set applied_at = now() where id = it.id;
            if v_n > 0 then v_applied_keep := v_applied_keep + 1;
                       else v_noted := v_noted + 1; end if;
            continue;
          elsif it.resolution->>'accept' = 'blackboard' then
            v_val := nullif(it.to_value #>> '{}', '');
          else
            -- An answer we do not understand is still an answer: keep it, stop nagging.
            update attention_items set applied_at = now() where id = it.id;
            v_noted := v_noted + 1;
            continue;
          end if;
        else
          -- stack_must_confirm / missing: the Inbox writes {value, value_type}.
          v_val   := nullif(it.resolution->>'value', '');
          v_vtype := coalesce(nullif(it.resolution->>'value_type', ''), 'text');
        end if;

        -- Nothing to write to (a course-map question, a staff conflict, a gap with no field).
        -- Stamp it anyway so the Inbox chip clears; the answer lives on in resolution and
        -- resolution_note, so nothing Stack typed is lost.
        if v_val is null or it.entity is distinct from 'assignment'
           or it.ref is null or it.field is null then
          update attention_items set applied_at = now() where id = it.id;
          v_noted := v_noted + 1;
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
          update attention_items set applied_at = now() where id = it.id;
          v_noted := v_noted + 1;
          continue;
        end if;

        get diagnostics v_n = row_count;
        if v_n > 0 then
          update attention_items set applied_at = now() where id = it.id;
          if it.kind = 'conflict' then v_applied_bb    := v_applied_bb + 1;
                                  else v_applied_value := v_applied_value + 1; end if;
        else
          v_unapplied := v_unapplied + 1;
        end if;
      exception when others then
        -- A malformed resolution must not take the stage down; leave it unapplied and visible.
        v_unapplied := v_unapplied + 1;
      end;
    end loop;

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
        if raise_attention(p_sync_run_id, 'conflict', c.course_id, 'assignment',
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
          v_out_of_term := v_out_of_term + 1;
          if raise_attention(p_sync_run_id, 'conflict', c.course_id, 'assignment',
               v_new_id, 'due_at', null, to_jsonb(c.due_at),
               format('%s: Blackboard gives "%s" a due date of %s, which is outside the term. It was left with no date rather than put on the tracker in the wrong year.',
                      c.course_id, c.name, to_char(c.due_at at time zone 'America/New_York', 'YYYY-MM-DD')),
               jsonb_build_object('column_id', c.column_id, 'source', 'stage_assignments'))
          then v_raised := v_raised + 1; end if;
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
      from (select cr.id as course_id, ci->>'id' as item_id, ci->>'url' as url
              from bb_raw b
              join courses cr on cr.id = bb_resolve_course(b.bb_course_id),
                   lateral jsonb_array_elements(bb_jarray(b.payload->'content')) ci
             where b.run_id = p_run_id and b.kind = 'course'
               and coalesce(ci->>'url','') <> '') ci
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
      'out_of_term_dates',   v_out_of_term,
      'mirror_updates',      v_mirror,
      'urls_set',            v_url_set,
      'resolutions_applied_blackboard', v_applied_bb,
      'resolutions_applied_keep',       v_applied_keep,
      'resolutions_applied_value',      v_applied_value,
      'resolutions_noted_only',         v_noted,
      'resolutions_unapplied',          v_unapplied,
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

-- =============================================================================================
-- stage_announcements
-- =============================================================================================
create or replace function stage_announcements(p_run_id uuid, p_sync_run_id bigint) returns jsonb
  language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_started timestamptz := clock_timestamp();
  v_status text := 'ok';
  v_error  text;
  v_counts jsonb := '{}'::jsonb;
  v_seen int := 0; v_ins int := 0; v_upd int := 0; v_authors int := 0;
begin
  begin
    with src as (
      select cr.id as course_id,
             a->>'id'                            as bb_item_id,
             nullif(a->>'title','')               as title,
             nullif(a->>'body','')                as body,
             nullif(a->>'created','')::timestamptz  as posted_at,
             nullif(a->>'modified','')::timestamptz as modified_at,
             case when jsonb_typeof(a->'isRead') = 'boolean' then (a->>'isRead')::boolean end as is_read,
             -- The crawler does not capture a creator yet (migration 033 header); read whichever
             -- key it lands on when W-16 adds it, rather than needing another migration.
             -- W-16's crawler sends `author` (display name or null) plus `authorSource`
             -- naming the key it came from; the older keys stay as a fallback for replaying
             -- payloads captured before that change.
             nullif(coalesce(a->>'author', a->>'creator', a->>'createdBy'), '') as author
        from bb_raw b
        join courses cr on cr.id = bb_resolve_course(b.bb_course_id),
             lateral jsonb_array_elements(bb_jarray(b.payload->'announcements')) a
       where b.run_id = p_run_id and b.kind = 'course'
         and coalesce(a->>'id','') <> ''
    ), ranked as (
      select distinct on (course_id, bb_item_id) * from src order by course_id, bb_item_id, posted_at desc nulls last
    ), upserted as (
      insert into announcements (course_id, bb_item_id, title, body, posted_at, modified_at, is_read, author)
      select course_id, bb_item_id, title, body, posted_at, modified_at, is_read, author from ranked
      on conflict (course_id, bb_item_id) do update
        set title       = excluded.title,
            body        = excluded.body,
            posted_at   = excluded.posted_at,
            modified_at = excluded.modified_at,
            is_read     = excluded.is_read,
            author      = coalesce(excluded.author, announcements.author)
        where (announcements.title, announcements.body, announcements.posted_at,
               announcements.modified_at, announcements.is_read)
              is distinct from
              (excluded.title, excluded.body, excluded.posted_at,
               excluded.modified_at, excluded.is_read)
           or (excluded.author is not null and announcements.author is distinct from excluded.author)
      returning (xmax = 0) as inserted
    )
    select count(*) filter (where inserted),
           count(*) filter (where not inserted),
           (select count(*) from ranked),
           (select count(*) from ranked where author is not null)
      into v_ins, v_upd, v_seen, v_authors
      from upserted;

    v_counts := jsonb_build_object(
      'announcements_seen', v_seen,
      'inserted',           v_ins,
      'updated',            v_upd,
      'deleted',            0,
      'authors_captured',   v_authors);
  exception when others then
    v_status := 'failed';
    v_error  := left(sqlstate || ' ' || sqlerrm, 1000);
    v_counts := '{}'::jsonb;
  end;

  insert into sync_stage_runs (sync_run_id, stage, status, counts, started_at, finished_at, error)
  values (p_sync_run_id, 'announcements', v_status, v_counts, v_started, clock_timestamp(), v_error);

  return jsonb_build_object('stage','announcements','status',v_status,'counts',v_counts,'error',v_error);
end $$;

-- =============================================================================================
-- stage_files  (catalog only - no bytes; downloads stay in the runbook until Electron)
-- =============================================================================================
create or replace function stage_files(p_run_id uuid, p_sync_run_id bigint) returns jsonb
  language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_started timestamptz := clock_timestamp();
  v_status text := 'ok';
  v_error  text;
  v_counts jsonb := '{}'::jsonb;
  v_refs int := 0; v_session int := 0; v_matched_url int := 0; v_url_updated int := 0;
  v_inserted int := 0; v_name_drift int := 0; v_protected int := 0; v_missing int := 0;
  v_raised int := 0; v_n int;
  s record;
begin
  begin
    drop table if exists pg_temp._bb_refs;
    create temp table _bb_refs on commit drop as
      select cr.id as course_id, b.bb_course_id, b.captured_at,
             ci->>'id'                       as content_id,
             nullif(ci->>'path','')          as path,
             nullif(e->>'name','')           as file_name,
             bb_abs_url(e->>'url')           as url,
             nullif(e->>'mime','')           as mime
        from bb_raw b
        join courses cr on cr.id = bb_resolve_course(b.bb_course_id),
             lateral jsonb_array_elements(bb_jarray(b.payload->'content')) ci,
             lateral jsonb_array_elements(bb_jarray(ci->'embeddedFiles')) e
       where b.run_id = p_run_id and b.kind = 'course'
         and coalesce(e->>'url','') <> ''
      union
      select cr.id, b.bb_course_id, b.captured_at,
             ci->>'id',
             nullif(ci->>'path',''),
             nullif(coalesce(ci->'detail'->'file'->>'name', ci->>'title'), ''),
             bb_abs_url(ci->'detail'->'file'->>'url'),
             null
        from bb_raw b
        join courses cr on cr.id = bb_resolve_course(b.bb_course_id),
             lateral jsonb_array_elements(bb_jarray(b.payload->'content')) ci
       where b.run_id = p_run_id and b.kind = 'course'
         and coalesce(ci->'detail'->'file'->>'url','') <> '';

    select count(*) into v_refs from _bb_refs;

    -- Session-scoped URLs 403 once the Blackboard session ends, so cataloguing one produces an
    -- entry nothing can ever download. Skip it and say so out loud.
    for s in select * from _bb_refs where url ~ '/sessions/' loop
      v_session := v_session + 1;
      if raise_attention(p_sync_run_id, 'data_gap', s.course_id, 'bb_file',
           coalesce(s.content_id,'?') || '/' || coalesce(s.file_name,'?'), 'source_url',
           null, to_jsonb(s.url),
           format('%s: "%s" is only reachable through a session-scoped Blackboard URL, which stops working when the session ends, so it was not added to the file catalog. It needs a durable bbcswebdav link.',
                  s.course_id, coalesce(s.file_name, s.path, s.content_id)),
           jsonb_build_object('content_id', s.content_id, 'path', s.path, 'source', 'stage_files'))
      then v_raised := v_raised + 1; end if;
    end loop;

    -- 1. Known by URL. Only the label can have drifted; the file_name feeds bb_file_relpath and
    --    the Storage key, so it is noted, never rewritten under a stored object.
    update bb_files f
       set path  = coalesce(f.path, d.path),
           notes = case when f.file_name is distinct from d.file_name
                        then btrim(coalesce(f.notes || ' | ', '') ||
                             'blackboard name now "' || coalesce(d.file_name,'?') || '"')
                        else f.notes end
      from (select distinct on (bb_course_id, url) * from _bb_refs
             where url !~ '/sessions/' order by bb_course_id, url, file_name) d
     where f.bb_course_id = d.bb_course_id and f.source_url = d.url
       and f.superseded_by is null and f.classified_by is distinct from 'stack'
       and (f.path is null and d.path is not null
            or (f.file_name is distinct from d.file_name
                and position('blackboard name now "' || coalesce(d.file_name,'?') || '"' in coalesce(f.notes,'')) = 0));
    get diagnostics v_n = row_count;
    v_name_drift := v_n;

    select count(distinct f.id) into v_matched_url
      from bb_files f join _bb_refs d
        on f.bb_course_id = d.bb_course_id and f.source_url = d.url
     where d.url !~ '/sessions/';

    -- 2. Known by identity, URL moved (the instructor re-uploaded: same item, new rid).
    update bb_files f
       set source_url = d.url,
           run_id     = p_run_id,
           notes      = btrim(coalesce(f.notes || ' | ', '') ||
                        'source_url changed ' || to_char(d.captured_at, 'YYYY-MM-DD') ||
                        '; stored bytes may be stale')
      from (select distinct on (bb_course_id, content_id, file_name) * from _bb_refs
             where url !~ '/sessions/' order by bb_course_id, content_id, file_name, captured_at desc) d
     where f.bb_course_id = d.bb_course_id and f.content_id = d.content_id
       and f.file_name = d.file_name and f.source_url is distinct from d.url
       and f.superseded_by is null and f.classified_by is distinct from 'stack'
       and not exists (select 1 from bb_files g
                        where g.bb_course_id = d.bb_course_id and g.source_url = d.url and g.id <> f.id);
    get diagnostics v_n = row_count;
    v_url_updated := v_n;

    -- 3. Genuinely new. Bucket comes from the existing rule classifier; no bytes are fetched.
    with fresh as (
      select distinct on (d.bb_course_id, d.url) d.*
        from _bb_refs d
       where d.url !~ '/sessions/'
         and not exists (select 1 from bb_files f
                          where f.bb_course_id = d.bb_course_id and f.source_url = d.url)
         and not exists (select 1 from bb_files f
                          where f.bb_course_id = d.bb_course_id and f.content_id = d.content_id
                            and f.file_name = d.file_name)
       order by d.bb_course_id, d.url, d.captured_at desc
    )
    insert into bb_files (run_id, bb_course_id, course_id, content_id, path, file_name,
                          mime_type, source_url, bucket, classified_by, classification_confidence,
                          captured_at, notes)
    select p_run_id, f.bb_course_id, f.course_id, f.content_id, f.path,
           coalesce(f.file_name, 'untitled'), f.mime,
           f.url, classify_bb_file(f.path, coalesce(f.file_name,''), f.mime),
           'rule', 0.6, f.captured_at,
           'catalogued by the Phase 9 transform; bytes not downloaded'
      from fresh f
    on conflict (bb_course_id, source_url) do nothing;
    get diagnostics v_n = row_count;
    v_inserted := v_n;

    -- 4. Gone from Blackboard. One marker, once, forever - never a DELETE.
    update bb_files f
       set notes = btrim(coalesce(f.notes || ' | ', '') || 'missing_since_run=' || p_run_id::text)
     where f.superseded_by is null
       and f.classified_by is distinct from 'stack'
       and coalesce(f.notes, '') not like '%missing_since_run=%'
       and exists (select 1 from _bb_refs d where d.bb_course_id = f.bb_course_id)
       and not exists (select 1 from _bb_refs d
                        where d.bb_course_id = f.bb_course_id and d.url = f.source_url)
       and not exists (select 1 from _bb_refs d
                        where d.bb_course_id = f.bb_course_id and d.content_id = f.content_id
                          and d.file_name = f.file_name);
    get diagnostics v_n = row_count;
    v_missing := v_n;

    select count(distinct f.id) into v_protected
      from bb_files f join _bb_refs d
        on f.bb_course_id = d.bb_course_id and f.source_url = d.url
     where f.classified_by = 'stack' or f.superseded_by is not null;

    v_counts := jsonb_build_object(
      'file_refs',            v_refs,
      'session_scoped_skipped', v_session,
      'matched_by_url',       v_matched_url,
      'name_notes_added',     v_name_drift,
      'source_url_updated',   v_url_updated,
      'inserted',             v_inserted,
      'marked_missing',       v_missing,
      'protected_rows_untouched', v_protected,
      'deleted',              0,
      'attention_raised',     v_raised);
  exception when others then
    v_status := 'failed';
    v_error  := left(sqlstate || ' ' || sqlerrm, 1000);
    v_counts := '{}'::jsonb;
  end;

  insert into sync_stage_runs (sync_run_id, stage, status, counts, started_at, finished_at, error)
  values (p_sync_run_id, 'files', v_status, v_counts, v_started, clock_timestamp(), v_error);

  return jsonb_build_object('stage','files','status',v_status,'counts',v_counts,'error',v_error);
end $$;

-- =============================================================================================
-- stage_gaps  (reads the typed tables, not the payload: what is still missing after the fold)
-- =============================================================================================
create or replace function stage_gaps(p_run_id uuid, p_sync_run_id bigint) returns jsonb
  language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_started timestamptz := clock_timestamp();
  v_status text := 'ok';
  v_error  text;
  v_counts jsonb := '{}'::jsonb;
  v_scheme int; v_dates int; v_read int; v_files int;
begin
  begin
    insert into attention_items (raised_by, kind, course_id, entity, ref, field, question, suggested)
    select p_sync_run_id, 'missing', c.id, 'course', c.id, 'grading_scheme',
           format('%s has no grading scheme recorded, so nothing can forecast a grade for it. What is the grading method?', c.id),
           jsonb_build_object('source', 'stage_gaps')
      from courses c
     where not exists (select 1 from grading_schemes g where g.course_id = c.id)
    on conflict (kind, (coalesce(course_id,'')), (coalesce(ref,'')), (coalesce(field,'')), state)
    do nothing;
    get diagnostics v_scheme = row_count;

    insert into attention_items (raised_by, kind, course_id, entity, ref, field, question, suggested)
    select p_sync_run_id, 'missing', a.course_id, 'assignment', a.id, 'due_at',
           format('%s: "%s" has no date at all - not in the syllabus, not in Blackboard. When is it due?',
                  a.course_id, a.title),
           jsonb_build_object('source', 'stage_gaps', 'type', a.type)
      from assignments a
     where a.due_at is null and a.due_date is null and a.event_start is null
    on conflict (kind, (coalesce(course_id,'')), (coalesce(ref,'')), (coalesce(field,'')), state)
    do nothing;
    get diagnostics v_dates = row_count;

    insert into attention_items (raised_by, kind, course_id, entity, ref, field, question, suggested)
    select p_sync_run_id, 'data_gap', r.course_id, 'reading', r.id::text, 'for_date',
           format('%s: the reading "%s" is not tied to a class date, so it cannot appear in the tracker.',
                  r.course_id, left(r.citation, 120)),
           jsonb_build_object('source', 'stage_gaps')
      from readings r
     where r.for_date is null
    on conflict (kind, (coalesce(course_id,'')), (coalesce(ref,'')), (coalesce(field,'')), state)
    do nothing;
    get diagnostics v_read = row_count;

    insert into attention_items (raised_by, kind, course_id, entity, ref, field, question, suggested)
    select p_sync_run_id, 'data_gap', f.course_id, 'bb_file', f.id::text, 'storage_path',
           format('%s: "%s" is in the catalog but its bytes were never stored, so it cannot be opened or searched.',
                  coalesce(f.course_id, f.bb_course_id), f.file_name),
           jsonb_build_object('source', 'stage_gaps', 'source_url', f.source_url)
      from bb_files f
     where f.storage_path is null and f.superseded_by is null
    on conflict (kind, (coalesce(course_id,'')), (coalesce(ref,'')), (coalesce(field,'')), state)
    do nothing;
    get diagnostics v_files = row_count;

    v_counts := jsonb_build_object(
      'courses_without_scheme', v_scheme,
      'assignments_without_date', v_dates,
      'readings_without_date',  v_read,
      'files_without_bytes',    v_files,
      'attention_raised',       v_scheme + v_dates + v_read + v_files);
  exception when others then
    v_status := 'failed';
    v_error  := left(sqlstate || ' ' || sqlerrm, 1000);
    v_counts := '{}'::jsonb;
  end;

  insert into sync_stage_runs (sync_run_id, stage, status, counts, started_at, finished_at, error)
  values (p_sync_run_id, 'gaps', v_status, v_counts, v_started, clock_timestamp(), v_error);

  return jsonb_build_object('stage','gaps','status',v_status,'counts',v_counts,'error',v_error);
end $$;

-- =============================================================================================
-- Privileges. These functions write facts, so anon must not reach them; the owner's session and
-- the service role may. postgres owns them and executes them as itself under pg_cron.
-- =============================================================================================
do $$
declare f text;
begin
  foreach f in array array[
    'bb_jarray(jsonb)', 'bb_slug(text)', 'bb_abs_url(text)', 'bb_assignment_type(text)',
    'bb_staff_role(text)', 'bb_date_in_term(timestamptz)', 'bb_resolve_course(text)',
    'raise_attention(bigint,text,text,text,text,text,jsonb,jsonb,text,jsonb)',
    'stage_courses(uuid,bigint)', 'stage_assignments(uuid,bigint)',
    'stage_announcements(uuid,bigint)', 'stage_files(uuid,bigint)', 'stage_gaps(uuid,bigint)']
  loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
end $$;

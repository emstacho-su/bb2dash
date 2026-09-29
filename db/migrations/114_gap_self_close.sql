-- bb2dash :: 114_gap_self_close.sql
-- Phase 17 (docs/planning/sprint-2/briefs/97_PHASE17_web_polish.md), T-07 (R-56, B-29).
-- Worker W-44. 041 and 054 are byte-frozen; `stage_gaps` and `attention_answered` are
-- re-created here with `create or replace` from their LIVE prod bodies (pg_get_functiondef,
-- read 2026-09-29), changed only where marked "114".
--
-- WHY. `stage_gaps` raises four kinds of Inbox question when a fact is missing: a course with no
-- grading scheme, an assignment with no date, a reading with no class date, a catalogued file
-- whose bytes were never stored. Nothing ever closed one when the fact arrived, so Stack had to
-- dismiss questions that had already answered themselves (27 of 31 storage_path gaps were
-- archived by hand through /inbox-apply by 2026-09-29).
--
-- WHAT.
--   * close_cleared_gaps(p_sync_run_id, p_trigger): every OPEN stage_gaps row whose condition no
--     longer holds is archived by the machine - state 'archived', archived_by 'stage_gaps',
--     decision {closed_itself: true, rule, sync_run_id, trigger}. This is a second, machine-only
--     way into `archived` beside archive_attention_item(), which still refuses open rows
--     (DECISIONS 2026-09-22, amended by B-29's row).
--     A key that already closed itself within the last 24 hours is NOT closed again: the row stays
--     open for Stack, flagged suggested.reopened_within_24h = true, and a flagged row is never
--     machine-closed later (the flag means "this hole keeps coming back; look at it once").
--     Returns {"closed": n, "flagged": m}, m counting rows newly flagged by this call.
--   * a statement trigger on bb_files UPDATE runs it, so a file whose bytes land by UPDATE
--     (bb-sync step 4b, Phase 18's scripted fetch) closes its gap at once, without a fold.
--   * stage_gaps calls it once, before its raises, and reports counts.gaps_closed.
--   * attention_answered ignores a machine-closed row, so a hole that reopens is asked again
--     (the PM's reading of B-29). A row Stack resolved or dismissed still counts, as in 041.
--
-- The four conditions (each also matches the row's kind, entity and field as stage_gaps raised it):
--   missing  / course     / grading_scheme  a grading_schemes row exists for the course (ref)
--   missing  / assignment / due_at          the assignment has due_at, due_date or event_start
--   data_gap / reading    / for_date        the reading has for_date
--   data_gap / bb_file    / storage_path    the file has storage_path, or has been superseded
-- A row whose referenced entity no longer exists is left open: that is not one of the four.

-- =============================================================================================
-- 1. close_cleared_gaps
-- =============================================================================================
create or replace function public.close_cleared_gaps(p_sync_run_id bigint, p_trigger text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_closed  integer := 0;
  v_flagged integer := 0;
begin
  if coalesce(btrim(p_trigger), '') = '' then
    raise exception 'close_cleared_gaps: p_trigger must name what ran it'
      using errcode = 'check_violation';
  end if;

  -- One statement: find the open stage_gaps rows whose condition has cleared (with the rule that
  -- cleared each, and whether the same key already closed itself in the last 24 hours), archive
  -- the others and flag the recent ones. The two updates touch disjoint rows.
  with cleared as (
    select ai.id, c.rule,
           exists (select 1 from attention_items prev
                    where prev.state = 'archived'
                      and prev.decision->>'closed_itself' = 'true'
                      and prev.archived_at > now() - interval '24 hours'
                      and prev.kind = ai.kind
                      and coalesce(prev.course_id, '') = coalesce(ai.course_id, '')
                      and coalesce(prev.ref, '')       = coalesce(ai.ref, '')
                      and coalesce(prev.field, '')     = coalesce(ai.field, '')) as recent
      from attention_items ai
      cross join lateral (
        select case
          when ai.kind = 'missing' and ai.entity = 'course' and ai.field = 'grading_scheme'
           and exists (select 1 from grading_schemes g where g.course_id = ai.ref)
            then 'grading_scheme_recorded'
          when ai.kind = 'missing' and ai.entity = 'assignment' and ai.field = 'due_at'
           and exists (select 1 from assignments a
                        where a.id = ai.ref
                          and (a.due_at is not null or a.due_date is not null or a.event_start is not null))
            then 'assignment_dated'
          when ai.kind = 'data_gap' and ai.entity = 'reading' and ai.field = 'for_date'
           and exists (select 1 from readings r where r.id::text = ai.ref and r.for_date is not null)
            then 'reading_dated'
          when ai.kind = 'data_gap' and ai.entity = 'bb_file' and ai.field = 'storage_path'
           and exists (select 1 from bb_files f
                        where f.id::text = ai.ref
                          and (f.storage_path is not null or f.superseded_by is not null))
            then 'file_stored_or_superseded'
        end as rule
      ) c
     where ai.state = 'open'
       and ai.suggested->>'source' = 'stage_gaps'
       and ai.suggested->>'reopened_within_24h' is distinct from 'true'
       and c.rule is not null
  ),
  closed as (
    update attention_items ai
       set state       = 'archived',
           archived_at = now(),
           archived_by = 'stage_gaps',
           decision    = jsonb_build_object('closed_itself', true,
                                            'rule',          g.rule,
                                            'sync_run_id',   p_sync_run_id,
                                            'trigger',       p_trigger)
      from cleared g
     where ai.id = g.id and not g.recent
    returning ai.id
  ),
  flagged as (
    update attention_items ai
       set suggested = coalesce(ai.suggested, '{}'::jsonb) || '{"reopened_within_24h": true}'::jsonb
      from cleared g
     where ai.id = g.id and g.recent
    returning ai.id
  )
  select (select count(*) from closed), (select count(*) from flagged)
    into v_closed, v_flagged;

  return jsonb_build_object('closed', v_closed, 'flagged', v_flagged);
end $$;

comment on function public.close_cleared_gaps(bigint, text) is
  'Gap self-close (114, B-29): archives every open stage_gaps attention row whose condition has '
  'cleared (grading scheme recorded | assignment dated | reading dated | file stored or '
  'superseded) with archived_by stage_gaps and decision {closed_itself, rule, sync_run_id, '
  'trigger}. A key that closed itself within 24 h stays open, flagged '
  'suggested.reopened_within_24h, and is never machine-closed after that. Returns {closed, '
  'flagged}. service_role only; called by stage_gaps and the bb_files update trigger.';

revoke all on function public.close_cleared_gaps(bigint, text) from public, anon, authenticated;
grant execute on function public.close_cleared_gaps(bigint, text) to service_role;

-- =============================================================================================
-- 2. The bb_files statement trigger
-- =============================================================================================
create or replace function public.bb_files_close_cleared_gaps()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.close_cleared_gaps(null, 'bb_files_update');
  return null;
end $$;

comment on function public.bb_files_close_cleared_gaps() is
  'Statement trigger function (114): after any UPDATE on bb_files, close_cleared_gaps(null, '
  '''bb_files_update''), so a file whose bytes land closes its storage_path gap at once.';

revoke all on function public.bb_files_close_cleared_gaps() from public, anon, authenticated;

drop trigger if exists bb_files_close_cleared_gaps_trg on public.bb_files;
create trigger bb_files_close_cleared_gaps_trg
  after update on public.bb_files
  for each statement execute function public.bb_files_close_cleared_gaps();

-- =============================================================================================
-- 3. stage_gaps: 054's live body, plus the close call before the raises and counts.gaps_closed
-- =============================================================================================
CREATE OR REPLACE FUNCTION public.stage_gaps(p_run_id uuid, p_sync_run_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_started timestamptz := clock_timestamp();
  v_status text := 'ok';
  v_error  text;
  v_counts jsonb := '{}'::jsonb;
  v_scheme int; v_dates int; v_read int; v_files int;
  v_closed jsonb;  -- 114
begin
  begin
    -- 114: close what has cleared before raising what is still missing (R-56, B-29).
    v_closed := close_cleared_gaps(p_sync_run_id, 'fold');

    insert into attention_items (raised_by, kind, course_id, entity, ref, field, question, suggested)
    select p_sync_run_id, 'missing', c.id, 'course', c.id, 'grading_scheme',
           format('%s has no grading scheme recorded, so nothing can forecast a grade for it. What is the grading method?', c.id),
           jsonb_build_object('source', 'stage_gaps')
      from courses c
     where not exists (select 1 from grading_schemes g where g.course_id = c.id)
       and not attention_answered('missing', c.id, c.id, 'grading_scheme')
    on conflict (kind, (coalesce(course_id,'')), (coalesce(ref,'')), (coalesce(field,'')))
      where state = 'open'
    do nothing;
    get diagnostics v_scheme = row_count;

    insert into attention_items (raised_by, kind, course_id, entity, ref, field, question, suggested)
    select p_sync_run_id, 'missing', a.course_id, 'assignment', a.id, 'due_at',
           format('%s: "%s" has no date at all - not in the syllabus, not in Blackboard. When is it due?',
                  a.course_id, a.title),
           jsonb_build_object('source', 'stage_gaps', 'type', a.type)
      from assignments a
     where a.due_at is null and a.due_date is null and a.event_start is null
       and not attention_answered('missing', a.course_id, a.id, 'due_at')
    on conflict (kind, (coalesce(course_id,'')), (coalesce(ref,'')), (coalesce(field,'')))
      where state = 'open'
    do nothing;
    get diagnostics v_dates = row_count;

    insert into attention_items (raised_by, kind, course_id, entity, ref, field, question, suggested)
    select p_sync_run_id, 'data_gap', r.course_id, 'reading', r.id::text, 'for_date',
           format('%s: the reading "%s" is not tied to a class date, so it cannot appear in the tracker.',
                  r.course_id, left(r.citation, 120)),
           jsonb_build_object('source', 'stage_gaps')
      from readings r
     where r.for_date is null
       and not attention_answered('data_gap', r.course_id, r.id::text, 'for_date')
    on conflict (kind, (coalesce(course_id,'')), (coalesce(ref,'')), (coalesce(field,'')))
      where state = 'open'
    do nothing;
    get diagnostics v_read = row_count;

    insert into attention_items (raised_by, kind, course_id, entity, ref, field, question, suggested)
    select p_sync_run_id, 'data_gap', f.course_id, 'bb_file', f.id::text, 'storage_path',
           format('%s: "%s" is in the catalog but its bytes were never stored, so it cannot be opened or searched.',
                  coalesce(f.course_id, f.bb_course_id), f.file_name),
           jsonb_build_object('source', 'stage_gaps', 'source_url', f.source_url)
      from bb_files f
     where f.storage_path is null and f.superseded_by is null
       -- Phase 10a (R2-4): a pulled-back submission file is catalogued with no bytes ON PURPOSE,
       -- by stage_attempts, moments before this stage runs in the same transaction. bb-sync step
       -- 4b downloads it seconds later and nothing here would ever clear the item, so raising one
       -- puts a permanent question in the Inbox about a state that resolves itself. Step 4b
       -- reports the files it genuinely could not pull instead. A file Stack STAGED has a null
       -- attempt_id and is not excluded: if its bytes go missing, the gap is the right signal.
       and not (f.bucket = 'my_submissions' and f.attempt_id is not null)
       and not attention_answered('data_gap', f.course_id, f.id::text, 'storage_path')
    on conflict (kind, (coalesce(course_id,'')), (coalesce(ref,'')), (coalesce(field,'')))
      where state = 'open'
    do nothing;
    get diagnostics v_files = row_count;

    v_counts := jsonb_build_object(
      'courses_without_scheme', v_scheme,
      'assignments_without_date', v_dates,
      'readings_without_date',  v_read,
      'files_without_bytes',    v_files,
      'attention_raised',       v_scheme + v_dates + v_read + v_files,
      'gaps_closed',            coalesce((v_closed->>'closed')::int, 0));  -- 114
  exception when others then
    v_status := 'failed';
    v_error  := left(sqlstate || ' ' || sqlerrm, 1000);
    v_counts := '{}'::jsonb;
  end;

  insert into sync_stage_runs (sync_run_id, stage, status, counts, started_at, finished_at, error)
  values (p_sync_run_id, 'gaps', v_status, v_counts, v_started, clock_timestamp(), v_error);

  return jsonb_build_object('stage','gaps','status',v_status,'counts',v_counts,'error',v_error);
end $function$;

revoke all on function public.stage_gaps(uuid,bigint) from public, anon, authenticated;
grant execute on function public.stage_gaps(uuid,bigint) to service_role;

-- =============================================================================================
-- 4. attention_answered: 041's live body, plus the machine-closed carve-out
-- =============================================================================================
CREATE OR REPLACE FUNCTION public.attention_answered(p_kind text, p_course_id text, p_ref text, p_field text)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select exists (
    select 1 from attention_items ai
     where ai.state <> 'open'
       and ai.kind = p_kind
       and coalesce(ai.course_id,'') = coalesce(p_course_id,'')
       and coalesce(ai.ref,'')       = coalesce(p_ref,'')
       and coalesce(ai.field,'')     = coalesce(p_field,'')
       -- 114: a row the machine closed (close_cleared_gaps) is not an answer, so a hole that
       -- reopens is asked again (B-29). `is not distinct from`, not `=`: a row archived by
       -- /inbox-apply has no closed_itself key, and `null = 'true'` would make the whole
       -- conjunct null and drop every such answer.
       and not (ai.state = 'archived' and ai.decision->>'closed_itself' is not distinct from 'true'))
$function$;

revoke all on function public.attention_answered(text, text, text, text) from public, anon, authenticated;
grant execute on function public.attention_answered(text, text, text, text) to service_role;

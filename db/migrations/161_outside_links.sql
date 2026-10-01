-- bb2dash :: 161_outside_links.sql
-- fix/sync-file-pull-chrome, T2 (Stack, 2026-10-01: "Mark as outside links"). Phase 18 overflow
-- block (160-169). Additive: one new function; stage_gaps and close_cleared_gaps are re-created
-- from 114's bodies (equal to prod's live bodies, read 2026-10-01), changed only where marked "161".
--
-- WHY. bb_files 738-746 (ECN.304 readings) were catalogued by a tutoring session from outside
-- sites (cbo.gov, newyorkfed.org, sec.gov, ...). Their text is in bb_file_text and they will never
-- have Storage bytes, yet they sat in bb-sync step 4b's pull manifest, in its files_not_pulled
-- count, and as open Inbox data_gaps ("its bytes were never stored").
--
-- WHAT.
--   * bb_file_is_outside_link(source_url): true for an http(s) URL whose host is not Blackboard's
--     (blackboard.syracuse.edu or a subdomain). Null, '', local:// paths and every Blackboard URL
--     are false. Immutable, search_path pinned. The one place the rule lives: the step 4b
--     manifests (skills/bb-sync/SKILL.md) and the web label call the same rule.
--     Note the rule is "not on Blackboard", not "not bbcswebdav": a Blackboard URL of another
--     shape (a session URL, an attempt download) is a Blackboard file still owed its bytes, and a
--     local:// row (Stack's or an agent's local copy) is not a link at all.
--   * stage_gaps raises no storage_path gap for an outside link.
--   * close_cleared_gaps closes an open storage_path gap on an outside link (rule 'outside_link').
--   * One call to close_cleared_gaps at the end closes the gaps already open on 738-746 now,
--     rather than at the next fold; it is the same call any bb_files UPDATE already makes.

-- =============================================================================================
-- 1. bb_file_is_outside_link
-- =============================================================================================
create or replace function public.bb_file_is_outside_link(p_source_url text)
returns boolean
language sql
immutable
parallel safe
set search_path = pg_catalog, pg_temp
as $$
  select coalesce(p_source_url ~* '^https?://', false)
     and not coalesce(p_source_url ~* '^https?://([a-z0-9-]+\.)*blackboard\.syracuse\.edu(:[0-9]+)?(/|$)', false)
$$;

comment on function public.bb_file_is_outside_link(text) is
  'Outside link (161): true when a bb_files.source_url is an http(s) URL off the Blackboard host. '
  'Such a row has no Blackboard bytes to pull: it is left out of the bb-sync step 4b manifests, '
  'raises no storage_path gap, and reads "Outside link" in the web app.';

grant execute on function public.bb_file_is_outside_link(text) to anon, authenticated, service_role, db_test_runner;

-- =============================================================================================
-- 2. close_cleared_gaps: 114's body plus the outside_link rule
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
          -- 161: an outside link never gets Storage bytes; its text is all there is to hold.
          when ai.kind = 'data_gap' and ai.entity = 'bb_file' and ai.field = 'storage_path'
           and exists (select 1 from bb_files f
                        where f.id::text = ai.ref
                          and bb_file_is_outside_link(f.source_url))
            then 'outside_link'
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
  'superseded | outside link (161)) with archived_by stage_gaps and decision {closed_itself, rule, sync_run_id, '
  'trigger}. A key that closed itself within 24 h stays open, flagged '
  'suggested.reopened_within_24h, and is never machine-closed after that. Returns {closed, '
  'flagged}. service_role only; called by stage_gaps and the bb_files update trigger.';

revoke all on function public.close_cleared_gaps(bigint, text) from public, anon, authenticated;
grant execute on function public.close_cleared_gaps(bigint, text) to service_role;

-- =============================================================================================
-- 3. stage_gaps: 114's body plus the outside-link exclusion
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
       -- 161: an outside link (cbo.gov, sec.gov, ...) has no Blackboard bytes to store.
       and not bb_file_is_outside_link(f.source_url)
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
-- 4. Close the gaps already open on outside links (738-746 on 2026-10-01)
-- =============================================================================================
select public.close_cleared_gaps(null, 'migration 161');

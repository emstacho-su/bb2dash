-- bb2dash :: 054_stage_gaps_skip_submissions.sql
-- Phase 10a round 2, finding R2-4. See docs/planning/67_PHASE10A_grades.md § "Round 2".
--
-- THE BUG. `stage_gaps` raises a `data_gap` for every `bb_files` row whose bytes were never
-- stored: "X is in the catalog but its bytes were never stored, so it cannot be opened or
-- searched." That is exactly right for a course file, whose bytes only ever arrive through a
-- manual pull that nobody has scheduled — the Inbox item is how Stack finds out one is waiting.
--
-- It is exactly wrong for a submission file. `stage_attempts` catalogues those with a null
-- `storage_path` by design, and `stage_gaps` runs LAST in the same `run_transform` transaction —
-- so every pulled-back file raised an Inbox item in the same breath that created it, before
-- bb-sync step 4b had had a chance to download anything. Worse, nothing clears it: the gap is
-- raised once and stays open until Stack dismisses it by hand (Phase 9's rule — a gap whose
-- condition stops holding is never auto-dismissed). One sync with four submitted files would have
-- put four permanent items in his Inbox describing a state that resolved itself a minute later.
--
-- THE FIX. Exclude `bucket = 'my_submissions' and attempt_id is not null` from that one insert.
-- Both halves of the predicate matter: `attempt_id is not null` is what makes it a PULLED-BACK
-- file, the kind step 4b is responsible for. A file Stack STAGED in the drop zone has a null
-- `attempt_id`, and if its bytes somehow went missing the gap is still the right signal.
--
-- WHERE THE REPORTING GOES INSTEAD. `skills/bb-sync/SKILL.md` step 4b now names every row it could
-- not pull, with the reason, in its summary line — the same sync that would have raised the gap
-- reports the real failure, in Stack's words, instead of an Inbox item about a transient state.
--
-- Built from the LIVE definition (`select pg_get_functiondef('public.stage_gaps(uuid,bigint)'
-- ::regprocedure)`, read 2026-09-15), which was 041's — including `attention_answered()` and the
-- partial ON CONFLICT target that 041 introduced. The only difference below is the added
-- predicate and its comment.

create or replace function stage_gaps(p_run_id uuid, p_sync_run_id bigint) returns jsonb
  language plpgsql security definer set search_path = public, pg_temp as $function$
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
      'attention_raised',       v_scheme + v_dates + v_read + v_files);
  exception when others then
    v_status := 'failed';
    v_error  := left(sqlstate || ' ' || sqlerrm, 1000);
    v_counts := '{}'::jsonb;
  end;

  insert into sync_stage_runs (sync_run_id, stage, status, counts, started_at, finished_at, error)
  values (p_sync_run_id, 'gaps', v_status, v_counts, v_started, clock_timestamp(), v_error);

  return jsonb_build_object('stage','gaps','status',v_status,'counts',v_counts,'error',v_error);
end $function$;

-- Privileges are preserved by `create or replace`; re-asserted to match 038 exactly.
revoke all on function public.stage_gaps(uuid,bigint) from public, anon, authenticated;
grant execute on function public.stage_gaps(uuid,bigint) to service_role;

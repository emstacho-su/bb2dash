-- bb2dash :: 041_attention_dedupe_open_only.sql
-- Phase 9, round 2 (code-review findings F1 and F3-raise). Numbers 041-045 were allocated by the
-- PM for this round; 001-040 are applied and byte-frozen, so everything here is a drop+create of
-- an index or a `create or replace` of a function.
--
-- ---------------------------------------------------------------------------------------------
-- F1. The dedupe key made the SECOND answer to a recurring question fail
-- ---------------------------------------------------------------------------------------------
-- Migration 031 put `state` in a FULL unique index:
--   (kind, coalesce(course_id,''), coalesce(ref,''), coalesce(field,''), state)
-- so at most one row per key per state. The intent was "a conflict that recurs after being
-- resolved can be raised again" - and that first re-raise works, because the resolved row and
-- the new open row differ in `state`. The second resolution does not: the Inbox's
--   update attention_items set state = 'resolved' ... where id = <the new row>
-- would produce a second (key, 'resolved') row, which the index refuses with 23505. The update
-- fails, the Inbox shows an error, and the question can never be answered twice.
-- 031's own verification note called this out as a known limitation; it is a bug, and this is it:
--
--   raise -> resolve -> Blackboard changes its mind -> raise -> resolve  =>  duplicate key value
--   violates unique constraint "attention_items_dedupe_idx"
--
-- Fix: the index only has a job to do while a row is OPEN. Deduping is about not stacking three
-- copies of the same unanswered question; answered rows are history and history repeats. So the
-- index becomes PARTIAL - unique over the key `where state = 'open'` - and `state` drops out of
-- the column list because it is now constant across every indexed row.
--
-- Everything that targets the index by expression list must change with it, in this migration,
-- or the next transform fails on an ON CONFLICT clause that no longer infers an index:
-- raise_attention() and stage_gaps() (031's seed inserts are one-off and already applied).
--
-- ---------------------------------------------------------------------------------------------
-- F3 (raise side). Dismissed and answered gaps came back as fresh open rows
-- ---------------------------------------------------------------------------------------------
-- With the partial index, "do not stack duplicates" only holds among open rows - which is
-- correct, and which exposes the second half of F3: once Stack dismisses or answers a
-- 'missing' / 'data_gap' item, the next fold finds the same hole in the data (dismissing a
-- question does not fill it) and raises a brand-new open row. The Inbox would refill itself
-- every two minutes with questions Stack has already closed.
--
-- Fix: for 'missing' and 'data_gap' - the two kinds that are re-derived from the typed tables on
-- every fold - a key that already carries ANY non-open row is not raised again. Dismissed means
-- "stop asking". Resolved means Stack gave an answer; if nothing could apply it (see 042) the
-- answer is still on the row and re-asking adds nothing.
--
-- 'conflict' and 'stack_must_confirm' are NOT covered by that rule: a conflict is a live
-- disagreement with Blackboard and must come back if Blackboard's value changes. What must not
-- come back is a conflict Stack settled with "Keep mine" while Blackboard has not moved -
-- attention_keep_stands() below, used by raise_attention and by 042's stage_assignments.

-- ---------------------------------------------------------------------------------------------
-- 1. The index
-- ---------------------------------------------------------------------------------------------
drop index if exists attention_items_dedupe_idx;

create unique index attention_items_open_dedupe_idx on attention_items
  (kind, (coalesce(course_id,'')), (coalesce(ref,'')), (coalesce(field,'')))
  where state = 'open';

-- The lookup the two helpers below do on every raise: "has this key ever been closed?". Partial
-- on the complement of the index above, so between them they cover the table once.
create index attention_items_answered_idx on attention_items
  (kind, (coalesce(course_id,'')), (coalesce(ref,'')), (coalesce(field,'')))
  where state <> 'open';

comment on index attention_items_open_dedupe_idx is
  'One OPEN row per (kind, course, ref, field). Partial on purpose: answered and dismissed rows '
  'are history, and the same question may be asked - and answered - more than once. A full '
  'index including state (031) made the second resolution of a recurring question fail with '
  '23505.';

comment on column attention_items.state is
  'open -> resolved | dismissed. Only OPEN rows are deduped (attention_items_open_dedupe_idx), '
  'so a question can be raised and answered any number of times. What stops a closed question '
  'coming straight back is raise_attention: answered missing/data_gap keys are not re-raised at '
  'all, and a conflict settled with "Keep mine" is not re-raised while Blackboard''s value is '
  'unchanged.';

-- ---------------------------------------------------------------------------------------------
-- 2. Helpers
-- ---------------------------------------------------------------------------------------------
-- Not security definer: both are only ever called from inside a security definer transform
-- function, whose body already runs as the table owner. Execute is revoked from the browser
-- roles at the end of this file all the same.

create or replace function attention_answered(
  p_kind text, p_course_id text, p_ref text, p_field text
) returns boolean
  language sql stable set search_path = public, pg_temp as $$
  select exists (
    select 1 from attention_items ai
     where ai.state <> 'open'
       and ai.kind = p_kind
       and coalesce(ai.course_id,'') = coalesce(p_course_id,'')
       and coalesce(ai.ref,'')       = coalesce(p_ref,'')
       and coalesce(ai.field,'')     = coalesce(p_field,''))
$$;

comment on function attention_answered(text,text,text,text) is
  'Has this question already been closed - answered or dismissed - at least once? Used to stop '
  'stage_gaps re-raising a hole Stack has already dealt with. Only meaningful for kinds that '
  'are re-derived from the typed tables on every fold (missing, data_gap).';

create or replace function attention_keep_stands(
  p_course_id text, p_ref text, p_field text, p_to jsonb
) returns boolean
  language sql stable set search_path = public, pg_temp as $$
  select exists (
    select 1 from attention_items ai
     where ai.state = 'resolved'
       and ai.kind  = 'conflict'
       and ai.resolution->>'accept' = 'keep'
       and ai.to_value is not distinct from p_to
       and coalesce(ai.course_id,'') = coalesce(p_course_id,'')
       and coalesce(ai.ref,'')       = coalesce(p_ref,'')
       and coalesce(ai.field,'')     = coalesce(p_field,''))
$$;

comment on function attention_keep_stands(text,text,text,jsonb) is
  'Did Stack already settle this exact disagreement with "Keep mine"? True only when a resolved '
  'conflict exists for the same (course, ref, field) AND Blackboard is still saying the same '
  'thing (to_value unchanged). A different value from Blackboard is a new disagreement and is '
  'raised again. Comparison is jsonb equality on the value the transform stored, so it is exact.';

-- ---------------------------------------------------------------------------------------------
-- 3. raise_attention - new conflict target, plus the two do-not-re-ask rules
-- ---------------------------------------------------------------------------------------------
create or replace function raise_attention(
  p_sync_run_id bigint, p_kind text, p_course_id text, p_entity text, p_ref text,
  p_field text, p_from jsonb, p_to jsonb, p_question text, p_suggested jsonb
) returns boolean
  language plpgsql security definer set search_path = public, pg_temp as $$
declare v_new boolean;
begin
  -- A hole Stack has already dismissed or answered is not a new question.
  if p_kind in ('missing','data_gap')
     and attention_answered(p_kind, p_course_id, p_ref, p_field) then
    return false;
  end if;

  -- A disagreement Stack settled with "Keep mine", where Blackboard has not since changed its
  -- answer, is settled. If Blackboard's value moves, p_to differs and the conflict is raised.
  if p_kind = 'conflict' and attention_keep_stands(p_course_id, p_ref, p_field, p_to) then
    return false;
  end if;

  insert into attention_items
    (raised_by, kind, course_id, entity, ref, field, from_value, to_value, question, suggested)
  values
    (p_sync_run_id, p_kind, p_course_id, p_entity, p_ref, p_field, p_from, p_to, p_question, p_suggested)
  on conflict (kind, (coalesce(course_id,'')), (coalesce(ref,'')), (coalesce(field,'')))
    where state = 'open'
  do update set from_value = excluded.from_value,
                to_value   = excluded.to_value,
                question   = excluded.question,
                suggested  = excluded.suggested,
                raised_by  = excluded.raised_by
  returning (xmax = 0) into v_new;
  return coalesce(v_new, false);
end $$;

comment on function raise_attention(bigint,text,text,text,text,text,jsonb,jsonb,text,jsonb) is
  'Insert-or-refresh one OPEN attention_items row against attention_items_open_dedupe_idx. '
  'Returns true only for a genuinely new question, which is what sync_runs.summary.'
  'attention_raised counts. Two questions are never re-asked: a missing/data_gap key that '
  'already has a closed row (attention_answered), and a conflict settled with "Keep mine" whose '
  'to_value Blackboard has not changed (attention_keep_stands). Both return false.';

-- ---------------------------------------------------------------------------------------------
-- 4. stage_gaps - same body as 034, with the new conflict target and the do-not-re-raise rule
-- ---------------------------------------------------------------------------------------------
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
end $$;

comment on function stage_gaps(uuid,bigint) is
  'Raises the holes in the typed tables: courses with no grading scheme, assignments with no '
  'date, readings with no for_date, catalogued files with no bytes. Each key is raised at most '
  'once while it is open, and never again once Stack has dismissed or answered it - dismissing '
  'a gap does not fill it, so without that rule every fold would refill the Inbox with '
  'questions he has already closed. The counts report rows actually inserted.';

-- ---------------------------------------------------------------------------------------------
-- 5. Privileges. create or replace keeps the existing ACL, but the two new functions have none
--    yet and 038's rule is worth restating rather than inferring: nothing here is callable from
--    a browser. The transform's own calls need no grant - a security definer body runs as its
--    owner, which owns these too.
-- ---------------------------------------------------------------------------------------------
do $$
declare f text;
begin
  foreach f in array array[
    'attention_answered(text,text,text,text)',
    'attention_keep_stands(text,text,text,jsonb)',
    'raise_attention(bigint,text,text,text,text,text,jsonb,jsonb,text,jsonb)',
    'stage_gaps(uuid,bigint)']
  loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;

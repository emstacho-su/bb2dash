-- bb2dash :: 163_session_link_archived_answers.sql
-- Code review of 162 (2026-10-02), two findings in link_file_sessions. 162's body, two changes.
--
-- 1. An answer /inbox-apply has archived is still Stack's answer. Step c (123) read only state
--    'resolved' and 'dismissed', and /inbox-apply archives every answered row. So an answer given
--    and archived before the fold that would apply it was lost: a pick was never applied and the
--    question came back; and since 162 a "none" on a numbered lecture was linked by rule with no
--    question at all. Step c now also reads 'archived' rows, except the ones that closed
--    themselves (decision.closed_itself, written by this function since 162): those were never
--    answered. The rest of step c is unchanged: the answer counts only while the week's session
--    list is still the one Stack was shown, a pick is applied, anything else leaves the file
--    unlinked and quiet.
--    (docs/inbox-decisions/2026-10-01.md worked round this by archiving after the fold; that
--    order is no longer needed for session links.)
-- 2. The number-order rule (162 d2) checked only links already written, so its outcome hung on
--    file id order: a lower-id lecture could be linked by rank before its sibling took an answer
--    from Stack that breaks the order. The guard now also reads a sibling's answer that is not
--    applied yet.
--
-- No backfill and no data change: every session_link answer on prod is already applied.

create or replace function public.link_file_sessions(p_sync_run_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  SESSION_VIA_READING    constant numeric := 1.0;   -- PM's constant (brief 98 open item 5)
  SESSION_VIA_WEEK       constant numeric := 0.8;   -- PM's constant (brief 98 open item 5)
  SESSION_VIA_LECTURE_NO constant numeric := 0.8;   -- 162: as sure as the week's only session
  v_examined  int := 0;
  v_weeks     int := 0;
  v_linked    int := 0;
  v_ambiguous int := 0;
  v_raised    int := 0;
  v_by_lecture int := 0;
  v_closed    int := 0;
  f           record;
  v_ids       bigint[];
  v_answer    record;
  v_pick      bigint;
  v_lecture   smallint;
  v_lec_ids   bigint[];     -- the week's sessions a lecture may take, in date order
  v_lec_nos   smallint[];   -- the week's distinct lecture numbers, ascending
  v_rule      text;
  v_n         int;
begin
  -- 1. Weeks.
  update bb_files bf
     set week_no = w.wk,
         notes   = btrim(coalesce(bf.notes || ' | ', '') ||
                   format('week_no %s set by link_file_sessions (file_week_no)', w.wk))
    from (select x.id, file_week_no(x.course_id, x.path, x.file_name) as wk
            from bb_files x
           where x.superseded_by is null
             and x.classified_by is distinct from 'stack'
             and x.bucket <> 'my_submissions'
             and x.week_no is null) w
   where bf.id = w.id
     and w.wk is not null;
  get diagnostics v_weeks = row_count;

  -- 2. Sessions.
  for f in
    select bf.id, bf.course_id, bf.path, bf.file_name, bf.week_no, bf.reading_id
      from bb_files bf
     where bf.superseded_by is null
       and bf.classified_by is distinct from 'stack'
       and bf.bucket <> 'my_submissions'
       and bf.session_id is null
       and bf.course_id is not null
       and (bf.reading_id is not null or bf.week_no is not null)
     order by bf.id
  loop
    v_examined := v_examined + 1;

    -- a. The reading's date.
    select array_agg(s.id order by s.id) into v_ids
      from readings r
      join sessions s on s.course_id = f.course_id and s.session_date = r.for_date
     where r.id = f.reading_id
       and s.kind <> 'no_class';
    if cardinality(v_ids) = 1 then
      update bb_files
         set session_id      = v_ids[1],
             link_confidence = coalesce(link_confidence, SESSION_VIA_READING),
             notes           = btrim(coalesce(notes || ' | ', '') ||
                               format('session_id %s linked by link_file_sessions (reading %s''s date, confidence %s)',
                                      v_ids[1], f.reading_id, SESSION_VIA_READING))
       where id = f.id and session_id is null;
      v_linked := v_linked + 1;
      continue;
    end if;

    continue when f.week_no is null;

    -- b. The week's sessions.
    select array_agg(s.id order by s.id) into v_ids
      from sessions s
     where s.course_id = f.course_id
       and s.week_no = f.week_no
       and s.kind <> 'no_class';
    continue when v_ids is null;

    if cardinality(v_ids) = 1 then
      update bb_files
         set session_id      = v_ids[1],
             link_confidence = coalesce(link_confidence, SESSION_VIA_WEEK),
             notes           = btrim(coalesce(notes || ' | ', '') ||
                               format('session_id %s linked by link_file_sessions (only session of week %s, confidence %s)',
                                      v_ids[1], f.week_no, SESSION_VIA_WEEK))
       where id = f.id and session_id is null;
      v_linked := v_linked + 1;
      continue;
    end if;

    -- c. Several sessions. Settled already? (086's pattern.) An answer /inbox-apply has archived
    --    is still Stack's answer (163); a question that closed itself is not one.
    select ai.state, ai.resolution, ai.to_value
      into v_answer
      from attention_items ai
     where ai.kind = 'stack_must_confirm'
       and ai.entity = 'bb_file'
       and ai.ref = 'session_link/' || f.id::text
       and ai.field = 'session_id'
       and (ai.state in ('resolved', 'dismissed')
            or (ai.state = 'archived' and ai.decision->>'closed_itself' is distinct from 'true'))
     order by coalesce(ai.resolved_at, ai.raised_at) desc, ai.id desc
     limit 1;

    if found and v_answer.to_value is not distinct from to_jsonb(v_ids) then
      v_pick := null;
      begin
        v_pick := nullif(v_answer.resolution->>'session_id', '')::bigint;
      exception when others then
        v_pick := null;
      end;
      if v_pick is not null and v_pick = any (v_ids) then
        update bb_files
           set session_id = v_pick,
               notes      = btrim(coalesce(notes || ' | ', '') ||
                            format('session_id %s set from Stack''s Inbox answer (123)', v_pick))
         where id = f.id and session_id is null;
        v_linked := v_linked + 1;
      end if;
      continue;
    end if;

    -- d. A numbered lecture (162).
    v_lecture := file_lecture_no(f.path, f.file_name);
    v_pick := null;
    v_rule := null;
    if v_lecture is not null then
      select array_agg(s.id order by s.session_date, s.id) into v_lec_ids
        from sessions s
       where s.course_id = f.course_id
         and s.week_no = f.week_no
         and s.kind not in ('no_class', 'exam');

      if cardinality(v_lec_ids) = 1 then
        -- d1. Skip exams.
        v_pick := v_lec_ids[1];
        v_rule := format('the only session of week %s that is not an exam', f.week_no);
      elsif cardinality(v_lec_ids) > 1 then
        -- d2. Number order.
        select array_agg(n order by n) into v_lec_nos
          from (select distinct file_lecture_no(x.path, x.file_name) as n
                  from bb_files x
                 where x.course_id = f.course_id
                   and x.week_no = f.week_no
                   and x.superseded_by is null
                   and x.bucket <> 'my_submissions') d
         where n is not null;

        if cardinality(v_lec_nos) = cardinality(v_lec_ids)
           and not exists (
             select 1
               from bb_files x
              where x.course_id = f.course_id
                and x.week_no = f.week_no
                and x.superseded_by is null
                and x.bucket <> 'my_submissions'
                and x.session_id is not null
                and file_lecture_no(x.path, x.file_name) is not null
                and x.session_id <> v_lec_ids[array_position(v_lec_nos, file_lecture_no(x.path, x.file_name))])
           -- 163: nor a sibling whose answer from Stack, not applied yet, names another session.
           and not exists (
             select 1
               from bb_files x
               join attention_items ai
                 on ai.kind = 'stack_must_confirm'
                and ai.entity = 'bb_file'
                and ai.ref = 'session_link/' || x.id::text
                and ai.field = 'session_id'
                and (ai.state in ('resolved', 'dismissed')
                     or (ai.state = 'archived' and ai.decision->>'closed_itself' is distinct from 'true'))
              where x.course_id = f.course_id
                and x.week_no = f.week_no
                and x.superseded_by is null
                and x.bucket <> 'my_submissions'
                and x.session_id is null
                and x.id <> f.id
                and file_lecture_no(x.path, x.file_name) is not null
                and nullif(ai.resolution->>'session_id', '') is not null
                and ai.resolution->>'session_id'
                    <> v_lec_ids[array_position(v_lec_nos, file_lecture_no(x.path, x.file_name))]::text)
        then
          v_pick := v_lec_ids[array_position(v_lec_nos, v_lecture)];
          v_rule := format('lecture %s of %s in week %s, in number order',
                           array_position(v_lec_nos, v_lecture), cardinality(v_lec_nos), f.week_no);
        end if;
      end if;
    end if;

    if v_pick is not null then
      update bb_files
         set session_id      = v_pick,
             link_confidence = coalesce(link_confidence, SESSION_VIA_LECTURE_NO),
             notes           = btrim(coalesce(notes || ' | ', '') ||
                               format('session_id %s linked by link_file_sessions (%s, confidence %s)',
                                      v_pick, v_rule, SESSION_VIA_LECTURE_NO))
       where id = f.id and session_id is null;
      v_linked := v_linked + 1;
      v_by_lecture := v_by_lecture + 1;

      -- The question raised while this lecture could not be placed has cleared.
      update attention_items ai
         set state       = 'archived',
             archived_at = now(),
             archived_by = 'link_file_sessions',
             decision    = jsonb_build_object('closed_itself', true,
                                              'rule',          'lecture_number',
                                              'session_id',    v_pick,
                                              'sync_run_id',   p_sync_run_id)
       where ai.kind = 'stack_must_confirm'
         and ai.entity = 'bb_file'
         and ai.ref = 'session_link/' || f.id::text
         and ai.field = 'session_id'
         and ai.state = 'open';
      get diagnostics v_n = row_count;
      v_closed := v_closed + v_n;
      continue;
    end if;

    v_ambiguous := v_ambiguous + 1;
    if raise_attention(p_sync_run_id, 'stack_must_confirm', f.course_id, 'bb_file',
         'session_link/' || f.id::text, 'session_id', null, to_jsonb(v_ids),
         format('%s: the file "%s" belongs to week %s, which has %s class sessions. Which session is it for?',
                f.course_id, f.file_name, f.week_no, cardinality(v_ids)),
         jsonb_build_object('source', 'link_file_sessions', 'file_id', f.id, 'week_no', f.week_no,
                            'candidates', to_jsonb(v_ids),
                            'answer_with', '{"session_id": <one of candidates>} or {"accept": "none"}'))
    then
      v_raised := v_raised + 1;
    end if;
  end loop;

  return jsonb_build_object('files_examined', v_examined, 'weeks_set', v_weeks,
                            'sessions_linked', v_linked, 'ambiguous', v_ambiguous,
                            'attention_raised', v_raised,
                            'linked_by_lecture_no', v_by_lecture,
                            'questions_closed', v_closed);
end
$function$;

revoke all on function public.link_file_sessions(bigint) from public, anon, authenticated;
grant execute on function public.link_file_sessions(bigint) to service_role, db_test_runner;

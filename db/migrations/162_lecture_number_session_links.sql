-- bb2dash :: 162_lecture_number_session_links.sql
-- Stack's Inbox note on item 906 (2026-10-01): "for any class, if there is "Lecture_<number>", we
-- should be able to look at the chronology of the other items for that week to determine which
-- session it belongs to." Scoped on 2026-10-02 (DECISIONS) to the two rules his 11 answers of
-- 2026-10-01 bear out; both match every answer they cover (IST.323 lectures 4, 5 and 6).
--
-- file_lecture_no(path, file_name): the number after "Lecture" ("Lecture_1", "Lecture2",
-- "Lecture#4", "Lecture #6"), read from the file name first and the path second. Null when
-- neither names one ("LectureM3_IST466" is a section tag, not a lecture number).
--
-- link_file_sessions(p_sync_run_id): 123's body, with one step added for a file that carries a
-- lecture number and whose week holds several sessions. It runs AFTER Stack's own answer (123's
-- step c), so an answer always wins, and before the question is raised:
--   d1. Skip exams. Lecture slides are never for an exam session. When the week's sessions other
--       than 'no_class' and 'exam' come to exactly one, that is the session.
--   d2. Number order. When the week's current files carry as many distinct lecture numbers as the
--       week has such sessions, the lectures take the sessions in order: the lowest number the
--       earliest date. If a sibling is already linked to a session other than the one its rank
--       gives it (Stack answered otherwise, or a reading's date did), the order does not hold for
--       this week and nothing is linked: the question is raised as before.
--   A lone numbered lecture in a week of two sessions is NOT derivable (Stack put lecture 1 on the
--   first session of its week and lecture 2 on the second), so it still asks.
--   Both rules write link_confidence SESSION_VIA_LECTURE_NO where it is null, and a note naming
--   the rule.
--   A question this function raised earlier for the file (the lecture was alone in its week then)
--   closes itself when a rule links the file, the way close_cleared_gaps closes a gap whose
--   condition cleared: archived, archived_by 'link_file_sessions', decision.closed_itself true.
--   Nothing Stack answered is touched: only state 'open' rows.
--   The question's to_value stays the week's full session list (123's), so answers keep matching.
-- The returned counts gain linked_by_lecture_no and questions_closed; sessions_linked includes
-- the rule's links.
--
-- No backfill: every file the rules would reach is already linked (Stack's answers, sync run 485).

create or replace function public.file_lecture_no(p_path text, p_file_name text)
returns smallint
language sql
immutable
set search_path = public, pg_temp
as $function$
  select coalesce(substring(p_file_name from '(?i)\mlecture[\s_#-]*(\d{1,3})(?!\d)'),
                  substring(p_path      from '(?i)\mlecture[\s_#-]*(\d{1,3})(?!\d)'))::smallint
$function$;

revoke all on function public.file_lecture_no(text, text) from public, anon;
grant execute on function public.file_lecture_no(text, text) to authenticated, service_role, db_test_runner;

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

    -- c. Several sessions. Settled already? (086's pattern.)
    select ai.state, ai.resolution, ai.to_value
      into v_answer
      from attention_items ai
     where ai.kind = 'stack_must_confirm'
       and ai.entity = 'bb_file'
       and ai.ref = 'session_link/' || f.id::text
       and ai.field = 'session_id'
       and ai.state in ('resolved', 'dismissed')
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

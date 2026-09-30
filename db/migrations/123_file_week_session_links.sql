-- bb2dash :: 123_file_week_session_links.sql
-- Phase 18 (brief 98, Contract row 123 and rule "Week and session (123)"; task 10; R-67, B-35).
-- Worker W-48.
--
-- Week and session links on files were written once at seed time (005), and stage_files never
-- writes either column, so the course timeline prints "no files" on almost every session. This
-- migration adds the rule and backfills it; migration 124 runs it inside stage_files on every
-- fold.
--
-- file_week_no(course_id, path, file_name): the per-course week rules drafted from R-67 (2),
-- PROVISIONAL on Stack's answer to B-35. The path is read first, the file name second.
--   GEO.103.lecture  "Week N"                  (its top-level week folders)
--   IST.323          "Lecture #N - Week N"     (its lecture-slide items; the second N is the week)
--   IST.352          "WKnn"                    (its weekly modules)
--   no rule for IST.466 (its Wk tags name schedule versions, not weeks), ECN.304, IST.471 or
--   GEO.103.recitation: the function returns null for them.
--
-- link_file_sessions(p_sync_run_id): fills only NULL week_no / session_id on current rows that
-- are not classified_by 'stack' and not bucket 'my_submissions'. storage_path and local_path are
-- never written (stored keys are never rewritten; bb_file_relpath reads week_no only for new keys).
--   1. week_no from file_week_no.
--   2. session_id:
--        a. through reading_id -> readings.for_date = sessions.session_date, exactly one session
--           of the file's course on that date                       (SESSION_VIA_READING = 1.0)
--        b. else through the file's week, when that week holds exactly one session
--                                                                    (SESSION_VIA_WEEK = 0.8)
--        c. a week with several sessions: one stack_must_confirm question per file, settled on a
--           later fold exactly as 086 settles reading links (Stack's answer applied if it names
--           one of the candidates; "none" or a dismissal leaves the file unlinked and quiet).
--      Sessions of kind 'no_class' are never candidates.
--   link_confidence is written only where it is null: 4 files carry the token coverage of their
--   reading link (086) there, and that value is not overwritten. The note names the path and
--   confidence of every session link.
--
-- Then: the three IST.352 SA&D decks are linked by hand to the sessions their deck was taught in
-- (B-34's default): 31 -> 129 (8/26), 47 -> 130 (8/31), 32 -> 131 (9/2). Then the backfill,
-- link_file_sessions(null), with a guard on its counts.

create or replace function public.file_week_no(p_course_id text, p_path text, p_file_name text)
returns smallint
language sql
immutable
set search_path = public, pg_temp
as $function$
  select (case p_course_id
            when 'GEO.103.lecture' then
              coalesce(substring(p_path      from '\mWeek\s+(\d{1,2})\M'),
                       substring(p_file_name from '\mWeek\s+(\d{1,2})\M'))
            when 'IST.323' then
              coalesce(substring(p_path      from 'Lecture\s*#\s*\d+\s*-\s*Week\s*(\d{1,2})\M'),
                       substring(p_file_name from 'Lecture\s*#\s*\d+\s*-\s*Week\s*(\d{1,2})\M'))
            when 'IST.352' then
              coalesce(substring(p_path      from '\mWK(\d{2})\M'),
                       substring(p_file_name from '\mWK(\d{2})\M'))
          end)::smallint
$function$;

revoke all on function public.file_week_no(text, text, text) from public, anon;
grant execute on function public.file_week_no(text, text, text) to authenticated, service_role;

create or replace function public.link_file_sessions(p_sync_run_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  SESSION_VIA_READING constant numeric := 1.0;   -- PM's constant (brief 98 open item 5)
  SESSION_VIA_WEEK    constant numeric := 0.8;   -- PM's constant (brief 98 open item 5)
  v_examined  int := 0;
  v_weeks     int := 0;
  v_linked    int := 0;
  v_ambiguous int := 0;
  v_raised    int := 0;
  f           record;
  v_ids       bigint[];
  v_answer    record;
  v_pick      bigint;
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
    select bf.id, bf.course_id, bf.file_name, bf.week_no, bf.reading_id
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
                            'attention_raised', v_raised);
end
$function$;

revoke all on function public.link_file_sessions(bigint) from public, anon, authenticated;
grant execute on function public.link_file_sessions(bigint) to service_role;

-- The three IST.352 SA&D decks (B-34's default), then the backfill.
do $$
declare
  HAND_NOTE constant text := 'session_id linked by hand in migration 123 (brief 98 B-34: the deck taught that day)';
  v_n int;
  v_r jsonb;
begin
  update bb_files f
     set session_id = h.session_id,
         notes      = btrim(coalesce(f.notes || ' | ', '') || HAND_NOTE)
    from (values (31::bigint, 129::bigint), (47, 130), (32, 131)) h(file_id, session_id)
   where f.id = h.file_id
     and f.course_id = 'IST.352'
     and f.session_id is null
     and f.superseded_by is null
     and exists (select 1 from sessions s where s.id = h.session_id and s.course_id = 'IST.352');
  get diagnostics v_n = row_count;
  if v_n <> 3 then
    raise exception '123: expected 3 hand links, wrote %', v_n;
  end if;

  v_r := link_file_sessions(null);
  if (v_r->>'weeks_set')::int <> 18
     or (v_r->>'sessions_linked')::int <> 21
     or (v_r->>'ambiguous')::int <> 10 then
    raise exception '123: backfill counts moved from the dry run: %', v_r;
  end if;
end $$;

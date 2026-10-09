-- bb2dash :: db/migrations/188_transform_archived_answers.sql
-- Phase 23 follow-ups (brief 110, Item 2; Stack's answer of 2026-10-08, "Stop re-asking superseded
-- files"). Re-creates the two functions every fold calls, each with its LIVE body and one change, as
-- 160 and 163 did before it. 122, 123, 160, 162 and 163 stay byte-frozen.
--
-- WHY
--   1. supersede_replaced_files asks one question when an item carries several files and one is new
--      (or when only a file name matches). It skipped the question only while a matching answer was
--      resolved or dismissed. /inbox-apply archives every answered row, so at the next fold the
--      settle test found nothing and the question was raised again. link_file_sessions had the same
--      flaw and 163 fixed it by also reading an archived row that did not close itself. This is the
--      same predicate (163:127-128), in the other function.
--   2. link_file_sessions writes Stack's pick onto the file and left the answer row as it was:
--      applied_at stayed null, so the queue row read was_applied = false. The apply worker therefore
--      carries a rule of its own that compares the file with the pick, the Inbox refuses Undo for
--      every session answer by its ref, and a session answer that the apply worker had to skip stays
--      held (187) because nothing says it was applied. The fold now ends by stamping applied_at on
--      every session answer whose pick is the session its file carries, however the file came by it
--      (R6). An answer of "none", or a pick the file does not carry, gets no stamp (the rule the
--      apply side keeps, 186:194-201).
--
-- WHAT
--   1. supersede_replaced_files(uuid, bigint): 160's body; the settle test also reads a row that is
--      archived and did not close itself. Nothing else changes.
--   2. link_file_sessions(bigint): 163's body; the function ENDS with one statement (the backfill's
--      own predicate, with dismissed as well): every session answer with no applied_at whose pick is
--      the session its current file carries is stamped. Step c itself is unchanged.
--   3. a backfill: every session answer (resolved or archived, not closed by itself, applied_at
--      null) whose pick is the session its current file carries is stamped. The count is printed.
--      The stamp's time is THIS MIGRATION'S, not the fold's that wrote the link: it says "applied
--      by the time 188 ran", and DATA_SYNTAX.md says so too. Re-running it stamps 0.
--   4. a guard block
--
-- WHERE EACH BODY CAME FROM (prod is byte-identical to the repo, so the live body is the body of the
-- last migration that created the function; found by searching db/migrations for each name):
--     supersede_replaced_files   160 (122's, then 160's; no later migration re-creates it)
--     link_file_sessions         163 (123's, 162's, then 163's; no later migration re-creates it)
-- Each change is marked `-- 188:` in the body. Signatures, SECURITY DEFINER, the pinned search_path
-- and the grants (service_role and db_test_runner; 122, 128, 162, 163) are unchanged.
--
-- APPLY AT THE CUT-OVER, AFTER `apply` IS REBUILT, NOT BEFORE: until the new worker runs, the old
-- one records a stamped session answer as "Applied by apply_resolutions()", the wrong function's
-- name. It is reviewed with 187 first and dry-run in one rolled-back transaction with no sync and no
-- apply request open (brief 110, task 6), so until the cut-over its unit reads "migration 188 is
-- not applied", on purpose, as phase23_183 did.
--
-- Additive in effect: no drop, no rename, no grant taken from a role that holds it; two bodies
-- replaced and one column (applied_at) stamped on rows that were applied.

-- =============================================================================================
-- 1. supersede_replaced_files: an archived answer settles the question
-- =============================================================================================
create or replace function public.supersede_replaced_files(p_run_id uuid, p_sync_run_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_examined   int := 0;
  v_superseded int := 0;
  v_asked      int := 0;
  v_is_newest  boolean;
  v_settled    boolean;
  v_cands      bigint[];
  f            record;
begin
  if p_run_id is null then
    raise exception 'supersede_replaced_files: p_run_id is required';
  end if;

  -- 037's guard: newest across every crawl the owner registered, not only the folded ones.
  select not exists (
           select 1
             from agent_requests r
            where r.kind = 'sync'
              and r.run_id is not null
              and r.run_id <> p_run_id
              and (select max(b.captured_at) from bb_raw b where b.run_id = r.run_id)
                  > (select max(b.captured_at) from bb_raw b where b.run_id = p_run_id))
    into v_is_newest;

  if not v_is_newest then
    return jsonb_build_object('examined', 0, 'superseded', 0, 'asked', 0, 'older_run', true);
  end if;

  for f in
    with refs as (
      -- The crawl's file references, read exactly as stage_files reads them.
      select b.bb_course_id,
             ci->>'id'              as content_id,
             nullif(e->>'name', '') as file_name,
             bb_abs_url(e->>'url')  as url
        from bb_raw b,
             lateral jsonb_array_elements(bb_jarray(b.payload->'content')) ci,
             lateral jsonb_array_elements(bb_jarray(ci->'embeddedFiles')) e
       where b.run_id = p_run_id and b.kind = 'course'
         and coalesce(e->>'url', '') <> ''
      union
      select b.bb_course_id,
             ci->>'id',
             nullif(coalesce(ci->'detail'->'file'->>'name', ci->>'title'), ''),
             bb_abs_url(ci->'detail'->'file'->>'url')
        from bb_raw b,
             lateral jsonb_array_elements(bb_jarray(b.payload->'content')) ci
       where b.run_id = p_run_id and b.kind = 'course'
         and coalesce(ci->'detail'->'file'->>'url', '') <> ''
    ),
    crawl as (
      select * from refs where url !~ '/sessions/'
    ),
    -- 160: every file reference of every registered crawl, to tell which URLs have ever sat
    -- together in one content item.
    seen as materialized (
      select b.run_id, b.bb_course_id, ci->>'id' as content_id, bb_abs_url(e->>'url') as url
        from bb_raw b,
             lateral jsonb_array_elements(bb_jarray(b.payload->'content')) ci,
             lateral jsonb_array_elements(bb_jarray(ci->'embeddedFiles')) e
       where b.kind = 'course'
         and b.run_id in (select r.run_id from agent_requests r
                           where r.kind = 'sync' and r.run_id is not null)
         and coalesce(e->>'url', '') <> ''
      union
      select b.run_id, b.bb_course_id, ci->>'id', bb_abs_url(ci->'detail'->'file'->>'url')
        from bb_raw b,
             lateral jsonb_array_elements(bb_jarray(b.payload->'content')) ci
       where b.kind = 'course'
         and b.run_id in (select r.run_id from agent_requests r
                           where r.kind = 'sync' and r.run_id is not null)
         and coalesce(ci->'detail'->'file'->>'url', '') <> ''
    ),
    eligible as (
      select bf.*
        from bb_files bf
       where bf.superseded_by is null
         and bf.classified_by is distinct from 'stack'
         and bf.bucket <> 'my_submissions'
         and exists (select 1 from crawl c where c.bb_course_id = bf.bb_course_id)
         and not exists (select 1 from crawl c
                          where c.bb_course_id = bf.bb_course_id and c.url = bf.source_url)
    )
    -- Same item, new file(s).
    select 'item' as match_kind, el.id, el.course_id, el.file_name, el.content_id,
           (select count(distinct c.url) from crawl c
             where c.bb_course_id = el.bb_course_id and c.content_id = el.content_id) as n_urls,
           (select array_agg(distinct g.id order by g.id)
              from crawl c
              join bb_files g on g.bb_course_id = c.bb_course_id and g.source_url = c.url
             where c.bb_course_id = el.bb_course_id and c.content_id = el.content_id
               and g.superseded_by is null and g.id <> el.id) as candidates,
           -- 160: the candidates that no registered crawl ever showed beside F in this item
           (select array_agg(distinct g.id order by g.id)
              from crawl c
              join bb_files g on g.bb_course_id = c.bb_course_id and g.source_url = c.url
             where c.bb_course_id = el.bb_course_id and c.content_id = el.content_id
               and g.superseded_by is null and g.id <> el.id
               and not exists (select 1
                                 from seen s1
                                 join seen s2 on s2.run_id = s1.run_id
                                             and s2.bb_course_id = s1.bb_course_id
                                             and s2.content_id = s1.content_id
                                where s1.bb_course_id = el.bb_course_id
                                  and s1.content_id = el.content_id
                                  and s1.url = el.source_url
                                  and s2.url = g.source_url)) as new_candidates
      from eligible el
     where el.content_id is not null
       and exists (select 1 from crawl c
                    where c.bb_course_id = el.bb_course_id and c.content_id = el.content_id)
    union all
    -- Item gone, same file name under another item.
    select 'name', el.id, el.course_id, el.file_name, el.content_id,
           null::bigint,
           (select array_agg(distinct g.id order by g.id)
              from crawl c
              join bb_files g on g.bb_course_id = c.bb_course_id and g.source_url = c.url
             where c.bb_course_id = el.bb_course_id
               and c.file_name = el.file_name
               and c.content_id is distinct from el.content_id
               and g.superseded_by is null and g.id <> el.id),
           null::bigint[]
      from eligible el
     where not exists (select 1 from crawl c
                        where c.bb_course_id = el.bb_course_id
                          and c.content_id is not distinct from el.content_id)
    order by 2
  loop
    continue when f.candidates is null;
    v_examined := v_examined + 1;

    -- 160: inside an item only a candidate that is new beside F can replace it. With none, F is
    -- not superseded and nothing is asked: stage_files' missing pass marks it instead.
    v_cands := case when f.match_kind = 'item' then f.new_candidates else f.candidates end;
    continue when v_cands is null;

    if f.match_kind = 'item' and f.n_urls = 1 and cardinality(v_cands) = 1 then
      update bb_files
         set superseded_by = v_cands[1],
             notes = btrim(coalesce(notes || ' | ', '') ||
                     format('superseded by bb_file %s: content item %s carries only that file in crawl %s, and no earlier crawl showed it beside this one (supersede_replaced_files, 160)',
                            v_cands[1], f.content_id, p_run_id))
       where id = f.id
         and superseded_by is null;
      if found then v_superseded := v_superseded + 1; end if;
      continue;
    end if;

    -- Several files in the item with at least one new, or a name-only match: ask once, write
    -- nothing.
    select exists (
             select 1
               from attention_items ai
              where ai.kind = 'stack_must_confirm'
                and ai.entity = 'bb_file'
                and ai.ref = 'supersede/' || f.id::text
                and ai.field = 'superseded_by'
                -- 188: an answer /inbox-apply has archived is still Stack's answer (163 made
                -- link_file_sessions read one); an archived row that closed itself is not.
                and (ai.state in ('resolved', 'dismissed')
                     or (ai.state = 'archived' and ai.decision->>'closed_itself' is distinct from 'true'))
                and ai.to_value is not distinct from to_jsonb(v_cands))
      into v_settled;
    continue when v_settled;

    if raise_attention(p_sync_run_id, 'stack_must_confirm', f.course_id, 'bb_file',
         'supersede/' || f.id::text, 'superseded_by', null, to_jsonb(v_cands),
         case when f.match_kind = 'item'
              then format('%s: Blackboard item %s no longer carries "%s"; it now carries %s files. Which one replaces it, if any?',
                          f.course_id, f.content_id, f.file_name, f.n_urls)
              else format('%s: "%s" is gone from its Blackboard item, and a file of the same name now sits in another item. Is that the same document?',
                          f.course_id, f.file_name)
         end,
         jsonb_build_object('source', 'supersede_replaced_files', 'file_id', f.id,
                            'match', f.match_kind, 'run_id', p_run_id,
                            'candidates', to_jsonb(v_cands),
                            'answer_with', '{"superseded_by": <one of candidates>} or {"accept": "none"}'))
    then
      v_asked := v_asked + 1;
    end if;
  end loop;

  return jsonb_build_object('examined', v_examined, 'superseded', v_superseded,
                            'asked', v_asked, 'older_run', false);
end
$function$;

-- =============================================================================================
-- 2. link_file_sessions: the pick it applies is stamped
-- =============================================================================================
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

  -- 188: the stamp. Every session answer (resolved, dismissed, or archived and not self-closed) with
  -- no applied_at whose pick is the session its current file carries NOW is stamped, however the
  -- file came by it: step c above, the reading's date, the week dropping to one session, the lecture
  -- number, 123's inheritance, or a file this loop never visits again. It is the one-time backfill's
  -- own predicate (below), so the apply worker records the answer as applied by link_file_sessions,
  -- the Inbox refuses Undo for it, and a held session answer of this kind is freed. An answer of
  -- "none", and a pick the file does not carry, are never stamped.
  -- (The alias is cf: f is this function's record variable.)
  update attention_items ai
     set applied_at = now()
    from bb_files cf
   where ai.kind = 'stack_must_confirm' and ai.entity = 'bb_file' and ai.field = 'session_id'
     and ai.state in ('resolved', 'dismissed', 'archived')
     and (ai.state <> 'archived' or ai.decision->>'closed_itself' is distinct from 'true')
     and ai.applied_at is null
     and cf.id = substring(ai.ref from '^session_link/([0-9]{1,18})$')::bigint
     and cf.superseded_by is null
     and cf.session_id is not null
     and cf.session_id = case when ai.resolution->>'session_id' ~ '^[0-9]{1,18}$'
                             then (ai.resolution->>'session_id')::bigint end;

  return jsonb_build_object('files_examined', v_examined, 'weeks_set', v_weeks,
                            'sessions_linked', v_linked, 'ambiguous', v_ambiguous,
                            'attention_raised', v_raised,
                            'linked_by_lecture_no', v_by_lecture,
                            'questions_closed', v_closed);
end
$function$;

comment on function public.supersede_replaced_files(uuid, bigint) is
  'The supersede rule (122, 160, 188): a file that left its item''s crawl is superseded by the one new '
  'file beside it, or one question names the new candidates (stack_must_confirm, supersede/<file id>). '
  'Since 188 an answer that is resolved, dismissed or archived (and did not close itself) for the same '
  'candidates settles the question, so /inbox-apply archiving it no longer brings it back. service_role '
  'only.';

comment on function public.link_file_sessions(bigint) is
  'Links files to class sessions (123, 162, 163, 188): by reading date, by the week''s only session, by '
  'Stack''s answer (resolved or archived, not self-closed), by lecture number. Since 188 an answer it '
  'applies carries applied_at; an answer of "none" or a pick outside the week''s sessions writes nothing '
  'and is not stamped. service_role only.';

revoke all on function public.supersede_replaced_files(uuid, bigint) from public, anon, authenticated;
grant execute on function public.supersede_replaced_files(uuid, bigint) to service_role, db_test_runner;
revoke all on function public.link_file_sessions(bigint) from public, anon, authenticated;
grant execute on function public.link_file_sessions(bigint) to service_role, db_test_runner;

-- =============================================================================================
-- 3. Backfill: the session answers the fold applied before 188
-- =============================================================================================
-- A session answer (resolved or archived, not self-closed, applied_at null) whose pick is the
-- session its current file carries. The time is this migration's (now()).
do $$
declare
  v_n integer;
begin
  with stamped as (
    update attention_items ai
       set applied_at = now()
      from bb_files f
     where ai.kind = 'stack_must_confirm' and ai.entity = 'bb_file' and ai.field = 'session_id'
       and ai.state in ('resolved', 'archived')
       and (ai.state <> 'archived' or ai.decision->>'closed_itself' is distinct from 'true')
       and ai.applied_at is null
       and f.id = substring(ai.ref from '^session_link/([0-9]{1,18})$')::bigint
       and f.superseded_by is null
       and f.session_id is not null
       and f.session_id = case when ai.resolution->>'session_id' ~ '^[0-9]{1,18}$'
                               then (ai.resolution->>'session_id')::bigint end
    returning ai.id)
  select count(*) into v_n from stamped;
  raise notice '188: backfill stamped % session answer(s)', v_n;
end $$;

-- =============================================================================================
-- 4. Guard
-- =============================================================================================
do $$
declare
  f text;
begin
  foreach f in array array['public.supersede_replaced_files(uuid, bigint)', 'public.link_file_sessions(bigint)'] loop
    if not exists (select 1 from pg_proc p
                    where p.oid = f::regprocedure and p.prosecdef
                      and coalesce(p.proconfig, '{}') @> array['search_path=public, pg_temp']) then
      raise exception 'FAIL 188: % lost SECURITY DEFINER or its search_path', f;
    end if;
    if has_function_privilege('anon', f, 'execute') or has_function_privilege('authenticated', f, 'execute')
       or has_function_privilege('inbox_apply_runner', f, 'execute') or has_function_privilege('sync_runner', f, 'execute')
       or not has_function_privilege('service_role', f, 'execute') or not has_function_privilege('db_test_runner', f, 'execute') then
      raise exception 'FAIL 188: % is not executable by service_role and the test login alone', f;
    end if;
    if position('-- 188:' in (select prosrc from pg_proc where oid = f::regprocedure)) = 0 then
      raise exception 'FAIL 188: % is not the 188 body', f;
    end if;
  end loop;
  -- The rules of 160, 162 and 163 are still in the bodies.
  if position('new_candidates' in (select prosrc from pg_proc where oid = 'public.supersede_replaced_files(uuid, bigint)'::regprocedure)) = 0
     or position('closed_itself' in (select prosrc from pg_proc where oid = 'public.link_file_sessions(bigint)'::regprocedure)) = 0
     or position('SESSION_VIA_LECTURE_NO' in (select prosrc from pg_proc where oid = 'public.link_file_sessions(bigint)'::regprocedure)) = 0 then
    raise exception 'FAIL 188: a body lost a rule of 160, 162 or 163';
  end if;
  -- sync_runner still executes the fourteen it was pinned to.
  if (select string_agg(p.proname, ',' order by p.proname)
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.prosecdef
         and has_function_privilege('sync_runner', p.oid, 'execute'))
     is distinct from
     'sync_claim,sync_close,sync_enqueue,sync_file_stored,sync_file_worklist,sync_login_ok,'
     'sync_login_required,sync_next,sync_own_claims,sync_register_run,sync_request_inbox_apply,'
     'sync_requeue_orphans,sync_run_outcome,sync_sweep_stale' then
    raise exception 'FAIL 188: sync_runner no longer executes exactly the fourteen';
  end if;
  -- The backfill left nothing behind: no session answer whose pick its current file carries lacks the stamp.
  if exists (
       select 1
         from attention_items ai
         join bb_files f on f.id = substring(ai.ref from '^session_link/([0-9]{1,18})$')::bigint
        where ai.kind = 'stack_must_confirm' and ai.entity = 'bb_file' and ai.field = 'session_id'
          and ai.state in ('resolved', 'archived')
          and (ai.state <> 'archived' or ai.decision->>'closed_itself' is distinct from 'true')
          and ai.applied_at is null
          and f.superseded_by is null and f.session_id is not null
          and f.session_id = case when ai.resolution->>'session_id' ~ '^[0-9]{1,18}$'
                                  then (ai.resolution->>'session_id')::bigint end) then
    raise exception 'FAIL 188: a session answer whose pick its file carries is still unstamped';
  end if;
end $$;

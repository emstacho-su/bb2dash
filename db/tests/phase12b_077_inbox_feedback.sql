-- bb2dash :: db/tests/phase12b_077_inbox_feedback.sql
-- Phase 12b, item I-1 (P-inbox-1, P-home-4). Tests migration 077: the Inbox feedback hook.
--   * `v_inbox_feedback` exists with the documented columns, runs as the invoker, is not readable
--     by anon, and returns exactly the closed Inbox rows that carry a note - never an open one;
--   * `agent_requests.kind` accepts `inbox_feedback` and still refuses anything unknown;
--   * `transform_tick()` leaves a queued inbox_feedback row alone: the hook exists, nothing acts
--     on it yet, which is what Stack asked for (answer 16).
--
-- RUN IT: paste the whole file into one `execute_sql` call, or `psql "$DATABASE_URL" -f <file>`.
-- A failing assertion raises; a pass ends with one summary row. Section 3 queues a request and
-- runs one transform tick; the file's last statement is `rollback`, so neither survives.

begin;

-- =============================================================================================
-- 1. The view: shape, privileges, contents
-- =============================================================================================
do $$
declare cols text;
begin
  if to_regclass('public.v_inbox_feedback') is null then
    raise exception 'FAIL v_inbox_feedback does not exist';
  end if;

  select string_agg(attname, ',' order by attnum) into cols
    from pg_attribute
   where attrelid = 'public.v_inbox_feedback'::regclass and attnum > 0 and not attisdropped;
  if cols <> 'id,kind,course_id,entity,ref,field,question,from_value,to_value,suggested,state,'
             'resolution,accept,feedback,raised_at,raised_by_sync_run,resolved_at,applied_at,'
             'was_applied' then
    raise exception 'FAIL v_inbox_feedback columns are %', cols;
  end if;

  if not exists (select 1 from pg_class c, unnest(c.reloptions) o
                  where c.oid = 'public.v_inbox_feedback'::regclass and o = 'security_invoker=true') then
    raise exception 'FAIL v_inbox_feedback is not security_invoker';
  end if;
  if has_table_privilege('anon', 'public.v_inbox_feedback', 'select') then
    raise exception 'FAIL v_inbox_feedback is readable by anon';
  end if;
  if not has_table_privilege('authenticated', 'public.v_inbox_feedback', 'select')
     or not has_table_privilege('service_role', 'public.v_inbox_feedback', 'select') then
    raise exception 'FAIL v_inbox_feedback is not readable by authenticated / service_role';
  end if;
end $$;

do $$
declare
  n_view     int;
  n_expected int;
begin
  select count(*) into n_view from v_inbox_feedback;
  select count(*) into n_expected from attention_items
   where state in ('resolved', 'dismissed')
     and coalesce(btrim(resolution_note), '') <> '';
  if n_view <> n_expected then
    raise exception 'FAIL v_inbox_feedback returns % rows, expected %', n_view, n_expected;
  end if;
  if n_view = 0 then
    raise exception 'FAIL v_inbox_feedback is empty - prod has closed rows with notes';
  end if;

  if exists (select 1 from v_inbox_feedback where state = 'open') then
    raise exception 'FAIL v_inbox_feedback leaks open questions';
  end if;
  if exists (select 1 from v_inbox_feedback where coalesce(btrim(feedback), '') = '') then
    raise exception 'FAIL v_inbox_feedback returns a row with no note';
  end if;

  -- A resolved row with a note is in it, and the answer travels with it.
  if not exists (select 1 from v_inbox_feedback where state = 'resolved') then
    raise exception 'FAIL no resolved row reached v_inbox_feedback';
  end if;
  if exists (select 1 from v_inbox_feedback f join attention_items ai on ai.id = f.id
              where f.was_applied is distinct from (ai.applied_at is not null)
                 or f.feedback   is distinct from ai.resolution_note
                 or f.accept     is distinct from (ai.resolution->>'accept')) then
    raise exception 'FAIL v_inbox_feedback misreports a row it carries';
  end if;
end $$;

-- =============================================================================================
-- 2. The request kind
-- =============================================================================================
do $$
declare v_id bigint;
begin
  insert into agent_requests (kind, note) values ('inbox_feedback', '077 test')
  returning id into v_id;
  if v_id is null then
    raise exception 'FAIL agent_requests refused kind inbox_feedback';
  end if;

  begin
    insert into agent_requests (kind, note) values ('_077_unknown', '077 test');
    raise exception 'FAIL agent_requests accepted an unknown kind';
  exception when check_violation then
    null;
  end;

  -- The two older kinds still work.
  insert into agent_requests (kind, note) values ('transform', '077 test');
end $$;

-- =============================================================================================
-- 3. transform_tick ignores it
-- =============================================================================================
do $$
declare
  v_state text;
  r       jsonb;
begin
  if pg_get_functiondef('public.transform_tick()'::regprocedure) not like '%kind = ''transform''%' then
    raise exception 'FAIL transform_tick no longer filters its drain on kind = transform';
  end if;

  r := transform_tick();

  select state into v_state from agent_requests
   where kind = 'inbox_feedback' and note = '077 test'
   order by id desc limit 1;
  if v_state <> 'queued' then
    raise exception 'FAIL transform_tick touched the inbox_feedback request (state is now %)', v_state;
  end if;
end $$;

-- =============================================================================================
-- Pass
-- =============================================================================================
select 'phase12b_077_inbox_feedback: PASS'                                        as result,
       (select count(*) from v_inbox_feedback)                                    as feedback_rows,
       (select count(*) from v_inbox_feedback where state = 'resolved')           as resolved_rows,
       (select count(*) from v_inbox_feedback where state = 'dismissed')          as dismissed_rows,
       (select count(*) from v_inbox_feedback where was_applied)                  as applied_rows;

rollback;

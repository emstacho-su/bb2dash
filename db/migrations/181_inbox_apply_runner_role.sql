-- bb2dash :: db/migrations/181_inbox_apply_runner_role.sql
-- Phase 23 (Inbox auto-apply; DECISIONS 2026-10-07, Stack's three choices of that day).
--
-- WHY. /inbox-apply used to run in a Claude Code session on the host with the Supabase MCP, whose
-- SQL runs as the service role: "the rules below are the only thing standing between a wrong
-- answer and a wrong row" (the skill). It now also runs unattended in the `apply` container, where
-- a `claude -p` process reads course text and writes rows. That process gets its own login role,
-- `inbox_apply_runner`, and the database holds the skill's rules instead of prose:
--   * it reads only what the context step needs, and never bb_raw, the file corpus, the calendar
--     tables or reading_progress;
--   * it writes only the skill's sanctioned targets: assignments, assignment_progress,
--     course_staff and courses.group_notes. No delete anywhere. attention_items.applied_at, the
--     fifth target, is stamped by inbox_apply_archive from the write log, so the role holds no
--     write on attention_items at all;
--   * every one of those writes must name an answered Inbox item and is recorded in
--     inbox_apply_writes at write time (B-59: every planner write is logged);
--   * an item leaves the queue only through inbox_apply_archive, with a decision of a fixed shape.
-- The service key is not used for SQL in the apply container.
--
-- THE FILE CARRIES NO PASSWORD, EVER. Stack sets it out of band, so this file stays byte-identical
-- to what prod recorded. The role connects through the session pooler (port 5432, user
-- `inbox_apply_runner.goultdzqcavefcgnifdy`), never the transaction pooler on 6543: begin_item's
-- settings are transaction-local and the worker holds one session.
--
-- WHAT
--   1. role `inbox_apply_runner` (login, noinherit, nobypassrls), statement_timeout 30s,
--      connection limit 4, usage on schema `public`
--   2. reads: select on eight tables and two views, each table with a select policy for the role
--   3. writes: insert and update on three tables, update (group_notes) on courses, and the two
--      columns of app_settings the calendar-dirty trigger touches as the writer
--   4. the write log: table inbox_apply_writes and the row trigger inbox_apply_log_write on the
--      four write tables, fired only when the role itself writes
--   5. the worker's functions (SECURITY DEFINER): inbox_apply_claim, inbox_apply_prepare,
--      inbox_apply_begin_item, inbox_apply_archive, inbox_apply_run_facts, inbox_apply_close
--   6. privileges; `db_test_runner` holds the role WITH INHERIT FALSE, so the unit can
--      `set local role inbox_apply_runner`
--   7. a guard block
--
-- NOT HERE: the rule "one open inbox_feedback request at a time" as a unique index. It is 183,
-- applied at the cut-over with the updated skill, because the skill installed today inserts a
-- claimed request of its own and would be refused while one is queued.
--
-- ONE ROLE, TWO CALLERS. The worker's loop and the Claude process it starts share this login. The
-- six functions are therefore safe to call out of turn: each checks the request is the worker's
-- own claim, and the worker builds its report from inbox_apply_run_facts, never from Claude's text.
--
-- THE ITEM SETTING CAN BE FORGED, SO THE TRIGGER DOES NOT TRUST IT. inbox_apply_begin_item sets
-- `inbox_apply.item` for the transaction; a caller could set it by hand. The trigger checks the
-- named item is an answered row before it lets a write through, and logs the write against it.
--
-- REFUSALS. A refusal a function raises itself carries SQLSTATE 22023 and a message that starts
-- with the function's name; the trigger's refusal carries 42501.
--
-- Constants shared with the worker (`apply/src/config.ts`): the claimant is `inbox-apply-runner`;
-- a claim of anybody else's is released after 30 minutes (R-96's deferred release; the worker
-- kills its own run at 14); the lock key 1400910002 is 180's.
--
-- Additive only: no drop, no rename, no existing function body changed.

do $$
begin
  if to_regprocedure('public.sync_request_inbox_apply(bigint)') is null then
    raise exception '181: sync_request_inbox_apply does not exist; apply 180_inbox_apply_trigger first';
  end if;
  if not exists (select 1 from pg_roles where rolname = 'db_test_runner') then
    raise exception '181: role db_test_runner does not exist; apply 100_db_test_runner_role first';
  end if;
end $$;

-- =============================================================================================
-- 1. The role
-- =============================================================================================
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'inbox_apply_runner') then
    raise notice 'inbox_apply_runner already exists; its attributes and grants are re-applied below';
  else
    create role inbox_apply_runner login noinherit nobypassrls;
  end if;
end $$;

alter role inbox_apply_runner set statement_timeout = '30s';
alter role inbox_apply_runner connection limit 4;

comment on role inbox_apply_runner is
  'The apply container''s worker and the claude -p process it starts (Phase 23, migration 181). Reads '
  'what /inbox-apply''s context step needs; writes only assignments, assignment_progress, course_staff '
  'and courses.group_notes, each write logged against an answered Inbox item; no delete. Password set '
  'out of band; connects through the session pooler (5432).';

grant usage on schema public to inbox_apply_runner;

-- =============================================================================================
-- 2. Reads
-- =============================================================================================
grant select on
  public.attention_items, public.assignments, public.assignment_progress, public.course_staff,
  public.courses, public.grade_components, public.bb_gradebook, public.sync_runs,
  public.v_inbox_queue, public.v_gradebook_latest
to inbox_apply_runner;

do $$
declare t text;
begin
  -- The owner's policy on each table is `to authenticated`, so this role sees no row without its own.
  foreach t in array array['attention_items', 'assignments', 'assignment_progress', 'course_staff',
                           'courses', 'grade_components', 'bb_gradebook', 'sync_runs'] loop
    if not exists (select 1 from pg_policies
                    where schemaname = 'public' and tablename = t and policyname = t || '_inbox_apply_read') then
      execute format('create policy %I on public.%I for select to inbox_apply_runner using (true)',
                     t || '_inbox_apply_read', t);
    end if;
  end loop;
end $$;

-- =============================================================================================
-- 3. Writes
-- =============================================================================================
grant insert, update on public.assignments, public.assignment_progress, public.course_staff
  to inbox_apply_runner;
grant update (group_notes) on public.courses to inbox_apply_runner;
-- assignments_mark_calendar_dirty (066) runs as the writer and sets app_settings.gcal_dirty.
-- Two columns only: the role never reads the calendar ids or the iCal URL.
grant select (id, gcal_dirty), update (gcal_dirty) on public.app_settings to inbox_apply_runner;

do $$
declare t text;
begin
  foreach t in array array['assignments', 'assignment_progress', 'course_staff'] loop
    if not exists (select 1 from pg_policies
                    where schemaname = 'public' and tablename = t and policyname = t || '_inbox_apply_insert') then
      execute format('create policy %I on public.%I for insert to inbox_apply_runner with check (true)',
                     t || '_inbox_apply_insert', t);
    end if;
  end loop;
  foreach t in array array['assignments', 'assignment_progress', 'course_staff', 'courses', 'app_settings'] loop
    if not exists (select 1 from pg_policies
                    where schemaname = 'public' and tablename = t and policyname = t || '_inbox_apply_update') then
      execute format('create policy %I on public.%I for update to inbox_apply_runner using (true) with check (true)',
                     t || '_inbox_apply_update', t);
    end if;
  end loop;
  if not exists (select 1 from pg_policies
                  where schemaname = 'public' and tablename = 'app_settings'
                    and policyname = 'app_settings_inbox_apply_read') then
    create policy app_settings_inbox_apply_read on public.app_settings
      for select to inbox_apply_runner using (true);
  end if;
end $$;

-- =============================================================================================
-- 4. The write log
-- =============================================================================================
create table if not exists public.inbox_apply_writes (
  id          bigint generated always as identity primary key,
  written_at  timestamptz not null default now(),
  request_id  bigint references public.agent_requests (id),
  item_id     bigint not null references public.attention_items (id),
  table_name  text not null,
  op          text not null check (op in ('insert', 'update')),
  row_key     text,
  old_row     jsonb,
  new_row     jsonb not null
);

comment on table public.inbox_apply_writes is
  'Every row inbox_apply_runner wrote, at write time (181; B-59''s "every write logged"): the Inbox '
  'item it was written for, the request, the table, the key, and the row before and after. Written '
  'only by the trigger inbox_apply_log_write. Append only.';

create index if not exists inbox_apply_writes_item_idx on public.inbox_apply_writes (item_id);
create index if not exists inbox_apply_writes_request_idx on public.inbox_apply_writes (request_id);

alter table public.inbox_apply_writes enable row level security;
revoke all on public.inbox_apply_writes from public, anon, authenticated;
grant select on public.inbox_apply_writes to authenticated;
grant insert on public.inbox_apply_writes to inbox_apply_runner;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public'
                   and tablename = 'inbox_apply_writes' and policyname = 'inbox_apply_writes_owner_read') then
    create policy inbox_apply_writes_owner_read on public.inbox_apply_writes
      for select to authenticated
      using ((select auth.uid()) = (select public.app_owner()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public'
                   and tablename = 'inbox_apply_writes' and policyname = 'inbox_apply_writes_runner_insert') then
    create policy inbox_apply_writes_runner_insert on public.inbox_apply_writes
      for insert to inbox_apply_runner with check (true);
  end if;
end $$;

create or replace function public.inbox_apply_log_write()
  returns trigger
  language plpgsql set search_path = public, pg_temp as $$
declare
  v_item    bigint;
  v_request bigint;
  v_new     jsonb := to_jsonb(new);
  v_old     jsonb;
begin
  -- Invoker rights on purpose: this runs as inbox_apply_runner (the trigger's WHEN), with the
  -- role's own select on attention_items and insert on the log.
  begin
    v_item    := nullif(current_setting('inbox_apply.item', true), '')::bigint;
    v_request := nullif(current_setting('inbox_apply.request', true), '')::bigint;
  exception when others then
    v_item := null;
  end;
  if v_item is null or not exists (
       select 1 from attention_items i where i.id = v_item and i.state in ('resolved', 'dismissed')) then
    raise exception 'inbox_apply_log_write: a write to % must name an answered Inbox item; call inbox_apply_begin_item first',
      tg_table_name using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' then
    v_old := to_jsonb(old);
  end if;
  insert into inbox_apply_writes (request_id, item_id, table_name, op, row_key, old_row, new_row)
  values (v_request, v_item, tg_table_name, lower(tg_op),
          coalesce(v_new->>'id', v_new->>'assignment_id'), v_old, v_new);
  return null;
end $$;

comment on function public.inbox_apply_log_write() is
  'Row trigger on assignments, assignment_progress, course_staff and courses (181), fired only when '
  'inbox_apply_runner writes: refuses the write (42501) unless the transaction names an answered Inbox '
  'item (inbox_apply_begin_item), and records it in inbox_apply_writes. Invoker rights.';

do $$
declare t text;
begin
  foreach t in array array['assignments', 'assignment_progress', 'course_staff', 'courses'] loop
    if not exists (select 1 from pg_trigger g
                    where g.tgrelid = ('public.' || t)::regclass and g.tgname = t || '_inbox_apply_log') then
      execute format(
        'create trigger %I after insert or update on public.%I for each row '
        'when (current_user = ''inbox_apply_runner'') execute function public.inbox_apply_log_write()',
        t || '_inbox_apply_log', t);
    end if;
  end loop;
end $$;

-- =============================================================================================
-- 5. The worker's functions
-- =============================================================================================
create or replace function public.inbox_apply_claim()
  returns table (id bigint, params jsonb, created_at timestamptz)
  language plpgsql security definer set search_path = public, pg_temp as $$
declare
  c_claimant constant text := 'inbox-apply-runner';
  c_release_after constant interval := interval '30 minutes';
  r record;
begin
  -- (a) One worker, one run at a time: a claim of the worker's own that is still open when it
  --     asks for work died with the process that held it. (b) R-96: anybody else's claim is
  --     released after 30 minutes. Both close failed; what was archived before stays archived.
  for r in
    update agent_requests a
       set state = 'failed', finished_at = now(),
           result = coalesce(a.result, '{}'::jsonb) || jsonb_build_object(
             'error', 'interrupted',
             'lines', jsonb_build_array(
               case when a.claimed_by = c_claimant
                    then 'The apply worker restarted before this request finished.'
                    else 'Claimed for more than 30 minutes without finishing; released.' end))
     where a.kind = 'inbox_feedback' and a.state = 'claimed'
       and (a.claimed_by = c_claimant
            or coalesce(a.claimed_at, a.created_at) < now() - c_release_after)
    returning a.id
  loop
    perform raise_attention(
      null, 'stack_must_confirm', null, 'agent_request', 'inbox-apply-failed', null, null, null,
      format('The Inbox apply request %s was interrupted before it finished. Answers it had already applied stay applied; press Apply answers to run the rest.', r.id),
      null);
  end loop;

  -- A live claim of somebody else's (the skill in a host session): nothing to take.
  if exists (select 1 from agent_requests a where a.kind = 'inbox_feedback' and a.state = 'claimed') then
    return;
  end if;

  return query
    update agent_requests a
       set state = 'claimed', claimed_at = now(), claimed_by = c_claimant,
           claim_attempts = a.claim_attempts + 1
     where a.id = (select q.id from agent_requests q
                    where q.kind = 'inbox_feedback' and q.state = 'queued'
                    order by q.created_at, q.id
                    limit 1
                    for update skip locked)
    returning a.id, a.params, a.created_at;
end $$;

comment on function public.inbox_apply_claim() is
  'The apply worker''s queue read and claim (181). First closes failed (error interrupted) any '
  'inbox_feedback claim of its own, and anybody else''s older than 30 minutes (R-96), raising one '
  'inbox-apply-failed item. Then, unless somebody else holds a live claim, claims the oldest queued '
  'inbox_feedback request as inbox-apply-runner and returns it; no row when there is none. '
  'inbox_apply_runner only.';

create or replace function public.inbox_apply_is_own_claim(p_request bigint)
  returns boolean
  stable
  language sql security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from agent_requests a
     where a.id = p_request and a.kind = 'inbox_feedback' and a.state = 'claimed'
       and a.claimed_by = 'inbox-apply-runner');
$$;

comment on function public.inbox_apply_is_own_claim(bigint) is
  'Helper (181): true when the request is an inbox_feedback request the apply worker holds claimed. '
  'Granted to nobody; the worker''s functions call it as their owner.';

create or replace function public.inbox_apply_prepare(p_request bigint)
  returns jsonb
  language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_params jsonb;
begin
  if not inbox_apply_is_own_claim(p_request) then
    raise exception 'inbox_apply_prepare: request % is not the apply worker''s claim', coalesce(p_request::text, 'null')
      using errcode = '22023';
  end if;

  -- 042's writer first, always (the skill's step 2): an answer given between folds is still
  -- applied_at null, and archiving it would take it out of 042's scan for good.
  perform apply_resolutions();

  select a.params into v_params from agent_requests a where a.id = p_request;

  return jsonb_build_object(
    'params', coalesce(v_params, '{}'::jsonb),
    'queue', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', q.id, 'kind', q.kind, 'course_id', q.course_id, 'entity', q.entity, 'ref', q.ref,
               'field', q.field, 'question', q.question, 'state', q.state, 'accept', q.accept,
               'has_note', q.has_note, 'was_applied', q.was_applied, 'applied_at', q.applied_at,
               'resolved_at', q.resolved_at)
               order by q.course_id nulls last, q.resolved_at, q.id), '[]'::jsonb)
        from v_inbox_queue q),
    'runs_today', (
      select count(*) from agent_requests a
       where a.kind = 'inbox_feedback' and a.id <> p_request
         and a.claimed_by = 'inbox-apply-runner'
         and a.result->'claude'->>'started' = 'true'
         and (a.claimed_at at time zone 'America/New_York')::date
             = (now() at time zone 'America/New_York')::date));
end $$;

comment on function public.inbox_apply_prepare(bigint) is
  'Step 2 of /inbox-apply for the apply worker (181): runs apply_resolutions(), then returns '
  '{params, queue, runs_today}: the request''s params, every v_inbox_queue row in the skill''s order, and '
  'how many of the worker''s requests started Claude on this New York day (the worker''s daily cap). '
  'Refuses a request that is not the worker''s own claim. inbox_apply_runner only.';

create or replace function public.inbox_apply_begin_item(p_request bigint, p_item bigint)
  returns boolean
  language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not inbox_apply_is_own_claim(p_request) then
    raise exception 'inbox_apply_begin_item: request % is not the apply worker''s claim', coalesce(p_request::text, 'null')
      using errcode = '22023';
  end if;

  -- The lock holds until the caller's transaction ends, so an Undo in the app waits for it.
  perform 1 from attention_items i
    where i.id = p_item and i.state in ('resolved', 'dismissed')
    for update;
  if not found then
    -- Taken back (Undo) or archived since the batch was read: the caller skips it.
    perform set_config('inbox_apply.item', '', true);
    return false;
  end if;

  perform set_config('inbox_apply.item', p_item::text, true);
  perform set_config('inbox_apply.request', p_request::text, true);
  return true;
end $$;

comment on function public.inbox_apply_begin_item(bigint, bigint) is
  'Opens one Inbox item for writing inside the caller''s transaction (181): locks the row, and when it '
  'is still answered (resolved or dismissed) names it for the write trigger and returns true; false '
  'when it was taken back or archived, so the caller skips it. Refuses a request that is not the '
  'worker''s own claim. inbox_apply_runner only.';

create or replace function public.inbox_apply_archive(p_request bigint, p_item bigint, p_decision jsonb)
  returns boolean
  language plpgsql security definer set search_path = public, pg_temp as $$
declare
  c_buckets constant text[] := array['needs_change', 'applied_by_transform', 'kept', 'dismissed',
                                     'recorded_elsewhere'];
  v_wrote boolean;
begin
  if not inbox_apply_is_own_claim(p_request) then
    raise exception 'inbox_apply_archive: request % is not the apply worker''s claim', coalesce(p_request::text, 'null')
      using errcode = '22023';
  end if;
  if p_item is null or p_decision is null or jsonb_typeof(p_decision) <> 'object' then
    raise exception 'inbox_apply_archive: the decision must be a jsonb object' using errcode = '22023';
  end if;
  -- The shape the exporter renders (182) and the app reads (decision.change). Text, not trust.
  if p_decision->>'schema' is distinct from 'inbox-decision/1'
     or p_decision->>'item' is distinct from p_item::text
     or p_decision->>'request' is distinct from p_request::text
     or (p_decision->>'bucket' = any (c_buckets)) is not true
     or p_decision->>'mode' is distinct from 'unattended'
     or jsonb_typeof(p_decision->'change') is distinct from 'string'
     or btrim(p_decision->>'change') = ''
     or jsonb_typeof(p_decision->'rule') is distinct from 'string'
     or (p_decision ? 'sources' and jsonb_typeof(p_decision->'sources') <> 'array')
     or (p_decision ? 'flagged' and jsonb_typeof(p_decision->'flagged') not in ('object', 'null')) then
    raise exception 'inbox_apply_archive: the decision for item % is not an inbox-decision/1 record', p_item
      using errcode = '22023';
  end if;

  perform 1 from attention_items i
    where i.id = p_item and i.state in ('resolved', 'dismissed')
    for update;
  if not found then
    return false;
  end if;

  -- 042's F3 rule, read from the log and not from the caller: applied_at is stamped only when a
  -- row was actually written for this item by this request.
  select exists (select 1 from inbox_apply_writes w
                  where w.item_id = p_item and w.request_id = p_request) into v_wrote;
  if v_wrote then
    update attention_items i set applied_at = now()
     where i.id = p_item and i.applied_at is null;
  end if;

  perform archive_attention_item(p_item, p_decision, 'inbox-apply request ' || p_request);
  perform set_config('inbox_apply.item', '', true);
  return true;
end $$;

comment on function public.inbox_apply_archive(bigint, bigint, jsonb) is
  'Archives one answered Inbox item for the apply worker (181), with its decision record: an '
  'inbox-decision/1 object naming this item and request, a bucket, mode unattended, a change and a '
  'rule. Stamps applied_at when inbox_apply_writes holds a write for the item by this request (042''s '
  'F3 rule, read from the log). archived_by is inbox-apply request <id>. False when the item is no '
  'longer answered. Refuses any other decision shape and a request that is not the worker''s own '
  'claim. inbox_apply_runner only.';

create or replace function public.inbox_apply_run_facts(p_request bigint)
  returns jsonb
  stable
  language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_by text := 'inbox-apply request ' || p_request;
begin
  if p_request is null or not exists (
       select 1 from agent_requests a where a.id = p_request and a.kind = 'inbox_feedback') then
    raise exception 'inbox_apply_run_facts: % is not an inbox_feedback request', coalesce(p_request::text, 'null')
      using errcode = '22023';
  end if;
  return jsonb_build_object(
    'archived_ids', (select coalesce(jsonb_agg(i.id order by i.id), '[]'::jsonb)
                       from attention_items i where i.archived_by = v_by),
    'changed_ids', (select coalesce(jsonb_agg(distinct w.item_id), '[]'::jsonb)
                      from inbox_apply_writes w
                      join attention_items i on i.id = w.item_id and i.archived_by = v_by
                     where w.request_id = p_request),
    'writes', (select count(*) from inbox_apply_writes w where w.request_id = p_request),
    'unarchived_writes', (select coalesce(jsonb_agg(distinct w.item_id), '[]'::jsonb)
                            from inbox_apply_writes w
                            join attention_items i on i.id = w.item_id
                           where w.request_id = p_request and i.archived_by is distinct from v_by),
    'flagged', (select coalesce(jsonb_agg(jsonb_build_object('item', i.id, 'flagged', i.decision->'flagged')
                                          order by i.id), '[]'::jsonb)
                  from attention_items i
                 where i.archived_by = v_by and jsonb_typeof(i.decision->'flagged') = 'object'),
    'left_ids', (select coalesce(jsonb_agg(q.id order by q.id), '[]'::jsonb) from v_inbox_queue q));
end $$;

comment on function public.inbox_apply_run_facts(bigint) is
  'What an inbox_feedback request did, read from the tables (181): archived_ids (archived_by this '
  'request), changed_ids (archived items with a logged write), writes, unarchived_writes (items '
  'written but not archived, a batch that stopped mid-item), flagged, and left_ids (v_inbox_queue '
  'now). The worker builds its report from this, never from Claude''s text. inbox_apply_runner only.';

create or replace function public.inbox_apply_close(p_request bigint, p_state text, p_result jsonb)
  returns bigint
  language plpgsql security definer set search_path = public, pg_temp as $$
declare
  -- 180's lock: every function that files an inbox_feedback request takes it.
  c_lock_key constant bigint := 1400910002;
  v_skip     bigint[] := '{}';
  v_archived integer := 0;
  v_follow   bigint;
begin
  if p_result is null or jsonb_typeof(p_result) <> 'object'
     or jsonb_typeof(p_result->'lines') is distinct from 'array'
     or exists (select 1 from jsonb_array_elements(p_result->'lines') l where jsonb_typeof(l) <> 'string') then
    raise exception 'inbox_apply_close: the result must be an object whose lines is an array of text'
      using errcode = '22023';
  end if;
  if p_state is null or p_state not in ('done', 'failed') then
    raise exception 'inbox_apply_close: state must be done or failed, not %', coalesce(p_state, 'null')
      using errcode = '22023';
  end if;
  if p_result ? 'skip' then
    if jsonb_typeof(p_result->'skip') <> 'array'
       or exists (select 1 from jsonb_array_elements(p_result->'skip') s where jsonb_typeof(s) <> 'number') then
      raise exception 'inbox_apply_close: skip must be an array of item ids' using errcode = '22023';
    end if;
    select coalesce(array_agg((s #>> '{}')::bigint), '{}') into v_skip
      from jsonb_array_elements(p_result->'skip') s;
  end if;
  if jsonb_typeof(p_result->'archived') = 'number' then
    v_archived := (p_result->>'archived')::numeric::integer;
  end if;

  perform 1 from agent_requests a
    where a.id = p_request and a.kind = 'inbox_feedback' and a.state = 'claimed'
      and a.claimed_by = 'inbox-apply-runner'
    for update;
  if not found then
    raise exception 'inbox_apply_close: request % is not the apply worker''s claim', coalesce(p_request::text, 'null')
      using errcode = '22023';
  end if;

  update agent_requests a
     set state = p_state, finished_at = now(), result = p_result
   where a.id = p_request;

  if p_state = 'failed' then
    perform raise_attention(
      null, 'stack_must_confirm', null, 'agent_request',
      case when p_result->>'error' = 'sign_in_expired' then 'apply-login-required' else 'inbox-apply-failed' end,
      null, null, null,
      case when p_result->>'error' = 'sign_in_expired'
           then format('The apply worker''s Claude sign-in has expired, so Inbox apply request %s did not run. Renew the token (claude setup-token), then press Apply answers.', p_request)
           else format('Inbox apply request %s failed: %s. Answers it had already applied stay applied; press Apply answers to run the rest.',
                       p_request, left(coalesce(p_result->>'error', 'no error recorded'), 200))
      end,
      null);
  else
    -- A done run closes the two items a failed one raises (114's closed_itself record shape).
    update attention_items i
       set state = 'archived', archived_at = now(), archived_by = 'inbox-apply-runner',
           decision = jsonb_build_object('closed_itself', true, 'rule', 'a later apply run finished',
                                         'sync_run_id', null, 'trigger', 'inbox_apply_close')
     where i.kind = 'stack_must_confirm' and i.course_id is null and i.state = 'open'
       and i.ref in ('inbox-apply-failed', 'apply-login-required');
  end if;

  -- The rest of the queue: one follow-up, only after a run that archived something (so a batch
  -- that gets nowhere never loops), and never for rows this run could not apply (skip).
  if v_archived > 0 and exists (select 1 from v_inbox_queue q where not (q.id = any (v_skip))) then
    perform pg_advisory_xact_lock(c_lock_key);
    if not exists (select 1 from agent_requests a
                    where a.kind = 'inbox_feedback' and a.state in ('queued', 'claimed')) then
      insert into agent_requests (kind, scope, state, params, note)
      values ('inbox_feedback', 'all', 'queued',
              jsonb_build_object('trigger', 'followup', 'after', p_request, 'skip', to_jsonb(v_skip)),
              format('queued by the apply worker after request %s', p_request))
      returning id into v_follow;
    end if;
  end if;
  return v_follow;
end $$;

comment on function public.inbox_apply_close(bigint, text, jsonb) is
  'Closes an inbox_feedback request for the apply worker (181): its own claimed -> done or failed, '
  'with finished_at and result (an object whose lines is an array of text). A failed close raises one '
  'inbox-apply-failed item (apply-login-required for error sign_in_expired); a done close archives '
  'those two when open. When the run archived something (result.archived > 0) and v_inbox_queue still '
  'holds a row outside result.skip, files one queued follow-up {trigger: followup, after, skip} and '
  'returns its id; null otherwise. Refuses any other transition. inbox_apply_runner only.';

-- =============================================================================================
-- 6. Privileges
-- =============================================================================================
revoke all on function
  public.inbox_apply_claim(),
  public.inbox_apply_is_own_claim(bigint),
  public.inbox_apply_prepare(bigint),
  public.inbox_apply_begin_item(bigint, bigint),
  public.inbox_apply_archive(bigint, bigint, jsonb),
  public.inbox_apply_run_facts(bigint),
  public.inbox_apply_close(bigint, text, jsonb),
  public.inbox_apply_log_write()
from public, anon, authenticated, service_role;

grant execute on function
  public.inbox_apply_claim(),
  public.inbox_apply_prepare(bigint),
  public.inbox_apply_begin_item(bigint, bigint),
  public.inbox_apply_archive(bigint, bigint, jsonb),
  public.inbox_apply_run_facts(bigint),
  public.inbox_apply_close(bigint, text, jsonb)
to inbox_apply_runner;

-- New questions are raised only through raise_attention (the skill's rule).
grant execute on function
  public.raise_attention(bigint, text, text, text, text, text, jsonb, jsonb, text, jsonb)
to inbox_apply_runner;

-- The unit runs each call under `set local role inbox_apply_runner` (094's and 142's pattern).
grant inbox_apply_runner to db_test_runner with inherit false;

-- =============================================================================================
-- 7. Guard
-- =============================================================================================
do $$
declare
  v_got text;
begin
  -- (a) The role's attributes.
  if exists (select 1 from pg_roles
              where rolname = 'inbox_apply_runner'
                and (not rolcanlogin or rolinherit or rolbypassrls or rolsuper or rolcreaterole
                     or rolcreatedb or rolreplication or rolconnlimit <> 4)) then
    raise exception 'FAIL 181: inbox_apply_runner is not login, noinherit, nobypassrls, connection limit 4 and nothing more';
  end if;
  if not exists (select 1 from pg_roles where rolname = 'inbox_apply_runner'
                    and coalesce(rolconfig, '{}') @> array['statement_timeout=30s']) then
    raise exception 'FAIL 181: inbox_apply_runner has no statement_timeout = 30s';
  end if;

  -- (b) The SECURITY DEFINER functions it can run are exactly these seven.
  select string_agg(p.proname, ',' order by p.proname) into v_got
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prosecdef
     and has_function_privilege('inbox_apply_runner', p.oid, 'execute');
  if v_got is distinct from
     'inbox_apply_archive,inbox_apply_begin_item,inbox_apply_claim,inbox_apply_close,'
     'inbox_apply_prepare,inbox_apply_run_facts,raise_attention' then
    raise exception 'FAIL 181: inbox_apply_runner executes SECURITY DEFINER functions %, expected the seven', v_got;
  end if;

  -- (c) Its table-level privileges in public are exactly these, and it deletes and truncates nothing.
  select string_agg(c.relname || ':' || p.priv, ',' order by c.relname, p.priv) into v_got
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    cross join (values ('select'), ('insert'), ('update'), ('delete'), ('truncate')) p(priv)
   where n.nspname = 'public' and c.relkind in ('r', 'v', 'm', 'p')
     and has_table_privilege('inbox_apply_runner', c.oid, p.priv);
  if v_got is distinct from
     'assignment_progress:insert,assignment_progress:select,assignment_progress:update,'
     'assignments:insert,assignments:select,assignments:update,attention_items:select,'
     'bb_gradebook:select,course_staff:insert,course_staff:select,course_staff:update,'
     'courses:select,grade_components:select,inbox_apply_writes:insert,sync_runs:select,'
     'v_gradebook_latest:select,v_inbox_queue:select' then
    raise exception 'FAIL 181: inbox_apply_runner holds table privileges %', v_got;
  end if;

  -- (d) Its column-level privileges are the three named in section 3.
  select string_agg(table_name || '.' || column_name || ':' || lower(privilege_type), ','
                    order by table_name, column_name, privilege_type) into v_got
    from information_schema.column_privileges
   where table_schema = 'public' and grantee = 'inbox_apply_runner'
     and table_name in ('courses', 'app_settings', 'attention_items')
     and not (table_name in ('courses', 'attention_items') and privilege_type = 'SELECT');
  if v_got is distinct from
     'app_settings.gcal_dirty:select,app_settings.gcal_dirty:update,app_settings.id:select,'
     'courses.group_notes:update' then
    raise exception 'FAIL 181: inbox_apply_runner holds column privileges %', v_got;
  end if;

  -- (e) The four log triggers.
  if (select count(*) from pg_trigger g
       where g.tgname like '%\_inbox\_apply\_log' and not g.tgisinternal
         and g.tgfoid = 'public.inbox_apply_log_write()'::regprocedure) <> 4 then
    raise exception 'FAIL 181: the write-log trigger is not on exactly four tables';
  end if;

  -- (f) Nobody else runs the worker's functions; the helper is the owner's alone.
  if exists (
       select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname like 'inbox\_apply\_%'
          and (has_function_privilege('anon', p.oid, 'execute')
               or has_function_privilege('authenticated', p.oid, 'execute')
               or has_function_privilege('service_role', p.oid, 'execute')
               or has_function_privilege('sync_runner', p.oid, 'execute'))) then
    raise exception 'FAIL 181: an inbox_apply function is executable beyond inbox_apply_runner';
  end if;
  if has_function_privilege('inbox_apply_runner', 'public.inbox_apply_is_own_claim(bigint)', 'execute') then
    raise exception 'FAIL 181: inbox_apply_is_own_claim is executable by inbox_apply_runner';
  end if;

  -- (g) The role is granted to db_test_runner only (inherit false, set true); postgres holds it
  --     with admin only, as its creator.
  if not exists (select 1 from pg_auth_members m
                  where m.roleid = 'inbox_apply_runner'::regrole and m.member = 'db_test_runner'::regrole
                    and not m.admin_option and not m.inherit_option and m.set_option) then
    raise exception 'FAIL 181: db_test_runner does not hold inbox_apply_runner with inherit false and set true';
  end if;
end $$;

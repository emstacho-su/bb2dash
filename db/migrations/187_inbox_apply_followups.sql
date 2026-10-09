-- bb2dash :: db/migrations/187_inbox_apply_followups.sql
-- Phase 23 follow-ups (brief 110, frozen 2026-10-08; Stack's answers of that day). 180 to 186 stay
-- byte-frozen; this re-creates five functions, adds one table, four functions, one view and one
-- function for the acceptance run, and marks one test item.
--
-- WHY
--   1. An answer the apply worker cannot apply was handed to Claude again after every sync, each try
--      a run on Stack's plan (up to 12 a day). The worker now reports what it could not apply, the
--      database remembers it as a HOLD, and a sync files nothing for held answers alone. The hold is
--      a stored fact in a table no login can write (186 read the same fact from agent_requests,
--      which the owner's app login and the test login can write), and it is tied to the answer: it
--      stores the `resolved_at` the run was handed and holds only while the row still carries that
--      exact time, so no clock is compared and an answer given again is never held untried.
--   2. The decisions exporter could not file "notes only": the mark required both a vault note path
--      and a day-file path, and once a row was marked the later manual step could not find it. The
--      mark is now two steps (note, then log), and a decision can be marked skipped.
--   3. The acceptance run (acceptance/23) cannot answer Stack's own Inbox questions, and a proof may
--      not name `params` or `result`. It gets a function that raises four test questions of its own
--      through the owner's session, and a view with typed columns over the apply requests.
--
-- WHAT
--   Section 1, the hold
--     - table inbox_apply_holds (item_id, request_id, resolved_at, held_at): row level security on,
--       no policy, every privilege revoked from public, anon, authenticated and service_role, select
--       for the test login alone. Only inbox_apply_close writes it, with its owner's rights.
--     - inbox_apply_held_items(): the ids of the answered rows that have a hold for their current
--       answer and still need a reader (a row with applied_at set and no note needs none: the worker
--       records it without a run). SECURITY DEFINER, because the table grants nothing.
--     - re-created: sync_request_inbox_apply(bigint), inbox_apply_prepare(bigint),
--       inbox_apply_close(bigint, text, jsonb). Round 2 (brief 110): a press of Apply answers tries
--       held answers through its whole chain (a retry request: no trigger, or retry_held true); a
--       NEW hold is written by a failed close only; the failure notice also keeps 186's own arm, so
--       the old worker (no skip_seen, no hold) is no step back from 186
--   Section 2, filing in two steps
--     - re-created: inbox_decision_filed(bigint, jsonb)
--     - new: inbox_decisions_unlogged(integer), inbox_decision_logged(bigint, text),
--       inbox_decision_skipped(bigint, text); all four invoker rights, the service role's alone (and
--       the test login's, as 182's are)
--     - item 3782, the test item of the cut-over run, is marked skipped by this file's own guarded
--       statement (it has a logged write, which inbox_decision_skipped refuses, R5); on a database
--       without that row nothing is marked
--   Section 3, the acceptance objects
--     - view v_inbox_apply_runs: one row per inbox_feedback request, typed columns only
--     - inbox_accept_question(text, text): SECURITY DEFINER, authenticated only, owner check first
--   Section 4, a guard block that reads the privileges back
--
-- WHERE EACH RE-CREATED BODY CAME FROM (prod is byte-identical to the repo, so the live body is the
-- body of the last migration that created the function). Every change is marked `-- 187:`.
--     sync_request_inbox_apply   180 (no later migration re-creates it)
--     inbox_apply_prepare        185 (181's, then 185's)
--     inbox_apply_close          186 (181's, 185's, then 186's)
--     inbox_decision_filed       182 (no later migration re-creates it)
-- Signatures, argument names, return types, SECURITY DEFINER or invoker rights, the pinned
-- search_path and every existing grant are unchanged (`create or replace` keeps the grants). The
-- bodies keep the words `session_link` (185's pin) and `c_signed_in` (186's pin).
--
-- THE RUNNING WORKER. Between this file and the rebuild of the `apply` container, the old worker
-- runs on these functions: it ignores `held` and sends no `skip_seen`, so no hold is written and the
-- service behaves as it does today until the cut-over.
--
-- Additive in effect: no drop, no rename, no grant taken from a role that holds it.

do $$
begin
  if to_regprocedure('public.inbox_apply_close(bigint, text, jsonb)') is null
     or position('c_signed_in' in (select prosrc from pg_proc
                                    where oid = 'public.inbox_apply_close(bigint, text, jsonb)'::regprocedure)) = 0 then
    raise exception '187: inbox_apply_close is not 186''s body; apply 180 to 186 first';
  end if;
  if to_regprocedure('public.inbox_apply_prepare(bigint)') is null
     or position('session_link' in (select prosrc from pg_proc
                                     where oid = 'public.inbox_apply_prepare(bigint)'::regprocedure)) = 0 then
    raise exception '187: inbox_apply_prepare is not 185''s body; apply 180 to 186 first';
  end if;
  if to_regprocedure('public.inbox_decision_filed(bigint, jsonb)') is null
     or to_regprocedure('public.sync_request_inbox_apply(bigint)') is null then
    raise exception '187: 180 and 182 are not applied';
  end if;
  if not exists (select 1 from pg_roles where rolname = 'db_test_runner') then
    raise exception '187: role db_test_runner does not exist; apply 100_db_test_runner_role first';
  end if;
end $$;

-- =============================================================================================
-- 1. The hold
-- =============================================================================================
create table if not exists public.inbox_apply_holds (
  item_id     bigint primary key references public.attention_items (id) on delete cascade,
  request_id  bigint not null,
  resolved_at timestamptz,
  held_at     timestamptz not null default now()
);

alter table public.inbox_apply_holds enable row level security;

comment on table public.inbox_apply_holds is
  'Answers the apply worker could not apply (187): one row per Inbox item, written only by '
  'inbox_apply_close with its owner''s rights. resolved_at is the answer''s resolved_at as the run was '
  'handed it; the item is held only while its queue row still carries that exact time (so an answer '
  'given again is not held). No policy and no grant but select for the test login: read through '
  'inbox_apply_held_items().';
comment on column public.inbox_apply_holds.item_id is 'The Inbox item (attention_items.id).';
comment on column public.inbox_apply_holds.request_id is
  'The inbox_feedback request whose run could not apply the item. Informational: no foreign key, '
  'so deleting a request never drops a hold.';
comment on column public.inbox_apply_holds.resolved_at is
  'The answer''s resolved_at as the run was handed it by inbox_apply_prepare. Null when the row had none.';
comment on column public.inbox_apply_holds.held_at is 'When the hold was written (or last replaced by a newer answer''s).';

revoke all on public.inbox_apply_holds from public, anon, authenticated, service_role, inbox_apply_runner, sync_runner;
-- The test login reads every table (100's default privileges); it is stated here so the guard can
-- hold it to exactly select.
grant select on public.inbox_apply_holds to db_test_runner;

create or replace function public.inbox_apply_held_items()
  returns setof bigint
  stable
  language sql security definer set search_path = public, pg_temp as $$
  select h.item_id
    from public.inbox_apply_holds h
    join public.v_inbox_queue q on q.id = h.item_id
   -- A hold is tied to the answer: the exact resolved_at the run was handed.
   where h.resolved_at is not distinct from q.resolved_at
     -- A row with applied_at set and no note needs no reader: the worker records it without a run.
     and not (q.was_applied and not q.has_note)
   order by h.item_id
$$;

comment on function public.inbox_apply_held_items() is
  'The ids of the answered Inbox rows (v_inbox_queue) that the apply worker could not apply and that '
  'still carry the same answer (187): a row of inbox_apply_holds whose resolved_at equals the queue '
  'row''s, unless the row has applied_at set and no note (the worker records that without a run). '
  'Reads the table and the queue, never agent_requests. SECURITY DEFINER because the table grants '
  'nothing; the service role and the test login only.';

revoke all on function public.inbox_apply_held_items()
  from public, anon, authenticated, inbox_apply_runner, sync_runner;
grant execute on function public.inbox_apply_held_items() to service_role, db_test_runner;

-- ---------------------------------------------------------------------------------------------
-- sync_request_inbox_apply: 180's body; held answers alone file nothing
-- ---------------------------------------------------------------------------------------------
create or replace function public.sync_request_inbox_apply(p_after bigint)
  returns bigint
  language plpgsql security definer set search_path = public, pg_temp as $$
declare
  -- One lock for every inbox_feedback filing, so two callers never insert two open requests.
  c_lock_key constant bigint := 1400910002;
  v_id bigint;
begin
  -- Only after a sync this runner closed done: a failed sync files nothing, and neither does a
  -- sync the Windows skill ran (it files its own).
  if p_after is null or not exists (
       select 1 from agent_requests a
        where a.id = p_after and a.kind = 'sync' and a.state = 'done'
          and a.claimed_by = 'sync-runner') then
    return null;
  end if;

  perform pg_advisory_xact_lock(c_lock_key);

  -- One request at a time (the skill's rule): an open one is the answer.
  select a.id into v_id
    from agent_requests a
   where a.kind = 'inbox_feedback' and a.state in ('queued', 'claimed')
   order by a.created_at, a.id
   limit 1;
  if found then
    return v_id;
  end if;

  -- The Inbox's "Answered, not applied" section is v_inbox_queue (090): nothing there, nothing to do.
  -- 187: nor when every row there is a held answer (inbox_apply_held_items): a sync does not try
  -- them again. A press of Apply answers does.
  if not exists (select 1 from v_inbox_queue q
                  where not exists (select 1 from public.inbox_apply_held_items() as h(id) where h.id = q.id)) then
    return null;
  end if;

  insert into agent_requests (kind, scope, state, params, note)
  values ('inbox_feedback', 'all', 'queued',
          jsonb_build_object('trigger', 'sync', 'after', p_after),
          format('queued by the sync runner after sync %s', p_after))
  returning id into v_id;
  return v_id;
end $$;

comment on function public.sync_request_inbox_apply(bigint) is
  'After a sync the sync runner closed done (180, 187): files one queued inbox_feedback request with '
  'params {"trigger": "sync", "after": <sync request id>} when v_inbox_queue holds a row that is not a '
  'held answer (inbox_apply_held_items). Under an advisory lock, returns the open inbox_feedback '
  'request''s id if one is queued or claimed; returns null and inserts nothing when the queue is empty '
  'or holds held answers alone, or p_after is not a done sync claimed by sync-runner. The apply '
  'container runs the request; the sync holds no LLM (B-43). sync_runner only.';

-- ---------------------------------------------------------------------------------------------
-- inbox_apply_prepare: 185's body plus `held`
-- ---------------------------------------------------------------------------------------------
create or replace function public.inbox_apply_prepare(p_request bigint)
  returns jsonb
  language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_params jsonb;
  -- 187: the answers the worker holds, for a request a sync, a follow-up or the fallback skill filed.
  v_held   jsonb := '[]'::jsonb;   -- 187:
begin
  if not inbox_apply_is_own_claim(p_request) then
    raise exception 'inbox_apply_prepare: request % is not the apply worker''s claim', coalesce(p_request::text, 'null')
      using errcode = '22023';
  end if;

  -- 042's writer first, always (the skill's step 2): an answer given between folds is still
  -- applied_at null, and archiving it would take it out of 042's scan for good.
  perform apply_resolutions();

  select a.params into v_params from agent_requests a where a.id = p_request;

  -- 187 (R3): a sync's, a follow-up's and the fallback skill's request carry a trigger; the Inbox
  -- button's carries none, so a press gets an empty list and tries held answers again (open item
  -- O-1). Inside a press's chain (a follow-up with retry_held, the JSON boolean true and nothing
  -- else) only what that chain itself already failed on, the request's own skip, is left alone,
  -- which is 186's rule and keeps the chain from looping. Every other request gets the held set.
  -- A login that can insert a request can at most ask for what a press does; it cannot make
  -- anything held.
  if coalesce(v_params->>'trigger', '') = '' then
    null;
  elsif v_params->'retry_held' = 'true'::jsonb then
    select coalesce(jsonb_agg(s.v order by s.ord), '[]'::jsonb) into v_held
      from jsonb_array_elements(case when jsonb_typeof(v_params->'skip') = 'array'
                                     then v_params->'skip' else '[]'::jsonb end)
           with ordinality as s(v, ord)
     where jsonb_typeof(s.v) = 'number';
  else
    select coalesce(jsonb_agg(h.id order by h.id), '[]'::jsonb) into v_held
      from public.inbox_apply_held_items() as h(id);
  end if;

  return jsonb_build_object(
    'params', coalesce(v_params, '{}'::jsonb),
    'queue', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', q.id, 'kind', q.kind, 'course_id', q.course_id, 'entity', q.entity, 'ref', q.ref,
               'field', q.field, 'question', q.question, 'state', q.state, 'accept', q.accept,
               'has_note', q.has_note, 'was_applied', q.was_applied, 'applied_at', q.applied_at,
               'resolved_at', q.resolved_at,
               -- 185: the question link_file_sessions raises (123), and nothing that only looks like it.
               'session_link', (
                 select jsonb_build_object(
                          'file_id', sl.file_id,
                          'pick', case when q.resolution->>'session_id' ~ '^[0-9]{1,18}$'
                                       then (q.resolution->>'session_id')::bigint end,
                          'file_found', f.id is not null,
                          'file_current', f.id is not null and f.superseded_by is null,
                          'file_session_id', f.session_id)
                   from (select substring(q.ref from '^session_link/([0-9]{1,18})$')::bigint as file_id) sl
                   left join bb_files f on f.id = sl.file_id
                  where q.kind = 'stack_must_confirm' and q.entity = 'bb_file' and q.field = 'session_id'
                    and sl.file_id is not null))
               order by q.course_id nulls last, q.resolved_at, q.id), '[]'::jsonb)
        from v_inbox_queue q),
    'runs_today', (
      select count(*) from agent_requests a
       where a.kind = 'inbox_feedback' and a.id <> p_request
         and a.claimed_by = 'inbox-apply-runner'
         and a.result->'claude'->>'started' = 'true'
         and (a.claimed_at at time zone 'America/New_York')::date
             = (now() at time zone 'America/New_York')::date),
    'held', v_held);   -- 187:
end $$;

comment on function public.inbox_apply_prepare(bigint) is
  'Step 2 of /inbox-apply for the apply worker (181, 185, 187): runs apply_resolutions(), then returns '
  '{params, queue, runs_today, held}: the request''s params, every v_inbox_queue row in the skill''s '
  'order, how many of the worker''s requests started Claude on this New York day (the worker''s daily '
  'cap), and held: a JSON array of item ids the worker must not hand to Claude: inbox_apply_held_items() '
  'for a request whose params carry a trigger, the request''s own params.skip for one with retry_held '
  'true (a follow-up inside a press''s chain), an empty array for one that carries no trigger (the button''s). '
  'Since 185 each queue row carries session_link: for a session answer (session_link/<file id>) the '
  'file, Stack''s pick and the session the file carries now; null for any other row. '
  'Refuses a request that is not the worker''s own claim. inbox_apply_runner only.';

-- ---------------------------------------------------------------------------------------------
-- inbox_apply_close: 186's body; the holds are written from skip and skip_seen, the held test, one
-- sentence
-- ---------------------------------------------------------------------------------------------
create or replace function public.inbox_apply_close(p_request bigint, p_state text, p_result jsonb)
  returns bigint
  language plpgsql security definer set search_path = public, pg_temp as $$
declare
  -- 180's lock: every function that files an inbox_feedback request takes it.
  c_lock_key   constant bigint := 1400910002;
  c_claimant   constant text := 'inbox-apply-runner';
  -- The run errors (apply/src/report.ts) that only a run whose sign-in worked can end with.
  c_signed_in  constant text[] := array['not_applied', 'timed_out', 'usage_limit', 'budget_exceeded'];
  v_skip       bigint[] := '{}';
  v_archived   integer := 0;
  v_follow     bigint;
  v_signed_in  boolean;
  v_stuck      boolean;
  v_one        jsonb;      -- 187:
  v_params     jsonb;      -- 187: the request's params, for v_retry and the hold insert
  v_retry      boolean;    -- 187: a press of Apply answers and its chain (R3)
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
  -- 187: skip_seen is the time the run was handed for each skipped item: [{id, resolved_at}], the
  -- time exactly as inbox_apply_prepare gave it (a string) or null. Anything else is refused, as a
  -- malformed skip is. A close with no skip_seen writes no hold.
  if p_result ? 'skip_seen' then
    if jsonb_typeof(p_result->'skip_seen') <> 'array' then
      raise exception 'inbox_apply_close: skip_seen must be an array of {id, resolved_at}' using errcode = '22023';
    end if;
    for v_one in select e.value from jsonb_array_elements(p_result->'skip_seen') as e(value) loop
      if jsonb_typeof(v_one) <> 'object'
         or jsonb_typeof(v_one->'id') is distinct from 'number'
         or coalesce(jsonb_typeof(v_one->'resolved_at'), 'null') not in ('string', 'null') then
        raise exception 'inbox_apply_close: skip_seen must be an array of {id, resolved_at}' using errcode = '22023';
      end if;
      begin
        if (v_one->>'id')::numeric <> trunc((v_one->>'id')::numeric) then
          raise exception 'inbox_apply_close: skip_seen holds an id that is not a whole number' using errcode = '22023';
        end if;
        perform ((v_one->>'id')::numeric)::bigint;
        if v_one->>'resolved_at' is not null then
          perform (v_one->>'resolved_at')::timestamptz;
        end if;
      exception when others then
        raise exception 'inbox_apply_close: skip_seen holds an id or a time that does not parse' using errcode = '22023';
      end;
    end loop;
  end if;
  if jsonb_typeof(p_result->'archived') = 'number' then
    v_archived := (p_result->>'archived')::numeric::integer;
  end if;

  -- 187: select ... into v_params replaces 186's `perform 1` (same lock, same conditions).
  select a.params into v_params from agent_requests a
    where a.id = p_request and a.kind = 'inbox_feedback' and a.state = 'claimed'
      and a.claimed_by = c_claimant
    for update;
  if not found then
    raise exception 'inbox_apply_close: request % is not the apply worker''s claim', coalesce(p_request::text, 'null')
      using errcode = '22023';
  end if;
  -- 187 (R3): a retry request is one a press of Apply answers started: no trigger in its params, or
  -- retry_held as the JSON boolean true (a follow-up inside that press's chain; nothing else counts).
  v_retry := coalesce(v_params->>'trigger', '') = '' or v_params->'retry_held' = 'true'::jsonb;

  update agent_requests a
     set state = p_state, finished_at = now(), result = p_result
   where a.id = p_request;

  -- 187: the holds, before either test below. A new hold is a FAILED close's alone: the worker never
  -- closes done with an answer newly left behind (that is not_applied, a failed close), and only a
  -- failed close raises the notice. One for each id of this close's skip that skip_seen gives a time
  -- for, that is still in the queue, and whose queue row still carries that same time: an answer
  -- given again while the run was open carries a newer time and is not held, because no run tried
  -- it. A hold for the same answer is kept as it is; one for an older answer is replaced.
  if p_state = 'failed' and p_result ? 'skip_seen' then
    insert into inbox_apply_holds (item_id, request_id, resolved_at, held_at)
    select distinct on (q.id) q.id, p_request, q.resolved_at, now()
      from jsonb_array_elements(p_result->'skip_seen') as e(value)
      join v_inbox_queue q
        on q.id = ((e.value->>'id')::numeric)::bigint
       and q.resolved_at is not distinct from (e.value->>'resolved_at')::timestamptz
     where q.id = any (v_skip)
       -- 187 (round 3): the failed close of a retry follow-up writes no hold for an id in that
       -- request's own params.skip. It was handed those ids as `held`, the worker copies them into
       -- its skip with the answer's present time, and this run never tried them: an answer given
       -- again in the middle of a press's chain, or a hand-written request, would be held untried.
       -- A hold that already stands for the same answer is untouched; the id stays in v_skip, so
       -- the notice stays open. (`is not true`: the conjunction is null for an ordinary request.)
       and (coalesce(v_params->>'trigger', '') <> ''
            and v_params->'retry_held' = 'true'::jsonb
            and jsonb_typeof(v_params->'skip') = 'array'
            and v_params->'skip' @> to_jsonb(q.id)) is not true
     order by q.id
    on conflict (item_id) do update
      set request_id = excluded.request_id, resolved_at = excluded.resolved_at, held_at = excluded.held_at
      where inbox_apply_holds.resolved_at is distinct from excluded.resolved_at;
  end if;
  -- 187: and, on either close, the holds whose item has left the queue or was answered again are removed.
  delete from inbox_apply_holds h
   where not exists (select 1 from v_inbox_queue q
                      where q.id = h.item_id and q.resolved_at is not distinct from h.resolved_at);

  if p_state = 'failed' then
    perform raise_attention(
      null, 'stack_must_confirm', null, 'agent_request',
      case when p_result->>'error' = 'sign_in_expired' then 'apply-login-required' else 'inbox-apply-failed' end,
      null, null, null,
      case
        when p_result->>'error' = 'sign_in_expired'
          then format('The apply worker''s Claude sign-in has expired, so Inbox apply request %s did not run. Renew the token (claude setup-token), then press Apply answers.', p_request)
        -- 187: answers a run could not apply are held. A sync does not try them again; a new answer
        -- to one of them, or a press of Apply answers, does. No Undo: the card offers none for every row.
        -- Only when the close sends skip_seen: the old worker writes no hold, every sync still
        -- retries, and 186's sentence below is the true one for it.
        when p_result->>'error' = 'not_applied' and p_result ? 'skip_seen'
          then format('Inbox apply request %s failed: %s. Answers it had already applied stay applied. A sync does not try again the answers it could not apply; a new answer to one of them, or a press of Apply answers, does.',
                      p_request, left(coalesce(p_result->>'error', 'no error recorded'), 200))
        else format('Inbox apply request %s failed: %s. Answers it had already applied stay applied; press Apply answers to run the rest.',
                    p_request, left(coalesce(p_result->>'error', 'no error recorded'), 200))
      end,
      null);
  end if;

  -- The two notices a failed close raises close themselves (114's closed_itself record shape), each
  -- once what it says is no longer true and not before.
  -- "Sign in again": a run that started Claude and got as far as a result has signed in.
  v_signed_in := p_result->'claude'->>'started' = 'true'
                 and (p_state = 'done' or (p_result->>'error' = any (c_signed_in)) is true);
  -- 187: "The apply run failed ... ": an answer a failed run could not apply still waits. Three arms
  -- (R4): this close's own skip; a waiting answer that is held; and 186's own arm exactly as it was
  -- (a failed request of the worker listed the id in its skip and finished at or after the answer's
  -- resolved_at), which still covers the old worker, that sends no skip_seen and so writes no
  -- hold. Only this notice reads that third arm, and it decides nothing else: the hold,
  -- inbox_apply_held_items(), sync_request_inbox_apply and prepare never read agent_requests for it,
  -- because other logins can write it (finding F2). The request just closed is in that arm when it
  -- failed.
  v_stuck := exists (
    select 1 from v_inbox_queue q
     where q.id = any (v_skip)
        or exists (select 1 from public.inbox_apply_held_items() as h(id) where h.id = q.id)
        or exists (select 1 from agent_requests a
                    where a.kind = 'inbox_feedback' and a.state = 'failed' and a.claimed_by = c_claimant
                      and jsonb_typeof(a.result->'skip') = 'array'
                      and a.result->'skip' @> to_jsonb(q.id)
                      and a.finished_at >= coalesce(q.resolved_at, '-infinity'::timestamptz)));
  update attention_items i
     set state = 'archived', archived_at = now(), archived_by = c_claimant,
         decision = jsonb_build_object('closed_itself', true, 'rule', 'a later apply run finished',
                                       'sync_run_id', null, 'trigger', 'inbox_apply_close')
   where i.kind = 'stack_must_confirm' and i.course_id is null and i.state = 'open'
     and (   (i.ref = 'apply-login-required' and v_signed_in)
          or (i.ref = 'inbox-apply-failed' and p_state = 'done' and not v_stuck));

  -- The rest of the queue: one follow-up, only after a run that archived something (so a batch
  -- that gets nowhere never loops), and never for rows this run could not apply (skip). 187: a
  -- retry request's (R3) follow-up is filed while any row outside this close's skip waits, held or
  -- not, and carries retry_held so its own prepare leaves alone only this close's skip; every other
  -- request's also leaves out the held rows, which a follow-up would only skip.
  if v_archived > 0 and exists (
       select 1 from v_inbox_queue q
        where not (q.id = any (v_skip))
          and (v_retry
               or not exists (select 1 from public.inbox_apply_held_items() as h(id) where h.id = q.id))) then
    perform pg_advisory_xact_lock(c_lock_key);
    if not exists (select 1 from agent_requests a
                    where a.kind = 'inbox_feedback' and a.state in ('queued', 'claimed')) then
      insert into agent_requests (kind, scope, state, params, note)
      values ('inbox_feedback', 'all', 'queued',
              jsonb_build_object('trigger', 'followup', 'after', p_request, 'skip', to_jsonb(v_skip))
                || case when v_retry then jsonb_build_object('retry_held', true) else '{}'::jsonb end,
              format('queued by the apply worker after request %s', p_request))
      returning id into v_follow;
    end if;
  end if;
  return v_follow;
end $$;

comment on function public.inbox_apply_close(bigint, text, jsonb) is
  'Closes an inbox_feedback request for the apply worker (181, 186, 187): its own claimed -> done or '
  'failed, with finished_at and result (an object whose lines is an array of text). result.skip lists '
  'the answers the run could not apply; result.skip_seen, a list of {id, resolved_at} (the time exactly '
  'as inbox_apply_prepare gave it), lets this close write a hold in inbox_apply_holds for each skipped id '
  'that is still in v_inbox_queue with that same resolved_at, and a malformed skip_seen is refused '
  '(22023); a close with no skip_seen writes no hold. The same close removes the holds whose item left '
  'the queue or was answered again. A failed close raises one inbox-apply-failed item (apply-login-required '
  'for error sign_in_expired; for error not_applied it says a sync does not try the answers again). '
  'apply-login-required is archived by a close whose run started Claude and ended done or with not_applied, '
  'timed_out, usage_limit or budget_exceeded; inbox-apply-failed by a done close unless an answer in this '
  'close''s skip, a held answer (inbox_apply_held_items), or 186''s own arm (a failed request of the '
  'worker listed it in its skip at or after the answer''s resolved_at), is still in v_inbox_queue. A new '
  'hold is written by a failed close only. When the run archived something (result.archived > 0) and '
  'v_inbox_queue still holds a row outside result.skip that is not held, files one queued follow-up '
  '{trigger: followup, after, skip} and returns its id; for a retry request (no trigger in its params, '
  'or retry_held the JSON true: a press of Apply answers and its chain) held rows count too and the '
  'follow-up carries retry_held: true. Null otherwise. Refuses any other transition. inbox_apply_runner '
  'only.';

-- =============================================================================================
-- 2. Filing a decision in two steps
-- =============================================================================================
-- inbox_decision_filed: 182's body. 187: log_path may be absent or null, which means the day-file
-- entry is not written yet; when present it is a non-empty string. note_path is still required.
create or replace function public.inbox_decision_filed(p_id bigint, p_filed jsonb)
  returns boolean
  language plpgsql set search_path = public, pg_temp as $$
begin
  -- 187: the log_path test now lets an absent or null log_path through.
  if p_filed is null or jsonb_typeof(p_filed) <> 'object'
     or jsonb_typeof(p_filed->'note_path') is distinct from 'string' or btrim(p_filed->>'note_path') = ''
     or (p_filed ? 'log_path' and jsonb_typeof(p_filed->'log_path') <> 'null'
         and (jsonb_typeof(p_filed->'log_path') <> 'string' or btrim(p_filed->>'log_path') = '')) then
    raise exception 'inbox_decision_filed: p_filed must be an object with a note_path and, if it has a log_path, a non-empty one'
      using errcode = '22023';
  end if;

  update attention_items i
     set decision_filed_at = now(), decision_filed = p_filed
   where i.id = p_id and i.state = 'archived'
     and i.decision->>'schema' = 'inbox-decision/1'
     and i.decision_filed_at is null;
  return found;
end $$;

comment on function public.inbox_decision_filed(bigint, jsonb) is
  'Marks one archived inbox-decision/1 row as filed (182, 187): sets decision_filed_at and decision_filed '
  '({note_path, log_path?, ...}). note_path is required; log_path may be absent or null, which means the '
  'day-file entry is not written yet (inbox_decisions_unlogged lists the row, inbox_decision_logged '
  'completes it), and when present it is a non-empty string. Once only: false when the row is already '
  'filed, is not archived, or carries no inbox-decision/1 record. Invoker rights; service_role only (the '
  'host exporter).';

create or replace function public.inbox_decisions_unlogged(p_limit integer default 100)
  returns table (
    id bigint, kind text, course_id text, entity text, ref text, field text, question text,
    resolution jsonb, resolution_note text, resolved_at timestamptz, applied_at timestamptz,
    archived_at timestamptz, archived_by text, decision jsonb)
  stable
  language sql set search_path = public, pg_temp as $$
  select i.id, i.kind, i.course_id, i.entity, i.ref, i.field, i.question,
         i.resolution, i.resolution_note, i.resolved_at, i.applied_at,
         i.archived_at, i.archived_by, i.decision
    from attention_items i
   where i.state = 'archived'
     and i.decision->>'schema' = 'inbox-decision/1'
     and i.decision_filed_at is not null
     and jsonb_typeof(i.decision_filed->'note_path') = 'string'
     and coalesce(jsonb_typeof(i.decision_filed->'log_path'), 'null') = 'null'
   order by i.archived_at, i.id
   limit greatest(1, least(coalesce(p_limit, 100), 500));
$$;

comment on function public.inbox_decisions_unlogged(integer) is
  'The archived inbox-decision/1 rows that are filed with a note path and no log path yet (187), oldest '
  'first, at most p_limit (1 to 500, default 100), with the same columns as inbox_decisions_unfiled. A '
  'row marked skipped has no note path and is never listed. Invoker rights; service_role only (the host '
  'exporter).';

create or replace function public.inbox_decision_logged(p_id bigint, p_log_path text)
  returns boolean
  language plpgsql set search_path = public, pg_temp as $$
begin
  if p_log_path is null or btrim(p_log_path) = '' then
    raise exception 'inbox_decision_logged: p_log_path must be a non-empty path' using errcode = '22023';
  end if;

  update attention_items i
     set decision_filed = i.decision_filed || jsonb_build_object('log_path', p_log_path, 'logged_at', now())
   where i.id = p_id and i.state = 'archived'
     and i.decision->>'schema' = 'inbox-decision/1'
     and i.decision_filed_at is not null
     and jsonb_typeof(i.decision_filed->'note_path') = 'string'
     and coalesce(jsonb_typeof(i.decision_filed->'log_path'), 'null') = 'null';
  return found;
end $$;

comment on function public.inbox_decision_logged(bigint, text) is
  'Completes the second step of filing (187): adds log_path and logged_at to decision_filed on an '
  'archived inbox-decision/1 row that is filed with a note path and no log path. Once only: false when '
  'the row is not such a row (already logged, never filed, skipped, not archived). Invoker rights; '
  'service_role only (the host exporter).';

create or replace function public.inbox_decision_skipped(p_id bigint, p_why text)
  returns boolean
  language plpgsql set search_path = public, pg_temp as $$
begin
  if p_why is null or btrim(p_why) = '' then
    raise exception 'inbox_decision_skipped: p_why must say why' using errcode = '22023';
  end if;

  -- R5: a decision whose item has a logged write (inbox_apply_writes) is never skipped: every write
  -- must reach that day's log, and the worker's role can raise a row of the shape the exporter skips
  -- as a test question. Refused as "nothing to mark" (false), so the exporter files the row as usual.
  if exists (select 1 from inbox_apply_writes w where w.item_id = p_id) then
    return false;
  end if;

  update attention_items i
     set decision_filed_at = now(),
         decision_filed = jsonb_build_object('skipped', true, 'why', left(btrim(p_why), 200))
   where i.id = p_id and i.state = 'archived'
     and i.decision->>'schema' = 'inbox-decision/1'
     and i.decision_filed_at is null;
  return found;
end $$;

comment on function public.inbox_decision_skipped(bigint, text) is
  'Marks one archived inbox-decision/1 row as filed with nothing to file (187): decision_filed = '
  '{"skipped": true, "why": ...}, no path. Neither inbox_decisions_unfiled nor inbox_decisions_unlogged '
  'lists it afterwards. Once only: false when the row is already filed or skipped, is not archived, '
  'carries no inbox-decision/1 record, or has a row in inbox_apply_writes (a logged write is never '
  'skipped, R5). Invoker rights; service_role only (the host exporter).';

revoke all on function
  public.inbox_decision_filed(bigint, jsonb),
  public.inbox_decisions_unlogged(integer),
  public.inbox_decision_logged(bigint, text),
  public.inbox_decision_skipped(bigint, text)
from public, anon, authenticated, inbox_apply_runner, sync_runner;

grant execute on function
  public.inbox_decision_filed(bigint, jsonb),
  public.inbox_decisions_unlogged(integer),
  public.inbox_decision_logged(bigint, text),
  public.inbox_decision_skipped(bigint, text)
to service_role, db_test_runner;

-- Item 3782, the test item of the cut-over run, gets no vault note and no day-file entry (Stack's
-- answer: "Mark it filed, no note"). It has a logged write, so inbox_decision_skipped would refuse it
-- (R5): it is marked by this migration's own guarded statement instead, with the shape that function
-- writes, once only; on a database without that row (or with it filed, or not a decision record)
-- it marks nothing.
do $$
declare
  v_n integer;
begin
  update public.attention_items i
     set decision_filed_at = now(),
         decision_filed = jsonb_build_object('skipped', true,
                            'why', 'test item of the Phase 23 cut-over run: no note, no day-file entry')
   where i.id = 3782 and i.state = 'archived'
     and i.decision->>'schema' = 'inbox-decision/1' and i.decision_filed_at is null;
  get diagnostics v_n = row_count;
  raise notice '187: item 3782 marked skipped: % row(s)', v_n;
end $$;

-- =============================================================================================
-- 3. The acceptance objects
-- =============================================================================================
create or replace view public.v_inbox_apply_runs
  with (security_invoker = true) as
select a.id,
       a.state,
       -- who filed it: the trigger the filing function wrote; the Inbox button's request has none
       coalesce(nullif(btrim(a.params->>'trigger'), ''), 'button')::text                   as filed_by,
       case when a.params->>'after' ~ '^[0-9]{1,18}$'
            then (a.params->>'after')::bigint end                                          as after_request,
       a.claimed_by,
       a.created_at,
       a.claimed_at,
       a.finished_at,
       coalesce(a.result->'claude'->>'started' = 'true', false)                            as claude_started,
       a.result->>'error'                                                                  as error_code,
       case when jsonb_typeof(a.result->'archived') = 'number'
            then case when (a.result->>'archived')::numeric between 0 and 1000000
                      then round((a.result->>'archived')::numeric)::integer end end        as archived_count,
       case when jsonb_typeof(a.result->'skip') = 'array'
            then coalesce((select array_agg(t.v order by t.ord)
                             from (select case when (s.v #>> '{}')::numeric between -9000000000000000000 and 9000000000000000000
                                               then round((s.v #>> '{}')::numeric)::bigint end as v,
                                          s.ord
                                     from jsonb_array_elements(a.result->'skip') with ordinality as s(v, ord)
                                    where jsonb_typeof(s.v) = 'number') t
                            where t.v is not null), '{}'::bigint[])
            else '{}'::bigint[] end                                                        as skip_ids
  from public.agent_requests a
 where a.kind = 'inbox_feedback';

comment on view public.v_inbox_apply_runs is
  'One row per inbox_feedback request, typed columns only (187), so an acceptance proof need not name '
  'params or result: filed_by (params.trigger: sync, followup, skill or whatever it holds; button when '
  'there is none), after_request (params.after), claimed_by, the three times, claude_started '
  '(result.claude.started, false when not true), error_code (result.error), archived_count '
  '(result.archived) and skip_ids (what the request''s own close listed in result.skip, empty when none). '
  'Does not read inbox_apply_holds. security_invoker, so the caller''s rights on agent_requests apply; '
  'anon revoked.';

revoke all on public.v_inbox_apply_runs from public, anon, authenticated, service_role, inbox_apply_runner, sync_runner;
grant select on public.v_inbox_apply_runs to authenticated, service_role, db_test_runner;

-- ---------------------------------------------------------------------------------------------
-- inbox_accept_question: the acceptance run's four test questions (and Round 1's kinds)
-- ---------------------------------------------------------------------------------------------
create or replace function public.inbox_accept_question(p_run text, p_label text)
  returns bigint
  language plpgsql security definer set search_path = public, pg_temp as $$
declare
  c_lock_key      constant bigint := 1400910187;
  c_run_pattern   constant text := '^[a-z0-9]{6,24}$';
  c_label_pattern constant text := '^[a-z][a-z0-9-]{0,15}$';
  -- Round 1: these two labels are walked on a card that offers Dismiss, which only a data_gap has.
  c_gap_labels    constant text[] := array['dismiss', 'offline'];
  c_max_open      constant integer := 8;
  v_uid           uuid := auth.uid();
  v_owner         uuid := public.app_owner();
  v_ref           text;
  v_id            bigint;
begin
  -- The owner check is the first act. Row level security does not apply inside a definer function,
  -- so without this line any signed-in account could raise Inbox rows. A call with no account
  -- (auth.uid() null) is refused too, even when the owner is unknown.
  if v_uid is null or v_owner is null or v_uid <> v_owner then
    raise exception 'inbox_accept_question: only the owner may raise a test question' using errcode = '42501';
  end if;
  if p_run is null or p_run !~ c_run_pattern then
    raise exception 'inbox_accept_question: p_run must match %', c_run_pattern using errcode = '22023';
  end if;
  if p_label is null or p_label !~ c_label_pattern then
    raise exception 'inbox_accept_question: p_label must match %', c_label_pattern using errcode = '22023';
  end if;
  v_ref := 'accept/' || p_run || '/' || p_label;

  perform pg_advisory_xact_lock(c_lock_key);

  -- A run tag and label are used once, whatever became of the row.
  if exists (select 1 from attention_items i
              where i.ref = v_ref and i.entity = 'agent_request' and i.course_id is null) then
    raise exception 'inbox_accept_question: % was already raised', v_ref using errcode = '22023';
  end if;

  -- It cleans up first: every row of this shape that carries another run tag and is not archived
  -- yet, open or answered, is archived with 114's closed_itself record. It carries no
  -- inbox-decision/1 record, so the exporter never lists it.
  update attention_items i
     set state = 'archived', archived_at = now(), archived_by = 'inbox_accept_question',
         decision = jsonb_build_object('closed_itself', true, 'rule', 'a later acceptance run raised its questions',
                                       'sync_run_id', null, 'trigger', 'inbox_accept_question')
   where i.ref like 'accept/%' and i.entity = 'agent_request' and i.course_id is null
     and i.state <> 'archived' and split_part(i.ref, '/', 2) <> p_run;

  -- At most eight rows of the shape may be open at once (a second lock, after the clean-up).
  if (select count(*) from attention_items i
       where i.ref like 'accept/%' and i.entity = 'agent_request' and i.course_id is null
         and i.state = 'open') >= c_max_open then
    raise exception 'inbox_accept_question: % test questions are already open', c_max_open using errcode = '22023';
  end if;

  -- The text is the function's own fixed sentence with the label in it; no argument is free text.
  insert into attention_items (kind, course_id, entity, ref, field, question, state)
  values (case when p_label = any (c_gap_labels) then 'data_gap' else 'stack_must_confirm' end,
          null, 'agent_request', v_ref, null,
          format('Acceptance run test question "%s". Answer it as the run''s playbook says; nothing is written to a course.',
                 p_label),
          'open')
  returning id into v_id;
  return v_id;
end $$;

comment on function public.inbox_accept_question(text, text) is
  'Raises one test question for the acceptance run (187, brief 110): kind data_gap for the labels dismiss '
  'and offline (a card with Dismiss), stack_must_confirm for any other; entity agent_request, no course, '
  'no field, ref accept/<p_run>/<p_label>, a fixed sentence with the label in it. Returns the new item''s '
  'id. SECURITY DEFINER, authenticated only, and it refuses (42501) unless auth.uid() is app_owner(), '
  'first. p_run must match ^[a-z0-9]{6,24}$ and p_label ^[a-z][a-z0-9-]{0,15}$ (22023). Before it '
  'raises it archives, as closed_itself, every unarchived row of that shape with another run tag; it '
  'refuses a ref already used and a ninth open row.';

revoke all on function public.inbox_accept_question(text, text)
  from public, anon, service_role, inbox_apply_runner, sync_runner;
grant execute on function public.inbox_accept_question(text, text) to authenticated;

-- =============================================================================================
-- 4. Guard
-- =============================================================================================
do $$
declare
  f text;
  v_role text;
  v_priv text;
  v_got text;
begin
  -- (a) The hold table grants nothing: not to public, anon, authenticated, service_role or either
  -- runner, and the test login holds select alone. Row level security is on and there is no policy.
  foreach v_role in array array['anon', 'authenticated', 'service_role', 'inbox_apply_runner', 'sync_runner'] loop
    foreach v_priv in array array['select', 'insert', 'update', 'delete', 'truncate', 'references', 'trigger'] loop
      if has_table_privilege(v_role, 'public.inbox_apply_holds', v_priv) then
        raise exception 'FAIL 187: % holds % on inbox_apply_holds', v_role, v_priv;
      end if;
    end loop;
  end loop;
  if exists (select 1 from pg_class c, aclexplode(c.relacl) a
              where c.oid = 'public.inbox_apply_holds'::regclass and a.grantee = 0) then
    raise exception 'FAIL 187: public holds a privilege on inbox_apply_holds';
  end if;
  foreach v_priv in array array['insert', 'update', 'delete', 'truncate', 'references', 'trigger'] loop
    if has_table_privilege('db_test_runner', 'public.inbox_apply_holds', v_priv) then
      raise exception 'FAIL 187: the test login holds % on inbox_apply_holds', v_priv;
    end if;
  end loop;
  if not has_table_privilege('db_test_runner', 'public.inbox_apply_holds', 'select') then
    raise exception 'FAIL 187: the test login cannot read inbox_apply_holds';
  end if;
  if not (select c.relrowsecurity from pg_class c where c.oid = 'public.inbox_apply_holds'::regclass)
     or exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'inbox_apply_holds') then
    raise exception 'FAIL 187: inbox_apply_holds must have row level security on and no policy';
  end if;

  -- (b) The worker's functions: SECURITY DEFINER, path pinned, and inbox_apply_runner's alone
  -- (sync_request_inbox_apply: sync_runner's alone), as before.
  foreach f in array array['public.inbox_apply_prepare(bigint)', 'public.inbox_apply_close(bigint, text, jsonb)'] loop
    if not exists (select 1 from pg_proc p
                    where p.oid = f::regprocedure and p.prosecdef
                      and coalesce(p.proconfig, '{}') @> array['search_path=public, pg_temp']) then
      raise exception 'FAIL 187: % lost SECURITY DEFINER or its search_path', f;
    end if;
    if has_function_privilege('anon', f, 'execute') or has_function_privilege('authenticated', f, 'execute')
       or has_function_privilege('service_role', f, 'execute') or has_function_privilege('sync_runner', f, 'execute')
       or not has_function_privilege('inbox_apply_runner', f, 'execute') then
      raise exception 'FAIL 187: % is not executable by inbox_apply_runner alone', f;
    end if;
  end loop;
  f := 'public.sync_request_inbox_apply(bigint)';
  if not exists (select 1 from pg_proc p
                  where p.oid = f::regprocedure and p.prosecdef
                    and coalesce(p.proconfig, '{}') @> array['search_path=public, pg_temp']) then
    raise exception 'FAIL 187: % lost SECURITY DEFINER or its search_path', f;
  end if;
  if has_function_privilege('anon', f, 'execute') or has_function_privilege('authenticated', f, 'execute')
     or has_function_privilege('service_role', f, 'execute') or has_function_privilege('inbox_apply_runner', f, 'execute')
     or not has_function_privilege('sync_runner', f, 'execute') then
    raise exception 'FAIL 187: % is not executable by sync_runner alone', f;
  end if;

  -- (c) The held-items read: the service role and the test login, nobody else.
  f := 'public.inbox_apply_held_items()';
  if not exists (select 1 from pg_proc p
                  where p.oid = f::regprocedure and p.prosecdef
                    and coalesce(p.proconfig, '{}') @> array['search_path=public, pg_temp']) then
    raise exception 'FAIL 187: % is not SECURITY DEFINER with its search_path pinned', f;
  end if;
  if has_function_privilege('anon', f, 'execute') or has_function_privilege('authenticated', f, 'execute')
     or has_function_privilege('inbox_apply_runner', f, 'execute') or has_function_privilege('sync_runner', f, 'execute')
     or not has_function_privilege('service_role', f, 'execute') or not has_function_privilege('db_test_runner', f, 'execute') then
    raise exception 'FAIL 187: % is not executable by the service role and the test login alone', f;
  end if;

  -- (d) The four filing functions: invoker rights, the service role's (and the test login's).
  foreach f in array array['public.inbox_decision_filed(bigint, jsonb)',
                           'public.inbox_decisions_unlogged(integer)',
                           'public.inbox_decision_logged(bigint, text)',
                           'public.inbox_decision_skipped(bigint, text)'] loop
    if has_function_privilege('anon', f, 'execute') or has_function_privilege('authenticated', f, 'execute')
       or has_function_privilege('inbox_apply_runner', f, 'execute') or has_function_privilege('sync_runner', f, 'execute')
       or not has_function_privilege('service_role', f, 'execute') then
      raise exception 'FAIL 187: % is not executable by service_role alone (and the test role)', f;
    end if;
    if (select p.prosecdef from pg_proc p where p.oid = f::regprocedure) then
      raise exception 'FAIL 187: % must be invoker rights', f;
    end if;
  end loop;

  -- (e) The view: security invoker, anon and both runner roles out, select for the three.
  if not exists (select 1 from pg_class c where c.oid = 'public.v_inbox_apply_runs'::regclass
                    and c.reloptions::text like '%security_invoker=true%') then
    raise exception 'FAIL 187: v_inbox_apply_runs is not security_invoker';
  end if;
  foreach v_role in array array['anon', 'inbox_apply_runner', 'sync_runner'] loop
    if has_table_privilege(v_role, 'public.v_inbox_apply_runs', 'select') then
      raise exception 'FAIL 187: % can read v_inbox_apply_runs', v_role;
    end if;
  end loop;
  foreach v_role in array array['authenticated', 'service_role', 'db_test_runner'] loop
    if not has_table_privilege(v_role, 'public.v_inbox_apply_runs', 'select')
       or has_table_privilege(v_role, 'public.v_inbox_apply_runs', 'insert, update, delete') then
      raise exception 'FAIL 187: % does not hold select alone on v_inbox_apply_runs', v_role;
    end if;
  end loop;

  -- (f) inbox_accept_question: SECURITY DEFINER, authenticated's alone.
  f := 'public.inbox_accept_question(text, text)';
  if not exists (select 1 from pg_proc p
                  where p.oid = f::regprocedure and p.prosecdef
                    and coalesce(p.proconfig, '{}') @> array['search_path=public, pg_temp']) then
    raise exception 'FAIL 187: % is not SECURITY DEFINER with its search_path pinned', f;
  end if;
  if has_function_privilege('anon', f, 'execute') or has_function_privilege('service_role', f, 'execute')
     or has_function_privilege('inbox_apply_runner', f, 'execute') or has_function_privilege('sync_runner', f, 'execute')
     or not has_function_privilege('authenticated', f, 'execute') then
    raise exception 'FAIL 187: % is not executable by authenticated alone', f;
  end if;

  -- (g) The sets the other runners are pinned to have not moved: sync_runner's fourteen, and the
  -- worker's seven.
  select string_agg(p.proname, ',' order by p.proname) into v_got
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prosecdef
     and has_function_privilege('sync_runner', p.oid, 'execute');
  if v_got is distinct from
     'sync_claim,sync_close,sync_enqueue,sync_file_stored,sync_file_worklist,sync_login_ok,'
     'sync_login_required,sync_next,sync_own_claims,sync_register_run,sync_request_inbox_apply,'
     'sync_requeue_orphans,sync_run_outcome,sync_sweep_stale' then
    raise exception 'FAIL 187: sync_runner executes SECURITY DEFINER functions %, expected the fourteen', v_got;
  end if;
  select string_agg(p.proname, ',' order by p.proname) into v_got
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prosecdef
     and has_function_privilege('inbox_apply_runner', p.oid, 'execute');
  if v_got is distinct from
     'inbox_apply_archive,inbox_apply_begin_item,inbox_apply_claim,inbox_apply_close,'
     'inbox_apply_prepare,inbox_apply_run_facts,raise_attention' then
    raise exception 'FAIL 187: inbox_apply_runner executes SECURITY DEFINER functions %', v_got;
  end if;

  -- (g2) The exporter runs as the service role with invoker rights: inbox_decision_skipped reads
  -- inbox_apply_writes (R5), so that role must be able to.
  -- The table has policies for authenticated and inbox_apply_runner only, so the role must also pass
  -- row level security; otherwise it would read zero rows and every skip would be allowed silently.
  if not has_table_privilege('service_role', 'public.inbox_apply_writes', 'select')
     or not coalesce((select r.rolbypassrls from pg_roles r where r.rolname = 'service_role'), false) then
    raise exception 'FAIL 187: service_role cannot read inbox_apply_writes (inbox_decision_skipped reads it): no select, or no bypassrls';
  end if;

  -- (h) The bodies are 187's, and keep the two words the standing units pin.
  if position('session_link' in (select prosrc from pg_proc where oid = 'public.inbox_apply_prepare(bigint)'::regprocedure)) = 0
     or position('inbox_apply_held_items' in (select prosrc from pg_proc where oid = 'public.inbox_apply_prepare(bigint)'::regprocedure)) = 0
     or position('c_signed_in' in (select prosrc from pg_proc where oid = 'public.inbox_apply_close(bigint, text, jsonb)'::regprocedure)) = 0
     or position('skip_seen' in (select prosrc from pg_proc where oid = 'public.inbox_apply_close(bigint, text, jsonb)'::regprocedure)) = 0
     or position('retry_held' in (select prosrc from pg_proc where oid = 'public.inbox_apply_close(bigint, text, jsonb)'::regprocedure)) = 0
     or position('retry_held' in (select prosrc from pg_proc where oid = 'public.inbox_apply_prepare(bigint)'::regprocedure)) = 0
     or position('inbox_apply_writes' in (select prosrc from pg_proc where oid = 'public.inbox_decision_skipped(bigint, text)'::regprocedure)) = 0
     or position('inbox_apply_held_items' in (select prosrc from pg_proc where oid = 'public.sync_request_inbox_apply(bigint)'::regprocedure)) = 0 then
    raise exception 'FAIL 187: a re-created body is not the 187 body';
  end if;
end $$;

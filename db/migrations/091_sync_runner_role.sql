-- bb2dash :: db/migrations/091_sync_runner_role.sql
-- Phase 14 (docs/planning/sprint-2/briefs/100_PHASE14_containers.md), tasks 7, 11 and 13 (R-84,
-- R-83, R-87, P-104). Worker W-55.
--
-- WHY. The container's sync runner cannot sign in as the owner, and a service key in the sync image
-- would break "service key never in an image" (Stack's decision 16). So it gets its own login role,
-- `sync_runner`, with no table, view or sequence grant at all: it reaches rows only through the
-- twelve SECURITY DEFINER functions below, each as narrow as the one step of the runner it serves.
-- They are the whole of what the role can run with the owner's rights (prod on 2026-10-03: no
-- SECURITY DEFINER function in `public` is executable by PUBLIC).
--
-- THE FILE CARRIES NO PASSWORD, EVER. Stack sets it out of band in the SQL editor, so this file
-- stays byte-identical to what prod recorded. The role connects through the session pooler (port
-- 5432, user `sync_runner.goultdzqcavefcgnifdy`), never the transaction pooler on 6543.
--
-- WHAT
--   1. role `sync_runner` (login, noinherit, nobypassrls) and usage on schema `public`
--   2. `agent_requests.claim_attempts smallint not null default 0` (P-104; no web or desktop code
--      reads it)
--   3. the queue: sync_next, sync_claim, sync_requeue_orphans, sync_register_run, sync_run_outcome
--   4. the files: sync_file_worklist, sync_file_stored
--   5. the close and the dead-letter sweep: sync_close, sync_sweep_stale
--   6. the login: sync_login_required, sync_login_ok, and the trigger sync_enqueue('just' | 'login')
--      with its helper sync_login_sync_due (2026-10-03: the morning sync follows Stack's morning
--      login; 092 and the 'scheduled' trigger are never written)
--   7. privileges: every function revoked from public, anon, authenticated and service_role; the
--      twelve granted to sync_runner; the helper granted to nobody here
--   8. a guard block
--
-- REPLAY ORDER. 091 is applied after Phases 15-19 (100-172) but replays before them by name, so no
-- body here references `db_test_runner` or Phase 15's 102 trigger, and every function is plpgsql,
-- whose body is checked only when it is called: `sync_register_run` relies on Phase 19's trigger
-- `agent_requests_open_sync_run` (135) and `sync_file_worklist` on `bb_file_is_outside_link` (161) at
-- run time, not at create time. 094, which names `db_test_runner`, replays after 100.
--
-- Constants shared with the runner (`sync/src/`): MAX_CLAIM_ATTEMPTS = 3, the same in SQL and TS;
-- DEAD_LETTER_MINUTES = 20, in SQL only. A stale claim's release is Phase 19's 30-minute terminal
-- rule (136), which raises the same `agent_request:<id>` ref this sweep raises.
--
-- Additive only: no drop, no rename, no existing function body changed.

-- =============================================================================================
-- 1. The role
-- =============================================================================================
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'sync_runner') then
    raise notice 'sync_runner already exists; its attributes and grants are re-applied below';
  else
    create role sync_runner login noinherit nobypassrls;
  end if;
end $$;

comment on role sync_runner is
  'The container sync runner (Phase 14, migration 091). No table, view or sequence grant: it reaches '
  'rows only through the twelve SECURITY DEFINER sync_* functions of 091. Password set out of band; '
  'connects through the session pooler (5432).';

grant usage on schema public to sync_runner;

-- =============================================================================================
-- 2. agent_requests.claim_attempts
-- =============================================================================================
alter table public.agent_requests
  add column if not exists claim_attempts smallint not null default 0;

comment on column public.agent_requests.claim_attempts is
  'How many times sync_claim() has claimed this request (migration 091, P-104). sync_requeue_orphans() '
  'requeues only below 3; sync_sweep_stale() flags a claimed request at 3. No web or desktop code reads it.';

-- =============================================================================================
-- 3. The queue
-- =============================================================================================
create or replace function public.sync_next()
  returns table (id bigint, created_at timestamptz, params jsonb)
  language plpgsql security definer set search_path = public, pg_temp as $$
begin
  return query
    select a.id, a.created_at, a.params
      from agent_requests a
     where a.kind = 'sync' and a.state = 'queued'
     order by a.created_at, a.id
     limit 1;
end $$;

comment on function public.sync_next() is
  'The sync runner''s queue read (091): the oldest queued sync request, at most one row. sync_runner only.';

create or replace function public.sync_claim(p_id bigint)
  returns boolean
  language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update agent_requests a
     set state = 'claimed', claimed_at = now(), claimed_by = 'sync-runner',
         claim_attempts = a.claim_attempts + 1
   where a.id = p_id and a.kind = 'sync' and a.state = 'queued';
  return found;
end $$;

comment on function public.sync_claim(bigint) is
  'Claims one queued sync request for the sync runner (091): queued -> claimed, claimed_by sync-runner, '
  'claim_attempts + 1. False when the claim was lost or the row is not a queued sync. sync_runner only.';

create or replace function public.sync_requeue_orphans()
  returns integer
  language plpgsql security definer set search_path = public, pg_temp as $$
declare
  c_max_claim_attempts constant smallint := 3;   -- MAX_CLAIM_ATTEMPTS, the same in sync/src
  v_n integer;
begin
  -- A claim the runner made but never registered died with the runner. A registered row is never
  -- requeued: its crawl may have landed, and Phase 19's terminal rule owns it.
  update agent_requests a
     set state = 'queued', claimed_at = null, claimed_by = null
   where a.kind = 'sync' and a.state = 'claimed' and a.claimed_by = 'sync-runner'
     and a.run_id is null and a.claim_attempts < c_max_claim_attempts;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

comment on function public.sync_requeue_orphans() is
  'Runner start (091): every sync request claimed by sync-runner with no run_id and fewer than 3 claims '
  'goes back to queued. A registered row is never requeued. Returns the rows requeued. sync_runner only.';

create or replace function public.sync_register_run(p_id bigint, p_run_id uuid)
  returns boolean
  language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_id is null or p_run_id is null then
    return false;
  end if;
  -- One run id, one request.
  if exists (select 1 from agent_requests a where a.run_id = p_run_id and a.id <> p_id) then
    return false;
  end if;
  -- Register-first (Phase 19): setting run_id on this runner's claimed sync request fires
  -- agent_requests_open_sync_run (135), which opens the running sync_runs row, or refuses a
  -- quarantined run id with SQLSTATE 42501. That error is not caught here.
  update agent_requests a
     set run_id = p_run_id
   where a.id = p_id and a.kind = 'sync' and a.state = 'claimed'
     and a.claimed_by = 'sync-runner' and a.run_id is null;
  return found;
end $$;

comment on function public.sync_register_run(bigint, uuid) is
  'Registers a run on the sync runner''s own claimed sync request (091), register-first: Phase 19''s '
  'trigger agent_requests_open_sync_run opens the running row. False for a row that is not a sync, not '
  'claimed, claimed by someone else, already registered, or a run id already on another request; a '
  'quarantined run id raises 42501 from the trigger. sync_runner only.';

create or replace function public.sync_run_outcome(p_run_id uuid)
  returns table (sync_run_id bigint, status text, summary jsonb)
  language plpgsql security definer set search_path = public, pg_temp as $$
begin
  -- v_sync_status is security_invoker, so the runner reads the run here instead. A quarantine row
  -- (scope unregistered) is not the run.
  return query
    select s.id, s.status, s.summary
      from sync_runs s
     where s.run_id = p_run_id and s.scope is distinct from 'unregistered'
     order by s.id desc
     limit 1;
end $$;

comment on function public.sync_run_outcome(uuid) is
  'The sync runner''s fold wait (091): the run''s real sync_runs row (scope not unregistered) as '
  '(sync_run_id, status, summary); status is running, ok, partial or failed. sync_runner only.';

-- =============================================================================================
-- 4. The files
-- =============================================================================================
create or replace function public.sync_file_worklist()
  returns table (id bigint, file_name text, relpath text, mime text, source_url text,
                 bucket text, attempt_id text)
  language plpgsql security definer set search_path = public, pg_temp as $$
begin
  -- ingest/pull_files.mjs's manifest query: catalogued, never stored, not superseded, and never an
  -- outside link (161).
  return query
    select f.id, f.file_name, bb_file_relpath(f.id), f.mime_type, f.source_url,
           f.bucket::text, f.attempt_id
      from bb_files f
     where f.storage_path is null and f.superseded_by is null
       and f.source_url is not null and not bb_file_is_outside_link(f.source_url)
     order by f.id;
end $$;

comment on function public.sync_file_worklist() is
  'The sync runner''s file worklist (091): ingest/pull_files.mjs''s manifest query, bb_files rows with '
  'storage_path null, superseded_by null and a Blackboard source_url, with relpath = bb_file_relpath(id). '
  'sync_runner only.';

create or replace function public.sync_file_stored(
    p_id bigint, p_key text, p_relpath text, p_sha256 text, p_bytes integer, p_mime text,
    p_text_status text)
  returns boolean
  language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_relpath text;
  v_status  text_status;
begin
  if p_sha256 is null or p_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'sync_file_stored: sha256 must be 64 lowercase hex characters'
      using errcode = '22023';
  end if;
  if p_bytes is null or p_bytes <= 0 then
    raise exception 'sync_file_stored: bytes must be positive' using errcode = '22023';
  end if;
  if p_mime is null or btrim(p_mime) = '' then
    raise exception 'sync_file_stored: mime is required' using errcode = '22023';
  end if;
  if p_text_status is null then
    raise exception 'sync_file_stored: text_status is required' using errcode = '22023';
  end if;
  v_status := p_text_status::text_status;   -- an unknown status raises 22P02 here

  -- The row's own relpath and the key it implies (pull_files.mjs storageKeyFor: '#' -> '_'). The
  -- caller cannot point a row at another path or key; the prefixes are added here, not by it.
  select bb_file_relpath(f.id) into v_relpath from bb_files f where f.id = p_id;
  if v_relpath is null then
    return false;
  end if;
  if p_relpath is distinct from v_relpath then
    raise exception 'sync_file_stored: relpath is not bb_file_relpath(%)', p_id using errcode = '22023';
  end if;
  if p_key is distinct from replace(v_relpath, '#', '_') then
    raise exception 'sync_file_stored: key is not the relpath''s storage key' using errcode = '22023';
  end if;

  -- What pull_files.mjs's bbFilesUpdateSql writes, and only onto a row with no bytes yet.
  update bb_files f
     set storage_path  = 'bb-files/' || p_key,
         local_path    = 'course context/' || p_relpath,
         sha256        = p_sha256,
         bytes         = p_bytes,
         mime_type     = case when f.bucket = 'my_submissions' then coalesce(f.mime_type, p_mime)
                              else p_mime end,
         downloaded_at = now(),
         text_status   = v_status,
         notes         = coalesce(f.notes, '') || ' | bytes pulled '
                         || to_char(now() at time zone 'America/New_York', 'YYYY-MM-DD')
                         || ' by sync-runner'
   where f.id = p_id and f.storage_path is null;
  return found;
end $$;

comment on function public.sync_file_stored(bigint, text, text, text, integer, text, text) is
  'Records one pulled file for the sync runner (091), writing what pull_files.mjs''s bbFilesUpdateSql '
  'writes: storage_path bb-files/<key>, local_path course context/<relpath>, sha256, bytes, mime_type '
  '(coalesced for my_submissions), downloaded_at, text_status, and a notes line naming sync-runner. Only '
  'where storage_path is null; the relpath must be bb_file_relpath(id) and the key its storage key. '
  'sync_runner only.';

-- =============================================================================================
-- 5. The close and the dead-letter sweep
-- =============================================================================================
create or replace function public.sync_login_required()
  returns bigint
  language plpgsql security definer set search_path = public, pg_temp as $$
declare
  c_question constant text :=
    'Blackboard login needed — open http://127.0.0.1:6080/vnc.html and sign in with Duo';
  v_id bigint;
begin
  -- One body for both raises: the login watch's (2026-10-03) and sync_close's login_required.
  -- An item already open is updated in place by raise_attention (attention_items_open_dedupe_idx).
  perform raise_attention(null, 'stack_must_confirm', null, 'agent_request', 'sync-login-required',
                          null, null, null, c_question, null);
  select i.id into v_id
    from attention_items i
   where i.kind = 'stack_must_confirm' and i.course_id is null and i.ref = 'sync-login-required'
     and i.field is null and i.state = 'open'
   order by i.id desc
   limit 1;
  return v_id;
end $$;

comment on function public.sync_login_required() is
  'Raises the "Blackboard login needed" Inbox item (ref sync-login-required, stack_must_confirm) and '
  'returns the open item''s id (091, 2026-10-03). An item already open is returned, never duplicated. '
  'The one body sync_close uses for error login_required. sync_runner only.';

create or replace function public.sync_close(p_id bigint, p_state text, p_report jsonb)
  returns void
  language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_req    record;
  v_run_id bigint;
begin
  if p_report is null or jsonb_typeof(p_report) <> 'object'
     or jsonb_typeof(p_report->'lines') is distinct from 'array' then
    raise exception 'sync_close: the report must be an object whose lines is an array of text'
      using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(p_report->'lines') l
              where jsonb_typeof(l) <> 'string') then
    raise exception 'sync_close: every line of the report must be text' using errcode = '22023';
  end if;
  if p_state is null or p_state not in ('done', 'failed') then
    raise exception 'sync_close: state must be done or failed, not %', coalesce(p_state, 'null')
      using errcode = '22023';
  end if;

  select a.id, a.kind, a.state, a.claimed_by, a.run_id into v_req
    from agent_requests a where a.id = p_id for update;
  if not found or v_req.kind <> 'sync' then
    raise exception 'sync_close: % is not a sync request', p_id using errcode = '22023';
  end if;
  -- Two transitions only: this runner's claim -> done / failed, and queued -> failed (a login
  -- that died before the claim).
  if not ((v_req.state = 'claimed' and v_req.claimed_by = 'sync-runner')
          or (v_req.state = 'queued' and p_state = 'failed')) then
    raise exception 'sync_close: refusing % -> % on request % (claimed_by %)',
      v_req.state, p_state, p_id, coalesce(v_req.claimed_by, 'null') using errcode = '22023';
  end if;

  if v_req.run_id is not null then
    select s.id into v_run_id
      from sync_runs s
     where s.run_id = v_req.run_id and s.scope is distinct from 'unregistered'
     order by s.id desc
     limit 1;
  end if;

  update agent_requests a
     set state = p_state, finished_at = now(), result = p_report,
         sync_run_id = coalesce(v_run_id, a.sync_run_id)
   where a.id = p_id;

  -- The runner's lines go where Activity already reads the fold's: summary->'changes'.
  if v_run_id is not null and jsonb_array_length(p_report->'lines') > 0 then
    update sync_runs s
       set summary = jsonb_set(coalesce(s.summary, '{}'::jsonb), '{changes}',
                               case when jsonb_typeof(s.summary->'changes') = 'array'
                                    then s.summary->'changes' else '[]'::jsonb end
                               || (p_report->'lines'))
     where s.id = v_run_id;
  end if;

  if p_report->>'error' = 'login_required' then
    perform sync_login_required();
  end if;
end $$;

comment on function public.sync_close(bigint, text, jsonb) is
  'Closes a sync request for the sync runner (091): its own claimed -> done or failed, or queued -> '
  'failed; sets finished_at, result = the report and sync_run_id, and appends the report''s lines to '
  'that run''s summary.changes. error login_required raises the login item (sync_login_required). '
  'Refuses any other transition and a report that is not an object with an array of text lines. '
  'sync_runner only.';

create or replace function public.sync_sweep_stale()
  returns integer
  language plpgsql security definer set search_path = public, pg_temp as $$
declare
  c_dead_letter_after  constant interval := interval '20 minutes';   -- DEAD_LETTER_MINUTES
  c_max_claim_attempts constant smallint := 3;                       -- MAX_CLAIM_ATTEMPTS
  v_n integer := 0;
  r   record;
begin
  -- Flags, never releases: state is not touched and nothing is retried. A sync claim is released
  -- by Phase 19's 30-minute terminal rule (136), which raises the same ref, so the two land on one
  -- open item. An inbox_feedback claim is only flagged (R-96).
  for r in
    update agent_requests a
       set result = coalesce(a.result, '{}'::jsonb)
                    || jsonb_build_object('dead_lettered_at', now())
     where a.kind in ('sync', 'inbox_feedback') and a.state = 'claimed'
       and (coalesce(a.claimed_at, a.created_at) < now() - c_dead_letter_after
            or a.claim_attempts >= c_max_claim_attempts)
       and (a.result is null or a.result->>'dead_lettered_at' is null)
    returning a.id, a.kind, a.claim_attempts
  loop
    perform raise_attention(
      null, 'stack_must_confirm', null, 'agent_request', 'agent_request:' || r.id, null, null, null,
      case when r.claim_attempts >= c_max_claim_attempts
           then format('A %s request (%s) has been claimed %s times without finishing. Nothing retries it; if it is a sync, it is closed as interrupted 30 minutes after it started.',
                       r.kind, r.id, r.claim_attempts)
           else format('A %s request (%s) has been claimed for more than %s minutes without finishing. Nothing retries it; if it is a sync, it is closed as interrupted 30 minutes after it started.',
                       r.kind, r.id, (extract(epoch from c_dead_letter_after) / 60)::int)
      end,
      null);
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

comment on function public.sync_sweep_stale() is
  'The dead-letter sweep (091): a claimed sync or inbox_feedback request older than 20 minutes, or at 3 '
  'claims, not yet flagged, raises one stack_must_confirm item with ref agent_request:<id> (the shape '
  'of Phase 19''s terminal rule) and gets result.dead_lettered_at. Never changes state, never retries. '
  'Returns the rows flagged. sync_runner only.';

-- =============================================================================================
-- 6. The login: the item's self-close, and the day's sync after the morning login
-- =============================================================================================
create or replace function public.sync_login_ok()
  returns integer
  language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_n integer;
begin
  -- A third way into archived (DECISIONS 2026-10-02), writing 114's closed_itself record shape.
  -- archive_attention_item() refuses open rows, so it is not used. Touches no other ref.
  update attention_items i
     set state       = 'archived',
         archived_at = now(),
         archived_by = 'sync-runner',
         decision    = jsonb_build_object('closed_itself', true,
                                          'rule',          'login check passed',
                                          'sync_run_id',   null,
                                          'trigger',       'sync_login_ok')
   where i.kind = 'stack_must_confirm' and i.course_id is null and i.ref = 'sync-login-required'
     and i.state = 'open';
  get diagnostics v_n = row_count;
  return v_n;
end $$;

comment on function public.sync_login_ok() is
  'The login check passed (091): archives the open sync-login-required item with archived_by '
  'sync-runner and decision {closed_itself, rule, sync_run_id, trigger} (114''s shape). Returns the rows '
  'closed, 0 or 1. Touches no other ref. sync_runner only.';

create or replace function public.sync_login_sync_due(p_now timestamptz)
  returns boolean
  stable
  language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_now is null then
    raise exception 'sync_login_sync_due: p_now is required' using errcode = '22004';
  end if;
  -- The New York date, not UTC: 23:30 on the 30th (EDT) is 03:30Z on the 31st.
  return not exists (
    select 1 from agent_requests a
     where a.kind = 'sync' and a.state = 'done' and a.finished_at is not null
       and (a.finished_at at time zone 'America/New_York')::date
           = (p_now at time zone 'America/New_York')::date);
end $$;

comment on function public.sync_login_sync_due(timestamptz) is
  'Helper for sync_enqueue(''login'') (091, 2026-10-03): true when no sync request finished done on the '
  'New York date of p_now. Stable and read-only. Not granted to sync_runner; its only grantee besides '
  'the owner is the test role db_test_runner (migration 094), so the 091 test unit can ask it about '
  'fixed instants across the 2026-11-01 fall-back, which sync_enqueue (always now()) cannot.';

create or replace function public.sync_enqueue(p_trigger text)
  returns bigint
  language plpgsql security definer set search_path = public, pg_temp as $$
declare
  -- One lock for every enqueue, so two callers never insert two open syncs.
  c_lock_key constant bigint := 1400910001;
  v_id bigint;
begin
  if p_trigger is null or p_trigger not in ('just', 'login') then
    raise exception 'sync_enqueue: trigger must be just or login, not %', coalesce(p_trigger, 'null')
      using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(c_lock_key);

  select a.id into v_id
    from agent_requests a
   where a.kind = 'sync' and a.state in ('queued', 'claimed')
   order by a.created_at, a.id
   limit 1;
  if found then
    return v_id;
  end if;

  -- The morning login queues the day's sync once: never on a New York day that has a done one.
  if p_trigger = 'login' and not sync_login_sync_due(now()) then
    return null;
  end if;

  insert into agent_requests (kind, scope, state, params, note)
  values ('sync', 'all', 'queued', jsonb_build_object('trigger', p_trigger),
          format('queued by the sync runner (%s)', p_trigger))
  returning id into v_id;
  return v_id;
end $$;

comment on function public.sync_enqueue(text) is
  'Queues one sync request for the sync runner (091): trigger just (`just sync-now`) or login (the '
  'first live login of the day). Under an advisory lock, returns the open sync''s id if one is queued '
  'or claimed; for login, returns null and inserts nothing when a sync already finished done on that '
  'New York day; else inserts one with params {"trigger": <trigger>}. sync_runner only.';

-- =============================================================================================
-- 7. Privileges
-- =============================================================================================
revoke all on function
  public.sync_next(),
  public.sync_claim(bigint),
  public.sync_requeue_orphans(),
  public.sync_register_run(bigint, uuid),
  public.sync_run_outcome(uuid),
  public.sync_file_worklist(),
  public.sync_file_stored(bigint, text, text, text, integer, text, text),
  public.sync_close(bigint, text, jsonb),
  public.sync_sweep_stale(),
  public.sync_enqueue(text),
  public.sync_login_ok(),
  public.sync_login_required(),
  public.sync_login_sync_due(timestamptz)
from public, anon, authenticated, service_role;

grant execute on function
  public.sync_next(),
  public.sync_claim(bigint),
  public.sync_requeue_orphans(),
  public.sync_register_run(bigint, uuid),
  public.sync_run_outcome(uuid),
  public.sync_file_worklist(),
  public.sync_file_stored(bigint, text, text, text, integer, text, text),
  public.sync_close(bigint, text, jsonb),
  public.sync_sweep_stale(),
  public.sync_enqueue(text),
  public.sync_login_ok(),
  public.sync_login_required()
to sync_runner;

-- =============================================================================================
-- 8. Guard
-- =============================================================================================
do $$
declare
  v_got text;
  v_bad text;
begin
  -- (a) The twelve are exactly the SECURITY DEFINER functions sync_runner can execute.
  select string_agg(p.proname, ',' order by p.proname) into v_got
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prosecdef
     and has_function_privilege('sync_runner', p.oid, 'execute');
  if v_got is distinct from
     'sync_claim,sync_close,sync_enqueue,sync_file_stored,sync_file_worklist,sync_login_ok,'
     'sync_login_required,sync_next,sync_register_run,sync_requeue_orphans,sync_run_outcome,'
     'sync_sweep_stale' then
    raise exception 'FAIL 091: sync_runner executes SECURITY DEFINER functions %, expected the twelve', v_got;
  end if;

  -- (b) No table, view or sequence privilege in public.
  select string_agg(c.relname, ', ' order by c.relname) into v_bad
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'v', 'm', 'p', 'S')
     and (case when c.relkind = 'S'
               then has_sequence_privilege('sync_runner', c.oid, 'usage,select,update')
               else has_table_privilege('sync_runner', c.oid, 'select,insert,update,delete') end);
  if v_bad is not null then
    raise exception 'FAIL 091: sync_runner holds a privilege on %', v_bad;
  end if;

  -- (c) anon and authenticated execute none of the thirteen; nobody but the owner has the helper.
  select string_agg(p.proname, ', ' order by p.proname) into v_bad
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = any (array['sync_next', 'sync_claim', 'sync_requeue_orphans', 'sync_register_run',
                                'sync_run_outcome', 'sync_file_worklist', 'sync_file_stored',
                                'sync_close', 'sync_sweep_stale', 'sync_enqueue', 'sync_login_ok',
                                'sync_login_required', 'sync_login_sync_due'])
     and (has_function_privilege('anon', p.oid, 'execute')
          or has_function_privilege('authenticated', p.oid, 'execute'));
  if v_bad is not null then
    raise exception 'FAIL 091: anon or authenticated can execute %', v_bad;
  end if;
  if has_function_privilege('sync_runner', 'public.sync_login_sync_due(timestamptz)', 'execute')
     or has_function_privilege('service_role', 'public.sync_login_sync_due(timestamptz)', 'execute') then
    raise exception 'FAIL 091: sync_login_sync_due is executable beyond its owner';
  end if;

  -- (d) The role's attributes.
  if exists (select 1 from pg_roles
              where rolname = 'sync_runner'
                and (not rolcanlogin or rolinherit or rolbypassrls or rolsuper or rolcreaterole
                     or rolcreatedb or rolreplication)) then
    raise exception 'FAIL 091: sync_runner is not login, noinherit, nobypassrls and nothing more';
  end if;
end $$;

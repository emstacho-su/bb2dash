-- bb2dash :: db/migrations/193_workspace_ingest_role.sql
-- Phase 24a (docs/planning/sprint-2/briefs/109_PHASE24_workspace_assistant.md), task 16, and the
-- ingest queue of the pgvector store (answer 17, point 4). Worker W-76.
--
-- WHY. A file from his device is read by a small service with no model, no Claude token and no
-- service key (`workspace-ingest`, brief 109, Uploads and extraction): it downloads the file through
-- its signed link, parses it, puts the text units in the store and has the units embedded. That
-- service gets its own login role, `workspace_ingest_runner`, with no table, view or sequence grant
-- at all, as `workspace_runner` has (142): it reaches the queue only through the four SECURITY
-- DEFINER functions below. It cannot read planner state, a grade, a conversation or a remembered
-- summary, and it can write nothing but the text of the one document it holds.
--
-- THE FILE CARRIES NO PASSWORD, EVER. Stack sets it out of band (task 48 of the brief), so this file
-- stays byte-identical to what prod recorded. The role connects through the session pooler (port
-- 5432, user `workspace_ingest_runner.goultdzqcavefcgnifdy`), never the transaction pooler on 6543.
--
-- WHAT
--   1. role `workspace_ingest_runner` (login, noinherit, nobypassrls), statement_timeout 30s,
--      connection limit 4, usage on schema `public`
--   2. workspace_ingest_heartbeat (table): the worker's one liveness row; no text in it
--   3. workspace_ingest_claim      one document at a time, skip locked, a 10-minute lease
--   4. workspace_ingest_put_text   replaces the document's units in one transaction
--   5. workspace_ingest_finish     indexed, failed or retry; the function counts the three tries
--   6. workspace_ingest_heartbeat  the one heartbeat row
--   7. privileges: each function revoked from public, anon, authenticated and service_role, then
--      granted to workspace_ingest_runner; `db_test_runner` holds the role WITH INHERIT FALSE, so
--      the unit can `set local role workspace_ingest_runner`
--   8. a guard block
--
-- THE QUEUE. A document is claimed in one of two steps. Step `read`: an upload in `stored` (it goes
-- to `reading`), or a `reading` row whose lease ran out. Step `embed`: a document in `text_ready`
-- (an upload whose units are put, or a remembered item, which has no bytes and starts here); it
-- stays `text_ready`. A runner that already holds a document inside its lease is handed nothing, so
-- a runner works one document at a time. `put_text` and `finish` refuse (22023) a document the
-- caller does not hold. A claim whose lease ran out is a try that died with its worker: the sweep at
-- the top of `claim` counts it, and the third one ends the row failed (extract_failed for a read,
-- embed_failed for an embed).
--
-- EVERY WRITE IS AN UPSERT ON A KEY. `put_text` deletes the document's units (their vectors go with
-- them) and writes the new set in the same transaction, so a put that is sent twice leaves one set.
-- `finish` accepts `indexed` only for a document with at least one unit, every one of them with its
-- `embedded_at` and at least one stored vector (the store's count of what is in cannot be wrong), and
-- clears the signed link on `indexed` and on `failed` alike.
--
-- REFUSALS. A refusal a function raises itself carries SQLSTATE 22023 and a message that starts with
-- the function's name.
--
-- Constants shared with the worker (`workspace-ingest/`): the lease is 10 minutes; a step is tried 3
-- times; a document holds 1 to 1000 units and at most 1.5 million characters.
--
-- Additive only: no drop, no rename, no existing object changed.

do $$
begin
  if to_regclass('public.workspace_documents') is null then
    raise exception '193: table workspace_documents does not exist; apply 190_workspace_store first';
  end if;
  if not exists (select 1 from pg_roles where rolname = 'db_test_runner') then
    raise exception '193: role db_test_runner does not exist; apply 100_db_test_runner_role first';
  end if;
end $$;

-- =============================================================================================
-- 1. The role
-- =============================================================================================
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'workspace_ingest_runner') then
    raise notice 'workspace_ingest_runner already exists; its settings and grants are re-applied below';
  else
    create role workspace_ingest_runner login noinherit nobypassrls;
  end if;
end $$;

-- Putting up to 1.5 million characters of text, with the generated search column, is the longest
-- statement the worker makes.
alter role workspace_ingest_runner set statement_timeout = '30s';
alter role workspace_ingest_runner connection limit 4;

comment on role workspace_ingest_runner is
  'The ingest worker (Phase 24a, migration 193). No table, view or sequence grant: it reaches the '
  'queue only through the four SECURITY DEFINER workspace_ingest_* functions of 193. Its password is '
  'set out of band; it connects through the session pooler (5432).';

grant usage on schema public to workspace_ingest_runner;

-- =============================================================================================
-- 2. The heartbeat table
-- =============================================================================================
create table public.workspace_ingest_heartbeat (
  id        smallint primary key
            constraint workspace_ingest_heartbeat_one_row check (id = 1),
  polled_at timestamptz not null,
  runner    text not null
);

comment on table public.workspace_ingest_heartbeat is
  'The ingest worker''s one liveness row (migration 193; id = 1), upserted by '
  'workspace_ingest_heartbeat(). Empty until the service first runs. It holds no text. The status '
  'view v_workspace_index_status (197) reads it. Owner-only through RLS.';

alter table public.workspace_ingest_heartbeat enable row level security;

create policy workspace_ingest_heartbeat_owner_select on public.workspace_ingest_heartbeat
  for select to authenticated
  using ((select auth.uid()) = (select public.app_owner()));

revoke all on public.workspace_ingest_heartbeat from public, anon, authenticated;
grant select on public.workspace_ingest_heartbeat to authenticated;
grant select on public.workspace_ingest_heartbeat to service_role;
-- Phase 15's runner writes the unit's setup rows (brief 95).
grant insert, update, delete on public.workspace_ingest_heartbeat to db_test_runner;

-- =============================================================================================
-- 3. workspace_ingest_claim
-- =============================================================================================
create or replace function public.workspace_ingest_claim(p_runner text)
  returns jsonb
  language plpgsql security definer set search_path = public, pg_temp as $$
declare
  c_lease constant interval := interval '10 minutes';
  c_tries constant integer  := 3;
  v_id    bigint;
  v_state text;
  v_row   record;
begin
  if p_runner is null or btrim(p_runner) = '' then
    raise exception 'workspace_ingest_claim: p_runner is required' using errcode = '22023';
  end if;

  -- A runner works one document at a time: while it holds one inside its lease, nothing is handed over.
  if exists (select 1 from workspace_documents d
              where d.claimed_by = p_runner and d.claimed_at > now() - c_lease) then
    return null;
  end if;

  -- The sweep: a hold whose lease ran out died with its worker. It is a try; the third ends the row
  -- failed (and clears the link), the others free the row for the next claim.
  update workspace_documents d
     set attempts = d.attempts + 1,
         state = case when d.attempts + 1 >= c_tries then 'failed' else d.state end,
         error_code = case when d.attempts + 1 >= c_tries
                           then case when d.state = 'reading' then 'extract_failed' else 'embed_failed' end
                           else d.error_code end,
         signed_url = case when d.attempts + 1 >= c_tries then null else d.signed_url end,
         signed_url_expires_at = case when d.attempts + 1 >= c_tries then null else d.signed_url_expires_at end,
         claimed_by = null,
         claimed_at = null
   where d.claimed_by is not null
     and d.claimed_at <= now() - c_lease
     and d.state in ('reading', 'text_ready');

  -- The oldest row that can be worked on and that nobody holds.
  select d.id, d.state into v_id, v_state
    from workspace_documents d
   where d.claimed_by is null
     and d.state in ('stored', 'reading', 'text_ready')
   order by d.created_at, d.id
   limit 1
     for update skip locked;
  if not found then
    return null;
  end if;

  update workspace_documents d
     set claimed_by = p_runner,
         claimed_at = now(),
         state = case when d.state = 'stored' then 'reading' else d.state end
   where d.id = v_id
  returning d.id, d.kind, d.mime, d.byte_size, d.sha256, d.signed_url, d.signed_url_expires_at, d.attempts
    into v_row;

  return jsonb_build_object(
    'document_id',           v_row.id,
    'kind',                  v_row.kind,
    'step',                  case when v_state in ('stored', 'reading') then 'read' else 'embed' end,
    'mime',                  v_row.mime,
    'byte_size',             v_row.byte_size,
    'sha256',                v_row.sha256,
    'signed_url',            v_row.signed_url,
    'signed_url_expires_at', v_row.signed_url_expires_at,
    'attempts',              v_row.attempts);
end $$;

comment on function public.workspace_ingest_claim(text) is
  'The ingest worker''s poll (193): one document at a time, oldest first, for update skip locked, a '
  '10-minute lease. Returns null when p_runner already holds a document inside its lease or when '
  'nothing waits. Step read: an upload in stored (now reading) or a reading row whose lease ran '
  'out. Step embed: a document in text_ready, which stays text_ready (an upload whose units are '
  'put, or a remembered item, which has null mime, byte_size, sha256 and signed_url). Returns '
  '{document_id, kind, step, mime, byte_size, sha256, signed_url, signed_url_expires_at, attempts}. '
  'First counts every hold whose lease ran out as a try; the third ends the row failed. '
  'workspace_ingest_runner only.';

-- =============================================================================================
-- 4. workspace_ingest_put_text
-- =============================================================================================
create or replace function public.workspace_ingest_put_text(
    p_runner text, p_document_id bigint, p_units jsonb)
  returns integer
  language plpgsql security definer set search_path = public, pg_temp as $$
declare
  c_max_units constant integer := 1000;
  c_max_chars constant bigint  := 1500000;
  v_state   text;
  v_n       integer;
  v_chars   bigint;
  v_stored  integer;
begin
  if p_runner is null or btrim(p_runner) = '' then
    raise exception 'workspace_ingest_put_text: p_runner is required' using errcode = '22023';
  end if;

  select d.state into v_state
    from workspace_documents d
   where d.id = p_document_id and d.claimed_by = p_runner
     for update;
  if not found then
    raise exception 'workspace_ingest_put_text: document % is not held by %', p_document_id, p_runner
      using errcode = '22023';
  end if;
  if v_state <> 'reading' then
    raise exception 'workspace_ingest_put_text: document % is in state %, not reading', p_document_id, v_state
      using errcode = '22023';
  end if;

  if p_units is null or jsonb_typeof(p_units) <> 'array' then
    raise exception 'workspace_ingest_put_text: p_units must be a json array' using errcode = '22023';
  end if;
  v_n := jsonb_array_length(p_units);
  if v_n < 1 or v_n > c_max_units then
    raise exception 'workspace_ingest_put_text: a document holds 1 to % units, not %', c_max_units, v_n
      using errcode = '22023';
  end if;

  -- Every unit is an object with a kind, a positive number and some text; no (kind, number) twice.
  if exists (select 1
               from jsonb_array_elements(p_units) e
              where not coalesce(
                      jsonb_typeof(e) = 'object'
                      and jsonb_typeof(e->'unit_kind') = 'string'
                      and jsonb_typeof(e->'unit_no') = 'number'
                      and jsonb_typeof(e->'text') = 'string'
                      and char_length(e->>'unit_kind') between 1 and 40
                      and case when (e->>'unit_no') ~ '^[0-9]{1,9}$'
                               then (e->>'unit_no')::integer >= 1 else false end
                      and btrim(e->>'text') <> '', false)) then
    raise exception 'workspace_ingest_put_text: each unit needs a unit_kind of 1 to 40 characters, a unit_no of 1 or more and non-empty text'
      using errcode = '22023';
  end if;
  if (select count(distinct (e->>'unit_kind') || '/' || ((e->>'unit_no')::integer)::text)
        from jsonb_array_elements(p_units) e) <> v_n then
    raise exception 'workspace_ingest_put_text: a (unit_kind, unit_no) appears twice' using errcode = '22023';
  end if;
  select coalesce(sum(char_length(e->>'text')), 0) into v_chars from jsonb_array_elements(p_units) e;
  if v_chars > c_max_chars then
    raise exception 'workspace_ingest_put_text: a document holds at most % characters, not %', c_max_chars, v_chars
      using errcode = '22023';
  end if;

  -- Replace: the units the document had go, and their vectors with them, then the new set comes.
  delete from workspace_text_embeddings v
   using workspace_document_text t
   where t.document_id = p_document_id and v.text_id = t.id;
  delete from workspace_document_text t where t.document_id = p_document_id;

  insert into workspace_document_text (document_id, unit_kind, unit_no, text)
  select p_document_id, e->>'unit_kind', (e->>'unit_no')::integer, e->>'text'
    from jsonb_array_elements(p_units) with ordinality as x(e, ord)
   order by x.ord;
  get diagnostics v_stored = row_count;

  update workspace_documents d
     set state = 'text_ready', error_code = null, claimed_at = now()
   where d.id = p_document_id;
  return v_stored;
end $$;

comment on function public.workspace_ingest_put_text(text, bigint, jsonb) is
  'Puts an upload''s text units (193): p_units is [{unit_kind, unit_no, text}], 1 to 1000 units, at '
  'most 1.5 million characters, no empty text, no (kind, number) twice. Replaces the document''s '
  'units and their vectors in one transaction, so a put sent twice leaves one set; the row goes to '
  'text_ready and its lease is renewed. Returns the count stored. 22023 for a document p_runner '
  'does not hold, one not in reading, or a bad p_units. workspace_ingest_runner only.';

-- =============================================================================================
-- 5. workspace_ingest_finish
-- =============================================================================================
create or replace function public.workspace_ingest_finish(
    p_runner text, p_document_id bigint, p_outcome text, p_error_code text)
  returns text
  language plpgsql security definer set search_path = public, pg_temp as $$
declare
  c_tries constant integer := 3;
  v_state    text;
  v_attempts integer;
  v_units    integer;
  v_unembedded integer;
  v_unvectored integer;
  v_new      text;
begin
  if p_runner is null or btrim(p_runner) = '' then
    raise exception 'workspace_ingest_finish: p_runner is required' using errcode = '22023';
  end if;
  if p_outcome is null or p_outcome not in ('indexed', 'failed', 'retry') then
    raise exception 'workspace_ingest_finish: outcome must be indexed, failed or retry, not %',
      coalesce(p_outcome, 'null') using errcode = '22023';
  end if;
  if p_outcome in ('failed', 'retry')
     and (p_error_code is null
          or p_error_code not in ('too_large', 'bad_type', 'bad_bytes', 'no_text', 'extract_timeout',
                                  'extract_failed', 'too_many_units', 'link_expired',
                                  'download_failed', 'embed_failed')) then
    raise exception 'workspace_ingest_finish: % needs one of the ten error codes, not %', p_outcome,
      coalesce(p_error_code, 'null') using errcode = '22023';
  end if;

  select d.state, d.attempts into v_state, v_attempts
    from workspace_documents d
   where d.id = p_document_id and d.claimed_by = p_runner
     for update;
  if not found then
    raise exception 'workspace_ingest_finish: document % is not held by %', p_document_id, p_runner
      using errcode = '22023';
  end if;
  if v_state not in ('reading', 'text_ready') then
    raise exception 'workspace_ingest_finish: document % is in state %, not reading or text_ready',
      p_document_id, v_state using errcode = '22023';
  end if;

  if p_outcome = 'indexed' then
    select count(*)::integer,
           (count(*) filter (where t.embedded_at is null))::integer,
           (count(*) filter (where not exists (select 1 from workspace_text_embeddings e where e.text_id = t.id)))::integer
      into v_units, v_unembedded, v_unvectored
      from workspace_document_text t
     where t.document_id = p_document_id;
    if v_units = 0 then
      raise exception 'workspace_ingest_finish: document % has no unit, so it cannot be indexed', p_document_id
        using errcode = '22023';
    end if;
    if v_unembedded > 0 or v_unvectored > 0 then
      raise exception 'workspace_ingest_finish: document % has % unit(s) without embedded_at and % without a vector',
        p_document_id, v_unembedded, v_unvectored using errcode = '22023';
    end if;
    v_new := 'indexed';
    update workspace_documents d
       set state = 'indexed', error_code = null, signed_url = null, signed_url_expires_at = null,
           claimed_by = null, claimed_at = null
     where d.id = p_document_id;

  elsif p_outcome = 'failed' or v_attempts + 1 >= c_tries then
    -- Failed outright, or the third try of a step that may be made again.
    v_new := 'failed';
    update workspace_documents d
       set state = 'failed', error_code = p_error_code, attempts = case when p_outcome = 'retry' then least(d.attempts + 1, 3) else d.attempts end,
           signed_url = null, signed_url_expires_at = null, claimed_by = null, claimed_at = null
     where d.id = p_document_id;

  else
    -- retry: back to the queue, one more try used. From reading it goes back to stored.
    v_new := case when v_state = 'reading' then 'stored' else v_state end;
    update workspace_documents d
       set state = v_new, attempts = d.attempts + 1, error_code = p_error_code,
           claimed_by = null, claimed_at = null
     where d.id = p_document_id;
  end if;
  return v_new;
end $$;

comment on function public.workspace_ingest_finish(text, bigint, text, text) is
  'Ends the worker''s hold on a document (193). p_outcome indexed: refused (22023) unless the '
  'document has at least one unit, each with embedded_at and a stored vector; the row becomes '
  'indexed. failed: the row ends failed with p_error_code, one of the ten codes. retry: a try that '
  'may be made again; attempts goes up by one and the row goes back to stored (from reading) or '
  'stays text_ready, and on the third it ends failed with p_error_code instead. Every outcome frees '
  'the lease; indexed and a failed end clear signed_url. Returns the row''s state after the call. '
  'workspace_ingest_runner only.';

-- =============================================================================================
-- 6. workspace_ingest_heartbeat
-- =============================================================================================
create or replace function public.workspace_ingest_heartbeat(p_runner text)
  returns void
  language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_runner is null or btrim(p_runner) = '' then
    raise exception 'workspace_ingest_heartbeat: p_runner is required' using errcode = '22023';
  end if;
  insert into workspace_ingest_heartbeat as h (id, polled_at, runner)
  values (1, now(), p_runner)
  on conflict (id) do update
     set polled_at = excluded.polled_at, runner = excluded.runner;
end $$;

comment on function public.workspace_ingest_heartbeat(text) is
  'The ingest worker''s heartbeat (193): upserts the one row of workspace_ingest_heartbeat (id = 1) '
  'with polled_at = now() and runner = p_runner. workspace_ingest_runner only.';

-- =============================================================================================
-- 7. Privileges. On prod a new function in public is born executable by all four.
-- =============================================================================================
revoke all on function
  public.workspace_ingest_claim(text),
  public.workspace_ingest_put_text(text, bigint, jsonb),
  public.workspace_ingest_finish(text, bigint, text, text),
  public.workspace_ingest_heartbeat(text)
from public, anon, authenticated, service_role;

grant execute on function
  public.workspace_ingest_claim(text),
  public.workspace_ingest_put_text(text, bigint, jsonb),
  public.workspace_ingest_finish(text, bigint, text, text),
  public.workspace_ingest_heartbeat(text)
to workspace_ingest_runner;

-- The suite calls each function the way the worker does, as workspace_ingest_runner, inside its own
-- rolled-back transaction (142's pattern). No table privilege goes with it.
grant workspace_ingest_runner to db_test_runner with inherit false;

-- =============================================================================================
-- 8. Guard (scoped to schema public, as 142's is)
-- =============================================================================================
do $$
declare
  v_got text;
  v_bad text;
begin
  -- (a) The four are exactly the SECURITY DEFINER functions the role can execute.
  select string_agg(p.proname, ',' order by p.proname) into v_got
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prosecdef
     and has_function_privilege('workspace_ingest_runner', p.oid, 'execute');
  if v_got is distinct from
     'workspace_ingest_claim,workspace_ingest_finish,workspace_ingest_heartbeat,workspace_ingest_put_text' then
    raise exception 'FAIL 193: workspace_ingest_runner executes SECURITY DEFINER functions %, expected the four', v_got;
  end if;

  -- (b) No table, view or sequence privilege in public.
  select string_agg(c.relname, ', ' order by c.relname) into v_bad
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'v', 'm', 'p', 'f', 'S')
     and (case when c.relkind = 'S'
               then has_sequence_privilege('workspace_ingest_runner', c.oid, 'usage,select,update')
               else has_table_privilege('workspace_ingest_runner', c.oid,
                                        'select,insert,update,delete,truncate,references,trigger')
                    or has_any_column_privilege('workspace_ingest_runner', c.oid,
                                                'select,insert,update,references')
          end);
  if v_bad is not null then
    raise exception 'FAIL 193: workspace_ingest_runner holds a privilege on %', v_bad;
  end if;

  -- (c) None of the four is executable by anon, authenticated, service_role or PUBLIC.
  select string_agg(p.proname, ', ' order by p.proname) into v_bad
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname like 'workspace\_ingest\_%'
     and (has_function_privilege('anon', p.oid, 'execute')
          or has_function_privilege('authenticated', p.oid, 'execute')
          or has_function_privilege('service_role', p.oid, 'execute')
          or has_function_privilege('public', p.oid, 'execute'));
  if v_bad is not null then
    raise exception 'FAIL 193: anon, authenticated, service_role or PUBLIC can execute %', v_bad;
  end if;

  -- (d) The role is granted to db_test_runner (inherit false, set true); the one other row allowed
  --     is the one PostgreSQL 16+ gives a role's creator.
  if not exists (select 1 from pg_auth_members m
                  where m.roleid = 'workspace_ingest_runner'::regrole and m.member = 'db_test_runner'::regrole
                    and not m.admin_option and not m.inherit_option and m.set_option) then
    raise exception 'FAIL 193: db_test_runner does not hold workspace_ingest_runner with inherit false and set true';
  end if;
  select string_agg(m.member::regrole::text, ', ' order by m.member::regrole::text) into v_bad
    from pg_auth_members m
   where m.roleid = 'workspace_ingest_runner'::regrole
     and not (m.member = 'db_test_runner'::regrole
              and not m.admin_option and not m.inherit_option and m.set_option)
     and not (m.member = 'postgres'::regrole
              and m.admin_option and not m.inherit_option and not m.set_option);
  if v_bad is not null then
    raise exception 'FAIL 193: workspace_ingest_runner is granted to %', v_bad;
  end if;

  -- (e) The role's attributes and its settings.
  if exists (select 1 from pg_roles
              where rolname = 'workspace_ingest_runner'
                and (not rolcanlogin or rolinherit or rolbypassrls or rolsuper or rolcreaterole
                     or rolcreatedb or rolreplication or rolconnlimit <> 4)) then
    raise exception 'FAIL 193: workspace_ingest_runner is not login, noinherit, nobypassrls, connection limit 4 and nothing more';
  end if;
  if not exists (select 1 from pg_roles
                  where rolname = 'workspace_ingest_runner'
                    and coalesce(rolconfig, '{}') @> array['statement_timeout=30s']) then
    raise exception 'FAIL 193: workspace_ingest_runner has no statement_timeout = 30s';
  end if;
end $$;

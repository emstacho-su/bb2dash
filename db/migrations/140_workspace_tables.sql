-- bb2dash :: db/migrations/140_workspace_tables.sql
-- Phase 21 (docs/planning/sprint-2/briefs/102_PHASE21_workspace.md), task 2 (P-86). Worker W-63.
--
-- WHY. The Workspace is a chat surface: Stack asks a question on `/workspace`, a container process
-- answers it with the `claude` CLI on his subscription, and the page shows the answer as it is
-- written. The browser cannot run the model and the runner cannot sign in as the owner, so the two
-- meet in a queue. This file is the browser's half: where a conversation, its messages and its
-- requests are stored, who may read them (the owner, nobody else), and the two functions the page
-- calls. The runner's half is 142 (its login role and five SECURITY DEFINER functions); the
-- Realtime policy the stream needs is 141.
--
-- WHAT
--   1. workspace_prompt_max()                 the 8000-character cap, as one value
--   2. workspace_conversations, workspace_messages, workspace_requests, workspace_runner_heartbeat
--   3. row security: owner policies; no delete policy on any of the four (v1 archives, it has no
--      Delete)
--   4. v_workspace_status                     always exactly one row
--   5. workspace_ask(), workspace_cancel()    SECURITY INVOKER: RLS decides, as 083's do
--   6. privileges
--   7. a guard block
--
-- THE BROWSER'S WRITES ARE COLUMN-LEVEL, the first such grants in this repo. `authenticated` gets
-- `select` on the four tables and may write exactly the columns `workspace_ask` and
-- `workspace_cancel` write, plus `title` and `archived` on a conversation. It can never write
-- `claude_session_id`, `tier`, `provider`, `model`, `tool_calls`, `cost_usd`, `claimed_by` or
-- `attempts`. That narrows the browser's path only: `service_role` and the test role can still
-- write any column, so what holds for `claude_session_id` is its check constraint and the runner's
-- own shape test before it builds argv.
--
-- REFUSALS. A refusal a function raises itself carries SQLSTATE 22023 and a message that starts
-- with the function's name. A second open request in a conversation raises 23505 from the unique
-- index `workspace_requests_one_open`. The page keys its two refusal sentences on those two codes,
-- so `workspace_ask` raises 22023 for nothing but the text's length.
--
-- No password, key or DSN is in this file. Additive only: no drop, no rename, no existing object
-- changed.

-- =============================================================================================
-- 1. The cap
-- =============================================================================================
create or replace function public.workspace_prompt_max()
  returns integer
  language sql immutable parallel safe security invoker set search_path = public, pg_temp as $$
  select 8000
$$;

comment on function public.workspace_prompt_max() is
  'The longest question the Workspace accepts, in characters after trimming: 8000 (migration 140). '
  'Read by workspace_ask(); the web holds the same number as WORKSPACE_PROMPT_MAX in '
  'queries.workspace.ts.';

-- =============================================================================================
-- 2. The tables
-- =============================================================================================
create table public.workspace_conversations (
  id                uuid primary key default gen_random_uuid(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  title             text not null
                    constraint workspace_conversations_title_length
                    check (char_length(title) between 1 and 120),
  claude_session_id text
                    constraint workspace_conversations_session_id_uuid
                    check (claude_session_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'),
  archived          boolean not null default false
);

comment on table public.workspace_conversations is
  'One Workspace chat (migration 140). Archived, never deleted, in v1. Owner-only through RLS.';
comment on column public.workspace_conversations.title is
  'The first line of the first question, cut at 120 characters by workspace_ask(); the owner may edit it.';
comment on column public.workspace_conversations.claude_session_id is
  'The CLI session the next turn resumes: the id the stream reported, stamped by workspace_finish() '
  '(142), null for a first question or when the reported id was not uuid-shaped. Never writable by '
  'the browser.';

create trigger workspace_conversations_updated_at
  before update on public.workspace_conversations
  for each row execute function public.set_updated_at();

create table public.workspace_messages (
  id                uuid primary key default gen_random_uuid(),
  conversation_id   uuid not null
                    references public.workspace_conversations (id) on delete cascade,
  parent_message_id uuid
                    references public.workspace_messages (id) on delete set null,
  role              text not null
                    constraint workspace_messages_role_known
                    check (role in ('user', 'assistant')),
  request_id        bigint,
  tier              text
                    constraint workspace_messages_tier_known
                    check (tier in ('low', 'mid', 'high')),
  provider          text
                    constraint workspace_messages_provider_known
                    check (provider in ('claude-cli', 'ollama', 'frontier-api')),
  model             text,
  content           text not null default ''
                    constraint workspace_messages_content_length
                    check (char_length(content) <= 100000),
  tool_calls        jsonb not null default '[]'::jsonb
                    constraint workspace_messages_tool_calls_array
                    check (case when jsonb_typeof(tool_calls) = 'array'
                                then jsonb_array_length(tool_calls) <= 20
                                else false end),
  finished          boolean not null default false,
  error_code        text
                    constraint workspace_messages_error_code_known
                    check (error_code in ('budget_exceeded', 'timeout', 'stale_claim',
                                          'provider_not_configured', 'cli_error', 'cancelled',
                                          'usage_limit', 'sign_in_expired')),
  cost_usd          numeric(10,4),
  duration_ms       integer,
  created_at        timestamptz not null default now(),
  constraint workspace_messages_user_prompt_length
    check (role <> 'user' or char_length(content) <= 8000)
);

comment on table public.workspace_messages is
  'One message of a Workspace chat (migration 140): a question (role user, written by '
  'workspace_ask) or an answer (role assistant, written by the runner through 142''s functions). '
  'Owner-only through RLS.';
comment on column public.workspace_messages.model is
  'The full model id the CLI reported for the turn when the stream names one, else the alias: '
  'workspace_begin() writes the alias and workspace_finish() replaces it when its p_model is not null.';
comment on column public.workspace_messages.tool_calls is
  'A json array of at most 20 elements in call order, each {"tool": text, "query": text | null, '
  '"scope": text | null, "ok": boolean}. The database checks the array and its length, not the elements.';
comment on column public.workspace_messages.cost_usd is
  'The CLI''s total_cost_usd as reported: Claude Code''s own list-price estimate, not a charge. On a '
  'resumed turn it is the session''s running total, restarting after an abnormal exit. Never summed, '
  'never shown, not comparable across turns.';

create table public.workspace_requests (
  id              bigint generated always as identity primary key,
  created_at      timestamptz not null default now(),
  conversation_id uuid not null
                  references public.workspace_conversations (id) on delete cascade,
  user_message_id uuid not null
                  references public.workspace_messages (id) on delete cascade,
  state           text not null default 'queued'
                  constraint workspace_requests_state_known
                  check (state in ('queued', 'claimed', 'done', 'failed', 'cancelled')),
  claimed_at      timestamptz,
  claimed_by      text,
  finished_at     timestamptz,
  attempts        integer not null default 0,
  error_code      text
                  constraint workspace_requests_error_code_known
                  check (error_code in ('budget_exceeded', 'timeout', 'stale_claim',
                                        'provider_not_configured', 'cli_error', 'cancelled',
                                        'usage_limit', 'sign_in_expired'))
);

comment on table public.workspace_requests is
  'The Workspace queue (migration 140): one row per question, queued by workspace_ask(), claimed and '
  'closed by the runner (142), cancelled by workspace_cancel(). A queued row does not expire. '
  'Owner-only through RLS.';
comment on column public.workspace_requests.error_code is
  'Why the request did not end done: one of the eight codes, written by workspace_cancel (cancelled), '
  'by workspace_finish and by workspace_claim''s stale sweep (stale_claim). The page chooses its '
  'sentence from this column.';

-- The key that closes the cycle with workspace_requests.user_message_id.
alter table public.workspace_messages
  add constraint workspace_messages_request_id_fkey
  foreign key (request_id) references public.workspace_requests (id) on delete set null;

create index workspace_messages_conversation_idx
  on public.workspace_messages (conversation_id, created_at);
create index workspace_messages_parent_idx on public.workspace_messages (parent_message_id);
create index workspace_messages_request_idx on public.workspace_messages (request_id);

create index workspace_requests_conversation_idx on public.workspace_requests (conversation_id);
create index workspace_requests_user_message_idx on public.workspace_requests (user_message_id);
-- One open request per conversation: the 23505 a second question raises.
create unique index workspace_requests_one_open
  on public.workspace_requests (conversation_id)
  where state in ('queued', 'claimed');
-- The runner's claim: the oldest queued row.
create index workspace_requests_state_created_idx on public.workspace_requests (state, created_at);

create table public.workspace_runner_heartbeat (
  id        smallint primary key
            constraint workspace_runner_heartbeat_one_row check (id = 1),
  polled_at timestamptz not null,
  runner    text not null
);

comment on table public.workspace_runner_heartbeat is
  'The Workspace runner''s one heartbeat row (migration 140; id = 1), upserted every 30 s by '
  'workspace_heartbeat() (142). Empty until the service first runs. The page reads it through '
  'v_workspace_status and calls the service offline when polled_at is null or older than 120 s.';

-- =============================================================================================
-- 3. Row security: the owner, in 076's initplan form. No delete policy on any of the four.
-- =============================================================================================
alter table public.workspace_conversations    enable row level security;
alter table public.workspace_messages         enable row level security;
alter table public.workspace_requests         enable row level security;
alter table public.workspace_runner_heartbeat enable row level security;

create policy workspace_conversations_owner_select on public.workspace_conversations
  for select to authenticated
  using ((select auth.uid()) = (select public.app_owner()));
create policy workspace_conversations_owner_insert on public.workspace_conversations
  for insert to authenticated
  with check ((select auth.uid()) = (select public.app_owner()));
create policy workspace_conversations_owner_update on public.workspace_conversations
  for update to authenticated
  using ((select auth.uid()) = (select public.app_owner()))
  with check ((select auth.uid()) = (select public.app_owner()));

create policy workspace_messages_owner_select on public.workspace_messages
  for select to authenticated
  using ((select auth.uid()) = (select public.app_owner()));
-- The browser writes questions only; an answer is the runner's.
create policy workspace_messages_owner_insert on public.workspace_messages
  for insert to authenticated
  with check ((select auth.uid()) = (select public.app_owner()) and role = 'user' and finished);

create policy workspace_requests_owner_select on public.workspace_requests
  for select to authenticated
  using ((select auth.uid()) = (select public.app_owner()));
create policy workspace_requests_owner_insert on public.workspace_requests
  for insert to authenticated
  with check ((select auth.uid()) = (select public.app_owner()) and state = 'queued');
-- The one update the browser may make: Stop.
create policy workspace_requests_owner_cancel on public.workspace_requests
  for update to authenticated
  using ((select auth.uid()) = (select public.app_owner()) and state in ('queued', 'claimed'))
  with check ((select auth.uid()) = (select public.app_owner()) and state = 'cancelled');

create policy workspace_runner_heartbeat_owner_select on public.workspace_runner_heartbeat
  for select to authenticated
  using ((select auth.uid()) = (select public.app_owner()));

-- =============================================================================================
-- 4. v_workspace_status
-- =============================================================================================
-- Always exactly one row: the left join keeps it when the heartbeat table is empty or hidden, so
-- polled_at and runner are null before the first heartbeat, and a null polled_at reads as offline.
create view public.v_workspace_status
  with (security_invoker = true) as
select h.polled_at,
       h.runner,
       (select count(*) from public.workspace_requests r
         where r.state in ('queued', 'claimed'))::integer as open_requests,
       (select min(r.created_at) from public.workspace_requests r
         where r.state in ('queued', 'claimed'))          as oldest_open_at
  from (select 1 as id) one
  left join public.workspace_runner_heartbeat h on h.id = one.id;

comment on view public.v_workspace_status is
  'The Workspace service line (migration 140): always exactly one row. polled_at and runner are the '
  'runner''s heartbeat, null before the first one; open_requests and oldest_open_at count the queued '
  'and claimed requests. Offline = polled_at null or older than 120 s. security_invoker with anon '
  'revoked, as 036 requires: a caller who is not the owner gets the row with nulls and 0.';

-- =============================================================================================
-- 5. The browser's two functions
-- =============================================================================================
create or replace function public.workspace_ask(p_conversation_id uuid, p_text text)
  returns jsonb
  language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  v_text    text := regexp_replace(coalesce(p_text, ''), '^\s+|\s+$', '', 'g');
  v_conv    uuid := p_conversation_id;
  v_message uuid;
  v_request bigint;
begin
  -- The only 22023 this function raises: the page shows its question-length sentence for it.
  if char_length(v_text) < 1 or char_length(v_text) > workspace_prompt_max() then
    raise exception 'workspace_ask: a question is 1 to % characters after trimming, not %',
      workspace_prompt_max(), char_length(v_text) using errcode = '22023';
  end if;

  if v_conv is null then
    insert into workspace_conversations (title)
    values (left(regexp_replace(split_part(v_text, chr(10), 1), '\s+$', ''), 120))
    returning id into v_conv;
  end if;

  insert into workspace_messages (conversation_id, role, content, finished)
  values (v_conv, 'user', v_text, true)
  returning id into v_message;

  -- A second open request in the conversation raises 23505 here (workspace_requests_one_open),
  -- and the statement that called this function rolls the message back with it.
  insert into workspace_requests (conversation_id, user_message_id)
  values (v_conv, v_message)
  returning id into v_request;

  return jsonb_build_object('conversation_id', v_conv,
                            'message_id',      v_message,
                            'request_id',      v_request);
end $$;

comment on function public.workspace_ask(uuid, text) is
  'Asks one Workspace question (migration 140), in one transaction: creates the conversation when '
  'p_conversation_id is null (title = the first line of the text, cut at 120), inserts the user '
  'message (the trimmed text, finished) and a queued request, and returns {conversation_id, '
  'message_id, request_id}. Empty or over-long text raises 22023; a second open request in the '
  'conversation raises 23505. SECURITY INVOKER: only the owner''s JWT passes RLS. authenticated only.';

create or replace function public.workspace_cancel(p_request_id bigint)
  returns boolean
  language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  update workspace_requests r
     set state = 'cancelled', error_code = 'cancelled', finished_at = now()
   where r.id = p_request_id and r.state in ('queued', 'claimed');
  return found;
end $$;

comment on function public.workspace_cancel(bigint) is
  'Stop (migration 140): a queued or claimed request becomes cancelled, with error_code cancelled '
  'and finished_at on the request row. True when a row changed; false for a request that is already '
  'closed, not the caller''s, or missing. SECURITY INVOKER: RLS decides. authenticated only.';

-- =============================================================================================
-- 6. Privileges. The project's default ACL hands every new table, view, sequence and function to
--    anon and authenticated; take all of it back, then give each role its list.
-- =============================================================================================
revoke all on
  public.workspace_conversations,
  public.workspace_messages,
  public.workspace_requests,
  public.workspace_runner_heartbeat,
  public.v_workspace_status
from public, anon, authenticated;

revoke all on sequence public.workspace_requests_id_seq from public, anon, authenticated;

grant select on
  public.workspace_conversations,
  public.workspace_messages,
  public.workspace_requests,
  public.workspace_runner_heartbeat,
  public.v_workspace_status
to authenticated;

grant select on public.v_workspace_status to service_role;

-- Exactly the columns workspace_ask and workspace_cancel write, plus the two a conversation's
-- owner edits. Every other column of an inserted row takes its default.
grant insert (title), update (title, archived) on public.workspace_conversations to authenticated;
grant insert (conversation_id, role, content, finished) on public.workspace_messages to authenticated;
grant insert (conversation_id, user_message_id), update (state, error_code, finished_at)
  on public.workspace_requests to authenticated;

-- Phase 15's runner writes the units' setup rows (brief 95, "The role db_test_runner"). It reads
-- the five through 100's default privilege. Nothing else.
grant insert, update, delete on
  public.workspace_conversations,
  public.workspace_messages,
  public.workspace_requests,
  public.workspace_runner_heartbeat
to db_test_runner;

revoke all on function
  public.workspace_prompt_max(),
  public.workspace_ask(uuid, text),
  public.workspace_cancel(bigint)
from public, anon, authenticated, service_role;

grant execute on function public.workspace_prompt_max() to authenticated, service_role;
grant execute on function
  public.workspace_ask(uuid, text),
  public.workspace_cancel(bigint)
to authenticated;

-- =============================================================================================
-- 7. Guard
-- =============================================================================================
do $$
declare
  v_bad text;
begin
  -- (a) The view runs as its caller.
  if coalesce((select lower(split_part(o, '=', 2)) in ('true', 'on', '1', 'yes', 't', 'y')
                 from pg_class c, unnest(c.reloptions) o
                where c.oid = 'public.v_workspace_status'::regclass
                  and split_part(o, '=', 1) = 'security_invoker'), false) is false then
    raise exception 'FAIL 140: v_workspace_status is not security_invoker';
  end if;

  -- (b) anon holds nothing, on a table or on a column; (c) no TRUNCATE for either browser role.
  select string_agg(c.relname, ', ' order by c.relname) into v_bad
    from pg_class c
   where c.relnamespace = 'public'::regnamespace
     and c.relname in ('workspace_conversations', 'workspace_messages', 'workspace_requests',
                       'workspace_runner_heartbeat', 'v_workspace_status')
     and (has_table_privilege('anon', c.oid,
                              'select, insert, update, delete, truncate, references, trigger')
          or has_any_column_privilege('anon', c.oid, 'select, insert, update, references')
          or has_table_privilege('authenticated', c.oid, 'truncate'));
  if v_bad is not null then
    raise exception 'FAIL 140: anon holds a grant, or a browser role holds TRUNCATE, on %', v_bad;
  end if;

  -- (d) authenticated's writes are column-level only.
  select string_agg(c.relname, ', ' order by c.relname) into v_bad
    from pg_class c
   where c.relnamespace = 'public'::regnamespace
     and c.relname in ('workspace_conversations', 'workspace_messages', 'workspace_requests',
                       'workspace_runner_heartbeat', 'v_workspace_status')
     and has_table_privilege('authenticated', c.oid, 'insert, update, delete, references, trigger');
  if v_bad is not null then
    raise exception 'FAIL 140: authenticated holds a table-level write on %', v_bad;
  end if;

  -- (e) Row security is on, and nothing may be deleted through it.
  select string_agg(c.relname, ', ' order by c.relname) into v_bad
    from pg_class c
   where c.relnamespace = 'public'::regnamespace
     and c.relname in ('workspace_conversations', 'workspace_messages', 'workspace_requests',
                       'workspace_runner_heartbeat')
     and not c.relrowsecurity;
  if v_bad is not null then
    raise exception 'FAIL 140: row security is off on %', v_bad;
  end if;
  select string_agg(p.policyname, ', ' order by p.policyname) into v_bad
    from pg_policies p
   where p.schemaname = 'public'
     and p.tablename in ('workspace_conversations', 'workspace_messages', 'workspace_requests',
                         'workspace_runner_heartbeat')
     and p.cmd in ('DELETE', 'ALL');
  if v_bad is not null then
    raise exception 'FAIL 140: a delete or all policy exists: %', v_bad;
  end if;

  -- (f) The three functions run as their caller, and anon runs none of them.
  select string_agg(p.proname, ', ' order by p.proname) into v_bad
    from pg_proc p
   where p.oid in ('public.workspace_prompt_max()'::regprocedure,
                   'public.workspace_ask(uuid, text)'::regprocedure,
                   'public.workspace_cancel(bigint)'::regprocedure)
     and (p.prosecdef or has_function_privilege('anon', p.oid, 'execute')
          or has_function_privilege('public', p.oid, 'execute'));
  if v_bad is not null then
    raise exception 'FAIL 140: security definer, or executable by anon or PUBLIC: %', v_bad;
  end if;
  if has_function_privilege('service_role', 'public.workspace_ask(uuid, text)', 'execute')
     or has_function_privilege('service_role', 'public.workspace_cancel(bigint)', 'execute') then
    raise exception 'FAIL 140: service_role can execute workspace_ask or workspace_cancel';
  end if;
end $$;

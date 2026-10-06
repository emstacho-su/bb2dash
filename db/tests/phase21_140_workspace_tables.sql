-- bb2dash :: db/tests/phase21_140_workspace_tables.sql
-- Phase 21 (docs/planning/sprint-2/briefs/102_PHASE21_workspace.md), task 2 (P-86). Worker W-63.
-- Tests migration 140: the four Workspace tables, their owner-only RLS, the browser's two RPCs
-- (`workspace_ask`, `workspace_cancel`), `workspace_prompt_max()` and `v_workspace_status`.
--
--   0. installed, and shaped as the Contract freezes it
--   1. privileges, read with has_table_privilege / has_column_privilege / has_any_column_privilege
--      / has_function_privilege. Never information_schema: its privilege views list enabled roles
--      only, so under this runner's inherit-false memberships a count of 0 there proves nothing.
--   2. the owner asks: three rows, the title, the trim, and the two refusals (22023, 23505)
--   3. what the owner's own session may not write, and the two columns it may
--   4. cancel
--   5. every new check constraint refuses its bad value
--   6. v_workspace_status always returns exactly one row
--   7. a stranger uid reads nothing; anon holds no grant
--
-- The functions are called only under `set local role authenticated`, the way the browser calls
-- them; the setup rows and the reads that check a call's effect run as the session role. The unit
-- runs against prod, where real conversations exist, so it asserts on its own rows by id and never
-- on a table's total.
--
-- RUN IT: `node scripts/db-test.mjs --only phase21_140_workspace_tables.sql`. A failing assertion
-- raises; a pass ends with one row reading `phase21_140_workspace_tables: PASS`. NOTHING IS
-- COMMITTED: the file opens its own transaction and its last statement is `rollback`.

begin;

-- =============================================================================================
-- 0. Installed, and shaped as the Contract freezes it
-- =============================================================================================
do $$
declare
  v_fail text[] := '{}';
  v_got  text;
  v_want text;
  t      text;
  f      text;
  r      record;
begin
  foreach t in array array['workspace_conversations', 'workspace_messages', 'workspace_requests',
                           'workspace_runner_heartbeat', 'v_workspace_status'] loop
    if to_regclass('public.' || t) is null then
      raise exception 'FAIL phase21_140: migration 140 is not applied (public.% is missing)', t;
    end if;
  end loop;
  foreach f in array array['public.workspace_prompt_max()', 'public.workspace_ask(uuid, text)',
                           'public.workspace_cancel(bigint)'] loop
    if to_regprocedure(f) is null then
      raise exception 'FAIL phase21_140: migration 140 is not applied (% is missing)', f;
    end if;
  end loop;

  -- Columns: name, type and nullability, in order.
  for r in
    select * from (values
      ('workspace_conversations',
       'id uuid not null, created_at timestamp with time zone not null, '
       'updated_at timestamp with time zone not null, title text not null, claude_session_id text, '
       'archived boolean not null'),
      ('workspace_messages',
       'id uuid not null, conversation_id uuid not null, parent_message_id uuid, role text not null, '
       'request_id bigint, tier text, provider text, model text, content text not null, '
       'tool_calls jsonb not null, finished boolean not null, error_code text, '
       'cost_usd numeric(10,4), duration_ms integer, created_at timestamp with time zone not null'),
      ('workspace_requests',
       'id bigint not null, created_at timestamp with time zone not null, '
       'conversation_id uuid not null, user_message_id uuid not null, state text not null, '
       'claimed_at timestamp with time zone, claimed_by text, finished_at timestamp with time zone, '
       'attempts integer not null, error_code text'),
      ('workspace_runner_heartbeat',
       'id smallint not null, polled_at timestamp with time zone not null, runner text not null'),
      ('v_workspace_status',
       'polled_at timestamp with time zone, runner text, open_requests integer, '
       'oldest_open_at timestamp with time zone')
    ) as x(rel, want)
  loop
    select string_agg(a.attname || ' ' || format_type(a.atttypid, a.atttypmod)
                      || case when a.attnotnull then ' not null' else '' end, ', ' order by a.attnum)
      into v_got
      from pg_attribute a
     where a.attrelid = to_regclass('public.' || r.rel) and a.attnum > 0 and not a.attisdropped;
    if v_got is distinct from r.want then
      v_fail := v_fail || format('%s columns are [%s]', r.rel, v_got);
    end if;
  end loop;

  -- Defaults.
  for r in
    select * from (values
      ('workspace_conversations',
       'id=gen_random_uuid(), created_at=now(), updated_at=now(), archived=false'),
      ('workspace_messages',
       'id=gen_random_uuid(), content=''''::text, tool_calls=''[]''::jsonb, finished=false, '
       'created_at=now()'),
      ('workspace_requests', 'created_at=now(), state=''queued''::text, attempts=0')
    ) as x(rel, want)
  loop
    select string_agg(a.attname || '=' || pg_get_expr(d.adbin, d.adrelid), ', ' order by a.attnum)
      into v_got
      from pg_attrdef d
      join pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum
     where d.adrelid = to_regclass('public.' || r.rel);
    if v_got is distinct from r.want then
      v_fail := v_fail || format('%s defaults are [%s]', r.rel, v_got);
    end if;
  end loop;
  if not exists (select 1 from pg_attribute a
                  where a.attrelid = 'public.workspace_requests'::regclass and a.attname = 'id'
                    and a.attidentity = 'a') then
    v_fail := v_fail || 'workspace_requests.id is not generated always as identity'::text;
  end if;

  -- Row security on all four, and the nine policies: none for DELETE, none for ALL.
  select string_agg(c.relname, ', ' order by c.relname collate "C") into v_got
    from pg_class c
   where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
     and c.relname in ('workspace_conversations', 'workspace_messages', 'workspace_requests',
                       'workspace_runner_heartbeat')
     and not c.relrowsecurity;
  if v_got is not null then
    v_fail := v_fail || format('row security is off on %s', v_got);
  end if;

  select string_agg(p.tablename || '.' || p.policyname || ':' || p.cmd || ':'
                    || array_to_string(p.roles, '+') || ':' || p.permissive,
                    ', ' order by p.tablename collate "C", p.policyname collate "C")
    into v_got
    from pg_policies p
   where p.schemaname = 'public'
     and p.tablename in ('workspace_conversations', 'workspace_messages', 'workspace_requests',
                         'workspace_runner_heartbeat');
  v_want :=
    'workspace_conversations.workspace_conversations_owner_insert:INSERT:authenticated:PERMISSIVE, '
    'workspace_conversations.workspace_conversations_owner_select:SELECT:authenticated:PERMISSIVE, '
    'workspace_conversations.workspace_conversations_owner_update:UPDATE:authenticated:PERMISSIVE, '
    'workspace_messages.workspace_messages_owner_insert:INSERT:authenticated:PERMISSIVE, '
    'workspace_messages.workspace_messages_owner_select:SELECT:authenticated:PERMISSIVE, '
    'workspace_requests.workspace_requests_owner_cancel:UPDATE:authenticated:PERMISSIVE, '
    'workspace_requests.workspace_requests_owner_insert:INSERT:authenticated:PERMISSIVE, '
    'workspace_requests.workspace_requests_owner_select:SELECT:authenticated:PERMISSIVE, '
    'workspace_runner_heartbeat.workspace_runner_heartbeat_owner_select:SELECT:authenticated:PERMISSIVE';
  if v_got is distinct from v_want then
    v_fail := v_fail || format('the policies are [%s]', v_got);
  end if;

  -- Every one is the owner's, in the initplan form (phase12b_076 holds the form itself), and the
  -- three narrowed ones say what they narrow to.
  select string_agg(p.policyname, ', ' order by p.policyname collate "C") into v_got
    from pg_policies p
   where p.schemaname = 'public' and p.tablename like 'workspace\_%'
     and coalesce(p.qual, '') || ' ' || coalesce(p.with_check, '') not like '%app_owner()%';
  if v_got is not null then
    v_fail := v_fail || format('these policies do not name app_owner(): %s', v_got);
  end if;
  if not exists (select 1 from pg_policies p
                  where p.schemaname = 'public' and p.policyname = 'workspace_messages_owner_insert'
                    and p.with_check like '%role = ''user''%' and p.with_check like '%finished%') then
    v_fail := v_fail || 'workspace_messages_owner_insert does not require role = user and finished'::text;
  end if;
  if not exists (select 1 from pg_policies p
                  where p.schemaname = 'public' and p.policyname = 'workspace_requests_owner_insert'
                    and p.with_check like '%state = ''queued''%') then
    v_fail := v_fail || 'workspace_requests_owner_insert does not require state = queued'::text;
  end if;
  if not exists (select 1 from pg_policies p
                  where p.schemaname = 'public' and p.policyname = 'workspace_requests_owner_cancel'
                    and p.qual like '%''queued''%' and p.qual like '%''claimed''%'
                    and p.with_check like '%state = ''cancelled''%') then
    v_fail := v_fail || 'workspace_requests_owner_cancel is not queued/claimed -> cancelled'::text;
  end if;

  -- Foreign keys: three on messages, two on requests, with their delete rules.
  select string_agg(c.relname || '.' || a.attname || '->' || fc.relname || ':' || k.confdeltype::text,
                    ', ' order by c.relname collate "C", a.attname collate "C")
    into v_got
    from pg_constraint k
    join pg_class c on c.oid = k.conrelid
    join pg_class fc on fc.oid = k.confrelid
    join pg_attribute a on a.attrelid = k.conrelid and a.attnum = k.conkey[1]
   where k.contype = 'f' and c.relnamespace = 'public'::regnamespace
     and c.relname in ('workspace_messages', 'workspace_requests');
  v_want :=
    'workspace_messages.conversation_id->workspace_conversations:c, '
    'workspace_messages.parent_message_id->workspace_messages:n, '
    'workspace_messages.request_id->workspace_requests:n, '
    'workspace_requests.conversation_id->workspace_conversations:c, '
    'workspace_requests.user_message_id->workspace_messages:c';
  if v_got is distinct from v_want then
    v_fail := v_fail || format('the foreign keys are [%s]', v_got);
  end if;

  -- Indexes: task 2's two counts, the one-open rule and the queue order.
  if (select count(*) from pg_indexes
       where schemaname = 'public' and tablename = 'workspace_messages'
         and indexdef ~ '\((parent_message_id|request_id)') <> 2 then
    v_fail := v_fail || 'workspace_messages lacks its parent_message_id or request_id index'::text;
  end if;
  if not exists (select 1 from pg_indexes
                  where schemaname = 'public' and tablename = 'workspace_messages'
                    and indexdef ~ '\(conversation_id') then
    v_fail := v_fail || 'workspace_messages.conversation_id is not indexed'::text;
  end if;
  if (select count(*) from pg_indexes
       where schemaname = 'public' and tablename = 'workspace_requests'
         and indexdef ~ '\((conversation_id|user_message_id)\)$') <> 2 then
    v_fail := v_fail || 'workspace_requests lacks a plain index on conversation_id or user_message_id'::text;
  end if;
  if not exists (select 1 from pg_indexes
                  where schemaname = 'public' and indexname = 'workspace_requests_one_open'
                    and indexdef like 'CREATE UNIQUE INDEX %(conversation_id) WHERE %'
                    and indexdef like '%''queued''%' and indexdef like '%''claimed''%') then
    v_fail := v_fail || 'workspace_requests_one_open is not unique on conversation_id where queued or claimed'::text;
  end if;
  if not exists (select 1 from pg_indexes
                  where schemaname = 'public' and tablename = 'workspace_requests'
                    and indexdef ~ '\(state, created_at\)$') then
    v_fail := v_fail || 'workspace_requests has no (state, created_at) index'::text;
  end if;

  -- updated_at is maintained, and the view runs as its caller.
  if not exists (select 1 from pg_trigger g
                  where g.tgrelid = 'public.workspace_conversations'::regclass and not g.tgisinternal
                    and g.tgfoid = 'public.set_updated_at()'::regprocedure) then
    v_fail := v_fail || 'workspace_conversations has no set_updated_at() trigger'::text;
  end if;
  if coalesce((select lower(split_part(o, '=', 2)) in ('true', 'on', '1', 'yes', 't', 'y')
                 from pg_class c, unnest(c.reloptions) o
                where c.oid = 'public.v_workspace_status'::regclass
                  and split_part(o, '=', 1) = 'security_invoker'), false) is false then
    v_fail := v_fail || 'v_workspace_status is not security_invoker'::text;
  end if;

  -- The three functions: security invoker, search_path pinned, commented.
  for r in
    select p.oid::regprocedure::text as sig, p.proname, p.prosecdef, p.provolatile,
           format_type(p.prorettype, null) as ret, coalesce(p.proconfig, '{}') as cfg,
           obj_description(p.oid, 'pg_proc') as note
      from pg_proc p
     where p.oid in ('public.workspace_prompt_max()'::regprocedure,
                     'public.workspace_ask(uuid, text)'::regprocedure,
                     'public.workspace_cancel(bigint)'::regprocedure)
  loop
    if r.prosecdef then v_fail := v_fail || format('%s is security definer', r.proname); end if;
    if not r.cfg @> array['search_path=public, pg_temp'] then
      v_fail := v_fail || format('%s does not pin search_path = public, pg_temp', r.proname);
    end if;
    if r.note is null then v_fail := v_fail || format('%s has no comment', r.proname); end if;
    if r.ret is distinct from (case r.proname when 'workspace_prompt_max' then 'integer'
                                              when 'workspace_ask' then 'jsonb'
                                              else 'boolean' end) then
      v_fail := v_fail || format('%s returns %s', r.proname, r.ret);
    end if;
    if r.proname = 'workspace_prompt_max' and r.provolatile <> 'i' then
      v_fail := v_fail || 'workspace_prompt_max is not immutable'::text;
    end if;
  end loop;

  if cardinality(v_fail) > 0 then
    raise exception 'FAIL phase21_140 (shape): %', array_to_string(v_fail, '; ');
  end if;
end $$;

-- =============================================================================================
-- 1. Privileges
-- =============================================================================================
do $$
declare
  v_fail text[] := '{}';
  v_got  text;
  v_want text;
  t      text;
  v_rels text[] := array['workspace_conversations', 'workspace_messages', 'workspace_requests',
                         'workspace_runner_heartbeat', 'v_workspace_status'];
  v_tabs text[] := array['workspace_conversations', 'workspace_messages', 'workspace_requests',
                         'workspace_runner_heartbeat'];
begin
  foreach t in array v_rels loop
    -- anon: nothing, on the relation or on any column of it.
    if has_table_privilege('anon', 'public.' || t,
                           'select, insert, update, delete, truncate, references, trigger')
       or has_any_column_privilege('anon', 'public.' || t, 'select, insert, update, references') then
      v_fail := v_fail || format('anon holds a privilege on %s', t);
    end if;
    -- authenticated: select on the relation, and no other privilege on the relation as a whole.
    if not has_table_privilege('authenticated', 'public.' || t, 'select') then
      v_fail := v_fail || format('authenticated cannot select %s', t);
    end if;
    if has_table_privilege('authenticated', 'public.' || t,
                           'insert, update, delete, truncate, references, trigger') then
      v_fail := v_fail || format('authenticated holds a table-level write on %s', t);
    end if;
    if has_any_column_privilege('authenticated', 'public.' || t, 'references') then
      v_fail := v_fail || format('authenticated holds references on a column of %s', t);
    end if;
    -- The runner of this suite reads all five (100's default privilege).
    if not has_table_privilege('db_test_runner', 'public.' || t, 'select') then
      v_fail := v_fail || format('db_test_runner cannot select %s', t);
    end if;
    if has_table_privilege('db_test_runner', 'public.' || t, 'truncate') then
      v_fail := v_fail || format('db_test_runner can truncate %s', t);
    end if;
  end loop;

  -- db_test_runner writes the four tables' setup rows (brief 95's rule for a table a unit writes).
  foreach t in array v_tabs loop
    if not (has_table_privilege('db_test_runner', 'public.' || t, 'insert')
            and has_table_privilege('db_test_runner', 'public.' || t, 'update')
            and has_table_privilege('db_test_runner', 'public.' || t, 'delete')) then
      v_fail := v_fail || format('db_test_runner lacks insert, update or delete on %s', t);
    end if;
  end loop;

  -- authenticated's writes are column-level, and exactly these twelve.
  select string_agg(c.relname || '.' || a.attname || ':' || p.priv, ', '
                    order by c.relname collate "C", a.attname collate "C", p.priv)
    into v_got
    from pg_class c
    join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
    cross join (values ('insert'), ('update')) as p(priv)
   where c.relnamespace = 'public'::regnamespace and c.relname = any (v_rels)
     and has_column_privilege('authenticated', c.oid, a.attname, p.priv);
  v_want :=
    'workspace_conversations.archived:update, workspace_conversations.title:insert, '
    'workspace_conversations.title:update, workspace_messages.content:insert, '
    'workspace_messages.conversation_id:insert, workspace_messages.finished:insert, '
    'workspace_messages.role:insert, workspace_requests.conversation_id:insert, '
    'workspace_requests.error_code:update, workspace_requests.finished_at:update, '
    'workspace_requests.state:update, workspace_requests.user_message_id:insert';
  if v_got is distinct from v_want then
    v_fail := v_fail || format('authenticated''s column-level writes are [%s]', v_got);
  end if;

  -- Named separately, so a later edit to the list above cannot let one of these in by accident.
  select string_agg(x.rel || '.' || x.col, ', ' order by x.rel collate "C", x.col collate "C")
    into v_got
    from (values ('workspace_conversations', 'claude_session_id'),
                 ('workspace_messages', 'tier'), ('workspace_messages', 'provider'),
                 ('workspace_messages', 'model'), ('workspace_messages', 'tool_calls'),
                 ('workspace_messages', 'cost_usd'), ('workspace_requests', 'claimed_by'),
                 ('workspace_requests', 'attempts')) as x(rel, col)
   where has_column_privilege('authenticated', 'public.' || x.rel, x.col, 'insert')
      or has_column_privilege('authenticated', 'public.' || x.rel, x.col, 'update');
  if v_got is not null then
    v_fail := v_fail || format('authenticated may write %s', v_got);
  end if;

  -- Functions: anon and PUBLIC none; authenticated all three; service_role the cap only.
  select string_agg(w.who || ':' || g.fn, ', ' order by w.who collate "C", g.fn collate "C")
    into v_got
    from (values ('anon'), ('public'), ('authenticated'), ('service_role'), ('db_test_runner')) as w(who)
    cross join (values ('workspace_prompt_max()'), ('workspace_ask(uuid, text)'),
                       ('workspace_cancel(bigint)')) as g(fn)
   where has_function_privilege(w.who::name, 'public.' || g.fn, 'execute');
  v_want :=
    'authenticated:workspace_ask(uuid, text), authenticated:workspace_cancel(bigint), '
    'authenticated:workspace_prompt_max(), service_role:workspace_prompt_max()';
  if v_got is distinct from v_want then
    v_fail := v_fail || format('the three functions are executable by [%s]', v_got);
  end if;

  if cardinality(v_fail) > 0 then
    raise exception 'FAIL phase21_140 (privileges): %', array_to_string(v_fail, '; ');
  end if;
end $$;

-- =============================================================================================
-- 2, 3, 4. The owner asks, what the owner may not write, and cancel
-- =============================================================================================
do $$
declare
  v_owner uuid := app_owner();
  v_out   jsonb;
  v_conv  uuid;      -- the first conversation
  v_msg   uuid;      -- its first user message
  v_req   bigint;    -- its first request
  v_conv2 uuid;      -- the 8000-character conversation
  v_req2  bigint;
  v_req3  bigint;    -- the follow-up request in the first conversation
  v_txt   text;
  v_got   text;
  v_said  text;
  v_n     integer;
  v_ok    boolean;
  v_row   record;
  v_case  record;
begin
  if v_owner is null then
    raise exception 'FAIL phase21_140: app_owner() returned null, so the owner cannot be simulated';
  end if;
  perform set_config('request.jwt.claim.sub', v_owner::text, true);

  -- 2a. The cap is one number, here and in the page.
  set local role authenticated;
  v_n := workspace_prompt_max();
  reset role;
  if v_n is distinct from 8000 then
    raise exception 'FAIL 2a: workspace_prompt_max() returned %, expected 8000', v_n;
  end if;

  -- 2b. A first question creates three rows. The text is stored trimmed; the title is its first line.
  set local role authenticated;
  v_out := workspace_ask(null, '  ' || chr(10) || 'What does the syllabus say about late work?   '
                               || chr(13) || chr(10) || 'A second line.' || chr(10) || '  ');
  reset role;
  if (select string_agg(k, ',' order by k collate "C") from jsonb_object_keys(v_out) k)
     is distinct from 'conversation_id,message_id,request_id' then
    raise exception 'FAIL 2b: workspace_ask returned %', v_out;
  end if;
  v_conv := (v_out->>'conversation_id')::uuid;
  v_msg  := (v_out->>'message_id')::uuid;
  v_req  := (v_out->>'request_id')::bigint;

  select c.title, c.archived, c.claude_session_id into v_row
    from workspace_conversations c where c.id = v_conv;
  if not found or v_row.title <> 'What does the syllabus say about late work?'
     or v_row.archived or v_row.claude_session_id is not null then
    raise exception 'FAIL 2b: the conversation reads %', row_to_json(v_row);
  end if;
  select m.conversation_id, m.role, m.content, m.finished, m.parent_message_id, m.request_id,
         m.tier, m.provider, m.model, m.tool_calls, m.error_code
    into v_row from workspace_messages m where m.id = v_msg;
  if not found or v_row.conversation_id <> v_conv or v_row.role <> 'user' or not v_row.finished
     or v_row.content <> 'What does the syllabus say about late work?   ' || chr(13) || chr(10)
                         || 'A second line.'
     or v_row.parent_message_id is not null or v_row.request_id is not null
     or v_row.tier is not null or v_row.provider is not null or v_row.model is not null
     or v_row.tool_calls <> '[]'::jsonb or v_row.error_code is not null then
    raise exception 'FAIL 2b: the user message reads %', row_to_json(v_row);
  end if;
  select r.conversation_id, r.user_message_id, r.state, r.attempts, r.claimed_at, r.claimed_by,
         r.finished_at, r.error_code
    into v_row from workspace_requests r where r.id = v_req;
  if not found or v_row.conversation_id <> v_conv or v_row.user_message_id <> v_msg
     or v_row.state <> 'queued' or v_row.attempts <> 0 or v_row.claimed_at is not null
     or v_row.claimed_by is not null or v_row.finished_at is not null
     or v_row.error_code is not null then
    raise exception 'FAIL 2b: the request reads %', row_to_json(v_row);
  end if;
  if (select count(*) from workspace_messages m where m.conversation_id = v_conv) <> 1
     or (select count(*) from workspace_requests r where r.conversation_id = v_conv) <> 1 then
    raise exception 'FAIL 2b: the first question did not create exactly one message and one request';
  end if;

  -- 2c. A second question while the first is open: 23505 from workspace_requests_one_open, and the
  --     refused call leaves no user message behind.
  set local role authenticated;
  begin
    perform workspace_ask(v_conv, 'A second question while the first is open');
    v_got := 'no error';
    v_said := '';
  exception when others then
    v_got := sqlstate;
    v_said := sqlerrm;
  end;
  reset role;
  if v_got <> '23505' or v_said not like '%workspace_requests_one_open%' then
    raise exception 'FAIL 2c: a second open request raised % (%), expected 23505 from workspace_requests_one_open',
      v_got, v_said;
  end if;
  if (select count(*) from workspace_messages m where m.conversation_id = v_conv) <> 1 then
    raise exception 'FAIL 2c: the refused question left its user message behind';
  end if;

  -- 2d. Empty and over-long text: 22023, in a message that starts with the function's name.
  foreach v_txt in array array['', '   ', chr(10) || chr(9) || ' ', repeat('x', 8001), null]::text[] loop
    set local role authenticated;
    begin
      perform workspace_ask(null, v_txt);
      v_got := 'no error';
      v_said := '';
    exception when others then
      v_got := sqlstate;
      v_said := sqlerrm;
    end;
    reset role;
    if v_got <> '22023' or v_said not like 'workspace_ask:%' then
      raise exception 'FAIL 2d: a question of % characters raised % (%), expected 22023 from workspace_ask',
        coalesce(char_length(v_txt)::text, 'null'), v_got, v_said;
    end if;
  end loop;

  -- 2e. 8000 characters is inside the cap; the title is cut at 120.
  set local role authenticated;
  v_out := workspace_ask(null, repeat('y', 8000));
  reset role;
  v_conv2 := (v_out->>'conversation_id')::uuid;
  v_req2  := (v_out->>'request_id')::bigint;
  if (select c.title from workspace_conversations c where c.id = v_conv2)
     is distinct from repeat('y', 120) then
    raise exception 'FAIL 2e: the title of an 8000-character question is not its first 120 characters';
  end if;
  if (select char_length(m.content) from workspace_messages m
       where m.id = (v_out->>'message_id')::uuid) <> 8000 then
    raise exception 'FAIL 2e: the 8000-character question was not stored whole';
  end if;

  -- 2f. Once the first request is closed, a follow-up lands in the same conversation.
  update workspace_requests set state = 'done', finished_at = now() where id = v_req;
  set local role authenticated;
  v_out := workspace_ask(v_conv, 'A follow-up');
  reset role;
  v_req3 := (v_out->>'request_id')::bigint;
  if (v_out->>'conversation_id')::uuid <> v_conv
     or (select count(*) from workspace_messages m where m.conversation_id = v_conv) <> 2
     or (select c.title from workspace_conversations c where c.id = v_conv)
        <> 'What does the syllabus say about late work?' then
    raise exception 'FAIL 2f: the follow-up did not land in the first conversation (%)', v_out;
  end if;

  -- 2g. A conversation that does not exist is refused, and not with either code the page reads.
  set local role authenticated;
  begin
    perform workspace_ask('00000000-0000-4000-8000-000000002140', 'A question for no conversation');
    v_got := 'no error';
  exception when others then
    v_got := sqlstate;
  end;
  reset role;
  if v_got <> '23503' then
    raise exception 'FAIL 2g: a question for a missing conversation raised %, expected 23503', v_got;
  end if;

  -- 3. What the owner's own session may not write, and the two columns it may. `want` is a
  --    SQLSTATE, or ok:<rows> for a statement that must succeed.
  set local role authenticated;
  for v_case in
    select * from (values
      ('insert an assistant message', '42501',
       format('insert into workspace_messages (conversation_id, role, content, finished) '
              'values (%L, ''assistant'', ''x'', true)', v_conv)),
      ('insert an unfinished user message', '42501',
       format('insert into workspace_messages (conversation_id, role, content, finished) '
              'values (%L, ''user'', ''x'', false)', v_conv)),
      ('insert a message naming tier', '42501',
       format('insert into workspace_messages (conversation_id, role, content, finished, tier) '
              'values (%L, ''user'', ''x'', true, ''low'')', v_conv)),
      ('insert a message naming tool_calls', '42501',
       format('insert into workspace_messages (conversation_id, role, content, finished, tool_calls) '
              'values (%L, ''user'', ''x'', true, ''[]'')', v_conv)),
      ('insert a request naming its state', '42501',
       format('insert into workspace_requests (conversation_id, user_message_id, state) '
              'values (%L, %L, ''claimed'')', v_conv2, v_msg)),
      ('update an open request to done', '42501',
       format('update workspace_requests set state = ''done'' where id = %s', v_req3)),
      ('update an open request to failed', '42501',
       format('update workspace_requests set state = ''failed'' where id = %s', v_req3)),
      ('update a done request to cancelled', 'ok:0',
       format('update workspace_requests set state = ''cancelled'' where id = %s', v_req)),
      ('update a request''s attempts', '42501',
       format('update workspace_requests set attempts = 9 where id = %s', v_req3)),
      ('update a request''s claimed_by', '42501',
       format('update workspace_requests set claimed_by = ''me'' where id = %s', v_req3)),
      ('update a conversation''s claude_session_id', '42501',
       format('update workspace_conversations set claude_session_id = null where id = %L', v_conv)),
      ('update a conversation''s title', 'ok:1',
       format('update workspace_conversations set title = ''Late work'' where id = %L', v_conv)),
      ('archive a conversation', 'ok:1',
       format('update workspace_conversations set archived = true where id = %L', v_conv)),
      ('update a message''s content', '42501',
       format('update workspace_messages set content = ''edited'' where id = %L', v_msg)),
      ('delete a conversation', '42501',
       format('delete from workspace_conversations where id = %L', v_conv)),
      ('delete a message', '42501',
       format('delete from workspace_messages where id = %L', v_msg)),
      ('delete a request', '42501',
       format('delete from workspace_requests where id = %s', v_req)),
      ('delete the heartbeat', '42501', 'delete from workspace_runner_heartbeat'),
      ('insert a heartbeat', '42501',
       'insert into workspace_runner_heartbeat (id, polled_at, runner) values (1, now(), ''me'')'),
      ('update the heartbeat', '42501', 'update workspace_runner_heartbeat set runner = ''me'''),
      ('truncate the messages', '42501', 'truncate workspace_messages')
    ) as x(label, want, stmt)
  loop
    begin
      execute v_case.stmt;
      get diagnostics v_n = row_count;
      v_got := 'ok:' || v_n;
    exception when others then
      v_got := sqlstate;
    end;
    if v_got <> v_case.want then
      raise exception 'FAIL 3 (%): got %, expected %', v_case.label, v_got, v_case.want;
    end if;
  end loop;
  reset role;
  select c.title, c.archived into v_row from workspace_conversations c where c.id = v_conv;
  if v_row.title <> 'Late work' or not v_row.archived then
    raise exception 'FAIL 3: the owner''s title and archived updates did not land (%)', row_to_json(v_row);
  end if;

  -- 4. Cancel: queued -> cancelled with the code on the request row; a second cancel, a done
  --    request and a null id each return false; claimed -> cancelled.
  set local role authenticated;
  v_ok := workspace_cancel(v_req3);
  reset role;
  select r.state, r.error_code, r.finished_at into v_row from workspace_requests r where r.id = v_req3;
  if v_ok is not true or v_row.state <> 'cancelled' or v_row.error_code is distinct from 'cancelled'
     or v_row.finished_at is null then
    raise exception 'FAIL 4: cancel of a queued request returned % and left %', v_ok, row_to_json(v_row);
  end if;
  set local role authenticated;
  v_ok := workspace_cancel(v_req3);
  reset role;
  if v_ok is not false then
    raise exception 'FAIL 4: a second cancel returned %, expected false', v_ok;
  end if;
  set local role authenticated;
  v_ok := workspace_cancel(v_req);
  reset role;
  if v_ok is not false or (select r.state from workspace_requests r where r.id = v_req) <> 'done' then
    raise exception 'FAIL 4: cancel of a done request returned %, expected false', v_ok;
  end if;
  set local role authenticated;
  v_ok := workspace_cancel(null);
  reset role;
  if v_ok is not false then
    raise exception 'FAIL 4: cancel of a null id returned %, expected false', v_ok;
  end if;
  update workspace_requests
     set state = 'claimed', claimed_at = now(), claimed_by = 'phase21_140', attempts = 1
   where id = v_req2;
  set local role authenticated;
  v_ok := workspace_cancel(v_req2);
  reset role;
  select r.state, r.error_code into v_row from workspace_requests r where r.id = v_req2;
  if v_ok is not true or v_row.state <> 'cancelled' or v_row.error_code is distinct from 'cancelled' then
    raise exception 'FAIL 4: cancel of a claimed request returned % and left %', v_ok, row_to_json(v_row);
  end if;

  -- The later sections read these ids.
  perform set_config('w63.conv', v_conv::text, true);
  perform set_config('w63.msg', v_msg::text, true);
  perform set_config('w63.req', v_req::text, true);
end $$;

-- =============================================================================================
-- 5. Every new check constraint refuses its bad value (as the session role, which bypasses RLS)
-- =============================================================================================
do $$
declare
  v_conv uuid := current_setting('w63.conv')::uuid;
  v_msg  uuid := current_setting('w63.msg')::uuid;
  v_req  bigint := current_setting('w63.req')::bigint;
  v_code text;
  v_got  text;
  v_n    integer;
  v_case record;
begin
  for v_case in
    select * from (values
      ('a claude_session_id that is not uuid-shaped', '23514',
       format('update workspace_conversations set claude_session_id = ''not-a-uuid'' where id = %L', v_conv)),
      ('an upper-case claude_session_id', '23514',
       format('update workspace_conversations set claude_session_id = '
              '''0A1B2C3D-0000-4000-8000-00000000ABCD'' where id = %L', v_conv)),
      ('a uuid-shaped claude_session_id', 'ok:1',
       format('update workspace_conversations set claude_session_id = '
              '''0a1b2c3d-0000-4000-8000-00000000abcd'' where id = %L', v_conv)),
      ('an empty title', '23514',
       format('update workspace_conversations set title = '''' where id = %L', v_conv)),
      ('a 121-character title', '23514',
       format('update workspace_conversations set title = repeat(''t'', 121) where id = %L', v_conv)),
      ('a 120-character title', 'ok:1',
       format('update workspace_conversations set title = repeat(''t'', 120) where id = %L', v_conv)),
      ('a message error_code off the eight', '23514',
       format('update workspace_messages set error_code = ''nope'' where id = %L', v_msg)),
      ('a request error_code off the eight', '23514',
       format('update workspace_requests set error_code = ''nope'' where id = %s', v_req)),
      ('tool_calls that is an object', '23514',
       format('update workspace_messages set tool_calls = ''{}'' where id = %L', v_msg)),
      ('tool_calls that is a string', '23514',
       format('update workspace_messages set tool_calls = ''"x"'' where id = %L', v_msg)),
      ('tool_calls of 21 elements', '23514',
       format('update workspace_messages set tool_calls = '
              '(select jsonb_agg(i) from generate_series(1, 21) i) where id = %L', v_msg)),
      ('tool_calls of 20 elements', 'ok:1',
       format('update workspace_messages set tool_calls = '
              '(select jsonb_agg(i) from generate_series(1, 20) i) where id = %L', v_msg)),
      ('a direct insert of an 8001-character user message', '23514',
       format('insert into workspace_messages (conversation_id, role, content, finished) '
              'values (%L, ''user'', repeat(''x'', 8001), true)', v_conv)),
      ('an 8001-character assistant message', 'ok:1',
       format('insert into workspace_messages (conversation_id, role, content, finished) '
              'values (%L, ''assistant'', repeat(''x'', 8001), true)', v_conv)),
      ('a 100001-character assistant message', '23514',
       format('insert into workspace_messages (conversation_id, role, content, finished) '
              'values (%L, ''assistant'', repeat(''x'', 100001), true)', v_conv)),
      ('a role that is neither user nor assistant', '23514',
       format('insert into workspace_messages (conversation_id, role, content) '
              'values (%L, ''system'', ''x'')', v_conv)),
      ('a tier off the three', '23514',
       format('update workspace_messages set tier = ''max'' where id = %L', v_msg)),
      ('a provider off the three', '23514',
       format('update workspace_messages set provider = ''openai'' where id = %L', v_msg)),
      ('a state off the five', '23514',
       format('update workspace_requests set state = ''paused'' where id = %s', v_req)),
      ('a second heartbeat row', '23514',
       'insert into workspace_runner_heartbeat (id, polled_at, runner) values (2, now(), ''x'')'),
      ('an open request by direct insert', 'ok:1',
       format('insert into workspace_requests (conversation_id, user_message_id) values (%L, %L)',
              v_conv, v_msg)),
      ('a second open request by direct insert', '23505',
       format('insert into workspace_requests (conversation_id, user_message_id) values (%L, %L)',
              v_conv, v_msg))
    ) as x(label, want, stmt)
  loop
    begin
      execute v_case.stmt;
      get diagnostics v_n = row_count;
      v_got := 'ok:' || v_n;
    exception when others then
      v_got := sqlstate;
    end;
    if v_got <> v_case.want then
      raise exception 'FAIL 5 (%): got %, expected %', v_case.label, v_got, v_case.want;
    end if;
  end loop;

  -- And each of the eight codes is accepted on both tables.
  foreach v_code in array array['budget_exceeded', 'timeout', 'stale_claim', 'provider_not_configured',
                                'cli_error', 'cancelled', 'usage_limit', 'sign_in_expired'] loop
    update workspace_messages set error_code = v_code where id = v_msg;
    update workspace_requests set error_code = v_code where id = v_req;
  end loop;
end $$;

-- =============================================================================================
-- 6. v_workspace_status: always exactly one row
-- =============================================================================================
-- On prod the heartbeat row always exists once the service has run, so the unit deletes it inside
-- its own transaction before it asserts the null polled_at.
do $$
declare
  v_n   integer;
  v_ok  boolean;
  v_row record;
begin
  delete from workspace_runner_heartbeat;

  select count(*), bool_and(s.polled_at is null and s.runner is null) into v_n, v_ok
    from v_workspace_status s;
  if v_n <> 1 or v_ok is not true then
    raise exception 'FAIL 6: with no heartbeat the view returned % row(s), nulls %', v_n, v_ok;
  end if;

  -- As the owner: the same one row, and its two counts are the open requests'. Section 5 left one
  -- open, so open_requests is at least 1 here.
  perform set_config('request.jwt.claim.sub', app_owner()::text, true);
  set local role authenticated;
  select count(*),
         bool_and(s.polled_at is null and s.runner is null and s.open_requests >= 1
                  and s.open_requests = (select count(*) from workspace_requests r
                                          where r.state in ('queued', 'claimed'))
                  and s.oldest_open_at is not distinct from
                      (select min(r.created_at) from workspace_requests r
                        where r.state in ('queued', 'claimed')))
    into v_n, v_ok
    from v_workspace_status s;
  reset role;
  if v_n <> 1 or v_ok is not true then
    raise exception 'FAIL 6: as the owner the view returned % row(s), agreeing %', v_n, v_ok;
  end if;

  insert into workspace_runner_heartbeat (id, polled_at, runner) values (1, now(), 'phase21_140');
  set local role authenticated;
  select count(*) as n, max(s.runner) as runner, bool_and(s.polled_at is not null) as polled
    into v_row from v_workspace_status s;
  reset role;
  if v_row.n <> 1 or v_row.runner is distinct from 'phase21_140' or v_row.polled is not true then
    raise exception 'FAIL 6: with a heartbeat the view reads %', row_to_json(v_row);
  end if;
end $$;

-- =============================================================================================
-- 7. A stranger uid reads nothing; anon holds no grant
-- =============================================================================================
do $$
declare
  v_conv uuid := current_setting('w63.conv')::uuid;
  v_req  bigint := current_setting('w63.req')::bigint;
  v_got  text;
  v_n    integer;
  v_ok   boolean;
  v_row  record;
  t      text;
begin
  -- All four tables hold a row of this unit's, so a count of 0 below means hidden, not empty.
  if (select count(*) from workspace_conversations) = 0 or (select count(*) from workspace_messages) = 0
     or (select count(*) from workspace_requests) = 0
     or (select count(*) from workspace_runner_heartbeat) = 0 then
    raise exception 'FAIL 7: a workspace table is empty, so the stranger check would prove nothing';
  end if;

  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000000', true);
  set local role authenticated;
  select (select count(*) from workspace_conversations) as conversations,
         (select count(*) from workspace_messages) as messages,
         (select count(*) from workspace_requests) as requests,
         (select count(*) from workspace_runner_heartbeat) as heartbeat
    into v_row;
  select count(*), bool_and(s.polled_at is null and s.runner is null and s.open_requests = 0
                            and s.oldest_open_at is null)
    into v_n, v_ok from v_workspace_status s;
  reset role;
  if v_row.conversations <> 0 or v_row.messages <> 0 or v_row.requests <> 0 or v_row.heartbeat <> 0 then
    raise exception 'FAIL 7: a stranger uid reads %', row_to_json(v_row);
  end if;
  if v_n <> 1 or v_ok is not true then
    raise exception 'FAIL 7: for a stranger the view returned % row(s), empty %', v_n, v_ok;
  end if;

  -- A stranger cannot ask, cancel or rename.
  set local role authenticated;
  begin
    perform workspace_ask(null, 'A stranger''s question');
    v_got := 'no error';
  exception when others then
    v_got := sqlstate;
  end;
  reset role;
  if v_got <> '42501' then
    raise exception 'FAIL 7: a stranger''s workspace_ask raised %, expected 42501', v_got;
  end if;
  set local role authenticated;
  v_ok := workspace_cancel(v_req);
  update workspace_conversations set title = 'stranger' where id = v_conv;
  get diagnostics v_n = row_count;
  reset role;
  if v_ok is not false or v_n <> 0 then
    raise exception 'FAIL 7: a stranger cancelled (%) or renamed (% rows)', v_ok, v_n;
  end if;

  -- anon: every read is refused outright, and so is the cap.
  perform set_config('request.jwt.claim.sub', '', true);
  foreach t in array array['select count(*) from workspace_conversations',
                           'select count(*) from workspace_messages',
                           'select count(*) from workspace_requests',
                           'select count(*) from workspace_runner_heartbeat',
                           'select count(*) from v_workspace_status',
                           'select workspace_prompt_max()',
                           'select workspace_cancel(1)'] loop
    set local role anon;
    begin
      execute t;
      v_got := 'no error';
    exception when others then
      v_got := sqlstate;
    end;
    reset role;
    if v_got <> '42501' then
      raise exception 'FAIL 7: as anon [%] raised %, expected 42501', t, v_got;
    end if;
  end loop;
end $$;

-- =============================================================================================
-- Pass
-- =============================================================================================
select 'phase21_140_workspace_tables: PASS' as result,
       (select count(*) from pg_class c
         where c.relnamespace = 'public'::regnamespace and c.relrowsecurity
           and c.relname in ('workspace_conversations', 'workspace_messages', 'workspace_requests',
                             'workspace_runner_heartbeat'))                        as tables_with_rls,
       (select count(*) from pg_policies p
         where p.schemaname = 'public' and p.tablename like 'workspace\_%')         as policies,
       (select count(*) from pg_constraint k
         where k.contype = 'f'
           and k.conrelid in ('public.workspace_messages'::regclass,
                              'public.workspace_requests'::regclass))             as foreign_keys,
       (select count(*) from v_workspace_status)                                   as status_rows;

rollback;

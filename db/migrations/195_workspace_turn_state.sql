-- bb2dash :: db/migrations/195_workspace_turn_state.sql
-- Phase 24a (docs/planning/sprint-2/briefs/109_PHASE24_workspace_assistant.md), task 18. Worker W-76.
--
-- WHY. Every turn is a new CLI session whose context is rebuilt from the database, so what a turn
-- needs between turns lives in tables: the About me note and the memory switch (workspace_profile),
-- each conversation's rolling summary and job lease (workspace_conversation_state), a trace of what
-- each answer was built from (workspace_turns: ids, counts and timings) and the sources it used
-- (workspace_sources: ids and labels). Migration 196 gives the runner the functions that read and
-- write them; the new page (24b) reads them.
--
-- WHAT
--   1. workspace_profile             one row (id = 1): About me, and when memory was first asked for
--   2. workspace_conversation_state  rolling summary, its through-point, the job lease and failures,
--                                    the memory opt-out
--   3. workspace_turns               one row for each answered request: depth, tier, states, counts,
--                                    sizes, timings, the planning turn's cost
--   4. workspace_sources             up to 40 rows for each request: which unit, upload, remembered
--                                    item or feed an answer used
--   5. row security: the owner reads all four; the browser writes ONE column of one table
--                    (about_me); `memory_since` and everything else are the runner's functions'
--   6. privileges, then a guard block
--
-- NOTHING HERE HOLDS TEXT. `workspace_sources` and `workspace_turns` keep ids, kinds, counts, states,
-- titles and timings, never a passage, a question or an answer (privacy rules for a public
-- repository; the unit refuses a column named text, passage, content or snippet). A source's title is
-- the file's name or the upload's title, so a row stays readable after its upload is deleted.
--
-- `memory_since` is null until a runner first asks for memory jobs (workspace_job_claim, 196); that
-- call stamps it once and it is never moved. So switching memory on summarises nothing said before
-- the switch. The owner cannot write it: the column grant is about_me alone.
--
-- Every policy on every table names app_owner() in 140's initplan form, which phase21_140's unit
-- requires of every policy on a `workspace_` table.
--
-- Additive only: no drop, no rename, no existing object changed. No password, key or DSN is here.

do $$
begin
  if to_regclass('public.workspace_requests') is null then
    raise exception '195: table workspace_requests does not exist; apply 140_workspace_tables first';
  end if;
  if to_regclass('public.workspace_documents') is null then
    raise exception '195: table workspace_documents does not exist; apply 190_workspace_store first';
  end if;
  if not exists (select 1 from pg_roles where rolname = 'db_test_runner') then
    raise exception '195: role db_test_runner does not exist; apply 100_db_test_runner_role first';
  end if;
end $$;

-- =============================================================================================
-- 1. workspace_profile
-- =============================================================================================
create table public.workspace_profile (
  id           smallint primary key
               constraint workspace_profile_one_row check (id = 1),
  about_me     text not null default ''
               constraint workspace_profile_about_me_length check (char_length(about_me) <= 2000),
  memory_since timestamptz,
  updated_at   timestamptz not null default now()
);

comment on table public.workspace_profile is
  'The Workspace''s one profile row (migration 195; id = 1, made by the migration). about_me is his '
  'note, written by him (24b), at most 2000 characters, read into the system prompt of every '
  'answering turn. memory_since is null until a runner first asks for memory jobs; workspace_job_claim '
  '(196) stamps it once and never moves it, so nothing said before the switch is remembered. '
  'Owner-only through RLS; the browser updates about_me and nothing else.';

create trigger workspace_profile_updated_at
  before update on public.workspace_profile
  for each row execute function public.set_updated_at();

insert into public.workspace_profile (id) values (1);

-- =============================================================================================
-- 2. workspace_conversation_state
-- =============================================================================================
create table public.workspace_conversation_state (
  conversation_id    uuid primary key
                     references public.workspace_conversations (id) on delete cascade,
  rolling_summary    text
                     constraint workspace_conversation_state_summary_length
                     check (char_length(rolling_summary) <= 3000),
  summarised_through timestamptz,
  job_claimed_at     timestamptz,
  job_claimed_by     text,
  job_failures       integer not null default 0
                     constraint workspace_conversation_state_failures_range check (job_failures >= 0),
  memory_opt_out     boolean not null default false,
  memory_written_at  timestamptz
);

comment on table public.workspace_conversation_state is
  'What a conversation carries between turns (migration 195): the rolling summary of its older '
  'messages and the created_at of the last message it covers; the background job''s 5-minute lease '
  '(job_claimed_by / job_claimed_at; the time stays when the lease is freed) and its failures, three '
  'of which park the job until newer messages arrive; memory_opt_out (set when its remembered item '
  'is deleted, so it is never summarised again); memory_written_at, the created_at of the last '
  'message the remembered item covers. Written by the job functions (196) and '
  'workspace_document_delete (190); read by the owner.';

-- =============================================================================================
-- 3. workspace_turns
-- =============================================================================================
create table public.workspace_turns (
  request_id      bigint primary key
                  references public.workspace_requests (id) on delete cascade,
  depth           text not null
                  constraint workspace_turns_depth_known
                  check (depth in ('auto', 'quick', 'standard', 'deep')),
  tier            text not null
                  constraint workspace_turns_tier_known check (tier in ('low', 'mid', 'high')),
  plan_state      text not null
                  constraint workspace_turns_plan_state_known
                  check (plan_state in ('skipped', 'planned', 'fallback')),
  retrieval_state text not null
                  constraint workspace_turns_retrieval_state_known
                  check (retrieval_state in ('found', 'attached_only', 'empty', 'failed')),
  found_n         integer not null default 0 constraint workspace_turns_found_n_range check (found_n >= 0),
  passages_n      integer not null default 0 constraint workspace_turns_passages_n_range check (passages_n >= 0),
  memory_n        integer not null default 0 constraint workspace_turns_memory_n_range check (memory_n >= 0),
  feed_rows       integer not null default 0 constraint workspace_turns_feed_rows_range check (feed_rows >= 0),
  attachments     jsonb not null default '[]'::jsonb
                  constraint workspace_turns_attachments_array check (jsonb_typeof(attachments) = 'array'),
  prompt_bytes    integer constraint workspace_turns_prompt_bytes_range check (prompt_bytes >= 0),
  plan_ms         integer constraint workspace_turns_plan_ms_range check (plan_ms >= 0),
  retrieval_ms    integer constraint workspace_turns_retrieval_ms_range check (retrieval_ms >= 0),
  plan_cost_usd   numeric(10,4) constraint workspace_turns_plan_cost_range check (plan_cost_usd >= 0),
  created_at      timestamptz not null default now()
);

comment on table public.workspace_turns is
  'One row for each answered request (migration 195), written by workspace_turn_put (196) before '
  'the answering model starts: the depth and tier, whether a planning turn ran (plan_state), what '
  'retrieval found (retrieval_state: found, attached_only, empty, failed), counts, the attachments '
  'as [{kind, id, state}], the prompt''s size and the timings. Ids, counts and timings only; never a '
  'passage, a question or an answer.';

-- =============================================================================================
-- 4. workspace_sources
-- =============================================================================================
create table public.workspace_sources (
  request_id  bigint not null
              references public.workspace_requests (id) on delete cascade,
  ord         smallint not null
              constraint workspace_sources_ord_range check (ord between 1 and 40),
  kind        text not null
              constraint workspace_sources_kind_known check (kind in ('material', 'upload', 'memory', 'feed')),
  origin      text not null
              constraint workspace_sources_origin_known check (origin in ('auto', 'attached', 'tool')),
  file_id     bigint,                 -- bb_files.id (no foreign key: strip migrations delete those rows)
  text_id     bigint,                 -- bb_file_text.id
  document_id bigint references public.workspace_documents (id) on delete set null,
  doc_text_id bigint,                 -- workspace_document_text.id (a replaced unit gets a new id)
  course_id   text,
  unit_kind   text,
  unit_no     integer,
  similarity  double precision
              constraint workspace_sources_similarity_range check (similarity between -1 and 1),
  title       text,
  primary key (request_id, ord)
);

comment on table public.workspace_sources is
  'What an answer used (migration 195), written by workspace_turn_put (196), at most 40 rows for each '
  'request, in order; a 41st is cut, never refused. kind material, upload, memory or feed; origin '
  'auto (a passage of the prompt), attached (an attached file that was read) or tool (a unit the '
  'model opened). Ids and titles only; never a passage. A row is kept only when its ids exist.';

-- =============================================================================================
-- 5. Row security: the owner, in 076's initplan form
-- =============================================================================================
alter table public.workspace_profile            enable row level security;
alter table public.workspace_conversation_state enable row level security;
alter table public.workspace_turns              enable row level security;
alter table public.workspace_sources            enable row level security;

create policy workspace_profile_owner_select on public.workspace_profile
  for select to authenticated
  using ((select auth.uid()) = (select public.app_owner()));
-- The one column the owner writes is about_me (the grant below holds the list).
create policy workspace_profile_owner_update on public.workspace_profile
  for update to authenticated
  using ((select auth.uid()) = (select public.app_owner()))
  with check ((select auth.uid()) = (select public.app_owner()));

create policy workspace_conversation_state_owner_select on public.workspace_conversation_state
  for select to authenticated
  using ((select auth.uid()) = (select public.app_owner()));
create policy workspace_turns_owner_select on public.workspace_turns
  for select to authenticated
  using ((select auth.uid()) = (select public.app_owner()));
create policy workspace_sources_owner_select on public.workspace_sources
  for select to authenticated
  using ((select auth.uid()) = (select public.app_owner()));

-- =============================================================================================
-- 6. Privileges
-- =============================================================================================
revoke all on
  public.workspace_profile,
  public.workspace_conversation_state,
  public.workspace_turns,
  public.workspace_sources
from public, anon, authenticated;

grant select on
  public.workspace_profile,
  public.workspace_conversation_state,
  public.workspace_turns,
  public.workspace_sources
to authenticated;

grant update (about_me) on public.workspace_profile to authenticated;

-- Phase 15's runner writes the units' setup rows (brief 95).
grant insert, update, delete on
  public.workspace_profile,
  public.workspace_conversation_state,
  public.workspace_turns,
  public.workspace_sources
to db_test_runner;

-- =============================================================================================
-- 7. Guard
-- =============================================================================================
do $$
declare
  v_bad text;
  v_got text;
  t     text;
  v_tabs text[] := array['workspace_profile', 'workspace_conversation_state', 'workspace_turns',
                         'workspace_sources'];
begin
  foreach t in array v_tabs loop
    if not (select c.relrowsecurity from pg_class c where c.oid = ('public.' || t)::regclass) then
      raise exception 'FAIL 195: row security is off on %', t;
    end if;
    if has_table_privilege('anon', 'public.' || t, 'select, insert, update, delete, truncate, references, trigger')
       or has_any_column_privilege('anon', 'public.' || t, 'select, insert, update, references') then
      raise exception 'FAIL 195: anon holds a privilege on %', t;
    end if;
    if not has_table_privilege('authenticated', 'public.' || t, 'select')
       or has_table_privilege('authenticated', 'public.' || t, 'insert, update, delete, truncate, references, trigger') then
      raise exception 'FAIL 195: authenticated does not hold select alone, at table level, on %', t;
    end if;
  end loop;

  -- The browser writes one column of one table.
  select string_agg(c.relname || '.' || a.attname || ':' || p.priv, ', ' order by c.relname, a.attname, p.priv)
    into v_got
    from pg_class c
    join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
    cross join (values ('insert'), ('update')) as p(priv)
   where c.relnamespace = 'public'::regnamespace and c.relname = any (v_tabs)
     and has_column_privilege('authenticated', c.oid, a.attname, p.priv);
  if v_got is distinct from 'workspace_profile.about_me:update' then
    raise exception 'FAIL 195: authenticated''s column-level writes are [%]', v_got;
  end if;

  select string_agg(p.policyname, ', ' order by p.policyname) into v_bad
    from pg_policies p
   where p.schemaname = 'public' and p.tablename = any (v_tabs)
     and coalesce(p.qual, '') || ' ' || coalesce(p.with_check, '') not like '%app_owner()%';
  if v_bad is not null then
    raise exception 'FAIL 195: these policies do not name app_owner(): %', v_bad;
  end if;

  -- No text in the trace tables.
  select string_agg(c.relname || '.' || a.attname, ', ' order by c.relname, a.attname) into v_bad
    from pg_attribute a join pg_class c on c.oid = a.attrelid
   where c.oid in ('public.workspace_turns'::regclass, 'public.workspace_sources'::regclass)
     and a.attnum > 0 and not a.attisdropped
     and a.attname in ('text', 'passage', 'content', 'snippet');
  if v_bad is not null then
    raise exception 'FAIL 195: a trace table has a column that could hold text: %', v_bad;
  end if;

  if (select count(*) from workspace_profile) <> 1 then
    raise exception 'FAIL 195: workspace_profile does not hold exactly its one row';
  end if;
end $$;

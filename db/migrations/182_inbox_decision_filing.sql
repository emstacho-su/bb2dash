-- bb2dash :: db/migrations/182_inbox_decision_filing.sql
-- Phase 23 (Inbox auto-apply; DECISIONS 2026-10-07, Stack's second choice: "database first, files
-- after").
--
-- WHY. /inbox-apply used to archive an item only after its vault note existed. The apply container
-- has no vault and no checkout, so the decision is now stored on the archived row first
-- (`attention_items.decision`, an inbox-decision/1 record, migration 181) and a host script,
-- `scripts/inbox-decisions-export.mjs`, writes the vault note and the day's
-- `docs/inbox-decisions/<date>.md` entry from it afterwards. This file is the marker that says
-- which decisions that script has filed.
--
-- WHAT
--   1. attention_items.decision_filed_at and decision_filed: when the files were written, and
--      where. `decision` itself is written once at the archive and never edited (090), so the
--      marker is its own two columns.
--   2. inbox_decisions_unfiled(p_limit): the archived inbox-decision/1 rows not yet filed, oldest
--      first
--   3. inbox_decision_filed(p_id, p_filed): stamps one row, once
--   4. privileges: both functions are the service role's alone. The exporter runs on the host with
--      the service key file in SECRETS_DIR; `inbox_apply_runner` (the role Claude writes as in the
--      apply container) cannot call either, so it cannot mark a decision filed that was not.
--   5. a guard block
--
-- Only inbox-decision/1 rows are ever listed: the rows /inbox-apply archived before Phase 23 carry
-- a `note_id` and already have their note, and must never be filed twice.
--
-- Additive only: no drop, no rename, no existing function body changed.

-- =============================================================================================
-- 1. The marker
-- =============================================================================================
alter table public.attention_items
  add column if not exists decision_filed_at timestamptz,
  add column if not exists decision_filed jsonb;

comment on column public.attention_items.decision_filed_at is
  'When scripts/inbox-decisions-export.mjs wrote this decision''s vault note and repo log entry (182). '
  'Null until it has; only ever set on an archived inbox-decision/1 row, by inbox_decision_filed().';
comment on column public.attention_items.decision_filed is
  'Where the decision was filed (182): {note_path, log_path, ingested}. Written with decision_filed_at.';

do $$
begin
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.attention_items'::regclass
                    and conname = 'attention_items_decision_filed_archived') then
    alter table public.attention_items
      add constraint attention_items_decision_filed_archived
      check (decision_filed_at is null or state = 'archived');
  end if;
end $$;

-- =============================================================================================
-- 2. The exporter's read
-- =============================================================================================
create or replace function public.inbox_decisions_unfiled(p_limit integer default 100)
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
     and i.decision_filed_at is null
   order by i.archived_at, i.id
   limit greatest(1, least(coalesce(p_limit, 100), 500));
$$;

comment on function public.inbox_decisions_unfiled(integer) is
  'The archived Inbox items whose inbox-decision/1 record has no vault note and repo log entry yet '
  '(182), oldest first, at most p_limit (1 to 500, default 100). Rows archived before Phase 23 are '
  'never listed. Invoker rights; service_role only (the host exporter).';

-- =============================================================================================
-- 3. The exporter's stamp
-- =============================================================================================
create or replace function public.inbox_decision_filed(p_id bigint, p_filed jsonb)
  returns boolean
  language plpgsql set search_path = public, pg_temp as $$
begin
  if p_filed is null or jsonb_typeof(p_filed) <> 'object'
     or jsonb_typeof(p_filed->'note_path') is distinct from 'string' or btrim(p_filed->>'note_path') = ''
     or jsonb_typeof(p_filed->'log_path') is distinct from 'string' or btrim(p_filed->>'log_path') = '' then
    raise exception 'inbox_decision_filed: p_filed must be an object with a note_path and a log_path'
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
  'Marks one archived inbox-decision/1 row as filed (182): sets decision_filed_at and decision_filed '
  '({note_path, log_path, ...}). Once only: false when the row is already filed, is not archived, or '
  'carries no inbox-decision/1 record. Invoker rights; service_role only (the host exporter).';

-- =============================================================================================
-- 4. Privileges
-- =============================================================================================
revoke all on function
  public.inbox_decisions_unfiled(integer),
  public.inbox_decision_filed(bigint, jsonb)
from public, anon, authenticated;

grant execute on function
  public.inbox_decisions_unfiled(integer),
  public.inbox_decision_filed(bigint, jsonb)
to service_role;

-- The unit calls both as the session role.
grant execute on function
  public.inbox_decisions_unfiled(integer),
  public.inbox_decision_filed(bigint, jsonb)
to db_test_runner;

-- =============================================================================================
-- 5. Guard
-- =============================================================================================
do $$
declare
  f text;
begin
  foreach f in array array['public.inbox_decisions_unfiled(integer)',
                           'public.inbox_decision_filed(bigint, jsonb)'] loop
    if has_function_privilege('anon', f, 'execute')
       or has_function_privilege('authenticated', f, 'execute')
       or has_function_privilege('inbox_apply_runner', f, 'execute')
       or has_function_privilege('sync_runner', f, 'execute')
       or not has_function_privilege('service_role', f, 'execute') then
      raise exception 'FAIL 182: % is not executable by service_role alone (and the test role)', f;
    end if;
    if (select p.prosecdef from pg_proc p where p.oid = f::regprocedure) then
      raise exception 'FAIL 182: % must be invoker rights', f;
    end if;
  end loop;

  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'attention_items'
                    and column_name = 'decision_filed_at' and data_type = 'timestamp with time zone')
     or not exists (select 1 from information_schema.columns
                     where table_schema = 'public' and table_name = 'attention_items'
                       and column_name = 'decision_filed' and data_type = 'jsonb') then
    raise exception 'FAIL 182: the two marker columns are missing';
  end if;

  -- Nothing is filed by this migration, and no row archived before Phase 23 is listed.
  if exists (select 1 from attention_items where decision_filed_at is not null) then
    raise exception 'FAIL 182: a row is already marked filed';
  end if;
  if exists (select 1 from inbox_decisions_unfiled(500) u
              where u.decision->>'schema' is distinct from 'inbox-decision/1') then
    raise exception 'FAIL 182: inbox_decisions_unfiled lists a row that is not inbox-decision/1';
  end if;
end $$;

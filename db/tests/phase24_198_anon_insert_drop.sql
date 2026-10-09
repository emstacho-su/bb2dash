-- bb2dash :: db/tests/phase24_198_anon_insert_drop.sql
-- Phase 24a (docs/planning/sprint-2/briefs/109_PHASE24_workspace_assistant.md), task 50. Worker W-76.
-- Tests migration 198: the policy `bb_text_embeddings_anon_insert` is gone, so a holder of the
-- publishable key can no longer insert a vector row into the course store, and nothing else moved.
--
--   a. under `set local role anon` an insert of one synthetic vector row raises 42501
--   b. `pg_policies` holds exactly three rows for the two course tables: bb_file_text_anon_insert,
--      bb_file_text_owner_all and bb_text_embeddings_owner_all (the sync's insert of a course UNIT
--      is the live write path and stays; 198 drops only the vector table's policy)
--   c. `service_role` bypasses row security, so the embedder's write rests on no policy
--   d. the table's row count is the same before and after the unit
--
-- BEFORE 198 IS APPLIED this unit is RED: the insert in (a) succeeds, because the policy still lets
-- anon in, and the unit raises "FAIL 198 (a)". The unit's own transaction is rolled back, so that
-- insert never survives.
--
-- It needs none of 190 to 197. Reads and one rolled-back insert; nothing is committed.
-- RUN IT: `node scripts/db-test.mjs --only phase24_198_anon_insert_drop.sql`.
-- A dry run through `execute_sql` as postgres works as well: `set local role anon` is allowed there.

begin;

do $$
declare
  v_before bigint;
  v_after  bigint;
  v_text   bigint;
  v_state  text;
  v_got    text;
begin
  select count(*) into v_before from public.bb_text_embeddings;
  -- A real unit to point at, chosen as the session role: anon cannot read the unit table.
  select min(t.id) into v_text from public.bb_file_text t;
  if v_text is null then
    raise exception 'FAIL 198 (setup): bb_file_text holds no unit to point a vector row at';
  end if;

  -- (a) the stranger's insert.
  set local role anon;
  begin
    insert into public.bb_text_embeddings (text_id, part_no, model, embedding)
    values (v_text, 999, 'w76-198-probe',
            array_fill(0.01::real, array[384])::extensions.vector(384));
    v_state := 'no error';
  exception when others then
    v_state := sqlstate;
  end;
  reset role;
  if v_state is distinct from '42501' then
    raise exception 'FAIL 198 (a): an anon insert into bb_text_embeddings ended with [%], expected 42501 '
                    '(the policy bb_text_embeddings_anon_insert is still there)', v_state;
  end if;

  -- (b) the three policies that are left on the two course tables.
  select string_agg(p.tablename || '.' || p.policyname, ', '
                    order by p.tablename collate "C", p.policyname collate "C") into v_got
    from pg_policies p
   where p.schemaname = 'public'
     and p.tablename in ('bb_file_text', 'bb_text_embeddings');
  if v_got is distinct from
     'bb_file_text.bb_file_text_anon_insert, bb_file_text.bb_file_text_owner_all, '
     'bb_text_embeddings.bb_text_embeddings_owner_all' then
    raise exception 'FAIL 198 (b): the policies on the two course tables are [%]', v_got;
  end if;

  -- (c) the embedder (service_role) does not depend on a policy.
  if not coalesce((select r.rolbypassrls from pg_roles r where r.rolname = 'service_role'), false) then
    raise exception 'FAIL 198 (c): service_role does not bypass row security';
  end if;

  -- (d) nothing was written.
  select count(*) into v_after from public.bb_text_embeddings;
  if v_after <> v_before then
    raise exception 'FAIL 198 (d): bb_text_embeddings held % rows before and % after', v_before, v_after;
  end if;
end $$;

select 'phase24_198_anon_insert_drop: PASS' as result,
       (select count(*) from pg_policies p
         where p.schemaname = 'public'
           and p.tablename in ('bb_file_text', 'bb_text_embeddings')) as course_policies,
       (select count(*) from public.bb_text_embeddings)              as vectors;

rollback;

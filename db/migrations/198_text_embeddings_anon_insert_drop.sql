-- bb2dash :: db/migrations/198_text_embeddings_anon_insert_drop.sql
-- Phase 24a (docs/planning/sprint-2/briefs/109_PHASE24_workspace_assistant.md), task 50, the review
-- round of the pgvector store's clause (109a, item 24). Worker W-76.
--
-- WHY. "Scoped to bb2dash" is not true of a table that a stranger holding the public key can write.
-- 010_search_layer.sql:62-63 gave anon an insert-only policy on the course vectors, from the plan to
-- embed with the publishable key. That plan was dropped: `embed-corpus` writes with the service
-- role, which bypasses row security, and no other code in the repository inserts into
-- `bb_text_embeddings`. So the policy only serves a stranger. This file drops it.
--
-- WHAT. One statement, `drop policy`, and a guard. 049_bb_files_submissions.sql:65 is the precedent
-- for dropping a policy in a numbered migration. NOTHING ELSE MOVES: no table, column, grant, index
-- or function. anon keeps the table grant 010 and the project's default gave it; with the policy
-- gone, row security refuses every insert it attempts (SQLSTATE 42501). The sync's insert of course
-- UNITS (`bb_file_text_anon_insert`, 007) is a different table and stays: it is the live write path.
--
-- It needs none of 190 to 197 and has no order against them. If Stack objects, this file is not
-- applied and proof 7b of `phase24_store_proof.sql` gains the one row it would have removed
-- (`anon | bb_text_embeddings | INSERT`).
--
-- Removes one policy; adds nothing.

do $$
begin
  if to_regclass('public.bb_text_embeddings') is null then
    raise exception '198: table bb_text_embeddings does not exist; apply 010_search_layer first';
  end if;
end $$;

drop policy if exists bb_text_embeddings_anon_insert on public.bb_text_embeddings;

-- Guard: the policy is gone, nobody but the authenticated owner policy is left on the table, and
-- row security is still on.
do $$
declare
  v_got text;
begin
  if exists (select 1 from pg_policies p
              where p.schemaname = 'public' and p.tablename = 'bb_text_embeddings'
                and p.policyname = 'bb_text_embeddings_anon_insert') then
    raise exception 'FAIL 198: the policy bb_text_embeddings_anon_insert is still there';
  end if;

  select string_agg(p.policyname || ':' || array_to_string(p.roles, '+'), ', '
                    order by p.policyname) into v_got
    from pg_policies p
   where p.schemaname = 'public' and p.tablename = 'bb_text_embeddings'
     and 'anon' = any (p.roles);
  if v_got is not null then
    raise exception 'FAIL 198: a policy still names anon on bb_text_embeddings: %', v_got;
  end if;

  if not (select c.relrowsecurity from pg_class c where c.oid = 'public.bb_text_embeddings'::regclass) then
    raise exception 'FAIL 198: row security is off on bb_text_embeddings';
  end if;
end $$;

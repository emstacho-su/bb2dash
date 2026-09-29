-- bb2dash :: db/tests/phase17_112_knowledge_check_rehome.sql
-- Phase 17 (docs/planning/sprint-2/briefs/97_PHASE17_web_polish.md), T-05. Worker W-44.
-- Tests migration 112 (data): IST.352's three Knowledge Check links sit on the live content rows
-- 1602, 1603, 1604, no vanished node carries a link, and the total number of linked nodes is
-- unchanged by the move (21 on 2026-09-29).
--
-- Read-only: it asserts prod's state after 112, so it fails before 112 is applied. Failures are
-- collected and raised once. The last statement is `rollback`.

begin;

do $$
declare
  v_fail text[] := '{}';
  v_n    bigint;
  v_bad  text;
begin
  select count(*) into v_n
    from bb_content where assignment_id is not null and detail->>'missing_since' is not null;
  if v_n <> 0 then
    v_fail := v_fail || format('%s vanished content rows still carry an assignment link', v_n);
  end if;

  select string_agg(format('%s->%s', p.id, coalesce(b.assignment_id, 'null')), ', ' order by p.id) into v_bad
    from (values (1602::bigint, 'IST.352/knowledge-check-2026-08-26'),
                 (1603, 'IST.352/knowledge-check-2026-08-31'),
                 (1604, 'IST.352/knowledge-check-2026-09-02')) p(id, want)
    left join bb_content b on b.id = p.id
   where b.assignment_id is distinct from p.want;
  if v_bad is not null then
    v_fail := v_fail || format('live Knowledge Check rows carry the wrong link: %s', v_bad);
  end if;

  select count(*) into v_n from bb_content where id in (58, 59, 60) and assignment_id is not null;
  if v_n <> 0 then
    v_fail := v_fail || format('%s of the stale rows 58, 59, 60 still carry a link', v_n);
  end if;

  select count(*) into v_n from bb_content where assignment_id is not null;
  if v_n <> 21 then
    v_fail := v_fail || format('%s linked content rows, expected 21', v_n);
  end if;

  if cardinality(v_fail) > 0 then
    raise exception 'FAIL phase17_112: %', array_to_string(v_fail, '; ');
  end if;
end $$;

select 'phase17_112_knowledge_check_rehome: PASS'                                   as result,
       (select count(*) from bb_content where assignment_id is not null)              as linked_rows;

rollback;

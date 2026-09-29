-- bb2dash :: db/tests/phase18_125_geo103_reading_routes.sql
-- Phase 18 (brief 98), task 12. Worker W-48. The end state migration 125 writes (R-68, B-33):
--   (1) the ten GEO.103 textbook chapters are on_blackboard = false
--   (2) reading 45's url equals bb_content 114's url (phys.org)
--   (3) Huber (46) is untouched: still on_blackboard, no url
-- Writes nothing. Collects failures, raises once.
-- RUN IT: `node scripts/db-test.mjs --only phase18_125_geo103_reading_routes.sql`.

begin;

do $$
declare
  v_fail text[] := array[]::text[];
  v_bad  text;
begin
  select string_agg(id::text, ', ' order by id) into v_bad
    from readings
   where id in (39, 41, 44, 49, 52, 58, 59, 60, 61, 62) and on_blackboard;
  if v_bad is not null then
    v_fail := v_fail || format('(1) still on_blackboard: %s', v_bad);
  end if;

  if not coalesce((select (select url from readings where id = 45)
                          = (select url from bb_content where id = 114)), false) then
    v_fail := v_fail || format('(2) reading 45 url: %s',
                               coalesce((select url from readings where id = 45), 'null'));
  end if;

  if not coalesce((select on_blackboard and url is null from readings where id = 46), false) then
    v_fail := v_fail || '(3) reading 46 changed'::text;
  end if;

  if cardinality(v_fail) > 0 then
    raise exception 'FAIL %', array_to_string(v_fail, '; ');
  end if;
end $$;

select 'phase18_125_geo103_reading_routes: PASS' as result;

rollback;

-- bb2dash :: db/tests/phase12b_073_workload_visibility.sql
-- Phase 12b, item H-4 (P-home-6, P-home-7). Tests migration 073:
--   * assignments.hidden_from_workload exists, boolean not null default false, written by no stage
--     function;
--   * the three inferred series placeholders carry it, so v_work_items.in_workload is false for
--     them and the Undated tray drops them (Stack's answer 9);
--   * v_work_items.in_workload for readings is `required is not false` (answer 8), so the nine
--     other-team HBR cases leave Undated and the day-load while staying in `readings`;
--   * readings 89 ("HBR: Apple vs. The FBI") is Stack's own Team 3 case: dated 2026-09-24 and
--     required, so it stays in the workload and sits on 9/24 (answer 7);
--   * the IST.466 ethics presentation row is relabelled Team 3 under the same id (answer 7).
--
-- RUN IT: paste the whole file into one `execute_sql` call, or `psql "$DATABASE_URL" -f <file>`.
-- A failing assertion raises; a pass ends with one summary row. The file opens its own
-- transaction and its last statement is `rollback`: nothing it writes survives. It writes nothing
-- anyway - every section is a read-only assertion over prod.

begin;

-- =============================================================================================
-- 1. The column: shape, default, and no stage function touches it
-- =============================================================================================
do $$
declare
  c record;
  writers text;
begin
  select data_type, is_nullable, column_default into c
    from information_schema.columns
   where table_schema = 'public' and table_name = 'assignments'
     and column_name = 'hidden_from_workload';
  if not found then
    raise exception 'FAIL assignments.hidden_from_workload does not exist';
  end if;
  if c.data_type <> 'boolean' or c.is_nullable <> 'NO' or c.column_default <> 'false' then
    raise exception 'FAIL assignments.hidden_from_workload is % / nullable=% / default=%, expected boolean / NO / false',
      c.data_type, c.is_nullable, c.column_default;
  end if;

  -- 073's contract: this flag is Stack's, not the sync's. No stage function may mention it.
  select string_agg(p.proname, ', ' order by p.proname) into writers
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname like 'stage%'
     and pg_get_functiondef(p.oid) ilike '%hidden_from_workload%';
  if writers is not null then
    raise exception 'FAIL these stage functions reference hidden_from_workload: %', writers;
  end if;
end $$;

-- =============================================================================================
-- 2. The three series placeholders are hidden; nothing else is
-- =============================================================================================
do $$
declare
  hidden text;
  n int;
begin
  select string_agg(id, ', ' order by id) into hidden
    from assignments where hidden_from_workload;
  if hidden is distinct from
     'ECN.304/quiz-series, GEO.103/discussion-questions, GEO.103/reading-quiz-series' then
    raise exception 'FAIL hidden_from_workload is set on [%], expected exactly the three series placeholders', coalesce(hidden, '<none>');
  end if;

  select count(*) into n
    from v_work_items
   where item_kind = 'assignment'
     and item_id in ('ECN.304/quiz-series', 'GEO.103/discussion-questions', 'GEO.103/reading-quiz-series')
     and in_workload;
  if n <> 0 then
    raise exception 'FAIL % of the three series placeholders are still in_workload', n;
  end if;
end $$;

-- =============================================================================================
-- 3. Readings: in_workload = (required is not false), and the ten cases are all still there
-- =============================================================================================
do $$
declare
  mismatched int;
  cases      int;
  hidden     int;
  visible    text;
begin
  select count(*) into mismatched
    from v_work_items w
    join readings r on r.id::text = w.item_id
   where w.item_kind = 'reading'
     and w.in_workload is distinct from (r.required is not false);
  if mismatched <> 0 then
    raise exception 'FAIL % reading rows have in_workload <> (required is not false)', mismatched;
  end if;

  -- All ten IST.466 HBR cases survive the fix: Materials still lists every one of them.
  select count(*) into cases from readings where course_id = 'IST.466' and citation like 'HBR:%';
  if cases <> 10 then
    raise exception 'FAIL % of the 10 IST.466 HBR case readings remain, expected 10', cases;
  end if;

  -- Nine belong to the other ethics teams: out of the workload, and no longer undated-with-a-bar.
  select count(*) into hidden
    from v_work_items
   where item_kind = 'reading' and item_id in ('87','88','90','91','92','93','94','95','96')
     and in_workload = false and undated;
  if hidden <> 9 then
    raise exception 'FAIL % of the 9 other-team HBR cases are hidden and undated, expected 9', hidden;
  end if;

  -- Nothing else in the Undated tray may still claim workload.
  select string_agg(item_kind || ' ' || item_id, ', ' order by item_kind, item_id) into visible
    from v_work_items
   where undated and in_workload
     and (item_kind = 'reading'
          or item_id in ('ECN.304/quiz-series', 'GEO.103/discussion-questions', 'GEO.103/reading-quiz-series'));
  if visible is not null then
    raise exception 'FAIL these hidden items are still in the Undated workload: %', visible;
  end if;
end $$;

-- =============================================================================================
-- 4. Reading 89 is Stack's own case: 2026-09-24, required, in the workload, not undated
-- =============================================================================================
do $$
declare r record;
begin
  select rd.citation, rd.for_date, rd.required, w.in_workload, w.undated, w.due_on
    into r
    from readings rd
    join v_work_items w on w.item_kind = 'reading' and w.item_id = rd.id::text
   where rd.id = 89;
  if r.citation <> 'HBR: Apple vs. The FBI' then
    raise exception 'FAIL readings 89 is "%", not the Apple vs. The FBI case', r.citation;
  end if;
  if r.for_date is distinct from date '2026-09-24' then
    raise exception 'FAIL readings 89 for_date is %, expected 2026-09-24', coalesce(r.for_date::text, 'null');
  end if;
  if not r.required or not r.in_workload or r.undated or r.due_on <> date '2026-09-24' then
    raise exception 'FAIL readings 89: required=%, in_workload=%, undated=%, due_on=%',
      r.required, r.in_workload, r.undated, coalesce(r.due_on::text, 'null');
  end if;
end $$;

-- =============================================================================================
-- 5. The ethics presentation row: same id, Team 3 labels, the assigned case named
-- =============================================================================================
do $$
declare a record;
begin
  select id, title, group_key, description, due_date, points_possible, bb_column_id
    into a
    from assignments where id = 'IST.466/ethics-team-2-presentation';
  if not found then
    raise exception 'FAIL IST.466/ethics-team-2-presentation is gone - 073 must keep the id';
  end if;
  if a.title <> 'Ethics Team 3 presentation' then
    raise exception 'FAIL the ethics presentation is titled "%", expected "Ethics Team 3 presentation"', a.title;
  end if;
  if a.group_key <> 'Ethics Group #3' then
    raise exception 'FAIL the ethics presentation group_key is "%", expected "Ethics Group #3"', coalesce(a.group_key, 'null');
  end if;
  if a.description not like '%Apple vs. The FBI%' or a.description like '%Ethics Across Cultures%' then
    raise exception 'FAIL the ethics presentation description still guesses the case: %', a.description;
  end if;
  -- Facts that were already right are untouched.
  if a.due_date <> date '2026-09-24' or a.points_possible <> 100 or a.bb_column_id <> '_3562497_1' then
    raise exception 'FAIL 073 changed a fact it should not have: due_date=%, points=%, column=%',
      a.due_date, a.points_possible, a.bb_column_id;
  end if;
end $$;

-- =============================================================================================
-- 6. v_work_items itself: same columns in the same order, still security_invoker, still not anon
-- =============================================================================================
do $$
begin
  if (select string_agg(attname, ',' order by attnum) from pg_attribute
       where attrelid = 'public.v_work_items'::regclass and attnum > 0 and not attisdropped)
     <> 'item_kind,item_id,course_id,title,type,category,glyph,in_workload,due_at,due_on,due_rule,'
        'points_possible,submission,series_key,sequence_no,status,priority,effort,effort_source,'
        'is_override,multiplier_applied,suggested_start,undated,confidence' then
    raise exception 'FAIL v_work_items columns changed';
  end if;
  if not exists (select 1 from pg_class c, unnest(c.reloptions) o
                  where c.oid = 'public.v_work_items'::regclass and o = 'security_invoker=true')
     or has_table_privilege('anon', 'public.v_work_items', 'select') then
    raise exception 'FAIL v_work_items lost security_invoker or is readable by anon';
  end if;
  -- One row per assignment plus one per reading, as before: 073 hides, it never drops.
  if (select count(*) from v_work_items)
     <> (select count(*) from assignments) + (select count(*) from readings) then
    raise exception 'FAIL v_work_items no longer covers every assignment and reading';
  end if;
end $$;

-- =============================================================================================
-- Pass
-- =============================================================================================
select 'phase12b_073_workload_visibility: PASS'                                       as result,
       (select count(*) from v_work_items where item_kind = 'assignment' and in_workload) as asg_in_workload,
       (select count(*) from v_work_items where item_kind = 'reading'    and in_workload) as rdg_in_workload,
       (select count(*) from v_work_items where undated and in_workload)                  as undated_in_workload,
       (select count(*) from v_work_items)                                                as work_items;

rollback;

-- bb2dash :: db/tests/phase19_132_material_history.sql
-- Phase 19 (docs/planning/sprint-2/briefs/99_PHASE19_content_history.md), tasks 7 and 8. Worker W-52.
-- Tests migration 132: bb_material_history and material_history_record (R-71, R-38, P-98).
--
-- Blocks:
--   (S) schema and privileges: the table, its key and index, RLS on with the one owner-read
--       policy, nothing for anon, select only for authenticated, the function definer, pinned
--       and closed to anon and authenticated
--   (P) prod: for the newest crawl that has history rows, the bb_raw diff against its
--       predecessor, written here a second time, equals those rows in both directions
--   (V) prod: no stamped bb_content row disagrees with its item's newest `vanished` row (132's
--       restamp, P-98)
--   (1) crawl 1 of the fixture course is a baseline: 0 rows
--   (2) crawl 2: appeared, changed and vanished, for nodes and for files of both kinds
--       (embeddedFiles and detail.file); changed_fields names what moved; a session-scoped
--       file is never recorded; bb_file_id is matched on (bb_course_id, source_url)
--   (2b) crawl 2 again writes 0
--   (O) crawl 1 again, now the older crawl: older_run = true, 0 rows
--   (4) crawl 3 is `failed` with notes ending `interrupted (reaped)`; crawl 4 diffs against
--       crawl 2, so the item crawl 3 first carried is `appeared` at crawl 4
--   (6) the same with crawl 5 `running` (the claim-opened shape): its item appears at crawl 6
--   (8) crawl 7 carries an empty tree: nothing vanishes, and crawl 8 diffs against crawl 6
--   (R3-1) with crawls 7 and 8 registered, crawl 6 is an older run although neither wrote history
--   (X) every fixture row belongs to the fixture course, and prod's rows are untouched
-- Since 138 (brief 99 round 2): the counts and sample cover materials only (R2-2), a path
-- change counts only with the item's own parent or title change and a session-scoped url
-- compares as null (R2-3, R2-4, also in (P)'s second formulation). Since 170 (round 3):
-- older_run is stage_content's registered-crawl predicate (R3-1), so each crawl is registered
-- only when its turn comes, and folded once the crawls before it are recorded; the counts are
-- what the Stream posts for the run (R3-4), which on this fixture are the same numbers.
--   (N) a stranger (authenticated, not the owner) reads 0 rows
--
-- The fixture course and its eight crawls exist only inside this transaction, dated in the
-- future so they are newer than every real crawl. Schema failures are raised before any
-- function is called. RUN IT: `node scripts/db-test.mjs --only phase19_132_material_history.sql`,
-- or paste the whole file into one `execute_sql` call. The last statement is `rollback`.

begin;

create temp table _fx132 (
  crawl int not null, ord int not null, id text not null, type text,
  path text not null, title text not null, detail jsonb, files jsonb
) on commit drop;

-- Crawl 1.
insert into _fx132 (crawl, ord, id, type, path, title, detail, files) values
  (1, 1, '_w52h_f1_1', 'resource/x-bb-folder', 'Week 1', 'Week 1', null, null),
  (1, 2, '_w52h_n1_1', null, 'Week 1 / ultraDocumentBody', 'ultraDocumentBody', null,
      '[{"name":"a.pdf","url":"https://blackboard.syracuse.edu/bbcswebdav/w52h/a1","mime":"application/pdf","sessionScoped":false},
        {"name":"s.mp4","url":"https://blackboard.syracuse.edu/sessions/one/s.mp4","mime":"video/mp4","sessionScoped":true}]'),
  (1, 3, '_w52h_l1_1', 'resource/x-bb-externallink', 'Reading link', 'Old reading',
      '{"url":"https://example.invalid/w52h"}', null),
  (1, 4, '_w52h_x1_1', 'resource/x-bb-file', 'Syllabus', 'Syllabus',
      '{"file":{"url":"/bbcswebdav/w52h/x1","name":"syllabus.docx"}}', null),
  (1, 5, '_w52h_g1_1', null, 'Going away', 'Going away', null,
      '[{"name":"g.pdf","url":"https://blackboard.syracuse.edu/bbcswebdav/w52h/g1","mime":"application/pdf","sessionScoped":false}]');

-- Crawl 2: a title, an embedded file's url and a detail.file url change; one node and its file
-- go; one node and its file arrive. The session-scoped url changes too and must not count.
insert into _fx132 (crawl, ord, id, type, path, title, detail, files) values
  (2, 1, '_w52h_f1_1', 'resource/x-bb-folder', 'Week 1', 'Week 1', null, null),
  (2, 2, '_w52h_n1_1', null, 'Week 1 / ultraDocumentBody', 'ultraDocumentBody', null,
      '[{"name":"a.pdf","url":"https://blackboard.syracuse.edu/bbcswebdav/w52h/a2","mime":"application/pdf","sessionScoped":false},
        {"name":"s.mp4","url":"https://blackboard.syracuse.edu/sessions/two/s.mp4","mime":"video/mp4","sessionScoped":true}]'),
  (2, 3, '_w52h_l1_1', 'resource/x-bb-externallink', 'Reading link', 'New reading',
      '{"url":"https://example.invalid/w52h"}', null),
  (2, 4, '_w52h_x1_1', 'resource/x-bb-file', 'Syllabus', 'Syllabus',
      '{"file":{"url":"/bbcswebdav/w52h/x2","name":"syllabus.docx"}}', null),
  (2, 6, '_w52h_n2_1', null, 'Week 2 notes', 'Week 2 notes', null,
      '[{"name":"b.pdf","url":"https://blackboard.syracuse.edu/bbcswebdav/w52h/b1","mime":"application/pdf","sessionScoped":false}]');

-- Crawls 3 and 4 carry crawl 2 plus one link; 5 and 6 add another; 8 repeats 6. Crawl 7 is empty.
insert into _fx132 (crawl, ord, id, type, path, title, detail, files)
select c, ord, id, type, path, title, detail, files from _fx132, unnest(array[3, 4, 5, 6, 8]) c where crawl = 2;
insert into _fx132 (crawl, ord, id, type, path, title, detail, files)
select c, 7, '_w52h_n3_1', 'resource/x-bb-externallink', 'Skipped-run link', 'Skipped-run link',
       '{"url":"https://example.invalid/w52h/3"}'::jsonb, null
  from unnest(array[3, 4, 5, 6, 8]) c;
insert into _fx132 (crawl, ord, id, type, path, title, detail, files)
select c, 8, '_w52h_n5_1', 'resource/x-bb-externallink', 'Running-run link', 'Running-run link',
       '{"url":"https://example.invalid/w52h/5"}'::jsonb, null
  from unnest(array[5, 6, 8]) c;

do $$
declare
  COURSE    constant text := 'W52.132';
  SHELL     constant text := '_w52_132_1';
  BB_ORIGIN constant text := 'https://blackboard.syracuse.edu';
  STATUSES  constant text[] := array['ok', 'ok', 'failed', 'ok', 'running', 'ok', 'ok', 'ok'];
  v_fail    text[] := '{}';
  v_runs    uuid[] := '{}';
  v_r       jsonb;
  v_n       bigint;
  v_prod    bigint;
  v_got     text;
  v_bad     text;
  v_run     uuid;
  v_file_a  bigint;
  v_file_x  bigint;
  i         int;
  k         int;
begin
  -- -------------------------------------------------------------------------------------------
  -- (S) schema and privileges
  -- -------------------------------------------------------------------------------------------
  if to_regclass('public.bb_material_history') is null then
    raise exception 'FAIL phase19_132: (S) table bb_material_history does not exist';
  end if;
  select string_agg(a.attname || ' ' || format_type(a.atttypid, a.atttypmod)
                    || case when a.attnotnull then ' nn' else '' end, ', ' order by a.attnum)
    into v_got
    from pg_attribute a
   where a.attrelid = 'public.bb_material_history'::regclass and a.attnum > 0 and not a.attisdropped;
  if v_got is distinct from
     'id bigint nn, run_id uuid nn, course_id text nn, entity text nn, bb_item_id text nn, '
     'file_name text nn, bb_file_id bigint, change text nn, changed_fields text[], title text nn, '
     'path text, seen_at timestamp with time zone nn, recorded_at timestamp with time zone nn' then
    v_fail := v_fail || format('(S) columns are %s', v_got);
  end if;
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.bb_material_history'::regclass and conname = 'bb_material_history_key'
                    and pg_get_constraintdef(oid) = 'UNIQUE (run_id, entity, course_id, bb_item_id, file_name)') then
    v_fail := v_fail || '(S) no unique bb_material_history_key (run_id, entity, course_id, bb_item_id, file_name)'::text;
  end if;
  if not exists (select 1 from pg_indexes
                  where schemaname = 'public' and tablename = 'bb_material_history'
                    and indexname = 'bb_material_history_course_run_idx') then
    v_fail := v_fail || '(S) no index bb_material_history_course_run_idx'::text;
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.bb_material_history'::regclass) then
    v_fail := v_fail || '(S) row level security is off'::text;
  end if;
  select string_agg(format('%s %s %s', policyname, cmd, roles), '; ' order by policyname) into v_got
    from pg_policies where schemaname = 'public' and tablename = 'bb_material_history';
  if v_got is distinct from 'bb_material_history_owner_read SELECT {authenticated}' then
    v_fail := v_fail || format('(S) policies are %s', coalesce(v_got, '(none)'));
  end if;
  select string_agg(r || ':' || p, ', ' order by r, p) into v_bad
    from unnest(array['anon', 'authenticated']) r,
         unnest(array['select', 'insert', 'update', 'delete', 'truncate']) p
   where has_table_privilege(r, 'public.bb_material_history', p)
     and not (r = 'authenticated' and p = 'select');
  if v_bad is not null or not has_table_privilege('authenticated', 'public.bb_material_history', 'select') then
    v_fail := v_fail || format('(S) table privileges: %s', coalesce(v_bad, 'authenticated cannot select'));
  end if;
  if to_regprocedure('public.material_history_record(uuid)') is null then
    v_fail := v_fail || '(S) material_history_record(uuid) does not exist'::text;
  else
    if has_function_privilege('anon', 'public.material_history_record(uuid)', 'execute')
       or has_function_privilege('authenticated', 'public.material_history_record(uuid)', 'execute')
       or not has_function_privilege('service_role', 'public.material_history_record(uuid)', 'execute') then
      v_fail := v_fail || '(S) material_history_record grants are not service_role only'::text;
    end if;
    if (select not prosecdef or proconfig is distinct from array['search_path=public, pg_temp']
          from pg_proc where oid = 'public.material_history_record(uuid)'::regprocedure) then
      v_fail := v_fail || '(S) material_history_record is not definer with search_path = public, pg_temp'::text;
    end if;
  end if;
  if cardinality(v_fail) > 0 then
    raise exception 'FAIL phase19_132: %', array_to_string(v_fail, '; ');
  end if;

  -- -------------------------------------------------------------------------------------------
  -- (P) prod: the newest crawl with history rows equals the bb_raw diff, both directions
  -- -------------------------------------------------------------------------------------------
  select count(*) into v_prod from bb_material_history;
  select h.run_id into v_run from bb_material_history h order by h.seen_at desc, h.id desc limit 1;
  if v_run is null then
    v_fail := v_fail || '(P) bb_material_history is empty: the backfill wrote nothing'::text;
  else
    with cur as (
      select bb_resolve_course(r.bb_course_id) as course_id, r.captured_at, r.payload
        from bb_raw r
       where r.run_id = v_run and r.kind = 'course'
         and bb_resolve_course(r.bb_course_id) is not null
         and jsonb_array_length(bb_jarray(r.payload->'content')) > 0
    ),
    pred as (
      select c.course_id, p.payload
        from cur c
        cross join lateral (
          select r.payload
            from bb_raw r
           where r.kind = 'course' and r.run_id <> v_run
             and bb_resolve_course(r.bb_course_id) = c.course_id
             and r.captured_at < c.captured_at
             and jsonb_array_length(bb_jarray(r.payload->'content')) > 0
             and exists (select 1 from agent_requests a where a.kind = 'sync' and a.run_id = r.run_id)
             and exists (select 1 from sync_runs s
                          where s.run_id = r.run_id and s.scope is distinct from 'unregistered'
                            and s.status in ('ok', 'partial'))
           order by r.captured_at desc
           limit 1) p
    ),
    sides as (
      select 'cur' as side, c.course_id, c.payload from cur c
       where exists (select 1 from pred p where p.course_id = c.course_id)
      union all
      select 'pred', p.course_id, p.payload from pred p
    ),
    item as (
      select s.side, s.course_id, e.j, e.ord
        from sides s
        cross join lateral jsonb_array_elements(s.payload->'content') with ordinality as e(j, ord)
       where coalesce(btrim(e.j->>'id'), '') <> ''
    ),
    node as (
      select distinct on (it.side, it.course_id, it.j->>'id')
             it.side, it.course_id, it.j->>'id' as id,
             btrim(coalesce(it.j->>'title', '')) as title,
             it.j->>'path' as path,
             it.j->>'parentId' as parent,
             -- 138 (R2-4): a session-scoped url compares as null.
             case when u.url is null or btrim(u.url) = '' or u.url ~ '/sessions/' then null
                  when left(u.url, 1) = '/' then BB_ORIGIN || u.url
                  else u.url end as url,
             case when jsonb_typeof(it.j->'modified') = 'number'
                    then to_timestamp((it.j->>'modified')::numeric / 1000.0)
                  when jsonb_typeof(it.j->'modified') = 'string' and (it.j->>'modified') ~ '^\d{4}-\d{2}-\d{2}[T ]'
                    then (it.j->>'modified')::timestamptz end as modified
        from item it
        cross join lateral (select coalesce(it.j->'detail'->'file'->>'url', it.j->'detail'->>'url') as url) u
       where coalesce(btrim(it.j->>'path'), '') <> ''
       order by it.side, it.course_id, it.j->>'id', it.ord
    ),
    ref as (
      select it.side, it.course_id, it.j->>'id' as id,
             coalesce(nullif(f->>'name', ''), 'untitled') as name, f->>'url' as url
        from item it cross join lateral jsonb_array_elements(bb_jarray(it.j->'embeddedFiles')) f
       where coalesce(btrim(f->>'url'), '') <> ''
      union all
      select it.side, it.course_id, it.j->>'id',
             coalesce(nullif(coalesce(it.j->'detail'->'file'->>'name', it.j->>'title'), ''), 'untitled'),
             it.j->'detail'->'file'->>'url'
        from item it
       where coalesce(btrim(it.j->'detail'->'file'->>'url'), '') <> ''
    ),
    file as (
      select r.side, r.course_id, r.id, r.name,
             min(case when left(r.url, 1) = '/' then BB_ORIGIN || r.url else r.url end) as url
        from ref r
       where r.url !~ '/sessions/'
       group by r.side, r.course_id, r.id, r.name
    ),
    want as (
      select 'content' as entity, c.course_id, c.id as bb_item_id, '' as file_name, 'appeared' as change
        from node c
       where c.side = 'cur'
         and not exists (select 1 from node p where p.side = 'pred' and p.course_id = c.course_id and p.id = c.id)
      union all
      select 'content', p.course_id, p.id, '', 'vanished'
        from node p
       where p.side = 'pred'
         and not exists (select 1 from node c where c.side = 'cur' and c.course_id = p.course_id and c.id = p.id)
      union all
      select 'content', c.course_id, c.id, '', 'changed'
        from node c join node p on p.side = 'pred' and p.course_id = c.course_id and p.id = c.id
       where c.side = 'cur'
         -- 138 (R2-3): a path change counts only with the item's own parent or title change.
         and (   (c.title, c.url, c.modified) is distinct from (p.title, p.url, p.modified)
              or (c.path is distinct from p.path and c.parent is distinct from p.parent))
      union all
      select 'file', c.course_id, c.id, c.name, 'appeared'
        from file c
       where c.side = 'cur'
         and not exists (select 1 from file p where p.side = 'pred' and p.course_id = c.course_id
                                                and p.id = c.id and p.name = c.name)
      union all
      select 'file', p.course_id, p.id, p.name, 'vanished'
        from file p
       where p.side = 'pred'
         and not exists (select 1 from file c where c.side = 'cur' and c.course_id = p.course_id
                                                and c.id = p.id and c.name = p.name)
      union all
      select 'file', c.course_id, c.id, c.name, 'changed'
        from file c join file p on p.side = 'pred' and p.course_id = c.course_id and p.id = c.id and p.name = c.name
       where c.side = 'cur' and c.url is distinct from p.url
    ),
    have as (
      select h.entity, h.course_id, h.bb_item_id, h.file_name, h.change
        from bb_material_history h where h.run_id = v_run
    )
    select count(*) into v_n
      from ((select * from want except select * from have)
            union all
            (select * from have except select * from want)) x;
    if v_n <> 0 then
      v_fail := v_fail || format('(P) %s row(s) differ between the bb_raw diff of crawl %s and its history', v_n, v_run);
    end if;
  end if;

  -- -------------------------------------------------------------------------------------------
  -- (V) prod: one vanish convention
  -- -------------------------------------------------------------------------------------------
  select count(*) into v_n
    from bb_content b
    join lateral (
      select h.run_id
        from bb_material_history h
       where h.entity = 'content' and h.change = 'vanished'
         and h.course_id = b.course_id and h.bb_item_id = b.bb_item_id
       order by h.seen_at desc, h.id desc
       limit 1) v on true
   where b.detail->>'missing_since' is not null
     and b.detail->>'missing_since' is distinct from v.run_id::text;
  if v_n <> 0 then
    v_fail := v_fail || format('(V) %s stamped row(s) disagree with their newest vanished history row', v_n);
  end if;

  -- -------------------------------------------------------------------------------------------
  -- The fixture course and its eight registered crawls
  -- -------------------------------------------------------------------------------------------
  insert into courses (id, term_id, bb_course_id, subject, number, section, title_bb, title_short, bb_id)
  select COURSE, (select term_id from courses order by id limit 1), 'W52.132.FIXTURE', 'W52', '132', 'M001',
         'Phase 19 history fixture course (rolled back)', 'W52 history fixture', SHELL;

  for i in 1..8 loop
    v_runs := v_runs || format('00000000-1320-4000-8000-00000000000%s', i)::uuid;
  end loop;

  insert into bb_files (run_id, bb_course_id, course_id, content_id, path, file_name, source_url, bucket)
  values (v_runs[2], SHELL, COURSE, '_w52h_n1_1', 'Week 1 / ultraDocumentBody', 'a.pdf',
          BB_ORIGIN || '/bbcswebdav/w52h/a2', 'readings')
  returning id into v_file_a;
  insert into bb_files (run_id, bb_course_id, course_id, content_id, path, file_name, source_url, bucket)
  values (v_runs[2], SHELL, COURSE, '_w52h_x1_1', 'Syllabus', 'syllabus.docx',
          BB_ORIGIN || '/bbcswebdav/w52h/x2', 'readings')
  returning id into v_file_x;

  -- Each crawl is registered (its request and its bb_raw rows) when its turn comes, and its
  -- sync_runs row (its fold) is written once the crawls before it are recorded: the order a real
  -- sync keeps. Since 170 (R3-1) a newer REGISTERED crawl makes a run older, as it does for
  -- stage_content, so a crawl registered ahead of time would turn earlier recordings into older
  -- runs.
  for k in 1..8 loop
    insert into agent_requests (kind, scope, state, run_id, note, claimed_by, claimed_at, finished_at)
    values ('sync', 'all', 'done', v_runs[k], format('Phase 19 history fixture crawl %s (rolled back)', k),
            'phase19_132', now(), now());
    insert into bb_raw (run_id, kind, bb_course_id, captured_at, payload)
    select v_runs[k], 'course', SHELL, now() + make_interval(hours => k),
           jsonb_build_object('content', coalesce((
             select jsonb_agg(jsonb_build_object(
                      'id', f.id, 'parentId', '_w52h_root_1', 'type', f.type, 'path', f.path, 'title', f.title,
                      'detail', f.detail, 'state', 'None', 'modified', 1790000000000,
                      'embeddedFiles', coalesce(f.files, '[]'::jsonb)) order by f.ord)
               from _fx132 f where f.crawl = k), '[]'::jsonb));

    -- Fold every crawl before k, with its status (crawl 3 reaped, crawl 5 still running).
    insert into sync_runs (run_id, status, started_at, finished_at, trigger, source, scope, notes)
    select v_runs[g], STATUSES[g], now(), case when STATUSES[g] = 'running' then null else now() end,
           'manual', 'blackboard', 'all',
           case when STATUSES[g] = 'failed' then 'phase19 fixture: died | interrupted (reaped)' end
      from generate_series(1, k - 1) g
     where not exists (select 1 from sync_runs s where s.run_id = v_runs[g]);

    continue when k in (3, 5);   -- the reaped and the running crawl are never recorded

    if k = 1 then
  -- (1) baseline
  v_r := material_history_record(v_runs[1]);
  if (v_r - 'sample') is distinct from
     '{"appeared":0,"changed":0,"vanished":0,"baseline_courses":1,"older_run":false}'::jsonb
     or exists (select 1 from bb_material_history where run_id = v_runs[1]) then
    v_fail := v_fail || format('(1) the baseline crawl returned %s', v_r);
  end if;

    elsif k = 2 then
  -- (2) appeared, changed, vanished. Every row is written; since 138 (R2-2) the counts cover
  -- materials only: b.pdf covers its document, g.pdf its document, and the file node
  -- _w52h_x1_1 is one material (its syllabus.docx row), not two.
  v_r := material_history_record(v_runs[2]);
  if (v_r - 'sample') is distinct from
     '{"appeared":1,"changed":3,"vanished":1,"baseline_courses":0,"older_run":false}'::jsonb then
    v_fail := v_fail || format('(2) crawl 2 returned %s', v_r);
  end if;
  select string_agg(format('%s %s %s %s %s', change, entity, bb_item_id, file_name, coalesce(changed_fields::text, '-')),
                    ' ; ' order by change, entity, bb_item_id, file_name)
    into v_got from bb_material_history where run_id = v_runs[2];
  if v_got is distinct from
     'appeared content _w52h_n2_1  - ; appeared file _w52h_n2_1 b.pdf - ; '
     'changed content _w52h_l1_1  {title} ; changed content _w52h_x1_1  {url} ; '
     'changed file _w52h_n1_1 a.pdf {url} ; changed file _w52h_x1_1 syllabus.docx {url} ; '
     'vanished content _w52h_g1_1  - ; vanished file _w52h_g1_1 g.pdf -' then
    v_fail := v_fail || format('(2) crawl 2 rows read %s', coalesce(v_got, '(none)'));
  end if;
  select string_agg(format('%s=%s', bb_item_id, title), ' ; ' order by bb_item_id) into v_got
    from bb_material_history where run_id = v_runs[2] and entity = 'content';
  if v_got is distinct from
     '_w52h_g1_1=Going away ; _w52h_l1_1=New reading ; _w52h_n2_1=Week 2 notes ; _w52h_x1_1=Syllabus' then
    v_fail := v_fail || format('(2) titles read %s', v_got);
  end if;
  if (select count(*) from bb_material_history h
       where h.run_id = v_runs[2]
         and h.seen_at = (select captured_at from bb_raw where run_id = v_runs[2] and kind = 'course')
         and h.course_id = COURSE) <> 8 then
    v_fail := v_fail || '(2) seen_at is not the crawl''s captured_at on every row'::text;
  end if;
  select string_agg(format('%s:%s', file_name, coalesce(bb_file_id::text, 'null')), ' ' order by file_name) into v_got
    from bb_material_history where run_id = v_runs[2] and entity = 'file' and change = 'changed';
  if v_got is distinct from format('a.pdf:%s syllabus.docx:%s', v_file_a, v_file_x) then
    v_fail := v_fail || format('(2) bb_file_id read %s, want a.pdf:%s syllabus.docx:%s', v_got, v_file_a, v_file_x);
  end if;
  if jsonb_array_length(v_r->'sample') <> 5
     or exists (select 1 from jsonb_array_elements(v_r->'sample') e
                 where not (e ? 'change' and e ? 'entity' and e ? 'title'))
     or (select count(*) from jsonb_array_elements(v_r->'sample') e where e->>'change' = 'changed') <> 3 then
    v_fail := v_fail || format('(2) sample reads %s', v_r->'sample');
  end if;

  -- (2b) a re-run writes 0
  v_r := material_history_record(v_runs[2]);
  if (v_r - 'sample') is distinct from
     '{"appeared":0,"changed":0,"vanished":0,"baseline_courses":0,"older_run":false}'::jsonb
     or (select count(*) from bb_material_history where run_id = v_runs[2]) <> 8 then
    v_fail := v_fail || format('(2b) a re-run of crawl 2 returned %s', v_r);
  end if;

  -- (O) an older run writes 0: crawl 2 is folded now, and newer
  insert into sync_runs (run_id, status, started_at, finished_at, trigger, source, scope)
  values (v_runs[2], STATUSES[2], now(), now(), 'manual', 'blackboard', 'all');
  v_r := material_history_record(v_runs[1]);
  if (v_r->>'older_run')::boolean is distinct from true
     or exists (select 1 from bb_material_history where run_id = v_runs[1]) then
    v_fail := v_fail || format('(O) the older crawl returned %s', v_r);
  end if;

    elsif k = 4 then
  -- (4) a reaped crawl is skipped as a predecessor
  v_r := material_history_record(v_runs[4]);
  select string_agg(format('%s %s %s', change, entity, bb_item_id), ' ; ' order by bb_item_id) into v_got
    from bb_material_history where run_id = v_runs[4];
  if v_got is distinct from 'appeared content _w52h_n3_1' then
    v_fail := v_fail || format('(4) after a reaped crawl 3, crawl 4 recorded %s (returned %s)', coalesce(v_got, '(none)'), v_r);
  end if;

    elsif k = 6 then
  -- (6) a running crawl is skipped as a predecessor
  v_r := material_history_record(v_runs[6]);
  select string_agg(format('%s %s %s', change, entity, bb_item_id), ' ; ' order by bb_item_id) into v_got
    from bb_material_history where run_id = v_runs[6];
  if v_got is distinct from 'appeared content _w52h_n5_1' then
    v_fail := v_fail || format('(6) after a running crawl 5, crawl 6 recorded %s (returned %s)', coalesce(v_got, '(none)'), v_r);
  end if;

    elsif k = 7 then
  -- (8) an empty tree vanishes nothing and is not a predecessor
  v_r := material_history_record(v_runs[7]);
  if (v_r - 'sample') is distinct from
     '{"appeared":0,"changed":0,"vanished":0,"baseline_courses":0,"older_run":false}'::jsonb then
    v_fail := v_fail || format('(8) the empty crawl 7 returned %s', v_r);
  end if;

    else
  v_r := material_history_record(v_runs[8]);
  if (v_r - 'sample') is distinct from
     '{"appeared":0,"changed":0,"vanished":0,"baseline_courses":0,"older_run":false}'::jsonb then
    v_fail := v_fail || format('(8) crawl 8, after the empty crawl 7, returned %s', v_r);
  end if;
    end if;
  end loop;

  -- (R2-5, R3-1) crawls 7 and 8 are registered and newer and wrote no rows (crawl 8 is not even
  -- folded). Crawl 6 is now an older run.
  v_r := material_history_record(v_runs[6]);
  if (v_r->>'older_run')::boolean is distinct from true then
    v_fail := v_fail || format('(R3-1) crawl 6 after newer registered crawls 7 and 8 returned %s', v_r);
  end if;

  -- (X) scope
  if exists (select 1 from bb_material_history where run_id = any (v_runs) and course_id <> COURSE)
     or (select count(*) from bb_material_history where run_id <> all (v_runs)) <> v_prod
     or (select count(*) from bb_material_history where run_id = any (v_runs)) <> 10 then
    v_fail := v_fail || '(X) a fixture crawl wrote outside its course, or prod''s rows changed'::text;
  end if;

  begin
    perform material_history_record(null);
    v_fail := v_fail || 'a null run id did not raise'::text;
  exception when sqlstate '22004' then null;
  end;

  if cardinality(v_fail) > 0 then
    raise exception 'FAIL phase19_132: %', array_to_string(v_fail, '; ');
  end if;
end $$;

-- (N) a stranger reads nothing; RLS is the boundary, the select grant is not.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000000', true);
select set_config('request.jwt.claims',
                  '{"sub":"00000000-0000-0000-0000-000000000000","role":"authenticated"}', true);
set local role authenticated;

do $$
begin
  if (select count(*) from bb_material_history) <> 0 then
    raise exception 'FAIL phase19_132: (N) a stranger reads % bb_material_history row(s)',
      (select count(*) from bb_material_history);
  end if;
end $$;

reset role;

select 'phase19_132_material_history: PASS'                                             as result,
       (select count(*) from bb_material_history where course_id <> 'W52.132')           as prod_rows,
       (select count(*) from bb_material_history where course_id = 'W52.132')            as fixture_rows;

rollback;

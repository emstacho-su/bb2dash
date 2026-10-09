-- bb2dash :: db/tests/phase18_123_file_sessions.sql
-- Phase 18 (brief 98), task 10. Worker W-48. file_week_no and link_file_sessions (123), R-67.
-- Two synthetic files are added inside the transaction so the rule is exercised whatever prod
-- already holds: an IST.352 "WK05" file (week 5 has one session -> linked, 0.8) and a GEO.103
-- "Week 4" file (week 4 has two sessions -> one question). Then, after link_file_sessions(null):
--   (1) 0 eligible current files have week_no null where file_week_no(...) is not null
--   (2) 0 pre-existing week_no / session_id values changed
--   (3) 0 storage_path / local_path values changed
--   (4) every unlinked eligible file whose week holds >= 2 sessions (and no settled answer) has
--       exactly 1 open attention row. A file is settled the way link_file_sessions settles it
--       (163, step c): its LATEST answer (resolved, dismissed, or archived and not self-closed;
--       ordered by coalesce(resolved_at, raised_at) desc, id desc) has a to_value equal to the
--       week's current candidate sessions (non-no_class session ids, ascending, as a jsonb array).
--       A week that gained a session since the answer is not settled and needs a question again.
--   (5) a replay writes 0 (weeks_set, sessions_linked, attention_raised all 0)
--   (6) the synthetic files: IST.352 -> week 5, the week's one session, confidence 0.8; GEO -> week
--       4, unlinked, one open question
--   (7) the B-34 hand links: 31 -> 129, 47 -> 130, 32 -> 131
-- Needs migration 128's execute grants for db_test_runner. Collects failures, raises once.
-- RUN IT: `node scripts/db-test.mjs --only phase18_123_file_sessions.sql`.

begin;

do $$
declare
  v_fail   text[] := array[]::text[];
  v_before jsonb;
  v_r      jsonb;
  v_bad    text;
  v_352    bigint;
  v_geo    bigint;
  v_n      int;
begin
  insert into bb_files (bb_course_id, course_id, content_id, path, file_name, source_url, bucket,
                        classified_by, classification_confidence, notes)
  select c.bb_id, 'IST.352', '_p18_synthetic_123a',
         'Weekly Modules / WK05 - Synthetic / ultraDocumentBody', 'p18 synthetic 352.pptx',
         'https://blackboard.syracuse.edu/bbcswebdav/p18-synthetic-123a', 'readings', 'rule', 0.6,
         'phase18_123 synthetic'
    from courses c where c.id = 'IST.352'
  returning id into v_352;
  insert into bb_files (bb_course_id, course_id, content_id, path, file_name, source_url, bucket,
                        classified_by, classification_confidence, notes)
  select c.bb_id, 'GEO.103.lecture', '_p18_synthetic_123b',
         'Week 4 - Synthetic / ultraDocumentBody', 'p18 synthetic geo.pdf',
         'https://blackboard.syracuse.edu/bbcswebdav/p18-synthetic-123b', 'readings', 'rule', 0.6,
         'phase18_123 synthetic'
    from courses c where c.id = 'GEO.103.lecture'
  returning id into v_geo;

  select jsonb_object_agg(id, jsonb_build_array(week_no, session_id, storage_path, local_path))
    into v_before from bb_files;

  v_r := link_file_sessions(null);

  -- (1)
  select string_agg(id::text, ', ' order by id) into v_bad
    from bb_files
   where superseded_by is null and classified_by is distinct from 'stack'
     and bucket <> 'my_submissions'
     and week_no is null and file_week_no(course_id, path, file_name) is not null;
  if v_bad is not null then
    v_fail := v_fail || format('(1) week not set: %s', v_bad);
  end if;

  -- (2), (3)
  select string_agg(f.id::text, ', ' order by f.id) into v_bad
    from bb_files f
   where (v_before->f.id::text->>0 is not null
          and (f.week_no)::text is distinct from v_before->f.id::text->>0)
      or (v_before->f.id::text->>1 is not null
          and (f.session_id)::text is distinct from v_before->f.id::text->>1);
  if v_bad is not null then
    v_fail := v_fail || format('(2) pre-existing week/session changed: %s', v_bad);
  end if;
  select string_agg(f.id::text, ', ' order by f.id) into v_bad
    from bb_files f
   where f.storage_path is distinct from v_before->f.id::text->>2
      or f.local_path   is distinct from v_before->f.id::text->>3;
  if v_bad is not null then
    v_fail := v_fail || format('(3) storage/local path changed: %s', v_bad);
  end if;

  -- (4)
  select string_agg(format('%s:%s', f.id,
           (select count(*) from attention_items ai
             where ai.kind = 'stack_must_confirm' and ai.ref = 'session_link/' || f.id::text
               and ai.state = 'open')), ', ' order by f.id) into v_bad
    from bb_files f
   where f.superseded_by is null and f.classified_by is distinct from 'stack'
     and f.bucket <> 'my_submissions' and f.session_id is null and f.week_no is not null
     and (select count(*) from sessions s
           where s.course_id = f.course_id and s.week_no = f.week_no and s.kind <> 'no_class') >= 2
     and (select ai.to_value
            from attention_items ai
           where ai.kind = 'stack_must_confirm' and ai.entity = 'bb_file'
             and ai.ref = 'session_link/' || f.id::text and ai.field = 'session_id'
             and (ai.state in ('resolved', 'dismissed')
                  or (ai.state = 'archived' and ai.decision->>'closed_itself' is distinct from 'true'))
           order by coalesce(ai.resolved_at, ai.raised_at) desc, ai.id desc
           limit 1)
         is distinct from
         (select to_jsonb(array_agg(s.id order by s.id)) from sessions s
           where s.course_id = f.course_id and s.week_no = f.week_no and s.kind <> 'no_class')
     and (select count(*) from attention_items ai
           where ai.kind = 'stack_must_confirm' and ai.ref = 'session_link/' || f.id::text
             and ai.state = 'open') <> 1;
  if v_bad is not null then
    v_fail := v_fail || format('(4) ambiguous without exactly one open question: %s', v_bad);
  end if;

  -- (5)
  v_r := link_file_sessions(null);
  if (v_r->>'weeks_set')::int <> 0 or (v_r->>'sessions_linked')::int <> 0
     or (v_r->>'attention_raised')::int <> 0 then
    v_fail := v_fail || format('(5) replay wrote %s', v_r);
  end if;

  -- (6)
  if not coalesce((select week_no = 5
                          and session_id = (select s.id from sessions s
                                             where s.course_id = 'IST.352' and s.week_no = 5
                                               and s.kind <> 'no_class')
                          and link_confidence = 0.8
                     from bb_files where id = v_352), false) then
    v_fail := v_fail || format('(6) IST.352 synthetic: %s',
      (select format('week %s session %s conf %s', week_no, session_id, link_confidence)
         from bb_files where id = v_352));
  end if;
  select count(*) into v_n from attention_items
   where kind = 'stack_must_confirm' and ref = 'session_link/' || v_geo::text and state = 'open';
  if not coalesce((select week_no = 4 and session_id is null from bb_files where id = v_geo), false)
     or v_n <> 1 then
    v_fail := v_fail || format('(6) GEO synthetic: %s, %s open questions',
      (select format('week %s session %s', week_no, session_id) from bb_files where id = v_geo), v_n);
  end if;

  -- (7)
  select count(*) into v_n from bb_files where (id, session_id) in ((31, 129), (47, 130), (32, 131));
  if v_n <> 3 then
    v_fail := v_fail || format('(7) hand links present: %s of 3', v_n);
  end if;

  if cardinality(v_fail) > 0 then
    raise exception 'FAIL %', array_to_string(v_fail, '; ');
  end if;
end $$;

select 'phase18_123_file_sessions: PASS' as result;

rollback;

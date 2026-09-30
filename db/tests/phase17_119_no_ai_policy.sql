-- bb2dash :: db/tests/phase17_119_no_ai_policy.sql
-- Phase 17 (docs/planning/sprint-2/briefs/97_PHASE17_web_polish.md), round 3, R3-6. Worker W-44.
-- Tests migration 119: no current extracted text unit carries a course's AI-use policy section,
-- no course keeps an ai_policy, and no embedding points past the end of its (possibly shortened)
-- unit. A re-pulled syllabus that brings a policy section back into the corpus fails this file,
-- which is the point: 119 is a one-time cut, and this is the rule that keeps it.
--
-- The patterns are section headings and the university template's opening clause, not passages.
-- They do not match the IST.323 "Appendix B: AI Use Statement" deliverable, which 119 leaves in.
--
-- Read-only. RUN IT: `node scripts/db-test.mjs --only phase17_119_no_ai_policy.sql`, or paste the
-- whole file into one `execute_sql` call. The last statement is `rollback`.

begin;

do $$
declare
  v_fail text[] := '{}';
  v_bad  text;
begin
  select string_agg(format('%s (%s, %s)', t.id, f.course_id, f.file_name), '; ' order by t.id) into v_bad
    from bb_file_text t
    join bb_files f on f.id = t.file_id
   where f.superseded_by is null
     and (   t.text ~* 'artificial intelligence language'
          or t.text ~* 'artificial intelligence use\M'
          or t.text ~* 'zero tolerance for artificial intelligence'
          or t.text ~* 'artificial intelligence (tools? )?(is|are|may be) permitted'
          or t.text ~* '(^|\n)\s*on the use of AI:'
          or t.text ~* '(^|\n)\s*AI Use\s*(\n|$)');
  if v_bad is not null then
    v_fail := v_fail || format('current units still carry an AI-use policy section: %s', v_bad);
  end if;

  select string_agg(course_id, ', ' order by course_id) into v_bad
    from grading_schemes where ai_policy is not null;
  if v_bad is not null then
    v_fail := v_fail || format('grading_schemes.ai_policy is still set for %s', v_bad);
  end if;

  select string_agg(distinct e.text_id::text, ', ') into v_bad
    from bb_text_embeddings e
    join bb_file_text t on t.id = e.text_id
   where upper(e.part_range) > t.char_count;
  if v_bad is not null then
    v_fail := v_fail || format('embeddings point past the end of units %s', v_bad);
  end if;

  if cardinality(v_fail) > 0 then
    raise exception 'FAIL phase17_119: %', array_to_string(v_fail, '; ');
  end if;
end $$;

select 'phase17_119_no_ai_policy: PASS'                                                 as result,
       (select count(*) from bb_file_text t join bb_files f on f.id = t.file_id
         where f.superseded_by is null)                                                  as current_units;

rollback;

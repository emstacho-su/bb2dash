-- bb2dash :: 119_strip_ai_policy_passages.sql
-- Phase 17 (docs/planning/sprint-2/briefs/97_PHASE17_web_polish.md), round 3, R3-6. Worker W-44.
-- The phase's last slot. DATA only: no object is created or changed.
--
-- WHY. Stack's call on 2026-09-29: the AI Policy goes from the app (R3-5) AND from the search
-- corpus, so no search, no Ask answer and no card ever quotes a course's AI-use rule back to him.
-- The documents stay the professors': the bytes in Storage and in `course context/` are not
-- touched. Only the extracted text units the search reads are trimmed.
--
-- WHAT.
--   1. Eight current bb_file_text units (the survey in walk-17/97w_PHASE17_WALK.md, "R3-6 removed
--      units") lose their AI-use section: from the line that opens it to the line that opens the
--      next section, or to the end of the unit. Each boundary is found with a short heading marker
--      and strpos; no passage text is written here. A marker's match is widened back to the start
--      of its line, so indentation goes with it.
--   2. A unit left with no text (IST.323's course-intro slide 13 is the policy and nothing else) is
--      deleted rather than kept empty: embed-corpus reports an empty unit as a scan failure on
--      every run.
--   3. Every bb_text_embeddings row of the eight units is deleted, all models. embed-corpus resumes
--      by (text_id, part_no) presence, so a unit with no parts left is chunked afresh from its new
--      text and re-embedded whole; part_range stays code points into the new text (char_count and
--      fts are generated columns and follow the update). The PM then runs
--      `node ingest/embed_corpus.mjs` until `--check` prints missing_parts_before=0.
--   4. grading_schemes.ai_policy is set to null on every course.
--
-- GUARD. The (text_id, removed char count) list below is what the dry run of 2026-09-29 found. If
-- any unit moved, was re-extracted or superseded, or a marker now lands elsewhere, the list differs
-- and the migration aborts before writing anything.
--
-- Left in on purpose (the PM's to decide; see the walk doc): IST.323's "Appendix B: AI Use
-- Statement" deliverable (text 515, 516), the Final Project packet's line naming that appendix
-- (519) and the deliverables slide (383). They describe what to hand in, not a course policy.

create temp table _w44_ai_plan on commit drop as
with plan(text_id, start_marker, case_insensitive, end_marker) as (values
  (214::bigint, 'artificial intelligence',                        true,  'Disability-Related Accommodations'),
  (277,         'Limited and Specified Artificial Intelligence Use', false, null),
  (350,         'Artificial Intelligence Language:',              false, null),
  (522,         'Artificial Intelligence Language:',              false, 'Disability-Related Accommodations'),
  (89,          'Artificial Intelligence Language:',              false, 'Disability-Related Accommodations'),
  (1,           'Zero tolerance for artificial intelligence use', false, 'Syracuse University values diversity'),
  (733,         'On the use of AI:',                              false, 'Submission format.'),
  (374,         'AI Use',                                         false, null)
),
found as (
  select p.text_id, p.end_marker, t.text, f.superseded_by,
         case when p.case_insensitive then strpos(lower(t.text), p.start_marker)
              else strpos(t.text, p.start_marker) end as m
    from plan p
    join bb_file_text t on t.id = p.text_id
    join bb_files f on f.id = t.file_id
),
bounds as (
  select found.*,
         -- the start of the marker's line
         m - char_length(substring(substr(text, 1, m - 1) from '[^\n]*$')) as s,
         case when end_marker is null then 0 else strpos(substr(text, m), end_marker) end as em
    from found
   where m > 0
),
cut as (
  select bounds.*,
         case when end_marker is null then char_length(text) + 1
              when em = 0 then null
              -- the start of the end marker's line
              else (m + em - 1) - char_length(substring(substr(text, 1, m + em - 2) from '[^\n]*$'))
         end as e
    from bounds
)
select text_id, superseded_by,
       substr(text, 1, s - 1) || substr(text, e) as new_text,
       char_length(text) - char_length(substr(text, 1, s - 1) || substr(text, e)) as removed
  from cut
 where e is not null;

do $$
declare
  v_found    text;
  v_expected constant text :=
    '1:530,89:1678,214:589,277:707,350:777,374:670,522:692,733:257';
begin
  select string_agg(text_id || ':' || removed, ',' order by text_id) into v_found
    from _w44_ai_plan
   where superseded_by is null;
  if v_found is distinct from v_expected then
    raise exception '119 refused: AI-policy cut list is %, expected %', coalesce(v_found, '(none)'), v_expected;
  end if;
end $$;

delete from public.bb_text_embeddings e
 using _w44_ai_plan p
 where e.text_id = p.text_id;

update public.bb_file_text t
   set text = p.new_text
  from _w44_ai_plan p
 where t.id = p.text_id
   and btrim(p.new_text, E' \n\r\t') <> '';

delete from public.bb_file_text t
 using _w44_ai_plan p
 where t.id = p.text_id
   and btrim(p.new_text, E' \n\r\t') = '';

update public.grading_schemes
   set ai_policy = null
 where ai_policy is not null;

do $$
begin
  if exists (select 1 from bb_text_embeddings where text_id in (1, 89, 214, 277, 350, 374, 522, 733))
     or exists (select 1 from bb_file_text where id = 374)
     or exists (select 1 from grading_schemes where ai_policy is not null) then
    raise exception '119 failed: a unit kept its embeddings, slide 374 survived, or an ai_policy is left';
  end if;
end $$;

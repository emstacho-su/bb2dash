-- bb2dash :: 150_strip_ist323_appendix_b.sql
-- Phase 17 (docs/planning/sprint-2/briefs/97_PHASE17_web_polish.md), round 3, R3-6b. Worker W-44.
-- Phase 17's 110-119 are full, so this takes 150, the first of the next free block of ten
-- (94 §2 rule 6; the PM records it in DECISIONS). DATA only: no object is created or changed.
--
-- WHY. Stack, 2026-09-29, after 119: "remove IST 323 appendix b as well". 119 left IST.323's
-- Final Project "Appendix B: AI Use Statement" in the corpus because it is a hand-in spec rather
-- than a course policy. It goes now, with every current IST.323 unit that names it. As in 119, the
-- documents stay the professor's: Storage and `course context/` are not touched, and bb_files
-- row 13 keeps its catalog entry. Only the extracted text the search reads is trimmed.
--
-- WHAT (the survey is in walk-17/97w_PHASE17_WALK.md, "R3-6b removed units"):
--   * 515, 516  the two pages of IST323_Appendix_B_AI_Use_Statement.pdf (file 13): the whole
--               unit is the appendix, so the unit is deleted.
--   * 519       the Final Project packet: only the one line that names Appendix B, from the start of
--               its line to the start of the Appendix C line. The rest of the packet stays.
--   * 383       the "What You Turn In" slide: only the "B: ..." item inside the line that lists the
--               three appendices, up to where the "C: ..." item starts. A and C stay.
-- Boundaries are short markers found with strpos; no passage text is written here. Every
-- bb_text_embeddings row of the four units is deleted (all models); embed-corpus re-chunks 519 and
-- 383 from their new text, and the PM re-runs `node ingest/embed_corpus.mjs` until `--check`
-- prints missing_parts_before=0.
--
-- GUARD. The (text_id, removed char count) list below is what the dry run of 2026-09-29 found; any
-- difference aborts before anything is written.

create temp table _w44_appb_plan on commit drop as
with plan(text_id, mode, start_marker, end_marker) as (values
  -- mode 'unit': the whole unit; 'line': marker's line start to end marker's line start;
  -- 'inline': marker start to end marker start, within the line.
  (515::bigint, 'unit',   null::text,                     null::text),
  (516,         'unit',   null,                           null),
  (519,         'line',   'Appendix B: AI use statement.', 'Appendix C: Your running log.'),
  (383,         'inline', 'B: AI use statement.',         'C: Your running log.')
),
found as (
  select p.text_id, p.mode, p.end_marker, t.text, f.superseded_by, f.course_id,
         case when p.mode = 'unit' then 1 else strpos(t.text, p.start_marker) end as m
    from plan p
    join bb_file_text t on t.id = p.text_id
    join bb_files f on f.id = t.file_id
),
bounds as (
  select found.*,
         case when mode = 'line'
              then m - char_length(substring(substr(text, 1, m - 1) from '[^\n]*$'))
              else m end as s,
         case when mode = 'unit' then 0 else strpos(substr(text, m), end_marker) end as em
    from found
   where m > 0
),
cut as (
  select bounds.*,
         case when mode = 'unit'   then char_length(text) + 1
              when em = 0          then null
              when mode = 'inline' then m + em - 1
              else (m + em - 1) - char_length(substring(substr(text, 1, m + em - 2) from '[^\n]*$'))
         end as e
    from bounds
)
select text_id, superseded_by, course_id,
       substr(text, 1, s - 1) || substr(text, e) as new_text,
       char_length(text) - char_length(substr(text, 1, s - 1) || substr(text, e)) as removed
  from cut
 where e is not null;

do $$
declare
  v_found    text;
  v_expected constant text := '383:23,515:2983,516:1963,519:280';
begin
  select string_agg(text_id || ':' || removed, ',' order by text_id) into v_found
    from _w44_appb_plan
   where superseded_by is null and course_id = 'IST.323';
  if v_found is distinct from v_expected then
    raise exception '150 refused: Appendix B cut list is %, expected %', coalesce(v_found, '(none)'), v_expected;
  end if;
end $$;

delete from public.bb_text_embeddings e
 using _w44_appb_plan p
 where e.text_id = p.text_id;

update public.bb_file_text t
   set text = p.new_text
  from _w44_appb_plan p
 where t.id = p.text_id
   and btrim(p.new_text, E' \n\r\t') <> '';

delete from public.bb_file_text t
 using _w44_appb_plan p
 where t.id = p.text_id
   and btrim(p.new_text, E' \n\r\t') = '';

do $$
begin
  if exists (select 1 from bb_text_embeddings where text_id in (383, 515, 516, 519))
     or exists (select 1 from bb_file_text where id in (515, 516))
     or exists (select 1 from bb_file_text where id in (383, 519) and text ~* 'AI use statement') then
    raise exception '150 failed: a unit kept its embeddings, an appendix page survived, or a reference is left';
  end if;
end $$;

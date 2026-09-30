-- bb2dash :: 125_geo103_reading_routes.sql
-- Phase 18 (brief 98, Contract row 125; task 12; R-68, B-33). Worker W-48.
--
-- Ten GEO.103 textbook chapters read "On Blackboard — not pulled yet" on /materials because the
-- seed set readings.on_blackboard = true, although the syllabus lists them without "(BB)" and
-- courses.group_notes says they are ebooks behind the Orange Instant Access tool (B-33's default:
-- the chapters are off-platform). With on_blackboard false, the existing ebook rule in
-- resolveReadingRoute reads them "Off-platform" with the syllabus action.
--   Murphy Ch. 1 (39), Ch. 3 (41), Ch. 4 (44), Ch. 2 (49), Ch. 8 (52), Ch. 5 (58);
--   Goodell (59, 61); Johnson Ch. 6 (60), Ch. 7 (62).
-- Reading 45 (Institute of Physics, 2017) is a Blackboard external link, bb_content 114, whose
-- phys.org URL never reached readings.url; it is copied from there. Huber (46) is left as it is.
-- Only the rows named here change, and only from the value the seed wrote; a guard raises unless
-- exactly 10 on_blackboard flags and 1 url change.

do $$
declare
  CHAPTER_NOTE constant text := 'on_blackboard false (migration 125, brief 98 B-33): an ebook chapter behind Orange Instant Access, not a Blackboard file';
  URL_NOTE     constant text := 'url copied from bb_content 114, the Blackboard external link (migration 125, brief 98 B-33)';
  v_flags int;
  v_urls  int;
begin
  update readings
     set on_blackboard = false,
         notes = btrim(coalesce(notes || ' | ', '') || CHAPTER_NOTE)
   where id in (39, 41, 44, 49, 52, 58, 59, 60, 61, 62)
     and course_id = 'GEO.103.lecture'
     and on_blackboard;
  get diagnostics v_flags = row_count;

  update readings r
     set url   = c.url,
         notes = btrim(coalesce(r.notes || ' | ', '') || URL_NOTE)
    from bb_content c
   where r.id = 45
     and r.course_id = 'GEO.103.lecture'
     and r.url is null
     and c.id = 114
     and c.course_id = 'GEO.103.lecture'
     and c.url like 'https://%';
  get diagnostics v_urls = row_count;

  if v_flags <> 10 or v_urls <> 1 then
    raise exception '125: expected 10 flags and 1 url to change, got % and %', v_flags, v_urls;
  end if;
end $$;

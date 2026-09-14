-- bb2dash :: 028_card_note.sql
-- Phase 8 (W-12). Spec: docs/planning/61_PHASE8_course_dimension.md
-- "§Contract -> courses.card_note (migration 028)" and requirement R-04.
--
-- The Nocturne artboards put a one-line note under each Home course card; the GUI v1 build
-- dropped it because there was nowhere to store it. This adds the column and re-cuts
-- v_course_display to carry it, because the Home card reads that view and nothing else.
--
-- card_note is OWNER-WRITTEN TEXT, the first free-text field in this schema that a UI edits.
-- It is capped at 280 characters here so an accidental paste of a whole document cannot become
-- a course card. That cap is a deliberate addition to the brief, not something the brief asked
-- for; W-13 should mirror it as a maxLength on the Info-tab input so the user sees the limit
-- instead of a Postgres error. Beyond the cap the value is stored verbatim: it is rendered as
-- text, never as HTML, so escaping is the renderer's job and sanitising here would silently
-- rewrite what the owner typed.

alter table courses
  add column card_note text,
  add constraint courses_card_note_len check (card_note is null or length(card_note) <= 280);

comment on column courses.card_note is
  'Owner-written one-line note for the course, edited on the course Info tab and rendered '
  'under the Home course card (R-04). Plain text, at most 280 characters, stored verbatim; '
  'never overwritten by a sync. Null = no note (render nothing, not "not recorded").';

-- ---------------------------------------------------------------------------------------------
-- v_course_display, recreated (not altered) so its frozen column list gains card_note at the
-- end. Body is unchanged from migration 017 apart from that column; the comment there explains
-- why room_disputed is computed rather than stored.
--
-- card_note is taken from the PARENT shell only, the same rule the view already uses for
-- `title`: GEO 103 is one card, and the note belongs to the card, not to the recitation shell.
--
-- Also recreated `with (security_invoker = true)`. As created in 017 the view runs as its owner
-- (`postgres`, BYPASSRLS), so it returned every course to any caller, including anon, in spite
-- of the owner-scoped policy migration 020 put on `courses`. Every screen that reads this view
-- sits behind the (app) layout's server-side auth check, so nothing loses a row.
-- ---------------------------------------------------------------------------------------------
drop view if exists v_course_display;

create view v_course_display with (security_invoker = true) as
with shells as (
  select coalesce(c.parent_course_id, c.id) as display_id,
         c.id as shell_id,
         c.subject, c.number, c.title_short, c.location, c.bb_url, c.card_note
  from courses c
)
select s.display_id,
       min(s.subject) || ' ' || min(s.number)                      as code,
       min(s.title_short) filter (where s.shell_id = s.display_id) as title,
       array_agg(distinct s.shell_id)                              as shell_ids,
       jsonb_agg(distinct jsonb_build_object('day', m.day_of_week, 'start', m.start_time,
                                             'end', m.end_time, 'room', m.location))
         filter (where m.id is not null)                           as meetings,
       coalesce(bool_or(m.location is distinct from s.location)
                  filter (where m.id is not null), false)          as room_disputed,
       min(s.bb_url)                                               as bb_url,
       min(s.card_note) filter (where s.shell_id = s.display_id)   as card_note
from shells s
left join meetings m on m.course_id = s.shell_id
group by s.display_id;

comment on view v_course_display is
  'One row per course group (parent shell wins the id); GEO.103 lecture+recitation merged. '
  'room_disputed = meetings.location disagrees with courses.location on at least one meeting; '
  'meetings.location is the authoritative side, the view only reports the disagreement. '
  'card_note is the owner''s one-line card note, taken from the parent shell (Phase 8, R-04). '
  'security_invoker: owner-scoped RLS applies.';

-- Grants are re-established after the drop. anon held SELECT on the 017 view purely by
-- Supabase's default privileges; a list of the owner's courses is not anon's business.
revoke all on v_course_display from anon;
grant select on v_course_display to authenticated, service_role;

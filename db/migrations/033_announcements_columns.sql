-- bb2dash :: 033_announcements_columns.sql
-- Phase 9 (docs/planning/62_PHASE9_sync_loop.md, "Migration 033 - announcements columns").
--
-- Three additive columns:
--   author       - the announcement's creator display name, so the Stream and the Phase 11
--                  announcements page can say who posted it instead of implying the course did.
--   modified_at  - Blackboard's own last-modified stamp. The crawler already captures it
--                  (bb_crawler.js maps a.modifiedDate to `modified` in every announcements
--                  payload); nothing has ever had a column to land it in.
--   read_at      - bb2dash's OWN read mark, written by Phase 11's bell. Deliberately separate
--                  from is_read, which mirrors Blackboard's readStatus and is overwritten by
--                  every sync. Two different facts: "Blackboard thinks I opened it" and
--                  "I dismissed it here".
--
-- CRAWLER CONTRACT, honestly stated: `modified` is verified present on the live payloads
-- (run 6b122650, 2026-09-08: every announcements element carries body/created/id/isRead/
-- modified/start/title), so stage_announcements populates modified_at from today's data.
-- There is NO creator field in the payload, because bb_crawler.js slims each announcement to
-- those seven keys before posting to bb_raw - the raw endpoint response never reaches the
-- database. So the exact JSON key for the creator display name on
-- /learn/api/v1/courses/{C}/announcements CANNOT be verified from stored data; it needs a live
-- logged-in tab. That verification and the crawler change belong to W-16, which owns
-- ingest/bb_crawler.js. Until that lands, author stays null on every row and the UI must
-- render it as "not recorded" rather than guessing a name.

alter table announcements
  add column author      text,
  add column read_at     timestamptz,
  add column modified_at timestamptz;

comment on column announcements.author is
  'Creator display name from Blackboard. Null until the W-16 crawler change captures it - the '
  'crawler slims announcements to id/title/created/modified/start/isRead/body before posting, '
  'so no stored payload carries a creator. Render null as "not recorded", never as a guess.';
comment on column announcements.modified_at is
  'Blackboard''s last-modified stamp for the announcement (payload key `modified`, already '
  'captured by the crawler). Distinct from posted_at, which is the creation date.';
comment on column announcements.read_at is
  'When Stack dismissed this announcement IN bb2dash. Written by the Phase 11 bell, never by a '
  'sync. is_read mirrors Blackboard and is overwritten every run; this column is ours.';

-- bb2dash :: 022_supersede_stale_files.sql
-- Seeds bb_files.superseded_by for the stale IST.466 schedule and roster documents. 018 added
-- the column and v_bb_files_current but deliberately seeded nothing ("Owner of the DATA is the
-- bb-classify-files pass, not this migration"); that pass never ran, so all 64 rows still read
-- as current and 021's filter has nothing to filter. This migration supplies exactly the four
-- rows 018's own header named (bb_files 16, 40, 58 schedules; 35 roster) and nothing else.
--
-- PROVENANCE — every link below is stated in data, not inferred from filename ordering.
--
-- Schedules. Two Blackboard content items have carried this document:
--   _12939631_1  root item "IST466/M3 Schedule Fall2026"
--   _12939679_1  "Schedule / Class Schedule - IST466/M3 Fall 2026"
--   * 58 (Wk2, Aug 31) -> 16 (Wk2x, Sep 3). Same content_id _12939631_1. bb_files 16 notes:
--     "URL refreshed 9/3 (rid 165342909->165607165), renamed Wk2->Wk2x"; bb_files 58 notes:
--     "hand-downloaded before the 9/3 re-upload replaced rid 165342909; kept for history".
--   * 16 (Wk2x) -> 66 (W3, Sep 8). bb_files 16 notes: "SUPERSEDED 9/8 by W3 (bb_file 66)".
--   * 40 (Wk2xy, Sep 3) -> 66 (W3, Sep 8). Same content_id _12939679_1; the 9/8 crawl
--     (bb_raw id 19) shows that item now carrying "IST466M3 Schedule Fall2026W3.docx"
--     (rid 165880342, modified 2026-09-08), and bb_files 66 notes: "supersedes Wk2xy
--     (bb_file 40)". 40's own notes: "SUPERSEDED 9/8 by W3 (bb_file 66)".
--   66 is the single chain head: it is the only IST.466 schedule the 9/8 crawl still resolves
--   to a live file, and its superseded_by stays null.
--
--   NOT asserted: an ordering between 16 and 40. They are two LOCATIONS of the Sep 3 document
--   (identical wording bar capitalisation, both 3,854 chars), not two versions in one lineage,
--   and nothing in the data ranks one after the other. Each therefore points straight at 66.
--
-- Rosters. 35 (Wk2_New, bb_modified 2026-08-27, "28 names, no team columns") -> 37 (Wk2xy,
--   bb_modified 2026-09-01, "29 names, adds Amaihe; no team columns - latest"). The later
--   modification, the strict superset of names and the explicit "latest" in 37's notes all
--   agree. 37 stays current.
--
-- Rows matched by sha256, not by id: bb_files.id is a generated identity, sha256 is the file's
-- content and is unique for all six rows involved. Idempotent: `where superseded_by is null`
-- means a re-run is a no-op, and the closing assertion checks the END state, so it holds on the
-- first run and on every re-run.

with chain (stale_sha, current_sha, why) as (
  values
    ('2ba9a9a9066feb04c6d56997665741635eaa66cca3c32c54b32bc7c8d77546aa',
     '96a9a4dce253645ae605eefa680db67f09827fd087455793bb076b498e016b40',
     'IST.466 schedule Aug 31 (Wk2) -> Sep 3 (Wk2x), same content item _12939631_1'),
    ('96a9a4dce253645ae605eefa680db67f09827fd087455793bb076b498e016b40',
     '91258615090dded5c6f3dc4b9cb8563b5f889c73008f72e5518b5d93784c66d8',
     'IST.466 schedule Sep 3 (Wk2x) -> Sep 8 (W3), per bb_files.notes'),
    ('18bd7778ba45a32bb51dd787d50fa2b5b6d99510041c19792304acebc3a382da',
     '91258615090dded5c6f3dc4b9cb8563b5f889c73008f72e5518b5d93784c66d8',
     'IST.466 schedule Sep 3 (Wk2xy) -> Sep 8 (W3), same content item _12939679_1'),
    ('817f8f8b48171bef4129d5fc6387877c71a396a2a2ce095b0a3fe6623c9a0e69',
     'e8f2c52e93b4ac0ae561435c8216c45bd8726b4c8fc17a7a8b5931dadd3c3003',
     'IST.466 roster Aug 27 (Wk2_New, 28 names) -> Sep 1 (Wk2xy, 29 names)')
)
update bb_files f
   set superseded_by = cur.id
  from chain
  join bb_files cur on cur.sha256 = chain.current_sha
 where f.sha256 = chain.stale_sha
   and f.superseded_by is null;

-- Assert the end state rather than the row count, so the check is true on a re-run too:
-- exactly four superseded rows, every chain resolves, and no cycle.
do $$
declare
  n_superseded int;
  n_expected   int;
  n_dangling   int;
begin
  select count(*) into n_superseded from bb_files where superseded_by is not null;

  select count(*) into n_expected
    from bb_files f
    join bb_files cur on cur.id = f.superseded_by
   where (f.sha256, cur.sha256) in (
     ('2ba9a9a9066feb04c6d56997665741635eaa66cca3c32c54b32bc7c8d77546aa',
      '96a9a4dce253645ae605eefa680db67f09827fd087455793bb076b498e016b40'),
     ('96a9a4dce253645ae605eefa680db67f09827fd087455793bb076b498e016b40',
      '91258615090dded5c6f3dc4b9cb8563b5f889c73008f72e5518b5d93784c66d8'),
     ('18bd7778ba45a32bb51dd787d50fa2b5b6d99510041c19792304acebc3a382da',
      '91258615090dded5c6f3dc4b9cb8563b5f889c73008f72e5518b5d93784c66d8'),
     ('817f8f8b48171bef4129d5fc6387877c71a396a2a2ce095b0a3fe6623c9a0e69',
      'e8f2c52e93b4ac0ae561435c8216c45bd8726b4c8fc17a7a8b5931dadd3c3003')
   );

  -- A chain that never reaches a null superseded_by within four hops is a cycle.
  select count(*) into n_dangling
    from bb_files a
    left join bb_files b on b.id = a.superseded_by
    left join bb_files c on c.id = b.superseded_by
    left join bb_files d on d.id = c.superseded_by
   where a.superseded_by is not null
     and b.superseded_by is not null
     and c.superseded_by is not null
     and d.superseded_by is not null;

  if n_expected <> 4 then
    raise exception 'expected the 4 documented supersession links, found %', n_expected;
  end if;
  if n_superseded <> 4 then
    raise exception 'expected exactly 4 superseded bb_files rows, found %', n_superseded;
  end if;
  if n_dangling <> 0 then
    raise exception 'supersession chain does not terminate for % row(s)', n_dangling;
  end if;
end $$;

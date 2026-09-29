-- bb2dash :: scripts/fixtures/db-test/rollback_then_writes.sql
-- Fixture for scripts/db-test.mjs (Phase 15, round-2 finding 1). The shape that used to slip past
-- lint: it begins with `begin;` and its LAST statement is `rollback;`, but there is a second
-- top-level `rollback` in the middle.
--
-- The runner sends a unit as one multi-statement simple query, so that middle rollback ends the
-- transaction block, and Postgres runs everything after it in a fresh implicit transaction that it
-- COMMITS when the message completes. A file in this shape would leave its second half on prod, as
-- a BYPASSRLS role holding DELETE on the planner-state tables. `commit` and `end` split the batch
-- the same way, and `commits.sql` covers those.
--
-- Lint must refuse it before a client is opened:
--   node scripts/db-test.mjs --file scripts/fixtures/db-test/rollback_then_writes.sql   -> exit 2
--
-- The statement after the middle rollback is deliberately a temp table, not a DELETE: this fixture
-- is checked in, and it must stay harmless if anyone ever runs it by hand. A careless real file
-- would have a write there.

begin;

select 'rollback_then_writes: PASS' as result;

rollback;

create temp table _would_have_been_committed (note text) on commit drop;

rollback;
